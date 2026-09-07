/**
 * Settled duels, read from chain.
 *
 * Replaces the hardcoded FEED and BOARD constants. A `Tape` is written by
 * `settle_match` and is world-readable — it is the public half of the
 * "private during the fight, public after" contract.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { PRICE_SCALE } from './client';
import { withDeadline } from './rpcTimeout';
import { replayEquity, toTapeState, type TapeState } from './tape';

export interface TapeSummary {
  match: string;
  /** What was traded, straight off the tape. */
  /** The winner's market. */
  symbol: string;
  mint: PublicKey;
  /** The loser's, which is now a different token. */
  loserSymbol: string;
  loserMint: PublicKey;
  winner: PublicKey;
  loser: PublicKey;
  winnerPnlBps: number;
  loserPnlBps: number;
  potPaid: number;
  rake: number;
  settledTs: number;
  winnerSeries: number[];
  loserSeries: number[];
}

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

/**
 * The equity curve a fill list actually produced, as percentages.
 *
 * This used to interpolate: it took the fill *count*, ignored every quantity
 * and price on the tape, and walked a straight line to the settled figure. The
 * shape was decoration — a four-fill round that was down 8% before recovering
 * drew as a clean ramp. `replayEquity` recomputes the position the same way
 * the program did, so each point is where that player really stood.
 *
 * Needs the entry, which is on the Match rather than the Tape; a tape whose
 * match has been closed out gets the two points that are still certain, its
 * start and its settled result, and nothing invented between them.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const curve = (fills: TapeState['fillsA'], finalBps: number, entry: number): number[] => {
  if (!fills || fills.length === 0) return [0, finalBps / 100];
  if (entry <= 0) return [0, finalBps / 100];
  return replayEquity(fills, entry).map((p) => p.bps / 100);
};

export function useTapes(pollMs = 10_000) {
  const [tapes, setTapes] = useState<TapeSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;
        // The entry lives on the Match, not the Tape, and the replay needs it.
        // One extra call for the whole page rather than one per row.
        const [all, matches] = (await withDeadline(
          Promise.all([program.account.tape.all(), program.account.match.all()]),
          'the base layer'
        )) as [any[], any[]];
        if (!alive) return;

        const entryOf = new Map<string, number>(
          matches.map((m: any) => [m.publicKey.toBase58(), m.account.entry.toNumber()])
        );

        const mapped: TapeSummary[] = all
          .map((t: any) => {
            const a = toTapeState(t.account);
            const winnerIsA = a.winner.equals(a.playerA);
            const wBps = winnerIsA ? a.pnlABps : a.pnlBBps;
            const lBps = winnerIsA ? a.pnlBBps : a.pnlABps;
            const entry = entryOf.get(a.match.toBase58()) ?? 0;
            return {
              match: a.match.toBase58(),
              // Named from the winner's side, with the loser's alongside —
              // a duel is two markets now, so one symbol cannot describe it.
              symbol: winnerIsA ? a.legA.symbol : a.legB.symbol,
              mint: winnerIsA ? a.legA.mint : a.legB.mint,
              loserSymbol: winnerIsA ? a.legB.symbol : a.legA.symbol,
              loserMint: winnerIsA ? a.legB.mint : a.legA.mint,
              winner: a.winner,
              loser: winnerIsA ? a.playerB : a.playerA,
              winnerPnlBps: wBps,
              loserPnlBps: lBps,
              potPaid: a.potPaid,
              rake: a.rake,
              settledTs: a.settledTs,
              winnerSeries: curve(winnerIsA ? a.fillsA : a.fillsB, wBps, entry),
              loserSeries: curve(winnerIsA ? a.fillsB : a.fillsA, lBps, entry),
            };
          })
          .sort((x: TapeSummary, y: TapeSummary) => y.settledTs - x.settledTs);

        setTapes(mapped);
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

  return { tapes, loaded };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const short = (k: PublicKey) => `${k.toBase58().slice(0, 4)}…${k.toBase58().slice(-4)}`;
export const bpsPct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
export { PRICE_SCALE };
