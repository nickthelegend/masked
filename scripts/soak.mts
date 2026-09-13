/**
 * Soak the rollup: N real duels at once, measuring every fill.
 *
 *   npm run soak                 # 3 duels, 60 s rounds
 *   npm run soak -- 5 120        # 5 duels, 120 s rounds
 *   npm run soak -- 1 25 --no-cranks   # commit from the client, no rollup crank
 *   npm run soak -- 1 25 --fills 2     # at most 2 fills per player (commit size control)
 *
 * Each duel is the lifecycle the app runs: create, join, seal and delegate both
 * positions, schedule the round's cranks, fill on the rollup until just before
 * the buzzer, then commit (the crank's, or the client's if the crank has not
 * landed), settle, and release both ACLs. Wallets are fresh keypairs funded
 * from the local faucet, so a soak never touches the shared player keys or a
 * browser wallet.
 *
 * Reported: fills sent, landed, refused and failed; fill latency from send to
 * confirmation on the rollup (p50, p90, p99, max); who committed each round;
 * and every stage that failed, per duel. Exits 1 if any duel failed to settle.
 *
 * Local cluster only: it airdrops.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Keypair, LAMPORTS_PER_SOL, type Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { DEMO_MINT } from '../src/chain/market';
import { pxFromSolPerToken } from '../src/chain/units';
import { fund } from './fund';

if (process.env.EXPO_PUBLIC_CLUSTER === 'devnet') {
  console.error('soak runs against the local cluster only: it funds its wallets from the faucet');
  process.exit(2);
}

const args = process.argv.slice(2);
/** Skip scheduling the rollup's cranks, so the client commits as check:race does. */
const NO_CRANKS = args.includes('--no-cranks');
const fillsFlag = args.indexOf('--fills');
const FILLS_ARG = fillsFlag > -1 ? Math.floor(Number(args[fillsFlag + 1])) : NaN;
const [duelsArg = '3', secsArg = '60'] = args.filter((x, i) => !x.startsWith('--') && !(fillsFlag > -1 && i === fillsFlag + 1));
const DUELS = Math.max(1, Math.min(20, Math.floor(Number(duelsArg)) || 3));
// Inside the program's own 10..3600 s bound, with room for a seal and a few fills.
const ROUND_SECS = Math.max(20, Math.min(600, Math.floor(Number(secsArg)) || 60));
const ENTRY = 0.05 * LAMPORTS_PER_SOL;
/** Each fill spends 1% of the entry, so a player's quote outlasts FILLS_PER_PLAYER fills. */
const FILL_LAMPORTS = Math.floor(ENTRY * 0.01);
/**
 * A position rewritten by many fills is a large commit; one with a couple is a
 * small one. `--fills N` caps it, to tell a load problem from a size problem.
 */
const FILLS_PER_PLAYER = Number.isFinite(FILLS_ARG) && FILLS_ARG >= 0 ? Math.min(60, FILLS_ARG) : 60;
const FILL_GAP_MS = 400;
/** Stop filling this long before the buzzer; a fill racing the commit proves nothing. */
const STOP_BEFORE_BUZZER_MS = 4_000;
/** How long to wait for the rollup's crank to commit, as the app does (CRANK_COMMIT_WAIT_MS). */
const CRANK_COMMIT_WAIT_MS = 15_000;
/**
 * Where each duel's generated keypairs are kept. They exist nowhere else, and a
 * round left stuck needs its owners' signatures to recover (an ACL can only be
 * released by the wallet it names). Gitignored with the rest of .localnet/.
 */
const KEY_DIR = '.localnet/soak-keys';
const cluster = CLUSTERS.local;

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

type Stage = 'fund' | 'create' | 'join' | 'seal' | 'cranks' | 'fill' | 'commit' | 'settle' | 'release';

interface Fill {
  ms: number;
  ok: boolean;
  refused: boolean;
}

interface DuelResult {
  index: number;
  match: string | null;
  failed: { stage: Stage; why: string }[];
  fills: Fill[];
  committedBy: 'crank' | 'client' | null;
  settled: boolean;
}

/**
 * Why something failed, never blank. A rejected transaction can carry an empty
 * `message` with the cause only in its logs, and not everything thrown is an
 * Error, so this falls back through the fields a Solana client error has.
 */
const reason = (e: unknown) => {
  const err = (e ?? {}) as { message?: string; transactionMessage?: string; logs?: string[] };
  const text =
    err.message || err.transactionMessage || (typeof e === 'string' ? e : '') || (() => {
      try {
        return JSON.stringify(e);
      } catch {
        return String(e);
      }
    })();
  const logs = Array.isArray(err.logs) && err.logs.length ? ` | logs: ${err.logs.slice(-3).join(' ; ')}` : '';
  return `${String(text).split('\n')[0]}${logs}`.slice(0, 320);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function duel(index: number): Promise<DuelResult> {
  const r: DuelResult = { index, match: null, failed: [], fills: [], committedBy: null, settled: false };
  const a = Keypair.generate();
  const b = Keypair.generate();
  const ca = new FogduelClient(wrap(a) as never, cluster, asSigner(a));
  const cb = new FogduelClient(wrap(b) as never, cluster, asSigner(b));

  /** Run one stage; record why it failed rather than abandoning the whole soak. */
  const step = async <T,>(stage: Stage, fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch (e) {
      r.failed.push({ stage, why: reason(e) });
      return null;
    }
  };

  const funded = await step('fund', () =>
    Promise.all([
      fund(ca.l1, a, a.publicKey, LAMPORTS_PER_SOL, false),
      fund(cb.l1, b, b.publicKey, LAMPORTS_PER_SOL, false),
    ])
  );
  if (!funded) return r;

  const market = { mint: DEMO_MINT, startPx: pxFromSolPerToken(0.1), marketType: 'meme' as const, symbol: 'SOAK', name: 'Rollup soak' };
  const match = await step('create', () =>
    ca.createMatch({
      creator: a.publicKey,
      matchId: Math.floor(Date.now() / 1000) + index,
      mint: market.mint,
      durationSecs: ROUND_SECS,
      entryLamports: ENTRY,
      startPx: market.startPx,
      marketType: market.marketType,
      symbol: market.symbol,
      name: market.name,
    })
  );
  if (!match) return r;
  r.match = match.toBase58();
  try {
    mkdirSync(KEY_DIR, { recursive: true });
    writeFileSync(`${KEY_DIR}/${r.match}-creator.json`, JSON.stringify(Array.from(a.secretKey)));
    writeFileSync(`${KEY_DIR}/${r.match}-joiner.json`, JSON.stringify(Array.from(b.secretKey)));
  } catch (e) {
    r.failed.push({ stage: 'create', why: `could not save the duel's keypairs: ${reason(e)}` });
  }

  if ((await step('join', () => cb.joinMatch(match, b.publicKey, a.publicKey, market))) === null) return r;
  const buzzer = Date.now() + ROUND_SECS * 1000;

  // The joiner seals and schedules the cranks, as the app's joiner does.
  if ((await step('seal', () => cb.sealAndDelegateMatch(match, a.publicKey, b.publicKey, b.publicKey))) === null) return r;
  const cranked = NO_CRANKS ? false : (await step('cranks', () => cb.scheduleRoundCranks(match, b.publicKey))) !== null;

  const sent = { a: 0, b: 0 };
  let turn = 0;
  while (Date.now() < buzzer - STOP_BEFORE_BUZZER_MS && (sent.a < FILLS_PER_PLAYER || sent.b < FILLS_PER_PLAYER)) {
    const creatorsTurn = turn++ % 2 === 0;
    if (creatorsTurn ? sent.a >= FILLS_PER_PLAYER : sent.b >= FILLS_PER_PLAYER) continue;
    const [client, kp] = creatorsTurn ? [ca, a] : [cb, b];
    if (creatorsTurn) sent.a += 1;
    else sent.b += 1;
    const t0 = Date.now();
    try {
      await client.applyFill(match, kp.publicKey, 'buy', FILL_LAMPORTS);
      r.fills.push({ ms: Date.now() - t0, ok: true, refused: false });
    } catch (e) {
      const why = reason(e);
      // A refusal is the program saying no to a fill it should refuse; a
      // failure is anything else. Only failures count against the rollup.
      const refused = /custom program error|Anchor|AnchorError|constraint/i.test(why);
      r.fills.push({ ms: Date.now() - t0, ok: false, refused });
      if (r.failed.filter((f) => f.stage === 'fill').length < 3) r.failed.push({ stage: 'fill', why });
    }
    await sleep(FILL_GAP_MS);
  }

  // Settlement in the app's own order (useDuel's settle): each player releases
  // its own ACL as the round ends, then the settling client waits for the
  // rollup's crank to commit and commits itself only if that never lands, then
  // waits for both positions to be back on Solana. Releasing the ACLs only after
  // settling, as this script first did, left a round whose crank commit landed
  // but whose positions never came home (4DJv5byR…, 2026-09-13).
  await sleep(Math.max(0, buzzer - Date.now() + 1_500));
  await step('release', () => Promise.all([ca.releaseOwnAcl(match, a.publicKey), cb.releaseOwnAcl(match, b.publicKey)]));

  let crankCommitted = false;
  const deadline = Date.now() + CRANK_COMMIT_WAIT_MS;
  while (cranked && Date.now() < deadline) {
    const progress = await ca.settleProgress(match, a.publicKey, b.publicKey).catch(() => null);
    if (progress && progress.steps >= 3) {
      crankCommitted = true;
      break;
    }
    await sleep(1_000);
  }
  if (!crankCommitted) {
    if (cranked) r.failed.push({ stage: 'commit', why: `the crank had not committed ${CRANK_COMMIT_WAIT_MS / 1000} s after the buzzer; committing from the client` });
    if ((await step('commit', () => ca.commitAndUndelegate(match, a.publicKey, a.publicKey, b.publicKey))) === null) return r;
  }
  const home = await step('commit', () => ca.waitForUndelegation(match, a.publicKey, b.publicKey, 60_000));
  if (!home) {
    r.failed.push({ stage: 'commit', why: 'both positions were not back on the base layer within 60 s' });
    return r;
  }
  r.committedBy = crankCommitted ? 'crank' : 'client';

  const settled = await step('settle', async () => {
    await ca.requestSettle(match, a.publicKey);
    await ca.settleMatch(match, a.publicKey, a.publicKey, b.publicKey);
    return (await ca.fetchMatch(match))?.status === 'settled';
  });
  r.settled = settled === true;
  return r;
}

const percentile = (sorted: number[], p: number) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : NaN;

async function main() {
  console.log(`soak: ${DUELS} duel(s), ${ROUND_SECS} s rounds, ${NO_CRANKS ? 'no cranks (client commits)' : 'rollup cranks scheduled'}, up to ${FILLS_PER_PLAYER} fills per player, ${FILL_LAMPORTS} lamport buys every ${FILL_GAP_MS} ms, on ${cluster.l1} / ${cluster.er}`);
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: DUELS }, (_, i) => duel(i)));
  const elapsed = (Date.now() - started) / 1000;

  for (const r of results) {
    const ok = r.fills.filter((f) => f.ok).length;
    const refused = r.fills.filter((f) => !f.ok && f.refused).length;
    const failed = r.fills.filter((f) => !f.ok && !f.refused).length;
    console.log(
      `  duel ${r.index} ${r.match ? `${r.match.slice(0, 8)}…` : '(no match)'}: fills ${ok} landed / ${refused} refused / ${failed} failed · ` +
        `committed by ${r.committedBy ?? 'nobody'} · ${r.settled ? 'SETTLED' : 'NOT SETTLED'}`
    );
    for (const f of r.failed) console.log(`      ${f.stage}: ${f.why}`);
  }

  const fills = results.flatMap((r) => r.fills);
  const landed = fills.filter((f) => f.ok).map((f) => f.ms).sort((x, y) => x - y);
  const refused = fills.filter((f) => !f.ok && f.refused).length;
  const failed = fills.filter((f) => !f.ok && !f.refused).length;
  const settled = results.filter((r) => r.settled).length;
  console.log(
    `fills: ${fills.length} sent, ${landed.length} landed, ${refused} refused, ${failed} failed · ` +
      `latency p50 ${percentile(landed, 50)} ms, p90 ${percentile(landed, 90)} ms, p99 ${percentile(landed, 99)} ms, max ${landed.at(-1) ?? NaN} ms`
  );
  console.log(
    `rounds: ${settled}/${DUELS} settled, ${results.filter((r) => r.committedBy === 'crank').length} committed by the crank · ${elapsed.toFixed(0)} s wall clock`
  );
  process.exitCode = settled === DUELS && failed === 0 ? 0 : 1;
}

main().catch((e) => {
  console.error('soak aborted:', reason(e));
  process.exit(1);
});
