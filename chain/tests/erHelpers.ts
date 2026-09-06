/**
 * Instruction builders the TypeScript SDK does not expose.
 *
 * Paying fees on an ER is not the same as paying on L1. The validator runs in
 * `ephemeral` lifecycle mode — it will only accept writes to *delegated*
 * accounts — so a transaction whose fee payer is an ordinary wallet is
 * rejected with "This account may not be used to pay transaction fees".
 *
 * The fix is an "ephemeral balance" (escrow) PDA: top it up on L1, delegate it
 * to the same validator, and the ER will then fund that wallet's transactions
 * from it.
 *
 * The SDK ships `createTopUpEscrowInstruction` but its `createDelegateInstruction`
 * marks the delegated account as a signer, which a PDA cannot satisfy. The
 * delegation program has a dedicated instruction for this case
 * (`DelegateEphemeralBalance`, discriminator 10) that is only built in the Rust
 * API, so it is reproduced here.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  DELEGATION_PROGRAM_ID,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationMetadataPdaFromDelegatedAccount,
  delegationRecordPdaFromDelegatedAccount,
  escrowPdaFromEscrowAuthority,
} from "@magicblock-labs/ephemeral-rollups-sdk";

const DELEGATE_EPHEMERAL_BALANCE_DISCRIMINATOR = 10;
const NO_COMMIT_FREQUENCY = 0xffffffff;

/** borsh: DelegateArgs { commit_frequency_ms: u32, seeds: Vec<Vec<u8>>, validator: Option<Pubkey> } */
function serializeDelegateArgs(validator?: PublicKey, commitFrequencyMs = NO_COMMIT_FREQUENCY): Buffer {
  const buf = Buffer.alloc(64);
  let o = 0;
  buf.writeUInt32LE(commitFrequencyMs, o); o += 4;
  buf.writeUInt32LE(0, o); o += 4; // empty seeds vec
  if (validator) {
    buf[o++] = 1;
    buf.set(validator.toBuffer(), o); o += 32;
  } else {
    buf[o++] = 0;
  }
  return buf.subarray(0, o);
}

/**
 * Delegate a wallet's ephemeral balance to a validator so it can pay fees on
 * that ER. `authority` must sign.
 */
export function createDelegateEphemeralBalanceInstruction(
  payer: PublicKey,
  authority: PublicKey,
  validator?: PublicKey,
  index = 0
): TransactionInstruction {
  const escrow = escrowPdaFromEscrowAuthority(authority, index);
  // The escrow is a system-owned account, so its delegate buffer is derived
  // against the system program, not against our program.
  const buffer = delegateBufferPdaFromDelegatedAccountAndOwnerProgram(escrow, SystemProgram.programId);

  const data = Buffer.concat([
    (() => { const d = Buffer.alloc(8); d.writeUInt32LE(DELEGATE_EPHEMERAL_BALANCE_DISCRIMINATOR, 0); return d; })(),
    serializeDelegateArgs(validator),
    Buffer.from([index]),
  ]);

  return new TransactionInstruction({
    programId: DELEGATION_PROGRAM_ID,
    keys: [
      { pubkey: payer, isWritable: true, isSigner: true },
      { pubkey: authority, isWritable: false, isSigner: true },
      { pubkey: escrow, isWritable: true, isSigner: false },
      { pubkey: buffer, isWritable: true, isSigner: false },
      { pubkey: delegationRecordPdaFromDelegatedAccount(escrow), isWritable: true, isSigner: false },
      { pubkey: delegationMetadataPdaFromDelegatedAccount(escrow), isWritable: true, isSigner: false },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
      { pubkey: DELEGATION_PROGRAM_ID, isWritable: false, isSigner: false },
    ],
    data,
  });
}

export { escrowPdaFromEscrowAuthority };
