/**
 * Pyth marks for majors, exercised against the deployed program on devnet.
 *
 * Plays a real round whose two legs are majors Pyth publishes — the creator on
 * USDC, the joiner on SOL — and a second round on a meme, then checks what
 * `push_price_pyth` must do and must refuse:
 *
 *   1. USDC's mark is set from Pyth's USDC/USD and SOL/USD accounts, and equals
 *      the mark recomputed off chain from the same bytes.
 *   2. SOL's mark against SOL/USD is exactly one SOL a token.
 *   3. After a Pyth push, the rate-limited crank (`push_price`) is refused.
 *   4. The same updates pushed again are refused as not newer.
 *   5. Another feed's update for a leg is refused.
 *   6. An account the receiver does not own is refused.
 *   7. A meme leg is refused.
 *   8. Both rounds settle with the marks they finished on.
 *   9. (PLAN #80) A push priced from the cluster's recent priority fees pays
 *      exactly that: with a floor, base + price x limit; at devnet's usual
 *      zero, the base fee and no compute-budget instruction at all.
 *
 * Needs the program with `push_price_pyth` deployed on devnet.
 *
 *   EXPO_PUBLIC_CLUSTER=devnet EXPO_PUBLIC_L1_URL=https://rpc.magicblock.app/devnet \
 *   npx tsx scripts/check-pyth.mts
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { DEMO_MINT } from '../src/chain/market';
import { feedPda } from '../src/chain/pdas';
import { USDC_MINT, WSOL_MINT, fetchUsdPrices } from '../src/chain/jupiter';
import { pxFromSolPerToken } from '../src/chain/units';
import {
  PYTH_MAJORS,
  PYTH_RECEIVER_ID,
  SOL_USD_PRICE_UPDATE,
  pushPricePyth,
  pxFromUsdPair,
  readPriceUpdate,
  refusal,
} from '../src/chain/pyth';
import { fund } from './fund';
import { estimatePriorityFee, priorityFeeInstructions, priorityFeeLamports } from '../src/chain/priorityFee';
import { ComputeBudgetProgram } from '@solana/web3.js';

if (process.env.EXPO_PUBLIC_CLUSTER !== 'devnet') {
  console.error('check:pyth runs on devnet, where Pyth publishes: set EXPO_PUBLIC_CLUSTER=devnet');
  process.exit(1);
}
const cluster = CLUSTERS.devnet;

let checks = 0;
const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const pass = (msg: string) => {
  checks += 1;
  console.log(`   ok — ${msg}`);
};

/** Assert that `fn` is refused with `code`, and say so. */
async function refuses(what: string, code: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    const text = [e instanceof Error ? e.message : String(e), ...((e as { logs?: string[] })?.logs ?? [])].join('\n');
    const got = text.match(/Error Code: (\w+)/)?.[1] ?? text.replace(/\s+/g, ' ').slice(0, 120);
    if (got !== code) fail(`${what}: refused, but with ${got}, not ${code}`);
    pass(`${what} — refused: ${code}`);
    return;
  }
  fail(`${what} was ALLOWED`);
}

const load = (p: string) => Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const joiner = load('.keys/player-b.json');
  const l1 = new Connection(cluster.l1, 'confirmed');
  const me = new FogduelClient(wrap(creator) as never, cluster, asSigner(creator));
  const them = new FogduelClient(wrap(joiner) as never, cluster, asSigner(joiner));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anchor's method namespace is untyped
  const program: any = new Program(FOGDUEL_IDL as Idl, new AnchorProvider(l1, wrap(creator) as never, { commitment: 'confirmed' }));

  console.log(`check:pyth on ${cluster.l1}, program ${FOGDUEL_IDL.address}`);
  if (!FOGDUEL_IDL.instructions.some((i) => i.name === 'push_price_pyth')) fail('this IDL has no push_price_pyth');

  const [usdcUpdate, solUpdate] = [PYTH_MAJORS[USDC_MINT].priceUpdate, SOL_USD_PRICE_UPDATE];
  const usdc0 = await readPriceUpdate(l1, usdcUpdate);
  const sol0 = await readPriceUpdate(l1, solUpdate);
  const now0 = Math.floor(Date.now() / 1000);
  console.log(
    `   Pyth now: USDC/USD ${Number(usdc0.price) * 10 ** usdc0.exponent} (${now0 - usdc0.publishTime}s old), ` +
      `SOL/USD ${Number(sol0.price) * 10 ** sol0.exponent} (${now0 - sol0.publishTime}s old)`
  );
  for (const [p, feed] of [[usdc0, PYTH_MAJORS[USDC_MINT].feedId], [sol0, PYTH_MAJORS[WSOL_MINT].feedId]] as const) {
    const why = refusal(p, feed, now0);
    if (why) fail(`the sponsored account would be refused before anything is sent: ${why}`);
  }

  // Jupiter, as an independent read of the same ratio. Reported, not assumed.
  try {
    const usd = await fetchUsdPrices([USDC_MINT, WSOL_MINT]);
    const jup = usd.get(USDC_MINT)!.usdPrice / usd.get(WSOL_MINT)!.usdPrice;
    const pyth = Number(pxFromUsdPair(usdc0, sol0)) / 1e15;
    const diffBps = Math.abs(pyth - jup) / jup * 10_000;
    if (diffBps > 200) fail(`Pyth says ${pyth} SOL per USDC, Jupiter ${jup}: ${diffBps.toFixed(0)} bps apart`);
    pass(`Pyth's USDC in SOL (${pyth.toFixed(6)}) is within ${diffBps.toFixed(0)} bps of Jupiter's (${jup.toFixed(6)})`);
  } catch (e) {
    console.log(`   cross-check against Jupiter not run: ${e instanceof Error ? e.message : e}`);
  }

  await fund(l1, creator, joiner.publicKey, 0.1 * LAMPORTS_PER_SOL, true);
  await me.ensureTreasury(creator.publicKey);

  const ENTRY = 0.01 * LAMPORTS_PER_SOL;
  const ROUND_SECS = 90;
  const base = Math.floor(Date.now() / 1000);

  console.log('[1] a round on two majors: creator USDC, joiner SOL');
  const usdcStart = pxFromUsdPair(usdc0, sol0);
  const major = await me.createMatch({
    creator: creator.publicKey, matchId: base, mint: new PublicKey(USDC_MINT), durationSecs: ROUND_SECS,
    entryLamports: ENTRY, startPx: usdcStart, marketType: 'major', symbol: 'USDC', name: 'USD Coin',
  });
  await them.joinMatch(major, joiner.publicKey, creator.publicKey, {
    mint: new PublicKey(WSOL_MINT), startPx: 1_000_000_000_000_000n, marketType: 'major', symbol: 'SOL', name: 'Solana',
  });
  console.log(`   match ${major.toBase58()}`);

  console.log('[2] a round on a meme, for the refusal');
  const meme = await me.createMatch({
    creator: creator.publicKey, matchId: base + 1, mint: DEMO_MINT, durationSecs: ROUND_SECS,
    entryLamports: ENTRY, startPx: pxFromSolPerToken(0.1), marketType: 'meme', symbol: 'PROOF', name: 'Pyth check meme',
  });
  await them.joinMatch(meme, joiner.publicKey, creator.publicKey, {
    mint: DEMO_MINT, startPx: pxFromSolPerToken(0.1), marketType: 'meme', symbol: 'PROOF', name: 'Pyth check meme',
  });
  console.log(`   match ${meme.toBase58()}`);

  console.log('[3] push_price_pyth');
  // The cluster clock ticks in whole seconds; a push in the same second as the
  // join would meet the crank's one-second spacing from join's own write.
  await sleep(1500);
  // PLAN #80: price this push from the fees the cluster charged recently for the
  // accounts it writes. Devnet usually charges nothing, so the first push adds a
  // floor to exercise the paid path; the SOL push below uses the bare estimate.
  const UNITS = 60_000;
  const FLOOR = 1_000;
  const writes = [feedPda(major, creator.publicKey), creator.publicKey];
  const market = await estimatePriorityFee(l1, writes);
  const floored = await estimatePriorityFee(l1, writes, { floor: FLOOR });
  const sig = await pushPricePyth(program, {
    authority: creator.publicKey, match: major, owner: creator.publicKey, mint: USDC_MINT,
    computeBudget: priorityFeeInstructions(floored.microLamports, UNITS),
  });
  const usdcFeed = await program.account.priceFeed.fetch(feedPda(major, creator.publicKey));
  const [usdc1, sol1] = [await readPriceUpdate(l1, usdcUpdate), await readPriceUpdate(l1, solUpdate)];
  const candidates = [pxFromUsdPair(usdc0, sol0), pxFromUsdPair(usdc1, sol1), pxFromUsdPair(usdc0, sol1), pxFromUsdPair(usdc1, sol0)];
  const written = BigInt(usdcFeed.px.toString());
  if (!candidates.includes(written)) fail(`USDC mark ${written} matches no recomputation from the Pyth bytes: ${candidates.join(', ')}`);
  pass(`USDC mark ${written} (${Number(written) / 1e15} SOL a token) = the mark recomputed from the same Pyth bytes (tx ${sig.slice(0, 8)}…)`);
  if (!usdcFeed.authority.equals(PYTH_RECEIVER_ID)) fail(`feed authority is ${usdcFeed.authority.toBase58()}, not the Pyth receiver`);
  pass('the USDC feed now names the Pyth receiver as its authority');
  const pair = [usdc1, sol1];
  if (Number(usdcFeed.updatedTs) !== Math.min(...pair.map((p) => p.publishTime)) &&
      Number(usdcFeed.updatedTs) !== Math.min(usdc0.publishTime, sol0.publishTime)) {
    fail(`feed updated_ts ${usdcFeed.updatedTs} is not the older publish time of the pair`);
  }
  pass(`the feed's updated_ts is the older Pyth publish time (${usdcFeed.updatedTs})`);

  // Signed by the creator for the joiner's feed: the instruction is
  // permissionless, and this shows it.
  const solSig = await pushPricePyth(program, {
    authority: creator.publicKey, match: major, owner: joiner.publicKey, mint: WSOL_MINT,
    computeBudget: priorityFeeInstructions(market.microLamports, UNITS),
  });
  const solFeed = await program.account.priceFeed.fetch(feedPda(major, joiner.publicKey));
  if (BigInt(solFeed.px.toString()) !== 1_000_000_000_000_000n) fail(`SOL mark is ${solFeed.px}, not exactly 1e15`);
  pass('SOL priced against SOL/USD is exactly one SOL a token (1e15)');

  const landed = async (s: string) => {
    for (let i = 0; i < 20; i++) {
      const t = await l1.getTransaction(s, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
      if (t?.meta) return t;
      await sleep(1000);
    }
    return fail(`${s} never became readable`);
  };
  const budgetIxs = (t: Awaited<ReturnType<typeof landed>>) => {
    const keys = t.transaction.message.staticAccountKeys;
    return t.transaction.message.compiledInstructions.filter((ix) => keys[ix.programIdIndex].equals(ComputeBudgetProgram.programId)).length;
  };
  const paid = await landed(sig);
  const expectPaid = 5_000 + priorityFeeLamports(floored.microLamports, UNITS);
  if (paid.meta!.fee !== expectPaid || budgetIxs(paid) !== 2) fail(`USDC push paid ${paid.meta!.fee} lamports with ${budgetIxs(paid)} compute-budget instructions; expected ${expectPaid} with 2`);
  pass(
    `priority fee: devnet's p${market.percentile} over ${market.samples} slots for these accounts was ${market.microLamports} µ-lamports/CU (${market.nonZero} nonzero); ` +
      `with a ${FLOOR} floor the USDC push paid ${paid.meta!.fee} lamports = 5000 base + ${priorityFeeLamports(floored.microLamports, UNITS)} priority, using ${paid.meta!.computeUnitsConsumed} of ${UNITS} CU`
  );
  const bare = await landed(solSig);
  const expectBare = 5_000 + priorityFeeLamports(market.microLamports, UNITS);
  const expectIxs = market.microLamports > 0 ? 2 : 0;
  if (bare.meta!.fee !== expectBare || budgetIxs(bare) !== expectIxs) fail(`SOL push paid ${bare.meta!.fee} with ${budgetIxs(bare)} compute-budget instructions; expected ${expectBare} with ${expectIxs}`);
  pass(`at the bare estimate (${market.microLamports}) the SOL push paid ${bare.meta!.fee} lamports with ${expectIxs} compute-budget instructions`);

  console.log('[4] refusals');
  await sleep(1500);
  await refuses('the crank moving a Pyth-priced feed', 'OracleOwnsFeed', () =>
    me.pushPrice(major, creator.publicKey, written + 1n, creator.publicKey, false)
  );
  const usdcNow = await readPriceUpdate(l1, usdcUpdate);
  const solNow = await readPriceUpdate(l1, solUpdate);
  if (usdcNow.publishTime === usdc1.publishTime && solNow.publishTime === sol1.publishTime) {
    await refuses('the same Pyth updates pushed again', 'OracleUpdateNotNewer', () =>
      pushPricePyth(program, { authority: creator.publicKey, match: major, owner: creator.publicKey, mint: USDC_MINT })
    );
  } else {
    console.log('   (Pyth published between the two pushes, so the replay case would be a genuine update; not run)');
  }
  await refuses("SOL/USD's update passed as USDC's", 'OracleWrongFeed', () =>
    pushPricePyth(program, { authority: creator.publicKey, match: major, owner: creator.publicKey, mint: USDC_MINT, tokenPriceUpdate: solUpdate })
  );
  await refuses('an account the Pyth receiver does not own', 'OracleAccountInvalid', () =>
    pushPricePyth(program, { authority: creator.publicKey, match: major, owner: creator.publicKey, mint: USDC_MINT, tokenPriceUpdate: major })
  );
  await refuses('a meme leg', 'NotAMajor', () =>
    pushPricePyth(program, { authority: creator.publicKey, match: meme, owner: creator.publicKey, mint: USDC_MINT })
  );

  console.log('[5] the buzzer, then settlement');
  for (const m of [major, meme]) {
    const s = (await me.fetchMatch(m))!;
    await sleep(Math.max(0, (s.startTs + s.duration) * 1000 + 2_000 - Date.now()));
    await me.requestSettle(m, creator.publicKey);
    await me.settleMatch(m, creator.publicKey, creator.publicKey, joiner.publicKey);
    const done = (await me.fetchMatch(m))!;
    if (done.status !== 'settled') fail(`${m.toBase58()} is ${done.status} after settle_match`);
    const tape = await me.fetchTape(m);
    if (!tape) fail(`${m.toBase58()} settled without a tape`);
    pass(`${m.toBase58().slice(0, 8)}… settled, tape written, paid ${tape!.potPaid / LAMPORTS_PER_SOL} SOL`);
  }

  console.log(`\nPYTH OK — ${checks} checks`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
