/** Ground truth straight from the RPC, to check the UI against. */
import { Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { CLUSTERS } from '../src/chain/config';

const w = { publicKey: null, signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t };

async function main() {
  const conn = new Connection(CLUSTERS.local.l1, 'confirmed');
  const provider = new AnchorProvider(conn, w as never, { commitment: 'confirmed' });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const p = new Program(FOGDUEL_IDL as Idl, provider) as any;

  const [matches, tapes, stats] = await Promise.all([
    p.account.match.all(), p.account.tape.all(), p.account.playerStats.all(),
  ]);
  const open = matches.filter((m: any) => Object.keys(m.account.status)[0] === 'open');
  const paid = tapes.reduce((s: number, t: any) => s + t.account.potPaid.toNumber(), 0) / 1e9;

  console.log(JSON.stringify({
    openMatches: open.length,
    openStakes: open.map((m: any) => m.account.entry.toNumber() / 1e9).sort(),
    tapes: tapes.length,
    paidOutSol: Number(paid.toFixed(3)),
    players: stats.length,
    board: stats
      .map((s: any) => ({
        owner: s.account.owner.toBase58().slice(0, 4) + '…' + s.account.owner.toBase58().slice(-4),
        wins: s.account.wins, losses: s.account.losses,
        taken: Number((s.account.taken.toNumber() / 1e9).toFixed(3)),
        streak: s.account.streak, best: s.account.bestStreak,
      }))
      .sort((a: any, b: any) => b.taken - a.taken),
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
