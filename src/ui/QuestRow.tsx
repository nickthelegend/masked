import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import ProgressBar from './ProgressBar';
import Box from './Box';
import { QuestIcon, TrophyIcon } from './icons';
import { color, space, radius, border, onInk } from './theme';

export interface QuestRowProps {
  name: string;
  /**
   * What clearing it actually gives.
   *
   * These used to read `+XP` on every row, and this product has no XP — no
   * account holds it, no screen spends it, nothing on chain records it. A
   * reward the game cannot pay is worse than no reward column, so what is
   * shown now is the achievement's real state.
   */
  reward?: string;
  /** Completion from 0 to 1. */
  value: number;
  /** Progress caption: "2 / 3". */
  progress: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * One achievement, against the player's own on-chain record.
 *
 * Cleared rows carry a gold medal and a filled bar; unfinished ones stay green
 * and say how far off they are. There is no CLAIM: nothing is held back to be
 * collected, because the thing being counted — wins, streak, SOL taken — is
 * already the player's and is already on chain.
 */
export default function QuestRow({ name, reward, value, progress, style }: QuestRowProps) {
  const done = value >= 1;
  return (
    <PixelPanel
      accent={done ? color.yellow : undefined}
      style={style}
    >
      <Stack gap={space.sm}>
        <Row justify="space-between" gap={space.sm} align="center">
          <Row gap={space.sm} align="center" style={{ flex: 1 }}>
            <Box
              width={22}
              height={22}
              round={radius.tile}
              bg={done ? color.yellow : color.ink}
              outline={color.ink}
              outlineWidth={border.thin}
              align="center"
              justify="center"
            >
              {done ? (
                <TrophyIcon size={14} color={onInk.yellow} />
              ) : (
                <QuestIcon size={13} color={color.textFaint} />
              )}
            </Box>
            <PixelText variant="body" size={12} color={color.white} numberOfLines={1} style={{ flex: 1 }}>
              {name}
            </PixelText>
          </Row>
          <PixelText variant="tabLabel" size={8} color={done ? color.yellow : color.textFaint}>
            {reward ?? (done ? 'CLEARED' : 'LOCKED')}
          </PixelText>
        </Row>
        <ProgressBar value={value} fill={done ? color.yellow : color.green} accessibilityLabel={`${name}: ${progress}`} />
        <PixelText variant="bodySmall" size={10} color={done ? color.textDim : color.textFaint}>
          {progress}
        </PixelText>
      </Stack>
    </PixelPanel>
  );
}
