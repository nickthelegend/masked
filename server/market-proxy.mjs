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
import { lookup } from 'node:dns/promises';

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
 * Whether an address is one this relay must never fetch.
 *
 * The set of logo CDNs is open — a coin's `image_uri` is whatever its creator
 * pasted, and a single market list here spans ipfs.io, irys, filebase,
 * pbs.twimg.com, storage.googleapis.com and backed.fi. A hostname allowlist
 * cannot be kept complete, and an incomplete one is worse than none: it turns
 * a working logo into a 403 and a letter tile.
 *
 * So the guard is on the *address*, not the name. Anything that resolves into
 * the loopback, link-local, private or reserved ranges is refused, which is
 * what an SSRF guard actually needs to stop — this process runs beside a
 * validator and a signing key, and `http://127.0.0.1:8999` must not be
 * reachable by asking the proxy nicely for a picture of it.
 */
const BLOCKED_V4 = [
  [0, 8], [10, 8], [127, 8], [169, 16], [172, 12], [192, 16], [198, 15], [224, 4], [240, 4],
];

function isPrivateAddress(ip, family) {
  if (family === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd')) return true; // unique-local
    if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    // IPv4-mapped: re-check the embedded address.
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1], 4);
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
  const n = ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
  const inRange = (a, bits) => {
    const base = ((a[0] << 24) >>> 0) + (a[1] << 16) + (a[2] << 8) + a[3];
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (base & mask);
  };
  return (
    inRange([0, 0, 0, 0], 8) ||
    inRange([10, 0, 0, 0], 8) ||
    inRange([100, 64, 0, 0], 10) ||
    inRange([127, 0, 0, 0], 8) ||
    inRange([169, 254, 0, 0], 16) ||
    inRange([172, 16, 0, 0], 12) ||
    inRange([192, 0, 0, 0], 24) ||
    inRange([192, 168, 0, 0], 16) ||
    inRange([198, 18, 0, 0], 15) ||
    inRange([224, 0, 0, 0], 4) ||
    inRange([240, 0, 0, 0], 4)
  );
}

/**
 * A refusal by policy, as distinct from an upstream that failed.
 *
 * These carry their own status so the relay does not answer 502 — "the
 * upstream failed" — about a host it deliberately never contacted. Naming the
 * wrong cause is the same defect as reporting a transaction that was never
 * sent.
 */
class Refused extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Refuse a host that resolves anywhere private. Checked per redirect hop. */
async function assertPublicHost(hostname) {
  let addrs;
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new Refused(400, `${hostname} does not resolve`);
  }
  if (addrs.length === 0) throw new Refused(400, `${hostname} does not resolve`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address, a.family)) {
      throw new Refused(403, `${hostname} resolves to a private address`);
    }
  }
}

/** Biggest logo this will relay. A coin icon is kilobytes. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** Content types this will pass back. An image relay returns images. */
const IMAGE_TYPES = /^image\//;

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
    return send(res, 200, { service: SERVICE, upstreams: Object.keys(ROUTES), imageRelay: '/img?url=' });
  }

  // Relay one logo, for a host that serves servers but refuses browsers.
  if (url.pathname === '/img') {
    const raw = url.searchParams.get('url');
    if (!raw) return send(res, 400, { error: 'missing url' });
    let target;
    try {
      target = new URL(raw);
    } catch {
      return send(res, 400, { error: 'url is not a URL' });
    }
    if (target.protocol !== 'https:') return send(res, 403, { error: 'https only' });
    try {
      // Every hop is checked, not just the first: a public host is free to
      // redirect at 169.254.169.254, and `fetch` would follow it happily.
      let hops = 0;
      let current = target;
      let r;
      for (;;) {
        await assertPublicHost(current.hostname);
        // Deliberately NOT the browser user-agent the JSON routes spoof.
        // pump.fun's API stalls anything that does not look like a browser;
        // ipfs.io does the opposite — it sits behind Cloudflare and answers a
        // plain client with 200 and the spoofed Chrome string with 403,
        // because a Chrome UA arriving without any of Chrome's other headers
        // looks like exactly what it is. The two want opposite things, so the
        // image relay asks as itself.
        r = await fetch(current, {
          headers: { accept: 'image/*', 'user-agent': `${SERVICE}/1.0` },
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (r.status < 300 || r.status >= 400) break;
        const next = r.headers.get('location');
        if (!next || (hops += 1) > 3) break;
        current = new URL(next, current);
        if (current.protocol !== 'https:') {
          return send(res, 403, { error: 'redirected off https' });
        }
      }
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok) return send(res, r.status, { error: `upstream ${current.hostname} ${r.status}` });
      // Refuse anything that is not an image, so this cannot be used to read
      // arbitrary documents off a host that happens to be reachable.
      if (!IMAGE_TYPES.test(type)) return send(res, 415, { error: `not an image: ${type}` });
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) return send(res, 413, { error: 'image too large' });
      cors(res);
      res.writeHead(200, {
        'content-type': type,
        'content-length': String(buf.length),
        // The whole point: served with a policy that lets a page paint it.
        'cross-origin-resource-policy': 'cross-origin',
        'cache-control': 'public, max-age=86400',
      });
      res.end(buf);
      return;
    } catch (e) {
      // A policy refusal keeps its own status; only a genuine upstream
      // failure is a 502.
      if (e instanceof Refused) return send(res, e.status, { error: e.message });
      return send(res, 502, { error: `logo ${target.hostname} failed: ${e?.message ?? e}` });
    }
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
