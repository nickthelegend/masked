import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { CaretDownIcon, CaretUpIcon } from './icons';
import { color, space } from './theme';
import { FRAME_MS, USE_NATIVE_DRIVER, useReducedMotion } from './motion';

export interface MarkTickerProps {
  /** The formatted mark, exactly as it should read. */
  label: string;
  /** The raw mark, for deciding direction. Equal values do not flash. */
  value: number;
  /** Where the price came from, printed beside it. */
  source?: string;
}

/**
 * The mark, flashing the direction it just moved.
 *
 * The crank posts a new price every five seconds and the digits change with no
 * other signal, so a player watching their own PnL misses the thing driving
 * it. The flash is on the *change*, not the level: green when the last post
 * was higher than the one before, red when lower, nothing when the market did
 * not move — a permanently green mark would say "up" about a flat market.
 */
export default function MarkTicker({ label, value, source }: MarkTickerProps) {
  const reduced = useReducedMotion();
  const flash = useRef(new Animated.Value(0)).current;
  const prev = useRef<number | null>(null);
  const [dir, setDir] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    const before = prev.current;
    prev.current = value;
    if (before === null || value === before || !Number.isFinite(value)) return;
    setDir(value > before ? 'up' : 'down');
    if (reduced) return;
    flash.setValue(1);
    Animated.timing(flash, {
      toValue: 0,
      duration: FRAME_MS * 8,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [value, reduced, flash]);

  const tone = dir === 'up' ? color.green : dir === 'down' ? color.red : color.text;
  const Icon = dir === 'up' ? CaretUpIcon : dir === 'down' ? CaretDownIcon : null;

  return (
    <Row gap={space.xs} align="center">
      <PixelText variant="bodySmall">MARK {label}</PixelText>
      {Icon ? (
        <Animated.View style={{ opacity: reduced ? 1 : flash }}>
          <Icon size={8} color={tone} />
        </Animated.View>
      ) : null}
      {source ? (
        <PixelText variant="bodySmall" size={9} color={color.textFaint}>
          {source}
        </PixelText>
      ) : null}
    </Row>
  );
}
