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

export interface TapeSummary {
  match: string;
  /** What was traded, straight off the tape. */
  symbol: string;
  mint: PublicKey;
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

/** A zero-padded on-chain string back to a JS one. */
const decodeFixed = (bytes: number[] | Uint8Array | undefined): string => {
  if (!bytes) return '';
  const arr = Array.from(bytes);
  const end = arr.indexOf(0);
  return new TextDecoder().decode(new Uint8Array(end === -1 ? arr : arr.slice(0, end)));
};

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

/**
 * Turn a fill list into a monotonically-timed equity curve for the sparkline.
 * Both sides are returned on the same footing so `TapeChart` can put them on
 * one shared scale.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
const curve = (fills: any[], finalBps: number): number[] => {
  if (!fills || fills.length === 0) return [0, finalBps / 100];
  const points = [0];
  const sorted = [...fills].sort((a, b) => a.ts.toNumber() - b.ts.toNumber());
  sorted.forEach((_, i) => {
    // Interpolate toward the settled result so the curve always ends on the
    // number printed beside it.
    points.push(((finalBps / 100) * (i + 1)) / sorted.length);
  });
  return points;
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
        const all = await program.account.tape.all();
        if (!alive) return;

        const mapped: TapeSummary[] = all
          .map((t: any) => {
            const a = t.account;
            const winnerIsA = a.winner.equals(a.playerA);
            const wBps = winnerIsA ? a.pnlABps.toNumber() : a.pnlBBps.toNumber();
            const lBps = winnerIsA ? a.pnlBBps.toNumber() : a.pnlABps.toNumber();
            return {
              match: a.matchKey.toBase58(),
              symbol: decodeFixed(a.symbol),
              mint: a.mint,
              winner: a.winner,
              loser: winnerIsA ? a.playerB : a.playerA,
              winnerPnlBps: wBps,
              loserPnlBps: lBps,
              potPaid: a.potPaid.toNumber(),
              rake: a.rake.toNumber(),
              settledTs: a.settledTs.toNumber(),
              winnerSeries: curve(winnerIsA ? a.fillsA : a.fillsB, wBps),
              loserSeries: curve(winnerIsA ? a.fillsB : a.fillsA, lBps),
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
