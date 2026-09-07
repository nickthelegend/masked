/**
 * The record between two wallets, counted off the chain.
 *
 * Every settled duel writes a `Tape` naming both players and the winner, so
 * the head-to-head is already on chain — it just has to be asked for. Nothing
 * is stored client-side and nothing is tallied incrementally: the number is
 * recounted from the tapes each time, so it cannot drift out of step with what
 * the program actually paid.
 *
 * Two queries rather than one scan. A tape records a fixed player A and player
 * B — whoever opened and whoever joined — so a rivalry appears under both
 * orderings, and both are asked for by `memcmp` on the account itself. The
 * offsets are the fixed prefix of the account: 8 discriminator + 32 match_key
 * + 32 mint + 12 symbol + 1 market_type = 85 for player A, and 32 more for
 * player B. `scripts/check-h2h.mts` re-derives them from a real account rather
 * than trusting that arithmetic.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { withDeadline } from './rpcTimeout';
import { toTapeState, type TapeState } from './tape';

/** Byte offset of `player_a` in a `Tape` account. */
export const TAPE_PLAYER_A_OFFSET = 85;
/** Byte offset of `player_b`. */
export const TAPE_PLAYER_B_OFFSET = 117;

export interface HeadToHead {
  /** Duels these two have settled against each other. */
  played: number;
  /** How many the first wallet took. */
  mine: number;
  /** How many the second took. */
  theirs: number;
  /** Every meeting, newest first. */
  tapes: TapeState[];
}

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

/**
 * Fetch the record between two wallets. Exported on its own so scripts and
 * screens count it the same way.
 */
export async function fetchHeadToHead(
  me: PublicKey,
  them: PublicKey,
  connection?: Connection
): Promise<HeadToHead> {
  const l1 = connection ?? new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
  const provider = new AnchorProvider(l1, readOnlyWallet as never, { commitment: 'confirmed' });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

  const pair = (a: PublicKey, b: PublicKey) => [
    { memcmp: { offset: TAPE_PLAYER_A_OFFSET, bytes: a.toBase58() } },
    { memcmp: { offset: TAPE_PLAYER_B_OFFSET, bytes: b.toBase58() } },
  ];

  const [asA, asB] = (await Promise.all([
    program.account.tape.all(pair(me, them)),
    program.account.tape.all(pair(them, me)),
  ])) as [any[], any[]];
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const tapes = [...asA, ...asB]
    .map((t) => toTapeState(t.account))
    .sort((x, y) => y.settledTs - x.settledTs);

  let mine = 0;
  let theirs = 0;
  for (const t of tapes) {
    if (t.winner.equals(me)) mine += 1;
    else if (t.winner.equals(them)) theirs += 1;
  }

  return { played: tapes.length, mine, theirs, tapes };
}

/**
 * The record between you and one opponent, or null while it is unknown.
 *
 * `nonce` forces a re-read. The duel you are looking at has only just written
 * its own tape, and a count that ignored it would tell a winner they still
 * trail — so the reveal bumps this as it opens.
 */
export function useHeadToHead(me: PublicKey | null, them: PublicKey | null, nonce: unknown = 0) {
  const [record, setRecord] = useState<HeadToHead | null>(null);

  const meKey = me?.toBase58() ?? null;
  const themKey = them?.toBase58() ?? null;

  useEffect(() => {
    if (!meKey || !themKey || meKey === themKey) {
      setRecord(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const r = await withDeadline(
          fetchHeadToHead(new PublicKey(meKey), new PublicKey(themKey)),
          'the base layer'
        );
        if (alive) setRecord(r);
      } catch {
        // A rivalry line is decoration on top of a settled result. If the
        // count cannot be read, the reveal shows the result without it.
        if (alive) setRecord(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [meKey, themKey, nonce]);

  return record;
}

/** "YOU LEAD 3-1" / "3-1 DOWN" / "2-2, ALL SQUARE" / "FIRST MEETING". */
export function describeRecord(r: HeadToHead | null): string | null {
  if (!r) return null;
  if (r.played === 0) return 'FIRST MEETING';
  if (r.mine === r.theirs) return `${r.mine}-${r.theirs}, ALL SQUARE`;
  return r.mine > r.theirs ? `YOU LEAD ${r.mine}-${r.theirs}` : `${r.mine}-${r.theirs} DOWN`;
}
