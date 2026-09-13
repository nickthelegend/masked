// Fixtures for one refusal test on an isolated validator: the three oracle accounts as they are on
// devnet, with timestamps moved to "now" so they pass freshness, and Switchboard's SOL/USD moved 3%
// away from Pyth's so the program's agreement check is the one that must refuse.
import { readFileSync, writeFileSync } from 'node:fs';
const now = Math.floor(Date.now() / 1000) + 25;
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const save = (f, j, b) => { j.account.data[0] = b.toString('base64'); j.account.rentEpoch = 0; writeFileSync(f, JSON.stringify(j)); };
let pythSol1e18;
for (const f of ['pyth-sol.json', 'pyth-usdc.json']) {
  const j = load(f); const b = Buffer.from(j.account.data[0], 'base64');
  if (b[40] !== 1) throw new Error(`${f} not Full`);
  b.writeBigInt64LE(BigInt(now), 41 + 52);
  if (f === 'pyth-sol.json') { const price = b.readBigInt64LE(41 + 32); const expo = b.readInt32LE(41 + 48); pythSol1e18 = price * 10n ** BigInt(18 + expo); }
  save(f, j, b);
}
const j = load('sb.json'); const b = Buffer.from(j.account.data[0], 'base64');
const off = (pythSol1e18 * 103n) / 100n;
b.writeBigUInt64LE(off & ((1n << 64n) - 1n), 2264); b.writeBigInt64LE(off >> 64n, 2272);
b.writeBigInt64LE(BigInt(now), 2216);
save('sb.json', j, b);
console.log(`fixtures: publish/update time ${now}; Pyth SOL/USD ${Number(pythSol1e18) / 1e18}; Switchboard set to ${Number(off) / 1e18} (+3%)`);
