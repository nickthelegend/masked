/**
 * Does MagicBlock's VRF actually decide the market?
 *
 * Requests a draw over three real markets, then waits for the oracle to call
 * back. The point is what `chosen` is *not*: it is not written by this script,
 * not by the opener, and not by any player. It arrives in a transaction signed
 * by the VRF program's identity, and `settle_market_draw` refuses it from
 * anybody else.
 *
 *   npm run check:vrf
 */
import { Keypair, PublicKey, SystemProgram, SYSVAR_SLOT_HASHES_PUBKEY, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import nacl from 'tweetnacl';
import { Connection } from '@solana/web3.js';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { CLUSTERS, FOGDUEL_PROGRAM_ID } from '../src/chain/config';
import { fetchMemeMarkets } from '../src/chain/markets';

/** From ephemeral-vrf-sdk consts. */
const VRF_PROGRAM_ID = new PublicKey('Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz');
const DEFAULT_TEST_QUEUE = new PublicKey('GKE6d7iv8kCBrsxr78W3xVdjGLLLJnxsGiuzrsZCGEvb');

const load = (p: string) => Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(p, 'utf8'))));

async function main() {
  const cluster = CLUSTERS.local;
  const kp = load(`${process.env.HOME}/.config/solana/id.json`);
  const conn = new Connection(cluster.l1, 'confirmed');
  const wallet = {
    publicKey: kp.publicKey,
    signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
    signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
  };
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const program = new Program(FOGDUEL_IDL as Idl, new AnchorProvider(conn, wallet as never, { commitment: 'confirmed' })) as any;

  const markets = (await fetchMemeMarkets(6)).slice(0, 3);
  if (markets.length < 3) throw new Error('need three live markets to draw between');
  console.log('candidates:');
  for (const m of markets) console.log(`   ${m.symbol.padEnd(10)} ${m.mint.slice(0, 8)}…  px=${m.startPx}`);

  const drawId = Math.floor(Date.now() / 1000);
  const [draw] = PublicKey.findProgramAddressSync(
    [Buffer.from('draw'), kp.publicKey.toBuffer(), new BN(drawId).toArrayLike(Buffer, 'le', 8)],
    FOGDUEL_PROGRAM_ID
  );
  const [programIdentity] = PublicKey.findProgramAddressSync([Buffer.from('identity')], FOGDUEL_PROGRAM_ID);

  const pad = (s: string, n: number) => {
    const b = Buffer.alloc(n);
    Buffer.from(s.slice(0, n), 'utf8').copy(b);
    return [...b];
  };
  const candidates = markets.map((m) => ({
    mint: new PublicKey(m.mint),
    symbol: pad(m.symbol, 12),
    marketType: m.kind === 'meme' ? { meme: {} } : { major: {} },
    startPx: new BN(m.startPx),
  }));

  const queue = process.env.VRF_QUEUE ? new PublicKey(process.env.VRF_QUEUE) : DEFAULT_TEST_QUEUE;
  console.log(`\nrequesting a draw on queue ${queue.toBase58().slice(0, 8)}…`);

  const sig = await program.methods
    .requestMarketDraw(new BN(drawId), candidates, [...nacl.randomBytes(32)])
    .accounts({
      payer: kp.publicKey,
      draw,
      oracleQueue: queue,
      programIdentity,
      vrfProgram: VRF_PROGRAM_ID,
      slotHashes: SYSVAR_SLOT_HASHES_PUBKEY,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
  console.log(`   request landed: ${sig.slice(0, 24)}…`);

  process.stdout.write('waiting for the oracle');
  for (let i = 0; i < 40; i += 1) {
    const d = await program.account.marketDraw.fetch(draw);
    if (d.chosen >= 0) {
      const w = d.candidates[d.chosen];
      const symbol = Buffer.from(w.symbol).toString('utf8').replace(/\0+$/, '');
      console.log('\n');
      console.log(`   chosen index : ${d.chosen}`);
      console.log(`   market       : ${symbol}  ${new PublicKey(w.mint).toBase58().slice(0, 8)}…`);
      console.log(`   randomness   : ${Buffer.from(d.randomness).toString('hex').slice(0, 32)}…`);
      console.log(`   settled after: ${d.fulfilledTs.toNumber() - d.requestedTs.toNumber()}s`);
      console.log('\nVRF OK — the market was chosen on chain by the oracle, not by the client.');
      return;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1500));
  }
  // Honest failure. The request is on chain and correct; what is missing is an
  // oracle registered on this queue.
  console.log('\n');
  console.log('   request        : on chain, accepted by the VRF program');
  console.log('   fulfilment     : none');
  console.log('');
  console.log('BLOCKED — the request path works and the VRF program accepted it. No');
  console.log('          oracle answered, because the queues this validator preloads');
  console.log('          were dumped from devnet and list devnet oracle identities we');
  console.log('          do not hold the keys for. Registering our own needs the VRF');
  console.log('          program\'s modify_oracles / initialize_oracle_queue, whose');
  console.log('          instruction encoding is not in the published SDK — only the');
  console.log('          request builders are.');
  console.log('');
  console.log('          The program side is real and stays in the tree:');
  console.log('          request_market_draw builds the request with the official SDK');
  console.log('          and signs it with the program identity, and');
  console.log('          settle_market_draw is guarded by #[vrf_callback] so only the');
  console.log('          VRF program can write the result. Nothing simulates a draw,');
  console.log('          and no UI is built on top of one that cannot resolve.');
  process.exit(1);
}

main().catch((e) => {
  console.error('\nFAIL —', e instanceof Error ? e.message : e);
  process.exit(1);
});
