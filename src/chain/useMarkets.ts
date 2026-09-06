/**
 * The live market list, for the picker.
 *
 * Two sources, both real HTTP: pump.fun for memes, Jupiter for majors. There
 * is no fallback list — if a source is down the hook says so and the UI shows
 * it, because a canned market with a made-up price is worse than an honest
 * empty state in an app whose whole claim is that the numbers are real.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMajorMarkets, fetchMemeMarkets, type TradableMarket } from './markets';
import type { MarketKind } from './client';

/** How often the list re-prices itself while the picker is open. */
const REFRESH_MS = 20_000;

export interface MarketsState {
  markets: TradableMarket[];
  loading: boolean;
  /** Null when the source answered. A string is shown to the user verbatim. */
  error: string | null;
  refresh: () => void;
}

export function useMarkets(kind: MarketKind, limit = 12): MarketsState {
  const [markets, setMarkets] = useState<TradableMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // A refresh must not blank a list the user is looking at, so the first load
  // and the later re-prices are distinguished.
  const loadedOnce = useRef(false);

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    const load = async () => {
      if (!loadedOnce.current) setLoading(true);
      try {
        const next = kind === 'meme'
          ? await fetchMemeMarkets(limit, ac.signal)
          : await fetchMajorMarkets(ac.signal);
        if (!alive) return;
        setMarkets(next);
        setError(null);
        loadedOnce.current = true;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(id);
    };
  }, [kind, limit, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { markets, loading, error, refresh };
}
