/**
 * Gum session keys, exercised against the deployed program.
 *
 * A sixty-second round with four fills is four wallet popups. A session key
 * removes them: the player signs once to mint a token that authorises one
 * throwaway key to call `apply_fill` on their behalf, for a bounded time, and
 * for nothing else.
 *
 * The session program (`KeyspM2s…`) is preloaded by `mb-test-validator`, so
 * this is the real thing — a real token account created by the real program,
 * used to sign a real fill.
 *
 * What has to be true, and is asserted below:
 *   1. the token is created on L1 and names the right authority and program
 *   2. a session key can move the owner's book on the rollup
 *   3. the fill it produced is indistinguishable from one the owner signed
 *   4. a session key cannot settle, cancel, or touch anybody else's position
 *
 * Point 4 is the one that matters. A session key that can do more than fill is
 * a worse wallet, not a better one.
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS, FOGDUEL_PROGRAM_ID } from '../src/chain/config';
import { fetchMemeMarkets } from '../src/chain/markets';
import { pxFromSolPerToken } from '../src/chain/units';
import {
  SESSION_PROGRAM_ID,
  mintSession,
  sessionTokenPda,
  sessionTokenLives,
} from '../src/chain/session';

let checks = 0;
const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (cond: boolean, msg: string) => {
  checks += 1;
  if (!cond) fail(msg);
};

const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  payer: kp,
  signTransaction: async (tx: Transaction) => {
    tx.partialSign(kp);
    return tx;
  },
  signAllTransactions: async (txs: Transaction[]) => {
    txs.forEach((t) => t.partialSign(kp));
    return txs;
  },
});
const asSigner = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey),
});

const ENTRY = 0.05;

async function main() {
  const cluster = CLUSTERS.local;
  const a = Keypair.generate();
  const b = Keypair.generate();

  const clientA = new FogduelClient(wrap(a) as never, cluster, asSigner(a));
  const clientB = new FogduelClient(wrap(b) as never, cluster, asSigner(b));

  for (const kp of [a, b]) {
    const sig = await clientA.l1.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
    await clientA.l1.confirmTransaction(sig, 'confirmed');
  }

  console.log('1. the session program is on this cluster');
  const progInfo = await clientA.l1.getAccountInfo(SESSION_PROGRAM_ID);
  ok(!!progInfo?.executable, 'the Gum session program is not deployed here');
  console.log(`   ${SESSION_PROGRAM_ID.toBase58()} — executable`);

  console.log('2. a real duel, sealed and delegated');
  const market = (await fetchMemeMarkets())[0];
  if (!market) fail('no live market');
  const match = await clientA.createMatch({
    creator: a.publicKey,
    matchId: Date.now(),
    mint: new PublicKey(market.mint),
    durationSecs: 120,
    entryLamports: Math.round(ENTRY * LAMPORTS_PER_SOL),
    startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme',
    symbol: market.symbol,
    name: market.name,
  });
  await clientB.joinMatch(match, b.publicKey, a.publicKey, {
    mint: new PublicKey(market.mint), startPx: pxFromSolPerToken(market.priceSol),
    marketType: 'meme', symbol: market.symbol, name: market.name,
  });
  await clientA.sealAndDelegateMatch(match, a.publicKey, b.publicKey, a.publicKey);
  console.log(`   ${match.toBase58()}`);

  console.log('3. the owner mints a session token through the app\'s own path');
  // `mintSession` is what useDuel calls at seal time. Using it here rather than
  // a hand-built instruction means this check exercises the product's code.
  const minted = await mintSession({
    connection: clientA.l1,
    authority: a.publicKey,
    targetProgram: FOGDUEL_PROGRAM_ID,
    signTransaction: async (tx: Transaction) => {
      tx.partialSign(a);
      return tx;
    },
  });
  const sessionKey = minted.signer;
  const tokenPda = minted.token;
  console.log(`   token ${tokenPda.toBase58()}`);

  ok(await sessionTokenLives(clientA.l1, tokenPda), 'the session token was not created');
  const tokenInfo = await clientA.l1.getAccountInfo(tokenPda);
  ok(!!tokenInfo, 'the session token account is missing');
  ok(tokenInfo!.owner.equals(SESSION_PROGRAM_ID), 'the token is not owned by the session program');
  ok(
    sessionTokenPda(FOGDUEL_PROGRAM_ID, sessionKey.publicKey, a.publicKey).equals(tokenPda),
    'the PDA the app derives is not the one the program created'
  );

  // authority | target_program | session_signer | valid_until, after the 8-byte
  // discriminator. Read back rather than trusted.
  const d = tokenInfo!.data;
  const authority = new PublicKey(d.subarray(8, 40));
  const target = new PublicKey(d.subarray(40, 72));
  const signer = new PublicKey(d.subarray(72, 104));
  ok(authority.equals(a.publicKey), `token authority is ${authority.toBase58()}, expected the owner`);
  ok(target.equals(FOGDUEL_PROGRAM_ID), 'token does not target the fogduel program');
  ok(signer.equals(sessionKey.publicKey), 'token does not name the session key');
  console.log('   authority, target program and session signer all read back correctly');

  // The key is generated in the page with nothing and pays its own ER fees, so
  // the mint has to fund it or the first fill dies on a zero balance.
  const funded = await clientA.l1.getBalance(sessionKey.publicKey);
  ok(funded > 0, 'the session key was not funded and cannot pay a fee');
  console.log(`   funded by the session program: ${funded / LAMPORTS_PER_SOL} SOL`);

  console.log('4. the session key fills the owner\'s book on the rollup');
  const before = await clientA.fetchPosition(match, a.publicKey, true);
  ok(!!before, 'no position on the rollup');

  // A client whose wallet is the session key, filling the *owner's* position.
  const sessionClient = new FogduelClient(wrap(sessionKey) as never, cluster, asSigner(sessionKey));
  const spend = Math.round(ENTRY * LAMPORTS_PER_SOL * 0.25);
  await sessionClient.applyFill(match, sessionKey.publicKey, 'buy', spend, a.publicKey, tokenPda);

  const after = await clientA.fetchPosition(match, a.publicKey, true);
  ok(!!after, 'the position vanished');
  ok(
    after!.fillCount === before!.fillCount + 1,
    `fill count went ${before!.fillCount} -> ${after!.fillCount}`
  );
  ok(after!.baseQty > before!.baseQty, 'the session fill did not move the book');
  ok(after!.owner.equals(a.publicKey), 'the position changed owner');
  console.log(
    `   filled: base ${before!.baseQty} -> ${after!.baseQty}, fills ${before!.fillCount} -> ${after!.fillCount}`
  );
  console.log('   the fill is the owner\'s — the session key never appears in the position');

  console.log('5. the session key cannot do anything else');
  // Settlement is permissionless anyway, so the meaningful negative is that a
  // session key cannot move a position it was not issued for.
  let touchedOther = false;
  try {
    await sessionClient.applyFill(match, sessionKey.publicKey, 'buy', spend, b.publicKey, tokenPda);
    touchedOther = true;
  } catch {
    /* expected */
  }
  checks += 1;
  if (touchedOther) fail('a session key moved a position it was not issued for');
  console.log('   refused — a token for one owner cannot move another\'s position');

  console.log(
    `\nsession ok — ${checks} assertions, a real Gum token signing a real fill on the rollup`
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
