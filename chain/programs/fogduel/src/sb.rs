//! Switchboard On-Demand, as a second opinion on SOL/USD.
//!
//! Every mark `push_price_pyth` writes is divided by Pyth's SOL/USD. One
//! oracle, however well signed, is still one source; so the same instruction
//! requires a Switchboard pull feed for SOL/USD, updated by Switchboard's
//! oracle queue within the last `MAX_SB_AGE` seconds, to agree with Pyth's
//! SOL/USD to within `MAX_ORACLE_DIVERGENCE_BPS`. Neither oracle can move a mark
//! the other disputes.
//!
//! The feed's jobs are Coinbase and Kraken SOL/USD spot — sources independent
//! of Pyth's publishers — and the program pins them by the feed hash
//! Switchboard derives from the job definitions, together with the queue, so an
//! account with the right layout but other jobs or another queue is refused.
//!
//! Read from the bytes, like `pyth.rs`. The layout is Switchboard's bytemuck
//! `PullFeedAccountData`; every offset below was checked against a live devnet
//! feed (`9Casyq1esMPojvbYHYrSZe5XZZRaWHmXNkkfvYqjQuqP`) on 2026-09-13:
//!
//! ```text
//! 0     8   discriminator
//! 2088  32  queue
//! 2120  32  feed_hash
//! 2216  8   last_update_timestamp   i64, unix seconds
//! 2264  16  result.value            i128, USD x 1e18
//! 2360  1   result.num_samples
//! ```

use anchor_lang::prelude::*;

use crate::errors::FogError;
use crate::pyth::{PythPrice, MAX_CLOCK_SKEW};
use crate::state::BPS_DENOM;

pub const SB_ON_DEMAND_DEVNET: Pubkey = pubkey!("Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2");
/// The default oracle queue on devnet.
pub const SB_QUEUE_DEVNET: Pubkey = pubkey!("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");

pub const PULL_FEED_DISCRIMINATOR: [u8; 8] = [196, 27, 108, 196, 10, 215, 219, 40];

/// The feed hash of the SOL/USD jobs (Coinbase and Kraken spot) on the devnet
/// queue, as crossbar stores them. A mainnet deployment needs its own entry:
/// the hash is taken over the queue as well as the jobs.
pub const SOL_USD_FEED_HASH_DEVNET: [u8; 32] = hex32("db64bca135e3f56d3efda74bcfb82248dce244d78c1b28afc6605b11d53d9b3a");

/// Oldest Switchboard result accepted, in seconds. An on-demand feed is
/// updated by whoever needs it, so a caller refreshes it in the transaction
/// before this one.
pub const MAX_SB_AGE: i64 = 120;
/// Widest gap between Switchboard's and Pyth's SOL/USD that still counts as
/// agreement.
pub const MAX_ORACLE_DIVERGENCE_BPS: u64 = 100;

const QUEUE_AT: usize = 2088;
const FEED_HASH_AT: usize = 2120;
const LAST_UPDATE_AT: usize = 2216;
const VALUE_AT: usize = 2264;
const NUM_SAMPLES_AT: usize = 2360;
const MIN_LEN: usize = NUM_SAMPLES_AT + 1;

const fn nibble(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        _ => panic!("feed hash must be lowercase hex"),
    }
}

const fn hex32(hex: &str) -> [u8; 32] {
    let b = hex.as_bytes();
    assert!(b.len() == 64, "feed hash must be 64 hex characters");
    let mut out = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        out[i] = (nibble(b[2 * i]) << 4) | nibble(b[2 * i + 1]);
        i += 1;
    }
    out
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SbValue {
    /// USD x 1e18.
    pub usd_1e18: i128,
    pub updated_ts: i64,
    pub samples: u8,
}

/// Decode a SOL/USD pull feed on the devnet queue. Owner, layout, queue and
/// feed hash; freshness and agreement are `check_agreement`.
pub fn parse_pull_feed(owner: &Pubkey, data: &[u8]) -> Result<SbValue> {
    require_keys_eq!(*owner, SB_ON_DEMAND_DEVNET, FogError::SecondOracleInvalid);
    require!(data.len() >= MIN_LEN, FogError::SecondOracleInvalid);
    require!(data[..8] == PULL_FEED_DISCRIMINATOR, FogError::SecondOracleInvalid);
    require!(data[QUEUE_AT..QUEUE_AT + 32] == SB_QUEUE_DEVNET.to_bytes(), FogError::SecondOracleInvalid);
    require!(
        data[FEED_HASH_AT..FEED_HASH_AT + 32] == SOL_USD_FEED_HASH_DEVNET,
        FogError::SecondOracleWrongFeed
    );
    Ok(SbValue {
        usd_1e18: i128::from_le_bytes(data[VALUE_AT..VALUE_AT + 16].try_into().unwrap()),
        updated_ts: i64::from_le_bytes(data[LAST_UPDATE_AT..LAST_UPDATE_AT + 8].try_into().unwrap()),
        samples: data[NUM_SAMPLES_AT],
    })
}

/// Pyth's price at Switchboard's scale, USD x 1e18.
fn pyth_usd_1e18(p: &PythPrice) -> Result<i128> {
    let shift = 18 + p.exponent;
    require!((0..=36).contains(&shift), FogError::InvalidPrice);
    (p.price as i128).checked_mul(10i128.pow(shift as u32)).ok_or(FogError::InvalidPrice.into())
}

/// Fresh, sampled, and within `MAX_ORACLE_DIVERGENCE_BPS` of Pyth's SOL/USD.
pub fn check_agreement(sb: &SbValue, pyth_sol: &PythPrice, now: i64) -> Result<()> {
    require!(sb.samples >= 1 && sb.usd_1e18 > 0, FogError::SecondOracleInvalid);
    require!(
        sb.updated_ts <= now + MAX_CLOCK_SKEW && now - sb.updated_ts <= MAX_SB_AGE,
        FogError::SecondOracleStale
    );
    let pyth = pyth_usd_1e18(pyth_sol)?;
    let diff = (sb.usd_1e18 - pyth).unsigned_abs();
    require!(
        diff.checked_mul(BPS_DENOM as u128).ok_or(FogError::InvalidPrice)?
            <= (pyth as u128).checked_mul(MAX_ORACLE_DIVERGENCE_BPS as u128).ok_or(FogError::InvalidPrice)?,
        FogError::OraclesDisagree
    );
    Ok(())
}

/// A checked Switchboard SOL/USD that agrees with Pyth's.
pub fn read_checked(account: &AccountInfo, pyth_sol: &PythPrice, now: i64) -> Result<SbValue> {
    let data = account.try_borrow_data()?;
    let v = parse_pull_feed(account.owner, &data)?;
    check_agreement(&v, pyth_sol, now)?;
    Ok(v)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feed(value: i128, ts: i64, samples: u8) -> Vec<u8> {
        let mut d = vec![0u8; 3208];
        d[..8].copy_from_slice(&PULL_FEED_DISCRIMINATOR);
        d[QUEUE_AT..QUEUE_AT + 32].copy_from_slice(&SB_QUEUE_DEVNET.to_bytes());
        d[FEED_HASH_AT..FEED_HASH_AT + 32].copy_from_slice(&SOL_USD_FEED_HASH_DEVNET);
        d[LAST_UPDATE_AT..LAST_UPDATE_AT + 8].copy_from_slice(&ts.to_le_bytes());
        d[VALUE_AT..VALUE_AT + 16].copy_from_slice(&value.to_le_bytes());
        d[NUM_SAMPLES_AT] = samples;
        d
    }

    const NOW: i64 = 1_789_276_600;
    // Pyth's SOL/USD at $101.8202468; Switchboard at $101.81, 1 bps apart.
    const PYTH_SOL: PythPrice = PythPrice { price: 10_182_024_680, conf: 0, exponent: -8, publish_time: NOW };
    const SB_SOL: i128 = 101_810_000_000_000_000_000;

    #[test]
    fn parses_the_live_layout() {
        let v = parse_pull_feed(&SB_ON_DEMAND_DEVNET, &feed(SB_SOL, NOW - 37, 1)).unwrap();
        assert_eq!(v, SbValue { usd_1e18: SB_SOL, updated_ts: NOW - 37, samples: 1 });
        assert!(check_agreement(&v, &PYTH_SOL, NOW).is_ok());
    }

    #[test]
    fn refuses_other_owners_queues_and_jobs() {
        assert!(parse_pull_feed(&Pubkey::new_unique(), &feed(SB_SOL, NOW, 1)).is_err());
        let mut other_queue = feed(SB_SOL, NOW, 1);
        other_queue[QUEUE_AT] ^= 1;
        assert!(parse_pull_feed(&SB_ON_DEMAND_DEVNET, &other_queue).is_err());
        let mut other_jobs = feed(SB_SOL, NOW, 1);
        other_jobs[FEED_HASH_AT] ^= 1;
        assert!(parse_pull_feed(&SB_ON_DEMAND_DEVNET, &other_jobs).is_err());
        assert!(parse_pull_feed(&SB_ON_DEMAND_DEVNET, &feed(SB_SOL, NOW, 1)[..2000]).is_err());
    }

    #[test]
    fn refuses_stale_unsampled_and_disagreeing_results() {
        let ok = |d: Vec<u8>| check_agreement(&parse_pull_feed(&SB_ON_DEMAND_DEVNET, &d).unwrap(), &PYTH_SOL, NOW);
        assert!(ok(feed(SB_SOL, NOW - MAX_SB_AGE - 1, 1)).is_err());
        assert!(ok(feed(SB_SOL, NOW, 0)).is_err());
        // $103.00 is 116 bps above Pyth's $101.82: refused. $102.80 is 96 bps: accepted.
        assert!(ok(feed(103_000_000_000_000_000_000, NOW, 1)).is_err());
        assert!(ok(feed(102_800_000_000_000_000_000, NOW, 1)).is_ok());
    }
}
