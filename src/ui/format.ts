/** Display formatters shared by the HUD components and the screens. */
import { color } from './tokens';

/** Signed percentage, always two decimals: `+4.12%`, `-1.80%`. */
export const pct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

/** Dollar amount, always two decimals: `$9.80`. */
export const money = (n: number): string => `$${n.toFixed(2)}`;

/**
 * SOL amount, e.g. `9.80◎`.
 *
 * Stakes and pots are lamports on chain — `entry = stake * 1e9` — so labelling
 * them with a dollar sign told the user they were risking 5 dollars when the
 * program was escrowing 5 SOL. Everything denominated on chain uses this.
 */
export const sol = (n: number, dp = 2): string => `${n.toFixed(dp)}◎`;

/**
 * A SOL amount that does not round itself away.
 *
 * `sol()` is right for a pot or a stake, which are chosen in round numbers and
 * read better at two places. It is wrong for anything derived: a 2% rake on a
 * 0.2 pot is 0.004, and printing that as "0.00◎" in a panel headed SETTLED ON
 * SOLANA says no rake was taken. Up to four places, trailing zeros trimmed
 * back to two, so 0.2 still reads 0.20 and 0.004 reads 0.004.
 */
export const solExact = (n: number): string => {
  const fixed = n.toFixed(4);
  const trimmed = fixed.replace(/(\.\d{2}\d*?)0+$/, '$1');
  return `${trimmed}◎`;
};

/** Seconds as `m:ss`. Negative input clamps to `0:00`. */
export const mmss = (s: number): string => {
  const t = Math.max(0, Math.floor(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Green up, red down, white flat. The only place PnL sign becomes a color. */
export const signColor = (v: number): string => (v > 0 ? color.green : v < 0 ? color.red : color.white);
