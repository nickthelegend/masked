import type { ViewStyle } from 'react-native';
import Stack from './Stack';
import Row from './Row';
import PixelText from './PixelText';
import { border, color, space } from './theme';

export interface VenueQuoteProps {
  status: 'idle' | 'asking' | 'quote' | 'no-route' | 'error';
  side?: 'buy' | 'sell';
  venuePrice?: string;
  /** Positive: the book filled worse than Jupiter would have. */
  diffPct?: number;
  hops?: number;
  message?: string;
  /** A newer fill is being asked about; the price shown is for an earlier one. */
  refreshing?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Jupiter's price for the same fill, beside the book's.
 *
 * Sits under the fill receipt. It says in as many words that it is a
 * comparison and not where the fill went: the fill stayed on the private book,
 * and saying otherwise would undo the reason the book exists.
 */
export default function VenueQuote({ status, side, venuePrice, diffPct, hops, message, refreshing = false, style }: VenueQuoteProps) {
  if (status === 'idle') return null;

  const verdict =
    diffPct === undefined
      ? ''
      : Math.abs(diffPct) < 0.005
        ? 'YOUR BOOK MATCHED IT'
        : `YOUR BOOK ${Math.abs(diffPct).toFixed(2)}% ${diffPct > 0 ? 'WORSE' : 'BETTER'}`;

  return (
    <Stack
      gap={2}
      pad={space.sm}
      bg={color.ink}
      outline={color.panelLight}
      outlineWidth={border.thin}
      style={style}
      testID="venue-quote"
    >
      <PixelText variant="label" size={8} color={color.textDim}>
        {side === 'sell' ? 'JUPITER WOULD PAY, SAME SIZE, NOW' : 'JUPITER WOULD CHARGE, SAME SIZE, NOW'}
      </PixelText>
      {status === 'asking' ? (
        <PixelText variant="bodySmall" size={10} color={color.textFaint}>
          ASKING JUPITER…
        </PixelText>
      ) : status === 'quote' ? (
        <Row gap={space.sm} align="center" style={{ flexWrap: 'wrap' }}>
          <PixelText variant="numeric" size={10} color={color.white}>
            {venuePrice}
          </PixelText>
          <PixelText
            variant="bodySmall"
            size={10}
            color={diffPct !== undefined && diffPct > 0.005 ? color.red : color.green}
          >
            {verdict}
          </PixelText>
          {hops ? (
            <PixelText variant="bodySmall" size={9} color={color.textFaint}>
              {`${hops} ${hops === 1 ? 'POOL' : 'POOLS'}`}
            </PixelText>
          ) : null}
          {/* Said, so a price for an earlier fill is never read as this one's. */}
          {refreshing ? (
            <PixelText variant="bodySmall" size={9} color={color.textFaint}>
              FOR AN EARLIER FILL · ASKING ABOUT YOUR LATEST
            </PixelText>
          ) : null}
        </Row>
      ) : (
        <PixelText variant="bodySmall" size={10} color={status === 'error' ? color.red : color.textFaint}>
          {message}
        </PixelText>
      )}
      <PixelText variant="bodySmall" size={8} color={color.textFaint}>
        A COMPARISON, NOT A ROUTE: THE FILL STAYED ON YOUR PRIVATE BOOK
      </PixelText>
    </Stack>
  );
}
