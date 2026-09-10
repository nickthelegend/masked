import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { CLUSTERS } from '../src/chain/config';
/* eslint-disable @typescript-eslint/no-explicit-any */
const me = new PublicKey('3hkwYJ9AxAn4iQaJvMojMbrKhU9VeP6xiChdd8PKUdh5');
const c = new Connection(CLUSTERS.local.l1, 'confirmed');
const w = { publicKey: null, signTransaction: async <T,>(t: T) => t, signAllTransactions: async <T,>(t: T[]) => t };
const p = new Program(FOGDUEL_IDL as Idl, new AnchorProvider(c, w as never, { commitment: 'confirmed' })) as any;
const now = Math.floor(Date.now()/1000);
const all = await p.account.match.all();
const mine = all.filter((m:any)=>m.account.creator.equals(me) || (m.account.joiner && m.account.joiner.equals(me)));
mine.sort((a:any,b:any)=>b.account.startTs.toNumber()-a.account.startTs.toNumber());
for (const m of mine.slice(0,3)) {
  const a=m.account; const left=a.duration-(now-a.startTs.toNumber());
  console.log(`${m.publicKey.toBase58().slice(0,10)} status=${Object.keys(a.status)[0]} left=${left}s`);
}
