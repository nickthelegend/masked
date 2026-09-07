/**
 * Proves what a duel's *markets* are, as distinct from its positions.
 *
 * The arcade board shows the opponent's ticker while a round is live, and
 * fogs only their PnL and their side. That is either correct or it is a
 * privacy leak in a privacy product, and the difference is a question about
 * the chain, not about the UI: is a leg readable by a stranger?
 *
 * So this reads a live match the way a stranger would — a bare RPC connection
 * to the base layer, no wallet, no gate, no session token, nothing signed —
 * and asserts that both legs come back, while the same stranger is refused
 * both positions. If the first assertion ever fails, the board is showing
 * something the chain keeps and the display must go. If the second ever
 * passes, the fog is gone and a great deal more than the board is wrong.
 *
 *   npm run check:legs
 */
import assert from 'node:assert/strict';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';

/* eslint-disable @typescript-eslint/no-explicit-any */

const anonymous = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

/** Fixed-length on-chain strings are null-padded. */
const decodeFixed = (raw: unknown): string =>
  Buffer.from(raw as number[])
    .toString('utf8')
    .replace(/\0+$/, '')
    .trim();

const l1 = new Connection(CLUSTERS.local.l1, 'confirmed');
const program = new Program(
  FOGDUEL_IDL as Idl,
  new AnchorProvider(l1, anonymous as never, { commitment: 'confirmed' })
) as any;

let checks = 0;

const all = await program.account.match.all();
// A joined round: two legs exist only once somebody has taken the other side.
const joined = all.filter((m: any) => m.account.joiner);
assert.ok(joined.length > 0, 'need at least one joined match on chain to check');

// Prefer one that is still running — that is the state the claim is about.
const now = Math.floor(Date.now() / 1000);
const live = joined.filter(
  (m: any) => Object.keys(m.account.status)[0] === 'live' &&
    now < m.account.startTs.toNumber() + m.account.duration
);
const subject = live[0] ?? joined.sort(
  (a: any, b: any) => b.account.createdTs.toNumber() - a.account.createdTs.toNumber()
)[0];

const running = live.length > 0;
const m = subject.account;
console.log(
  `match ${subject.publicKey.toBase58().slice(0, 8)}… ` +
  `${Object.keys(m.status)[0]}${running ? ' — running, the state the claim is about' : ' — not running'}`
);

/* ---- what a stranger can read: both markets ---- */

for (const [side, leg] of [['A', m.legA], ['B', m.legB]] as const) {
  assert.ok(leg, `leg ${side} must exist on a joined match`);
  const mint = new PublicKey(leg.mint);
  const symbol = decodeFixed(leg.symbol);
  assert.ok(mint.toBase58().length === 44 || mint.toBase58().length === 43, 'leg mint must be a real key');
  assert.ok(symbol.length > 0, `leg ${side} must carry a ticker`);
  assert.ok(leg.startPx.toString() !== '0', `leg ${side} must carry a start price`);
  console.log(`  leg ${side}: ${symbol.padEnd(8)} ${mint.toBase58().slice(0, 12)}…  start ${leg.startPx}`);
  checks += 4;
}

console.log('  → both tickers served to an unauthenticated reader from the base layer.');
console.log('    Showing the opponent\'s market on the board reveals nothing the');
console.log('    chain is keeping. It is written by create_match and join_match.');

/* ---- what the same stranger cannot read: either position ---- */

let refused = 0;
for (const owner of [m.creator, m.joiner].filter(Boolean)) {
  const pda = positionPda(subject.publicKey, owner);
  const info = await l1.getAccountInfo(pda);
  if (!info) {
    console.log(`  position ${owner.toBase58().slice(0, 8)}…: absent from the base layer`);
    refused += 1;
    checks += 1;
    continue;
  }
  const delegated = info.owner.equals(DELEGATION_PROGRAM_ID);
  if (running) {
    // A live position is delegated: the base layer holds a husk the
    // delegation program owns, and the live value is on the rollup behind
    // the ACL. Either way this reader is not being told the position.
    assert.ok(delegated, 'a live position must be delegated away from the program');
    refused += 1;
    checks += 1;
    console.log(`  position ${owner.toBase58().slice(0, 8)}…: DELEGATED — value lives on the rollup, behind the ACL`);
  } else {
    console.log(`  position ${owner.toBase58().slice(0, 8)}…: ${delegated ? 'delegated' : 'settled home'}`);
    checks += 1;
  }
}

if (running) {
  assert.equal(refused, 2, 'both positions must be unreadable while the round runs');
  checks += 1;
}

console.log(
  `\nlegs ok — ${checks} assertions: both markets public to an anonymous reader, ` +
  `${running ? 'both positions delegated behind the ACL' : 'round already settled so positions are home'}`
);
