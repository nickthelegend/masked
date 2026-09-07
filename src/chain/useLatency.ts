/**
 * Measured L1-vs-rollup speed.
 *
 * The pitch claims the rollup is faster, so this measures it live rather than
 * asserting it on a slide — including when the answer is unflattering, because
 * a benchmark that can only come out one way is not a benchmark.
 *
 * Two different things are measured, because only one of them is the claim:
 *
 *   round trip — how long a getSlot call takes. On a laptop where both chains
 *     are local processes this is mostly IPC, and the rollup's figure includes
 *     the extra hop through the permission-checking front door, so it is
 *     routinely the *slower* of the two. Reported, but it is not the point.
 *
 *   block rate — how fast each chain actually advances, in slots per second.
 *     This is what an ephemeral rollup is for and where the difference shows:
 *     Solana produces a slot roughly every 400ms, and the rollup is built to
 *     go faster. Dividing these is the only honest "speedup" of the two.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { ACTIVE_CLUSTER } from './config';

export interface LatencySample {
  /** Median getSlot round trip, milliseconds. */
  l1Ms: number | null;
  erMs: number | null;
  /** Slots produced per second, measured across the sampling window. */
  l1SlotsPerSec: number | null;
  erSlotsPerSec: number | null;
  /** Rollup block rate over base block rate. Null until both are known. */
  speedup: number | null;
  samples: number;
}

const EMPTY: LatencySample = {
  l1Ms: null,
  erMs: null,
  l1SlotsPerSec: null,
  erSlotsPerSec: null,
  speedup: null,
  samples: 0,
};

/** One timed getSlot: how long it took, and what the slot was. */
const probe = async (conn: Connection): Promise<{ ms: number; slot: number } | null> => {
  const t0 = performance.now();
  try {
    const slot = await conn.getSlot('confirmed');
    return { ms: performance.now() - t0, slot };
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
  /** First observation of each chain, to measure slots against wall time. */
  const origin = useRef<{ l1?: { slot: number; at: number }; er?: { slot: number; at: number } }>({});

  const tick = useCallback(async () => {
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const er = new Connection(ACTIVE_CLUSTER.er, 'confirmed');
    const [a, b] = await Promise.all([probe(l1), probe(er)]);
    const now = performance.now();

    const rate = (
      seen: { slot: number; at: number } | undefined,
      current: { slot: number } | null
    ): number | null => {
      if (!seen || !current) return null;
      const secs = (now - seen.at) / 1000;
      // Needs a real window: over a fraction of a second the answer is noise.
      if (secs < 2) return null;
      return (current.slot - seen.slot) / secs;
    };

    if (a) {
      l1History.current = [...l1History.current, a.ms].slice(-window);
      origin.current.l1 ??= { slot: a.slot, at: now };
    }
    if (b) {
      erHistory.current = [...erHistory.current, b.ms].slice(-window);
      origin.current.er ??= { slot: b.slot, at: now };
    }

    const l1SlotsPerSec = rate(origin.current.l1, a);
    const erSlotsPerSec = rate(origin.current.er, b);

    setSample({
      l1Ms: median(l1History.current),
      erMs: median(erHistory.current),
      l1SlotsPerSec,
      erSlotsPerSec,
      speedup:
        l1SlotsPerSec !== null && erSlotsPerSec !== null && l1SlotsPerSec > 0
          ? erSlotsPerSec / l1SlotsPerSec
          : null,
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
