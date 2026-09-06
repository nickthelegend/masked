use anchor_lang::prelude::*;

/// Price fixed-point scale. All prices are integers scaled by 1e6.
pub const PRICE_SCALE: i128 = 1_000_000;
/// Base-quantity fixed-point scale. `base_qty` is scaled by 1e6.
pub const BASE_SCALE: i128 = 1_000_000;
/// Protocol rake in basis points, taken from the pot at settlement.
/// Mirrors the "2% RAKE" the UI has always displayed.
pub const RAKE_BPS: u64 = 200;
pub const BPS_DENOM: u64 = 10_000;
/// Fills retained on-chain per player. Bounded so the account cannot grow
/// without limit; the UI only ever renders the most recent handful.
pub const MAX_FILLS: usize = 16;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MatchStatus {
    Open,
    Live,
    Settling,
    Settled,
    Cancelled,
}

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
    /// Execution price, scaled by PRICE_SCALE.
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
    pub bump: u8,
}

/// Per-player trading state. Delegated to an ER and made private via the
/// permission program while the match is Live — this is the account whose
/// unreadability is the entire product.
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub owner: Pubkey,
    pub match_key: Pubkey,
    /// Virtual quote currency, seeded from the entry. Scaled by PRICE_SCALE.
    pub quote_balance: i64,
    /// Net base held, scaled by BASE_SCALE. Signed: long only for the MVP,
    /// but the type allows shorts without a migration.
    pub base_qty: i64,
    /// Volume-weighted average entry price, scaled by PRICE_SCALE.
    pub avg_px: u64,
    /// Realized PnL in quote units, scaled by PRICE_SCALE.
    pub realized: i64,
    pub last_px: u64,
    pub fill_count: u16,
    #[max_len(MAX_FILLS)]
    pub fills: Vec<Fill>,
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
    /// Mark-to-market equity in quote units, scaled by PRICE_SCALE.
    pub fn equity(&self, mark_px: u64) -> i128 {
        let base_value = (self.base_qty as i128) * (mark_px as i128) / BASE_SCALE;
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
