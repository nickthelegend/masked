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
import { Platform } from 'react-native';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { useWallet } from '@solana/wallet-adapter-react';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { mmss, playSound, useToast } from '../ui';
import type { Fill } from '../ui';
import { explainError, withRetry } from '../chain/errors';
import { checkBalance, checkCluster, checkProgram, checkWallet, firstFailure } from '../chain/preflight';
import { FOGDUEL_PROGRAM_ID } from '../chain/config';
import { assertFogIntact } from '../chain/fog';
import { FogduelClient, pnlBps, type MatchLeg, type MatchState, type PositionState } from '../chain/client';
import { formatSolPrice, MAX_OPEN_AGE_SECS, VALUE_DIV } from '../chain/units';
import type { TapeState } from '../chain/tape';
import { buyBaseOut, buyExecPx, buyImpact, maxShortBase, quoteToBuyBase, sellExecPx, sellImpact } from '../chain/book';
import { useHeadToHead, describeRecord } from '../chain/useHeadToHead';
import { fetchMemeMarkets, livePxFor, searchMarkets, type TradableMarket } from '../chain/markets';
import { mintSession, type ActiveSession } from '../chain/session';
import { ACTIVE_CLUSTER } from '../chain/config';
import { DEMO_MINT, marketLabel } from '../chain/market';
import { OPPONENT_PENDING, RAKE, ROUND_SECONDS } from './data';
import { readPrefs, writePrefs } from '../chain/prefs';

export type DuelPhase = 'lobby' | 'searching' | 'live' | 'reveal';

/**
 * Which of a match's two markets is mine.
 *
 * The creator's is `legA` and the joiner's is `legB`. Every place that used to
 * say "the match's mint" now has to answer "whose?", because the two players
 * are no longer trading the same thing.
 */
const legFor = (m: MatchState | null, me: PublicKey | null): MatchLeg | null => {
  if (!m || !me) return null;
  return m.creator.equals(me) ? m.legA : m.legB;
};

/**
 * Fraction of remaining quote spent per LONG press.
 *
 * The program's buy side consumes quote, not base — you say how much you are
 * spending and the private book tells you what you got.
 *
 * It has to be one of SizePicker's `SIZES`, because that control highlights
 * the button whose value equals this one. It was 0.4, which is not among
 * [0.25, 0.5, 1], so a round opened with every size button unhighlighted while
 * 40% was armed: the player saw nothing selected, pressed LONG, and spent 40%
 * of their quote on a size they had never chosen and could not see.
 */
const DEFAULT_FILL_FRACTION = 0.25;

/**
 * What a guarded action reports back.
 *
 * `'noop'` means it correctly decided there was nothing to do, and the success
 * toast is skipped. A `{ label }` means it did something its headline does not
 * describe — a partial close is not "POSITION CLOSED" — and that label is used
 * instead.
 */
type GuardOutcome = void | 'noop' | { label: string };
/** Poll cadence for on-chain state during a live round. */
const POLL_MS = 1000;
/** How long a refused fill stays on screen, marked rolled back, before it goes. */
const PENDING_REFUSED_MS = 2500;
/**
 * How often the live market price is posted on chain.
 *
 * Faster than the 5%/second cap would just be rejected, and pump.fun does not
 * thank anyone for a request a second either.
 */
const MARK_CRANK_MS = 5000;
/**
 * How old the opponent's mark may get before this client posts it for them —
 * three missed heartbeats. See the backstop in the mark crank.
 */
const STALE_MARK_SECS = 15;
/** How often the header balance is re-read. */
const BALANCE_POLL_MS = 5000;

/**
 * Settling spans two chains and several transactions, and the first go can
 * lose a race with the rollup's commit. Retry before alarming anyone.
 */
const SETTLE_ATTEMPTS = 3;
const SETTLE_RETRY_MS = 4000;
/**
 * How long the creator's client lets the joiner's seal show no progress before
 * sealing itself. Any progress restarts the wait; the ceiling bounds the whole
 * thing however slowly the seal is going.
 */
const SEAL_STALL_MS = 20_000;
const SEAL_WAIT_CEILING_MS = 90_000;
/**
 * The same for settlement, from the joiner's side. Longer, because the first
 * visible sign of the creator's settlement is a position landing back on Solana,
 * and that waits on the rollup's commit.
 */
const SETTLE_STALL_MS = 30_000;
const SETTLE_WAIT_CEILING_MS = 150_000;
/**
 * How long past the buzzer a round sits unsettled before the joiner's lobby
 * sweep takes it. Past the whole settle wait above, so a sweep never races a
 * creator that is still settling.
 */
const SWEEP_JOINER_AFTER_S = 180;
/**
 * How long settlement waits at the buzzer for the rollup's own crank to commit
 * the round before this client commits it instead. The crank fires two seconds
 * past the buzzer; this is that, plus the commit landing on Solana, with room.
 * Shorter when this client does not know a crank was scheduled.
 */
const CRANK_COMMIT_WAIT_MS = 15_000;
const UNKNOWN_CRANK_WAIT_MS = 8_000;

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
  /** Which way you are facing, for the chips that draw a side. */
  mySide: 'long' | 'short' | 'flat';
  fills: Fill[];
  opponentName: string;
  opponentPnl: number;
  /**
   * The opponent's fill count, or null while it cannot be read.
   *
   * Null is the honest answer during a live round: the position is sealed by
   * its ACL and the gate refuses it, so there is no count to report. It used
   * to coalesce to 0, which claimed the opponent had not traded — a number the
   * client had never been given and could not have obtained.
   */
  opponentFills: number | null;
  /**
   * What the winner is paid, in SOL — the pot **less rake**, not the pot.
   *
   * The name is historical and every consumer means "what you take", so it
   * stays. `potGross` is the number on the table. Multiplying this by
   * `(1 - RAKE)` again is the bug that made the arena's potential-earnings
   * figure read 0.1921 where the chain pays 0.196.
   */
  pot: number;
  /** The whole pot, both stakes, before rake. */
  potGross: number;
  /**
   * What this round actually put at risk, in SOL.
   *
   * Not the stake picker's value: joining somebody else's match takes their
   * size, and after a reload the picker is back at its default. The reveal was
   * reporting a 0.05 loss as -0.10 because it read the picker.
   */
  entrySol: number;
  won: boolean;
  /* chain-aware additions */
  connected: boolean;
  busy: boolean;
  /** True once both positions carry an on-chain access-control list. */
  sealed: boolean;
  /** Ticker of the market being fought over, as written on chain. */
  market: string;
  /** The opponent's full wallet, for their generated mask. */
  opponentAddress: string | null;
  /** Their ticker and mint. Public — see `opponentLeg`. */
  opponentMarket: string;
  opponentMarketMint: string;
  /** The mint being traded, for the logo. */
  marketMint: string;
  /** The market's logo, when its feed publishes one. */
  marketImageUri: string | null;
  /** Which feed prices this round. */
  marketSource: 'pump.fun' | 'jupiter';
  /** The mark, formatted. */
  priceLabel: string;
  /** What the book charged for the most recent fill, or null. */
  lastFill: LastFill | null;
  /** A fill sent and not yet confirmed, at its predicted price. See PendingFill. */
  pendingFill: PendingFill | null;
  /** What the chosen size costs against the current mark. */
  sizeNote?: string;
  /**
   * Whether fills this round are being signed by a Gum session key rather than
   * by the wallet. False is normal — a session is an optimisation.
   */
  sessionActive: boolean;
  /** What settlement is doing right now. */
  settleStages: SettleStage[];
  /** The public tape once the round has settled, with both real fill lists. */
  tape: TapeState | null;
  /** The record against this opponent, counted off chain. Null until known. */
  record: string | null;
  /** Whether you are the tape's player A — which fill list is yours. */
  isPlayerA: boolean;
  /** Per-player entry in lamports, which the tape replay starts from. */
  entryLamports: number;
  /** When the round went live and how long it ran, for the timeline axis. */
  startTs: number;
  duration: number;
  /** The market the next duel will be opened on, chosen in the lobby. */
  selectedMarket: TradableMarket | null;
  selectMarket: (m: TradableMarket) => void;
  /** Select a market by mint — used by the `?market=` deep link. */
  openMarketByMint: (mint: string) => void;
  /** Whether this cluster actually enforces the ACL at read time. */
  teeEnforced: boolean;
  /**
   * Whether either side has been force-closed for running out of equity.
   *
   * Public during the round, unlike everything else about a position. A
   * liquidation is announced by design — see `RoundStatus` in state.rs.
   */
  liquidated: { me: boolean; opponent: boolean };
  error: string | null;
  matchAddress: string | null;
  myAddress: string | null;
  fillSize: number;
  setFillSize: (qty: number) => void;
  setStake: (stake: number) => void;
  /**
   * Round length for the next match *this wallet opens*, in seconds.
   *
   * Distinct from `duration`, which is the live match's length — joining
   * somebody else's duel takes theirs, so conflating the two would let the
   * lobby's picker silently misreport the clock of a round already running.
   */
  openDuration: number;
  setOpenDuration: (secs: number) => void;
  findMatch: () => void;
  startMatch: () => void;
  /** Open a match for a particular opponent, never joining one off the book. */
  openMatch: () => void;
  openLong: () => void;
  /** Sell what you do not own — the mirror of openLong. */
  openShort: () => void;
  closeLong: () => void;
  settleNow: () => void;
  rematch: () => void;
  backToLobby: () => void;
  /** Join a specific open match from the book. */
  joinMatch: (address: string, creator: string) => void;
  /** Cancel your own unjoined match and reclaim the entry. */
  cancelMatch: (address: string) => void;
}

/**
 * The three things settling a duel actually does.
 *
 * Between the buzzer and the reveal there are twenty-odd seconds in which the
 * app used to show nothing at all, while it was doing the most interesting
 * work in the product: bringing both positions off the rollup, waiting for the
 * base layer to take ownership back, and paying the pot. Naming the stages
 * turns dead air into the part a judge should be watching.
 */
export interface SettleStage {
  id: 'commit' | 'undelegate' | 'settle';
  label: string;
  /** What the stage means, in one line. */
  note: string;
  state: 'waiting' | 'running' | 'done' | 'failed';
  /** Filled in with the real result once the stage completes. */
  detail?: string;
}

const SETTLE_STAGES: SettleStage[] = [
  {
    id: 'commit',
    label: 'COMMIT',
    note: 'both positions committed from the rollup',
    state: 'waiting',
  },
  {
    id: 'undelegate',
    label: 'UNDELEGATE',
    note: 'Solana takes ownership back from the delegation program',
    state: 'waiting',
  },
  { id: 'settle', label: 'SETTLE', note: 'PnL compared, pot paid, tape written', state: 'waiting' },
];

/** The cost of the last fill, as the book actually charged it. */
export interface LastFill {
  side: 'buy' | 'sell';
  /** Price filled at, in the program's scale. */
  px: number;
  /** The posted mark immediately before the fill. */
  markBefore: number;
  /** How far the fill landed from the mark, against you, as a percentage. */
  impactPct: number;
  /** Base quantity, in the program's scale. */
  qty: number;
  at: number;
}

/**
 * A fill that has been sent and not yet confirmed (PLAN 7.15).
 *
 * Its price is the book's own prediction for that size at the mark read just
 * before sending, which is what the program will charge unless the mark moves
 * first. The chain's fill replaces it on confirmation; a refusal marks it
 * rolled back, and it goes.
 */
export interface PendingFill {
  id: number;
  side: 'buy' | 'sell';
  state: 'pending' | 'refused';
  /** Predicted execution price, in the program's scale. */
  px: number;
  markBefore: number;
  /** Predicted base quantity, in the program's scale. */
  qty: number;
}

const bpsToPct = (bps: number) => bps / 100;

export function useDuel(): Duel {
  const wallet = useWallet();
  const toast = useToast();
  const connected = wallet.connected && !!wallet.publicKey;

  /**
   * The adapter, readable without depending on the identity of its methods.
   *
   * `useWallet()` hands back fresh `signTransaction` / `signAllTransactions` /
   * `signMessage` closures on most renders. Listing them as memo dependencies
   * rebuilt the client — and its web3 `Connection` objects — on nearly every
   * render, and every effect keyed on `client` churned with it. Measured: 51
   * five-second intervals created in 25 seconds.
   */
  const walletRef = useRef(wallet);
  walletRef.current = wallet;

  /** Stable identity for the connected wallet: the key, not the object. */
  const meKey = wallet.publicKey ? wallet.publicKey.toBase58() : null;

  const client = useMemo(() => {
    const w = walletRef.current;
    if (!w.publicKey || !w.signTransaction || !w.signAllTransactions) return null;
    // Signing is delegated through the ref rather than captured, so the client
    // survives the adapter handing out new closures while still using the
    // current ones.
    const anchorWallet: AnchorWallet = {
      publicKey: w.publicKey,
      signTransaction: ((tx: never) =>
        walletRef.current.signTransaction!(tx)) as AnchorWallet['signTransaction'],
      signAllTransactions: ((txs: never[]) =>
        walletRef.current.signAllTransactions!(txs)) as AnchorWallet['signAllTransactions'],
    };
    // signMessage unlocks reads of your own sealed position on the rollup: the
    // front door refuses everybody without a token, owner included. A wallet
    // that cannot sign a message can still trade, it just cannot read back
    // what it did until the round is committed to L1.
    const signer = w.signMessage
      ? {
          publicKey: w.publicKey,
          signMessage: (m: Uint8Array) => walletRef.current.signMessage!(m),
        }
      : undefined;
    return new FogduelClient(anchorWallet as never, ACTIVE_CLUSTER, signer);
    // Keyed on the wallet's address alone: a different wallet is a different
    // client, and the same wallet re-rendering is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meKey]);

  /** Seeded from what this browser remembers — see chain/prefs.ts. */
  const prefs = useMemo(() => readPrefs(), []);
  const [selectedMarket, setSelectedMarket] = useState<TradableMarket | null>(null);

  /**
   * Restore a market from `?market=<mint>` or from what this browser
   * remembered, whichever is present — the deep link wins.
   *
   * Resolved through the picker's own search rather than reconstructed from
   * the mint, because a market needs a *live price* to open a match and a
   * remembered one is by definition stale. One that can no longer be priced is
   * not carried forward — `create_match` would reject it — and the lobby stays
   * on its own default, the top market. For a remembered market that is the
   * whole story. A deep link says so: the player followed it for one token, and
   * landing on another without a word reads as though the link had worked.
   */
  const [deepLinkMint, setDeepLinkMint] = useState<string | null>(null);
  const restoredMint = deepLinkMint ?? prefs.marketMint ?? null;
  /**
   * Which mint was restored, not whether one was.
   *
   * A boolean here let the remembered market beat the deep link. This effect
   * runs before the app's own, so on mount it saw only the remembered mint,
   * restored it and shut the door, and `?market=` arrived a moment later to
   * find it shut. A deep link may still take over from a remembered market;
   * nothing else may, so a player's own pick is never overwritten.
   */
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!restoredMint || restoredFor.current === restoredMint) return undefined;
    if (restoredFor.current !== null && restoredMint !== deepLinkMint) return undefined;
    restoredFor.current = restoredMint;
    const linked = restoredMint === deepLinkMint;
    const token = `${restoredMint.slice(0, 4)}…${restoredMint.slice(-4)}`;
    let alive = true;
    void (async () => {
      try {
        const [found] = await searchMarkets(restoredMint);
        if (!alive) return;
        if (found && found.mint === restoredMint) {
          setSelectedMarket(found);
        } else if (linked) {
          toast.info(
            'NO PRICE FOR THAT TOKEN',
            `${token} has no live price on pump.fun or Jupiter, so a duel cannot open on it. Pick a market from the list.`
          );
        }
      } catch {
        // The picker is still there; the player can choose by hand.
        if (alive && linked) {
          toast.info(
            'COULD NOT LOOK UP THAT TOKEN',
            `The market search did not answer, so ${token} is not selected. Pick a market from the list.`
          );
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [restoredMint, deepLinkMint, toast]);

  const [phase, setPhase] = useState<DuelPhase>('lobby');
  const [stake, setStake] = useState(prefs.stake ?? 0.1); // SOL
  const [fillSize, setFillSize] = useState(DEFAULT_FILL_FRACTION);
  /**
   * Who has blown up. The one thing about a live round that is not fogged —
   * read from the unsealed `RoundStatus`, by deliberate decision.
   */
  const [liquidated, setLiquidated] = useState({ me: false, opponent: false });
  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  /**
   * Whether a guarded action is already running.
   *
   * Separate from `busy` because `busy` is state and state is asynchronous —
   * see `guard`. This is the actual lock; `busy` is what the buttons render.
   */
  const inFlight = useRef(false);
  // Read back from chain after sealing — never a local optimistic flag.
  const [sealed, setSealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [match, setMatch] = useState<MatchState | null>(null);
  const [myPosition, setMyPosition] = useState<PositionState | null>(null);
  const [opponentPosition, setOpponentPosition] = useState<PositionState | null>(null);
  /**
   * The live match, readable without subscribing to its identity.
   *
   * `setMatch` runs once a second with a freshly decoded object, so anything
   * that lists `match` in a dependency array is torn down and rebuilt every
   * second. That is fine for rendering and ruinous for an interval: the crank
   * never survived long enough to fire on its own schedule.
   */
  const matchRef = useRef<MatchState | null>(null);
  matchRef.current = match;
  /** Stable identity for effects that must outlive a poll tick. */
  const matchKey = match ? match.address.toBase58() : null;

  const [price, setPrice] = useState(0);
  const [series, setSeries] = useState<number[]>([]);
  const [equity, setEquity] = useState<number[]>([0]);
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  /**
   * Round length for the next match this wallet opens.
   *
   * A real argument to `create_match`, not a display setting — the program
   * stores it and refuses settlement before `start_ts + duration`. Joining
   * somebody else's match takes *their* duration; this only governs opening.
   */
  const [openDuration, setOpenDuration] = useState(prefs.duration ?? ROUND_SECONDS);
  /**
   * Remember the three things a player would otherwise re-pick every visit.
   *
   * Written on change rather than on unmount: a tab closed mid-round never
   * runs a cleanup, which is exactly the session whose choices were worth
   * keeping.
   */
  useEffect(() => {
    writePrefs({ stake, duration: openDuration, marketMint: selectedMarket?.mint });
  }, [stake, openDuration, selectedMarket?.mint]);

  const settledRef = useRef(false);
  /** Whether this round was handed to the rollup's crank — see `scheduleRoundCranks`. */
  const roundCranked = useRef(false);
  /** The match this client has already released its own ACL for. */
  const aclReleasedFor = useRef<string | null>(null);
  /** Retries spent on the current settlement. Reset when a round begins. */
  const settleAttempts = useRef(0);

  /**
   * What the private book just charged for the last fill.
   *
   * The whole mechanic — that each player trades their own curve and pays
   * impact on their own size — is invisible if the screen only shows a
   * position appearing. This captures the mark immediately before the fill
   * and compares it with the price actually filled at, so the cost of size is
   * a number on screen rather than something to take on trust.
   */
  const [lastFill, setLastFill] = useState<LastFill | null>(null);
  const [pendingFill, setPendingFill] = useState<PendingFill | null>(null);
  const [settleStages, setSettleStages] = useState<SettleStage[]>(() =>
    SETTLE_STAGES.map((x) => ({ ...x }))
  );
  /**
   * The settled tape, which is where both players' real fills live.
   *
   * The reveal used to draw the opponent's round from a seeded random walk
   * pinned to their final PnL. The chain has had the actual fills all along —
   * `settle_match` writes both lists into the Tape — so the reveal reads them.
   */
  const [tape, setTape] = useState<TapeState | null>(null);
  /**
   * The Gum session key for this round, if one was minted.
   *
   * Held for the life of the round only, never persisted. Fills route through
   * it so a sixty-second round needs one wallet signature instead of one per
   * trade. Null is a completely normal state — see `beginRound`.
   */
  const [session, setSession] = useState<ActiveSession | null>(null);

  const noteFill = useCallback(
    (position: PositionState, markBefore: number, side: 'buy' | 'sell') => {
      const fill = position.fills[position.fills.length - 1];
      if (!fill || markBefore <= 0) return;
      // Buying above the mark and selling below it are both a cost, so the
      // sign is normalised: impact is always what it took out of you.
      const raw = (fill.px - markBefore) / markBefore;
      playSound(side === 'buy' ? 'fill' : 'close');
      setLastFill({
        side,
        px: fill.px,
        markBefore,
        impactPct: (side === 'buy' ? raw : -raw) * 100,
        qty: fill.qty,
        at: Date.now(),
      });
    },
    []
  );

  /* -------------------------------- sound -------------------------------- */
  /**
   * The closing seconds and the buzzer.
   *
   * `secondsLeft` is recomputed from the chain's own clock on each poll rather
   * than counted down locally, so it can step by more than one — the tick is
   * therefore driven off the value changing, not off a timer of its own, and
   * the buzzer is fired once per round by remembering that it has.
   */
  const lastTick = useRef<number | null>(null);
  const buzzed = useRef(false);
  useEffect(() => {
    if (phase !== 'live') {
      lastTick.current = null;
      buzzed.current = false;
      return;
    }
    if (secondsLeft === 0) {
      if (!buzzed.current) {
        buzzed.current = true;
        playSound('buzzer');
      }
      return;
    }
    if (secondsLeft <= 5 && lastTick.current !== secondsLeft) {
      lastTick.current = secondsLeft;
      playSound('tick');
    }
  }, [phase, secondsLeft]);

  /** The fog coming down, once, when the positions are actually sealed. */
  const sealAnnounced = useRef(false);
  useEffect(() => {
    if (!sealed) {
      sealAnnounced.current = false;
      return;
    }
    if (sealAnnounced.current) return;
    sealAnnounced.current = true;
    playSound('seal');
  }, [sealed]);

  const entryLamports = Math.round(stake * 1e9);
  /**
   * What the winner takes.
   *
   * Once there is a match, this is the pot the chain is actually holding less
   * the rake — not twice whatever the stake picker happens to be showing. They
   * differ after a reload, when the picker is back at its default and the
   * running match was opened at some other size: the screen claimed 0.20 over
   * a 0.10 pot.
   */
  const potGross = match ? match.pot / LAMPORTS_PER_SOL : stake * 2;
  /** Net of rake — see the `pot` field's note. Named for what consumers mean. */
  const pot = potGross * (1 - RAKE);

  /* ------------------------------- balance ------------------------------- */
  useEffect(() => {
    const me = walletRef.current.publicKey;
    if (!client || !me) return;
    let alive = true;
    const read = async () => {
      try {
        const lamports = await client.balance(me);
        if (alive) setBalance(lamports / 1e9);
      } catch {
        /* RPC hiccup; the next poll will pick it up */
      }
    };
    read();
    const id = setInterval(read, BALANCE_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // Keyed on the address string, not the PublicKey object: see `meKey`.
  }, [client, meKey]);

  /* ------------------------ live round: poll chain ----------------------- */
  useEffect(() => {
    // Through the refs rather than the render's values: this effect is keyed on
    // the strings below, so a captured object would be the one from whichever
    // render last rebuilt it.
    const address = matchRef.current?.address;
    const me = walletRef.current.publicKey;
    if (!client || !address || phase !== 'live' || !me) return undefined;

    let alive = true;
    const id = setInterval(async () => {
      try {
        // My own feed. The opponent has their own token and their own mark,
        // and neither is any of my business until the reveal.
        const [m, pxRaw, mine] = await Promise.all([
          client.fetchMatch(address),
          client.fetchPrice(address, me, true),
          client.fetchPosition(address, me, true),
        ]);
        if (!alive) return;

        // Displayed and charted, so a double is ample — the exactness that
        // matters is on chain and in what gets sent there.
        const px = Number(pxRaw);

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
          // Straight through the same helper settlement uses, so the number
          // on screen cannot drift from the number that decides the pot.
          const pnl = m ? pnlBps(mine, px, m.entry) / 100 : 0;
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
    // Keyed entirely on strings and memos. The match object is replaced by the
    // poll once a second and `wallet.publicKey` is an object too, so anything
    // holding either identity rebuilds this interval on nearly every render.
  }, [client, matchKey, phase, meKey]);

  /* ---------------------- live round: crank the mark --------------------- */
  //
  // Nothing else moves the price. Without this the mark sits where the match
  // opened and a round is decided entirely by execution cost, which is not a
  // trading game.
  //
  // The source is the same public API the market list came from, and the post
  // is permissionless, so both players can run this and neither has to trust
  // the other to. On-chain it is capped at 5% per second, and `crankPrice`
  // clamps to that rather than being rejected.
  useEffect(() => {
    const m0 = matchRef.current;
    const me = walletRef.current.publicKey;
    if (!client || !m0 || phase !== 'live' || !me) {
      return undefined;
    }
    // My market, not the match's — there is no such thing any more.
    const mine = legFor(m0, me);
    if (!mine || !mine.symbol) return undefined;
    const mint = mine.mint.toBase58();
    const kind = mine.marketType;
    const address = m0.address;

    let alive = true;
    const ac = new AbortController();

    const opponent = m0.creator.equals(me) ? m0.joiner : m0.creator;
    const theirs = legFor(m0, opponent);

    // Stops at the buzzer, not at settlement: the program refuses a mark once
    // the clock has run out, so cranking through the commit-and-settle window
    // just posts failing transactions to the rollup ledger.
    //
    // Checked inside the tick, deliberately. This used to be `secondsLeft <= 0`
    // in the guard above with `secondsLeft` in the dependency array — and that
    // value changes every second, so the effect tore itself down and rebuilt
    // once a second. Each rebuild ran `tick()` immediately and then created an
    // interval that was cleared before it could ever fire. The five-second
    // heartbeat never once ran at five seconds: the market fetch, the L1 crank
    // and both rollup liquidation probes all went out every second instead,
    // per player. Measured at 11 market requests in 22 seconds from one tab.
    const expired = () => {
      const m = matchRef.current;
      return !m || Math.floor(Date.now() / 1000) >= m.startTs + m.duration;
    };

    const tick = async () => {
      if (expired()) return;
      try {
        const px = await livePxFor({ kind, mint }, ac.signal);
        if (!alive) return;
        // Posted on L1, not the rollup. The price feed is never delegated —
        // only the positions are — so the rollup rejects a write to it with
        // InvalidWritableAccount, and every mark was silently failing. The
        // rollup clones the feed for reads, so fills there see the new mark.
        await client.crankPrice(address, me, px, me, false);
      } catch {
        // The market API or the rate limit said no. The next tick tries again;
        // a failed crank must never interrupt a round in progress.
      }

      // The opponent's mark, when their own tab has stopped keeping it.
      //
      // Each client posts its own market's mark, and settlement values each
      // side at its own last posted one — so a player who hid or closed the tab
      // froze their mark, and with it a PnL the market may since have taken
      // back. Measured in a duel here: a tab the browser had throttled in the
      // background posted about once a minute. The post is permissionless and
      // rate-limited, so the client still in the round keeps that mark moving
      // once it has gone stale, from the same public price its owner would post.
      if (theirs && opponent) {
        try {
          const feed = await client.fetchPriceFeed(address, opponent, false);
          if (alive && feed && Math.floor(Date.now() / 1000) - feed.updatedTs > STALE_MARK_SECS) {
            const theirPx = await livePxFor({ kind: theirs.marketType, mint: theirs.mint.toBase58() }, ac.signal);
            if (alive) await client.crankPrice(address, me, theirPx, opponent, false);
          }
        } catch {
          // Same rule as above: a failed backstop never interrupts the round.
        }
      }

      // Then look for a blow-up on the other side.
      //
      // On the rollup, because that is where positions live. Permissionless
      // and harmless against a solvent position, so this fires blind rather
      // than reading anything private first — which it could not do anyway,
      // since the opponent's position is sealed to us.
      //
      // Only the opponent's position. Both clients used to probe both sides, so
      // every five seconds four identical `liquidate` transactions hit the
      // rollup — 44 in a one-minute round — and the only player with any reason
      // to liquidate a position is the one on the other side of it.
      //
      // And only when the rollup is not already doing it. A round handed to the
      // rollup's crank (see `scheduleRoundCranks`) is checked there every two
      // seconds whether or not anybody's tab is open; this probe is the
      // fallback for a round whose schedule did not land.
      try {
        if (!alive) return;
        if (!roundCranked.current) {
          await Promise.all(
            [opponent]
              .filter((k): k is PublicKey => !!k)
              .map((owner) => client.liquidate(address, me, owner).catch(() => {}))
          );
        }
        const status = await client.fetchRoundStatus(address, true);
        if (alive && status) {
          const iAmCreator = m0.creator.equals(me);
          setLiquidated({
            me: iAmCreator ? status.liquidatedA : status.liquidatedB,
            opponent: iAmCreator ? status.liquidatedB : status.liquidatedA,
          });
        }
      } catch {
        // Same rule as the crank: never interrupt a round in progress.
      }
    };

    void tick();
    const id = setInterval(tick, MARK_CRANK_MS);
    return () => {
      alive = false;
      ac.abort();
      clearInterval(id);
    };
    // Keyed on strings, for the reason spelled out on `matchRef`: `setMatch`
    // hands back a freshly decoded object once a second, so listing `match`
    // here tore this interval down and rebuilt it once a second — and each
    // rebuild ran `tick()` immediately. That is the same defect the comment
    // above describes, still live in the effect it was written about: the
    // five-second heartbeat was really firing about five times a second,
    // opening a gate websocket per rebuild. `wallet.publicKey` is an object
    // too, and is captured at setup rather than subscribed to.
  }, [client, matchKey, phase, meKey]);

  /**
   * Settle this player's own abandoned round.
   *
   * Settlement is permissionless once the clock expires, so a player who closed
   * their tab mid-round leaves a pot escrowed until somebody settles it. The
   * lobby is the natural place to do that: it is the one screen with nothing
   * else happening.
   *
   * Permissionless does not mean free, though, and this used to sweep whatever
   * expired match it found first. Each settle costs the signer roughly 0.01 SOL
   * in rollup commit and undelegation fees and pays them nothing back — the pot
   * goes to the two participants — so a player idling in the lobby was quietly
   * spending their own SOL on strangers' pots, every 20 seconds, with nothing
   * on screen to say so. A freshly funded wallet lost 0.019 SOL to two of them
   * between connecting and pressing FIND MATCH. On mainnet that is somebody
   * else's money.
   *
   * So: only rounds this player was actually in. That is the one case where the
   * fee buys them something — their own escrow, released — and the one they can
   * be assumed to consent to. `npm run crank` still sweeps the whole book for
   * whoever runs the cluster, which is where that cost belongs.
   *
   * One match per sweep, and only from the lobby, so this can never compete
   * with the player's own live settlement or fire mid-round. A failure is
   * silent by design: the next sweep tries again, and a round that is already
   * settled needs nothing from this player.
   */
  useEffect(() => {
    if (!client || !wallet.publicKey || phase !== 'lobby') return undefined;
    let alive = true;

    const sweep = async () => {
      try {
        const me = wallet.publicKey!;
        const expired = await client.fetchExpiredMatches();
        const target = expired.find(
          (m) => m.joiner && (m.creator.equals(me) || m.joiner.equals(me))
        );
        if (!alive || !target || !target.joiner) return;
        // Same split as a live round: the creator's client settles, and the
        // joiner's only once the round has sat unsettled well past the buzzer.
        // Two lobbies sweeping the same round at once was a guaranteed failed
        // transaction for one of them.
        const endedAgo = Math.floor(Date.now() / 1000) - (target.startTs + target.duration);
        if (!target.creator.equals(me) && endedAgo < SWEEP_JOINER_AFTER_S) return;
        void client.releaseOwnAcl(target.address, me).catch(() => {});
        await client.commitAndUndelegate(
          target.address, wallet.publicKey!, target.creator, target.joiner
        );
        await client.waitForUndelegation(target.address, target.creator, target.joiner);
        if (!alive) return;
        await client.requestSettle(target.address, wallet.publicKey!);
        await client.settleMatch(
          target.address, wallet.publicKey!, target.creator, target.joiner
        );
      } catch {
        // Somebody else's round, and very possibly somebody else settling it
        // at the same moment. Nothing to report.
      }
    };

    const id = setInterval(sweep, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [client, wallet.publicKey, phase]);

  /* ----------------------------- settlement ------------------------------ */

  /**
   * Read the settled round back and show it.
   *
   * Split out because there are two ways to arrive here and both are normal:
   * this client settled the match, or the other player's client did. Only the
   * reading differs from nothing at all — the chain is the same either way.
   */
  const showReveal = useCallback(async () => {
    if (!client || !match || !wallet.publicKey || !match.joiner) return;
    const opponent = match.joiner.equals(wallet.publicKey) ? match.creator : match.joiner;
    const [m, mine, theirs, settledTape] = await Promise.all([
      client.fetchMatch(match.address),
      client.fetchPosition(match.address, wallet.publicKey, false),
      client.fetchPosition(match.address, opponent, false),
      client.fetchTape(match.address),
    ]);
    if (m) setMatch(m);
    setTape(settledTape);
    if (mine) setMyPosition(mine);
    // After settlement the tape is public, so reading the opponent is
    // legitimate. Routed through the guard so the rule is enforced in one
    // place rather than trusted at each call site.
    setPhase('reveal');
    assertFogIntact('reveal', 'opponent position');
    if (theirs) setOpponentPosition(theirs);
  }, [client, match, wallet.publicKey]);

  const settle = useCallback(async () => {
    if (!client || !match || !wallet.publicKey || settledRef.current) return;
    if (!match.joiner) return;
    // The program will not settle a round whose clock is still running, and
    // the commit that starts settlement is not reversible: it takes both
    // positions off the rollup. Starting early therefore left the round
    // un-tradeable *and* unsettleable — the positions were home, request_settle
    // answered ROUND STILL RUNNING, and the player sat there until the buzzer
    // with a broken match and no reveal. So the clock is checked first.
    if (secondsLeft > 0) {
      toast.info(
        'THE ROUND IS STILL RUNNING',
        'Settlement opens at the buzzer — for anyone, not just you.'
      );
      return;
    }
    settledRef.current = true;
    setBusy(true);
    const step = (id: SettleStage['id'], state: SettleStage['state'], detail?: string) =>
      setSettleStages((prev) =>
        prev.map((x) => (x.id === id ? { ...x, state, detail: detail ?? x.detail } : x))
      );
    setSettleStages(SETTLE_STAGES.map((x) => ({ ...x })));
    try {
      // This player's own ACL comes off the rollup now that the round is over.
      // Nobody else can release it (see `releaseOwnAcl`), so each client does
      // its own, once, and settlement never waits on it.
      if (aclReleasedFor.current !== match.address.toBase58()) {
        aclReleasedFor.current = match.address.toBase58();
        void client.releaseOwnAcl(match.address, wallet.publicKey).catch(() => {
          aclReleasedFor.current = null;
        });
      }

      // One client settles: the creator's, at the buzzer. The joiner's waits
      // for the chain to show the round settled and steps in only if it has not
      // been within SETTLE_GRACE_MS — the creator may simply have closed the
      // tab. Both used to go at once, and the loser's copy of each step failed
      // on chain: a commit refused with 3007 on the rollup and a request_settle
      // refused with MatchNotLive on Solana, on every duel.
      if (!match.creator.equals(wallet.publicKey)) {
        step('commit', 'running', "waiting for the other player's client");
        const started = Date.now();
        let stallAt = started + SETTLE_STALL_MS;
        let seen = -1;
        while (Date.now() < stallAt && Date.now() - started < SETTLE_WAIT_CEILING_MS) {
          const p = await client
            .settleProgress(match.address, match.creator, match.joiner)
            .catch(() => null);
          if (p?.status === 'settled') {
            step('commit', 'done', 'committed by the other player');
            step('undelegate', 'done', 'both positions back under the program');
            step('settle', 'done', 'settled by the other player');
            await showReveal();
            return;
          }
          // The other client is visibly working — a position has landed back on
          // Solana, or the round has moved to Settling — so a slow settlement is
          // not an abandoned one, and the stall clock restarts.
          if (p && p.steps > seen) {
            if (seen >= 0) {
              stallAt = Date.now() + SETTLE_STALL_MS;
              step('commit', 'running', `the other player's client is settling (${p.steps}/5)`);
            }
            seen = p.steps;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        step('commit', 'running', 'the other client went quiet — settling from here');
      }
      // The rollup's own crank commits the round two seconds past the buzzer.
      // Committing from here at the same moment races it, and whichever copy
      // loses is refused on the rollup — so wait for the crank's commit to land,
      // and commit from this client only if it does not.
      let crankCommitted = false;
      {
        step('commit', 'running', "waiting for the rollup's crank");
        const deadline = Date.now() + (roundCranked.current ? CRANK_COMMIT_WAIT_MS : UNKNOWN_CRANK_WAIT_MS);
        while (Date.now() < deadline) {
          const p = await client
            .settleProgress(match.address, match.creator, match.joiner)
            .catch(() => null);
          if (p && p.steps >= 3) {
            crankCommitted = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (crankCommitted) {
        step('commit', 'done', "committed by the rollup's own crank");
      } else {
        step('commit', 'running');
        const commitSigs = await client.commitAndUndelegate(
          match.address, wallet.publicKey, match.creator, match.joiner
        );
        step('commit', 'done', `${commitSigs.length} tx on the rollup`);
      }

      // The commit is scheduled on the rollup and lands on L1 a moment later.
      // Settling before it does hands settle_match accounts still owned by the
      // delegation program, and the whole transaction is rejected.
      step('undelegate', 'running');
      const home = await client.waitForUndelegation(match.address, match.creator, match.joiner);
      if (!home) {
        step('undelegate', 'failed');
        throw new Error('The rollup did not commit both positions back in time.');
      }
      step('undelegate', 'done', 'both positions back under the program');

      step('settle', 'running');
      // Read before writing, for the same reason: the other client may have got
      // here first. `settle_match` needs the round in Settling, and asking again
      // for a round already there is refused on chain.
      const before = await client.fetchMatch(match.address).catch(() => null);
      if (before?.status === 'settled') {
        step('settle', 'done', 'settled by the other player');
        await showReveal();
        return;
      }
      if (before?.status !== 'settling') {
        await client.requestSettle(match.address, wallet.publicKey);
      }
      await client.settleMatch(match.address, wallet.publicKey, match.creator, match.joiner);
      step('settle', 'done', 'pot paid, tape written');

      await showReveal();
    } catch (e) {
      // Both clients can still end up settling — the joiner's takes over when
      // the creator's goes quiet, and a throttled tab can wake late — so one of
      // them can lose the race and have a transaction refused for a match that
      // is already Settled. That is
      // not a failure — the round finished, the pot was paid, and the loser of
      // the race may well be the player who won the duel. Played from two real
      // browser sessions, the winner was shown MATCH NOT LIVE three times and
      // never saw their own reveal, while 0.2 SOL arrived in their wallet.
      //
      // So the chain is asked before anything is called an error. This is the
      // same rule the sealing path follows: accept the outcome on evidence,
      // never on the assumption that it was probably the other player.
      const settled = await client
        .fetchMatch(match.address)
        .catch(() => null);
      if (settled?.status === 'settled') {
        step('settle', 'done', 'settled by the other player');
        settledRef.current = true;
        await showReveal();
        setBusy(false);
        return;
      }

      // Settling is several transactions across two chains, and the first
      // attempt genuinely can lose a race with the rollup's commit. Retry
      // quietly a couple of times before saying anything: the old behaviour
      // put TRANSACTION FAILED on screen and then settled successfully a few
      // seconds later, which reads as a broken app rather than a slow one.
      settleAttempts.current += 1;
      settledRef.current = false;
      if (settleAttempts.current < SETTLE_ATTEMPTS) {
        setBusy(false);
        await new Promise((r) => setTimeout(r, SETTLE_RETRY_MS));
        void settle();
        return;
      }
      const friendly = explainError(e);
      setSettleStages((prev) =>
        prev.map((x) => (x.state === 'running' ? { ...x, state: 'failed' } : x))
      );
      setError(friendly.title);
      toast.error(friendly.title, friendly.detail);
    } finally {
      setBusy(false);
    }
  }, [client, match, wallet.publicKey, toast, showReveal, secondsLeft]);

  useEffect(() => {
    if (phase === 'live' && secondsLeft === 0) void settle();
  }, [phase, secondsLeft, settle]);

  /**
   * Seal both positions and start the round.
   *
   * Sealing here rather than only in a script is what makes a match played
   * through the UI actually private: ACL, delegate the ACL, delegate the
   * position — and only then is anything traded.
   */
  const beginRound = useCallback(
    async (
      m: MatchState,
      creator: PublicKey,
      joiner: PublicKey,
      payer: PublicKey,
      role: 'sealer' | 'waiter' = 'sealer'
    ) => {
      // One client seals. Both used to — the joiner the moment it joined, the
      // creator the moment its poll saw a joiner — and reading the chain first
      // could not stop two clients reading "not yet" in the same instant. The
      // loser's seven transactions then failed on chain on every duel
      // (CreatePositionPermission refused as already in use, each delegation
      // refused with ExternalAccountDataModified), in exactly the history a
      // judge opens from the Explorer link.
      //
      // So the joiner seals — it is the client certain to be online at that
      // moment — and the creator waits for the chain to show the seal complete,
      // sealing itself only if that never happens.
      let sealedByOther = false;
      if (role === 'waiter') {
        const started = Date.now();
        let stallAt = started + SEAL_STALL_MS;
        let seen = -1;
        while (Date.now() < stallAt && Date.now() - started < SEAL_WAIT_CEILING_MS) {
          const p = await client!.sealProgress(m.address, creator, joiner).catch(() => null);
          if (p?.sealed) {
            sealedByOther = true;
            break;
          }
          // The joiner's client is visibly working, so a slow seal is not an
          // abandoned one: the stall clock restarts.
          if (p && p.steps > seen) {
            if (seen >= 0) stallAt = Date.now() + SEAL_STALL_MS;
            seen = p.steps;
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
      if (!sealedByOther) {
        // On a TEE rollup too, the delegated ACL is the read gate — there is no
        // extra step. init_position_privacy is the other way to seal a position,
        // and the rollup refuses it once this L1 permission exists.
        await client!.sealAndDelegateMatch(m.address, creator, joiner, payer);
      }
      setSealed(await client!.isPositionSealed(m.address, creator));

      // Hand the round's upkeep to the rollup: a keeper for blow-ups and a
      // buzzer that commits everything home, run by the rollup whether or not
      // either tab stays open. Both players' clients ask and the rollup keeps
      // the first. Best effort — if it fails, the browser keeper covers this
      // round exactly as it did before the rollup could.
      roundCranked.current = false;
      try {
        await client!.scheduleRoundCranks(m.address, payer);
        roundCranked.current = true;
      } catch {
        /* the browser keeper below covers this round */
      }

      // A session key, so the round costs one signature rather than one per
      // fill. Deliberately best-effort: sealing is the most failure-prone
      // moment in the product and this must not be able to break it. If the
      // mint fails for any reason the round proceeds signing every fill with
      // the wallet, which is exactly how it worked before.
      setSession(null);
      try {
        const sign = walletRef.current.signTransaction;
        if (sign) {
          const minted = await mintSession({
            connection: client!.l1,
            authority: payer,
            targetProgram: FOGDUEL_PROGRAM_ID,
            signTransaction: (tx) => sign(tx),
          });
          setSession(minted);
        }
      } catch {
        // No session this round. Nothing else changes.
      }

      settledRef.current = false;
      settleAttempts.current = 0;
      setLastFill(null);
      setPendingFill(null);
      setTape(null);
      setSettleStages(SETTLE_STAGES.map((x) => ({ ...x })));
      setMatch(m);
      setSeries([]);
      setEquity([0]);
      // Resume from where the clock actually is: a match that was joined while
      // we were polling has already been running for a second or two.
      setSecondsLeft(Math.max(0, m.duration - (Math.floor(Date.now() / 1000) - m.startTs)));
      // Decoration, and it must not cost the player their round. This read goes
      // through the rollup's front door, which refuses a client that has not
      // signed in yet — the norm for a creator who reloaded while their match
      // was open. Unguarded, the throw skipped `setPhase('live')`, the join
      // poller retried it every two seconds, and the creator sat on the
      // matchmaking screen while their own round ran and settled without them.
      try {
        setPrice(Number(await client!.fetchPrice(m.address, walletRef.current.publicKey!, true)));
      } catch {
        /* the crank posts a mark within MARK_CRANK_MS */
      }
      setPhase('live');
    },
    [client]
  );

  /**
   * Pick the round back up after a reload.
   *
   * A round runs for minutes and browsers get refreshed. Without this the
   * player lands in the lobby while their entry is still escrowed in a match
   * that is running without them — and the only thing that would eventually
   * free it is the settlement crank.
   *
   * Runs once per connected wallet. The positions are already sealed and
   * delegated by this point, so nothing is re-sent; this only restores what
   * the screen forgot.
   */
  const resumedFor = useRef<string | null>(null);
  const resuming = useRef(false);
  useEffect(() => {
    // From the lobby, and from matchmaking with nothing in hand. A landing can
    // move the phase before this has looked: an invite link for your own match
    // opens matchmaking straight away, and a creator who reloaded onto it was
    // left there — `phase !== 'lobby'` shut the door on the resume, so the round
    // they were already in ran and settled without them.
    if (!client || !wallet.publicKey) return;
    if (phase !== 'lobby' && !(phase === 'searching' && !matchRef.current)) return;
    const me = wallet.publicKey;
    const key = me.toBase58();
    if (resumedFor.current === key || resuming.current) return;
    resuming.current = true;

    let alive = true;
    void (async () => {
      try {
        const live = await client.fetchMyLiveMatch(me);
        if (alive && live) {
          settledRef.current = false;
          settleAttempts.current = 0;
          setMatch(live);
          // The picker is back at its default after a reload; put it back on
          // the size this round was actually opened at.
          setStake(live.entry / LAMPORTS_PER_SOL);
          setSeries([]);
          setEquity([0]);
          setSecondsLeft(Math.max(0, live.duration - (Math.floor(Date.now() / 1000) - live.startTs)));

          // Everything past here is decoration, and none of it may cost the
          // player their round.
          //
          // These two reads used to sit inline. `fetchPrice(…, fromEr = true)`
          // goes through the read gate, which refuses until this client has
          // signed in — and on a cold reload it frequently has not yet. The
          // throw skipped `setPhase('live')` entirely and dropped the player
          // into the lobby while their entry was still escrowed in a round
          // running without them, with the catch below swallowing the reason.
          // The mark arrives from the crank within five seconds anyway.
          try {
            setSealed(await client.isPositionSealed(live.address, live.creator));
          } catch {
            /* the badge reads NOT SEALED until the next poll says otherwise */
          }
          // The rollup is most likely cranking this round already, but a reload
          // forgets that, and the fallback liquidation probe then ran every five
          // seconds on top of the rollup's own keeper — 41 extra transactions in
          // one duel. Asking again is safe: the program times both cranks from
          // the match's own clock, replaces this wallet's tasks and leaves the
          // other player's alone. Not awaited, so it cannot delay the round.
          roundCranked.current = false;
          void client
            .scheduleRoundCranks(live.address, me)
            .then(() => {
              roundCranked.current = true;
            })
            .catch(() => {
              /* the browser keeper covers this round, as it did before */
            });
          try {
            setPrice(Number(await client.fetchPrice(live.address, me, true)));
          } catch {
            /* the crank posts a mark within MARK_CRANK_MS */
          }

          setPhase('live');
          resumedFor.current = key;
          return;
        }
        // No live round, but perhaps an unclaimed one still waiting.
        const open = await client.fetchMyOpenMatch(me);
        if (alive && open) {
          setMatch(open);
          setStake(open.entry / LAMPORTS_PER_SOL);
          setPhase('searching');
        }
        resumedFor.current = key;
      } catch {
        // Left unlatched on purpose: a cluster that was unreachable for this
        // one attempt should not permanently disable resuming for this wallet.
      } finally {
        resuming.current = false;
      }
    })();

    return () => {
      alive = false;
    };
  }, [client, wallet.publicKey, phase]);

  /* ----------------------------- transitions ----------------------------- */
  /**
   * Run an action, and say what really happened.
   *
   * Returning `'noop'` means the action correctly decided there was nothing to
   * do — and the success toast is then skipped. Without that, pressing CLOSE
   * with no position answered "POSITION CLOSED", which is a confirmation of
   * something that did not occur; a player who mis-clicks should be told
   * nothing happened, not congratulated for it.
   */
  /**
   * Warn before a live round is navigated away from or the tab closed.
   *
   * A round in progress holds real lamports in escrow and settles at the
   * buzzer whether or not anyone is watching, so leaving is not destructive —
   * but it is almost always accidental, and the player loses the ability to
   * trade the rest of their own round. The browser decides the wording; all a
   * page can do is ask for the prompt.
   *
   * Only while genuinely live: attaching this in the lobby would turn every
   * ordinary navigation into a dialog, which trains people to dismiss it.
   */
  useEffect(() => {
    if (phase !== 'live') return undefined;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Legacy browsers need a returnValue set; modern ones ignore the string.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

  const guard = useCallback(
    async (label: string, fn: () => Promise<GuardOutcome>) => {
      if (!client || !wallet.publicKey) {
        setError('Connect a wallet first.');
        toast.error('CONNECT A WALLET', 'Nothing can be signed without one.');
        return;
      }

      // A ref, not the `busy` state, because `busy` cannot stop this.
      // `setBusy(true)` schedules a render; a second click dispatched in the
      // same tick — a double-click, a stuck mouse, an impatient judge — runs
      // before that render lands, sees the button still enabled, and calls
      // straight through. Pressing LONG twice quickly really did produce two
      // fills at the same price and the same second, which is the player's
      // money spent twice. A ref flips synchronously and closes that window.
      if (inFlight.current) return;
      inFlight.current = true;

      setBusy(true);
      setError(null);
      try {
        // Retry only the failures where retrying is meaningful — a declined
        // signature or a self-join is final.
        const outcome = await withRetry(fn);
        if (outcome === 'noop') return;
        // An action that did something other than its headline says so itself:
        // CLOSE at 1/4 sells a quarter, and answering "POSITION CLOSED" to
        // that is the same overstatement as congratulating a no-op, one step
        // subtler — it claims more happened than did.
        toast.ok(outcome && typeof outcome === 'object' ? outcome.label : label);
      } catch (e) {
        const friendly = explainError(e);
        setError(friendly.title);
        toast.error(friendly.title, friendly.detail);
      } finally {
        inFlight.current = false;
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
  const openOrJoin = useCallback((createOnly: boolean) => {
    void guard(createOnly ? 'MATCH OPEN' : 'MATCH READY', async () => {
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
        // `return 'noop'`, not `throw`. Throwing sent this back through
        // `withRetry`, which reads an unrecognised Error as retryable and ran
        // the whole preflight three times — three balance reads and three
        // NOT ENOUGH SOL toasts for a wallet that is not going to grow — and
        // then the guard's catch replaced that exact sentence with
        // TRANSACTION FAILED, naming a transaction nothing had sent.
        toast.error(pre.title!, pre.detail);
        setError(pre.detail ? `${pre.title}. ${pre.detail}` : pre.title!);
        return 'noop';
      }
      await client!.ensureTreasury(me);

      // Opening on purpose skips the book entirely. A rematch is aimed at one
      // player, and joining a stranger's match instead would send the invite
      // link to a duel its recipient is not in.
      const open = createOnly ? [] : await client!.fetchOpenMatches();
      // Only join a match on the market you picked — otherwise "FIND MATCH"
      // silently drops you into somebody else's coin.
      // Stale matches are excluded here as well as in the book. `join_match`
      // refuses one older than MAX_OPEN_AGE, so auto-joining a stale row means
      // FIND MATCH fails against a book that is full of them — which is what a
      // quiet cluster looks like after an hour.
      const nowSecs = Math.floor(Date.now() / 1000);
      const joinable = open.find(
        (m) =>
          !m.creator.equals(me) &&
          m.entry === entryLamports &&
          nowSecs - m.createdTs <= MAX_OPEN_AGE_SECS
        // No market filter any more. Each player brings their own token, so
        // there is nothing the two sides have to agree on except the stake —
        // which makes the book far livelier than when a join required both
        // people to have independently wanted the same coin.
      );

      // Whichever way this goes, I am bringing my own market, so resolve it
      // once. The lobby lands on a market while it is mounted, but reaching
      // matchmaking before the feed answers leaves the selection null — so ask
      // the feed the same question the lobby would have.
      let market = selectedMarket;
      if (!market) {
        try {
          market = (await fetchMemeMarkets())[0] ?? null;
        } catch {
          market = null;
        }
        if (market) setSelectedMarket(market);
      }
      if (!market) {
        toast.error('NO MARKET TO TRADE', 'The market feed is not answering, so there is nothing to open a duel on.');
        setError('The market feed is not answering.');
        return 'noop';
      }

      // Re-read the price rather than using the one in the list. The list
      // refreshes every 20 seconds and freezes at whatever it last saw when
      // the feed goes down, so a cached number could be any age — and this one
      // becomes my round's opening mark and seeds my private book. If the feed
      // cannot answer, the match does not open.
      let startPx: bigint;
      try {
        startPx = await livePxFor(market);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        // This used to `setError` and return, after which the guard toasted
        // MATCH READY over the top of it — the app announcing success for a
        // match it had just failed to open.
        toast.error(`NO PRICE FOR ${market.symbol}`, why);
        setError(`Could not read a live price for ${market.symbol}: ${why}`);
        return 'noop';
      }

      const myLeg = {
        mint: new PublicKey(market.mint),
        startPx,
        marketType: market.kind,
        symbol: market.symbol,
        name: market.name,
      };

      let target: PublicKey;
      let creator: PublicKey;

      if (joinable) {
        await client!.joinMatch(joinable.address, me, joinable.creator, myLeg);
        target = joinable.address;
        creator = joinable.creator;
      } else {
        const matchId = Math.floor(Date.now() / 1000);
        target = await client!.createMatch({
          creator: me,
          matchId,
          mint: myLeg.mint,
          durationSecs: openDuration,
          entryLamports,
          startPx,
          marketType: market.kind,
          symbol: market.symbol,
          name: market.name,
        });
        creator = me;
        // An unjoined match cannot start. Stay in matchmaking until someone
        // joins; the lobby polls for it.
        setMatch(await client!.fetchMatch(target));
        return;
      }

      const m = await client!.fetchMatch(target);
      if (!m || !m.joiner) return;
      await beginRound(m, creator, m.joiner, me);
    });
    // `openDuration` belongs here. Without it this callback captures whatever
    // the round length was on first render and opens every match at that,
    // however many times the picker is pressed — the same stale-closure bug
    // that once let `joinMatchByAddress` omit `selectedMarket` and join a WOFI
    // match while the lobby showed SOL, which was invisible until the settled
    // tape named the wrong token.
  }, [guard, client, wallet.publicKey, entryLamports, selectedMarket, openDuration, beginRound, toast]);

  /** FIND MATCH: join a compatible match off the book, or open one if there is none. */
  const startMatch = useCallback(() => openOrJoin(false), [openOrJoin]);

  /**
   * Open a match and wait for a particular opponent, never joining one.
   *
   * FIND MATCH joins the first compatible match on the book before it opens
   * its own — right for a stranger, wrong for a rematch aimed at one player,
   * where it could drop the loser into somebody else's duel instead of opening
   * the one the invite link is for.
   */
  const openMatch = useCallback(() => openOrJoin(true), [openOrJoin]);

  /**
   * Watch a match we opened until somebody takes it.
   *
   * Without this the creator waits forever: an unjoined match cannot start, so
   * `startMatch` returns after creating one and nothing was then looking for
   * the opponent. Pressing the button again would not have helped either —
   * the open book excludes your own matches, so it would have opened a second.
   */
  useEffect(() => {
    if (phase !== 'searching' || !client || !match || match.joiner || !wallet.publicKey) {
      return undefined;
    }
    const me = wallet.publicKey;
    const address = match.address;
    let alive = true;

    // Guards against a slow seal being started twice by two ticks. Not the
    // interval id: clearing that before the work meant a failed seal stopped
    // the watch for good and left the player sitting on MATCHING with no idea
    // why, because the error was swallowed as "transient".
    let starting = false;

    const id = setInterval(async () => {
      if (starting) return;
      try {
        const m = await client.fetchMatch(address);
        if (!alive || !m?.joiner || m.status !== 'live') return;
        starting = true;
        await beginRound(m, m.creator, m.joiner, me, 'waiter');
        clearInterval(id);
      } catch (e) {
        starting = false;
        const friendly = explainError(e);
        setError(friendly.title);
        toast.error(friendly.title, friendly.detail);
      }
    }, 2000);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [phase, client, match, wallet.publicKey, beginRound, toast]);

  /**
   * One fill, signed by the session key when there is one.
   *
   * The session key signs on the owner's behalf, so the position is still the
   * owner's and the tape still records their fill — the key is a signature
   * mechanism, not an identity. If the session has expired or the session
   * program refuses for any reason, this falls back to the wallet and the
   * round continues; a session is an optimisation, never a requirement.
   */
  const fill = useCallback(
    async (side: 'buy' | 'sell', amount: number, markBefore: bigint) => {
      const me = wallet.publicKey!;
      const address = match!.address;
      const entry = match!.entry;

      // Optimistic (PLAN 7.15): drawn now, at what the book will charge for
      // this size at the mark just read, and replaced by the chain's own fill
      // when it lands. Set only here, after every caller's "nothing to do"
      // check has returned, so a press that sends no transaction draws nothing.
      const mark = Number(markBefore);
      const id = Date.now() + Math.random();
      if (mark > 0 && amount > 0) {
        setPendingFill({
          id,
          side,
          state: 'pending',
          markBefore: mark,
          px: side === 'buy' ? buyExecPx(amount, mark, entry) : sellExecPx(amount, mark, entry),
          qty: side === 'buy' ? buyBaseOut(amount, mark, entry) : amount,
        });
      }
      /** Change this fill's prediction only, never a newer one's. */
      const mine = (update: (p: PendingFill) => PendingFill | null) =>
        setPendingFill((p) => (p && p.id === id ? update(p) : p));

      const viaWallet = async () => {
        await client!.applyFill(address, me, side, amount);
      };

      try {
        if (session && session.validUntil > Math.floor(Date.now() / 1000)) {
          try {
            await client!.applyFillAs(address, session, me, side, amount);
          } catch {
            // The session did not work. Drop it so the rest of the round does
            // not keep retrying a key the program will not accept, and sign this
            // fill with the wallet instead.
            setSession(null);
            await viaWallet();
          }
        } else {
          await viaWallet();
        }
      } catch (e) {
        // Rolled back: the prediction is marked refused, stays long enough to
        // be read, and goes. The error still reaches `guard`, whose toast says why.
        mine((p) => ({ ...p, state: 'refused' }));
        setTimeout(() => mine(() => null), PENDING_REFUSED_MS);
        throw e;
      }

      try {
        const position = await client!.fetchPosition(address, me, true);
        if (position) {
          setMyPosition(position);
          noteFill(position, Number(markBefore), side);
        }
      } finally {
        // Reconciled: the confirmed fill is the receipt now.
        mine(() => null);
      }
    },
    [client, match, wallet.publicKey, session, noteFill]
  );

  const openLong = useCallback(() => {
    void guard('LONG FILLED', async () => {
      if (!match) return 'noop';
      // Spend a slice of what is left, in quote units.
      const quote = myPosition?.quoteBalance ?? match.entry;
      const spend = Math.floor(quote * fillSize);
      // Nothing left to spend. This used to floor to a 1-lamport buy and send
      // it, which the program refuses for a position with no quote — a doomed
      // transaction, and a button that appeared to do nothing at all.
      if (spend <= 0) {
        toast.error('NOTHING LEFT TO LONG', 'Your whole entry is already in the position. Close some of it first.');
        return 'noop';
      }
      const markBefore = await client!.fetchPrice(match.address, wallet.publicKey!, true);
      await fill('buy', spend, markBefore);
    });
  // `fill`, not `noteFill`: `fill` is what these call, and it changes when a
  // session key is minted. Listing the wrong one kept a LONG pressed in the
  // first second after minting signing through the wallet instead.
  }, [guard, client, match, myPosition, wallet.publicKey, fillSize, fill, toast]);

  /**
   * Sell what you do not own.
   *
   * The mirror of LONG. LONG spends a slice of the quote you are holding;
   * SHORT sells a slice of the largest position your equity can carry, which
   * is the same one-times-collateral bound the program enforces. Sizing it off
   * anything else would let the picker offer a trade the chain then refuses.
   */
  const openShort = useCallback(() => {
    void guard('SHORT FILLED', async () => {
      if (!match) return 'noop';
      const markBefore = await client!.fetchPrice(match.address, wallet.publicKey!, true);
      const mark = Number(markBefore);
      if (mark <= 0) {
        toast.error('NO MARK YET', 'The round has no posted price to short against.');
        return 'noop';
      }
      const equity = myPosition
        ? myPosition.quoteBalance + (myPosition.baseQty * mark) / VALUE_DIV
        : match.entry;
      // Room left before the program's own cap, in base units.
      //
      // Not `equity / mark`: that is the cap on the *notional*, and a short
      // pays its own impact out of the equity being measured against, so
      // sizing to it overshoots by exactly that impact. `maxShortBase` solves
      // the cap instead of approximating it — see book.ts.
      const capacity = maxShortBase(myPosition?.baseQty ?? 0, equity, mark, match.entry);
      const qty = Math.floor(capacity * fillSize);
      if (qty <= 0) {
        toast.error('NO ROOM TO SHORT', 'Your equity is already fully committed. Close some of it first.');
        return 'noop';
      }
      await fill('sell', qty, markBefore);
    });
  // `fill`, not `noteFill`: `fill` is what these call, and it changes when a
  // session key is minted. Listing the wrong one kept a LONG pressed in the
  // first second after minting signing through the wallet instead.
  }, [guard, client, match, myPosition, wallet.publicKey, fillSize, fill, toast]);

  /**
   * Reduce whatever is open, whichever way it points.
   *
   * A long closes by selling and a short closes by buying, so the side depends
   * on the position rather than on the button. Buying back a short spends
   * quote, so the amount handed to the program is quote for that direction and
   * base for the other — the two sides of `apply_fill` take different units.
   */
  const closeLong = useCallback(() => {
    void guard('POSITION CLOSED', async () => {
      if (!match) return 'noop';
      if (!myPosition || myPosition.baseQty === 0) {
        toast.info('NOTHING TO CLOSE', 'You are flat — there is no position to close.');
        return 'noop';
      }
      // The same size control governs both directions, so a partial close is
      // a real move rather than all-or-nothing. MAX closes the exact remaining
      // base — a rounded-down fraction of it would strand dust that the
      // program would then have to close at the buzzer.
      const whole = fillSize >= 1;
      const open = Math.abs(myPosition.baseQty);
      const qty = whole ? open : Math.max(1, Math.floor(open * fillSize));
      const markBefore = await client!.fetchPrice(match.address, wallet.publicKey!, true);

      if (myPosition.baseQty > 0) {
        await fill('sell', qty, markBefore);
      } else {
        // Buying back: `apply_fill`'s buy side consumes quote, so the size has
        // to be inverted through the curve rather than valued at the mark.
        // Multiplying by the mark ignores the impact of the buy itself, and
        // bought back less than was sold — a MAX close reported POSITION
        // CLOSED with 0.8% of the short still open.
        const mark = Number(markBefore);
        const quoteIn = quoteToBuyBase(qty, mark, match.entry);
        const spend = Math.min(quoteIn, myPosition.quoteBalance);
        if (spend <= 0) {
          toast.error('NOT ENOUGH TO COVER', 'There is no quote left to buy the short back with.');
          return 'noop';
        }
        await fill('buy', spend, markBefore);
      }
      // Only MAX actually leaves you flat.
      return whole
        ? undefined
        : { label: `CLOSED ${Math.round(fillSize * 100)}% OF POSITION` };
    });
  }, [guard, client, match, myPosition, wallet.publicKey, fillSize, fill, toast]);

  /** Take a specific match off the book, on whatever market I have picked. */
  const joinMatchByAddress = useCallback(
    (address: string, creator: string) => {
      void guard('MATCH JOINED', async () => {
        const me = wallet.publicKey!;
        const target = new PublicKey(address);
        const creatorKey = new PublicKey(creator);

        // I bring my own token. Joining says nothing about what the creator
        // chose — that is the point of the new matchmaking.
        const market = selectedMarket ?? (await fetchMemeMarkets())[0] ?? null;
        if (!market) {
          toast.error('NO MARKET TO TRADE', 'The market feed is not answering, so there is nothing to trade with.');
          return 'noop';
        }
        let startPx: bigint;
        try {
          startPx = await livePxFor(market);
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          toast.error(`NO PRICE FOR ${market.symbol}`, why);
          return 'noop';
        }

        await client!.joinMatch(target, me, creatorKey, {
          mint: new PublicKey(market.mint),
          startPx,
          marketType: market.kind,
          symbol: market.symbol,
          name: market.name,
        });
        const m = await client!.fetchMatch(target);
        if (!m || !m.joiner) return;
        // Taking someone else's match takes their size; show it.
        setStake(m.entry / LAMPORTS_PER_SOL);

        // `beginRound`, not a second copy of it. This block used to repeat the
        // seal-and-start sequence inline, and the two drifted: the session key
        // added to `beginRound` was never minted for a joiner, so one side of
        // every duel silently signed each fill with its wallet.
        await beginRound(m, creatorKey, m.joiner, me);
      });
    },
    // `selectedMarket` belongs here: without it this callback closes over the
    // value from first render, which is null, and every join silently fell
    // back to the top meme. A player who picked SOL joined on WOFI and the
    // only place it showed was the settled tape.
    [guard, client, wallet.publicKey, beginRound, selectedMarket, toast]
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

  /**
   * Go again on the same market, at the same size.
   *
   * This used to reset state and drop the player in matchmaking, which is
   * "play again" rather than "rematch" — the market and stake they had just
   * been playing were both forgotten. It now carries both over and opens the
   * match, so the button does what its label says.
   *
   * The price is not carried over: `startMatch` re-reads it, because a mark
   * from the round that just ended is exactly the sort of stale number that
   * should never open a new one.
   */
  const rematch = useCallback(() => {
    const previous = match;
    setSealed(false);
    setMyPosition(null);
    setOpponentPosition(null);
    setSeries([]);
    setEquity([0]);
    setLastFill(null);
    setPendingFill(null);
    settledRef.current = false;
    settleAttempts.current = 0;
    setMatch(null);

    if (previous) {
      setStake(previous.entry / LAMPORTS_PER_SOL);
      const prevLeg = legFor(previous, wallet.publicKey);
      setSelectedMarket((current) =>
        !prevLeg || (current && current.mint === prevLeg.mint.toBase58())
          ? current
          : {
              kind: prevLeg.marketType,
              mint: prevLeg.mint.toBase58(),
              symbol: prevLeg.symbol,
              name: prevLeg.name,
              imageUri: null,
              priceSol: 0,
              priceUsd: 0,
              // Re-read at open time; never reused from the finished round.
              startPx: 0n,
              source: prevLeg.marketType === 'major' ? 'jupiter' : 'pump.fun',
              usdMarketCap: 0,
            }
      );
    }
    setPhase('searching');
  }, [match, wallet.publicKey]);

  const backToLobby = useCallback(() => {
    setSession(null);
    setSealed(false);
    setMatch(null);
    setPhase('lobby');
  }, []);

  /* ------------------------------- derived ------------------------------- */
  const myPnl = match && myPosition ? pnlBps(myPosition, price, match.entry) / 100 : 0;

  const iAmCreator = !!(match && wallet.publicKey && match.creator.equals(wallet.publicKey));
  const opponentKey =
    match && wallet.publicKey && match.joiner ? (iAmCreator ? match.joiner : match.creator) : null;
  const opponentPnl = match
    ? bpsToPct(iAmCreator ? match.pnlBBps : match.pnlABps)
    : 0;

  /**
   * What the chosen size would cost, quoted before the fill is signed.
   *
   * Exact rather than estimated: `apply_fill` re-pegs the book to the mark
   * first and rebuilds depth to `entry * BOOK_DEPTH`, which leaves the impact
   * of a size a closed form. check:tape asserts these against the execution
   * prices really recorded on every settled tape.
   */
  /** My side's market. Null in the lobby, where there is no match yet. */
  const myLeg = useMemo(() => legFor(match, wallet.publicKey ?? null), [match, wallet.publicKey]);
  /**
   * Their side's market.
   *
   * Public, and deliberately so: `join_match` writes the joiner's leg into the
   * match account on L1, where any RPC can read it. Only the *position* is
   * sealed. Withholding the ticker here would imply the chain keeps a secret
   * it does not keep.
   */
  const opponentLeg = useMemo(() => legFor(match, opponentKey), [match, opponentKey]);

  const sizeNote = useMemo(() => {
    if (!match) return undefined;
    const holding = (myPosition?.baseQty ?? 0) > 0;
    if (holding && price > 0) {
      const qty =
        fillSize >= 1 ? myPosition!.baseQty : Math.floor(myPosition!.baseQty * fillSize);
      const cost = sellImpact(qty, price, match.entry) * 100;
      const spend = Math.floor((myPosition?.quoteBalance ?? match.entry) * fillSize);
      // "LONGING COSTS 0.00%" is true of a fill that cannot happen, which
      // reads as free rather than as impossible.
      const longPart =
        spend > 0
          ? `LONGING COSTS ${(buyImpact(spend, match.entry) * 100).toFixed(2)}%`
          : 'NOTHING LEFT TO LONG';
      return `CLOSING THAT COSTS ${cost.toFixed(2)}% · ${longPart}`;
    }
    const spend = Math.floor((myPosition?.quoteBalance ?? match.entry) * fillSize);
    return `THAT SIZE COSTS ${(buyImpact(spend, match.entry) * 100).toFixed(2)}% IN IMPACT`;
  }, [match, myPosition, fillSize, price]);

  /**
   * The rivalry, recounted from the chain whenever the phase changes — which
   * includes arriving at the reveal, so the duel just settled is in the count.
   */
  const headToHead = useHeadToHead(wallet.publicKey ?? null, opponentKey, phase);

  /**
   * Each fill named for what it did to the position.
   *
   * The side alone cannot say: a sell closes a long or opens a short, and a buy
   * opens a long or covers a short. This used to read every SELL as CLOSE and
   * every BUY as LONG, so an opening short sat on your own tape as a close while
   * the public tape said SELL.
   *
   * Replayed forward from where the position stood before the oldest fill still
   * listed. The program keeps only the last sixteen, so when the list is short
   * of the count that starting point is worked back from what is held now.
   */
  const fills: Fill[] = useMemo(() => {
    const list = myPosition?.fills ?? [];
    const trades = list.filter((f) => f.side === 'BUY' || f.side === 'SELL');
    const complete = list.length >= (myPosition?.fillCount ?? 0) || trades.length !== list.length;
    let held = complete
      ? 0
      : (myPosition?.baseQty ?? 0) - trades.reduce((sum, f) => sum + (f.side === 'BUY' ? f.qty : -f.qty), 0);
    return list
      .map((f) => {
        const before = held;
        let side: string;
        if (f.side === 'BUY') {
          held += f.qty;
          side = before < 0 ? (held > 0 ? 'FLIP LONG' : 'COVER') : 'LONG';
        } else if (f.side === 'SELL') {
          held -= f.qty;
          side = before > 0 ? (held < 0 ? 'FLIP SHORT' : 'CLOSE') : 'SHORT';
        } else {
          held = 0;
          side = f.side === 'LIQUIDATION' ? 'LIQUIDATED' : 'SETTLE';
        }
        return {
          side,
          px: formatSolPrice(f.px),
          t: mmss(Math.max(0, (match?.startTs ?? 0) + (match?.duration ?? 0) - f.ts)),
        };
      })
      .reverse();
  }, [myPosition, match]);

  return {
    phase,
    stake,
    balance,
    secondsLeft,
    series,
    equity,
    price,
    position: myPosition && myPosition.baseQty !== 0 ? { px: myPosition.avgPx } : null,
    myPnl,
    // Both directions. This tested `baseQty > 0`, so every short — the whole
    // half of the product added in v2 — reported itself as FLAT while it was
    // open, on the one readout whose job is to say what you are holding.
    positionLabel:
      myPosition && myPosition.baseQty !== 0
        ? `${myPosition.baseQty > 0 ? 'LONG' : 'SHORT'} FROM ${formatSolPrice(myPosition.avgPx)}`
        : 'FLAT',
    mySide: ((myPosition?.baseQty ?? 0) > 0
      ? 'long'
      : (myPosition?.baseQty ?? 0) < 0
        ? 'short'
        : 'flat') as 'long' | 'short' | 'flat',
    fills,
    // Whichever side of the match is not you. It used to name the joiner and
    // nobody else, so a player who had *joined* someone's match spent the whole
    // round being told they were still AWAITING OPPONENT.
    opponentName: opponentKey ? `${opponentKey.toBase58().slice(0, 6)}…` : OPPONENT_PENDING,
    opponentPnl,
    // Mid-round the opponent exposes nothing at all — not a size, not a side,
    // not a count. The position is only read at the reveal, once it is public,
    // so this is null until then rather than a zero standing in for it.
    opponentFills: opponentPosition ? opponentPosition.fillCount : null,
    pot,
    potGross,
    entrySol: match ? match.entry / LAMPORTS_PER_SOL : stake,
    won: match?.winner ? !!(wallet.publicKey && match.winner.equals(wallet.publicKey)) : false,
    connected,
    busy,
    sealed,
    // Straight off the match account. The old lookup table could only name
    // three mints and called everything else by its address.
    market: myLeg?.symbol || marketLabel(myLeg?.mint ?? DEMO_MINT),
    marketMint: myLeg?.mint.toBase58() ?? '',
    // The logo is not on chain — only the symbol, name and mint are. It comes
    // from whichever market list the player picked from, matched by mint.
    marketImageUri: selectedMarket && myLeg && selectedMarket.mint === myLeg.mint.toBase58()
      ? selectedMarket.imageUri
      : null,
    marketSource: myLeg?.marketType === 'major' ? 'jupiter' : 'pump.fun',
    opponentAddress: opponentKey ? opponentKey.toBase58() : null,
    opponentMarket: opponentLeg?.symbol || (opponentLeg ? marketLabel(opponentLeg.mint) : ''),
    opponentMarketMint: opponentLeg?.mint.toBase58() ?? '',
    // In SOL, not USD: the entry, the pot and the PnL are all lamports, so a
    // mark in dollars would be the only number on the screen in a different
    // currency. The picker quotes USD, where market cap is what identifies a
    // coin — here what matters is what a token costs against the stake.
    priceLabel: `${formatSolPrice(price)}◎`,
    lastFill,
    pendingFill,
    sizeNote,
    sessionActive: !!session && session.validUntil > Math.floor(Date.now() / 1000),
    settleStages,
    tape,
    record: describeRecord(headToHead),
    isPlayerA: !!(match && wallet.publicKey && match.creator.equals(wallet.publicKey)),
    entryLamports: match?.entry ?? 0,
    startTs: match?.startTs ?? 0,
    duration: match?.duration ?? 0,
    selectedMarket,
    selectMarket: setSelectedMarket,
    /** Hand a mint from `?market=<mint>`; resolved and selected once. */
    openMarketByMint: setDeepLinkMint,
    liquidated,
    teeEnforced: ACTIVE_CLUSTER.tee,
    error,
    matchAddress: match?.address.toBase58() ?? null,
    myAddress: wallet.publicKey?.toBase58() ?? null,
    fillSize,
    setFillSize,
    setStake,
    openDuration,
    setOpenDuration,
    findMatch,
    startMatch,
    openMatch,
    openLong,
    openShort,
    closeLong,
    settleNow: () => void settle(),
    rematch,
    backToLobby,
    joinMatch: joinMatchByAddress,
    cancelMatch: cancelMatchByAddress,
  };
}
