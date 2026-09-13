/**
 * Refreshing Switchboard's SOL/USD, the second oracle `push_price_pyth` requires.
 *
 * An On-Demand feed holds whatever its last update wrote; nobody refreshes it
 * on a schedule. Whoever needs a fresh result asks the queue's oracles to sign
 * one (through crossbar) and posts it, which is what `refreshSwitchboardSolUsd`
 * does. The program then accepts that result for `sb::MAX_SB_AGE` seconds.
 *
 * Node only: Switchboard's SDK needs Node's util, https and crypto. Reading the
 * feed is browser-safe and lives in src/chain/switchboardFeed.ts.
 *
 * The feed: MASKED SOL/USD on devnet's default queue, jobs Coinbase and Kraken
 * spot, feed hash db64bca1… — the hash `programs/fogduel/src/sb.rs` pins.
 */
import { type Connection, type Keypair, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import * as sb from '@switchboard-xyz/on-demand';
import { CrossbarClient } from '@switchboard-xyz/common';
import { SB_SOL_USD_FEED, readSwitchboard, type SbSolUsd } from '../src/chain/switchboardFeed';

export { MAX_ORACLE_DIVERGENCE_BPS, MAX_SB_AGE_SECS, SB_SOL_USD_FEED, decodePullFeed, readSwitchboard } from '../src/chain/switchboardFeed';

/** A feed on the same queue with other job definitions (different hash): the program must refuse it. */
export const SB_OTHER_JOBS_FEED = new PublicKey('5Ln3sEUyq75stXpLhgodxRjfAMSZUk2Bdur989W9TCkK');

/** Ask the queue's oracles for a fresh SOL/USD and post it. */
export async function refreshSwitchboardSolUsd(
  connection: Connection,
  payer: Keypair
): Promise<{ signature: string; oracles: string[]; value: SbSolUsd }> {
  const program = await sb.AnchorUtils.loadProgramFromConnection(connection);
  const feed = new sb.PullFeed(program, SB_SOL_USD_FEED);
  const [ixs, responses, , luts] = await feed.fetchUpdateIx({
    crossbarClient: CrossbarClient.default(),
    numSignatures: 1,
    payer: payer.publicKey,
  });
  if (!ixs || ixs.length === 0) {
    throw new Error(`Switchboard returned no update: ${responses.map((r) => r.error || 'no value').join('; ')}`);
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: blockhash, instructions: ixs })
    .compileToV0Message(luts);
  const tx = new VersionedTransaction(message);
  tx.sign([payer]);
  const signature = await connection.sendTransaction(tx);
  const confirmed = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  if (confirmed.value.err) throw new Error(`Switchboard update ${signature} failed: ${JSON.stringify(confirmed.value.err)}`);
  return {
    signature,
    oracles: responses.map((r) => r.oracle.pubkey.toBase58()),
    value: await readSwitchboard(connection),
  };
}
