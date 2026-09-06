import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import ProgressBar from './ProgressBar';
import PixelButton from './PixelButton';
import { color, space } from './theme';

export interface QuestRowProps {
  name: string;
  /** Reward as displayed: "+$5", "+250 XP". */
  reward: string;
  /** Completion from 0 to 1. */
  value: number;
  /** Progress caption: "2 / 3". */
  progress: string;
  /** Shows a CLAIM button once the bar is full. */
  onClaim?: () => void;
  claimed?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * One daily quest. The bar turns gold at 100% so a claimable quest is
 * distinguishable from a running one without reading the fraction.
 */
export default function QuestRow({ name, reward, value, progress, onClaim, claimed = false, style }: QuestRowProps) {
  const done = value >= 1;
  return (
    <PixelPanel style={style}>
      <Stack gap={space.sm}>
        <Row justify="space-between" gap={space.sm}>
          <PixelText variant="body" size={12} color={color.white} numberOfLines={1} style={{ flex: 1 }}>
            {name}
          </PixelText>
          <PixelText variant="label">{reward}</PixelText>
        </Row>
        <ProgressBar value={value} fill={done ? color.yellow : color.green} accessibilityLabel={`${name}: ${progress}`} />
        <Row justify="space-between" gap={space.sm}>
          <PixelText variant="bodySmall" size={10}>
            {claimed ? 'CLAIMED' : progress}
          </PixelText>
          {done && onClaim && !claimed ? (
            <PixelButton label="CLAIM" tone="gold" size={8} padY={space.sm} onPress={onClaim} />
          ) : null}
        </Row>
      </Stack>
    </PixelPanel>
  );
}
