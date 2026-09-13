/**
 * Shorts and liquidation, exercised against the deployed program.
 *
 * A short is the half of the product that cannot be faked in the client: the
 * position goes negative on chain, the margin cap is enforced on chain, and
 * being wiped out is a state the program decides, not the UI.
 *
 * What has to be true, and is asserted below:
 *   1. selling without holding opens a negative position
 *   2. the size cap is one times equity, enforced by the program
 *   3. a mark that moves against a short eats its equity
 *   4. `liquidate` closes an underwater position and records it publicly
 *   5. `liquidate` does nothing to a solvent one
 *   6. the liquidation is readable by anybody, while the position is not
 *
 * Point 6 is the one that matters. Announcing a blow-up was a deliberate hole
 * in the fog; it is only defensible if it is exactly that — a flag, and not a
 * way to read the position behind it.
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS, PERMISSION_PROGRAM_ID } from '../src/chain/config';
import { fetchMemeMarkets } from '../src/chain/markets';
import { pxFromSolPerToken } from '../src/chain/units';
import { positionPda, statusPda } from '../src/chain/pdas';

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
// Long enough to short, walk the mark far enough to blow the position up and
// still have the buzzer arrive inside one run.
const DURATION = 150;

async function main() {
  const cluster = CLUSTERS.local;
  const a = Keypair.generate();
  const b = Keypair.generate();
  const clientA = new FogduelClient(wrap(a) as never, cluster, asSigner(a));
  const clientB = new FogduelClient(wrap(b) as never, cluster, asSigner(b));

  for (const kp of [a, b]) {
    const sig = await clientA.l1.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await clientA.l1.confirmTransaction(sig, 'confirmed');
  }

  const market = (await fetchMemeMarkets())[0];
  if (!market) fail('no live market to open a duel on');
  const entryLamports = Math.round(ENTRY * LAMPORTS_PER_SOL);

  console.log('1. a sealed duel, two markets');
  const match = await clientA.createMatch({
    creator: a.publicKey,
    matchId: Date.now(),
    mint: new PublicKey(market.mint),
    durationSecs: DURATION,
    entryLamports,
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  await clientB.joinMatch(match, b.publicKey, a.publicKey, {
    mint: new PublicKey(market.mint),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  await clientA.sealAndDelegateMatch(match, a.publicKey, b.publicKey, a.publicKey);
  console.log(`   ${match.toBase58()}`);

  console.log('2. A sells a token they do not hold');
  const mark = await clientA.fetchPrice(match, a.publicKey, true);
  ok(mark > 0n, 'no mark on the rollup to short against');
  // Quarter of what the entry could carry, so there is room to add later.
  const capacity = (BigInt(entryLamports) * 1_000_000_000_000n) / mark;
  const shortQty = Number(capacity / 4n);
  await clientA.applyFill(match, a.publicKey, 'sell', shortQty);

  const shorted = (await clientA.fetchPosition(match, a.publicKey, true))!;
  ok(shorted.baseQty < 0, `base should be negative after a naked sell, is ${shorted.baseQty}`);
  ok(shorted.quoteBalance > entryLamports, 'selling should have raised the quote balance');
  ok(shorted.avgPx > 0, 'the short recorded no entry price');
  console.log(
    `   base ${shorted.baseQty} (short), quote ${shorted.quoteBalance} (up from ${entryLamports}), avg px ${shorted.avgPx}`
  );

  console.log('3. the program caps size at one times equity');
  let overshot = false;
  try {
    // Ten times what the entry can carry. The program must refuse it.
    await clientA.applyFill(match, a.publicKey, 'sell', Number(capacity * 10n));
    overshot = true;
  } catch {
    /* expected */
  }
  checks += 1;
  if (overshot) fail('the program allowed a short far larger than the entry could cover');
  console.log('   refused — a short cannot exceed what the entry can cover');

  console.log('4. a solvent position is not liquidated');
  await clientA.liquidate(match, a.publicKey, a.publicKey);
  const stillOpen = (await clientA.fetchPosition(match, a.publicKey, true))!;
  ok(stillOpen.baseQty < 0, 'a solvent short was closed by liquidate');
  const quietStatus = await clientA.fetchRoundStatus(match, true);
  ok(!!quietStatus && !quietStatus.liquidatedA, 'a solvent position was flagged as liquidated');
  console.log('   untouched, and the public flag is still clear');

  console.log('5. the mark runs away from the short');
  // Walk the mark up until the short is underwater. The program caps a push at
  // 5% a second, so this is a walk rather than a jump — in public, one step at
  // a time, exactly as a real move would arrive.
  let steps = 0;
  let target = (mark * 30n) / 10n;
  while (steps < 40) {
    const posNow = (await clientA.fetchPosition(match, a.publicKey, true))!;
    const pxNow = await clientA.fetchPrice(match, a.publicKey, true);
    const equity = posNow.quoteBalance + (posNow.baseQty * Number(pxNow)) / 1e12;
    if (equity <= 0) break;
    await new Promise((r) => setTimeout(r, 1100));
    await clientA.crankPrice(match, a.publicKey, target, a.publicKey, false);
    steps += 1;
    if (steps % 12 === 0) target = (target * 3n) / 1n;
  }
  const finalPx = await clientA.fetchPrice(match, a.publicKey, true);
  const underwater = (await clientA.fetchPosition(match, a.publicKey, true))!;
  const equityNow = underwater.quoteBalance + (underwater.baseQty * Number(finalPx)) / 1e12;
  ok(equityNow <= 0, `short should be underwater after the walk, equity is ${equityNow}`);
  console.log(`   mark ${mark} -> ${finalPx} in ${steps} steps; equity now ${Math.round(equityNow)}`);

  console.log('6. anybody can liquidate it, and it says so in public');
  // Signed by B, against A's position. Permissionless, like settlement.
  await clientB.liquidate(match, b.publicKey, a.publicKey);
  const closed = (await clientA.fetchPosition(match, a.publicKey, true))!;
  ok(closed.baseQty === 0, `liquidation left ${closed.baseQty} base open`);
  ok(closed.quoteBalance === 0, `liquidation left ${closed.quoteBalance} quote — it should be wiped`);
  ok(
    closed.fills.some((f) => f.side === 'LIQUIDATION'),
    'the tape has no LIQUIDATION fill to say why the position ended'
  );
  console.log('   closed at the mark, and recorded as a liquidation rather than a trade');

  const status = await clientB.fetchRoundStatus(match, true);
  ok(!!status?.liquidatedA, 'the public flag was not set for the liquidated side');
  ok(!status?.liquidatedB, 'the wrong side was flagged');
  console.log('   RoundStatus: liquidatedA=true, liquidatedB=false');

  console.log('7. the flag is public; the position behind it is not');
  // The gate is the same front door the app and any spectator use.
  const gate = cluster.er;
  const read = async (address: PublicKey) => {
    const res = await fetch(gate, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [address.toBase58(), { encoding: 'base64' }],
      }),
    });
    const body = await res.json();
    return body?.result?.value?.data?.[0] ?? null;
  };

  const statusData = await read(statusPda(match));
  ok(!!statusData, 'the status account was refused — a public flag nobody can read is not public');
  const positionData = await read(positionPda(match, a.publicKey));
  ok(
    positionData === null,
    'the liquidated position was served through the gate — the fog leaked more than the flag'
  );
  console.log('   status served, position refused: the hole in the fog is exactly one flag wide');

  console.log('8. the liquidation reaches the permanent record');
  // The flag lives on RoundStatus during the round; settle_match copies it onto
  // the Tape. Until this ran, that copy had never executed — every settled tape
  // on the cluster read `liquidated: false` because no liquidated round had
  // ever been settled.
  const started = (await clientA.fetchMatch(match))!.startTs;
  while (Date.now() / 1000 < started + DURATION + 2) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  await clientA.commitAndUndelegate(match, a.publicKey, a.publicKey, b.publicKey);
  await clientA.waitForUndelegation(match, a.publicKey, b.publicKey);
  await clientA.requestSettle(match, a.publicKey);
  await clientA.settleMatch(match, a.publicKey, a.publicKey, b.publicKey);

  const tape = await clientA.fetchTape(match);
  ok(!!tape, 'no tape was written for the liquidated round');
  ok(tape!.liquidatedA, 'the tape does not record that player A was liquidated');
  ok(!tape!.liquidatedB, 'the tape flagged the wrong side');
  ok(
    tape!.fillsA.some((f) => f.side === 'liquidation'),
    'the tape has no LIQUIDATION fill on the liquidated side'
  );
  // Wiped is exactly -100%: the entry is the most anyone can lose.
  ok(
    tape!.pnlABps === -10_000,
    `a liquidated player should settle at -100%, tape says ${tape!.pnlABps}bps`
  );
  ok(
    tape!.winner.equals(b.publicKey),
    'the surviving player should have taken the pot'
  );
  console.log(
    `   tape: liquidatedA=true, LIQUIDATION fill recorded, pnlA ${tape!.pnlABps}bps, winner is the survivor`
  );

  console.log('9. each player releases their own ACL, and both come home');
  // Only the wallet an ACL names can release it, so this does what each
  // player's client does after the buzzer — otherwise both permission accounts
  // stay on the rollup and /proof's ACL panel shows this round's as stranded.
  await Promise.all([
    clientA.releaseOwnAcl(match, a.publicKey),
    clientB.releaseOwnAcl(match, b.publicKey),
  ]);
  for (const owner of [a.publicKey, b.publicKey]) {
    const permission = permissionPdaFromAccount(positionPda(match, owner));
    let home = false;
    for (let i = 0; i < 60 && !home; i++) {
      home = !!(await clientA.l1.getAccountInfo(permission))?.owner.equals(PERMISSION_PROGRAM_ID);
      if (!home) await new Promise((r) => setTimeout(r, 1000));
    }
    ok(home, `${owner.toBase58().slice(0, 6)}: ACL still delegated a minute after its release`);
  }
  console.log('   both ACLs back under the permission program');

  console.log(
    `\nshort ok — ${checks} assertions: a real negative position, a real margin cap, ` +
      `a real liquidation, announced without leaking what was behind it, ` +
      `and written onto the permanent record`
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
