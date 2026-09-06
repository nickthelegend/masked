# MASKED UI kit

```
ui/
  tokens.js            shared color / type / space / bevel tokens (web + RN)
  platform-notes.md    Expo font setup, type-role style objects, Orb docs
  CLAUDE_CODE_PROMPT.md prompt for generating the full styled-component layer
  rn/
    theme.js           text.* style objects + bevelBox() primitive
    PixelPanel.js      bevelled container
    PixelButton.js     press-into-bevel button (primary/danger/gold/quiet/info)
    MaskAvatar.js      masked "?" identity plate
    StatTile.js        big numeral + label
    Orb.js             SVG fog/live/reveal orb
    TapeChart.js       shared-scale duel tape + linePath()
    TabBar.js          colorful 5-tab pixel nav
    Ticker.js          marquee win ticker
    PocketShell.js     red Game Boy shell with curved screen
    index.js
```

Web reference implementations: `Masked.dc.html` (app) and `Landing.dc.html` (marketing).
Runnable RN app: `react-native/App.js`.
