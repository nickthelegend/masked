/** Opens N unjoined matches so the book has something in it for a demo. */
import { Keypair, LAMPORTS_PER_SOL, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { fetchMajorMarkets, fetchMemeMarkets } from '../src/chain/markets';
import nacl from 'tweetnacl';

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

async function main() {
  const count = Number(process.argv[2] ?? 3);
  const kp = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync('.keys/player-c.json', 'utf8')))
  );
  const client = new FogduelClient(wrap(kp) as never, CLUSTERS.local, asSigner(kp));

  const bal = await client.l1.getBalance(kp.publicKey);
  if (bal < 2 * LAMPORTS_PER_SOL) {
    const sig = await client.l1.requestAirdrop(kp.publicKey, 4 * LAMPORTS_PER_SOL);
    await client.l1.confirmTransaction(sig, 'confirmed');
  }

  // Real markets, so the book reads like a book somebody is actually using
  // rather than three rows of the same placeholder ticker.
  const markets = [...(await fetchMemeMarkets(6)), ...(await fetchMajorMarkets())];
  if (markets.length === 0) throw new Error('no live markets — cannot open a book');

  const stakes = [0.05, 0.1, 0.25];
  for (let i = 0; i < count; i += 1) {
    const entry = Math.round(stakes[i % stakes.length] * LAMPORTS_PER_SOL);
    const matchId = Math.floor(Date.now() / 1000) * 1000 + 700 + i;
    const market = markets[i % markets.length];
    const m = await client.createMatch({
      creator: kp.publicKey, matchId, mint: new PublicKey(market.mint),
      durationSecs: 120, entryLamports: entry, startPx: market.startPx,
      marketType: market.kind, symbol: market.symbol, name: market.name,
    });
    console.log(
      `opened ${m.toBase58().slice(0, 8)}… ${market.symbol} at ${entry / LAMPORTS_PER_SOL}◎`
    );
  }

  const open = await client.fetchOpenMatches();
  console.log(`book now has ${open.length} open match(es)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
