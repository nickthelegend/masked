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
| A1 | `GET /` | 200; landing renders wordmark, hero headline "TAKE THE POT.", CTA row, live stat tiles, ticker, how-it-works, modes grid, last reveals, footer | **P** |
| A2 | `GET /play` | 200; PocketShell renders with header, ticker, duel lobby, 5-tab bar | **P** |
| A3 | `GET /proof` | 200; 4 ProofPanels + tx feed + "what this cluster does not do" | **P** |
| A4 | `GET /health` | 200; 5 dependency rows + build panel + RE-CHECK | **P** |
| A5 | `GET /gallery` | 200; every library component section renders | **P** |
| A6 | `GET /nonexistent` | Does not white-screen; renders something (expo-router 404 or a route) with no uncaught console error | **P** (fixed) |
| A7 | Browser back/forward across routes | History works; each route re-renders correctly, no stale content | **P** |

## B. LANDING (`/`)

| # | Item | Correct means | Status |
|---|---|---|---|
| B1 | Live stat tiles | Values read from chain, not constants. OPEN FOGS / PAID OUT / DUELS SETTLED show integers + SOL matching on-chain reality | **P** |
| B2 | Stats match chain | Rendered numbers equal a direct RPC query of Match/Tape accounts | **P** |
| B3 | LAST REVEALS cards | Render real settled tapes: shortened wallet addresses (`xxxx…xxxx`), real PnL %, real pot in ◎ | **P** |
| B4 | PLAY / PLAY FREE buttons | Navigate to `/play` | **P** |
| B5 | HOW IT WORKS button | Scrolls to the explainer section, does NOT navigate | **P** (fixed) |
| B6 | Nav CONNECT button | Present; renders "CONNECT" when no wallet | **P** |
| B7 | Hero device is interactive | Stake picker inside the shell changes selected stake | **P** |
| B8 | Ticker | Scrolls continuously, no wrap onto a second line, no ellipsis | **P** (fixed) |
| B9 | Responsive ≥900px | Two-column hero (copy left, device right) | **P** |
| B10 | Responsive <900px | Single column, stacked, no horizontal page scroll | **P** |

## C. DUEL — `/play` lobby

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Lobby renders | Token panel, mask, stake picker, FIND MATCH, tagline | **P** |
| C2 | Stake picker | Clicking 1/5/25/100 changes selection; the "WINNER TAKES" line recomputes to `stake × 2 × 0.98` | **P** (fixed) |
| C3 | Balance chip | Shows 0.00 with no wallet; does not show a fabricated number | **P** |
| C4 | FIND MATCH without wallet | Moves to matchmaking (no tx attempted); no console error | **P** |
| C5 | Tab navigation | All 5 tabs switch content; active tab is visually distinct | **P** |

## D. DUEL — matchmaking / open book

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | OPEN BOOK lists real matches | Each row = a real on-chain `Match` with status `open`; count badge matches row count | **P** |
| D2 | Book matches chain | Rows equal a direct RPC query for open matches (same count, same stakes) | **P** |
| D3 | Row content | Shortened creator, stake in ◎ to 2dp, duration in s, age label | **P** |
| D4 | OPEN A MATCH without wallet | Shows "CONNECT A WALLET" toast; no transaction attempted; no console error | **P** |
| D5 | JOIN without wallet | Same guard — toast, no tx, no console error | **P** |
| D6 | Empty book state | With zero open matches, shows the explicit empty line, not a blank area | **P** |
| D7 | Book updates live | Opening a match externally makes a new row appear within one poll interval | **P** |

## E. DUEL — live round (driven on-chain, headless)

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | LONG opens a position | On-chain `base_qty` > 0, `fill_count` +1, fill side BUY | **P** |
| E2 | CLOSE realizes | `base_qty` → 0, `realized` changes by (exit − avg) × qty | **P** |
| E3 | Overdraw rejected | A buy beyond quote balance fails with code 6007 | **P** |
| E4 | Fill after expiry rejected | Fails with code 6005 | **P** |
| E5 | Opponent stays fogged | Opponent panel shows a fill count only — never size, side, price or PnL | **P** |
| E6 | Settle before expiry rejected | `request_settle` fails with 6004 | **P** |
| E7 | Open position settles | At settle, `base_qty` → 0 and a SETTLE fill is appended | **P** |

## F. SETTLEMENT & PAYOUT

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | Winner paid | Winner balance increases by exactly `pot − rake` | **P** |
| F2 | Rake exact | Treasury increases by exactly `pot × 200 / 10000` | **P** |
| F3 | Tie-break deterministic | `pnl_a == pnl_b` ⇒ creator wins (documented rule) | **P** |
| F4 | Tape written | Public `Tape` exists with winner, both PnLs, both fill lists | **P** |
| F5 | PlayerStats updated | Winner wins+1, streak+1, taken+=payout; loser losses+1, streak→0 | **P** |
| F6 | best_streak monotonic | Never decreases on a loss | **P** |

## G. EPHEMERAL ROLLUP

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | Delegation transfers ownership | L1 owner of Position becomes `DELeGG…` | **P** |
| G2 | Writable on ER | `apply_fill` succeeds against :7799 | **P** |
| G3 | Rejected on L1 while delegated | Same fill against :8999 fails | **P** |
| G4 | Commit returns state | After undelegate, L1 owner is the program AND the ER fill is present on L1 | **P** |
| G5 | Settle works post-undelegate | `settle_match` succeeds and pays | **P** |

## H. PRIVACY / PER

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | Permission created on L1 | `Permission` PDA exists, owner `ACLseo…`, member = position owner | **P** |
| H2 | Permission delegated | Permission account present on the ER | **P** |
| H3 | Client fog guard | `assertFogIntact` throws in lobby/searching/live, passes in reveal | **P** |
| H4 | UI never shows opponent PnL mid-round | Opponent panel shows blocks + fill count only | **P** |
| H5 | TEE read-blocking | Opponent read refused at ingress | **needs a TEE cluster** |

## I. `/proof`

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | CLUSTER panel | Real endpoints, real validator, and an honest privacy verdict (red NO on non-TEE) | **P** |
| I2 | LATENCY panel | Two measured medians + a speedup, all numeric, updating | **P** |
| I3 | PROGRAMS panel | The three real program IDs | **P** |
| I4 | SETTLED panel | Counts equal chain reality | **P** |
| I5 | TX FEED | Real signatures with instruction names parsed from logs | **P** (fixed) |
| I6 | TX FEED links | Each row links to an explorer URL carrying the right cluster | **P** |
| I7 | Honesty section | States plainly that reads are not gated without a TEE | **P** |

## J. `/health`

| # | Item | Correct means | Status |
|---|---|---|---|
| J1 | All dependencies up | 5 rows green with real slot numbers / deployed | **P** |
| J2 | Badge reflects state | "ALL SYSTEMS UP" when all green | **P** |
| J3 | Down detection | With a dependency unreachable, that row goes red with a reason | **P** |
| J4 | RE-CHECK | Re-runs checks, values refresh | **P** |

## K. `/gallery`

| # | Item | Correct means | Status |
|---|---|---|---|
| K1 | All sections render | Type, buttons, panels, icons, badges, bars, overlays, avatars, orbs, charts, HUD, tape, card, podium, modes, quests, ticker, tabbar, motion, proofpanel, shell | **P** |
| K2 | Drawn icons | 7 SVG icons render as pixel art, not fallback glyphs | **P** |
| K3 | Buzzer demo | FIRE BUZZER plays the curtain and resets | **P** (fixed) |
| K4 | Odometer demo | ROLL PNL animates to a new value | **P** |
| K5 | Toast demos | Both toasts appear with correct tone and copy | **P** (fixed) |
| K6 | Fog conceals | The FOGGED tile hides its content | **P** |

## L. ERROR HANDLING

| # | Item | Correct means | Status |
|---|---|---|---|
| L1 | Error taxonomy | All 15 program codes + 9 patterns map to human titles | **P** |
| L2 | Retry policy | Retryable failures retry; non-retryable do not | **P** |
| L3 | Preflight guards | Wallet / balance / cluster / program checked before a tx is built | **P** |
| L4 | Error boundary | A thrown render error shows the fallback, not a white screen | **P** |
| L5 | RPC down | With L1 unreachable, UI degrades with a message, no uncaught error | **P** (fixed) |

## M. INTEGRATIONS

| # | Item | Correct means | Status |
|---|---|---|---|
| M1 | Solflare adapter | Registered; CONNECT present; no auto-connect iframe hijack on load | **P** |
| M2 | Wallet connect flow | Clicking CONNECT initiates Solflare | **needs a real Solflare wallet** |
| M3 | Mobile adapter stub | Metro resolves `@solana-mobile/*` without bundle error | **P** |
| M4 | web3.js polyfills | Buffer/getRandomValues present; no polyfill error in console | **P** |

## N. BUILD / VERIFICATION SUITES

| # | Item | Correct means | Status |
|---|---|---|---|
| N1 | `npm run typecheck` | Zero errors | **P** |
| N2 | `check:tokens` | 61 values identical to `ui/tokens.js` | **P** |
| N3 | `check:series` | 30 toEnd cases land exactly | **P** |
| N4 | `check:fog` | 14 assertions | **P** |
| N5 | `check:errors` | 14 assertions | **P** |
| N6 | `check:preflight` | 15 assertions against the live cluster | **P** |
| N7 | `anchor test` | 20 passing | **P** |
| N8 | `verify:client` | Full match through the app's own client | **P** |
| N9 | `prove:privacy` | Runs to completion with an honest verdict | **P** |
| N10 | No mocks/stubs | No `Math.random` simulation, no hardcoded feed/board, in the shipped app path | **P** (fixed) |


---

# RESULTS

**72 PASS · 0 FAIL · 2 UNTESTABLE** (74 items)

Re-run top to bottom after every fix. Final sweep: zero console errors, zero
failed network requests (`performance.getEntriesByType('resource')` → all 200),
20/20 on-chain tests, 5/5 assertion suites, both verification scripts green.

## Defects found and fixed (11)

| Item | Defect | Root-cause fix |
|---|---|---|
| global | `useNativeDriver: true` warned on every animation; react-native-web has no native driver | `USE_NATIVE_DRIVER` declares the truth per platform |
| global | `pointerEvents` passed as a deprecated prop in 5 components | moved into `style` |
| I5 | /proof transaction feed empty despite 22 settled matches | validator had pruned its ledger; `--limit-ledger-size` set and documented, and the empty state now distinguishes LEDGER PRUNED from no activity |
| K3 | reveal curtain never cleared — alt-tabbing mid-reveal left it covering the whole UI | completion is timer-driven; rAF does not fire in a hidden tab |
| K5 | toasts never auto-dismissed for the same reason | removal is timer-driven, animation is decoration |
| C2 | UI labelled stakes `$5` while the program escrowed **5 SOL** | `sol()` formatter, presets re-based to 0.05–1 SOL |
| B8 | ticker was hardcoded fake handles and dollar amounts | `useTickerItems` composes from real tapes / stats / book |
| B5 | HOW IT WORKS scrolled nowhere — cached `onLayout` offset was stale | measures at press time; Box/Row/Stack forward refs |
| A6 | unknown routes showed expo-router's unstyled default | branded `+not-found` with working links |
| L5 | with the RPC down the app reported "0 DUELS SETTLED" as fact | `reachable` flag; unknown renders as "—", ticker says the cluster is unreachable |
| N10 | quests had hardcoded progress; fake opponent handle; two feed filters that filtered nothing | quests derived from `PlayerStats`, `AWAITING OPPONENT`, filters are real predicates |

## Untestable (2) — stated, not marked green

- **H5 — TEE read-blocking.** Requires a TEE validator. The local
  `ephemeral-validator` has no ingress gate, and reaching
  `devnet-tee.magicblock.app` needs devnet SOL, which every public faucet
  currently refuses. The ACL itself is created, delegated and verified on
  chain (H1–H3 pass); only the enforcement step is unverified.
- **M2 — wallet connect round trip.** Requires a real Solflare wallet with a
  key. The adapter is registered and the button renders and guards correctly
  (M1 passes); the signature round trip is not exercised.

## Mock / stub statement

Zero mocks and zero stubs remain in the shipped app path. Every number the UI
renders is read from chain and was cross-checked against a direct RPC query
(`npm run truth`): landing showed 3 open / 2.55◎ paid / 12 settled against
chain truth of 3 / 2.548 / 12.

Two deliberate, disclosed exceptions, neither in a user-facing data path:
- `src/chain/shims/empty.js` — a functional stub for `@solana-mobile/*`, which
  `@solana/wallet-adapter-react` imports unconditionally. The demo is web-only
  (documented in the README); this is not a stand-in for real logic.
- `UIGallery` uses `Math.random()` in a "ROLL PNL" button whose only purpose is
  to demonstrate the odometer component in isolation.

Static content that is copy rather than data — game-mode names and
descriptions (all marked SOON), the how-it-works explainer, the token label —
remains hardcoded, as copy should be.
