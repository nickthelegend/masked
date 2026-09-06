# FOGDUEL — BUILD PLAN

> MagicBlock Solana Blitz v8. Rewritten 2026-09-07 against the current
> codebase. Supersedes the earlier plan, which described work that is now done.
> **Planning only — nothing in this document has been executed in this pass.**

---

## 0. SITUATION

**Deadline: Fri 2026-09-11 05:00 CDT. Now: Sun 2026-09-07 ~21:45 UTC.
Remaining: 4 days 12 hours.**

48 commits. The working tree is clean and the local stack is healthy.

**What is genuinely finished and verified:**

- An Anchor program with 14 instructions, deployed and exercised on a local
  MagicBlock stack (`mb-test-validator` + `ephemeral-validator`).
- **22 on-chain tests** across three suites (11 lifecycle, 7 ER, 4 permission);
  20 pass, 2 deliberately skipped and documented.
- **5 assertion suites, 74 assertions** — token drift, series maths, fog
  integrity, error taxonomy, preflight — all green.
- A typed client that drives a complete match end to end (`verify:client`).
- A privacy proof script that walks a real match and reports honestly
  (`prove:privacy`).
- Five routes (`/`, `/play`, `/proof`, `/health`, `/gallery`) plus a branded
  404, all reading live chain state.
- **A 74-item browser test plan executed to 72 PASS / 0 FAIL / 2 untestable**,
  with 11 defects found and fixed (see `TEST-PLAN.md`).
- Effectively zero mocks: a full grep for
  `mock|stub|todo|fixme|fake|dummy|placeholder|hardcod|hack|xxx` across
  `src/`, `app/`, `chain/`, `scripts/` returns **one** hit — the documented
  Mobile Wallet Adapter shim.

**What is not done, in one line each:**

1. The **app itself never creates the privacy ACL** — only the script does.
2. Nothing is deployed to **devnet**; the wallet has 0 SOL.
3. **PER privacy is unproved** on a real TEE.
4. There is **no demo video** and **no submission**.

**The honest headline:** this is a well-built, well-tested local product that
has not been submitted and whose differentiator is not yet wired into the
product it differentiates. Phases 1 and 2 below are worth more than everything
else in this document combined.

---

## 1. GOALS

### 1.1 "Done" — the floor for a valid submission

- [ ] Program deployed to **devnet** with a published program ID.
- [ ] A full match runs end to end on devnet: create → join → delegate →
      fills on the ER → buzzer → commit + undelegate → settle → pot paid →
      public `Tape` written.
- [ ] **Ephemeral Rollups** integrated for real — already true locally, must be
      true on devnet.
- [ ] **Private Ephemeral Rollups** integrated: the opponent's `Position` is
      unreadable by anyone but its owner while the match is Live.
- [ ] Public repo with a README that states how to run it, which validator,
      which accounts are private and when, and devnet tx signatures.
- [ ] Demo video or live URL showing one complete match.
- [ ] Submitted at https://build.magicblock.app/?stage=blitz#submit before
      Fri Sep 11 05:00 CDT.

### 1.2 "Winning" — what actually places

- [ ] **The privacy proof is on camera.** Terminal beside the UI: a read of the
      opponent's `Position` **refused mid-round** and **allowed after settle**.
      Without this we are a slower VERSUS with worse liquidity.
- [ ] **The product does the thing, not just a script.** A judge who plays a
      match through the UI must be creating and delegating real permissions. If
      privacy only happens when a script runs, the pitch is a demo, not a
      product. (This is Phase 1 and it is currently the single largest gap.)
- [ ] The pitch names only MagicBlock primitives: PER hides the book so the
      leaderboard cannot be copy-traded mid-match; ER gives real-time fills;
      commit makes the result verifiable on Solana.
- [ ] Framed as a generalisation of `rock-paper-scissor` (hidden moves) and
      `sealed-auction` (private bids + escrow + reveal).
- [ ] Every limitation disclosed before a judge finds it. `/proof` and the
      README already do this; keep it that way.

### 1.3 Non-goals — do not build these

Modes beyond Fog Duel (the 11 `SOON` tiles stay tiles). Social graph, chat,
quests-as-an-economy, NFT trophies, tournaments, mobile-native wallet support.
No new UI components — the library is complete and frozen at 35 files.

---

## 2. PHASE 1 — WIRE PRIVACY INTO THE PRODUCT ⚠ HIGHEST PRIORITY

**Why first:** `useDuel` calls `delegatePosition` but never
`createPositionPermission` or `delegatePositionPermission`. Verified by grep —
both return 0 occurrences in `src/screens/useDuel.ts`. The ACL exists in the
program, in the client, in the tests and in the proof script, but **not in the
path a player takes.** No devnet work is worth anything until this is true.

| # | Task | Status |
|---|---|---|
| 1.1 | In `useDuel.startMatch` and `joinMatchByAddress`, after both positions are delegated, call `client.createPositionPermission(match, owner, payer)` for both players. | DONE |
| 1.2 | Then call `client.delegatePositionPermission(match, owner, payer)` for both, so the ACL is delegated to the same validator as the position. | DONE |
| 1.3 | Order matters: create the permission **before** delegating the position, or the PDA is owned by the delegation program and the CPI will fail. Verify the ordering against `chain/tests/permission.ts`, which does create → delegate-permission → delegate-position. | DONE |
| 1.4 | Surface it in the UI: a "SEALED" badge on the opponent panel once the permission is confirmed on chain, driven by a real `getAccountInfo` on the permission PDA — not a local boolean. | DONE |
| 1.5 | Extend `useDelegationStatus` to watch the two permission PDAs so `/proof` shows them flipping to `ACLseo…` alongside the positions. | DONE |
| 1.6 | Wire `init_position_privacy` into `client.ts`. It is the only program instruction with no client method (`process_undelegation` is called by the delegation program, not by us) and it is the TEE path needed in Phase 2. | DONE |
| 1.7 | Add a browser test to `TEST-PLAN.md` section H: after starting a match through the UI, both permission PDAs exist on chain with the owner as sole member. | DONE |

---

## 3. PHASE 2 — DEVNET + THE TEE PROOF

**Why second:** this is where privacy becomes real rather than architectural.

**Hard blocker:** the wallet `3YUgUPu9AdJj6FCFFvzR9pJixCN7EcAnCXMJoTuYwsS5`
holds **0 devnet SOL** and `solana airdrop` is rate-limited (re-checked at
plan time — still refused). The program `.so` is **636,216 bytes**, so
rent-exemption plus the deploy buffer needs roughly **5–9 SOL**. A single
2 SOL airdrop is not enough; this needs several successful requests or a
faucet that grants more.

| # | Task | Status |
|---|---|---|
| 2.1 | Obtain ≥ 9 devnet SOL. Try in order: `solana airdrop 2` repeatedly with backoff; https://faucet.solana.com (web, captcha); the QuickNode / Helius devnet faucets; a funded teammate wallet. | BLOCKED — every public faucet refused at plan time |
| 2.2 | `anchor deploy --provider.cluster devnet`. Record the program ID and the deploy signature. | BLOCKED by 2.1 |
| 2.3 | Update `FOGDUEL_PROGRAM_ID` in `src/chain/config.ts` if the deployed ID differs, and re-run `npm run sync:idl`. | BLOCKED by 2.1 |
| 2.4 | Run `EXPO_PUBLIC_CLUSTER=devnet npm run verify:client` — a full match against devnet + `devnet-tee.magicblock.app`. | BLOCKED by 2.1 |
| 2.5 | Un-skip the two pending tests in `chain/tests/er-privacy.ts` (the ephemeral-permission path) and run them against the TEE. | BLOCKED by 2.1 |
| 2.6 | Run `EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy`. The MID-ROUND VISIBILITY block must print `you reading THEIR position … NO ← REFUSED`. **This is the money shot.** | BLOCKED by 2.1 |
| 2.7 | Wire `verifyTeeRpcIntegrity()` and `getAuthToken()` (both exported by `@magicblock-labs/ephemeral-rollups-sdk`) into the client so private reads carry an auth token, and show attestation status on `/proof`. | BLOCKED by 2.1 |
| 2.8 | Seed devnet with 3–5 real settled matches so the feed, board and `/proof` are not empty for judges. `npm run seed -- 5` already does this; it needs funded wallets on devnet. | BLOCKED by 2.1 |
| 2.9 | If 2.1 cannot be unblocked by Sep 9, fall back: keep the local stack as the demo target, and make the honesty section on `/proof` and in the README the centrepiece rather than an apology. | NOT STARTED |

---

## 4. PHASE 3 — DEMO READINESS

Small, cheap, and each one removes a stumble in front of a judge.

| # | Task | Status |
|---|---|---|
| 3.1 | `ROUND_SECONDS` is 300. A five-minute wait is unwatchable. Make it configurable and default the demo to 60s; the seeder already uses 30s. | DONE |
| 3.2 | Every `create_match` call passes `mint: PublicKey.default` while the UI labels the market `$BONK`. Either pass a real devnet mint and label it from the match account, or relabel honestly as a synthetic market. Do not leave a fictional ticker over a null mint. | DONE |
| 3.3 | Record the privacy proof: split screen, `/proof` and the UI on the left, `prove:privacy` running on the right. 45 seconds. | BLOCKED by 2.6 |
| 3.4 | Record one full match end to end with two wallets. Under 3 minutes total. | BLOCKED by 2.2 |
| 3.5 | Rehearse the README's 3-minute demo script end to end once, timed, and fix anything that stalls. | DONE |
| 3.6 | Confirm the app is reachable at a URL a judge can open — either a deployed static export (`npx expo export -p web`) or a documented local run. | DONE |
| 3.7 | Two-wallet demo needs both funded and both browsers ready before recording. Prepare and check in advance. | BLOCKED by 2.1 |

---

## 5. PHASE 4 — SUBMISSION

| # | Task | Status |
|---|---|---|
| 4.1 | Update the README: replace "Program ID (local)" with the devnet ID, and add devnet tx signatures for one complete match. | BLOCKED by 2.2 |
| 4.2 | Re-check the README "Honest limitations" section against reality after Phase 2 — several items should shrink or disappear. | DONE |
| 4.3 | Fill the submission form: repo URL, one-line description ("hidden-position 1v1 trading on Private ER, reveal + pot on L1"), demo video/live URL, explicit primitive list (ER + PER, VRF not attempted), devnet program ID. | DONE — SUBMISSION.md prepared; form not yet submitted |
| 4.4 | **Submit by Thu Sep 10 evening.** Do not aim at the Friday 05:00 boundary. | NOT STARTED |

---

## 6. PHASE 5 — ONLY IF PHASES 1–4 ARE GREEN

| # | Task | Status |
|---|---|---|
| 5.1 | Session keys, so a fill does not need a wallet signature each time. Pattern: `session-keys/anchor`. | NOT STARTED |
| 5.2 | Magic Router (`sendMagicTransaction`) so the client stops choosing endpoints by hand. | NOT STARTED |
| 5.3 | VRF blind-token select. Pattern: `roll-dice/anchor`. | NOT STARTED |
| 5.4 | Spectator mode — watch a live match with both sides fogged. | NOT STARTED |
| 5.5 | Real oracle price (Pyth/Switchboard) replacing the cranked `PriceFeed`. | NOT STARTED |

---

## 7. GAP AUDIT

Read from the codebase, not the README. Every gap tied to the task it blocks.

### 7.1 Blocking gaps

| Gap | Evidence | Blocks |
|---|---|---|
| **The app never creates or delegates permissions** | `grep -c createPositionPermission src/screens/useDuel.ts` → **0**; same for `delegatePositionPermission` | 1.1–1.5. The differentiator is absent from the product. |
| **Nothing deployed to devnet** | `solana account <id> --url devnet` → not found | 2.2, 3.4, 4.1, 4.3 |
| **0 devnet SOL, faucets refusing** | `solana airdrop 2 --url devnet` → rate-limited, re-checked at plan time | 2.1 and everything downstream |
| **Deploy needs ~5–9 SOL** | `.so` is 636,216 bytes; rent-exemption ≈ 4.4 SOL plus deploy buffer | 2.1 — one 2 SOL airdrop is insufficient |
| **PER privacy unproved** | local `ephemeral-validator` has no TEE ingress; opponent read returns 519 bytes | 2.5, 2.6, 3.3 |
| **No demo video** | no `*.mp4` / `*.mov` in the repo | 3.3, 3.4, 4.3 |
| **Not submitted** | — | 4.4 |

### 7.2 Correctness / honesty gaps

| Gap | Evidence | Blocks |
|---|---|---|
| `init_position_privacy` has no client method | instruction-vs-client diff: the only unwired instruction | 1.6, 2.7 |
| Fictional ticker over a null mint | `TOKEN = '$BONK'` in `data.ts`; every call site passes `mint: PublicKey.default` | 3.2 |
| Round is 5 minutes | `ROUND_SECONDS = 300`; seeder uses 30s; README demo implies shorter | 3.1 |
| README says "Program ID (local)" | `README.md:226` | 4.1 |
| TEE attestation unused | `verifyTeeRpcIntegrity` / `getAuthToken` exported by the SDK, never called | 2.7 |

### 7.3 Mock / stub scan — near clean

Full grep for `mock|stub|todo|fixme|fake|dummy|placeholder|hardcod|hack|xxx`
across `src/`, `app/`, `chain/programs/`, `chain/tests/`, `scripts/`:

- **1 hit:** `src/chain/shims/empty.js` — a functional stub for
  `@solana-mobile/*`, which `@solana/wallet-adapter-react` imports
  unconditionally. The demo is web-only and this is documented. **Not a gap**,
  but it is the reason mobile is out of scope.

`Math.random` audit — 3 legitimate uses, no simulated product data:
- `src/ui/series.ts` ×2 — a default `rand` parameter; every product call site
  passes a seeded `mulberry32`.
- `src/screens/UIGallery.tsx` — the "ROLL PNL" button that demonstrates the
  odometer in isolation.

Static content remaining in `data.ts` is copy, not data: `MODES` (all `SOON`),
`HOW_IT_WORKS`, `FEED_FILTERS`, `LANDING_STAT_LABELS`, `TOKEN`, `RAKE`,
`ROUND_SECONDS`. Only `TOKEN` is a problem, and it is 3.2.

### 7.4 Known-untestable (from `TEST-PLAN.md`)

| Item | Why | Unblocked by |
|---|---|---|
| H5 — TEE read-blocking | needs a TEE validator | 2.1 → 2.6 |
| M2 — wallet connect round trip | needs a real Solflare wallet with a key | manual, out of scope for automation |

---

## 8. SCHEDULE

| When | Focus | Exit criterion |
|---|---|---|
| **Mon Sep 7 (rest of today)** | Phase 1 in full. Start Phase 2.1 in the background — hit the faucet on a loop from the first minute. | A match started in the UI creates two permission PDAs on chain. |
| **Tue Sep 8** | Phase 2, assuming funding lands. If not, escalate 2.1 hard; it is the only thing standing between this and a winning submission. | `prove:privacy` on devnet prints REFUSED. |
| **Wed Sep 9** | Phase 3. Decide 2.9 (devnet vs local demo) by end of day — do not leave it later. | Demo script rehearsed and timed. |
| **Thu Sep 10** | Record, write up, **submit in the evening**. | Submitted. |
| **Fri Sep 11 (before 05:00 CDT)** | Buffer only. No new features. | — |

### Cut order

1. Phase 5 in full (session keys, router, VRF, spectator, oracle)
2. TEE attestation display (2.7)
3. Real mint (3.2) — relabel instead
4. Devnet entirely (2.9) — demo locally and be explicit about it

**Never cut:** Phase 1 (privacy in the product), settlement, ER
delegate/commit, the honesty sections.

---

## 9. RISKS

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Devnet funding never arrives | **High** — every faucet refused at plan time | Removes the TEE proof and the devnet ID | Start on it immediately and in parallel; 2.9 is a real fallback, not a face-saver |
| Wiring permissions into `useDuel` breaks the working match flow | Medium | Would damage the one thing that works | 22 on-chain tests + `verify:client` + the 74-item browser plan all exist — re-run them after every change |
| Permission-before-delegation ordering | Medium | CPI fails once the position is owned by the delegation program | `chain/tests/permission.ts` already proves the correct order; copy it |
| Recording eats Thursday | Medium | Missed submission | Submit a rough cut early, replace it if a better take lands |
| Scope creep into Phase 5 | Low | Fatal to the timeline | It is explicitly last and explicitly cuttable |

---

## 10. VERIFICATION ALREADY IN PLACE

Re-run all of it after any change in Phase 1 or 2. It is the safety net.

```bash
npm run check          # 5 suites, 74 assertions
npm run verify:client  # full match through the app's own client
npm run prove:privacy  # privacy proof, stage by stage
npm run truth          # RPC ground truth, to check the UI against
cd chain && anchor test --skip-local-validator   # 22 tests, 20 pass 2 skipped
```

Local stack (needs `--limit-ledger-size` or `/proof`'s feed goes blank):

```bash
cd chain
npx mb-test-validator --reset --ledger /tmp/fd-ledger \
  --rpc-port 8999 --faucet-port 9901 --gossip-port 8110 \
  --dynamic-port-range 8111-8220 --limit-ledger-size 500000000
npx ephemeral-validator --remotes http://127.0.0.1:8999 \
  --lifecycle ephemeral --listen 127.0.0.1:7799 --storage /tmp/fd-er --reset --no-tui
```
