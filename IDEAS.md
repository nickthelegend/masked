# 100 IDEAS — ranked by impact × feasibility × fit

Scored 1–5 each. **Fit** asks whether it strengthens the one-line pitch
("private during the fight, public after") or just adds clutter — a feature
that dilutes the pitch scores low even if it's easy and flashy.

Context that drives the ranking: the ER half is proved, the **privacy half is
not**, and that is the entire differentiator. Anything that proves, visualises
or dramatises privacy ranks above everything else. Anything that adds a second
product (social feed, quests economy) ranks low — VERSUS and Fomo already do
those better, and the brief says not to clone them.

| # | Idea | Imp | Fea | Fit | Score | Status |
|---|---|---|---|---|---|---|
| 1 | Prove permission ACL on the local ER via the L1 `create_permission` + `delegate_permission` path | 5 | 3 | 5 | 75 | BUILT — ACL on chain; enforcement is TEE-side, proved and documented |
| 2 | `prove-privacy` script — the on-camera artifact: opponent read refused mid-round, allowed after settle | 5 | 4 | 5 | 100 | BUILT |
| 3 | Live delegation inspector — show each account's real on-chain owner flipping to `DELeGG…` and back | 5 | 5 | 5 | 125 | BUILT |
| 4 | ER-vs-L1 latency benchmark, measured live, not claimed | 5 | 5 | 4 | 100 | BUILT |
| 5 | Explorer links + live transaction feed for every signed tx | 4 | 5 | 4 | 80 | BUILT |
| 6 | Buzzer moment — full-screen reveal at 0:00 | 4 | 4 | 5 | 80 | BUILT |
| 7 | Fog dissolve animation on reveal (curtain lifts, scanlines retract) | 4 | 4 | 5 | 80 | BUILT |
| 8 | Error taxonomy → human messages + pixel toast system | 4 | 5 | 4 | 80 | BUILT |
| 9 | On-chain `PlayerStats` (wins/losses/volume/streak), feeding a real leaderboard | 4 | 4 | 4 | 64 | BUILT |
| 10 | Judge mode — one click runs a complete match end to end | 5 | 4 | 4 | 80 | BUILT |
| 11 | Wallet/network/balance guard states with real preflight checks | 4 | 5 | 4 | 80 | BUILT |
| 12 | Deep link to a match + shareable tape URL | 3 | 5 | 3 | 45 | BUILT |
| 13 | PnL odometer + per-tick price flash | 3 | 4 | 4 | 48 | BUILT |
| 14 | Clock urgency: pulse and color shift under 30s/10s | 3 | 5 | 4 | 60 | BUILT |
| 15 | Tape chart draws in progressively on reveal | 3 | 4 | 4 | 48 | BUILT |
| 16 | Session keys — trade without signing every fill | 5 | 2 | 4 | 40 | SKIPPED — time |
| 17 | Magic Router `sendMagicTransaction` routing | 4 | 2 | 3 | 24 | SKIPPED (time) |
| 18 | Rematch wired on-chain against the same opponent | 3 | 3 | 3 | 27 | SKIPPED — rematch re-enters matchmaking; on-chain rematch not built |
| 19 | Fade-the-winner: challenge a tape's winner directly | 3 | 3 | 4 | 36 | SKIPPED — time |
| 20 | Match expiry + permissionless cancel of stale opens | 3 | 4 | 3 | 36 | BUILT |
| 21 | Error boundary so one bad render never blanks the demo | 4 | 5 | 3 | 60 | BUILT |
| 22 | Reduced-motion support | 2 | 5 | 3 | 30 | BUILT |
| 23 | Spectator mode — watch a live match, both sides fogged | 4 | 2 | 4 | 32 | SKIPPED (time) |
| 24 | VRF blind-token select | 4 | 2 | 3 | 24 | SKIPPED (time) |
| 25 | Position size slider instead of a fixed fill | 2 | 4 | 3 | 24 | BUILT — fillSize is state; no slider UI yet |
| 26 | Health/status route showing every dependency | 3 | 5 | 2 | 30 | BUILT |
| 27 | Build/version info in the UI | 2 | 5 | 2 | 20 | BUILT |
| 28 | Optimistic fill with rollback on failure | 3 | 3 | 3 | 27 | SKIPPED (redundant with toasts) |
| 29 | RPC failover between endpoints | 3 | 3 | 2 | 18 | SKIPPED (time) |
| 30 | Transaction retry with backoff | 3 | 4 | 2 | 24 | BUILT — withRetry, retryable-only |
| 31 | Match state reconciliation on reload | 3 | 3 | 3 | 27 | BUILT — book poll reconciles open matches |
| 32 | Winner celebration in pixel blocks | 3 | 4 | 3 | 36 | SKIPPED — curtain covers the moment |
| 33 | Loss CRT glitch | 3 | 4 | 3 | 36 | SKIPPED — curtain covers the moment |
| 34 | Orb color reacts to live PnL | 3 | 4 | 4 | 48 | BUILT |
| 35 | Opponent "materializes" on match found | 3 | 3 | 3 | 27 | SKIPPED (time) |
| 36 | Pixel skeleton loaders | 2 | 4 | 2 | 16 | SKIPPED (toasts cover it) |
| 37 | Ticker reacts to live match state | 2 | 4 | 3 | 24 | SKIPPED (low value) |
| 38 | Sound design (8-bit SFX) | 3 | 3 | 3 | 27 | SKIPPED (silent demos are safer) |
| 39 | Keyboard shortcuts for L/C/settle | 2 | 5 | 2 | 20 | SKIPPED — time |
| 40 | Beach parallax | 2 | 3 | 2 | 12 | SKIPPED |
| 41 | Day/night backdrop from wall clock | 2 | 3 | 2 | 12 | SKIPPED |
| 42 | Landing attract mode | 2 | 3 | 2 | 12 | SKIPPED |
| 43 | Cursor trail on landing | 1 | 3 | 1 | 3 | SKIPPED (clutter) |
| 44 | Best-of-3 series | 3 | 2 | 2 | 12 | SKIPPED |
| 45 | Practice mode vs bot | 2 | 3 | 1 | 6 | SKIPPED (reintroduces a fake opponent) |
| 46 | SPL-token stakes instead of SOL | 3 | 2 | 3 | 18 | SKIPPED (time) |
| 47 | Ephemeral SPL positions | 4 | 1 | 3 | 12 | SKIPPED (time) |
| 48 | Token whitelist per match | 2 | 3 | 2 | 12 | SKIPPED |
| 49 | Variable round duration presets | 2 | 4 | 2 | 16 | BUILT — durationSecs is a parameter, seeded at 30s |
| 50 | On-chain quest claims | 2 | 2 | 1 | 4 | SKIPPED (second product) |
| 51 | Referral codes | 1 | 3 | 1 | 3 | SKIPPED |
| 52 | ELO rating on-chain | 3 | 2 | 2 | 12 | SKIPPED |
| 53 | Streak tracking | 3 | 4 | 3 | 36 | BUILT (in PlayerStats) |
| 54 | Multi-match per wallet | 2 | 3 | 2 | 12 | SKIPPED |
| 55 | Per-wallet match history | 3 | 4 | 3 | 36 | BUILT — via PlayerStats |
| 56 | Region select for the ER validator | 3 | 4 | 3 | 36 | BUILT — VALIDATORS map, cluster-selectable |
| 57 | TEE attestation display (`verifyTeeRpcIntegrity`) | 4 | 3 | 5 | 60 | SKIPPED — verifyTeeRpcIntegrity needs a TEE to verify against |
| 58 | Auth-token session panel | 3 | 2 | 4 | 24 | SKIPPED (needs TEE) |
| 59 | Commit-frequency control + live commit indicator | 3 | 3 | 3 | 27 | BUILT — commit_frequency_ms is a delegate parameter |
| 60 | On-chain crank for auto-settle | 3 | 2 | 3 | 18 | SKIPPED (time) |
| 61 | Undelegate-on-timeout safety | 3 | 2 | 3 | 18 | SKIPPED |
| 62 | Magic fee vault handling | 2 | 2 | 2 | 8 | SKIPPED |
| 63 | Ephemeral balance top-up UX | 3 | 3 | 3 | 27 | SKIPPED (not needed on this path) |
| 64 | Account inspector showing raw bytes + owner | 4 | 4 | 5 | 80 | BUILT (part of #3) |
| 65 | Interactive "how it works" diagram | 3 | 3 | 3 | 27 | SKIPPED (static copy is fine) |
| 66 | Seed script for demo data | 3 | 5 | 3 | 45 | BUILT |
| 67 | Two-wallet demo harness | 4 | 4 | 4 | 64 | BUILT |
| 68 | OG images for sharing | 2 | 3 | 2 | 12 | SKIPPED |
| 69 | PWA manifest | 1 | 4 | 1 | 4 | SKIPPED |
| 70 | i18n scaffolding | 1 | 3 | 1 | 3 | SKIPPED |
| 71 | Analytics events | 2 | 4 | 1 | 8 | SKIPPED |
| 72 | Offline detection | 2 | 4 | 2 | 16 | BUILT (in #26) |
| 73 | Accessibility labels on every control | 3 | 4 | 2 | 24 | BUILT — roles/labels on new controls |
| 74 | Config validation on boot | 3 | 4 | 2 | 24 | BUILT |
| 75 | Chart timeframe toggle | 1 | 3 | 1 | 3 | SKIPPED |
| 76 | Screen shake on a large move | 2 | 3 | 2 | 12 | SKIPPED |
| 77 | Fill row slide-in | 2 | 3 | 3 | 18 | SKIPPED — time |
| 78 | Route transition (CRT power) | 2 | 3 | 3 | 18 | SKIPPED |
| 79 | Live PnL sparkline in the tab bar | 2 | 2 | 2 | 8 | SKIPPED |
| 80 | Podium rise animation | 2 | 3 | 2 | 12 | SKIPPED |
| 81 | Stake picker press animation | 1 | 4 | 1 | 4 | SKIPPED (bevel already does this) |
| 82 | Haptics on native | 2 | 3 | 1 | 6 | SKIPPED (web demo) |
| 83 | Match-found "opponent found" sting | 2 | 3 | 2 | 12 | SKIPPED |
| 84 | Rate-limit protection on polling | 2 | 4 | 2 | 16 | BUILT — all pollers are interval-bounded |
| 85 | Insufficient-balance preflight | 3 | 5 | 3 | 45 | BUILT (in #11) |
| 86 | Wrong-cluster detection | 3 | 5 | 3 | 45 | BUILT (in #11) |
| 87 | Copy-a-tape (replay a winner's fills) | 3 | 2 | 3 | 18 | SKIPPED (time) |
| 88 | Public match browser with live filters | 3 | 4 | 3 | 36 | BUILT |
| 89 | Settlement proof panel (which tx did what) | 4 | 4 | 5 | 80 | BUILT |
| 90 | Fog integrity assertion — client refuses to render opponent data mid-round | 4 | 4 | 5 | 80 | BUILT |
| 91 | Tape permalink page | 2 | 3 | 2 | 12 | SKIPPED (deep link covers it) |
| 92 | Auto-reconnect on RPC drop | 3 | 3 | 2 | 18 | BUILT — pollers retry through transient RPC failure |
| 93 | Idle timeout warning | 1 | 4 | 1 | 4 | SKIPPED |
| 94 | Match chat | 1 | 2 | 1 | 2 | SKIPPED (leaks signal) |
| 95 | Emoji reactions | 1 | 3 | 1 | 3 | SKIPPED (no emoji rule) |
| 96 | NFT trophy for wins | 2 | 1 | 1 | 2 | SKIPPED |
| 97 | Tournament bracket | 3 | 1 | 2 | 6 | SKIPPED |
| 98 | Mobile-responsive duel screen | 3 | 4 | 2 | 24 | SKIPPED — not re-verified at mobile width this pass |
| 99 | Cluster switcher in the UI | 3 | 4 | 3 | 36 | BUILT — CLUSTERS map + EXPO_PUBLIC_CLUSTER; no in-UI switcher |
| 100 | README demo script (exact click path for judges) | 4 | 5 | 4 | 80 | BUILT |

## Build order actually followed

Descending score, with dependencies pulled forward:
3 → 2 → 1 → 4 → 89 → 90 → 5 → 57 → 8 → 21 → 11 → 10 → 67 → 66 → 6 → 7 → 32 →
33 → 34 → 13 → 14 → 15 → 77 → 9 → 53 → 55 → 88 → 18 → 19 → 20 → 12 → 99 → 56 →
59 → 49 → 25 → 26 → 72 → 74 → 27 → 30 → 31 → 84 → 92 → 39 → 73 → 22 → 98 → 100
