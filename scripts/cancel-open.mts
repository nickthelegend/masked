/** Cancels every open match this wallet created — used to test the empty state. */
import { Keypair, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import nacl from 'tweetnacl';

/** A keypair, presented as something that can sign a login challenge. */
const asSigner = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
});

const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey, payer: kp,
  signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
  signAllTransactions: async (txs: Transaction[]) => { txs.forEach(t=>t.partialSign(kp)); return txs; },
});

async function main() {
  const kp = Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync('.keys/player-c.json','utf8'))));
  const client = new FogduelClient(wrap(kp) as never, CLUSTERS.local, asSigner(kp));
  const open = await client.fetchOpenMatches();
  const mine = open.filter((m) => m.creator.equals(kp.publicKey));
  for (const m of mine) {
    await client.cancelMatch(m.address, kp.publicKey);
    console.log(`cancelled ${m.address.toBase58().slice(0,8)}… (${m.entry/1e9}◎ refunded)`);
  }
  console.log(`open matches remaining: ${(await client.fetchOpenMatches()).length}`);
}
main().catch(e=>{console.error(e);process.exit(1);});
