import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, G, Rect } from 'react-native-svg';
import { color } from './theme';

import { orbStateForPnl, type OrbState } from './orbState';
import { USE_NATIVE_DRIVER } from './motion';

export { orbStateForPnl };
export type { OrbState };

interface OrbPalette {
  core: string;
  ring: string;
  spark: string;
}

const PALETTE: Record<OrbState, OrbPalette> = {
  fog: { core: '#2d3f7d', ring: '#4f6fd8', spark: color.textDim },
  live: { core: color.cyan, ring: '#0f6f8c', spark: '#bff2ff' },
  reveal: { core: color.yellow, ring: '#a06e00', spark: '#fff3b8' },
  // Position states: the orb becomes a glanceable read on how you are doing,
  // so the HUD carries the information even in peripheral vision.
  up: { core: color.green, ring: color.greenDeep, spark: '#bfffd4' },
  down: { core: color.red, ring: '#8f1e2b', spark: '#ffc4ca' },
};


const CORONA_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export interface OrbProps {
  /** Square size in px. Keep it a multiple of 22 for exact pixel steps. */
  size?: number;
  state?: OrbState;
  animate?: boolean;
}

/**
 * The fog/reveal focal element: chunky concentric rings plus an 8-square pixel
 * corona, so it reads 8-bit at any size. One `Animated.Value` drives both the
 * opacity breath and the scale pulse on the native driver.
 *
 * The internal pixel unit is `round(size / 22)`, which is why sizes should be
 * multiples of 22 — otherwise ring widths land on half pixels.
 */
export default function Orb({ size = 140, state = 'fog', animate = true }: OrbProps) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  const p = PALETTE[state];
  const c = size / 2;
  const px = Math.max(3, Math.round(size / 22));

  const corona = useMemo(
    () =>
      CORONA_ANGLES.map((deg) => {
        const r = c - px * 1.5;
        const rad = (deg * Math.PI) / 180;
        return { key: deg, x: c + Math.cos(rad) * r - px / 2, y: c + Math.sin(rad) * r - px / 2 };
      }),
    [c, px],
  );

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        opacity: animate ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) : 1,
        transform: [{ scale: animate ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) : 1 }],
      }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={c - px * 4} fill={p.core} />
        <Circle cx={c} cy={c} r={c - px * 3} fill="none" stroke={p.ring} strokeWidth={px} />
        <Circle cx={c} cy={c} r={c - px * 1.2} fill="none" stroke={p.ring} strokeWidth={px / 1.5} opacity={0.5} />
        <G>
          {corona.map((s) => (
            <Rect key={s.key} x={s.x} y={s.y} width={px} height={px} fill={p.spark} />
          ))}
        </G>
        {/* scanline mask keeps it pixel-flat */}
        {Array.from({ length: Math.floor(size / (px * 2)) }).map((_, i) => (
          <Rect key={i} x={0} y={i * px * 2} width={size} height={px} fill="#000" opacity={0.08} />
        ))}
      </Svg>
    </Animated.View>
  );
}
