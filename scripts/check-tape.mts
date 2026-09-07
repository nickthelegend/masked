/**
 * The tape replay, checked against the chain that produced it.
 *
 * `replayEquity` reconstructs a player's round from the fill list on their
 * settled tape. It is only worth anything if it lands where the program landed
 * — so this reads every real settled tape on the cluster and asserts, for both
 * players of every one, that the last replayed point equals the `pnl_*_bps`
 * the program wrote. There is no fixture here: if the cluster has no settled
 * duels the check says so and fails, rather than passing on nothing.
 */
import { Connection } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../src/chain/idl';
import { ACTIVE_CLUSTER } from '../src/chain/config';
import { toTapeState, replayEquity, markFromFill, type TapeFill } from '../src/chain/tape';

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
  const connection = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
  const provider = new AnchorProvider(connection, readOnly as never, { commitment: 'confirmed' });
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const program = new Program(FOGDUEL_IDL as Idl, provider) as any;

  const rawTapes = await program.account.tape.all();
  if (rawTapes.length === 0) {
    fail('no settled tapes on the cluster — nothing real to check the replay against');
  }

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const tapes = rawTapes.map((t: any) => toTapeState(t.account));

  // The entry is not on the tape, so it comes from the match the tape names.
  let withFills = 0;
  for (const tape of tapes) {
    const matchAcc = await program.account.match
      .fetchNullable(tape.match)
      .catch(() => null);
    if (!matchAcc) continue;
    const entry = matchAcc.entry.toNumber();
    ok(entry > 0, `match ${tape.match.toBase58()} has a zero entry`);

    for (const [who, fills, chainBps] of [
      ['A', tape.fillsA, tape.pnlABps],
      ['B', tape.fillsB, tape.pnlBBps],
    ] as const) {
      const points = replayEquity(fills, entry);
      const last = points[points.length - 1];

      if (fills.length === 0) {
        ok(
          last.bps === 0 && chainBps === 0,
          `${tape.match.toBase58().slice(0, 8)} ${who}: no fills but the chain recorded ${chainBps} bps`
        );
        continue;
      }
      withFills += 1;

      // A settled position is entirely quote, so the replay's final equity is
      // exactly the quote balance the program divided to get its bps.
      const closed = fills[fills.length - 1].side === 'settle';
      if (closed) {
        ok(
          Math.abs(last.base) < 1,
          `${tape.match.toBase58().slice(0, 8)} ${who}: closed out but the replay still holds ${last.base} base`
        );
      }

      // One bps of tolerance: the program truncates integer division at each
      // step and the replay carries doubles, so the two can disagree in the
      // last unit without disagreeing about anything real.
      ok(
        Math.abs(last.bps - chainBps) <= 1,
        `${tape.match.toBase58().slice(0, 8)} ${who}: replay ${last.bps} bps vs chain ${chainBps} bps`
      );

      // Points are in time order and start flat at the entry.
      ok(points[0].bps === 0, `${who}: the replay does not start at the entry`);
      for (let i = 1; i < points.length; i += 1) {
        ok(points[i].ts >= points[i - 1].ts, `${who}: point ${i} goes backwards in time`);
        ok(Number.isFinite(points[i].equity), `${who}: point ${i} is not a finite equity`);
      }

      // Every recovered mark must be a sane price on the right side of its
      // execution: a buy pays above the mark, a sell receives below it.
      for (const f of fills as TapeFill[]) {
        const mark = markFromFill(f, entry);
        ok(mark > 0 && Number.isFinite(mark), `${who}: recovered a non-price mark ${mark}`);
        if (f.side === 'buy') {
          ok(f.px >= mark, `${who}: a buy executed at ${f.px} below its mark ${mark}`);
        } else {
          ok(f.px <= mark, `${who}: a sell executed at ${f.px} above its mark ${mark}`);
        }
      }
    }
  }

  ok(withFills > 0, 'every tape on the cluster is fill-less — the replay was never exercised');

  console.log(
    `tape ok — ${checks} assertions over ${tapes.length} real tape(s), ` +
      `${withFills} fill list(s) replayed to the chain's own bps`
  );
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
