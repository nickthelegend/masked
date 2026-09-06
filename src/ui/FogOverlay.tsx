import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import PixelText from './PixelText';
import { color } from './theme';

export interface FogOverlayProps {
  /** When false the curtain is not rendered and the content shows through. */
  active?: boolean;
  /** Caption printed on the curtain, e.g. "FOGGED". Omit for a bare curtain. */
  label?: string;
  /** Opacity of the ink curtain under the drifting lines. */
  cover?: number;
  /** Height of one scanline band. */
  band?: number;
  /** Milliseconds for one full drift cycle. */
  duration?: number;
  /** Set false to hold the curtain still (screenshots, reduced motion). */
  animate?: boolean;
  style?: ViewStyle | ViewStyle[];
}

const BANDS = 60;

/**
 * The hidden-state curtain: an ink wash under a slow drift of scanlines, used
 * over anything that must not be readable until the reveal (the opponent's
 * PnL, your own tape while the round is live).
 *
 * The drift is a single native-driver `translateY` on a band strip — the one
 * animation this component owns. It never fades content in or out, because a
 * fade would read as loading rather than as concealment.
 */
export default function FogOverlay({
  active = true,
  label,
  cover = 0.82,
  band = 3,
  duration = 2600,
  animate = true,
  style,
}: FogOverlayProps) {
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate || !active) return undefined;
    const loop = Animated.loop(
      Animated.timing(drift, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, active, duration, drift]);

  if (!active) return null;

  const step = band * 2;

  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden' }, style]} pointerEvents="none">
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color.ink, opacity: cover }]} />
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: -step,
          transform: [
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, step] }) },
          ],
        }}
      >
        {Array.from({ length: BANDS }).map((_, i) => (
          <View key={i} style={{ height: band, marginTop: i === 0 ? 0 : band, backgroundColor: color.panelLight, opacity: 0.35 }} />
        ))}
      </Animated.View>
      {label ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <PixelText variant="label" color={color.textFaint}>
            {label}
          </PixelText>
        </View>
      ) : null}
    </View>
  );
}
