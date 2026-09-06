/** Proves the preflight guards catch what they claim to. */
import assert from 'node:assert/strict';
import { PublicKey } from '@solana/web3.js';
import { checkWallet, checkBalance, checkCluster, checkProgram, firstFailure, HEADROOM_LAMPORTS } from '../src/chain/preflight';
import { CLUSTERS, FOGDUEL_PROGRAM_ID } from '../src/chain/config';
import { orbStateForPnl } from '../src/ui/orbState';

let n = 0;

assert.equal(checkWallet(null).ok, false); n++;
assert.equal(checkWallet(null).title, 'CONNECT A WALLET'); n++;
assert.equal(checkWallet(PublicKey.default).ok, true); n++;

const stake = 0.1 * 1e9;
assert.equal(checkBalance(stake + HEADROOM_LAMPORTS, stake).ok, true, 'exactly enough passes'); n++;
assert.equal(checkBalance(stake, stake).ok, false, 'stake without headroom fails'); n++;
assert.match(checkBalance(0, stake).detail!, /Need ~0\.12 SOL/); n++;

// A live cluster passes; a dead one fails with the right message.
const live = await checkCluster(CLUSTERS.local);
assert.equal(live.ok, true, 'local validator is reachable'); n++;
const dead = await checkCluster({ ...CLUSTERS.local, l1: 'http://127.0.0.1:1' });
assert.equal(dead.ok, false); n++;
assert.equal(dead.title, 'CANNOT REACH THE CLUSTER'); n++;

// The real program is deployed; a random address is not.
assert.equal((await checkProgram(FOGDUEL_PROGRAM_ID, CLUSTERS.local)).ok, true, 'fogduel is deployed'); n++;
assert.equal((await checkProgram(PublicKey.unique(), CLUSTERS.local)).ok, false); n++;

assert.equal(firstFailure({ ok: true }, { ok: false, title: 'X' }, { ok: false, title: 'Y' }).title, 'X'); n++;

// Orb state mapping.
assert.equal(orbStateForPnl(4.2), 'up'); n++;
assert.equal(orbStateForPnl(-4.2), 'down'); n++;
assert.equal(orbStateForPnl(0.1), 'live', 'a flat band avoids flicker around zero'); n++;

console.log(`preflight ok — ${n} assertions, checked against the live cluster`);
