/**
 * Keeps Switchboard's SOL/USD fresh, so `push_price_pyth` can be used.
 *
 * The program takes a Pyth mark only when a Switchboard On-Demand SOL/USD
 * result no older than `sb::MAX_SB_AGE` agrees with Pyth. An On-Demand feed is
 * refreshed by whoever needs it, and the refresh cannot run in a browser
 * (Switchboard's SDK needs Node's util, https and crypto), so it runs here:
 * whenever the current result has less than `REFRESH_BELOW_SECS` of its life
 * left, the queue's oracles are asked for a new one, paid by a dedicated devnet
 * keypair in SB_KEEPER_SECRET — never the program's upgrade authority.
 *
 * Bundled on its own (`npm run build:keeper`) and started by the market proxy
 * only when SB_KEEPER_SECRET is set. `/keeper/sb` reports what it last did.
 */
import { Connection, Keypair } from '@solana/web3.js';
import { refreshSwitchboardSolUsd } from '../../scripts/switchboard';
import { readSwitchboard, sbSecondsLeft } from '../../src/chain/switchboardFeed';

export const KEEPER_L1_URL = process.env.SB_KEEPER_L1_URL ?? 'https://rpc.magicblock.app/devnet';
/** Refresh once fewer seconds than this remain of the 120 s the program allows. */
export const REFRESH_BELOW_SECS = 60;
const TICK_MS = 15_000;

export interface KeeperStatus {
  running: boolean;
  cluster: string;
  payer: string | null;
  refreshes: number;
  secondsLeft: number | null;
  lastRefresh: { at: string; signature: string; usd: number; updatedTs: number; oracles: string[] } | null;
  lastError: { at: string; message: string } | null;
}

const status: KeeperStatus = {
  running: false,
  cluster: KEEPER_L1_URL,
  payer: null,
  refreshes: 0,
  secondsLeft: null,
  lastRefresh: null,
  lastError: null,
};

export const keeperStatus = (): KeeperStatus => status;

const keypairFrom = (secret: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));

/** One refresh if the result is due, reported into `status`. */
export async function refreshIfDue(connection: Connection, payer: Keypair): Promise<KeeperStatus> {
  try {
    const current = await readSwitchboard(connection);
    status.secondsLeft = sbSecondsLeft(current, Math.floor(Date.now() / 1000));
    if (status.secondsLeft > REFRESH_BELOW_SECS) return status;
    const r = await refreshSwitchboardSolUsd(connection, payer);
    status.refreshes += 1;
    status.lastRefresh = {
      at: new Date().toISOString(),
      signature: r.signature,
      usd: Number(r.value.usd1e18) / 1e18,
      updatedTs: r.value.updatedTs,
      oracles: r.oracles,
    };
    status.secondsLeft = sbSecondsLeft(r.value, Math.floor(Date.now() / 1000));
  } catch (e) {
    status.lastError = { at: new Date().toISOString(), message: String((e as Error)?.message ?? e).slice(0, 300) };
  }
  return status;
}

export function startKeeper(secret: string): KeeperStatus {
  const payer = keypairFrom(secret);
  const connection = new Connection(KEEPER_L1_URL, 'confirmed');
  status.running = true;
  status.payer = payer.publicKey.toBase58();
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await refreshIfDue(connection, payer);
    } finally {
      busy = false;
    }
  };
  void tick();
  setInterval(tick, TICK_MS);
  return status;
}

/** For a one-shot check: refresh now, whatever the age. */
export async function refreshNow(secret: string) {
  const payer = keypairFrom(secret);
  return refreshSwitchboardSolUsd(new Connection(KEEPER_L1_URL, 'confirmed'), payer);
}
