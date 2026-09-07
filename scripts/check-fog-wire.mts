/**
 * Does the app ever ask the rollup for the opponent's position?
 *
 * `check:fog` proves the client's guard refuses to *use* opponent state, and
 * `check:gate` proves the rollup would refuse to serve it. This is the third
 * leg: what the app actually puts on the wire. It cannot be observed from
 * inside the page — the RPC client captures `fetch` when it loads, before any
 * spy can wrap it — so the app is pointed at server/rpc-recorder.mjs and this
 * reads what that recorded.
 *
 *   npm run check:fog:wire -- <match> <mine> <theirs> [log]
 */
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { positionPda } from '../src/chain/pdas';

const [matchArg, mineArg, theirsArg, logArg = '.localnet/rpc-er.log'] = process.argv.slice(2);
if (!matchArg || !mineArg || !theirsArg) {
  console.error('usage: npm run check:fog:wire -- <match> <mine> <theirs> [log]');
  process.exit(1);
}

const match = new PublicKey(matchArg);
const mine = positionPda(match, new PublicKey(mineArg)).toBase58();
const theirs = positionPda(match, new PublicKey(theirsArg)).toBase58();

const lines = readFileSync(logArg, 'utf8').trim().split('\n').filter(Boolean);
const calls = lines.map((l) => JSON.parse(l) as { m: string; keys: string[] });

const asked = (key: string) => calls.filter((c) => c.keys.includes(key));
const mineCalls = asked(mine);
const theirsCalls = asked(theirs);

console.log(`recorded ${calls.length} rollup calls`);
console.log(`  your position   ${mine.slice(0, 8)}…  asked for ${mineCalls.length} time(s)`);
console.log(`  their position  ${theirs.slice(0, 8)}…  asked for ${theirsCalls.length} time(s)`);

const byMethod = new Map<string, number>();
for (const c of calls) byMethod.set(c.m, (byMethod.get(c.m) ?? 0) + 1);
console.log('  methods:', [...byMethod].map(([m, n]) => `${m}x${n}`).join(', '));

if (mineCalls.length === 0) {
  console.log('\nINCONCLUSIVE — the app never asked for your position either, so');
  console.log('               this log does not cover a live round.');
  process.exit(1);
}
if (theirsCalls.length > 0) {
  console.log('\nFAIL — the app asked the rollup for the opponent\'s position:');
  for (const c of theirsCalls.slice(0, 5)) console.log(`   ${c.m}`);
  process.exit(1);
}
console.log('\nFOG WIRE OK — the app read its own position and never asked for');
console.log('              the opponent\'s, on the wire, during a live round.');
