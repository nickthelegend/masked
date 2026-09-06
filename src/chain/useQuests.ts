/**
 * Quests, derived from the player's real on-chain record.
 *
 * The quest list previously shipped with hardcoded progress values (0.66, 0.4,
 * 1) rendered as if they were this player's actual progress. There is no quest
 * program on chain, so rather than invent numbers this derives every quest
 * from `PlayerStats` — which is real — and ships only quests that can be
 * backed by it.
 */
import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePlayerStats } from './usePlayerStats';

export interface Quest {
  name: string;
  reward: string;
  /** 0–1, derived. */
  value: number;
  progress: string;
  done: boolean;
}

export function useQuests(owner: PublicKey | null) {
  const { board, loaded } = usePlayerStats(10_000);

  const quests = useMemo<Quest[]>(() => {
    const me = owner ? board.find((b) => b.owner.equals(owner)) : undefined;
    const wins = me?.wins ?? 0;
    const streak = me?.bestStreak ?? 0;
    const played = (me?.wins ?? 0) + (me?.losses ?? 0);
    const takenSol = (me?.taken ?? 0) / 1e9;

    const mk = (name: string, reward: string, have: number, need: number, unit = ''): Quest => ({
      name,
      reward,
      value: Math.min(1, need === 0 ? 0 : have / need),
      progress: `${unit === '◎' ? have.toFixed(2) : Math.min(have, need)} / ${need}${unit}`,
      done: have >= need,
    });

    return [
      mk('Settle your first duel', '+XP', played, 1),
      mk('Win 3 fog duels', '+XP', wins, 3),
      mk('Reach a 2-win streak', '+XP', streak, 2),
      mk('Take 1◎ from the fog', '+XP', takenSol, 1, '◎'),
    ];
  }, [board, owner]);

  return { quests, loaded, connected: !!owner };
}
