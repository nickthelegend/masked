/**
 * The colour-blind palette switch.
 *
 * The palette itself is chosen once, in tokens.ts, before any component copies
 * a colour into a table of its own. Changing it therefore reloads the page:
 * repainting in place would recolour the components that read `color` at render
 * and leave the ones that copied it at load in the old palette, which is worse
 * than either palette.
 *
 * Web only. The choice lives in localStorage, and nothing else in the app
 * persists settings on native.
 */
import { Platform } from 'react-native';
import { PALETTE_KEY, activePaletteName, type PaletteName } from './tokens';

export type { PaletteName };

/** The palette this page loaded with. */
export const paletteName: PaletteName = activePaletteName;

/** Whether this runtime can store the choice and reload into it. */
export const paletteSwitchable = Platform.OS === 'web' && typeof window !== 'undefined';

/**
 * Store the choice and reload into it.
 *
 * Returns false, without reloading, when the browser refuses to store it (a
 * private window, blocked site data): a reload would bring back the palette
 * the player just switched away from.
 */
export function setPalette(next: PaletteName): boolean {
  if (!paletteSwitchable) return false;
  try {
    window.localStorage.setItem(PALETTE_KEY, next);
    if (window.localStorage.getItem(PALETTE_KEY) !== next) return false;
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
