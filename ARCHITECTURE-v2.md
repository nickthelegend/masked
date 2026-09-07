# v2 — any token, both sides, five minutes

Agreed in interview on 2026-09-07. Every decision below is the user's, and the
reasoning that produced it is kept so a later reader can tell a choice from an
accident.

## The shape of the change

Today a duel is *one token, long only, sixty seconds*. It becomes *two tokens —
one per player — long and short, five minutes*.

| | v1 | v2 |
|---|---|---|
| Market | one mint per match, both players | **one mint per player** |
| Direction | long only | **long and short** |
| Losing | capped at the entry | **liquidated at zero equity** |
| Round | 60s (demo default) | **300s**, `EXPO_PUBLIC_ROUND_SECONDS` still overrides |
| Universe | 12 pump.fun + SOL/USDC | **searchable: any priced Jupiter token + pump.fun trending** |
| Price ceiling | ~9 SOL/token (JS safe integer) | **u64, via BigInt** — WBTC at $79k works |
| Matchmaking | only matches on your market | **any open match; you pick your token on join** |

## Decisions, and why

1. **Trade engine stays the private book, priced by real feeds.** A real swap is
   a public on-chain print — routing fills through Jupiter would publish both
   players' positions mid-round and there would be no fog left to prove. Prices
   are real; execution is private. This is the whole thesis.

2. **One token per player, PnL compared.** "anyone can pick any token and trade
   on it — compare the end pnl."

3. **Shorts are real margin.** `base_qty` is already `i64` and the account
   comment already anticipated this. SELL can open negative base, BUY closes it.
   Equity is `quote_balance + base_qty * mark`, which works signed.

4. **Liquidation at zero equity, and it is public.** The user chose to announce
   it, having been shown that it leaks the most valuable fact in the game. So
   the privacy claim narrows honestly: *positions are sealed; a liquidation is
   the one public event*. `check:fog` and `/proof` must say exactly that rather
   than keep claiming total opacity.

5. **Feed dies mid-round → the last mark stands.** The mark only moves when a
   crank posts one, so a dead feed is a flat mark, not a broken round. Voiding
   would hand players a grief vector: open a duel on a dead token to force a
   refund.

6. **Fresh deploy, re-seed.** Per-player mints and per-player feeds change the
   account layouts, so the 174 existing tapes stop decoding. They are all test
   data; `npm run seed` rebuilds real history in the new format.

## Where liquidation has to live, and why it is not obvious

`PushPrice` writes `[b"feed", match]` **on L1**. `ApplyFill` runs **on the
rollup** and only *reads* the feed from the rollup's cloned copy. So:

- L1 has the price but cannot see a delegated position's equity.
- The rollup has the position but its writes need delegation.

Therefore liquidation is decided on the rollup, by a permissionless
`liquidate(owner)` instruction: read the position and the cloned feed, compute
equity, and if it is `<= 0`, force-close the whole position at the mark and
record it.

Announcing it needs an account the opponent may actually read, and every
position is sealed by an ACL. So a new **`RoundStatus`** account per match:

```rust
#[account]
pub struct RoundStatus {
    pub match_key: Pubkey,
    pub liquidated_a: bool,
    pub liquidated_b: bool,
    pub bump: u8,
}
```

seeded `[b"status", match]`, delegated to the rollup so it can be written, and
deliberately given **no permission account** — so it is served to everyone,
exactly like the "bare" control account `check:gate` already probes to prove
the gate discriminates rather than simply refusing everything.

## Price cadence

5s heartbeat per feed, plus a forced crank immediately before any fill, so the
number that decides your execution is always fresh. Two feeds over 300s is
~120 L1 pushes per duel instead of ~300 at the old 2s.

The rollup also carries the liquidation check: `liquidate(owner)` for both
sides on the same 5s beat, which is cheap because it is a rollup transaction.

## Prices above the safe integer

`px = priceSol * 1e9 * 1e6`. `Number.isSafeInteger` caps that at 9.007e15,
i.e. **~9 SOL/token (~$945)** — so WBTC at $79,350 is silently dropped today.
`px` is `u64` on chain (to ~1.8e19, about $1.9M/token) and Anchor takes a `BN`
from a string, so the fix is entirely JS-side: carry px as `bigint`, hand
Anchor a string. No program change, no redeploy needed for this part.

## Token search

`GET /jup/tokens/v2/search?query=` returns, in one call: `id` (mint), `name`,
`symbol`, `icon`, `decimals`, `usdPrice`, `liquidity`, `isVerified`, `mcap`.
That is the whole picker — including the logos majors never had, because
`MAJORS` hardcoded `imageUri: null`.

Ranking: verified first, then liquidity. Any mint address can be pasted, with a
visible warning when it is unverified or thin. The `WBTC` search already
returns a real one at $79,350 and a fake at $0.0000029, which is exactly why
the filter is not optional.

Token decimals need no handling: the book is virtual, `base_qty` is scaled by a
fixed `BASE_SCALE` in *whole tokens*, and `px` is lamports per whole token.
