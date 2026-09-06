/**
 * Proves the scoreboard rule: a synthesized opponent curve lands exactly on the
 * PnL it is told to land on, and two series share one scale.
 */
import assert from 'node:assert/strict';
globalThis.__DEV__ = false;
const { toEnd, bounds, linePath, mulberry32, walk } = await import('../src/ui/series.ts');

let cases = 0;
for (const end of [0, 4.12, -5.1, 7.9, -0.44, 123.456]) {
  for (const n of [2, 3, 6, 60, 121]) {
    const c = toEnd(n, end);
    assert.equal(c.length, n, `toEnd(${n}) length`);
    assert.equal(c[0], 0, `toEnd(${n}, ${end}) must start flat`);
    assert.ok(Math.abs(c[n - 1] - end) < 1e-9, `toEnd(${n}, ${end}) ended at ${c[n - 1]}`);
    cases += 1;
  }
}

// Deterministic with a seeded PRNG: the reveal curve cannot reshuffle mid-render.
assert.deepEqual(toEnd(40, 3.3, mulberry32(7)), toEnd(40, 3.3, mulberry32(7)), 'seeded toEnd must be stable');
assert.notDeepEqual(toEnd(40, 3.3, mulberry32(7)), toEnd(40, 3.3, mulberry32(8)), 'different seeds differ');
assert.equal(walk(5, 0.9, mulberry32(1)).length, 6, 'walk(n) returns n+1 samples');

// Shared scale: the winner's line is never below the loser's at the last sample.
const mine = [0, 1, 2, 4.12];
const opp = toEnd(4, -1.8, mulberry32(3));
const { lo, hi } = bounds(mine, opp);
const y = (v) => 170 - 10 - ((v - lo) / (hi - lo)) * 150;
assert.ok(y(mine.at(-1)) < y(opp.at(-1)), 'winner must draw above loser on a shared scale');

// Degenerate input must not emit NaN coordinates.
for (const s of [[], [5], [2, 2, 2]]) {
  assert.ok(!linePath(s, 340, 170).includes('NaN'), `linePath(${JSON.stringify(s)}) produced NaN`);
}

console.log(`series ok — ${cases} toEnd cases land exactly, scale shared, no NaN paths`);
