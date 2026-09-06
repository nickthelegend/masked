import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { color } from './theme';

/** Sky bands, top to bottom, as [token index, y offset]. Each band is 80px. */
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

export interface BeachBackdropProps {
  /** Set false to hold the waves still. */
  animate?: boolean;
}

/**
 * The animated pixel sunset behind the pocket shell. Every band comes from
 * `color.sunset` / `sea` / `foam` / `sand`; the two wave rows are `foam`
 * marching sideways on the native driver.
 */
export default function BeachBackdrop({ animate = true }: BeachBackdropProps) {
  const near = useRef(new Animated.Value(0)).current;
  const far = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const loops = [
      Animated.loop(Animated.timing(near, { toValue: 1, duration: 7000, easing: Easing.linear, useNativeDriver: true })),
      Animated.loop(Animated.timing(far, { toValue: 1, duration: 11000, easing: Easing.linear, useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [animate, near, far]);

  const band = (top: number, height: number, bg: string, key: string) => (
    <View key={key} style={{ position: 'absolute', left: 0, right: 0, top, height, backgroundColor: bg }} />
  );

  const wave = (top: number, v: Animated.Value, distance: number, opacity: number, key: string) => (
    <Animated.View
      key={key}
      style={{
        position: 'absolute',
        top,
        left: -120,
        flexDirection: 'row',
        gap: 64,
        opacity,
        transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, distance] }) }],
      }}
    >
      {Array.from({ length: 26 }).map((_, i) => (
        <View key={i} style={{ width: 26, height: 8, backgroundColor: color.foam }} />
      ))}
    </Animated.View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {SKY.map(([i, top]) => band(top, BAND_HEIGHT, color.sunset[i], `sky-${top}`))}
      {/* sun */}
      <View
        style={{
          position: 'absolute',
          left: '50%',
          marginLeft: -70,
          top: 300,
          width: 140,
          height: 140,
          backgroundColor: color.sunset[6],
        }}
      />
      {band(452, 6, color.sunset[6], 'horizon')}
      {band(458, 40, color.seaGlow, 'glow')}
      {band(498, 130, color.sea, 'sea')}
      {wave(470, near, 90, 1, 'wave-near')}
      {wave(520, far, 90, 0.75, 'wave-far')}
      {band(628, 14, color.foam, 'foam')}
      <View style={{ position: 'absolute', left: 0, right: 0, top: 642, bottom: 0, backgroundColor: color.sand }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <View key={i} style={{ height: 6, backgroundColor: i % 2 ? color.sandAlt : color.sand }} />
        ))}
      </View>
    </View>
  );
}
