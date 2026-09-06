use anchor_lang::prelude::*;

/// Price fixed-point scale.
///
/// A price (`px`) is **lamports per whole token, scaled by PRICE_SCALE**. The
/// scale is what makes one representation work for the whole market list: a
/// pump.fun coin trades near 2.8e-8 SOL, which is 28 lamports a token, and
/// storing that as a bare integer leaves two significant figures and rounds
/// the cheaper half of the list to zero. Scaled, it is 2.8e7 — and SOL itself,
/// at 1e15, still has four orders of magnitude of headroom under u64.
pub const PRICE_SCALE: i128 = 1_000_000;
/// Base-quantity fixed-point scale. `base_qty` is whole tokens scaled by 1e6.
pub const BASE_SCALE: i128 = 1_000_000;
/// What a base quantity times a price has to be divided by to land in
/// lamports. Both scales, because both operands carry one.
pub const VALUE_DIV: i128 = BASE_SCALE * PRICE_SCALE;
/// Protocol rake in basis points, taken from the pot at settlement.
/// Mirrors the "2% RAKE" the UI has always displayed.
pub const RAKE_BPS: u64 = 200;
pub const BPS_DENOM: u64 = 10_000;
/// Fills retained on-chain per player. Bounded so the account cannot grow
/// without limit; the UI only ever renders the most recent handful.
pub const MAX_FILLS: usize = 16;

/// The most a single price push may move the mark, in basis points.
///
/// The mark is posted by a client reading a public API, which is a trust
/// assumption we would rather not have: whoever posts last before the buzzer
/// would otherwise decide the round. Anyone may post — the round's own
/// participants included — so the defence cannot be about who, only about how
/// much and how fast.
///
/// 5% a second is loose enough for a meme coin having a bad minute (a 60s
/// round can still travel roughly 19x) and tight enough that a last-instant
/// grab moves the settlement mark by at most 5%, in public, with the other
/// side able to trade against it.
pub const MAX_PUSH_BPS: u64 = 500;
/// Minimum seconds between two pushes, which is what gives the cap its teeth.
pub const MIN_PUSH_INTERVAL: i64 = 1;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MatchStatus {
    Open,
    Live,
    Settling,
    Settled,
    Cancelled,
}

/// Which kind of market a duel is fought over.
///
/// Meme markets are priced by an internal constant-product AMM seeded from a
/// snapshot of the token's real bonding-curve mid. Major markets are priced
/// from a posted oracle mark. Neither routes the battle fill through a public
/// venue — a public swap print would leak wallet, mint and size, which is
/// exactly what the fog exists to prevent.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketType {
    Meme,
    Major,
}

/// Symbol is capped so the account stays a fixed size.
pub const SYMBOL_LEN: usize = 12;
pub const NAME_LEN: usize = 32;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Side {
    Buy,
    Sell,
    /// Written by settlement when an open position is closed at the buzzer.
    Settle,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace)]
pub struct Fill {
    pub side: Side,
    /// Base quantity, scaled by BASE_SCALE.
    pub qty: u64,
    /// Execution price: lamports per token, scaled by PRICE_SCALE.
    pub px: u64,
    pub ts: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Match {
    pub creator: Pubkey,
    pub joiner: Option<Pubkey>,
    /// The token being traded. Informational for the demo — positions are
    /// virtual inventory, so no SPL transfer happens mid-round.
    pub mint: Pubkey,
    pub match_id: u64,
    pub start_ts: i64,
    pub duration: i64,
    /// Per-player entry, in lamports.
    pub entry: u64,
    pub status: MatchStatus,
    /// Total escrowed: entry * 2.
    pub pot: u64,
    pub winner: Option<Pubkey>,
    pub pnl_a_bps: i64,
    pub pnl_b_bps: i64,
    /// Meme or Major. Decides how the mark is produced at settlement.
    pub market_type: MarketType,
    /// Ticker, zero-padded. Display only; the mint is the identity.
    pub symbol: [u8; SYMBOL_LEN],
    /// Token name, zero-padded.
    pub name: [u8; NAME_LEN],
    pub bump: u8,
}

/// A constant-product book, private to one player.
///
/// Seeded at join from a snapshot of the real market mid, re-pegged to the
/// posted price before every fill, and never touched by anything public.
///
/// One book per player, and it lives *inside* the Position — which is the
/// account the permission program seals. A single book shared by both sides
/// would leak: your fill moves the mid, and an opponent watching the mid reads
/// your flow straight off it. Hiding the Position while publishing a mark that
/// every fill moves is not privacy, it is a slower way to tell them.
///
/// Because each side trades its own curve, impact is purely the cost of your
/// own size. Neither player can push the other's execution around, and the
/// price signal both are trading comes from the posted mark.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct Book {
    /// Virtual base reserves, in whole tokens x BASE_SCALE.
    pub virtual_base: u64,
    /// Virtual quote reserves, in lamports.
    pub virtual_quote: u64,
    /// Mid the round opened on. Kept for the tape; never re-pegged away.
    pub seed_px: u64,
}

/// Depth, as a multiple of the entry.
///
/// This sets what trading costs. A buy that spends the whole entry moves the
/// mid by (DEPTH+1)/DEPTH, so 64 charges about 1.6% on a maximum-size fill and
/// proportionally less on anything smaller — enough that size has to be
/// thought about, not so much that the round is won by whoever trades least.
/// At the 8x this started from, a half-size round trip cost ~12% and beat any
/// realistic price move, so the winning move was to sit still.
pub const BOOK_DEPTH: u64 = 64;

impl Book {
    /// Seed at `px` with depth scaled to the entry.
    pub fn seed(&mut self, entry: u64, px: u64) -> Option<()> {
        if px == 0 {
            return None;
        }
        let quote = entry.checked_mul(BOOK_DEPTH)?;
        let base = ((quote as u128).checked_mul(VALUE_DIV as u128)? / (px as u128)) as u64;
        if base == 0 {
            return None;
        }
        self.virtual_quote = quote;
        self.virtual_base = base;
        if self.seed_px == 0 {
            self.seed_px = px;
        }
        Some(())
    }

    pub fn is_seeded(&self) -> bool {
        self.virtual_base > 0 && self.virtual_quote > 0
    }

    /// Constant product. u128 throughout so a large reserve cannot overflow.
    pub fn k(&self) -> u128 {
        (self.virtual_base as u128) * (self.virtual_quote as u128)
    }

    /// Spot mid, in lamports per traded unit.
    pub fn mid(&self) -> u64 {
        if self.virtual_base == 0 {
            return 0;
        }
        (((self.virtual_quote as u128) * (VALUE_DIV as u128)) / (self.virtual_base as u128)) as u64
    }

    /// Move the book to `px`, restoring full depth.
    ///
    /// The book is a spread around the posted mark, not a world of its own.
    /// Without this a player could buy at a stale mid and settle against a
    /// mark that has since moved — a free roll with no trading in it.
    ///
    /// Depth is restored rather than carried forward, so a fill's impact is
    /// charged once, when it executes, and does not compound across a round.
    /// A player's own flow should cost them slippage; it should not
    /// permanently relocate a market they are not actually trading in.
    pub fn repeg(&mut self, entry: u64, px: u64) -> Option<()> {
        self.seed(entry, px)
    }

    /// Base received for spending `quote_in`. Moves the curve.
    pub fn buy(&mut self, quote_in: u64) -> Option<u64> {
        let k = self.k();
        let new_quote = (self.virtual_quote as u128).checked_add(quote_in as u128)?;
        let new_base = k.checked_div(new_quote)?;
        let base_out = (self.virtual_base as u128).checked_sub(new_base)?;
        self.virtual_quote = new_quote as u64;
        self.virtual_base = new_base as u64;
        Some(base_out as u64)
    }

    /// What selling `base_in` would fetch, leaving the curve where it is.
    ///
    /// This is the honest value of a holding: what you could actually get out,
    /// impact included — not where the book happens to be sitting.
    pub fn quote_out_for(&self, base_in: u64) -> Option<u64> {
        let k = self.k();
        let new_base = (self.virtual_base as u128).checked_add(base_in as u128)?;
        let new_quote = k.checked_div(new_base)?;
        (self.virtual_quote as u128)
            .checked_sub(new_quote)
            .map(|q| q as u64)
    }

    /// Quote received for selling `base_in`. Moves the curve the other way.
    pub fn sell(&mut self, base_in: u64) -> Option<u64> {
        let quote_out = self.quote_out_for(base_in)?;
        let k = self.k();
        let new_base = (self.virtual_base as u128).checked_add(base_in as u128)?;
        self.virtual_base = new_base as u64;
        self.virtual_quote = k.checked_div(new_base)? as u64;
        Some(quote_out)
    }
}

/// Pad a string into a fixed-size on-chain field.
pub fn pad<const N: usize>(s: &str) -> [u8; N] {
    let mut out = [0u8; N];
    let bytes = s.as_bytes();
    let n = bytes.len().min(N);
    out[..n].copy_from_slice(&bytes[..n]);
    out
}

/// Per-player trading state. Delegated to an ER and made private via the
/// permission program while the match is Live — this is the account whose
/// unreadability is the entire product.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub match_key: Pubkey,
    /// Virtual quote currency, seeded from the entry. Lamports.
    pub quote_balance: i64,
    /// Net base held, scaled by BASE_SCALE. Signed: long only for the MVP,
    /// but the type allows shorts without a migration.
    pub base_qty: i64,
    /// Volume-weighted average entry price, in the same scale as `px`.
    pub avg_px: u64,
    /// Realized PnL in quote units. Lamports.
    pub realized: i64,
    pub last_px: u64,
    pub fill_count: u16,
    #[max_len(MAX_FILLS)]
    pub fills: Vec<Fill>,
    /// This player's own private book. Inside the Position, so the permission
    /// that seals the position seals the book with it.
    pub book: Book,
    pub bump: u8,
}

/// Escrow. A program-owned account so settlement can move lamports out of it
/// by direct mutation; a system-owned PDA could not.
#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub match_key: Pubkey,
    pub bump: u8,
}

/// Protocol rake destination.
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub bump: u8,
}

/// The mark price both players trade against. One feed per match, so neither
/// side can be quoted a different price than the other.
#[account]
#[derive(InitSpace)]
pub struct PriceFeed {
    pub match_key: Pubkey,
    /// Scaled by PRICE_SCALE.
    pub px: u64,
    pub updated_ts: i64,
    pub authority: Pubkey,
    pub bump: u8,
}

/// The public record written at settlement. World-readable forever.
#[account]
#[derive(InitSpace)]
pub struct Tape {
    pub match_key: Pubkey,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub pnl_a_bps: i64,
    pub pnl_b_bps: i64,
    pub winner: Pubkey,
    pub pot_paid: u64,
    pub rake: u64,
    pub settled_ts: i64,
    #[max_len(MAX_FILLS)]
    pub fills_a: Vec<Fill>,
    #[max_len(MAX_FILLS)]
    pub fills_b: Vec<Fill>,
    pub bump: u8,
}

impl Position {
    /// Mark-to-market equity, in lamports.
    pub fn equity(&self, mark_px: u64) -> i128 {
        let base_value = (self.base_qty as i128) * (mark_px as i128) / VALUE_DIV;
        (self.quote_balance as i128) + base_value
    }

    /// PnL against the starting quote balance, in basis points.
    pub fn pnl_bps(&self, mark_px: u64, start_quote: i64) -> i64 {
        if start_quote == 0 {
            return 0;
        }
        let eq = self.equity(mark_px);
        let pnl = eq - (start_quote as i128);
        ((pnl * (BPS_DENOM as i128)) / (start_quote as i128)) as i64
    }

    pub fn push_fill(&mut self, fill: Fill) {
        if self.fills.len() >= MAX_FILLS {
            self.fills.remove(0);
        }
        self.fills.push(fill);
        self.fill_count = self.fill_count.saturating_add(1);
    }
}

/// Lifetime record for one wallet, updated at settlement.
///
/// The leaderboard was being aggregated client-side by scanning every tape,
/// which is O(all matches) per render and cannot be trusted by anything other
/// than the client doing the scanning. This is the on-chain source of truth.
#[account]
#[derive(InitSpace)]
pub struct PlayerStats {
    pub owner: Pubkey,
    pub wins: u32,
    pub losses: u32,
    /// Lamports won, net of rake.
    pub taken: u64,
    /// Lamports staked across all matches.
    pub staked: u64,
    /// Current consecutive wins.
    pub streak: u32,
    /// Best streak ever reached.
    pub best_streak: u32,
    pub last_played_ts: i64,
    pub bump: u8,
}

impl PlayerStats {
    pub fn record_win(&mut self, payout: u64, stake: u64, ts: i64) {
        self.wins = self.wins.saturating_add(1);
        self.taken = self.taken.saturating_add(payout);
        self.staked = self.staked.saturating_add(stake);
        self.streak = self.streak.saturating_add(1);
        if self.streak > self.best_streak {
            self.best_streak = self.streak;
        }
        self.last_played_ts = ts;
    }

    pub fn record_loss(&mut self, stake: u64, ts: i64) {
        self.losses = self.losses.saturating_add(1);
        self.staked = self.staked.saturating_add(stake);
        // A loss ends the streak but never touches best_streak.
        self.streak = 0;
        self.last_played_ts = ts;
    }
}
