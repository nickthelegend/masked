import type { ViewStyle } from 'react-native';
import Stack from './Stack';
import PixelText from './PixelText';
import { border, color, space } from './theme';

export interface PendingFillProps {
  side: 'buy' | 'sell';
  state: 'pending' | 'refused';
  /** Predicted execution price, formatted. */
  price: string;
  /** The mark it was predicted from, formatted. */
  mark: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * A fill that has been sent and not yet confirmed.
 *
 * The number is the book's own prediction, not a placeholder: for this size at
 * this mark it is what the program will charge unless the mark moves before the
 * transaction lands. It says it is a prediction, and a refused fill is marked
 * rolled back and struck through rather than silently disappearing.
 */
export default function PendingFill({ side, state, price, mark, style }: PendingFillProps) {
  const refused = state === 'refused';
  return (
    <Stack
      gap={2}
      pad={space.sm}
      bg={color.ink}
      outline={refused ? color.red : color.yellow}
      outlineWidth={border.thin}
      style={style}
      testID="pending-fill"
    >
      <PixelText variant="label" size={8} color={refused ? color.red : color.yellow}>
        {refused ? 'REFUSED · ROLLED BACK' : `${side === 'buy' ? 'BUY' : 'SELL'} SENT · CONFIRMING`}
      </PixelText>
      <PixelText
        variant="bodySmall"
        size={10}
        color={color.textDim}
        style={refused ? ({ textDecorationLine: 'line-through' } as never) : undefined}
      >
        {`PREDICTED ${price} · MARK ${mark}`}
      </PixelText>
    </Stack>
  );
}
