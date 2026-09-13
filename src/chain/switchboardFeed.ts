/**
 * Switchboard's SOL/USD feed, read from its bytes.
 *
 * The program will not take a Pyth mark unless this feed was refreshed within
 * `MAX_SB_AGE_SECS` and agrees with Pyth (programs/fogduel/src/sb.rs). The app
 * needs to know that before it sends, and Switchboard's SDK cannot be bundled
 * for a browser (it needs Node's util, https and crypto), so this reads the
 * account directly with the offsets sb.rs uses. Refreshing the feed happens
 * server-side, in the keeper (server/src/keeper.ts).
 */
import type { Connection } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { SWITCHBOARD_SOL_USD_FEED } from './pyth';

export const SB_SOL_USD_FEED = SWITCHBOARD_SOL_USD_FEED;

/** Mirrors `sb::MAX_SB_AGE` and `sb::MAX_ORACLE_DIVERGENCE_BPS`. */
export const MAX_SB_AGE_SECS = 120;
export const MAX_ORACLE_DIVERGENCE_BPS = 100;

export interface SbSolUsd {
  /** USD x 1e18. */
  usd1e18: bigint;
  updatedTs: number;
  samples: number;
  queue: string;
  feedHash: string;
}

/** Mirrors `sb::parse_pull_feed`'s offsets. */
export function decodePullFeed(data: Uint8Array): SbSolUsd {
  const b = Buffer.from(data);
  if (b.length < 2361) throw new Error('too short for a PullFeedAccountData');
  return {
    usd1e18: (b.readBigInt64LE(2272) << 64n) | b.readBigUInt64LE(2264),
    updatedTs: Number(b.readBigInt64LE(2216)),
    samples: b[2360],
    queue: new PublicKey(b.subarray(2088, 2120)).toBase58(),
    feedHash: b.subarray(2120, 2152).toString('hex'),
  };
}

export async function readSwitchboard(connection: Connection, feed = SB_SOL_USD_FEED): Promise<SbSolUsd> {
  const info = await connection.getAccountInfo(feed, 'confirmed');
  if (!info) throw new Error(`no Switchboard feed at ${feed.toBase58()}`);
  return decodePullFeed(info.data);
}

/** Seconds the current result can still be used for; zero or less once the program calls it stale. */
export const sbSecondsLeft = (v: SbSolUsd, nowSecs: number): number => MAX_SB_AGE_SECS - (nowSecs - v.updatedTs);
