/**
 * Watching a duel you are not in.
 *
 * Everything here comes from accounts anyone can read: the `Match`, the
 * `PriceFeed`, and — once it exists — the `Tape`. Neither `Position` is
 * fetched, because neither can be: the rollup's front door refuses a sealed
 * position to a caller with no permission, which is precisely the point a
 * spectator view is good at demonstrating. A viewer sees the market, the
 * clock, the pot and the mark, and learns nothing about either player's
 * position until the buzzer.
 *
 * No wallet required. That is the other point: a judge can watch a real duel
 * without connecting anything.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { feedPda, tapePda } from './pdas';
import { withDeadline } from './rpcTimeout';
import { explainRead } from './errors';

export interface SpectatedMatch {
  address: PublicKey;
  creator: PublicKey;
  joiner: PublicKey | null;
  symbol: string;
  mint: PublicKey;
  marketType: 'meme' | 'major';
  status: 'open' | 'live' | 'settling' | 'settled' | 'cancelled';
  entry: number;
  pot: number;
  startTs: number;
  duration: number;
  /** Seconds left, or 0 once the buzzer has gone. */
  secondsLeft: number;
  /** The posted mark, in the program's scale. */
  px: number;
  /** Marks observed since this view opened, for the chart. */
  series: number[];
  winner: PublicKey | null;
  pnlABps: number;
  pnlBBps: number;
  /** Present only after settlement — the public half of the contract. */
  revealed: {
    fillsA: number;
    fillsB: number;
    potPaid: number;
    rake: number;
  } | null;
}

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

export function useSpectate(address: string | null, pollMs = 1000) {
  const [match, setMatch] = useState<SpectatedMatch | null>(null);
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

    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const provider = new AnchorProvider(l1, readOnlyWallet as never, { commitment: 'confirmed' });
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

    const read = async () => {
      try {
        const raw = (await withDeadline(
          program.account.match.fetchNullable(key),
          'the base layer'
        )) as Record<string, any> | null;
        if (!alive) return;
        if (!raw) {
          setError('No match at that address.');
          setLoaded(true);
          return;
        }
        const status = Object.keys(raw.status)[0] as SpectatedMatch['status'];
        const [feed, tape] = await Promise.all([
          program.account.priceFeed.fetchNullable(feedPda(key)),
          status === 'settled' ? program.account.tape.fetchNullable(tapePda(key)) : Promise.resolve(null),
        ]);
        if (!alive) return;

        const startTs = raw.startTs.toNumber();
        const duration = raw.duration.toNumber();
        const px = feed ? feed.px.toNumber() : 0;

        setMatch((prev) => ({
          address: key,
          creator: raw.creator,
          joiner: raw.joiner ?? null,
          symbol: decodeFixed(raw.symbol),
          mint: raw.mint,
          marketType: Object.keys(raw.marketType)[0] === 'major' ? 'major' : 'meme',
          status,
          entry: raw.entry.toNumber(),
          pot: raw.pot.toNumber(),
          startTs,
          duration,
          secondsLeft:
            status === 'live' && startTs > 0
              ? Math.max(0, duration - (Math.floor(Date.now() / 1000) - startTs))
              : 0,
          px,
          // Only marks seen while watching. A spectator arriving late sees the
          // round from where they joined it, which is honest — the earlier
          // marks are not on chain to recover.
          series: px > 0 ? [...(prev?.series ?? []), px].slice(-120) : (prev?.series ?? []),
          winner: raw.winner ?? null,
          pnlABps: raw.pnlABps.toNumber(),
          pnlBBps: raw.pnlBBps.toNumber(),
          revealed: tape
            ? {
                fillsA: (tape.fillsA ?? []).length,
                fillsB: (tape.fillsB ?? []).length,
                potPaid: tape.potPaid.toNumber(),
                rake: tape.rake.toNumber(),
              }
            : null,
        }));
        setError(null);
        setLoaded(true);
      } catch (e) {
        if (!alive) return;
        setError(explainRead(e));
        setLoaded(true);
      }
    };

    void read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [address, pollMs]);

  return { match, error, loaded };
}
