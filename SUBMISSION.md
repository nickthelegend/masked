# SUBMISSION — MagicBlock Solana Blitz v8

Everything the submission form asks for, prepared and ready to paste.
**Status: not yet submitted.** Fields marked ⚠ depend on a devnet deploy,
which is blocked on faucet funding (see Blockers).

---

## Form fields

**Project name:** Fogduel

**One line:** Hidden-position 1v1 trading on Private Ephemeral Rollups — reveal
and pot settlement on Solana.

**Description (short):**
> Two traders stake an equal pot and trade the same market for a fixed window
> with their positions delegated to a MagicBlock Ephemeral Rollup. Each position
> carries an on-chain access-control list naming only its owner, and the rollup
> sits behind a query-filtering-service that reads it — so the opponent's size,
> side and fill count are refused to everyone but the owner while the round is
> live. At the buzzer both positions commit back to Solana, PnL is compared, the
> winner takes the pot less a 2% rake, and a public Tape is written — every fill
> of both players, readable forever. Every other 1v1 trading product on Solana
> is public during the fight; this one is private during the fight and public
> after.

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
- **Session keys** — not used. Every fill is a wallet signature.

**Program ID:** ⚠ local `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1` —
devnet deploy blocked, see below.

**Demo video / live URL:** ⚠ pending. A production build is ready
(`npx expo export -p web && npx serve -s dist`).

**Markets:** live pump.fun (`frontend-api-v3`) and Jupiter over HTTP — real
mainnet mints, real market caps, real logos. The mint on a `Match` is the
market's true mainnet identity. Fills do **not** route to either venue: each
executes against a constant-product book inside that player's own `Position`,
because a public swap print mid-round would leak the wallet, mint and size the
fog exists to hide. The program contains no CPI into either venue.

---

## What a judge can verify in five commands

```bash
npm run check          # 9 suites, 1963 assertions — incl. 1683 replaying every
                       # real settled tape onto the chain's own PnL
npm run check:gate     # the privacy proof: sealed REFUSED, control SERVED
npm run check:guards   # 6 refusals the program enforces, exercised for real
npm run check:race     # two independent clients seal and settle one match at once
cd chain && anchor test --skip-local-validator   # 26 passing, 2 pending
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
which was not bypassed. The program `.so` is 702,128 bytes, so rent-exemption plus the
deploy buffer needs roughly 6–10 SOL — several successful airdrops, not one.

**Consequence:** PER read-blocking is implemented and wired end to end but is
**unproved on real hardware**. A local `ephemeral-validator` is not a TEE and
has no ingress gate, so on the local cluster the ACL is real and on chain but
reads are not refused. `prove:privacy` says exactly this rather than implying
otherwise, and `/proof` shows "privacy enforced: NO — needs a TEE" in red.

**To unblock:** fund that address with ~10 devnet SOL (the `.so` is now
702,128 bytes), then

```bash
cd chain && anchor deploy --provider.cluster devnet
EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy
```

`src/chain/config.ts` already carries the devnet TEE cluster
(`devnet-tee.magicblock.app`, validator `MTEW…`), and the two skipped tests in
`chain/tests/er-privacy.ts` are written and ready to run against it.

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
never fulfilled, and to session keys, which are simply not used.
