import React from 'react';
import { View, Text } from 'react-native';
import { text, color } from './theme';

export default function StatTile({ value, label, tone = color.yellow, align = 'center', style }) {
  return (
    <View style={[{ alignItems: align === 'center' ? 'center' : 'flex-start' }, style]}>
      <Text style={[text.statBig, { color: tone }]}>{value}</Text>
      <Text style={[text.label, { color: color.textDim, marginTop: 6 }]}>{label}</Text>
    </View>
  );
}
