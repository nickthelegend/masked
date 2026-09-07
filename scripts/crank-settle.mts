/**
 * Settle every match whose clock has run out.
 *
 * Settlement is driven by the players' own clients, which is fine right up
 * until somebody closes their tab at 0:03 — then both entries sit in the vault
 * and nobody can reach them. The program was built for this: `request_settle`
 * and `settle_match` are permissionless, and `commit_and_undelegate` can be
 * sent by anyone holding the rollup's token. So a stuck pot is not a protocol
 * problem, it is a missing crank.
 *
 * Run it once, or on a timer beside the validator.
 *
 *   npm run crank
 */
import { Keypair, LAMPORTS_PER_SOL, type Transaction } from '@solana/web3.js';
import { readFileSync } from 'node:fs';
import nacl from 'tweetnacl';
import { FogduelClient } from '../src/chain/client';
import { CLUSTERS } from '../src/chain/config';

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
  const cranker = load(`${process.env.HOME}/.config/solana/id.json`);
  const client = new FogduelClient(wrap(cranker) as never, CLUSTERS.local, asSigner(cranker));

  const expired = (await client.fetchExpiredMatches()).filter((m) => m.joiner);
  if (expired.length === 0) {
    console.log('nothing to settle');
    return;
  }
  console.log(`${expired.length} match(es) past the buzzer`);

  for (const m of expired) {
    const label = m.address.toBase58().slice(0, 8);
    try {
      await client.commitAndUndelegate(m.address, cranker.publicKey, m.creator, m.joiner!);
      if (!(await client.waitForUndelegation(m.address, m.creator, m.joiner!))) {
        console.log(`  ${label}… positions did not come home in time — leaving it`);
        continue;
      }
      if (m.status === 'live') await client.requestSettle(m.address, cranker.publicKey);
      await client.settleMatch(m.address, cranker.publicKey, m.creator, m.joiner!);
      const after = (await client.fetchMatch(m.address))!;
      console.log(
        `  ${label}… settled — winner ${after.winner?.toBase58().slice(0, 6)}… ` +
        `pot ${after.pot / LAMPORTS_PER_SOL}◎`
      );
    } catch (e) {
      console.log(`  ${label}… failed: ${e instanceof Error ? e.message.slice(0, 90) : e}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
