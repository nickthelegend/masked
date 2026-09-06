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

export interface OpenMatch {
  address: PublicKey;
  creator: PublicKey;
  entry: number;
  duration: number;
  matchId: number;
  /** Seconds since the match was opened, from the creator's clock. */
  ageSecs: number;
}

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

export function useOpenMatches(pollMs = 4000) {
  const [matches, setMatches] = useState<OpenMatch[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        const program = new Program(FOGDUEL_IDL as Idl, provider) as any;
        const all = await program.account.match.all();
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
            // match_id is seeded from the creator's clock, so it doubles as an
            // open-time for display purposes.
            ageSecs: Math.max(0, now - Math.floor(m.account.matchId.toNumber() / 1000)),
          }))
          .sort((a: OpenMatch, b: OpenMatch) => a.entry - b.entry);

        setMatches(open);
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

  return { matches, loaded };
}
