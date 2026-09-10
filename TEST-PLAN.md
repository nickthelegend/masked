# TEST-PLAN — every surface, and what "correct" means for each

Written **before** testing, against the current codebase, as the checklist the
run is measured by. Every row states the specific expected result. "It rendered"
is never the expected result.

**Method.** Driven through the **production export** (`npx expo export -p web`,
served on `:4173`) in a real browser, two sessions on two origins
(`127.0.0.1:4173` / `localhost:4173`) so each gets its own in-page wallet.
Claude in Chrome reported no connected browser (`list_connected_browsers` → `[]`),
so the in-app Chromium pane drives it. Console and network are read per item.

**Pass bar.** Result matches the "correct means" column exactly. Any console
error or non-2xx network request attributable to the app fails the item.

Legend: **P** pass · **F** fail · **U** untestable (missing real dependency)

---

## A. Environment — the five layers

| # | Item | Correct means | St |
|---|---|---|---|
| A1 | base validator :8999 | `getSlot` answers; slot advances between two reads | **P** |
| A2 | ephemeral rollup :7799 | `getSlot` answers | **P** |
| A3 | permission gate :6699 | answers, and *refuses* a sealed position (this is the product's core claim) | **P** |
| A4 | market proxy :8791 | `/whoami` returns `{service, upstreams:['/pump/','/jup/']}` | **P** |
| A5 | static export :4173 | serves `index.html`; SPA rewrite sends every route to it | **P** |
| A6 | fogduel program deployed | `getAccountInfo(3K3v…)` is `executable` | **P** |
| A7 | delegation program present | `DELeGG…` executable | **P** |
| A8 | permission program present | `ACLseo…` executable | **P** |
| A9 | session program present | `KeyspM2…` executable | **P** |

## B. Landing `/`

| # | Item | Correct means | St |
|---|---|---|---|
| B1 | renders | hero + wordmark + FIND MATCH CTA, no overflow | **P** |
| B2 | ticker is real | pubkeys/pots match chain, not constants | **P** |
| B3 | CTA navigates | FIND MATCH → `/play` | **P** |
| B4 | no console errors | zero app-attributable errors | **P** |

## C. Lobby `/play`

| # | Item | Correct means | St |
|---|---|---|---|
| C1 | market list loads | ≥10 markets, real symbols/mints/prices from pump.fun | **P** |
| C2 | prices are live | price matches a direct proxy fetch, not a constant | **P** |
| C3 | logos | real remote logo, or deterministic initial tile on a blocked host — never a broken image | **P** |
| C4 | MEMES/MAJORS tabs | MAJORS switches to Jupiter-priced majors, list changes | **P** |
| C5 | stake picker | 0.05/0.10/0.50/1◎ selectable; "WINNER TAKES" doubles the pick | **P** |
| C6 | selecting a market | selection persists into the round; round opens on that mint | **P** |
| C7 | open book | lists real open matches from chain with age + entry | **P** |
| C8 | stale rows | any match older than `MAX_OPEN_AGE` (300s) shows STALE and is not joinable | **P** |
| C9 | feed-down state | proxy down → "MARKET FEED DOWN / Could not reach the price service." + RETRY; no stale or invented prices | **P** |
| C10 | feed-down CTA | with no markets the CTA is a disabled PICK A MARKET — no button that opens a doomed duel | **P** |
| C11 | RETRY recovers | proxy back → markets repopulate, CTA returns to FIND MATCH | **P** |
| C12 | no console errors | zero app-attributable errors | **P** |

## D. Wallet

| # | Item | Correct means | St |
|---|---|---|---|
| D1 | disconnected state | header shows CONNECT | **P** |
| D2 | picker | CONNECT shows exactly SOLFLARE and LOCAL KEY (DEV) | **P** |
| D3 | local key connect | generates a keypair, persists to `masked.localKeypair.v1`, header shows the pubkey | **P** |
| D4 | balance is real | header balance equals `getBalance` on chain | **P** |
| D5 | persistence | reload keeps the same wallet | **P** |
| D6 | cleared key | removing the key yields a *new* wallet at 0.00, not a crash | **P** |
| D7 | zero-balance guard | OPEN A MATCH with 0 SOL → exactly one toast, "NOT ENOUGH SOL / Need ~0.12 SOL, wallet holds 0.00", **no transaction sent**, no TRANSACTION FAILED | **P** |
| D8 | preflight runs once | the refusal does not retry (no 3× balance read, no repeat toast) | **P** |
| D9 | Solflare option | listed and mounts without error (no extension installed → cannot complete) | **P** |

## E. Matchmaking

| # | Item | Correct means | St |
|---|---|---|---|
| E1 | FIND MATCH | moves to matchmaking, shows OPEN A MATCH | **P** |
| E2 | OPEN A MATCH | one real match on chain; balance drops by entry + rent (~0.105 for 0.05) | **P** |
| E3 | own match in book | shown as YOUR MATCH, not joinable by self | **P** |
| E4 | double-click OPEN | exactly **one** match created, one debit | **P** |
| E5 | CANCEL | refunds the entry; match closed on chain | **P** |
| E6 | double-click CANCEL | exactly **one** refund | **P** |
| E7 | self-join refused | program rejects `SelfJoin` | **P** |
| E8 | JOIN from book | seals the match; both sides show SEALED · ACL ON CHAIN read back from chain | **P** |
| E9 | stale not joinable | a >300s match offers no JOIN | **P** |
| E10 | refresh mid-open | reload during creation recovers into the correct state, no duplicate match | **P** |
| E11 | no console errors | zero app-attributable errors | **P** |

## F. Live round

| # | Item | Correct means | St |
|---|---|---|---|
| F1 | both sides live | clock counts down from the round duration on both | **P** |
| F2 | opponent fogged | `FOGGED · FILLS HIDDEN` — no size, no PnL, no price, **and no count**. The plan said "fill count only", but the position is sealed and the gate refuses it, so a count is not something the client has. It was rendering `0`. Code fixed to match the privacy claim | **P** |
| F3 | fog is enforced, not cosmetic | the gate refuses the opponent's position over the wire (not merely hidden in UI) | **P** |
| F4 | session key minted | SESSION badge appears; fills are signed by the session key, **not** the wallet | **P** |
| F5 | session scope | a session token for one owner cannot move another's position | **P** |
| F6 | size picker | 1/4, 1/2, MAX change the quoted impact | **P** |
| F7 | impact quote exact | quoted % equals the realised `exec/mark − 1` to 2dp | **P** |
| F8 | LONG | fill lands on the rollup; fill count +1; receipt shows mark and exec price | **P** |
| F9 | double-click LONG | exactly **one** fill | **P** |
| F10 | CLOSE | closes the position; a CLOSE while flat says so and does **not** send a doomed tx | **P** |
| F11 | LONG with nothing left | "NOTHING LEFT TO LONG", no 1-lamport tx | **P** |
| F12 | keyboard L / C | same as LONG / CLOSE | **P** |
| F13 | SETTLE NOW mid-round | disabled, reads "SETTLES AT THE BUZZER"; cannot commit positions early | **P** |
| F14 | mark cranks | price feed advances on the base layer; `PriceTooSoon` absorbed silently | **P** |
| F15 | no console errors | zero app-attributable errors | **P** |

## G. Settlement & reveal

| # | Item | Correct means | St |
|---|---|---|---|
| G1 | buzzer settles | at 0:00 settlement starts without user action | **P** |
| G2 | settle stages | commit → undelegate → settle, each reporting a real count/result | **P** |
| G3 | both undelegated | both positions return to the program before settle | **P** |
| G4 | reveal appears | both sides reach the reveal | **P** |
| G5 | reveal mirrors | A's "you" equals B's "opponent" to the basis point, both ways | **P** |
| G6 | PnL matches chain | displayed % equals the program's `pnlABps`/`pnlBBps` | **P** |
| G7 | timeline is real | every mark is a real tape fill; no synthesized curve anywhere | **P** |
| G8 | pot maths | paid + rake = pot, exactly | **P** |
| G9 | head-to-head | record derived from settled chain history | **P** |
| G10 | market move | "market moved X%" computed from the two tapes | **P** |
| G11 | settle race | both clients settling → winner still sees their reveal, no "MATCH NOT LIVE" dead end | **P** |
| G12 | no console errors | zero app-attributable errors | **P** |

## H. Reveal actions

| # | Item | Correct means | St |
|---|---|---|---|
| H1 | REMATCH | starts a new match, does not resurrect the old one | **P** |
| H2 | COPY TAPE LINK | copies a working `/tape/<match>` URL, or says COPY BLOCKED — never a false success | **P** |
| H3 | SEE IT IN THE FEED | lands on the feed with this duel present | **P** |
| H4 | reachable on phone | all three reachable at 375px (scroll allowed, occlusion not) | **P** |

## I. Feed / Rank / Modes / Quests

| # | Item | Correct means | St |
|---|---|---|---|
| I1 | FEED REVEALS | row count equals the chain's settled count | **P** |
| I2 | FEED MINE | only duels involving the connected wallet | **P** |
| I3 | FEED BIG POTS | only the largest pots, correctly ordered | **P** |
| I4 | feed row data | pubkeys, PnL and pot match the tape | **P** |
| I5 | RANK | leaderboard from chain; player count and streaks real | **P** |
| I6 | MODES | FOG DUEL LIVE; unbuilt modes marked SOON, never presented as playable | **P** |
| I7 | QUESTS | progress derived from real play (settled duels, streak, ◎ taken) | **P** |
| I8 | no console errors | zero app-attributable errors | **P** |

## J. `/tape`

| # | Item | Correct means | St |
|---|---|---|---|
| J1 | `/tape` index | explains itself / lists tapes, no crash with no argument | **P** |
| J2 | settled match | every fill of both players: side, size, exec price, second | **P** |
| J3 | replay is exact | replayed PnL equals the chain's bps | **P** |
| J4 | payout line | paid + rake = pot, shown exactly (not rounded to 0.00) | **P** |
| J5 | malformed address | "That is not a match address." | **P** |
| J6 | valid key, not a duel | "That address is a Solana account, but not a duel." — no Anchor jargon | **P** |
| J7 | unsettled match | "has not settled yet, watch it at /spectate" | **P** |
| J8 | no wallet needed | works with no wallet connected | **P** |
| J9 | no console errors | zero app-attributable errors | **P** |

## K. `/spectate`

| # | Item | Correct means | St |
|---|---|---|---|
| K1 | `/spectate` index | no crash with no argument | **P** |
| K2 | live match | shows pot, mark, fill counts; **never** either position's contents | **P** |
| K3 | settled match | shows the settled result and payout | **P** |
| K4 | malformed address | "That is not a match address." | **P** |
| K5 | valid key, not a duel | "That address is a Solana account, but not a duel." | **P** |
| K6 | no wallet needed | works with no wallet connected | **P** |
| K7 | no console errors | zero app-attributable errors | **P** |

## L. `/proof`

| # | Item | Correct means | St |
|---|---|---|---|
| L1 | CLUSTER | read gate + attestation rows, honest about the TEE | **P** |
| L2 | MEASURED SPEED | real measured latencies, not constants | **P** |
| L3 | PROGRAMS ON CHAIN | all four program IDs, executable | **P** |
| L4 | SETTLED ON CHAIN | count equals chain | **P** |
| L5 | LIVE RIGHT NOW | real live duels, each linking to `/spectate` | **P** |
| L6 | ACCESS CONTROL LISTS | permission accounts owned by `DELeGG…` | **P** |
| L7 | WHAT ONE DUEL COSTS | summed from the listed transactions, not a fee table | **P** |
| L8 | RECENT PROGRAM TRANSACTIONS | real signatures, row opens the explorer | **P** |
| L9 | RUN THIS YOURSELF | each command copies; blocked clipboard says COPY BLOCKED | **P** |
| L10 | no wallet needed | whole page works disconnected | **P** |
| L11 | no console errors | zero app-attributable errors | **P** |

## M. `/health`

| # | Item | Correct means | St |
|---|---|---|---|
| M1 | all 8 dependencies | base, rollup, fogduel, delegation, permission, proxy, pump.fun, jupiter — each with a real detail | **P** |
| M2 | overall badge | ALL SYSTEMS UP only when all are up | **P** |
| M3 | a real outage shows | stop the proxy → that row reads DOWN, badge DEGRADED, others still up | **P** |
| M4 | RE-CHECK | re-runs and recovers after the dependency returns | **P** |
| M5 | unreachable ≠ empty | a hung dependency reports "cannot tell", never "none" | **P** |
| M6 | no console errors | zero app-attributable errors | **P** |

## N. Static routes

| # | Item | Correct means | St |
|---|---|---|---|
| N1 | `/gallery` | component showcase, labelled as such, sample data clearly demo | **P** |
| N2 | 404 | unknown route renders a branded 404 with a way back | **P** |
| N3 | browser back | back out of a flow lands somewhere valid | **P** |

## O. External integrations

| # | Item | Correct means | St |
|---|---|---|---|
| O1 | proxy `/whoami` | 200 + service identity | **P** |
| O2 | proxy `/pump/` | 200, real pump.fun payload | **P** |
| O3 | proxy `/jup/` | 200, real Jupiter payload | **P** |
| O4 | pump.fun prices | derived from market cap ÷ supply, program-representable | **P** |
| O5 | Jupiter prices | real quotes for majors | **P** |
| O6 | unknown proxy path | **403** `{error:'not a market route', allowed:[…]}` — refused, not relayed. The plan said 404; the proxy is a deliberate allowlist and 403 is the stricter, correct answer. Criterion corrected, code unchanged | **P** |
| O7 | no secrets leaked | no key or token in any client request | **P** |

## P. On-chain program (real signed transactions)

| # | Item | Correct means | St |
|---|---|---|---|
| P1 | create_match | escrow held, match on chain | **P** |
| P2 | join_match | second escrow, both permissions created + delegated | **P** |
| P3 | cancel_if_unjoined | refunds; refuses once joined | **P** |
| P4 | push_price | mark advances; rate limit + jump cap enforced | **P** |
| P5 | apply_fill | book moves; owner enforced; session-signed accepted | **P** |
| P6 | request_settle / settle_match | pot paid, rake taken, tape written | **P** |
| P7 | delegate_position_to_er | position owned by the delegation program | **P** |
| P8 | commit_and_undelegate | position returns home | **P** |
| P9 | init/create/delegate permission | ACL on chain, gate honours it | **P** |
| P10 | guard refusals | every `FogError` the app can hit is actually enforced | **P** |
| P11 | VRF | requested on chain; fulfilment needs an oracle that does not exist here | **P** |

## Q. Resilience & edge cases

| # | Item | Correct means | St |
|---|---|---|---|
| Q1 | refresh mid-transaction | recovers into the true state, no double spend | **P** |
| Q2 | refresh mid-round | rejoins the live round with the clock correct | **P** |
| Q3 | back mid-flow | no broken state | **P** |
| Q4 | resubmit a succeeded action | no second effect | **P** |
| Q5 | seal race | both clients seal → one wins, loser recovers, no wrong-owner crash | **P** |
| Q6 | lobby sweep | settles **only** the player's own abandoned rounds — never spends SOL on strangers' | **P** |
| Q7 | stale match join | refused by the program (`MatchStale`) | **P** |
| Q8 | RPC hang | deadline turns a hang into "cannot tell", never a permanent spinner | **P** |
| Q9 | two origins isolated | separate wallets, no shared state | **P** |

## R. Cross-cutting

| # | Item | Correct means | St |
|---|---|---|---|
| R1 | 375px | no horizontal overflow on any route; all controls reachable | **P** |
| R2 | 768px | same | **P** |
| R3 | desktop | same | **P** |
| R4 | no stray console logging | only the ErrorBoundary's intentional `console.error` ships | **P** |
| R5 | no mocks/stubs | no fabricated data on any product surface | **P** |
| R6 | no hardcoded test data | product screens read chain/API only | **P** |
| R7 | error messages readable | no raw Anchor/fetch strings anywhere a user can reach | **P** |
| R8 | check suites | all green | **P** |

---

## S. v2 — any token, both directions, five minutes

Added when the product changed under the plan. Everything above still applies;
these are the items the old plan could not have covered.

| # | Item | Correct means | St |
|---|---|---|---|
| S1 | round length | 300s on chain and on screen; `EXPO_PUBLIC_ROUND_SECONDS` still overrides | **P** |
| S2 | copy follows the constant | landing says "five minutes", badge says "5 MIN", nothing hardcodes 60 | **P** |
| S3 | token search | any ticker, name or mint; exact match ranks first | **P** |
| S4 | search ranking | "btc" → WBTC above BTCBANK; "bonk" → Bonk; "wif" → $WIF | **P** |
| S5 | majors have logos | every verified market carries its own icon, none are letter tiles by default | **P** |
| S6 | big prices | WBTC at ~$79k lists and duels; px is a u64, not a JS safe integer | **P** |
| S7 | per-player market | creator's mint ≠ joiner's mint on chain (`legA` vs `legB`) | **P** |
| S8 | chosen market is used | the token picked in the lobby is the token on chain | **P** |
| S9 | any match joinable | the book no longer filters by market | **P** |
| S10 | SHORT opens | selling without holding gives a negative `base_qty` on chain | **P** |
| S11 | margin cap | a short beyond one times equity is refused by the program | **P** |
| S12 | CLOSE both ways | closes a long by selling and a short by buying | **P** |
| S13 | liquidation | equity ≤ 0 → force-closed at the mark, recorded as LIQUIDATION | **P** |
| S14 | liquidation is permissionless | the opponent can call it; a solvent position is untouched | **P** |
| S15 | liquidation is public | `RoundStatus` served through the gate; the position still refused | **P** |
| S16 | per-leg market move | one line per token; never one number averaging two assets | **P** |
| S17 | tape records both legs | `legA`/`legB` and both liquidation flags on the permanent record | **P** |
| S18 | replay handles shorts | a short and a liquidation replay to the chain's own bps | **P** |
| S19 | fill labels | BUY/SELL/BUZZER/LIQUIDATED — never LONG/CLOSE, which a sell no longer means | **P** |
| S20 | rate limits | a Jupiter 429 retries rather than blanking the market list | **P** |

---

## Re-execution — full pass on a rebuilt stack

The plan was executed once, then executed again from top to bottom after the
local chain had to be rebuilt from genesis. That rebuild was not planned: the
validator was killed mid-snapshot-write when the machine's session ended, and
**both** snapshot archives came back `IO error: incomplete frame`. The ledger
was unrecoverable, so the second pass ran against a fresh chain — new genesis,
redeployed program, re-seeded history, re-funded wallets.

That turned out to be worth more than the state it cost. The second pass is the
only one that exercised first-run conditions honestly:

- **D1/D2/D3/D6** — a genuinely first-time visitor. The adapter mints a key only
  after a wallet has been chosen, so a fresh origin really does show CONNECT,
  really does offer exactly SOLFLARE and LOCAL KEY (DEV), and really does start
  at 0.00 SOL. On a chain with history that state is unreachable.
- **D7/D8** — the zero-balance preflight, measured on a wallet that had never
  held anything: one toast at 997ms, no repeat, no TRANSACTION FAILED.
- **L5** — verified in *both* states for the first time. Populated:
  `1 DUEL · WOFI · 6MtTMn…ZVno v 5Tj6Hq…suoU · 0.20◎ · 3:10`. Empty:
  `0 DUELS · Nothing running`, with expired-unsettled counted separately.
- **`check:guards`** reported 7 refusals rather than 8, because on a chain
  minutes old nothing is older than `MAX_OPEN_AGE` yet. The script skips that
  case and says so instead of passing it vacuously — which is the behaviour you
  want from a suite, and worth recording rather than smoothing over.

Both passes agree. The one defect the second pass found that the first did not
is recorded in its own commit: the margin cap rejected every MAX long from
flat.

---

## Fixed: the crank ran about five times too often

Not a plan item, found while auditing network behaviour. Recorded through two
sessions as **open** because the cause had not been identified. It has now been
found, fixed and re-measured in the running app.

**Symptom.** During a live round the price crank effect re-subscribed roughly
once a second instead of once for the round, so `livePxFor` went out at about
1 request a second against a designed 0.2 (`MARK_CRANK_MS = 5000`), and each
rebuild also opened a gate websocket.

**The cause.** The crank effect's dependency array still listed `match` — the
object. `setMatch` runs once a second with a freshly decoded object, so the
effect tore itself down and rebuilt once a second, and every rebuild ran
`tick()` immediately before creating an interval that was cleared before it
could ever fire. The five-second heartbeat never once fired at five seconds.

This is the same defect the doc comment on `matchRef` describes, and the same
one already fixed in the sibling poll effect at `useDuel.ts:520` — which is
keyed on `[client, matchKey, phase, meKey]`. The crank was simply never
converted. The fix is that same dependency list.

**Why it took three sessions.** Every measurement was keyed on the interval's
*delay*, and two `setInterval(…, 5000)` call sites share it, so the counts
conflated the crank with the balance poll. Fingerprinting by the callback's
source text separated them immediately: the lobby, which runs the balance poll
but not the crank, created **zero** 5s intervals in 25s, which placed the churn
entirely in the crank. A later measurement that appeared to show a healthy
0.1/s was itself an artifact — the instrumentation had been installed after the
duel-screen chunk had already captured `fetch` and `setInterval`, so it saw
almost nothing. Instrumentation must be installed on a fresh page load, before
the screen's chunk is fetched.

**Measured, one tab, live round:**

| | 5s intervals created | poller intervals created | market requests |
|---|---|---|---|
| before any fix | 63 in 25s | — | 1.4/s |
| after three identity fixes | 158 in 30s | — | 2.1/s |
| instrumented properly, before this fix | 47 sockets in 110s | 31 in 110s | 1.0/s |
| **after this fix** | **5 in 25s** | **0** | **0.2/s** |

0.2/s is the designed rate exactly — one crank per five seconds. The five
remaining timers are web3.js websocket heartbeats, one per `crankPrice`
confirmation; they are opened and closed in pairs (`_wsOnClose` clears the
heartbeat) and the count is stable across windows rather than growing.

**What was fixed along the way** (all real, all committed):

- `Keypair.publicKey` is a getter that builds a new `PublicKey` on every
  access, so `LocalKeyWalletAdapter.publicKey` had a fresh identity per read.
- The client memo depended on `signTransaction` / `signAllTransactions` /
  `signMessage`, which `useWallet()` re-creates most renders — rebuilding the
  whole `FogduelClient` and its `Connection`s constantly.
- The balance effect keyed on the `publicKey` object.
- **The crank effect keyed on the `match` object** — the one that was actually
  causing the churn.

**What it never affected.** Correctness. Across every round driven during the
investigation: the mark tracks the market, fills execute at exactly the quoted
impact (1.56% quoted, 1.5625% realised), rounds settle, PnL matches the chain's
own bps, and all 15 check suites pass. It was load, not behaviour — and it was
load on two third-party APIs, which is the likeliest reason Jupiter began
answering 429 earlier in the build.

---

## T — the arcade PvP surfaces

Twenty items covering the screens rebuilt to the arcade reference: a HUD with
two counters, a lock-in card, the round drawn as a percentage arena with a
standings board, a result board, and a tier ladder. Every one of them has to
hold the fog rule as well as look right, which is where most of these items
actually bite.

| # | What | Correct means | Result |
|---|---|---|---|
| T1 | HUD balance | Reads the wallet's real SOL to 2dp and moves when a fill settles | **P** |
| T2 | HUD trophies | Equals `wins` on this wallet's on-chain player account, not a local tally | **P** |
| T3 | HUD back plate | Returns to the feed; the plate dims when it has no action | **P** |
| T4 | Match-found card | Fires once per duel, names both wallets and both tickers, dismisses on TRADE NOW or after 4s | **P** |
| T5 | Match-found honesty | Says the round is LIVE NOW — never counts down to a start that already happened | **P** |
| T6 | Match-found on reload | Does **not** re-show when a round already in progress is reopened (>20s elapsed) | **P** |
| T7 | Countdown | `ENDING IN hh:mm:ss`, turns red and pulses inside the last 15s | **P** |
| T8 | Arena axis | Six labels, symmetric about zero, enough decimals to separate adjacent gridlines | **P** |
| T9 | Arena curve | Plots **PnL percent**, not the price tape; one series only | **P** |
| T10 | Arena puck | Rides the leading edge, tagged with the live PnL, clamped inside the card | **P** |
| T11 | Potential earnings | Pot net of rake; identical all round; never derived from the opponent | **P** |
| T12 | Live standings rank | Both rows show `#?` — a rank needs both PnLs and one is sealed | **P** |
| T13 | Live opponent PnL | Fog bar and the word FOGGED. Never `0.00%` | **P** |
| T14 | Live opponent side | Padlock and SEALED. Never a direction | **P** |
| T15 | Live opponent token | **Shown** — each leg is in the match account on L1, so hiding it would imply a secret the chain does not keep. Asserted against the chain by `npm run check:legs`, not by reading the program | **P** |
| T16 | Your side chip | `▲ LONG` / `▼ SHORT` / `FLAT`, matching the position on chain | **P** |
| T17 | Result board | 1V1, settle date, entry fee, both rows ranked by PnL, trophy on #1 and skull on last | **P** |
| T18 | Result sides | Read off the tape via `carriedSide` — opening fills only, so a buzzer close does not report everyone flat | **P** |
| T19 | Result headline | `YOU TOOK THE POT` or `OOF… SO CLOSE` with the exact gap in percentage points | **P** |
| T20 | Tier ladder | Five tiers derived from the same on-chain `wins` the HUD prints | **P** |

**Executed** against the running app across six duels, two wallets, two
origins. T1–T20 **P**, with the defects below found and fixed in the same run.

Two items were re-done because the first pass proved them weakly:

- **T4** was inferred from the card being absent 20s after a join, which a
  card that never rendered would also satisfy. Re-executed by sampling the
  button label through the join: `4, 3, 2, 1`, then gone.
- **T15** was argued from the program source, which is exactly the kind of
  claim that should not be taken on the author's word in a privacy product —
  the whole board was showing the opponent's ticker on the strength of it.
  `scripts/check-legs.mts` now reads a *running* match the way a stranger
  would: a bare RPC connection to the base layer, no wallet, no gate, no
  session token. Both legs come back; both positions are delegated away behind
  the ACL. It runs in `npm run check`, so if a future change ever seals a leg
  the board's display fails the build instead of quietly leaking.

### Found while executing T

Four defects, all in the running app, all fixed and re-verified:

1. **Every MAX short was refused.** `apply_fill` caps a position at one times
   collateral against post-fill equity. A long lands exactly on that cap; a
   short pays its impact immediately, so sizing one at full equity overshoots
   by exactly its own impact and comes back `NOT ENOUGH QUOTE`. Half the
   product could not be traded at maximum size. `maxShortNotional` now solves
   the cap in closed form. Re-verified live: quoted 1.52%, filled 1.5158%.

2. **A short displayed as FLAT.** `positionLabel` tested `baseQty > 0`, so an
   open short read as flat on the one line whose job is to say what you hold.

3. **The reveal curtain tore itself open again on every render**, its effect
   keyed on an inline `onDone`. Held in a ref now, and unmounted once torn.

4. **The curtain froze across the screen when the tab was in the background.**
   JS-driven `Animated` runs on `requestAnimationFrame`, which browsers do not
   fire in a hidden tab, so the bands stopped at the sequence's first stop —
   opaque, at full opacity, with the headline printed over the result board.
   The completion timer now lands `progress` at 1 explicitly and unmounts the
   curtain, so the visual state does not depend on anyone watching. The same
   inspection found the curtain painting *underneath* the board it is meant to
   hide — two positioned siblings paint in document order — so the one piece of
   theatre in the app had never actually played. It has a `zIndex` now.

5. **Token logos were missing everywhere the chain is the only source.** A
   `Leg` stores a mint, a symbol and a name and no image, so every surface
   built from chain state alone — the standings board, the result board, the
   lock-in card, a settled tape — drew a coloured letter tile beside markets
   that have real art. `chain/logos.ts` is the missing lookup: market lists
   deposit the `imageUri` they already fetched, anything holding a mint can
   ask, and a mint no feed has art for resolves to null and keeps its tile.
   Verified live: three real images on the live board, two on the result
   board, including the opponent's row.

### Not built, and why

The reference set includes a **squad / RUSH mode**: three or more players, five
tokens per squad, a shared prize ladder. The deployed program is a two-wallet
duel — one `Leg` per player, one pot, one winner — so a squad screen would be a
front end for instructions that do not exist. Building it would mean either
mocking the mode or rewriting and redeploying the program, and this document
does not mark mocked features as done.

---

## Re-execution — A–S against the rebuilt arcade UI

The T section was executed against the new screens, but A–S had last been
executed against the old ones, and the arcade work rewrote `AppHeader`,
`TokenLogo`, `MarketRow`, `MarketPicker`, `RevealScreen` and
`LiveRoundScreen`. Checking that five tabs render without an error boundary is
not a re-run. This is the re-run of everything those six components touch.

| Re-checked | Result |
|---|---|
| B — landing `/` | **2 defects**, below |
| C3 C4 C6 — logos, MEMES/MAJORS, selection persists | P — MAJORS switches to Jupiter, SOL selection carried into the round |
| D1–D4 — wallet chip and balance in the new HUD | P — real address, real balance, real trophy count |
| G5 G6 — reveal mirrors, PnL matches chain | **1 defect**, below |
| I — Modes / Rank | P — tier ladder and per-row tier chips, both off on-chain `wins` |
| J — `/tape` | P — renders with real logos on both legs |
| K — `/spectate` | P — both positions FOGGED, no PnL anywhere in the DOM |
| L — `/proof` | P — read gate YES, attested NO, running duels split from expired ones |
| M — `/health` | P — all five layers up |

### Found while re-executing

1. **A drawn round showed both players `#1`.** The result board ranked on
   `myPnl >= opponentPnl` — evaluated from whichever player was looking. The
   program breaks a draw in favour of the creator, and the comment beside that
   line in `lib.rs` warns in as many words that *"a client-side `>=` would
   silently favour whoever happened to be looking at the screen"*. The board
   did precisely that: on a real drawn duel the creator's screen read `#1 ·
   YOU TOOK THE POT` and the joiner's read `#1 (YOU)` directly above `You
   finished at #2 · OOF… SO CLOSE`. It now orders by the chain's own `winner`,
   which is a fact to be read and not recomputed — the pot has already been
   paid by the time the board renders. A drawn round also now names the rule
   instead of reporting "you missed the top by 0.0000%".

2. **The landing page still described v1.** "Two traders stake a pot and trade
   **the same token** for five minutes" — untrue since the two-leg rewrite,
   on the first sentence a judge reads.

3. **The landing's device preview showed a real wallet holding `0.00`.** Its
   header is the real `AppHeader`, so it named the connected wallet and then
   printed a hardcoded zero balance and zero trophies beside it. It reads the
   chain now, via a `useBalance` that does not drag a whole duel in with it.

---

## U — console and network, every item

The plan has always said to check the console and network on every item. That
had been done by glancing at a tab and reasoning about what was old, which is
not the same thing: two error classes were seen earlier in the build, judged
historical, and left. They were not historical.

Method: arm `console.error`/`console.warn`/`unhandledrejection` and a capturing
`error` listener on the document immediately after each load, drive the item,
then read the counters. Resource failures are counted separately from logged
errors because a blocked `<img>` produces the second without the first.

| # | Surface driven | Console | Resource | Result |
|---|---|---|---|---|
| U1 | `/` landing | 0 | 0 | **P** |
| U2 | `/play` lobby, MEMES | 0 | 0 | **P** |
| U3 | `/play` lobby, MAJORS (35 logos) | 0 | 0 | **P** |
| U4 | `/play` search "bonk" | 0 | 0 | **P** |
| U5 | `/tape/<settled>` | 0 | 0 | **P** |
| U6 | `/tape/<invalid>` | 0 | 0 | **P** |
| U7 | `/spectate/<live>` | 0 | 0 | **P** |
| U8 | `/proof` | 0 | 0 | **P** |
| U9 | `/health` | 0 | 0 | **P** |
| U10 | `/this-route-does-not-exist` | 0 | 0 | **P** |
| U11 | market feed down → honest empty state | 0 | 0 | **P** |
| U12 | market feed restored → list repopulates | 0 | 0 | **P** |
| U13 | full duel, creator: open → MAX short → settle → reveal | 0 | 0 | **P** |
| U14 | full duel, joiner: join → MAX long → partial close → reveal | 0 | 0 | **P** |

### Found while executing U

**Every Jupiter major rendered a letter tile, and logged an error saying so.**
`logoUrl()` existed to route logos through the market proxy — with a doc
comment describing this precise failure — and nothing called it, while the
`/img` route it names had never been built, so the proxy answered it 403.
Logos therefore loaded straight from whatever CDN a coin's creator had used,
and the hosts that refuse cross-origin embedding failed with
`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`: 35 tiles and 21 errors on one tab.

Three things the fix had to get right, each found by it going wrong first:

- *Not* spoofing a browser user-agent on the relay. The JSON routes must,
  because pump.fun stalls anything that does not look like a browser. ipfs.io
  wants the opposite — it answers a plain client 200 and the spoofed Chrome
  string 403, because a Chrome UA arriving without Chrome's other headers is
  exactly what it looks like.
- Guarding on the resolved address rather than a hostname allowlist. A first
  cut allowlisted eleven known CDNs and immediately turned working logos into
  403s: `image_uri` is whatever a creator pasted, and one market list spans
  ipfs.io, irys, filebase, twimg, googleapis and backed.fi. Anything resolving
  into loopback, link-local, private or reserved space is refused instead —
  per redirect hop, https only, images only, 8 MB cap. Verified refused:
  `localhost`, `127.0.0.1`, `169.254.169.254`.
- Checking a URL with `fetch` before pointing an `<img>` at it. Three majors'
  metadata genuinely resolves to an HTML page — arweave.net serves 3 MB of
  document for them — and an `<img>` that lands on one fires `error` and
  prints to the console however well the tile fallback works. A 415 from
  `fetch` is a completed request and says the same thing silently.

Result on the majors tab: **35 logos, 35 rendering, 0 errors**, from 35 tiles
and 21 errors.

**The earlier 429s did not recur.** Measured on a clean load, the lobby calls
the market proxy twice in 20.002s — one `REFRESH_MS` apart, which is the
designed rate. The apparent storm seen earlier (28 identical calls) was the
extension's per-tab buffer accumulating across six navigations, not a live
rate. Recorded because the wrong conclusion was nearly drawn from it twice.

---

## Completion measurement — 2026-09-08

Measured against a checklist built from what the project claims (README,
SUBMISSION.md, PLAN.md, the program's own instruction set), not a generic one.
49 items. A feature that exists but is mocked, unstyled against the product's
own bar, or wired to nothing counts as not done.

**Before this pass: 34/49 — 69%.**

Gaps found, and what happened to them:

| Gap | Where | Closed? |
|---|---|---|
| Rollup execution never *proved* — only asserted | no test existed | **yes** — `check:er` |
| Every player rendered as the same `?` plate | `ui/MaskAvatar.tsx` | **yes** — generated masks |
| `COPY` and `FADE` on every feed card, wired to nothing | `ui/MatchCard.tsx` | **yes** — READ TAPE / DUEL THIS TOKEN |
| Quests paid `+XP`, which does not exist | `chain/useQuests.ts` | **yes** — achievements, CLEARED/LOCKED |
| Quests titled "DAILY" over lifetime counters | `screens/QuestsScreen.tsx` | **yes** — ACHIEVEMENTS · ALL TIME |
| `/tape` and `/spectate` players unidentifiable | those screens | **yes** — masks |
| Feed, lobby, rank unstyled against the arcade bar | screens | **yes** — masks, tiers, real actions |
| TEE attestation | devnet | **no** — 0 devnet SOL, faucet refused 40+ times |
| VRF fulfilment | local queues | **no** — queues name devnet oracle identities |
| Demo video, form submission | — | **no** — user actions |

**After: 45/49 — 92%.**

The four open items are one blocked credential (devnet SOL, which also blocks
attestation), one genuinely unavailable dependency (a VRF oracle whose
registration instructions are not in the published SDK), and two things only
the entrant can do.

### `check:er` — the claim that could not be checked from the UI

"Built on MagicBlock" is this submission's central claim and the one a judge
cannot verify by looking: a fill on a rollup and a fill on a validator look
identical from outside. `check:er` drives a real fill and then asks both
clusters where it went.

| Assertion | Result |
|---|---|
| position owned by the delegation program while live | base layer has given custody away |
| fill signature present in the rollup ledger | found, at a real slot |
| same signature absent from the base-layer ledger | absent |
| rollup position carries the fill | `base_qty` non-zero |

---

## V — surfaces added after section U

Nine features landed from `IDEAS.md` after the last full pass. Each gets an
item here before it is executed, with the specific result that counts as
correct — not "renders".

| # | What | Correct means | Result |
|---|---|---|---|
| V1 | `/stats` loads with no wallet | Every figure present and non-negative; `DUELS SETTLED` equals the tape count `check:invariants` reports | **P** (after fix — see below) |
| V2 | `/stats` rake, two sources | `TREASURY, LESS RENT` equals `SUMMED FROM TAPES` to the lamport, and the badge reads `AGREES TO THE LAMPORT` | **P** |
| V3 | `/stats` rent floor named | The note states what the treasury holds and how much is locked as rent; the locked figure is the account's real rent-exempt minimum | **P** |
| V4 | `/stats` per-market table | One row per distinct leg mint, busiest first, each with duels / volume / biggest pot and a bar proportional to volume | **P** |
| V5 | `/stats` cluster unreachable | Says the numbers are unknown, not zero | **P** |
| V6 | Round length picker | 1 MIN / 5 MIN / 15 MIN; the selected one is highlighted and its note changes | **P** |
| V7 | Round length reaches the chain | Opening after picking 1 MIN writes `duration=60` into the match account — checked on chain, not in the UI | **P** |
| V8 | Insufficient balance | Names the largest **offered** stake the wallet can afford, or says to fund it when none is affordable | **P** |
| V9 | Pot pill | Prints the pot *and* what the winner takes; the second equals pot × (1 − RAKE) | **P** (after fix) |
| V10 | Remembered choices | After a reload with no query string, stake, round length and market are the ones last used | **P** |
| V11 | Bad stored prefs | A hand-edited `masked.prefs.v1` with a NaN stake or a 9999s duration is ignored, not applied | **P** |
| V12 | `?market=<mint>` | Lobby opens on that mint; an unpriceable mint leaves it unselected rather than erroring | **P** |
| V13 | `beforeunload`, live | A cancelable `beforeunload` is prevented while a round is live | **P** |
| V14 | `beforeunload`, not live | The same event is **not** prevented in the lobby or on the reveal | **P** |
| V15 | `aria-live` regions | Exactly two polite regions on the live round — the clock and the PnL — with the PnL label naming direction and magnitude | **P** |
| V16 | Clock announcement | The clock's label is a minute boundary or one of the last ten seconds, and empty otherwise | **P** — 49 samples, one non-empty: `00:04:00` → "4 minutes left" |
| V17 | Mark direction flash | After the crank moves the mark, a caret renders beside it filled green for up and red for down; no caret before the first change | **P** |
| V18 | Win burst | Fires once on a win after the curtain tears, does not intercept pointer events, absent on a loss | **P** — 28 pixels at peak on a win, 0 on a loss |
| V19 | `check:invariants` | Passes; pot conserved and rake exact over every settled tape | **P** |
| V20 | `check:fuzz` | Passes; no NaN and no property violated across 4,000 randomised books | **P** |

### Found while executing V

Three real defects, all caught because an item said what "correct" means as a
number rather than as "renders".

1. **The rake was subtracted twice.** `duel.pot` is already net of rake — a
   field named `pot` that is not the pot — so the new pot pill and the arena's
   potential-earnings figure each applied it again. The pill read `TAKES
   0.1921` where the chain pays `0.196`, and the earnings figure had been wrong
   since the arena shipped. `potGross` is exposed now and the pill applies rake
   once. V9 only caught it because the item demanded `pot × (1 − RAKE)`, not
   "shows a number".

2. **`/stats` called 67 abandoned duels LIVE NOW**, noted "clock running".
   Settlement is permissionless but not automatic, so a round whose clock ran
   out with both tabs closed keeps its `live` status. This is the defect
   `/proof` already fixed — twelve finished duels frozen at 0:00 — reappearing
   in new code. Split the same way, with the remainder named as awaiting
   settlement.

3. **A mid-round reload stopped resuming the round.** The restore read the mark
   through the read gate, which refuses until the client has signed in, and on
   a cold load it often has not. The throw skipped `setPhase('live')` and
   dropped the player into the lobby with their entry still escrowed in a round
   running without them — the catch swallowing the reason. Those reads are
   best-effort now.

And one self-inflicted, worth recording because the symptom pointed nowhere
near the cause: building the V5 dead-cluster variant with `--clear` poisoned
Metro's cache, so the next ordinary export baked `127.0.0.1:9911` into `dist`.
The app said CANNOT REACH THE CLUSTER while the validator answered every
command-line probe in 18ms. `npm run check:build` now asserts the export
contains the active cluster URLs and the deployed program id, and that no
scratch-build port leaked in.

### Phase 4 — full re-sweep after the section V fixes

Every route re-driven with console, warning, unhandled-rejection and
resource-error capture armed from load, after the three fixes above.

| Surface | Console | Resource | Result |
|---|---|---|---|
| `/` landing | 0 | 0 | **P** — 13/13 logos |
| `/proof` | 0 | 0 | **P** — gate YES, attested NO, 27 on-chain tests, lifecycle and cost panels |
| `/health` | 0 | 0 | **P** — ALL SYSTEMS UP |
| `/stats` | 0 | 0 | **P** — rake agrees to the lamport |
| `/tape/<settled>` | 0 | 0 | **P** — after the fix below |
| `/tape/<invalid>` | 0 | 0 | **P** — "NOTHING TO READ · That is not a match address." |
| `/spectate/<settled>` | 0 | 0 | **P** — no live PnL leaked |
| `/no-such-page` | 0 | 0 | **P** — 404 listing all 8 routes, including the new `/stats` |
| `/play` — FEED, RANK, MODES, QUEST, DUEL | 0 | 0 | **P** — 19/19 logos on DUEL |

**One more found and fixed during the sweep.** `/tape` labelled its pill `POT`
while handing it `potPaid` — the payout wearing the pot's name, 0.196 rounding
to 0.20 and reading as though no rake had been taken. It shows both now:
`POT 0.20◎ · TAKES 0.196◎`, with `rake 0.004◎` on the line below, and the two
add up.

---

## W — the failure modes the plan never drove

Audited section by section against the goal's own list — invalid input, empty
states, failed requests, mid-flow interruptions. Most are already covered:
double-click OPEN / CANCEL / LONG (E4, E6, F9), refresh mid-transaction (Q1),
market feed down (C9, C10, M3), an unknown proxy path (O6), the gate refusing a
sealed read (A3, F3). These twelve are the ones nothing ever drove.

| # | What | Correct means | Result |
|---|---|---|---|
| W1 | Read gate `:6699` **unreachable** mid-round | The round keeps running off L1 state; a fill reports a readable failure and never claims success. No raw fetch/RPC string reaches the screen |  |
| W2 | Gate restored | The next fill succeeds without a reload |  |
| W3 | Search: garbage that is not a mint or ticker (`!!!!`) | Honest empty result, no crash, no console error |  |
| W4 | Search: a syntactically valid mint that is not a token | No row offered, no crash — better than offering a market `create_match` would reject |  |
| W5 | Search: a real mint pasted whole | That exact token ranks first |  |
| W6 | Feed `MINE` with a wallet that has settled nothing | "YOU HAVE NOT SETTLED A DUEL YET" — an empty state, not an empty list |  |
| W7 | `/img` refuses a private address | `localhost`, `127.0.0.1` and `169.254.169.254` all refused — this relay runs beside a validator holding keys |  |
| W8 | `/img` refuses non-https | An `http://` target is refused |  |
| W9 | `/img` refuses a non-image | A URL returning HTML is refused with 415, not relayed |  |
| W10 | `/img` relays a real logo | An allowlisted CDN image comes back with `content-type: image/*` and a `cross-origin-resource-policy` header |  |
| W11 | `/whoami` identity | Names this service, so a wrong process on the port is obvious rather than mysterious |  |
| W12 | Two tabs, same wallet, same live round | Both show the same clock and the same position; no double fill and no double settle on chain |  |
