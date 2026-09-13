/**
 * Settled duels as a public read API: `GET /api/tapes` and `/api/tapes/<match>`.
 *
 * A `Tape` is written by `settle_match` and is world-readable on chain, so
 * this adds no access anybody lacked. It adds a URL: a judge, a bot or a
 * share card can read a duel without an RPC client, an IDL or the program's
 * arithmetic.
 *
 * Nothing here is re-implemented. The IDL, the account decoding and the equity
 * replay are the app's own modules (`src/chain/*`), bundled into
 * `server/tapes.bundle.mjs` by `npm run build:server`, so the API and the
 * screens cannot disagree about what a tape says.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { FOGDUEL_IDL } from '../../src/chain/idl';
import { tapePda } from '../../src/chain/pdas';
import { replayEquity, tapeWindowNote, toTapeState, type TapeFill, type TapeStart, type TapeState } from '../../src/chain/tape';

/* eslint-disable @typescript-eslint/no-explicit-any -- Anchor's account namespace is untyped. */

/** The base layer the program is deployed on. MagicBlock's devnet RPC by default. */
export const L1_URL = process.env.TAPES_L1_URL ?? 'https://rpc.magicblock.app/devnet';
export const PROGRAM_ID = FOGDUEL_IDL.address;
/** Named on the share card, so a devnet duel never passes for a mainnet one. */
export const CLUSTER_LABEL = /devnet/.test(L1_URL) ? 'DEVNET' : /mainnet/.test(L1_URL) ? 'MAINNET' : 'LOCALNET';

export { renderTapeCard, sharePageHtml } from './og';

const readOnlyWallet = {
  publicKey: null,
  signTransaction: async <T>(t: T) => t,
  signAllTransactions: async <T>(t: T[]) => t,
};

let program: any = null;
const getProgram = () => {
  if (!program) {
    const connection = new Connection(L1_URL, 'confirmed');
    const provider = new AnchorProvider(connection, readOnlyWallet as never, { commitment: 'confirmed' });
    program = new Program(FOGDUEL_IDL as Idl, provider);
  }
  return program;
};

const b58 = (k: PublicKey) => k.toBase58();

/** One side of a duel, as the tape holds it. */
function side(
  player: PublicKey,
  leg: TapeState['legA'],
  pnlBps: number,
  liquidated: boolean,
  fills: TapeFill[],
  start: TapeStart | null,
  fillCount: number,
  entry: number | null,
  startTs: number | undefined,
  detail: boolean
) {
  const base = {
    player: b58(player),
    market: { mint: b58(leg.mint), symbol: leg.symbol },
    pnlBps,
    liquidated,
    fillCount,
    fillsStored: fills.length,
    windowNote: tapeWindowNote(fills.length, fillCount),
  };
  if (!detail) return base;
  return {
    ...base,
    fills,
    windowStart: start,
    // The replay needs the entry, which lives on the Match. A match that has
    // been closed out takes it with it, and the curve is then left out rather
    // than drawn from a guess.
    equity:
      entry === null
        ? null
        : replayEquity(fills, entry, startTs, start).map((p) => ({ ts: p.ts, equity: p.equity, bps: p.bps })),
  };
}

/** `round` is the Match's start and length, when the match account still exists. */
function shape(t: TapeState, entry: number | null, detail: boolean, round?: { startTs: number; duration: number }) {
  return {
    match: b58(t.match),
    winner: b58(t.winner),
    potPaid: t.potPaid,
    rake: t.rake,
    settledTs: t.settledTs,
    entry,
    ...(detail ? { startTs: round?.startTs ?? null, duration: round?.duration ?? null } : {}),
    // The round's start stamps each curve's opening point. Without it a side
    // that never traded opened at unix time zero, and a chart drawn across both
    // sides squashed the other one against its right edge.
    a: side(t.playerA, t.legA, t.pnlABps, t.liquidatedA, t.fillsA, t.startA, t.fillCountA, entry, round?.startTs, detail),
    b: side(t.playerB, t.legB, t.pnlBBps, t.liquidatedB, t.fillsB, t.startB, t.fillCountB, entry, round?.startTs, detail),
  };
}

/** Every settled duel on the program, newest first. */
export async function listTapes() {
  const p = getProgram();
  const [tapes, matches] = (await Promise.all([p.account.tape.all(), p.account.match.all()])) as [any[], any[]];
  const entryOf = new Map<string, number>(matches.map((m) => [m.publicKey.toBase58(), m.account.entry.toNumber()]));
  const rows = tapes
    .map((t) => {
      const s = toTapeState(t.account);
      return shape(s, entryOf.get(s.match.toBase58()) ?? null, false);
    })
    .sort((x, y) => y.settledTs - x.settledTs);
  return { cluster: L1_URL, programId: PROGRAM_ID, count: rows.length, tapes: rows };
}

/** Thrown for input that is not a match address, so the route can answer 400. */
export class BadMatch extends Error {}

/** One duel in full — fills, window snapshot and replayed equity — or null if none settled there. */
export async function getTape(matchParam: string) {
  let match: PublicKey;
  try {
    match = new PublicKey(matchParam);
  } catch {
    throw new BadMatch(`${matchParam.slice(0, 64)} is not a base58 address`);
  }
  const p = getProgram();
  const raw = await p.account.tape.fetchNullable(tapePda(match));
  if (!raw) return null;
  // Only a tape's own match is asked for, so this is a Match or nothing. It
  // can be nothing: a match closed out after settling takes its entry with it.
  const m = await p.account.match.fetchNullable(match);
  const s = toTapeState(raw);
  return {
    cluster: L1_URL,
    programId: PROGRAM_ID,
    tapeAccount: b58(tapePda(match)),
    tape: shape(
      s,
      m ? m.entry.toNumber() : null,
      true,
      m ? { startTs: m.startTs.toNumber(), duration: m.duration.toNumber() } : undefined
    ),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
