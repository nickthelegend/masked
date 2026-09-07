# MASKED UI

The reusable styled-component layer for MASKED. React Native (Expo), TypeScript,
no `any`. Every value comes from `tokens.ts`, which is a typed port of
`ui/tokens.js` — `npm run check:tokens` fails the build if the two ever drift.

```
src/ui/
  tokens.ts     colors, type roles, space, radius, border, bevel
  theme.ts      text.* styles, bevelBox(), pressedBevel(), onInk, shade
  series.ts     linePath / bounds / walk / toEnd / mulberry32
  format.ts     pct / money / mmss / signColor
  <Component>.tsx   one file per component
  index.ts      barrel
```

## Setup

```bash
npx expo install react-native-svg expo-font \
  @expo-google-fonts/press-start-2p @expo-google-fonts/silkscreen
```

Gate render until both faces load, or pixel text reflows on first paint:

```tsx
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { Silkscreen_400Regular } from '@expo-google-fonts/silkscreen';
import { color } from './src/ui';

const [ready] = useFonts({ PressStart2P_400Regular, Silkscreen_400Regular });
if (!ready) return <View style={{ flex: 1, backgroundColor: color.screen }} />;
```

## House rules

| Rule | Where it is enforced |
|---|---|
| Bevels, never shadows | `bevelBox()`. No `shadowColor` / `elevation` anywhere in the library. |
| Press = collapse the drop edge + `translateY: 4` | `pressedBevel()`, `PixelButton`. No opacity fade, no spring. |
| Pixel fonts only, never `fontWeight` | `PixelText` — `fontWeight` is excluded from its `style` type. |
| Always set `lineHeight` | `PixelText` derives one from the role when you override `size`. |
| 7px floor | `PixelText` warns in `__DEV__` below `MIN_FONT_SIZE`. |
| No font scaling on HUD numerics | `PixelText` turns it off for the display face. |
| Gaps, never sibling margins | `Row` / `Stack` expose `gap` and no margin props. |
| Hit targets ≥ 44px | `HIT_SLOP_MIN`, applied by `PixelButton` and `LeaderRow`. |
| Two-series charts share one scale | `TapeChart` computes `bounds()` across both series. |
| A synthesized curve lands on its stated PnL | `toEnd()`, proved by `npm run check:series`. |

---

## Primitives

### Box

The layout atom. Tokens in; a background, an ink outline, and optionally a bevel out.

```tsx
<Box bg={color.chartBg} outline={color.ink} pad={space.md} gap={space.sm} round={radius.tile}>
  <PixelText variant="bodySmall">A recessed well.</PixelText>
</Box>

<Box bg={color.panel} bevel={bevel.md} pad={space.md}>
  <PixelText variant="bodySmall">A surface standing on the ground.</PixelText>
</Box>
```

`bevel` and `outline` are mutually exclusive: `bevel` adds the heavier bottom
drop edge, `outline` is a flat 3px border.

### Row / Stack

Gap-based flex. There is no margin prop, by design.

```tsx
<Row gap={space.sm} justify="space-between">
  <PixelText variant="label">POT DEPOSIT</PixelText>
  <PixelText variant="bodySmall">2% RAKE</PixelText>
</Row>

<Stack gap={space.md} pad={space.lg}>
  <PixelText variant="h2">GAME MODES</PixelText>
</Stack>
```

### PixelText

`variant` is one of the nine type roles: `wordmark | h1 | h2 | statBig |
numeric | label | tabLabel | body | bodySmall`.

```tsx
<PixelText variant="h1" color={color.yellow} align="center">YOU TAKE THE POT</PixelText>
<PixelText variant="numeric" size={14} color={color.green}>+4.12%</PixelText>
<PixelText variant="body">Positions stay hidden until the round ends.</PixelText>
```

Overriding `size` keeps the role's family and scales `lineHeight` with it,
rounded up to an even number. Font scaling is off for the Press Start 2P roles
and on for the Silkscreen body roles, so HUD numbers cannot clip while prose
still respects the user's text-size setting.

### PixelPanel

```tsx
<PixelPanel>…</PixelPanel>                          {/* bevelled surface */}
<PixelPanel accent={color.cyan}>…</PixelPanel>      {/* colored outline */}
<PixelPanel flat bg={color.chartBg}>…</PixelPanel>  {/* recessed well */}
<PixelPanel depth={bevel.sm} pad={space.sm} round={radius.tile}>…</PixelPanel>
```

### PixelButton

`tone` is `primary | danger | gold | quiet | info`; states are default,
pressed, `disabled` and `loading`.

```tsx
<PixelButton tone="primary" label="FIND MATCH" size={14} padY={18} onPress={findMatch} />
<PixelButton tone="danger" label="CLOSE" flex={1} onPress={closeLong} />
<PixelButton tone="gold" label="CHALLENGE" size={8} onPress={challenge} />
<PixelButton tone="quiet" label="SAVED" disabled />
<PixelButton tone="info" label="POSTING" loading />
```

Loading marches a three-cell block meter (`■`) rather than spinning — a
spinner has no pixel equivalent, and the button keeps its footprint.

### IconPlate

Colored square glyph tile. Glyphs are geometric unicode only; `GLYPH` holds the
sanctioned set (`▤ ▲ ⚔ ▦ ✓ ◆ ● ■ ▶ ✕`).

```tsx
<IconPlate glyph="feed" bg={color.cyan} ink={onInk.cyan} />
<IconPlate glyph={GLYPH.gem} bg={color.purple} ink={onInk.purple} size={34} glyphSize={15} />
<IconPlate glyph="$" bg={color.blue} ink={color.yellow} size={22} glyphSize={9} />
```

### Badge

```tsx
<Badge label="LIVE" tone="live" />
<Badge label="SOON" tone="soon" />
<Badge label="+$9.80" tone="win" variant="numeric" />
<Badge label="RESETS IN 06:12:40" tone="quiet" variant="label" />
```

Tones: `live | soon | gold | quiet | win | loss`.

### ProgressBar

```tsx
<ProgressBar value={0.66} />
<ProgressBar value={1} fill={color.yellow} height={14} />
```

`value` is 0–1 and is clamped. Hard-edged, unanimated, so it reads as lit cells.

### Divider

```tsx
<Divider />
<Divider color={color.blue} thickness={border.thick} />
<Divider direction="vertical" />
```

### ScanlineOverlay

```tsx
<Box bg={color.panel} height={92}>
  <PixelText variant="bodySmall">CRT</PixelText>
  <ScanlineOverlay />
</Box>
```

Absolutely positioned and non-interactive. Drawn as discrete rows, never a
repeating gradient — a gradient would anti-alias the pixels beneath it.

### FogOverlay

The hidden-state curtain: an ink wash under a slow drift of scanlines.

```tsx
<Box bg={color.panel} height={92}>
  <PixelText variant="statBig">+9.99%</PixelText>
  <FogOverlay label="FOGGED" />
</Box>

<FogOverlay active={phase === 'live'} cover={0.94} animate={false} />
```

The default `cover` conceals outright. Lower it only if you want a hint of
what is underneath.

---

## Composites

### MaskAvatar

```tsx
<MaskAvatar size={58} ring={color.yellow} glyphSize={20} />   {/* winner */}
<MaskAvatar size={58} ring={color.panelLight} glyphSize={20} />{/* fogged  */}
<MaskAvatar size={118} ring={color.blue} glyphSize={44} glyph="?" />
```

### StatTile

```tsx
<StatTile value="21W" label="WINS" />
<StatTile value="+$120" label="TAKEN" tone={color.green} align="left" />
```

### Orb

```tsx
<Orb size={154} state="fog" />     {/* matchmaking      */}
<Orb size={110} state="live" />    {/* round in progress */}
<Orb size={154} state="reveal" />  {/* buzzer            */}
<Orb size={88} state="fog" animate={false} />
```

Keep `size` a multiple of 22 — the internal pixel unit is `round(size / 22)`.

### TapeChart

```tsx
<TapeChart mine={priceSeries} height={200} baseline />
<TapeChart mine={myEquity} opponent={theirEquity} height={170} />
<TapeChart mine={a} opponent={b} width={200} height={58} pad={6} strokeWidth={2} />
```

With two series the lo/hi scale is computed across both, so the loser's line
can never draw above the winner's. Pass `lo`/`hi` to share a scale across
separate charts.

### Ticker

```tsx
<Ticker items={['t_kev_2 WON $7.65 ON FOG DUEL', 'LIVE FOGS: 38']} />
<Ticker items={items} duration={12000} animate={false} />
```

Measures one copy of the line and travels exactly that far, so the loop has no
seam and no blank stretch.

### TabBar

```tsx
<TabBar active={tab} onChange={setTab} />
<TabBar active={tab} onChange={setTab} tabs={MY_TABS} />
```

`TABS` is the default five. A tab is
`{ key, label, glyph, icon, ink, big? }`; `big` is the wider centre action.

### PocketShell

```tsx
<PocketShell screenHeight={700} caption="FOG DUEL">
  <AppHeader … />
  <Ticker items={…} />
  <ScrollView style={{ flex: 1 }}>{screen}</ScrollView>
  <TabBar active={tab} onChange={setTab} />
</PocketShell>
```

The screen is 440 × 700 and clips its content; the tab bar pins to the bottom.

### Wordmark

The MASKED lockup — masked plate plus wordmark, with an optional chromatic
split (magenta/cyan copies behind the white word) that reads as CRT
misconvergence. Used in the landing nav and footer.

```tsx
<Wordmark />                                  {/* plate + glitch, 18px */}
<Wordmark size={16} />
<Wordmark plate={false} glitch={false} color={color.yellow} />
```

### BeachBackdrop

Bands are drawn in 700px design units and scaled to the real height, so the
horizon lands correctly on a phone screen and on a full-bleed desktop hero.

```tsx
<View style={{ flex: 1 }}>
  <BeachBackdrop />               {/* measures itself */}
  <BeachBackdrop height={640} />  {/* or scale to a known height */}
  <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
    <PocketShell>{…}</PocketShell>
  </SafeAreaView>
</View>
```

### MatchCard

```tsx
<MatchCard
  token="$BONK"
  pot="$50"
  ago="2m ago"
  winner="nofills.sol"
  loser="jpegliq"
  winnerPnl="+4.12%"
  loserPnl="-1.80%"
  winnerSeries={[0, 3, 1, 6, 4, 9, 7, 12]}
  loserSeries={[0, -1, 2, -3, -2, -5, -3, -6]}
  onCopy={copy}
  onFade={fade}
  onChallenge={challenge}
/>
```

### LeaderRow

```tsx
<LeaderRow rank={4} name="liqhunter" won="+$120" wins="18W" />
<LeaderRow rank={5} name="you" won="+$96" wins="15W" highlight ring={color.yellow} onPress={open} />
```

### Podium

```tsx
<Podium
  entries={[
    { name: 'nofills.sol', place: 1, wins: '21W' },
    { name: 'shadowbid', place: 2, wins: '14W' },
    { name: 'vwapgoblin', place: 3, wins: '11W' },
  ]}
/>
```

Pass entries in any order — they render 2 · 1 · 3, and plinth height and plate
color are derived from `place`, so first can never be drawn shorter than second.

### ModeTile

```tsx
<ModeTile name="FOG DUEL" description="Your token vs theirs, 5 MIN, hidden positions." status="LIVE" onPress={play} />
<ModeTile name="CHICKEN" description="First seller pays a penalty to holders." status="SOON" />
```

`onPress` is ignored unless `status` is `LIVE`, so a locked mode cannot look playable.

### QuestRow

```tsx
<QuestRow name="Win 3 fog duels" reward="+$5" value={0.66} progress="2 / 3" />
<QuestRow name="Rematch the same wallet" reward="+$1" value={1} progress="1 / 1" onClaim={claim} claimed={done} />
```

### FillTape

```tsx
<FillTape fills={fills} note="HIDDEN UNTIL REVEAL" />
<FillTape fills={[]} emptyLabel="no fills yet" />
<FillTape fills={theirFills} title="OPPONENT TAPE" fogged fogLabel="SEALED" />
```

A `Fill` is `{ side, px, t }`; `LONG`, `CLOSE` and `SETTLE` are tinted.

### PnLReadout

```tsx
<PnLReadout value={4.12} />                                     {/* bare  */}
<PnLReadout panel label="YOU" value={myPnl} note="LONG FROM 0.9981" />
<PnLReadout panel label="NOFILLS.SOL" fogged note="FOGGED · 3 FILLS" accent={color.panelLight} />
<PnLReadout panel label="WINNER" value={7.9} signed note="4 FILLS" accent={color.magenta} />
```

`fogged` prints solid blocks instead of the figure — concealment, not a blur.
`signed` colors the number green/red; without it the number is white, which is
how the live HUD reads.

### PotPill / RoundClock / StakePicker

```tsx
<PotPill amount={9.8} />
<PotPill amount="$50" tone={color.green} label="POT" />

<RoundClock seconds={secondsLeft} />          {/* turns red under 30s */}
<RoundClock seconds={90} label="LEFT" warnAt={10} size={16} />

<StakePicker value={stake} onChange={setStake} note="WINNER TAKES $9.80 · 2% RAKE" />
<StakePicker options={[1, 5, 25]} value={stake} onChange={setStake} disabled />
```

---

## Series helpers

```tsx
import { bounds, linePath, toEnd, mulberry32 } from './src/ui';

// One scale across both curves.
const { lo, hi } = bounds(mine, theirs);
const d = linePath(mine, 340, 170, lo, hi);

// An opponent curve that lands exactly on -2.40%, and stays put across renders.
const theirs = useMemo(
  () => toEnd(mine.length, oppPnl, mulberry32(Math.round(oppPnl * 1000) + mine.length)),
  [mine.length, oppPnl],
);
```

Without a seed, `toEnd` uses `Math.random` and reshuffles on every render — call
it inside `useMemo`, or pass a seeded generator.

## Formatters

```tsx
import { pct, money, mmss, signColor } from './src/ui';

pct(4.12);        // '+4.12%'
money(9.8);       // '$9.80'
mmss(300);        // '5:00'
signColor(-1.8);  // color.red
```

## Market components

```tsx
import { MarketPicker, MarketHeader, TokenLogo, SourceBadge } from './src/ui';

// The picker takes formatted strings — it renders markets, it does not know
// what a price scale is. Every state it will really be in is handled.
<MarketPicker
  kind={kind}                       // 'meme' | 'major'
  onKindChange={setKind}
  markets={rows}                    // PickableMarket[]
  selectedMint={selected?.mint}
  onSelect={(m) => choose(m)}
  loading={loading}
  error={error}                     // the upstream's own words, or null
  onRetry={refresh}
/>

// A market's logo: drawn for SOL and USDC, remote for everything else, and a
// colour tile keyed off the mint when the CDN has dropped it.
<TokenLogo mint={mint} symbol="WOTF" uri={imageUri} size={32} />

// What the live round is over.
<MarketHeader
  mint={mint} symbol="WOTF" name="World Of The Future"
  price="0.008450◎" changePct={4.21} source="pump.fun"
/>

// Where a price came from. A claim needs an attribution.
<SourceBadge source="jupiter" />
```

## Routes

The app uses expo-router, so every surface has a real URL:

| Route | Screen |
|---|---|
| `/` | `src/screens/LandingScreen.tsx` — the marketing page |
| `/play` | `src/screens/MaskedApp.tsx` — the duel |
| `/gallery` | `src/screens/UIGallery.tsx` — every component in every state |

```bash
npm run web      # / , /play , /gallery
npm run check    # typecheck + token drift + series guarantees
```
