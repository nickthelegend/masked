import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { color } from './theme';
import { DURATION, USE_NATIVE_DRIVER, useReducedMotion } from './motion';

/** Pixels thrown, and the accents they are allowed to be. */
const COUNT = 28;
const TONES = [color.yellow, color.cyan, color.green, color.magenta, color.orange];

/** Deterministic per-index so a re-render never re-throws the same burst differently. */
function seedAt(i: number) {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { x: a - Math.floor(a), y: b - Math.floor(b) };
}

export interface WinBurstProps {
  /** Flip true once, at the moment the pot is won. */
  active: boolean;
}

/**
 * A short burst of pixels when the pot is taken.
 *
 * Squares, not confetti: the whole product is drawn on a pixel lattice and a
 * soft particle system would be the one thing on screen that is not. It runs
 * once, lasts under a second, and is `pointerEvents: none` so it can never sit
 * between the player and the REMATCH button underneath it.
 *
 * Honours reduced motion by not rendering at all — a burst is decoration, and
 * the reveal says everything it says without one.
 */
export default function WinBurst({ active }: WinBurstProps) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const fired = useRef(false);

  useEffect(() => {
    if (!active || reduced || fired.current) return;
    fired.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: DURATION.hold,
      easing: Easing.out(Easing.quad),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [active, reduced, progress]);

  if (!active || reduced) return null;

  const spread = Math.min(width, 420);

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', overflow: 'hidden' }]}>
      {Array.from({ length: COUNT }).map((_, i) => {
        const { x, y } = seedAt(i);
        const dx = (x - 0.5) * spread;
        const dy = -(60 + y * 220);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '46%',
              width: 6,
              height: 6,
              backgroundColor: TONES[i % TONES.length],
              opacity: progress.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                {
                  // Up, then over: a thrown pixel falls back, so the vertical
                  // leg eases out and then gives back a third of its rise.
                  translateY: progress.interpolate({
                    inputRange: [0, 0.55, 1],
                    outputRange: [0, dy, dy * 0.66],
                  }),
                },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
