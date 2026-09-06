import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { color } from './theme';

/**
 * The band layout was drawn against a 700px-tall screen. Every offset below is
 * in those design units and is scaled to the real height at render, so the
 * horizon lands in the same place on a phone and on a desktop hero instead of
 * stranding the sea halfway up the page.
 */
const DESIGN_HEIGHT = 700;

/** Sky bands as [sunset index, design-y]. Each is 80 design-units tall. */
const SKY: Array<[number, number]> = [
  [0, 0],
  [1, 50],
  [2, 110],
  [3, 190],
  [4, 265],
  [5, 330],
  [6, 390],
];

const BAND_HEIGHT = 80;
const SUN = { top: 300, size: 140 };
const HORIZON = 452;
const GLOW = { top: 458, height: 40 };
const SEA = { top: 498, height: 130 };
const FOAM = { top: 628, height: 14 };
const SAND_TOP = 642;
const WAVES = [
  { top: 470, opacity: 1 },
  { top: 520, opacity: 0.75 },
];
const WAVE = { width: 26, height: 8, gap: 64, count: 26 };
const SAND_STRIPE = 6;

export interface BeachBackdropProps {
  /** Set false to hold the waves still. */
  animate?: boolean;
  /**
   * Height to scale the bands against. Left undefined, the backdrop measures
   * itself, which is what you want for a full-bleed hero.
   */
  height?: number;
}

/**
 * The animated pixel sunset. Every band comes from `color.sunset` / `sea` /
 * `foam` / `sand`; the two wave rows are `foam` marching sideways on the
 * native driver.
 */
export default function BeachBackdrop({ animate = true, height }: BeachBackdropProps) {
  const near = useRef(new Animated.Value(0)).current;
  const far = useRef(new Animated.Value(0)).current;
  const [measured, setMeasured] = useState(0);

  const resolved = height ?? measured;
  const k = resolved > 0 ? resolved / DESIGN_HEIGHT : 1;
  const s = (n: number) => n * k;

  useEffect(() => {
    if (!animate) return undefined;
    const loops = [
      Animated.loop(Animated.timing(near, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(far, { toValue: 1, duration: 11000, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animate, near, far]);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h > 0 && h !== measured) setMeasured(h);
  };

  const band = (top: number, h: number, bg: string, key: string) => (
    <View key={key} style={{ position: 'absolute', left: 0, right: 0, top: s(top), height: s(h), backgroundColor: bg }} />
  );

  const wave = (top: number, v: Animated.Value, opacity: number, key: string) => (
    <Animated.View
      key={key}
      style={{
        position: 'absolute',
        top: s(top),
        left: s(-120),
        flexDirection: 'row',
        gap: s(WAVE.gap),
        opacity,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, s(WAVE.gap + WAVE.width)] }) }],
      }}
    >
      {Array.from({ length: WAVE.count }).map((_, i) => (
        <View key={i} style={{ width: s(WAVE.width), height: s(WAVE.height), backgroundColor: color.foam }} />
      ))}
    </Animated.View>
  );

  const stripes = Math.ceil(Math.max(0, resolved - s(SAND_TOP)) / s(SAND_STRIPE)) + 1;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {SKY.map(([i, top]) => band(top, BAND_HEIGHT, color.sunset[i], `sky-${top}`))}

      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: s(SUN.top),
          width: s(SUN.size),
          height: s(SUN.size),
          transform: [{ translateX: s(-SUN.size / 2) }],
          backgroundColor: color.sunset[6],
        }}
      />

      {band(HORIZON, 6, color.sunset[6], 'horizon')}
      {band(GLOW.top, GLOW.height, color.seaGlow, 'glow')}
      {band(SEA.top, SEA.height, color.sea, 'sea')}
      {wave(WAVES[0].top, near, WAVES[0].opacity, 'wave-near')}
      {wave(WAVES[1].top, far, WAVES[1].opacity, 'wave-far')}
      {band(FOAM.top, FOAM.height, color.foam, 'foam')}

      <View style={{ position: 'absolute', left: 0, right: 0, top: s(SAND_TOP), bottom: 0, backgroundColor: color.sand }}>
        {Array.from({ length: stripes }).map((_, i) => (
          <View key={i} style={{ height: s(SAND_STRIPE), backgroundColor: i % 2 ? color.sandAlt : color.sand }} />
        ))}
      </View>
    </View>
  );
}
