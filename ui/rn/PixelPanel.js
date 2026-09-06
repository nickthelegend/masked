import React from 'react';
import { View } from 'react-native';
import { bevelBox, color, radius, space } from './theme';

/** Bevelled container. `accent` swaps the border to a colored outline. */
export default function PixelPanel({ children, accent, bg = color.panel, depth = 6, pad = space.md, round = 0, style }) {
  return (
    <View style={[bevelBox(bg, depth, accent || color.ink), { padding: pad, borderRadius: round }, style]}>
      {children}
    </View>
  );
}
