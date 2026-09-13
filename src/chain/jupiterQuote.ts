/**
 * What a real venue would have done with the same fill.
 *
 * A duel's fills never touch a public venue: each player trades their own
 * private constant-product book inside their sealed position, because a public
 * swap would print the wallet, the mint and the size for the opponent to read.
 * That book is a model, seeded from the mark. This asks Jupiter — real routes,
 * real liquidity, right now — what the same size would have cost or paid, so
 * the book's price can be read against the market's instead of taken on trust.
 *
 * Nothing is routed. A quote is a read; no transaction is built or signed.
 */
import { feedBase } from './marketEndpoints';
import { JupiterError, searchTokens, WSOL_MINT } from './jupiter';

export interface VenueQuote {
  /** SOL per token the route would execute at, its own impact included. */
  priceSol: number;
  /** Pools the route crosses. */
  hops: number;
}

export type VenueAnswer = { kind: 'quote'; quote: VenueQuote } | { kind: 'no-route'; reason: string };

const QUOTE_TIMEOUT_MS = 8_000;

/** Decimals change never; asked once per mint. */
const decimals = new Map<string, number>();

async function decimalsOf(mint: string, signal?: AbortSignal): Promise<number | null> {
  const known = decimals.get(mint);
  if (known !== undefined) return known;
  const hit = (await searchTokens(mint, signal)).find((t) => t.id === mint);
  if (!hit || !Number.isFinite(hit.decimals)) return null;
  decimals.set(mint, hit.decimals);
  return hit.decimals;
}

/** Jupiter saying there is no market, as distinct from Jupiter failing. */
const NO_ROUTE = /COULD_NOT_FIND_ANY_ROUTE|NO_ROUTES_FOUND|TOKEN_NOT_TRADABLE|not tradable/i;

/**
 * Jupiter's quote for the fill just made: the same SOL in for a buy, the same
 * tokens in for a sell.
 *
 * Resolves `no-route` for a market Jupiter cannot trade — a pump.fun coin
 * still on its bonding curve, say — or one that is SOL itself. Throws only when
 * Jupiter could not be asked.
 */
export async function quoteSameFill(
  fill: { mint: string; side: 'buy' | 'sell'; lamports: number; tokens: number },
  signal?: AbortSignal
): Promise<VenueAnswer> {
  if (fill.mint === WSOL_MINT) return { kind: 'no-route', reason: 'NOTHING TO COMPARE: THIS MARKET IS SOL ITSELF' };
  const d = await decimalsOf(fill.mint, signal);
  if (d === null) return { kind: 'no-route', reason: 'JUPITER DOES NOT LIST THIS TOKEN' };

  const buy = fill.side === 'buy';
  const amount = buy ? Math.round(fill.lamports) : Math.round(fill.tokens * 10 ** d);
  if (amount <= 0) return { kind: 'no-route', reason: 'TOO SMALL A FILL TO QUOTE' };

  const params = new URLSearchParams({
    inputMint: buy ? WSOL_MINT : fill.mint,
    outputMint: buy ? fill.mint : WSOL_MINT,
    amount: String(amount),
    slippageBps: '50',
  });
  const timeout = AbortSignal.timeout(QUOTE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${feedBase('jup')}/swap/v1/quote?${params}`, {
      headers: { accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    throw new JupiterError(`Jupiter's quote did not answer: ${(e as Error).message}`);
  }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const body: any = await res.json().catch(() => null);
  if (!res.ok) {
    const code = String(body?.errorCode ?? body?.error ?? `HTTP ${res.status}`);
    if (NO_ROUTE.test(code)) return { kind: 'no-route', reason: 'JUPITER HAS NO ROUTE FOR THIS TOKEN' };
    throw new JupiterError(`Jupiter's quote returned ${code}`, res.status);
  }

  const out = Number(body?.outAmount);
  if (!Number.isFinite(out) || out <= 0) return { kind: 'no-route', reason: 'JUPITER QUOTED NOTHING BACK' };
  const tokens = buy ? out / 10 ** d : fill.tokens;
  const sol = buy ? fill.lamports / 1e9 : out / 1e9;
  if (tokens <= 0) return { kind: 'no-route', reason: 'JUPITER QUOTED NOTHING BACK' };
  return {
    kind: 'quote',
    quote: { priceSol: sol / tokens, hops: Array.isArray(body?.routePlan) ? body.routePlan.length : 0 },
  };
}
