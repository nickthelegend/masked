# DEMO — the recording script

A rehearsed, timed shot list. Every command and every click path below was
walked end to end against the running product on **2026-09-07** and the timings
are measured, not estimated.

**Target: one take, under 3 minutes.**

> **What this file is for.** The submission needs a demo video. I can drive the
> product and verify every beat, but I cannot screen-record or upload — so this
> is the recording reduced to something a person can execute in one pass without
> improvising. Follow it top to bottom.

---

## Before you hit record

Four things, in this order. The third is the one people forget.

```bash
# 1. all five layers up
./scripts/localnet.sh          # base :8999, rollup :7799, gate :6699
npm run proxy                  # market CORS shim :8791
npm run web                    # app :8081        (or serve the export, below)

# 2. the chain must not look empty
npm run crank                  # settle anything abandoned; otherwise /proof
                               # shows duels frozen at 0:00 under LIVE RIGHT NOW

# 3. *** the gate needs something to probe ***
npm run hold -- 900            # opens a real sealed duel and holds it live
```

**Why #3 matters.** With no live delegated position, `/proof` reports
`read gate: no delegated position to probe` — honest, but it is not the shot.
With a held duel it reports `read gate: YES — sealed position refused, control
served`, which is the whole argument. `hold` seals a real match and leaves it
running for 900s, which is longer than the recording.

```bash
# 4. optional — record against the production build a judge would open
npx expo export -p web && npx serve -s dist -l 4173
```

Verified: the static export connects a wallet, escrows a real match and reads
live chain state, identically to the dev server.

### Two wallets, for the duel shot

The duel needs two players. Open the app on **two different origins** — browsers
key `localStorage` per origin, so each gets its own in-page wallet:

| | Session A | Session B |
|---|---|---|
| URL | `http://localhost:8081/play` | `http://127.0.0.1:8081/play` |

Connect each (CONNECT → LOCAL KEY (DEV)), then fund the second:

```bash
solana airdrop 5 <session-B pubkey> --url http://127.0.0.1:8999
```

The pubkey is shown in the header. Both sessions need SOL before you record.

---

## Shot 1 — `/proof`, establish it is real · 45s

Open `/proof`. Do not scroll fast; each panel is a claim.

1. **CLUSTER** — read the two rows out loud, they are the honest claim:
   - `read gate: YES — sealed position refused, control served`
   - `gate attested: NO — not a TEE`
   > "Enforcement is real. Attestation is what needs the TEE, and I'll say so."
2. **LIVE RIGHT NOW** — real duels in progress, each linking into `/spectate`.
3. **ACCESS CONTROL LISTS** — the permission accounts of the most recent duel,
   owned by `DELeGG…`.
4. **THE LIFE OF ONE DUEL** — scroll here and slow down. Every base-layer
   transaction touching either position, oldest first: JOIN MATCH, CREATE
   POSITION PERMISSION ×2, DELEGATE POSITION PERMISSION ×2, DELEGATE POSITION
   TO ER ×2, PROCESS UNDELEGATION ×2, SETTLE MATCH.
   **Click one row** — it opens the real Solana explorer pointed at this cluster.
   > "The delegation story as signatures, not as a claim. The doubled steps are
   > real: one per position, because two don't fit in a 1232-byte transaction."
5. **WHAT ONE DUEL COSTS** — 10 transactions, 0.000535 SOL, 0.267% of the pot.
   Summed from the very transactions listed above it, not a fee table.
6. **RUN THIS YOURSELF** — eight commands, each saying what it proves, each one
   tap to copy. Say that everything on the page is reproducible from a clean
   checkout.
7. No wallet is connected for any of this. Say that.

---

## Shot 2 — the privacy proof · 45s

Split screen: `/proof` still on the left, a terminal on the right.

```bash
npm run check:gate      # 7 seconds, measured
```

Let the table land and hold on it:

```
account                        validator :7799    public :6699
──────────────────────────────────────────────────────────────
A  sealed   creator position   543 bytes          REFUSED
A  sealed   joiner  position   543 bytes          REFUSED
B  bare     creator position   543 bytes          543 bytes
B  bare     joiner  position   543 bytes          543 bytes
```

> "Row three is the one that matters. Same account shape, no permission —
> served. A door shut for everybody isn't access control."

Then the token rows underneath: the owner's signed token opens their own
position and is refused the opponent's.

**If you have another 30 seconds**, `npm run prove:privacy` walks a whole match
and prints visibility at each stage (31s, measured). Otherwise skip it —
`check:gate` is the tighter shot.

---

## Shot 3 — play one · 75s

Two browsers side by side, both already connected and funded.

1. **A: FIND MATCH → OPEN A MATCH.** Balance drops by the entry — point at it.
2. **B: FIND MATCH.** A's match is in the OPEN BOOK. **JOIN it.**
   > "Joining seals it: two ACLs created on chain and delegated before either
   > position is."
   Both screens show **SEALED · ACL ON CHAIN** — read back from chain, not a
   local flag. Each shows the opponent as **FOGGED**, with a fill count and
   nothing else.
3. **Point at the SESSION KEY badge.** It appears once the round is sealed.
   > "One signature for the whole round. The player signed once to mint a Gum
   > session token; a throwaway key signs each fill on their behalf, bounded to
   > an hour and scoped to this program. It can fill and it can do nothing
   > else."
   If you have a terminal free, `npm run check:session` proves it in 15
   assertions — including that a token for one owner cannot move another's book.
4. **Trade at different sizes so the book is visible.**
   Keys work if your hands are already there: **L** long, **C** close.
   - A: **MAX** → the note reads `THAT SIZE COSTS 1.56% IN IMPACT`. LONG.
     The receipt shows the mark and what you actually filled at.
   - B: **1/4** → `0.39%`. LONG.
   > "That quote is exact, not an estimate — the chain charges 1.56%."
5. **Let the buzzer go.** Rounds are 60s by default.
   **SETTLING ON SOLANA** shows three real stages: the commit reports how many
   rollup transactions it took, undelegation reports both positions home,
   settle reports the pot paid.
6. **The reveal, on both screens at once.** They mirror: A's "you" is B's
   "opponent" to the basis point. The **ROUND TIMELINE** draws both players'
   real fills on one axis, replayed from the tape the program just wrote.
   The head-to-head record and what the market itself did sit underneath.

**Timing note:** the round is 60s and the two settle paths take ~20s more.
Do not narrate over the buzzer — let the settle stages play.

---

## Shot 4 — the permanent record · 20s

On the reveal, press **COPY TAPE LINK**, then open `/tape/<match>`.

> "Same duel, permanent URL, no wallet. Every fill of both players — side, size,
> the price it executed at, the second it landed. Paid plus rake equals the pot,
> in public."

---

## Shot 5 — close on the line · 15s

> "Every other 1v1 trading product on Solana is public during the fight. This
> one is private during the fight and public after. The gate enforces that
> today; a TEE is what makes you not have to take my word for it — and `/proof`
> tells you which is which."

---

## Stalls that will bite you

Each of these was hit while rehearsing.

| Stall | Fix |
|---|---|
| `/proof` says `read gate: no delegated position to probe` | You skipped `npm run hold`. It needs a live sealed duel. |
| The open book shows **STALE** instead of **JOIN** | A match older than 300s (`MAX_OPEN_AGE`) can't be joined — its seeded price is out of date. Open the match immediately before shooting. |
| LIVE RIGHT NOW lists duels frozen at 0:00 | Abandoned matches. `npm run crank`. |
| Market list empty or "MARKET FEED DOWN" | The proxy on :8791 is not running. `npm run proxy`. |
| Prices are cold on first load | Give the lobby ~10s before recording; the first pump.fun fetch is the slow one. |
| Both browsers show the same wallet | You used one origin twice. `localhost` and `127.0.0.1` are different origins — that is the whole trick. |

---

## What not to claim on camera

- Do **not** say positions are private "on a TEE" as though this is one. It
  isn't. Say the gate enforces the ACL and attestation is missing.
- Do **not** imply fills route to pump.fun or Jupiter. Those feeds *price* the
  round; each fill executes against that player's own book, deliberately.
- Do **not** show VRF as working. It is requested on chain and never fulfilled.
- Do **not** claim a devnet deployment. The program ID on screen is local.
