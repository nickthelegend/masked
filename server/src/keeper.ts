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
 * Only while it is needed. A refresh costs the payer 1,010,000 lamports on
 * devnet (10,000 fee plus the oracle's reward, measured 2026-09-13), so an
 * always-on keeper would spend about 0.05 SOL an hour on rounds that do not
 * exist. It refreshes only when a live round has a leg Pyth prices.
 *
 * Bundled on its own (`npm run build:keeper`) and started by the market proxy
 * only when SB_KEEPER_SECRET is set. `/keeper/sb` reports what it last did.
 */
import { Connection, Keypair } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../../src/chain/idl';
import { hasPythFeed } from '../../src/chain/pyth';
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
  /** Live rounds with a SOL or USDC major leg at the last check. */
  liveRounds: number | null;
  lastRefresh: { at: string; signature: string; usd: number; updatedTs: number; oracles: string[] } | null;
  lastError: { at: string; message: string } | null;
}

const status: KeeperStatus = {
  running: false,
  cluster: KEEPER_L1_URL,
  payer: null,
  refreshes: 0,
  secondsLeft: null,
  liveRounds: null,
  lastRefresh: null,
  lastError: null,
};

export const keeperStatus = (): KeeperStatus => status;

/* eslint-disable @typescript-eslint/no-explicit-any -- Anchor's account namespace is untyped. */
const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T>(t: T) => t,
  signAllTransactions: async <T>(t: T[]) => t,
};

/** Live rounds, right now, with a leg `push_price_pyth` can price. */
export async function livePythRounds(connection: Connection): Promise<number> {
  const program: any = new Program(FOGDUEL_IDL as Idl, new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' }));
  const now = Math.floor(Date.now() / 1000);
  const all: any[] = await program.account.match.all();
  return all.filter((m) => {
    const a = m.account;
    if (!('live' in a.status) || a.startTs.toNumber() + a.duration.toNumber() <= now) return false;
    return [a.legA, a.legB].some((leg: any) => 'major' in leg.marketType && hasPythFeed(leg.mint.toBase58()));
  }).length;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const keypairFrom = (secret: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret) as number[]));

/** One refresh if the result is due, reported into `status`. */
export async function refreshIfDue(connection: Connection, payer: Keypair): Promise<KeeperStatus> {
  try {
    const current = await readSwitchboard(connection);
    status.secondsLeft = sbSecondsLeft(current, Math.floor(Date.now() / 1000));
    if (status.secondsLeft > REFRESH_BELOW_SECS) return status;
    status.liveRounds = await livePythRounds(connection);
    if (status.liveRounds === 0) return status;
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
