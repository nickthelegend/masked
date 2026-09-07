/**
 * Live pump.fun market data.
 *
 * Real HTTP calls to pump.fun's public API — real mints, real symbols, real
 * logo images, and a price derived from each token's actual bonding-curve
 * reserves. Nothing here is a fixture; if the API is unreachable the hook says
 * so rather than serving a canned list.
 *
 * **What this is and is not.** A duel is fought over a *price series*, and
 * positions are virtual inventory — no SPL is swapped mid-round, because a
 * public swap print would hand the opponent the fills the fog exists to hide.
 * So a pump.fun mint here identifies the market and supplies the mark price;
 * it is not custodied and the duel is not routed through their bonding curve.
 * The UI says so.
 */

import { feedBase } from './marketEndpoints';

/** Direct from a script, through the CORS shim in a browser. */
const api = () => feedBase('pump');

/** Never let a hung request stall a render or a script. */
const TIMEOUT_MS = 12_000;

/**
 * The API stalls for clients that do not look like a browser, so requests
 * carry a browser Accept/User-Agent pair. (In a browser the UA header is
 * set by the engine and this value is ignored.)
 */
const HEADERS: Record<string, string> = {
  accept: 'application/json',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};

/** Merge a caller's abort signal with our own timeout. */
const withTimeout = (signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS);

/** pump.fun mints use 6 decimals; SOL reserves are lamports. */
const TOKEN_DECIMALS = 6;
const LAMPORTS = 1e9;

export interface PumpMarket {
  mint: string;
  symbol: string;
  name: string;
  /** Remote logo served by pump.fun. */
  imageUri: string | null;
  /** Price in SOL per token, from the bonding curve. */
  priceSol: number;
  /** Price in USD, derived from the same reserves and the USD market cap. */
  priceUsd: number;
  usdMarketCap: number;
  /** True once the curve has completed and it has migrated to a pool. */
  complete: boolean;
}

/**
 * Spot price in SOL per token, from the market cap pump.fun publishes.
 *
 * The obvious route — SOL reserves over token reserves — is right only while a
 * coin is still on its bonding curve. Once it graduates to a pool, `complete`
 * flips and the virtual reserves freeze at the graduation constants, so every
 * graduated coin reports the identical price (2.796e-8 SOL) forever. Those are
 * exactly the coins anyone has heard of, so a list priced that way is a list of
 * the same wrong number repeated.
 *
 * Market cap over supply is live in both phases, and while a coin *is* on its
 * curve it agrees with the reserve ratio to the last digit — checked against
 * the live API, not assumed. It is also the number pump.fun's own UI shows.
 */
export function priceFromMarketCap(marketCapSol: number, totalSupply: number, decimals: number): number {
  const supply = totalSupply / 10 ** decimals;
  return supply > 0 ? marketCapSol / supply : 0;
}

/**
 * The bonding-curve spot price, for a coin still on its curve.
 *
 * Kept because it is the definitional price and `check:pumpfun` asserts the
 * two agree — the day they stop agreeing, something has changed upstream and
 * we want the check to say so.
 */
export function priceFromReserves(virtualSolReserves: number, virtualTokenReserves: number): number {
  if (!virtualTokenReserves) return 0;
  const sol = virtualSolReserves / LAMPORTS;
  const tokens = virtualTokenReserves / 10 ** TOKEN_DECIMALS;
  return tokens === 0 ? 0 : sol / tokens;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function toMarket(c: any): PumpMarket | null {
  if (!c?.mint || !c?.symbol) return null;
  const decimals = Number(c.base_decimals ?? TOKEN_DECIMALS);
  const supplyRaw = Number(c.total_supply);
  const priceSol = priceFromMarketCap(Number(c.market_cap), supplyRaw, decimals);
  const supply = supplyRaw / 10 ** decimals;
  const usdMarketCap = Number(c.usd_market_cap) || 0;
  // The USD price comes off the same cap the SOL price does, so the two
  // numbers on screen cannot disagree with each other.
  const priceUsd = supply > 0 && usdMarketCap > 0 ? usdMarketCap / supply : 0;

  return {
    mint: String(c.mint),
    symbol: String(c.symbol).slice(0, 10).toUpperCase(),
    name: String(c.name ?? c.symbol),
    imageUri: c.image_uri ? String(c.image_uri) : null,
    priceSol,
    priceUsd,
    usdMarketCap,
    complete: !!c.complete,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PumpFunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PumpFunError';
  }
}

/**
 * Top markets by market cap. Throws on failure — callers surface the error
 * rather than substituting placeholder tokens.
 */
export async function fetchTopMarkets(limit = 12, signal?: AbortSignal): Promise<PumpMarket[]> {
  const url = `${api()}/coins?limit=${limit}&sort=market_cap&order=DESC&includeNsfw=false`;
  const res = await fetch(url, { signal: withTimeout(signal), headers: HEADERS });
  if (!res.ok) throw new PumpFunError(`pump.fun returned ${res.status}`);

  const body = await res.json();
  if (!Array.isArray(body)) throw new PumpFunError('pump.fun returned an unexpected shape');

  const markets = body
    .map(toMarket)
    .filter((m): m is PumpMarket => m !== null && m.priceSol > 0 && m.usdMarketCap > 0);
  if (markets.length === 0) throw new PumpFunError('pump.fun returned no usable markets');
  return markets;
}

/** A single market by mint, for refreshing the price of a live duel. */
export async function fetchMarket(mint: string, signal?: AbortSignal): Promise<PumpMarket | null> {
  const res = await fetch(`${api()}/coins/${mint}`, { signal: withTimeout(signal), headers: HEADERS });
  if (!res.ok) return null;
  return toMarket(await res.json());
}
