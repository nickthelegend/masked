import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Stack from './Stack';
import Row from './Row';
import PixelText from './PixelText';
import { ClockIcon } from './icons';
import { color, space } from './theme';
import { FRAME_MS, USE_NATIVE_DRIVER, useReducedMotion } from './motion';

const HURRY = 15;

/** `mm:ss` as `00:00:14` — hours are impossible, a round is capped at an hour. */
function clock(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

export interface EndingInProps {
  seconds: number;
  /** Overrides the label. The buzzer screen says something else. */
  label?: string;
}

/**
 * The countdown, as the loudest thing on the round.
 *
 * Turns red and pulses once a second inside the last fifteen, which is the
 * window where a player still has time to close but not to think about it.
 */
export default function EndingIn({ seconds, label = 'ENDING IN' }: EndingInProps) {
  const hurry = seconds <= HURRY && seconds > 0;
  const reduced = useReducedMotion();
  const beat = useRef(new Animated.Value(1)).current;
  const lastWhole = useRef(Math.floor(seconds));

  useEffect(() => {
    const whole = Math.floor(seconds);
    if (whole === lastWhole.current) return;
    lastWhole.current = whole;
    if (!hurry || reduced) return;
    Animated.sequence([
      Animated.timing(beat, { toValue: 1.18, duration: FRAME_MS, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(beat, { toValue: 1, duration: FRAME_MS * 4, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }, [seconds, hurry, reduced, beat]);

  return (
    <Stack align="center" gap={2}>
      <Row align="center" gap={space.xs}>
        <ClockIcon size={9} color={color.textDim} />
        <PixelText variant="label" size={9} color={color.textDim}>
          {label}
        </PixelText>
      </Row>
      <Animated.View style={{ transform: [{ scale: beat }] }}>
        <PixelText variant="statBig" size={22} color={hurry ? color.red : color.yellow}>
          {clock(seconds)}
        </PixelText>
      </Animated.View>
    </Stack>
  );
}
