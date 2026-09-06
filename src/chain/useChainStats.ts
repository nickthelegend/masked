/**
 * Real platform numbers for the landing page, read from chain.
 *
 * These replace three invented figures (38 live fogs, $12.4K paid out, 1204
 * duels) that were rendered as if they were platform metrics. When the chain
 * is empty this honestly shows zeros rather than flattering placeholders.
 */
import { useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';

export interface ChainStats {
  openMatches: number;
  paidOutSol: number;
  settled: number;
  loaded: boolean;
  /**
   * False when the RPC could not be reached.
   *
   * Without this the UI rendered a confident "0 DUELS SETTLED" whenever the
   * validator was down — presenting a failure to read as a fact about the
   * chain. Unknown and zero are different things and must look different.
   */
  reachable: boolean;
}

const EMPTY: ChainStats = { openMatches: 0, paidOutSol: 0, settled: 0, loaded: false, reachable: true };

/** A read-only provider — the landing page must work with no wallet attached. */
const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export function useChainStats(pollMs = 15_000): ChainStats {
  const [stats, setStats] = useState<ChainStats>(EMPTY);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

        const [matches, tapes] = await Promise.all([program.account.match.all(), program.account.tape.all()]);
        if (!alive) return;

        /* eslint-disable @typescript-eslint/no-explicit-any */
        const open = matches.filter((m: any) => Object.keys(m.account.status)[0] === 'open').length;
        const paid = tapes.reduce((sum: number, t: any) => sum + t.account.potPaid.toNumber(), 0) / 1e9;
        /* eslint-enable @typescript-eslint/no-explicit-any */

        setStats({ openMatches: open, paidOutSol: paid, settled: tapes.length, loaded: true, reachable: true });
      } catch {
        // Keep the last known values but mark them unverified.
        if (alive) setStats((s) => ({ ...s, loaded: true, reachable: false }));
      }
    };

    read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [pollMs]);

  return stats;
}
