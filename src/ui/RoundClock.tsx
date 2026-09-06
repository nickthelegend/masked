import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { color, space } from './theme';
import { mmss } from './format';
import { DURATION, useReducedMotion } from './motion';

export interface RoundClockProps {
  /** Seconds remaining. Formatted `m:ss` and clamped at zero. */
  seconds: number;
  label?: string;
  size?: number;
  tone?: string;
  /** Seconds below which the clock turns red. */
  warnAt?: number;
  /** Seconds below which it also pulses. */
  urgentAt?: number;
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
  urgentAt = 10,
  style,
}: RoundClockProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const urgent = seconds <= urgentAt && seconds > 0;

  useEffect(() => {
    if (!urgent || reduced) {
      pulse.setValue(0);
      return undefined;
    }
    // One step per second, matching the tick it is counting.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: DURATION.snap, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: DURATION.beat, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [urgent, reduced, pulse]);
  return (
    <Row gap={space.sm} style={style}>
      {label ? (
        <PixelText variant="numeric" size={8} color={color.textDim}>
          {label}
        </PixelText>
      ) : null}
      <Animated.View
        style={{ transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) }] }}
      >
        <PixelText variant="numeric" size={size} color={seconds <= warnAt ? color.red : tone}>
          {mmss(seconds)}
        </PixelText>
      </Animated.View>
    </Row>
  );
}
