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

/**
 * One token as Jupiter's token API describes it.
 *
 * `tokens/v2` answers with the identity, the logo and the price in a single
 * call, which is the whole market picker — including the logos the hardcoded
 * majors never had, because that list carried `imageUri: null`.
 */
export interface JupToken {
  id: string;
  name: string;
  symbol: string;
  icon?: string | null;
  decimals: number;
  usdPrice?: number;
  /** Pool depth in USD. A price with nothing behind it is not a market. */
  liquidity?: number;
  mcap?: number;
  isVerified?: boolean;
}

const tokensApi = () => `${feedBase('jup')}/tokens/v2`;

/**
 * Ask again after a 429, rather than treating it as an outage.
 *
 * Jupiter's free tier is tight, and a rate limit is the endpoint saying "wait",
 * not "the market does not exist". Reporting it as unreachable blanks the whole
 * market list over something that resolves itself in under a second.
 *
 * Bounded and short: three tries at 400ms, 800ms, 1600ms. Beyond that it really
 * is unavailable and the caller should say so.
 */
const RETRY_DELAYS_MS = [400, 800, 1600];

async function getWithBackoff(url: string, signal?: AbortSignal): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i += 1) {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: withTimeout(signal) });
    if (res.status !== 429) return res;
    last = res;
    if (i < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
  }
  return last!;
}


const readTokens = async (url: string, signal?: AbortSignal): Promise<JupToken[]> => {
  let res: Response;
  try {
    res = await getWithBackoff(url, signal);
  } catch (e) {
    throw new JupiterError(`Jupiter token list unreachable: ${(e as Error).message}`);
  }
  if (!res.ok) throw new JupiterError(`Jupiter token list returned ${res.status}`, res.status);
  const body = await res.json();
  return Array.isArray(body) ? (body as JupToken[]) : [];
};

/**
 * Search every token Jupiter can price, by symbol, name or mint address.
 *
 * A duel can be opened on anything with a live price, which is the point — but
 * "anything" includes a great many dead and impersonating tokens. Searching
 * WBTC returns the real one at $79,350 and a fake at $0.0000029 in the same
 * response, so the caller gets `isVerified` and `liquidity` and is expected to
 * rank on them rather than trust the order.
 */
export async function searchTokens(query: string, signal?: AbortSignal): Promise<JupToken[]> {
  const q = query.trim();
  if (!q) return [];
  return readTokens(`${tokensApi()}/search?query=${encodeURIComponent(q)}`, signal);
}

/** Jupiter's verified set — the default list, and every one of them has a logo. */
export async function fetchVerifiedTokens(signal?: AbortSignal): Promise<JupToken[]> {
  return readTokens(`${tokensApi()}/tag?query=verified`, signal);
}

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
    // Same reasoning as the token list: a 429 is "wait", and every major's
    // price is converted against this one call.
    res = await getWithBackoff(url, signal);
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
