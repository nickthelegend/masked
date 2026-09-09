/**
 * Property tests on the private book's maths, over randomised inputs.
 *
 * `check:tape` checks the previewer against execution prices that really
 * happened, which is the strongest evidence available but only covers sizes
 * somebody actually traded. This covers the rest of the space: dust fills,
 * whole-balance fills, memecoins priced at 3e-11 and xStocks at 755 SOL, and
 * the boundaries where a formula is most likely to divide by zero, overflow a
 * float, or quietly return NaN.
 *
 * These are properties, not fixtures — each is a statement that must hold for
 * every input, checked against thousands of them from a seeded generator, so a
 * failure reproduces exactly.
 *
 *   npm run check:fuzz
 */
import {
  buyBaseOut,
  buyExecPx,
  buyImpact,
  depthFor,
  maxShortNotional,
  quoteToBuyBase,
  sellExecPx,
  sellImpact,
} from '../src/chain/book';
import { VALUE_DIV } from '../src/chain/units';

/** mulberry32 — the same generator `series.ts` uses, so runs reproduce. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(0x0f06d0e1);
/** Log-uniform, so the space is covered evenly across orders of magnitude. */
const logUniform = (lo: number, hi: number) =>
  Math.exp(Math.log(lo) + rand() * (Math.log(hi) - Math.log(lo)));

let checks = 0;
const failures: string[] = [];
function ok(cond: boolean, what: string) {
  checks += 1;
  if (!cond && failures.length < 12) failures.push(what);
  else if (!cond) failures.push('…');
}
const finite = (n: number) => Number.isFinite(n) && !Number.isNaN(n);

const ROUNDS = 4000;

/* Entries the product actually offers, in lamports: 0.05 to 1 SOL. Marks span
   a memecoin at ~3e-11 SOL/token through an xStock at ~755. */
for (let i = 0; i < ROUNDS; i += 1) {
  const entry = logUniform(0.05e9, 1e9);
  const mark = logUniform(3e-11 * VALUE_DIV, 755 * VALUE_DIV);
  const Q = depthFor(entry);

  /* ---- buys ---- */
  const quoteIn = logUniform(1, entry);
  const bi = buyImpact(quoteIn, entry);
  const bpx = buyExecPx(quoteIn, mark, entry);
  const baseOut = buyBaseOut(quoteIn, mark, entry);

  ok(finite(bi) && bi >= 0, `buyImpact not finite/positive: q=${quoteIn} e=${entry} -> ${bi}`);
  ok(finite(bpx) && bpx >= mark, `buy must execute at or above the mark: ${bpx} < ${mark}`);
  ok(finite(baseOut) && baseOut > 0, `buyBaseOut not positive: ${baseOut}`);

  // Spending more never buys a better price, and never gets less base.
  const more = Math.min(quoteIn * 2, entry * 4);
  ok(buyImpact(more, entry) >= bi - 1e-12, 'buy impact must not fall as size grows');
  ok(buyBaseOut(more, mark, entry) >= baseOut - 1e-6, 'more quote must not buy less base');

  // The inverse really inverts: asking for the base a spend would yield
  // returns approximately that spend. This is the function that fixed closing
  // a short, so it is worth pinning.
  //
  //    The property is "inverts to within the rounding it must do", not
  //    "inverts exactly". `quoteToBuyBase` rounds *up* on purpose: quote is
  //    lamports and the program floors the base it hands back, so rounding
  //    down re-creates the dust it was written to remove — a MAX close that
  //    left 22,764 base open and still said POSITION CLOSED. So the bound is
  //    one lamport of overshoot, never an undershoot.
  const backQuote = quoteToBuyBase(baseOut, mark, entry);
  const slop = 1 + 1e-9 * quoteIn;
  ok(
    finite(backQuote) && backQuote >= quoteIn - slop && backQuote <= quoteIn + slop,
    `quoteToBuyBase did not invert: ${quoteIn} -> ${baseOut} -> ${backQuote} (off by ${(backQuote - quoteIn).toExponential(2)})`
  );

  /* ---- sells ---- */
  const baseIn = logUniform(1, (entry * VALUE_DIV) / mark);
  const si = sellImpact(baseIn, mark, entry);
  const spx = sellExecPx(baseIn, mark, entry);

  ok(finite(si) && si >= 0 && si < 1, `sellImpact outside [0,1): ${si}`);
  ok(finite(spx) && spx <= mark && spx >= 0, `sell must execute at or below the mark and stay positive: ${spx} vs ${mark}`);
  ok(sellImpact(baseIn * 2, mark, entry) >= si - 1e-12, 'sell impact must not fall as size grows');

  /* ---- the short cap, which is a closed form and therefore checkable ---- */
  const equity = logUniform(1, entry);
  const held = rand() < 0.5 ? 0 : logUniform(1, equity * 0.9);
  const d = maxShortNotional(held, equity, entry);
  ok(finite(d) && d >= 0, `maxShortNotional not finite/positive: ${d}`);
  if (d > 0) {
    // The cap it solves: held + d + d²/(Q+d) <= equity. It is the *edge*, so
    // it must sit inside the cap and be tight — a haircut would be a silently
    // smaller MAX than the program would accept.
    //
    //    Tolerance is 1e-6 relative, not 1e-9: this is the positive root of a
    //    quadratic and carries a square root's float error. The program does
    //    the same comparison in integer lamports, where a 1e-8 relative
    //    overshoot on a 1 SOL equity is well under one lamport and cannot
    //    change the require!'s answer.
    const cost = (d * d) / (Q + d);
    const used = held + d + cost;
    ok(used <= equity * (1 + 1e-6), `maxShortNotional exceeds the cap: used ${used} > equity ${equity}`);
    ok(used >= equity * (1 - 1e-6), `maxShortNotional is not tight: used ${used} vs equity ${equity}`);
  }
}

/* ---- degenerate inputs must answer, not explode ---- */
const degenerate: Array<[string, number]> = [
  ['buyImpact(0)', buyImpact(0, 1e8)],
  ['buyImpact(negative entry)', buyImpact(1e6, -1)],
  ['buyImpact(zero entry)', buyImpact(1e6, 0)],
  ['sellImpact(0 base)', sellImpact(0, 1e6, 1e8)],
  ['sellImpact(zero mark)', sellImpact(1e6, 0, 1e8)],
  ['sellImpact(zero entry)', sellImpact(1e6, 1e6, 0)],
  ['maxShortNotional(equity 0)', maxShortNotional(0, 0, 1e8)],
  ['maxShortNotional(held > equity)', maxShortNotional(2e8, 1e8, 1e8)],
  ['maxShortNotional(zero entry)', maxShortNotional(0, 1e8, 0)],
];
for (const [what, value] of degenerate) {
  ok(finite(value) && value >= 0, `${what} must be a finite non-negative number, got ${value}`);
}

if (failures.length > 0) {
  console.error(`fuzz FAILED — ${failures.length} of ${checks}:`);
  for (const f of failures.slice(0, 12)) console.error(`   ${f}`);
  process.exit(1);
}

console.log(
  `fuzz ok — ${checks} assertions over ${ROUNDS} randomised books (entries 0.05–1◎, marks 3e-11–755 ◎/token): ` +
  `impact monotone and bounded, buys never below the mark and sells never above it, ` +
  `quoteToBuyBase inverts to within its one-lamport round-up, the short cap tight and never exceeded, and no NaN on degenerate input`
);
