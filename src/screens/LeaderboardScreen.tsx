import { Badge, LeaderRow, PixelText, Podium, Row, Stack, color, space } from '../ui';
import { short } from '../chain/useTapes';
import { usePlayerStats } from '../chain/usePlayerStats';
import type { Place } from '../ui';

/** Top of the board: podium for the first three, flat rows below. */
export default function LeaderboardScreen() {
  // Read from on-chain PlayerStats accounts, not summed on the client.
  const { board, loaded } = usePlayerStats();

  const podium = board.slice(0, 3).map((r, i) => ({
    name: short(r.owner),
    place: (i + 1) as Place,
    wins: `${r.wins}W`,
  }));

  return (
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h2" align="center">
        FOG WINS · 24H
      </PixelText>
      {/* Streaks come from chain too — best_streak never decreases. */}
      <Row gap={space.sm} justify="center" wrap>
        <Badge label={`${board.length} PLAYERS`} tone="quiet" variant="label" />
        {board[0] ? <Badge label={`BEST STREAK ${board[0].bestStreak}`} tone="gold" variant="label" /> : null}
      </Row>

      {podium.length > 0 ? <Podium entries={podium} /> : null}

      <Stack gap={space.sm}>
        {board.slice(3).map((row, i) => (
          <LeaderRow
            key={row.owner.toBase58()}
            rank={i + 4}
            name={short(row.owner)}
            won={`+${(row.taken / 1e9).toFixed(2)}◎`}
            wins={`${row.wins}W`}
          />
        ))}
      </Stack>

      {loaded && board.length === 0 ? (
        <PixelText variant="bodySmall" align="center" color={color.textFaint}>
          NO WINS RECORDED YET
        </PixelText>
      ) : null}
    </Stack>
  );
}
