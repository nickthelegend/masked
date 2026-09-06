/**
 * Proves the app's own client (src/chain/client.ts) drives a real match end to
 * end — not the Anchor test harness, the exact code path the UI uses.
 *
 * Run against the local MagicBlock stack:
 *   node --no-warnings=MODULE_TYPELESS_PACKAGE_JSON scripts/verify-client.mjs
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { positionPda } from '../src/chain/pdas';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';

async function main() {


  const load = (p: string) => Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));
  const wrap = (kp: Keypair) => ({
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
  });

  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const joiner = load('.keys/player-b.json');

  const client = new FogduelClient(wrap(creator) as never, CLUSTERS.local);
  const joinerClient = new FogduelClient(wrap(joiner) as never, CLUSTERS.local);

  // Fund the joiner from the faucet.
  const sig = await client.l1.requestAirdrop(joiner.publicKey, 3 * LAMPORTS_PER_SOL);
  await client.l1.confirmTransaction(sig, 'confirmed');

  await client.ensureTreasury(creator.publicKey);

  const matchId = Math.floor(Date.now() / 1000);
  const ENTRY = 0.1 * LAMPORTS_PER_SOL;

  console.log('1. create_match');
  const match = await client.createMatch({
    creator: creator.publicKey, matchId, mint: PublicKey.default,
    durationSecs: 12, entryLamports: ENTRY, startPrice: 100,
  });
  let m = (await client.fetchMatch(match))!;
  assert.equal(m.status, 'open');
  assert.equal(m.entry, ENTRY);
  console.log('   open, entry escrowed:', m.entry / LAMPORTS_PER_SOL, 'SOL');

  console.log('2. fetch_open_matches');
  const open = await client.fetchOpenMatches();
  assert.ok(open.some((x: { address: PublicKey }) => x.address.equals(match)), 'new match appears in the open list');
  console.log('   open matches visible:', open.length);

  console.log('3. join_match');
  await joinerClient.joinMatch(match, joiner.publicKey, creator.publicKey);
  m = (await client.fetchMatch(match))!;
  assert.equal(m.status, 'live');
  assert.equal(m.pot, ENTRY * 2);
  console.log('   live, pot:', m.pot / LAMPORTS_PER_SOL, 'SOL');

  console.log('4. delegate both positions to the ER');
  await client.delegatePosition(match, creator.publicKey, creator.publicKey);
  await client.delegatePosition(match, joiner.publicKey, creator.publicKey);
  console.log('   delegated');

  console.log('5. apply_fill on the ER');
  await client.applyFill(match, creator.publicKey, 'buy', 0.4);
  const pos = (await client.fetchPosition(match, creator.publicKey, true))!;
  assert.equal(pos.baseQty, 0.4 * 1_000_000);
  assert.equal(pos.fillCount, 1);
  assert.equal(pos.fills[0].side, 'BUY');
  console.log('   filled on ER — baseQty:', pos.baseQty, 'fills:', pos.fillCount);

  console.log('6. price moves, commit + undelegate');
  await client.pushPrice(match, creator.publicKey, 118);
  await new Promise((r) => setTimeout(r, 13_000));
  await client.commitAndUndelegate(match, creator.publicKey, creator.publicKey, joiner.publicKey);

  let owner = '';
  for (let i = 0; i < 40; i++) {
    const info = await client.l1.getAccountInfo(positionPda(match, creator.publicKey));
    owner = info!.owner.toBase58();
    if (owner === client.programId.toBase58()) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.equal(owner, client.programId.toBase58(), 'undelegated back to the program');
  const committed = (await client.fetchPosition(match, creator.publicKey, false))!;
  assert.equal(committed.fillCount, 1, 'the ER fill survived the commit to L1');
  console.log('   committed back — fill count on L1:', committed.fillCount);

  console.log('7. settle');
  const before = await client.balance(creator.publicKey);
  await client.requestSettle(match, creator.publicKey);
  await client.settleMatch(match, creator.publicKey, creator.publicKey, joiner.publicKey);
  m = (await client.fetchMatch(match))!;
  assert.equal(m.status, 'settled');
  assert.ok(m.winner, 'a winner was recorded');
  const tape = (await client.fetchTape(match)) as any;
  assert.ok(tape, 'public tape written');
  const after = await client.balance(creator.publicKey);
  console.log('   settled. winner:', m.winner!.toBase58().slice(0, 8) + '…',
              'pnlA(bps):', m.pnlABps, 'pnlB(bps):', m.pnlBBps);
  console.log('   rake taken:', tape.rake.toNumber() / LAMPORTS_PER_SOL, 'SOL',
              '| payout:', tape.potPaid.toNumber() / LAMPORTS_PER_SOL, 'SOL');
  console.log('   creator balance delta:', ((after - before) / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  console.log('8. feed reads real tapes');
  const tapes = await client.fetchAllTapes();
  assert.ok(tapes.length > 0, 'tapes readable for the feed');
  console.log('   tapes on chain:', tapes.length);

  console.log('\nCLIENT OK — full match driven through src/chain/client.ts');

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
