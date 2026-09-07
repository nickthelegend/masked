/**
 * Two players' clients sealing the same match at once.
 *
 * Both sides of a duel seal it, and either can get there first: the joiner
 * starts the moment they join, the creator the moment their poll notices
 * somebody has. This was only ever exercised with a script standing in for the
 * second player — and a script that joins and stops does not race. Played from
 * two real browser sessions, the loser of the race got
 * `AccountOwnedByWrongProgram` on screen, for a round that was correctly
 * sealed, because `delegate_position_to_er` moves the account to the
 * delegation program and the second copy of the instruction then fails.
 *
 * The same is true of settlement, and it was worse: the loser of that race
 * was shown MATCH NOT LIVE and left on the settling screen, never seeing its
 * own reveal — while the pot it had just won landed in its wallet.
 *
 * So this runs the real thing: two independent clients, both sealing the same
 * live match concurrently, then both settling it concurrently. Every call must
 * either succeed or leave the chain in the state it was trying to reach.
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { fetchMemeMarkets } from '../src/chain/markets';
import { pxFromSolPerToken } from '../src/chain/units';

let checks = 0;
const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (cond: boolean, msg: string) => {
  checks += 1;
  if (!cond) fail(msg);
};

const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  payer: kp,
  signTransaction: async (tx: Transaction) => {
    tx.partialSign(kp);
    return tx;
  },
  signAllTransactions: async (txs: Transaction[]) => {
    txs.forEach((t) => t.partialSign(kp));
    return txs;
  },
});
const asSigner = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
});

const ENTRY = 0.05;
/** Short, so the buzzer arrives while the check is still running. */
const DURATION = 12;

async function main() {
  const cluster = CLUSTERS.local;
  // Fresh keys, so this never collides with a round somebody is playing.
  const a = Keypair.generate();
  const b = Keypair.generate();

  const clientA = new FogduelClient(wrap(a) as never, cluster, asSigner(a));
  const clientB = new FogduelClient(wrap(b) as never, cluster, asSigner(b));

  for (const kp of [a, b]) {
    const sig = await clientA.l1.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await clientA.l1.confirmTransaction(sig, 'confirmed');
  }

  const markets = await fetchMemeMarkets();
  const market = markets[0];
  if (!market) fail('no live market to open a duel on');

  console.log(`1. A opens a duel on ${market.symbol}`);
  const address = await clientA.createMatch({
    creator: a.publicKey,
    matchId: Date.now(),
    mint: new PublicKey(market.mint),
    durationSecs: DURATION,
    entryLamports: Math.round(ENTRY * LAMPORTS_PER_SOL),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  console.log(`   ${address.toBase58()}`);

  console.log('2. B joins');
  await clientB.joinMatch(address, b.publicKey, a.publicKey, {
    mint: new PublicKey(market.mint), startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme', symbol: market.symbol, name: market.name,
  });
  const live = await clientA.fetchMatch(address);
  ok(live?.status === 'live', `match should be live, is ${live?.status}`);

  console.log('3. both clients seal it at the same time');
  const results = await Promise.allSettled([
    clientA.sealAndDelegateMatch(address, a.publicKey, b.publicKey, a.publicKey),
    clientB.sealAndDelegateMatch(address, a.publicKey, b.publicKey, b.publicKey),
  ]);

  results.forEach((r, i) => {
    ok(
      r.status === 'fulfilled',
      `client ${i === 0 ? 'A' : 'B'} threw while sealing: ${
        r.status === 'rejected' ? String((r.reason as Error)?.message ?? r.reason) : ''
      }`
    );
  });

  console.log('4. the match is sealed exactly once');
  for (const owner of [a.publicKey, b.publicKey]) {
    const position = positionPda(address, owner);
    const permission = permissionPdaFromAccount(position);
    const [posInfo, permInfo] = await Promise.all([
      clientA.l1.getAccountInfo(position),
      clientA.l1.getAccountInfo(permission),
    ]);
    ok(!!permInfo, `${owner.toBase58().slice(0, 6)}: no permission account`);
    ok(!!posInfo, `${owner.toBase58().slice(0, 6)}: no position account`);
    ok(
      posInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `${owner.toBase58().slice(0, 6)}: position is not delegated (owner ${posInfo!.owner.toBase58()})`
    );
    ok(
      permInfo!.owner.equals(DELEGATION_PROGRAM_ID),
      `${owner.toBase58().slice(0, 6)}: permission is not delegated`
    );
  }

  console.log('5. sealing again is a no-op, not an error');
  await clientA.sealAndDelegateMatch(address, a.publicKey, b.publicKey, a.publicKey);
  checks += 1;

  console.log('6. both trade on their own private books');
  const mark = await clientA.fetchPrice(address, a.publicKey, true);
  ok(mark > 0n, 'no mark posted to the rollup');
  await clientA.applyFill(address, a.publicKey, 'buy', Math.round(ENTRY * LAMPORTS_PER_SOL * 0.5));
  await clientB.applyFill(address, b.publicKey, 'buy', Math.round(ENTRY * LAMPORTS_PER_SOL * 0.25));

  console.log('7. waiting for the buzzer');
  const startTs = (await clientA.fetchMatch(address))!.startTs;
  const endsAt = (startTs + DURATION + 1) * 1000;
  while (Date.now() < endsAt) await new Promise((r) => setTimeout(r, 500));

  console.log('8. both clients settle it at the same time');
  const settleOnce = async (client: FogduelClient, payer: PublicKey) => {
    await client.commitAndUndelegate(address, payer, a.publicKey, b.publicKey);
    await client.waitForUndelegation(address, a.publicKey, b.publicKey);
    await client.requestSettle(address, payer);
    await client.settleMatch(address, payer, a.publicKey, b.publicKey);
  };
  const settled = await Promise.allSettled([
    settleOnce(clientA, a.publicKey),
    settleOnce(clientB, b.publicKey),
  ]);

  // One of the two is expected to lose the race and throw. What matters is
  // that the loser can tell it lost: the fix in useDuel keys off exactly this
  // read, and shows the reveal instead of an error when it comes back settled.
  const finalMatch = await clientA.fetchMatch(address);
  ok(finalMatch?.status === 'settled', `match should be settled, is ${finalMatch?.status}`);
  ok(!!finalMatch?.winner, 'a settled match with no winner');
  ok(
    settled.some((r) => r.status === 'fulfilled'),
    'neither client managed to settle the match'
  );

  console.log('9. the loser of the race can read the finished round');
  for (const [label, client] of [['A', clientA], ['B', clientB]] as const) {
    const m = await client.fetchMatch(address);
    ok(m?.status === 'settled', `client ${label} cannot see the match as settled`);
    const tape = await client.fetchTape(address);
    ok(!!tape, `client ${label} cannot read the public tape`);
    ok(tape!.fillsA.length > 0 && tape!.fillsB.length > 0, `client ${label}: a tape with no fills`);
  }

  console.log(
    `\nrace ok — ${checks} assertions, two real clients sealed and settled one match concurrently`
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
