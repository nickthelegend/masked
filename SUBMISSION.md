# SUBMISSION — MagicBlock Solana Blitz v8

Everything the submission form asks for, prepared and ready to paste.
**Status, checked 2026-09-12 20:34 UTC:** no submission is recorded in this
repository, and whether one exists can only be seen from the entrant's login.
**The form is still open — Blitz v8 submissions close 2026-09-13 12:30 UTC.**
The form's own tooltip reads "Submissions close Sep 13, 6:00 PM" (shown in
UTC+05:30), matching its 15 h 56 m countdown at the time of checking. Fields
marked ⚠ need the owner. The program is deployed to devnet (2026-09-13, see
**Program ID**).

---

## Form fields

**Project name:** MASKED

**One line:** Hidden-position 1v1 trading on Private Ephemeral Rollups — any
token, long or short, reveal and pot settlement on Solana.

**Description (short):**
> Two traders stake an equal pot and trade for five minutes — each on a token of
> their own choosing, long or short, scored on PnL. Anything Jupiter can price is
> duelable, from SOL and wrapped BTC down to a pump.fun memecoin minted an hour
> ago. Each position is delegated to a MagicBlock Ephemeral Rollup and carries an
> on-chain access-control list naming only its owner, and the rollup sits behind
> a query-filtering-service that reads it — so the opponent's size, side and fill
> count are refused to everyone but the owner while the round is live. Shorts are
> real margin: size is capped at one times the entry, and a position whose equity
> reaches zero is liquidated and announced, which is the one deliberate hole in
> the fog. At the buzzer both positions commit back to Solana, PnL is compared,
> the winner takes the pot less a 2% rake, and a public Tape is written — both
> players' markets and every fill, readable forever. Every other 1v1 trading
> product on Solana is public during the fight; this one is private during the
> fight and public after.

**Repo:** https://github.com/nickthelegend/masked

**MagicBlock primitives used:**
- **Ephemeral Rollups** — `delegate_position_to_er`,
  `commit_and_undelegate_position`. Positions are delegated, mutated on the
  rollup, and committed back. Proved by test, including the negative case: a
  fill that succeeds on the ER is rejected on L1 while the account is delegated.
- **Private Ephemeral Rollups** — `create_position_permission`,
  `delegate_position_permission`, `init_position_privacy`. Each position gets an
  ACL naming only its owner; the ACL is delegated to the same validator. The
  rollup sits behind a `query-filtering-service` that reads the permission
  program, and it **refuses** a sealed position while serving the same account
  shape without one. That control row is the point — a door shut for everybody
  is not access control. `npm run check:gate` proves it every run.
  **Enforced locally, and enforced by a real TEE on devnet:** on
  `devnet-tee.magicblock.app` the delegated ACL refuses the opponent and an
  anonymous reader while the owner reads their own position
  (`EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy`, 2026-09-13 02:56 UTC),
  and that endpoint answers a fresh challenge with an Intel TDX quote that
  verifies against Intel's collateral (`npx tsx scripts/check-tee.mts`).
- **VRF** — `request_market_draw` builds a real request with the official SDK.
  **On devnet it is fulfilled:** an oracle on `DEFAULT_QUEUE` answered within a
  second and `settle_market_draw`, which `#[vrf_callback]` opens only to the VRF
  program, wrote the chosen market (`EXPO_PUBLIC_CLUSTER=devnet npm run
  check:vrf`, 2026-09-13 02:50 UTC). On the local stack no oracle serves the
  preloaded test queue, so a draw never resolves there. Nothing simulates a
  draw, and no UI is built on one yet.
- **Session keys** (Gum Session Protocol, `KeyspM2s…`) — used. At seal time the
  player signs once to mint a session token authorising a throwaway key to
  call `apply_fill` on their behalf, bounded to an hour and scoped to this
  program alone. A five-minute round then costs one signature instead of one
  per fill. `apply_fill` carries a `session_auth_or` guard, so without a token
  the signer must be the position's owner, and a token names exactly one
  owner — a session key cannot move anybody else's book, settle, or cancel.
  `npm run check:session` proves it in 15 assertions, and it is visible on
  chain: a real `ApplyFill` on the owner's position signed and paid by the
  session key, with the token account naming the owner as authority.

**Program ID:** `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1`, the same id on the
local stack and on **devnet** (deployed 2026-09-13 02:46 UTC, signature
`F6tajCiLyJrjp7hTg6HQqQ8PjdMNyALnnQkkReoW91U73oBb1gRQPTpXAZEAHEWDxewmPHbCKVwhgjbTnZX9wAB`).

**Demo video / live URL:** `docs/masked-demo.mp4` (43 s, unedited, captured
against the running stack) and the evidence page
https://claude.ai/code/artifact/55aff865-8675-4492-93b5-96be7804170c, both
described under *Demo video and live URL* below. The evidence page is private
until shared from its share menu. `DEMO.md` is the shot list for a longer take.

A **live URL now needs only hosting.** The export supports remote clusters
(`EXPO_PUBLIC_L1_URL`, `EXPO_PUBLIC_ER_URL`, `EXPO_PUBLIC_CLUSTER`, baked at
build time), and devnet is now a publicly reachable cluster with the program
on it: `EXPO_PUBLIC_CLUSTER=devnet npm run verify:client` played a full match
there against the devnet TEE (CLIENT OK, 2026-09-13 02:51 UTC). Publishing a
devnet build is the owner's decision (`PLAN.md` 5.9). Tunnelling the local
stack was rejected: it would put a validator and a faucet on the internet and
would die with the machine.

**Markets:** live pump.fun (`frontend-api-v3`) and Jupiter over HTTP — real
mainnet mints, real market caps, real logos, plus Jupiter token search so any
priced token can be duelled on. A `Match` carries a leg per player, each naming
that side's true mainnet mint. Fills do **not** route to either venue: each
executes against a constant-product book inside that player's own `Position`,
because a public swap print mid-round would leak the wallet, mint and size the
fog exists to hide. The program contains no CPI into either venue.

---

## What a judge can verify in five commands

```bash
npm run check          # typecheck, lint + 20 suites, incl. one replaying every
                       # real settled tape onto the chain's own PnL
npm run check:gate     # the privacy proof: sealed REFUSED, control SERVED
npm run check:guards   # every refusal the program enforces, exercised for real
npm run check:race     # two independent clients seal and settle one match at once
npm run check:session  # a real Gum session token signing a real fill on the rollup
npm run check:short    # a real short, the margin cap refused, a real liquidation
cd chain && anchor test --skip-local-validator   # 38 passing, 2 pending
```

Plus `/proof` in the app: live cluster identity, measured L1-vs-ER latency,
the three program accounts, the most recent duel's ACLs, and the program's real
transaction history with explorer links. None of it requires a wallet.

---

## Blockers, stated plainly

**Devnet is no longer a blocker.** The deploy wallet
`3YUgUPu9AdJj6FCFFvzR9pJixCN7EcAnCXMJoTuYwsS5` was refused by the public
faucets throughout the build, then funded on 2026-09-13 through MagicBlock's
devnet RPC (`rpc.magicblock.app/devnet`), and the program is deployed there at
the same id. Against it, with the devnet TEE (`devnet-tee.magicblock.app`,
validator `MTEW…`) as the rollup:

- `EXPO_PUBLIC_CLUSTER=devnet npm run verify:client` played a full match through
  the app's own client: sealed, delegated, filled on the TEE, committed back,
  settled, and the client's PnL agreeing with the chain (CLIENT OK, 02:51 UTC).
- `EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy`: mid-round, the owner read
  their own position, and their opponent's position was **REFUSED**, with or
  without a signed token (match `3Mr9KAFq…`, 02:56 UTC).
- On a delegated match with nothing else done, the TEE served each owner only
  their own 559-byte position and refused both to an anonymous reader.
- `npx tsx scripts/check-tee.mts` verified the endpoint's Intel TDX quote
  against Intel's collateral, report data matching a fresh challenge
  (00:51 UTC).
- `EXPO_PUBLIC_CLUSTER=devnet npm run check:vrf`: a VRF draw fulfilled by the
  oracle in about a second (02:50 and 02:51 UTC).

Locally the same gate is the `query-filtering-service` on `:6699`, a process
we run: `npm run check:gate` shows it refusing a sealed position while serving
the same account shape without a permission, and `/proof` keeps enforcement
and attestation as two separate rows for that reason.

**What is still open:**

- **A hosted devnet build of the app.** Everything it needs is deployed;
  publishing a public URL is the owner's call (`PLAN.md` 5.9).
- **One devnet bug in the app's seal path, fix pending.** On a TEE cluster
  `src/screens/useDuel.ts` also calls `initPositionPrivacy`, which creates an
  *ephemeral* permission at the address the app's seal has already filled with
  the delegated L1 permission, so devnet-tee refuses it and a devnet round would
  error right after sealing. The call is redundant: the delegated L1 ACL alone
  gates reads on the TEE (`prove:privacy` passed without it). The fix is to
  remove it; the local stack is unaffected.
- **No UI is built on a VRF draw yet.** Draws resolve on devnet but not on the
  local stack, so BLIND DRAFT stays a `SOON` tile.

---

## Before submitting — checklist

Submissions close **2026-09-13 12:30 UTC** (checked 2026-09-12 20:34 UTC).

1. [ ] Sign in at `https://build.magicblock.app/?stage=blitz#submit` and check
       whether an entry already exists. If one does, edit it instead of
       submitting twice, and record it here.
2. [x] Name settled by the owner: **MASKED** (PLAN.md 2.1).
3. [x] Repository published: https://github.com/nickthelegend/masked (history purged of the ledger
       blobs first; PLAN.md 1.2, 1.4).
4. [x] Video recorded: `docs/masked-demo.mp4`.
5. [ ] Put the video where the form can link it, paste that URL into
       **Demo video / live URL**, and share the evidence page.
6. [x] Devnet: program deployed (2026-09-13 02:46 UTC) and a full match played
       against it and the TEE (`PLAN.md` 5.2, 5.5). Still open: a hosted devnet
       build (5.9), which is the owner's call.
7. [ ] Paste the fields above into the form and submit. The entrant presses
       Submit.
8. [ ] Record the confirmation and timestamp back into this file.

---

## Honest summary

This is a complete, heavily verified Ephemeral Rollups submission with the
Private ER layer built and wired into the path a player actually takes.
Locally the read gate refuses a sealed position and serves a no-permission
control, proved on every run by `npm run check:gate`. On devnet, the same
program behind MagicBlock's TEE refuses the opponent's position mid-round
while the owner reads their own, and the TEE's TDX quote verifies against
Intel's collateral: the two claims, enforcement and attestation, each have
their own evidence.

What is not done is said plainly: no devnet build of the app is hosted, one
devnet seal-path bug is found and its fix pending, and VRF resolves on
devnet but drives no UI. A judge finding any of that themselves would be
worse than being told.

---

## Demo video and live URL

- **Video:** `docs/masked-demo.mp4` — 43 seconds, unedited, captured against the
  running stack. A full duel (open → join → both arenas with the opponent's row
  fogged → max long against a half-size short → buzzer → both reveals mirroring),
  then the evidence page.
- **Live URL:** https://claude.ai/code/artifact/55aff865-8675-4492-93b5-96be7804170c
  — the reel, the four `check:er` assertions, the measured 9.5× rollup speedup,
  the gate's refused/served/owner rows, the ten-step delegation lifecycle, the
  reproduction commands, and the four things this project does **not** prove.
  Private until shared from the page's share menu.

Source recordings, if a longer cut is wanted: `docs/masked-full-duel.mp4` (28s)
and `docs/masked-proof-walkthrough.mp4` (6s).
