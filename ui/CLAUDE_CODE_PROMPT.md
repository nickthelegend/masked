# Prompt for Claude Code — generate the MASKED styled-component layer

Copy everything below the line into Claude Code, with this repo (or the `ui/` folder + `react-native/App.js`) open.

---

You are building the reusable styled-component layer for **MASKED**, an 8-bit Solana PvP trading app
(1v1 "Fog Duel": two traders stake a pot, trade one token for five minutes with positions hidden, then the
tape reveals and the winner takes the pot). The visual language already exists in this repo and is
non-negotiable — your job is to factor it into a clean, typed, reusable component library, not to redesign it.

## Sources of truth (read these first, in this order)
1. `ui/tokens.js` — every color, type role, spacing, bevel depth. Never introduce a value that is not here.
2. `ui/platform-notes.md` — Expo font setup, the type-role table, the bevel primitive, Orb docs, screen geometry.
3. `ui/rn/*.js` — nine hand-built components that define the house style (PixelButton, PixelPanel, MaskAvatar,
   StatTile, Orb, TapeChart, TabBar, Ticker, PocketShell).
4. `react-native/App.js` — the full working app screens: Feed, Leaderboard, Duel lobby, Matchmaking, Live
   (fogged) round, Reveal, Modes, Quests.

## What to build
A single library at `src/ui/` for **React Native (Expo)**, TypeScript, exporting styled primitives plus the
composite pieces the screens need. Keep every existing component's public prop names; extend, don't rename.

Primitives: `Box`, `Stack` / `Row` (gap-based, no margin spacing), `PixelText` (variant = the type roles:
wordmark | h1 | h2 | statBig | numeric | label | tabLabel | body | bodySmall), `PixelPanel`, `PixelButton`
(tone = primary | danger | gold | quiet | info; states: default, pressed, disabled, loading), `IconPlate`
(colored square glyph tile used by tabs and store badges), `Badge` / `Tag`, `ProgressBar` (quest bars),
`Divider`, `ScanlineOverlay`, `FogOverlay` (animated scanline curtain for hidden state).

Composites: `MaskAvatar`, `StatTile`, `Orb`, `TapeChart`, `Ticker`, `TabBar`, `PocketShell`, `MatchCard`
(feed reveal card: two masked avatars, winner/loser PnL, sparkline, COPY / FADE / CHALLENGE row),
`LeaderRow`, `Podium`, `ModeTile` (LIVE vs SOON), `QuestRow`, `FillTape` (hidden-until-reveal fill list),
`PnLReadout`, `PotPill`, `RoundClock`, `StakePicker`.

## Hard rules — this is what makes it look right
- **Bevels, never shadows.** Hard 3px ink border with a heavier bottom border (`bevelBox`). No `shadowColor`,
  no `elevation`, no gradients except the two already in tokens (shell body, CTA card).
- **Press = push into the bevel**: bottom border 3px + `translateY: 4`. No opacity or spring animation.
- **Pixel fonts only**, family strings `'PressStart2P_400Regular'` and `'Silkscreen_400Regular'`. Never set
  `fontWeight`. Always set `lineHeight`. `tabLabel` (7px) is the absolute floor.
- **Sizes are multiples of 2**; radii come from `radius`; gaps from `space`. Layout with flex + `gap`, never
  margins between siblings.
- `allowFontScaling={false}` on numeric HUD text (clock, PnL, pot, price).
- Hit targets ≥ 44px.
- Two-series charts must share one `lo`/`hi` scale, and any synthesized opponent curve must land exactly on
  its stated final PnL (see `toEnd` in `react-native/App.js`) — the chart must never contradict the scoreboard.
- No new colors, no emoji, no icon fonts. Glyphs are geometric unicode (▤ ▲ ⚔ ▦ ✓ ◆ ● ■ ▶ ✕) on `IconPlate`.

## Deliverables
1. `src/ui/` with one file per component, `theme.ts` (tokens re-exported + `text` styles + `bevelBox`),
   and a barrel `index.ts`. Full TS prop types, sensible defaults, no `any`.
2. `src/ui/README.md`: import snippet per component with a copy-paste example.
3. An Expo Storybook-style gallery screen `src/screens/UIGallery.tsx` rendering every component in every
   state on the app's dark navy ground.
4. Refactor `react-native/App.js` → `src/screens/*` so every screen consumes only library components, with
   zero inline style literals left except one-off layout (flex/gap/width).
5. A `CHANGELOG-ui.md` noting anything you had to interpret, with the reasoning.

## Behavior to preserve while refactoring
Duel loop: stake → matchmaking → 5:00 live round (LONG opens, CLOSE realizes, price walks each second,
opponent fogged with fill count only) → at 0:00 an open position settles into realized PnL → reveal compares
your PnL vs opponent's, credits `stake × 2 × 0.98` on a win, appends a SETTLE fill, and offers REMATCH /
FADE WINNER / POST TO FEED.

Work in small commits, one component per commit, and run the gallery after each to check nothing regressed.
