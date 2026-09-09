# SUBMISSION — MagicBlock Solana Blitz v8

Everything the submission form asks for, prepared and ready to paste.
**Status: not yet submitted.** Fields marked ⚠ depend on a devnet deploy,
which is blocked on faucet funding (see Blockers).

---

## Form fields

**Project name:** Fogduel

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

**Repo:** *(this repository)*

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
  **Enforced, not attested:** the gate is a process we run, and only a TEE
  validator turns that into something a judge can check without trusting us.
- **VRF** — `request_market_draw` builds a real request with the official SDK
  and the VRF program accepts it on chain (`npm run check:vrf`).
  **No oracle answers**, because the queues this validator preloads were dumped
  from devnet and name oracle identities we do not hold keys for. Nothing
  simulates a draw, and no UI is built on one that cannot resolve.
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

**Program ID:** ⚠ local `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1` —
devnet deploy blocked, see below.

**Demo video / live URL:** ⚠ video pending recording. `DEMO.md` is the shot
list — five shots, measured timings, the exact click path, and the
prerequisites that bite if skipped. One take, under three minutes.

A **live URL is not achievable** and the reason is not hosting. The export
supports remote clusters (`EXPO_PUBLIC_L1_URL`, `EXPO_PUBLIC_ER_URL`,
`EXPO_PUBLIC_CLUSTER`, baked at build time) and the production build has been
driven for real — wallet connected, funded, match escrowed. What it needs is a
*publicly reachable* cluster, which means devnet, which is the same faucet
blocker below. Tunnelling the local stack was rejected: it would put a
validator and a faucet on the internet and would die with the machine.

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
npm run check          # typecheck + 17 suites, incl. one replaying every
                       # real settled tape onto the chain's own PnL
npm run check:gate     # the privacy proof: sealed REFUSED, control SERVED
npm run check:guards   # every refusal the program enforces, exercised for real
npm run check:race     # two independent clients seal and settle one match at once
npm run check:session  # a real Gum session token signing a real fill on the rollup
npm run check:short    # a real short, the margin cap refused, a real liquidation
cd chain && anchor test --skip-local-validator   # 27 passing, 2 pending
```

Plus `/proof` in the app: live cluster identity, measured L1-vs-ER latency,
the three program accounts, the most recent duel's ACLs, and the program's real
transaction history with explorer links. None of it requires a wallet.

---

## Blockers, stated plainly

**Devnet deploy.** The wallet `3YUgUPu9AdJj6FCFFvzR9pJixCN7EcAnCXMJoTuYwsS5`
holds 0 devnet SOL. `solana airdrop` was attempted 16+ times across
`api.devnet.solana.com` and `api.testnet.solana.com` over the build and refused
every time as rate-limited; `faucet.solana.com` requires a browser captcha,
which was not bypassed. The program `.so` is 798,056 bytes, so rent-exemption plus the
deploy buffer needs roughly 6–10 SOL — several successful airdrops, not one.

**Consequence:** enforcement is proved; **attestation is not**. These are two
different claims and the project separates them everywhere.

A bare `ephemeral-validator` has no ingress gate, so this stack runs the
query-filtering-service in front of it on `:6699`. That gate reads the on-chain
ACL and really refuses: `npm run check:gate` shows a sealed position REFUSED to
an anonymous reader, the **same account shape without a permission SERVED** as a
control, and an owner's signed token opening their own position and not their
opponent's. A door shut for everybody would not be access control, which is why
the control row is in the table.

What is missing is a TEE to attest that the gate is the process we say it is.
`/proof` therefore carries two separate rows — `read gate: YES` and
`gate attested: NO — not a TEE` — and only the second says NO.

**To unblock:** fund that address with ~10 devnet SOL (the `.so` is now
798,056 bytes), then

```bash
cd chain && anchor deploy --provider.cluster devnet
EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy
```

`src/chain/config.ts` already carries the devnet TEE cluster
(`devnet-tee.magicblock.app`, validator `MTEW…`), and the two skipped tests in
`chain/tests/er-privacy.ts` are written and ready to run against it.

---

## Before submitting — checklist

1. [ ] Record the video from `DEMO.md`. Run `npm run crank` and
       `npm run hold -- 900` first, or the gate row will not say YES.
2. [ ] Upload it and paste the URL into the **Demo video** field above.
3. [ ] Retry the devnet faucet once more (`solana airdrop 2` ×5, or
       faucet.solana.com in a browser). If it lands, do Phase 4 in `PLAN.md`
       and replace the Program ID field before submitting.
4. [ ] Paste the fields above into the form.
5. [ ] Submit at `https://build.magicblock.app/?stage=blitz#submit`
       — **before Fri 2026-09-11 05:00 CDT**. Aim for Wednesday.
6. [ ] Record the confirmation and timestamp back into this file.

---

## Honest summary

This is a complete, heavily verified Ephemeral Rollups submission with the
Private ER layer built, wired into the path a player actually takes, and
enforced by a gate that really refuses — proved on every run by
`npm run check:gate`, with the control row included so the proof means
something.

What is missing is **attestation, not enforcement**. The gate is a process on
our machine; a TEE validator is what turns "it refuses" into something a judge
can check without trusting us. Reaching one needs devnet SOL, and the faucets
refused 40+ times.

That distinction is stated in the app (`/proof` reports enforcement and
attestation as two separate rows, and only the second says NO), in the README,
in the proof script, and here — because a judge finding it themselves would be
worse than being told. The same applies to VRF, which is requested on chain and
never fulfilled.

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
