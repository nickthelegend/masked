/**
 * The exported bundle points where it claims to.
 *
 * `EXPO_PUBLIC_*` values are inlined at build time, and Metro caches
 * aggressively across builds — so exporting once with an override (to test an
 * unreachable-cluster path, say) can poison the cache and leave the *next*
 * ordinary export still baked with that override. It happened: `dist/` shipped
 * pointing at a dead RPC, and the only symptom was the app saying CANNOT REACH
 * THE CLUSTER while the validator answered every command line probe in 18ms.
 *
 * So this asserts the built bundle contains the URLs the config says are
 * active, and none of the obvious wrong ones.
 *
 *   npm run check:build
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { CLUSTERS } from '../src/chain/config';

const DIST = 'dist/_expo/static/js/web';
assert.ok(existsSync(DIST), `no export at ${DIST} — run: npx expo export --platform web --output-dir dist`);

const bundles = readdirSync(DIST).filter((f) => f.endsWith('.js'));
assert.ok(bundles.length > 0, 'no javascript bundles in the export');
const source = bundles.map((f) => readFileSync(`${DIST}/${f}`, 'utf8')).join('\n');

const expected = [CLUSTERS.local.l1, CLUSTERS.local.er];
let checks = 0;
const failures: string[] = [];

for (const url of expected) {
  checks += 1;
  const host = url.replace(/^https?:\/\//, '');
  if (!source.includes(host)) failures.push(`bundle does not contain the active cluster URL ${host}`);
}

// Ports this project uses for scratch builds and dead-cluster tests. If one of
// these is baked in, the export is not the one that should ship.
for (const port of ['9911', '9912', '4198', '4199']) {
  checks += 1;
  if (source.includes(`127.0.0.1:${port}`)) {
    failures.push(`bundle contains 127.0.0.1:${port} — a test override leaked through Metro's cache; rebuild with --clear`);
  }
}

// The program the client talks to must be the one the IDL was synced from.
checks += 1;
if (!source.includes('3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1')) {
  failures.push('bundle does not contain the program id from src/chain/config.ts');
}

if (failures.length > 0) {
  console.error(`build FAILED — ${failures.length} of ${checks}:`);
  for (const f of failures) console.error(`   ${f}`);
  process.exit(1);
}

console.log(
  `build ok — ${checks} assertions: the export points at ${CLUSTERS.local.l1} and ${CLUSTERS.local.er}, ` +
  `carries the deployed program id, and no scratch-build override leaked in`
);
