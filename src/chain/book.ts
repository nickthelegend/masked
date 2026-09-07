/**
 * What a fill will cost, before it is signed.
 *
 * `apply_fill` re-pegs the player's book to the posted mark before every fill,
 * with depth fixed at `entry * BOOK_DEPTH`. That is what makes a preview
 * possible without reading the book at all: after the re-peg the curve is
 * fully determined by the entry and the mark, so the impact of a given size
 * is a closed form rather than a simulation.
 *
 * For a buy spending `q` lamports against quote reserves `Q = entry * DEPTH`:
 *
 *   base_out = (Q * VALUE_DIV / mark) * q / (Q + q)
 *   exec_px  = q * VALUE_DIV / base_out = mark * (Q + q) / Q
 *
 * so the price paid is above the mark by exactly `q / Q`. For a sell the same
 * algebra gives `v / (Q + v)`, where `v` is the notional being sold. Both are
 * the *cost*, always positive, in the sense the fill receipt uses.
 *
 * Mirrors `Book::buy` and `Book::sell` in state.rs. `scripts/check-tape.mts`
 * checks these predictions against the execution prices really recorded on
 * settled tapes.
 */
import { VALUE_DIV } from './units';
import { BOOK_DEPTH } from './tape';

/** Quote reserves after a re-peg: the depth the curve is rebuilt to. */
export const depthFor = (entry: number): number => entry * BOOK_DEPTH;

/**
 * Fraction above the mark a buy of `quoteIn` lamports executes at.
 * Returns 0 for a nonsensical entry rather than an infinity.
 */
export function buyImpact(quoteIn: number, entry: number): number {
  const Q = depthFor(entry);
  if (Q <= 0 || quoteIn <= 0) return 0;
  return quoteIn / Q;
}

/** Fraction below the mark a sell of `baseIn` (x BASE_SCALE) executes at. */
export function sellImpact(baseIn: number, mark: number, entry: number): number {
  const Q = depthFor(entry);
  if (Q <= 0 || baseIn <= 0 || mark <= 0) return 0;
  const notional = (baseIn * mark) / VALUE_DIV;
  return notional / (Q + notional);
}

/** The price a buy of `quoteIn` would execute at, given the posted mark. */
export const buyExecPx = (quoteIn: number, mark: number, entry: number): number =>
  mark * (1 + buyImpact(quoteIn, entry));

/** The price a sell of `baseIn` would execute at. */
export const sellExecPx = (baseIn: number, mark: number, entry: number): number =>
  mark * (1 - sellImpact(baseIn, mark, entry));

/** Base a buy of `quoteIn` would receive, x BASE_SCALE. */
export function buyBaseOut(quoteIn: number, mark: number, entry: number): number {
  const px = buyExecPx(quoteIn, mark, entry);
  if (px <= 0) return 0;
  return (quoteIn * VALUE_DIV) / px;
}
