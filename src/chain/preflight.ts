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

/** Rent + fees headroom beyond the stake itself. */
export const HEADROOM_LAMPORTS = 0.02 * 1e9;

export function checkWallet(publicKey: PublicKey | null): PreflightResult {
  if (!publicKey) {
    return { ok: false, title: 'CONNECT A WALLET', detail: 'Nothing can be signed without one.' };
  }
  return OK;
}

export function checkBalance(lamports: number, stakeLamports: number): PreflightResult {
  const needed = stakeLamports + HEADROOM_LAMPORTS;
  if (lamports < needed) {
    return {
      ok: false,
      title: 'NOT ENOUGH SOL',
      detail: `Need ~${(needed / 1e9).toFixed(2)} SOL, wallet holds ${(lamports / 1e9).toFixed(2)}.`,
    };
  }
  return OK;
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
