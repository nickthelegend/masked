import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import Svg, { Circle, Rect, G } from 'react-native-svg';
import { color } from './theme';

/**
 * Orb — the fog/reveal focal element. Chunky concentric rings plus a pixel
 * corona built from squares, so it reads 8-bit at any size.
 * state: 'fog' (dim, slow pulse) | 'live' (accent) | 'reveal' (gold flash)
 */
const PALETTE = {
  fog:    { core: '#2d3f7d', ring: '#4f6fd8', spark: '#8fa2e0' },
  live:   { core: color.cyan, ring: '#0f6f8c', spark: '#bff2ff' },
  reveal: { core: color.yellow, ring: '#a06e00', spark: '#fff3b8' },
};

export default function Orb({ size = 140, state = 'fog', animate = true }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animate, pulse]);

  const p = PALETTE[state] || PALETTE.fog;
  const c = size / 2;
  const px = Math.max(3, Math.round(size / 22)); // one "pixel"
  const corona = [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
    const r = c - px * 1.5;
    const rad = (deg * Math.PI) / 180;
    return { x: c + Math.cos(rad) * r - px / 2, y: c + Math.sin(rad) * r - px / 2, key: deg };
  });

  return (
    <Animated.View style={{ width: size, height: size, opacity: animate ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] }) : 1,
      transform: [{ scale: animate ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) : 1 }] }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={c} cy={c} r={c - px * 4} fill={p.core} />
        <Circle cx={c} cy={c} r={c - px * 3} fill="none" stroke={p.ring} strokeWidth={px} />
        <Circle cx={c} cy={c} r={c - px * 1.2} fill="none" stroke={p.ring} strokeWidth={px / 1.5} opacity={0.5} />
        <G>{corona.map((s) => (
          <Rect key={s.key} x={s.x} y={s.y} width={px} height={px} fill={p.spark} />
        ))}</G>
        {/* scanline mask keeps it pixel-flat */}
        {Array.from({ length: Math.floor(size / (px * 2)) }).map((_, i) => (
          <Rect key={i} x={0} y={i * px * 2} width={size} height={px} fill="#000" opacity={0.08} />
        ))}
      </Svg>
    </Animated.View>
  );
}
