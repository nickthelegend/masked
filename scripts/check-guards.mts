/**
 * The program's refusals, exercised for real.
 *
 * Every instruction that can be called at the wrong moment is called at the
 * wrong moment here, against the deployed program on the live cluster. A guard
 * that is never tested is a guard that is assumed, and these are the ones that
 * stop a player stealing a pot: settling before the buzzer, trading a position
 * the rollup does not own, cancelling a match somebody has already paid to
 * join, and joining your own duel.
 *
 * Each case must fail. A case that succeeds is a hole in the program, and this
 * script fails loudly rather than reporting a passing suite.
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { fetchMemeMarkets } from '../src/chain/markets';
import { pxFromSolPerToken, MAX_OPEN_AGE_SECS } from '../src/chain/units';

let checks = 0;
const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

/** Assert that `fn` is refused, and report what refused it. */
async function refuses(what: string, fn: () => Promise<unknown>) {
  checks += 1;
  try {
    await fn();
  } catch (e) {
    // Anchor sometimes carries the reason only in the simulation logs, and the
    // message itself is empty — reporting "refused: " tells nobody anything.
    const logs = (e as { logs?: string[] })?.logs ?? [];
    const fromLogs = logs.find((l) => /Error Code:|Error Message:|failed:/.test(l)) ?? '';
    const raw = e instanceof Error ? e.message : String(e);
    const msg = [raw, fromLogs, raw ? '' : JSON.stringify(e).slice(0, 120)].filter(Boolean).join(' | ');
    // Trim to the first line that names the reason.
    // Anchor names the constraint when it can; a rollup that refuses an
    // account it does not own reports it in the simulation logs instead.
    const reason =
      msg.match(/Error Code: (\w+)/)?.[1] ??
      msg.match(/(AccountOwnedByWrongProgram|AccountNotInitialized|InvalidWritableAccount|not delegated)/i)?.[1] ??
      msg.match(/custom program error: (0x[0-9a-f]+)/)?.[1] ??
      msg.replace(/\s+/g, ' ').slice(0, 90);
    console.log(`   refused — ${what}: ${reason}`);
    return;
  }
  fail(`${what} was ALLOWED — the program did not refuse it`);
}

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

  console.log('1. an unjoined match');
  const open = await clientA.createMatch({
    creator: a.publicKey,
    matchId: Date.now(),
    mint: new PublicKey(market.mint),
    durationSecs: 300,
    entryLamports: Math.round(ENTRY * LAMPORTS_PER_SOL),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });

  // Joining your own duel would let one wallet take both sides of a pot.
  await refuses('the creator joining their own match', () =>
    clientA.joinMatch(open, a.publicKey, a.publicKey)
  );

  console.log('2. a live match');
  const live = await clientA.createMatch({
    creator: a.publicKey,
    matchId: Date.now() + 1,
    mint: new PublicKey(market.mint),
    durationSecs: 300,
    entryLamports: Math.round(ENTRY * LAMPORTS_PER_SOL),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  await clientB.joinMatch(live, b.publicKey, a.publicKey);
  const m = await clientA.fetchMatch(live);
  if (m?.status !== 'live') fail(`match should be live, is ${m?.status}`);

  // L10 — the creator must not be able to reclaim their entry after somebody
  // has escrowed against it.
  await refuses('cancelling a match that has been joined', () =>
    clientA.cancelMatch(live, a.publicKey)
  );

  // L8 — settling early would let whoever is ahead end the round.
  await refuses('requesting settlement before the buzzer', () =>
    clientA.requestSettle(live, a.publicKey)
  );

  // L9 — the positions of this match were never delegated, so the rollup does
  // not own them and a fill there must not be accepted.
  await refuses('filling a position the rollup does not own', () =>
    clientA.applyFill(live, a.publicKey, 'buy', Math.round(ENTRY * LAMPORTS_PER_SOL * 0.25))
  );

  // A match that has sat on the book long enough for its seeded price to be
  // wrong must not be joinable — see MAX_OPEN_AGE in state.rs. This uses a
  // genuinely old match from the cluster rather than waiting five minutes.
  console.log('3. a round past its buzzer');
  const shortLived = await clientA.createMatch({
    creator: a.publicKey,
    matchId: Date.now() + 2,
    mint: new PublicKey(market.mint),
    durationSecs: 10,
    entryLamports: Math.round(ENTRY * LAMPORTS_PER_SOL),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  await clientB.joinMatch(shortLived, b.publicKey, a.publicKey);
  await clientA.sealAndDelegateMatch(shortLived, a.publicKey, b.publicKey, a.publicKey);
  const started = (await clientA.fetchMatch(shortLived))!.startTs;
  while (Date.now() / 1000 < started + 11) await new Promise((r) => setTimeout(r, 500));

  // A fill after the buzzer would let a player trade on a price the round has
  // already been decided at.
  await refuses('filling after the buzzer', () =>
    clientA.applyFill(shortLived, a.publicKey, 'buy', Math.round(ENTRY * LAMPORTS_PER_SOL * 0.25))
  );

  console.log('4. a stale open match');
  const book = await clientA.fetchOpenMatches();
  const nowSecs = Math.floor(Date.now() / 1000);
  const old = book.find((x) => nowSecs - x.createdTs > MAX_OPEN_AGE_SECS && !x.creator.equals(b.publicKey));
  if (!old) {
    console.log('   skipped — no match on the book is older than MAX_OPEN_AGE right now');
  } else {
    const age = nowSecs - old.createdTs;
    await refuses(`joining a match opened ${Math.round(age / 60)}m ago`, () =>
      clientB.joinMatch(old.address, b.publicKey, old.creator)
    );
  }

  console.log(`\nguards ok — ${checks} refusals, every one enforced by the deployed program`);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
