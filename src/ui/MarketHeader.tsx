import type { ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import TokenLogo from './TokenLogo';
import SourceBadge, { type PriceSource } from './SourceBadge';
import { color, space } from './theme';

export interface MarketHeaderProps {
  mint: string;
  symbol: string;
  name?: string;
  imageUri?: string | null;
  /** Formatted mark. */
  price: string;
  /** Percent move since the round opened. Null before the first mark lands. */
  changePct?: number | null;
  source: PriceSource;
  style?: ViewStyle | ViewStyle[];
}

/**
 * What you are trading, above the chart.
 *
 * The round used to say "$BONK" over a null mint. This reads the symbol the
 * match was created with and the mark the chain is actually holding, and names
 * the feed behind it — so nothing on this row is a label someone typed.
 */
export default function MarketHeader({
  mint,
  symbol,
  name,
  imageUri,
  price,
  changePct = null,
  source,
  style,
}: MarketHeaderProps) {
  const tone = changePct === null || changePct === 0 ? color.textDim : changePct > 0 ? color.green : color.red;
  const sign = changePct !== null && changePct > 0 ? '+' : '';

  return (
    <Row gap={space.sm} align="center" style={style}>
      <TokenLogo mint={mint} symbol={symbol} uri={imageUri} size={28} />

      <Stack flex={1} gap={2}>
        <PixelText variant="label" size={10} color={color.white} numberOfLines={1}>
          {symbol}
        </PixelText>
        {name ? (
          <PixelText variant="bodySmall" size={9} color={color.textFaint} numberOfLines={1}>
            {name}
          </PixelText>
        ) : null}
      </Stack>

      <Stack gap={2} align="flex-end">
        <PixelText variant="numeric" size={12} color={color.white}>
          {price}
        </PixelText>
        {changePct === null ? (
          <SourceBadge source={source} />
        ) : (
          <PixelText variant="bodySmall" size={10} color={tone}>
            {sign}
            {changePct.toFixed(2)}%
          </PixelText>
        )}
      </Stack>
    </Row>
  );
}
