/**
 * What is on chain right now.
 *
 * A one-line answer to "where did that round get to", which during testing is
 * the question asked most often: match status, whether each position is still
 * delegated, and whether a tape was written.
 *
 *   npm run state
 */
import { Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';

const c = new Connection(CLUSTERS.local.l1, 'confirmed');
const wallet = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};
/* eslint-disable @typescript-eslint/no-explicit-any */
const p = new Program(FOGDUEL_IDL as Idl, new AnchorProvider(c, wallet as never, { commitment: 'confirmed' })) as any;

const all = await p.account.match.all();
const unfinished = all
  .filter((m: any) => !['settled', 'cancelled'].includes(Object.keys(m.account.status)[0]))
  .sort((a: any, b: any) => b.account.createdTs.toNumber() - a.account.createdTs.toNumber());

console.log(`${all.length} matches, ${unfinished.length} unfinished`);
for (const m of unfinished.slice(0, 5)) {
  const status = Object.keys(m.account.status)[0];
  const owners: string[] = [];
  for (const o of [m.account.creator, m.account.joiner].filter(Boolean)) {
    const info = await c.getAccountInfo(positionPda(m.publicKey, o));
    owners.push(!info ? 'absent' : info.owner.equals(DELEGATION_PROGRAM_ID) ? 'DELEGATED' : 'home');
  }
  const age = Math.floor(Date.now() / 1000) - m.account.createdTs.toNumber();
  console.log(
    `  ${m.publicKey.toBase58().slice(0, 8)}… ${status.padEnd(9)} ` +
    `positions=[${owners.join(', ')}] opened ${age}s ago`
  );
}
