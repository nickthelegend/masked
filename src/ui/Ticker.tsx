import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import PixelText from './PixelText';
import { border, color } from './theme';

export interface TickerProps {
  /** Headlines. Joined with a mid-dot separator and looped twice seamlessly. */
  items?: string[];
  /** Milliseconds for one full pass. */
  duration?: number;
  /** How far the strip travels, in px. Should exceed one copy's width. */
  distance?: number;
  height?: number;
  /** Set false to hold the marquee still. */
  animate?: boolean;
}

const SEP = '   ·   ';

/**
 * Win marquee across the top of the shell. The line is rendered twice so the
 * loop has no visible seam, and the transform runs on the native driver.
 */
export default function Ticker({
  items = [],
  duration = 18000,
  distance = 900,
  height = 26,
  animate = true,
}: TickerProps) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, duration, x]);

  const line = items.join(SEP) + SEP;

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
          flexDirection: 'row',
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) }],
        }}
      >
        <PixelText variant="bodySmall" numberOfLines={1} color={color.textDim}>
          {line + line}
        </PixelText>
      </Animated.View>
    </View>
  );
}
