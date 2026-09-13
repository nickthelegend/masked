import { useEffect, useRef, useState } from 'react';
import { FRAME_MS, useReducedMotion } from './motion';

export type BalanceTone = 'up' | 'down' | null;

/** Frames the counter takes to catch up with a new read. */
const STEPS = 8;
/** How long the green or red tint stays after a change. */
const TONE_MS = 1600;
/** The HUD prints two decimals; a move smaller than that is not a visible change. */
const VISIBLE = 0.005;

/**
 * The HUD balance, moved to each new chain read instead of jumping to it.
 *
 * Settlement is the moment money visibly moves: the pot lands, or the entry
 * is gone. Both ends are real reads of the wallet, before and after; the steps
 * between are only the counter catching up, on the same 83 ms frame as every
 * other animation, tinted green up and red down. Under reduced motion it jumps
 * and still tints.
 *
 * The first read after a wallet connects is not a change in money, only the
 * app learning the balance, so a move away from exactly zero does not animate.
 */
export function useBalanceTween(balance: number): { shown: number; tone: BalanceTone } {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(balance);
  const [tone, setTone] = useState<BalanceTone>(null);
  const previous = useRef(balance);

  useEffect(() => {
    const from = previous.current;
    previous.current = balance;
    if (from === 0 || Math.abs(balance - from) < VISIBLE) {
      setShown(balance);
      return;
    }

    setTone(balance > from ? 'up' : 'down');
    const clearTone = setTimeout(() => setTone(null), TONE_MS);
    if (reduced) {
      setShown(balance);
      return () => clearTimeout(clearTone);
    }

    let step = 0;
    const id = setInterval(() => {
      step += 1;
      setShown(from + ((balance - from) * step) / STEPS);
      if (step >= STEPS) clearInterval(id);
    }, FRAME_MS);
    return () => {
      clearInterval(id);
      clearTimeout(clearTone);
      setShown(balance);
    };
  }, [balance, reduced]);

  return { shown, tone };
}
