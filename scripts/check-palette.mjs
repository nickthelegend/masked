/**
 * Guards the colour-blind palette: in `colorSafe`, win and loss must stay two
 * colours for every common kind of colour-blindness, and both must stay
 * readable on the chart ground.
 *
 * Why it exists: the standard pair, green `#2fbf5c` against red `#ff4d5e`, is
 * a few ΔE apart under deuteranopia, the most common form, which makes it one
 * colour. A later "small tweak" to either safe value could quietly bring that
 * back, and nobody with typical vision would notice.
 *
 * Method: Machado, Oliveira & Fernandes (2009) simulation matrices at severity
 * 1.0, applied in linear sRGB; distance is CIE76 ΔE in L*a*b*; contrast is WCAG
 * 2.x relative luminance.
 *
 * Run: npm run check:palette   (Node >= 22.6, native TypeScript type stripping)
 */
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { color, colorSafe } = await import(pathToFileURL(resolve(process.cwd(), 'src/ui/tokens.ts')).href);

const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};

const srgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const simulate = (l, m) => m.map((r) => Math.min(1, Math.max(0, r[0] * l[0] + r[1] * l[1] + r[2] * l[2])));
const lab = (l) => {
  const x = (0.4124 * l[0] + 0.3576 * l[1] + 0.1805 * l[2]) / 0.95047;
  const y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
  const z = (0.0193 * l[0] + 0.1192 * l[1] + 0.9505 * l[2]) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** ΔE between two colours for each kind of vision, typical included. */
const distances = (a, b) => {
  const la = srgb(a).map(linear);
  const lb = srgb(b).map(linear);
  const out = { typical: deltaE(lab(la), lab(lb)) };
  for (const [k, m] of Object.entries(MACHADO)) out[k] = deltaE(lab(simulate(la, m)), lab(simulate(lb, m)));
  return out;
};
const worst = (d) => Math.min(...Object.values(d));
const luminance = (h) => {
  const l = srgb(h).map(linear);
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const fmt = (d) => Object.entries(d).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ');

/** Far enough apart to read as two colours at a glance, with margin. */
const MIN_WIN_LOSS = 40;
/** Apart from the neighbouring meanings: gold is the pot, cyan is "you". */
const MIN_NEIGHBOUR = 15;
const MIN_CONTRAST = 4.5;

const standard = distances(color.green, color.red);
const safe = distances(colorSafe.green, colorSafe.red);

assert.ok(
  worst(safe) >= MIN_WIN_LOSS,
  `colorSafe win ${colorSafe.green} and loss ${colorSafe.red} are only ${worst(safe).toFixed(1)} ΔE apart for some vision (${fmt(safe)}); need ${MIN_WIN_LOSS}`
);
for (const [role, hex] of [['win', colorSafe.green], ['loss', colorSafe.red]]) {
  const c = contrast(hex, color.chartBg);
  assert.ok(c >= MIN_CONTRAST, `colorSafe ${role} ${hex} is ${c.toFixed(2)}:1 on chartBg; need ${MIN_CONTRAST}:1`);
}
for (const [what, a, b] of [
  ['loss vs gold', colorSafe.red, color.yellow],
  ['loss vs amber', colorSafe.red, color.orange],
  ['win vs cyan', colorSafe.green, color.cyan],
]) {
  const w = worst(distances(a, b));
  assert.ok(w >= MIN_NEIGHBOUR, `colorSafe ${what}: ${w.toFixed(1)} ΔE for some vision; need ${MIN_NEIGHBOUR}`);
}

console.log(`standard win/loss ${color.green}/${color.red}: ${fmt(standard)}`);
console.log(`safe     win/loss ${colorSafe.green}/${colorSafe.red}: ${fmt(safe)}`);
console.log(
  `palette ok — safe pair at least ${worst(safe).toFixed(1)} ΔE apart for every vision (standard: ${worst(standard).toFixed(1)}), ` +
    `${contrast(colorSafe.green, color.chartBg).toFixed(1)}:1 and ${contrast(colorSafe.red, color.chartBg).toFixed(1)}:1 on chartBg`
);
