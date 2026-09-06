import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, Text } from 'react-native';
import { color, text, border } from './theme';

export default function Ticker({ items = [], duration = 18000, distance = 900 }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(x, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })).start();
  }, [duration, x]);
  const line = items.join('   ·   ') + '   ·   ';
  return (
    <View style={{ height: 26, backgroundColor: color.ink, borderTopWidth: border.base, borderBottomWidth: border.base,
      borderColor: color.panel, overflow: 'hidden', justifyContent: 'center' }}>
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] }) }] }}>
        <Text numberOfLines={1} style={[text.bodySmall, { color: color.textDim }]}>{line + line}</Text>
      </Animated.View>
    </View>
  );
}
