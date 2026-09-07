# FOGDUEL

**Hidden-position 1v1 trading on Solana, built on MagicBlock Ephemeral Rollups.**

Two traders stake an equal entry into an escrowed pot and trade for five
minutes — **each on a token of their own choosing**, long or short, scored on
PnL. Any token Jupiter can price is duelable, from SOL and wrapped BTC down to
a pump.fun memecoin minted an hour ago.

During the round each player's position is delegated to an Ephemeral Rollup, so
fills land in milliseconds — and on a TEE validator the position is *private*,
so neither the opponent nor a public RPC can read size, side or fill count. A
short is real margin: size is capped at one times the entry, and a position
whose equity reaches zero is liquidated and **announced**, which is the one
deliberate hole in the fog. At the buzzer the positions commit back to Solana,
PnL is compared, the winner takes the pot less a 2% rake, and a public `Tape`
is written recording both players' markets and every fill.

Every other 1v1 trading product on Solana (VERSUS, SolDuel, TradeLeague) is
**public during the fight**. Fogduel is **private during the fight, public
after**. That window is the product.

---

## MagicBlock primitives used

| Primitive | Where | Status |
|---|---|---|
| **Ephemeral Rollups** — delegate / write / commit / undelegate | `delegate_position_to_er`, `commit_and_undelegate_position` | **Working, proved by test.** 26 on-chain tests, including the negative case: a fill that succeeds on the rollup is rejected on L1 while the account is delegated. |
| **Private Ephemeral Rollups** — per-position ACL | `create_position_permission`, `delegate_position_permission`, `init_position_privacy` | **Enforced, not attested.** Every match started through the UI puts an ACL on chain naming only its owner, and the query-filtering-service refuses a sealed position while serving the same account shape without one — `npm run check:gate` proves it every run. What is missing is attestation; see Limitations §1. |
| Magic Router / ER RPC | `src/chain/client.ts` | Working |
| **VRF** | `request_market_draw`, `settle_market_draw` | **Requested on chain; cannot be fulfilled here.** The request is built with the official SDK and the VRF program accepts it (`npm run check:vrf`). No oracle answers: the queues this validator preloads were dumped from devnet and name oracle identities we do not hold keys for. Nothing simulates a draw, and no UI is built on one that cannot resolve. See Limitations §7. |
| **Session keys** (Gum Session Protocol) | `session.ts`, `session_auth_or` on `apply_fill` | **Used.** At seal time the player signs once to mint a session token authorising a throwaway key to call `apply_fill` on their behalf — bounded to an hour and scoped to this program. A sixty-second round costs one signature instead of one per fill. `apply_fill` carries `session_auth_or`, so without a token the signer must be the position's owner, and a token names exactly one owner. Proved by `npm run check:session` (15 assertions) and visible on chain: a real `ApplyFill` on the owner's position, signed and paid by the session key. |

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
# 26 passing, 2 pending across three suites: lifecycle (escrow, the private
# book, impact, the mark's rate limit, rake, settlement, tape, stats), the
# rollup (delegation, ER writes, L1 rejection, commit-back, settle) and the
# permission ACL. The two pending are the ephemeral-permission TEE path.
cd chain && anchor test --skip-local-validator

cd ..
npm run check          # typecheck + 9 assertion suites, 1963 assertions
npm run verify:client  # a full match through the app's own client
npm run check:gate     # what the front door enforces, against a control
npm run check:guards   # every refusal the program makes, exercised for real
npm run check:race     # two clients sealing and settling one match at once
npm run check:markets  # the live market list, end to end
npm run prove:privacy  # the whole privacy claim, stage by stage
```

`npm run check` is the whole suite. What each part asserts:

| Suite | What it proves |
|---|---|
| `tape` | 1683 assertions replaying every real settled tape's fills onto the chain's own `pnl_*_bps`, and the impact previewer against every recorded execution price |
| `h2h` | The head-to-head query's byte offsets, derived from a real account, agreeing filtered-vs-scanned across every pairing |
| `race` | Two independent clients sealing **and** settling one live match concurrently |
| `guards` | Six refusals the deployed program enforces: self-join, cancel-after-join, settle-before-buzzer, fill-on-undelegated, fill-after-buzzer, join-a-stale-match |
| `fog` | Opponent state unreadable in every pre-reveal phase |
| `errors` | Every error the program declares maps to a unique readable message, with codes read from the deployed IDL |
| `preflight`, `tokens`, `series` | Cluster/program/balance checks, design-token drift, chart maths |

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
| `/tape/<match>` | A settled duel at a permanent URL: both players' every fill, no wallet |
| `/spectate/<match>` | Watch a live duel, both positions fogged to you too, no wallet |
| `/health` | Dependency health |
| `/gallery` | Every UI component in every state |

---

## Demo script (3 minutes)

The exact click path, in the order that makes the argument.

**1. `/proof` — establish that this is real (45s)**
   - CLUSTER panel: which endpoints, which validator, and two separate rows
     that are the whole honest claim —
     `read gate: YES — sealed position refused, control served` and
     `gate attested: NO — not a TEE`. Enforcement is real here; attestation is
     what needs the TEE.
   - MEASURED SPEED: real medians, not a slide.
   - ACCESS CONTROL LISTS: the permission accounts of the most recent duel,
     read from chain. Sealed and delegated, owned by `DELeGG…`.
   - **THE LIFE OF ONE DUEL**: every base-layer transaction touching either
     position, oldest first — JOIN MATCH, CREATE POSITION PERMISSION ×2,
     DELEGATE POSITION PERMISSION ×2, DELEGATE POSITION TO ER ×2, PROCESS
     UNDELEGATION ×2, SETTLE MATCH. Click any row and it opens in an explorer.
     This is the delegation story as signatures rather than as a claim.
   - LIVE RIGHT NOW: duels in progress, each linking into `/spectate`.
   - None of this needs a wallet. It is public account state.

**2. Terminal — the privacy proof (~10s)**

```bash
npm run prove:privacy
```

   Walks a real match and prints, at each stage, exactly what each party can
   read. Watch the MID-ROUND VISIBILITY block and the VERDICT under it. On a
   TEE cluster the opponent read is refused; on local it says so plainly
   rather than pretending.

**3. `/play` — play one (5 min, or 60s with the env override)**
   - OPEN BOOK shows real unjoined matches from other wallets. JOIN one.
   - Joining seals the match: two access-control lists are created on chain and
     delegated before either position is. The opponent panel carries a
     **SEALED** badge that reflects a real `getAccountInfo`, not a local flag —
     `SEALED · ACL ON CHAIN` locally, `SEALED · TEE ENFORCED` on a TEE.
   - Pick your market first — search any ticker, name or mint address. Your
     opponent picks their own; you are scored against each other, not against
     the same coin.
   - LONG, or SHORT. The orb turns green, the PnL odometer rolls, the clock
     pulses under 10 seconds.
   - The opponent panel shows a fill count and nothing else, all round.
   - Rounds are five minutes. For a recording, `EXPO_PUBLIC_ROUND_SECONDS=60`
     shortens them — the program accepts anything from 10s to 3600s, so that
     is a real 60-second round rather than a shortened display.
   - SIZE (1/4, 1/2, MAX) changes what a fill costs, and the line under it
     quotes the impact before you sign. It is exact, not an estimate — MAX
     quotes 1.56% and the chain charges 1.56%.
   - At 0:00 SETTLING ON SOLANA shows the three real stages: the commit reports
     how many rollup transactions it took, undelegation reports both positions
     home, settle reports the pot paid.
   - Then the curtain tears and the ROUND TIMELINE draws both players' real
     fills on one time axis, replayed from the tape the program just wrote —
     with the head-to-head record underneath.

**3b. COPY TAPE LINK → `/tape/<match>` (15s)**
   - The same duel at a permanent URL, no wallet: every fill of both players
     with side, size, execution price and the second it landed, and
     `paid + rake = pot` shown exactly. The Tape never changes after
     settlement, so the link says the same thing tomorrow.

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
npm run check          # typecheck + 9 assertion suites, 1963 assertions
npm run check:gate     # what the front door enforces, tested against a control
npm run check:guards   # every refusal the deployed program makes, exercised for real
npm run check:race     # two independent clients sealing and settling one match at once
npm run check:tape     # every settled tape replayed onto the chain's own PnL
npm run check:h2h      # the head-to-head count, filtered vs a full scan
npm run check:vrf      # the VRF request path, and exactly where it stops
npm run check:sealed   # proves the UI's own path puts an ACL on chain for both players
npm run check:markets  # the live market list: real mints, prices, logos, and a
                       # startPx the program will accept
npm run check:pumpfun  # the pump.fun integration on its own
npm run verify:client  # drives a full match through the app's own client
npm run prove:privacy  # the privacy proof, stage by stage (~31s)
npm run truth          # RPC ground truth, to check rendered numbers against
npm run state          # where every unfinished match got to
npm run crank          # settle anything abandoned past its buzzer
cd chain && anchor test --skip-local-validator   # 26 passing, 2 pending
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
3. **Positions are virtual inventory, and fills do not route to a venue.**
   The entry becomes quote purchasing power inside the round; no SPL moves
   until settlement. Each fill executes against a constant-product book held
   *inside that player's own `Position`*, not against pump.fun or Jupiter —
   a public swap print mid-round would leak the wallet, the mint and the size,
   which is the whole thing the fog exists to hide. The program contains no CPI
   into either venue.

   The markets themselves are real: live pump.fun `frontend-api-v3` and Jupiter
   over HTTP, real mainnet mints, real market caps, real logos. The mint on a
   `Match` is the market's true mainnet identity — it is what the duel is
   *about*, and it is not custodied.
4. **Web only.** `@solana/wallet-adapter` is browser-only, and metro resolves
   `@solana-mobile/*` to a stub. A native build needs Mobile Wallet Adapter or
   Solflare deeplinks.
5. **Not deployed to devnet** for the same faucet reason — the `.so` is
   702,128 bytes, so rent plus the deploy buffer needs roughly 6–10 SOL, which
   is several successful airdrops rather than one. Airdrops were refused 40+
   times across the public faucets; `faucet.solana.com` requires a captcha. The
   program ID below is the local deployment. See `SUBMISSION.md` for the exact
   unblock steps.
6. **An open match goes stale after five minutes.** Both books are seeded from
   the market mid snapshotted when the match is *created*, so a duel joined long
   afterwards would start at a price the market has left behind — and the
   rate-limited crank would then correct it mid-round, at the joiner's expense.
   That is not hypothetical: before this was bounded, a match joined 86 minutes
   late settled its joiner at **-90.22%** on a single fill whose own impact was
   1.53%. `join_match` now refuses a match older than `MAX_OPEN_AGE` (300s,
   `state.rs`) with `MatchStale`, and the open book marks those rows STALE
   rather than offering a JOIN the program will refuse. The creator cancels and
   reopens at a fresh price, which costs one transaction.
7. **VRF is requested but never fulfilled.** `request_market_draw` builds a real
   request with the official SDK and the VRF program accepts it on chain
   (`npm run check:vrf`). No oracle answers, and this was checked rather than
   assumed:

   - The queue this validator preloads (`GKE6d7iv…`) is a 9500-byte account
     owned by the VRF program, dumped from devnet.
   - It does not list the repo's `.keys/vrf-oracle.json` (`5DBVUoQ3…`), and
     that key is not `VRF_PROGRAM_IDENTITY` either.
   - Registering our own oracle needs `modify_oracles` /
     `initialize_oracle_queue`. `ephemeral-vrf-sdk` 0.17 exports only the
     *request* builders — `create_request_randomness_ix` and its variants — so
     neither the account layout nor the queue's admin authority is available
     to us.

   So fulfilment needs an oracle identity that does not exist in this repo or
   environment. `settle_market_draw` is guarded by `#[vrf_callback]`, so only
   the VRF program could ever write a result. **Nothing simulates a draw**, and
   the BLIND DRAFT mode that would consume one stays a `SOON` tile rather than
   being faked.

---

## Layout

```
chain/                  Anchor workspace
  programs/fogduel/     the program (16 instructions)
  tests/fogduel.ts      lifecycle: escrow, book, impact, rake, settlement, tape
  tests/er-privacy.ts   rollup delegation + commit tests (2 pending: the TEE path)
  tests/permission.ts   ACL creation, delegation, and what each endpoint serves
scripts/localnet.sh     brings up base + rollup + the permission-checking front
server/market-proxy.mjs CORS shim for pump.fun and Jupiter (no secrets)
server/rpc-recorder.mjs records what the app asks the rollup for
src/chain/              typed client, config, PDAs, units, wallet, chain hooks
src/ui/                 pixel UI library + drawn SVG icons and token marks
src/screens/            landing, duel, feed, board, modes, quests, proof, gallery
app/                    expo-router:  /  /play  /proof  /tape/<m>  /spectate/<m>
                        /health  /gallery
TEST-PLAN.md            every component and flow, with its verified result
PLAN.md                 phase/task status and the full gap list
DEMO.md                 the recording script: shot list, timings, and the
                        prerequisites that bite if you skip them
```

**Program ID (local):** `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1`
