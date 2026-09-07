/**
 * Open matches on chain, polled live.
 *
 * Matchmaking used to silently auto-join whatever it found. Showing the real
 * book lets a player pick a stake and an opponent, and makes it obvious that
 * matches are on-chain objects other wallets created rather than a queue
 * invented by the client.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from './idl';
import { ACTIVE_CLUSTER } from './config';
import { withDeadline } from './rpcTimeout';

export interface OpenMatch {
  address: PublicKey;
  creator: PublicKey;
  entry: number;
  duration: number;
  matchId: number;
  /** Seconds since the match was opened, from the chain's own clock. */
  ageSecs: number;
}

/** A match already under way. Both positions exist and are delegated. */
export interface LiveMatch {
  address: PublicKey;
  creator: PublicKey;
  joiner: PublicKey;
}

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export function useOpenMatches(pollMs = 4000) {
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  // Live matches come from the same read. /proof probes one to show the read
  // gate refusing a sealed position, and a second RPC sweep for that would be
  // the same query twice.
  const [live, setLive] = useState<LiveMatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;
        const all = (await withDeadline(program.account.match.all(), 'the base layer')) as any[];
        if (!alive) return;

        const now = Math.floor(Date.now() / 1000);
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const open: OpenMatch[] = all
          .filter((m: any) => Object.keys(m.account.status)[0] === 'open')
          .map((m: any) => ({
            address: m.publicKey,
            creator: m.account.creator,
            entry: m.account.entry.toNumber(),
            duration: m.account.duration.toNumber(),
            matchId: m.account.matchId.toNumber(),
            ageSecs: Math.max(0, now - m.account.createdTs.toNumber()),
          }))
          .sort((a: OpenMatch, b: OpenMatch) => a.entry - b.entry);

        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const running: LiveMatch[] = all
          .filter((m: any) => Object.keys(m.account.status)[0] === 'live' && m.account.joiner)
          .map((m: any) => ({
            address: m.publicKey,
            creator: m.account.creator,
            joiner: m.account.joiner as PublicKey,
          }));

        setMatches(open);
        setLive(running);
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

  return { matches, live, loaded };
}
