import { useEffect, useRef, useState } from 'react';
import PixelText from './PixelText';
import { color } from './theme';
import { DURATION, useReducedMotion } from './motion';
import { signColor } from './format';

export interface PnLOdometerProps {
  /** Target percentage. */
  value: number;
  size?: number;
  /** Color by sign instead of white. */
  signed?: boolean;
  tone?: string;
  prefix?: string;
  suffix?: string;
}

const STEPS = 8;

/**
 * A PnL figure that counts to its new value instead of snapping.
 *
 * Stepped, not interpolated — the number visibly ticks through intermediate
 * values, which is what a mechanical readout would do and what the rest of the
 * design language implies.
 */
export default function PnLOdometer({
  value,
  size = 13,
  signed = false,
  tone,
  prefix = '',
  suffix = '%',
}: PnLOdometerProps) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced || Math.abs(value - from.current) < 0.005) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const start = from.current;
    const delta = value - start;
    let step = 0;
    const id = setInterval(() => {
      step += 1;
      const t = step / STEPS;
      setShown(start + delta * t);
      if (step >= STEPS) {
        clearInterval(id);
        from.current = value;
        setShown(value);
      }
    }, DURATION.snap / STEPS);
    return () => clearInterval(id);
  }, [value, reduced]);

  const text = `${prefix}${shown >= 0 ? '+' : ''}${shown.toFixed(2)}${suffix}`;

  return (
    <PixelText variant="numeric" size={size} color={tone ?? (signed ? signColor(shown) : color.white)}>
      {text}
    </PixelText>
  );
}
