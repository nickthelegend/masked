/**
 * The Fog Duel state machine.
 *
 * stake -> matchmaking -> a 5:00 live round -> reveal. LONG opens a position,
 * CLOSE realizes it, the price walks once a second, and the opponent stays
 * fogged with nothing but a fill count. At 0:00 an open position settles into
 * realized PnL, the two scores are compared, and a win credits
 * `stake * 2 * (1 - RAKE)` and appends a SETTLE fill.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { mmss } from '../ui';
import type { Fill } from '../ui';
import { OPPONENT, RAKE, ROUND_SECONDS } from './data';

export type DuelPhase = 'lobby' | 'searching' | 'live' | 'reveal';

interface Position {
  px: number;
}

const START_PRICE = 100;
const MAX_SAMPLES = 120;
const MAX_FILLS = 6;
/** Chance the opponent puts on a fill in any given second. */
const OPPONENT_FILL_ODDS = 0.22;

export interface Duel {
  phase: DuelPhase;
  stake: number;
  balance: number;
  secondsLeft: number;
  /** Price series for the round. */
  series: number[];
  /** Your equity curve, sampled once a second. */
  equity: number[];
  price: number;
  position: Position | null;
  /** Realized + unrealized, in percent. */
  myPnl: number;
  positionLabel: string;
  fills: Fill[];
  opponentName: string;
  opponentPnl: number;
  opponentFills: number;
  /** What the winner collects: stake x 2, less the rake. */
  pot: number;
  won: boolean;
  setStake: (stake: number) => void;
  findMatch: () => void;
  startMatch: () => void;
  openLong: () => void;
  closeLong: () => void;
  /** Settle now, before the clock runs out (the demo shortcut). */
  settleNow: () => void;
  rematch: () => void;
  backToLobby: () => void;
}

export function useDuel(): Duel {
  const [phase, setPhase] = useState<DuelPhase>('lobby');
  const [stake, setStake] = useState(5);
  const [balance, setBalance] = useState(50);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [series, setSeries] = useState<number[]>([START_PRICE]);
  const [equity, setEquity] = useState<number[]>([0]);
  const [position, setPosition] = useState<Position | null>(null);
  const [realized, setRealized] = useState(0);
  const [fills, setFills] = useState<Fill[]>([]);
  const [opponentPnl, setOpponentPnl] = useState(0);
  const [opponentFills, setOpponentFills] = useState(0);

  const price = series[series.length - 1];
  const unrealized = position ? ((price - position.px) / position.px) * 100 : 0;
  const myPnl = realized + unrealized;
  const pot = stake * 2 * (1 - RAKE);

  // The ticker samples equity without re-subscribing every second, so the
  // interval is created once per round rather than once per state change.
  const pnlRef = useRef(myPnl);
  pnlRef.current = myPnl;
  const settledRef = useRef(false);

  const addFill = useCallback((fill: Fill) => {
    setFills((f) => [fill, ...f].slice(0, MAX_FILLS));
  }, []);

  /* ---- the round clock ---- */
  useEffect(() => {
    if (phase !== 'live') return undefined;
    const id = setInterval(() => {
      setSeries((s) => {
        const last = s[s.length - 1];
        const next = Number((last * (1 + (Math.random() - 0.49) * 0.012)).toFixed(4));
        return [...s, next].slice(-MAX_SAMPLES);
      });
      setEquity((e) => [...e, pnlRef.current].slice(-MAX_SAMPLES));
      setOpponentFills((n) => n + (Math.random() < OPPONENT_FILL_ODDS ? 1 : 0));
      setSecondsLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  /* ---- settlement ---- */
  const settle = useCallback(() => {
    if (settledRef.current) return;
    settledRef.current = true;

    const finalPnl = realized + unrealized;
    const theirs = Number(((Math.random() * 7) - 3).toFixed(2));

    // An open position is closed at the buzzer, and that shows on the tape.
    if (position) addFill({ side: 'SETTLE', px: price.toFixed(4), t: mmss(secondsLeft) });

    setRealized(finalPnl);
    setEquity((e) => [...e, finalPnl]);
    setPosition(null);
    setOpponentPnl(theirs);
    setPhase('reveal');
    // Ties go to you, as in the original.
    if (finalPnl >= theirs) setBalance((b) => b + pot);
  }, [addFill, position, pot, price, realized, secondsLeft, unrealized]);

  // Settling in an effect rather than inside a state updater keeps the credit
  // idempotent — a re-run of the updater cannot pay the pot twice.
  useEffect(() => {
    if (phase === 'live' && secondsLeft === 0) settle();
  }, [phase, secondsLeft, settle]);

  /* ---- transitions ---- */
  const findMatch = useCallback(() => setPhase('searching'), []);

  const startMatch = useCallback(() => {
    settledRef.current = false;
    setPhase('live');
    setSecondsLeft(ROUND_SECONDS);
    setSeries([START_PRICE]);
    setEquity([0]);
    setPosition(null);
    setRealized(0);
    setFills([]);
    setOpponentPnl(0);
    setOpponentFills(1 + Math.floor(Math.random() * 3));
    setBalance((b) => b - stake);
  }, [stake]);

  const openLong = useCallback(() => {
    if (position) return;
    setPosition({ px: price });
    addFill({ side: 'LONG', px: price.toFixed(4), t: mmss(secondsLeft) });
  }, [addFill, position, price, secondsLeft]);

  const closeLong = useCallback(() => {
    if (!position) return;
    setRealized((r) => r + unrealized);
    setPosition(null);
    addFill({ side: 'CLOSE', px: price.toFixed(4), t: mmss(secondsLeft) });
  }, [addFill, position, price, secondsLeft, unrealized]);

  const rematch = useCallback(() => setPhase('searching'), []);
  const backToLobby = useCallback(() => setPhase('lobby'), []);

  return {
    phase,
    stake,
    balance,
    secondsLeft,
    series,
    equity,
    price,
    position,
    myPnl,
    positionLabel: position ? `LONG FROM ${position.px.toFixed(4)}` : 'FLAT',
    fills,
    opponentName: OPPONENT,
    opponentPnl,
    opponentFills,
    pot,
    won: myPnl >= opponentPnl,
    setStake,
    findMatch,
    startMatch,
    openLong,
    closeLong,
    settleNow: settle,
    rematch,
    backToLobby,
  };
}
