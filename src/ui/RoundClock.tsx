import type { ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { color, space } from './theme';
import { mmss } from './format';

export interface RoundClockProps {
  /** Seconds remaining. Formatted `m:ss` and clamped at zero. */
  seconds: number;
  label?: string;
  size?: number;
  tone?: string;
  /** Seconds below which the clock turns red. */
  warnAt?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * The round countdown. Font scaling is off — this number sits in the fixed
 * header strip and must never reflow the row it shares with the pot.
 */
export default function RoundClock({
  seconds,
  label,
  size = 14,
  tone = color.yellow,
  warnAt = 30,
  style,
}: RoundClockProps) {
  return (
    <Row gap={space.sm} style={style}>
      {label ? (
        <PixelText variant="numeric" size={8} color={color.textDim}>
          {label}
        </PixelText>
      ) : null}
      <PixelText variant="numeric" size={size} color={seconds <= warnAt ? color.red : tone}>
        {mmss(seconds)}
      </PixelText>
    </Row>
  );
}
