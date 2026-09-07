# MASKED — test plan

Every component and every flow, with the specific result that counts as
correct. This is the checklist; nothing is a PASS unless the real, running
product produces exactly what is written here.

**Rules for this run**

- Tested against the real app in a browser, not against the source.
- Console and network are read on every item. Any error fails it, with one
  stated exception: a token logo that 404s at a third-party CDN. Those URLs
  come from pump.fun's feed and point at CDNs we do not control, some of which
  serve a browser and refuse a server — relaying them through our own proxy was
  tried and broke logos that currently work. The product's required behaviour
  there is C3 (fall back to a tile), and it is verified. Every console error is
  checked individually against this: anything that is not a third-party image
  URL is a FAIL.
- Real chain: real deployed program, real signed transactions, real escrow
  movement. No mocks, no fixtures, no fallback data anywhere.
- Real market feeds: live pump.fun and Jupiter over HTTP.
- "Close enough" is a FAIL.

**The stack under test**

| Layer | URL | What it is |
|---|---|---|
| base L1 | `http://127.0.0.1:8999` | `mb-test-validator` — escrow, settlement, `DELeGG…`, `ACLseo…` |
| rollup | `http://127.0.0.1:7799` | `ephemeral-validator` — delegated positions. Answers anyone. |
| public front | `http://127.0.0.1:6699` | `query-filtering-service` — reads the ACL. **The app only ever talks to this one.** |
| market proxy | `http://127.0.0.1:8788` | CORS shim for pump.fun / Jupiter. No secrets, two upstreams only. |
| app | `http://localhost:8081` | Expo web |

Program: `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1`

---

## A — Routes and shell

| # | Item | Correct means |
|---|---|---|
| A1 | `/` landing renders | Wordmark, hero pocket device, live stat tiles, no placeholder copy. HTTP 200, zero console errors. |
| A2 | `/play` renders the app | Pocket shell, header, ticker, lobby, tab bar. Zero console errors. |
| A3 | `/gallery` renders | Every component section draws, including the four market states. Zero console errors. |
| A4 | `/proof` renders | Evidence panels populated from chain **without a wallet connected**. |
| A5 | `/health` renders | Cluster/endpoint readout, live. |
| A6 | Unknown route | `/nope` shows the not-found screen, not a crash or a blank page. |
| A7 | No horizontal overflow | No route scrolls sideways at 1280px or at 390px. |

## B — Landing page (`/`)

| # | Item | Correct means |
|---|---|---|
| B1 | Stats are real | Duels settled / volume / players match what `chain-truth` reports from the program's own accounts. Not a constant. |
| B2 | Ticker is real | Entries are settled tapes with real winners and amounts, matching chain. |
| B3 | Hero preview lists live markets | The embedded lobby shows the same pump.fun markets `/play` shows. |
| B4 | CTA navigates | "PLAY" / hero device reaches `/play`. |
| B5 | Empty chain | With zero settled matches the stats read 0 and the ticker says so — never a fabricated number. |

## C — Market discovery (the pump.fun / Jupiter integration)

| # | Item | Correct means |
|---|---|---|
| C1 | Memes tab lists live coins | ≥8 rows, each with a real mint, symbol, name, USD price and market cap that match a direct call to `frontend-api-v3.pump.fun/coins`. |
| C2 | Logos load | Rows whose feed carries a working `image_uri` show the real image. |
| C3 | Broken logos fall back | A row whose image 404s shows a coloured tile with the ticker's initial — never a broken-image icon, never a blank box. |
| C4 | Majors tab | SOL and USDC, priced from Jupiter, each within 1% of a direct call to `api.jup.ag/price/v3`. Drawn pixel marks, not remote images. |
| C5 | Source is attributed | Every major row and the selected-market hero name their feed (`pump.fun` / `jupiter`). |
| C6 | Prices refresh | Left open, prices change within ~20s without a reload and without the list blanking. |
| C7 | Selection | Tapping a row selects it: row highlights, hero shows that market's logo, ticker and price. |
| C8 | Feed down | With the proxy stopped, the picker shows `MARKET FEED DOWN` with the upstream's own message and a RETRY that works once it is back. Never a silent empty list, never invented prices. |
| C9 | Price is representable on chain | The selected market's `startPx` is a positive safe integer, and round-trips back to the feed's price within 0.1%. |
| C10 | Tab switch | Memes ⇄ Majors swaps the list with no stale rows from the other tab. |

## D — Wallet

| # | Item | Correct means |
|---|---|---|
| D1 | Disconnected state | Header shows CONNECT; balance reads 0.00; no chain writes attempted. |
| D2 | Connect | Solflare connects, header shows the truncated address and the real L1 balance. |
| D3 | Balance is live | Matches `solana balance` for that pubkey. |
| D4 | Preflight blocks a broke wallet | With insufficient SOL, FIND MATCH refuses with a specific message naming the shortfall — not a failed transaction. |

## E — Match lifecycle, on chain

| # | Item | Correct means |
|---|---|---|
| E1 | Create | FIND MATCH with no joinable match signs one transaction; a `Match` account exists on L1 with the chosen mint, symbol, name, market type and `start_px`; the vault holds exactly the entry. |
| E2 | Escrow is real | Creator's L1 balance drops by entry + fee. Vault balance rises by entry. |
| E3 | Open book | The match appears in the open list for a second wallet, showing its market. |
| E4 | Join | Second wallet joins: status `live`, pot = 2 × entry, both `Position`s created, each seeded with `quote_balance = entry` and its own book at `BOOK_DEPTH × entry`. |
| E5 | Self-join refused | Creator cannot join their own match. |
| E6 | Double join refused | A third wallet cannot join a live match. |
| E7 | Cancel | Creator cancels an unjoined match: status `cancelled`, entry refunded. |
| E8 | Cancel refused after join | Cancel on a live match fails. |
| E9 | Settle before the clock | `request_settle` before expiry fails with `MatchStillRunning`. |
| E10 | Settle | After expiry: `request_settle` then `settle_match`. Winner is the higher ending equity, rake is exactly 2% of pot, payout is pot − rake, and both land in real balances. |
| E11 | Tape | A `Tape` account is written with the winner, payout, rake and both fill lists. |
| E12 | Stats | `PlayerStats` for both wallets update — wins/losses/streak/taken — on chain, not client-side. |

## F — MagicBlock: delegation, rollup, privacy

| # | Item | Correct means |
|---|---|---|
| F1 | Permission created | After sealing, each position has an `ACLseo…`-owned permission account on L1. |
| F2 | Permission delegated | Each permission account's L1 owner becomes `DELeGG…`. |
| F3 | Position delegated | Each position's L1 owner becomes `DELeGG…`. |
| F4 | Fill lands on the rollup | A buy signs a transaction against `:6699` and mutates the position on the rollup. |
| F5 | Same write refused on L1 | The identical `apply_fill` sent to L1 while delegated is rejected. |
| F6 | **Opponent unreadable** | Mid-round, the opponent's `Position` read through `:6699` returns nothing — with a signed token and without one. |
| F7 | **The gate is the ACL, not a closed door** | A delegated position with **no** permission is served by `:6699`; a sealed one is refused. Proves access control rather than a blanket refusal. |
| F8 | Own position readable | The owner, holding a token from `/auth/challenge` + `/auth/login`, reads their own position through `:6699`. |
| F9 | Auth is a wallet signature | The token is obtained by signing a challenge. No secret in the client, no proxy holding a key. |
| F10 | Client never reads the opponent | The app makes no request for the opponent's position before settlement. Verified in the network log, not by reading source. |
| F11 | Commit | After the buzzer, both positions commit back: L1 owner returns to the program and the rollup's fills are present on L1. |
| F12 | Commit is one position per transaction | Two positions in one commit exceeds a transaction; each is committed separately. Both land even when both players traded. |
| F13 | Reveal after settlement | The opponent's committed position and the tape are readable once settled. |

## G — The private book (fills)

| # | Item | Correct means |
|---|---|---|
| G1 | Buy spends quote | A buy debits exactly the quote asked for and credits base from the curve. |
| G2 | Buy pays impact | Average fill price is above the pre-fill mid, and under 1% at half size for `BOOK_DEPTH = 64`. |
| G3 | Book is per player | A fill moves only the filling player's book. The opponent's reserves are untouched. |
| G4 | Overdraw refused | A buy larger than the quote balance fails with `InsufficientQuote`. |
| G5 | Sell realises PnL | Selling after the mark rises produces positive realised PnL, at an exit price below the mark by its own impact. |
| G6 | Oversell refused | Selling more base than held fails with `InsufficientBase`. |
| G7 | Open position closes at the buzzer | Settlement appends a `SETTLE` fill at the real exit price and zeroes `base_qty`. |
| G8 | Client PnL equals chain PnL | The percentage on screen matches `Position::pnl_bps` for the same mark. |

## H — Mark price

| # | Item | Correct means |
|---|---|---|
| H1 | Mark tracks the live market | During a round, the on-chain `PriceFeed` moves toward the live pump.fun / Jupiter price. |
| H2 | Permissionless | A wallet that is not the creator can post the mark. |
| H3 | Rate limited | A post more than 5% from the last is rejected with `PriceJump`. |
| H4 | Interval enforced | A second post within the same second is rejected with `PriceTooSoon`. |
| H5 | No posting after the buzzer | A post after expiry is rejected with `MatchExpired`. |
| H6 | Losing the race is not an error | Two crankers running at once do not surface an error to either player. |

## I — Live round screen

| # | Item | Correct means |
|---|---|---|
| I1 | Market identity | Logo, ticker and feed name match the match account. |
| I2 | Clock | Counts down from the real `duration` and reaches 0 at expiry. |
| I3 | Chart | Plots the real posted marks, one point per poll, no synthetic walk. |
| I4 | Pot | Equals the on-chain pot. |
| I5 | LONG | Signs a fill and the position updates on screen from chain state. |
| I6 | CLOSE | Sells the whole position; label returns to FLAT. |
| I7 | Opponent is fogged | Only a fill **count** is shown — never their size, side, price or PnL. |
| I8 | Sealed indicator | Reflects the real on-chain ACL, read back, not an optimistic flag. |
| I9 | Busy state | Buttons disable during a signature and re-enable after. |
| I10 | Error surfacing | A rejected transaction shows a specific human message, not a raw hex code. |

## J — Reveal

| # | Item | Correct means |
|---|---|---|
| J1 | Curtain | Plays once and always resolves, including in a background tab. |
| J2 | Result | Winner, both PnLs and payout match the chain. |
| J3 | Opponent tape | Their fills are visible only here, after settlement. |

## K — Feed, leaderboard, modes, quests

| # | Item | Correct means |
|---|---|---|
| K1 | Feed | Rows are real settled tapes, newest first, matching chain. |
| K2 | Feed empty state | With no tapes it says so rather than showing invented rows. |
| K3 | Leaderboard | Ranks real `PlayerStats` by lamports taken. |
| K4 | Podium | Top three match the rows beneath. |
| K5 | Modes | Available modes are the ones that exist; anything unbuilt is marked SOON, not presented as playable. |
| K6 | Quests | Progress derives from real on-chain stats. |

## L — Proof and health

| # | Item | Correct means |
|---|---|---|
| L1 | `/proof` without a wallet | All panels populate from chain. |
| L2 | Delegation evidence | Reports actual account owners; a sealed match reads as sealed. |
| L3 | Tx feed | Real signatures from the program, and says so honestly if the ledger has been pruned. |
| L4 | `/health` | Cluster name, endpoints, reachability and latency, all measured. |
| L5 | Cluster honesty | Says plainly that the local gate is not a TEE. |

## M — Failure and edge cases

| # | Item | Correct means |
|---|---|---|
| M1 | L1 down | The app reports the cluster unreachable and does not white-screen. |
| M2 | Rollup down | Live-round polling degrades with a message; the app stays usable. |
| M3 | Market feed down | Covered in C8; the rest of the app keeps working. |
| M4 | Rejected signature | Cancelling in the wallet returns to a usable state with a clear message. |
| M5 | Reload mid-round | Reloading during a live round recovers the round from chain, not from memory. |
| M6 | Two tabs | The same wallet in two tabs does not corrupt state. |
| M7 | Proxy refuses non-market routes | `/evil/...` returns 403. It is not an open relay. |

## N — Static and build

| # | Item | Correct means |
|---|---|---|
| N1 | `npm run check` | typecheck, token drift, series, fog, errors, preflight — all pass. |
| N2 | Anchor suites | `fogduel`, `er-privacy`, `permission` all pass against the deployed program. |
| N3 | Script suites | `verify:client`, `prove:privacy`, `check:sealed`, `check:gate`, `check:markets` all pass. |
| N4 | No mocks | No `Math.random` price/PnL, no hardcoded feed/board/ticker, no fixture markets in the shipped app. |

---

## Results

Filled in during Phase 2. `PASS` only when the real result matches the row
above exactly.
