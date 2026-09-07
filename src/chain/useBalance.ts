/**
 * The connected wallet's SOL, polled.
 *
 * `useDuel` reads this too, but it carries a whole duel with it — a landing
 * page that only wants to print a number should not have to mount a match
 * poller, a price crank and a settlement machine to get one.
 */
import { useEffect, useState } from 'react';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import { ACTIVE_CLUSTER } from './config';

const POLL_MS = 10_000;

export function useBalance(pollMs = POLL_MS): number {
  const { publicKey } = useWallet();
  // The address string, never the object: `publicKey` is rebuilt on most
  // reads, and an effect keyed on it re-subscribes on nearly every render.
  const key = publicKey ? publicKey.toBase58() : null;
  const [sol, setSol] = useState(0);

  useEffect(() => {
    if (!publicKey) {
      setSol(0);
      return undefined;
    }
    let alive = true;
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const read = async () => {
      try {
        const lamports = await l1.getBalance(publicKey);
        if (alive) setSol(lamports / LAMPORTS_PER_SOL);
      } catch {
        /* RPC hiccup; the next poll picks it up */
      }
    };
    void read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pollMs]);

  return sol;
}
