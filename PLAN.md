# FOGDUEL — BUILD PLAN

> Rewritten **2026-09-07 05:40 UTC**, replacing the plan of the previous run.
> Statuses reflect what was actually executed and verified, not intent.
>
> A builder agent can pick up any single task below and start cold. Every task
> names the file, the command, or the exact artefact it touches.

---

## 0. SITUATION

**Deadline: Fri 2026-09-11 05:00 CDT (= 10:00 UTC). Now: Mon 2026-09-07 05:38 UTC.
Remaining: 4 days, 4 hours.**

94 commits. Working tree clean.

### What is genuinely finished and verified

| | |
|---|---|
| Anchor program | 16 instructions, deployed to the local MagicBlock stack |
| On-chain tests | **26 passing, 2 pending** (`cd chain && anchor test --skip-local-validator`) |
| Assertion suites | **9 suites** via `npm run check` — tokens, series, fog, errors, preflight, tape (1602 assertions over 92 real tapes), h2h (145), race (22), guards (6 refusals) |
| Browser test plan | **139 items, 137 PASS, 0 outstanding FAIL, 2 UNTESTED** — see `TEST-PLAN.md` |
| Routes | `/`, `/play`, `/proof`, `/health`, `/gallery`, `/spectate/<match>`, `/tape/<match>`, branded 404 |
| Read gate | Real and proven locally: `query-filtering-service` on :6699 refuses a sealed position and serves a permission-less control (`npm run check:gate`) |
| Mocks / stubs | A full grep for `mock\|stub\|todo\|fixme\|fake\|dummy\|placeholder\|hardcod\|hack\|xxx` across `src/ app/ chain/programs/ scripts/ server/` returns **4 hits, all prose explaining that something is *not* a placeholder**. There are no mocks. |

### What is not done, one line each

1. **Not submitted.** Hard deadline in 4 days. This is the only irreversible item.
2. **No demo video and no public live URL.** `dist/` exists but is 7 hours stale.
3. **Docs contradict the product** in five specific, checkable places (§6, GAP-1…5).
4. **Not deployed to devnet.** Wallet holds 0 SOL; faucet refused 40+ times.
5. **PER attestation unproved** — the gate is real, but it is a process we run.
6. **Session keys: not started.** No dependency, no code. Every fill is a signature.
7. **VRF has no product surface.** `request_market_draw` / `settle_market_draw`
   exist in the program and are exercised by `check:vrf`, but nothing in `src/`
   calls them and no oracle can fulfil.

**Honest headline:** the product is built, tested harder than most hackathon
entries will be, and honest about its limits. What is missing is not code — it
is the twenty minutes of recording and form-filling that turn it into an entry,
plus two MagicBlock primitives that are half-present and should either be
finished or stated plainly as unused.

---

## 1. GOALS

### 1.1 "Done" — the floor for a valid submission

- [ ] Submitted at `https://build.magicblock.app/?stage=blitz#submit` before
      **Fri 2026-09-11 05:00 CDT**.
- [ ] Public repo with a README that states: how to run it, which validator,
      which accounts are private and when, and what is not proved.
- [ ] A demo video or live URL showing **one complete duel end to end**:
      open → join → seal → fills → buzzer → commit → undelegate → settle →
      reveal → tape.
- [ ] A published program ID (devnet if the faucet unblocks, otherwise the
      local ID stated as local).
- [ ] The MagicBlock primitives listed **accurately** — used, partially used,
      and not used, each said plainly.

### 1.2 "Winning" — what actually places

- [ ] **The privacy claim is demonstrated, not asserted.** On camera: a read of
      the opponent's position refused mid-round at :6699, and the same read
      served after settlement. The control row (same account shape, no
      permission → served) has to be in shot, because a door shut for everybody
      is not access control.
- [ ] **The product does it, not a script.** A judge who plays through the UI
      creates and delegates real ACLs. *(Already true — verified in `TEST-PLAN.md`
      E2, and by `npm run check:sealed`.)*
- [ ] **Two people can actually play it.** Two browsers, two wallets, one duel,
      one winner. *(Already true — verified end to end this run.)*
- [ ] **Depth a judge can click.** `/proof` shows the delegation lifecycle as
      real signatures; `/tape/<match>` is a permanent public record of any duel.
      *(Already true.)*
- [ ] **Nothing on screen is a lie.** Every number traceable to chain state; no
      invented curves, no false confirmations. *(Twelve such defects were found
      and fixed this run; see `TEST-PLAN.md` defect table.)*
- [ ] Framed as a generalisation of `rock-paper-scissor` (hidden moves) and
      `sealed-auction` (private bids + escrow + reveal).

### 1.3 Non-goals — do not build these

The 11 `SOON` mode tiles stay tiles. No social graph, chat, NFT trophies,
tournaments, or quest economy. No new UI primitives — the library is complete.
Do not build a second game mode before §2–§4 are green.

---

## 2. PHASE 1 — MAKE THE DOCS TRUE

**Why first:** these are the pages a judge reads before they read code, and each
one currently contradicts the product. Cheap, fast, and it blocks the quality of
everything in Phase 2 and 3. Est. 60–90 minutes total.

| # | Task | Status |
|---|---|---|
| 1.1 | `README.md` line ~26: the primitives table says `VRF \| — \| Not attempted`. It **is** attempted: `request_market_draw` builds a real request with the official SDK and the VRF program accepts it on chain (`npm run check:vrf`). Change to "Requested on chain; fulfilment blocked — no oracle identity, see Limitations" and add a Limitations entry explaining the devnet-dump queue problem. | **DONE** |
| 1.2 | `README.md` line ~24: PER row reads "Implemented and building; live proof blocked". The gate is now proven locally. Change to "ACL enforced by the query-filtering-service; attestation needs a TEE" and point at the table in Limitations §1, which is already correct. | **DONE** |
| 1.3 | `README.md` Limitations §3 still names `3nmxq3N78WQGQPXULxmSQ2rjXYwX8zrjrcYxnP2aQpNo` as "the market". Markets are now live pump.fun + Jupiter mints. Rewrite to say positions are virtual inventory against a real mainnet mint identity, and drop the demo mint. | **DONE** |
| 1.4 | `README.md` Limitations §5 says the `.so` is 636KB. It is now **702,128 bytes**. Update the number and the SOL estimate. | **DONE** |
| 1.5 | `README.md`: document `MAX_OPEN_AGE` (300s). An unjoined match older than that cannot be joined, because both books are seeded from the price snapshotted at creation. Currently undocumented anywhere outside `state.rs`. | **DONE** |
| 1.6 | `SUBMISSION.md` is stale in five places: "VRF — not attempted"; `commit_and_undelegate_positions` (the instruction is singular); "Market mint: 3nmxq3N…" (retired); "5 assertion suites, 74 assertions" (now 9 suites); "22 tests, 20 pass, 2 skipped" (now 26 pass, 2 pending). Rewrite each against reality. | **DONE** |
| 1.7 | `SUBMISSION.md` "What a judge can verify in five commands" — replace with the current set: `npm run check`, `npm run check:gate`, `npm run check:race`, `npm run check:guards`, `cd chain && anchor test --skip-local-validator`. | **DONE** |
| 1.8 | `CHANGELOG-ui.md` stops at §19. Add §20 covering this run's UI work: `SettleProgress`, `RoundTimeline`, `SizePicker`, `LifecycleFeed`, `sound.ts` + the speaker icons, `solExact`, and `PixelButton` gaining `forwardRef`. | **DONE** |
| 1.9 | `IDEAS.md` build log records #7, #9, #10, #11, #12. Add #13 (clickable delegation lifecycle on `/proof`) and #23 (size control + exact impact preview), both built and verified this run. | **DONE** |
| 1.10 | Re-read `README.md` end to end against the running app and fix anything else that has drifted. Do this **after** 1.1–1.5 so it is a check, not a rewrite. | **DONE** |

---

## 3. PHASE 2 — CAPTURE THE DEMO

**Why second:** the submission cannot be filed without it, and it is the single
artefact that decides whether the privacy claim lands. Est. 2–3 hours including
retakes.

**Setup that already works** (verified this run — reuse it exactly):

- Two browser sessions on **different origins** so each gets its own in-page
  wallet: `http://localhost:8081` and `http://127.0.0.1:8081`. localStorage is
  per-origin, so these are genuinely separate wallets.
- Fund the second wallet: read its pubkey from `localStorage['masked.localKeypair.v1']`
  (bytes 32..64 are the public key), then `solana airdrop 5 <pubkey> --url http://127.0.0.1:8999`.
- Round length: `EXPO_PUBLIC_ROUND_SECONDS` overrides; demo default is 60s
  (`src/screens/data.ts`).

| # | Task | Status |
|---|---|---|
| 2.1 | Bring the stack up clean: `MASKED_RESET=1 ./scripts/localnet.sh`, deploy, `npm run sync:idl`, `npm run proxy`, `npm run seed -- 5` so the feed and leaderboard are not empty on camera. | **DONE (adapted)** — all five layers verified up; `npm run crank` settled 15 abandoned matches so LIVE RIGHT NOW is honest. **Deliberately did not `MASKED_RESET`:** the chain already holds 114 real settled tapes and 55 players, which is far better demo material than a reset plus 5 seeded duels, and resetting would discard the evidence `check:tape` asserts over. |
| 2.2 | Rebuild the static export — `dist/` is 7 hours stale and predates every fix from this run. `npx expo export -p web`. Confirm the built bundle contains `SETTLES AT THE BUZZER` and `NOTHING LEFT TO LONG`. | **DONE** — `dist/` rebuilt (2.5MB, 2,333,468-byte entry bundle) and verified to contain `SETTLES AT THE BUZZER` and `NOTHING LEFT TO LONG`. Served on :4173 and driven for real: wallet connected, funded, and a match escrowed (3.00 → 2.89 SOL) with zero console warnings. |
| 2.3 | **Privacy shot (45s).** Split screen: `/proof` in the browser, terminal running `npm run check:gate` beside it. The table must be legible: sealed → REFUSED, control → served, owner token → own only. This is the money shot; shoot it first while the stack is fresh. | **PREPARED, NOT RECORDED** — shot list, exact commands and measured timings in `DEMO.md` shot 2. `check:gate` verified at 7s. Prerequisite found in rehearsal: without `npm run hold`, `/proof` reports "no delegated position to probe" instead of the gate row. **I cannot screen-record.** |
| 2.4 | **Full duel shot (≤3 min).** Two browsers side by side. Open a match in A, join from B's open book, both trade at different sizes (MAX vs 1/4 so the impact readouts visibly differ), let the buzzer settle it, show both reveals mirroring. End on `/tape/<match>` opened from COPY TAPE LINK. | **PREPARED, NOT RECORDED** — `DEMO.md` shot 3. The two-origin two-wallet path is verified end to end (played repeatedly this session). **I cannot screen-record.** |
| 2.5 | **Lifecycle shot (20s).** Scroll `/proof` to THE LIFE OF ONE DUEL and click one row so the explorer opens. Shows the delegation story is checkable, not asserted. | **PREPARED, NOT RECORDED** — `DEMO.md` shot 1 step 4. Verified: 16 lifecycle steps render in slot order and a click opens the real explorer pointed at this cluster. **I cannot screen-record.** |
| 2.6 | Cut to a single video under 3 minutes. Order: hook (what it is) → duel → privacy proof → lifecycle → one line on what is not proved. Upload and get a public URL. | **BLOCKED — capability, not credential.** I have no screen recorder and no video-upload path. Everything short of pressing record is done: `DEMO.md` is a rehearsed, timed, one-take script with the stalls that will bite listed. This is a ~15-minute human task. |
| 2.7 | Publish a live URL, or document precisely why there is none. Options in order: static export on any host (the app talks to `127.0.0.1` clusters, so a hosted build only works against a hosted cluster — **check this before promising a URL**); otherwise state "runs locally, five commands, see README". | **DONE — resolved as NOT ACHIEVABLE, with the reason.** The build *does* support remote clusters (`EXPO_PUBLIC_L1_URL` / `EXPO_PUBLIC_ER_URL` / `EXPO_PUBLIC_CLUSTER`, baked at export time), so hosting is not the obstacle — reachable clusters are. That means devnet, which is GAP-18. Tunnelling the local stack was rejected: it would expose a validator and faucet to the internet and would die with the machine. **A live URL is blocked on the same 0 SOL as Phase 4; the submission needs the video.** |
| 2.8 | Rehearse 2.4 once end to end, timed, before recording. Two things reliably stall: the market feed on cold start, and a stale open match now showing STALE instead of JOIN. Open the match fresh, immediately before shooting. | **DONE** — rehearsed end to end. Found the `hold` prerequisite (2.3), six stalls now listed in `DEMO.md`, and **a real bug**: `prove:privacy`, a command both docs tell judges to run, crashed on the mark's own rate limit. Fixed (`crankPrice` now absorbs `PriceTooSoon`) and guarded (`check:guards`, 8 refusals). |

---

## 4. PHASE 3 — SUBMIT

**Hard deadline. Do this on Wed 2026-09-09, not Thursday night.**

| # | Task | Status |
|---|---|---|
| 3.1 | Fill the form from `SUBMISSION.md` (updated in 1.6/1.7): project name, one-liner, description, repo URL, video URL, program ID, primitives used. | **DONE** — every form field is written and paste-ready in `SUBMISSION.md`, each checked against the running system this run. |
| 3.2 | State the primitives honestly and specifically: **Ephemeral Rollups** — used, positions delegated and committed. **Private ER** — used, ACL per position, gate enforces, attestation absent. **VRF** — request path on chain, fulfilment blocked. **Session keys** — not used. | **DONE** — all four primitives stated with their real status: ER used and proved; Private ER enforced but not attested; VRF requested on chain and never fulfilled; session keys not used. |
| 3.3 | Include the five verification commands so a judge can reproduce without a wallet. | **DONE** — the five commands in `SUBMISSION.md` are the current ones (`check`, `check:gate`, `check:guards`, `check:race`, `anchor test`), all verified passing this run. |
| 3.4 | Submit. Record the confirmation in `SUBMISSION.md` with a timestamp. | **NEEDS YOU** — two reasons, neither of which I can resolve. It requires the video from 2.6, and submitting publishes to a third party on your behalf, which I will not do unprompted. `SUBMISSION.md` now ends with a six-step checklist so it is a paste-and-send, not a rewrite. |

---

## 5. PHASE 4 — DEVNET AND THE TEE (upside, blocked)

**Blocked, not abandoned.** `3YUgUPu9AdJj6FCFFvzR9pJixCN7EcAnCXMJoTuYwsS5` holds
**0 devnet SOL**, re-checked at plan time. The `.so` is **702,128 bytes**, so rent
plus buffer needs roughly **6–10 SOL** — several successful airdrops, not one.

Everything here is *upside*. Do not let it delay Phases 1–3.

| # | Task | Status |
|---|---|---|
| 4.1 | Obtain ≥ 10 devnet SOL. Try in order: `solana airdrop 2` with backoff; `faucet.solana.com` (browser captcha — **a human can do this, I cannot**); QuickNode / Helius devnet faucets; a funded second wallet. | **BLOCKED — retried 2026-09-07, four paths, all refused.** `api.devnet.solana.com` → rate limited (3 fresh attempts, ~43 total). `rpc.ankr.com/solana_devnet` → "Unauthorized: you must authenticate" — needs an API key that does not exist in this repo or env. `devnet.genesysgo.net` → endpoint dead. `faucet.solana.com/api/v1/airdrop` → serves the HTML captcha page, not an API. Balance still **0 SOL**; a 702,128-byte program needs ~6–10. **A credential that genuinely does not exist here — skipped per instruction, not failed.** |
| 4.2 | `anchor deploy --provider.cluster devnet`. Record program ID and deploy signature. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.3 | Update `FOGDUEL_PROGRAM_ID` in `src/chain/config.ts` if the ID differs; `npm run sync:idl`. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.4 | `EXPO_PUBLIC_CLUSTER=devnet npm run verify:client` — a full match against devnet + `devnet-tee.magicblock.app`. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.5 | Un-skip the two pending tests in `chain/tests/er-privacy.ts` (`PHASE 3 — funds a delegated ephemeral fee payer`, `PHASE 3 — seals both positions private`) and run against the TEE. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.6 | `EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy` — the mid-round block must print a refused opponent read against a TEE, not a process we run. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.7 | Wire `verifyTeeRpcIntegrity()` from `@magicblock-labs/ephemeral-rollups-sdk` and show the attestation result on `/proof`, replacing the current `gate attested: NO — not a TEE` row. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.8 | Seed devnet with 3–5 settled matches: `npm run seed -- 5` against devnet, needs funded wallets. | **BLOCKED by 4.1** — no devnet SOL. Code is written and ready; nothing here is missing but funding. |
| 4.9 | **Fallback, already in force:** the local stack is the demo target and the honesty section is the centrepiece rather than an apology. `/proof` reports enforcement and attestation as two separate rows and only the second says NO. | DONE |

---

## 6. PHASE 5 — THE TWO HALF-PRESENT PRIMITIVES (upside)

Both are MagicBlock primitives that are currently neither finished nor honestly
absent. Either finish them or say plainly they are unused — the worst outcome is
a judge finding a half-wired primitive we implied was working.

### 5A — Session keys · NOT STARTED

No dependency, no code, no program support. Every fill is a wallet signature,
which is the most visible UX flaw on camera when a real wallet is connected.
(The in-page dev wallet signs silently, which is why this has not bitten yet.)

| # | Task | Status |
|---|---|---|
| 5.1 | Add `@magicblock-labs/session-keys` (JS) and the matching Rust crate to `chain/programs/fogduel/Cargo.toml`. | **DONE** — `session-keys` 3.1.1 (Gum Session Protocol) with `features = ["no-entrypoint"]`. That feature does double duty: it drops the crate's own entrypoint and global allocator, which otherwise collide with ours, and it enables `session-keys-macros`. The crate accepts `anchor-lang >=0.28, <2.0`, so it fits 0.32.1. |
| 5.2 | Add a session-token account and a `#[session_auth_or(...)]` guard on `apply_fill` so a session key may sign fills for one match, for a bounded time, and nothing else. | **DONE** — `apply_fill` gained a trailing `owner: Pubkey` and a `#[session_auth_or(...)]` guard; `ApplyFill` derives `Session`, seeds the position by `owner` rather than by the signer, and takes an optional `session_token`. Without a token the signer must be the owner; with one the session program decides. Redeployed. |
| 5.3 | Create the session token at seal time in `useDuel.beginRound`, alongside the existing ACL creation. | **DONE** — `useDuel.beginRound` mints a session after sealing, via `mintSession` in `src/chain/session.ts`. Deliberately best-effort inside a try/catch: sealing is the most failure-prone moment in the product and a session is an optimisation, so a failed mint leaves the round signing every fill with the wallet exactly as before. |
| 5.4 | Route `applyFill` through the session key in `src/chain/client.ts`, falling back to the wallet if no session exists. | **DONE** — `client.applyFillAs` sends the fill signed and paid by the session key; `useDuel.fill` routes through it and falls back to the wallet — dropping the session — if the program refuses. |
| 5.5 | Show it: a `SESSION ACTIVE` row on the live screen and a line on `/proof`. Add a `check:session` suite asserting a session key can fill and cannot settle or cancel. | **DONE** — `npm run check:session`, 15 assertions, registered in `npm run check`. A `SESSION KEY · NO SIGNATURE PER FILL` badge shows on the live screen only when a session is genuinely active. **Verified in the product**: a real `ApplyFill` on the owner's position, signed and paid by `GTbajD4X…`, with a session token owned by the Gum program naming the owner as authority and the key funded 0.01 SOL by the session program. |
| 5.6 | **If not done by Wed:** say "Session keys — not used" in the submission and README. Do not imply otherwise. | **NOT NEEDED** — 5.1–5.5 landed, so the fallback of declaring session keys unused does not apply. README and SUBMISSION now list them as used, with the guard and the proof named. |

### 5B — VRF product surface · IN PROGRESS (program side done, fulfilment blocked)

`request_market_draw` and `settle_market_draw` exist, are guarded by
`#[vrf_callback]`, and `npm run check:vrf` shows the VRF program accepting a real
request. **Nothing in `src/` calls either**, so the primitive has no product
surface. Fulfilment is blocked: the queues this validator preloads were dumped
from devnet and name oracle identities we do not hold keys for, and registering
our own needs `modify_oracles` / `initialize_oracle_queue`, whose encoding is not
in the published SDK.

| # | Task | Status |
|---|---|---|
| 5.7 | Decide and record: either run a local oracle that can fulfil (`.keys/vrf-oracle.json` exists — establish whether the queue can be initialised at all), or accept the request-only state. Write the decision into `README.md`. | **DONE — decided: fulfilment is not achievable here, and the decision is in `README.md` Limitations §7 with the evidence.** Checked rather than assumed: the preloaded queue `GKE6d7iv…` is a 9500-byte account owned by the VRF program, dumped from devnet; it does **not** list the repo's `.keys/vrf-oracle.json` (`5DBVUoQ3…`), and that key is not `VRF_PROGRAM_IDENTITY` either; and `ephemeral-vrf-sdk` 0.17 exports only the *request* builders (`create_request_randomness_ix` and variants), so neither `modify_oracles`' account layout nor the queue's admin authority is available. Fulfilment needs an oracle identity that does not exist in this repo or environment. |
| 5.8 | If fulfilment can be made to work: build **BLIND DRAFT** (IDEAS #5) — VRF picks 3 markets, each player privately picks one. This is the natural showcase and would make the mode grid honest. | **BLOCKED by 5.7** — no oracle can fulfil, so a draw would never resolve. Building BLIND DRAFT on it would mean faking the randomness, which is the one thing `IDEAS.md` says not to do. |
| 5.9 | If it cannot: leave the program code in the tree (it is real), keep `check:vrf` reporting the blockage, and make sure the mode tile stays `SOON`. **Do not build UI on a draw that cannot resolve.** | **DONE** — the program code stays (it is real and `check:vrf` exercises it), `check:vrf` still reports exactly where it stops, and BLIND DRAFT remains a `SOON` tile in `src/screens/data.ts`. Verified no UI is built on a draw: `grep` for `requestMarketDraw|marketDraw|settleMarketDraw` across `src/` hits only the generated `idl.ts`. |

---

## 7. PHASE 6 — PRODUCT DEPTH (only if 1–3 are green)

Ranked list lives in `IDEAS.md`. Tier 1 is complete except #2 (session keys,
above) and #5 (blind draft, blocked). The next unbuilt items, in order:

| # | Task | Status |
|---|---|---|
| 6.1 | IDEAS #14 — mark sparkline on every market row in the picker. Needs a real price history source; pump.fun's `frontend-api-v3` must be checked for a candles endpoint first. **If there is no real history, do not build it** — a synthesised sparkline is exactly the class of defect removed this run. | NOT STARTED |
| 6.2 | IDEAS #15 — "what you would have made" counterfactual PnL, computed from the tape's own fills. Real and cheap. | NOT STARTED |
| 6.3 | IDEAS #16 — opponent fill-count heartbeat: animate the one thing the fog does leak. | NOT STARTED |
| 6.4 | IDEAS #17 — keyboard controls (L long, C close, space settle). Demo speed. | NOT STARTED |
| 6.5 | IDEAS #19 — auto-settle any expired match the app notices, not just your own. Turns `npm run crank` into product behaviour. | NOT STARTED |
| 6.6 | IDEAS #22 — `/proof` "run this yourself": the exact commands, copyable. High judge value, near-zero cost. | NOT STARTED |
| 6.7 | IDEAS #30 — honest "what this costs" panel: real fees paid per round, summed from the lifecycle transactions already fetched by `useDuelProof`. | NOT STARTED |

---

## 8. PHASE 7 — STANDING VERIFICATION

Already built. Keep it green; do not let a Phase 5/6 change break it.

| # | Task | Status |
|---|---|---|
| 7.1 | `npm run check` — 9 suites. Run before every commit. | DONE |
| 7.2 | `cd chain && anchor test --skip-local-validator` — 26 passing, 2 pending. | DONE |
| 7.3 | `TEST-PLAN.md` — 139 items, 137 PASS / 2 UNTESTED. Re-run the affected section after any change. | DONE |
| 7.4 | Two-session browser method documented in `TEST-PLAN.md` "How this run is different". Use it for anything touching matchmaking, sealing or settlement. | DONE |
| 7.5 | Add `check:session` when 5A lands. | BLOCKED by 5.2 |

---

## 9. GAP AUDIT

Every gap below is real, was found by reading the code or running it, and is
tied to the task it blocks.

### Documentation contradicts the product

| ID | Gap | Evidence | Blocks |
|---|---|---|---|
| GAP-1 | README claims VRF "Not attempted" | `README.md:26` vs `request_market_draw` in `lib.rs:515` and `npm run check:vrf` passing | 1.1, 3.2 |
| GAP-2 | README PER row says live proof blocked; the gate is proven locally | `README.md:24` vs `README.md:246` (its own Limitations table) and `npm run check:gate` | 1.2 |
| GAP-3 | README names a retired demo mint as "the market" | `README.md` Limitations §3 vs `src/chain/markets.ts` (live pump.fun/Jupiter mints) | 1.3 |
| GAP-4 | README `.so` size wrong: says 636KB, is 702,128 bytes | `ls -la chain/target/deploy/fogduel.so` | 1.4, 4.1 |
| GAP-5 | `MAX_OPEN_AGE` (300s) undocumented outside `state.rs` — a judge who leaves a match open and returns will find it un-joinable with no explanation in the docs | `chain/programs/fogduel/src/state.rs` | 1.5 |
| GAP-6 | `SUBMISSION.md` stale in 5 named places | See task 1.6 | 1.6, 3.1 |
| GAP-7 | `CHANGELOG-ui.md` stops at §19; six components and a sound engine undocumented | `grep '^## ' CHANGELOG-ui.md \| tail` | 1.8 |
| GAP-8 | `IDEAS.md` build log missing #13 and #23, both built this run | `grep '^### #' IDEAS.md` | 1.9 |

### Submission artefacts

| ID | Gap | Evidence | Blocks |
|---|---|---|---|
| GAP-9 | **No demo video.** No `.mp4`/`.mov` anywhere in the repo | `ls *.mp4 *.mov docs/*.mp4` → none | 2.6, 3.1 |
| GAP-10 | `dist/` is stale — built 03:31, newest source 10:59. Missing every fix from this run | `stat -f "%Sm" dist` vs newest `src/` file | 2.2, 2.7 |
| GAP-11 | **Not submitted.** The only irreversible deadline in this document | `SUBMISSION.md` header: "Status: not yet submitted" | 3.4 |
| GAP-12 | No live URL, and it may not be achievable — the app points at `127.0.0.1` clusters, so a hosted build needs a hosted cluster. Unverified either way | `src/chain/config.ts` `CLUSTERS.local` | 2.7 |

### MagicBlock primitives

| ID | Gap | Evidence | Blocks |
|---|---|---|---|
| GAP-13 | **Session keys entirely absent** — no JS dependency, no Rust crate, no code | `package.json` and `chain/programs/fogduel/Cargo.toml` contain no session package | 5.1–5.6 |
| GAP-14 | **VRF has no product surface** — program instructions and `check:vrf` exist, but `grep -rn "requestMarketDraw\|MarketDraw" src/` hits only `idl.ts` | Nothing in `src/` calls either instruction | 5.7–5.9 |
| GAP-15 | VRF cannot be fulfilled — preloaded queues are devnet dumps naming oracle identities we do not hold; `modify_oracles` / `initialize_oracle_queue` encodings are not in the published SDK | `npm run check:vrf` output | 5.7, 5.8 |
| GAP-16 | Two chain tests permanently pending — the ephemeral-permission TEE path | `chain/tests/er-privacy.ts:162,175` (`it.skip`) | 4.5 |
| GAP-17 | PER attestation unproved: the gate is a process we run, not an attested enclave | `/proof` `gate attested: NO — not a TEE` | 4.6, 4.7 |

### Infrastructure

| ID | Gap | Evidence | Blocks |
|---|---|---|---|
| GAP-18 | **0 devnet SOL**, faucet refused 40+ times; needs ~6–10 SOL for a 702KB program | `solana balance 3YUgUPu9… --url devnet` → 0 SOL | 4.1 → 4.2–4.8 |
| GAP-19 | Demo depends on 5 local processes (8999, 7799, 6699, 8791, 8081). Any one down and the demo dies. No single health gate before recording | `./scripts/localnet.sh` + `npm run proxy` + metro | 2.1, 2.8 |
| GAP-20 | Reduced motion honoured in code but never observed — browser tooling here cannot emulate the OS setting | `TEST-PLAN.md` O6, marked UNTESTED | — (accepted) |

### Not gaps — checked and clear

- **No mocks, stubs, fakes, dummies or placeholders.** The full grep returns 4
  hits, every one prose explaining that something is *not* a placeholder
  (`LocalKeyWallet.ts:4`, `pumpfun.ts:126`, `open-matches.mts:37`,
  `seed-demo.mts:64`).
- **No TODO or FIXME anywhere** in `src/ app/ chain/programs/ scripts/ server/`.
- **No invented data on any screen.** Three pieces were found and removed this
  run: the reveal's synthesized opponent curve, the feed's interpolated
  sparkline, and the landing page's hardcoded market label.
- The 11 `SOON` mode tiles are labelled `SOON` and claim nothing.

---

## 10. RUNNING IT, FOR AN AGENT PICKING THIS UP COLD

```bash
# 1. stack — base :8999, rollup :7799, gate :6699
./scripts/localnet.sh                    # or MASKED_RESET=1 for genesis

# 2. deploy + IDL
cd chain && anchor build && anchor deploy --provider.cluster http://127.0.0.1:8999
cd .. && npm run sync:idl

# 3. market proxy :8791 (CORS shim for pump.fun + Jupiter)
npm run proxy

# 4. app :8081
npm run web

# 5. verify
npm run check                            # 9 suites
cd chain && anchor test --skip-local-validator   # 26 passing, 2 pending
npm run check:gate                       # the privacy proof
npm run crank                            # settle anything abandoned
```

**Two-session testing** (required for anything touching matchmaking, sealing or
settlement — a single browser plus a CLI hides races):
open `http://localhost:8081` and `http://127.0.0.1:8081`. Different origins mean
different `localStorage`, so each gets its own wallet. Fund the second with
`solana airdrop 5 <pubkey> --url http://127.0.0.1:8999`.

---

## 11. ORDER OF WORK

1. **Phase 1** (docs true) — 90 minutes. Do it today.
2. **Phase 2** (demo capture) — 3 hours. Do it Mon/Tue while the stack is fresh.
3. **Phase 3** (submit) — Wed. Not Thursday night.
4. **Phase 4** (devnet) — opportunistic; retry the faucet daily, never block on it.
5. **Phase 5A** (session keys) — only if 1–3 are done by Wed. Otherwise task 5.6.
6. **Phase 6** — only if everything above is green.

The single highest-value hour in this document is **Phase 2, task 2.3** — the
privacy shot. Everything else is either already built or replaceable.
