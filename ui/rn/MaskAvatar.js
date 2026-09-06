import React from 'react';
import { View, Text } from 'react-native';
import { color, border } from './theme';

/** Masked identity: a "?" plate. Ring color carries rank/side meaning. */
export default function MaskAvatar({ size = 58, ring = color.blue, glyph = '?', style }) {
  return (
    <View style={[{ width: size, height: size, backgroundColor: color.ink, borderWidth: border.base,
      borderColor: ring, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontFamily: 'PressStart2P_400Regular', fontSize: Math.round(size * 0.34), color: ring }}>{glyph}</Text>
    </View>
  );
}
