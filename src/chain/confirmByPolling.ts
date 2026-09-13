/**
 * Confirming rollup transactions without a websocket.
 *
 * The rollup's read gate authenticates a websocket only through a `?token=` in
 * its URL, because a browser WebSocket cannot send a header. web3.js confirms by
 * subscribing on that socket, so every signed-in client used to open
 * `ws://…/?token=<session token>` — putting the credential that unlocks the
 * wallet's own sealed position into a request URL. Polling the signature's
 * status instead rides the connection's HTTP requests, where the token travels
 * in the Authorization header, and no socket is opened at all.
 */
import { AnchorProvider, type Wallet } from '@coral-xyz/anchor';
import {
  VersionedTransaction,
  type Commitment,
  type ConfirmOptions,
  type Connection,
  type Signer,
  type Transaction,
  type TransactionError,
  type TransactionSignature,
} from '@solana/web3.js';

const RANK: Record<string, number> = { processed: 0, confirmed: 1, finalized: 2 };
const POLL_MS = 400;

/** A failure worded the way errors.ts reads program errors. */
const describe = (err: TransactionError): string => {
  const ix = (err as { InstructionError?: [number, unknown] }).InstructionError;
  const custom = ix ? (ix[1] as { Custom?: number } | undefined)?.Custom : undefined;
  return typeof custom === 'number' ? `custom program error: 0x${custom.toString(16)}` : JSON.stringify(err);
};

/** Resolves once `signature` reaches `commitment`; throws on failure or expiry. */
export async function confirmByPolling(
  connection: Connection,
  signature: TransactionSignature,
  lastValidBlockHeight: number,
  commitment: Commitment = 'confirmed'
): Promise<void> {
  const want = RANK[commitment] ?? RANK.confirmed;
  for (let i = 0; ; i += 1) {
    const status = (await connection.getSignatureStatuses([signature])).value[0];
    if (status?.err) throw new Error(`transaction ${signature} failed: ${describe(status.err)}`);
    if (status?.confirmationStatus && RANK[status.confirmationStatus] >= want) return;
    // Expiry is only worth asking about while nothing has been seen, and only
    // every few polls, so a slow confirmation does not double the requests.
    if (!status && i % 5 === 4 && (await connection.getBlockHeight(commitment)) > lastValidBlockHeight) {
      throw new Error(`transaction ${signature} was not confirmed: block height exceeded`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

/**
 * An AnchorProvider for the rollup whose sendAndConfirm polls instead of
 * subscribing. It mirrors AnchorProvider.sendAndConfirm — fee payer, fresh
 * blockhash, extra signers, the wallet's signature, preflight options — in
 * everything but how it waits.
 */
export function pollingProvider(connection: Connection, wallet: Wallet, commitment: Commitment): AnchorProvider {
  const provider = new AnchorProvider(connection, wallet, { commitment });
  provider.sendAndConfirm = async (
    tx: Transaction | VersionedTransaction,
    signers?: Signer[],
    opts?: ConfirmOptions
  ): Promise<TransactionSignature> => {
    const options = opts ?? provider.opts;
    const latest = await connection.getLatestBlockhash(options.preflightCommitment ?? commitment);
    if (tx instanceof VersionedTransaction) {
      if (signers) tx.sign(signers);
    } else {
      tx.feePayer = tx.feePayer ?? wallet.publicKey;
      tx.recentBlockhash = latest.blockhash;
      for (const signer of signers ?? []) tx.partialSign(signer);
    }
    const signed = await wallet.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize(), {
      skipPreflight: options.skipPreflight,
      preflightCommitment: options.preflightCommitment ?? options.commitment,
      maxRetries: options.maxRetries,
    });
    await confirmByPolling(connection, signature, latest.lastValidBlockHeight, options.commitment ?? commitment);
    return signature;
  };
  return provider;
}
