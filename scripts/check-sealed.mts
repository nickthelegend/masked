/**
 * Proves the product path seals a match.
 *
 * This exercises `sealAndDelegateMatch` — the exact call the UI makes — and
 * then reads the chain to confirm both positions carry an access-control list
 * owned by the permission program, and that both positions are delegated.
 *
 * The gap this closes: the ACL previously existed only in a test and a script,
 * so a match played through the UI was never sealed.
 */
import { Keypair, LAMPORTS_PER_SOL, Connection, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { permissionPdaFromAccount, PERMISSION_PROGRAM_ID } from '@magicblock-labs/ephemeral-rollups-sdk';
import { FogduelClient } from '../src/chain/client';
import { DEMO_MINT } from '../src/chain/market';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';
import { pxFromSolPerToken } from '../src/chain/units';
import nacl from 'tweetnacl';

const cluster = process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;

/** A keypair, presented as something that can sign a login challenge. */
const asSigner = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
});

const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey, payer: kp,
  signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
  signAllTransactions: async (txs: Transaction[]) => { txs.forEach(t => t.partialSign(kp)); return txs; },
});

async function main() {
  const creator = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, 'utf8')))
  );
  const joiner = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync('.keys/player-b.json', 'utf8')))
  );

  const me = new FogduelClient(wrap(creator) as never, cluster, asSigner(creator));
  const them = new FogduelClient(wrap(joiner) as never, cluster, asSigner(joiner));
  const l1 = new Connection(cluster.l1, 'confirmed');

  console.log(`cluster: ${cluster.name} (TEE: ${cluster.tee})`);

  const sig = await l1.requestAirdrop(joiner.publicKey, 3 * LAMPORTS_PER_SOL);
  await l1.confirmTransaction(sig, 'confirmed');
  await me.ensureTreasury(creator.publicKey);

  const matchId = Math.floor(Date.now() / 1000) * 1000 + 500;
  const ENTRY = 0.05 * LAMPORTS_PER_SOL;

  console.log('1. create + join');
  const match = await me.createMatch({
    creator: creator.publicKey, matchId, mint: DEMO_MINT,
    durationSecs: 60, entryLamports: ENTRY, startPx: pxFromSolPerToken(0.1),
    marketType: 'meme', symbol: 'SEALED', name: 'Seal Check',
  });
  await them.joinMatch(match, joiner.publicKey, creator.publicKey, {
    mint: DEMO_MINT, startPx: pxFromSolPerToken(0.1),
    marketType: 'meme', symbol: 'SEALED', name: 'Seal Check',
  });

  console.log('2. sealAndDelegateMatch — the exact call the UI makes');
  await me.sealAndDelegateMatch(match, creator.publicKey, joiner.publicKey, creator.publicKey);

  console.log('3. reading the chain back');
  let sealedCount = 0;
  let delegatedCount = 0;
  for (const [label, owner] of [['creator', creator.publicKey], ['joiner', joiner.publicKey]] as const) {
    const pos = positionPda(match, owner);
    const permission = permissionPdaFromAccount(pos);

    const permInfo = await l1.getAccountInfo(permission);
    assert.ok(permInfo, `${label}: permission account must exist on chain`);
    // The ACL is created by the permission program and then *delegated*, so
    // after sealing its owner is the delegation program. Either owner proves
    // the ACL is real; only the delegated one proves it reached the rollup.
    const permOwner = permInfo!.owner.toBase58();
    assert.ok(
      permOwner === PERMISSION_PROGRAM_ID.toBase58() || permOwner === DELEGATION_PROGRAM_ID.toBase58(),
      `${label}: permission owned by ${permOwner}, expected the permission or delegation program`
    );
    assert.equal(
      permOwner, DELEGATION_PROGRAM_ID.toBase58(),
      `${label}: permission must be delegated to the rollup after sealing`
    );
    sealedCount += 1;

    const posInfo = await l1.getAccountInfo(pos);
    assert.equal(
      posInfo!.owner.toBase58(), DELEGATION_PROGRAM_ID.toBase58(),
      `${label}: position must be delegated`
    );
    delegatedCount += 1;

    console.log(`   ${label.padEnd(8)} ACL ${permission.toBase58().slice(0, 8)}… delegated  ·  position delegated`);
  }

  // And the client's own helper agrees with the raw read.
  assert.equal(await me.isPositionSealed(match, creator.publicKey), true);
  assert.equal(await me.isPositionSealed(match, joiner.publicKey), true);

  console.log(`\nSEALED OK — ${sealedCount}/2 ACLs on chain, ${delegatedCount}/2 positions delegated,`);
  console.log('             via the same client method the UI calls.');
}

main().catch((e) => { console.error(e); process.exit(1); });
