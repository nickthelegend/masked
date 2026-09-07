/**
 * A CORS shim for the two market feeds.
 *
 * pump.fun and Jupiter both answer a server happily and neither sends
 * Access-Control-Allow-Origin, so a browser cannot call either one directly —
 * the request is blocked before it leaves the page. Node scripts talk to them
 * straight; the web app talks to them through here.
 *
 * There are no secrets in this. It exists only because of the same-origin
 * policy, which is why it can be a twenty-line forwarder rather than a backend.
 *
 * It is deliberately not a general proxy. Only two upstream hosts are reachable
 * and only under fixed path prefixes, so pointing it at anything else — an
 * internal address, a metadata endpoint, someone's intranet — returns 403. An
 * open forwarder on a developer's laptop is a genuinely bad thing to leave
 * lying around.
 *
 * Logos are deliberately NOT relayed. That was tried: pump.fun's image_uri
 * points at half a dozen CDNs, and Cloudflare Images — which serves most of
 * them — answers a browser and refuses a server, so proxying broke logos that
 * load fine today. They are loaded directly, and TokenLogo falls back for the
 * ones that are dead upstream.
 *
 *   node server/market-proxy.mjs        # :8788
 *   MARKET_PROXY_PORT=9000 node …
 */
import { createServer } from 'node:http';

// 8788 was the first choice and collided with an unrelated dev server on the
// same machine, which answered the app's market requests with a 401 — so the
// picker correctly reported "pump.fun returned 401" for a service that was
// never pump.fun. A less-travelled port plus the identity check below makes
// that failure mode obvious instead of mysterious.
const PORT = Number(process.env.MARKET_PROXY_PORT ?? 8791);
const TIMEOUT_MS = 12_000;
const SERVICE = 'masked-market-proxy';

/** prefix -> upstream origin. Nothing else is reachable through this. */
const ROUTES = {
  '/pump/': 'https://frontend-api-v3.pump.fun',
  '/jup/': 'https://api.jup.ag',
};

/**
 * pump.fun stalls requests that do not look like a browser, and in a browser
 * the engine sets this header itself — so it only matters here.
 */
const UPSTREAM_HEADERS = {
  accept: 'application/json',
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
};

const cors = (res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
};

const send = (res, status, body) => {
  cors(res);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });

  const url = new URL(req.url, 'http://localhost');

  // Identity, so a client can tell this proxy from whatever else might be
  // listening on the port. The first choice of port belonged to an unrelated
  // dev server, which answered market requests with a 401 — and the app
  // faithfully reported "pump.fun returned 401" about a service that was not
  // pump.fun.
  if (url.pathname === '/whoami') {
    return send(res, 200, { service: SERVICE, upstreams: Object.keys(ROUTES) });
  }

  const entry = Object.entries(ROUTES).find(([prefix]) => url.pathname.startsWith(prefix));
  if (!entry) {
    return send(res, 403, { error: 'not a market route', allowed: Object.keys(ROUTES) });
  }
  const [prefix, origin] = entry;

  // Rebuilt from the parsed path rather than pasted, so `..` and an absolute
  // URL in the path cannot walk out of the prefix.
  const upstream = new URL(url.pathname.slice(prefix.length) + url.search, origin);
  if (upstream.origin !== origin) return send(res, 403, { error: 'path escaped its upstream' });

  try {
    const r = await fetch(upstream, {
      headers: UPSTREAM_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await r.text();
    cors(res);
    res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/json' });
    res.end(body);
  } catch (e) {
    // The upstream's own failure, named, so the UI can show something true.
    send(res, 502, { error: `upstream ${upstream.host} failed: ${e?.message ?? e}` });
  }
});

server.on('error', (e) => {
  // Without this a second copy dies on an unhandled 'error' event and prints a
  // stack trace, which reads like a bug rather than "something is already
  // there" — which, the first time, was true and was not us.
  if (e.code === 'EADDRINUSE') {
    console.error(`port ${PORT} is already in use.`);
    console.error('If that is another copy of this proxy, nothing to do. If it is');
    console.error('something else, set MARKET_PROXY_PORT and EXPO_PUBLIC_MARKET_PROXY to match.');
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`market proxy on http://127.0.0.1:${PORT}`);
  for (const [p, o] of Object.entries(ROUTES)) console.log(`  ${p.padEnd(8)} -> ${o}`);
});
