/**
 * MASKED design tokens — the single source of truth for every value in the UI.
 *
 * This is a typed, portable port of `ui/tokens.js`. The numbers and hex strings
 * are identical by construction: `scripts/check-tokens.mjs` diffs this file
 * against `ui/tokens.js` and fails the build on any drift.
 *
 * Nothing in `src/ui/` may introduce a color, size, radius or depth that is not
 * declared here (the one documented exception is `onInk` in `theme.ts`, which
 * names foreground inks already hard-coded in `ui/rn/*.js`).
 */

export const color = {
  // surfaces
  bg: '#080d24',
  screen: '#111a44',
  panel: '#1b2a63',
  panelLight: '#24398a',
  ink: '#0a0f2b',
  inkDeep: '#060a1c',
  chartBg: '#0d1436',
  // accents
  yellow: '#ffd21e',
  orange: '#ffb31e',
  green: '#2fbf5c',
  greenDeep: '#1e8f42',
  red: '#ff4d5e',
  cyan: '#35e0ff',
  magenta: '#ff4dd2',
  purple: '#b46bff',
  blue: '#2d5be3',
  // device shell (red pocket)
  shellTop: '#e0323c',
  shellBottom: '#b41822',
  shellEdge: '#6d0c14',
  shellInner: '#3b0a10',
  shellButton: '#7a0e16',
  shellInk: '#ffd0d3',
  // text
  white: '#ffffff',
  text: '#c8d3f7',
  textDim: '#8fa2e0',
  textFaint: '#6f83c8',
  // sunset beach background bands, top to bottom
  sunset: ['#3a2350', '#7a3358', '#c85a4a', '#f0803c', '#ff9f3c', '#ffc25e', '#ffdd94'],
  sea: '#2a5c86',
  seaGlow: '#e8934f',
  foam: '#ffefd8',
  sand: '#c9895a',
  sandAlt: '#bd7f54',
} as const;

export const font = {
  display: 'PressStart2P_400Regular',
  body: 'Silkscreen_400Regular',
} as const;

/** 8-bit scale: everything is a multiple of 2 so pixel edges stay crisp. */
export const space = { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, xxl: 32 } as const;

export const radius = { none: 0, tile: 6, card: 10, screen: 22, pill: 999 } as const;

export const border = { thin: 2, base: 3, thick: 4, shell: 6 } as const;

/** Bevel depth: a solid shadow below the element, never a soft blur. */
export const bevel = { sm: 4, md: 6, lg: 7 } as const;

/** Type roles. Never below these sizes — pixel fonts smear under 7px. */
export const type = {
  wordmark: { family: font.display, size: 18, lineHeight: 26, letterSpacing: 1 },
  h1: { family: font.display, size: 17, lineHeight: 24 },
  h2: { family: font.display, size: 13, lineHeight: 20 },
  statBig: { family: font.display, size: 20, lineHeight: 26 },
  label: { family: font.display, size: 9, lineHeight: 14 },
  tabLabel: { family: font.display, size: 7, lineHeight: 12 },
  numeric: { family: font.display, size: 11, lineHeight: 16 },
  body: { family: font.body, size: 13, lineHeight: 20 },
  bodySmall: { family: font.body, size: 11, lineHeight: 16 },
} as const;

/* ---------- token key unions ---------- */

/** Every named color in the palette (`sunset` is an array, not a single color). */
export type ColorName = Exclude<keyof typeof color, 'sunset'>;
export type SpaceKey = keyof typeof space;
export type RadiusKey = keyof typeof radius;
export type BorderKey = keyof typeof border;
export type BevelKey = keyof typeof bevel;
/** The nine type roles from the platform-notes table. */
export type TypeRole = keyof typeof type;
