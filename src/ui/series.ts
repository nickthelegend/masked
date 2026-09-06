/**
 * Series maths for the tape charts.
 *
 * The rule these functions exist to enforce: a drawn curve may never disagree
 * with the number printed next to it. `toEnd` therefore lands *exactly* on the
 * PnL it is given, and `bounds` gives two compared series one shared scale so
 * the loser's line can never draw above the winner's.
 */

/** A deterministic 32-bit PRNG, so a synthesized curve is stable across renders. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * SVG path for a series inside a `width` x `height` box.
 *
 * Pass the same `lo`/`hi` to every series in one chart — that shared scale is
 * the whole point (see ui/platform-notes.md §5). A series shorter than two
 * points is drawn as a flat line rather than producing a NaN path.
 */
export const linePath = (
  values: number[],
  width: number,
  height: number,
  lo?: number,
  hi?: number,
  pad = 10,
): string => {
  if (values.length === 0) return '';
  const v = values.length === 1 ? [values[0], values[0]] : values;
  const min = lo ?? Math.min(...v);
  const max = hi ?? Math.max(...v);
  const range = max - min || 1;
  const inner = height - pad * 2;
  return v
    .map((x, i) => {
      const px = ((i / (v.length - 1)) * width).toFixed(1);
      const py = (pad + inner - ((x - min) / range) * inner).toFixed(1);
      return `${i ? 'L' : 'M'}${px},${py}`;
    })
    .join(' ');
};

/** Shared lo/hi across any number of series. Empty series are ignored. */
export const bounds = (...series: Array<number[] | undefined | null>): { lo: number; hi: number } => {
  const all = series.filter((s): s is number[] => Array.isArray(s) && s.length > 0).flat();
  if (all.length === 0) return { lo: 0, hi: 1 };
  return { lo: Math.min(...all), hi: Math.max(...all) };
};

/**
 * A random walk of `n` steps, starting at 0. Returns `n + 1` samples.
 * Pass `rand` (e.g. from `mulberry32`) for a repeatable shape.
 */
export const walk = (n: number, step: number, rand: () => number = Math.random): number[] => {
  let p = 0;
  const out = [0];
  for (let i = 0; i < n; i += 1) {
    p += Math.sin(i * step) * 1.4 + (rand() - 0.48) * 2;
    out.push(p);
  }
  return out;
};

/**
 * Synthesize an opponent equity curve of `n` samples that starts at 0 and
 * lands **exactly** on `end`.
 *
 * The noise term is multiplied by `(1 - f)`, so it is damped to zero at the
 * final sample; the trend term `end * f` is all that remains there. That is
 * what keeps the reveal chart honest about who won.
 */
export const toEnd = (n: number, end: number, rand: () => number = Math.random): number[] => {
  if (n <= 1) return [end];
  const w = walk(n - 1, 0.9, rand);
  const m = Math.max(...w.map(Math.abs)) || 1;
  const out = w.map((v, i) => {
    const f = i / (n - 1);
    return end * f + (v / m) * Math.abs(end || 1) * 0.8 * (1 - f);
  });

  if (__DEV__ && Math.abs(out[out.length - 1] - end) > 1e-9) {
    console.warn(`toEnd: curve ends at ${out[out.length - 1]}, not the stated ${end}.`);
  }
  return out;
};
