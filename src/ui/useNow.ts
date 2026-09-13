import { useEffect, useState } from 'react';

/** How often relative times ("2m ago") are recomputed. Minute labels need no finer. */
export const NOW_TICK_MS = 30_000;

type Listener = (now: number) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * The current unix time in seconds, from one clock the whole app shares.
 *
 * A relative time computed from `Date.now()` during render is only as fresh as
 * the last re-render, so a screen that reads once — a settled tape, which never
 * changes — kept saying "just now" until it was reloaded. Every label that
 * says how long ago something happened takes its "now" from here instead.
 *
 * One interval for every subscriber, started by the first and stopped by the
 * last, so ten rows on screen do not mean ten timers.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    listeners.add(setNow);
    // Catch up at once: the shared clock may have ticked before this mounted.
    setNow(Math.floor(Date.now() / 1000));
    if (!timer) {
      timer = setInterval(() => {
        const t = Math.floor(Date.now() / 1000);
        listeners.forEach((listener) => listener(t));
      }, NOW_TICK_MS);
    }
    return () => {
      listeners.delete(setNow);
      if (listeners.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  return now;
}
