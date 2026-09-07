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
 * It also serves token logos, at /img?url=… , for the same reason and one
 * more: pump.fun's image_uri points at half a dozen third-party CDNs, and
 * several of them answer a browser with a 403 or a Cross-Origin-Resource-Policy
 * that blocks the load. Fetched server-side and re-served, every logo either
 * arrives or fails once, here, instead of printing an error into the console of
 * every visitor.
 *
 *   node server/market-proxy.mjs        # :8788
 *   MARKET_PROXY_PORT=9000 node …
 */
import { createServer } from 'node:http';

const PORT = Number(process.env.MARKET_PROXY_PORT ?? 8788);
const TIMEOUT_MS = 12_000;

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

/** Largest logo we will relay. Anything bigger is not a token icon. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Refuse anything that could be used to reach inside the network this runs on.
 *
 * The image URL comes from pump.fun's feed, so it is attacker-influenced by
 * definition: anyone can list a coin whose logo points at 169.254.169.254 or a
 * host on the operator's LAN, and a proxy that fetched it would hand back the
 * response. Hostnames are checked rather than resolved addresses, which stops
 * the obvious cases; a deployment on a network where this matters should put
 * egress rules in front of it as well.
 */
function isPrivateHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 || a === 127 || a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function relayImage(res, raw) {
  let target;
  try {
    target = new URL(raw);
  } catch {
    return send(res, 400, { error: 'url is not a URL' });
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return send(res, 403, { error: 'only http(s) images' });
  }
  if (isPrivateHost(target.hostname)) return send(res, 403, { error: 'refusing a private address' });

  let r;
  try {
    r = await fetch(target, {
      headers: { accept: 'image/*', 'user-agent': UPSTREAM_HEADERS['user-agent'] },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (e) {
    return send(res, 502, { error: `image fetch failed: ${e?.message ?? e}` });
  }
  if (!r.ok) return send(res, r.status, { error: `image upstream returned ${r.status}` });

  const type = r.headers.get('content-type') ?? '';
  if (!type.startsWith('image/')) return send(res, 415, { error: `not an image: ${type || 'no content-type'}` });

  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) return send(res, 413, { error: 'image too large' });

  cors(res);
  res.writeHead(200, {
    'content-type': type,
    'content-length': String(buf.byteLength),
    // Logos do not change. Caching keeps a scrolling list off the network.
    'cache-control': 'public, max-age=86400',
  });
  res.end(buf);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'GET only' });

  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/img') {
    const raw = url.searchParams.get('url');
    if (!raw) return send(res, 400, { error: 'need ?url=' });
    return relayImage(res, raw);
  }

  const entry = Object.entries(ROUTES).find(([prefix]) => url.pathname.startsWith(prefix));
  if (!entry) {
    return send(res, 403, { error: 'not a market route', allowed: [...Object.keys(ROUTES), '/img'] });
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`market proxy on http://127.0.0.1:${PORT}`);
  for (const [p, o] of Object.entries(ROUTES)) console.log(`  ${p.padEnd(8)} -> ${o}`);
  console.log(`  ${'/img'.padEnd(8)} -> any public image host, re-served with CORS`);
});
