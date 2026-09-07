/**
 * The live market list, for the picker.
 *
 * Two sources, both real HTTP: pump.fun for memes, Jupiter for majors. There
 * is no fallback list — if a source is down the hook says so and the UI shows
 * it, because a canned market with a made-up price is worse than an honest
 * empty state in an app whose whole claim is that the numbers are real.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMajorMarkets, fetchMemeMarkets, searchMarkets, type TradableMarket } from './markets';
import type { MarketKind } from './client';
import { explainRead } from './errors';

/** How often the list re-prices itself while the picker is open. */
const REFRESH_MS = 20_000;

/**
 * Wait after the last keystroke before searching.
 *
 * A request per character is both a bad list — results churning under the
 * cursor — and a fast route to an HTTP 429 from Jupiter.
 */
const SEARCH_DEBOUNCE_MS = 300;

export interface MarketsState {
  markets: TradableMarket[];
  loading: boolean;
  /** True while a search query is being resolved, as distinct from a refresh. */
  searching: boolean;
  /** Null when the source answered. A string is shown to the user verbatim. */
  error: string | null;
  refresh: () => void;
}

/**
 * @param query Free-text search. Empty falls back to the curated list for
 *   `kind`; anything else searches the whole priced universe.
 */
export function useMarkets(kind: MarketKind, limit = 12, query = ''): MarketsState {
  const [markets, setMarkets] = useState<TradableMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // A refresh must not blank a list the user is looking at, so the first load
  // and the later re-prices are distinguished.
  const loadedOnce = useRef(false);

  const [searching, setSearching] = useState(false);
  const trimmed = query.trim();

  useEffect(() => {
    const ac = new AbortController();
    let alive = true;

    const load = async () => {
      if (!loadedOnce.current) setLoading(true);
      if (trimmed) setSearching(true);
      try {
        const next = trimmed
          ? await searchMarkets(trimmed, ac.signal)
          : kind === 'meme'
            ? await fetchMemeMarkets(limit, ac.signal)
            : await fetchMajorMarkets(ac.signal);
        if (!alive) return;
        setMarkets(next);
        setError(null);
        loadedOnce.current = true;
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setError(explainRead(e, 'Could not reach the price service.'));
      } finally {
        if (alive) {
          setLoading(false);
          setSearching(false);
        }
      }
    };

    // A search waits for the typing to stop; a plain list does not, because
    // there was no keystroke to wait for.
    const debounce = trimmed ? setTimeout(load, SEARCH_DEBOUNCE_MS) : (void load(), undefined);

    // Search results are a snapshot of what was asked for, so they are not
    // re-polled — re-pricing them under the cursor would reorder the list
    // somebody is trying to click.
    const id = trimmed ? undefined : setInterval(load, REFRESH_MS);

    return () => {
      alive = false;
      ac.abort();
      if (debounce) clearTimeout(debounce);
      if (id) clearInterval(id);
    };
  }, [kind, limit, nonce, trimmed]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { markets, loading, searching, error, refresh };
}
