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
 * It is deliberately not a general proxy. The JSON routes reach two upstream
 * hosts, only under fixed path prefixes, so pointing them at anything else
 * returns 403. The logo relay reaches any public host but returns only images,
 * and refuses anything that resolves to an internal address or a metadata
 * endpoint. An open forwarder on a developer's laptop is a genuinely bad thing
 * to leave lying around.
 *
 * Logos go through `/img/check` (a yes-or-no verdict) and then `/img` (the
 * bytes, with CORP set so a page can paint them). A logo the relay cannot
 * fetch gets a "no", and TokenLogo shows its letter tile. Two kinds it used to
 * refuse are recovered: an image served with no content type, and an IPFS
 * logo whose pasted gateway blocks servers (see `fetchLogo`).
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
// A hosting platform (Railway, and most others) assigns the port in PORT and
// routes to it from outside, so under PORT the proxy listens on every
// interface. Run locally, it stays on 127.0.0.1:8791 as before.
const PORT = Number(process.env.MARKET_PROXY_PORT ?? process.env.PORT ?? 8791);
const HOST = process.env.MARKET_PROXY_HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
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
 * No content type at all, or the generic byte-stream one.
 *
 * arweave.net serves the TRUMP, PENGU and YZY logos this way: real JPEG and
 * PNG bytes under no `content-type`. Refusing them as "not an image" put a
 * letter tile on three of the best-known tokens in the list. For these, and
 * only these, the first bytes decide.
 */
const UNTYPED = /^(|application\/octet-stream|binary\/octet-stream)$/;

/**
 * A raster format recognised by its signature, or null.
 *
 * Raster only, on purpose: an SVG or HTML body sniffed as an image is exactly
 * the document relay the IMAGE_TYPES check exists to refuse.
 */
function sniffImageType(b) {
  const at = (i, bytes) => b.length >= i + bytes.length && bytes.every((x, k) => b[i + k] === x);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  if (at(4, [0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69])) return 'image/avif';
  return null;
}

/**
 * Public IPFS gateways to ask when the one in the URL will not answer.
 *
 * An IPFS logo is content-addressed, so any gateway serves the same bytes. The
 * ones creators paste are the busy ones — ipfs.io, dweb.link, nftstorage.link —
 * and those answer this relay 403 "blocked" or 429, which left PUMP, $WIF,
 * cbBTC and Fartcoin as letter tiles. These two served every one of them.
 */
const IPFS_FALLBACKS = ['https://ipfs.filebase.io', 'https://gateway.pinata.cloud'];
const CID = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})$/;
const SAFE_SUBPATH = /^(\/[A-Za-z0-9_.-]+)*$/;

/** `/ipfs/<cid>[/path]` for a path-style or subdomain-style gateway URL, else null. */
function ipfsPath(u) {
  let cid;
  let rest;
  const m = u.pathname.match(/^\/ipfs\/([^/]+)(\/.*)?$/);
  if (m) {
    cid = m[1];
    rest = m[2] ?? '';
  } else {
    const [first, second] = u.hostname.split('.');
    if (second !== 'ipfs') return null;
    cid = first;
    rest = u.pathname === '/' ? '' : u.pathname;
  }
  if (!CID.test(cid) || !SAFE_SUBPATH.test(rest) || rest.split('/').includes('..')) return null;
  return `/ipfs/${cid}${rest}`;
}

/** Up to `n` bytes from the start of a body; the rest of it is abandoned. */
async function firstBytes(r, n) {
  if (!r.body) return new Uint8Array(0);
  const reader = r.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < n) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).subarray(0, n);
}

/**
 * A logo, from its own URL or, for IPFS, from another gateway.
 *
 * `full` downloads the bytes, for `/img`; otherwise only enough of an untyped
 * body is read to recognise it, for `/img/check`. Returns
 * `{ ok: true, type, buf, host }`, or `{ ok: false, status, reason }` for the
 * last candidate that failed. A policy refusal still throws `Refused`.
 */
async function fetchLogo(target, { full }) {
  const path = ipfsPath(target);
  const candidates = [
    target,
    ...(path ? IPFS_FALLBACKS.map((g) => new URL(path, g)).filter((u) => u.hostname !== target.hostname) : []),
  ];
  let failure = { status: 502, reason: `logo ${target.hostname} failed` };
  for (const candidate of candidates) {
    let r;
    let current;
    try {
      ({ r, current } = await resolveImage(candidate));
    } catch (e) {
      if (e instanceof Refused) throw e;
      failure = { status: 502, reason: `logo ${candidate.hostname} failed: ${e?.message ?? e}` };
      continue;
    }
    const declared = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const untyped = UNTYPED.test(declared);
    if (!r.ok || (!IMAGE_TYPES.test(declared) && !untyped)) {
      await r.body?.cancel().catch(() => {});
      failure = r.ok
        ? { status: 415, reason: `not an image: ${declared}` }
        : { status: r.status, reason: `upstream ${current.hostname} ${r.status}` };
      continue;
    }
    if (Number(r.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) {
      await r.body?.cancel().catch(() => {});
      failure = { status: 413, reason: 'image too large' };
      continue;
    }
    let buf = null;
    let type = untyped ? null : declared;
    try {
      if (full) {
        buf = Buffer.from(await r.arrayBuffer());
        if (untyped) type = sniffImageType(buf);
      } else if (untyped) {
        type = sniffImageType(await firstBytes(r, 16));
      } else {
        await r.body?.cancel().catch(() => {});
      }
    } catch (e) {
      failure = { status: 502, reason: `logo ${current.hostname} failed: ${e?.message ?? e}` };
      continue;
    }
    if (!type) {
      failure = { status: 415, reason: `not an image: ${declared}` };
      continue;
    }
    if (buf && buf.length > MAX_IMAGE_BYTES) {
      failure = { status: 413, reason: 'image too large' };
      continue;
    }
    // The gateway asked, not wherever it redirected: arweave and irys bounce
    // every logo to a sandbox subdomain of their own, which is not a fallback.
    return { ok: true, type, buf, host: candidate.hostname };
  }
  return { ok: false, ...failure };
}

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

/**
 * Follow a logo URL to its final response, refusing anything private.
 *
 * Shared by `/img`, which relays the bytes, and `/img/check`, which only says
 * whether there are bytes worth relaying. Returns the final response and the
 * URL it came from; throws `Refused` for a policy refusal.
 */
async function resolveImage(target) {
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
    if (current.protocol !== 'https:') throw new Refused(403, 'redirected off https');
  }
  return { r, current };
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

  // Identity, so a client can tell this proxy from whatever else might be
  // listening on the port. The first choice of port belonged to an unrelated
  // dev server, which answered market requests with a 401 — and the app
  // faithfully reported "pump.fun returned 401" about a service that was not
  // pump.fun.
  if (url.pathname === '/whoami') {
    return send(res, 200, { service: SERVICE, upstreams: Object.keys(ROUTES), imageRelay: '/img?url=' });
  }

  // Whether `/img` would relay this logo, answered as a verdict.
  //
  // The app used to find out by requesting the image itself, so every logo it
  // could not show arrived as an HTTP error: a dead CDN 404, a host that
  // refuses servers 403, an arweave URL serving an HTML page 415. Each was
  // handled — the row falls back to its letter tile — and each still landed in
  // the browser's network log as a failed request, on every screen that lists
  // markets. A yes-or-no question is not an error either way, so this answers
  // 200 with the verdict in the body. It reads headers only — plus the first
  // bytes of a body sent with no type; the old check downloaded every logo twice.
  if (url.pathname === '/img/check') {
    const raw = url.searchParams.get('url');
    if (!raw) return send(res, 400, { error: 'missing url' });
    let target;
    try {
      target = new URL(raw);
    } catch {
      return send(res, 200, { usable: false, reason: 'not a URL' });
    }
    if (target.protocol !== 'https:') return send(res, 200, { usable: false, reason: 'https only' });
    try {
      const logo = await fetchLogo(target, { full: false });
      if (!logo.ok) return send(res, 200, { usable: false, reason: logo.reason });
      // `via` names the gateway that answered, when it was not the one asked.
      return send(res, 200, { usable: true, type: logo.type, ...(logo.host !== target.hostname ? { via: logo.host } : {}) });
    } catch (e) {
      const reason = e instanceof Refused ? e.message : `logo ${target.hostname} failed: ${e?.message ?? e}`;
      return send(res, 200, { usable: false, reason });
    }
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
      // Anything that is not an image is refused inside `fetchLogo` — typed as
      // one, or untyped with an image's first bytes — so this cannot be used to
      // read arbitrary documents off a host that happens to be reachable.
      const logo = await fetchLogo(target, { full: true });
      if (!logo.ok) return send(res, logo.status, { error: logo.reason });
      const { type, buf } = logo;
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
    const key = upstream.href;
    const ttl = ttlFor(url.pathname);
    const hit = ttl > 0 ? cache.get(key) : undefined;
    let out;
    let state;
    if (hit && Date.now() - hit.at < ttl) {
      out = hit;
      state = 'HIT';
    } else {
      let job = inflight.get(key);
      if (!job) {
        job = fetchUpstream(upstream).finally(() => inflight.delete(key));
        inflight.set(key, job);
      }
      out = notFoundAsNull(url.pathname, await job);
      state = 'MISS';
      if (ttl > 0 && out.status === 200) remember(key, out);
    }
    cors(res);
    res.writeHead(out.status, {
      'content-type': out.type,
      'x-cache': state,
      ...(out.upstreamStatus ? { 'x-upstream-status': String(out.upstreamStatus) } : {}),
      ...(state === 'HIT' ? { age: String(Math.floor((Date.now() - out.at) / 1000)) } : {}),
    });
    res.end(out.body);
  } catch (e) {
    // The upstream's own failure, named, so the UI can show something true.
    send(res, 502, { error: `upstream ${upstream.host} failed: ${e?.message ?? e}` });
  }
});

/**
 * Upstream responses remembered briefly, and upstream throttling absorbed.
 *
 * Every tab of the app, the landing page and anything else pointed at this
 * proxy share one outbound IP, and Jupiter answers a burst with 429. The app
 * retried and recovered, but the 429 still reached the browser as a failed
 * request. Two things stop that here:
 *
 * - An identical request inside its route's TTL is answered from the same
 *   upstream response, and concurrent identical requests share one fetch.
 * - A 429 or 503 from upstream is retried with backoff (honouring
 *   `retry-after`, capped) before anything is sent back. If it is still
 *   refused after that, the refusal is passed through — this absorbs a burst,
 *   it does not hide an outage.
 *
 * Only successful responses are cached, and the TTLs are short and per route:
 * a price is at most a few seconds old when served, which is inside the
 * program's own one-push-a-second rate limit; token lists change over hours.
 * `x-cache` and `age` say which it was.
 */
const CACHE_TTL_MS = [
  [/^\/jup\/price\//, 3_000],
  [/^\/jup\/tokens\/v2\/tag/, 60_000],
  [/^\/jup\/tokens\/v2\/search/, 20_000],
  [/^\/jup\//, 10_000],
  [/^\/pump\/coins\/[^/]+$/, 5_000],
  [/^\/pump\//, 10_000],
];
const CACHE_MAX_ENTRIES = 500;
const RETRY_STATUSES = new Set([429, 503]);
const RETRY_DELAYS_MS = [400, 1_000, 2_000];

const cache = new Map();
const inflight = new Map();

function ttlFor(pathname) {
  for (const [re, ms] of CACHE_TTL_MS) if (re.test(pathname)) return ms;
  return 0;
}

/**
 * A coin lookup for a mint pump.fun has no coin for, answered as `null`.
 *
 * Tapes and stats resolve a logo for every mint they show, and not every mint
 * is a pump.fun coin — a Jupiter major, or a fixture the test suites wrote. The
 * lookup's honest answer is "no such coin", and the client already reads a null
 * as exactly that (`fetchMarket` → `toMarket(null)` → null). Passing the 404
 * through put a failed request in the network panel for a question that had
 * been answered. `x-upstream-status` keeps what pump.fun actually said visible;
 * every other status, and every other route, passes through unchanged.
 */
const COIN_LOOKUP = /^\/pump\/coins\/[^/]+$/;
function notFoundAsNull(pathname, out) {
  if (out.status !== 404 || !COIN_LOOKUP.test(pathname)) return out;
  return { status: 200, type: 'application/json', body: 'null', upstreamStatus: 404 };
}

function remember(key, out) {
  cache.delete(key);
  cache.set(key, { ...out, at: Date.now() });
  // Oldest first: a Map iterates in insertion order.
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
}

async function fetchUpstream(upstream) {
  let r;
  for (let attempt = 0; ; attempt += 1) {
    r = await fetch(upstream, {
      headers: UPSTREAM_HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!RETRY_STATUSES.has(r.status) || attempt >= RETRY_DELAYS_MS.length) break;
    const after = Number(r.headers.get('retry-after'));
    const wait = Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 3_000) : RETRY_DELAYS_MS[attempt];
    await r.body?.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return {
    status: r.status,
    type: r.headers.get('content-type') ?? 'application/json',
    body: await r.text(),
  };
}

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

server.listen(PORT, HOST, () => {
  console.log(`market proxy on http://${HOST}:${PORT}`);
  for (const [p, o] of Object.entries(ROUTES)) console.log(`  ${p.padEnd(8)} -> ${o}`);
});
