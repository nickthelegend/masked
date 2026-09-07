# CHANGELOG-ui

Everything I had to interpret while factoring the MASKED visual language into
`src/ui/`, and why. The brief was "factor it, don't redesign it", so each entry
below is either a gap in the sources or a place where two sources disagreed.

Source precedence used throughout, per the brief:
**1.** `ui/tokens.js` → **2.** `ui/platform-notes.md` → **3.** `ui/rn/*.js` → **4.** the app screens.

---

## 0. One missing input

The brief refers to `react-native/App.js`. That file is not in the archive; the
working screens are in **`ui/rn/App.example.js`** (604 lines, same content — it
is the single-file port of `Masked.dc.html`). I refactored that, and it is what
"the app" means everywhere below.

---

## 1. Colors used by the screens that are not in `tokens.js`

`tokens.js` is the source of truth and I did not add to it. The nine blessed
components in `ui/rn/*.js` do, however, hard-code a handful of foreground inks.
Rather than let those become magic strings scattered across screens, `theme.ts`
names them in two small maps — **no new values, each with its provenance in a
comment**:

- `onInk` — `yellow #3a2a00` (PixelButton), `orange #4a2e00`, `cyan #06263a`,
  `purple #2c0a4a`, `green #05270f`, `red #5c0a12` (all TabBar tab inks; `#5c0a12`
  is also the PocketShell d-pad).
- `shade` — `plinthDim #c9971a` (TabBar's inactive DUEL plinth), `led #ff8a90`
  (PocketShell power LED).

`ui/rn/Orb.js` likewise carries its own six-color palette (`#2d3f7d`, `#4f6fd8`,
`#0f6f8c`, `#bff2ff`, `#a06e00`, `#fff3b8`) plus the `#000` at 0.08 used for its
scanline mask. None are in `tokens.js`. The Orb is a self-contained SVG whose
rings only work as a set, so these are ported verbatim and kept local to
`Orb.tsx` and `ScanlineOverlay.tsx` rather than promoted into the palette.

Colors that appear **only** in the app file and nowhere in tokens or the blessed
components were mapped to the nearest token:

| App value | Where | Mapped to | Reasoning |
|---|---|---|---|
| `#3b4a86` | loser mask ring, fogged panel border | `color.panelLight` | Same muted mid-blue role; the only "recessed blue" token. |
| `#5f74bd` | the `████` fog blocks | `color.textFaint` | Its stated role is decoration, which is exactly `textFaint`. |
| `#8e9dd4` | podium #2 plate | `color.textFaint` | Nearest silver-blue. |
| `#c9713d` / `#2b1200` | podium #3 plate + its ink | `color.sand` / `color.ink` | `sand` is the palette's bronze. |
| `#7a3fd4` | SWAP rail tile | `color.purple` | The palette's only purple. Ink is `onInk.purple` — see §4. |
| `#26306a` | live chart baseline | `color.panel` | Sits between `panel` and `panelLight`; `panel` keeps the rule at zero cost. |
| `#d5ffe4` / `#7f91d1` | mode tile descriptions | `color.text` / `color.textDim` | Same two emphasis levels the type table already defines. |
| `#7dffab` | LIVE tag text | `color.green` on `color.ink` | 6.5:1, and it reuses the Badge `live` tone. |
| `#9fb0e8` (`C.dim`) | ubiquitous | `color.textDim` | `tokens.js` has no `#9fb0e8`; `textDim` is the role it was standing in for. |
| `#cfe9ff` (waves) / `#fff0a8` (sun) | beach backdrop | `color.foam` / `color.sunset[6]` | Both bands already exist in the sunset/foam token set. |

## 2. Bevel depth 3 is not a token

`ui/rn/App.example.js`'s generic `Bevel` used `borderWidth: 3, borderBottomWidth: 6`
— a depth of **3**, which is not in `bevel` (`sm: 4, md: 6, lg: 7`). The blessed
`ui/rn/PixelPanel.js` defaults to `depth = 6`. I took the blessed component's
value, so feed cards and quest rows sit on a 9px drop edge rather than 6px.
Everything else already used real tokens (mode tiles and tab plinths are
`bevel.sm`, buttons are `bevel.md`).

## 3. Tab label size

`App.example.js` printed the big DUEL label at 8px and the rest at 7px;
`ui/rn/TabBar.js` prints all five at the 7px `tabLabel` role. Source 3 outranks
source 4, so the library uses a uniform 7px.

## 4. Two contrast fixes

`platform-notes.md` states every pairing is ≥ 4.5:1 and that `#3a2a00` is the
only legal ink on yellow. Two places in the app broke that; both are token-only
fixes and I judged the stated rule to outrank the incidental usage:

- **Selected stake plate** — was white on `orange` (~1.9:1). Now `onInk.orange`
  (~8.5:1).
- **SWAP rail tile** — `color.purple` is much lighter than the app's `#7a3fd4`,
  so white would have been ~2.6:1. Uses `onInk.purple`.

## 5. `allowFontScaling`

The notes require it off for "clock, PnL, pot, price". Fixed `lineHeight` means
*any* Press Start 2P text clips when the OS scales it, so `PixelText` turns
scaling **off for all display-face roles** (wordmark, h1, h2, statBig, numeric,
label, tabLabel) and leaves it **on for the Silkscreen roles** (body,
bodySmall). That satisfies the HUD rule strictly while keeping prose accessible.

## 6. `PixelButton` loading state

The brief asks for a loading state; the visual language has no spinner and bans
opacity animation. Loading marches a three-cell block meter (`■` stepping every
220ms) in place of the label, so the button keeps its exact footprint and the
motion stays on the pixel grid. Presses are blocked while it runs.

## 7. `PotPill` is the one rounded chip

Everything else is square. `radius.pill` exists in `tokens.js` but was unused,
and a component named *Pill* asking for it seemed to be its intent. In the app
the pot was bare floating text over the sparkline; as a chip it reads as an
object sitting on the chart. This is the one deliberate visual addition.

## 8. Components not in the brief

- **`BeachBackdrop`** — the animated sunset behind the shell. Refactoring the
  app required it, and leaving it inline would have broken the "no style
  literals in screens" rule.
- **`series.ts` / `format.ts`** — `linePath`, `walk`, `toEnd`, `mulberry32`,
  `bounds`, `pct`, `money`, `mmss`, `signColor`. Helpers, not components, so
  they are plain modules.
- **`AppHeader`** — screen chrome (reset, balance, wordmark, menu). It lives in
  `src/screens/`, not the library, because it is specific to this app shell.

## 9. `MaskAvatar` prop name

`ui/rn/MaskAvatar.js` calls the ring color `ring`; `App.example.js` called it
`color`. Kept `ring` — the library component is the public contract. Added an
optional `glyphSize`, since the app used ratios from 0.34 to 0.37 of the plate
and the component hard-coded 0.34.

## 10. Loser PnL stays red even when positive

In the feed, `$WIF` shows the loser at `+0.44%` in red. That is the app's own
behaviour: red marks *who lost*, not the sign. Preserved deliberately —
`MatchCard` takes pre-formatted strings and tones them by outcome. Use
`PnLReadout` with `signed` where sign-coloring is what you want.

---

# Defects found and fixed

Four real bugs surfaced while porting. All four are verified in a browser
against the running app.

### 1. Settlement could pay the pot twice

`App.example.js` called `settle()` **inside a `setLeft` state updater**. React
may replay an updater, and does so routinely under StrictMode, which would run
the whole settlement — including `setBal(b => b + pot)` — more than once.
`useDuel` moves settlement into an effect keyed on `secondsLeft === 0` and
guards it with a ref, so the credit is idempotent.

### 2. The reveal chart reshuffled every second

`Reveal` called `toEnd(...)` during render, and `toEnd` uses `Math.random`. The
opponent's curve was redrawn differently on every tick. `RevealScreen` now
memoises it and seeds it from the stated PnL via `mulberry32`, so the curve is
stable and reproducible. (`toEnd` already landed exactly on its endpoint — the
`(1 - f)` damping term — and `scripts/check-series.mjs` now proves that across
30 cases, along with the shared-scale ordering.)

### 3. `FogOverlay` did not conceal

At `cover: 0.82` the fogged fills were still readable through the curtain,
which defeats its only purpose. Raised to `0.94`, and the caption moved from
`textFaint` to `textDim` so the label reads against the heavier wash.

### 4. The ticker ran blank, then overflowed the header

The marquee translated a fixed 900px regardless of the text's width, so the
strip ran empty for most of its cycle. `Ticker` now measures one copy of the
line and travels exactly that far. Two follow-on fixes in the same component:
the strip is absolutely positioned with an explicit width so a line longer than
the shell cannot wrap to a second row and spill over the header, and each copy
keeps `numberOfLines={1}` so it never ellipsises.

### Also hardened

- `linePath` returned `NaN` coordinates for a series of fewer than two points.
  The app guarded at each call site (`series.length > 1 ? series : [100, 100]`);
  the guard now lives in the function.
- The round interval was re-created every second, because its effect depended on
  `realized` and `unreal`. It now reads current PnL through a ref and is created
  once per round.

---

# Verification

`npm run check` runs three gates, all green:

- `tsc --noEmit` — strict, no `any`, no unused locals.
- `scripts/check-tokens.mjs` — 61 token values diffed against `ui/tokens.js`.
- `scripts/check-series.mjs` — 30 `toEnd` cases land exactly on their stated
  PnL; seeded curves are stable; the winner draws above the loser on a shared
  scale; no `NaN` paths from degenerate input.

The duel loop was walked in the browser: stake deducts at match start, LONG
opens and CLOSE realizes, the price walks each second, the opponent stays fogged
with only a fill count, an open position produces a `SETTLE` fill at the buzzer,
and a win credits exactly `stake × 2 × 0.98` ($9.80 on a $5 stake) while a loss
credits nothing.

## Known caveat: glyph coverage

`⚔` (U+2694, the DUEL tab) is not in Press Start 2P, so it falls back to a
system face — an emoji on iOS, a generic glyph on web. This is inherited from
the sources, which list `⚔` among the sanctioned glyphs, so I left it. `≡` in
the header has the same issue. If either fallback is unacceptable on device,
swap them for covered glyphs from `GLYPH` (`◆`, `▦`) — one-line changes in
`TabBar.tsx` and `AppHeader.tsx`.

---

# Round 2 — landing page and routing

## 11. `Landing.dc.html` was never in the archive

`ui/README.md` lists "Web reference implementations: `Masked.dc.html` (app) and
`Landing.dc.html` (marketing)". Neither file is in `ui.zip`. The landing page is
therefore built from the supplied screenshot plus the house language rather
than ported from that file — if it turns up, the page is a starting point to
reconcile against, not a replacement for it.

Read from the screenshot: a nav with the MASKED lockup top-left, the pocket
shell as the hero subject, and the beach as a full-bleed ground. The
chromatic-split treatment on the wordmark is from the same shot.

## 12. Routing

Moved to **expo-router** so `/` and `/play` are real, linkable URLs with working
browser history — the brief described them as pages, not as app states. The
gallery gained `/gallery`, which replaces the old `?gallery` query param and the
in-app dev toggle. Route files in `app/` are thin; every screen still lives in
`src/screens/`.

## 13. Hero copy needs a panel, not the sunset

First render put the hero headline and body straight onto the sunset bands.
`color.text` on `#f0803c` is roughly 2:1 — far under the 4.5:1 the platform
notes require, and the notes list text pairings only for `panel` / `screen`
grounds. The copy now sits on a `PixelPanel`. This is the general rule the
sources imply: **the sunset is a ground for the device, not for type.**

## 14. Landing headline size

The largest display role is `statBig` at 20px. The hero uses `statBig` at 20 on
narrow screens and **26 on wide ones**. That is above anything in the type
table; `PixelText` supports the override and derives an even `lineHeight`, and
a hero line at 20px on a 1100px column reads as body copy rather than a
headline. Flagged because it is the one place a size outside the table ships.

## 15. Landing stats are demo figures

`LANDING_STATS` (38 live fogs, $12.4K paid out, 1204 duels) are invented, in
the same spirit as the existing fake feed, board and handles. They read as
platform metrics, so they must be replaced with real numbers before this page
goes in front of anyone.

## 16. `BeachBackdrop` was only correct at one height — fixed

The original pinned every band to a fixed pixel offset (sky at 0/50/110/190…,
horizon 452, sea 498, sand 642) drawn against a 700px screen. At any other
height the horizon stranded mid-page — visible as soon as the app was opened in
a desktop window, and worse behind a full-bleed hero. Offsets are now design
units scaled to the measured height, so the composition holds at any size. This
also changes the running app on tall screens, for the better: the sea and sand
now meet the bottom of the viewport instead of floating.

## 17. New component: `Wordmark`

`platform-notes.md` lists the `wordmark` role as used in "MASKED lockup,
top-left of shell and **landing nav**", but no component existed for it. Added
one: masked plate plus wordmark, with an optional magenta/cyan chromatic split.
It is the only place the two brightest accents are used as an effect rather
than as meaning, which is why it is opt-out via `glitch={false}`.

## 18. "HOW IT WORKS" scrolls

The secondary hero CTA scrolls to the explainer section rather than routing to
`/play`, so the label means what it says.

## 19. Market discovery

Nine components for choosing and showing what a duel is fought over, all fed by
live pump.fun and Jupiter data rather than a fixture list.

- `TokenLogo` — a market's logo. Roughly a quarter of pump.fun's image URLs are
  dead at their CDN, so a broken image is the normal case: it falls back to a
  colour tile keyed off the mint, so a given coin always looks the same. SOL and
  USDC are drawn instead of fetched, because neither feed carries a logo for
  them.
- `PixelArt` — a bitmap with a palette, for marks that cannot be one ink.
  `PixelIcon` still handles single-colour UI glyphs.
- `SolanaMark`, `UsdcMark`, `PumpMark` — brand marks on the same lattice as
  every other icon, in the brands' own colours.
- `MarketRow` — one market: logo, ticker, name, price, cap. The whole row is
  the target, because picking a market is a selection and not an action.
- `MarketTabs` — a segmented control for splitting one list. Deliberately looks
  like less than `TabBar`, which is the app's navigation.
- `MarketPicker` — the list, with all four states it will really be in:
  loading, empty, failed (showing the upstream's own words) and listed.
- `MarketHeader` — what the live round is over, with the feed named.
- `SourceBadge` — where a price came from, because a claim needs an attribution.
- `WalletPicker` — which wallet to connect with. The connect button used to
  select the first one outright, which is fine with one wallet and silently
  wrong with two.
