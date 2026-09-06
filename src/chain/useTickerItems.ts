/**
 * Ticker headlines composed from real chain activity.
 *
 * This replaced a hardcoded string of invented handles and dollar amounts
 * ("t_kev_2 WON $7.65", "LIVE FOGS: 38") that was still shipping in the app.
 * Every line below is derived from a Tape, a PlayerStats record or the open
 * book, and the amounts are in SOL because that is what the program escrows.
 */
import { useMemo } from 'react';
import { useTapes } from './useTapes';
import { usePlayerStats } from './usePlayerStats';
import { useOpenMatches } from './useOpenMatches';

const short = (k: { toBase58(): string }) => {
  const s = k.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
};

export function useTickerItems(): string[] {
  const { tapes } = useTapes(15_000);
  const { board } = usePlayerStats(15_000);
  const { matches } = useOpenMatches(15_000);

  return useMemo(() => {
    const lines: string[] = [];

    for (const t of tapes.slice(0, 3)) {
      lines.push(`${short(t.winner)} TOOK ${(t.potPaid / 1e9).toFixed(2)}◎`);
    }

    const streaking = board.find((b) => b.streak >= 2);
    if (streaking) lines.push(`${short(streaking.owner)} ${streaking.streak} WIN STREAK`);

    const top = board[0];
    if (top && top.taken > 0) lines.push(`TOP: ${short(top.owner)} ${(top.taken / 1e9).toFixed(2)}◎`);

    if (matches.length > 0) lines.push(`OPEN FOGS: ${matches.length}`);
    if (tapes.length > 0) lines.push(`DUELS SETTLED: ${tapes.length}`);

    // Until anything has happened, say so rather than inventing activity.
    return lines.length > 0 ? lines : ['NO DUELS SETTLED YET — OPEN THE FIRST ONE'];
  }, [tapes, board, matches]);
}
