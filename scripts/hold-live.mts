/**
 * Open a real sealed duel and hold it live.
 *
 * /proof probes the rollup's read gate against a position that is delegated
 * *right now*, and the seeded history is all settled — those positions have
 * come home and are readable by design. This creates one real match, seals it
 * the way the product does, trades on it, and then leaves it running so the
 * gate can be seen refusing something.
 *
 *   npm run hold -- 600        # seconds, default 300
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { fetchMemeMarkets } from '../src/chain/markets';
import { pxFromSolPerToken } from '../src/chain/units';
import { positionPda } from '../src/chain/pdas';

const DURATION = Math.max(60, Math.min(3600, Number(process.argv[2] ?? 300)));

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
  const cluster = CLUSTERS.local;
  const creator = load(`${process.env.HOME}/.config/solana/id.json`);
  const joiner = load('.keys/player-b.json');
  const me = new FogduelClient(wrap(creator) as never, cluster, asSigner(creator));
  const them = new FogduelClient(wrap(joiner) as never, cluster, asSigner(joiner));
  await me.ensureTreasury(creator.publicKey);

  const market = (await fetchMemeMarkets(1))[0];
  const entry = Math.round(0.05 * LAMPORTS_PER_SOL);
  const matchId = Math.floor(Date.now() / 1000) * 10 + 3;

  console.log(`opening a ${DURATION}s duel on ${market.symbol}`);
  const match = await me.createMatch({
    creator: creator.publicKey, matchId, mint: new PublicKey(market.mint),
    durationSecs: DURATION, entryLamports: entry, startPx: market.startPx,
    marketType: market.kind, symbol: market.symbol, name: market.name,
  });
  await them.joinMatch(match, joiner.publicKey, creator.publicKey, {
    mint: new PublicKey(market.mint), startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme', symbol: market.symbol, name: market.name,
  });
  await me.sealAndDelegateMatch(match, creator.publicKey, joiner.publicKey, creator.publicKey);
  await me.applyFill(match, creator.publicKey, 'buy', Math.floor(entry * 0.4));
  await them.applyFill(match, joiner.publicKey, 'buy', Math.floor(entry * 0.25));

  console.log(`match      ${match.toBase58()}`);
  console.log(`creator pos ${positionPda(match, creator.publicKey).toBase58()}`);
  console.log(`joiner  pos ${positionPda(match, joiner.publicKey).toBase58()}`);
  console.log(`sealed and live for ${DURATION}s — /proof can probe the gate now`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
