/**
 * Does the permission ACL actually enforce on a local (non-TEE) Ephemeral
 * Rollup?
 *
 * The ephemeral (TEE) permission path needs a delegated fee payer and TEE
 * ingress. This tries the other route the SDK exposes: create the permission
 * on L1, delegate it to the same validator as the position, and see whether
 * the rollup refuses reads from non-members.
 */
import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Fogduel } from "../target/types/fogduel";
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Connection } from "@solana/web3.js";
import {
  permissionPdaFromAccount,
  delegationRecordPdaFromDelegatedAccount,
  delegationMetadataPdaFromDelegatedAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  PERMISSION_PROGRAM_ID,
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { assert } from "chai";

const PRICE_SCALE = 1_000_000;
const LOCAL_ER_VALIDATOR = new PublicKey("mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev");

describe("fogduel · permission ACL", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Fogduel as Program<Fogduel>;
  const creator = provider.wallet as anchor.Wallet;
  const joiner = Keypair.generate();

  const erConnection = new Connection("http://127.0.0.1:7799", "confirmed");
  const erProvider = new anchor.AnchorProvider(erConnection, creator, { commitment: "confirmed" });
  const erProgram = new Program<Fogduel>(program.idl as Fogduel, erProvider);

  // Suite-unique id space, plus randomness so re-runs never reuse a PDA.
  const RUN = Math.floor(Date.now() / 1000) * 1000 + 300 + Math.floor(Math.random() * 90);
  const ENTRY = 0.1 * LAMPORTS_PER_SOL;

  let matchPda: PublicKey, posA: PublicKey, posB: PublicKey, feed: PublicKey, vault: PublicKey;

  before(async () => {
    const sig = await provider.connection.requestAirdrop(joiner.publicKey, 3 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    const idBuf = new BN(RUN).toArrayLike(Buffer, "le", 8);
    [matchPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("match"), creator.publicKey.toBuffer(), idBuf], program.programId);
    [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault"), matchPda.toBuffer()], program.programId);
    [feed] = PublicKey.findProgramAddressSync([Buffer.from("feed"), matchPda.toBuffer()], program.programId);
    [posA] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), matchPda.toBuffer(), creator.publicKey.toBuffer()], program.programId);
    [posB] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), matchPda.toBuffer(), joiner.publicKey.toBuffer()], program.programId);

    await program.methods.createMatch(new BN(RUN), PublicKey.default, new BN(60), new BN(ENTRY), new BN(100 * PRICE_SCALE))
      .accounts({ creator: creator.publicKey, matchAccount: matchPda, vault, priceFeed: feed, systemProgram: SystemProgram.programId })
      .rpc();
    await program.methods.joinMatch()
      .accounts({ joiner: joiner.publicKey, matchAccount: matchPda, vault, priceFeed: feed,
        positionA: posA, positionB: posB, systemProgram: SystemProgram.programId })
      .signers([joiner]).rpc();
  });

  it("creates the L1 permission with the owner as sole member", async () => {
    for (const [owner, pos] of [[creator.publicKey, posA], [joiner.publicKey, posB]] as const) {
      await program.methods.createPositionPermission(owner)
        .accounts({
          payer: creator.publicKey, matchAccount: matchPda, position: pos,
          permission: permissionPdaFromAccount(pos),
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).rpc();

      const info = await provider.connection.getAccountInfo(permissionPdaFromAccount(pos));
      assert.ok(info, "permission account created on L1");
      assert.equal(info!.owner.toBase58(), PERMISSION_PROGRAM_ID.toBase58());
    }
  });

  it("delegates the permission to the ER validator", async () => {
    for (const [owner, pos] of [[creator.publicKey, posA], [joiner.publicKey, posB]] as const) {
      const permission = permissionPdaFromAccount(pos);
      await program.methods.delegatePositionPermission(owner)
        .accounts({
          payer: creator.publicKey, matchAccount: matchPda, position: pos, permission,
          delegationBuffer: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(permission, PERMISSION_PROGRAM_ID),
          delegationRecord: delegationRecordPdaFromDelegatedAccount(permission),
          delegationMetadata: delegationMetadataPdaFromDelegatedAccount(permission),
          validator: LOCAL_ER_VALIDATOR,
          permissionProgram: PERMISSION_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        }).rpc();
    }
  });

  it("delegates the positions themselves", async () => {
    for (const owner of [creator.publicKey, joiner.publicKey]) {
      await program.methods.delegatePositionToEr(owner, LOCAL_ER_VALIDATOR, 1_000)
        .accounts({ payer: creator.publicKey, matchAccount: matchPda }).rpc();
    }
  });

  it("REPORT — what the ER exposes once permissions are delegated", async () => {
    await erProgram.methods.applyFill({ buy: {} }, new BN(0.4 * 1_000_000))
      .accounts({ player: creator.publicKey, matchAccount: matchPda, priceFeed: feed, position: posA })
      .rpc();

    const mine = await erConnection.getAccountInfo(posA);
    const theirs = await erConnection.getAccountInfo(posB);
    const permA = await erConnection.getAccountInfo(permissionPdaFromAccount(posA));

    console.log("\n        --- local ER visibility ---");
    console.log("        own position readable   :", mine ? `yes (${mine.data.length} bytes)` : "no");
    console.log("        opponent position readable:", theirs ? `yes (${theirs.data.length} bytes)` : "NO — refused");
    console.log("        permission acct on ER    :", permA ? `present, owner ${permA.owner.toBase58().slice(0,8)}…` : "absent");

    // Record the ground truth rather than asserting a hoped-for outcome.
    assert.ok(mine, "own position is readable");
  });
});
