import { Orb, PixelButton, PixelText, Stack, color, money, space } from '../ui';
import { TOKEN } from './data';

export interface MatchmakingScreenProps {
  pot: number;
  onStart: () => void;
}

/**
 * Waiting for an opponent. The fog orb is the only thing moving, because at
 * this point there is genuinely nothing to report.
 */
export default function MatchmakingScreen({ pot, onStart }: MatchmakingScreenProps) {
  return (
    <Stack pad={40} gap={space.xl} align="center">
      <PixelText variant="numeric" size={12} color={color.yellow}>
        MATCHING...
      </PixelText>

      <Orb size={154} state="fog" />

      <PixelText variant="body">
        POT {money(pot)} · 5:00 · {TOKEN}
      </PixelText>

      <PixelButton tone="gold" label="OPPONENT FOUND ›" size={11} onPress={onStart} />
    </Stack>
  );
}
