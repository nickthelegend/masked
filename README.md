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
# --limit-ledger-size matters: at the default the validator prunes old slots
# and getSignaturesForAddress goes empty, which silently blanks the /proof
# transaction feed even though the matches really happened.
npx mb-test-validator --reset --ledger /tmp/fd-ledger \
  --rpc-port 8999 --faucet-port 9901 --gossip-port 8110 --dynamic-port-range 8111-8220 \
  --limit-ledger-size 500000000

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

### 4. Create the market mint

Duels are fought over a real SPL mint. Create one on your cluster and point the
app at it:

```bash
spl-token create-token --url http://127.0.0.1:8999 --decimals 5
# then either set EXPO_PUBLIC_MINT=<address>, or edit DEMO_MINT in
# src/chain/market.ts
```

Positions are virtual inventory — no SPL moves during a round, because a public
swap print would hand the opponent the fills the fog exists to hide. The mint
identifies the market; it is not custodied.

### 5. Seed the chain and run the app

```bash
npm run seed -- 5      # plays 5 real duels so the feed and board have data
npm run open -- 3      # opens 3 unjoined matches so the book is not empty
npm run web
```

For a production build a judge can open without a dev server:

```bash
npx expo export -p web && npx serve -s dist
```

| Route | What it is |
|---|---|
| `/` | Landing page |
| `/play` | The duel |
| `/proof` | **Live on-chain evidence — start here if you are judging** |
| `/health` | Dependency health |
| `/gallery` | Every UI component in every state |

---

## Demo script (3 minutes)

The exact click path, in the order that makes the argument.

**1. `/proof` — establish that this is real (45s)**
   - CLUSTER panel: which endpoints, which validator, and whether privacy is
     actually enforced here. It says NO on a local validator, in red.
   - MEASURED LATENCY: real medians, not a slide.
   - ACCESS CONTROL LISTS: the permission accounts of the most recent duel,
     read from chain. Sealed and delegated, owned by `DELeGG…`.
   - RECENT PROGRAM TRANSACTIONS: click any signature — it opens an explorer.
     `DELEGATE POSITION TO ER` and `PROCESS UNDELEGATION` are right there.
   - None of this needs a wallet. It is public account state.

**2. Terminal — the privacy proof (60s)**

```bash
npm run prove:privacy
```

   Walks a real match and prints, at each stage, exactly what each party can
   read. Watch the MID-ROUND VISIBILITY block and the VERDICT under it. On a
   TEE cluster the opponent read is refused; on local it says so plainly
   rather than pretending.

**3. `/play` — play one (60s)**
   - OPEN BOOK shows real unjoined matches from other wallets. JOIN one.
   - Joining seals the match: two access-control lists are created on chain and
     delegated before either position is. The opponent panel carries a
     **SEALED** badge that reflects a real `getAccountInfo`, not a local flag —
     `SEALED · ACL ON CHAIN` locally, `SEALED · TEE ENFORCED` on a TEE.
   - LONG. The orb turns green, the PnL odometer rolls, the clock pulses under
     10 seconds.
   - The opponent panel shows a fill count and nothing else, all round.
   - Rounds are 60s by default so this is watchable; set
     `EXPO_PUBLIC_ROUND_SECONDS=300` for the real five-minute round.
   - At 0:00 the curtain tears: TAPE UNSEALED, both PnLs roll up, the tape
     draws in.

**4. `/play` → RANK (15s)**
   - The leaderboard is on-chain `PlayerStats`, not a client-side sum. Wins,
     lamports taken, and a best-streak that never decreases.

**5. Close on the one line**
   Every other 1v1 trading product on Solana is public during the fight. This
   one is private during the fight and public after — and `/proof` shows you
   exactly how much of that is enforced by the rollup versus by the client.

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

## Verification you can run

```bash
npm run check          # typecheck + 5 assertion suites (tokens, series, fog, errors, preflight)
npm run check:sealed   # proves the UI's own path puts an ACL on chain for both players
npm run verify:client  # drives a full match through the app's own client
npm run prove:privacy  # the privacy proof, stage by stage (~65s)
npm run truth          # RPC ground truth, to check rendered numbers against
cd chain && anchor test --skip-local-validator   # 20 on-chain tests
```

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
