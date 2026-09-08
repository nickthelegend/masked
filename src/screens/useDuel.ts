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
import { buyImpact, maxShortBase, quoteToBuyBase, sellImpact } from '../chain/book';
import { useHeadToHead, describeRecord } from '../chain/useHeadToHead';
import { fetchMemeMarkets, livePxFor, type TradableMarket } from '../chain/markets';
import { mintSession, type ActiveSession } from '../chain/session';
import { ACTIVE_CLUSTER } from '../chain/config';
import { DEMO_MINT, marketLabel } from '../chain/market';
import { OPPONENT_PENDING, RAKE, ROUND_SECONDS } from './data';

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
/**
 * How often the live market price is posted on chain.
 *
 * Faster than the 5%/second cap would just be rejected, and pump.fun does not
 * thank anyone for a request a second either.
 */
const MARK_CRANK_MS = 5000;
/** How often the header balance is re-read. */
const BALANCE_POLL_MS = 5000;

/**
 * Settling spans two chains and several transactions, and the first go can
 * lose a race with the rollup's commit. Retry before alarming anyone.
 */
const SETTLE_ATTEMPTS = 3;
const SETTLE_RETRY_MS = 4000;

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
  pot: number;
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
  findMatch: () => void;
  startMatch: () => void;
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

  const [selectedMarket, setSelectedMarket] = useState<TradableMarket | null>(null);
  const [phase, setPhase] = useState<DuelPhase>('lobby');
  const [stake, setStake] = useState(0.1); // SOL
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

  const settledRef = useRef(false);
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
  const pot = match ? (match.pot / LAMPORTS_PER_SOL) * (1 - RAKE) : stake * 2 * (1 - RAKE);

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
    if (!client || !match || phase !== 'live' || !wallet.publicKey) return undefined;

    let alive = true;
    const id = setInterval(async () => {
      try {
        // My own feed. The opponent has their own token and their own mark,
        // and neither is any of my business until the reveal.
        const [m, pxRaw, mine] = await Promise.all([
          client.fetchMatch(match.address),
          client.fetchPrice(match.address, wallet.publicKey!, true),
          client.fetchPosition(match.address, wallet.publicKey!, true),
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
    if (!client || !m0 || phase !== 'live' || !wallet.publicKey) {
      return undefined;
    }
    // My market, not the match's — there is no such thing any more.
    const mine = legFor(m0, wallet.publicKey);
    if (!mine || !mine.symbol) return undefined;
    const mint = mine.mint.toBase58();
    const kind = mine.marketType;
    const address = m0.address;

    let alive = true;
    const ac = new AbortController();

    const opponent = m0.creator.equals(wallet.publicKey) ? m0.joiner : m0.creator;

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
        await client.crankPrice(address, wallet.publicKey!, px, wallet.publicKey!, false);
      } catch {
        // The market API or the rate limit said no. The next tick tries again;
        // a failed crank must never interrupt a round in progress.
      }

      // Then look for a blow-up, on both sides.
      //
      // On the rollup, because that is where positions live. Permissionless
      // and harmless against a solvent position, so this fires blind rather
      // than reading anything private first — which it could not do anyway,
      // since the opponent's position is sealed to us.
      try {
        if (!alive) return;
        await Promise.all(
          [wallet.publicKey!, opponent]
            .filter((k): k is PublicKey => !!k)
            .map((owner) => client.liquidate(address, wallet.publicKey!, owner).catch(() => {}))
        );
        const status = await client.fetchRoundStatus(address, true);
        if (alive && status) {
          const iAmCreator = m0.creator.equals(wallet.publicKey!);
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
      step('commit', 'running');
      const commitSigs = await client.commitAndUndelegate(
        match.address, wallet.publicKey, match.creator, match.joiner
      );
      step('commit', 'done', `${commitSigs.length} tx on the rollup`);

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
      await client.requestSettle(match.address, wallet.publicKey);
      await client.settleMatch(match.address, wallet.publicKey, match.creator, match.joiner);
      step('settle', 'done', 'pot paid, tape written');

      await showReveal();
    } catch (e) {
      // Both players' clients settle, so one of them loses the race and its
      // transaction is refused for a match that is already Settled. That is
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
    async (m: MatchState, creator: PublicKey, joiner: PublicKey, payer: PublicKey) => {
      await client!.sealAndDelegateMatch(m.address, creator, joiner, payer);
      if (ACTIVE_CLUSTER.tee) {
        // TEE clusters take the extra ephemeral-permission step that turns the
        // ACL into an enforced read gate.
        for (const owner of [creator, joiner]) {
          await client!.initPositionPrivacy(m.address, owner, payer);
        }
      }
      setSealed(await client!.isPositionSealed(m.address, creator));

      // A session key, so the round costs one signature rather than one per
      // fill. Deliberately best-effort: sealing is the most failure-prone
      // moment in the product and this must not be able to break it. If the
      // mint fails for any reason the round proceeds signing every fill with
      // the wallet, which is exactly how it worked before.
      setSession(null);
      try {
        const sign = wallet.signTransaction;
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
      setTape(null);
      setSettleStages(SETTLE_STAGES.map((x) => ({ ...x })));
      setMatch(m);
      setSeries([]);
      setEquity([0]);
      // Resume from where the clock actually is: a match that was joined while
      // we were polling has already been running for a second or two.
      setSecondsLeft(Math.max(0, m.duration - (Math.floor(Date.now() / 1000) - m.startTs)));
      setPrice(Number(await client!.fetchPrice(m.address, wallet.publicKey!, true)));
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
  useEffect(() => {
    if (!client || !wallet.publicKey || phase !== 'lobby') return;
    const me = wallet.publicKey;
    const key = me.toBase58();
    if (resumedFor.current === key) return;
    resumedFor.current = key;

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
          setSealed(await client.isPositionSealed(live.address, live.creator));
          setSeries([]);
          setEquity([0]);
          setSecondsLeft(Math.max(0, live.duration - (Math.floor(Date.now() / 1000) - live.startTs)));
          setPrice(Number(await client.fetchPrice(live.address, me, true)));
          setPhase('live');
          return;
        }
        // No live round, but perhaps an unclaimed one still waiting.
        const open = await client.fetchMyOpenMatch(me);
        if (alive && open) {
          setMatch(open);
          setStake(open.entry / LAMPORTS_PER_SOL);
          setPhase('searching');
        }
      } catch {
        // Nothing to resume, or the cluster is unreachable. The lobby is a
        // fine place to land either way.
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

      const open = await client!.fetchOpenMatches();
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
          durationSecs: ROUND_SECONDS,
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
  }, [guard, client, wallet.publicKey, entryLamports, selectedMarket, beginRound]);

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
        await beginRound(m, m.creator, m.joiner, me);
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

      const viaWallet = async () => {
        await client!.applyFill(address, me, side, amount);
      };

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

      const mine = await client!.fetchPosition(address, me, true);
      if (mine) {
        setMyPosition(mine);
        noteFill(mine, Number(markBefore), side);
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
  }, [guard, client, match, myPosition, wallet.publicKey, fillSize, noteFill, toast]);

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
  }, [guard, client, match, myPosition, wallet.publicKey, fillSize, noteFill, toast]);

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
  }, [guard, client, match, myPosition, wallet.publicKey, fillSize, toast]);

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

  const fills: Fill[] = (myPosition?.fills ?? []).map((f) => ({
    side: f.side === 'BUY' ? 'LONG' : f.side === 'SELL' ? 'CLOSE' : 'SETTLE',
    px: formatSolPrice(f.px),
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
    liquidated,
    teeEnforced: ACTIVE_CLUSTER.tee,
    error,
    matchAddress: match?.address.toBase58() ?? null,
    myAddress: wallet.publicKey?.toBase58() ?? null,
    fillSize,
    setFillSize,
    setStake,
    findMatch,
    startMatch,
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
