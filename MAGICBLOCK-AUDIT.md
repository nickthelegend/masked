# MagicBlock integration audit — MASKED (program `fogduel`)

**Updated 2026-09-13 00:40 UTC — see §0 for what changed.** **Re-verified 2026-09-12, 22:14–22:40 UTC.** This replaces the 20:40–21:50 UTC version of this file, which is kept at `…/scratchpad/MAGICBLOCK-AUDIT.prior-2026-09-12T2150Z.md`.

The earlier pass could not get a duel past "open a match": after two days offline, the local base clock was 44 h behind the rollup. The chain was re-created from genesis at 21:34 UTC, and **every flow below ran end to end, triggered from the UI.**

**Evidence, and how each kind is marked:**

| Mark | What it means |
|---|---|
| **UI** | Driven in real Chrome (Claude in Chrome) against the production export on `:4180`. Two wallets on two origins; network and console read at each step |
| **chain** | Read back from the base layer (`:8999`) and the raw rollup (`:7799`) after each step. Instruction names come from transaction logs; fee payers from the message keys |
| **live** | A call made this pass to MagicBlock's hosted devnet/mainnet endpoints or MCP servers |
| **pinned** | Read in the installed SDK sources: `@magicblock-labs/ephemeral-rollups-sdk` 0.17.0 (JS), `ephemeral-rollups-sdk` 0.17.0, `ephemeral-vrf-sdk` 0.17.0, `magicblock-magic-program-api` 0.10.1 |
| **(docs)** | MagicBlock documentation or blog, not re-verified in this pass |

---

## 0. Update — 2026-09-13 00:40 UTC: what changed after the 22:40 audit

Sections 1–11 are the 22:40 audit as written; every finding it raised now carries a status. This table is the summary, with the evidence marks defined above.

| Finding (22:40) | Status now | Evidence |
|---|---|---|
| **A busy round never came home** — found at 00:50 by the parallel session's soak, after this audit | **Fixed on the local stack.** The rollup commits a small change as instruction data. A position after ~20 fills has rewritten ~207 of its 543 bytes (the 16-entry fill list shifts on every fill), so its commit is staged through MagicBlock's committor program `ComtrB2KEaWgXsW1dhr1xYL4Ht4Bjj3gXnnL6KMdABq` — which `mb-test-validator` 0.14.10 does not preload. Every buffer transaction failed on base, and the committor left the intent pending with no error and no retry: both positions delegated for good, the match `live`, the pot unsettleable. A UI player who trades twenty times in a round hits the same wall. `scripts/localnet.sh` now fetches the program from devnet, preloads it at genesis, and warns when a running ledger lacks it | **chain, before:** the rollup's `committor_service.sqlite` held 6 `DiffBuffer` commits, all `Pending` with no signature, beside 190 `DiffArgs`/`StateArgs` commits, all `Succeeded`; at each soak buzzer (00:50:14, 00:54:49, 00:57:01) the rollup identity's base transactions `ComputeBudget ×2 + ComtrB2K… + noop` failed `ProgramAccountNotFound`. Pre-fix ledger kept at `.localnet/ledger-no-committor-20260913T011122Z` (deleted 2026-09-13 20:06 UTC in a disk cleanup, with the owner's OK). **chain, after** a reset from genesis at 01:11 UTC: new suite `a busy round still comes home` in `chain/tests/er-cranks.ts` — 24 fills per side, the crank's buzzer commit brings both positions and the status home, both ACLs released, settled; the committor DB records that round's two positions as `DiffBuffer` `Succeeded`, and base shows the committor's `Init`, `Write` and `Close` transactions, all ok |
| **A player who left froze their own mark** — found at 02:19 while sampling price feeds | **Fixed in the client.** Marks come from browsers: each posted only its own market's, and `settle_match` values each side at its own last post, so a player who hid or closed the tab froze the price their PnL settles at (a tab the browser had throttled posted about once a minute). Each client's crank now also reads the opponent's feed and, when it is more than 15 s old, posts that market's live price for them — permissionless and rate-limited on chain, from the same public source | **UI + chain:** duel `92M7XXj6…`, creator gone before the join: the creator's feed took a `PushPrice` exactly every 15 s from 02:37:36 to the buzzer, every one signed by the joiner; the crank committed the round and the joiner's client settled it (`SettleMatch` slot 6632). The pricing oracle would remove the browser from this path altogether — still unavailable on the local stack |
| **Seal and settle race** — 8 failed base transactions and 1 failed rollup transaction on duel `8HPW…` (§6.1) | **Fixed.** Only the joiner's client seals; the creator's waits on chain progress and seals only after 20 s without any. Only the creator's client settles; the joiner's steps in only after 30 s without progress | **UI + chain:** duel `3dvQqLYx…zDv1AX`, two origins, played by the parallel session on the 22:57 UTC export — **0 failed transactions on either layer**. The seal ran exactly once (7 base transactions); `RequestSettle` and `SettleMatch` ran once each |
| **`/proof` showed failures as steps** (§6.2) | **Fixed.** A refused transaction reads `FAILED` and is counted in the badge and the cost panel; the cost is set against the traced duel's own pot rather than a fixed 0.20◎; the page traces the newest duel that was actually sealed, and lists its ACLs' histories too | **UI:** on `:4190/proof`, straight after `npm run check`, the newest sealed duel was `check:race`'s deliberate two-client seal. Its six refused duplicates read `CREATE POSITION PERMISSION · FAILED` and so on, the badge `16 · 6 FAILED`, the cost panel `refused on chain: 6 of 16` against that duel's own 0.10◎ pot; 0 console errors. That is also the caveat: on a cluster that has just run the check suite, the duel `/proof` traces is a test's, and its failures are that test's by design |
| **Browsers run the keeper; the scheduler held 0 tasks** (§6.3) | **Fixed for liquidation and the buzzer — marks still come from browsers.** `schedule_round_cranks` puts two tasks on the rollup's own scheduler once the round is sealed: the keeper (`crank_liquidate`, every 2 s until just before the buzzer) and the buzzer (`crank_commit_round`, 2 s after the clock runs out, committing both positions and the round status to Solana). Both run under the per-authority crank-signer PDA (`crank-executor`), read-only, as the magic program requires. The browser's liquidation probe now runs only if scheduling failed | **chain:** `chain/tests/er-cranks.ts`, green on the local rollup — the keeper liquidated a blown-up short with nobody calling `liquidate`, and the buzzer committed both positions and the status to Solana with no client commit, the commit found inside an `Executed crank` transaction. A standalone run before the tests: 20 keeper executions, 0 failed |
| **ACLs never returned** (§6.4) | **Fixed, by each player.** After the buzzer each client releases its own ACL with the permission program's `CommitAndUndelegatePermission`, signed by the wallet the ACL names, with the position read-only | **chain:** both ACLs back under `ACLseo…` in the tests, one released before its position's commit and one after; live, one released after its position had already come home. **Why not the program:** with a delegated position PDA as the signer, the magic program demands a fee vault the permission program does not pass (`ScheduleCommit ERR: invalid magic fee vault account`, simulated) — so that instruction was built, disproved and removed rather than shipped |
| **Deprecated commit helper** (§6.5) | **Fixed.** Commits schedule through `MagicIntentBundleBuilder` (`ScheduleIntentBundle`). On the crank path the payer stays read-only, which the builder would otherwise mark writable | **chain:** `PHASE 5 — commits and undelegates back to L1` passes on the new path. **pinned + source:** `ScheduleTask` (6) and `ScheduleIntentBundle` (11) encode to the same variants in the SDK's API crate 0.10.1 and in the v0.14.10 validator |
| **"gate attested" was a config flag** (§5.1) | **Fixed.** The row never says YES on the flag's word; on a TEE cluster it names the check. `scripts/check-tee.mts` asks the enclave: a fresh 64-byte challenge, an Intel TDX quote verified against Intel's collateral, and report data matching the challenge | **live:** `tee ok — https://devnet-tee.magicblock.app … (1832ms)`. The verifier needs Node's `crypto`, so it cannot run inside the browser bundle |
| **The crank flow, played in the UI** | **Verified** | **UI + chain:** duel `B1NxXkHD…fnoK`, 1◎, two wallets on two origins (`127.0.0.1:4190` / `localhost:4190`), 00:30 UTC: **0 failed transactions on either layer**; the seal once; per position 27 `CrankLiquidate` and 2 `CrankCommitRound` run by the rollup's crank signer, with no client commit and no browser liquidation; `ProcessUndelegation` at slot 20951 and the creator's client settling at 20953 after waiting for the crank; **both ACLs back under `ACLseo…`**, each released by its own wallet; the joiner's LONG a rollup-only `ApplyFill` through the session key; reveals mirror the tape's 0 / −31 bps; `/proof` traces the duel with both ACLs `HOME ON SOLANA` and 12 transactions, none refused; 0 console errors. A second duel, `Gka31FTm…`, caught a creator stranded on reload by an invite-landing race (fixed in `useDuel.ts` and `MaskedApp.tsx`) and still settled with 0 failed transactions — the crank committed the round and the joiner's fallback settled it |
| A liquidation counted twice in `fill_count` (found while building the keeper) | **Fixed** | The keeper test asserts `fill_count == fills.length` |
| **No public deployment** (§6.6) | **Open — blocked** on devnet SOL: 0 in the deploy wallet, faucet rate-limited | — |

**Program surface:** 22 instructions (was 19). **Anchor tests:** 38 passing, 2 pending (was 27 / 2), on the stack reset from genesis at 01:43 UTC with the tape-window program (a Position is now 559 bytes).

**Still not used:** the Pricing Oracle (served by hosted rollups only; nothing on the local stack answers it), Magic Actions, ephemeral accounts, Ephemeral SPL, the Magic Router, VRF fulfilment, and the TEE rollup itself.

---

## 1. The honest answer

**MagicBlock is genuinely used, and it is the product's core loop — not a checkbox import.**

One real duel was played through the UI (match `8HPWRzKD3i2vKE7i3h59dtRZ296hejjtvmHfmLnpwMyv`, 60 s, 22:22–22:24 UTC). Every step below was observed on chain:

1. **Delegation.** Both positions and the public round status were delegated from Solana to the Ephemeral Rollup, so the base-layer owner became the delegation program.
2. **Access control.** Each position got a permission-program ACL, and the ACL was delegated too.
3. **Gate sign-in.** The browser signed in to the read gate: `GET /auth/challenge`, then `POST /auth/login`, then a bearer token on every rollup call.
4. **Session keys.** Fills were signed and paid by a Gum session key, not the wallet.
5. **Fills.** Every fill executed on the rollup and never appeared on Solana.
6. **Return to Solana.** At the buzzer both positions committed and undelegated back to Solana. The delegation program's `ProcessUndelegation` landed on base, then `SettleMatch` paid the pot and wrote a public tape.

**How deep, by capability:**

- **Load-bearing (3):** Ephemeral Rollups (delegate, execute, commit and undelegate), the permission program behind a read gate, and session keys. **Added 00:40 UTC:** the rollup's own task scheduler (keeper and buzzer cranks) and intent-bundle commits — §0.
- **Built but unreachable (1):** VRF — program code plus a script, never fulfilled, no UI.
- **Untouched:** oracle, Magic Actions, ephemeral accounts, Magic Router, Ephemeral SPL tokens. (Cranks, and a live TEE attestation check, left this list at 00:40 UTC — §0.)

**What a judge on this track would catch today:**

1. **Failed transactions from a client race.** Both browsers run the same seal, settle and commit steps. On the duel played this pass, the creator's **7 concurrent seal transactions all failed on base**, as did one settle and one rollup commit. The code sends the seal from both clients whenever both are online, so this is not a one-off. The form's **"Explorer link (integration proof)"** field points a judge at exactly these transactions (§6.1). **Status: fixed (§0).**
2. **`/proof` shows the failures as progress.** Its "life of one duel" lists those failed duplicates as ordinary lifecycle steps (§6.2). **Status: fixed (§0).**
3. **Browsers do a crank's job.** Clients run the keeper and the price feed: **44 `Liquidate` rollup transactions and 16 `PushPrice` base transactions in one 60-second round.** The rollup's own task scheduler holds **0 tasks** (§6.3). **Status: the keeper and the buzzer are rollup cranks now; marks are still browser-pushed (§0).**
4. **Prices are not MagicBlock's.** Marks are HTTP prices pushed by the players' browsers (the program's own words: "a stand-in for an oracle", `lib.rs:311`). MagicBlock's real-time oracle is live and read $101.73 for SOL/USD on mainnet this pass. **Status: open — the oracle is hosted-only.**
5. **"Private" is a local process.** Privacy is enforced by a gate process this project runs, not MagicBlock's TEE, and `/proof`'s "gate attested" row is a config flag. The TEE attestation verified live this pass through the SDK the project already installs. **Status: the attestation row is honest and `check-tee` verifies devnet-tee live; the local gate is still a local process (§0).**
6. **Nothing on MagicBlock's hosted infrastructure.** The devnet deploy wallet holds 0 SOL, so there is no Explorer link and no public program address — both fields the submission form asks for (verified on the live form). **Status: open — blocked on devnet SOL.**
7. **ACLs never close.** Permission accounts stay delegated after settlement; nothing undelegates or closes them (§6.4). **Status: each player's client now releases its own ACL at the buzzer (§0).**
8. **Deprecated commit path.** Commits use `commit_and_undelegate_accounts` from the SDK's `ephem/deprecated` module; the current intent builders are in the pinned SDK and unused (§6.5). **Status: fixed — `MagicIntentBundleBuilder` (§0).**

---

## 2. The duel, step by step (UI + chain)

**Setup:**

- **Creator:** `2Zef…dkXm` (origin `127.0.0.1:4180`).
- **Joiner:** `8Z3t…QyiC` (origin `localhost:4180`).
- Both were funded with 3 SOL from the local faucet.
- Stake 0.05 ◎, round 1 MIN, market WOFI.
- Console errors: **0** in both tabs at every step.

| Step | Layer | Instruction (tx log) | Paid by | Result | Code path |
|---|---|---|---|---|---|
| FIND MATCH → OPEN A MATCH | base, slot 5980 | `CreateMatch` | creator | ok; balance 3.00 → 2.94 | `useDuel` → `client.createMatch` |
| JOIN | base, 6065 | `JoinMatch` | joiner | ok | `useDuel.ts:1472` |
| Seal: ACL | base, 6066–6067 | `CreatePositionPermission` ×2 → `CreatePermissionCpi` (`lib.rs:865`) | joiner | ok | `beginRound` → `sealAndDelegateMatch`, `useDuel.ts:903` |
| — the same, concurrently | base, 6067 | `CreatePositionPermission` | **creator** | **ERR `Custom 0`** (already created) | the creator's waiting poller, `useDuel.ts:1273` |
| Seal: delegate the ACL | base, 6068–6069 | `DelegatePositionPermission` ×2 → `DelegatePermissionCpi` (`lib.rs:898`) | joiner ok · **creator ×2 ERR `ExternalAccountDataModified`** | — | `client.ts:380` |
| Seal: delegate the positions | base, 6070–6071 | `DelegatePositionToEr` ×2, `#[delegate]`, 1,000 ms commit frequency | joiner ok · **creator ×2 ERR** | — | `client.ts:354–356`, `lib.rs:757` |
| Seal: delegate the round status | base, 6072 | `DelegateStatusToEr` | joiner ok · **creator ERR** | — | `client.ts:725`, `lib.rs:782` |
| Gate sign-in | network | `GET :6699/auth/challenge?pubkey=2Zef…` 200, `POST :6699/auth/login` 200, CORS preflights 200 | — | Bearer token | `erAuth.ts:80–104`, `client.ts:233` |
| Live round | UI | "SEALED · ACL ON CHAIN", "SESSION KEY · NO SIGNATURE PER FILL"; opponent row FOGGED / SEALED | — | Tab A logged 129 requests to `:6699`; all 40 the tool displayed were 200. Tab B's 20 were all 200 | `LiveRoundScreen` |
| LONG (both players) | **rollup only**, slots 58808 / 58809 | `ApplyFill` | **session key `HMKa…1fj2`** — neither wallet | ok; "LONG FILLED"; **absent from base** | `useDuel.ts:1309` → `client.applyFillAs` (`client.ts:606`), `session_auth_or` (`lib.rs:354`) |
| Keeper, every 5 s | rollup only | `Liquidate`, for **both** owners, from **both** browsers — 22 per position | both wallets | ok (no-ops; solvent) | `useDuel.ts:675`, `MARK_CRANK_MS = 5000` (`:83`) |
| Mark, every 5 s | base, 6074–6176 | `PushPrice` ×16, pairs per tick from both browsers | both wallets | ok | `useDuel.ts:658`, `lib.rs:314` |
| Buzzer: commit | rollup, 59376 / 59379 | `CommitAndUndelegatePosition` → `commit_and_undelegate_accounts` | joiner ok · **creator ERR `3007`** (account already handed back) | — | `useDuel.ts:746`, `lib.rs:930` |
| Commit lands on Solana | rollup: 3 magic-program transactions per position · base, 6186 | `ProcessUndelegation` (delegation program), one per position | validator | ok; positions owned by fogduel again | `#[ephemeral]` undelegation callback (`lib.rs:60`) |
| Settle | base, 6188–6189 | `RequestSettle`, then `SettleMatch` | creator ok · **joiner `RequestSettle` ERR `6001` `MatchNotLive`** | pot paid; **tape 1,157 bytes** | `useDuel.ts:751–752` |
| Reveal | UI | Creator: "YOU FINISHED AT #1 · YOU TOOK THE POT". Joiner: "#2 · OOF… SO CLOSE · A DRAW GOES TO THE MATCH CREATOR". Both −0.29% | — | mirrors to the basis point | `RevealScreen` |
| `/tape/8HPW…` | UI | Both players' fills: BUY 0.87 @ 0.014343383◎ at 00:32, BUZZER 0.87 @ 0.014176356◎ at 01:01; paid 0.098◎, rake 0.002◎, settled 22:24:04 UTC | — | 0 console errors | `TapeScreen` |
| `/proof` | UI | "read gate: YES — sealed position refused, control served"; "gate attested: NO — not a TEE"; base 2.2 slots/s against rollup 20.0 slots/s (9.3×); a 15-row lifecycle for this duel | — | 0 console errors | `ProofScreen` |

**The rollup's own storage** (`.localnet/er/*.sqlite`, read-only):

- `committor_service`: **18 commit bundles** on this fresh ledger (it started at 21:34 UTC).
- `task_scheduler`: `tasks` 0, `failed_tasks` 0, `failed_scheduling` 0.

**Proof scripts on the same chain, 22:16–22:17 UTC:**

- **`check:er` — pass, 7 assertions.** The fill `3d49RUfc…` sits in the rollup ledger at slot 50434 and is absent from base. The base-layer owner is the delegation program, and the rollup position holds `base_qty` 875406.
- **`check:gate` — pass.**
  - Sealed positions are **REFUSED** through `:6699` while the raw `:7799` serves their 543 bytes.
  - Bare positions are served on both.
  - Each player's token opens its own position only.
  - The ACL lists 2 authorised readers.
- **`check:session` — pass, 15 assertions.** Token `FkZN1JpH…` fills the owner's book on the rollup (fills 0 → 1) and is refused on another owner's book.
- **`check:vrf` — blocked.** Request `3sv4kFez…` lands on queue `GKE6d7iv…`; **no fulfilment**, because no oracle serves the local queue.

---

## 3. GENUINELY USED

A real call, wired into a real flow, that a judge can trigger and see work.

| # | Capability | Program | Client and UI | Verified this pass | Depth |
|---|---|---|---|---|---|
| 1 | Ephemeral program and undelegation callback | `#[ephemeral]` `lib.rs:60` | Invoked by the delegation program | `ProcessUndelegation` at base slot 6186 for both positions (chain) | Core |
| 2 | Delegate each position | `#[delegate]` `lib.rs:1292`, `1308`; `delegate_position_to_er` `lib.rs:757` | `client.ts:354–356`, from `beginRound` `useDuel.ts:903` | Base owner = delegation program during the round (chain); `check:er` | Core |
| 3 | Delegate the public round status | `delegate_status_to_er` `lib.rs:782`; `#[delegate]` `lib.rs:1373` | `client.ts:725` | Status account owned by the delegation program while live (chain) | Core |
| 4 | Fills execute on the rollup | `apply_fill` `lib.rs:358` | `client.ts:569`, `606`; `useDuel.ts:1304`, `1309` | Rollup-only `ApplyFill` for both players (UI + chain) | Core |
| 5 | Commit and undelegate at the buzzer | `commit_and_undelegate_accounts` `lib.rs:931`, `948`; `#[commit]` `lib.rs:1353`, `1363` | `client.ts:645`, `waitForUndelegation` `client.ts:809`; `useDuel.ts:746`, `822`, `831` | Rollup commit → magic-program transactions → base `ProcessUndelegation`; 18 bundles in the committor (chain) | Core |
| 6 | Liquidation on the rollup | `liquidate` `lib.rs:467` | `client.ts:695`; `useDuel.ts:675` | 44 rollup `Liquidate` transactions in one round (chain) — see §6.3 | Core, but browser-driven |
| 7 | Permission ACL per position | `CreatePermissionCpi` `lib.rs:865`, `DelegatePermissionCpi` `lib.rs:898` | `client.ts:365`, `380` | ACL accounts created and delegated (chain); `check:gate` refuses sealed reads | Core |
| 8 | Read-gate sign-in, token scoped to the signer | — | `erAuth.ts:80–104` (a hand-rolled equivalent of the SDK's `getAuthToken`), `client.ts:233` | `/auth/challenge` and `/auth/login` 200 in Chrome (UI) | Core |
| 9 | Session keys (Gum `KeyspM2s…`) | `#[session_auth_or]` `lib.rs:354` | `session.ts:76`, `141` (TTL 3,600 s); `useDuel.ts:922` | The fill was paid and signed by session key `HMKa…1fj2` (chain); `check:session` | Core UX |
| 10 | Privacy evidence in the product | — | `useGateProbe.ts`, shown on `/proof` | "read gate: YES — sealed position refused, control served" (UI) | Evidence surface |
| 11 | SDK program ids and PDA helpers | — | `client.ts:12–20`: `EPHEMERAL_VAULT_ID`, `MAGIC_PROGRAM_ID`, `PERMISSION_PROGRAM_ID`, `permissionPdaFromAccount`, `delegationRecordPdaFromDelegatedAccount`, `delegationMetadataPdaFromDelegatedAccount`, `delegateBufferPdaFromDelegatedAccountAndOwnerProgram` | Used by rows 2, 5 and 7 | Plumbing |

---

## 4. IMPORTED OR BUILT, BUT NOT USED BY THE PRODUCT

- **VRF.**
  - **In the program:** `request_market_draw` (`lib.rs:679`) builds `create_request_randomness_ix` (`lib.rs:700`), and `settle_market_draw` (`lib.rs:728`) is guarded by `#[vrf_callback]`.
  - **Callers:** only `scripts/check-vrf.mts:67`. There is no UI.
  - **Status:** the request lands on chain and is never fulfilled.
  - **Stale import:** `VRF_PROGRAM_IDENTITY` (`lib.rs:31`) is imported, unused (compiler warning), and deprecated in favour of `scoped_vrf_identity(callback_program_id)` (pinned `ephemeral-vrf-sdk` `consts.rs:29–30`).
  - **Builders available in 0.17.0:** `create_request_randomness_ix`, `create_request_legacy_randomness_ix`, `create_request_regular_randomness_ix`, `create_request_high_priority_scoped_randomness_ix`.
- **Ephemeral permission.** `init_position_privacy` → `CreateEphemeralPermissionCpi` (`lib.rs:913`) is the *alternative* to the L1 permission the app seals with, not a step after it: both live at `permissionPdaFromAccount(position)`.
  - **Was:** the app called it right after sealing whenever `ACTIVE_CLUSTER.tee` was true. On devnet-tee the rollup refused it every time ("invalid account data for instruction"; parallel session, match `6FLZ2wAd…`, 03:01 UTC), so every devnet seal would have thrown before the round began.
  - **Now:** the call and `client.initPositionPrivacy` are removed. On devnet-tee the delegated L1 ACL alone gates reads: anonymous refused, each owner's token opens only its own position.
  - `tests/er-privacy.ts` still exercises the ephemeral path, on a position with no L1 permission.
- **The devnet / TEE cluster.** It is configured (`config.ts`), and `devnet-tee`'s live identity `MTEWGuqx…` matches the config exactly. The program is deployed on devnet under the same id (ProgramData `7mcpvZnc…`, slot 497,500,594, 935,024 bytes; verified read-only). The TEE test runs are the parallel session's.
- **JS SDK 0.17.0 exports never referenced** (pinned):
  - Router, commits and TEE: `ConnectionMagicRouter`, `GetCommitmentSignature`, `getAuthToken`, `verifyTeeRpcIntegrity`, `verifyTeeIntegrity`.
  - Permission status: `getPermissionStatus`, `waitUntilPermissionActive`.
  - Permission lifecycle: `createUpdatePermissionInstruction`, `createClosePermissionInstruction`, `createCommitPermissionInstruction`, `createCommitAndUndelegatePermissionInstruction`, `createUndelegatePermissionInstruction`.
  - Escrow: `createTopUpEscrowInstruction` (only in the skipped test `chain/tests/er-privacy.ts:169`), `createCloseEscrowInstruction`.
  - The Ephemeral SPL surface: `EPHEMERAL_SPL_TOKEN_PROGRAM_ID`, `depositSplTokensIx`, `delegateEphemeralAtaIx`, `delegateSpl`, `delegateSplWithPrivateTransfer`, `transferSpl`, `withdrawSpl`, `withdrawSplIx`, `createEataPermissionIx`, `delegateEataPermissionIx`, `undelegateEataPermissionIx`, `resetEataPermissionIx`.
- **Rust SDK 0.17.0 capabilities present and unused** (pinned):
  - **Magic Actions and commit intents:** `CommitIntentBuilder` / `CommitAndUndelegateIntentBuilder` with `add_post_commit_actions` and `add_post_undelegate_actions`; `ActionBuilder` with `CallHandler` and `ActionCallback`; the `#[action]` macro.
  - **Cranks:** `crank::ScheduleCrankCpi` and `CancelCrankCpi`, which drive the magic program's `ScheduleTask(ScheduleTaskArgs)` and `CancelTask`.
  - **Ephemeral accounts:** `EphemeralAccount::{create, resize, close}`, `rent(data_len)`, and the `#[ephemeral_accounts]` macro.
  - **Permission lifecycle:** `UpdatePermissionCpi`, `ClosePermissionCpi`, `CommitPermissionCpi`, `CommitAndUndelegatePermissionCpi`, `UndelegatePermissionCpi`, `UpdateEphemeralPermissionCpi`, `CloseEphemeralPermissionCpi`.
  - **Member flags:** `AUTHORITY_FLAG`, `TX_LOGS_FLAG`, `TX_BALANCES_FLAG`, `TX_MESSAGE_FLAG`, `ACCOUNT_SIGNATURES_FLAG`.

---

## 5. FAKED

**No MagicBlock response is mocked or hardcoded anywhere.** Three things stand in for a MagicBlock piece, and each is disclosed in the code or UI — but a judge would ask about all of them:

1. **"gate attested" is an assertion, not a check.** `/proof` derives it from config: `ACTIVE_CLUSTER.tee ? 'YES — TEE ingress' : 'NO — not a TEE'` (`ProofScreen.tsx:179`).
   - Locally it truthfully says NO.
   - A devnet build would say YES having verified nothing — yet `verifyTeeRpcIntegrity('https://devnet-tee.magicblock.app')` resolved this pass (it returns `Promise<void>` and throws on failure).
2. **The mark is a stand-in for an oracle.** `push_price` (`lib.rs:314`) is permissionless and rate-limited, and both browsers push an HTTP price every 5 s. `settle_match` scores PnL from those marks.
3. **The "Private ER" is a local process.** The read gate is a `query-filtering-service` run by this project (`config.ts`, `scripts/localnet.sh`), not MagicBlock's Private Ephemeral Rollup on TDX. The app says so on `/proof`.

---

## 6. Integration defects found this pass (chain-verified)

1. **Seal, settle and commit race between the two clients.** **Status (00:40 UTC): fixed — §0.**
   - Both clients call `beginRound`, which seals at `useDuel.ts:903`. The creator's poller calls it as soon as it sees a joiner (`:1273`); the joiner calls it straight after JOIN (`:1472`; FIND MATCH's auto-join is `:1235`). The fee payers on chain confirm both ran it.
   - On duel `8HPW…pwMyv`, the joiner's seal succeeded and **all 7 of the creator's concurrent seal transactions failed on base**:
     - `CreatePositionPermission` → `Custom 0`;
     - `DelegatePositionPermission` ×2, `DelegatePositionToEr` ×2 and `DelegateStatusToEr` → `ExternalAccountDataModified`.
   - Settlement raced the same way: the joiner's `RequestSettle` failed with `6001 MatchNotLive`, and the creator's rollup `CommitAndUndelegatePosition` failed with `3007`.
   - **The duel measured here left 8 failed base transactions and 1 failed rollup transaction.** Any duel with both players online races the same way; which client loses varies.
2. **`/proof` presents those failures as lifecycle.** "The life of one duel" listed 15 rows for this duel, including the failed duplicates as ordinary CREATE / DELEGATE steps. "What one duel costs" sums their fees. Only the "recent program transactions" list labels a failure. **Status (00:40 UTC): fixed — §0.**
3. **Browsers run the keeper and the feed.** **Status (00:40 UTC): keeper and buzzer are rollup cranks; the feed is still browser-pushed — §0.**
   - Each browser calls `liquidate` for both owners, and `push_price`, every 5 s.
   - One 60-second round produced 44 rollup `Liquidate` transactions and 16 base `PushPrice` transactions.
   - Close the tabs and nobody liquidates, nobody posts marks, and nobody settles: `/proof` showed "4 more duels are over but unsettled".
   - The rollup's task scheduler, which exists for exactly this, holds 0 tasks.
4. **ACLs are never returned or closed.** After settlement both permission accounts are still owned by the delegation program. No `UndelegatePermission`, `ClosePermission`, `UpdatePermission` or ephemeral variant is called anywhere in the program, client or scripts. **Status (00:40 UTC): returned — each player's client releases its own; not closed — §0.**
5. **Deprecated commit helper.** `commit_and_undelegate_accounts` lives in `ephem/deprecated/v0.rs:38` of the pinned SDK. The current intent builders sit beside it in `ephem/` and are unused. **Status (00:40 UTC): fixed — §0.**
6. **No public deployment.** The Blitz v8 form's Proof of Work step asks for **GitHub Project Repo, Pitch & Demo, Explorer link (integration proof), and Program addresses** (read on the live form this pass). Everything above runs only on `127.0.0.1`. **Status: open, blocked on devnet SOL.**

---

## 7. MISSING — offered by MagicBlock, touched nowhere

| Capability | Status here | Verified available |
|---|---|---|
| **Real-time Pricing Oracle** | Not used; browsers push marks (§5.2) | **live:** SOL/USD at `ENYwebBThHzmzwPLAQvCucUTsjyfBSZdD9ViXksS4jPu`, owner `PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd`: devnet-as $101.6973, devnet-tee $101.7341, mainnet `as` $101.7347. Publish time 0–1 s old on every read; Jupiter read $101.7328 at the same moment. Layout decoded from the account: price `i64` at byte 73, decimals `i32` at 89, publish time `i64` at 93. Oracle-owned accounts: 232 on devnet-as, 147 on mainnet `as`. **(docs):** the published feed list is crypto; no equity feed was confirmed |
| **Cranks** (scheduled tasks inside the rollup) | **Used since 00:40 UTC:** a keeper and a buzzer task per round (§0); marks are still browser-pushed | **pinned:** `ScheduleCrankCpi`, `CancelCrankCpi`, magic `ScheduleTask` / `CancelTask`. **chain:** the running rollup has the `tasks` table, with 0 rows |
| **Magic Actions** (actions after a commit or undelegation) | Not used; settlement is separate base transactions that both clients race | **pinned:** `CommitAndUndelegateIntentBuilder::add_post_undelegate_actions`, `ActionBuilder`, `CallHandler`, `#[action]` |
| **Ephemeral accounts** | Not used | **pinned:** `EphemeralAccount`, `#[ephemeral_accounts]`, `rent()` |
| **Permission lifecycle and visibility flags** | Create, delegate and **owner-signed commit-and-undelegate** are used (§0); update, close and the visibility flags are not | **pinned:** update, close, commit and undelegate CPIs plus the 5 member flags; the JS instruction builders are exported |
| **TEE attestation, and running on the Private ER** | Attestation verified live by `scripts/check-tee.mts` (§0); still no deployment on the Private ER | **live:** `verifyTeeRpcIntegrity(devnet-tee)` resolved; the `devnet-tee` identity matches the config |
| **Magic Router** | Not used; fixed endpoint URLs | **live:** `getRoutes` returned 4 nodes (DEU, SGP ×2, USA), each with `baseFee 0` and `blockTimeMs 50`; `getClosestValidator` returned devnet-as |
| **Ephemeral SPL Token and Private Payments** | Not used; stakes are SOL escrowed on base | **pinned:** the JS exports listed in §4. **live:** the payments MCP lists `spl.deposit`, `spl.withdraw`, `spl.transfer`, `spl.getBalance`, `spl.getPrivateBalance` |
| `GetCommitmentSignature` | Not used; `/proof` rebuilds lifecycles from base history | pinned (JS) |
| Periodic commits (commit without undelegating) | Not used | pinned: `CommitIntentBuilder` |
| VRF in a user flow | Script only (§4) | **live:** the VRF program is executable on Solana devnet, devnet-as and the local base |
| Regional validators | Configured, never chosen | **live:** identities for devnet-tee `MTEWGuqx…`, devnet-as `MAS1Dt9q…`, devnet-eu `MEUGGrYP…`, devnet-us `MUS3hc9T…`, all on version 4.0.0 |
| MagicBlock MCP servers | Not relevant to the product (developer and agent tooling) | **live:** docs MCP (`search_magic_block_documentation`, `query_docs_filesystem_magic_block_documentation`, `submit_feedback`); payments MCP (above) |
| SOAR, Swap API, BOLT | Not used | **(docs)** only; BOLT is marked deprecated in its repository **(docs)** |

---

## 8. Where deeper integration fits — and where it would be forced

**Organic fits, surface by surface:**

- **Round lifecycle** (seal → live → bell → settle). **This is the biggest gap.** Today two browsers race each other through it and leave failed transactions behind.
  - A crank scheduled at seal time can own the bell.
  - A commit-and-undelegate intent with a post-undelegate action can own settlement.
  - Together they remove the race, the client keeper and the "abandoned duel" class in one move.
- **Marks.** Every PnL, liquidation and settlement reads a mark. The oracle is live on the same rollups the program would run on. This closes the one trust gap the program's own comments admit.
- **Privacy.** Move the ACL to `CreateEphemeralPermissionCpi` on the TEE rollup, verify attestation before sealing, and flip visibility with `UpdateEphemeralPermissionCpi` at the bell. The reveal then becomes a permission change that anyone can watch, instead of an undelegation.
- **Stakes.** Ephemeral SPL eATAs let the pot live on the rollup in USDC instead of SOL escrowed on base.
- **Rooms** (the product direction: many players, any token). Room and Position PDAs are exactly the state delegation hosts. Member flags let a room choose what each seat sees.
- **`/proof`.** Real attestation, `GetCommitmentSignature` receipts, and a lifecycle that separates failures from steps.
- **Lobby.** Magic Router region placement; ephemeral accounts for ready checks and emotes.

**Forced — do not build these for the track:**

- **BOLT ECS.** Deprecated **(docs)**, and the account model already maps onto delegation.
- **Swap API for in-round fills.** A public swap print leaks side and size mid-round; the program deliberately has no venue CPI.
- **Ephemeral accounts for tapes.** Tapes must be permanent.
- **VRF for prices.** Randomness is not a mark.
- **SOAR as a headline.** A leaderboard is swappable.
- **The docs MCP inside the product.** It is developer tooling; agent players (idea 32) are the one organic MCP use.
- **xStocks rooms on the oracle.** Blocked until MagicBlock confirms an equity feed; Jupiter prices them today.

---

## 9. Fifty features, ranked by how load-bearing MagicBlock is

**Tiers:**

- **Tier 1 (1–15):** could not be built without MagicBlock — the capability is the mechanic.
- **Tier 2 (16–35):** MagicBlock is structural — a native building block the feature depends on.
- **Tier 3 (36–50):** a real MagicBlock call, but swappable or surface-level.

**Depth:** Core = the feature is the capability · Structural = built on it · Surface = a call that could be replaced.

### Tier 1 — impossible without MagicBlock

| # | Feature | What it does | MagicBlock capability (exact API) | Depth | Why a judge on this track notices |
|---|---|---|---|---|---|
| 1 | **The rollup runs the round** | At seal time the program schedules a task that posts marks, checks margin, and at the bell commits, undelegates and settles. No browser has to be open, and nothing races | Cranks (`ScheduleCrankCpi` → magic `ScheduleTask`) plus `CommitAndUndelegateIntentBuilder::add_post_undelegate_actions` calling `settle_match` | Core | Removes the race behind the 9 failed transactions measured on this duel, the 60 browser keeper/feed transactions per round, and every abandoned round — all visible on the Explorer link the form asks for |
| 2 | **Oracle-marked PnL** | Fills, liquidations and settlement read MagicBlock's in-rollup price account instead of `push_price` | Real-time Pricing Oracle (`PriCems5…` feed PDA: `price_feed` / `pyth-lazer` / feed id) | Core | Replaces the program's admitted "stand-in for an oracle"; SOL/USD updated about once a second on mainnet `as` this pass |
| 3 | **Attested fog** | Sealing refuses to proceed unless the TEE's quote verifies; the room header and `/proof` show the verdict and its age | Private ER on TDX; `verifyTeeRpcIntegrity`; `CreateEphemeralPermissionCpi` | Core | Turns "enforced by a process we run" into something a judge can verify without trusting the team |
| 4 | **The reveal is a permission flip** | At the bell one update makes every position public on the rollup, and spectators watch the fog lift live; the commit follows | `UpdateEphemeralPermissionCpi` (public) or `UpdatePermissionCpi` | Core | Makes the ACL lifecycle the game's climax instead of a lock that is only ever closed |
| 5 | **Fog Rooms** | N players join a room, each on any token, each position private until the bell | Delegated Room and Position PDAs; one ephemeral permission per position | Core | Scales "private during the fight" beyond 1v1; hidden simultaneous state needs a permissioned rollup |
| 6 | **Room visibility presets** | The creator picks what seats see: fills but not size ("poker"), nothing ("blind"), everything for a coach | Member flags `TX_LOGS_FLAG`, `TX_BALANCES_FLAG`, `TX_MESSAGE_FLAG`, `ACCOUNT_SIGNATURES_FLAG` | Core | Per-member, per-field visibility exists only in PER |
| 7 | **In-rollup margin engine** | A task checks every short against the oracle every few hundred ms and liquidates at zero equity | Cranks, Oracle, `liquidate` on the rollup | Core | Margin needs a keeper; here it is part of the chain, not 44 browser calls |
| 8 | **Private USDC pots** | Entries deposit into eATAs, the pot lives on the rollup, and the winner is paid by transfer | Ephemeral SPL Token (`depositSplTokensIx`, `delegateEphemeralAtaIx`, `transferSpl`, `withdrawSpl`) | Core | Real stablecoin stakes custodied on MagicBlock's token rail, off the public base mid-round |
| 9 | **Blitz-30** | 30-second rounds with a fill every few hundred ms, session-signed and oracle-marked | 0-fee, 50 ms rollup blocks (live `getRoutes`); Session Keys; Oracle | Core | Impossible on a 400 ms base layer that charges per transaction |
| 10 | **VRF blind draft** | Each player's market is drawn from a shortlist and sealed to its owner until the bell | VRF (`create_request_high_priority_scoped_randomness_ix`, `#[vrf_callback]`, `scoped_vrf_identity`) plus permissions | Core | Turns the project's unfulfilled VRF code into a live mode with fair, unreadable assignment |
| 11 | **Private aggregate heat map** | A task inside the TEE rollup publishes the room's net long/short per market every second; individual positions stay sealed | Cranks inside the Private ER; permissions | Core | Aggregates computed where the private data lives, with no leak |
| 12 | **Pay to follow the winner** | A champion sells live read access to their next round; followers see fills, everyone else sees fog | `UpdateEphemeralPermissionCpi` adding a member with `TX_LOGS_FLAG`; Ephemeral SPL payment | Core | Monetised selective disclosure, which only PER membership expresses |
| 13 | **Sealed-bid seats** | High-stakes seats go by sealed bid; a task closes the auction; losers are refunded after the commit | PER, Cranks, post-commit actions, eATA escrow | Core | Hidden bids with automatic settlement and no off-chain operator |
| 14 | **Volatility-aware bell** | A task reads the oracle every second and extends the round (capped) when the mark gaps; last-tick sniping stops | Cranks, Oracle | Core | Game rules that react to live prices inside the rollup |
| 15 | **Private conditional orders** | A player arms a stop or take-profit that a task executes under their session authority; the order is invisible until the reveal | Cranks, Session Keys (`session_auth_or`), PER | Core | Hidden orders executed at rollup speed; nobody can hunt a stop that nobody can see |

### Tier 2 — MagicBlock is structural

| # | Feature | What it does | MagicBlock capability (exact API) | Depth | Why a judge notices |
|---|---|---|---|---|---|
| 16 | **Seal in one rollup step, one sealer** | Replace base create/delegate permission with an ephemeral permission created on the rollup, sealed by exactly one party. A replacement, not an addition: both live at the same address, and devnet-tee refuses the ephemeral one once the base one exists | `CreateEphemeralPermissionCpi`; delegation | Structural | Four fewer base transactions per duel, and the seal race (§6.1) is gone |
| 17 | **Closed ACL lifecycle** | At settlement ACLs are committed, undelegated and closed, and rent is returned | `CommitAndUndelegatePermissionCpi`, `UndelegatePermissionCpi`, `ClosePermissionCpi` | Structural | No lingering delegated accounts; shows command of the full permission API |
| 18 | **Region-placed rooms** | A room opens on the host's closest rollup | Magic Router `getRoutes`, `getClosestValidator` (both live) | Structural | Latency-aware placement is what the Router exists for |
| 19 | **Router-routed client** | One connection sends each transaction to base or rollup by delegation status, replacing hand-picked endpoints | `ConnectionMagicRouter` | Structural | Removes a whole class of wrong-layer errors (fill on undelegated, write on delegated) |
| 20 | **Tournament brackets** | Rounds auto-start and close, stakes roll forward, and the champion is paid by a post-commit action | Cranks, eATAs, `add_post_commit_actions` | Structural | A multi-stage competition with no scheduler server |
| 21 | **Spectator side bets** | Spectators back the room leader from an eATA pool with session-signed bets, resolved by the room's settlement action | Session Keys, Ephemeral SPL, post-undelegate action | Structural | Real-time wagering on hidden-state games |
| 22 | **Private PnL, public rank buckets** | Each player reads exact PnL with a signed token; the room sees only rank buckets a task computes | Gate token (`getAuthToken`), Cranks, PER | Structural | A live leaderboard during the round without a leak |
| 23 | **Lobby on ephemeral accounts** | Ready checks, picks before sealing and emotes live only on the rollup and close when the room seals | `EphemeralAccount::create` / `close`; `#[ephemeral_accounts]` | Structural | Transient lobby churn never touches base-layer rent |
| 24 | **Instant rematch** | Accounts stay delegated between rounds and reset on the rollup; only the series result commits | Delegation kept alive; `CommitIntentBuilder` | Structural | Treats the rollup as a session, not a one-shot |
| 25 | **Mid-round checkpoints** | Commit without undelegating every N seconds; the HUD shows the last checkpoint | `CommitIntentBuilder` (periodic commit) | Structural | Durability during a round, not only at the end |
| 26 | **Host-funded rooms** | The host tops up rollup escrow so players' commits are covered | `createTopUpEscrowInstruction`, `escrowPdaFromEscrowAuthority` | Structural | Shows real understanding of rollup commit economics |
| 27 | **Gasless practice rooms** | New players join with 0 SOL: session keys, host escrow, 0-fee rollup transactions | Session Keys, escrow top-up, `baseFee 0` (live) | Structural | Onboarding only this fee model allows |
| 28 | **Session-scoped risk limits** | The session expires at the bell, and the program caps notional per session token | Session Keys (`SessionToken` validity); program-enforced caps | Structural | Scoped trading authority, not just fewer pop-ups |
| 29 | **Stealth-handle payouts** | Winners are paid and displayed by stealth handle, never by wallet | Private Payments stealth handles **(docs)** | Structural | Privacy after the fight as well as during it |
| 30 | **Swap-to-play** | Enter a USDC room with any token: swap, then deposit to an eATA | Swap API private mode **(docs)**; `depositSplTokensIx` | Structural | "Pick any coin" onboarding without exposing the entry wallet |
| 31 | **Split, delayed prizes** | Top-3 payouts are split and released with randomised delays | Private transfers with scheduling **(docs)** | Structural | Breaks wallet linkage at payout |
| 32 | **AI agent players** | Agents join rooms and fund their stakes through MagicBlock's payments MCP | Payments MCP `spl.deposit`, `spl.transfer`, `spl.getPrivateBalance` (live) | Structural | The one organic MCP use: an agent-facing product surface |
| 33 | **Membership invite links** | An invite pre-grants the invitee a permission membership on a private room | `UpdateEphemeralPermissionCpi` members | Structural | Access control is the invite, not a secret URL |
| 34 | **Crank-enforced modes** | Chicken, Hot Potato and Hold the Line enforced by a per-second task | Cranks | Structural | Turns the 11 SOON tiles into rules the rollup enforces |
| 35 | **Stock rooms on oracle marks** | TSLAx, NVDAx and SPYx rooms marked by MagicBlock feeds | Pricing Oracle equity feeds — **blocked**: none confirmed; Jupiter prices xStocks today | Structural, blocked | Serves "play with stocks" honestly, with the dependency named |

### Tier 3 — surface or swappable

| # | Feature | What it does | MagicBlock capability | Depth | Why a judge notices |
|---|---|---|---|---|---|
| 36 | Room replay from commits | Rebuild a room's timeline from commits, each rollup action linked to its Solana commit | `GetCommitmentSignature` | Surface | Navigable two-layer history |
| 37 | Fill receipts with commit links | Each fill toast shows its rollup signature and its eventual Solana commit | `GetCommitmentSignature` | Surface | Verifiable, but a UI affordance |
| 38 | Endpoint trust panel | Every connection shows validator identity, region and attestation age | `getIdentity`, `verifyTeeRpcIntegrity` | Surface | Transparency over real calls |
| 39 | Honest `/proof` lifecycle | Separate failed transactions from steps and show commit bundles from the committor | Delegation and commit history | Surface | Fixes §6.2; evidence that does not overstate |
| 40 | Commit tracking instead of polling | Replace the `waitForUndelegation` owner polling with commit-signature tracking | `GetCommitmentSignature`, `getPermissionStatus` | Surface | Reliability, invisible to players |
| 41 | Permission readiness gate | Wait for the ACL to be active before the first fill | `waitUntilPermissionActive` | Surface | Removes a race; small |
| 42 | VRF mystery boosts | Random in-round boosts such as a fee-free fill | VRF on the rollup | Surface | Game feel; randomness is swappable |
| 43 | VRF tie-breaks | Replace "a draw goes to the creator" with a VRF draw | VRF | Surface | A fairness detail, visible on a real draw like this pass's |
| 44 | SOAR season leaderboard | Settlement submits scores to SOAR | SOAR **(docs)** | Surface | Any leaderboard would do |
| 45 | SOAR achievements | "Won while short" and "survived a liquidation" | SOAR **(docs)** | Surface | Swappable |
| 46 | Room cost preview | Show delegation and commit fees before creating a room | Commit fee model **(docs)** | Surface | Honest economics |
| 47 | Per-room latency meter | Rollup against base round trip for the room's region | Regional endpoints, `getRoutes` | Surface | `/proof` already measures 9.3× block rate |
| 48 | Rollup ledger view | A per-room list of rollup transactions from the rollup RPC | `getSignaturesForAddress` on the rollup | Surface | Explorer-like and swappable |
| 49 | Compliance-gated cash rooms | Real-money rooms served only through screened TEE endpoints | PER compliance framework **(docs)** | Surface | Production-minded; the screening is MagicBlock's, not the game's |
| 50 | In-app "how it works" answers | Help answers pulled from MagicBlock's docs MCP | Docs MCP `search_magic_block_documentation` (live) | Surface | Tooling, not product; listed last on purpose |

---

## 10. Reproduce

```bash
./scripts/localnet.sh            # base :8999, rollup :7799, read gate :6699 (funds script keypairs)
npm run proxy                    # :8791
npm run serve                    # the production export on :4180
npm run check:er                 # fill on the rollup, absent from base
npm run check:gate               # sealed REFUSED, bare served, tokens scoped
npm run check:session            # a Gum session key signs a rollup fill
npm run check:vrf                # the request lands; no oracle fulfils it locally
npx tsx scripts/check-tee.mts    # live Intel TDX attestation of devnet-tee
cd chain && anchor test --skip-local-validator   # 34 passing, including the rollup cranks (tests/er-cranks.ts)
```

Then play one duel on `127.0.0.1:4180/play` against `localhost:4180/play`, and read the match's transactions on both layers.

The seal race (§6.1) is fixed: a duel's base history should carry no `err` at all (§0).

## 11. Sources

**Live endpoints called this pass:**

- **Hosted rollups:** `devnet-tee`, `devnet-as`, `devnet-eu`, `devnet-us` and `as` at `.magicblock.app` (`getIdentity`, `getVersion`, oracle `getAccountInfo`, `getProgramAccounts`).
- **TEE attestation:** `verifyTeeRpcIntegrity` against `devnet-tee`.
- **Magic Router:** `devnet-router.magicblock.app` (`getRoutes`, `getClosestValidator`).
- **MCP servers:** `docs.magicblock.gg/mcp` and `payments.magicblock.app/mcp` (`tools/list`).
- **Solana devnet:** `api.devnet.solana.com` (VRF program, deploy wallet balance).
- **Submission page:** `build.magicblock.app/?stage=blitz#submit` (eligibility, selection criteria, prizes, form fields, countdown).

**Pinned sources read:**

- `node_modules/@magicblock-labs/ephemeral-rollups-sdk` 0.17.0 (export list; `lib/access-control/verify.d.ts`).
- `~/.cargo/registry/src/*/ephemeral-rollups-sdk-0.17.0/src/{crank.rs, ephemeral_accounts.rs, anchor.rs, ephem/*.rs, access_control/**}`.
- `ephemeral-vrf-sdk-0.17.0/src/{instructions.rs, consts.rs}`.
- `magicblock-magic-program-api-0.10.1/src/{instruction.rs, args.rs}`.

**Docs** (cited by the prior version of this file; entries marked **(docs)** above rest on these):

- `docs.magicblock.gg/llms.txt`
- Oracle, cranks, Magic Actions, ephemeral accounts, fees, access control, Ephemeral SPL token, swap and SOAR pages under `docs.magicblock.gg/pages/…`
- `github.com/magicblock-labs/real-time-pricing-oracle`
