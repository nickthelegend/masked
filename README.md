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

MASKED runs on three layers, and the third one is the point.

| Layer | Port | What it is |
|---|---|---|
| base | 8999 | `mb-test-validator` — a `solana-test-validator` preloaded with the MagicBlock delegation (`DELeGG…`) and permission (`ACLseo…`) programs. Escrow and settlement live here. A plain test validator will not work; the rollup exits on startup without those programs. |
| rollup | 7799 | `ephemeral-validator` — holds the delegated Positions. This is the validator's own port and it answers anybody. |
| public | 6699 | `query-filtering-service` — the front door. It reads `ACLseo…` to decide who may see what. **This is the only rollup endpoint the app ever talks to**, and it is what "a public RPC cannot read your position" means. |

One script brings up all three:

```bash
cd chain && npm install && cd ..

./scripts/localnet.sh              # base, rollup, public front
MASKED_RESET=1 ./scripts/localnet.sh   # …from genesis, clearing all three
```

Ledgers go in `.localnet/` beside the repo, not `/tmp`: the base layer writes
about a gigabyte an hour, and on the boot volume that fills the disk.

### 2. Deploy

```bash
cd chain
solana airdrop 20 $(solana address) --url http://127.0.0.1:8999
anchor build && anchor deploy --provider.cluster http://127.0.0.1:8999
cd .. && npm run sync:idl
```

### 3. Start the market proxy

pump.fun and Jupiter both answer a server and neither sends
`Access-Control-Allow-Origin`, so a browser cannot call them directly. This is
a CORS shim and nothing else — no secrets, two upstream hosts, and it refuses
anything else with a 403.

```bash
npm run proxy      # :8791, and GET /whoami identifies it
```

### 4. Test

```bash
# 16 lifecycle tests: escrow, the private book, impact, the mark's rate limit,
# rake, settlement, tape, stats
cd chain && anchor test --skip-local-validator

# 5 rollup tests: delegation, ER writes, L1 rejection, commit-back, settle
ANCHOR_PROVIDER_URL=http://127.0.0.1:8999 ANCHOR_WALLET=$HOME/.config/solana/id.json \
  npx mocha --import=tsx --timeout 1000000 tests/er-privacy.ts

cd ..
npm run check          # typecheck + 5 assertion suites
npm run verify:client  # a full match through the app's own client
npm run check:gate     # what the front door enforces, against a control
npm run check:markets  # the live market list, end to end
npm run prove:privacy  # the whole privacy claim, stage by stage
```

### 5. The markets

Duels are fought over real markets, listed live: pump.fun for memes, Jupiter
for SOL and USDC. Nothing is hardcoded and there is no fallback list — if a
feed is down the picker says so and refuses to open a match rather than
inventing a price.

Positions are virtual inventory. No SPL moves during a round, and no fill is
ever routed to pump.fun or a Jupiter swap: a public swap print would hand the
opponent the wallet, the mint and the size that the fog exists to hide. Those
feeds price the round; each player's own constant-product book fills it.

### 6. Seed the chain and run the app

```bash
npm run seed -- 5      # plays 5 real duels, on live markets, start to finish
npm run open -- 4      # opens unjoined matches so the book is not empty
npm run crank          # settles anything abandoned past its buzzer
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
| `Position` | **refused by the public endpoint to everyone but its owner** | public (committed to L1) |
| `Tape` | does not exist yet | public, permanently |

The read is refused at the door — `npm run check:gate` shows a sealed position
refused while a permission-less one on the same rollup is served, which is the
difference between access control and an outage — and the app does not ask for
it in the first place: `npm run check:fog:wire` recorded 350 calls to the
rollup during a live round, 53 for the player's own position and none for the
opponent's.

---

## Verification you can run

```bash
npm run check          # typecheck + 5 assertion suites (tokens, series, fog, errors, preflight)
npm run check:gate     # what the front door enforces, tested against a control
npm run check:sealed   # proves the UI's own path puts an ACL on chain for both players
npm run check:markets  # the live market list: real mints, prices, logos, and a
                       # startPx the program will accept
npm run check:pumpfun  # the pump.fun integration on its own
npm run verify:client  # drives a full match through the app's own client
npm run prove:privacy  # the privacy proof, stage by stage (~65s)
npm run truth          # RPC ground truth, to check rendered numbers against
npm run state          # where every unfinished match got to
npm run crank          # settle anything abandoned past its buzzer
cd chain && anchor test --skip-local-validator   # 26 on-chain tests
```

---

## Honest limitations

Read this before judging — none of it is hidden in the code.

1. **Reads are gated. What is missing is attestation, not enforcement.**
   Every match started through the UI creates an access-control list for each
   position naming only its owner, delegates both ACLs to the rollup, then
   delegates the positions. The rollup sits behind a query-filtering-service
   that reads `ACLseo…`, and that door does refuse:

   | | validator :7799 | public :6699 |
   |---|---|---|
   | sealed position, anonymous | 543 bytes | **REFUSED** |
   | same shape, no permission | 543 bytes | 543 bytes |
   | owner, with a signed token | — | 543 bytes |
   | opponent, with a signed token | — | **REFUSED** |

   The control row is the one that matters: a door shut for everybody is not
   access control. `npm run check:gate` runs this every time, and `/proof`
   probes it live from the browser.

   What is missing is *attestation*. That gate is a process on this machine,
   and a judge has only my word that it is the one I say it is. A TEE
   validator (`devnet-tee.magicblock.app`) replaces that word with something
   checkable. Reaching it needs devnet SOL, and airdrops were refused 40+
   times across the public faucets — `faucet.solana.com` requires a captcha.
   So `/proof` reports enforcement and attestation as two separate rows, and
   only the second one says NO.

   An earlier version of this README said the read gate was unproved and that
   the local stack had none. That was wrong: the stack ships one, and it
   works.

2. **The price feed is cranked, not an oracle.** One `PriceFeed` account per
   match, pushed by the match authority. It is deliberately *not* a public DEX
   swap — a public swap print mid-round would hand the opponent the fills the
   fog exists to hide. A production build should read Pyth/Switchboard.
3. **Positions are virtual inventory.** The entry becomes quote purchasing
   power inside the round; no SPL moves until settlement — a public swap print
   mid-round would hand the opponent the fills the fog exists to hide. The
   market is a real SPL mint (`3nmxq3N78WQGQPXULxmSQ2rjXYwX8zrjrcYxnP2aQpNo`)
   that identifies the market without being custodied.
4. **Web only.** `@solana/wallet-adapter` is browser-only, and metro resolves
   `@solana-mobile/*` to a stub. A native build needs Mobile Wallet Adapter or
   Solflare deeplinks.
5. **Not deployed to devnet** for the same faucet reason — the `.so` is 636KB,
   so rent plus the deploy buffer needs roughly 5–9 SOL, which is several
   successful airdrops rather than one. The program ID below is the local
   deployment. See `SUBMISSION.md` for the exact unblock steps.

---

## Layout

```
chain/                  Anchor workspace
  programs/fogduel/     the program (14 instructions)
  tests/fogduel.ts      16 lifecycle tests
  tests/er-privacy.ts   rollup delegation + commit tests
  tests/permission.ts   ACL creation, delegation, and what each endpoint serves
scripts/localnet.sh     brings up base + rollup + the permission-checking front
server/market-proxy.mjs CORS shim for pump.fun and Jupiter (no secrets)
server/rpc-recorder.mjs records what the app asks the rollup for
src/chain/              typed client, config, PDAs, units, wallet, chain hooks
src/ui/                 pixel UI library + drawn SVG icons and token marks
src/screens/            landing, duel, feed, board, modes, quests, proof, gallery
app/                    expo-router:  /  /play  /proof  /health  /gallery
TEST-PLAN.md            every component and flow, with its verified result
PLAN.md                 phase/task status and the full gap list
```

**Program ID (local):** `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1`
