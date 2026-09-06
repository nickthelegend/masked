/**
 * The Fog Duel state machine, backed by the on-chain program.
 *
 * Every number here comes from Solana or the Ephemeral Rollup. The previous
 * implementation walked the price with Math.random(), incremented the
 * opponent's fill count on a coin flip, and invented the opponent's final PnL
 * at settlement; all three are gone.
 *
 * The public shape is unchanged, so no screen needed editing.
 *
 * stake -> matchmaking -> live round -> reveal. Fills go to the ER, where the
 * position is delegated (and, on a TEE, private). At the buzzer the positions
 * commit back to L1, PnL is compared, and the winner takes the pot less rake.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { mmss, useToast } from '../ui';
import type { Fill } from '../ui';
import { explainError, withRetry } from '../chain/errors';
import { checkBalance, checkCluster, checkProgram, checkWallet, firstFailure } from '../chain/preflight';
import { FOGDUEL_PROGRAM_ID } from '../chain/config';
import { assertFogIntact } from '../chain/fog';
import { FogduelClient, BASE_SCALE, PRICE_SCALE, type MatchState, type PositionState } from '../chain/client';
import { ACTIVE_CLUSTER } from '../chain/config';
import { OPPONENT, RAKE, ROUND_SECONDS } from './data';

export type DuelPhase = 'lobby' | 'searching' | 'live' | 'reveal';

/** Default base units per LONG press — a meaningful slice of the quote balance. */
const DEFAULT_FILL_QTY = 0.4;
/** Poll cadence for on-chain state during a live round. */
const POLL_MS = 1000;

export interface Duel {
  phase: DuelPhase;
  stake: number;
  balance: number;
  secondsLeft: number;
  series: number[];
  equity: number[];
  price: number;
  position: { px: number } | null;
  myPnl: number;
  positionLabel: string;
  fills: Fill[];
  opponentName: string;
  opponentPnl: number;
  opponentFills: number;
  pot: number;
  won: boolean;
  /* chain-aware additions */
  connected: boolean;
  busy: boolean;
  error: string | null;
  matchAddress: string | null;
  myAddress: string | null;
  fillSize: number;
  setFillSize: (qty: number) => void;
  setStake: (stake: number) => void;
  findMatch: () => void;
  startMatch: () => void;
  openLong: () => void;
  closeLong: () => void;
  settleNow: () => void;
  rematch: () => void;
  backToLobby: () => void;
  /** Join a specific open match from the book. */
  joinMatch: (address: string, creator: string) => void;
  /** Cancel your own unjoined match and reclaim the entry. */
  cancelMatch: (address: string) => void;
}

const bpsToPct = (bps: number) => bps / 100;

export function useDuel(): Duel {
  const wallet = useWallet();
  const toast = useToast();
  const connected = wallet.connected && !!wallet.publicKey;

  const client = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    const anchorWallet: AnchorWallet = {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction,
      signAllTransactions: wallet.signAllTransactions,
    };
    return new FogduelClient(anchorWallet as never, ACTIVE_CLUSTER);
  }, [wallet.publicKey, wallet.signTransaction, wallet.signAllTransactions]);

  const [phase, setPhase] = useState<DuelPhase>('lobby');
  const [stake, setStake] = useState(5);
  const [fillSize, setFillSize] = useState(DEFAULT_FILL_QTY);
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchState | null>(null);
  const [myPosition, setMyPosition] = useState<PositionState | null>(null);
  const [opponentPosition, setOpponentPosition] = useState<PositionState | null>(null);
  const [price, setPrice] = useState(0);
  const [series, setSeries] = useState<number[]>([]);
  const [equity, setEquity] = useState<number[]>([0]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);

  const settledRef = useRef(false);

  const entryLamports = stake * 1e9;
  const pot = stake * 2 * (1 - RAKE);

  /* ------------------------------- balance ------------------------------- */
  useEffect(() => {
    if (!client || !wallet.publicKey) return;
    let alive = true;
    const read = async () => {
      try {
        const lamports = await client.balance(wallet.publicKey!);
        if (alive) setBalance(lamports / 1e9);
      } catch {
        /* RPC hiccup; the next poll will pick it up */
      }
    };
    read();
    const id = setInterval(read, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client, wallet.publicKey]);

  /* ------------------------ live round: poll chain ----------------------- */
  useEffect(() => {
    if (!client || !match || phase !== 'live' || !wallet.publicKey) return undefined;

    let alive = true;
    const id = setInterval(async () => {
      try {
        const [m, px, mine] = await Promise.all([
          client.fetchMatch(match.address),
          client.fetchPrice(match.address, true),
          client.fetchPosition(match.address, wallet.publicKey!, true),
        ]);
        if (!alive) return;

        if (m) {
          setMatch(m);
          const elapsed = Math.floor(Date.now() / 1000) - m.startTs;
          setSecondsLeft(Math.max(0, m.duration - elapsed));
        }
        if (px > 0) {
          setPrice(px);
          setSeries((s) => [...s, px].slice(-120));
        }
        if (mine) {
          setMyPosition(mine);
          const eq = mine.quoteBalance + (mine.baseQty * px * PRICE_SCALE) / BASE_SCALE / PRICE_SCALE;
          const pnl = m ? ((eq - m.entry) * 100) / m.entry : 0;
          setEquity((e) => [...e, pnl].slice(-120));
        }

        // The opponent's position is deliberately NOT fetched here. On a TEE
        // the read would be refused anyway; fetching it on a non-TEE cluster
        // would leak exactly what the mode exists to hide.
      } catch {
        /* transient RPC error — keep polling */
      }
    }, POLL_MS);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client, match, phase, wallet.publicKey]);

  /* ----------------------------- settlement ------------------------------ */
  const settle = useCallback(async () => {
    if (!client || !match || !wallet.publicKey || settledRef.current) return;
    if (!match.joiner) return;
    settledRef.current = true;
    setBusy(true);
    try {
      await client.commitAndUndelegate(match.address, wallet.publicKey, match.creator, match.joiner);
      await client.requestSettle(match.address, wallet.publicKey);
      await client.settleMatch(match.address, wallet.publicKey, match.creator, match.joiner);

      const [m, mine, theirs] = await Promise.all([
        client.fetchMatch(match.address),
        client.fetchPosition(match.address, wallet.publicKey, false),
        client.fetchPosition(match.address, match.joiner.equals(wallet.publicKey) ? match.creator : match.joiner, false),
      ]);
      if (m) setMatch(m);
      if (mine) setMyPosition(mine);
      // After settlement the tape is public, so reading the opponent is
      // legitimate. Routed through the guard so the rule is enforced in one
      // place rather than trusted at each call site.
      setPhase('reveal');
      assertFogIntact('reveal', 'opponent position');
      if (theirs) setOpponentPosition(theirs);
    } catch (e) {
      const friendly = explainError(e);
      setError(friendly.title);
      toast.error(friendly.title, friendly.detail);
      settledRef.current = false;
    } finally {
      setBusy(false);
    }
  }, [client, match, wallet.publicKey, toast]);

  useEffect(() => {
    if (phase === 'live' && secondsLeft === 0) void settle();
  }, [phase, secondsLeft, settle]);

  /* ----------------------------- transitions ----------------------------- */
  const guard = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      if (!client || !wallet.publicKey) {
        setError('Connect a wallet first.');
        toast.error('CONNECT A WALLET', 'Nothing can be signed without one.');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        // Retry only the failures where retrying is meaningful — a declined
        // signature or a self-join is final.
        await withRetry(fn);
        toast.ok(label);
      } catch (e) {
        const friendly = explainError(e);
        setError(friendly.title);
        toast.error(friendly.title, friendly.detail);
      } finally {
        setBusy(false);
      }
    },
    [client, wallet.publicKey, toast]
  );

  const findMatch = useCallback(() => {
    setPhase('searching');
  }, []);

  /**
   * Join an existing open match if there is one, otherwise open a new one and
   * wait. This is the real matchmaking path — no fabricated opponent.
   */
  const startMatch = useCallback(() => {
    void guard('MATCH READY', async () => {
      const me = wallet.publicKey!;

      // Fail fast and legibly rather than sending a doomed transaction and
      // letting the user decode the on-chain error.
      const pre = firstFailure(
        checkWallet(me),
        checkBalance(await client!.balance(me), entryLamports),
        await checkCluster(ACTIVE_CLUSTER),
        await checkProgram(FOGDUEL_PROGRAM_ID, ACTIVE_CLUSTER)
      );
      if (!pre.ok) {
        toast.error(pre.title!, pre.detail);
        throw new Error(pre.title);
      }
      await client!.ensureTreasury(me);

      const open = await client!.fetchOpenMatches();
      const joinable = open.find((m) => !m.creator.equals(me) && m.entry === entryLamports);

      let target: PublicKey;
      let creator: PublicKey;

      if (joinable) {
        await client!.joinMatch(joinable.address, me, joinable.creator);
        target = joinable.address;
        creator = joinable.creator;
      } else {
        const matchId = Math.floor(Date.now() / 1000);
        target = await client!.createMatch({
          creator: me,
          matchId,
          mint: PublicKey.default,
          durationSecs: ROUND_SECONDS,
          entryLamports,
          startPrice: 100,
        });
        creator = me;
        // An unjoined match cannot start. Stay in matchmaking until someone
        // joins; the lobby polls for it.
        setMatch(await client!.fetchMatch(target));
        return;
      }

      const m = await client!.fetchMatch(target);
      if (!m || !m.joiner) return;

      await client!.delegatePosition(target, creator, me);
      await client!.delegatePosition(target, m.joiner, me);

      settledRef.current = false;
      setMatch(m);
      setSeries([]);
      setEquity([0]);
      setSecondsLeft(m.duration);
      setPrice(await client!.fetchPrice(target, true));
      setPhase('live');
    });
  }, [guard, client, wallet.publicKey, entryLamports]);

  const openLong = useCallback(() => {
    void guard('LONG FILLED', async () => {
      if (!match) return;
      await client!.applyFill(match.address, wallet.publicKey!, 'buy', fillSize);
      const mine = await client!.fetchPosition(match.address, wallet.publicKey!, true);
      if (mine) setMyPosition(mine);
    });
  }, [guard, client, match, wallet.publicKey, fillSize]);

  const closeLong = useCallback(() => {
    void guard('POSITION CLOSED', async () => {
      if (!match || !myPosition || myPosition.baseQty <= 0) return;
      await client!.applyFill(match.address, wallet.publicKey!, 'sell', myPosition.baseQty / BASE_SCALE);
      const mine = await client!.fetchPosition(match.address, wallet.publicKey!, true);
      if (mine) setMyPosition(mine);
    });
  }, [guard, client, match, myPosition, wallet.publicKey]);

  /** Take a specific match off the book. */
  const joinMatchByAddress = useCallback(
    (address: string, creator: string) => {
      void guard('MATCH JOINED', async () => {
        const me = wallet.publicKey!;
        const target = new PublicKey(address);
        const creatorKey = new PublicKey(creator);

        await client!.joinMatch(target, me, creatorKey);
        const m = await client!.fetchMatch(target);
        if (!m || !m.joiner) return;

        await client!.delegatePosition(target, creatorKey, me);
        await client!.delegatePosition(target, m.joiner, me);

        settledRef.current = false;
        setMatch(m);
        setSeries([]);
        setEquity([0]);
        setSecondsLeft(m.duration);
        setPrice(await client!.fetchPrice(target, true));
        setPhase('live');
      });
    },
    [guard, client, wallet.publicKey]
  );

  const cancelMatchByAddress = useCallback(
    (address: string) => {
      void guard('MATCH CANCELLED', async () => {
        await client!.cancelMatch(new PublicKey(address), wallet.publicKey!);
        setMatch(null);
      });
    },
    [guard, client, wallet.publicKey]
  );

  const rematch = useCallback(() => {
    setMatch(null);
    setMyPosition(null);
    setOpponentPosition(null);
    setSeries([]);
    setEquity([0]);
    settledRef.current = false;
    setPhase('searching');
  }, []);

  const backToLobby = useCallback(() => {
    setMatch(null);
    setPhase('lobby');
  }, []);

  /* ------------------------------- derived ------------------------------- */
  const myPnl = match && myPosition
    ? ((myPosition.quoteBalance + (myPosition.baseQty * price * PRICE_SCALE) / BASE_SCALE / PRICE_SCALE - match.entry) * 100) /
      match.entry
    : 0;

  const iAmCreator = !!(match && wallet.publicKey && match.creator.equals(wallet.publicKey));
  const opponentPnl = match
    ? bpsToPct(iAmCreator ? match.pnlBBps : match.pnlABps)
    : 0;

  const fills: Fill[] = (myPosition?.fills ?? []).map((f) => ({
    side: f.side === 'BUY' ? 'LONG' : f.side === 'SELL' ? 'CLOSE' : 'SETTLE',
    px: (f.px / PRICE_SCALE).toFixed(4),
    t: mmss(Math.max(0, (match?.startTs ?? 0) + (match?.duration ?? 0) - f.ts)),
  })).reverse();

  return {
    phase,
    stake,
    balance,
    secondsLeft,
    series,
    equity,
    price,
    position: myPosition && myPosition.baseQty > 0 ? { px: myPosition.avgPx / PRICE_SCALE } : null,
    myPnl,
    positionLabel:
      myPosition && myPosition.baseQty > 0
        ? `LONG FROM ${(myPosition.avgPx / PRICE_SCALE).toFixed(4)}`
        : 'FLAT',
    fills,
    opponentName: match?.joiner && wallet.publicKey && !match.joiner.equals(wallet.publicKey)
      ? `${match.joiner.toBase58().slice(0, 6)}…`
      : OPPONENT,
    opponentPnl,
    // Mid-round this is all the opponent ever exposes: a count, never a size,
    // side or price. After settlement the committed position is public.
    opponentFills: opponentPosition?.fillCount ?? 0,
    pot,
    won: match?.winner ? !!(wallet.publicKey && match.winner.equals(wallet.publicKey)) : false,
    connected,
    busy,
    error,
    matchAddress: match?.address.toBase58() ?? null,
    myAddress: wallet.publicKey?.toBase58() ?? null,
    fillSize,
    setFillSize,
    setStake,
    findMatch,
    startMatch,
    openLong,
    closeLong,
    settleNow: () => void settle(),
    rematch,
    backToLobby,
    joinMatch: joinMatchByAddress,
    cancelMatch: cancelMatchByAddress,
  };
}
