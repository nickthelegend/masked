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
> with their positions delegated to a MagicBlock Ephemeral Rollup. On a TEE
> validator each position carries an on-chain access-control list naming only
> its owner, so neither the opponent nor a public RPC can read size, side or
> fill count while the round is live. At the buzzer both positions commit back
> to Solana, PnL is compared, the winner takes the pot less a 2% rake, and a
> public Tape is written. Every other 1v1 trading product on Solana is public
> during the fight; this one is private during the fight and public after.

**Repo:** *(this repository)*

**MagicBlock primitives used:**
- **Ephemeral Rollups** — `delegate_position_to_er`,
  `commit_and_undelegate_positions`. Positions are delegated, mutated on the
  rollup, and committed back. Proved by test, including the negative case: a
  fill that succeeds on the ER is rejected on L1 while the account is delegated.
- **Private Ephemeral Rollups** — `create_position_permission`,
  `delegate_position_permission`, `init_position_privacy`. Each position gets an
  ACL naming only its owner; the ACL is delegated to the same validator.
- **VRF** — not attempted. Stated rather than implied.

**Program ID:** ⚠ local `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1` —
devnet deploy blocked, see below.

**Demo video / live URL:** ⚠ pending. A production build is ready
(`npx expo export -p web && npx serve -s dist`).

**Market mint:** `3nmxq3N78WQGQPXULxmSQ2rjXYwX8zrjrcYxnP2aQpNo` (real SPL mint,
5 decimals, created on the demo cluster).

---

## What a judge can verify in five commands

```bash
npm run check          # 5 assertion suites, 74 assertions
npm run check:sealed   # the UI's own path puts an ACL on chain for both players
npm run verify:client  # a full match through the exact client the UI uses
npm run prove:privacy  # stage-by-stage visibility report (~65s)
cd chain && anchor test --skip-local-validator   # 22 tests, 20 pass, 2 skipped
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
which was not bypassed. The program `.so` is 636KB, so rent-exemption plus the
deploy buffer needs roughly 5–9 SOL — several successful airdrops, not one.

**Consequence:** PER read-blocking is implemented and wired end to end but is
**unproved on real hardware**. A local `ephemeral-validator` is not a TEE and
has no ingress gate, so on the local cluster the ACL is real and on chain but
reads are not refused. `prove:privacy` says exactly this rather than implying
otherwise, and `/proof` shows "privacy enforced: NO — needs a TEE" in red.

**To unblock:** fund that address with ~9 devnet SOL, then

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
Private ER layer built, wired into the product path, and demonstrably on chain
— but with its final enforcement step unproved for want of devnet SOL. That
distinction is stated in the app, in the README, in the proof script and here,
because a judge finding it themselves would be worse than being told.
