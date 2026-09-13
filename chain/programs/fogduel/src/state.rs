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

/// How long an unjoined match may sit on the book before it can no longer be
/// joined.
///
/// Both books are seeded from `start_px`, the market mid snapshotted when the
/// match was *created*. That is right for a duel joined promptly and a trap for
/// one joined an hour later: the mark is re-anchored to the live price by the
/// permissionless crank, which is rate-limited to MAX_PUSH_BPS a second, so a
/// stale open match corrects itself *during* the round — at the expense of
/// whoever just joined it.
///
/// It really happens. A match seeded at 0.00090 SOL and joined 86 minutes
/// later, by which time the token was worth 0.000088, settled its joiner at
/// -90.22% on a single fill whose own impact was 1.53%. That is not trading,
/// it is a stale number being corrected onto somebody.
///
/// The rate limit cannot simply be lifted for the first push of a round: a
/// joiner could then post a mark near zero, buy, and ride the correction back
/// up. Bounding the staleness instead removes the trap without opening that
/// door — the creator cancels and reopens at a fresh price, which costs them
/// nothing but a transaction.
///
/// Five minutes is comfortably longer than a match waits in practice and short
/// enough that no realistic move can accumulate behind it.
pub const MAX_OPEN_AGE: i64 = 300;

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
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, Default, InitSpace)]
pub enum MarketType {
    #[default]
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
    /// Written when a position was force-closed for running out of equity.
    /// Distinct from `Settle` so the tape says *why* the position ended, and
    /// so the reveal can show a blow-up as the event it was.
    Liquidation,
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

/// One player's chosen market.
///
/// A duel used to be two players on one token. It is now two players on two
/// tokens, compared on PnL — so everything that described "the market" has to
/// be said twice, once per side.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, InitSpace)]
pub struct Leg {
    /// The token this player is trading. Informational for settlement —
    /// positions are virtual inventory, so no SPL transfer happens mid-round.
    pub mint: Pubkey,
    /// Ticker, zero-padded. Display only; the mint is the identity.
    pub symbol: [u8; SYMBOL_LEN],
    /// Token name, zero-padded.
    pub name: [u8; NAME_LEN],
    /// Which feed prices it, which decides how the mark is produced.
    pub market_type: MarketType,
    /// The mark this player's round opened on, and their book was seeded at.
    pub start_px: u64,
}

#[account]
#[derive(InitSpace)]
pub struct Match {
    pub creator: Pubkey,
    pub joiner: Option<Pubkey>,
    /// The creator's market. Set at `create_match`.
    pub leg_a: Leg,
    /// The joiner's market. Zeroed until somebody joins and names their own.
    pub leg_b: Leg,
    pub match_id: u64,
    /// When the match was opened. `start_ts` is when it went live, which is a
    /// different moment and is zero until somebody joins — so "opened 3m ago"
    /// had nowhere to come from and was being decoded out of `match_id`, whose
    /// scale differed between the app and the seeder.
    pub created_ts: i64,
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
    /// Quote needed to take exactly `base_out` off the curve. Moves it.
    ///
    /// The mirror of `sell`, and needed because closing a short buys a known
    /// quantity of base rather than spending a known quantity of quote. Doing
    /// it by guessing a quote amount and checking what came back would leave
    /// dust on a position that is supposed to end at exactly zero.
    pub fn buy_base(&mut self, base_out: u64) -> Option<u64> {
        let k = self.k();
        let new_base = (self.virtual_base as u128).checked_sub(base_out as u128)?;
        if new_base == 0 {
            return None;
        }
        let new_quote = k.checked_div(new_base)?;
        let quote_in = new_quote.checked_sub(self.virtual_quote as u128)?;
        self.virtual_base = new_base as u64;
        self.virtual_quote = new_quote as u64;
        Some(quote_in as u64)
    }

    pub fn sell(&mut self, base_in: u64) -> Option<u64> {
        let quote_out = self.quote_out_for(base_in)?;
        let k = self.k();
        let new_base = (self.virtual_base as u128).checked_add(base_in as u128)?;
        self.virtual_base = new_base as u64;
        self.virtual_quote = k.checked_div(new_base)? as u64;
        Some(quote_out)
    }
}

/// How many markets a draw chooses between.
///
/// Three is enough that neither player can have prepared for all of them and
/// small enough to show on one screen.
pub const DRAW_CANDIDATES: usize = 3;

/// One market a draw can land on.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default, Debug, InitSpace)]
pub struct MarketRef {
    pub mint: Pubkey,
    pub symbol: [u8; SYMBOL_LEN],
    pub market_type: MarketType,
    /// Lamports per token x PRICE_SCALE, snapshotted when the draw was opened.
    pub start_px: u64,
}

/// A market chosen by MagicBlock's VRF rather than by a player.
///
/// A trading duel where one side picks the market is a duel about preparation,
/// not trading — the opener can choose the coin they have been watching all
/// week. Here the opener nominates three and verifiable randomness picks one,
/// so neither player knows the market until it is drawn and neither could have
/// arranged it.
///
/// `chosen` stays -1 until the oracle calls back, which is what makes this a
/// real draw rather than a client-side shuffle: the value arrives in a
/// transaction signed by the VRF program's identity, and the program will not
/// accept it from anybody else.
#[account]
#[derive(InitSpace)]
pub struct MarketDraw {
    /// Who opened the draw. Only they may create the match from its result.
    pub opener: Pubkey,
    /// Ties the draw to one intended match, so a result cannot be reused.
    pub draw_id: u64,
    pub candidates: [MarketRef; DRAW_CANDIDATES],
    /// Index into `candidates`, or -1 while the oracle has not answered.
    pub chosen: i8,
    /// The randomness the oracle returned, kept so the result is checkable.
    pub randomness: [u8; 32],
    pub requested_ts: i64,
    pub fulfilled_ts: i64,
    /// Set once the match is created, so one draw cannot open two matches.
    pub consumed: bool,
    pub bump: u8,
}

impl MarketDraw {
    pub fn is_fulfilled(&self) -> bool {
        self.chosen >= 0
    }

    /// The drawn market, if the oracle has answered.
    pub fn winner(&self) -> Option<&MarketRef> {
        if self.chosen < 0 {
            return None;
        }
        self.candidates.get(self.chosen as usize)
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
    /// The quote and base this position held immediately before `fills[0]`.
    ///
    /// `fills` keeps only the last MAX_FILLS. Without these, a busy round's
    /// tape held its last sixteen fills and nothing about where they started,
    /// so a replay from the entry drew a curve that ended somewhere the chain
    /// never was. Every fill that falls off the front is folded in here first,
    /// which makes this snapshot plus `fills` the whole round again.
    pub window_quote: i64,
    pub window_base: i64,
    #[max_len(MAX_FILLS)]
    pub fills: Vec<Fill>,
    /// This player's own private book. Inside the Position, so the permission
    /// that seals the position seals the book with it.
    pub book: Book,
    pub bump: u8,
}

/// What the whole world may know about a round in progress.
///
/// Every Position is sealed by an ACL, which is the point of the product — so
/// there was nowhere to publish a fact that both players are *supposed* to
/// see. A liquidation is exactly that fact: a blow-up is announced, by
/// decision, even though position contents never are.
///
/// Deliberately carries no permission account. It is delegated to the rollup so
/// `liquidate` can write it, and served to anyone who asks — the same shape as
/// the unsealed control account `check:gate` probes to show that the gate
/// discriminates rather than simply refusing everything.
#[account]
#[derive(InitSpace)]
pub struct RoundStatus {
    pub match_key: Pubkey,
    /// Set when that side was force-closed for running out of equity.
    pub liquidated_a: bool,
    pub liquidated_b: bool,
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

/// The mark one player trades against.
///
/// There used to be a single feed per match, so that neither side could be
/// quoted a different price than the other. That guarantee only meant anything
/// while both sides traded the same token; now each player brings their own
/// market, so there is one feed per player, seeded `[b"feed", match, owner]`.
/// The protection that mattered survives in a stronger form: a player's fills
/// are priced by the feed for the token they actually chose, and nothing else
/// can write it.
#[account]
#[derive(InitSpace)]
pub struct PriceFeed {
    pub match_key: Pubkey,
    /// Which player's market this prices.
    pub owner: Pubkey,
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
    /// What each side traded. The tape is the public record of a duel, and a
    /// record that does not say which markets it was is not much of a record.
    /// Two legs now, because the players no longer share one.
    pub leg_a: Leg,
    pub leg_b: Leg,
    /// Whether either side ended by being force-closed rather than by trading.
    pub liquidated_a: bool,
    pub liquidated_b: bool,
    pub player_a: Pubkey,
    pub player_b: Pubkey,
    pub pnl_a_bps: i64,
    pub pnl_b_bps: i64,
    pub winner: Pubkey,
    pub pot_paid: u64,
    pub rake: u64,
    pub settled_ts: i64,
    /// Where each side's stored fills begin, and how many fills it made in
    /// all. When `fill_count_*` exceeds the stored list the earliest fills are
    /// gone, and `start_quote_*` / `start_base_*` — the position just before
    /// the first stored fill — are what let a replay start from the right place.
    pub start_quote_a: i64,
    pub start_base_a: i64,
    pub fill_count_a: u16,
    pub start_quote_b: i64,
    pub start_base_b: i64,
    pub fill_count_b: u16,
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

    /// Fold a filled quantity into the position, in either direction.
    ///
    /// `signed_base` is what the fill adds to `base_qty`: positive for a buy,
    /// negative for a sell. This is one function rather than two arms because
    /// a sell that crosses zero is a close *and* an open, and so is a buy —
    /// writing that twice is how the two directions drift apart.
    ///
    /// Anything that reduces the existing position realises PnL against
    /// `avg_px`; anything beyond that opens the other way at the execution
    /// price. A short's PnL is the mirror of a long's, which falls out of the
    /// signed arithmetic rather than needing its own case.
    pub fn apply_signed(&mut self, signed_base: i128, exec_px: u64, quote_delta: i128) {
        let old = self.base_qty as i128;
        let new = old + signed_base;

        // How much of this fill closes what was already open.
        let closing = if old == 0 || (old > 0) == (signed_base > 0) {
            0
        } else if signed_base.abs() >= old.abs() {
            old.abs()
        } else {
            signed_base.abs()
        };

        if closing > 0 {
            // Long: gain when exec is above the average paid. Short: the
            // reverse. `old.signum()` carries that without a branch.
            let per_unit = (exec_px as i128) - (self.avg_px as i128);
            self.realized += ((closing * per_unit * old.signum()) / VALUE_DIV) as i64;
        }

        self.avg_px = if new == 0 {
            0
        } else if closing == 0 {
            // Opening, or adding to the side already held. A volume-weighted
            // average covers both: from flat the previous notional is zero, so
            // this collapses to the execution price.
            //
            // Keyed on `closing`, not on the signs of `old` and `new` — the
            // sign test read false when `old` was zero, which is every first
            // fill of a round, and left `avg_px` at zero so the position
            // recorded no entry price at all.
            let prev = old.abs() * (self.avg_px as i128);
            let add = signed_base.abs() * (exec_px as i128);
            (((prev + add) / new.abs()).max(0)) as u64
        } else if signed_base.abs() > closing {
            // Crossed through zero: what is open now was opened at this price.
            exec_px
        } else {
            // Reduced, but not through zero. What remains was bought at the
            // same average it always was.
            self.avg_px
        };

        self.base_qty = new as i64;
        self.quote_balance += quote_delta as i64;
    }

    /// Out of money at this mark.
    ///
    /// Equity is `quote + base * mark`, which is already signed, so it reads a
    /// short correctly: selling base raises quote and drives base negative, and
    /// a mark moving up then eats the difference. At or below zero the player
    /// has nothing left to lose with, and the round is over for them.
    pub fn is_underwater(&self, mark_px: u64) -> bool {
        self.equity(mark_px) <= 0
    }

    /// The largest base position, either direction, this equity can carry.
    ///
    /// One times collateral. The user asked for realistic shorts, and the
    /// realistic part is that you can be wiped out — not that you can lose more
    /// than you brought. Capping notional at equity means a short is fully
    /// liquidated by roughly a doubling of the mark, and a duel can never owe
    /// out more than the pot escrowed for it.
    pub fn max_base_at(&self, mark_px: u64) -> i128 {
        if mark_px == 0 {
            return 0;
        }
        let eq = self.equity(mark_px);
        if eq <= 0 {
            return 0;
        }
        eq * VALUE_DIV / (mark_px as i128)
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
            let evicted = self.fills.remove(0);
            self.fold_into_window(&evicted);
        }
        self.fills.push(fill);
        self.fill_count = self.fill_count.saturating_add(1);
    }

    /// Carry a fill that is leaving `fills` into the window snapshot.
    ///
    /// This is the tape replay's arithmetic (`replayEquity` in
    /// src/chain/tape.ts), not `apply_signed`'s: the snapshot exists so that a
    /// replay of the stored fills picks up exactly where these left off. A
    /// settle is always a round's last fill and is never evicted; it is folded
    /// the way the replay reads one anyway.
    fn fold_into_window(&mut self, f: &Fill) {
        let value = ((f.qty as i128) * (f.px as i128) / VALUE_DIV) as i64;
        let qty = f.qty as i64;
        match f.side {
            Side::Buy => {
                self.window_quote -= value;
                self.window_base += qty;
            }
            Side::Sell => {
                self.window_quote += value;
                self.window_base -= qty;
            }
            Side::Settle => {
                if self.window_base > 0 {
                    self.window_quote += value;
                    self.window_base -= qty;
                } else {
                    self.window_quote -= value;
                    self.window_base += qty;
                }
            }
            Side::Liquidation => {
                self.window_quote = 0;
                self.window_base = 0;
            }
        }
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
