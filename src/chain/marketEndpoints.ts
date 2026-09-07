/**
 * Where the market feeds are reached from, which depends on who is asking.
 *
 * pump.fun and Jupiter both answer a server directly and neither sends
 * Access-Control-Allow-Origin, so in a browser the request never leaves the
 * page. Node scripts therefore call them straight and the web app calls them
 * through `server/market-proxy.mjs`, which does nothing but add the header.
 *
 * No secret is involved either way — the proxy exists for the same-origin
 * policy and nothing else, which is why it can be swapped for a CDN rule or a
 * rewrite in production without changing a line of this app.
 */

/** Upstreams, for anything that is not a browser. */
const DIRECT = {
  pump: 'https://frontend-api-v3.pump.fun',
  jup: 'https://api.jup.ag',
} as const;

export type Feed = keyof typeof DIRECT;

/** True in a browser, including react-native-web. */
const inBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

/**
 * Proxy base. Override for a deployment that fronts the feeds somewhere else;
 * the default is what `npm run proxy` listens on.
 */
const PROXY_BASE =
  process.env.EXPO_PUBLIC_MARKET_PROXY?.replace(/\/$/, '') || 'http://127.0.0.1:8788';

/** Base URL for a feed, for the runtime we are actually in. */
export function feedBase(feed: Feed): string {
  return inBrowser ? `${PROXY_BASE}/${feed}` : DIRECT[feed];
}

/** True when this runtime needs the proxy — the UI says so when it is missing. */
export const usesProxy = inBrowser;
export const proxyBase = PROXY_BASE;

/**
 * A logo URL the browser can actually load.
 *
 * pump.fun's `image_uri` points at whichever CDN the coin's creator used —
 * imagedelivery.net, ipfs.io, pbs.twimg.com, irys, and others — and several of
 * them answer a cross-origin `<img>` with a 403 or a Cross-Origin-Resource-Policy
 * that blocks it. The image still fails silently behind a fallback tile, but it
 * fails *loudly* in the console, once per broken logo per page load.
 *
 * Fetched through the proxy instead, the failure happens server-side and the
 * page sees a clean 502 it can fall back from without printing anything.
 * Outside a browser there is no such policy, so the URL is used as-is.
 */
export function logoUrl(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (!inBrowser) return uri;
  return `${PROXY_BASE}/img?url=${encodeURIComponent(uri)}`;
}
