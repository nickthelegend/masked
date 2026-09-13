/**
 * The app icons, drawn from the product's own mask.
 *
 * Every player in MASKED is a mask generated from their wallet (src/ui/
 * maskFace.ts); the app's icon is the one generated from its name, in the gold
 * the pot is paid in, with the same solid ink drop edge every control has.
 * Drawn cell by cell, so it stays pixel-exact at every size.
 *
 * Run: npm run icons   → public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
// TypeScript sources, run through tsx. The import plugin parses them as plain
// JavaScript from a .mjs file and cannot, so its namespace check is off here.
// eslint-disable-next-line import/namespace
import { FACE, maskGrid } from '../src/ui/maskFace';
// eslint-disable-next-line import/namespace
import { color } from '../src/ui/tokens';

const SEED = 'MASKED';
const OUT = 'public/icons';

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * `area` is how much of the square the mask spans. A maskable icon keeps its
 * content inside the central circle the launcher may crop to, so it is drawn
 * smaller than the plain one.
 */
function draw(size, area) {
  const png = new PNG({ width: size, height: size });
  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    png.data[i] = r;
    png.data[i + 1] = g;
    png.data[i + 2] = b;
    png.data[i + 3] = 255;
  };
  const cellFill = (gx, gy, cell, x0, y0, dy, tone) => {
    for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) put(x0 + gx * cell + x, y0 + gy * cell + y + dy, tone);
  };

  const ground = rgb(color.bg);
  const gold = rgb(color.yellow);
  const edge = rgb(color.ink);
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) put(x, y, ground);

  const grid = maskGrid(SEED);
  const cell = Math.floor((size * area) / FACE);
  const span = cell * FACE;
  const depth = Math.max(1, Math.round(cell / 3));
  const x0 = Math.floor((size - span) / 2);
  const y0 = Math.floor((size - span - depth) / 2);

  // The drop edge first, then the mask over it, so the edge shows only below.
  for (const [dy, tone] of [[depth, edge], [0, gold]]) {
    for (let gy = 0; gy < FACE; gy += 1) {
      for (let gx = 0; gx < FACE; gx += 1) if (grid[gy][gx] === '#') cellFill(gx, gy, cell, x0, y0, dy, tone);
    }
  }
  return PNG.sync.write(png);
}

mkdirSync(OUT, { recursive: true });
for (const [name, size, area] of [
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  ['maskable-512.png', 512, 0.5],
  ['apple-touch-icon.png', 180, 0.66],
]) {
  const bytes = draw(size, area);
  writeFileSync(`${OUT}/${name}`, bytes);
  console.log(`${OUT}/${name}  ${size}x${size}  ${bytes.length} bytes`);
}
