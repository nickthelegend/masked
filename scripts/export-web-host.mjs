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
import { basename, dirname, join, sep } from 'node:path';

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

// `--reuse` post-processes an `expo export` already in `out` instead of running a
// new one. Metro's cache is shared by every export on the machine, so when another
// session is mid-export a finished raw export is safer to finish than to redo.
// Every check below still runs on it.
if (process.argv.includes('--reuse')) {
  if (!existsSync(join(out, 'index.html')) || !existsSync(join(out, '_expo', 'static'))) {
    console.error(`--reuse: no expo export in ${out}`);
    process.exit(1);
  }
  if (existsSync(join(out, 'vercel.json'))) {
    console.error(`--reuse: ${out} was already post-processed; renaming twice would break its references`);
    process.exit(1);
  }
} else {
  rmSync(out, { recursive: true, force: true });
  const exp = spawnSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', out, '--clear'], { stdio: 'inherit' });
  if (exp.status !== 0) process.exit(exp.status ?? 1);
}

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
// Exported from a tree whose node_modules is a symlink, Metro writes assets under
// their real path — assets/_______Volumes/…/node_modules/… — which the rename
// above does not match. Vercel still drops the node_modules folder inside it, the
// fonts 404, and the app renders nothing: the hosted build was blank from
// 04:46 to 05:4x UTC on 2026-09-13 for exactly this. Refuse any such path.
const nested = existsSync(join(out, 'assets'))
  ? walk(join(out, 'assets')).filter((p) => p.split(sep).includes('node_modules'))
  : [];
if (nested.length) {
  console.error(`${nested.length} asset path(s) still contain node_modules — export from a tree with a real node_modules, not a symlink:`, nested.slice(0, 3));
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

// Every asset the bundle asks for has to be in the output under that path. A
// host serves what was uploaded; a missing font is a blank app, not a warning.
// Bounded by the string's own quotes, not by whitespace: a path exported from a
// folder with a space in its name ("Extreme SSD") is still one asset reference.
const assetRefs = [...new Set(js.match(/\/assets\/[^"'`]+?\.(?:ttf|otf|woff2?|png|jpe?g|gif|svg)(?=["'`?#])/g) ?? [])];
const missingAssets = assetRefs.filter((r) => !existsSync(join(out, decodeURIComponent(r))));
if (missingAssets.length) {
  console.error(`${missingAssets.length} of ${assetRefs.length} asset(s) the bundle references are not in the output:`, missingAssets.slice(0, 5));
  process.exit(1);
}
console.log(`assets: all ${assetRefs.length} referenced by the bundle are present`);

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
