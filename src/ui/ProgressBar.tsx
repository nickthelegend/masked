import type { ViewStyle } from 'react-native';
import Box from './Box';
import { border, color } from './theme';

export interface ProgressBarProps {
  /** Completion from 0 to 1. Values outside the range are clamped. */
  value: number;
  height?: number;
  /** Fill color. Green reads as claimable; yellow as in-flight. */
  fill?: string;
  track?: string;
  edge?: string;
  accessibilityLabel?: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Quest bar. A hard-edged fill in a 2px-outlined well — no rounding, no
 * gradient, no animation, so the bar reads as N lit cells rather than a smear.
 */
export default function ProgressBar({
  value,
  height = 14,
  fill = color.green,
  track = color.ink,
  edge = color.panelLight,
  accessibilityLabel,
  style,
}: ProgressBarProps) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <Box
      bg={track}
      outline={edge}
      outlineWidth={border.thin}
      height={height}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(pct * 100), min: 0, max: 100 }}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      <Box bg={fill} height="100%" width={`${pct * 100}%`} />
    </Box>
  );
}
