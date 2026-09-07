/**
 * One settled duel, read from chain by address.
 *
 * A `Tape` is written by `settle_match` and never changes again, so unlike
 * `useSpectate` this reads once rather than polling — there is nothing to poll
 * for. The `Match` it names is fetched alongside it for the entry and the
 * round's start and length, which the tape does not carry and the replay needs.
 *
 * No wallet. This is the view a judge can be sent a link to.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { tapePda } from './pdas';
import { withDeadline } from './rpcTimeout';
import { explainRead } from './errors';
import { toTapeState, type TapeState } from './tape';

export interface RevealedTape {
  tape: TapeState;
  /** Per-player entry in lamports — what each replay starts from. */
  entry: number;
  startTs: number;
  duration: number;
  /** Market identity, off the Match rather than the Tape. */
  // No `mint` or `marketType` here any more: a duel has two markets, and both
  // are on the tape itself as `legA` and `legB`. Reading them off the Match
  // account is what silently broke the page — those fields are gone, and
  // `Object.keys(undefined)` threw into the catch, which reported a healthy
  // cluster as unreachable.
}

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export function useTape(address: string | null) {
  const [data, setData] = useState<RevealedTape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address) {
      setLoaded(true);
      return undefined;
    }
    let alive = true;
    let key: PublicKey;
    try {
      key = new PublicKey(address);
    } catch {
      setError('That is not a match address.');
      setLoaded(true);
      return undefined;
    }

    setLoaded(false);
    setError(null);

    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const provider = new AnchorProvider(l1, readOnlyWallet as never, { commitment: 'confirmed' });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

    (async () => {
      try {
        const [rawTape, rawMatch] = (await withDeadline(
          Promise.all([
            program.account.tape.fetchNullable(tapePda(key)),
            program.account.match.fetchNullable(key),
          ]),
          'the base layer'
        )) as [any, any];
        if (!alive) return;

        if (!rawTape) {
          // A live or open match has no tape yet, and saying so is more use
          // than "not found" — there is somewhere else to send them.
          setError(
            rawMatch
              ? 'That duel has not settled yet. Watch it at /spectate instead.'
              : 'No settled duel at that address.'
          );
          setLoaded(true);
          return;
        }

        setData({
          tape: toTapeState(rawTape),
          entry: rawMatch ? rawMatch.entry.toNumber() : 0,
          startTs: rawMatch ? rawMatch.startTs.toNumber() : 0,
          duration: rawMatch ? rawMatch.duration.toNumber() : 0,
        });
        setLoaded(true);
      } catch (e) {
        if (!alive) return;
        setError(explainRead(e));
        setLoaded(true);
      }
    })();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    return () => {
      alive = false;
    };
  }, [address]);

  return { data, error, loaded };
}
