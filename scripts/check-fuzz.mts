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
  exactQuoteToCover,
  isFlat,
  maxShortNotional,
  sellExecPx,
  sellImpact,
} from '../src/chain/book';
import { BOOK_DEPTH } from '../src/chain/tape';
import { PRICE_SCALE, VALUE_DIV } from '../src/chain/units';

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

/**
 * `Book::seed` and then `Book::buy`, restated from state.rs in the program's
 * own integers — deliberately not imported from book.ts, so the two have to
 * agree rather than share a mistake.
 */
function programBuy(quoteIn: bigint, px: bigint, entry: bigint): bigint {
  const Q = entry * BigInt(BOOK_DEPTH);
  const B = (Q * BigInt(VALUE_DIV)) / px;
  return B - (Q * B) / (Q + quoteIn);
}

/** A price in SOL per token as the program's `px`: lamports per token x PRICE_SCALE. */
const pxOf = (solPerToken: number) => solPerToken * 1e9 * PRICE_SCALE;

const ROUNDS = 4000;

/* Entries the product actually offers, in lamports: 0.05 to 1 SOL. Marks span
   a memecoin at ~3e-11 SOL/token through an xStock at ~755.

   They used to be scaled by VALUE_DIV rather than into `px` — a thousand times
   too small — so the "755 SOL" end was really 0.755, and no mark was ever drawn
   where a major or an xStock actually trades. */
for (let i = 0; i < ROUNDS; i += 1) {
  const entry = logUniform(0.05e9, 1e9);
  const mark = logUniform(pxOf(3e-11), pxOf(755));
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

  /* ---- buying back a short, in the program's own integers ---- */
  // `exactQuoteToCover` is what a MAX close of a short spends, so it has to be
  // the largest spend whose buy stops at or before zero: one lamport more and
  // the close is a FLIP. What it leaves has to be worth under a lamport — flat
  // by `isFlat`, and nothing to `Position::equity`, which truncates it. And
  // from 0.001 SOL a token up, where a lamport buys at most one base unit, it
  // has to leave nothing at all.
  //
  //    Twice before this was a float inverse with a tolerance, and both times
  //    the tolerance hid the bug: 22,764 base left open, then one unit past
  //    zero. So these hold exactly, in bigint, against `programBuy`.
  const px = BigInt(Math.round(mark));
  const stake = BigInt(Math.round(entry));
  const short = BigInt(Math.floor(logUniform(1, (entry * VALUE_DIV) / mark)));
  const cover = exactQuoteToCover(short, px, stake);
  const left = short - programBuy(cover, px, stake);
  ok(left >= 0n, `cover passed zero: a ${short} short spent ${cover} and ended ${-left} long at px ${px}`);
  ok(
    programBuy(cover + 1n, px, stake) > short,
    `cover is not the largest spend that stops at zero: ${short} short, ${cover} lamports, px ${px}`
  );
  ok(left * px < BigInt(VALUE_DIV), `cover left ${left} base, worth a lamport or more at px ${px}`);
  ok(isFlat(Number(left), Number(px)), `isFlat calls the ${left} base a cover leaves at px ${px} a position`);
  if (px >= BigInt(VALUE_DIV)) ok(left === 0n, `cover not exact at px ${px}: ${left} of ${short} left`);
  // The boundary from the other side: a lamport's worth is a position.
  const lamportsWorth = (BigInt(VALUE_DIV) + px - 1n) / px;
  ok(!isFlat(Number(lamportsWorth), Number(px)), `isFlat calls ${lamportsWorth} base at px ${px} flat — that is a lamport`);

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
  ['exactQuoteToCover(0 base)', Number(exactQuoteToCover(0n, 1_000_000n, 100_000_000n))],
  ['exactQuoteToCover(zero mark)', Number(exactQuoteToCover(1_000n, 0n, 100_000_000n))],
  ['exactQuoteToCover(zero entry)', Number(exactQuoteToCover(1_000n, 1_000_000n, 0n))],
  ['exactQuoteToCover(more than the curve holds)', Number(exactQuoteToCover(10n ** 30n, 1_000_000n, 100_000_000n))],
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
  `a short's cover the largest spend that stops at zero — exact from 0.001 ◎/token up, under a lamport left below it — ` +
  `the short cap tight and never exceeded, and no NaN on degenerate input`
);
