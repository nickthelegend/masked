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
import { fetchUsdPrices, JupiterError, MAJORS, WSOL_MINT } from './jupiter';
import { pxFromSolPerToken } from './units';
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
  startPx: number;
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
  let startPx: number;
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
  return raw
    .map((m) => toTradable('meme', m, 'pump.fun'))
    .filter((m): m is TradableMarket => m !== null);
}

/**
 * The majors.
 *
 * Jupiter quotes in USD, and the escrow is in SOL, so each price is converted
 * through SOL/USD from the same response — one round trip, one consistent
 * snapshot, no chance of pricing SOL from one moment and USDC from another.
 */
export async function fetchMajorMarkets(signal?: AbortSignal): Promise<TradableMarket[]> {
  const prices = await fetchUsdPrices(MAJORS.map((m) => m.mint), signal);
  const solUsd = prices.get(WSOL_MINT)?.usdPrice;
  if (!solUsd) throw new JupiterError('Jupiter returned no SOL price to convert against');

  return MAJORS.flatMap((meta) => {
    const p = prices.get(meta.mint);
    if (!p) return [];
    const t = toTradable(
      'major',
      {
        mint: meta.mint,
        symbol: meta.symbol,
        name: meta.name,
        imageUri: null,
        priceSol: p.usdPrice / solUsd,
        priceUsd: p.usdPrice,
        usdMarketCap: 0,
      },
      'jupiter'
    );
    return t ? [t] : [];
  });
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
): Promise<number> {
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
