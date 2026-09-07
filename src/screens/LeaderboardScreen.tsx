import { Badge, LeaderRow, PixelText, Podium, Row, Stack, color, space } from '../ui';
import { short } from '../chain/useTapes';
import { usePlayerStats } from '../chain/usePlayerStats';
import type { Place } from '../ui';

/** Top of the board: podium for the first three, flat rows below. */
export default function LeaderboardScreen() {
  // Read from on-chain PlayerStats accounts, not summed on the client.
  const { board, loaded } = usePlayerStats();

  const bestStreak = board.reduce((best, r) => Math.max(best, r.bestStreak), 0);

  const podium = board.slice(0, 3).map((r, i) => ({
    name: short(r.owner),
    place: (i + 1) as Place,
    wins: `${r.wins}W`,
  }));

  return (
    <Stack pad={space.lg} gap={space.md}>
      {/* Not "24H". PlayerStats are lifetime counters — the program has no
          notion of a rolling window — so a 24-hour label would be describing
          data that does not exist. */}
      <PixelText variant="h2" align="center">
        FOG WINS · ALL TIME
      </PixelText>
      {/* Streaks come from chain too — best_streak never decreases. This is
          the best on the board, not the best of whoever happens to be ranked
          first: those are different players as soon as someone wins a big pot
          on a shorter run. */}
      <Row gap={space.sm} justify="center" wrap>
        <Badge label={`${board.length} PLAYERS`} tone="quiet" variant="label" />
        {bestStreak > 0 ? (
          <Badge label={`BEST STREAK ${bestStreak}`} tone="gold" variant="label" />
        ) : null}
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
