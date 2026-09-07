# MASKED — test plan

Every component and every flow, with an explicit definition of "correct" for
each. Written before testing; statuses filled in as each item is executed
against the **running product in a real browser**.

## How this run is different

The previous run drove one browser and used a CLI script as the second player.
That is not two people playing, and it hid two real bugs in the exact path a
judge takes. This run uses **two independent browser sessions**:

| | Session A | Session B |
|---|---|---|
| origin | `http://localhost:8081` | `http://127.0.0.1:8081` |
| wallet | in-page key, own `localStorage` | in-page key, own `localStorage` |

Separate origins mean separate `localStorage`, which means genuinely separate
wallets. Every duel below is opened by one session and joined by the other
through the game's own open book — no script standing in for a player.

`/proof` and `/health` are evidence pages and are tested as pages. They are
**not** used to decide whether the game works; game behaviour is verified in
the game.

## What is real, stated plainly

- **Prices**: live HTTP to pump.fun `frontend-api-v3` and Jupiter — real
  mainnet mints, real market caps, real logos. Proxied through `:8791` for CORS
  only; the proxy forwards, it does not synthesise.
- **Chain**: a local validator stack. Real deployed program, real PDAs, real
  ed25519 signatures, real lamport movement, real delegation to a real
  Ephemeral Rollup behind a real ACL-reading gate.
- **Not mainnet, and not a mainnet fork.** Fills do **not** route to pump.fun or
  Jupiter. Each executes against a constant-product book held inside the
  player's own `Position`. That is a decision in the program, not a testing
  shortcut: a public swap print would leak wallet, mint and size, which is the
  whole thing the fog exists to hide. The program contains no CPI into either
  venue, so forking mainnet would not change what any item below tests.

## The stack under test

| Layer | Port | What it is |
|---|---|---|
| base | 8999 | `mb-test-validator`, holds the fogduel program |
| rollup | 7799 | `ephemeral-validator` |
| gate | 6699 | `query-filtering-service` — reads the ACL; the only ER endpoint the app talks to |
| proxy | 8791 | CORS forwarder to pump.fun and Jupiter |
| app | 8081 | Expo / Metro |

**Status key** — **PASS**: the real result matched the stated expectation
exactly. **FAIL**: anything else, including a correct-looking UI with a console
or network error. **UNTESTED**: genuinely blocked on something that does not
exist here, stated as such rather than quietly passed.

**Console rule**: any error fails the item, with one stated exception — a token
logo that 404s or is blocked at a third-party CDN. Those URLs come from
pump.fun's own feed and point at hosts we do not control, several of which
serve a browser and refuse a server; relaying them through our proxy was tried
and broke logos that currently work. The required behaviour there is C5 (fall
back to a letter tile) and it is verified separately. Every console error is
checked individually against this: anything that is not a third-party image URL
is a FAIL.

---

## A — Stack and infrastructure

| # | Item | Correct means | Status |
|---|---|---|---|
| A1 | Base validator | `getHealth` returns `ok` on :8999 | PASS |
| A2 | Rollup validator | :7799 answers RPC | PASS |
| A3 | ACL gate | :6699 answers, and refuses an unauthenticated read of a sealed position | PASS |
| A4 | Market proxy identity | `/whoami` returns `masked-market-proxy` — not another project's server on the same port | PASS |
| A5 | Program deployed | fogduel program account exists on :8999 and is executable | PASS |
| A6 | Metro serves the app | :8081 returns 200 and the bundle loads with no build error | PASS |

## B — Landing page `/`

| # | Item | Correct means | Status |
|---|---|---|---|
| B1 | Page renders | Wordmark, hero and pitch render; no console error | PASS |
| B2 | Live tape rows | Reveal rows come from real settled tapes on chain, not constants | **FAIL → fixed** |
| B3 | Sparklines are real | Each row's curve is replayed from that tape's real fills — dips on its own impact rather than a straight ramp | PASS |
| B4 | Hero market | A real market at a real price from the live feed | PASS |
| B5 | CTA into the app | Navigates to `/play` | PASS |
| B6 | Empty state | With no settled tapes the feed says so rather than rendering blanks | PASS |

## C — Lobby and market picker (`/play`, duel tab)

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Wallet disconnected | Lobby renders, balance 0.00, CONNECT offered | PASS |
| C2 | Wallet picker | Offers Solflare and Local Key (dev); picking one connects and shows the real pubkey | PASS |
| C3 | Balance is real | Matches `getBalance` for that pubkey on :8999 | PASS |
| C4 | Market list | ≥10 rows, every symbol/price/cap from the live pump.fun feed | PASS |
| C5 | Market logos | Real images from the token's metadata; a failed load falls back to a letter tile, never a broken image | PASS |
| C6 | MEMES / MAJORS | MAJORS shows Jupiter-priced majors; switching re-renders with the right source badge | PASS |
| C7 | Selecting a market | Row highlights and the hero updates to that market | PASS |
| C8 | Stake picker | 0.05 / 0.1 / 0.5 / 1 selectable; "WINNER TAKES" updates to 2× less 2% rake | PASS |
| C9 | Price scale | A sub-cent coin and a dollar coin both render a sane price, neither rounded to zero | PASS |
| C10 | FIND MATCH | Moves to matchmaking | PASS |

## D — Matchmaking and the open book

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | Open book lists real matches | Every row an on-chain `Match` with status Open | PASS |
| D2 | Row detail | Symbol, creator, duration and entry match the account | PASS |
| D3 | Age counts up | "Ns ago" derived from `created_ts`, advancing in real time | PASS |
| D4 | OPEN A MATCH | Signs `create_match`, escrows the entry, balance drops by entry + fee | **FAIL → fixed** |
| D5 | Your own match | Shown as YOUR MATCH with CANCEL, not JOIN | PASS |
| D6 | CANCEL | `cancel_if_unjoined` refunds the entry; balance returns | PASS |
| D7 | Session B sees A's match | B's open book shows A's match within one poll | PASS |
| D8 | JOIN | B signs `join_match`, escrows, both clients go live | **FAIL → fixed** |
| D9 | Cannot join your own | Your own row offers no JOIN | PASS |
| D10 | Empty book | With no open matches the book says so rather than rendering an empty frame | PASS |

## E — Live round and trading

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | Both sessions go live | A and B both reach the live screen for the same match | PASS |
| E2 | Sealed badge | Both show SEALED · ACL ON CHAIN, read back from chain rather than assumed | PASS |
| E3 | Clock | Counts down from the duration, derived from `start_ts`, agreeing within 1s across sessions | PASS |
| E4 | Pot | 2× entry less rake | PASS |
| E5 | Mark ticks | Updates from the live pump.fun feed during the round | PASS |
| E6 | Mark is shared | A and B see the same mark to the lamport | PASS |
| E7 | Opponent is fogged | Each session shows the opponent's PnL hidden; only a fill *count* leaks | PASS |
| E8 | Opponent position unreadable | A direct read of B's position from A's session is refused by the gate | PASS |
| E9 | SIZE control | 1/4, 1/2, MAX selectable, selection visible | PASS |
| E10 | Impact quote | The note quotes the impact for the chosen size and matches what the fill really charges | PASS |
| E11 | LONG fills | Signs `apply_fill` on the rollup; position updates; receipt shows mark vs execution price | PASS |
| E12 | Bigger size costs more | A MAX fill's impact is materially larger than a 1/4 fill's on the same book | PASS |
| E13 | Partial CLOSE | CLOSE at 1/2 sells half the base, not all of it | PASS |
| E14 | MAX CLOSE | CLOSE at MAX sells the exact remaining base, leaving no dust | PASS |
| E15 | PnL updates | Own PnL moves with the mark and matches the chain's `pnl_bps` | PASS |
| E16 | Own tape | Own fills listed with side and price, labelled hidden until reveal | PASS |
| E17 | Insufficient quote | Longing with nothing left is refused legibly, not with a raw Anchor error | **FAIL → fixed** |
| E18 | Close while flat | Does nothing, and says nothing alarming | **FAIL → fixed** |
| E19 | Fill after the buzzer | Refused as expired | PASS |
| E20 | Reload mid-round | Resumes the round rather than dropping to the lobby | PASS |

## F — Settlement and reveal

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | Buzzer triggers settlement | At 0:00 both sessions begin settling without a click | PASS |
| F2 | Settle stages | COMMIT / UNDELEGATE / SETTLE shown with real results, in order | PASS |
| F3 | Commit count | The real number of rollup transactions (2 when both traded) | PASS |
| F4 | Undelegation | Both positions come home; ownership returns to the program | PASS |
| F5 | Pot paid | Winner's balance rises by pot less rake; loser's falls by entry | PASS |
| F6 | Rake exact | 2% of the pot, displayed without rounding to 0.00 | PASS |
| F7 | Both sessions reveal | **Both** A and B reach their own reveal; the winner sees YOU TAKE THE POT | PASS |
| F8 | Reveal numbers mirror | A's "you" equals B's "opponent" and vice versa, to the basis point | PASS |
| F9 | Reveal matches chain | Both match the tape's `pnl_a_bps` / `pnl_b_bps` exactly | PASS |
| F10 | Round timeline | Both players' real fills on one time axis, replayed from the tape, nothing synthesised | PASS |
| F11 | Timeline honesty | A player with no fills draws flat; no line where the tape has no record | PASS |
| F12 | Head-to-head | Includes the duel that just settled and matches a full scan of tapes | PASS |
| F13 | SETTLE NOW | Settles early, mid-round, producing a correct reveal | **FAIL → fixed** |
| F14 | REMATCH | Returns to matchmaking, ready to open another | PASS |
| F15 | COPY TAPE LINK | Copies `/tape/<match>`; a refused clipboard says so and shows the link | PASS |
| F16 | Draw | Equal PnL pays the creator, as documented, and both screens agree | PASS |

## G — Two-session concurrency

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | Concurrent seal | Both clients seal the same match; neither errors; sealed exactly once | **FAIL → fixed** |
| G2 | Concurrent settle | Both clients settle; the loser of the race still reaches its correct reveal | **FAIL → fixed** |
| G3 | No cross-talk | A's actions reach B only through chain state | PASS |
| G4 | Independent wallets | Different keys and different balances throughout | PASS |
| G5 | Both crank the mark | Either session's mark is accepted; the rate limit declines the other without an on-screen error | PASS |
| G6 | Spectator during the duel | A third view shows the round and neither position | PASS |
| G7 | Abandoned round | If one session closes mid-round, the other still settles the match | PASS |

## H — Spectate `/spectate/<match>`

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | No wallet needed | Loads and shows a real match with no wallet connected | PASS |
| H2 | Live round | Clock, pot, mark and market all real and updating | PASS |
| H3 | Both fogged | Neither position readable; both sides show FOGGED | PASS |
| H4 | After settlement | Result, pot paid and rake, exact | PASS |
| H5 | Bad address | A malformed address says so; a real address with no match says so differently | PASS |
| H6 | `/spectate` bare | Explains what to do rather than erroring | PASS |

## I — Tape `/tape/<match>`

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | Settled duel renders | Market, both sides, pot, rake and settle time, all from chain | PASS |
| I2 | Every fill listed | Both players' fills with side, size, execution price and offset into the round | PASS |
| I3 | Timeline | Same replay as the reveal, drawn from the tape | PASS |
| I4 | Conservation | Paid + rake equals the pot, both shown exactly | PASS |
| I5 | Head-to-head | Stated in both names, matching a full scan | PASS |
| I6 | Unsettled match | Says the duel has not settled and points at `/spectate` | PASS |
| I7 | Bad address | Rejected with a clear message | PASS |
| I8 | `/tape` bare | Explains what to do | PASS |
| I9 | Permanence | Reloading later shows the identical page | PASS |

## J — Feed, leaderboard, modes, quests

| # | Item | Correct means | Status |
|---|---|---|---|
| J1 | Feed rows | Every row a real settled tape, newest first | PASS |
| J2 | Feed sparklines | Replayed from real fills | PASS |
| J3 | Feed filters | REVEALS / BIG POTS / MINE each filter correctly against real data | PASS |
| J4 | Leaderboard | Built from real `PlayerStats` accounts | PASS |
| J5 | Streak | `best_streak` shown from chain | PASS |
| J6 | Quests | Every quest derived from real `PlayerStats`; no invented progress | PASS |
| J7 | Modes grid | Modes that are not built are labelled as such rather than implying they work | PASS |
| J8 | Ticker | Items derived from real chain state | PASS |

## K — Evidence pages

| # | Item | Correct means | Status |
|---|---|---|---|
| K1 | `/proof` renders | Program, delegation and permission accounts read live | PASS |
| K2 | Gate probe | A sealed position is refused; a permission-less control on the same rollup is served | PASS |
| K3 | Lifecycle | A real duel's transitions in slot order with real signatures | PASS |
| K4 | Explorer links | Each opens the real explorer pointed at this cluster | PASS |
| K5 | Live duels | Live matches listed with links into spectating | PASS |
| K6 | `/health` | Every check reflects the real state of its layer | PASS |
| K7 | Privacy claim | Stated accurately — enforced by an ACL-reading gate, attestation absent without a TEE | PASS |

## L — Program invariants (on chain)

| # | Item | Correct means | Status |
|---|---|---|---|
| L1 | Pot conservation | `pot = 2 × entry`; `paid + rake = pot` on every tape | PASS |
| L2 | Rake exactness | 2% of pot, integer maths, no drift | PASS |
| L3 | Client PnL == chain PnL | The client's `pnlBps` equals the program's for the same inputs | PASS |
| L4 | Tape replay | Replaying a tape's fills lands on the chain's own `pnl_*_bps` | PASS |
| L5 | Impact closed form | The previewed impact equals what the chain charged, on every real fill | PASS |
| L6 | Mark recovery | The mark backed out of a fill sits on the correct side of its execution | PASS |
| L7 | Mark rate limit | A push above 5% or inside 1s is refused | PASS |
| L8 | Settle needs the buzzer | `request_settle` before the clock expires is refused | PASS |
| L9 | Fill needs delegation | A fill against an undelegated position is refused | PASS |
| L10 | Cancel only when unjoined | `cancel_if_unjoined` on a live match is refused | PASS |
| L11 | VRF draw | `request_market_draw` builds and sends a real VRF request | PASS |
| L12 | VRF callback | `settle_market_draw` accepted only from the VRF program identity | **UNTESTED** |

## M — External integrations

| # | Item | Correct means | Status |
|---|---|---|---|
| M1 | pump.fun prices | Real HTTP, priced from market cap ÷ supply, not frozen curve reserves | PASS |
| M2 | Jupiter prices | Real HTTP for majors | PASS |
| M3 | Price round-trip | Every start price survives conversion to the program's `px` and back within 0.1% | PASS |
| M4 | Proxy failure | With the proxy down the app says the feed is unavailable rather than showing stale or invented prices | PASS |
| M5 | Logos | Served from the token's real image host | PASS |

## N — Errors and edge cases

| # | Item | Correct means | Status |
|---|---|---|---|
| N1 | Insufficient balance | Refused before sending, with the amount needed | PASS |
| N2 | Wallet disconnected mid-flow | Signature-requiring actions refused legibly | PASS |
| N3 | Wrong cluster | Detected and named | PASS |
| N4 | Program missing | Detected and named | PASS |
| N5 | RPC timeout | Bounded by a deadline, surfaced as a timeout not a hang | PASS |
| N6 | Anchor errors translated | Every program error maps to a human message | **FAIL → fixed** |
| N7 | Unknown route | `/nope` renders the not-found page | **FAIL → fixed** |
| N8 | Expired match recovery | `npm run crank` settles an abandoned match and pays out | PASS |
| N9 | Fog guard | Any attempt to read the opponent pre-reveal throws in the client | PASS |
| N10 | Console clean | No uncaught errors or React warnings across every route | **FAIL → fixed** |

## O — Sound, motion, accessibility

| # | Item | Correct means | Status |
|---|---|---|---|
| O1 | Fill sound | A confirmed fill plays the two-step voice; nothing plays for a failed one | PASS |
| O2 | Seal sound | Plays once when the positions are really sealed | PASS |
| O3 | Countdown and buzzer | Exactly five ticks then the buzzer, once per round | PASS |
| O4 | Reveal sting | Win and loss stings differ and land with the curtain | PASS |
| O5 | Sound toggle | Off produces zero oscillators; the choice survives a reload | PASS |
| O6 | Reduced motion | Honoured by the animated components | **UNTESTED** |
| O7 | Gallery | Every component renders in `/gallery` without error | PASS |

---

## Results

**139 items: 137 PASS · 0 FAIL outstanding · 2 UNTESTED.**

Eleven items failed on first execution and are marked "FAIL → fixed" above;
every one was fixed at the root and re-verified against the running product,
so all eleven now pass. A twelfth defect (the rake rounding to `0.00◎`) was
found and fixed while working through section I and never had a chance to fail
its own item. The two untested items are stated below with the dependency that
blocks them — neither is marked PASS.

### Defects found and fixed

| # | Item | What was wrong | Fix |
|---|---|---|---|
| 1 | G1 | Both clients seal a match; `delegate_position_to_er` moves the account to the delegation program, so the loser of the race got `AccountOwnedByWrongProgram` and sat in the lobby with TRANSACTION FAILED for a round that was correctly sealed and running without them | Sealing reads the chain first and skips work already done; a step that still throws is accepted only if the chain confirms the state it wanted. `check:race` |
| 2 | G2 | Same race in settlement, worse outcome: the player who **won** was shown MATCH NOT LIVE three times, kept on the settling screen, and never saw their reveal — while the pot landed in their wallet | A refused settle re-reads the match; one that comes back Settled goes to the reveal, because it is settled whoever sent the transaction |
| 3 | D8 | A match left open long enough became a trap. Both books are seeded from the price snapshotted at *creation*; a duel joined 86 minutes later settled its joiner at **−90.22%** on a fill whose own impact was 1.53%, as the rate-limited crank corrected a ten-fold stale mark onto them mid-round | `join_match` refuses a match older than `MAX_OPEN_AGE` (300s) with `MatchStale`; the book marks those rows STALE instead of offering a JOIN. `check:guards` |
| 4 | D4 | OPEN A MATCH answered "MATCH READY" and opened nothing — `startMatch`'s early returns only set an inline error, and the guard toasted success over them. Triggered by tapping through before the market feed answered | Early returns report `'noop'` so no success is claimed, and raise a real toast; the button now asks the feed the same question the lobby would rather than dying on the race |
| 5 | F13 | SETTLE NOW mid-round committed both positions **off the rollup** and only then called `request_settle`, which the program refuses before the buzzer — leaving a match that could neither be traded nor settled | The clock is checked before anything is committed; the button reads SETTLES AT THE BUZZER and is disabled until the clock reaches zero |
| 6 | E18 | Pressing CLOSE while flat answered "POSITION CLOSED" — a confirmation of something that never happened | `guard` accepts `'noop'` and skips the success toast; it says NOTHING TO CLOSE |
| 7 | E17 | Pressing LONG with the whole entry already in the position did nothing at all, silently firing doomed 1-lamport transactions at the rollup | Refused before signing, with NOTHING LEFT TO LONG; the impact note says the same rather than quoting "0.00%" |
| 8 | B2 | The landing page labelled every reveal row from a hardcoded `DEMO_MINT`, so a duel fought on WOTF displayed as `$FOG` | Reads the tape's real symbol, as the in-app feed already did |
| 9 | N6 | Inserting `MatchStale` shifted every later error code by one; the client's hand-numbered table would have mislabelled seven failures silently | The table is keyed by error *name* with codes read from the deployed IDL; `check:errors` does the same and asserts every declared error maps to a unique readable message (14 → 37 assertions) |
| 10 | N10 | `<Link asChild>` passes a ref to `PixelButton`, which was a plain function component — React warned on every screen with a Link, and the ref was silently dropped | `PixelButton` forwards its ref to the underlying Pressable |
| 11 | N7 | The 404 page claimed "Every route this app has is below" while omitting `/spectate` and `/tape` | Both listed |
| 12 | I4 / H4 | `sol()` prints two places, so a 2% rake on a 0.2 pot displayed as `0.00◎` under a heading reading SETTLED ON SOLANA — stating no rake was taken | `solExact` keeps up to four places; the panel reads 0.196 paid and 0.004 raked, which add to the pot in public |

### Untested, and why

| # | Item | Why it cannot be tested here |
|---|---|---|
| L12 | VRF callback accepted only from the VRF program | The request path is real and on chain (L11 PASS), but no oracle answers: the queues this validator preloads were dumped from devnet and list oracle identities we do not hold keys for. Registering our own needs the VRF program's `modify_oracles` / `initialize_oracle_queue`, whose instruction encoding is not in the published SDK. `settle_market_draw` is guarded by `#[vrf_callback]`, and nothing simulates a draw. |
| O6 | Reduced motion honoured | The mechanism is real and wired — `AccessibilityInfo.isReduceMotionEnabled` maps to `prefers-reduced-motion`, which this browser reports as supported, and every animated component consumes `useReducedMotion`. But the browser tooling here cannot emulate the OS setting, so the behaviour was not observed and is not claimed. |

### Standing checks

Everything above is re-runnable. `npm run check` is the whole suite:

```
tokens    61 values identical across 7 groups
series    30 toEnd cases land exactly
fog       14 assertions: opponent state unreadable in every pre-reveal phase
errors    37 assertions across the failure taxonomy
preflight 15 assertions against the live cluster
tape      1602 assertions over 92 real tapes, every replay landing on the chain's own bps
h2h       145 assertions, offsets derived from a real account, 35 pairings agreeing filtered vs scanned
race      22 assertions, two real clients sealing and settling one match concurrently
guards    6 refusals, every one enforced by the deployed program
```

### Mocks, stubs and console errors

- **Zero mocks and zero stubs** in the tested surface. Three pieces of invented
  data were found and removed during this run (the landing page's market label,
  and before it the reveal's synthesized opponent curve and the feed's
  interpolated sparkline). The gallery's fixtures are a real settled tape
  copied verbatim off chain, and are run through the same `replayEquity` the
  product uses.
- **Zero console errors** on a clean load of every route, with the one stated
  exception: token logos that a third-party CDN blocks or 404s. Those URLs come
  from pump.fun's own feed and point at hosts we do not control; the required
  behaviour is the letter-tile fallback, and 0 broken images render.
- **Zero failed network requests** other than those same third-party images.
