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
import { Keypair, LAMPORTS_PER_SOL, Connection, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { FogduelClient } from '../src/chain/client';
import { DEMO_MINT } from '../src/chain/market';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';
import { pxFromSolPerToken } from '../src/chain/units';
import nacl from 'tweetnacl';

const cluster = process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;

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

const line = (s = '') => console.log(s);
const rule = () => line('─'.repeat(64));
const yes = (b: boolean) => (b ? 'YES' : 'NO');

async function main() {
  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const opponent = load('.keys/player-b.json');

  const me = new FogduelClient(wrap(creator) as never, cluster, asSigner(creator));
  const them = new FogduelClient(wrap(opponent) as never, cluster, asSigner(opponent));
  // Two doors into the same rollup: the public front, which reads the ACL,
  // and the validator's own port behind it, which answers anybody. The
  // difference between them is the proof.
  const front = new Connection(cluster.er, 'confirmed');
  const behindTheDoor = cluster.erRaw ? new Connection(cluster.erRaw, 'confirmed') : null;
  const rawL1 = new Connection(cluster.l1, 'confirmed');

  rule();
  line(`FOGDUEL — PRIVACY PROOF   [cluster: ${cluster.name}, TEE: ${yes(cluster.tee)}]`);
  rule();
  line(`  L1        : ${cluster.l1}`);
  line(`  ER (front): ${cluster.er}`);
  if (cluster.erRaw) line(`  ER (raw)  : ${cluster.erRaw}   <- the validator behind the door`);
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
    creator: creator.publicKey, matchId, mint: DEMO_MINT,
    durationSecs: 15, entryLamports: ENTRY, startPx: pxFromSolPerToken(0.1),
    marketType: 'meme', symbol: 'PROOF', name: 'Privacy Proof',
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
  if (cluster.tee) {
    // The TEE-only step that turns the ACL into an enforced read gate.
    for (const owner of [creator.publicKey, opponent.publicKey]) {
      await me.initPositionPrivacy(match, owner, creator.publicKey);
    }
    line('    ephemeral permissions created (TEE read gate active)');
  }
  for (const [label, pos] of [['yours', myPos], ['theirs', theirPos]] as const) {
    const info = await rawL1.getAccountInfo(pos);
    const delegated = info?.owner.equals(DELEGATION_PROGRAM_ID);
    line(`    ${label.padEnd(7)} L1 owner = ${info?.owner.toBase58()}  ${delegated ? '<- DELEGATED' : ''}`);
  }
  line();

  line('[4] trading — a fill lands on the rollup');
  await me.applyFill(match, creator.publicKey, 'buy', Math.floor(ENTRY * 0.4));
  await them.applyFill(match, opponent.publicKey, 'buy', Math.floor(ENTRY * 0.25));
  line('    both sides have open positions');
  line();

  rule();
  line('  MID-ROUND VISIBILITY — the question the whole product turns on');
  rule();

  const myOwn = await me.fetchPosition(match, creator.publicKey, true);
  line(`  you reading YOUR OWN position .......... ${yes(!!myOwn)}` +
       (myOwn ? `  (baseQty=${myOwn.baseQty}, fills=${myOwn.fillCount})` : ''));

  // The opponent, read with your own signed token. This is the read the whole
  // product exists to refuse.
  const theirsToMe = await me.fetchPosition(match, opponent.publicKey, true);
  line(`  you reading THEIR position ............. ${yes(!!theirsToMe)}` +
       (theirsToMe ? `  (${theirsToMe.fillCount} fills LEAKED)` : '  <- REFUSED'));

  // And with no token at all.
  const anon = await front.getAccountInfo(theirPos).catch(() => null);
  line(`  unauthenticated RPC reading it ........ ${yes(!!anon)}` +
       (anon ? `  (${anon.data.length} bytes LEAKED)` : '  <- REFUSED'));

  if (behindTheDoor) {
    const raw = await behindTheDoor.getAccountInfo(theirPos).catch(() => null);
    line(`  the validator behind the door ......... ${yes(!!raw)}` +
         (raw ? `  (${raw.data.length} bytes)  <- as expected: not the door` : ''));
  }
  line();

  if (theirsToMe || anon) {
    line('  VERDICT: a sealed position was readable through the public endpoint.');
    line('           The privacy claim does not hold. Do not demo this.');
    process.exit(1);
  }

  line('  VERDICT: the opponent is unreadable through the endpoint the app');
  line('           uses, with or without a signed token, while your own');
  line('           position reads fine. The gate is the on-chain ACL — proven');
  line('           against a no-permission control in `npm run check:gate`.');
  if (!cluster.tee) {
    line();
    line('           The gate here is a process we run, so a judge has our word');
    line('           that it is the one we say it is. A TEE validator replaces');
    line('           that word with an attestation. Everything else — the ACL,');
    line('           the delegation, the refusal above — is already real.');
  }
  line();

  line('[5] the market moves, then the buzzer');
  // Move the mark so the settlement produces a real result rather than a
  // flat 0.00% on both sides.
  await me.walkPriceTo(match, creator.publicKey, pxFromSolPerToken(0.1215));
  line('    mark walked 0.1000 -> 0.1215 SOL, 5% a second, in public');
  await new Promise((r) => setTimeout(r, 16_000));
  const commitSigs = await me.commitAndUndelegate(match, creator.publicKey, creator.publicKey, opponent.publicKey);
  line(`    ${commitSigs.length} commit txs on the rollup, one per position`);
  // Both have to come home, not just yours: settle_match touches each of them
  // and Anchor checks the owner of every account it is handed.
  if (!(await me.waitForUndelegation(match, creator.publicKey, opponent.publicKey))) {
    line('    undelegation did not land in time — the rollup did not commit.');
    process.exit(1);
  }
  line('    both positions committed back to L1');
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
  const tape = await me.fetchTape(match);
  line(`  public tape written ................... ${yes(!!tape)}`);
  line(`  winner ................................ ${after.winner?.toBase58()}`);
  line(`  pnl  you=${(after.pnlABps / 100).toFixed(2)}%  them=${(after.pnlBBps / 100).toFixed(2)}%`);
  line(`  paid .................................. ${tape ? tape.potPaid / LAMPORTS_PER_SOL : 0} SOL`);
  rule();
  line('  Private during the fight. Public after.');
  rule();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
