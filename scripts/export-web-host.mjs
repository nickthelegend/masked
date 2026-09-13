/**
 * A web build for a static host (Vercel, or anything that serves files).
 *
 *   EXPO_PUBLIC_CLUSTER=devnet \
 *   EXPO_PUBLIC_L1_URL=https://rpc.magicblock.app/devnet \
 *   EXPO_PUBLIC_MARKET_PROXY=https://market-proxy-production.up.railway.app \
 *   npm run export:host -- --out .localnet/vercel/masked
 *
 * Three things `expo export` leaves that a host breaks on, fixed here:
 *
 * 1. Assets under `assets/node_modules/…` (both pixel fonts among them). Vercel
 *    does not upload any folder named node_modules, so every one of them 404s,
 *    and the root layout, which waits for the fonts, never renders. They move
 *    to `assets/vendor/`, and every reference is rewritten.
 * 2. Bundle names that no longer match their contents after that rewrite. The
 *    host serves `_expo/static` as immutable and the service worker serves it
 *    cache-first, so a changed file under an old name would be stale forever.
 *    Each JS and CSS bundle is renamed to a hash of its final bytes.
 * 3. A single-page app needs every route to fall back to index.html.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

const flag = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const out = flag('--out') ?? '.localnet/web-host';

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const textFiles = () => walk(out).filter((f) => /\.(js|css|html|json|webmanifest)$/.test(f));
const replaceEverywhere = (from, to) => {
  let hits = 0;
  for (const f of textFiles()) {
    const s = readFileSync(f, 'utf8');
    const n = s.split(from).length - 1;
    if (n > 0) {
      writeFileSync(f, s.split(from).join(to));
      hits += n;
    }
  }
  return hits;
};

rmSync(out, { recursive: true, force: true });
const exp = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out, '--clear'], { stdio: 'inherit' });
if (exp.status !== 0) process.exit(exp.status ?? 1);

// 1. node_modules assets → vendor
const vendoredFrom = join(out, 'assets', 'node_modules');
if (existsSync(vendoredFrom)) {
  renameSync(vendoredFrom, join(out, 'assets', 'vendor'));
  const hits = replaceEverywhere('/assets/node_modules/', '/assets/vendor/');
  console.log(`assets: node_modules → vendor, ${hits} reference(s) rewritten`);
}
const stale = textFiles().filter((f) => readFileSync(f, 'utf8').includes('/assets/node_modules/'));
if (stale.length) {
  console.error('references to /assets/node_modules/ remain in', stale);
  process.exit(1);
}

// 2. content-hash bundle names
for (const f of walk(join(out, '_expo', 'static')).filter((p) => /\.(js|css)$/.test(p))) {
  const name = basename(f);
  const m = name.match(/^(.*)-[a-f0-9]{16,}\.(js|css)$/);
  if (!m) continue;
  const hash = createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 32);
  const renamed = `${m[1]}-${hash}.${m[2]}`;
  if (renamed === name) continue;
  renameSync(f, join(dirname(f), renamed));
  replaceEverywhere(`/${name}`, `/${renamed}`);
  console.log(`bundle: ${name} → ${renamed}`);
}

// The endpoints the bundle actually baked in. EXPO_PUBLIC_* values are inlined
// at transform time, and Metro's transform cache is keyed on file contents, so
// an export can reuse a config.ts compiled for another cluster. It happened on
// 2026-09-13: local exports after a devnet host export came out pointed at
// devnet. `--clear` above should prevent it; this refuses to ship if it didn't.
const js = walk(join(out, '_expo', 'static')).filter((p) => p.endsWith('.js')).map((p) => readFileSync(p, 'utf8')).join('\n');
const mustHave = [process.env.EXPO_PUBLIC_L1_URL, process.env.EXPO_PUBLIC_MARKET_PROXY].filter(Boolean);
const mustNotHave = process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? ['127.0.0.1:8999'] : ['rpc.magicblock.app/devnet', 'devnet-tee.magicblock.app'];
const missing = mustHave.filter((s) => !js.includes(s));
const leaked = mustNotHave.filter((s) => js.includes(s));
if (missing.length || leaked.length) {
  console.error(`baked endpoints wrong for cluster ${process.env.EXPO_PUBLIC_CLUSTER ?? 'local'}:`, { missing, leaked });
  process.exit(1);
}
console.log(`endpoints: ${mustHave.join(', ') || '(defaults)'} baked in; none of ${mustNotHave.join(', ')}`);

// 3. host config
writeFileSync(
  join(out, 'vercel.json'),
  `${JSON.stringify(
    {
      cleanUrls: false,
      trailingSlash: false,
      rewrites: [{ source: '/((?!_expo/|assets/|icons/|manifest\\.webmanifest|sw\\.js|favicon\\.ico).*)', destination: '/index.html' }],
      headers: [
        { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }] },
        { source: '/_expo/static/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
      ],
    },
    null,
    2
  )}\n`
);
console.log(`host build ready in ${out}`);
