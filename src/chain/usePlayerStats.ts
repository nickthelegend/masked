/**
 * The leaderboard, read from on-chain `PlayerStats` accounts.
 *
 * Previously this was aggregated client-side by scanning every tape — O(all
 * matches) per render, and only as trustworthy as the client doing the sum.
 * `settle_match` now maintains a per-wallet record, so the board is read, not
 * computed.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { withDeadline } from './rpcTimeout';

export interface BoardEntry {
  owner: PublicKey;
  wins: number;
  losses: number;
  taken: number;
  staked: number;
  streak: number;
  bestStreak: number;
}

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export function usePlayerStats(pollMs = 10_000) {
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;
        const all = (await withDeadline(program.account.playerStats.all(), 'the base layer')) as any[];
        if (!alive) return;

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const rows: BoardEntry[] = all.map((r: any) => ({
          owner: r.account.owner,
          wins: r.account.wins,
          losses: r.account.losses,
          taken: r.account.taken.toNumber(),
          staked: r.account.staked.toNumber(),
          streak: r.account.streak,
          bestStreak: r.account.bestStreak,
        }));
        rows.sort((a, b) => b.taken - a.taken || b.wins - a.wins);
        setBoard(rows);
        setLoaded(true);
      } catch {
        if (alive) setLoaded(true);
      }
    };

    read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return { board, loaded };
}
