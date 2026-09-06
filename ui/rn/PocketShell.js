import React from 'react';
import { View, Text } from 'react-native';
import { color, text, border, radius } from './theme';

/** Red Game Boy-style shell. Screen has curved edges; controls are decorative. */
export default function PocketShell({ children, screenHeight = 700, caption = 'FOG DUEL' }) {
  return (
    <View style={{ width: '100%', maxWidth: 440, backgroundColor: color.shellBottom, borderWidth: border.shell,
      borderColor: color.shellEdge, borderTopLeftRadius: 18, borderTopRightRadius: 18,
      borderBottomRightRadius: 18, borderBottomLeftRadius: 70, paddingHorizontal: 14, paddingTop: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10 }}>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#ff8a90' }} />
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color.shellButton }} />
        </View>
        <Text style={[text.tabLabel, { fontSize: 8, color: color.shellInk }]}>MASKED·POCKET</Text>
        <View style={{ width: 34, height: 6, borderRadius: 3, backgroundColor: color.shellButton }} />
      </View>
      <View style={{ backgroundColor: color.shellInner, padding: 10, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        borderBottomRightRadius: 16, borderBottomLeftRadius: 30 }}>
        <View style={{ height: screenHeight, backgroundColor: color.screen, borderWidth: border.thick,
          borderColor: color.inkDeep, borderRadius: radius.screen, overflow: 'hidden' }}>
          {children}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingTop: 16, paddingBottom: 20 }}>
        <View style={{ width: 74, height: 74 }}>
          <View style={{ position: 'absolute', left: 24, width: 26, height: 74, backgroundColor: '#5c0a12', borderWidth: border.base, borderColor: color.shellInner, borderRadius: 6 }} />
          <View style={{ position: 'absolute', top: 24, width: 74, height: 26, backgroundColor: '#5c0a12', borderWidth: border.base, borderColor: color.shellInner, borderRadius: 6 }} />
        </View>
        <Text style={[text.label, { color: color.shellInk }]}>{caption}</Text>
        <View style={{ flexDirection: 'row', gap: 10, transform: [{ rotate: '-16deg' }] }}>
          {['B', 'A'].map((l) => (
            <View key={l} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: color.shellButton,
              borderWidth: border.base, borderColor: color.shellInner, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[text.tabLabel, { fontSize: 10, color: color.shellInk }]}>{l}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
