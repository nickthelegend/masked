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
export function pxFromSolPerToken(priceSol: number): number {
  const px = Math.round(priceSol * LAMPORTS_PER_SOL * PRICE_SCALE);
  if (!Number.isFinite(px) || px <= 0) {
    throw new RangeError(`price ${priceSol} SOL/token rounds to px=${px}, which the program rejects`);
  }
  if (!Number.isSafeInteger(px)) {
    throw new RangeError(`price ${priceSol} SOL/token overflows a safe integer as px=${px}`);
  }
  return px;
}

/** The inverse, for display. */
export const solPerTokenFromPx = (px: number): number => px / LAMPORTS_PER_SOL / PRICE_SCALE;

/** On-chain base quantity to whole tokens. */
export const tokensFromBase = (baseQty: number): number => baseQty / BASE_SCALE;

/** Lamports a base quantity is worth at `px`. Mirrors `Position::equity`. */
export const valueOfBase = (baseQty: number, px: number): number => (baseQty * px) / VALUE_DIV;

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
