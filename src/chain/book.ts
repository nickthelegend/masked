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

/**
 * The most quote that buys back `baseOut` without buying one unit past it.
 *
 * Closing a short buys a known quantity of base, but `apply_fill`'s buy side
 * consumes *quote* — so the amount has to be inverted through the curve rather
 * than estimated at the mark.
 *
 * Twice this was nearly right, and nearly is a different position:
 * - Multiplying the size by the mark ignored the buy's own impact, and a MAX
 *   close of a 2,934,955 short bought back 2,912,191 — POSITION CLOSED with
 *   22,764 still open.
 * - Inverting the curve in floating point and rounding up then overshot: a MAX
 *   close of a 1,024,870 short bought 1,024,871 and left the player one unit
 *   long, on the tape as a FLIP.
 *
 * So this is the program's own integer arithmetic, in bigint. `apply_fill`
 * re-pegs the book (`Book::seed`: `Q = entry * DEPTH`, `B = ⌊Q * VALUE_DIV / px⌋`)
 * and `Book::buy(q)` hands back `B - ⌊Q·B / (Q + q)⌋`. The largest `q` that
 * hands back at most `baseOut` is `⌊Q·B / (B - baseOut)⌋ - Q`, which is what
 * this returns.
 *
 * Exact is not always on offer. The spend is whole lamports, and below 0.001
 * SOL a token (`px < VALUE_DIV`) one lamport buys more than one base unit — for
 * a fresh pump.fun coin at 2.8e-8 SOL, about 36,000 — so no spend lands on the
 * short exactly. What this leaves is then less than the next lamport would buy,
 * so it is worth under a lamport at this mark: `Position::equity` truncates it
 * to zero, and `settle_match` closes it at the buzzer. See `isFlat`. From 0.001
 * SOL a token up a lamport buys at most one unit, and the cover is exact.
 * `scripts/check-fuzz.mts` holds all of this against the program's arithmetic.
 */
export function exactQuoteToCover(baseOut: bigint, px: bigint, entry: bigint): bigint {
  if (baseOut <= 0n || px <= 0n || entry <= 0n) return 0n;
  const Q = entry * BigInt(BOOK_DEPTH);
  const B = (Q * BigInt(VALUE_DIV)) / px;
  if (baseOut >= B) return 0n; // more base than the curve holds
  const q = (Q * B) / (B - baseOut) - Q;
  return q > 0n ? q : 0n;
}

// The other half of a close. It lives with the unit arithmetic, where the tape
// can reach it too — the tape importing the book would be a cycle, since the
// book takes BOOK_DEPTH from the tape.
export { isFlat } from './units';

/**
 * The largest short that still clears the program's margin cap.
 *
 * `apply_fill` caps a position at one times its collateral, comparing the
 * notional and the equity it computes *after* the fill. A long reaches that
 * cap exactly: it spends quote `q` and receives base worth `q / (1 + impact)`,
 * so its post-fill notional and equity are the same number.
 *
 * A short does not, because it pays its impact immediately. Selling notional
 * `d` from flat leaves equity `E - d²/(Q + d)` against a notional of `d`, so
 * sizing a short at the full equity overshoots the cap by exactly its own
 * impact — which is why every MAX short came back `NOT ENOUGH QUOTE` while
 * every MAX long went through.
 *
 * Solving `b + d + d²/(Q + d) <= E` for `d`, with `b` the notional already
 * held and `Q` the re-pegged depth, gives a quadratic:
 *
 *   2d² + d(b + Q - E) - Q(E - b) <= 0
 *
 * and this returns its positive root — the exact edge, so a MAX short is as
 * large as the program will actually accept and not a hand-picked haircut
 * below it.
 */
export function maxShortNotional(heldNotional: number, equity: number, entry: number): number {
  const Q = depthFor(entry);
  const room = equity - heldNotional;
  if (Q <= 0 || room <= 0) return 0;
  const b = heldNotional + Q - equity;
  const root = Math.sqrt(b * b + 8 * Q * room);
  // The same root, taken without cancellation. `b` carries the whole depth, so
  // it nearly always dwarfs the room left, and `-b + root` then subtracts two
  // almost equal numbers: with a lamport of room that alone was a millionth
  // off, enough for the fuzz to catch the cap exceeded. Multiplying through by
  // the conjugate leaves nothing to cancel.
  return b > 0 ? (2 * Q * room) / (b + root) : (-b + root) / 4;
}

/** The same edge, expressed as base units at `mark`. */
export function maxShortBase(baseHeld: number, equity: number, mark: number, entry: number): number {
  if (mark <= 0) return 0;
  const held = (Math.abs(baseHeld) * mark) / VALUE_DIV;
  return (maxShortNotional(held, equity, entry) * VALUE_DIV) / mark;
}
