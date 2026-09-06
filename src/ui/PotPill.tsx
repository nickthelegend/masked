import type { ViewStyle } from 'react-native';
import Row from './Row';
import PixelText from './PixelText';
import { border, color, radius, space } from './theme';
import { sol } from './format';
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
  style,
}: PotPillProps) {
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
    </Row>
  );
}
