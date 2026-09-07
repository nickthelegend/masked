/**
 * Live prices for the majors, from Jupiter's public price API.
 *
 * The meme side of the app reads pump.fun's bonding curves; SOL and USDC do
 * not have one, so their mark comes from Jupiter, which aggregates the venues
 * that actually trade them.
 *
 * As with pump.fun, this supplies a *mark*, not an execution venue. No swap is
 * ever routed here: a public swap print would hand the opponent the fills the
 * fog exists to hide. See `units.ts` for how a price becomes the program's
 * `px`, and `pumpfun.ts` for the same note on the meme side.
 */

import { feedBase } from './marketEndpoints';

/** Direct from a script, through the CORS shim in a browser. */
const api = () => `${feedBase('jup')}/price/v3`;
const TIMEOUT_MS = 12_000;

const withTimeout = (signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** The majors a duel can be fought over. Deliberately short — see the brief. */
export const MAJORS = [
  { mint: WSOL_MINT, symbol: 'SOL', name: 'Solana' },
  { mint: USDC_MINT, symbol: 'USDC', name: 'USD Coin' },
] as const;

export class JupiterError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'JupiterError';
  }
}

interface JupPrice {
  usdPrice: number;
  decimals: number;
  blockId?: number;
  priceChange24h?: number;
}

/**
 * USD prices for the given mints.
 *
 * Returns only what the API actually answered for: a mint it does not know is
 * absent from the map rather than defaulted to zero, so a caller cannot
 * mistake "no data" for "worthless".
 */
export async function fetchUsdPrices(
  mints: readonly string[],
  signal?: AbortSignal
): Promise<Map<string, JupPrice>> {
  if (mints.length === 0) return new Map();
  const url = `${api()}?ids=${mints.join(',')}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' }, signal: withTimeout(signal) });
  } catch (e) {
    throw new JupiterError(
      e instanceof Error && e.name === 'TimeoutError'
        ? `Jupiter price API timed out after ${TIMEOUT_MS}ms`
        : `Jupiter price API unreachable: ${e instanceof Error ? e.message : String(e)}`
    );
  }
  if (!res.ok) throw new JupiterError(`Jupiter price API returned HTTP ${res.status}`, res.status);

  const body = (await res.json()) as Record<string, JupPrice | null>;
  const out = new Map<string, JupPrice>();
  for (const [mint, v] of Object.entries(body)) {
    if (v && Number.isFinite(v.usdPrice) && v.usdPrice > 0) out.set(mint, v);
  }
  return out;
}

/**
 * SOL/USD, which is what converts every USD price into the SOL the escrow is
 * denominated in.
 */
export async function fetchSolUsd(signal?: AbortSignal): Promise<number> {
  const prices = await fetchUsdPrices([WSOL_MINT], signal);
  const sol = prices.get(WSOL_MINT);
  if (!sol) throw new JupiterError('Jupiter returned no price for SOL');
  return sol.usdPrice;
}
