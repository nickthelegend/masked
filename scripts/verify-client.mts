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
import { FogduelClient, pnlBps } from '../src/chain/client';
import { DEMO_MINT } from '../src/chain/market';
import { CLUSTERS } from '../src/chain/config';
import { pxFromSolPerToken } from '../src/chain/units';
import nacl from 'tweetnacl';

async function main() {


  const load = (p: string) => Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));
  /** A keypair, presented as something that can sign a login challenge. */
const asSigner = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
});

const wrap = (kp: Keypair) => ({
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
  });

  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const joiner = load('.keys/player-b.json');

  const client = new FogduelClient(wrap(creator) as never, CLUSTERS.local, asSigner(creator));
  const joinerClient = new FogduelClient(wrap(joiner) as never, CLUSTERS.local, asSigner(joiner));

  // Fund the joiner from the faucet.
  const sig = await client.l1.requestAirdrop(joiner.publicKey, 3 * LAMPORTS_PER_SOL);
  await client.l1.confirmTransaction(sig, 'confirmed');

  await client.ensureTreasury(creator.publicKey);

  const matchId = Math.floor(Date.now() / 1000);
  const ENTRY = 0.1 * LAMPORTS_PER_SOL;

  console.log('1. create_match');
  const match = await client.createMatch({
    creator: creator.publicKey, matchId, mint: DEMO_MINT,
    durationSecs: 12, entryLamports: ENTRY, startPx: pxFromSolPerToken(0.1),
    marketType: 'meme', symbol: 'VERIFY', name: 'Client Verification',
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

  console.log('4. seal + delegate both positions (the exact UI path)');
  await client.sealAndDelegateMatch(match, creator.publicKey, joiner.publicKey, creator.publicKey);
  const sealedA = await client.isPositionSealed(match, creator.publicKey);
  const sealedB = await client.isPositionSealed(match, joiner.publicKey);
  assert.ok(sealedA && sealedB, 'both positions must carry an on-chain ACL');
  console.log('   sealed (2/2 ACLs on chain) and delegated');

  console.log('5. apply_fill on the ER — through this player\'s own private book');
  const spend = Math.floor(ENTRY * 0.4);
  const bookBefore = (await client.fetchPosition(match, creator.publicKey, true))!.book;
  await client.applyFill(match, creator.publicKey, 'buy', spend);
  const pos = (await client.fetchPosition(match, creator.publicKey, true))!;

  assert.equal(pos.fillCount, 1);
  assert.equal(pos.fills[0].side, 'BUY');
  assert.equal(pos.quoteBalance, ENTRY - spend, 'quote spent is exactly what was asked');
  assert.ok(pos.baseQty > 0, 'base received');
  // A buy on x*y=k fills above the mid it started from, and the book it moved
  // is this player's own — the opponent's is untouched.
  assert.ok(pos.avgPx > bookBefore.seedPx, 'the buy paid impact');
  assert.ok(pos.book.virtualQuote > bookBefore.virtualQuote, 'their own curve moved');
  console.log(
    '   filled on ER — spent', spend, 'lamports, got baseQty', pos.baseQty,
    'at', ((pos.avgPx / bookBefore.seedPx - 1) * 100).toFixed(3) + '% impact'
  );

  // Both sides trade, which is the case that matters: two modified positions
  // is what forces the rollup to commit them one at a time. With both in a
  // single commit the transaction exceeds 1232 bytes and the committor takes a
  // chunked buffer path that fails on this stack.
  await joinerClient.applyFill(match, joiner.publicKey, 'buy', Math.floor(ENTRY * 0.2));
  console.log('   opponent also filled — two positions now need committing');

  // Both players crank the same feed, so losing the race is the normal case.
  // It must not surface as an error to whoever lost it.
  console.log('6a. two crankers race the same mark');
  const px = await client.fetchPrice(match, false);
  const bumped = px + Math.floor(px / 1000);
  const [a, b] = await Promise.all([
    client.crankPrice(match, creator.publicKey, bumped),
    joinerClient.crankPrice(match, joiner.publicKey, bumped),
  ]);
  assert.ok(
    (a === null) !== (b === null),
    `exactly one crank should land, got ${JSON.stringify([a, b])}`
  );
  console.log('   one landed, one was declined without erroring');

  console.log('6. price moves, commit + undelegate');
  await client.walkPriceTo(match, creator.publicKey, pxFromSolPerToken(0.118));
  await new Promise((r) => setTimeout(r, 13_000));
  await client.commitAndUndelegate(match, creator.publicKey, creator.publicKey, joiner.publicKey);

  const home = await client.waitForUndelegation(match, creator.publicKey, joiner.publicKey);
  assert.ok(home, 'both positions undelegated back to the program');
  const committed = (await client.fetchPosition(match, creator.publicKey, false))!;
  const committedOpp = (await client.fetchPosition(match, joiner.publicKey, false))!;
  assert.equal(committed.fillCount, 1, 'the ER fill survived the commit to L1');
  assert.equal(committedOpp.fillCount, 1, 'and so did the opponent\'s');
  console.log('   both committed back — fills on L1:', committed.fillCount, 'and', committedOpp.fillCount);

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

  // The client's PnL must equal the chain's, or the screen shows one winner
  // while the pot pays another. Both copies of this arithmetic have drifted
  // before — most recently rendering a flat position as +29,813,639%.
  console.log('7a. client PnL agrees with the chain');
  const settledPos = (await client.fetchPosition(match, creator.publicKey, false))!;
  const finalPx = await client.fetchPrice(match, false);
  const clientBps = pnlBps(settledPos, finalPx, ENTRY);
  assert.equal(
    clientBps, m.pnlABps,
    `client says ${clientBps}bps, chain says ${m.pnlABps}bps`
  );
  console.log('   both say', clientBps, 'bps');

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
