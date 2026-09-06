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

export const feedPda = (match: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('feed'), match.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

export const positionPda = (match: PublicKey, owner: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('position'), match.toBuffer(), owner.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

export const tapePda = (match: PublicKey) =>
  PublicKey.findProgramAddressSync([enc('tape'), match.toBuffer()], FOGDUEL_PROGRAM_ID)[0];

export const treasuryPda = () =>
  PublicKey.findProgramAddressSync([enc('treasury')], FOGDUEL_PROGRAM_ID)[0];
