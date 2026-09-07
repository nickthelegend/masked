import { Pressable, type ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import TokenLogo from './TokenLogo';
import SourceBadge, { type PriceSource } from './SourceBadge';
import { border, color, pressedBevel, space } from './theme';

export interface MarketRowProps {
  mint: string;
  symbol: string;
  /**
   * Drawn after the ticker when another row in the same list shares it.
   *
   * pump.fun tickers are not unique — four separate WOFI mints sit in the top
   * six by market cap — so a list keyed on the symbol alone offers four
   * identical-looking rows that trade completely different tokens.
   */
  ambiguous?: boolean;
  name: string;
  imageUri?: string | null;
  /** Already formatted — this component does not know about price scales. */
  price: string;
  /** Market cap, formatted. Empty for a major, which has no meaningful one. */
  cap?: string;
  source: PriceSource;
  selected?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
}

/**
 * One tradable market in the picker.
 *
 * The whole row is the target rather than a JOIN button on the end: picking a
 * market is a selection, not an action, and it is followed by choosing a stake
 * before anything is staked.
 */
export default function MarketRow({
  mint,
  symbol,
  ambiguous = false,
  name,
  imageUri,
  price,
  cap,
  source,
  selected = false,
  onPress,
  style,
}: MarketRowProps) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${symbol}, ${price}`}>
      {({ pressed }) => (
        <Row
          gap={space.sm}
          pad={space.sm}
          align="center"
          bg={selected ? color.panelLight : color.panel}
          outline={selected ? color.yellow : color.blue}
          outlineWidth={border.base}
          style={[pressedBevel(pressed) as ViewStyle, ...(Array.isArray(style) ? style : style ? [style] : [])]}
        >
          <TokenLogo mint={mint} symbol={symbol} uri={imageUri} size={32} />

          <Stack flex={1} gap={2}>
            <PixelText variant="label" size={10} color={selected ? color.yellow : color.white} numberOfLines={1}>
              {symbol}
            </PixelText>
            <PixelText variant="bodySmall" size={10} color={color.textFaint} numberOfLines={1}>
              {ambiguous ? `${name} · ${mint.slice(0, 4)}…${mint.slice(-4)}` : name}
            </PixelText>
          </Stack>

          <Stack gap={2} align="flex-end">
            <PixelText variant="numeric" size={11} color={color.white}>
              {price}
            </PixelText>
            {cap ? (
              <PixelText variant="bodySmall" size={10} color={color.textFaint}>
                {cap}
              </PixelText>
            ) : (
              <SourceBadge source={source} />
            )}
          </Stack>
        </Row>
      )}
    </Pressable>
  );
}
