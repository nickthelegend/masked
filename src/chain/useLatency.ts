/**
 * Measured L1-vs-ER round-trip latency.
 *
 * The pitch claims the rollup is faster. Rather than assert it on a slide,
 * this measures both endpoints live with the same call and reports the real
 * numbers — including when the local L1 happens to be fast, because a
 * benchmark that can only produce a flattering answer is not a benchmark.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { ACTIVE_CLUSTER } from './config';

export interface LatencySample {
  l1Ms: number | null;
  erMs: number | null;
  /** How many times faster the ER is. Null when either side failed. */
  speedup: number | null;
  samples: number;
}

const EMPTY: LatencySample = { l1Ms: null, erMs: null, speedup: null, samples: 0 };

const timeOne = async (conn: Connection): Promise<number | null> => {
  const t0 = performance.now();
  try {
    await conn.getSlot('confirmed');
    return performance.now() - t0;
  } catch {
    return null;
  }
};

/** Median is far more honest than mean for network timings. */
const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function useLatency(pollMs = 3000, window = 8): LatencySample {
  const [sample, setSample] = useState<LatencySample>(EMPTY);
  const l1History = useRef<number[]>([]);
  const erHistory = useRef<number[]>([]);

  const tick = useCallback(async () => {
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const er = new Connection(ACTIVE_CLUSTER.er, 'confirmed');
    const [a, b] = await Promise.all([timeOne(l1), timeOne(er)]);

    if (a !== null) l1History.current = [...l1History.current, a].slice(-window);
    if (b !== null) erHistory.current = [...erHistory.current, b].slice(-window);

    const l1Ms = median(l1History.current);
    const erMs = median(erHistory.current);
    setSample({
      l1Ms,
      erMs,
      speedup: l1Ms !== null && erMs !== null && erMs > 0 ? l1Ms / erMs : null,
      samples: Math.max(l1History.current.length, erHistory.current.length),
    });
  }, [window]);

  useEffect(() => {
    void tick();
    const id = setInterval(() => void tick(), pollMs);
    return () => clearInterval(id);
  }, [tick, pollMs]);

  return sample;
}
