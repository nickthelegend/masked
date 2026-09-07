//! # Fog Duel
//!
//! Hidden-position 1v1 trading on Solana, built on MagicBlock Ephemeral
//! Rollups.
//!
//! Two traders stake an equal entry into an escrowed pot and trade the same
//! token for a fixed window. During the round each player's `Position` is
//! delegated to an Ephemeral Rollup and made *private* through the permission
//! program, so neither the opponent nor any public RPC can read size, side or
//! fill count. At the buzzer the positions commit back to L1, PnL is compared,
//! the winner takes the pot less rake, and a public `Tape` is written.
//!
//! Every other 1v1 trading product on Solana is public during the fight. The
//! privacy window is the product.

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use ephemeral_rollups_sdk::anchor::{commit, delegate, ephemeral};
use ephemeral_rollups_sdk::consts::{EPHEMERAL_VAULT_ID, PERMISSION_PROGRAM_ID};
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use ephemeral_rollups_sdk::ephem::commit_and_undelegate_accounts;
use ephemeral_rollups_sdk::access_control::instructions::{
    CreateEphemeralPermissionCpi, CreatePermissionCpi, CreatePermissionCpiAccounts,
    CreatePermissionInstructionArgs, DelegatePermissionCpi, DelegatePermissionCpiAccounts,
};
use ephemeral_rollups_sdk::access_control::structs::{
    EphemeralMembersArgs, Member, MembersArgs, AUTHORITY_FLAG, TX_BALANCES_FLAG, TX_LOGS_FLAG,
    TX_MESSAGE_FLAG,
};
use ephemeral_rollups_sdk::vrf::anchor::{vrf, vrf_callback};
use ephemeral_rollups_sdk::vrf::consts::VRF_PROGRAM_IDENTITY;
use session_keys::{session_auth_or, Session, SessionError, SessionToken};
use ephemeral_rollups_sdk::vrf::instructions::{
    create_request_randomness_ix, RequestRandomnessParams,
};
use ephemeral_rollups_sdk::vrf::rnd::random_u8_with_range;
use ephemeral_rollups_sdk::vrf::types::SerializableAccountMeta;

pub mod errors;
pub mod state;

use errors::FogError;
use state::*;

declare_id!("3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1");

/// Extra lamports parked on each `Position` PDA at creation.
///
/// The PER docs are explicit that a delegated account must carry enough
/// lamports to cover ephemeral-permission rent on the ER, and the failure mode
/// when it does not is an opaque runtime error inside the permission CPI.
/// Funding it here, at init, is far cheaper than debugging it later.
pub const POSITION_PREFUND_LAMPORTS: u64 = 5_000_000;

pub const MIN_DURATION: i64 = 10;
pub const MAX_DURATION: i64 = 3600;

/// `#[ephemeral]` wires in the magic-program plumbing every delegated program
/// needs. It must sit above `#[program]`.
#[ephemeral]
#[program]
pub mod fogduel {
    use super::*;

    /// Open a match and escrow the creator's entry.
    #[allow(clippy::too_many_arguments)]
    pub fn create_match(
        ctx: Context<CreateMatch>,
        match_id: u64,
        mint: Pubkey,
        duration: i64,
        entry: u64,
        start_px: u64,
        market_type: MarketType,
        symbol: String,
        name: String,
    ) -> Result<()> {
        require!(entry > 0, FogError::InvalidEntry);
        require!(
            (MIN_DURATION..=MAX_DURATION).contains(&duration),
            FogError::InvalidDuration
        );
        require!(start_px > 0, FogError::InvalidPrice);

        let m = &mut ctx.accounts.match_account;
        m.creator = ctx.accounts.creator.key();
        m.joiner = None;
        // The creator's market. The joiner names their own when they join —
        // a duel is two players on two tokens, compared on PnL.
        m.leg_a = Leg {
            mint,
            symbol: pad::<SYMBOL_LEN>(&symbol),
            name: pad::<NAME_LEN>(&name),
            market_type,
            start_px,
        };
        m.leg_b = Leg::default();
        m.match_id = match_id;
        m.created_ts = Clock::get()?.unix_timestamp;
        m.start_ts = 0;
        m.duration = duration;
        m.entry = entry;
        m.status = MatchStatus::Open;
        m.pot = 0;
        m.winner = None;
        m.pnl_a_bps = 0;
        m.pnl_b_bps = 0;
        m.bump = ctx.bumps.match_account;

        let vault = &mut ctx.accounts.vault;
        vault.match_key = m.key();
        vault.bump = ctx.bumps.vault;

        let feed = &mut ctx.accounts.price_feed;
        feed.match_key = m.key();
        feed.owner = ctx.accounts.creator.key();
        feed.px = start_px;
        feed.updated_ts = Clock::get()?.unix_timestamp;
        feed.authority = ctx.accounts.creator.key();
        feed.bump = ctx.bumps.price_feed;

        // Public for the whole round, unlike everything else about a position.
        let status = &mut ctx.accounts.round_status;
        status.match_key = m.key();
        status.liquidated_a = false;
        status.liquidated_b = false;
        status.bump = ctx.bumps.round_status;

        // Escrow the creator's entry.
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.creator.to_account_info(),
                    to: vault.to_account_info(),
                },
            ),
            entry,
        )?;

        m.pot = entry;
        msg!("match opened id={} entry={} duration={}", match_id, entry, duration);
        Ok(())
    }

    /// Join an open match. Escrows the joiner's entry, starts the clock, and
    /// seeds both positions with their virtual quote balance.
    pub fn join_match(
        ctx: Context<JoinMatch>,
        mint: Pubkey,
        start_px: u64,
        market_type: MarketType,
        symbol: String,
        name: String,
    ) -> Result<()> {
        require!(start_px > 0, FogError::InvalidPrice);
        let entry = ctx.accounts.match_account.entry;
        require!(
            ctx.accounts.match_account.status == MatchStatus::Open,
            FogError::MatchNotOpen
        );
        require_keys_neq!(
            ctx.accounts.joiner.key(),
            ctx.accounts.match_account.creator,
            FogError::SelfJoin
        );

        // The creator's book is seeded from the mid snapshotted at *create*
        // time, so a match that has sat on the book while the market moved
        // would hand its creator a position priced at a number that is no
        // longer true, and the rate-limited crank would then correct it onto
        // them mid-round. The joiner brings a mark taken just now, so only the
        // creator's side is exposed to this — which is what MAX_OPEN_AGE
        // bounds.
        let joined_at = Clock::get()?.unix_timestamp;
        require!(
            joined_at - ctx.accounts.match_account.created_ts <= MAX_OPEN_AGE,
            FogError::MatchStale
        );

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.joiner.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                },
            ),
            entry,
        )?;

        let now = Clock::get()?.unix_timestamp;
        let match_key = ctx.accounts.match_account.key();

        // Virtual quote: the entry becomes purchasing power inside the round.
        // No SPL leaves the wallet mid-round — a public swap print would hand
        // the opponent exactly the information the fog exists to hide.
        let quote = entry as i64;

        // The joiner's own feed, opened at the mark they just read.
        let feed_b = &mut ctx.accounts.price_feed_b;
        feed_b.match_key = match_key;
        feed_b.owner = ctx.accounts.joiner.key();
        feed_b.px = start_px;
        feed_b.updated_ts = now;
        feed_b.authority = ctx.accounts.joiner.key();
        feed_b.bump = ctx.bumps.price_feed_b;

        let px_a = ctx.accounts.price_feed.px;

        let pa = &mut ctx.accounts.position_a;
        pa.owner = ctx.accounts.match_account.creator;
        pa.match_key = match_key;
        pa.quote_balance = quote;
        pa.base_qty = 0;
        pa.avg_px = 0;
        pa.realized = 0;
        pa.last_px = px_a;
        pa.fill_count = 0;
        pa.fills = Vec::new();
        pa.bump = ctx.bumps.position_a;
        // Each side gets its own book, seeded at the mark of the token that
        // side actually chose. Separate curves, because one shared curve would
        // publish each player's flow to the other through the mark — and now
        // they are not even denominated in the same token.
        pa.book.seed(entry, px_a).ok_or(FogError::InvalidPrice)?;

        let pb = &mut ctx.accounts.position_b;
        pb.owner = ctx.accounts.joiner.key();
        pb.match_key = match_key;
        pb.quote_balance = quote;
        pb.base_qty = 0;
        pb.avg_px = 0;
        pb.realized = 0;
        pb.last_px = start_px;
        pb.fill_count = 0;
        pb.fills = Vec::new();
        pb.bump = ctx.bumps.position_b;
        pb.book.seed(entry, start_px).ok_or(FogError::InvalidPrice)?;

        // Pre-fund for ephemeral-permission rent on the ER. See the constant.
        for target in [pa.to_account_info(), pb.to_account_info()] {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.joiner.to_account_info(),
                        to: target,
                    },
                ),
                POSITION_PREFUND_LAMPORTS,
            )?;
        }

        let m = &mut ctx.accounts.match_account;
        m.joiner = Some(ctx.accounts.joiner.key());
        m.leg_b = Leg {
            mint,
            symbol: pad::<SYMBOL_LEN>(&symbol),
            name: pad::<NAME_LEN>(&name),
            market_type,
            start_px,
        };
        m.start_ts = now;
        m.pot = entry.checked_mul(2).ok_or(FogError::MathOverflow)?;
        m.status = MatchStatus::Live;

        msg!("match live start_ts={} pot={}", now, m.pot);
        Ok(())
    }

    /// Creator reclaims their entry while the match is still unjoined.
    pub fn cancel_if_unjoined(ctx: Context<CancelMatch>) -> Result<()> {
        require!(
            ctx.accounts.match_account.status == MatchStatus::Open,
            FogError::MatchNotOpen
        );

        let entry = ctx.accounts.match_account.entry;
        let vault_ai = ctx.accounts.vault.to_account_info();
        let rent_floor = Rent::get()?.minimum_balance(vault_ai.data_len());
        require!(
            vault_ai.lamports() >= entry + rent_floor,
            FogError::VaultUnderfunded
        );

        **vault_ai.try_borrow_mut_lamports()? -= entry;
        **ctx.accounts.creator.to_account_info().try_borrow_mut_lamports()? += entry;

        let m = &mut ctx.accounts.match_account;
        m.status = MatchStatus::Cancelled;
        m.pot = 0;
        Ok(())
    }

    /// Post a new mark for one player's market.
    ///
    /// One feed per player, because the two sides no longer trade the same
    /// token. The symmetry that used to matter — neither side quoted a
    /// different price than the other — is replaced by a narrower guarantee
    /// that still bites: a player's fills are priced by the feed for the token
    /// they chose, and that feed is rate-limited like any other.
    ///
    /// Permissionless. The obvious alternative, letting only the creator post,
    /// is worse: it hands one player the power to time the mark against the
    /// other. With anyone able to post, the defence is the rate limit rather
    /// than the identity — at most MAX_PUSH_BPS per MIN_PUSH_INTERVAL, so a
    /// player who wants the mark somewhere else has to walk it there in
    /// public, a step at a time, while their opponent watches and trades.
    ///
    /// This is a stand-in for an oracle, and it is the one place where the
    /// round trusts something off-chain. For a major, the replacement is a
    /// Pyth price update, which is signed and needs no rate limit.
    pub fn push_price(ctx: Context<PushPrice>, px: u64, owner: Pubkey) -> Result<()> {
        require!(px > 0, FogError::InvalidPrice);

        let m = &ctx.accounts.match_account;
        require!(m.status == MatchStatus::Live, FogError::MatchNotLive);
        let now = Clock::get()?.unix_timestamp;
        // No posting after the buzzer: the mark that settles the round is the
        // one the round finished on.
        require!(now < m.start_ts + m.duration, FogError::MatchExpired);

        let feed = &mut ctx.accounts.price_feed;
        require!(
            now - feed.updated_ts >= MIN_PUSH_INTERVAL,
            FogError::PriceTooSoon
        );

        let last = feed.px as u128;
        let next = px as u128;
        let delta = if next > last { next - last } else { last - next };
        require!(
            delta * (BPS_DENOM as u128) <= last * (MAX_PUSH_BPS as u128),
            FogError::PriceJump
        );

        feed.px = px;
        feed.updated_ts = now;
        Ok(())
    }

    /// Buy or sell base against the virtual quote balance. Runs on the ER
    /// against private state.
    ///
    /// `owner` names whose position is being filled, and is separate from who
    /// signed. Normally they are the same key. With a Gum session token they
    /// are not: a session key signs on the owner's behalf for the life of the
    /// token, so a sixty-second round does not need a wallet popup per fill.
    ///
    /// `session_auth_or` runs the fallback below when no token is presented —
    /// the signer must be the owner — and defers to the session program when
    /// one is. There is no path where an unrelated key moves somebody's book.
    #[session_auth_or(
        ctx.accounts.position.owner == ctx.accounts.player.key(),
        FogError::NotAParticipant
    )]
    pub fn apply_fill(ctx: Context<ApplyFill>, side: Side, qty: u64, owner: Pubkey) -> Result<()> {
        require_keys_eq!(ctx.accounts.position.owner, owner, FogError::NotAParticipant);
        require!(qty > 0, FogError::ZeroQuantity);
        require!(
            ctx.accounts.match_account.status == MatchStatus::Live,
            FogError::MatchNotLive
        );

        let m = &ctx.accounts.match_account;
        let now = Clock::get()?.unix_timestamp;
        require!(now < m.start_ts + m.duration, FogError::MatchExpired);

        let mark = ctx.accounts.price_feed.px;
        require!(mark > 0, FogError::InvalidPrice);

        let pos = &mut ctx.accounts.position;
        require!(pos.book.is_seeded(), FogError::InvalidPrice);

        // Re-peg this player's book to the posted mark before the fill, so
        // execution is the mark plus this fill's own impact. Without it a
        // player could buy at a stale mid and settle against a mark that has
        // since moved — a free roll with no trading in it.
        pos.book
            .repeg(ctx.accounts.match_account.entry, mark)
            .ok_or(FogError::InvalidPrice)?;

        // Every fill goes through that private book. Nothing is routed to a
        // public venue: a swap print would leak the wallet, the mint and the
        // size, which is the whole thing the fog protects.
        let (filled_qty, px) = match side {
            Side::Buy => {
                // `qty` is the quote the player is spending — to open a long,
                // or to buy back a short.
                let quote_in = qty;
                require!(pos.quote_balance >= quote_in as i64, FogError::InsufficientQuote);
                let base_out = pos.book.buy(quote_in).ok_or(FogError::MathOverflow)?;
                require!(base_out > 0, FogError::ZeroQuantity);

                let exec_px = (((quote_in as i128) * VALUE_DIV) / (base_out as i128)) as u64;
                pos.apply_signed(base_out as i128, exec_px, -(quote_in as i128));
                (base_out, exec_px)
            }
            Side::Sell | Side::Settle | Side::Liquidation => {
                // `qty` is the base the player is selling. It no longer has to
                // be base they hold: selling past zero opens a short, which is
                // the whole point of having a second direction. What stops it
                // running away is the margin check below, not an inventory
                // check here.
                let quote_out = pos.book.sell(qty).ok_or(FogError::MathOverflow)?;
                require!(quote_out > 0, FogError::ZeroQuantity);

                let exec_px = (((quote_out as i128) * VALUE_DIV) / (qty as i128)) as u64;
                pos.apply_signed(-(qty as i128), exec_px, quote_out as i128);
                (qty, exec_px)
            }
        };
        let qty = filled_qty;

        // One times collateral, either direction.
        //
        // A short can lose more than it stakes, so something has to bound it.
        // Capping notional at equity means the worst case is exactly the entry
        // — a duel can never owe out more than the pot escrowed for it — and a
        // maximum short is wiped by roughly a doubling of the mark, which is a
        // real risk rather than a theoretical one.
        //
        // Settlement and liquidation are exempt: both only ever reduce a
        // position, and refusing to let a blown-up player close would trap
        // them in it.
        if matches!(side, Side::Buy | Side::Sell) {
            // Compare notionals, not quantities.
            //
            // The obvious form — `open <= equity * VALUE_DIV / mark` — divides
            // by the mark a second time, and integer division truncates each
            // time. A maximum-size long spends the whole quote, so afterwards
            // equity *is* the position's notional; round-tripping it through
            // that extra division gave back a number one unit smaller than the
            // base actually held, and the cap rejected a position it had just
            // priced. In the app that was every MAX long from flat, refused
            // with "NOT ENOUGH QUOTE".
            //
            // Comparing `base * mark` against equity uses the same truncation
            // on both sides, so a position at exactly one times collateral
            // passes and anything beyond it does not.
            let notional = ((pos.base_qty as i128).abs() * (mark as i128)) / VALUE_DIV;
            require!(notional <= pos.equity(mark), FogError::InsufficientQuote);
        }

        pos.last_px = px;
        pos.push_fill(Fill { side, qty, px, ts: now });

        msg!("fill side={:?} qty={} px={}", side, qty, px);
        Ok(())
    }

    /// Force-close a position that has run out of equity, and say so publicly.
    ///
    /// Runs on the rollup, because that is where the position lives. The mark
    /// is written on L1 but the rollup carries a readable clone of the feed, so
    /// both halves of the question — what is this worth, and what does the
    /// player hold — are answerable here and nowhere else.
    ///
    /// Permissionless, like settlement: a player would never call it on
    /// themselves, and an opponent has every reason to. Calling it on a
    /// position that is solvent does nothing, so there is no grief in trying.
    ///
    /// The result is announced in `RoundStatus`, which carries no ACL. That is
    /// a deliberate hole in the fog and the only one: position *contents* stay
    /// sealed, but the fact that a side blew up is public the moment it does.
    pub fn liquidate(ctx: Context<Liquidate>, owner: Pubkey) -> Result<()> {
        let m = &ctx.accounts.match_account;
        require!(m.status == MatchStatus::Live, FogError::MatchNotLive);
        let now = Clock::get()?.unix_timestamp;
        require!(now < m.start_ts + m.duration, FogError::MatchExpired);

        let mark = ctx.accounts.price_feed.px;
        require!(mark > 0, FogError::InvalidPrice);

        let entry = m.entry;
        let is_creator = owner == m.creator;
        let pos = &mut ctx.accounts.position;
        require_keys_eq!(pos.owner, owner, FogError::NotAParticipant);

        // Solvent, or holding nothing. Not an error — the crank calls this
        // blind on both sides every few seconds.
        if pos.base_qty == 0 || !pos.is_underwater(mark) {
            return Ok(());
        }

        // Record it as an execution at the mark, so the tape says what the
        // position was and when it went, rather than just showing a hole.
        pos.book.repeg(entry, mark).ok_or(FogError::InvalidPrice)?;
        let qty = (pos.base_qty as i128).unsigned_abs() as u64;
        pos.push_fill(Fill { side: Side::Liquidation, qty, px: mark, ts: now });
        pos.fill_count = pos.fill_count.saturating_add(1);

        // Equity was already at or below zero. Closing it out leaves exactly
        // nothing, which is -100% and cannot go further: the entry is the most
        // anyone can lose, and the pot always covers the payout.
        pos.base_qty = 0;
        pos.avg_px = 0;
        pos.quote_balance = 0;
        pos.last_px = mark;

        let status = &mut ctx.accounts.round_status;
        if is_creator {
            status.liquidated_a = true;
        } else {
            status.liquidated_b = true;
        }

        msg!("liquidated owner={} at px={}", owner, mark);
        Ok(())
    }

    /// Flip the match into settling once the clock has run out. Permissionless
    /// so a stalling loser cannot hold the pot hostage.
    pub fn request_settle(ctx: Context<RequestSettle>) -> Result<()> {
        let m = &mut ctx.accounts.match_account;
        require!(m.status == MatchStatus::Live, FogError::MatchNotLive);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= m.start_ts + m.duration, FogError::MatchStillRunning);
        m.status = MatchStatus::Settling;
        Ok(())
    }

    /// Close out both positions at the final mark, compare PnL, pay the
    /// winner, and write the public tape.
    pub fn settle_match(ctx: Context<SettleMatch>) -> Result<()> {
        require!(
            ctx.accounts.match_account.status == MatchStatus::Settling,
            FogError::MatchNotSettling
        );

        let now = Clock::get()?.unix_timestamp;
        let start_quote = ctx.accounts.match_account.entry as i64;

        // The final mark is the posted price, for every market type. What
        // differs between a meme and a major is only where that price came
        // from off-chain — a bonding curve or an oracle — not how the round is
        // scored.
        // One mark per side, because the two sides are no longer trading the
        // same token. Each position is valued against the feed for the market
        // its owner actually chose.
        let mark_a = ctx.accounts.price_feed.px;
        let mark_b = ctx.accounts.price_feed_b.px;
        require!(mark_a > 0 && mark_b > 0, FogError::InvalidPrice);

        // An open position settles into realized PnL at the buzzer, and that
        // shows on the tape as a SETTLE fill. Mirrors the UI's long-standing
        // behaviour so the client needs no special case.
        //
        // It closes at what closing would actually fetch on that player's own
        // book, re-pegged to the final mark: the mid alone would ignore the
        // impact of getting out, which is real money on a size that took real
        // money to put on.
        //
        // Either direction closes here. A short is bought back rather than
        // sold, so the signed quantity — not its magnitude — decides which way
        // the book is crossed.
        let entry_lamports = ctx.accounts.match_account.entry;
        for (pos, mark) in [
            (&mut ctx.accounts.position_a, mark_a),
            (&mut ctx.accounts.position_b, mark_b),
        ] {
            if pos.base_qty != 0 {
                let signed = pos.base_qty as i128;
                let qty = signed.unsigned_abs() as u64;
                pos.book.repeg(entry_lamports, mark).ok_or(FogError::InvalidPrice)?;
                let (px, quote_delta) = if signed > 0 {
                    let proceeds = pos.book.sell(qty).ok_or(FogError::MathOverflow)?;
                    let px = (((proceeds as i128) * VALUE_DIV) / (qty as i128)) as u64;
                    (px, proceeds as i128)
                } else {
                    // Buying back a short: what it costs to close, on this
                    // player's own curve, impact included.
                    let cost = pos.book.buy_base(qty).ok_or(FogError::MathOverflow)?;
                    let px = (((cost as i128) * VALUE_DIV) / (qty as i128)) as u64;
                    (px, -(cost as i128))
                };
                pos.apply_signed(-signed, px, quote_delta);
                pos.push_fill(Fill { side: Side::Settle, qty, px, ts: now });
                pos.last_px = px;
            } else {
                pos.last_px = mark;
            }
        }

        let pnl_a = ctx.accounts.position_a.pnl_bps(mark_a, start_quote);
        let pnl_b = ctx.accounts.position_b.pnl_bps(mark_b, start_quote);

        // Deterministic tie-break: a draw goes to the creator. Documented, and
        // the client mirrors it — a client-side ">=" would silently favour
        // whoever happened to be looking at the screen.
        let creator = ctx.accounts.match_account.creator;
        let joiner = ctx.accounts.position_b.owner;
        let winner = if pnl_a >= pnl_b { creator } else { joiner };

        let pot = ctx.accounts.match_account.pot;
        let rake = pot
            .checked_mul(RAKE_BPS)
            .ok_or(FogError::MathOverflow)?
            / BPS_DENOM;
        let payout = pot.checked_sub(rake).ok_or(FogError::MathOverflow)?;

        let vault_ai = ctx.accounts.vault.to_account_info();
        let rent_floor = Rent::get()?.minimum_balance(vault_ai.data_len());
        require!(
            vault_ai.lamports() >= pot + rent_floor,
            FogError::VaultUnderfunded
        );

        let winner_ai = if winner == creator {
            ctx.accounts.creator.to_account_info()
        } else {
            ctx.accounts.joiner.to_account_info()
        };

        **vault_ai.try_borrow_mut_lamports()? -= payout;
        **winner_ai.try_borrow_mut_lamports()? += payout;
        **vault_ai.try_borrow_mut_lamports()? -= rake;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += rake;

        let tape = &mut ctx.accounts.tape;
        tape.match_key = ctx.accounts.match_account.key();
        tape.leg_a = ctx.accounts.match_account.leg_a;
        tape.leg_b = ctx.accounts.match_account.leg_b;
        tape.liquidated_a = ctx.accounts.round_status.liquidated_a;
        tape.liquidated_b = ctx.accounts.round_status.liquidated_b;
        tape.player_a = creator;
        tape.player_b = joiner;
        tape.pnl_a_bps = pnl_a;
        tape.pnl_b_bps = pnl_b;
        tape.winner = winner;
        tape.pot_paid = payout;
        tape.rake = rake;
        tape.settled_ts = now;
        tape.fills_a = ctx.accounts.position_a.fills.clone();
        tape.fills_b = ctx.accounts.position_b.fills.clone();
        tape.bump = ctx.bumps.tape;

        // Lifetime records, so the leaderboard has an on-chain source of
        // truth rather than a client-side scan of every tape ever written.
        let entry = ctx.accounts.match_account.entry;
        let stats_a = &mut ctx.accounts.stats_creator;
        stats_a.owner = creator;
        stats_a.bump = ctx.bumps.stats_creator;
        let stats_b = &mut ctx.accounts.stats_joiner;
        stats_b.owner = joiner;
        stats_b.bump = ctx.bumps.stats_joiner;

        if winner == creator {
            stats_a.record_win(payout, entry, now);
            stats_b.record_loss(entry, now);
        } else {
            stats_b.record_win(payout, entry, now);
            stats_a.record_loss(entry, now);
        }

        let m = &mut ctx.accounts.match_account;
        m.status = MatchStatus::Settled;
        m.winner = Some(winner);
        m.pnl_a_bps = pnl_a;
        m.pnl_b_bps = pnl_b;

        msg!("settled pnl_a={} pnl_b={} winner={} payout={} rake={}", pnl_a, pnl_b, winner, payout, rake);
        Ok(())
    }

    /// One-time protocol treasury init.
    /// Ask MagicBlock's VRF which of three markets this duel will be fought on.
    ///
    /// A trading duel where one side picks the market is a duel about
    /// preparation: the opener chooses the coin they have been watching all
    /// week and the other player is behind before a fill is placed. Here the
    /// opener nominates three and verifiable randomness picks one.
    ///
    /// This only *requests*. The answer arrives later, in a transaction the
    /// VRF program signs, and `settle_market_draw` refuses it from anyone
    /// else — which is the whole difference between this and shuffling an
    /// array in the client.
    pub fn request_market_draw(
        ctx: Context<RequestMarketDraw>,
        draw_id: u64,
        candidates: [MarketRef; DRAW_CANDIDATES],
        caller_seed: [u8; 32],
    ) -> Result<()> {
        for c in candidates.iter() {
            require!(c.start_px > 0, FogError::InvalidPrice);
        }

        let draw = &mut ctx.accounts.draw;
        draw.opener = ctx.accounts.payer.key();
        draw.draw_id = draw_id;
        draw.candidates = candidates;
        draw.chosen = -1;
        draw.randomness = [0u8; 32];
        draw.requested_ts = Clock::get()?.unix_timestamp;
        draw.fulfilled_ts = 0;
        draw.consumed = false;
        draw.bump = ctx.bumps.draw;

        let ix = create_request_randomness_ix(RequestRandomnessParams {
            payer: ctx.accounts.payer.key(),
            oracle_queue: ctx.accounts.oracle_queue.key(),
            callback_program_id: crate::ID,
            callback_discriminator: crate::instruction::SettleMarketDraw::DISCRIMINATOR.to_vec(),
            caller_seed,
            // The draw account is the only thing the callback writes to.
            accounts_metas: Some(vec![SerializableAccountMeta {
                pubkey: draw.key(),
                is_signer: false,
                is_writable: true,
            }]),
            ..Default::default()
        });

        // The macro generates this: it signs with the program's identity PDA and
        // rewrites the discriminator to the scoped request the callback expects.
        ctx.accounts
            .invoke_signed_vrf(&ctx.accounts.payer.to_account_info(), &ix)?;

        msg!("market draw {} requested", draw_id);
        Ok(())
    }

    /// The oracle's answer: which market the duel is on.
    ///
    /// `#[vrf_callback]` puts the VRF program's identity in the accounts and
    /// requires it to have signed, so this cannot be called by a player.
    pub fn settle_market_draw(
        ctx: Context<SettleMarketDraw>,
        randomness: [u8; 32],
    ) -> Result<()> {
        let draw = &mut ctx.accounts.draw;
        require!(!draw.is_fulfilled(), FogError::DrawAlreadySettled);

        // Range is inclusive, so this yields 0..=DRAW_CANDIDATES-1.
        let pick = random_u8_with_range(&randomness, 0, (DRAW_CANDIDATES - 1) as u8);
        draw.chosen = pick as i8;
        draw.randomness = randomness;
        draw.fulfilled_ts = Clock::get()?.unix_timestamp;

        msg!("market draw {} settled on candidate {}", draw.draw_id, pick);
        Ok(())
    }

    pub fn init_treasury(ctx: Context<InitTreasury>) -> Result<()> {
        ctx.accounts.treasury.bump = ctx.bumps.treasury;
        Ok(())
    }

    /* ---------------------- MagicBlock: ER lifecycle ---------------------- */

    /// Delegate one player's `Position` to an Ephemeral Rollup validator.
    ///
    /// After this lands the account is owned by the delegation program on L1
    /// and is only writable on the ER. Pass the TEE validator identity to get
    /// a *private* rollup — a plain ER validator gives speed but no privacy.
    pub fn delegate_position_to_er(
        ctx: Context<DelegatePositionToEr>,
        owner: Pubkey,
        validator: Option<Pubkey>,
        commit_frequency_ms: u32,
    ) -> Result<()> {
        let match_key = ctx.accounts.match_account.key();
        ctx.accounts.delegate_position(
            &ctx.accounts.payer,
            &[b"position", match_key.as_ref(), owner.as_ref()],
            DelegateConfig {
                commit_frequency_ms,
                validator,
            },
        )?;
        msg!("position delegated owner={} validator={:?}", owner, validator);
        Ok(())
    }

    /// Delegate the public round status to the rollup.
    ///
    /// `liquidate` runs on the rollup, because that is where positions live,
    /// so the account it announces into has to be writable there too. Unlike a
    /// position this one is never given a permission, so it stays readable by
    /// everyone — which is the entire reason it exists.
    pub fn delegate_status_to_er(
        ctx: Context<DelegateStatusToEr>,
        validator: Option<Pubkey>,
        commit_frequency_ms: u32,
    ) -> Result<()> {
        let match_key = ctx.accounts.match_account.key();
        ctx.accounts.delegate_round_status(
            &ctx.accounts.payer,
            &[b"status", match_key.as_ref()],
            DelegateConfig {
                commit_frequency_ms,
                validator,
            },
        )?;
        msg!("round status delegated validator={:?}", validator);
        Ok(())
    }

    /* -------------------- MagicBlock: PER (the product) -------------------- */

    /// Mark a delegated `Position` private on the ER.
    ///
    /// This is the instruction the whole product rests on. It creates an
    /// ephemeral permission with `is_private: true` and exactly one member —
    /// the position's owner. From this point the TEE blocks any read of this
    /// account at ingress for every other key, including the opponent's and
    /// including an unauthenticated public RPC.
    ///
    /// The flags matter as much as the membership: withholding the account but
    /// leaking transaction logs or balances would expose the same fills by a
    /// side channel, so logs, messages and balances are all gated to the owner.
    ///
    /// Idempotent — the permission program skips creation if one already
    /// exists, so callers may retry freely.
    ///
    /// Runs on the ER, not L1.
    pub fn init_position_privacy(ctx: Context<InitPositionPrivacy>, owner: Pubkey) -> Result<()> {
        let match_key = ctx.accounts.match_account.key();
        let bump = ctx.accounts.position.bump;
        let seeds: &[&[u8]] = &[b"position", match_key.as_ref(), owner.as_ref(), &[bump]];

        // The position PDA pays for its own permission rent, and signs for it.
        //
        // This is the point of pre-funding it at init (see
        // POSITION_PREFUND_LAMPORTS). The ER runs an `ephemeral` lifecycle:
        // it only accepts writes to *delegated* accounts, so an ordinary
        // wallet cannot be the CPI payer here — the transaction is rejected
        // with "This account may not be used to pay transaction fees". The
        // position is delegated and funded, so it can.
        CreateEphemeralPermissionCpi {
            permissioned_account: ctx.accounts.position.to_account_info(),
            permission: ctx.accounts.permission.to_account_info(),
            payer: ctx.accounts.position.to_account_info(),
            vault: ctx.accounts.ephemeral_vault.to_account_info(),
            magic_program: ctx.accounts.magic_program.to_account_info(),
            permission_program: ctx.accounts.permission_program.to_account_info(),
            args: EphemeralMembersArgs {
                is_private: true,
                members: vec![Member {
                    flags: AUTHORITY_FLAG | TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG,
                    pubkey: owner,
                }],
            },
        }
        .invoke_signed(&[seeds])?;

        msg!("position sealed private owner={}", owner);
        Ok(())
    }

    /// Create the L1 access-control list for a position, on the base layer.
    ///
    /// The ephemeral (TEE) permission path has to run on the ER and needs a
    /// delegated payer; this one runs on L1 where the wallet can pay normally.
    /// The member set is the same either way: the owner, and nobody else.
    ///
    /// The position PDA has to sign for its own permission, which is why this
    /// is a program CPI rather than a client instruction.
    pub fn create_position_permission(ctx: Context<CreatePositionPermission>, owner: Pubkey) -> Result<()> {
        let match_key = ctx.accounts.match_account.key();
        let bump = ctx.accounts.position.bump;
        let seeds: &[&[u8]] = &[b"position", match_key.as_ref(), owner.as_ref(), &[bump]];

        CreatePermissionCpi::new(
            &ctx.accounts.permission_program.to_account_info(),
            CreatePermissionCpiAccounts {
                permissioned_account: &ctx.accounts.position.to_account_info(),
                permission: &ctx.accounts.permission.to_account_info(),
                payer: &ctx.accounts.payer.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
            },
            CreatePermissionInstructionArgs {
                args: MembersArgs {
                    members: Some(vec![Member {
                        flags: AUTHORITY_FLAG | TX_LOGS_FLAG | TX_MESSAGE_FLAG | TX_BALANCES_FLAG,
                        pubkey: owner,
                    }]),
                },
            },
        )
        .invoke_signed(&[seeds])?;

        msg!("permission created for position owner={}", owner);
        Ok(())
    }

    /// Delegate a position's permission to the same validator the position
    /// itself is delegated to, so the rollup can enforce the ACL.
    pub fn delegate_position_permission(
        ctx: Context<DelegatePositionPermission>,
        owner: Pubkey,
    ) -> Result<()> {
        let match_key = ctx.accounts.match_account.key();
        let bump = ctx.accounts.position.bump;
        let seeds: &[&[u8]] = &[b"position", match_key.as_ref(), owner.as_ref(), &[bump]];

        DelegatePermissionCpi::new(
            &ctx.accounts.permission_program.to_account_info(),
            DelegatePermissionCpiAccounts {
                payer: &ctx.accounts.payer.to_account_info(),
                authority: (&ctx.accounts.position.to_account_info(), true),
                permissioned_account: (&ctx.accounts.position.to_account_info(), true),
                permission: &ctx.accounts.permission.to_account_info(),
                system_program: &ctx.accounts.system_program.to_account_info(),
                owner_program: &ctx.accounts.permission_program.to_account_info(),
                delegation_buffer: &ctx.accounts.delegation_buffer.to_account_info(),
                delegation_record: &ctx.accounts.delegation_record.to_account_info(),
                delegation_metadata: &ctx.accounts.delegation_metadata.to_account_info(),
                delegation_program: &ctx.accounts.delegation_program.to_account_info(),
                validator: Some(&ctx.accounts.validator.to_account_info()),
            },
        )
        .invoke_signed(&[seeds])?;

        msg!("permission delegated for position owner={}", owner);
        Ok(())
    }

    /// Commit one position back to L1 and release its delegation.
    ///
    /// Called on the ER once the clock expires, once per side. After both have
    /// landed the positions are readable on L1 again and `settle_match` can run.
    ///
    /// One at a time, deliberately. A Position is 543 bytes, so two of them do
    /// not fit in a single 1232-byte transaction, and asking the rollup to
    /// commit both at once pushes its committor onto a chunked buffer path.
    /// Committing them separately keeps every commit inline, and a failure on
    /// one side no longer strands the other.
    pub fn commit_and_undelegate_position(ctx: Context<CommitAndUndelegatePosition>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer.to_account_info(),
            vec![&ctx.accounts.position.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
            None,
        )?;
        Ok(())
    }

    /// Bring the public round status back from the rollup.
    ///
    /// `settle_match` runs on L1 and reads the liquidation flags off this
    /// account to write them onto the tape. A delegated account is owned by the
    /// delegation program on L1, so without this the settle transaction would
    /// be rejected before it read anything.
    pub fn commit_and_undelegate_status(ctx: Context<CommitAndUndelegateStatus>) -> Result<()> {
        commit_and_undelegate_accounts(
            &ctx.accounts.payer.to_account_info(),
            vec![&ctx.accounts.round_status.to_account_info()],
            &ctx.accounts.magic_context,
            &ctx.accounts.magic_program,
            None,
        )?;
        Ok(())
    }
}

/* -------------------------------------------------------------------------- */
/*                                  Contexts                                   */
/* -------------------------------------------------------------------------- */

#[derive(Accounts)]
#[instruction(match_id: u64)]
pub struct CreateMatch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + Match::INIT_SPACE,
        seeds = [b"match", creator.key().as_ref(), &match_id.to_le_bytes()],
        bump
    )]
    pub match_account: Account<'info, Match>,

    #[account(
        init,
        payer = creator,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault", match_account.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,

    /// The creator's feed. One per player now, so it is seeded by owner.
    #[account(
        init,
        payer = creator,
        space = 8 + PriceFeed::INIT_SPACE,
        seeds = [b"feed", match_account.key().as_ref(), creator.key().as_ref()],
        bump
    )]
    pub price_feed: Account<'info, PriceFeed>,

    /// Deliberately unsealed: this is the one thing about a live round that is
    /// public. See `RoundStatus`.
    #[account(
        init,
        payer = creator,
        space = 8 + RoundStatus::INIT_SPACE,
        seeds = [b"status", match_account.key().as_ref()],
        bump
    )]
    pub round_status: Account<'info, RoundStatus>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinMatch<'info> {
    #[account(mut)]
    pub joiner: Signer<'info>,

    #[account(mut, seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    #[account(mut, seeds = [b"vault", match_account.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    /// The creator's feed, opened at create time.
    #[account(seeds = [b"feed", match_account.key().as_ref(), match_account.creator.as_ref()], bump = price_feed.bump)]
    pub price_feed: Account<'info, PriceFeed>,

    /// The joiner's own feed, for the token they are bringing.
    #[account(
        init,
        payer = joiner,
        space = 8 + PriceFeed::INIT_SPACE,
        seeds = [b"feed", match_account.key().as_ref(), joiner.key().as_ref()],
        bump
    )]
    pub price_feed_b: Account<'info, PriceFeed>,

    #[account(
        init,
        payer = joiner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", match_account.key().as_ref(), match_account.creator.as_ref()],
        bump
    )]
    pub position_a: Account<'info, Position>,

    #[account(
        init,
        payer = joiner,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", match_account.key().as_ref(), joiner.key().as_ref()],
        bump
    )]
    pub position_b: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelMatch<'info> {
    #[account(mut, address = match_account.creator)]
    pub creator: Signer<'info>,

    #[account(mut, seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    #[account(mut, seeds = [b"vault", match_account.key().as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
#[instruction(px: u64, owner: Pubkey)]
pub struct PushPrice<'info> {
    /// Anyone. Deliberately not checked against `price_feed.authority`: see
    /// `push_price`. Signing is only so somebody pays the fee.
    pub authority: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    #[account(
        mut,
        seeds = [b"feed", match_account.key().as_ref(), owner.as_ref()],
        bump = price_feed.bump,
        constraint = price_feed.owner == owner @ FogError::NotAParticipant,
    )]
    pub price_feed: Account<'info, PriceFeed>,
}

#[derive(Accounts, Session)]
#[instruction(side: Side, qty: u64, owner: Pubkey)]
pub struct ApplyFill<'info> {
    /// Whoever signed: the owner, or a session key acting for them.
    pub player: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Box<Account<'info, Match>>,

    #[account(
        seeds = [b"feed", match_account.key().as_ref(), owner.as_ref()],
        bump = price_feed.bump,
        constraint = price_feed.owner == owner @ FogError::NotAParticipant,
    )]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    /// The position being filled — and, inside it, that player's own private
    /// book. Delegated to the rollup, so a fill moves that book there and never
    /// on a public venue.
    ///
    /// Seeded by `owner` rather than by the signer, because with a session key
    /// those differ. Ownership is still checked: `session_auth_or` requires the
    /// signer to be the owner when no token is presented, and `apply_fill`
    /// additionally asserts `position.owner == owner`.
    #[account(
        mut,
        seeds = [b"position", match_account.key().as_ref(), owner.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    /// A Gum session token authorising `player` to act for `position.owner`.
    /// Optional: without one, the signer must be the owner.
    #[session(signer = player, authority = position.owner)]
    pub session_token: Option<Account<'info, SessionToken>>,
}

#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct Liquidate<'info> {
    /// Anyone. They pay the fee and get nothing for it but the outcome.
    pub cranker: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Box<Account<'info, Match>>,

    #[account(
        seeds = [b"feed", match_account.key().as_ref(), owner.as_ref()],
        bump = price_feed.bump,
        constraint = price_feed.owner == owner @ FogError::NotAParticipant,
    )]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    #[account(
        mut,
        seeds = [b"position", match_account.key().as_ref(), owner.as_ref()],
        bump = position.bump,
    )]
    pub position: Box<Account<'info, Position>>,

    /// Unsealed on purpose. See `RoundStatus`.
    #[account(mut, seeds = [b"status", match_account.key().as_ref()], bump = round_status.bump)]
    pub round_status: Box<Account<'info, RoundStatus>>,
}

#[derive(Accounts)]
pub struct RequestSettle<'info> {
    /// Permissionless — anyone may trigger settlement once the clock expires.
    pub cranker: Signer<'info>,

    #[account(mut, seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,
}

#[derive(Accounts)]
pub struct SettleMatch<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,

    #[account(mut, seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Box<Account<'info, Match>>,

    #[account(mut, seeds = [b"vault", match_account.key().as_ref()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    /// The creator's market, for valuing the creator's position.
    #[account(seeds = [b"feed", match_account.key().as_ref(), match_account.creator.as_ref()], bump = price_feed.bump)]
    pub price_feed: Box<Account<'info, PriceFeed>>,

    /// The joiner's market. A different token, so a different mark.
    #[account(seeds = [b"feed", match_account.key().as_ref(), position_b.owner.as_ref()], bump = price_feed_b.bump)]
    pub price_feed_b: Box<Account<'info, PriceFeed>>,

    /// Read here only to copy the liquidation flags onto the tape, so the
    /// permanent record says whether a side was closed out or traded to the
    /// buzzer.
    #[account(seeds = [b"status", match_account.key().as_ref()], bump = round_status.bump)]
    pub round_status: Box<Account<'info, RoundStatus>>,

    #[account(mut, seeds = [b"position", match_account.key().as_ref(), match_account.creator.as_ref()], bump = position_a.bump)]
    pub position_a: Box<Account<'info, Position>>,

    #[account(mut, seeds = [b"position", match_account.key().as_ref(), position_b.owner.as_ref()], bump = position_b.bump)]
    pub position_b: Box<Account<'info, Position>>,

    /// CHECK: verified against `match_account.creator`; receives the payout on a creator win.
    #[account(mut, address = match_account.creator)]
    pub creator: UncheckedAccount<'info>,

    /// CHECK: verified against `position_b.owner`; receives the payout on a joiner win.
    #[account(mut, address = position_b.owner)]
    pub joiner: UncheckedAccount<'info>,

    #[account(mut, seeds = [b"treasury"], bump = treasury.bump)]
    pub treasury: Box<Account<'info, Treasury>>,

    #[account(
        init,
        payer = cranker,
        space = 8 + Tape::INIT_SPACE,
        seeds = [b"tape", match_account.key().as_ref()],
        bump
    )]
    pub tape: Box<Account<'info, Tape>>,

    /// `init_if_needed` because a player's first settlement creates their
    /// record and every later one updates it.
    #[account(
        init_if_needed,
        payer = cranker,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [b"stats", match_account.creator.as_ref()],
        bump
    )]
    pub stats_creator: Box<Account<'info, PlayerStats>>,

    #[account(
        init_if_needed,
        payer = cranker,
        space = 8 + PlayerStats::INIT_SPACE,
        seeds = [b"stats", position_b.owner.as_ref()],
        bump
    )]
    pub stats_joiner: Box<Account<'info, PlayerStats>>,

    pub system_program: Program<'info, System>,
}

#[vrf]
#[derive(Accounts)]
#[instruction(draw_id: u64)]
pub struct RequestMarketDraw<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + MarketDraw::INIT_SPACE,
        seeds = [b"draw", payer.key().as_ref(), &draw_id.to_le_bytes()],
        bump
    )]
    pub draw: Account<'info, MarketDraw>,

    /// The VRF queue the request is posted to. Caller-chosen, so the macro
    /// leaves it to us; everything else in this struct it adds itself.
    /// CHECK: validated by the VRF program.
    #[account(mut)]
    pub oracle_queue: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[vrf_callback]
#[derive(Accounts)]
pub struct SettleMarketDraw<'info> {
    #[account(mut)]
    pub draw: Account<'info, MarketDraw>,
}

#[derive(Accounts)]
pub struct InitTreasury<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    pub system_program: Program<'info, System>,
}


/* -------------------------------------------------------------------------- */
/*                          MagicBlock ER / PER contexts                      */
/* -------------------------------------------------------------------------- */

/// `#[delegate]` expands the `del`-marked field into the buffer, delegation
/// record and delegation metadata accounts, and generates `delegate_position`.
#[delegate]
#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct DelegatePositionToEr<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    /// CHECK: seeds are asserted here; ownership moves to the delegation
    /// program, so this cannot stay a typed `Account`.
    #[account(mut, del, seeds = [b"position", match_account.key().as_ref(), owner.as_ref()], bump)]
    pub position: AccountInfo<'info>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateStatusToEr<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    /// CHECK: seeds are asserted here; ownership moves to the delegation
    /// program, so this cannot stay a typed `Account`.
    #[account(mut, del, seeds = [b"status", match_account.key().as_ref()], bump)]
    pub round_status: AccountInfo<'info>,
}

#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct InitPositionPrivacy<'info> {
    /// Transaction fee payer only. Deliberately NOT `mut`: on the ER a
    /// writable non-delegated account fails transaction verification.
    pub payer: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    #[account(mut, seeds = [b"position", match_account.key().as_ref(), owner.as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,

    /// CHECK: the permission PDA, derived and validated by the permission program.
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,

    /// CHECK: collects ephemeral-permission rent; fixed address from the SDK.
    #[account(mut, address = EPHEMERAL_VAULT_ID)]
    pub ephemeral_vault: UncheckedAccount<'info>,

    /// CHECK: the magic program.
    pub magic_program: Program<'info, ephemeral_rollups_sdk::anchor::MagicProgram>,

    /// CHECK: the ACL program; fixed address from the SDK.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,
}

/// `#[commit]` injects `magic_context` and `magic_program`.
#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegatePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub position: Account<'info, Position>,
}

#[commit]
#[derive(Accounts)]
pub struct CommitAndUndelegateStatus<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub round_status: Account<'info, RoundStatus>,
}

#[delegate]


#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct CreatePositionPermission<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    #[account(seeds = [b"position", match_account.key().as_ref(), owner.as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,

    /// CHECK: derived and validated by the permission program.
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,

    /// CHECK: fixed address from the SDK.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(owner: Pubkey)]
pub struct DelegatePositionPermission<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(seeds = [b"match", match_account.creator.as_ref(), &match_account.match_id.to_le_bytes()], bump = match_account.bump)]
    pub match_account: Account<'info, Match>,

    #[account(seeds = [b"position", match_account.key().as_ref(), owner.as_ref()], bump = position.bump)]
    pub position: Account<'info, Position>,

    /// CHECK: derived and validated by the permission program.
    #[account(mut)]
    pub permission: UncheckedAccount<'info>,

    /// CHECK: delegation buffer for the permission account.
    #[account(mut)]
    pub delegation_buffer: UncheckedAccount<'info>,

    /// CHECK: delegation record for the permission account.
    #[account(mut)]
    pub delegation_record: UncheckedAccount<'info>,

    /// CHECK: delegation metadata for the permission account.
    #[account(mut)]
    pub delegation_metadata: UncheckedAccount<'info>,

    /// CHECK: the ER validator identity to delegate to.
    pub validator: UncheckedAccount<'info>,

    /// CHECK: fixed address from the SDK.
    #[account(address = PERMISSION_PROGRAM_ID)]
    pub permission_program: UncheckedAccount<'info>,

    /// CHECK: fixed address from the SDK.
    pub delegation_program: Program<'info, ephemeral_rollups_sdk::anchor::DelegationProgram>,

    pub system_program: Program<'info, System>,
}
