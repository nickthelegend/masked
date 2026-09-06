/**
 * Guards the one rule that matters most: `src/ui/tokens.ts` must hold exactly
 * the values in `ui/tokens.js`, the handoff source of truth. Any drift — a new
 * color, a nudged spacing step — fails here instead of shipping.
 *
 * Run: npm run check:tokens   (Node >= 22.6, native TypeScript type stripping)
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const load = (p) => import(pathToFileURL(resolve(process.cwd(), p)).href);
const [source, port] = await Promise.all([load('ui/tokens.js'), load('src/ui/tokens.ts')]);

const groups = ['color', 'font', 'space', 'radius', 'border', 'bevel', 'type'];
let checked = 0;

for (const g of groups) {
  assert.ok(source[g], `ui/tokens.js is missing the "${g}" group`);
  assert.ok(port[g], `src/ui/tokens.ts is missing the "${g}" group`);
  assert.deepEqual(
    JSON.parse(JSON.stringify(port[g])),
    JSON.parse(JSON.stringify(source[g])),
    `token group "${g}" drifted between ui/tokens.js and src/ui/tokens.ts`,
  );
  checked += Object.keys(source[g]).length;
}

console.log(`tokens ok — ${checked} values identical across ${groups.length} groups`);
