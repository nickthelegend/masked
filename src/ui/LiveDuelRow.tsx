import { Pressable, type ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import TokenLogo from './TokenLogo';
import RoundClock from './RoundClock';
import { border, color, pressedBevel, space } from './theme';

export interface LiveDuelRowProps {
  symbol: string;
  mint: string;
  /** Shortened, both sides. */
  creator: string;
  joiner: string;
  potSol: number;
  secondsLeft: number;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
}

/**
 * A duel happening right now, as a spectator sees it listed.
 *
 * Deliberately shows no position information — there is none to show, and
 * that is the point. Market, players, pot, clock.
 */
export default function LiveDuelRow({
  symbol,
  mint,
  creator,
  joiner,
  potSol,
  secondsLeft,
  onPress,
  style,
}: LiveDuelRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`Watch ${symbol}`}>
      {({ pressed }) => (
        <Row
          gap={space.sm}
          pad={space.sm}
          align="center"
          bg={color.panel}
          outline={color.green}
          outlineWidth={border.base}
          style={[pressedBevel(pressed) as ViewStyle, ...(Array.isArray(style) ? style : style ? [style] : [])]}
        >
          <TokenLogo mint={mint} symbol={symbol} size={28} />
          <Stack flex={1} gap={2}>
            <PixelText variant="label" size={10} color={color.white} numberOfLines={1}>
              {symbol || 'MARKET'}
            </PixelText>
            <PixelText variant="bodySmall" size={10} color={color.textFaint} numberOfLines={1}>
              {creator} v {joiner}
            </PixelText>
          </Stack>
          <Stack gap={2} align="flex-end">
            <PixelText variant="numeric" size={10} color={color.yellow}>
              {potSol.toFixed(2)}◎
            </PixelText>
            <RoundClock seconds={secondsLeft} size={9} />
          </Stack>
        </Row>
      )}
    </Pressable>
  );
}
