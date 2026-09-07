/**
 * Join somebody else's open match, as a second wallet.
 *
 * The app is 1v1, so testing it end to end needs a second player. This takes
 * the newest open match created by a given pubkey and joins it for real —
 * signed, escrowed, on chain — which is what makes the creator's client seal
 * the positions and start the round.
 *
 *   npm run join -- <creator-pubkey> [keyfile]
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { fetchMemeMarkets } from '../src/chain/markets';
import { pxFromSolPerToken } from '../src/chain/units';

const creatorArg = process.argv[2];
const keyfile = process.argv[3] ?? '.keys/player-b.json';
if (!creatorArg) {
  console.error('usage: npm run join -- <creator-pubkey> [keyfile]');
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
  const cluster = CLUSTERS.local;
  const joiner = load(keyfile);
  const client = new FogduelClient(wrap(joiner) as never, cluster, asSigner(joiner));
  const creator = new PublicKey(creatorArg);

  if ((await client.l1.getBalance(joiner.publicKey)) < 0.5 * LAMPORTS_PER_SOL) {
    const sig = await client.l1.requestAirdrop(joiner.publicKey, 3 * LAMPORTS_PER_SOL);
    await client.l1.confirmTransaction(sig, 'confirmed');
  }

  const open = await client.fetchOpenMatches();
  const mine = open
    .filter((m) => m.creator.equals(creator))
    .sort((a, b) => b.createdTs - a.createdTs)[0];
  if (!mine) {
    console.error(`no open match by ${creator.toBase58()}`);
    process.exit(1);
  }

  // Bring my own market. The creator's is `legA`; mine becomes `legB`, and
  // the two no longer have to agree.
  const market = (await fetchMemeMarkets(1))[0];
  if (!market) {
    console.error('no live market to join with');
    process.exit(1);
  }
  console.log(
    `joining ${mine.address.toBase58()} — they have ${mine.legA.symbol}, ` +
      `I bring ${market.symbol}, at ${mine.entry / LAMPORTS_PER_SOL}◎`
  );
  await client.joinMatch(mine.address, joiner.publicKey, creator, {
    mint: new PublicKey(market.mint),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  const after = (await client.fetchMatch(mine.address))!;
  console.log(`status=${after.status} pot=${after.pot / LAMPORTS_PER_SOL}◎ joiner=${after.joiner?.toBase58()}`);
  console.log('the creator\'s client should now seal both positions and start the round');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
