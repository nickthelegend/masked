/**
 * Mint to logo, resolved once and remembered.
 *
 * Every market list the app fetches already carries an `imageUri`, but only
 * the screen that did the fetching had it. Anything that knew a mint and
 * nothing else — the standings board, the result board, the lock-in card, a
 * settled tape — drew a coloured letter tile instead of the coin's real art,
 * because the leg on chain stores the mint, the symbol and the name and no
 * image. This is the missing lookup: lists deposit what they already know,
 * and anything holding a mint can ask.
 *
 * Nothing here invents an image. A mint the feeds have no art for resolves to
 * null and the caller falls back to its tile, which is the honest outcome and
 * already what `TokenLogo` does.
 */
import { fetchMarket } from './pumpfun';
import { searchTokens } from './jupiter';
import { logoCheckUrl } from './marketEndpoints';

/** mint -> logo URL, or null once a lookup has come back empty. */
const cache = new Map<string, string | null>();
/** In-flight lookups, so ten rows for one mint make one request. */
const inflight = new Map<string, Promise<string | null>>();

/** Subscribers, so a resolved logo repaints the rows already on screen. */
const listeners = new Set<() => void>();

function announce(): void {
  for (const fn of listeners) fn();
}

/** Watch for logos arriving. Returns the unsubscribe. */
export function onLogosChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** What a market list already knows. Cheap, and the reason most rows never fetch. */
export function rememberLogos(
  markets: Array<{ mint: string; imageUri?: string | null }>
): void {
  let added = false;
  for (const m of markets) {
    if (!m.imageUri) continue;
    if (cache.get(m.mint) === m.imageUri) continue;
    cache.set(m.mint, m.imageUri);
    added = true;
  }
  if (added) announce();
}

/** The cached logo, or undefined if this mint has never been looked up. */
export function cachedLogo(mint: string): string | null | undefined {
  return cache.get(mint);
}

/**
 * Resolve a mint's logo, asking the feeds only if nothing has it yet.
 *
 * Tries pump.fun first and Jupiter second, which is the same order the market
 * tabs are in and covers both kinds without the caller having to know which
 * kind a mint is — a tape holds the mint, not the venue.
 */
export async function resolveLogo(mint: string): Promise<string | null> {
  const known = cache.get(mint);
  if (known !== undefined) return known;

  const running = inflight.get(mint);
  if (running) return running;

  const job = (async (): Promise<string | null> => {
    let uri: string | null = null;
    try {
      const coin = await fetchMarket(mint);
      uri = coin?.imageUri ?? null;
    } catch {
      // A refused or rate-limited feed is not an error worth surfacing: the
      // caller has a tile to fall back to, and the next mount tries again.
    }
    if (!uri) {
      try {
        // Jupiter's search accepts a mint and answers with that one token,
        // which is the only per-mint metadata endpoint either feed exposes.
        const [token] = await searchTokens(mint);
        uri = token && token.id === mint ? (token.icon ?? null) : null;
      } catch {
        /* same rule */
      }
    }
    cache.set(mint, uri);
    inflight.delete(mint);
    announce();
    return uri;
  })();

  inflight.set(mint, job);
  return job;
}

/**
 * Whether a logo actually yields an image, checked once per logo URL.
 *
 * `<img src>` is the wrong instrument for finding out. When the URL answers
 * with an HTML page — which is what several tokens' `image_uri` genuinely
 * points at, arweave.net serving a 3 MB document for three of the majors —
 * the element fires `error` and Chrome writes "Failed to load resource" to the
 * console. The fallback tile appears and nothing is broken, but the page has
 * printed an error it cannot suppress.
 *
 * Nor is fetching the image through the relay, which is what this did next: a
 * dead CDN came back 404, a host that refuses servers 403, an HTML page 415 —
 * each handled, and each still a failed request in the network log, one per
 * unshowable logo per page load. The relay's `/img/check` answers the same
 * question with a 200 and the verdict in the body, reading headers only, so an
 * unshowable logo costs one quiet request and a showable one is downloaded
 * once, by the `<img>`, instead of twice.
 *
 * Only a verdict is remembered. If the relay cannot be reached, nothing is
 * cached and the next mount asks again — otherwise a logo first checked during
 * a market-feed outage would stay a tile after the feed came back.
 */
const usable = new Map<string, boolean>();
const checking = new Map<string, Promise<boolean>>();

export function cachedUsable(uri: string): boolean | undefined {
  return usable.get(uri);
}

export async function checkUsable(uri: string): Promise<boolean> {
  const known = usable.get(uri);
  if (known !== undefined) return known;
  const running = checking.get(uri);
  if (running) return running;

  const job = (async () => {
    try {
      const check = logoCheckUrl(uri);
      let ok: boolean;
      if (check) {
        const r = await fetch(check);
        // Not a verdict — the relay itself refused the question — so not remembered.
        if (!r.ok) return false;
        const verdict = (await r.json()) as { usable?: unknown };
        ok = verdict.usable === true;
      } else {
        // Outside a browser there is no relay and no console to protect: the
        // image itself is the thing to ask.
        const r = await fetch(uri);
        ok = r.ok && (r.headers.get('content-type') ?? '').startsWith('image/');
      }
      usable.set(uri, ok);
      return ok;
    } catch {
      // The relay did not answer at all. Not a verdict either.
      return false;
    } finally {
      checking.delete(uri);
    }
  })();

  checking.set(uri, job);
  return job;
}
