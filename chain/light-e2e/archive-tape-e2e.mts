/**
 * #82 end to end, on Light's local validator: settle a real round with the anchor-1.2 build of
 * fogduel, archive its tape as a compressed account through Light's system program, then read the
 * compressed tape back through Photon and compare every field with the Tape PDA it came from.
 *
 * Needs: `light test-validator --sbf-program 3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1 <fogduel.so>`
 * (validator :8899, Photon :8784, prover :3001).
 */
import { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
// anchor 0.32 is CommonJS to Node (`main` is dist/cjs); Node 22 cannot see its named exports from ESM,
// so take them off the default export.
import anchor, { type Idl } from '@coral-xyz/anchor';
const { AnchorProvider, BN, Program, Wallet } = anchor;
import { PackedAccounts, SystemAccountMetaConfig, TreeType, bn, createRpc, deriveAddressLegacy, deriveAddressSeedLegacy, defaultTestStateTreeAccounts, getLightSystemAccountMetasLegacy, selectStateTreeInfo } from '@lightprotocol/stateless.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const RPC = 'http://127.0.0.1:8899';
const idl = JSON.parse(readFileSync(new URL('./fogduel-idl.json', import.meta.url), 'utf8')) as Idl & { address: string };
const PID = new PublicKey(idl.address);
const connection = new Connection(RPC, 'confirmed');
const rpc = createRpc(RPC, 'http://127.0.0.1:8784', 'http://127.0.0.1:3001');
const fail = (m: string): never => { console.error(`FAIL: ${m}`); process.exit(1); };

const pda = (...seeds: (Buffer | Uint8Array)[]) => PublicKey.findProgramAddressSync(seeds, PID)[0];
const u64le = (n: number) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const enc = (s: string) => Buffer.from(s);

// Arguments by name, from the IDL, so the call does not depend on argument order.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const argsFor = (ix: string, values: Record<string, any>) => {
  const def = idl.instructions.find((i) => i.name === ix) ?? fail(`no ${ix} in IDL`);
  return def.args.map((a) => (a.name in values ? values[a.name] : fail(`${ix}: no value for arg ${a.name}`)));
};

async function main() {
  console.log(`validator ${(await connection.getVersion())['solana-core']}; Photon health ${await rpc.getIndexerHealth()}; program ${PID.toBase58()} executable: ${(await connection.getAccountInfo(PID))?.executable ?? false}`);
  const a = Keypair.generate(); const b = Keypair.generate();
  for (const kp of [a, b]) { const s = await connection.requestAirdrop(kp.publicKey, 20 * LAMPORTS_PER_SOL); await connection.confirmTransaction(s, 'confirmed'); }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programFor = (kp: Keypair): any => new Program(idl, new AnchorProvider(connection, new Wallet(kp), { commitment: 'confirmed' }));
  const pa = programFor(a); const pb = programFor(b);

  const treasury = pda(enc('treasury'));
  if (!(await connection.getAccountInfo(treasury))) await pa.methods.initTreasury().accountsPartial({ payer: a.publicKey, treasury, systemProgram: SystemProgram.programId }).rpc();

  const matchId = Math.floor(Date.now() / 1000);
  const match = pda(enc('match'), a.publicKey.toBuffer(), u64le(matchId));
  const vault = pda(enc('vault'), match.toBuffer());
  const feedA = pda(enc('feed'), match.toBuffer(), a.publicKey.toBuffer());
  const feedB = pda(enc('feed'), match.toBuffer(), b.publicKey.toBuffer());
  const status = pda(enc('status'), match.toBuffer());
  const posA = pda(enc('position'), match.toBuffer(), a.publicKey.toBuffer());
  const posB = pda(enc('position'), match.toBuffer(), b.publicKey.toBuffer());
  const tape = pda(enc('tape'), match.toBuffer());
  const mint = new PublicKey('11111111111111111111111111111111');
  const startPx = new BN('100000000000000');
  await pa.methods.createMatch(...argsFor('create_match', { match_id: new BN(matchId), mint, duration: new BN(10), entry: new BN(0.05 * LAMPORTS_PER_SOL), start_px: startPx, market_type: { meme: {} }, symbol: 'LIGHT', name: 'Compressed tape e2e' }))
    .accountsPartial({ creator: a.publicKey, matchAccount: match, vault, priceFeed: feedA, roundStatus: status, systemProgram: SystemProgram.programId }).rpc();
  await pb.methods.joinMatch(...argsFor('join_match', { mint, start_px: startPx, market_type: { meme: {} }, symbol: 'LIGHT', name: 'Compressed tape e2e' }))
    .accountsPartial({ joiner: b.publicKey, matchAccount: match, vault, priceFeed: feedA, priceFeedB: feedB, positionA: posA, positionB: posB, systemProgram: SystemProgram.programId }).rpc();
  console.log(`round ${match.toBase58()} live; waiting for the buzzer`);
  await new Promise((r) => setTimeout(r, 13_000));
  await pa.methods.requestSettle().accountsPartial({ cranker: a.publicKey, matchAccount: match }).rpc();
  // cranker, creator and joiner carry no PDA seeds in the IDL, so the resolver cannot fill them.
  await pa.methods.settleMatch().accountsPartial({ cranker: a.publicKey, creator: a.publicKey, joiner: b.publicKey, matchAccount: match, vault, priceFeed: feedA, priceFeedB: feedB, roundStatus: status, positionA: posA, positionB: posB, treasury, tape, statsCreator: pda(enc('stats'), a.publicKey.toBuffer()), statsJoiner: pda(enc('stats'), b.publicKey.toBuffer()), systemProgram: SystemProgram.programId }).rpc();
  const tapeState = await pa.account.tape.fetch(tape);
  console.log(`settled; Tape PDA ${tape.toBase58()} winner ${tapeState.winner.toBase58().slice(0, 8)} pot ${tapeState.potPaid.toString()}`);

  // The compressed tape's address: v1 derivation over ["tape", match], as archive_tape derives it
  // (light_sdk::address::v1::derive_address). stateless.js 0.23 is built in V2 mode, where the
  // unsuffixed deriveAddressSeed/deriveAddress, PackedAccounts.newWithSystemAccounts and
  // selectStateTreeInfo all pick the V2 variants; the program's CPI is v1, so name the v1 ones.
  const { addressTree, addressQueue } = defaultTestStateTreeAccounts();
  const seed = deriveAddressSeedLegacy([enc('tape'), match.toBuffer()], PID);
  const address = deriveAddressLegacy(seed, addressTree);
  const proof = await rpc.getValidityProofV0([], [{ address: bn(address.toBytes()), tree: addressTree, queue: addressQueue }]);
  if (!proof.compressedProof) fail('Photon/prover returned no proof for the new address');
  // Remaining accounts, in light_sdk::cpi::v1::CpiAccounts order: the v1 system accounts, then the
  // trees, which the instruction's indices count from.
  const packed = new PackedAccounts();
  const treeIndex = packed.insertOrGet(addressTree);
  const queueIndex = packed.insertOrGet(addressQueue);
  const outputTree = selectStateTreeInfo(await rpc.getStateTreeInfos(), TreeType.StateV1);
  const outputIndex = packed.insertOrGet(outputTree.tree);
  const remainingAccounts = [...getLightSystemAccountMetasLegacy(SystemAccountMetaConfig.new(PID)), ...packed.toAccountMetas().remainingAccounts];

  const disc = createHash('sha256').update('global:archive_tape').digest().subarray(0, 8);
  const p = proof.compressedProof!;
  const tree = Buffer.alloc(4); tree.writeUInt8(treeIndex, 0); tree.writeUInt8(queueIndex, 1); tree.writeUInt16LE(proof.rootIndices[0], 2);
  const data = Buffer.concat([disc, Buffer.from([1]), Buffer.from(p.a), Buffer.from(p.b), Buffer.from(p.c), tree, Buffer.from([outputIndex])]);
  const ix = new TransactionInstruction({ programId: PID, data, keys: [{ pubkey: a.publicKey, isSigner: true, isWritable: true }, { pubkey: tape, isSigner: false, isWritable: false }, ...remainingAccounts] });
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_000_000 }), ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [a], { commitment: 'confirmed' });
  console.log(`archive_tape sent: ${sig.slice(0, 16)}… (${tx.serialize().length} bytes)`);

  for (let i = 0; i < 20; i++) {
    const acc = await rpc.getCompressedAccount(bn(address.toBytes()));
    if (acc?.data) {
      const d = Buffer.from(acc.data.data);
      const k = (o: number) => new PublicKey(d.subarray(o, o + 32));
      // CompressedTape (state.rs): 6 pubkeys, 5 × 8-byte numbers, 2 × u16, 2 × bool = 238 bytes.
      if (d.length !== 238) fail(`compressed tape is ${d.length} bytes, expected 238`);
      const got = { match: k(0), mintA: k(32), mintB: k(64), playerA: k(96), playerB: k(128), winner: k(160), pnlA: d.readBigInt64LE(192), pnlB: d.readBigInt64LE(200), potPaid: d.readBigUInt64LE(208), rake: d.readBigUInt64LE(216), settledTs: d.readBigInt64LE(224), fillsA: d.readUInt16LE(232), fillsB: d.readUInt16LE(234), liquidatedA: d[236] === 1, liquidatedB: d[237] === 1 };
      const checks: [string, string, string][] = [
        ['match', got.match.toBase58(), tapeState.matchKey.toBase58()],
        ['mint_a', got.mintA.toBase58(), tapeState.legA.mint.toBase58()],
        ['mint_b', got.mintB.toBase58(), tapeState.legB.mint.toBase58()],
        ['fill_count_a', String(got.fillsA), String(tapeState.fillCountA)],
        ['fill_count_b', String(got.fillsB), String(tapeState.fillCountB)],
        ['liquidated_a', String(got.liquidatedA), String(tapeState.liquidatedA)],
        ['liquidated_b', String(got.liquidatedB), String(tapeState.liquidatedB)],
        ['winner', got.winner.toBase58(), tapeState.winner.toBase58()],
        ['player_a', got.playerA.toBase58(), tapeState.playerA.toBase58()],
        ['player_b', got.playerB.toBase58(), tapeState.playerB.toBase58()],
        ['pnl_a_bps', got.pnlA.toString(), tapeState.pnlABps.toString()],
        ['pnl_b_bps', got.pnlB.toString(), tapeState.pnlBBps.toString()],
        ['pot_paid', got.potPaid.toString(), tapeState.potPaid.toString()],
        ['rake', got.rake.toString(), tapeState.rake.toString()],
        ['settled_ts', got.settledTs.toString(), tapeState.settledTs.toString()],
      ];
      for (const [name, x, y] of checks) if (x !== y) fail(`compressed ${name} ${x} != Tape PDA ${y}`);
      console.log(`compressed tape at ${address.toBase58()} (owner ${acc.owner.toBase58().slice(0, 8)}, ${d.length} bytes) matches the Tape PDA on ${checks.length} fields`);
      console.log('COMPRESSED-TAPE OK');
      return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  fail('Photon never returned the compressed tape');
}

main().catch((e) => { console.error(e?.logs ? `${e.message}\n${e.logs.join('\n')}` : e); process.exit(1); });
