# QA-PLAN — full browser pass, 2026-09-13

Written **before** any item was executed, as the checklist this run is measured
against. It supersedes `TEST-PLAN.md` for this run and reuses its proven items
where the product has not changed. Every item states the specific result that
counts as correct.

## Method

- **What is tested.**
  - The production web export, rebuilt from the current source at 21:34 UTC. It includes the new `src/landing` page.
  - It is served by `npm run serve` on `:4180`.
  - The chain behind it is the local MagicBlock stack, re-created from genesis at 21:34 UTC after the old ledger's base clock drifted 44.4 h behind the rollup:
    - base `mb-test-validator` `:8999`
    - `ephemeral-validator` `:7799`
    - `query-filtering-service` gate `:6699`
    - market proxy `:8791`
  - **Reset again from genesis at 01:11 UTC**, to preload MagicBlock's committor program (Q14). Evidence addresses from before then belong to the ledger kept at `.localnet/ledger-no-committor-20260913T011122Z` (rollup: `.localnet/er-no-committor-20260913T011122Z`) and do not exist on the running chain.
  - **And again at 01:43 UTC**, because the tape-window fix (J9) changes the `Position` and `Tape` layouts. Addresses from 01:11–01:43 belong to `.localnet/ledger-pre-window-20260913T014342Z` (rollup: `.localnet/er-pre-window-20260913T014342Z`).
- **How.**
  - Claude in Chrome, driving the user's real Chrome.
  - Two origins — `127.0.0.1:4180` and `localhost:4180` — give two independent in-page wallets, so two players can duel.
  - On-chain effects are confirmed by reading the chain, not the UI.
- **Pass bar.** An item passes only when all three hold:
  1. the observed result matches **Correct means** exactly;
  2. there are **zero console errors** in that tab during the item (`read_console_messages`, errors only);
  3. there are **zero failed network requests** — no status ≥ 400 and no network error (`read_network_requests`).
- **Browser-extension traffic is not the app.** The Chrome driving this run has wallet extensions that inject scripts into every page. Their requests (`chrome-extension://…`, including a `chrome-extension://invalid/` 503) and their console lines (`[CELL] provider installed…`) are recorded but are outside the tested surface. Every request from the app's own origins and services counts.
- **Fault-injection items.**
  - Marked ⚡.
  - Requests to the one service deliberately stopped are the injected fault and do not fail the item.
  - Anything else that errors does.
- **Status.**
  - **PASS**
  - **FAIL** — the root cause is fixed, then the item is re-run from the start.
  - **UNTESTED** — only when a real external dependency is missing, and it is named.
- **Phase 4.** After every FAIL is fixed, the whole plan is executed again, top to bottom.

---

## A. Environment

| # | Item | Correct means | Status |
|---|---|---|---|
| A1 | Base validator `:8999` | `getHealth` → `ok`; `getSlot` advances between two reads 2 s apart | **PASS** (final run, 02:48 UTC) — `getHealth` → `ok`; `getSlot` 7223 → 7227 across 2 s |
| A2 | Rollup `:7799` | `getHealth` → `ok`; slot advances | **PASS** (final run, 02:48 UTC) — `getHealth` → `ok`; slot 77894 → 77934 across 2 s |
| A3 | Gate `:6699` | `getHealth` → `ok` (refusal behaviour is F4 and Q8) | **PASS** (final run, 02:48 UTC) — `getHealth` → `ok` |
| A4 | Clocks agree | Base and rollup `Clock` sysvar `unix_timestamp` within 60 s of each other and of wall time | **PASS** (final run, 02:49 UTC) — Clock sysvars: base 1789267759, rollup 1789267760, wall 1789267761 — base−rollup −1 s, base−wall −2 s, rollup−wall −1 s |
| A5 | Market proxy `:8791` | `GET /whoami` → exactly `{"service":"masked-market-proxy","upstreams":["/pump/","/jup/"],"imageRelay":"/img?url="}` | **PASS** (final run, 02:48 UTC) — `GET /whoami` → exactly `{"service":"masked-market-proxy","upstreams":["/pump/","/jup/"],"imageRelay":"/img?url="}` |
| A6 | Export server `:4180` | The export server under test (`:4190` in the final run, the same `server/serve-dist.mjs` as `:4180`): `/`, `/play`, `/tape/<any>` → 200 `text/html`; a missing asset → 404; `/../.keys/player-a.json` → 404; POST → 405 | **PASS** (final run, `:4190` serving `.localnet/dist-final`, bundle `entry-48a18129…`, 02:48 UTC) — `/`, `/play`, `/tape/anything` → 200 `text/html; charset=utf-8`; missing asset → 404; `/../.keys/player-a.json` → 404; `POST /` → 405 |
| A7 | fogduel program | `3K3v1bp6…Rj1` executable, with the current build's program data on chain *(plan corrected: the 798,056 bytes written before the crank and tape-window work are now 935,024)* | **PASS** (final run, 02:48 UTC) — `3K3v1bp6…Rj1` `Executable: true`, program data 935,024 bytes, last deployed in slot 61 of the ledger reset at 01:43, authority `3YUg…wsS5`; the same 935,024-byte build is also deployed on devnet (ProgramData `7mcpvZnc…`, slot 497500594, read back from `api.devnet.solana.com`) |
| A8 | Delegation, permission and session programs | `DELeGG…`, `ACLseo…`, `KeyspM2…` all executable | **PASS** (final run, 02:48 UTC) — `DELeGG…aeSh`, `ACLseo…Qnp1`, `KeyspM2…wde5` all `executable: true`, and so is the committor `ComtrB2…dABq` that `localnet.sh` now preloads |
| A9 | Export freshness | `npm run check:build` passes: the bundle names `127.0.0.1:8999`, `127.0.0.1:6699` and the program id, with no scratch port | **PASS** (final run, 02:49 UTC) — `npm run check:build`: 7 assertions — the export points at `http://127.0.0.1:8999` and `http://127.0.0.1:6699`, carries the deployed program id, no scratch-build override; `dist/` and the tested `.localnet/dist-final` are the same bundle (`entry-48a18129…`) |
| A10 | Script keypairs funded | After `localnet.sh`, `player-a` … `player-e` each hold ≥ 5 SOL | **PASS** (final run, 02:48 UTC) — player-a 19.92, player-b 22.96, player-c 20.07, player-d 19.73, player-e 19.88 SOL |

## B. Landing `/`

The landing was replaced by `src/landing` (another session's work). Items are
added from a line-level spec of that code before B is executed; B is
executed last among the routes.

## C. Lobby `/play`

| # | Item | Correct means | Status |
|---|---|---|---|
| C1 | Market list | MEMES lists ≥ 10 pump.fun markets, each with symbol, short mint, USD price and market cap | **FAIL → fixed → PASS** — final run on bundle `entry-7dbee6b1…`: 12 MEMES rows, every one with symbol, short mint (`VEY7…pump · WOFI`), USD price and cap; 38 proxy requests on reload all 200; 0 console errors. The first final-run pass FAILED it: the short mint showed only on rows whose ticker repeated. Fix: `src/ui/MarketRow.tsx` always shows `mint · name`, the mint lit yellow when the ticker is ambiguous |
| C2 | Prices are live | A row's price is within 2% of a direct `/pump/` fetch made at the same moment | **PASS** — final run: direct `frontend-api-v3.pump.fun/coins` fetch at 03:02:41 UTC vs the lobby at 03:02:53: VEY7 $1.6902 / $1.69, LVC9 $0.52000 / $0.5204, vbvt $0.48526 / $0.4856, 12Ra $0.086098 / $0.0861 — all 12 rows within 0.1%, same order |
| C3 | Logos | Every visible row shows its real logo or a letter tile; zero failed image requests; zero console errors | **PASS (after a relay fix found in the final run)** — final bundle on the fixed relay: MEMES 12 of 12 rows paint their real logo, 0 letter tiles, 0 broken; a fresh `/play` plus `MAJORS` made 114 `/img/check` and `/img` requests, every one 200, among them the ipfs.io and arweave logos that failed before; 0 console errors. Before the fix, Fartcoin showed a letter tile because its ipfs.io logo was refused upstream (403/429). Fix: `server/market-proxy.mjs` retries an IPFS logo through `ipfs.filebase.io` then `gateway.pinata.cloud` (same content address, fixed public hosts, CID-validated path), and recognises a PNG/JPEG/GIF/WebP/AVIF body sent with no content type by its first bytes (raster only). Probed on a second instance first: all 10 former tiles 200 `image/*`; P3–P7 refusals unchanged |
| C4 | MAJORS tab | Switches to Jupiter majors (SOL, USDC, …); the list changes; logos load | **PASS (after the same relay fix)** — final bundle on the fixed relay: MAJORS lists 40 Jupiter markets (SOL $101.59, tSAT, USDC, …); 38 real logos plus SOL and USDC as bundled SVGs, 0 letter tiles, 0 broken; all 114 logo requests of the load 200; 0 console errors. Before the fix 9 of 40 were tiles: PUMP, ANTFUN, GOHOME, cbBTC, USELESS and $WIF (IPFS gateways refusing servers) and TRUMP, PENGU, YZY (arweave serving real JPEG/PNG bytes with no content type) |
| C5 | Search by ticker | `bonk` → Bonk ranks first | **PASS** — final bundle `entry-7efb2b6f…`: `bonk` → Bonk (DezX…B263, $0.00000278) first, then BONK 6u8S…pump and bonkSOL; `/jup/tokens/v2/search?query=bonk` 200; 0 console errors |
| C6 | Search ranking | `btc` → WBTC above BTCBANK; `wif` → $WIF first | **PASS** — final bundle: `btc` → WBTC (3NZ9…qmJh, Wrapped BTC (Portal), $77,311) first of 17, BTCBANK 12th; `wif` → $WIF (EKpQ…zcjm, dogwifhat, $0.1898) first. Both ranked from the live verified and pump lists already loaded — the app asks Jupiter's search only below 8 local matches (`markets.ts:257`); 0 console errors |
| C7 | Search by whole mint | Pasting a real mint → that token first | **PASS** — final bundle: pasting `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` → exactly one row, Bonk (DezX…B263, $0.00000278); search request 200; 0 console errors |
| C8 | Search, valid mint that is not a token | `NOTHING MATCHING "<MINT>"`, no crash, no error | **PASS** — final bundle: the treasury address `DfvNVoN7…BDZ4` (a real account, not a token) → `NOTHING MATCHING "DFVNVON7…BDZ4"`, 0 rows; search request 200; no crash; 0 console errors |
| C9 | Stocks reachable | `TSLAx` → a "Tesla xStock" row with a live USD price | **PASS** — final bundle: `TSLAx` → `TSLAx XsDo…HzoB · Tesla xStock $367.33` first, a live Jupiter price, then pump.fun namesakes with their own mints; 0 console errors |
| C10 | Stake picker | 0.05 / 0.10 / 0.50 / 1◎ selectable; the note reads `WINNER TAKES` pot × 0.98 (0.05 → 0.098◎) · 2% rake | **PASS** — final bundle: 0.05◎ → `WINNER TAKES 0.098◎ · 2% RAKE`, 0.10◎ → 0.196◎, 0.50◎ → 0.98◎, 1◎ → 1.96◎; exactly the chosen stake yellow (255,179,30), the rest blue; 0 console errors |
| C11 | Round length picker | 1 MIN / 5 MIN / 15 MIN; the selection highlights; notes "a sprint — one or two fills each" / "the product round" / "room for a thesis to play out" | **PASS** — final bundle: `1 MIN` → "a sprint — one or two fills each", `5 MIN` → "the product round", `15 MIN` → "room for a thesis to play out"; exactly the chosen length cyan (53,224,255); 0 console errors |
| C12 | CTA follows selection | A market selected → `FIND MATCH`; none → `PICK A MARKET`, disabled. *(None only happens when the feed has no markets: otherwise the lobby lands on the top one.)* | **PASS** — final bundle: a market selected → `FIND MATCH`, enabled; with the market feed down (proxy stopped) nothing can be selected → the hero reads `PICK A MARKET · CHOOSE ONE BELOW` and the CTA reads `PICK A MARKET`, disabled, above a readable `MARKET FEED DOWN — Could not reach the price service.` card with `RETRY`; 0 console errors |
| C13 ⚡ | Market feed down | Proxy stopped → `MARKET FEED DOWN` and "Could not reach the price service." with RETRY; no prices; CTA `PICK A MARKET` disabled | — |
| C14 ⚡ | RETRY recovers | Proxy restarted → RETRY repopulates the list; CTA returns to `FIND MATCH` | — |
| C15 | Remembered choices | Pick 0.10◎, 1 MIN and a market, reload `/play` → the same three are selected | **PASS** — final bundle: picked 0.10◎, `1 MIN` and WOTF (LVC9…pump), visited `/tape`, `/stats` and `/proof`, reloaded `/play` → 0.10◎, `1 MIN` and WOTF still selected, stored as `{stake: 0.1, duration: 60, marketMint: LVC9…}`; 0 console errors |
| C16 | Bad stored prefs | `masked.prefs.v1` = `{"stake":"NaN","duration":9999}` → ignored; defaults shown; no error | — |
| C17 | `?market=<mint>` | Lobby opens with that market selected; an unpriceable mint → a `NO PRICE FOR THAT TOKEN` notice naming it, the lobby stays on its default market, no error. *(Corrected when run: the lobby deliberately lands on the top market when nothing is selected, so "nothing selected" cannot happen while the feed answers.)* | **FAIL → fixed → PASS** — final bundle `entry-de3cb417…`: `?market=DezX…B263` → the lobby opens on Bonk (`$0.00000278 · jupiter`), no notice, `FIND MATCH`; `?market=DfvNVoN7…BDZ4` (a real account, not a token) → toast `NO PRICE FOR THAT TOKEN` / "DfvN…BDZ4 has no live price on pump.fun or Jupiter, so a duel cannot open on it. Pick a market from the list." at 1.6 s, the lobby on its default WOFI; 0 console errors. The first final-run pass FAILED it: the lobby's top-market default (`DuelLobbyScreen.tsx:98–103`) silently stood in for the unpriceable link — WOFI selected, `FIND MATCH` live, nothing said — and overwrote the remembered pick. Fix: the restore effect in `useDuel.ts` now tells the player when a linked token cannot be priced, or when the search does not answer, and its stale "opens unselected" comment is corrected |

## D. Wallet

| # | Item | Correct means | Status |
|---|---|---|---|
| D1 | Disconnected | No stored key → header shows `CONNECT` | **PASS** — fresh origin `localhost.:4190` (no `masked.localKeypair.v1`; only `masked.prefs.v1`): header shows `CONNECT`, balance chip 0.00, trophies 0; 0 console errors |
| D2 | Picker | `CONNECT` → "CONNECT A WALLET" with `SOLFLARE`, `LOCAL KEY (DEV)`, `CANCEL` | **PASS** — `CONNECT` → dialog `CONNECT A WALLET` with exactly `SOLFLARE`, `LOCAL KEY (DEV)` and `CANCEL`; 0 console errors |
| D3 | Local key connect | Creates `masked.localKeypair.v1`; header shows the new pubkey (short form) | **PASS** — `LOCAL KEY (DEV)` → `masked.localKeypair.v1` written (a 64-byte key); the header shows `3ENt…ZFcn`, the public key derived from it (`3ENtrai26yyZfFH3vSJMZFNgnoJbRnacseiwsFzuZFcn`); `CONNECT` is gone |
| D4 | Balance is real | Header balance equals `getBalance` for that pubkey, to 2dp | **PASS** — header balance `0.00` = `getBalance(3ENt…ZFcn)` on :8999 = 0 SOL |
| D5 | Persistence | Reload → same pubkey | **PASS** — reload → the stored key still derives `3ENt…ZFcn`, and the header shows it |
| D6 | Cleared key | Clear the wallet's storage (key and remembered wallet) and reload → `CONNECT`; reconnect gives a different pubkey at 0.00; no crash. *(Clearing only the key reconnects with a fresh key instead — the local wallet's auto-connect, by design.)* | **PASS** — final bundle: clearing the key and the remembered wallet (`masked.localKeypair.v1`, `walletName`) and reloading → `CONNECT`, no crash; `LOCAL KEY (DEV)` → a new key `HjJA…URxP` (neither of the two before it) at `0.00` = its RPC balance; 0 console errors. Clearing the key alone while `walletName` still says Local Key reconnects straight away with a freshly minted key (`2k9x…msyw` at 0.00): the local key wallet auto-connects on purpose so a refresh mid-round returns to the round (`WalletProvider.tsx:43`), and its `connect` mints a key when none is stored |
| D7 | Zero-balance guard | 0 SOL → every stake disabled (`THIS WALLET CANNOT COVER A STAKE YET. FUND IT FIRST.`), so the stake stays at the default 0.10◎; `OPEN A MATCH` → exactly one toast `NOT ENOUGH SOL` / "Need ~0.12 SOL, wallet holds 0.00. Fund this wallet to open a duel."; **no transaction**. *(Corrected when run: the picker now disables stakes the wallet cannot cover, so 0.05◎ cannot be chosen at 0 SOL.)* | **PASS** — at 0 SOL every stake button is disabled with `THIS WALLET CANNOT COVER A STAKE YET. FUND IT FIRST.`, so the stake stays at the default 0.10◎. `FIND MATCH` → matchmaking → `OPEN A MATCH` → exactly one toast `NOT ENOUGH SOL` / "Need ~0.12 SOL, wallet holds 0.00. Fund this wallet to open a duel.", gone by 6 s; the wallet's signature list is still empty (no transaction); 0 console errors |
| D8 | Partial balance guard | 0.09 SOL → only 0.05◎ enabled (`BALANCE COVERS UP TO 0.05◎`); with the stored 0.10◎, `OPEN A MATCH` → "Need ~0.12 SOL, wallet holds 0.09. The largest you can open right now is 0.05◎."; no transaction. *(Corrected when run: the picker disables 0.50◎ at 0.09 SOL, so it cannot be chosen.)* | **PASS** — final bundle `entry-de3cb417…`, wallet funded to exactly 0.09 SOL on the local validator: only 0.05◎ is enabled, with `BALANCE COVERS UP TO 0.05◎`; the stake stays at the stored 0.10◎. `FIND MATCH` → `OPEN A MATCH` → exactly one toast `NOT ENOUGH SOL` / "Need ~0.12 SOL, wallet holds 0.09. The largest you can open right now is 0.05◎.", gone by 6 s; the wallet's signatures stay at 1 (the airdrop), so no transaction; 0 console errors |
| D9 | Solflare | Listed and selectable without an uncaught error. Completing a connect needs the Solflare extension and an account — **UNTESTED** if absent | **PASS (listed and selectable) · completing a connect UNTESTED — needs the Solflare extension and an account** — final bundle: `CONNECT` → `SOLFLARE` closes the picker, stores `walletName: "Solflare"` and loads Solflare's own connect frame from `connect.solflare.com`; 0 console errors. Reload → no frame, `CONNECT` again, because Solflare is deliberately left out of auto-connect (`WalletProvider.tsx:26`); 0 console errors |

## E. Matchmaking

| # | Item | Correct means | Status |
|---|---|---|---|
| E1 | FIND MATCH | Moves to `MATCHMAKING`: your mask, `WAITING…`, pot pill, `OPEN A MATCH`, `OPEN BOOK` | **PASS** — final bundle, creator `localhost:4190` (Bnyq): `FIND MATCH` → `MATCHMAKING · 1 VS 1` with the player's mask `(YOU)`, `WAITING…`, pot pill `POT 0.20◎ · WOFI`, `OPEN A MATCH` and `OPEN BOOK`; 0 console errors |
| E2 | OPEN A MATCH | Exactly one new `Match` on chain: creator = wallet, entry = stake, duration = picked length, leg A mint = chosen market; balance drops by entry + rent + fees | **PASS** — one click on `OPEN A MATCH` → exactly one new match `5NCVeHL4…g3an` on chain (open 1, cancelled 1, settled 3): creator Bnyq, entry 100,000,000 lamports (0.10◎), duration 300 s (5 MIN), leg A mint `VEY7…pump` (WOFI, priced through Jupiter because the lobby resolved it by search; the source label says so everywhere); balance 5,129,812,480 → 5,022,436,840 = entry + 7,370,640 rent + 5,000 fee |
| E3 | Own match in the book | Row reads `YOUR MATCH` with `CANCEL`; not joinable | **PASS** — the book row reads `WOFI · YOUR MATCH · 300s · 54s ago · 0.10◎ · CANCEL` in a yellow outline; no JOIN on it |
| E4 | Double-click OPEN | Exactly one new match on chain | **PASS** — double-click on `OPEN A MATCH` → exactly one new match `6Jn97Z91…9CMD` (the chain showed 1 open where there had been 0), the screen moved to its own-match state (`COPY INVITE LINK`, `CANCEL`); no toast; 0 console errors |
| E5 | CANCEL | Match status `cancelled` on chain; entry refunded (balance restored less fees and rent) | **PASS** — `6Jn97Z91…` status `cancelled` on chain; the creator's balance rose from 5,029,817,480 to 5,129,812,480 = the 0.10◎ entry less the 5,000-lamport cancel fee (the 7,370,640 rent of the record stays with it) |
| E6 | Double-click CANCEL | Exactly one refund; no error toast | **PASS** — double-click on `CANCEL` → one `MATCH CANCELLED` toast, no error; the match's transactions at `confirmed` are exactly `CreateMatch` (03:57:06) and one `CancelIfUnjoined` (03:58:34), both ok — no second or failed cancel reached the chain |
| E7 | JOIN from the book | The other origin joins → both clients go live; on chain `status=live`, joiner = B, leg B mint = B's market | **PASS** — duel `B1NxXkHD…fnoK` (1◎, 1 MIN; creator `localhost:4190` `Bnyq…Co4r`, joiner `127.0.0.1:4190` `5t6Q…7oVb`, 00:30 UTC): JOIN from the book → the joiner live at once, the creator (a background tab) live as the waiting client; on chain `status=live`, joiner = `5t6Q…7oVb` |
| E8 | Seal reads back | Both positions owned by `DELeGG…`; permission accounts exist; the live screen shows the sealed label | **PASS** — both positions owned by `DELeGG…` during the round, both permission accounts created and delegated; the live screen reads `SEALED · ACL ON CHAIN` |
| E9 | Stale match | A match older than 300 s shows `STALE` and cannot be joined | **PASS** — rebuilt export, `localhost:4190` MATCHMAKING, 02:13 UTC: the open book listed `WOFI · AsbF…Lvgc · 300s · 18m ago · 0.05◎` with `STALE` and no JOIN button, beside a fresh `WOFI · 8WZZ…N3jK · 60s · 1m ago · 0.10◎` that did offer `JOIN`. The on-chain half — joining a stale match is refused — is `check:guards` step 5, green in the 01:53 full check |
| E10 | Refresh mid-open | Reload right after OPEN → back in matchmaking with the one match; no duplicate on chain | **PASS** — reload right after `OPEN A MATCH` → back in `MATCHMAKING` with exactly one `WOFI · YOUR MATCH` row and `POT 0.10◎ · WOFI`; the chain still holds exactly one open match for the creator (no duplicate); 0 console errors |

## F. Live round

| # | Item | Correct means | Status |
|---|---|---|---|
| F1 | Clock | `ENDING IN` counts down from the picked duration on both clients, within 2 s of each other | — |
| F2 | Match-found card | `TRADE NOW (4)` counting down, `<n> MIN ROUND · LIVE NOW`; names both wallets and tickers; dismisses on click or after 4 s; shows once | — |
| F3 | Opponent fogged in UI | Opponent PnL `FOGGED`, side `SEALED`; no size, price or fill count anywhere; the opponent's ticker is shown | **PASS** — opponent row `FOGGED` / `SEALED`, `THEIR FILLS HIDDEN`; no size, price or fill count shown for the opponent |
| F4 | Fog enforced on the wire | Reading the opponent's position through the gate from the page, with this wallet's token, returns no data | — |
| F5 | Session key | Fills are signed and paid by the session key, not the wallet (checked on the rollup transaction) | **PASS** — duel `B1NxXkHD…fnoK`: the joiner's rollup `ApplyFill` `2PU6hzGgbKC1…` has one signer and fee payer, session key `GBHw…4hMo`; the wallet `5t6Q…7oVb` did not sign (read from the rollup transaction's message header); the live screen says `SESSION KEY · NO SIGNATURE PER FILL` |
| F6 | Size picker | 1/4, 1/2 and MAX each change the quoted impact % | **PASS** — on the post-7.15 bundle (`entry-36ffa35d`, parallel session, 02:13–02:18 UTC): the impact note reads 0.39% at 1/4 and 1.56% at MAX; on this run's bundle the note read `THAT SIZE COSTS 0.39% IN IMPACT` at 1/4 and 0.49% after the book moved |
| F7 | LONG | Fill lands on the rollup; `YOUR FILLS` +1; realised `exec/mark − 1` equals the quoted impact to 2dp | **PASS** — `L` at 1/4 → one fill, rollup-only `ApplyFill`; quoted `THAT SIZE COSTS 0.39% IN IMPACT`, realised 0.015411869 / 0.015351902 − 1 = 0.39%; `YOUR TAPE` +1 (`LONG`) |
| F8 | Double-click LONG | Exactly one fill | — |
| F9 | SHORT from flat | On-chain `base_qty` < 0; side chip `▼ SHORT` | **PASS** — rebuilt export, joiner `5t6Q` on `127.0.0.1:4190`, 02:17 UTC, duel `Eifdxoax…` (0.10◎, 5 MIN): from flat, `S` → toast `SHORT FILLED`, side chip `$WOFI SHORT`, `SHORT FROM 0.016187917`, `SOLD ON YOUR BOOK -0.38%`. On chain, read from the rollup at 02:17:47: `base_qty = -1515469`, `quote_balance = 124532286` (up from 100000000), `fill_count = 1`, fills `[sell]`. Also passed on the parallel session's post-7.15 bundle (SHORT from flat → SELL row predicted → SHORT FILLED) |
| F10 | CLOSE | Closes a long by selling and a short by buying → flat on chain; CLOSE while flat says so and sends no transaction | **PASS** — CLOSE while flat: `NOTHING TO CLOSE`, no transaction, no pending row (post-7.15 bundle). CLOSE with a long: SELL, then `POSITION CLOSED`, and the tape of `5vcpaaVJ…` shows that side `buy → 6115924`, `sell → 0` with no SETTLE fill — flat on chain before the buzzer. CLOSE with a short buys: here, `C` against `5t6Q`'s short in `Eifdxoax…` sent a buy (`BOUGHT ON YOUR BOOK`) — at the 1/4 size the reload left selected it closed 25% (`CLOSED 25% OF POSITION`), which is CLOSE honouring the size picker, not a full close |
| F11 | Nothing left to long | LONG with the whole entry in the position → `NOTHING LEFT TO LONG`; no transaction | **PASS** — post-7.15 bundle: a second `L` at MAX with the whole entry in the position → `NOTHING LEFT TO LONG`, no transaction, no row |
| F12 | Keyboard | `L` and `C` do what LONG and CLOSE do | **PASS** — this run's bundle, joiner `5t6Q` in `Eifdxoax…`: `S` → `SHORT FILLED` (chain `base_qty -1515469`), `C` → `BOUGHT ON YOUR BOOK` / `CLOSED 25% OF POSITION`, `L` → `$WOFI LONG`, `C` → `SOLD ON YOUR BOOK`; the rollup ledger holds exactly those as `[sell, buy, buy, buy, sell]`. Also drove every item above on the post-7.15 bundle |
| F13 | Settle button mid-round | Disabled, reads `SETTLES AT THE BUZZER` | **PASS** — mid-round the settle area reads `SETTLES AT THE BUZZER` |
| F14 | Mark crank | Price feed `px` advances on the base layer about every 5 s; the direction caret appears after the first change; no `MARK POSTED TOO SOON` toast | **PASS, caret not checked** — the visible player's own feed on the base layer, `Eifdxoax…`, sampled every 2 s at 02:20 UTC: posts at :38, :48, :53 (`MARK_CRANK_MS` = 5000; one beat missed), and no `MARK POSTED TOO SOON` toast in the pass. The direction caret was not looked at. The same sampling exposed R9: a player whose tab was hidden posted about once a minute |
| F15 | HUD and arena | Balance real; trophies = on-chain wins; axis symmetric about 0; puck shows live PnL; potential earnings = pot × 0.98; standings show `#?` for both | **PASS** — joiner `5t6Q` mid-round, duel `Eifdxoax…`, 02:19 UTC: header balance `4.84` against 4.84092576 SOL on chain; trophies `0` = 0 settled wins on this ledger; chart axis symmetric about 0 (`0.090% … -0.090%`); the puck carries the live PnL (`+0.020%`); potential earnings `+0.196◎` = 0.20◎ pot × 0.98; both standings `#?` |
| F16 | `aria-live` | Exactly two polite live regions: clock and PnL | **PASS** — same screen: exactly two `aria-live` regions, both `polite` — the clock (`00:02:20`) and `YOUR PNL -0.11%` |
| F17 | `beforeunload` | Prevented while live; not prevented in the lobby or on the reveal | **PASS** — live: reloading the joiner's tab mid-round in `Eifdxoax…` (02:18 UTC) was stopped by the browser's `Leave site?` dialog, which the reload then had to be forced past (R1). Lobby: the E10 reload from MATCHMAKING went straight through, no dialog. Reveal: on the creator's `YOU TAKE THE POT` screen a dispatched `beforeunload` came back not prevented |

## G. Settlement and reveal

| # | Item | Correct means | Status |
|---|---|---|---|
| G1 | Buzzer | At 0:00 settlement starts with no user action | **PASS** — at 0:00 settlement started on both clients with no action, including the creator's background tab |
| G2 | Settle stages | commit → undelegate → settle, each reporting a real result | — |
| G3 | Undelegated before settle | Both positions owned by fogduel again before `settle_match` | **PASS** — `ProcessUndelegation` for both positions at slot 20951, `settle_match` at 20953 |
| G4 | Both reach the reveal | Both clients show the reveal | **PASS** — creator `YOU TAKE THE POT +1.96◎`, joiner `POT LOST −1.00◎` |
| G5 | Reveal mirrors | A's "you" equals B's "opponent" in bps, both ways | **PASS** — A: you +0.0000%, opponent −0.3100%; B: you −0.3100%, opponent +0.0000% |
| G6 | PnL matches chain | Displayed % equals the tape's `pnlABps` / `pnlBBps` | **PASS** — tape `pnl bps 0 / −31`, displayed +0.0000% / −0.3100% |
| G7 | Timeline is real | Every mark is a fill on the tape; nothing synthesized | **PASS** — the timelines on `/tape` and the reveal are drawn by `replayEquity`, which emits one point per stored fill and an opening point at the round's start, and nothing between fills (`src/chain/tape.ts`); `check:tape` replays every settled tape's fills onto the chain's own bps (523 assertions over 11 tapes in the 01:53 full check), and the busy `/tape/5mxUqV8K…` lane ends on the chain's −1 bps |
| G8 | Pot maths | `potPaid + rake = pot`; `TAKES` = pot × 0.98 | **PASS** — reveal of `Eifdxoax…`: `POT 0.20◎ · TAKES 0.196◎` (0.20 × 0.98) and the winner's `+0.196◎`; the tapes: `0.196◎` paid + `0.004◎` rake = `0.20◎` (`5mxUqV8K…`), `0.098◎` + `0.002◎` = `0.10◎` (`FQSuu5TF…`) |
| G9 | Result board | Ordered by the chain's `winner`; trophy on #1; headline `YOU TOOK THE POT` or `OOF… SO CLOSE` with the gap | **PASS** — `#1 Bnyqfb…` is the chain's winner; `YOU TOOK THE POT` for A, `OOF… SO CLOSE · You missed the top by 0.3100%` for B |
| G10 | Win burst | Fires once on a win, never on a loss | — |
| G11 | Settle race | Both clients settling at once → no `MATCH NOT LIVE` dead end | — |
| G12 | The rollup commits the round | At 0:00 the commit stage reads `committed by the rollup's own crank`; the positions' commits are rollup `Executed crank` transactions, not client ones | **PASS** — both duels (`B1NxXkHD…`, `Gka31FTm…`): per position 2 `CrankCommitRound` and 27 `CrankLiquidate` executed by the rollup's crank signer; no client `CommitAndUndelegatePosition`, no browser `Liquidate` |
| G13 | ACLs come home | After settlement both players' permission accounts are owned by `ACLseo…` on base again | **PASS** — `B1NxXkHD…`: both permission accounts owned by `ACLseo…` after settlement, one owner-signed release each. (In `Gka31FTm…` the creator's client was stranded on matchmaking by an invite-landing race and released nothing; fixed in `useDuel.ts` resume and `MaskedApp.tsx` landing) |
| G14 | No failed transactions | Every base-layer and rollup transaction touching the match, both positions and the status carries no `err` | **PASS** — `B1NxXkHD…`: no `err` in the match account's 24 base transactions, either position's 6, or the 33–34 rollup transactions per position; `Gka31FTm…` likewise 0 |

## H. Reveal actions

| # | Item | Correct means | Status |
|---|---|---|---|
| H1 | REMATCH | Starts a fresh match flow; never resurrects the old match | **PASS** — creator `Bnyq`'s reveal of `Eifdxoax…` (`YOU TOOK THE POT`, 02:27 UTC): `REMATCH` → a fresh MATCHMAKING screen (`Bnyq (YOU) VS WAITING…`, `OPEN A MATCH`), no `YOUR MATCH` row, nothing opened for it; on chain the wallet still has exactly one match, `Eifdxoax…`, settled, its history unchanged at 60 transactions ending `RequestSettle` 4318 / `SettleMatch` 4319; 0 console errors |
| H2 | Share | Copies `/tape/<match>` (`LINK COPIED`) or says `COPY BLOCKED`; never a false success | **PASS** — joiner's reveal of `Eifdxoax…`: `COPY TAPE LINK` → the button reads `LINK COPIED`; 0 console errors. The handler (`MaskedApp.tsx:149`) sets `LINK COPIED` only when the clipboard write succeeded and `COPY BLOCKED` otherwise, so the label cannot claim a copy that did not happen |
| H3 | SEE IT IN THE FEED | Lands on the feed with this duel present | **PASS** — joiner `5t6Q`'s reveal of `Eifdxoax…` (rebuilt export, 02:25 UTC): `SEE IT IN THE FEED` → FEED, REVEALS tab, with this duel as the top card — `FOG DUEL · WOFI · 2M AGO`, `BNYQ…CO4R +0.00%`, `POT 0.20◎`, `5T6Q…7OVB -0.30%`, `READ TAPE`, `DUEL THIS TOKEN`; 0 console errors |
| H4 | 375 px | All three actions reachable | — |

## I. Feed, Rank, Modes, Quests

| # | Item | Correct means | Status |
|---|---|---|---|
| I1 | FEED REVEALS | Row count equals the settled tapes on chain | — |
| I2 | FEED MINE | Only this wallet's duels; with none → `YOU HAVE NOT SETTLED A DUEL YET` | — |
| I3 | FEED BIG POTS | Largest pots, ordered | — |
| I4 | Feed row data | Pubkeys, PnL and pot equal the tape | — |
| I5 | Card actions | `READ TAPE` → `/tape/<match>`; `DUEL THIS TOKEN` → lobby with that mint selected | — |
| I6 | RANK | Players from on-chain stats; tier chips from wins | — |
| I7 | MODES | FOG DUEL `LIVE`; 11 tiles `SOON`, none playable | — |
| I8 | QUESTS | Achievements, all time, CLEARED/LOCKED from real stats | — |

## J. `/tape`

| # | Item | Correct means | Status |
|---|---|---|---|
| J1 | Index | Explains or lists; no crash with no argument | **PASS** — badge `ALL TAPES`; every settled duel listed newest first with winner, loser, PnL, payout and age. First run FAILED the network bar: logo lookups for test-fixture mints got 404 from `/pump/coins/<mint>`. Root cause fixed in `server/market-proxy.mjs` (a coin pump.fun does not know is answered 200 `null`, `x-upstream-status: 404`); re-run: every app request 200, 0 console errors |
| J2 | Settled duel | Every fill of both players: side, size, exec price, second | **PASS** — `/tape/FQSuu5TF…`: both players' fills with side, size, execution price and second (`00:05 BUY 1.40 @ 0.016054125◎`, `00:43 BUZZER 1.40 @ 0.018657888◎`, …). A side with more than 16 fills lists the 16 the tape keeps and says `LAST 16 OF 25 FILLS` (J9) |
| J3 | Replay | Replayed PnL equals the chain's bps | **PASS** — `check:tape` (01:49:55 UTC): 328 assertions over every settled tape, each side's replay landing on the chain's own `pnl_*_bps`, including two sides past 16 fills replayed from the window start; `/tape` draws its timeline with that same `replayEquity`, and `/tape/5mxUqV8K…` ends each lane at −0.01%, the chain's −1 bps |
| J4 | Payout line | `POT x◎ · TAKES y◎`, rake shown, and they add up | **PASS** — `/tape/5mxUqV8K…`: `POT 0.20◎ · TAKES 0.196◎`, settled block `paid to winner 0.196◎` + `rake 0.004◎` = 0.200◎; `/tape/FQSuu5TF…`: `POT 0.10◎ · TAKES 0.098◎`, `0.098◎` + `0.002◎` = 0.100◎ |
| J5 | Malformed address | "That is not a match address." | **PASS** — `/tape/not-an-address` (wallet-less origin, 01:59 UTC): badge `NOT FOUND`, `NOTHING TO READ`, 'That is not a match address.'; 0 console errors |
| J6 | Valid key, not a duel | "That address is a Solana account, but not a duel." | **PASS** — `/tape/1111…1111`: badge `NOT FOUND`, `NOTHING TO READ`, 'That address is a Solana account, but not a duel.'; 0 console errors |
| J7 | Unsettled duel | "That duel has not settled yet. Watch it at /spectate instead." | **PASS** — `/tape/92M7XXj6…` while that duel was live (02:41:41 UTC, rebuilt export): badge `NOT FOUND`, `NOTHING TO READ`, 'That duel has not settled yet. Watch it at /spectate instead.'; 0 console errors |
| J8 | No wallet | Works disconnected | **PASS** — `/tape/5mxUqV8K…` from the same wallet-less origin: timeline, both fill lists with their `LAST 16 OF 25 FILLS` notes, `-0.01%` each and `SETTLED ON SOLANA` all render; 0 console errors, every request 200 |
| J9 | Busy duel's tape | A side with more than 16 fills: the replay starts from the tape's recorded window start and lands on the chain's PnL, and the page says it shows the last 16 of N — added after `check:tape` caught the opposite | **FAIL → fixed → PASS** — found at 01:27 UTC when the parallel session's full check failed at `check:tape`: `23QoVxL6 A: closed out but the replay still holds -19968959625 base`. `push_fill` drops the oldest fill past `MAX_FILLS` = 16 and the tape kept no state from before that window, so every busy side replayed from the entry: wrong curves on `/tape`, the reveal timeline, the feed and landing sparklines and the result image, while the PnL numbers stayed right. Fix: `Position.window_quote`/`window_base` fold in each evicted fill; `Tape.start_quote_*`/`start_base_*`/`fill_count_*` are copied at settlement (a Position is 559 bytes, was 543); clients replay from that start and label the window (`tape.ts`, `useTapes`, `RoundTimeline`, `RevealScreen`, `revealCard`, `useProtocolStats`, `useSpectate` by the parallel session; `TapeScreen`, `check-tape`, `check-invariants` here); stack reset at 01:43 for the layout change. Evidence: anchor test `the tape says where its last sixteen fills start, so they replay onto the chain's PnL` green at 01:49; `check:tape` 328 assertions over 6 tapes, 2 sides past 16 fills replayed from the window start, exit 0; `/tape/5mxUqV8K…` on the rebuilt export: legend `LAST 16 OF 25 FILLS` for both players, `25 fills` each, `CRANK MOVED -0.01% OVER ITS LAST 16 OF 25 FILLS`, 16-row lists headed `LAST 16 OF 25 FILLS`, PnL −0.01% matching the chain's −1 bps; a quiet tape (`FQSuu5TF…`) still reads `EVERY FILL` and `OVER THIS ROUND`; 0 console errors, 58 requests all 200 |

## K. `/spectate`

| # | Item | Correct means | Status |
|---|---|---|---|
| K1 | Index | No crash with no argument | **PASS** — badge `LIVE DUELS`; running duels listed with countdowns, and the ones past the buzzer counted separately; 0 console errors |
| K2 | Live duel | Pot and both marks; each player `FOGGED`; `BOTH POSITIONS SEALED`; neither position's contents anywhere in the DOM. *(Corrected before running: the plan asked for fill counts, but a live duel's counts live in the sealed positions — `SpectateScreen` shows them only once `revealed` at settlement, which K3 checks)* | **PASS** — `/spectate/CQoQLNWX…` (the parallel session's live `check` duel, 2:45 left) from a wallet-less origin, 02:00 UTC: WOFI v WOFI, countdown, `POT 0.10◎ · TAKES 0.098◎`, both marks `0.016013033◎`, `8 marks since you joined`, each player `FOGGED`, `BOTH POSITIONS SEALED`. No position words (avg, quote, realized, base qty, holding) in the page text, no position field names (`quoteBalance`, `baseQty`, `avgPx`, `realized`) anywhere in the HTML; 0 console errors; of 250 resources, 247 report 200 and 3 are the proxy's `<img>` loads (opaque to timing, 200 in the network log) |
| K3 | Settled duel | Settled result and payout | **PASS** — `/spectate/5mxUqV8K…` (settled): both legs, `POT 0.20◎ · TAKES 0.196◎`, each player `-0.01%` with `25 fills` (the true count, not the 16 the tape stores), `SETTLED ON SOLANA` with `paid to winner 0.196◎` and `rake 0.004◎`; 0 console errors |
| K4 | Malformed address | "That is not a match address." | **PASS** — `/spectate/not-an-address`: `NOTHING TO WATCH`, 'That is not a match address.'; 0 console errors |
| K5 | Valid key, not a duel | "That address is a Solana account, but not a duel." | **PASS** — `/spectate/1111…1111`: `NOTHING TO WATCH`, 'That address is a Solana account, but not a duel.'; 0 console errors |
| K6 | No wallet | Works disconnected | **PASS** — `/spectate` from the same wallet-less origin: `LIVE DUELS · WATCHING`, 'no wallet needed to see that', `2 DUELS RUNNING` with countdowns, `3 more duels are past the buzzer`; 0 console errors |

## L. `/proof`

| # | Item | Correct means | Status |
|---|---|---|---|
| L1 | Cluster rows | name `LOCAL`, base `http://127.0.0.1:8999`, rollup `http://127.0.0.1:6699`, validator `mAGicP…1mev`, read gate `YES — sealed position refused, control served`, gate attested `NO — not a TEE` | **PASS** — exactly: `LOCAL`, `http://127.0.0.1:8999`, `http://127.0.0.1:6699`, `mAGicP…1mev`, `YES — sealed position refused, control served`, `NO — not a TEE` |
| L2 | Measured speed | Real numbers that change between two loads | **PASS** — two real `/proof` loads: 00:51 UTC — base 1.9 slots/s, rollup 20.5 slots/s, speedup 10.6x, round trips 26.0 / 25.8 ms; 01:52 UTC — 1.9, 20.3, 10.5x, 27.8 / 28.0 ms |
| L3 | Programs on chain | fogduel, delegation and permission rows with real addresses | **PASS** — fogduel `3K3v1b…1Rj1`, delegation `DELeGG…aeSh`, permission `ACLseo…Qnp1` |
| L4 | Settled on chain | `duels settled` equals the tape count | **PASS** — `duels settled` 29 = 29 tapes on chain |
| L5 | Live right now | Live duels link to `/spectate/<match>`; expired-but-unsettled counted separately | **PASS** — two live WOFI duels with countdowns; `9 more duels are over but unsettled` counted separately |
| L6 | Access control lists | The latest *sealed* duel's permission accounts. After settlement both read `HOME ON SOLANA` (owner `ACLseo…`): each player's client releases its own at the buzzer. Expectation changed 00:40 UTC — before that, ACLs stayed owned by `DELeGG…` forever | **PASS** — latest sealed duel `B1NxXkHD…`: both ACLs `HOME ON SOLANA` |
| L7 | Life of one duel | Real base-layer rows with slots and signatures; a row opens the explorer | **FAIL → fixed → PASS** — re-run on the rebuilt export (`:4190`), 01:52–01:56 UTC. Seed duel `7u6AhoBn…` traced with 12 real rows, each with slot and signature: JOIN MATCH 800, CREATE POSITION PERMISSION ×2, DELEGATE POSITION PERMISSION ×2, DELEGATE POSITION TO ER ×2, `ACL BACK ON SOLANA` 884, PROCESS UNDELEGATION ×2 885, `ACL BACK ON SOLANA` 885, SETTLE MATCH 887; `refused on chain: none`. Minutes later the page moved on to `check:race`'s newest duel: its deliberate duplicate seals read `… · FAILED`, and its two releases (new in `check:race`) read `ACL BACK ON SOLANA`. A row opens the explorer: clicking one called `window.open('https://explorer.solana.com/tx/5ebGKoPv…?cluster=custom&customUrl=…', '_blank')`. 0 console errors. First run FAILED: the two ACL releases (slot 20947) read `TRANSACTION`, because the label required a `ProcessUndelegation` log that the permission account's undelegation does not emit; it now keys on the delegation program's top-level invoke in an ACL-only transaction |
| L8 | What one duel costs | Fees summed from those transactions | **PASS** — `16 TX · 6 FAILED`, total 0.000800 SOL, `refused on chain: 6 of 16`, set against that duel's own 0.10◎ pot (the traced duel was `check:race`'s deliberate two-client seal, and its refusals are labelled `FAILED`) |
| L9 | Recent program transactions | Real signatures and labels | **PASS** — rebuilt export on `:4190`, 01:52 UTC: `RECENT PROGRAM TRANSACTIONS · 10`, each a real signature with its instruction label and age — CREATE POSITION PERMISSION `2QrpPwWq…`, JOIN MATCH `8Z6dLKQv…`, CREATE MATCH `2sa3Xpvn…`, SETTLE MATCH `5UXknPr9…`, REQUEST SETTLE `W7ZVEcBo…`, PROCESS UNDELEGATION ×3, PUSH PRICE `3CezRmLX…`, DELEGATE STATUS TO ER `5rjJkRzv…`; 0 console errors |
| L10 | Run this yourself | Tap → `COPIED`, or `COPY BLOCKED` | **PASS** — rebuilt export on `:4190`, 01:57 UTC: tapped `npm run check:tape` in RUN THIS YOURSELF; that row's `TAP TO COPY` became `COPIED`, the other eight stayed `TAP TO COPY`; 0 console errors |
| L11 | No wallet | Whole page works disconnected | **PASS** — fresh origin `localhost.:4190` with no keypair in storage, 01:58 UTC: every section renders (cluster, live, speed, programs, settled, ACLs, life of one duel, cost, recent transactions, run this yourself); the header offers `CONNECT`; read gate `YES — sealed position refused, control served`; `duels settled 12`; both ACL rows present; no horizontal overflow; 0 console errors, every request 200 |

## M. `/health`

| # | Item | Correct means | Status |
|---|---|---|---|
| M1 | Dependencies | Every row UP with a real detail | **PASS** — final bundle `/health`: 8 dependency rows UP, each with live detail: base layer slot 13,942; ephemeral rollup slot 150,110; fogduel program 36 bytes (the upgradeable program account); delegation and permission programs deployed; market proxy `http://127.0.0.1:8791`; pump.fun listing markets; Jupiter SOL $101.66; build 1.0.0 · LOCAL · tee NO; 0 console errors |
| M2 | Badge | `ALL SYSTEMS UP` only when every row is up | **PASS** — final bundle: with every dependency up the badge reads `ALL SYSTEMS UP`; with the market proxy stopped (03:49:49 UTC), `RE-CHECK` turns it to `DEGRADED` and exactly the three market rows to `DOWN — did not answer` (market proxy, pump.fun, Jupiter), while base layer, rollup and the three programs stay up with live slots (14,093 / 151,716) |
| M3 ⚡ | Proxy down | That row DOWN; badge `DEGRADED`; the others still UP | — |
| M4 | RE-CHECK | Re-runs and recovers after the proxy returns | **PASS** — final bundle `/health`, no reload between steps: proxy stopped 03:54:23 UTC → `RE-CHECK` at 03:54:36 → badge `DEGRADED`, exactly market proxy / pump.fun / Jupiter `DOWN — did not answer`; proxy started 03:54:37 (pid 38864) → `RE-CHECK` at 03:54:48 → `ALL SYSTEMS UP`, every row back with live detail (SOL $101.65); the lobby's `MARKET FEED DOWN` card `RETRY` likewise brought back 12 markets and `FIND MATCH`; 0 console errors |
| M5 ⚡ | Gate down | The rollup row DOWN, reported as unreachable rather than empty; no permanent spinner | — |

## N. `/stats`

| # | Item | Correct means | Status |
|---|---|---|---|
| N1 | Loads with no wallet | Every figure present and non-negative; `DUELS SETTLED` = tape count | **PASS** — every figure present and non-negative; `DUELS SETTLED` 29 = tape count; every request 200 on the `:4190` reload |
| N2 | Rake, two sources | `TREASURY, LESS RENT` = `SUMMED FROM TAPES` to the lamport; badge `AGREES TO THE LAMPORT` | **PASS** — `SUMMED FROM TAPES 0.118◎` = `TREASURY, LESS RENT 0.118◎`; badge `AGREES TO THE LAMPORT` |
| N3 | Rent floor | The locked figure equals the treasury's real rent-exempt minimum | — |
| N4 | Per-market table | One row per leg mint, busiest first, with duels / volume / biggest pot | **PASS** — one row per leg mint, busiest first, with duels, volume, biggest pot and the mint (`VEY7…pump`, `Bygc…pump`, …), so the repeated WOFI tickers are told apart |
| N5 ⚡ | Cluster unreachable | `COULD NOT REACH THE CLUSTER — THESE ARE NOT ZEROS, THEY ARE UNKNOWN` | — |

## O. Static routes

| # | Item | Correct means | Status |
|---|---|---|---|
| O1 | `/gallery` | Component showcase whose invented sample figures are visibly labelled as sample data | **PASS** — `SAMPLE DATA — COMPONENT GALLERY` banner plus 'Every figure on this page is a frozen or generated example…'; the invented mint that 404'd is replaced by the real WOTF mint |
| O2 | 404 | Unknown route → branded 404 linking all 8 routes (`/`, `/play`, `/proof`, `/stats`, `/health`, `/spectate`, `/tape`, `/gallery`); each link navigates | **PASS** — `/nope-404` on `:4190`, 01:30 UTC: branded page (`404` · `NO SUCH ROUTE`) with 8 real `<a href>` links; clicked each from a fresh load: LANDING → `/`, PLAY A DUEL → `/play`, ON-CHAIN PROOF → `/proof`, PROTOCOL STATS → `/stats`, SYSTEM HEALTH → `/health`, WATCH A DUEL → `/spectate`, READ A SETTLED TAPE → `/tape`, COMPONENT GALLERY → `/gallery`; 0 console errors, every request 200. (A first pass read as dead links: the automation's clicks never reached the page — no `pointerdown` arrived — until a screenshot preceded each click) |
| O3 | Browser back | Back out of a flow lands on a valid screen | **PASS** — rebuilt export, 02:42 UTC: `/tape/92M7XXj6…` → `/proof` → the browser's back (`history.back()`) → back on `/tape/92M7XXj6…`, fully rendered ('That duel has not settled yet…'); 0 console errors |

## P. Market proxy API

| # | Item | Correct means | Status |
|---|---|---|---|
| P1 | `/pump/` | 200 JSON, real pump.fun coins | **PASS** (final run, 02:58 UTC) — `GET /pump/coins?offset=0&limit=3&sort=market_cap&order=DESC&includeNsfw=false` → 200 `application/json`, three real pump.fun coins (`WOFI` `VEY71U…`, `WOFI` `AACMeD…`, `WOFI` `baeHvY…`) |
| P2 | `/jup/` | 200 JSON, real Jupiter tokens | **PASS** (final run, 02:58 UTC) — `GET /jup/tokens/v2/search?query=bonk` → 200 `application/json`, 20 real Jupiter tokens led by `Bonk` `DezXAZ…` |
| P3 | Unknown path | 403 `{"error":"not a market route", "allowed": [...]}` | **PASS** (final run, 02:58 UTC) — `GET /definitely/not/a/route` → 403 `{"error":"not a market route","allowed":["/pump/","/jup/"]}` |
| P4 | `/img` relays a logo | 200 `image/*` with `cross-origin-resource-policy: cross-origin` | **PASS** (final run, 02:58 UTC) — `GET /img?url=https://static.jup.ag/jup/icon.png` → 200 `image/png` with `cross-origin-resource-policy: cross-origin` |
| P5 | `/img` private addresses | `localhost`, `127.0.0.1`, `169.254.169.254` → 403 | **PASS** (final run, 02:58 UTC) — `https://localhost/…` → 403 `localhost resolves to a private address`; `https://127.0.0.1/…` → 403 `127.0.0.1 resolves to a private address`; `https://169.254.169.254/latest/meta-data` → 403 `169.254.169.254 resolves to a private address`; `http://localhost/…` → 403 `https only` |
| P6 | `/img` over http | Refused: `{"error":"https only"}` | **PASS** (final run, 02:58 UTC) — `GET /img?url=http://static.jup.ag/jup/icon.png` → 403 `{"error":"https only"}` |
| P7 | `/img` non-image | 415, not relayed | **PASS** (final run, 02:58 UTC) — `GET /img?url=https://api.jup.ag/price/v3?ids=So111…` → 415 `{"error":"not an image: application/json"}`, nothing relayed |
| P8 | No secrets | No key or token in any client request URL or body | **PASS** — the shipped bundle (`entry-48a18129…`, 2.8 MB) has no secret-shaped strings (`sk-…`, `ghp_…`, `AKIA…`, PEM private keys, `api_key=` literals) and no embedded 64-byte key arrays; the market proxy reads only `MARKET_PROXY_PORT` and sends no upstream credentials (`/whoami` names its upstreams, nothing more). Every client request captured in this pass carried public data only: JSON-RPC calls, public mints and search terms to the proxy, image URLs to its relay; the rollup gate's token rides in an `Authorization` header, and its challenge URL carries only the public key |

## Q. On-chain program — real signed transactions

| # | Item | Correct means | Status |
|---|---|---|---|
| Q1 | `create_match` | Escrow held; match on chain (E2) | **PASS** — UI duel `B1NxXkHD…`: `CreateMatch` ok; the match holds the creator's 1◎ in escrow, pot 2◎ after the join (chain) |
| Q2 | `join_match` | Second escrow; both permissions created and delegated (E7, E8) | **PASS** — `JoinMatch` ok; second escrow; both permissions created and delegated exactly once (E7, E8) |
| Q3 | `cancel_if_unjoined` | Refunds; refused once joined (`check:guards`) | **PASS** — `check:guards` in the parallel session's green 22-step `npm run check` (00:20:56 UTC): refunds an unjoined match, refuses cancel-after-join |
| Q4 | `push_price` limits | Rate limit and 5% jump cap enforced (`check:guards`) | **PASS** — `check:guards` in the parallel session's green 22-step `npm run check` (00:20:56 UTC), and the anchor test 'refuses a price push that jumps further than the rate limit' |
| Q5 | `apply_fill` | Owner enforced; session-signed fill accepted (`check:session`) | **PASS** — `check:session` in the parallel session's green 22-step `npm run check` (00:20:56 UTC); F5: the UI fill signed by the session key alone |
| Q6 | Settlement | Pot paid, rake taken, tape written (G) | **PASS** — `B1NxXkHD…`: winner paid 1.96◎, rake taken, 1157-byte tape written; `check:invariants` 665 assertions |
| Q7 | Delegation lifecycle | Fill signature in the rollup ledger, absent from base (`check:er`) | **PASS** — `check:er` in the parallel session's green 22-step `npm run check` (00:20:56 UTC); the UI duel's `ApplyFill` exists only in the rollup ledger |
| Q8 | Gate enforces ACL | Sealed REFUSED, bare SERVED, token opens own position only (`check:gate`) | **PASS** — `check:gate` in the parallel session's green 22-step `npm run check` (00:20:56 UTC); `/proof` probes it live: `YES — sealed position refused, control served` |
| Q9 | Guard refusals | Every refusal the app can hit is enforced (`check:guards`) | **PASS** — `check:guards` in the parallel session's green 22-step `npm run check` (00:20:56 UTC) (7 refusals, each enforced by the deployed program) |
| Q10 | Shorts and liquidation | Real short, margin cap refused, real liquidation (`check:short`) | **PASS** — `check:short` in the parallel session's green 22-step `npm run check` (00:20:56 UTC) (a real short, the margin cap refused, a real liquidation); and `tests/er-cranks.ts`: the rollup's keeper liquidates with nobody calling `liquidate` |
| Q11 | VRF request | Request lands on chain (`check:vrf`); **fulfilment UNTESTED — no oracle on the local stack** | **PASS (request) · fulfilment UNTESTED — no VRF oracle on the local stack** — final run `npm run check:vrf` 02:55:46–02:56:47 UTC: the request lands and the VRF program accepts it; no oracle answers, because the preloaded queues list devnet oracle identities whose keys are not held here |
| Q12 | Full suite | `npm run check` green, all 22 steps (lint added as step 2) | **PASS** — final run `npm run check` 02:53:50–02:58:07 UTC, exit 0, all 22 steps: tsc, eslint, build 7, fog 14, errors 37, preflight 15, markets + pump.fun live, tape 950 assertions over 21 tapes (3 sides past 16 fills replayed from the window start), fuzz 48,009, invariants 254, h2h 61, race 24 (each client released its own ACL), guards, session 15, short 23, legs 10, er 7, sealed 2/2, gate (sealed REFUSED, bare served, each token opens only its own position) |
| Q13 | Anchor tests | 38 passing, including the rollup crank suites in `tests/er-cranks.ts`; the 2 TEE tests **UNTESTED — no devnet SOL** | **PASS** — final run `anchor test` 02:58:07–03:03:27 UTC, exit 0: 38 passing, 2 pending (the TEE-only tests), 0 failing — including `a busy round still comes home` and the tape-window replay test |
| Q14 | Busy round | A round with 20+ fills per position comes home at the buzzer and settles — added after the soak found the opposite | **FAIL → fixed → PASS** — found by the parallel session's soak at 00:50 UTC: after ~21 fills a position's commit no longer fits one transaction, the rollup stages it through MagicBlock's committor program `ComtrB2K…`, and `mb-test-validator` 0.14.10 does not preload that program — the base transactions failed `ProgramAccountNotFound` and the intent stayed `Pending` for good (three rounds stranded: positions delegated, match `live`). Fixed in `scripts/localnet.sh` (preloads the program, warns on a ledger without it); stack reset from genesis at 01:11 UTC, old ledger kept at `.localnet/ledger-no-committor-20260913T011122Z`. New suite `a busy round still comes home` in `tests/er-cranks.ts` green at 01:16 on the reset stack: 24 fills per side, the crank's commit brought both positions and the status home, both ACLs released, settled; the rollup's committor DB records both positions `DiffBuffer` `Succeeded`, and base shows the committor's `Init`/`Write`/`Close`, all ok Also the parallel session's soak on the fixed stack at 01:23 UTC: `CBJPzsRa…` (crank commit) and `J7EBtmgp…` (client commit), 42/42 fills each (p50 8 ms, p99 19 ms), both came home and settled; every committor row since 01:22:30 `Succeeded`, 0 retries. `check:race` (`HQ6DAvei…`, 24 assertions) and `check:short` (`57qPKfdh…`, 23) now end with each player releasing their own ACL, both home |

## R. Resilience

| # | Item | Correct means | Status |
|---|---|---|---|
| R1 | Refresh mid-round | Rejoins the live round with the clock correct | **PASS** — joiner tab mid-round, duel `Eifdxoax…`: the reload first met the page's own `Leave site?` guard (F17); forced through at 02:18:23 UTC, the page came back straight into the live round at 02:18:32 reading `ENDING IN 00:03:16`, with the short restored (`$WOFI SHORT`, `SHORT FROM 0.016187917`). The chain had `left = 241 s` at 02:17:47, so 196 s — 3:16 — at 02:18:32: the clock is right; 0 console errors |
| R2 | Refresh mid-transaction | True state recovered; no double spend | — |
| R3 | Back mid-flow | No broken state | — |
| R4 ⚡ | Gate unreachable mid-round | A fill fails with `CANNOT REACH THE ROLLUP`; never a false success; round state intact | — |
| R5 | Gate restored | The next fill succeeds without a reload | — |
| R6 | Two tabs, same wallet | Same clock and position; no double fill or double settle on chain | — |
| R7 | Two origins isolated | Separate wallets; no shared state | — |
| R8 | Lobby sweep | Settles only this player's own abandoned rounds | — |
| R9 | Player leaves mid-round | Their mark keeps moving until the buzzer — a player who hides or closes the tab cannot freeze the price their PnL settles at — added after sampling found the opposite | **FAIL → fixed → PASS** — found 02:19 UTC: each client posted only its own market's mark (`useDuel.ts`: `crankPrice(address, me, px, me)`) and `settle_match` values each side at its own last post, so a player's mark froze when their client stopped — the creator's tab, hidden behind the joiner's for 5+ minutes, posted about once a minute (feed `updated_ts` stuck from 02:18:38 through 02:19:23). Fix (`useDuel.ts`): each tick also reads the opponent's feed, and when it is older than `STALE_MARK_SECS` (15 s) posts that market's live price for them — permissionless and rate-limited on chain, same source as the owner's own post. Verified on the rebuilt export (`entry-48a18129…`), 02:35–02:39 UTC: creator `Bnyq` opened `92M7XXj6…` (0.05◎, 5 MIN) and left before the join; joiner `5t6Q` joined 02:37:31. The creator's feed then got a `PushPrice` exactly every 15 s — 02:37:36, :51, 02:38:06, :21, :36, :51, 02:39:06, :21 — every one signed by `5t6Q`. In an earlier 60 s duel (`DVWJn97R…`) the backstop fired once at 02:31:23 on the stale opening mark and then stood down while the creator's own client posted every 5–10 s |

## S. Cross-cutting

| # | Item | Correct means | Status |
|---|---|---|---|
| S1 | 375 px | No horizontal overflow on any route; every control reachable | **PASS** — same probe in 375 px frames, 02:04–02:10 UTC: all 10 routes at document width 375 (no horizontal overflow), and every visible control inside the viewport or a horizontal scroller. The probe's only flags were on `/`: four duel-history rows at left −10 px, which turned out to be hidden, not clipped — `visibility: hidden`, opacity 0, the pre-reveal state `gsap.set(rows, { autoAlpha: 0, x: -28 })` sets in `src/landing/sections/SealSequence.web.tsx:147`. The frame's programmatic scroll never played that scrubbed sequence, so the rows' revealed position at 375 px was not observed here |
| S2 | 768 px | Same | **PASS** — rebuilt export, each route loaded in a same-origin 768 px frame, 02:04 UTC: `/`, `/play`, `/proof`, `/stats`, `/health`, `/spectate`, `/tape`, `/tape/<busy duel>`, `/gallery`, 404 — document width 768 on every one (no horizontal overflow), and every rendered control (links, buttons, `role=button`, `tabindex=0`; 1–60 per route) inside the viewport or inside a horizontal scroller |
| S3 | Desktop | Same | **PASS** — same probe in 1440 px frames, 02:06 UTC: all 10 routes at document width 1440, and every rendered control inside the viewport |
| S4 | No stray logging | Only the ErrorBoundary's intentional `console.error` exists in shipped code | **PASS** — code sweep of `app/` and `src/` at 01:50 UTC: four console calls. Two are the intended ones — `ErrorBoundary.tsx:31` and `RouteErrorBoundary.tsx:26`, both `console.error` on a render error. The other two (`series.ts:91`, `PixelText.tsx:48`) are `console.warn` inside `if (__DEV__ && …)`, so a production export never runs them; every page driven in this pass logged 0 console errors |
| S5 | No mocks or stubs | No fabricated data on any product surface | **PASS** — code sweep for mock/fake/stub/lorem/`Math.random` in `app/` and `src/`: the only hit is `/gallery`'s `ROLL PNL` demo button, on the page bannered `SAMPLE DATA — COMPONENT GALLERY` (O1). Every product surface read in this pass (lobby, live round, reveal, `/proof`, `/stats`, `/tape`, `/spectate`, `/health`) showed values read back from the chain or the market proxy |
| S6 | Readable errors | No raw Anchor or fetch strings reachable by a user | — |

## U. Untestable here — named dependencies

| # | Item | Missing dependency |
|---|---|---|
| U1 | TEE attestation, devnet deploy, the two TEE chain tests | Devnet SOL (0 held; 8.11 SOL needed) |
| U2 | VRF fulfilment | A VRF oracle serving the local queue |
| U3 | Completing a Solflare connect | Solflare extension and account |
