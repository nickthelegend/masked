import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import { border, color, space } from './theme';
import { useReducedMotion } from './motion';

export interface FillReceiptProps {
  side: 'buy' | 'sell';
  /** Formatted price the fill landed at. */
  price: string;
  /** Formatted mark immediately before the fill. */
  mark: string;
  /** How far the fill landed from the mark, against the player. */
  impactPct: number;
  /** Changes when a new fill arrives, so the card replays. */
  nonce: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * What the private book charged for a fill.
 *
 * The mechanic that makes this a trading game rather than a clicking game is
 * that size costs you: each player trades their own constant-product curve
 * and pays impact on their own size. None of that is visible if a position
 * simply appears, so this puts the number on screen — the mark before, the
 * price you actually got, and the gap between them.
 *
 * It slides in and settles rather than flashing, because it is a receipt to
 * be read, not an alert.
 */
export default function FillReceipt({ side, price, mark, impactPct, nonce, style }: FillReceiptProps) {
  const reduced = useReducedMotion();
  const enter = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      enter.setValue(1);
      return;
    }
    enter.setValue(0);
    Animated.timing(enter, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [nonce, reduced, enter]);

  // Impact is always a cost, so it is always the warning colour — but a
  // rounding-sized one should not shout.
  const heavy = impactPct >= 1;

  return (
    <Animated.View
      style={[
        {
          opacity: enter,
          transform: [
            { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          ],
        },
        ...(Array.isArray(style) ? style : style ? [style] : []),
      ]}
    >
      <Stack
        gap={space.xs}
        pad={space.sm}
        bg={color.ink}
        outline={heavy ? color.orange : color.panelLight}
        outlineWidth={border.thin}
      >
        <Row justify="space-between" align="center">
          <PixelText variant="label" size={8} color={side === 'buy' ? color.green : color.cyan}>
            {side === 'buy' ? 'BOUGHT' : 'SOLD'} ON YOUR BOOK
          </PixelText>
          <PixelText variant="numeric" size={9} color={heavy ? color.orange : color.textDim}>
            {impactPct >= 0 ? '-' : '+'}
            {Math.abs(impactPct).toFixed(2)}%
          </PixelText>
        </Row>
        <Row justify="space-between">
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            mark was
          </PixelText>
          <PixelText variant="bodySmall" size={10} color={color.text}>
            {mark}
          </PixelText>
        </Row>
        <Row justify="space-between">
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            you filled at
          </PixelText>
          <PixelText variant="bodySmall" size={10} color={color.white}>
            {price}
          </PixelText>
        </Row>
      </Stack>
    </Animated.View>
  );
}
