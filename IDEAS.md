# 100 ideas, ranked

For **MagicBlock Solana Blitz v8**. The pitch is: *private during the fight,
public after* — two traders stake a pot, trade the same market with their
positions delegated to an Ephemeral Rollup and sealed by an on-chain ACL, and
settle on Solana at the buzzer.

Ranked by **impact × feasibility × fit**. Impact is "would a judge notice";
feasibility is "can this be built for real, here, now"; fit is "does it
strengthen *this* pitch or just add surface". Ideas already built are excluded.

The biggest single gap when this list was written: the submission form said
**VRF — not attempted**, while the local stack preloads the VRF program
(`Vrf1RNUj…`) and ships a `vrf-oracle` binary. That is a whole MagicBlock
primitive sitting unused, and it is the first thing on this list.

**Update:** #1 is now half-done and honestly labelled. `request_market_draw`
builds a real request with the official SDK and the VRF program accepts it on
chain (`npm run check:vrf`), but no oracle answers — the preloaded queues were
dumped from devnet and name identities we do not hold keys for. The submission
now says "requested on chain, never fulfilled" rather than "not attempted".
#5 (BLIND DRAFT) stays blocked behind that, and stays a `SOON` tile rather than
being faked.

---

## Tier 1 — build first

| # | Idea | Why it ranks here |
|---|---|---|
| 1 | **VRF-drawn market**: the round's market is picked on chain by MagicBlock VRF from a shortlist, so neither player chooses it | Third MagicBlock primitive, turns "not attempted" into "used". Verifiable on chain. |
| 2 | **Session keys** so fills don't prompt the wallet every time | The single biggest UX flaw on camera: every LONG is a signature. Uses another MagicBlock program. |
| 3 | **Spectator mode** — watch a live duel from public data only, opponent fogged for the viewer too | Lets a judge see the product without a wallet. Proves the fog from outside. |
| 4 | **Rematch that works** — the button exists and does nothing real | A dead button in a demo is worse than no button. |
| 5 | **BLIND DRAFT as a second live mode** — VRF picks 3 markets, each player privately picks one | Makes the mode grid honest, and is the natural showcase for #1. |
| 6 | **Live duel list on `/proof`** with a link into spectating each | Turns the evidence page into something interactive. |
| 7 | **Round timeline on the reveal** — every fill of both players on one shared time axis | The "reveal" is the emotional beat and currently it is two numbers. |
| 8 | **Fill flash + impact readout** — pressing LONG shows what the book actually charged you | Makes the private AMM legible instead of invisible. |
| 9 | **Settlement progress** — commit, undelegate, settle shown as real stages with real signatures | Turns 20 seconds of dead air into the most MagicBlock-looking moment in the app. |
| 10 | **Sound**: buzzer, fill, reveal | Nothing else in the room will have it. Cheap, memorable. |

## Tier 2 — strong, build after

| # | Idea | Note |
|---|---|---|
| 11 | Shareable reveal card at a permanent URL (`/tape/<match>`) | Judges can be sent a link. |
| 12 | Head-to-head record between two wallets, on chain | Rivalry is the loop. |
| 13 | `/proof` shows the actual delegation transaction signatures, clickable | Evidence, not assertion. |
| 14 | Mark sparkline on every market row in the picker | Makes the picker feel alive. |
| 15 | "What you would have made" — counterfactual PnL if you had done nothing | A real trading insight, cheap to compute from the tape. |
| 16 | Opponent's fill *count* animating live as a heartbeat | The one thing the fog does leak, made into drama. |
| 17 | Keyboard controls (L to long, C to close, space to settle) | Demo speed. |
| 18 | Round-over-round streak visual on the leaderboard | Uses `best_streak`, already on chain. |
| 19 | Auto-settle any expired match the app notices, not just your own | Turns the crank into a product behaviour. |
| 20 | Market search / filter in the picker | 12 rows now; a real list needs it. |
| 21 | Per-market all-time stats (duels, volume, biggest pot) | Real aggregate over tapes. |
| 22 | `/proof` "run this yourself" — the exact commands, copyable | Judges verify in five commands. |
| 23 | Position-size control (quarter / half / max) rather than a fixed fraction | Makes the book matter. |
| 24 | Slippage preview before a fill lands | Shows the curve is real. |
| 25 | Live mark ticking with a direction flash green/red | Cheap motion, high legibility. |
| 26 | Reveal curtain that tears rather than fades | Signature moment. |
| 27 | Match invite links — open a match and send someone the URL | Makes 1v1 actually playable with a judge. |
| 28 | Wallet balance change animation on settle | Money moving is the point. |
| 29 | Explorer links on every signature in the tx feed | Standard, missing. |
| 30 | Honest "what this costs" panel — real fees paid per round | Nobody else will show this. |

## Tier 3 — good, opportunistic

| # | Idea |
|---|---|
| 31 | Persisted per-wallet settings (last market, last stake) |
| 32 | Reduced-motion support honoured across new animations |
| 33 | Round history for the connected wallet, paginated |
| 34 | Copy-trade button that opens a match on the same market |
| 35 | "Fade winner" that actually opens a match against them |
| 36 | Toast stacking with a queue rather than overlap |
| 37 | Idle-state attract mode on the landing hero |
| 38 | Market cap / volume sort toggle in the picker |
| 39 | Loading skeletons that match final layout, not spinners |
| 40 | Error boundary per screen rather than one global |
| 41 | Offline detection and a real banner |
| 42 | Retry-with-backoff on every chain read |
| 43 | A `/stats` route: protocol-wide numbers from chain |
| 44 | Treasury balance and rake taken, shown honestly |
| 45 | Position PnL sparkline during the round, not just price |
| 46 | Confetti/pixel-burst on a win, restrained |
| 47 | Chart crosshair with the mark at that moment |
| 48 | Tape row expands to show every fill |
| 49 | Relative time that updates without a reload |
| 50 | Deep-link straight into a market: `/play?market=<mint>` |
| 51 | Wallet disconnect confirmation when mid-round |
| 52 | Warn before navigating away from a live round |
| 53 | Sound toggle, persisted |
| 54 | Colour-blind-safe win/loss palette option |
| 55 | Focus rings and full keyboard navigation |
| 56 | `aria-live` on the clock and PnL |
| 57 | Match duration choice (60s / 5m) at open time |
| 58 | Stake presets driven by wallet balance |
| 59 | "Insufficient balance" that offers the max affordable stake |
| 60 | Show the rake explicitly in the pot pill |

## Tier 4 — real but lower priority

| # | Idea |
|---|---|
| 61 | 2v2 Squad Fog (team ACL, pot 200, split 50/50) |
| 62 | Chicken mode (first seller pays a penalty) |
| 63 | Hot Potato mode (empty-handed at buzzer loses) |
| 64 | Sudden Reveal mode (fog for 4m, public for 60s) |
| 65 | Copy Ban mode (see that they traded, not what) |
| 66 | Ghost Royale (multi-player, bottom cut) |
| 67 | Thesis Fight (commit a hashed thesis, reveal with the tape) |
| 68 | Assassination (beat a marked wallet) |
| 69 | Hold the Line (early exit pays the table) |
| 70 | Fade Me (opponent must take the opposite side) |
| 71 | Tournament bracket over several rounds |
| 72 | ELO-style rating from on-chain results |
| 73 | Daily leaderboard reset with a real window |
| 74 | Achievements as on-chain flags |
| 75 | Referral attribution on chain |
| 76 | Pyth integration for majors settlement |
| 77 | Switchboard as a second oracle |
| 78 | Jupiter quote shown beside the private book's price |
| 79 | Token metadata from Metaplex for logos |
| 80 | Priority-fee awareness on congested clusters |
| 81 | Address lookup tables to shrink transactions |
| 82 | Compressed accounts for tapes |
| 83 | Websocket subscriptions instead of polling |
| 84 | Optimistic UI on fills with rollback |
| 85 | Multi-region rollup selection (us/eu/as validators) |
| 86 | Mobile-native build via Expo |
| 87 | Mobile Wallet Adapter for native |
| 88 | PWA install + offline shell |
| 89 | Screenshot/GIF export of a reveal |
| 90 | OG image generation per tape |
| 91 | Twitter intent with the reveal card |
| 92 | Embeddable duel widget |
| 93 | Public API for tapes |
| 94 | Webhook on settlement |
| 95 | Discord bot posting reveals |
| 96 | i18n scaffolding |
| 97 | Analytics that respect privacy |
| 98 | Load test / soak script for the rollup |
| 99 | Fuzz tests on the book maths |
| 100 | Formal invariant tests (pot conservation, rake exactness) |

---

## Deliberately not doing

- **Anything that fakes a MagicBlock primitive.** If VRF cannot be made to work
  for real, it stays "not attempted" rather than being simulated.
- **Devnet deploy / demo video.** Blocked on faucet funding, which no amount of
  code fixes.
- **Ten variations of one idea to reach 100.** Tier 4 is genuinely lower
  priority, and several of those modes would clutter the pitch rather than
  strengthen it — a grid of half-built modes reads worse than one that works.

## Build log

Filled in as each is built and verified. "Verified" means run against the
real stack — deployed program, real signed transactions, real settled tapes —
not that it compiles.

### #9 — Settlement progress · built, verified

`src/ui/SettleProgress.tsx`, stages in `useDuel.ts`. Commit, undelegate and
settle shown as real stages carrying their real results: the commit reports
the transaction count (two, one per position, because two do not fit in 1232
bytes), undelegation reports both accounts home, settle reports the pot paid.
A throwing stage goes red rather than freezing on a spinner.

Verified by pressing SETTLE NOW mid-round in a real duel and reading the panel
out of the DOM: `COMMIT · 2 tx on the rollup`, `UNDELEGATE · both positions
back under the program`, `SETTLE · PnL compared, pot paid, tape written`.

### #7 — Round timeline on the reveal · built, verified

`src/chain/tape.ts`, `src/ui/RoundTimeline.tsx`. Both players' real fills on
one shared time axis, replayed from the fill lists `settle_match` writes into
the public Tape.

This removed invented data rather than adding a chart. The opponent's curve
had been a seeded random walk pinned to their final PnL, your own fell back to
a five-element constant, and the feed's sparklines were a straight line drawn
from the fill *count*. All three are gone.

- `replayEquity` reconstructs a position from its fills using the same
  arithmetic that produced them, so the final point *is* the chain's
  `pnl_*_bps`, not an approximation of it.
- `markFromFill` backs the re-pegged mark out of an execution price, which is
  invertible because depth is fixed at `entry * BOOK_DEPTH`. That makes the
  intermediate points true mark-to-market — and is why both lanes now visibly
  dip on their own slippage before the price runs.
- The line stops between fills. The one segment that is extended is extended
  because it is a fact: a position holding no base is all quote, and quote does
  not move with the market.

Verified by `npm run check:tape` — 715 assertions over 54 real settled tapes,
every replay landing on the chain's own bps — and by playing two duels through
the UI against a second signing wallet, the reveal printing −0.47% / 2 fills
against −0.59% / 4 fills, exactly what the tape holds.

Bug this surfaced: a player with zero fills stamped their opening point at
unix epoch zero, collapsing any shared axis to its right edge.

### #10 — Sound · built, verified

`src/ui/sound.ts`. Seven voices synthesized at play time from oscillators and
gain envelopes — no audio files, nothing fetched — quantised to the same 83ms
frame the animations use. Fill, close, seal, tick, buzzer, win, loss. Each
fires from the one place its event really happens, so nothing can play for an
action that did not occur.

The toggle took over the green header button, which was a menu control nothing
ever passed a handler to and which had no menu to open.

Verified by instrumenting `AudioParam.setValueAtTime` through a full real duel:
seal 196/261.63/392 two frames apart, fill 523.25/783.99 one frame apart,
exactly five 880Hz ticks 1.008s apart, buzzer 174.61/138.59, and the loss sting
landing with the curtain rather than the mount. Off produces zero oscillators.

### #11 — Shareable reveal at a permanent URL · built, verified

`/tape/<match>` — `src/screens/TapeScreen.tsx`, `src/chain/useTape.ts`. The
market, both sides, the timeline, and every fill of both players with side,
size, execution price and the second it landed. Reads once rather than polling,
because a Tape never changes after settlement — which is the property that
makes it a link worth sending. No wallet.

The reveal's share button points here now instead of at /spectate, which by
that moment shows a finished round with none of the detail.

Fixed alongside it: `sol()` prints two places, so a 2% rake on a 0.2 pot
displayed as "0.00◎" under a heading reading SETTLED ON SOLANA — stating that
no rake was taken. `solExact` now shows 0.196 paid and 0.004 raked, which add
up to the pot in public. /spectate had the same bug.

Verified against a real settled duel and all four paths: real fills render, a
missing address explains itself, a malformed one is rejected, an unsettled
match is redirected to /spectate.

### #12 — Head-to-head record · built, verified

`src/chain/useHeadToHead.ts`. Counted from the tapes two wallets share, by two
`memcmp` queries rather than a scan. Nothing is cached or tallied
incrementally, so the record cannot drift from what the program paid.

The reveal recounts as it opens so the duel that just settled is included —
counting first would tell a player who had just won that they still trail.

`npm run check:h2h` derives the byte offsets from a real account instead of
trusting the arithmetic, because a filter at the wrong offset returns an empty
list rather than an error and reads as "never played": 77 assertions, 18
pairings, filtered agreeing with scanned across 59 tapes. In the product the
reveal read YOU LEAD 7-6 while an independent scan read 13 played, 7 and 6.

### #13 — Clickable delegation signatures on /proof · built, verified

`src/chain/useDuelProof.ts`, `src/ui/LifecycleFeed.tsx`. The rest of `/proof`
reports state — who owns which account right now. What it could not show was
the transitions, and those were the claims the pitch rests on: that a position
really was handed to the delegation program, that its ACL really was created
first, and that the delegation program itself really gave ownership back.

They are all transactions, and the base layer will list them. Asking a position
PDA for its signature history returns the whole life of a duel in order — for
the most recently settled one, ten steps: JOIN MATCH, CREATE POSITION
PERMISSION ×2, DELEGATE POSITION PERMISSION ×2, DELEGATE POSITION TO ER ×2,
PROCESS UNDELEGATION ×2, SETTLE MATCH. The doubled steps are real and worth
seeing: one per position, because two do not fit in a 1232-byte transaction.

Each row says what it is evidence *of* and opens in an explorer. A transaction
whose instruction is not part of the delegation story is still listed, labelled
as itself — hiding one from an evidence page would invert the point.

Verified against a real settled duel: sixteen steps in slot order with real
signatures, and a click resolving to
`explorer.solana.com/tx/<sig>?cluster=custom&customUrl=<the local RPC>`, which
is honest about a localhost signature rather than claiming devnet.

### #23 — Position size control · built, verified

`src/ui/SizePicker.tsx`, `src/chain/book.ts`. Fill size was a constant that
nothing exposed — every LONG spent 40% of the remaining quote and every CLOSE
sold everything — which took the one decision the private book exists to make
and made it for the player. Quarter, half and max now govern both directions,
and MAX on a close sells the exact remaining base so no dust is stranded for
the buzzer to clean up.

The impact quote under it is exact, not an estimate. `apply_fill` re-pegs the
book to the mark before every fill and rebuilds depth to `entry * BOOK_DEPTH`,
which leaves the impact of a size a closed form: `q/Q` for a buy, `v/(Q+v)` for
a sell. `npm run check:tape` asserts those predictions against the execution
price recorded on every real fill of every settled tape, agreeing to 1e-9.

Verified in a live two-session duel: quoted 1.56% at MAX and 0.39% at a quarter,
and the chain charged exactly 1.56% and 0.39%. On the tape, a buy of 4,994,030
closed at half to exactly 2,497,015 and then to exactly 2,497,015 again —
summing to what was bought, with nothing left over.

### #100 — Invariant tests · built, verified

`npm run check:invariants`, registered in `npm run check`. The properties that
must hold of the money however anyone traded, asserted over every settled tape
on the cluster: pot conservation (`pot_paid + rake == 2 × entry`), the rake
exact to the lamport against the program's own `RAKE_BPS/BPS_DENOM` floor
division, the winner matching the program's `pnl_a >= pnl_b` comparison,
distinct players, fill lists inside `MAX_FILLS`, a liquidated side never
out-scoring a solvent one, and settlement never dated before its round opened.
**904 assertions over 89 real tapes; effective rake 2.0000% against a declared
2.0000%.**

The first draft reported 12 correct settlements as the program paying the
wrong wallet. It compared Anchor `BN`s with `>=`, which coerces to strings, so
`"-24" >= "-63"` is character-wise false. The comparison goes through `BigInt`
now, with the reason recorded beside it — a test that cries wolf about
settlement is worse than no test.

### #99 — Fuzz tests on the book maths · built, verified

`npm run check:fuzz`. `check:tape` proves the previewer against prices that
really happened, which only covers sizes somebody traded; this covers the rest.
**48,009 assertions over 4,000 seeded random books**, entries 0.05–1◎ and marks
from a memecoin at 3e-11 to an xStock at 755 ◎/token: impact monotone and
bounded, buys never below the mark and sells never above it, `quoteToBuyBase`
inverting to within its deliberate one-lamport round-up, `maxShortNotional`
tight against the margin cap and never over it, and no NaN on degenerate input.

Its first draft failed too, and was also wrong: it demanded exact inversion
from a function that rounds *up* on purpose, because rounding down re-creates
the dust it was written to remove.

### #43 / #44 / #21 — `/stats` · built, verified

Protocol-wide numbers summed from chain with no analytics service behind them:
duels settled, paid to winners, players, fills, open and live counts, biggest
pot, and per-market history (duels, volume, biggest pot) with a bar per market.

The rake is deliberately shown **twice from independent sources** — summed from
every tape, and read off the treasury account the program pays into. That
immediately earned itself: the two disagreed by 953,520 lamports, which is
exactly the treasury's rent-exempt floor. `settle_match` refuses to pay below
it, so those lamports are not rake and never can be. Subtracted and labelled,
the two reads now agree to the lamport.

### #57 — Round length chosen at open time · built, verified

60s / 5m / 15m, each inside the program's own `MIN_DURATION..MAX_DURATION`.
This was `EXPO_PUBLIC_ROUND_SECONDS`, baked at build time, which meant the
product had one round length and a recording had another. Verified on chain:
picking 1 MIN wrote `duration=60s` into the match account.

Verifying it there rather than in the UI caught a real bug — `startMatch`
omitted `openDuration` from its dependencies and captured the first render's
value, opening every match at 300s however many times the picker was pressed.
The same stale-closure defect that once joined a WOFI match while the lobby
showed SOL.

### #59 / #60 — Honest money copy · built, verified

An insufficient balance now names the largest stake the wallet can actually
afford, instead of leaving the player to subtract an invisible headroom figure.
The pot pill prints what the winner *takes* beside the pot, because 0.20 on the
pill and 0.196 in the wallet reads as a bug at the exact moment money moves;
spectate's hardcoded `* 0.98` uses the same constant now.

### #31 / #50 — Remembered choices and market deep links · built, verified

`localStorage` remembers stake, round length and last market — validated on
read, so a stale or hand-edited entry cannot put the lobby into a state
`create_match` would refuse. `/play?market=<mint>` opens the lobby on that
token, resolved through the picker's own search so it must still be priceable.
Verified: deep-linked `8Vht7RWE…` selected WWR, and a reload with **no** query
string still opened on WWR.

### #52 / #56 / #25 / #46 — Safety, accessibility, motion · built, verified

`beforeunload` asks before a live round is closed, and only while genuinely
live — verified prevented mid-round. The clock and PnL are `aria-live`
regions, with the clock announcing minutes and the final ten seconds rather
than reciting every tick. The mark flashes the direction it last moved, on the
*change* not the level — verified rendering a green caret after the crank
moved it up. A short pixel burst on a win, once, `pointerEvents: none`, and
skipped entirely under reduced motion.
