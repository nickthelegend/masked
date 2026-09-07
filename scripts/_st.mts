import { Connection, PublicKey } from '@solana/web3.js';
import { CLUSTERS, DELEGATION_PROGRAM_ID } from '../src/chain/config';
import { positionPda } from '../src/chain/pdas';
const l1 = new Connection(CLUSTERS.local.l1, 'confirmed');
const m = new PublicKey(process.argv[2]);
const creator = new PublicKey(process.argv[3]);
const joiner = new PublicKey(process.argv[4]);
for (const [n, k] of [['creator', creator], ['joiner', joiner]] as const) {
  const info = await l1.getAccountInfo(positionPda(m, k));
  console.log(n.padEnd(8), info ? info.owner.toBase58() : 'ABSENT',
    info?.owner.equals(DELEGATION_PROGRAM_ID) ? '(DELEGATED)' : '(home)');
}
