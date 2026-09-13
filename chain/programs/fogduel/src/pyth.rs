//! Pyth price updates, read straight from the account bytes.
//!
//! `push_price` is a rate-limited stand-in for an oracle. For a major Pyth
//! publishes, the real thing is on chain: a `PriceUpdateV2` account owned by
//! Pyth's receiver program, which only writes updates whose publisher
//! signatures it has verified. Pyth sponsors one such account per popular feed
//! on devnet and mainnet (SOL/USD is `7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE`)
//! and keeps it current.
//!
//! This reads the layout directly instead of pulling in
//! `pyth-solana-receiver-sdk`, whose Solana and Anchor pins would have to agree
//! with the MagicBlock SDK's. The layout is small and fixed:
//!
//! ```text
//! 0    8   discriminator            sha256("account:PriceUpdateV2")[..8]
//! 8    32  write_authority
//! 40   1+  verification_level       0 = Partial { num_signatures: u8 }, 1 = Full
//! ..   32  feed_id
//! ..   8   price                    i64, x 10^exponent USD
//! ..   8   conf                     u64, same scale
//! ..   4   exponent                 i32
//! ..   8   publish_time             i64, unix seconds
//! ```
//!
//! Every field this uses is checked: the owner, the discriminator, Full
//! verification, the feed id the program expects for that mint, a positive
//! price, freshness, and a confidence band.

use anchor_lang::prelude::*;

use crate::errors::FogError;
use crate::state::{BPS_DENOM, PRICE_SCALE};

/// Pyth's Solana receiver program. Only it can write a `PriceUpdateV2`.
pub const PYTH_RECEIVER_ID: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");

pub const PRICE_UPDATE_V2_DISCRIMINATOR: [u8; 8] = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];

/// Oldest update accepted, in seconds.
///
/// Set from the feeds, not a guess: sampled every 5 s for four minutes on
/// 2026-09-13, Pyth's sponsored SOL/USD, BTC/USD and JUP/USD accounts on devnet
/// all updated together, 316 s apart. A limit under that refuses a sponsored
/// account for part of every cycle; 360 s covers one full cycle plus slack.
/// A caller wanting a fresher mark can post its own update through the
/// receiver, which this accepts the same way.
pub const MAX_PYTH_AGE: i64 = 360;
/// A publish time this far past the cluster clock is still accepted: validator
/// clocks trail wall time by a few seconds.
pub const MAX_CLOCK_SKEW: i64 = 30;
/// Widest confidence interval accepted, as a fraction of the price.
pub const MAX_CONF_BPS: u64 = 200;

const fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        _ => panic!("feed id must be lowercase hex"),
    }
}

const fn feed_id(hex: &str) -> [u8; 32] {
    let b = hex.as_bytes();
    assert!(b.len() == 64, "feed id must be 64 hex characters");
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (nibble(b[2 * i]) << 4) | nibble(b[2 * i + 1]);
        i += 1;
    }
    out
}

/// Pyth's SOL/USD feed. Every major is priced against it, because a mark here
/// is lamports per token.
pub const SOL_USD_FEED: [u8; 32] = feed_id("ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d");
pub const USDC_USD_FEED: [u8; 32] = feed_id("eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a");

/// Which Pyth feed prices which mint. The majors the app offers
/// (`src/chain/jupiter.ts` MAJORS). Fixed here, so a caller cannot hand in
/// another token's update for this one.
pub const MAJOR_FEEDS: [(Pubkey, [u8; 32]); 2] = [
    (pubkey!("So11111111111111111111111111111111111111112"), SOL_USD_FEED),
    (pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), USDC_USD_FEED),
];

pub fn feed_for_mint(mint: &Pubkey) -> Option<[u8; 32]> {
    MAJOR_FEEDS.iter().find(|(m, _)| m == mint).map(|(_, f)| *f)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PythPrice {
    pub price: i64,
    pub conf: u64,
    pub exponent: i32,
    pub publish_time: i64,
}

/// Decode a `PriceUpdateV2` for `expected_feed`. Layout and verification only;
/// `read_checked` adds the owner, freshness and confidence.
pub fn parse_price_update(data: &[u8], expected_feed: &[u8; 32]) -> Result<PythPrice> {
    require!(data.len() >= 8 + 32 + 1, FogError::OracleAccountInvalid);
    require!(data[..8] == PRICE_UPDATE_V2_DISCRIMINATOR, FogError::OracleAccountInvalid);
    // A Partial update carries a signature count after its tag; only Full
    // updates, verified against the whole guardian quorum, are used.
    require!(data[40] == 1, FogError::OracleNotFullyVerified);
    let o = 41;
    require!(data.len() >= o + 32 + 8 + 8 + 4 + 8, FogError::OracleAccountInvalid);
    require!(&data[o..o + 32] == expected_feed, FogError::OracleWrongFeed);
    let i64_at = |at: usize| i64::from_le_bytes(data[at..at + 8].try_into().unwrap());
    Ok(PythPrice {
        price: i64_at(o + 32),
        conf: u64::from_le_bytes(data[o + 40..o + 48].try_into().unwrap()),
        exponent: i32::from_le_bytes(data[o + 48..o + 52].try_into().unwrap()),
        publish_time: i64_at(o + 52),
    })
}

/// The checks a price has to pass before it may become a mark.
pub fn check_price(p: &PythPrice, now: i64) -> Result<()> {
    require!(p.price > 0, FogError::InvalidPrice);
    require!(
        p.publish_time <= now + MAX_CLOCK_SKEW && now - p.publish_time <= MAX_PYTH_AGE,
        FogError::OracleStale
    );
    require!(
        (p.conf as u128) * (BPS_DENOM as u128) <= (p.price as u128) * (MAX_CONF_BPS as u128),
        FogError::OracleConfidence
    );
    Ok(())
}

/// A fully checked price from an account the receiver owns.
pub fn read_checked(account: &AccountInfo, expected_feed: &[u8; 32], now: i64) -> Result<PythPrice> {
    require_keys_eq!(*account.owner, PYTH_RECEIVER_ID, FogError::OracleAccountInvalid);
    let data = account.try_borrow_data()?;
    let p = parse_price_update(&data, expected_feed)?;
    check_price(&p, now)?;
    Ok(p)
}

/// `lamports per whole token x PRICE_SCALE`, the program's mark unit, from a
/// token/USD and a SOL/USD price.
///
/// token/SOL = (pt x 10^et) / (ps x 10^es), and a mark is that times
/// LAMPORTS_PER_SOL (10^9) times PRICE_SCALE (10^6): pt x 10^(15 + et - es) / ps.
pub fn px_from_usd_pair(token: &PythPrice, sol: &PythPrice) -> Result<u64> {
    const _: () = assert!(PRICE_SCALE == 1_000_000);
    require!(token.price > 0 && sol.price > 0, FogError::InvalidPrice);
    let shift = 15i64 + token.exponent as i64 - sol.exponent as i64;
    require!((-30..=30).contains(&shift), FogError::InvalidPrice);
    let pow = 10u128.pow(shift.unsigned_abs() as u32);
    let (num, den) = if shift >= 0 {
        ((token.price as u128).checked_mul(pow).ok_or(FogError::InvalidPrice)?, sol.price as u128)
    } else {
        (token.price as u128, (sol.price as u128).checked_mul(pow).ok_or(FogError::InvalidPrice)?)
    };
    let px = num / den;
    require!(px > 0 && px <= u64::MAX as u128, FogError::InvalidPrice);
    Ok(px as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn update(level: u8, feed: [u8; 32], price: i64, conf: u64, exponent: i32, publish_time: i64) -> Vec<u8> {
        let mut d = PRICE_UPDATE_V2_DISCRIMINATOR.to_vec();
        d.extend_from_slice(&[7u8; 32]);
        d.push(level);
        d.extend_from_slice(&feed);
        d.extend_from_slice(&price.to_le_bytes());
        d.extend_from_slice(&conf.to_le_bytes());
        d.extend_from_slice(&exponent.to_le_bytes());
        d.extend_from_slice(&publish_time.to_le_bytes());
        d.extend_from_slice(&[0u8; 8 + 8 + 8 + 8 + 1]);
        d
    }

    #[test]
    fn feed_ids_decode() {
        assert_eq!(&SOL_USD_FEED[..4], &[0xef, 0x0d, 0x8b, 0x6f]);
        assert_eq!(&USDC_USD_FEED[30..], &[0xc9, 0x4a]);
    }

    #[test]
    fn parses_a_full_update() {
        let d = update(1, SOL_USD_FEED, 10_165_610_520, 5_000_000, -8, 1_789_270_000);
        let p = parse_price_update(&d, &SOL_USD_FEED).unwrap();
        assert_eq!(p, PythPrice { price: 10_165_610_520, conf: 5_000_000, exponent: -8, publish_time: 1_789_270_000 });
    }

    #[test]
    fn refuses_partial_wrong_feed_and_wrong_discriminator() {
        assert!(parse_price_update(&update(0, SOL_USD_FEED, 1, 0, -8, 0), &SOL_USD_FEED).is_err());
        assert!(parse_price_update(&update(1, USDC_USD_FEED, 1, 0, -8, 0), &SOL_USD_FEED).is_err());
        let mut d = update(1, SOL_USD_FEED, 1, 0, -8, 0);
        d[0] ^= 1;
        assert!(parse_price_update(&d, &SOL_USD_FEED).is_err());
    }

    #[test]
    fn stale_future_and_wide_prices_are_refused() {
        let now = 1_000_000;
        let ok = PythPrice { price: 100_000_000, conf: 100_000, exponent: -8, publish_time: now - 10 };
        assert!(check_price(&ok, now).is_ok());
        assert!(check_price(&PythPrice { publish_time: now - MAX_PYTH_AGE - 1, ..ok }, now).is_err());
        assert!(check_price(&PythPrice { publish_time: now + MAX_CLOCK_SKEW + 1, ..ok }, now).is_err());
        assert!(check_price(&PythPrice { conf: 2_000_001, ..ok }, now).is_err());
        assert!(check_price(&PythPrice { price: 0, ..ok }, now).is_err());
    }

    #[test]
    fn marks_come_out_in_lamports_per_token_scaled() {
        let sol = PythPrice { price: 10_165_610_520, conf: 0, exponent: -8, publish_time: 0 };
        // SOL against itself is exactly one SOL a token.
        assert_eq!(px_from_usd_pair(&sol, &sol).unwrap(), 1_000_000_000 * 1_000_000);
        // USDC at $0.99985306 against SOL at $101.6561052: 0.0098356… SOL a token.
        let usdc = PythPrice { price: 99_985_306, conf: 0, exponent: -8, publish_time: 0 };
        assert_eq!(px_from_usd_pair(&usdc, &sol).unwrap(), (99_985_306u128 * 1_000_000_000_000_000 / 10_165_610_520) as u64);
        // Different exponents are reconciled, not assumed equal.
        let usdc_e6 = PythPrice { price: 999_853, conf: 0, exponent: -6, publish_time: 0 };
        let a = px_from_usd_pair(&usdc_e6, &sol).unwrap();
        let b = px_from_usd_pair(&PythPrice { price: 99_985_300, ..usdc }, &sol).unwrap();
        assert_eq!(a, b);
    }
}
