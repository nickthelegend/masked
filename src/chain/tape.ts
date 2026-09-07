/**
 * The public tape, and what can honestly be reconstructed from it.
 *
 * `settle_match` writes a `Tape` holding both players' fill lists — up to
 * `MAX_FILLS` each of `{ side, qty, px, ts }`. That account is the public half
 * of "private during the fight, public after": it is world-readable forever,
 * and it is the only place the opponent's trading is ever legible.
 *
 * Everything in this module is derived from those fills by replaying the same
 * arithmetic the program used to produce them. Nothing here interpolates,
 * seeds a generator, or invents a shape — if a number cannot be recovered from
 * the tape it is not returned.
 */
import { PublicKey } from '@solana/web3.js';
import { BASE_SCALE, VALUE_DIV } from './units';

/** Mirrors `BOOK_DEPTH` in state.rs. Needed to undo a fill's own impact. */
export const BOOK_DEPTH = 64;
/** Mirrors `MAX_FILLS` in state.rs. */
export const MAX_FILLS = 16;

export type FillSide = 'buy' | 'sell' | 'settle' | 'liquidation';

/** One fill, exactly as the program stored it. */
export interface TapeFill {
  side: FillSide;
  /** Base filled, x BASE_SCALE. For every side — a buy records what it got,
      not what it spent, because `apply_fill` overwrites `qty` with the fill. */
  qty: number;
  /** Execution price: lamports per token x PRICE_SCALE, impact included. */
  px: number;
  /** Unix seconds, from the chain's clock. */
  ts: number;
}

/** One side's market, as the tape recorded it. */
export interface TapeLeg {
  mint: PublicKey;
  symbol: string;
}

export interface TapeState {
  match: PublicKey;
  /** The creator's market. */
  legA: TapeLeg;
  /** The joiner's. */
  legB: TapeLeg;
  /** Whether that side ended by being force-closed rather than by trading. */
  liquidatedA: boolean;
  liquidatedB: boolean;
  playerA: PublicKey;
  playerB: PublicKey;
  pnlABps: number;
  pnlBBps: number;
  winner: PublicKey;
  potPaid: number;
  rake: number;
  settledTs: number;
  fillsA: TapeFill[];
  fillsB: TapeFill[];
}

/** A zero-padded on-chain string back to a JS one. */
export const decodeFixed = (bytes: number[] | Uint8Array | undefined): string => {
  if (!bytes) return '';
  const arr = Array.from(bytes);
  const end = arr.indexOf(0);
  return new TextDecoder().decode(new Uint8Array(end === -1 ? arr : arr.slice(0, end)));
};

/* eslint-disable @typescript-eslint/no-explicit-any -- Anchor's account
   namespace is dynamically typed; every field is narrowed as it is read. */

const num = (v: any): number => (typeof v === 'number' ? v : v?.toNumber?.() ?? 0);

const toFill = (f: any): TapeFill => ({
  side: Object.keys(f.side)[0] as FillSide,
  qty: num(f.qty),
  px: num(f.px),
  ts: num(f.ts),
});

/** Decode a raw `Tape` account. */
export function toTapeState(raw: any): TapeState {
  return {
    match: raw.matchKey,
    // A leg each, because the two players brought their own markets. The tape
    // is the permanent record, and a record that named one token for a duel
    // fought over two would be wrong about half of it.
    legA: { mint: raw.legA.mint, symbol: decodeFixed(raw.legA.symbol) },
    legB: { mint: raw.legB.mint, symbol: decodeFixed(raw.legB.symbol) },
    liquidatedA: !!raw.liquidatedA,
    liquidatedB: !!raw.liquidatedB,
    playerA: raw.playerA,
    playerB: raw.playerB,
    pnlABps: num(raw.pnlABps),
    pnlBBps: num(raw.pnlBBps),
    winner: raw.winner,
    potPaid: num(raw.potPaid),
    rake: num(raw.rake),
    settledTs: num(raw.settledTs),
    fillsA: (raw.fillsA ?? []).map(toFill),
    fillsB: (raw.fillsB ?? []).map(toFill),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * The mark the book was re-pegged to, backed out of a fill.
 *
 * A recorded `px` is the *execution* price — it already carries the fill's own
 * impact, so it is not the market. But `apply_fill` re-pegs to the mark first
 * and the curve's depth is fixed at `entry * BOOK_DEPTH`, which leaves the
 * relationship invertible.
 *
 * For a buy of `value` lamports against quote reserves `Q`:
 *   base_out = base_v * value / (Q + value),  base_v = Q * VALUE_DIV / mark
 *   px       = value * VALUE_DIV / base_out
 * so px = mark * (Q + value) / Q, and the mark falls straight out.
 *
 * For a sell of `qty` base:
 *   px = Q * VALUE_DIV / (Q * VALUE_DIV / mark + qty)
 * which inverts the same way. A fill that would divide by zero — only possible
 * from a corrupt tape — returns the execution price rather than an infinity.
 */
export function markFromFill(fill: TapeFill, entry: number): number {
  const Q = entry * BOOK_DEPTH;
  if (Q <= 0 || fill.px <= 0 || fill.qty <= 0) return fill.px;
  const value = (fill.qty * fill.px) / VALUE_DIV;
  if (fill.side === 'buy') {
    if (Q + value === 0) return fill.px;
    return (fill.px * Q) / (Q + value);
  }
  const inv = (Q * VALUE_DIV) / fill.px - fill.qty;
  if (inv <= 0) return fill.px;
  return (Q * VALUE_DIV) / inv;
}

/** One moment on a player's reconstructed round. */
export interface EquityPoint {
  ts: number;
  /** Lamports held as quote. */
  quote: number;
  /** Base held, x BASE_SCALE. */
  base: number;
  /** Mark-to-market equity in lamports, at the mark behind this fill. */
  equity: number;
  /** Equity against the entry, in basis points — the chain's own measure. */
  bps: number;
  /** The fill that produced this point; null for the opening point. */
  fill: TapeFill | null;
}

/**
 * Replay a fill list into the equity curve it actually produced.
 *
 * The position starts holding the entry as quote and nothing as base, and each
 * fill moves exactly `qty * px / VALUE_DIV` lamports across — the same product
 * the program computed to derive that `px` in the first place. So this is a
 * reconstruction, not an estimate: the final point lands on the chain's own
 * `pnl_*_bps` because a settled position is all quote and no base, and
 * `pnl_bps` of an all-quote position is the same division done here.
 *
 * Between fills there is nothing. The tape samples equity when a player traded
 * and at the buzzer, and no on-chain record exists of where the mark sat in
 * between — so no point is drawn there. A curve that filled that in would be
 * telling a story the chain cannot support.
 *
 * `startTs` is when the round went live, and is what the opening point is
 * stamped with. Without it a player who never traded opened at unix epoch
 * zero, and any axis drawn across both players collapsed to its right edge.
 */
export function replayEquity(fills: TapeFill[], entry: number, startTs?: number): EquityPoint[] {
  const sorted = [...fills].sort((a, b) => a.ts - b.ts);
  const start = startTs ?? sorted[0]?.ts ?? 0;
  let quote = entry;
  let base = 0;

  const bpsOf = (equity: number) => (entry === 0 ? 0 : Math.trunc(((equity - entry) * 10_000) / entry));

  const points: EquityPoint[] = [
    { ts: start, quote, base, equity: entry, bps: 0, fill: null },
  ];

  for (const f of sorted) {
    const value = (f.qty * f.px) / VALUE_DIV;
    if (f.side === 'liquidation') {
      // The program closes the position and wipes the balance: equity is
      // exactly zero from here, whichever way the position pointed. Replaying
      // it as another sell drove the base further negative and left the curve
      // holding a position the chain had already closed.
      quote = 0;
      base = 0;
    } else if (f.side === 'settle') {
      // The buzzer closes whatever is open, so it buys a short back and sells
      // a long down. The direction comes from the position, not from the side.
      if (base > 0) {
        quote += value;
        base -= f.qty;
      } else {
        quote -= value;
        base += f.qty;
      }
    } else if (f.side === 'buy') {
      quote -= value;
      base += f.qty;
    } else {
      // A sell with nothing to sell opens a short — the base goes negative,
      // which `equity` reads correctly because it is signed.
      quote += value;
      base -= f.qty;
    }
    const mark = markFromFill(f, entry);
    const equity = quote + (base * mark) / VALUE_DIV;
    points.push({ ts: f.ts, quote, base, equity, bps: bpsOf(equity), fill: f });
  }

  return points;
}

/** Whole tokens a fill moved, for display. */
export const fillTokens = (f: TapeFill): number => f.qty / BASE_SCALE;

/** Lamports a fill moved, for display. */
export const fillValue = (f: TapeFill): number => (f.qty * f.px) / VALUE_DIV;

/**
 * What the market itself did over the round.
 *
 * The literal counterfactual — "what you would have made doing nothing" — is
 * zero: an untouched position is all quote, and quote does not move. The
 * question worth answering is the other one. A player who lost 0.4% while the
 * token fell 6% traded well; the scoreboard alone cannot say that.
 *
 * One player's market, from that player's own fills.
 *
 * It used to pool both players' fills, on the reasoning that either might be
 * the one who traded. That was right while they shared a token and is nonsense
 * now: pooling a fill priced in WOFI with one priced in SOL reported the
 * market as having moved +11,975%, which is the ratio between two unrelated
 * assets and not a move at all.
 *
 * A recorded execution price carries that fill's own impact — `markFromFill`
 * takes it back out. Earliest and latest by timestamp,
 * so the window is the round rather than one player's activity.
 *
 * Returns null when the tape cannot support the claim: fewer than two distinct
 * marks means there is no move to report, and reporting one anyway would be
 * inventing the most interesting number on the screen.
 */
export function marketMove(
  fills: TapeFill[],
  entry: number
): { openPx: number; closePx: number; bps: number } | null {
  if (entry <= 0) return null;
  const sorted = [...fills].sort((x, y) => x.ts - y.ts);
  if (sorted.length < 2) return null;

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first.ts === last.ts) return null;

  const openPx = markFromFill(first, entry);
  const closePx = markFromFill(last, entry);
  if (openPx <= 0 || closePx <= 0) return null;

  return { openPx, closePx, bps: Math.trunc(((closePx - openPx) / openPx) * 10_000) };
}
