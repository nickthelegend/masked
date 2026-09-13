import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';
import { color, type, border, bevel } from './tokens';
import type { TypeRole } from './tokens';

/**
 * Type roles as ready-to-spread RN style objects.
 * Ported 1:1 from `ui/rn/theme.js`. Never add `fontWeight` — RN ignores it on
 * these faces and it silently swaps in a fallback font on Android.
 */
export const text = StyleSheet.create({
  wordmark: {
    fontFamily: type.wordmark.family,
    fontSize: type.wordmark.size,
    lineHeight: type.wordmark.lineHeight,
    letterSpacing: type.wordmark.letterSpacing,
    color: color.white,
  },
  h1: { fontFamily: type.h1.family, fontSize: type.h1.size, lineHeight: type.h1.lineHeight, color: color.white },
  h2: { fontFamily: type.h2.family, fontSize: type.h2.size, lineHeight: type.h2.lineHeight, color: color.white },
  statBig: { fontFamily: type.statBig.family, fontSize: type.statBig.size, lineHeight: type.statBig.lineHeight, color: color.yellow },
  label: { fontFamily: type.label.family, fontSize: type.label.size, lineHeight: type.label.lineHeight, color: color.yellow },
  tabLabel: { fontFamily: type.tabLabel.family, fontSize: type.tabLabel.size, lineHeight: type.tabLabel.lineHeight, color: color.white },
  numeric: { fontFamily: type.numeric.family, fontSize: type.numeric.size, lineHeight: type.numeric.lineHeight, color: color.white },
  body: { fontFamily: type.body.family, fontSize: type.body.size, lineHeight: type.body.lineHeight, color: color.text },
  bodySmall: { fontFamily: type.bodySmall.family, fontSize: type.bodySmall.size, lineHeight: type.bodySmall.lineHeight, color: color.textDim },
});

/**
 * Hard 8-bit bevel: thick ink border + a heavier bottom edge.
 * This is the entire depth system — no `shadowColor`, no `elevation`, no blur.
 * On press, drop the bottom edge back to `border.base` and translate down by
 * `PRESS_TRAVEL` (see `pressedBevel`).
 */
export const bevelBox = (
  bg: string = color.panel,
  depth: number = bevel.md,
  edge: string = color.ink,
): ViewStyle => ({
  backgroundColor: bg,
  borderWidth: border.base,
  borderColor: edge,
  borderBottomWidth: border.base + depth,
});

/** How far a pressed element travels into its own bevel. */
export const PRESS_TRAVEL = 4;

/**
 * The pressed half of the bevel: bottom edge collapses to the base border and
 * the element drops by `PRESS_TRAVEL`, so the box lands exactly where its
 * drop-edge was. No opacity fade, no scale spring.
 */
export const pressedBevel = (pressed: boolean): ViewStyle => ({
  borderBottomWidth: pressed ? border.base : undefined,
  transform: [{ translateY: pressed ? PRESS_TRAVEL : 0 }],
});

/** Top highlight used on inset wells. From `ui/rn/theme.js`. */
export const inset = { borderTopWidth: border.base, borderTopColor: 'rgba(255,255,255,0.22)' } as const;

/**
 * Foreground inks for printing on top of a saturated accent.
 *
 * These are NOT new values — every one is already hard-coded in the nine
 * blessed components; naming them here is the only way to stop them being
 * re-typed as magic strings in screens. Provenance in comments.
 */
export const onInk = {
  yellow: '#3a2a00', // ui/rn/PixelButton.js — gold tone foreground
  orange: '#4a2e00', // ui/rn/TabBar.js — RANK tab ink
  cyan: '#06263a', //   ui/rn/TabBar.js — FEED tab ink
  purple: '#2c0a4a', // ui/rn/TabBar.js — MODES tab ink
  green: '#05270f', //  ui/rn/TabBar.js — QUEST tab ink
  red: '#5c0a12', //    ui/rn/TabBar.js (big-tab plate edge) + PocketShell.js d-pad
} as const;

/** Decorative shell/plinth values, likewise lifted from the blessed components. */
export const shade = {
  plinthDim: '#c9971a', // ui/rn/TabBar.js — inactive DUEL plinth
  led: '#ff8a90', //       ui/rn/PocketShell.js — power LED
} as const;

/** Minimum interactive height. Platform notes: hit targets are 44px or more. */
export const HIT_SLOP_MIN = 44;

/** Bottom-tab plinths are 56–62px tall including the bevel. */
export const TAB_BAR_MIN_HEIGHT = 56;

/**
 * The keyboard focus ring: a solid white outline just outside the control.
 *
 * White, not yellow, because yellow already means "selected" on market rows
 * and tabs, and a focused control has to be told apart from a chosen one. An
 * outline rather than a border, so the ring never changes the control's size.
 * Web reads the outline keys; native ignores them.
 */
export const focusRing = {
  outlineWidth: 3,
  outlineStyle: 'solid',
  outlineColor: color.white,
  outlineOffset: 2,
} as unknown as ViewStyle;

/**
 * For a pressable that draws `focusRing` on an inner element instead of on
 * itself: without this the browser's own outline shows too, two rings on one
 * control.
 */
export const noOutline = { outlineStyle: 'none' } as unknown as ViewStyle;

export type TextStyleRole = Record<TypeRole, TextStyle>;
// Every token, `TypeRole` included, is re-exported from here. Naming them again
// in an `export { … }` beside this line exported each one twice.
export * from './tokens';
