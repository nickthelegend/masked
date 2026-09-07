import type { ViewStyle } from 'react-native';
import PixelButton from './PixelButton';
import PixelText from './PixelText';
import Row from './Row';
import Stack from './Stack';
import { color, onInk, space } from './theme';

export interface SizePickerProps {
  /** Fractions of what is available, 0..1. */
  options?: number[];
  value: number;
  onChange: (fraction: number) => void;
  label?: string;
  /** Line under the row — the impact this size would cost, ideally. */
  note?: string;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Quarter, half, max. Three is enough to make size a decision and few enough
 * that it stays one tap during a sixty-second round.
 */
export const SIZES = [0.25, 0.5, 1];

const LABELS: Record<string, string> = { '0.25': '1/4', '0.5': '1/2', '1': 'MAX' };

/**
 * How much of what you have left to put on.
 *
 * The size of a fill was a constant — every LONG spent 40% of the remaining
 * quote, and every CLOSE sold everything — which took the one decision the
 * private book exists to make and made it for the player. Impact is quadratic
 * in size against a constant-product curve, so a max fill and a quarter fill
 * are genuinely different trades, and the receipt underneath says by how much.
 */
export default function SizePicker({
  options = SIZES,
  value,
  onChange,
  label = 'SIZE',
  note,
  disabled = false,
  style,
}: SizePickerProps) {
  return (
    <Stack gap={space.xs} style={style}>
      <Row gap={space.sm} align="center">
        {label ? (
          <PixelText variant="label" size={8} color={color.textDim}>
            {label}
          </PixelText>
        ) : null}
        {options.map((v) => (
          <PixelButton
            key={v}
            flex={1}
            label={LABELS[String(v)] ?? `${Math.round(v * 100)}%`}
            size={9}
            padY={8}
            disabled={disabled}
            bg={v === value ? color.orange : color.panelLight}
            // Dark ink on the bright plate: white on orange is ~1.9:1.
            fg={v === value ? onInk.orange : color.white}
            onPress={() => onChange(v)}
          />
        ))}
      </Row>
      {note ? (
        <PixelText variant="bodySmall" size={9} color={color.textFaint}>
          {note}
        </PixelText>
      ) : null}
    </Stack>
  );
}
