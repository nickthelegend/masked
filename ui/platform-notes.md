# MASKED — platform notes (handoff)

Everything below is the exact setup used by the shipped screens. Tokens live in `ui/tokens.js`;
React Native style objects live in `ui/rn/theme.js`. Web (Design Components) uses the same hex
values inline — there is no CSS class layer.

## 1. Expo font setup (exact)

```bash
npx create-expo-app masked && cd masked
npx expo install react-native-svg expo-font \
  @expo-google-fonts/press-start-2p @expo-google-fonts/silkscreen
```

```jsx
// App.js — gate render until both faces are ready, or pixel text reflows on load
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { Silkscreen_400Regular } from '@expo-google-fonts/silkscreen';
import { color } from './ui/tokens';

export default function App() {
  const [ready] = useFonts({ PressStart2P_400Regular, Silkscreen_400Regular });
  if (!ready) return <View style={{ flex: 1, backgroundColor: color.screen }} />;
  return <Root />;
}
```

Rules that matter on device:
- Font family strings are the **imported constant names**: `'PressStart2P_400Regular'`, `'Silkscreen_400Regular'`.
- RN ignores `fontWeight` on these faces. Never set it; use size and color for hierarchy.
- Always pair `fontSize` with an explicit `lineHeight` (pixel faces have tall metrics and clip otherwise).
- Press Start 2P is ~1.6× wider than a system font at the same size. Budget width; don't shrink below the
  minimums in the type table.
- `allowFontScaling={false}` on numeric readouts (clock, PnL, pot) so accessibility scaling can't break the HUD.
- Set `android_ripple={null}` / no ripple on pixel buttons — the bevel translate is the press feedback.

## 2. Type roles → RN style objects

Import from `ui/rn/theme.js` as `text.<role>` and spread into arrays.

| Role | Family | Size / line | Where it is used |
|---|---|---|---|
| `wordmark` | Press Start 2P | 18 / 26, ls 1 | MASKED lockup, top-left of shell and landing nav |
| `h1` | Press Start 2P | 17 / 24 | Reveal verdict ("YOU TAKE THE POT") |
| `h2` | Press Start 2P | 13 / 20 | Screen titles ("GAME MODES", "DAILY QUESTS") |
| `statBig` | Press Start 2P | 20 / 26 | Landing stats, podium numbers, token symbol |
| `numeric` | Press Start 2P | 11 / 16 | PnL, pot, price, balance, clock |
| `label` | Press Start 2P | 9 / 14 | Section labels, card eyebrows, quest rewards |
| `tabLabel` | Press Start 2P | 7 / 12 | Bottom tab captions, mode tags (hard floor — never smaller) |
| `body` | Silkscreen | 13 / 20 | Explanatory copy, mode descriptions |
| `bodySmall` | Silkscreen | 11 / 16 | Ticker, meta, timestamps, fill rows |

```jsx
import { text, color } from './ui/rn/theme';

<Text style={text.h2}>GAME MODES</Text>
<Text style={[text.numeric, { color: color.green }]} allowFontScaling={false}>+4.12%</Text>
<Text style={text.body}>Positions stay hidden until the round ends.</Text>
```

Color pairing (all ≥4.5:1 on their ground):
- on `panel`/`screen`: `white`, `text`, `yellow`, `cyan`, `green`
- on `yellow`: `#3a2a00` only
- on `green`/`red`/`blue`: `white`
- `textFaint` is decoration (ticker, footer) — never load-bearing copy

## 3. Bevel primitive (the whole look)

```js
bevelBox(bg, depth, edge) => {
  backgroundColor: bg,
  borderWidth: 3, borderColor: edge,   // ink outline
  borderBottomWidth: 3 + depth,        // solid drop edge, no blur
}
```
On press: reduce `borderBottomWidth` to 3 and `translateY: 4`. That is the entire interaction language —
no opacity fades, no scale springs, no shadows (RN `shadow*`/`elevation` is banned; it anti-aliases).

## 4. Orb component

`ui/rn/Orb.js` — requires `react-native-svg`. Chunky concentric rings + an 8-square pixel corona +
scanline overlay, driven by one `Animated.Value` pulse (native driver).

```jsx
import { Orb } from './ui/rn';

<Orb size={150} state="fog" />      {/* matchmaking / hidden opponent */}
<Orb size={120} state="live" />     {/* round in progress */}
<Orb size={160} state="reveal" />   {/* buzzer / winner banner */}
<Orb size={90}  state="fog" animate={false} /> {/* list rows, avatars */}
```

Props: `size` (px, square), `state` (`fog` | `live` | `reveal`), `animate` (default true).
Keep `size` a multiple of 22 for exact pixel steps; the internal pixel unit is `round(size/22)`.

## 5. Screen geometry

- Design screen: 440 × 700 inside `PocketShell`; content scrolls, tab bar is pinned.
- Web preview scales the whole shell with a measured `transform: scale()` so device + controls always fit.
- Hit targets: 44 px minimum. Tab plinths are 56–62 px tall including the bevel.
- Charts render at a fixed viewBox (340 × 170/200) and stretch to width — pass shared `lo`/`hi` to
  `linePath` whenever two series are compared, or the loser's curve can draw above the winner's.
