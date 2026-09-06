use anchor_lang::prelude::*;

#[error_code]
pub enum FogError {
    #[msg("Match is not open for joining")]
    MatchNotOpen,
    #[msg("Match is not live")]
    MatchNotLive,
    #[msg("Match is not settling")]
    MatchNotSettling,
    #[msg("Cannot join your own match")]
    SelfJoin,
    #[msg("Match has not reached its end time")]
    MatchStillRunning,
    #[msg("Match clock has already expired")]
    MatchExpired,
    #[msg("Not a participant in this match")]
    NotAParticipant,
    #[msg("Insufficient quote balance for this fill")]
    InsufficientQuote,
    #[msg("Insufficient base quantity for this fill")]
    InsufficientBase,
    #[msg("Fill quantity must be greater than zero")]
    ZeroQuantity,
    #[msg("Price feed is not initialized or is stale")]
    InvalidPrice,
    #[msg("Duration out of allowed range")]
    InvalidDuration,
    #[msg("Entry amount must be greater than zero")]
    InvalidEntry,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Vault has insufficient lamports")]
    VaultUnderfunded,
    #[msg("Price posted too soon after the last one")]
    PriceTooSoon,
    #[msg("Price moved further in one push than the rate limit allows")]
    PriceJump,
}
