import { Pressable, type ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import TokenLogo from './TokenLogo';
import SourceBadge, { type PriceSource } from './SourceBadge';
import { border, color, focusRing, noOutline, pressedBevel, space } from './theme';

export interface MarketRowProps {
  mint: string;
  symbol: string;
  /**
   * Another row in the same list claims this ticker.
   *
   * pump.fun tickers are not unique — four separate WOFI mints sit in the top
   * six by market cap — so a list keyed on the symbol alone offers identical-
   * looking rows that trade completely different tokens. Every row shows its
   * short mint; this lights the mint up where the ticker alone would mislead.
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
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${symbol}, ${price}`} style={noOutline}>
      {(state) => (
        <Row
          gap={space.sm}
          pad={space.sm}
          align="center"
          bg={selected ? color.panelLight : color.panel}
          outline={selected ? color.yellow : color.blue}
          outlineWidth={border.base}
          style={[
            pressedBevel(state.pressed) as ViewStyle,
            ...((state as { focused?: boolean }).focused ? [focusRing] : []),
            ...(Array.isArray(style) ? style : style ? [style] : []),
          ]}
        >
          <TokenLogo mint={mint} symbol={symbol} uri={imageUri} size={32} />

          <Stack flex={1} gap={2}>
            <PixelText variant="label" size={10} color={selected ? color.yellow : color.white} numberOfLines={1}>
              {symbol}
            </PixelText>
            {/* The mint is the token; the ticker is only a label anyone can reuse.
                It leads, so a long name truncates before the identity does. */}
            <PixelText variant="bodySmall" size={10} color={color.textFaint} numberOfLines={1}>
              <PixelText variant="bodySmall" size={10} color={ambiguous ? color.yellow : color.textDim}>
                {`${mint.slice(0, 4)}…${mint.slice(-4)}`}
              </PixelText>
              {` · ${name}`}
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
