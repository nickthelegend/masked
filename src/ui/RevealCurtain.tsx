import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import PixelText from './PixelText';
import Stack from './Stack';
import { color, space } from './theme';
import { DURATION, useReducedMotion, USE_NATIVE_DRIVER } from './motion';

export interface RevealCurtainProps {
  /** Flip to true at the buzzer. */
  active: boolean;
  /** Headline, e.g. "TAPE UNSEALED". */
  label?: string;
  sublabel?: string;
  onDone?: () => void;
}

const BARS = 14;
/** quick + beat + beat, matching the sequence below. */
const TOTAL_MS = DURATION.quick + DURATION.beat + DURATION.beat;

/**
 * The buzzer moment: the fog is torn away in horizontal bands.
 *
 * This is the one piece of theatre in the app, and it is placed exactly where
 * the product's whole idea lands — the instant hidden state becomes public.
 * Bands retract in sequence rather than fading, so it reads as a curtain
 * being pulled apart, not a dissolve.
 */
export default function RevealCurtain({ active, label = 'TAPE UNSEALED', sublabel, onDone }: RevealCurtainProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const done = useRef(false);
  /**
   * The callback, held in a ref so it is not a dependency.
   *
   * Callers pass an inline arrow, which is a new identity on every render. As
   * a dependency it restarted the effect on every render — and the restart ran
   * `Animated.sequence` from wherever `progress` had got to, so a finished
   * curtain animated *backwards* from 1 to 0.45 and its headline faded back in
   * over the result board underneath it. On a screen that re-renders as the
   * tape and the head-to-head record load, that is most of the time.
   */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  /**
   * The curtain is absolutely positioned inside the reveal's content box,
   * which is taller than the window — so left to fill it, the headline
   * centred itself hundreds of pixels below the fold and the bands tore over
   * content nobody was looking at. It covers a window's worth, from the top.
   */
  const { height: windowHeight } = useWindowDimensions();

  useEffect(() => {
    if (!active) {
      progress.setValue(0);
      done.current = false;
      return undefined;
    }
    // Torn once per mount. Re-running it is never right: the curtain covers
    // state that has already become public.
    if (done.current) return undefined;
    if (reduced) {
      done.current = true;
      onDoneRef.current?.();
      return undefined;
    }
    const anim = Animated.sequence([
      Animated.timing(progress, { toValue: 0.45, duration: DURATION.quick, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.delay(DURATION.beat),
      Animated.timing(progress, { toValue: 1, duration: DURATION.beat, easing: Easing.in(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
    ]);
    anim.start();

    // Completion is driven by a timer, never by the animation callback.
    // JS-driven Animated runs on requestAnimationFrame, which browsers do not
    // fire in a hidden tab — so gating state on it means alt-tabbing during a
    // reveal leaves this curtain stuck over the whole UI forever.
    const timer = setTimeout(() => {
      if (!done.current) {
        done.current = true;
        onDoneRef.current?.();
      }
    }, TOTAL_MS);

    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [active, reduced, progress]);

  if (!active || reduced) return null;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        { pointerEvents: 'none', bottom: undefined, height: windowHeight },
      ]}
    >
      {Array.from({ length: BARS }).map((_, i) => {
        const fromLeft = i % 2 === 0;
        return (
          <Animated.View
            key={i}
            style={{
              flex: 1,
              backgroundColor: color.ink,
              transform: [
                {
                  translateX: progress.interpolate({
                    // Each band leaves in its own direction and on its own
                    // beat, so the tear reads as mechanical rather than smooth.
                    inputRange: [0, 0.45, 1],
                    outputRange: [0, 0, fromLeft ? -1400 : 1400],
                  }),
                },
              ],
            }}
          />
        );
      })}

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            alignItems: 'center',
            justifyContent: 'center',
            opacity: progress.interpolate({ inputRange: [0, 0.3, 0.55, 1], outputRange: [0, 1, 1, 0] }),
          },
        ]}
      >
        <Stack align="center" gap={space.sm}>
          <PixelText variant="h1" color={color.yellow} align="center">
            {label}
          </PixelText>
          {sublabel ? (
            <PixelText variant="label" color={color.white} align="center">
              {sublabel}
            </PixelText>
          ) : null}
        </Stack>
      </Animated.View>
    </View>
  );
}
