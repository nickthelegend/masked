import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent } from 'react-native';
import PixelText from './PixelText';
import { border, color } from './theme';

export interface TickerProps {
  /** Headlines. Joined with a mid-dot separator and printed twice. */
  items?: string[];
  /** Milliseconds for one full pass of the strip. */
  duration?: number;
  /**
   * Travel distance in px. Left undefined, the strip measures one copy of the
   * line and travels exactly that far, which is what makes the loop seamless.
   */
  distance?: number;
  height?: number;
  /** Set false to hold the marquee still. */
  animate?: boolean;
}

const SEP = '   ·   ';

/**
 * The strip is laid out this wide so neither copy of the line can wrap. It is
 * clipped by the 26px shell strip regardless, so the excess costs nothing —
 * and without it, a line longer than the shell wraps to two rows and spills
 * over the header above.
 */
const STRIP_WIDTH = 4000;

/**
 * Win marquee across the top of the shell.
 *
 * The line is printed twice and the strip travels exactly one copy's width, so
 * the second copy is under the cursor at the instant the first leaves — no
 * seam, and no blank stretch when the copy is shorter than the travel.
 */
export default function Ticker({ items = [], duration = 18000, distance, height = 26, animate = true }: TickerProps) {
  const x = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(0);
  const travel = distance ?? measured;

  useEffect(() => {
    if (!animate || travel <= 0) return undefined;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, duration, travel, x]);

  const line = items.join(SEP) + SEP;

  const onCopyLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };

  return (
    <View
      style={{
        height,
        backgroundColor: color.ink,
        borderTopWidth: border.base,
        borderBottomWidth: border.base,
        borderColor: color.panel,
        overflow: 'hidden',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={{
          // Absolute so the strip sizes to its content instead of being
          // clipped to the shell width — otherwise each copy ellipsises.
          position: 'absolute',
          left: 0,
          width: STRIP_WIDTH,
          flexDirection: 'row',
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, -travel] }) }],
        }}
      >
        <PixelText variant="bodySmall" numberOfLines={1} color={color.textDim} onLayout={onCopyLayout}>
          {line}
        </PixelText>
        <PixelText variant="bodySmall" numberOfLines={1} color={color.textDim}>
          {line}
        </PixelText>
      </Animated.View>
    </View>
  );
}
