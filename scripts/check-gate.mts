/**
 * What exactly does the rollup's public front door enforce?
 *
 * "The opponent's position is unreadable" is the product's entire claim, so it
 * is worth knowing whether the gate is checking the permission program or just
 * refusing everything it does not recognise. The difference matters: a door
 * that is shut for everyone is not access control, and it would fall open the
 * moment the app needed a legitimate read.
 *
 * So this runs two matches side by side:
 *
 *   A — delegated, WITH an ACLseo… permission (what the product does)
 *   B — delegated, with NO permission at all
 *
 * and reads both through the public front. If A is refused and B is readable,
 * the gate is the permission. If both are refused, it is not.
 *
 *   npm run check:gate
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { authenticate, authorizedUsers } from '../src/chain/erAuth';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { DEMO_MINT } from '../src/chain/market';
import { positionPda } from '../src/chain/pdas';
import { pxFromSolPerToken } from '../src/chain/units';

const cluster = CLUSTERS.local;
if (!cluster.erRaw) throw new Error('this check compares the front door with the validator behind it');

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

const ENTRY = 0.05 * LAMPORTS_PER_SOL;
const line = (s = '') => console.log(s);

/** null = the endpoint answered "no such account". */
async function read(c: Connection, k: PublicKey): Promise<number | null> {
  const info = await c.getAccountInfo(k).catch(() => null);
  return info ? info.data.length : null;
}

async function main() {
  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const opponent = load('.keys/player-b.json');
  const me = new FogduelClient(wrap(creator) as never, cluster, asSigner(creator));
  const them = new FogduelClient(wrap(opponent) as never, cluster, asSigner(opponent));
  const raw = new Connection(cluster.erRaw!, 'confirmed');
  const front = new Connection(cluster.er, 'confirmed');
  const l1 = new Connection(cluster.l1, 'confirmed');

  if ((await l1.getBalance(opponent.publicKey)) < LAMPORTS_PER_SOL) {
    const sig = await l1.requestAirdrop(opponent.publicKey, 3 * LAMPORTS_PER_SOL);
    await l1.confirmTransaction(sig, 'confirmed');
  }
  await me.ensureTreasury(creator.publicKey);

  const open = async (id: number, symbol: string) => {
    const match = await me.createMatch({
      creator: creator.publicKey, matchId: id, mint: DEMO_MINT,
      durationSecs: 120, entryLamports: ENTRY, startPx: pxFromSolPerToken(0.1),
      marketType: 'meme', symbol, name: symbol,
    });
    await them.joinMatch(match, opponent.publicKey, creator.publicKey, {
      mint: DEMO_MINT, startPx: pxFromSolPerToken(0.1),
      marketType: 'meme', symbol, name: symbol,
    });
    return match;
  };

  const base = Math.floor(Date.now() / 1000) * 1000;
  line('opening two matches');
  const withPerm = await open(base + 1, 'GATED');
  const noPerm = await open(base + 2, 'BARE');

  line('A — sealing (permission + delegate), exactly as the product does');
  await me.sealAndDelegateMatch(withPerm, creator.publicKey, opponent.publicKey, creator.publicKey);

  line('B — delegating the positions only, with no permission');
  for (const owner of [creator.publicKey, opponent.publicKey]) {
    await me.delegatePosition(noPerm, owner, creator.publicKey);
  }
  line();

  const rows: [string, PublicKey][] = [
    ['A  sealed   creator position', positionPda(withPerm, creator.publicKey)],
    ['A  sealed   joiner  position', positionPda(withPerm, opponent.publicKey)],
    ['B  bare     creator position', positionPda(noPerm, creator.publicKey)],
    ['B  bare     joiner  position', positionPda(noPerm, opponent.publicKey)],
  ];

  line(`${'account'.padEnd(30)} ${'validator :7799'.padEnd(18)} public :6699`);
  line('─'.repeat(66));
  const visibleAtFront: boolean[] = [];
  for (const [label, key] of rows) {
    const onRaw = await read(raw, key);
    const onFront = await read(front, key);
    visibleAtFront.push(onFront !== null);
    line(
      `${label.padEnd(30)} ${(onRaw === null ? 'absent' : `${onRaw} bytes`).padEnd(18)} ` +
      `${onFront === null ? 'REFUSED' : `${onFront} bytes`}`
    );
  }
  line();

  const [sealedA, sealedB, bareA, bareB] = visibleAtFront;
  const sealedHidden = !sealedA && !sealedB;
  const bareServed = bareA || bareB;

  if (!(sealedHidden && bareServed)) {
    if (sealedHidden) {
      line('VERDICT: the front door refuses every delegated account, permission or');
      line('         not. Sealed positions are unreadable through it — which is');
      line('         what the product needs — but this is not proof that the ACL');
      line('         is being read. Do not describe it as one.');
      process.exit(0);
    }
    line('VERDICT: a sealed position was READABLE through the public front door.');
    line('         The privacy claim does not hold here. Fix before demoing.');
    process.exit(1);
  }

  line('the front door enforces the permission program: a sealed position is');
  line('refused, the same account shape without a permission is served.');
  line();

  // A door that is shut for everyone is not access control either. The other
  // half of the claim is that the owner — and only the owner — gets in.
  line('signing in as each player, and seeing what the token opens');
  const mineKey = positionPda(withPerm, creator.publicKey);
  const theirsKey = positionPda(withPerm, opponent.publicKey);

  for (const [who, kp] of [['creator', creator], ['joiner ', opponent]] as const) {
    const token = await authenticate(cluster.er, asSigner(kp));
    const authed = new Connection(cluster.er, {
      commitment: 'confirmed',
      httpHeaders: { Authorization: `Bearer ${token}` },
    });
    const own = await read(authed, who.trim() === 'creator' ? mineKey : theirsKey);
    const other = await read(authed, who.trim() === 'creator' ? theirsKey : mineKey);
    line(
      `  ${who} token: own position ${own === null ? 'REFUSED' : `${own} bytes`}` +
      `   opponent position ${other === null ? 'REFUSED' : `${other} bytes`}`
    );
    if (own === null) {
      line('\nFAIL — an authenticated owner cannot read their own position.');
      process.exit(1);
    }
    if (other !== null) {
      line('\nFAIL — an authenticated player can read their OPPONENT.');
      line('       That is the whole product. Do not demo this.');
      process.exit(1);
    }
  }
  line();

  const acl = await authorizedUsers(cluster.er, mineKey.toBase58());
  line(`the permission program lists ${acl ? acl.length : 0} authorised reader(s) for the`);
  line(`creator's position: ${acl?.map((a) => `${a.slice(0, 8)}…`).join(', ') || '(none reported)'}`);
  line();

  line('VERDICT: reads are gated by the on-chain ACL. The owner gets in with a');
  line('         signed token; the opponent does not, with or without one.');
  if (!cluster.tee) {
    line();
    line('         This gate is a process we run. It enforces the ACL — that is');
    line('         what the table above shows — but a judge has only our word');
    line('         that the process is the one we say it is. A TEE validator is');
    line('         what turns that into something attestable.');
  }
}

main().catch((e) => {
  console.error('\nFAIL —', e instanceof Error ? e.message : e);
  process.exit(1);
});
