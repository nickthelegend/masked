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
    #[msg("This match was opened too long ago — its price is stale. Ask the creator to reopen it.")]
    MatchStale,
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
    #[msg("This market draw has already been settled")]
    DrawAlreadySettled,
    #[msg("This market draw has not been settled yet")]
    DrawNotSettled,
    #[msg("This market draw has already opened a match")]
    DrawAlreadyUsed,
    #[msg("Not the wallet that opened this draw")]
    NotTheDrawOpener,
    #[msg("Only a major market takes an oracle price")]
    NotAMajor,
    #[msg("The program has no Pyth feed for this mint")]
    NoOracleForMint,
    #[msg("Not a Pyth price update owned by the receiver program")]
    OracleAccountInvalid,
    #[msg("Pyth price update is not fully verified")]
    OracleNotFullyVerified,
    #[msg("Pyth price update is for a different feed")]
    OracleWrongFeed,
    #[msg("Pyth price update is too old, or dated in the future")]
    OracleStale,
    #[msg("Pyth confidence interval is too wide")]
    OracleConfidence,
    #[msg("Pyth price update is not newer than the mark it would replace")]
    OracleUpdateNotNewer,
    #[msg("This feed takes its price from Pyth for the rest of the round")]
    OracleOwnsFeed,
    #[msg("Not a Switchboard SOL/USD pull feed on the expected queue")]
    SecondOracleInvalid,
    #[msg("Switchboard feed runs different jobs from the pinned SOL/USD feed")]
    SecondOracleWrongFeed,
    #[msg("Switchboard result is too old")]
    SecondOracleStale,
    #[msg("Pyth and Switchboard disagree on SOL/USD")]
    OraclesDisagree,
}
