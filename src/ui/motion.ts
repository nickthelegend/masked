/**
 * Motion policy.
 *
 * The house language is hard-edged: things move, snap and step. They do not
 * ease gently or dissolve. Durations are short and quantised so motion reads
 * as frames rather than as animation.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Frame duration at a notional 12fps — the grid motion is quantised to. */
export const FRAME_MS = 83;

export const DURATION = {
  snap: FRAME_MS * 2,
  quick: FRAME_MS * 4,
  beat: FRAME_MS * 8,
  hold: FRAME_MS * 18,
} as const;

/**
 * Respects the OS "reduce motion" setting. Every animated component in the
 * library checks this and falls back to its end state — a judge with motion
 * sensitivity should still get the product, just without the theatre.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
