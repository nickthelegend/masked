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
| A1 | base validator :8999 | `getSlot` answers; slot advances between two reads | |
| A2 | ephemeral rollup :7799 | `getSlot` answers | |
| A3 | permission gate :6699 | answers, and *refuses* a sealed position (this is the product's core claim) | |
| A4 | market proxy :8791 | `/whoami` returns `{service, upstreams:['/pump/','/jup/']}` | |
| A5 | static export :4173 | serves `index.html`; SPA rewrite sends every route to it | |
| A6 | fogduel program deployed | `getAccountInfo(3K3v…)` is `executable` | |
| A7 | delegation program present | `DELeGG…` executable | |
| A8 | permission program present | `ACLseo…` executable | |
| A9 | session program present | `KeyspM2…` executable | |

## B. Landing `/`

| # | Item | Correct means | St |
|---|---|---|---|
| B1 | renders | hero + wordmark + FIND MATCH CTA, no overflow | |
| B2 | ticker is real | pubkeys/pots match chain, not constants | |
| B3 | CTA navigates | FIND MATCH → `/play` | |
| B4 | no console errors | zero app-attributable errors | |

## C. Lobby `/play`

| # | Item | Correct means | St |
|---|---|---|---|
| C1 | market list loads | ≥10 markets, real symbols/mints/prices from pump.fun | |
| C2 | prices are live | price matches a direct proxy fetch, not a constant | |
| C3 | logos | real remote logo, or deterministic initial tile on a blocked host — never a broken image | |
| C4 | MEMES/MAJORS tabs | MAJORS switches to Jupiter-priced majors, list changes | |
| C5 | stake picker | 0.05/0.10/0.50/1◎ selectable; "WINNER TAKES" doubles the pick | |
| C6 | selecting a market | selection persists into the round; round opens on that mint | |
| C7 | open book | lists real open matches from chain with age + entry | |
| C8 | stale rows | any match older than `MAX_OPEN_AGE` (300s) shows STALE and is not joinable | |
| C9 | feed-down state | proxy down → "MARKET FEED DOWN / Could not reach the price service." + RETRY; no stale or invented prices | |
| C10 | feed-down CTA | with no markets the CTA is a disabled PICK A MARKET — no button that opens a doomed duel | |
| C11 | RETRY recovers | proxy back → markets repopulate, CTA returns to FIND MATCH | |
| C12 | no console errors | zero app-attributable errors | |

## D. Wallet

| # | Item | Correct means | St |
|---|---|---|---|
| D1 | disconnected state | header shows CONNECT | |
| D2 | picker | CONNECT shows exactly SOLFLARE and LOCAL KEY (DEV) | |
| D3 | local key connect | generates a keypair, persists to `masked.localKeypair.v1`, header shows the pubkey | |
| D4 | balance is real | header balance equals `getBalance` on chain | |
| D5 | persistence | reload keeps the same wallet | |
| D6 | cleared key | removing the key yields a *new* wallet at 0.00, not a crash | |
| D7 | zero-balance guard | OPEN A MATCH with 0 SOL → exactly one toast, "NOT ENOUGH SOL / Need ~0.12 SOL, wallet holds 0.00", **no transaction sent**, no TRANSACTION FAILED | |
| D8 | preflight runs once | the refusal does not retry (no 3× balance read, no repeat toast) | |
| D9 | Solflare option | listed and mounts without error (no extension installed → cannot complete) | |

## E. Matchmaking

| # | Item | Correct means | St |
|---|---|---|---|
| E1 | FIND MATCH | moves to matchmaking, shows OPEN A MATCH | |
| E2 | OPEN A MATCH | one real match on chain; balance drops by entry + rent (~0.105 for 0.05) | |
| E3 | own match in book | shown as YOUR MATCH, not joinable by self | |
| E4 | double-click OPEN | exactly **one** match created, one debit | |
| E5 | CANCEL | refunds the entry; match closed on chain | |
| E6 | double-click CANCEL | exactly **one** refund | |
| E7 | self-join refused | program rejects `SelfJoin` | |
| E8 | JOIN from book | seals the match; both sides show SEALED · ACL ON CHAIN read back from chain | |
| E9 | stale not joinable | a >300s match offers no JOIN | |
| E10 | refresh mid-open | reload during creation recovers into the correct state, no duplicate match | |
| E11 | no console errors | zero app-attributable errors | |

## F. Live round

| # | Item | Correct means | St |
|---|---|---|---|
| F1 | both sides live | clock counts down from the round duration on both | |
| F2 | opponent fogged | opponent shows FOGGED + fill count only — no size, no PnL, no price | |
| F3 | fog is enforced, not cosmetic | the gate refuses the opponent's position over the wire (not merely hidden in UI) | |
| F4 | session key minted | SESSION badge appears; fills are signed by the session key, **not** the wallet | |
| F5 | session scope | a session token for one owner cannot move another's position | |
| F6 | size picker | 1/4, 1/2, MAX change the quoted impact | |
| F7 | impact quote exact | quoted % equals the realised `exec/mark − 1` to 2dp | |
| F8 | LONG | fill lands on the rollup; fill count +1; receipt shows mark and exec price | |
| F9 | double-click LONG | exactly **one** fill | |
| F10 | CLOSE | closes the position; a CLOSE while flat says so and does **not** send a doomed tx | |
| F11 | LONG with nothing left | "NOTHING LEFT TO LONG", no 1-lamport tx | |
| F12 | keyboard L / C | same as LONG / CLOSE | |
| F13 | SETTLE NOW mid-round | disabled, reads "SETTLES AT THE BUZZER"; cannot commit positions early | |
| F14 | mark cranks | price feed advances on the base layer; `PriceTooSoon` absorbed silently | |
| F15 | no console errors | zero app-attributable errors | |

## G. Settlement & reveal

| # | Item | Correct means | St |
|---|---|---|---|
| G1 | buzzer settles | at 0:00 settlement starts without user action | |
| G2 | settle stages | commit → undelegate → settle, each reporting a real count/result | |
| G3 | both undelegated | both positions return to the program before settle | |
| G4 | reveal appears | both sides reach the reveal | |
| G5 | reveal mirrors | A's "you" equals B's "opponent" to the basis point, both ways | |
| G6 | PnL matches chain | displayed % equals the program's `pnlABps`/`pnlBBps` | |
| G7 | timeline is real | every mark is a real tape fill; no synthesized curve anywhere | |
| G8 | pot maths | paid + rake = pot, exactly | |
| G9 | head-to-head | record derived from settled chain history | |
| G10 | market move | "market moved X%" computed from the two tapes | |
| G11 | settle race | both clients settling → winner still sees their reveal, no "MATCH NOT LIVE" dead end | |
| G12 | no console errors | zero app-attributable errors | |

## H. Reveal actions

| # | Item | Correct means | St |
|---|---|---|---|
| H1 | REMATCH | starts a new match, does not resurrect the old one | |
| H2 | COPY TAPE LINK | copies a working `/tape/<match>` URL, or says COPY BLOCKED — never a false success | |
| H3 | SEE IT IN THE FEED | lands on the feed with this duel present | |
| H4 | reachable on phone | all three reachable at 375px (scroll allowed, occlusion not) | |

## I. Feed / Rank / Modes / Quests

| # | Item | Correct means | St |
|---|---|---|---|
| I1 | FEED REVEALS | row count equals the chain's settled count | |
| I2 | FEED MINE | only duels involving the connected wallet | |
| I3 | FEED BIG POTS | only the largest pots, correctly ordered | |
| I4 | feed row data | pubkeys, PnL and pot match the tape | |
| I5 | RANK | leaderboard from chain; player count and streaks real | |
| I6 | MODES | FOG DUEL LIVE; unbuilt modes marked SOON, never presented as playable | |
| I7 | QUESTS | progress derived from real play (settled duels, streak, ◎ taken) | |
| I8 | no console errors | zero app-attributable errors | |

## J. `/tape`

| # | Item | Correct means | St |
|---|---|---|---|
| J1 | `/tape` index | explains itself / lists tapes, no crash with no argument | |
| J2 | settled match | every fill of both players: side, size, exec price, second | |
| J3 | replay is exact | replayed PnL equals the chain's bps | |
| J4 | payout line | paid + rake = pot, shown exactly (not rounded to 0.00) | |
| J5 | malformed address | "That is not a match address." | |
| J6 | valid key, not a duel | "That address is a Solana account, but not a duel." — no Anchor jargon | |
| J7 | unsettled match | "has not settled yet, watch it at /spectate" | |
| J8 | no wallet needed | works with no wallet connected | |
| J9 | no console errors | zero app-attributable errors | |

## K. `/spectate`

| # | Item | Correct means | St |
|---|---|---|---|
| K1 | `/spectate` index | no crash with no argument | |
| K2 | live match | shows pot, mark, fill counts; **never** either position's contents | |
| K3 | settled match | shows the settled result and payout | |
| K4 | malformed address | "That is not a match address." | |
| K5 | valid key, not a duel | "That address is a Solana account, but not a duel." | |
| K6 | no wallet needed | works with no wallet connected | |
| K7 | no console errors | zero app-attributable errors | |

## L. `/proof`

| # | Item | Correct means | St |
|---|---|---|---|
| L1 | CLUSTER | read gate + attestation rows, honest about the TEE | |
| L2 | MEASURED SPEED | real measured latencies, not constants | |
| L3 | PROGRAMS ON CHAIN | all four program IDs, executable | |
| L4 | SETTLED ON CHAIN | count equals chain | |
| L5 | LIVE RIGHT NOW | real live duels, each linking to `/spectate` | |
| L6 | ACCESS CONTROL LISTS | permission accounts owned by `DELeGG…` | |
| L7 | WHAT ONE DUEL COSTS | summed from the listed transactions, not a fee table | |
| L8 | RECENT PROGRAM TRANSACTIONS | real signatures, row opens the explorer | |
| L9 | RUN THIS YOURSELF | each command copies; blocked clipboard says COPY BLOCKED | |
| L10 | no wallet needed | whole page works disconnected | |
| L11 | no console errors | zero app-attributable errors | |

## M. `/health`

| # | Item | Correct means | St |
|---|---|---|---|
| M1 | all 8 dependencies | base, rollup, fogduel, delegation, permission, proxy, pump.fun, jupiter — each with a real detail | |
| M2 | overall badge | ALL SYSTEMS UP only when all are up | |
| M3 | a real outage shows | stop the proxy → that row reads DOWN, badge DEGRADED, others still up | |
| M4 | RE-CHECK | re-runs and recovers after the dependency returns | |
| M5 | unreachable ≠ empty | a hung dependency reports "cannot tell", never "none" | |
| M6 | no console errors | zero app-attributable errors | |

## N. Static routes

| # | Item | Correct means | St |
|---|---|---|---|
| N1 | `/gallery` | component showcase, labelled as such, sample data clearly demo | |
| N2 | 404 | unknown route renders a branded 404 with a way back | |
| N3 | browser back | back out of a flow lands somewhere valid | |

## O. External integrations

| # | Item | Correct means | St |
|---|---|---|---|
| O1 | proxy `/whoami` | 200 + service identity | |
| O2 | proxy `/pump/` | 200, real pump.fun payload | |
| O3 | proxy `/jup/` | 200, real Jupiter payload | |
| O4 | pump.fun prices | derived from market cap ÷ supply, program-representable | |
| O5 | Jupiter prices | real quotes for majors | |
| O6 | unknown proxy path | 404, not a crash or an open relay | |
| O7 | no secrets leaked | no key or token in any client request | |

## P. On-chain program (real signed transactions)

| # | Item | Correct means | St |
|---|---|---|---|
| P1 | create_match | escrow held, match on chain | |
| P2 | join_match | second escrow, both permissions created + delegated | |
| P3 | cancel_if_unjoined | refunds; refuses once joined | |
| P4 | push_price | mark advances; rate limit + jump cap enforced | |
| P5 | apply_fill | book moves; owner enforced; session-signed accepted | |
| P6 | request_settle / settle_match | pot paid, rake taken, tape written | |
| P7 | delegate_position_to_er | position owned by the delegation program | |
| P8 | commit_and_undelegate | position returns home | |
| P9 | init/create/delegate permission | ACL on chain, gate honours it | |
| P10 | guard refusals | every `FogError` the app can hit is actually enforced | |
| P11 | VRF | requested on chain; fulfilment needs an oracle that does not exist here | |

## Q. Resilience & edge cases

| # | Item | Correct means | St |
|---|---|---|---|
| Q1 | refresh mid-transaction | recovers into the true state, no double spend | |
| Q2 | refresh mid-round | rejoins the live round with the clock correct | |
| Q3 | back mid-flow | no broken state | |
| Q4 | resubmit a succeeded action | no second effect | |
| Q5 | seal race | both clients seal → one wins, loser recovers, no wrong-owner crash | |
| Q6 | lobby sweep | settles **only** the player's own abandoned rounds — never spends SOL on strangers' | |
| Q7 | stale match join | refused by the program (`MatchStale`) | |
| Q8 | RPC hang | deadline turns a hang into "cannot tell", never a permanent spinner | |
| Q9 | two origins isolated | separate wallets, no shared state | |

## R. Cross-cutting

| # | Item | Correct means | St |
|---|---|---|---|
| R1 | 375px | no horizontal overflow on any route; all controls reachable | |
| R2 | 768px | same | |
| R3 | desktop | same | |
| R4 | no stray console logging | only the ErrorBoundary's intentional `console.error` ships | |
| R5 | no mocks/stubs | no fabricated data on any product surface | |
| R6 | no hardcoded test data | product screens read chain/API only | |
| R7 | error messages readable | no raw Anchor/fetch strings anywhere a user can reach | |
| R8 | check suites | all green | |
