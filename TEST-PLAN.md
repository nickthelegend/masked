# FOGDUEL — TEST PLAN

Every route, screen, component, chain instruction and integration, with an
explicit definition of correct. "Correct" means the stated result exactly —
not "the button did something".

**Browser:** the Claude in Chrome extension reports no connected browser
(`list_connected_browsers` → `[]`), so execution uses the in-app Browser pane:
a real Chromium against the real running app, with the same console and
network inspection. Noted rather than silently substituted.

**Global gate applied to every item:** zero console errors and zero failed
network requests during the item. A visible error anywhere fails the item,
even if the UI looks right.

Legend: **P** pass · **F** fail · **U** untestable (stated dependency)

---

## A. ROUTES — every route resolves and renders

| # | Item | Correct means | Status |
|---|---|---|---|
| A1 | `GET /` | 200; landing renders wordmark, hero headline "TAKE THE POT.", CTA row, live stat tiles, ticker, how-it-works, modes grid, last reveals, footer | |
| A2 | `GET /play` | 200; PocketShell renders with header, ticker, duel lobby, 5-tab bar | |
| A3 | `GET /proof` | 200; 4 ProofPanels + tx feed + "what this cluster does not do" | |
| A4 | `GET /health` | 200; 5 dependency rows + build panel + RE-CHECK | |
| A5 | `GET /gallery` | 200; every library component section renders | |
| A6 | `GET /nonexistent` | Does not white-screen; renders something (expo-router 404 or a route) with no uncaught console error | |
| A7 | Browser back/forward across routes | History works; each route re-renders correctly, no stale content | |

## B. LANDING (`/`)

| # | Item | Correct means | Status |
|---|---|---|---|
| B1 | Live stat tiles | Values read from chain, not constants. OPEN FOGS / PAID OUT / DUELS SETTLED show integers + SOL matching on-chain reality | |
| B2 | Stats match chain | Rendered numbers equal a direct RPC query of Match/Tape accounts | |
| B3 | LAST REVEALS cards | Render real settled tapes: shortened wallet addresses (`xxxx…xxxx`), real PnL %, real pot in ◎ | |
| B4 | PLAY / PLAY FREE buttons | Navigate to `/play` | |
| B5 | HOW IT WORKS button | Scrolls to the explainer section, does NOT navigate | |
| B6 | Nav CONNECT button | Present; renders "CONNECT" when no wallet | |
| B7 | Hero device is interactive | Stake picker inside the shell changes selected stake | |
| B8 | Ticker | Scrolls continuously, no wrap onto a second line, no ellipsis | |
| B9 | Responsive ≥900px | Two-column hero (copy left, device right) | |
| B10 | Responsive <900px | Single column, stacked, no horizontal page scroll | |

## C. DUEL — `/play` lobby

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Lobby renders | Token panel, mask, stake picker, FIND MATCH, tagline | |
| C2 | Stake picker | Clicking 1/5/25/100 changes selection; the "WINNER TAKES" line recomputes to `stake × 2 × 0.98` | |
| C3 | Balance chip | Shows 0.00 with no wallet; does not show a fabricated number | |
| C4 | FIND MATCH without wallet | Moves to matchmaking (no tx attempted); no console error | |
| C5 | Tab navigation | All 5 tabs switch content; active tab is visually distinct | |

## D. DUEL — matchmaking / open book

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | OPEN BOOK lists real matches | Each row = a real on-chain `Match` with status `open`; count badge matches row count | |
| D2 | Book matches chain | Rows equal a direct RPC query for open matches (same count, same stakes) | |
| D3 | Row content | Shortened creator, stake in ◎ to 2dp, duration in s, age label | |
| D4 | OPEN A MATCH without wallet | Shows "CONNECT A WALLET" toast; no transaction attempted; no console error | |
| D5 | JOIN without wallet | Same guard — toast, no tx, no console error | |
| D6 | Empty book state | With zero open matches, shows the explicit empty line, not a blank area | |
| D7 | Book updates live | Opening a match externally makes a new row appear within one poll interval | |

## E. DUEL — live round (driven on-chain, headless)

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | LONG opens a position | On-chain `base_qty` > 0, `fill_count` +1, fill side BUY | |
| E2 | CLOSE realizes | `base_qty` → 0, `realized` changes by (exit − avg) × qty | |
| E3 | Overdraw rejected | A buy beyond quote balance fails with code 6007 | |
| E4 | Fill after expiry rejected | Fails with code 6005 | |
| E5 | Opponent stays fogged | Opponent panel shows a fill count only — never size, side, price or PnL | |
| E6 | Settle before expiry rejected | `request_settle` fails with 6004 | |
| E7 | Open position settles | At settle, `base_qty` → 0 and a SETTLE fill is appended | |

## F. SETTLEMENT & PAYOUT

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | Winner paid | Winner balance increases by exactly `pot − rake` | |
| F2 | Rake exact | Treasury increases by exactly `pot × 200 / 10000` | |
| F3 | Tie-break deterministic | `pnl_a == pnl_b` ⇒ creator wins (documented rule) | |
| F4 | Tape written | Public `Tape` exists with winner, both PnLs, both fill lists | |
| F5 | PlayerStats updated | Winner wins+1, streak+1, taken+=payout; loser losses+1, streak→0 | |
| F6 | best_streak monotonic | Never decreases on a loss | |

## G. EPHEMERAL ROLLUP

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | Delegation transfers ownership | L1 owner of Position becomes `DELeGG…` | |
| G2 | Writable on ER | `apply_fill` succeeds against :7799 | |
| G3 | Rejected on L1 while delegated | Same fill against :8999 fails | |
| G4 | Commit returns state | After undelegate, L1 owner is the program AND the ER fill is present on L1 | |
| G5 | Settle works post-undelegate | `settle_match` succeeds and pays | |

## H. PRIVACY / PER

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | Permission created on L1 | `Permission` PDA exists, owner `ACLseo…`, member = position owner | |
| H2 | Permission delegated | Permission account present on the ER | |
| H3 | Client fog guard | `assertFogIntact` throws in lobby/searching/live, passes in reveal | |
| H4 | UI never shows opponent PnL mid-round | Opponent panel shows blocks + fill count only | |
| H5 | TEE read-blocking | Opponent read refused at ingress | **needs a TEE cluster** |

## I. `/proof`

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | CLUSTER panel | Real endpoints, real validator, and an honest privacy verdict (red NO on non-TEE) | |
| I2 | LATENCY panel | Two measured medians + a speedup, all numeric, updating | |
| I3 | PROGRAMS panel | The three real program IDs | |
| I4 | SETTLED panel | Counts equal chain reality | |
| I5 | TX FEED | Real signatures with instruction names parsed from logs | |
| I6 | TX FEED links | Each row links to an explorer URL carrying the right cluster | |
| I7 | Honesty section | States plainly that reads are not gated without a TEE | |

## J. `/health`

| # | Item | Correct means | Status |
|---|---|---|---|
| J1 | All dependencies up | 5 rows green with real slot numbers / deployed | |
| J2 | Badge reflects state | "ALL SYSTEMS UP" when all green | |
| J3 | Down detection | With a dependency unreachable, that row goes red with a reason | |
| J4 | RE-CHECK | Re-runs checks, values refresh | |

## K. `/gallery`

| # | Item | Correct means | Status |
|---|---|---|---|
| K1 | All sections render | Type, buttons, panels, icons, badges, bars, overlays, avatars, orbs, charts, HUD, tape, card, podium, modes, quests, ticker, tabbar, motion, proofpanel, shell | |
| K2 | Drawn icons | 7 SVG icons render as pixel art, not fallback glyphs | |
| K3 | Buzzer demo | FIRE BUZZER plays the curtain and resets | |
| K4 | Odometer demo | ROLL PNL animates to a new value | |
| K5 | Toast demos | Both toasts appear with correct tone and copy | |
| K6 | Fog conceals | The FOGGED tile hides its content | |

## L. ERROR HANDLING

| # | Item | Correct means | Status |
|---|---|---|---|
| L1 | Error taxonomy | All 15 program codes + 9 patterns map to human titles | |
| L2 | Retry policy | Retryable failures retry; non-retryable do not | |
| L3 | Preflight guards | Wallet / balance / cluster / program checked before a tx is built | |
| L4 | Error boundary | A thrown render error shows the fallback, not a white screen | |
| L5 | RPC down | With L1 unreachable, UI degrades with a message, no uncaught error | |

## M. INTEGRATIONS

| # | Item | Correct means | Status |
|---|---|---|---|
| M1 | Solflare adapter | Registered; CONNECT present; no auto-connect iframe hijack on load | |
| M2 | Wallet connect flow | Clicking CONNECT initiates Solflare | **needs a real Solflare wallet** |
| M3 | Mobile adapter stub | Metro resolves `@solana-mobile/*` without bundle error | |
| M4 | web3.js polyfills | Buffer/getRandomValues present; no polyfill error in console | |

## N. BUILD / VERIFICATION SUITES

| # | Item | Correct means | Status |
|---|---|---|---|
| N1 | `npm run typecheck` | Zero errors | |
| N2 | `check:tokens` | 61 values identical to `ui/tokens.js` | |
| N3 | `check:series` | 30 toEnd cases land exactly | |
| N4 | `check:fog` | 14 assertions | |
| N5 | `check:errors` | 14 assertions | |
| N6 | `check:preflight` | 15 assertions against the live cluster | |
| N7 | `anchor test` | 20 passing | |
| N8 | `verify:client` | Full match through the app's own client | |
| N9 | `prove:privacy` | Runs to completion with an honest verdict | |
| N10 | No mocks/stubs | No `Math.random` simulation, no hardcoded feed/board, in the shipped app path | |
