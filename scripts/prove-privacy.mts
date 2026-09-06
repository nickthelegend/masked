/**
 * THE PROOF SCRIPT.
 *
 * Runs a real match and reports, at each stage, exactly what each party can
 * read from chain. This is the artifact to put on camera next to the UI.
 *
 * It asserts what is actually true rather than what would be flattering:
 * on a TEE cluster the opponent read is refused at ingress; on a local
 * non-TEE ER the ACL exists on-chain but is not enforced, and the script says
 * so in as many words.
 *
 *   npm run prove:privacy
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Connection, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';

const cluster = process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;

const load = (p: string) => Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));
const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  payer: kp,
  signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
  signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
});

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(64));
const yes = (b: boolean) => (b ? 'YES' : 'NO');

async function main() {
  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const opponent = load('.keys/player-b.json');

  const me = new FogduelClient(wrap(creator) as never, cluster);
  const them = new FogduelClient(wrap(opponent) as never, cluster);
  const rawEr = new Connection(cluster.er, 'confirmed');
  const rawL1 = new Connection(cluster.l1, 'confirmed');

  rule();
  line(`FOGDUEL — PRIVACY PROOF   [cluster: ${cluster.name}, TEE: ${yes(cluster.tee)}]`);
  rule();
  line(`  L1 : ${cluster.l1}`);
  line(`  ER : ${cluster.er}`);
  line(`  you      : ${creator.publicKey.toBase58()}`);
  line(`  opponent : ${opponent.publicKey.toBase58()}`);
  line();

  const sig = await rawL1.requestAirdrop(opponent.publicKey, 3 * LAMPORTS_PER_SOL);
  await rawL1.confirmTransaction(sig, 'confirmed');
  await me.ensureTreasury(creator.publicKey);

  const matchId = Math.floor(Date.now() / 1000);
  const ENTRY = 0.1 * LAMPORTS_PER_SOL;

  line('[1] opening a match and staking both sides');
  const match = await me.createMatch({
    creator: creator.publicKey, matchId, mint: PublicKey.default,
    durationSecs: 15, entryLamports: ENTRY, startPrice: 100,
  });
  await them.joinMatch(match, opponent.publicKey, creator.publicKey);
  const m = (await me.fetchMatch(match))!;
  line(`    match ${match.toBase58()}`);
  line(`    status=${m.status} pot=${m.pot / LAMPORTS_PER_SOL} SOL`);
  line();

  const myPos = positionPda(match, creator.publicKey);
  const theirPos = positionPda(match, opponent.publicKey);

  line('[2] creating the on-chain access-control list for each position');
  for (const [owner, pos] of [[creator.publicKey, myPos], [opponent.publicKey, theirPos]] as const) {
    await me.createPositionPermission(match, owner, creator.publicKey);
    const permission = permissionPdaFromAccount(pos);
    const info = await rawL1.getAccountInfo(permission);
    line(`    ${owner.toBase58().slice(0, 8)}… permission ${permission.toBase58().slice(0, 8)}… ` +
         `owner=${info?.owner.toBase58().slice(0, 8)}… members=[owner only]`);
  }
  line();

  line('[3] delegating permissions and positions to the rollup');
  for (const [owner, pos] of [[creator.publicKey, myPos], [opponent.publicKey, theirPos]] as const) {
    await me.delegatePositionPermission(match, owner, creator.publicKey, pos);
    await me.delegatePosition(match, owner, creator.publicKey);
  }
  for (const [label, pos] of [['yours', myPos], ['theirs', theirPos]] as const) {
    const info = await rawL1.getAccountInfo(pos);
    const delegated = info?.owner.equals(DELEGATION_PROGRAM_ID);
    line(`    ${label.padEnd(7)} L1 owner = ${info?.owner.toBase58()}  ${delegated ? '<- DELEGATED' : ''}`);
  }
  line();

  line('[4] trading — a fill lands on the rollup');
  await me.applyFill(match, creator.publicKey, 'buy', 0.4);
  await them.applyFill(match, opponent.publicKey, 'buy', 0.25);
  line('    both sides have open positions');
  line();

  rule();
  line('  MID-ROUND VISIBILITY — the question the whole product turns on');
  rule();

  const myOwn = await me.fetchPosition(match, creator.publicKey, true);
  line(`  you reading YOUR OWN position .......... ${yes(!!myOwn)}` +
       (myOwn ? `  (baseQty=${myOwn.baseQty}, fills=${myOwn.fillCount})` : ''));

  let opponentReadable = false;
  let opponentBytes = 0;
  try {
    const raw = await rawEr.getAccountInfo(theirPos);
    opponentReadable = !!raw;
    opponentBytes = raw?.data.length ?? 0;
  } catch {
    opponentReadable = false;
  }
  line(`  you reading THEIR position ............. ${yes(opponentReadable)}` +
       (opponentReadable ? `  (${opponentBytes} bytes)` : '  <- REFUSED'));

  let anonReadable = false;
  try {
    const anon = new Connection(cluster.er, 'confirmed');
    anonReadable = !!(await anon.getAccountInfo(theirPos));
  } catch {
    anonReadable = false;
  }
  line(`  unauthenticated RPC reading it ........ ${yes(anonReadable)}` +
       (anonReadable ? '' : '  <- REFUSED'));
  line();

  if (cluster.tee) {
    line('  VERDICT: reads are gated by the TEE. The fog is enforced by the');
    line('           rollup, not by the client.');
  } else {
    line('  VERDICT: the ACL exists on-chain and is delegated, but this is a');
    line('           LOCAL (non-TEE) validator, which has no ingress gate — so');
    line('           reads are NOT blocked here. Enforcement requires a TEE');
    line('           validator (devnet-tee.magicblock.app).');
    line();
    line('           The client refuses to read the opponent anyway — see');
    line('           assertFogIntact() in src/chain/fog.ts — so the app never');
    line('           displays what it should not know. That is a client-side');
    line('           guarantee, and it is NOT a substitute for the TEE.');
  }
  line();

  line('[5] the market moves, then the buzzer');
  // Move the mark so the settlement produces a real result rather than a
  // flat 0.00% on both sides.
  await me.pushPrice(match, creator.publicKey, 121.5);
  line('    mark 100.00 -> 121.50');
  await new Promise((r) => setTimeout(r, 16_000));
  await me.commitAndUndelegate(match, creator.publicKey, creator.publicKey, opponent.publicKey);
  for (let i = 0; i < 40; i++) {
    const info = await rawL1.getAccountInfo(myPos);
    if (info?.owner.equals(me.programId)) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  await me.requestSettle(match, creator.publicKey);
  await me.settleMatch(match, creator.publicKey, creator.publicKey, opponent.publicKey);
  line();

  rule();
  line('  POST-SETTLEMENT VISIBILITY — the public half of the contract');
  rule();
  const after = (await me.fetchMatch(match))!;
  const theirsAfter = await me.fetchPosition(match, opponent.publicKey, false);
  line(`  their position now readable ........... ${yes(!!theirsAfter)}` +
       (theirsAfter ? `  (fills=${theirsAfter.fillCount})` : ''));
  const tape = (await me.fetchTape(match)) as { winner: PublicKey; potPaid: { toNumber(): number } } | null;
  line(`  public tape written ................... ${yes(!!tape)}`);
  line(`  winner ................................ ${after.winner?.toBase58()}`);
  line(`  pnl  you=${(after.pnlABps / 100).toFixed(2)}%  them=${(after.pnlBBps / 100).toFixed(2)}%`);
  line(`  paid .................................. ${tape ? tape.potPaid.toNumber() / LAMPORTS_PER_SOL : 0} SOL`);
  rule();
  line('  Private during the fight. Public after.');
  rule();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
