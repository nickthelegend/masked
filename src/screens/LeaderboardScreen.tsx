import { useMemo } from 'react';
import { Badge, LeaderRow, PixelText, Podium, Stack, color, space } from '../ui';
import { short, useTapes } from '../chain/useTapes';
import type { Place } from '../ui';

/** Top of the board: podium for the first three, flat rows below. */
export default function LeaderboardScreen() {
  const { tapes, loaded } = useTapes();

  /** Aggregate wins and lamports taken, per wallet, from real settled tapes. */
  const board = useMemo(() => {
    const byWallet = new Map<string, { name: string; won: number; wins: number }>();
    for (const t of tapes) {
      const key = t.winner.toBase58();
      const row = byWallet.get(key) ?? { name: short(t.winner), won: 0, wins: 0 };
      row.won += t.potPaid;
      row.wins += 1;
      byWallet.set(key, row);
    }
    return [...byWallet.values()].sort((a, b) => b.won - a.won);
  }, [tapes]);

  const podium = board.slice(0, 3).map((r, i) => ({
    name: r.name,
    place: (i + 1) as Place,
    wins: `${r.wins}W`,
  }));

  return (
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h2" align="center">
        FOG WINS · 24H
      </PixelText>
      <Badge label="RESETS IN 06:12:40" tone="quiet" variant="label" style={{ alignSelf: 'center' }} />

      {podium.length > 0 ? <Podium entries={podium} /> : null}

      <Stack gap={space.sm}>
        {board.slice(3).map((row, i) => (
          <LeaderRow
            key={row.name}
            rank={i + 4}
            name={row.name}
            won={`+${(row.won / 1e9).toFixed(2)}◎`}
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
