/**
 * The on-chain half of scripts/check-oracles-disagree.sh: against the isolated validator that script
 * starts, open a USDC/SOL round and expect push_price_pyth to be refused with OraclesDisagree.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { USDC_MINT, WSOL_MINT } from '../src/chain/jupiter';
import { pushPricePyth, readPriceUpdate, pxFromUsdPair, PYTH_MAJORS, SOL_USD_PRICE_UPDATE } from '../src/chain/pyth';
const l1 = new Connection(CLUSTERS.local.l1, 'confirmed');
const wrap = (kp: Keypair) => ({ publicKey: kp.publicKey, payer: kp, signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; }, signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; } });
const signer = (kp: Keypair) => ({ publicKey: kp.publicKey, signMessage: async (m: Uint8Array) => nacl.sign.detached(m, kp.secretKey) });
const a = Keypair.generate(); const b = Keypair.generate();
for (const kp of [a, b]) { const sig = await l1.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL); await l1.confirmTransaction(sig, 'confirmed'); }
console.log(`isolated validator ${CLUSTERS.local.l1}; players funded`);
const me = new FogduelClient(wrap(a) as never, CLUSTERS.local, signer(a));
const them = new FogduelClient(wrap(b) as never, CLUSTERS.local, signer(b));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const program: any = new Program(FOGDUEL_IDL as Idl, new AnchorProvider(l1, wrap(a) as never, { commitment: 'confirmed' }));
await me.ensureTreasury(a.publicKey);
const usdc = await readPriceUpdate(l1, PYTH_MAJORS[USDC_MINT].priceUpdate); const sol = await readPriceUpdate(l1, SOL_USD_PRICE_UPDATE);
const matchId = Math.floor(Date.now() / 1000);
const match = await me.createMatch({ creator: a.publicKey, matchId, mint: new PublicKey(USDC_MINT), durationSecs: 120, entryLamports: 0.01 * LAMPORTS_PER_SOL, startPx: pxFromUsdPair(usdc, sol), marketType: 'major', symbol: 'USDC', name: 'USD Coin' });
await them.joinMatch(match, b.publicKey, a.publicKey, { mint: new PublicKey(WSOL_MINT), startPx: 1_000_000_000_000_000n, marketType: 'major', symbol: 'SOL', name: 'Solana' });
console.log(`match ${match.toBase58()} live`);
await new Promise((r) => setTimeout(r, 1500));
try {
  await pushPricePyth(program, { authority: a.publicKey, match, owner: a.publicKey, mint: USDC_MINT });
  console.log('FAIL: push_price_pyth was ALLOWED with Switchboard 3% away from Pyth');
  process.exit(1);
} catch (e) {
  const text = [e instanceof Error ? e.message : String(e), ...((e as { logs?: string[] }).logs ?? [])].join('\n');
  const code = text.match(/Error Code: (\w+)/)?.[1] ?? text.slice(0, 200);
  console.log(`push_price_pyth refused on chain: ${code}`);
  if (code !== 'OraclesDisagree') process.exit(1);
  console.log('ORACLES-DISAGREE OK');
}
