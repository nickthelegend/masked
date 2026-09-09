import type { ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { border, color, radius, space } from './theme';
import { sol, solExact } from './format';
import type { TypeRole } from './tokens';

export interface PotPillProps {
  /** A number is formatted as money; a string is printed as given. */
  amount: number | string;
  label?: string;
  tone?: string;
  bg?: string;
  edge?: string;
  variant?: Extract<TypeRole, 'tabLabel' | 'label' | 'numeric' | 'bodySmall'>;
  size?: number;
  /**
   * Rake as a fraction, e.g. 0.02. Given one, the pill prints what the winner
   * actually takes beside the pot.
   *
   * The pot is the number a player looks at and the payout is the number they
   * receive, and they are not the same — 0.20◎ on the pill and 0.196◎ in the
   * wallet is a small discrepancy that reads as a bug at exactly the moment a
   * judge is watching money move.
   */
  rake?: number;
  style?: ViewStyle | ViewStyle[];
}

/**
 * The stake on the table. A rounded ink chip so it reads as a token sitting on
 * whatever it overlaps — the live header, a sparkline corner.
 */
export default function PotPill({
  amount,
  label = 'POT',
  tone = color.yellow,
  bg = color.ink,
  edge = color.panelLight,
  variant = 'numeric',
  size = 9,
  rake,
  style,
}: PotPillProps) {
  const takes =
    rake !== undefined && typeof amount === 'number' ? amount * (1 - rake) : null;
  return (
    <Row
      gap={space.xs}
      bg={bg}
      outline={edge}
      outlineWidth={border.thin}
      round={radius.pill}
      padX={space.sm}
      padY={2}
      alignSelf="flex-start"
      style={style}
    >
      {label ? (
        <PixelText variant={variant} size={size} color={color.textDim}>
          {label}
        </PixelText>
      ) : null}
      <PixelText variant={variant} size={size} color={tone}>
        {typeof amount === 'number' ? sol(amount) : amount}
      </PixelText>
      {takes !== null ? (
        <PixelText variant="tabLabel" size={Math.max(7, size - 2)} color={color.textFaint}>
          {`· TAKES ${solExact(takes)}`}
        </PixelText>
      ) : null}
    </Row>
  );
}
