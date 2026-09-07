/** PDA derivations, shared by the client and the tests. */
import { PublicKey } from '@solana/web3.js';
import { FOGDUEL_PROGRAM_ID } from './config';

const enc = (s: string) => Buffer.from(s);

const u64le = (n: number | bigint): Buffer => {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
};

export const matchPda = (creator: PublicKey, matchId: number | bigint) =>
  PublicKey.findProgramAddressSync([enc('match'), creator.toBuffer(), u64le(matchId)], FOGDUEL_PROGRAM_ID)[0];

export const vaultPda = (match: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('vault'), match.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

/**
 * One feed per player, not one per match.
 *
 * The two sides trade different tokens now, so a single shared mark would be
 * meaningless to at least one of them.
 */
export const feedPda = (match: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync(
    [enc('feed'), match.toBuffer(), owner.toBuffer()],
    FOGDUEL_PROGRAM_ID
  )[0];

/** The unsealed per-round status account. See `RoundStatus` in state.rs. */
export const statusPda = (match: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('status'), match.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

export const positionPda = (match: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('position'), match.toBuffer(), owner.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

export const tapePda = (match: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('tape'), match.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

export const treasuryPda = () =>
  PublicKey.findProgramAddressSync([enc('treasury')], FOGDUEL_PROGRAM_ID)[0];

export const statsPda = (owner: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('stats'), owner.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

