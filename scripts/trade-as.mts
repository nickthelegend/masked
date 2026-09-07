/**
 * Trade a live match as the second wallet.
 *
 * The app is 1v1 and only one side of a duel can be driven through the UI, so
 * verifying anything that shows *both* players — the reveal timeline above all
 * — needs the other side to really trade. This signs real fills on the rollup
 * as player B, exactly as their client would.
 *
 *   npm run trade -- <match-pubkey> [buy|sell] [fraction-of-entry]
 */
import { Keypair, PublicKey, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';

const matchArg = process.argv[2];
const side = (process.argv[3] ?? 'buy') as 'buy' | 'sell';
const fraction = Number(process.argv[4] ?? 0.25);
const keyfile = process.env.MASKED_KEYFILE ?? '.keys/player-b.json';

if (!matchArg) {
  console.error('usage: npm run trade -- <match-pubkey> [buy|sell] [fraction]');
  process.exit(1);
}

const load = (p: string) => Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));
const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey, payer: kp,
  signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
  signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
});
const asSigner = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
});

async function main() {
  const kp = load(keyfile);
  const client = new FogduelClient(wrap(kp) as never, CLUSTERS.local, asSigner(kp));
  const match = new PublicKey(matchArg);

  const m = await client.fetchMatch(match);
  if (!m) throw new Error('no such match');

  const pos = await client.fetchPosition(match, kp.publicKey, true);
  if (!pos) throw new Error('no position on the rollup for this wallet');

  // A buy spends quote; a sell delivers base. Same convention as the UI.
  const amount = side === 'buy' ? Math.floor(m.entry * fraction) : Math.floor(pos.baseQty * fraction);
  if (amount <= 0) throw new Error(`nothing to ${side}`);

  const sig = await client.applyFill(match, kp.publicKey, side, amount);
  const after = await client.fetchPosition(match, kp.publicKey, true);
  console.log(`${side} ${amount} — sig ${sig.slice(0, 16)}… fills=${after?.fillCount} base=${after?.baseQty}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
