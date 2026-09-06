import { Badge, LeaderRow, PixelText, Podium, Stack, space } from '../ui';
import { BOARD, PODIUM } from './data';

/** Top of the board: podium for the first three, flat rows below. */
export default function LeaderboardScreen() {
  return (
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h2" align="center">
        FOG WINS · 24H
      </PixelText>
      <Badge label="RESETS IN 06:12:40" tone="quiet" variant="label" style={{ alignSelf: 'center' }} />

      <Podium entries={PODIUM} />

      <Stack gap={space.sm}>
        {BOARD.map((row) => (
          <LeaderRow key={row.rank} {...row} />
        ))}
      </Stack>
    </Stack>
  );
}
