/**
 * Recent transactions against the program, read from the chain itself.
 *
 * Not a client-side log of what this tab happened to send — that would vanish
 * on reload and prove nothing. This asks the RPC for the program's actual
 * signature history, so it shows work done by any wallet, survives a refresh,
 * and is verifiable in an explorer.
 */
import { useEffect, useState } from 'react';
import { Connection } from '@solana/web3.js';
import { ACTIVE_CLUSTER, FOGDUEL_PROGRAM_ID } from './config';

export interface TxEntry {
  signature: string;
  slot: number;
  blockTime: number | null;
  err: boolean;
  /** Instruction name parsed out of the program logs, when identifiable. */
  action: string;
}

/** Program logs carry "Program log: Instruction: <Name>". */
const actionFrom = (logs: string[] | null | undefined): string => {
  if (!logs) return 'transaction';
  for (const l of logs) {
    const m = l.match(/Program log: Instruction: (\w+)/);
    if (m) {
      // CamelCase -> spaced upper, e.g. ApplyFill -> APPLY FILL
      return m[1].replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();
    }
  }
  return 'transaction';
};

export function useTxFeed(limit = 12, pollMs = 6000) {
  const [entries, setEntries] = useState<TxEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    const read = async () => {
      try {
        const conn = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
        const sigs = await conn.getSignaturesForAddress(FOGDUEL_PROGRAM_ID, { limit });
        if (!alive) return;

        // Fetch logs in one batch so the action labels are real rather than
        // guessed from ordering.
        const txs = await conn.getParsedTransactions(
          sigs.map((s) => s.signature),
          { maxSupportedTransactionVersion: 0 }
        );
        if (!alive) return;

        setEntries(
          sigs.map((s, i) => ({
            signature: s.signature,
            slot: s.slot,
            blockTime: s.blockTime ?? null,
            err: !!s.err,
            action: actionFrom(txs[i]?.meta?.logMessages),
          }))
        );
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
  }, [limit, pollMs]);

  return { entries, loaded };
}

/**
 * Explorer URL for a signature. Local clusters have no public explorer, so
 * this points the official one at the custom RPC rather than pretending a
 * localhost signature is on devnet.
 */
export function explorerUrl(signature: string): string {
  const base = `https://explorer.solana.com/tx/${signature}`;
  if (ACTIVE_CLUSTER.name === 'devnet') return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent(ACTIVE_CLUSTER.l1)}`;
}

export const shortSig = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;
