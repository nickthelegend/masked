/**
 * The unit contract between the program's fixed-point maths and everything
 * that displays a price.
 *
 * The program never sees a float. It stores:
 *
 *   quote_balance  lamports
 *   base_qty       whole tokens x BASE_SCALE
 *   px             lamports per whole token x PRICE_SCALE
 *
 * One rule for every market. It has to be scaled, because the list spans nine
 * orders of magnitude: a pump.fun coin at 2.8e-8 SOL is 28 lamports a token,
 * and stored bare that leaves two significant figures and rounds the cheaper
 * half of the list to zero. Scaled it is 2.8e7, while SOL at 1e15 still has
 * four orders of magnitude of headroom under u64.
 *
 * A base quantity times a price therefore carries both scales, so lamports
 * come back out after dividing by VALUE_DIV. Mirrors `VALUE_DIV` in state.rs.
 */
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/** Mirrors `BASE_SCALE` in state.rs. */
export const BASE_SCALE = 1_000_000;
/** Mirrors `PRICE_SCALE` in state.rs. */
export const PRICE_SCALE = 1_000_000;
/** Mirrors `VALUE_DIV` in state.rs: what base x price divides by to be lamports. */
export const VALUE_DIV = BASE_SCALE * PRICE_SCALE;

/**
 * A per-token price in SOL becomes the program's `px`.
 *
 * Rounds, because `px` is a u64. A price low enough to round to zero would be
 * rejected on-chain as `InvalidPrice`, so it is caught here instead, where the
 * message can say something useful.
 */
/** Largest `px` the program's u64 can carry. */
export const MAX_PX = (1n << 64n) - 1n;

/**
 * Decimal-shift a double into an exact integer, rounding half up.
 *
 * `Math.round(priceSol * 1e15)` cannot do this job at either end of the range
 * this app now has to cover. BONK is about 3e-11 SOL, where multiplying first
 * and rounding after throws away every significant digit; WBTC is about 755
 * SOL, where the product is 7.6e17 and a double can no longer represent
 * consecutive integers. Going through the number's own decimal expansion keeps
 * all seventeen significant digits and puts the point where it belongs.
 */
function shiftToBigInt(x: number, decimals: number): bigint {
  const [mantissa, exponent] = x.toExponential(16).split('e');
  const digits = mantissa.replace('-', '').replace('.', '');
  const shift = Number(exponent) + 1 - digits.length + decimals;
  let out = BigInt(digits);
  if (shift >= 0) {
    out *= 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    out = (out + divisor / 2n) / divisor; // half up
  }
  return x < 0 ? -out : out;
}

/**
 * SOL per token to the program's `px`.
 *
 * `px = priceSol * 1e9 lamports * PRICE_SCALE`, so fifteen decimal places.
 *
 * Returns a `bigint` because a `number` cannot hold the top of the range:
 * `Number.isSafeInteger` gives out at 9.007e15, which is about 9 SOL a token,
 * so every asset above roughly $945 — WBTC, and anything else worth owning —
 * was being silently dropped from the market list as unrepresentable. The
 * program's field is a u64 and always was; only this conversion was the limit.
 */
export function pxFromSolPerToken(priceSol: number): bigint {
  if (!Number.isFinite(priceSol) || priceSol <= 0) {
    throw new RangeError(`price ${priceSol} SOL/token is not a positive number`);
  }
  const px = shiftToBigInt(priceSol, 15);
  if (px <= 0n) {
    throw new RangeError(`price ${priceSol} SOL/token rounds to px=0, which the program rejects`);
  }
  if (px > MAX_PX) {
    throw new RangeError(`price ${priceSol} SOL/token overflows a u64 as px=${px}`);
  }
  return px;
}

/** The inverse, for display. */
export const solPerTokenFromPx = (px: number | bigint): number =>
  Number(px) / LAMPORTS_PER_SOL / PRICE_SCALE;

/** On-chain base quantity to whole tokens. */
export const tokensFromBase = (baseQty: number): number => baseQty / BASE_SCALE;

/** Lamports a base quantity is worth at `px`. Mirrors `Position::equity`. */
export const valueOfBase = (baseQty: number, px: number): number => (baseQty * px) / VALUE_DIV;

/**
 * Whether a position is closed, as the program values it.
 *
 * Zero is flat, and so is a remainder worth under a lamport at the mark:
 * `Position::equity` truncates it to nothing, and it is what a MAX close leaves
 * on a coin too cheap to buy back exactly — see `exactQuoteToCover`. No
 * whole-lamport buy can take such a short without passing zero, and
 * `settle_match` closes it at the buzzer for nothing, as a fill with no price.
 * Reading it as SHORT left that close looking open in the round, and left the
 * reveal calling a flat player short.
 *
 * Exact at the boundary: both factors are integers, so any product near
 * `VALUE_DIV` is far inside a double's exact range. With no mark yet, only zero
 * is flat.
 */
export function isFlat(baseQty: number, px: number): boolean {
  if (baseQty === 0) return true;
  return px > 0 && Math.abs(baseQty) * px < VALUE_DIV;
}

/**
 * Format a token price for a pixel readout.
 *
 * The list spans $1 coins and 1e-8 ones, so a fixed number of decimals is
 * useless at one end or the other. USD, because that is the number a trader
 * recognises a meme coin by.
 */
export function formatUsdPrice(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '—';
  if (usd >= 1000) return `$${usd.toFixed(0)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(4)}`;
  if (usd >= 0.000001) return `$${usd.toFixed(8)}`;
  return `$${usd.toExponential(2)}`;
}

/** Same, in SOL, for the panels that quote the escrow currency. */
export function formatSolPrice(px: number): string {
  const sol = solPerTokenFromPx(px);
  if (sol === 0) return '—';
  if (sol >= 1) return sol.toFixed(4);
  if (sol >= 1e-6) return sol.toFixed(9);
  return sol.toExponential(2);
}

/** A market cap, shortened the way a ticker does it. */
export function formatCap(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return '—';
  if (usd >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}

/**
 * Mirrors `MAX_OPEN_AGE` in state.rs: how long an unjoined match may sit on
 * the book before the program refuses a join.
 *
 * Both books are seeded from the price snapshotted when the match was opened,
 * so a stale one starts its joiner at a number the market has left behind.
 */
export const MAX_OPEN_AGE_SECS = 300;
