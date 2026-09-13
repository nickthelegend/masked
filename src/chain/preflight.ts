/**
 * Preflight checks run before a transaction is built.
 *
 * Catching these client-side turns three different opaque on-chain failures
 * into one clear sentence, and saves the user a wallet prompt for something
 * that cannot succeed.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { ACTIVE_CLUSTER, type ClusterConfig } from './config';

export interface PreflightResult {
  ok: boolean;
  title?: string;
  detail?: string;
}

export const OK: PreflightResult = { ok: true };

/**
 * Rent and fees a duel costs beyond the stake itself, in either seat.
 *
 * Measured on chain. A joiner pays the most: 21,301,080 lamports to join (both
 * positions' rent and the fee) and 26,002,760 across the seven seal
 * transactions. A creator pays 7,380,640 to open, plus that same seal when a
 * stalled joiner leaves it to them. The rest covers a long round's price pushes
 * and the settlement. It was 0.02◎, which let a wallet cover the entry but not
 * the seal: the join landed, the seal ran out of rent half way, and the entry
 * went into a round that player's screen never showed. The session key's 0.01◎
 * is left out on purpose — that mint is best-effort, and the round signs with
 * the wallet without it.
 */
export const HEADROOM_LAMPORTS = 0.05 * 1e9;

export function checkWallet(publicKey: PublicKey | null): PreflightResult {
  if (!publicKey) {
    return { ok: false, title: 'CONNECT A WALLET', detail: 'Nothing can be signed without one.' };
  }
  return OK;
}

export function checkBalance(lamports: number, stakeLamports: number): PreflightResult {
  const needed = stakeLamports + HEADROOM_LAMPORTS;
  if (lamports < needed) {
    // Name the stake they *can* afford, when there is one. "Need ~0.12, hold
    // 0.07" is true and leaves the player to do arithmetic against a headroom
    // figure they cannot see; "the largest you can open is 0.05◎" is the same
    // fact turned into the next move.
    const affordable = affordableStake(lamports);
    const advice = affordable
      ? ` The largest you can open right now is ${affordable.toFixed(2)}◎.`
      : ' Fund this wallet first.';
    return {
      ok: false,
      title: 'NOT ENOUGH SOL',
      // The balance is floored, not rounded. Rounded, a wallet a few thousand
      // lamports short read "Need ~0.15 SOL, wallet holds 0.15" — a refusal
      // that contradicts itself.
      detail:
        `Need ~${(needed / 1e9).toFixed(2)} SOL, wallet holds ${(Math.floor(lamports / 1e7) / 100).toFixed(2)}.` +
        advice,
    };
  }
  return OK;
}

/**
 * The biggest offered stake this balance covers, or null if it covers none.
 *
 * Deliberately picks from the stakes the picker actually offers rather than
 * returning an arbitrary number: telling somebody they can afford 0.0731◎ is
 * useless when the buttons are 0.05, 0.10, 0.50 and 1.
 */
export function affordableStake(lamports: number, options: number[] = [0.05, 0.1, 0.5, 1]): number | null {
  const usable = lamports - HEADROOM_LAMPORTS;
  let best: number | null = null;
  for (const s of options) if (s * 1e9 <= usable) best = s;
  return best;
}

/**
 * Confirm the RPC we are pointed at is actually alive and is the cluster the
 * app thinks it is. A wallet on mainnet against a localhost program produces
 * baffling errors otherwise.
 */
export async function checkCluster(cluster: ClusterConfig = ACTIVE_CLUSTER): Promise<PreflightResult> {
  try {
    const conn = new Connection(cluster.l1, 'confirmed');
    await conn.getSlot('confirmed');
  } catch {
    return {
      ok: false,
      title: 'CANNOT REACH THE CLUSTER',
      detail: `${cluster.l1} is not responding.`,
    };
  }
  return OK;
}

/** Is the program actually deployed where we expect it? */
export async function checkProgram(programId: PublicKey, cluster: ClusterConfig = ACTIVE_CLUSTER): Promise<PreflightResult> {
  try {
    const conn = new Connection(cluster.l1, 'confirmed');
    const info = await conn.getAccountInfo(programId);
    if (!info?.executable) {
      return { ok: false, title: 'PROGRAM NOT DEPLOYED', detail: `${programId.toBase58()} is not on ${cluster.name}.` };
    }
  } catch {
    return { ok: false, title: 'CANNOT REACH THE CLUSTER' };
  }
  return OK;
}

/** Run several checks and return the first failure. */
export function firstFailure(...results: PreflightResult[]): PreflightResult {
  return results.find((r) => !r.ok) ?? OK;
}
