import type { ViewStyle } from 'react-native';
import Stack from './Stack';
import PixelText from './PixelText';
import { color, space } from './theme';

export interface StatTileProps {
  value: string | number;
  label: string;
  /** Value color. Yellow by default; green/red for signed figures. */
  tone?: string;
  align?: 'center' | 'left';
  labelColor?: string;
  style?: ViewStyle | ViewStyle[];
}

/** Big numeral over a small caption. Landing stats, podium numbers, balances. */
export default function StatTile({
  value,
  label,
  tone = color.yellow,
  align = 'center',
  labelColor = color.textDim,
  style,
}: StatTileProps) {
  return (
    <Stack align={align === 'center' ? 'center' : 'flex-start'} gap={space.sm} style={style}>
      <PixelText variant="statBig" color={tone}>
        {value}
      </PixelText>
      <PixelText variant="label" color={labelColor}>
        {label}
      </PixelText>
    </Stack>
  );
}
