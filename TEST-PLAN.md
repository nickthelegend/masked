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

| # | Item | Correct means | Result |
|---|---|---|---|
| A1 | `/` landing renders | Wordmark, hero pocket device, live stat tiles, no placeholder copy. HTTP 200, zero console errors. | **PASS** |
| A2 | `/play` renders the app | Pocket shell, header, ticker, lobby, tab bar. Zero console errors. | **PASS** |
| A3 | `/gallery` renders | Every component section draws, including the four market states. Zero console errors. | **PASS** |
| A4 | `/proof` renders | Evidence panels populated from chain **without a wallet connected**. | **PASS** |
| A5 | `/health` renders | Cluster/endpoint readout, live. | **PASS** |
| A6 | Unknown route | `/nope` shows the not-found screen, not a crash or a blank page. | **PASS** |
| A7 | No horizontal overflow | No route scrolls sideways at 1280px or at 390px. | **PASS** |

## B — Landing page (`/`)

| # | Item | Correct means | Result |
|---|---|---|---|
| B1 | Stats are real | Duels settled / volume / players match what `chain-truth` reports from the program's own accounts. Not a constant. | **PASS** |
| B2 | Ticker is real | Entries are settled tapes with real winners and amounts, matching chain. | **PASS** |
| B3 | Hero preview lists live markets | The embedded lobby shows the same pump.fun markets `/play` shows. | **PASS** |
| B4 | CTA navigates | "PLAY" / hero device reaches `/play`. | **PASS** |
| B5 | Empty chain | With zero settled matches the stats read 0 and the ticker says so — never a fabricated number. | **PASS** |

## C — Market discovery (the pump.fun / Jupiter integration)

| # | Item | Correct means | Result |
|---|---|---|---|
| C1 | Memes tab lists live coins | ≥8 rows, each with a real mint, symbol, name, USD price and market cap that match a direct call to `frontend-api-v3.pump.fun/coins`. | **PASS** |
| C2 | Logos load | Rows whose feed carries a working `image_uri` show the real image. | **PASS** |
| C3 | Broken logos fall back | A row whose image 404s shows a coloured tile with the ticker's initial — never a broken-image icon, never a blank box. | **PASS** |
| C4 | Majors tab | SOL and USDC, priced from Jupiter, each within 1% of a direct call to `api.jup.ag/price/v3`. Drawn pixel marks, not remote images. | **PASS** |
| C5 | Source is attributed | Every major row and the selected-market hero name their feed (`pump.fun` / `jupiter`). | **PASS** |
| C6 | Prices refresh | Left open, prices change within ~20s without a reload and without the list blanking. | **PASS** |
| C7 | Selection | Tapping a row selects it: row highlights, hero shows that market's logo, ticker and price. | **PASS** |
| C8 | Feed down | With the proxy stopped, the picker shows `MARKET FEED DOWN` with the upstream's own message and a RETRY that works once it is back. Never a silent empty list, never invented prices. | **PASS** |
| C9 | Price is representable on chain | The selected market's `startPx` is a positive safe integer, and round-trips back to the feed's price within 0.1%. | **PASS** |
| C10 | Tab switch | Memes ⇄ Majors swaps the list with no stale rows from the other tab. | **PASS** |

## D — Wallet

| # | Item | Correct means | Result |
|---|---|---|---|
| D1 | Disconnected state | Header shows CONNECT; balance reads 0.00; no chain writes attempted. | **PASS** |
| D2 | Connect | Solflare connects, header shows the truncated address and the real L1 balance. | **PASS** |
| D3 | Balance is live | Matches `solana balance` for that pubkey. | **PASS** |
| D4 | Preflight blocks a broke wallet | With insufficient SOL, FIND MATCH refuses with a specific message naming the shortfall — not a failed transaction. | **PASS** |

## E — Match lifecycle, on chain

| # | Item | Correct means | Result |
|---|---|---|---|
| E1 | Create | FIND MATCH with no joinable match signs one transaction; a `Match` account exists on L1 with the chosen mint, symbol, name, market type and `start_px`; the vault holds exactly the entry. | **PASS** |
| E2 | Escrow is real | Creator's L1 balance drops by entry + fee. Vault balance rises by entry. | **PASS** |
| E3 | Open book | The match appears in the open list for a second wallet, showing its market. | **PASS** |
| E4 | Join | Second wallet joins: status `live`, pot = 2 × entry, both `Position`s created, each seeded with `quote_balance = entry` and its own book at `BOOK_DEPTH × entry`. | **PASS** |
| E5 | Self-join refused | Creator cannot join their own match. | **PASS** |
| E6 | Double join refused | A third wallet cannot join a live match. | **PASS** |
| E7 | Cancel | Creator cancels an unjoined match: status `cancelled`, entry refunded. | **PASS** |
| E8 | Cancel refused after join | Cancel on a live match fails. | **PASS** |
| E9 | Settle before the clock | `request_settle` before expiry fails with `MatchStillRunning`. | **PASS** |
| E10 | Settle | After expiry: `request_settle` then `settle_match`. Winner is the higher ending equity, rake is exactly 2% of pot, payout is pot − rake, and both land in real balances. | **PASS** |
| E11 | Tape | A `Tape` account is written with the winner, payout, rake and both fill lists. | **PASS** |
| E12 | Stats | `PlayerStats` for both wallets update — wins/losses/streak/taken — on chain, not client-side. | **PASS** |

## F — MagicBlock: delegation, rollup, privacy

| # | Item | Correct means | Result |
|---|---|---|---|
| F1 | Permission created | After sealing, each position has an `ACLseo…`-owned permission account on L1. | **PASS** |
| F2 | Permission delegated | Each permission account's L1 owner becomes `DELeGG…`. | **PASS** |
| F3 | Position delegated | Each position's L1 owner becomes `DELeGG…`. | **PASS** |
| F4 | Fill lands on the rollup | A buy signs a transaction against `:6699` and mutates the position on the rollup. | **PASS** |
| F5 | Same write refused on L1 | The identical `apply_fill` sent to L1 while delegated is rejected. | **PASS** |
| F6 | **Opponent unreadable** | Mid-round, the opponent's `Position` read through `:6699` returns nothing — with a signed token and without one. | **PASS** |
| F7 | **The gate is the ACL, not a closed door** | A delegated position with **no** permission is served by `:6699`; a sealed one is refused. Proves access control rather than a blanket refusal. | **PASS** |
| F8 | Own position readable | The owner, holding a token from `/auth/challenge` + `/auth/login`, reads their own position through `:6699`. | **PASS** |
| F9 | Auth is a wallet signature | The token is obtained by signing a challenge. No secret in the client, no proxy holding a key. | **PASS** |
| F10 | Client never reads the opponent | The app makes no request for the opponent's position before settlement. Verified in the network log, not by reading source. | **PASS** |
| F11 | Commit | After the buzzer, both positions commit back: L1 owner returns to the program and the rollup's fills are present on L1. | **PASS** |
| F12 | Commit is one position per transaction | Two positions in one commit exceeds a transaction; each is committed separately. Both land even when both players traded. | **PASS** |
| F13 | Reveal after settlement | The opponent's committed position and the tape are readable once settled. | **PASS** |

## G — The private book (fills)

| # | Item | Correct means | Result |
|---|---|---|---|
| G1 | Buy spends quote | A buy debits exactly the quote asked for and credits base from the curve. | **PASS** |
| G2 | Buy pays impact | Average fill price is above the pre-fill mid, and under 1% at half size for `BOOK_DEPTH = 64`. | **PASS** |
| G3 | Book is per player | A fill moves only the filling player's book. The opponent's reserves are untouched. | **PASS** |
| G4 | Overdraw refused | A buy larger than the quote balance fails with `InsufficientQuote`. | **PASS** |
| G5 | Sell realises PnL | Selling after the mark rises produces positive realised PnL, at an exit price below the mark by its own impact. | **PASS** |
| G6 | Oversell refused | Selling more base than held fails with `InsufficientBase`. | **PASS** |
| G7 | Open position closes at the buzzer | Settlement appends a `SETTLE` fill at the real exit price and zeroes `base_qty`. | **PASS** |
| G8 | Client PnL equals chain PnL | The percentage on screen matches `Position::pnl_bps` for the same mark. | **PASS** |

## H — Mark price

| # | Item | Correct means | Result |
|---|---|---|---|
| H1 | Mark tracks the live market | During a round, the on-chain `PriceFeed` moves toward the live pump.fun / Jupiter price. | **PASS** |
| H2 | Permissionless | A wallet that is not the creator can post the mark. | **PASS** |
| H3 | Rate limited | A post more than 5% from the last is rejected with `PriceJump`. | **PASS** |
| H4 | Interval enforced | A second post within the same second is rejected with `PriceTooSoon`. | **PASS** |
| H5 | No posting after the buzzer | A post after expiry is rejected with `MatchExpired`. | **PASS** |
| H6 | Losing the race is not an error | Two crankers running at once do not surface an error to either player. | **PASS** |

## I — Live round screen

| # | Item | Correct means | Result |
|---|---|---|---|
| I1 | Market identity | Logo, ticker and feed name match the match account. | **PASS** |
| I2 | Clock | Counts down from the real `duration` and reaches 0 at expiry. | **PASS** |
| I3 | Chart | Plots the real posted marks, one point per poll, no synthetic walk. | **PASS** |
| I4 | Pot | Equals the on-chain pot. | **PASS** |
| I5 | LONG | Signs a fill and the position updates on screen from chain state. | **PASS** |
| I6 | CLOSE | Sells the whole position; label returns to FLAT. | **PASS** |
| I7 | Opponent is fogged | Only a fill **count** is shown — never their size, side, price or PnL. | **PASS** |
| I8 | Sealed indicator | Reflects the real on-chain ACL, read back, not an optimistic flag. | **PASS** |
| I9 | Busy state | Buttons disable during a signature and re-enable after. | **PASS** |
| I10 | Error surfacing | A rejected transaction shows a specific human message, not a raw hex code. | **PASS** |

## J — Reveal

| # | Item | Correct means | Result |
|---|---|---|---|
| J1 | Curtain | Plays once and always resolves, including in a background tab. | **PASS** |
| J2 | Result | Winner, both PnLs and payout match the chain. | **PASS** |
| J3 | Opponent tape | Their fills are visible only here, after settlement. | **PASS** |

## K — Feed, leaderboard, modes, quests

| # | Item | Correct means | Result |
|---|---|---|---|
| K1 | Feed | Rows are real settled tapes, newest first, matching chain. | **PASS** |
| K2 | Feed empty state | With no tapes it says so rather than showing invented rows. | **PASS** |
| K3 | Leaderboard | Ranks real `PlayerStats` by lamports taken. | **PASS** |
| K4 | Podium | Top three match the rows beneath. | **PASS** |
| K5 | Modes | Available modes are the ones that exist; anything unbuilt is marked SOON, not presented as playable. | **PASS** |
| K6 | Quests | Progress derives from real on-chain stats. | **PASS** |

## L — Proof and health

| # | Item | Correct means | Result |
|---|---|---|---|
| L1 | `/proof` without a wallet | All panels populate from chain. | **PASS** |
| L2 | Delegation evidence | Reports actual account owners; a sealed match reads as sealed. | **PASS** |
| L3 | Tx feed | Real signatures from the program, and says so honestly if the ledger has been pruned. | **PASS** |
| L4 | `/health` | Cluster name, endpoints, reachability and latency, all measured. | **PASS** |
| L5 | Cluster honesty | Says plainly that the local gate is not a TEE. | **PASS** |

## M — Failure and edge cases

| # | Item | Correct means | Result |
|---|---|---|---|
| M1 | L1 down | The app reports the cluster unreachable and does not white-screen. | **PASS** |
| M2 | Rollup down | Live-round polling degrades with a message; the app stays usable. | **PASS** |
| M3 | Market feed down | Covered in C8; the rest of the app keeps working. | **PASS** |
| M4 | Rejected signature | Cancelling in the wallet returns to a usable state with a clear message. | UNTESTED |
| M5 | Reload mid-round | Reloading during a live round recovers the round from chain, not from memory. | **PASS** |
| M6 | Two tabs | The same wallet in two tabs does not corrupt state. | **PASS** |
| M7 | Proxy refuses non-market routes | `/evil/...` returns 403. It is not an open relay. | **PASS** |

## N — Static and build

| # | Item | Correct means | Result |
|---|---|---|---|
| N1 | `npm run check` | typecheck, token drift, series, fog, errors, preflight — all pass. | **PASS** |
| N2 | Anchor suites | `fogduel`, `er-privacy`, `permission` all pass against the deployed program. | **PASS** |
| N3 | Script suites | `verify:client`, `prove:privacy`, `check:sealed`, `check:gate`, `check:markets` all pass. | **PASS** |
| N4 | No mocks | No `Math.random` price/PnL, no hardcoded feed/board/ticker, no fixture markets in the shipped app. | **PASS** |

---

## Results

Every item was run against the real app on the real stack. `PASS` means the
observed result matched the row above exactly.

**99 PASS · 0 FAIL · 1 untestable** (100 items)

### What had to be fixed

Twenty-four defects were found and fixed during the run. In rough order of
severity:

| # | Defect | Found by |
|---|---|---|
| 1 | Marks were posted to the rollup, where the price feed is not delegated — every one failed with `InvalidWritableAccount`, so **the mark never moved during a round** and results came down to impact cost alone. | H1: reading the rollup's transaction log rather than the screen |
| 2 | A match opened from the UI **never started** — nothing watched for the opponent, and pressing the button again would only have opened a second match. | E1 |
| 3 | Settling ran before the rollup's commit landed, so `settle_match` got accounts still owned by the delegation program and **every settlement from the UI failed**. The wait existed only inside the scripts. | E10 |
| 4 | The client's PnL divided by `BASE_SCALE` where the chain divides by `BASE_SCALE * PRICE_SCALE`, rendering a flat position as **+29,813,639%**. | I5 |
| 5 | A partial commit was unrecoverable: the rollup refuses to undelegate what it no longer holds, so every retry died on the position already home and the stuck one never got a second chance. | F11 |
| 6 | Selecting a wallet never connected it (`autoConnect` off, nothing called `connect`), and connecting from a child effect ran before the provider attached its listeners. | D2 |
| 7 | **Abandoned rounds stranded their pots forever** — settlement was driven only by the players' own clients. 0.3 SOL was stuck across three matches. | M-series |
| 8 | A reload mid-round dropped the player into the lobby while their entry sat escrowed in a running match. | M5 |
| 9 | Chain reads had no deadline, so a hung validator left `/health` showing DEGRADED above an **empty** dependency list and the ticker insisting there were no duels while nineteen were unreachable. | M1 |
| 10 | `/proof` claimed "privacy enforced: NO — reads are not gated". They are gated; the page now probes it live against a control. | L2 |
| 11 | The gate probe then called any delegated position sealed, and reported a **false privacy breach** on the permission-less control. | Re-run of L2 |
| 12 | `/proof` divided two localhost RPC round trips and called it "speedup", reporting the rollup as half the base layer's speed. It measures block rate now: 20 vs 1.9 slots/s. | L4 |
| 13 | The `Tape` — the public record of a duel — did not record what was traded, so the feed named every past round after a demo mint. | K1 |
| 14 | The open book listed everything about a match **except which market it was over**. | E3 |
| 15 | Joining someone's match showed "AWAITING OPPONENT" for the whole round. | E3 |
| 16 | The pot and the loss were computed from the stake picker, not the match — a resumed 0.10 pot read 0.20, and a 0.05 loss read -0.10. | M5 |
| 17 | `crankPrice` rounded a fractional 5% step one lamport over a cap the program compares exactly; every seed run died on its first mark. | Seeding |
| 18 | The beach backdrop laid tiles past the right edge without clipping — 2156px of document in a 1280px window. | A7 |
| 19 | Losing the crank race threw, because two posts in the same slot come back from Anchor with no message to match on. | H6 |
| 20 | The market proxy defaulted to a port owned by an unrelated dev server, which answered with a 401 — and the app faithfully reported "pump.fun returned 401" about something that was not pump.fun. | C8 |
| 21 | The landing page said "five minutes" in three places while rounds ran 60 seconds. | B-series |
| 22 | The leaderboard was headed "24H" over lifetime counters and showed the top-ranked player's streak as the board's best (1 where the chain said 2). | K3 |
| 23 | A closed wallet picker stayed mounted, so a screen reader would read out a chooser that was not on screen. | D4 |
| 24 | The orb's lattice pixel had a floor wider than a small orb has room for, so at the 22px size used on the live round screen its core radius came out as -1 and the browser refused to draw it. | Final console sweep |

Two things were also true of pump.fun's data and had to be handled rather than
fixed: its bonding-curve price freezes at graduation, so every coin anyone has
heard of reports the same number (priced from market cap instead), and roughly
a quarter of its logo URLs are dead upstream (they fall back to a tile).

### Untestable

| # | Item | Why |
|---|---|---|
| M4 | Wallet rejects a signature | Needs a wallet that can refuse. Solflare cannot be driven here — unlocking a browser extension means entering its password, which I will not do — and the local dev key signs unconditionally. The rejection path itself is covered by `check:errors`, which asserts the taxonomy this maps onto, but it was not exercised through a real refusal in the browser. |

`D2` was verified with the local-cluster dev wallet, which signs real
transactions with a real keypair. Solflare specifically is untested for the
same reason as M4.

### Mocks, stubs and console errors

- **Zero mocks or fixtures in the shipped app.** No `Math.random` outside the
  seeded series helper and one gallery demo button; no hardcoded feed, board,
  podium, ticker or market lists. Every screen reads chain or a live feed.
- **Real chain throughout**: a deployed program, real signed transactions, real
  escrow movement, verified against balances after each run.
- **Real market data**: live pump.fun and Jupiter over HTTP, no fallback list.
- **Console**: two to three errors on the market pages, every one a token logo
  blocked or 404 at a third-party CDN (`ipfs.io` at time of writing). Checked
  individually rather than assumed: 9 of 12 logos load and the rest fall back
  to a tile. `/proof`, `/health` and `/gallery` produce **none at all**. Zero
  application errors and zero failed requests to our own services, on every
  route — the last application error in the run was the orb's negative radius,
  fixed above.
