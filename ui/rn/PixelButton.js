import React from 'react';
import { Pressable, Text } from 'react-native';
import { color, text, border, radius } from './theme';

const TONES = {
  primary: { bg: color.green, fg: color.white },
  danger:  { bg: color.red, fg: color.white },
  gold:    { bg: color.yellow, fg: '#3a2a00' },
  quiet:   { bg: color.panel, fg: color.text },
  info:    { bg: color.blue, fg: color.white },
};

/** Press pushes the button down into its own bevel — the whole 8-bit feel lives here. */
export default function PixelButton({ label, onPress, tone = 'primary', size = 12, style, disabled }) {
  const t = TONES[tone] || TONES.primary;
  return (
    <Pressable onPress={disabled ? undefined : onPress} style={({ pressed }) => [{
      backgroundColor: disabled ? color.panelLight : t.bg,
      borderWidth: border.base, borderColor: color.ink,
      borderBottomWidth: pressed ? border.base : border.base + 6,
      borderRadius: radius.tile,
      paddingVertical: 12, paddingHorizontal: 16,
      alignItems: 'center', justifyContent: 'center',
      transform: [{ translateY: pressed ? 4 : 0 }],
      opacity: disabled ? 0.6 : 1,
    }, style]}>
      <Text style={[text.numeric, { fontSize: size, color: t.fg }]}>{label}</Text>
    </Pressable>
  );
}
