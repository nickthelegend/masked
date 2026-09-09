import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import PixelButton from './PixelButton';
import PixelText from './PixelText';
import Row from './Row';
import Stack from './Stack';
import { color, onInk, space } from './theme';

/**
 * Round lengths the picker offers, in seconds.
 *
 * Every one is inside the program's own `MIN_DURATION`..`MAX_DURATION` bound
 * (10s..3600s), so each is a real round the chain will accept rather than a
 * display setting: `create_match` stores the number and `settle_match` refuses
 * before `start_ts + duration`.
 */
export const DURATIONS: Array<{ secs: number; label: string; note: string }> = [
  { secs: 60, label: '1 MIN', note: 'a sprint — one or two fills each' },
  { secs: 300, label: '5 MIN', note: 'the product round' },
  { secs: 900, label: '15 MIN', note: 'room for a thesis to play out' },
];

export interface DurationPickerProps {
  value: number;
  onChange: (secs: number) => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * How long the round runs, chosen at open time.
 *
 * This was an environment variable — `EXPO_PUBLIC_ROUND_SECONDS`, set at build
 * time — which meant the product had one round length and a recording had
 * another. The program has always taken duration as an argument; this is the
 * argument, made visible.
 */
export default function DurationPicker({ value, onChange, disabled = false, style }: DurationPickerProps) {
  const current = DURATIONS.find((d) => d.secs === value);
  return (
    <PixelPanel style={style}>
      <Stack gap={space.sm}>
        <PixelText variant="label">ROUND LENGTH</PixelText>
        <Row gap={space.sm}>
          {DURATIONS.map((d) => (
            <PixelButton
              key={d.secs}
              flex={1}
              label={d.label}
              size={10}
              disabled={disabled}
              bg={d.secs === value ? color.cyan : color.panelLight}
              fg={d.secs === value ? onInk.cyan : color.white}
              onPress={() => onChange(d.secs)}
            />
          ))}
        </Row>
        <PixelText variant="bodySmall" size={10} color={color.textDim}>
          {current ? current.note : `${value}s`}
        </PixelText>
      </Stack>
    </PixelPanel>
  );
}
