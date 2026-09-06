# FOGDUEL

**Hidden-position 1v1 trading on Solana, built on MagicBlock Ephemeral Rollups.**

Two traders stake an equal entry into an escrowed pot and trade the same token
for a fixed window. During the round each player's position is delegated to an
Ephemeral Rollup, so fills land in milliseconds — and on a TEE validator the
position is *private*, so neither the opponent nor a public RPC can read size,
side or fill count. At the buzzer the positions commit back to Solana, PnL is
compared, the winner takes the pot less a 2% rake, and a public `Tape` is
written.

Every other 1v1 trading product on Solana (VERSUS, SolDuel, TradeLeague) is
**public during the fight**. Fogduel is **private during the fight, public
after**. That window is the product.

---

## MagicBlock primitives used

| Primitive | Where | Status |
|---|---|---|
| **Ephemeral Rollups** — delegate / write / commit / undelegate | `delegate_position_to_er`, `commit_and_undelegate_positions` | **Working, proved by test** |
| **Private Ephemeral Rollups** — ephemeral permission, `is_private` | `init_position_privacy` | **Implemented and building; live proof blocked — see Limitations** |
| Magic Router / ER RPC | `src/chain/client.ts` | Working |
| VRF | — | Not attempted |

---

## Run it

Prerequisites: Rust, Solana CLI, Anchor 0.32, Node 22+.

### 1. Base layer + Ephemeral Rollup

`mb-test-validator` is a `solana-test-validator` preloaded with the MagicBlock
delegation (`DELeGG…`) and permission (`ACLseo…`) programs. A plain test
validator will not work — the ER exits on startup without them.

```bash
cd chain && npm install

# base layer
npx mb-test-validator --reset --ledger /tmp/fd-ledger \
  --rpc-port 8999 --faucet-port 9901 --gossip-port 8110 --dynamic-port-range 8111-8220

# ephemeral rollup (separate shell)
npx ephemeral-validator --remotes http://127.0.0.1:8999 \
  --lifecycle ephemeral --listen 127.0.0.1:7799 --storage /tmp/fd-er --reset --no-tui
```

### 2. Deploy

```bash
cd chain
solana airdrop 20 $(solana address) --url http://127.0.0.1:8999
anchor build && anchor deploy --provider.cluster http://127.0.0.1:8999
```

### 3. Test

```bash
# 11 lifecycle tests: escrow, fills, rake, settlement, tape
cd chain && anchor test --skip-local-validator

# 5 ER tests: delegation, ER writes, L1 rejection, commit-back, settle
ANCHOR_PROVIDER_URL=http://127.0.0.1:8999 ANCHOR_WALLET=$HOME/.config/solana/id.json \
  npx mocha --import=tsx --timeout 200000 tests/er-privacy.ts

# drives a full match through the app's own client
cd .. && npm run verify:client
```

### 4. App

```bash
npm run web     #  /  landing   /play  duel   /gallery  components
```

---

## What is verified, and how

`npm run verify:client` drives a complete match through `src/chain/client.ts` —
the same code the UI calls — and asserts each step against a live validator:

```
1. create_match ............. 0.1 SOL escrowed
2. fetch_open_matches ....... the new match is listed
3. join_match ............... live, pot 0.2 SOL
4. delegate ................. both positions delegated to the ER
5. apply_fill ............... lands on the ER, account advances there
6. commit + undelegate ...... ownership returns to the program,
                              and the ER fill survives onto L1
7. settle ................... winner +7.20%, rake 0.004 SOL, payout 0.196 SOL
8. tapes .................... readable for the public feed
```

The ER test suite additionally proves the negative case that makes delegation
real: **a fill that succeeds on the ER is rejected on L1 while the account is
delegated.**

---

## Which accounts are private, and when

| Account | During a live round | After settlement |
|---|---|---|
| `Match` | public | public |
| `PriceFeed` | public (both players must be quoted identically) | public |
| `Position` | **private to its owner on a TEE** | public (committed to L1) |
| `Tape` | does not exist yet | public, permanently |

The client never fetches the opponent's `Position` during a live round. On a
TEE the read is refused at ingress; on a non-TEE cluster fetching it would leak
exactly what the mode exists to hide.

---

## Honest limitations

Read this before judging — none of it is hidden in the code.

1. **PER privacy is not yet proved live.** `init_position_privacy` is
   implemented, compiles and is wired, but the local `ephemeral-validator` is
   **not a TEE**, and ephemeral permissions are a TEE feature — creating the
   permission account on it fails with *"Transaction loads a writable account
   that cannot be written."* Proving it needs `devnet-tee.magicblock.app`,
   which needs devnet SOL, and every public faucet was rate-limited or
   key-gated during this build. **The ER half is fully proved; the privacy half
   is code-complete but unproved.**
2. **The price feed is cranked, not an oracle.** One `PriceFeed` account per
   match, pushed by the match authority. It is deliberately *not* a public DEX
   swap — a public swap print mid-round would hand the opponent the fills the
   fog exists to hide. A production build should read Pyth/Switchboard.
3. **Positions are virtual inventory.** The entry becomes quote purchasing
   power inside the round; no SPL moves until settlement. Same reason.
4. **Web only.** `@solana/wallet-adapter` is browser-only, and metro resolves
   `@solana-mobile/*` to a stub. A native build needs Mobile Wallet Adapter or
   Solflare deeplinks.
5. **Not deployed to devnet** for the same faucet reason. The program ID below
   is the local deployment.

---

## Layout

```
chain/                  Anchor workspace
  programs/fogduel/     the program (8 lifecycle + 3 MagicBlock instructions)
  tests/fogduel.ts      11 lifecycle tests
  tests/er-privacy.ts   ER delegation + commit tests
src/chain/              typed client, config, PDAs, wallet, chain hooks
src/ui/                 31-component pixel UI library + drawn SVG icons
src/screens/            landing, duel, feed, board, modes, quests, gallery
app/                    expo-router routes:  /  /play  /gallery
PLAN.md                 phase/task status and the full gap list
```

**Program ID (local):** `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1`
