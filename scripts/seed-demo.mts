/**
 * Seeds the local cluster with real settled matches so the feed, leaderboard
 * and landing stats have something true to show.
 *
 * Every match here is a genuine on-chain duel — created, joined, delegated,
 * traded on the rollup, committed back and settled. Nothing is inserted
 * directly into an account; there is no fixture layer.
 *
 *   npm run seed -- 6
 */
import { Keypair, LAMPORTS_PER_SOL, PublicKey, type Transaction } from '@solana/web3.js';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';

const COUNT = Number(process.argv[2] ?? 5);
const cluster = process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;

const wrap = (kp: Keypair) => ({
  publicKey: kp.publicKey,
  payer: kp,
  signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
  signAllTransactions: async (txs: Transaction[]) => { txs.forEach((t) => t.partialSign(kp)); return txs; },
});

const loadOrCreate = (path: string): Keypair => {
  if (existsSync(path)) return Keypair.fromSecretKey(new Uint8Array(JSON.parse(readFileSync(path, 'utf8'))));
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify([...kp.secretKey]));
  return kp;
};

/** A cast of wallets, so the board has more than two rows. */
const ROSTER = ['player-b', 'player-c', 'player-d', 'player-e'];

async function main() {
  const house = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(readFileSync(`${process.env.HOME}/.config/solana/id.json`, 'utf8')))
  );
  const houseClient = new FogduelClient(wrap(house) as never, cluster);
  await houseClient.ensureTreasury(house.publicKey);

  const players = ROSTER.map((n) => loadOrCreate(`.keys/${n}.json`));
  for (const p of players) {
    const bal = await houseClient.l1.getBalance(p.publicKey);
    if (bal < 2 * LAMPORTS_PER_SOL) {
      const sig = await houseClient.l1.requestAirdrop(p.publicKey, 4 * LAMPORTS_PER_SOL);
      await houseClient.l1.confirmTransaction(sig, 'confirmed');
    }
  }
  console.log(`funded ${players.length} demo wallets`);

  // Varied stakes and outcomes so the feed does not look copy-pasted.
  const stakes = [0.05, 0.1, 0.25, 0.1, 0.5, 0.05];
  const moves = [118, 92, 131, 104, 77, 122];

  for (let i = 0; i < COUNT; i += 1) {
    const opponent = players[i % players.length];
    const oppClient = new FogduelClient(wrap(opponent) as never, cluster);
    const entry = Math.round((stakes[i % stakes.length]) * LAMPORTS_PER_SOL);
    const matchId = Math.floor(Date.now() / 1000) * 1000 + 900 + i;

    process.stdout.write(`  match ${i + 1}/${COUNT} … `);
    const match = await houseClient.createMatch({
      creator: house.publicKey, matchId, mint: PublicKey.default,
      // Long enough to absorb four delegation round trips before the first
      // fill — at 10s the clock expired mid-seed.
      durationSecs: 30, entryLamports: entry, startPrice: 100,
    });
    await oppClient.joinMatch(match, opponent.publicKey, house.publicKey);

    await houseClient.delegatePosition(match, house.publicKey, house.publicKey);
    await houseClient.delegatePosition(match, opponent.publicKey, house.publicKey);

    // Both sides trade, with different conviction, so PnL differs.
    await houseClient.applyFill(match, house.publicKey, 'buy', 0.45);
    await oppClient.applyFill(match, opponent.publicKey, 'buy', 0.2 + (i % 3) * 0.1);

    await houseClient.pushPrice(match, house.publicKey, moves[i % moves.length]);
    await new Promise((r) => setTimeout(r, 31_000));

    await houseClient.commitAndUndelegate(match, house.publicKey, house.publicKey, opponent.publicKey);
    for (let t = 0; t < 40; t += 1) {
      const m = await houseClient.fetchMatch(match);
      const info = await houseClient.l1.getAccountInfo(
        (await import('../src/chain/pdas')).positionPda(match, house.publicKey)
      );
      if (info?.owner.equals(houseClient.programId)) break;
      void m;
      await new Promise((r) => setTimeout(r, 1000));
    }

    await houseClient.requestSettle(match, house.publicKey);
    await houseClient.settleMatch(match, house.publicKey, house.publicKey, opponent.publicKey);

    const settled = (await houseClient.fetchMatch(match))!;
    console.log(
      `settled  ${(settled.pnlABps / 100).toFixed(2)}% vs ${(settled.pnlBBps / 100).toFixed(2)}%  ` +
      `winner ${settled.winner!.toBase58().slice(0, 6)}…`
    );
  }

  const tapes = await houseClient.fetchAllTapes();
  const board = await houseClient.fetchAllStats();
  console.log(`\nseeded. ${tapes.length} tapes on chain, ${board.length} players on the board.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
