/**
 * The head-to-head count, checked against a full scan.
 *
 * `fetchHeadToHead` asks the RPC for tapes by `memcmp` at two byte offsets
 * into the account. Hardcoded offsets are exactly the sort of thing that is
 * silently wrong — a filter that matches nothing returns an empty list, not an
 * error, so a broken offset looks like "these two have never played".
 *
 * So this derives the offsets from a real account by searching for the pubkeys
 * the decoder already found, asserts they are the constants the hook uses, and
 * then checks every pairing on the cluster: the filtered query must return
 * exactly what filtering the full set client-side returns.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { ACTIVE_CLUSTER } from '../src/chain/config';
import { toTapeState } from '../src/chain/tape';
import {
  fetchHeadToHead,
  describeRecord,
  TAPE_PLAYER_A_OFFSET,
  TAPE_PLAYER_B_OFFSET,
} from '../src/chain/useHeadToHead';

let checks = 0;
const fail = (msg: string): never => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (cond: boolean, msg: string) => {
  checks += 1;
  if (!cond) fail(msg);
};

const readOnly = {
  publicKey: null,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

async function main() {
  const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
  const provider = new AnchorProvider(l1, readOnly as never, { commitment: 'confirmed' });
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

  const raw = await program.account.tape.all();
  if (raw.length === 0) fail('no settled tapes — nothing to count');

  // 1. The offsets are what the account actually says they are.
  const sample = raw[0];
  const info = await l1.getAccountInfo(sample.publicKey);
  if (!info) fail('could not read a tape account raw');
  const data = info!.data;
  const aAt = data.indexOf(sample.account.playerA.toBuffer());
  const bAt = data.indexOf(sample.account.playerB.toBuffer());
  ok(aAt === TAPE_PLAYER_A_OFFSET, `player_a is at ${aAt}, the hook filters at ${TAPE_PLAYER_A_OFFSET}`);
  ok(bAt === TAPE_PLAYER_B_OFFSET, `player_b is at ${bAt}, the hook filters at ${TAPE_PLAYER_B_OFFSET}`);

  const tapes = raw.map((t: any) => toTapeState(t.account));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  type Tape = (typeof tapes)[number];

  // 2. Every distinct pairing counts the same filtered as it does scanned.
  const pairs = new Map<string, [PublicKey, PublicKey]>();
  for (const t of tapes) {
    const [x, y] = [t.playerA.toBase58(), t.playerB.toBase58()].sort();
    pairs.set(`${x}|${y}`, [new PublicKey(x), new PublicKey(y)]);
  }
  ok(pairs.size > 0, 'no pairings found on any tape');

  for (const [me, them] of pairs.values()) {
    const scanned = tapes.filter(
      (t: Tape) =>
        (t.playerA.equals(me) && t.playerB.equals(them)) ||
        (t.playerA.equals(them) && t.playerB.equals(me))
    );
    const record = await fetchHeadToHead(me, them, l1);

    ok(
      record.played === scanned.length,
      `${me.toBase58().slice(0, 6)} v ${them.toBase58().slice(0, 6)}: filtered ${record.played}, scanned ${scanned.length}`
    );
    ok(
      record.mine + record.theirs === record.played,
      'a settled duel was won by neither player'
    );
    const scannedMine = scanned.filter((t: Tape) => t.winner.equals(me)).length;
    ok(record.mine === scannedMine, 'the filtered win count disagrees with the scan');
    ok(describeRecord(record) !== null, 'a real record described as nothing');
  }

  // 3. A pairing that has never met reads as never having met, not as an error.
  const stranger = PublicKey.unique();
  const none = await fetchHeadToHead(tapes[0].playerA, stranger, l1);
  ok(none.played === 0, 'two wallets that never met returned a record');
  ok(describeRecord(none) === 'FIRST MEETING', 'an empty record did not say so');

  console.log(
    `h2h ok — ${checks} assertions, offsets derived from a real account, ` +
      `${pairs.size} pairing(s) agreeing filtered vs scanned across ${tapes.length} tapes`
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
