# 100 ideas, ranked

For **MagicBlock Solana Blitz v8**. The pitch is: *private during the fight,
public after* — two traders stake a pot, trade the same market with their
positions delegated to an Ephemeral Rollup and sealed by an on-chain ACL, and
settle on Solana at the buzzer.

Ranked by **impact × feasibility × fit**. Impact is "would a judge notice";
feasibility is "can this be built for real, here, now"; fit is "does it
strengthen *this* pitch or just add surface". Ideas already built are excluded.

The biggest single gap: the submission form says **VRF — not attempted**, and
the local stack preloads the VRF program (`Vrf1RNUj…`) and ships a `vrf-oracle`
binary. That is a whole MagicBlock primitive sitting unused, and it is the
first thing on this list.

---

## Tier 1 — build first

| # | Idea | Why it ranks here |
|---|---|---|
| 1 | **VRF-drawn market**: the round's market is picked on chain by MagicBlock VRF from a shortlist, so neither player chooses it | Third MagicBlock primitive, turns "not attempted" into "used". Verifiable on chain. |
| 2 | **Session keys** so fills don't prompt the wallet every time | The single biggest UX flaw on camera: every LONG is a signature. Uses another MagicBlock program. |
| 3 | **Spectator mode** — watch a live duel from public data only, opponent fogged for the viewer too | Lets a judge see the product without a wallet. Proves the fog from outside. |
| 4 | **Rematch that works** — the button exists and does nothing real | A dead button in a demo is worse than no button. |
| 5 | **BLIND DRAFT as a second live mode** — VRF picks 3 markets, each player privately picks one | Makes the mode grid honest, and is the natural showcase for #1. |
| 6 | **Live duel list on `/proof`** with a link into spectating each | Turns the evidence page into something interactive. |
| 7 | **Round timeline on the reveal** — every fill of both players on one shared time axis | The "reveal" is the emotional beat and currently it is two numbers. |
| 8 | **Fill flash + impact readout** — pressing LONG shows what the book actually charged you | Makes the private AMM legible instead of invisible. |
| 9 | **Settlement progress** — commit, undelegate, settle shown as real stages with real signatures | Turns 20 seconds of dead air into the most MagicBlock-looking moment in the app. |
| 10 | **Sound**: buzzer, fill, reveal | Nothing else in the room will have it. Cheap, memorable. |

## Tier 2 — strong, build after

| # | Idea | Note |
|---|---|---|
| 11 | Shareable reveal card at a permanent URL (`/tape/<match>`) | Judges can be sent a link. |
| 12 | Head-to-head record between two wallets, on chain | Rivalry is the loop. |
| 13 | `/proof` shows the actual delegation transaction signatures, clickable | Evidence, not assertion. |
| 14 | Mark sparkline on every market row in the picker | Makes the picker feel alive. |
| 15 | "What you would have made" — counterfactual PnL if you had done nothing | A real trading insight, cheap to compute from the tape. |
| 16 | Opponent's fill *count* animating live as a heartbeat | The one thing the fog does leak, made into drama. |
| 17 | Keyboard controls (L to long, C to close, space to settle) | Demo speed. |
| 18 | Round-over-round streak visual on the leaderboard | Uses `best_streak`, already on chain. |
| 19 | Auto-settle any expired match the app notices, not just your own | Turns the crank into a product behaviour. |
| 20 | Market search / filter in the picker | 12 rows now; a real list needs it. |
| 21 | Per-market all-time stats (duels, volume, biggest pot) | Real aggregate over tapes. |
| 22 | `/proof` "run this yourself" — the exact commands, copyable | Judges verify in five commands. |
| 23 | Position-size control (quarter / half / max) rather than a fixed fraction | Makes the book matter. |
| 24 | Slippage preview before a fill lands | Shows the curve is real. |
| 25 | Live mark ticking with a direction flash green/red | Cheap motion, high legibility. |
| 26 | Reveal curtain that tears rather than fades | Signature moment. |
| 27 | Match invite links — open a match and send someone the URL | Makes 1v1 actually playable with a judge. |
| 28 | Wallet balance change animation on settle | Money moving is the point. |
| 29 | Explorer links on every signature in the tx feed | Standard, missing. |
| 30 | Honest "what this costs" panel — real fees paid per round | Nobody else will show this. |

## Tier 3 — good, opportunistic

| # | Idea |
|---|---|
| 31 | Persisted per-wallet settings (last market, last stake) |
| 32 | Reduced-motion support honoured across new animations |
| 33 | Round history for the connected wallet, paginated |
| 34 | Copy-trade button that opens a match on the same market |
| 35 | "Fade winner" that actually opens a match against them |
| 36 | Toast stacking with a queue rather than overlap |
| 37 | Idle-state attract mode on the landing hero |
| 38 | Market cap / volume sort toggle in the picker |
| 39 | Loading skeletons that match final layout, not spinners |
| 40 | Error boundary per screen rather than one global |
| 41 | Offline detection and a real banner |
| 42 | Retry-with-backoff on every chain read |
| 43 | A `/stats` route: protocol-wide numbers from chain |
| 44 | Treasury balance and rake taken, shown honestly |
| 45 | Position PnL sparkline during the round, not just price |
| 46 | Confetti/pixel-burst on a win, restrained |
| 47 | Chart crosshair with the mark at that moment |
| 48 | Tape row expands to show every fill |
| 49 | Relative time that updates without a reload |
| 50 | Deep-link straight into a market: `/play?market=<mint>` |
| 51 | Wallet disconnect confirmation when mid-round |
| 52 | Warn before navigating away from a live round |
| 53 | Sound toggle, persisted |
| 54 | Colour-blind-safe win/loss palette option |
| 55 | Focus rings and full keyboard navigation |
| 56 | `aria-live` on the clock and PnL |
| 57 | Match duration choice (60s / 5m) at open time |
| 58 | Stake presets driven by wallet balance |
| 59 | "Insufficient balance" that offers the max affordable stake |
| 60 | Show the rake explicitly in the pot pill |

## Tier 4 — real but lower priority

| # | Idea |
|---|---|
| 61 | 2v2 Squad Fog (team ACL, pot 200, split 50/50) |
| 62 | Chicken mode (first seller pays a penalty) |
| 63 | Hot Potato mode (empty-handed at buzzer loses) |
| 64 | Sudden Reveal mode (fog for 4m, public for 60s) |
| 65 | Copy Ban mode (see that they traded, not what) |
| 66 | Ghost Royale (multi-player, bottom cut) |
| 67 | Thesis Fight (commit a hashed thesis, reveal with the tape) |
| 68 | Assassination (beat a marked wallet) |
| 69 | Hold the Line (early exit pays the table) |
| 70 | Fade Me (opponent must take the opposite side) |
| 71 | Tournament bracket over several rounds |
| 72 | ELO-style rating from on-chain results |
| 73 | Daily leaderboard reset with a real window |
| 74 | Achievements as on-chain flags |
| 75 | Referral attribution on chain |
| 76 | Pyth integration for majors settlement |
| 77 | Switchboard as a second oracle |
| 78 | Jupiter quote shown beside the private book's price |
| 79 | Token metadata from Metaplex for logos |
| 80 | Priority-fee awareness on congested clusters |
| 81 | Address lookup tables to shrink transactions |
| 82 | Compressed accounts for tapes |
| 83 | Websocket subscriptions instead of polling |
| 84 | Optimistic UI on fills with rollback |
| 85 | Multi-region rollup selection (us/eu/as validators) |
| 86 | Mobile-native build via Expo |
| 87 | Mobile Wallet Adapter for native |
| 88 | PWA install + offline shell |
| 89 | Screenshot/GIF export of a reveal |
| 90 | OG image generation per tape |
| 91 | Twitter intent with the reveal card |
| 92 | Embeddable duel widget |
| 93 | Public API for tapes |
| 94 | Webhook on settlement |
| 95 | Discord bot posting reveals |
| 96 | i18n scaffolding |
| 97 | Analytics that respect privacy |
| 98 | Load test / soak script for the rollup |
| 99 | Fuzz tests on the book maths |
| 100 | Formal invariant tests (pot conservation, rake exactness) |

---

## Deliberately not doing

- **Anything that fakes a MagicBlock primitive.** If VRF cannot be made to work
  for real, it stays "not attempted" rather than being simulated.
- **Devnet deploy / demo video.** Blocked on faucet funding, which no amount of
  code fixes.
- **Ten variations of one idea to reach 100.** Tier 4 is genuinely lower
  priority, and several of those modes would clutter the pitch rather than
  strengthen it — a grid of half-built modes reads worse than one that works.

## Build log

Filled in as each is built and verified.
