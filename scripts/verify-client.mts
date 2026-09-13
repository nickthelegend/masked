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
import { fund } from './fund';
import { pxFromSolPerToken } from '../src/chain/units';
import nacl from 'tweetnacl';

// The same selection seed-demo and prove-privacy make. Pinning CLUSTERS.local
// here meant `EXPO_PUBLIC_CLUSTER=devnet npm run verify:client` silently
// verified the local cluster instead.
const cluster = process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;

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

  const client = new FogduelClient(wrap(creator) as never, cluster, asSigner(creator));
  const joinerClient = new FogduelClient(wrap(joiner) as never, cluster, asSigner(joiner));
  console.log(`cluster: ${cluster.name} (L1 ${cluster.l1}, ER ${cluster.er})`);

  // Fund the joiner: the faucet locally, a transfer from the deploy wallet on devnet.
  // Local SOL is free, so the local airdrop stays generous. Devnet SOL comes out
  // of the deploy wallet, which also carries the program's rent, so the joiner
  // gets what one 0.1 SOL round needs: the entry, a few fills, and rent for its
  // position and stats accounts, with room to spare.
  const devnet = cluster.name === 'devnet';
  await fund(client.l1, creator, joiner.publicKey, (devnet ? 0.5 : 3) * LAMPORTS_PER_SOL, devnet);

  await client.ensureTreasury(creator.publicKey);

  const matchId = Math.floor(Date.now() / 1000);
  const ENTRY = 0.1 * LAMPORTS_PER_SOL;
  // Twelve seconds is plenty on the local stack. On devnet the seal alone can
  // sit through a run of HTTP 429 retries, and a 12 s round was over before its
  // first fill was sent ("Match clock has already expired", 02:47 UTC), so the
  // devnet round is long enough to absorb that.
  const ROUND_SECS = devnet ? 90 : 12;

  console.log('1. create_match');
  const match = await client.createMatch({
    creator: creator.publicKey, matchId, mint: DEMO_MINT,
    durationSecs: ROUND_SECS, entryLamports: ENTRY, startPx: pxFromSolPerToken(0.1),
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
  await joinerClient.joinMatch(match, joiner.publicKey, creator.publicKey, {
    mint: DEMO_MINT,
    startPx: pxFromSolPerToken(0.1),
    marketType: 'meme',
    symbol: 'VERIFY',
    name: 'Verify Client',
  });
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
  // There is one feed per player now, so "the same feed" means both crankers
  // posting to the *creator's*. Cranking is permissionless by design, so this
  // is still a real race and still has to be lost gracefully.
  console.log('6a. two crankers race the same mark');
  const px = await client.fetchPrice(match, creator.publicKey, false);
  const bumped = px + px / 1000n;
  const [a, b] = await Promise.all([
    client.crankPrice(match, creator.publicKey, bumped, creator.publicKey),
    joinerClient.crankPrice(match, joiner.publicKey, bumped, creator.publicKey),
  ]);
  assert.ok(
    (a === null) !== (b === null),
    `exactly one crank should land, got [${a ?? 'null'}, ${b ?? 'null'}]`
  );
  console.log('   one landed, one was declined without erroring');

  console.log('6. price moves, commit + undelegate');
  await client.walkPriceTo(match, creator.publicKey, pxFromSolPerToken(0.118), creator.publicKey);
  // Settlement is refused before the buzzer, so wait for the match's own clock
  // rather than a fixed delay that only suited one round length on one cluster.
  const live = (await client.fetchMatch(match))!;
  const buzzerMs = (live.startTs + live.duration) * 1000 + 1_500;
  await new Promise((r) => setTimeout(r, Math.max(0, buzzerMs - Date.now())));
  // Both ACLs home, each by its own wallet, as the app does at settle start.
  const released = [
    await client.releaseOwnAcl(match, creator.publicKey),
    await joinerClient.releaseOwnAcl(match, joiner.publicKey),
  ];
  console.log('   ACLs released:', released.map((s) => (s ? 'yes' : 'nothing to release')).join(', '));
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
  const tape = await client.fetchTape(match);
  assert.ok(tape, 'public tape written');
  const after = await client.balance(creator.publicKey);
  console.log('   settled. winner:', m.winner!.toBase58().slice(0, 8) + '…',
              'pnlA(bps):', m.pnlABps, 'pnlB(bps):', m.pnlBBps);
  console.log('   rake taken:', tape!.rake / LAMPORTS_PER_SOL, 'SOL',
              '| payout:', tape!.potPaid / LAMPORTS_PER_SOL, 'SOL');
  console.log('   creator balance delta:', ((after - before) / LAMPORTS_PER_SOL).toFixed(4), 'SOL');

  // The client's PnL must equal the chain's, or the screen shows one winner
  // while the pot pays another. Both copies of this arithmetic have drifted
  // before — most recently rendering a flat position as +29,813,639%.
  console.log('7a. client PnL agrees with the chain');
  const settledPos = (await client.fetchPosition(match, creator.publicKey, false))!;
  const finalPx = await client.fetchPrice(match, creator.publicKey, false);
  const clientBps = pnlBps(settledPos, Number(finalPx), ENTRY);
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
