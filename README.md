# MASKED

Source: https://github.com/nickthelegend/masked · Live (devnet): https://masked-eight.vercel.app · Tapes API: https://market-proxy-production.up.railway.app/api/tapes · Share card: https://market-proxy-production.up.railway.app/og/tape/<match>.png

Oracles (devnet): the deployed program also has `push_price_pyth`, which prices a SOL or USDC leg from Pyth's signed price updates, but only when a Switchboard On-Demand SOL/USD feed agrees with Pyth to within 1%. Once a feed takes a Pyth price, the rate-limited crank is locked out. Verified by `check:pyth` on devnet (17/17). It lives on branch `pyth-majors` until the app's majors crank is wired to it.

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
**public during the fight**. MASKED is **private during the fight, public
after**. That window is the product.

---

## MagicBlock primitives used

| Primitive | Where | Status |
|---|---|---|
| **Ephemeral Rollups** — delegate / write / commit / undelegate | `delegate_position_to_er`, `commit_and_undelegate_position` | **Working, proved by test.** 38 on-chain tests, including the negative case: a fill that succeeds on the rollup is rejected on L1 while the account is delegated. |
| **Private Ephemeral Rollups** — per-position ACL | `create_position_permission`, `delegate_position_permission`, `init_position_privacy` | **Enforced locally; enforced and attested on devnet.** Every match started through the UI puts an ACL on chain naming only its owner. Locally the query-filtering-service refuses a sealed position while serving the same account shape without one (`npm run check:gate`). On devnet, behind MagicBlock's TEE, the opponent's position is refused mid-round while the owner reads their own (`EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy`, 2026-09-13), and the endpoint's Intel TDX quote verifies (`npx tsx scripts/check-tee.mts`). See Limitations §1. |
| ER RPC, direct | `src/chain/client.ts` — a plain `Connection` to the rollup's gate | Working. The **Magic Router is not used**: nothing in `src/` or `scripts/` calls `ConnectionMagicRouter` or `getRoutes` |
| **VRF** | `request_market_draw`, `settle_market_draw` | **Fulfilled on devnet; not on the local stack.** `request_market_draw` builds the request with the official SDK. On devnet an oracle serving `DEFAULT_QUEUE` (`Cuj97ggr…`) answered within a second, twice, and `settle_market_draw`, which `#[vrf_callback]` opens only to the VRF program, wrote the chosen market (`EXPO_PUBLIC_CLUSTER=devnet npm run check:vrf`, 2026-09-13 02:50 and 02:51 UTC). The local validator's preloaded test queue has no oracle, so a local draw never resolves. No UI is built on a draw yet. See Limitations §7. |
| **Session keys** (Gum Session Protocol) | `session.ts`, `session_auth_or` on `apply_fill` | **Used.** At seal time the player signs once to mint a session token authorising a throwaway key to call `apply_fill` on their behalf — bounded to an hour and scoped to this program. A five-minute round costs one signature instead of one per fill. `apply_fill` carries `session_auth_or`, so without a token the signer must be the position's owner, and a token names exactly one owner. Proved by `npm run check:session` (15 assertions) and visible on chain: a real `ApplyFill` on the owner's position, signed and paid by the session key. |

---

## Run it

Prerequisites: Rust, Solana CLI, Anchor 0.32, Node 22+.

### 1. Base layer + Ephemeral Rollup

MASKED runs on three layers, and the third one is the point.

| Layer | Port | What it is |
|---|---|---|
| base | 8999 | `mb-test-validator` — a `solana-test-validator` preloaded with the MagicBlock delegation (`DELeGG…`) and permission (`ACLseo…`) programs, plus the committor (`ComtrB2…`), which `localnet.sh` fetches from devnet and adds because `mb-test-validator` does not ship it. Without the committor, a position rewritten by more than about twenty fills never commits back and that round's pot is stranded. Escrow and settlement live here. A plain test validator will not work; the rollup exits on startup without those programs. |
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
# 38 passing, 2 pending across four suites: lifecycle (escrow, the private
# book, impact, the mark's rate limit, rake, settlement, tape, stats), the
# rollup (delegation, ER writes, L1 rejection, commit-back, settle), the
# rollup's cranks (buzzer commit, liquidation, and a round with 24 fills a
# side that still comes home and replays from its tape's own window) and the
# permission ACL. The two pending are the ephemeral-permission TEE path.
cd chain && anchor test --skip-local-validator

cd ..
npm run check          # typecheck, lint + 20 assertion suites (22 steps)
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
| `tape` | Replays every real settled tape's fills onto the chain's own `pnl_*_bps`, and the impact previewer against every recorded execution price. The count grows with the cluster — 523 assertions over 11 tapes on the reset stack (2026-09-13 01:58 UTC), two of them sides past 16 fills replayed from the tape's own window start |
| `h2h` | The head-to-head query's byte offsets, derived from a real account, agreeing filtered-vs-scanned across every pairing |
| `race` | Two independent clients sealing **and** settling one live match concurrently |
| `er` | **Where the trade executed.** A fill on a rollup and a fill on a validator look identical from outside, so this drives a real fill and asks both clusters where it went: the position is owned by the delegation program, the signature is in the rollup's ledger, the same signature is **absent** from the base layer's, and the rollup's position carries the fill |
| `gate` | The privacy proof: a sealed position REFUSED to an anonymous reader, the same account shape **without** a permission SERVED as a control, and an owner's signed token opening their own position and not their opponent's |
| `sealed` | Every live match carries an on-chain ACL and both positions are delegated |
| `legs` | Both players' markets readable by an anonymous reader, both positions behind the ACL — the two halves of "public token, private position" |
| `short` | A real negative position, the margin cap, and a liquidation announced without leaking what was behind it |
| `session` | A real Gum session token signing a real fill on the rollup, and failing to settle or cancel |
| `guards` | Eight refusals the deployed program enforces: self-join, cancel-after-join, settle-before-buzzer, fill-on-undelegated, fill-after-buzzer, join-a-stale-match, plus the price rate limit reporting no-post instead of throwing and `walkPriceTo` still reaching its target through it |
| `fog` | Opponent state unreadable in every pre-reveal phase |
| `errors` | Every error the program declares maps to a unique readable message, with codes read from the deployed IDL |
| `markets`, `pumpfun` | The live pump.fun and Jupiter feeds: real mints, real prices, real logos, every price representable as the program's `u64` |
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
npx expo export --platform web --output-dir dist
npm run serve          # dist/ on http://127.0.0.1:4180; every route falls back to index.html
```

The production build is installable. It carries a web app manifest and a
service worker (`public/sw.js`) that keeps the app's own files, so the shell
opens offline and says the cluster is out of reach. It never caches a chain RPC,
the market proxy or a logo, because a price or a balance from a cache would be
an old number shown as a current one. The icons are drawn from the product's
own mask: `npm run icons` regenerates `public/icons/`.

| Route | What it is |
|---|---|
| `/` | Landing page |
| `/play` | The duel. `?market=<mint>` opens the lobby on that token; `?match=<address>` is an invite that opens matchmaking with that match first, or says why it cannot be joined |
| `/proof` | **Live on-chain evidence — start here if you are judging** |
| `/tape/<match>` | A settled duel at a permanent URL: both players' every fill, no wallet |
| `/spectate/<match>` | Watch a live duel, both positions fogged to you too, no wallet |
| `/tape`, `/spectate` | Without a match address: explain how to reach one |
| `/stats` | Protocol totals read from chain: duels settled, fills, paid to winners, the rake checked against the treasury |
| `/health` | Dependency health |
| `/gallery` | Every UI component in every state, under a permanent **SAMPLE DATA — COMPONENT GALLERY** banner: its figures are examples, not chain state |

---

## Demo script (3 minutes)

The exact click path, in the order that makes the argument.

**1. `/proof` — establish that this is real (45s)**
   - CLUSTER panel: which endpoints, which validator, and two separate rows
     that are the whole honest claim —
     `read gate: YES — sealed position refused, control served` and
     `gate attested: NO — not a TEE` on the local stack. Enforcement is real
     here; attestation is what the devnet TEE adds (`npx tsx scripts/check-tee.mts`).
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
   read. Watch the MID-ROUND VISIBILITY block and the VERDICT under it. The
   opponent read is refused on both clusters: locally by the query-filtering
   gate, and on devnet by MagicBlock's TEE (`EXPO_PUBLIC_CLUSTER=devnet npm run
   prove:privacy`, run 2026-09-13).

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
   - Rounds are five minutes by default. For a recording, pick **1 MIN** in
     the lobby's duration picker (1 / 5 / 15 MIN). The length is a real
     `create_match` argument and the program accepts anything from 10s to
     3600s, so that is a real 60-second round with no rebuild.
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
npm run check          # typecheck, lint + 20 assertion suites (22 steps)
npm run check:gate     # what the front door enforces, tested against a control
npm run check:guards   # every refusal the deployed program makes, exercised for real
npm run check:race     # two independent clients sealing and settling one match at once
npm run check:tape     # every settled tape replayed onto the chain's own PnL
npm run check:h2h      # the head-to-head count, filtered vs a full scan
npm run check:vrf      # a VRF draw: resolves on devnet (EXPO_PUBLIC_CLUSTER=devnet), stops locally
npm run check:sealed   # proves the UI's own path puts an ACL on chain for both players
npm run check:markets  # the live market list: real mints, prices, logos, and a
                       # startPx the program will accept
npm run check:pumpfun  # the pump.fun integration on its own
npm run verify:client  # drives a full match through the app's own client
npm run prove:privacy  # the privacy proof, stage by stage (~31s)
npm run truth          # RPC ground truth, to check rendered numbers against
npm run state          # where every unfinished match got to
npm run crank          # settle anything abandoned past its buzzer
npm run soak -- 3 60   # 3 concurrent duels, 60 s rounds, full lifecycle each;
                       # fill latency p50/p90/p99 and who committed each round
                       # (--no-cranks commits from the client, --fills N caps fills)
npm run check:palette  # the colour-blind palette stays two colours for every
                       # kind of colour-blindness (simulated), and readable
cd chain && anchor test --skip-local-validator   # 38 passing, 2 pending
```

Two checks sit outside `npm run check` on purpose. `check:vrf` reports exactly
where the VRF draw stops locally (no oracle serves the local test queue; on devnet the same check resolves a draw, see Limitations §7). `check:fog:wire`
needs a recorded session: it reads which accounts the app actually asked the
rollup for, which cannot be observed from inside the page, so the app is pointed
at a recording pass-through in front of the gate and a real duel is played
through it.

```bash
node server/rpc-recorder.mjs http://127.0.0.1:6699 7010 .localnet/rpc-er.log
EXPO_PUBLIC_ER_URL=http://127.0.0.1:7010 npx expo start --web --clear
# play one duel in the app, then name the match and both wallets:
npm run check:fog:wire -- <match> <your wallet> <opponent wallet> .localnet/rpc-er.log
```

---

## Honest limitations

Read this before judging — none of it is hidden in the code.

1. **Reads are gated locally, and gated and attested on devnet.**
   Every match started through the UI creates an access-control list for each
   position naming only its owner, delegates both ACLs to the rollup, then
   delegates the positions. The rollup sits behind a query-filtering-service
   that reads `ACLseo…`, and that door does refuse:

   | | validator :7799 | public :6699 |
   |---|---|---|
   | sealed position, anonymous | 559 bytes | **REFUSED** |
   | same shape, no permission | 559 bytes | 559 bytes |
   | owner, with a signed token | — | 559 bytes |
   | opponent, with a signed token | — | **REFUSED** |

   The control row is the one that matters: a door shut for everybody is not
   access control. `npm run check:gate` runs this every time, and `/proof`
   probes it live from the browser.

   Locally that gate is a process on this machine, and a judge has only my
   word that it is the one I say it is, so `/proof` reports enforcement and
   attestation as two separate rows and, on this stack, only the second says
   NO. **On devnet a TEE replaces that word with evidence.** With the program
   deployed there and `devnet-tee.magicblock.app` as the rollup (2026-09-13):

   - `EXPO_PUBLIC_CLUSTER=devnet npm run prove:privacy` refused the opponent's
     position mid-round, with or without a signed token, while the owner read
     their own; after settlement the position and the tape were public.
   - A delegated match with nothing else done: the TEE served each owner only
     their own position and refused both to an anonymous reader.
   - `npx tsx scripts/check-tee.mts` verified the endpoint's Intel TDX quote
     against Intel's collateral, report data matching a fresh challenge.

   An earlier version of this README said the read gate was unproved and that
   the local stack had none. That was wrong: the stack ships one, and it
   works.

2. **The price feed is cranked, not an oracle.** One `PriceFeed` account per
   player's market, posted from the live market API by the players' own clients
   and rate-limited on chain. It is deliberately *not* a public DEX swap — a
   public swap print mid-round would hand the opponent the fills the fog exists
   to hide. A player who hides or closes their tab cannot freeze the price their
   PnL settles at: if either feed goes 15 s without a post, the other player's
   client posts that market's live price too. A production build should read
   Pyth/Switchboard.
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
5. **Deployed to devnet, and hosted.** The program is on devnet
   at the same id, `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1` (deploy
   `F6tajCiL…`, slot 497,500,594, 2026-09-13 02:46 UTC). The public faucets
   refused airdrops throughout the build; MagicBlock's devnet RPC
   (`rpc.magicblock.app/devnet`) granted them. `EXPO_PUBLIC_CLUSTER=devnet
   npm run verify:client` plays a full match against it and the devnet TEE:
   sealed, delegated, filled on the TEE, committed back, settled, and the
   client's PnL agreeing with the chain (CLIENT OK, 02:51 UTC). A devnet build
   is hosted at https://masked-eight.vercel.app (frontend on Vercel, market proxy on
   Railway; `npm run export:host` builds it).
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
7. **VRF resolves on devnet, not on the local stack.** `request_market_draw`
   builds a real request with the official SDK and the VRF program accepts it
   on both clusters (`npm run check:vrf`). **On devnet it is fulfilled:** on
   `DEFAULT_QUEUE` (`Cuj97ggr…`) the oracle answered within a second in both
   runs (requests `5c2gsE7H…` and `2BSAMqwx…`, 2026-09-13 02:50–02:51 UTC),
   and `settle_market_draw`, guarded by `#[vrf_callback]`, recorded the chosen
   market and its randomness. A first devnet run on the SDK's test queue
   (`GKE6d7iv…`) was never answered, which is why the script now picks
   `DEFAULT_QUEUE` on devnet. **Locally no oracle answers**, checked rather
   than assumed:

   - The queue this validator preloads (`GKE6d7iv…`) is a 9500-byte account
     owned by the VRF program, dumped from devnet.
   - It does not list the repo's `.keys/vrf-oracle.json` (`5DBVUoQ3…`), and
     that key is not `VRF_PROGRAM_IDENTITY` either.
   - Registering our own oracle needs `modify_oracles` /
     `initialize_oracle_queue`. `ephemeral-vrf-sdk` 0.17 exports only the
     *request* builders — `create_request_randomness_ix` and its variants — so
     neither the account layout nor the queue's admin authority is available
     to us.

   **Nothing simulates a draw**, and the BLIND DRAFT mode that would consume
   one stays a `SOON` tile: the stack a judge runs locally cannot resolve
   one, and no devnet build is hosted.

---

## Layout

```
chain/                  Anchor workspace
  programs/fogduel/     the program (22 instructions)
  tests/fogduel.ts      lifecycle: escrow, book, impact, rake, settlement, tape
  tests/er-privacy.ts   rollup delegation + commit tests (2 pending: the TEE path)
  tests/permission.ts   ACL creation, delegation, and what each endpoint serves
scripts/localnet.sh     brings up base + rollup + the permission-checking front
server/market-proxy.mjs CORS shim for pump.fun and Jupiter (no secrets)
server/rpc-recorder.mjs records what the app asks the rollup for
src/chain/              typed client, config, PDAs, units, wallet, chain hooks
src/ui/                 pixel UI library + drawn SVG icons and token marks
src/screens/            landing, duel, feed, board, modes, quests, proof, gallery
app/                    expo-router:  /  /play  /proof  /stats  /tape  /tape/<m>
                        /spectate  /spectate/<m>  /health  /gallery
TEST-PLAN.md            every component and flow, with its verified result
PLAN.md                 phase/task status and the full gap list
DEMO.md                 the recording script: shot list, timings, and the
                        prerequisites that bite if you skip them
```

**Program ID (local):** `3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1`

**Licence:** MIT, see [`LICENSE`](LICENSE).
