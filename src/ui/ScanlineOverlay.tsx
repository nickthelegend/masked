import { StyleSheet, View, type ViewStyle } from 'react-native';

export interface ScanlineOverlayProps {
  /** Height of one dark line in px. The gap between lines matches it. */
  lineHeight?: number;
  /** Darkness of each line. 0.08 matches the mask baked into the Orb. */
  opacity?: number;
  /** Number of lines drawn. Enough to cover the tallest surface in the app. */
  lines?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * CRT scanline mask. Absolutely positioned, non-interactive, and drawn as
 * discrete rows rather than a repeating gradient — a gradient would
 * anti-alias and soften every pixel edge underneath it.
 */
export default function ScanlineOverlay({
  lineHeight = 2,
  opacity = 0.08,
  lines = 200,
  style,
}: ScanlineOverlayProps) {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'hidden', gap: lineHeight }, style]} pointerEvents="none">
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={{
            height: lineHeight,
            backgroundColor: '#000',
            opacity,
          }}
        />
      ))}
    </View>
  );
}
