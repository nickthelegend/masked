import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { color, text, border, radius } from './theme';

export const TABS = [
  { key: 'feed',   label: 'FEED',  glyph: '\u25A4', icon: color.cyan,   ink: '#06263a' },
  { key: 'board',  label: 'RANK',  glyph: '\u25B2', icon: color.orange, ink: '#4a2e00' },
  { key: 'duel',   label: 'DUEL',  glyph: '\u2694', icon: color.red,    ink: '#ffffff', big: true },
  { key: 'modes',  label: 'MODES', glyph: '\u25A6', icon: color.purple, ink: '#2c0a4a' },
  { key: 'quests', label: 'QUEST', glyph: '\u2713', icon: color.green,  ink: '#05270f' },
];

/** Colorful pixel tab bar. Each tab is an icon plate on a bevelled plinth. */
export default function TabBar({ active, onChange, tabs = TABS }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, paddingHorizontal: 8, paddingTop: 8,
      paddingBottom: 12, backgroundColor: color.ink, borderTopWidth: border.thick, borderTopColor: color.panelLight }}>
      {tabs.map((t) => {
        const on = active === t.key;
        const plinth = t.big ? (on ? color.yellow : '#c9971a') : (on ? color.blue : color.panel);
        const s = t.big ? 34 : 26;
        return (
          <Pressable key={t.key} onPress={() => onChange(t.key)} style={{ flex: t.big ? 1.3 : 1, alignItems: 'center',
            paddingVertical: t.big ? 12 : 8, backgroundColor: plinth, borderWidth: border.base, borderColor: color.ink,
            borderBottomWidth: border.base + 4, borderRadius: radius.card }}>
            <View style={{ width: s, height: s, backgroundColor: t.icon, borderRadius: radius.tile, borderWidth: border.thin,
              borderColor: t.ink === '#ffffff' ? '#5c0a12' : t.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: 'PressStart2P_400Regular', fontSize: t.big ? 15 : 12, color: t.ink }}>{t.glyph}</Text>
            </View>
            <Text style={[text.tabLabel, { marginTop: 5, color: t.big && on ? '#3a2a00' : color.white }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
