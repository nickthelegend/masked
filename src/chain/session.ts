/**
 * Gum session keys.
 *
 * A sixty-second round with four fills is four wallet popups. A session key
 * removes them: the player signs once to mint a token authorising one
 * throwaway key to call `apply_fill` on their behalf, bounded in time and
 * scoped to this program alone. `apply_fill` carries a `session_auth_or`
 * guard, so without a token the signer must be the position's owner and with
 * one the session program decides — there is no path where an unrelated key
 * moves somebody's book.
 *
 * The session program is preloaded by `mb-test-validator`, so this is the real
 * protocol rather than a local imitation. It publishes no IDL account on this
 * cluster (`anchor idl fetch` finds none), so the one instruction we need is
 * built by hand from the crate's source.
 */
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Connection,
} from '@solana/web3.js';
import { sha256 } from '@noble/hashes/sha256';

/** Gum Session Protocol. Preloaded by mb-test-validator. */
export const SESSION_PROGRAM_ID = new PublicKey('KeyspM2ssCJbqUhQ4k7sveSiY4WjnYsrXkC8oDbwde5');

const SEED_PREFIX = 'session_token';

/** How long a minted session lasts. A round is 60s; an hour is generous. */
export const SESSION_TTL_SECS = 3600;

/**
 * What the player moves to the session key so it can pay its own fees.
 *
 * The key is generated in the page with nothing, and it is the fee payer for
 * every fill it signs. 0.01 SOL is far more than a round of rollup fees costs
 * and small enough that a session key going missing is not a loss worth
 * caring about.
 */
export const SESSION_FUNDING_LAMPORTS = 10_000_000;

/** Anchor's instruction discriminator: sha256("global:<name>")[0..8]. */
const discriminator = (name: string): Buffer =>
  Buffer.from(sha256(new TextEncoder().encode(`global:${name}`))).subarray(0, 8);

/** The PDA the session program derives for one (program, signer, authority). */
export const sessionTokenPda = (
  targetProgram: PublicKey,
  sessionSigner: PublicKey,
  authority: PublicKey
): PublicKey =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from(SEED_PREFIX),
      targetProgram.toBuffer(),
      sessionSigner.toBuffer(),
      authority.toBuffer(),
    ],
    SESSION_PROGRAM_ID
  )[0];

/**
 * `create_session(top_up: Option<bool>, valid_until: Option<i64>, lamports: Option<u64>)`.
 *
 * Borsh encodes an `Option` as one tag byte followed by the value when
 * present, so `None` is a single zero.
 *
 * `top_up` with `lamports` is the protocol's own funding path: it moves that
 * many lamports from the authority to the session key in the same instruction.
 * The key needs them because it pays the fee on every fill it signs, and it is
 * generated in the page with nothing.
 */
export function createSessionIx(args: {
  sessionSigner: PublicKey;
  authority: PublicKey;
  targetProgram: PublicKey;
  validUntil: number;
  /** Lamports to move to the session key. Zero mints an unfunded key. */
  fundLamports?: number;
}): TransactionInstruction {
  const validUntil = Buffer.alloc(8);
  validUntil.writeBigInt64LE(BigInt(args.validUntil));
  const fund = args.fundLamports ?? 0;
  const lamports = Buffer.alloc(8);
  lamports.writeBigUInt64LE(BigInt(fund));

  return new TransactionInstruction({
    programId: SESSION_PROGRAM_ID,
    keys: [
      {
        pubkey: sessionTokenPda(args.targetProgram, args.sessionSigner, args.authority),
        isSigner: false,
        isWritable: true,
      },
      { pubkey: args.sessionSigner, isSigner: true, isWritable: true },
      { pubkey: args.authority, isSigner: true, isWritable: true },
      { pubkey: args.targetProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      discriminator('create_session'),
      Buffer.from([1, fund > 0 ? 1 : 0]), // top_up
      Buffer.from([1]), // valid_until: Some(..)
      validUntil,
      fund > 0
        ? Buffer.concat([Buffer.from([1]), lamports]) // lamports: Some(..)
        : Buffer.from([0]), // lamports: None
    ]),
  });
}

/** What a live session looks like to the app. */
export interface ActiveSession {
  /** The throwaway key that signs fills. */
  signer: Keypair;
  /** The token account authorising it. */
  token: PublicKey;
  /** Unix seconds after which the session program stops honouring it. */
  validUntil: number;
}

/** Whether a session token exists on chain and is owned by the session program. */
export async function sessionTokenLives(
  connection: Connection,
  token: PublicKey
): Promise<boolean> {
  const info = await connection.getAccountInfo(token).catch(() => null);
  return !!info && info.owner.equals(SESSION_PROGRAM_ID);
}

/**
 * Mint a session token for a freshly generated key.
 *
 * Two signatures are needed and both are real: the throwaway key signs to prove
 * it consented to being the session signer, and the player signs as authority
 * and pays. The player's is the only wallet prompt in the whole round.
 */
export async function mintSession(args: {
  connection: Connection;
  authority: PublicKey;
  targetProgram: PublicKey;
  /** Signs the transaction as the authority — the player's wallet. */
  signTransaction: (tx: Transaction) => Promise<Transaction>;
  ttlSecs?: number;
  /** Lamports to move to the session key so it can pay its own fees. */
  fundLamports?: number;
}): Promise<ActiveSession> {
  const signer = Keypair.generate();
  const validUntil = Math.floor(Date.now() / 1000) + (args.ttlSecs ?? SESSION_TTL_SECS);
  const token = sessionTokenPda(args.targetProgram, signer.publicKey, args.authority);

  const tx = new Transaction().add(
    createSessionIx({
      sessionSigner: signer.publicKey,
      authority: args.authority,
      targetProgram: args.targetProgram,
      validUntil,
      fundLamports: args.fundLamports ?? SESSION_FUNDING_LAMPORTS,
    })
  );
  tx.feePayer = args.authority;
  tx.recentBlockhash = (await args.connection.getLatestBlockhash()).blockhash;

  // The session key signs first; the wallet adapter will not sign for a key it
  // does not hold, so its partial signature has to already be on the message.
  tx.partialSign(signer);
  const signed = await args.signTransaction(tx);

  const sig = await args.connection.sendRawTransaction(signed.serialize());
  await args.connection.confirmTransaction(sig, 'confirmed');

  return { signer, token, validUntil };
}
