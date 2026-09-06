/** Display formatters shared by the HUD components and the screens. */
import { color } from './tokens';

/** Signed percentage, always two decimals: `+4.12%`, `-1.80%`. */
export const pct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/** Dollar amount, always two decimals: `$9.80`. */
export const money = (n: number): string => `$${n.toFixed(2)}`;

/** Seconds as `m:ss`. Negative input clamps to `0:00`. */
export const mmss = (s: number): string => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Green up, red down, white flat. The only place PnL sign becomes a color. */
export const signColor = (v: number): string => (v > 0 ? color.green : v < 0 ? color.red : color.white);
