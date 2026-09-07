/**
 * Every market a duel can be fought over, from both live sources.
 *
 * Memes come from pump.fun's bonding curves, majors from Jupiter. Both are
 * mark-price feeds and nothing more: the fill itself happens on each player's
 * own private book inside their sealed Position, never on a public venue.
 * Routing a battle fill through pump.fun or a Jupiter swap would print the
 * wallet, the mint and the size on a public chain — which is precisely the
 * information the round exists to hide.
 */
import { fetchMarket, fetchTopMarkets, PumpFunError, type PumpMarket } from './pumpfun';
import {
  fetchUsdPrices,
  fetchVerifiedTokens,
  JupiterError,
  searchTokens,
  WSOL_MINT,
  type JupToken,
} from './jupiter';
import { pxFromSolPerToken } from './units';
import { rememberLogos } from './logos';
import type { MarketKind } from './client';

export interface TradableMarket {
  kind: MarketKind;
  mint: string;
  symbol: string;
  name: string;
  /**
   * Remote logo, exactly as the feed published it.
   *
   * Loaded straight from whichever CDN the coin's creator used. Relaying these
   * through our own proxy was tried and is worse: Cloudflare Images serves a
   * browser and refuses a server, so proxying breaks logos that currently work.
   * Some fraction of them are dead upstream regardless — see TokenLogo, which
   * falls back rather than showing a broken image.
   */
  imageUri: string | null;
  /** SOL per token. */
  priceSol: number;
  /** USD per token. */
  priceUsd: number;
  /** Opening mark as the program stores it. See units.ts. */
  startPx: bigint;
  /** Where the mark came from, shown in the UI so it is never a mystery. */
  source: 'pump.fun' | 'jupiter';
  /** Rough size signal, for ordering. USD market cap for memes. */
  usdMarketCap: number;
}

const toTradable = (
  kind: MarketKind,
  m: { mint: string; symbol: string; name: string; imageUri: string | null; priceSol: number; priceUsd: number; usdMarketCap: number },
  source: TradableMarket['source']
): TradableMarket | null => {
  let startPx: bigint;
  try {
    startPx = pxFromSolPerToken(m.priceSol);
  } catch {
    // Priced below what a u64 px can carry. Drop it rather than list a market
    // create_match would reject.
    return null;
  }
  return {
    kind,
    mint: m.mint,
    symbol: m.symbol,
    name: m.name,
    imageUri: m.imageUri,
    priceSol: m.priceSol,
    priceUsd: m.priceUsd,
    startPx,
    source,
    usdMarketCap: m.usdMarketCap,
  };
};

/** Live meme markets, most valuable first. */
export async function fetchMemeMarkets(limit = 12, signal?: AbortSignal): Promise<TradableMarket[]> {
  const raw: PumpMarket[] = await fetchTopMarkets(limit, signal);
  const markets = raw
    .map((m) => toTradable('meme', m, 'pump.fun'))
    .filter((m): m is TradableMarket => m !== null);
  // Every list deposits what it already knows, so a board that only has a
  // mint never has to go and ask for art this call already had in hand.
  rememberLogos(markets);
  return markets;
}

/**
 * The majors.
 *
 * Jupiter quotes in USD, and the escrow is in SOL, so each price is converted
 * through SOL/USD from the same response — one round trip, one consistent
 * snapshot, no chance of pricing SOL from one moment and USDC from another.
 */
/** Enough depth that the price means something. Below this a duel is a coin flip. */
const MIN_LIQUIDITY_USD = 25_000;

/**
 * A Jupiter token to something a duel can be opened on.
 *
 * Returns null when the token has no usable price, or when the price is so
 * large that `px` would not fit a u64 — `toTradable` decides that, and the
 * caller drops it rather than listing a market `create_match` would reject.
 */
const fromJupToken = (t: JupToken, solUsd: number): TradableMarket | null => {
  if (!t.usdPrice || t.usdPrice <= 0) return null;
  return toTradable(
    'major',
    {
      mint: t.id,
      symbol: t.symbol,
      name: t.name,
      // The logo Jupiter publishes. The majors list used to hardcode null
      // here, which is why SOL and USDC rendered as letter tiles next to
      // memecoins that had real art.
      imageUri: t.icon ?? null,
      priceSol: t.usdPrice / solUsd,
      priceUsd: t.usdPrice,
      usdMarketCap: t.mcap ?? 0,
    },
    'jupiter'
  );
};

/**
 * SOL in dollars, which every Jupiter price is converted against.
 *
 * Cached for a few seconds, because it is the same number for every token
 * priced in the same instant. Fetching it per search — which is what a
 * keystroke does — earned an HTTP 429 from Jupiter almost immediately, and a
 * rate-limited price feed is a market list that stops existing.
 */
let solUsdCache: { value: number; at: number } | null = null;
const SOL_PRICE_TTL_MS = 10_000;

const solPriceUsd = async (signal?: AbortSignal): Promise<number> => {
  const now = Date.now();
  if (solUsdCache && now - solUsdCache.at < SOL_PRICE_TTL_MS) return solUsdCache.value;
  const prices = await fetchUsdPrices([WSOL_MINT], signal);
  const solUsd = prices.get(WSOL_MINT)?.usdPrice;
  if (!solUsd) throw new JupiterError('Jupiter returned no SOL price to convert against');
  solUsdCache = { value: solUsd, at: now };
  return solUsd;
};

/**
 * The verified set, biggest first.
 *
 * This used to be a hardcoded pair — SOL and USDC — with no logos. It is now
 * whatever Jupiter marks verified, which is every major worth duelling on and
 * each one carries its own icon.
 */
/**
 * The verified list, cached.
 *
 * It is thousands of tokens and it changes on the order of days, while a
 * search box fires on every keystroke. Re-fetching it per query earned an
 * immediate HTTP 429 from Jupiter, which turns the market list into an empty
 * screen — so it is fetched once and reused, and search runs against the copy.
 */
let verifiedCache: { tokens: JupToken[]; at: number } | null = null;
const VERIFIED_TTL_MS = 5 * 60_000;

const verifiedTokens = async (signal?: AbortSignal): Promise<JupToken[]> => {
  const now = Date.now();
  if (verifiedCache && now - verifiedCache.at < VERIFIED_TTL_MS) return verifiedCache.tokens;
  const tokens = await fetchVerifiedTokens(signal);
  verifiedCache = { tokens, at: now };
  return tokens;
};

export async function fetchMajorMarkets(signal?: AbortSignal): Promise<TradableMarket[]> {
  const [solUsd, tokens] = await Promise.all([solPriceUsd(signal), verifiedTokens(signal)]);
  const markets = tokens
    .map((t) => fromJupToken(t, solUsd))
    .filter((m): m is TradableMarket => m !== null)
    .sort((a, b) => b.usdMarketCap - a.usdMarketCap)
    .slice(0, 40);
  rememberLogos(markets);
  return markets;
}

/**
 * Any token, by symbol, name or mint address.
 *
 * The universe is deliberately not curated — you can duel on anything with a
 * live price. What is curated is the *order*: verified and liquid first,
 * because a search for WBTC returns the real one at $79,350 and an
 * impersonator at $0.0000029 in the same response, and the impersonator is not
 * always second.
 *
 * Nothing is hidden. A token that is unverified or thin still appears, so a
 * brand-new mint can be pasted in and traded — it simply does not outrank a
 * real market.
 */
export async function searchMarkets(
  query: string,
  signal?: AbortSignal
): Promise<TradableMarket[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const solUsd = await solPriceUsd(signal);
  const needle = q.toLowerCase();

  // The cached verified list answers most queries without touching the
  // network — and it is the half of the universe worth ranking first anyway.
  const local = (await verifiedTokens(signal).catch(() => [])).filter(
    (t) =>
      t.symbol?.toLowerCase().includes(needle) ||
      t.name?.toLowerCase().includes(needle) ||
      t.id === q
  );

  // Only ask Jupiter when the local copy cannot answer: a brand-new memecoin,
  // or a pasted mint address. That is exactly the case worth a request, and it
  // is rare enough not to be rate limited.
  const remote = local.length >= 8 ? [] : await searchTokens(q, signal).catch(() => []);

  const byMint = new Map<string, JupToken>();
  for (const t of [...local, ...remote]) if (t?.id) byMint.set(t.id, t);
  const tokens = [...byMint.values()];

  const scored = tokens
    .map((t) => ({ token: t, market: fromJupToken(t, solUsd) }))
    .filter((x): x is { token: JupToken; market: TradableMarket } => x.market !== null);

  // Exactness first, then trust, then depth.
  //
  // Trust alone put `bonkSOL` above `Bonk` for the query "bonk", because both
  // are verified and the wrapper is deeper. Somebody typing a ticker means
  // that ticker, so an exact symbol match — or a pasted mint — outranks
  // everything, and the rest is ordered by whether it can be believed.
  const rank = (x: (typeof scored)[number]) => {
    // Leading `$` stripped: several well-known memecoins are ticketed "$WIF",
    // "$MASK" and so on, and nobody types the dollar sign when searching.
    const symbol = (x.token.symbol?.toLowerCase() ?? '').replace(/^\$/, '');
    let score = 0;
    if (x.token.id === q) score += 100;
    if (symbol === needle) score += 50;
    // A prefix match is weak evidence on its own. "btc" put BTCBANK, worth
    // $0.0000165, above WBTC purely because it starts with the letters — so a
    // prefix is worth less than being verified and deep, and only breaks ties
    // between markets that are equally believable.
    else if (symbol.startsWith(needle)) score += 3;
    if (x.token.isVerified) score += 8;
    if ((x.token.liquidity ?? 0) >= MIN_LIQUIDITY_USD) score += 6;
    return score;
  };

  const results = scored
    .sort((a, b) => {
      const byRank = rank(b) - rank(a);
      if (byRank !== 0) return byRank;
      return (b.token.liquidity ?? 0) - (a.token.liquidity ?? 0);
    })
    .map((x) => x.market)
    .slice(0, 25);
  rememberLogos(results);
  return results;
}

/**
 * The market's price right now, as the program's `px`.
 *
 * The picker's list is a snapshot that refreshes every 20 seconds, and it goes
 * stale the moment the feed stops answering — which it does. Opening a match
 * against a cached number would set the round's whole starting mark from a
 * price of unknown age, so both the crank and `create_match` come through
 * here instead.
 *
 * Throws rather than falling back. A duel that opens at a made-up mark is
 * worse than one that does not open.
 */
export async function livePxFor(
  market: Pick<TradableMarket, 'kind' | 'mint'>,
  signal?: AbortSignal
): Promise<bigint> {
  if (market.kind === 'meme') {
    const live = await fetchMarket(market.mint, signal);
    if (!live || live.priceSol <= 0) {
      throw new PumpFunError(`pump.fun has no live price for ${market.mint}`);
    }
    return pxFromSolPerToken(live.priceSol);
  }

  const prices = await fetchUsdPrices([market.mint, WSOL_MINT], signal);
  const usd = prices.get(market.mint)?.usdPrice;
  const solUsd = prices.get(WSOL_MINT)?.usdPrice;
  if (!usd || !solUsd) throw new JupiterError(`jupiter has no live price for ${market.mint}`);
  return pxFromSolPerToken(usd / solUsd);
}

export { PumpFunError, JupiterError };
