import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import {
  ArenaChart,
  Badge,
  Box,
  EndingIn,
  FillTape,
  Orb,
  orbStateForPnl,
  PixelButton,
  PotentialEarnings,
  RankRow,
  SizePicker,
  PixelPanel,
  PixelText,
  PnLOdometer,
  PotPill,
  Row,
  FillReceipt,
  SettleProgress,
  Stack,
  TokenLogo,
  color,
  space,
} from '../ui';
import type { Fill, PriceSource } from '../ui';
import { FRAME_MS, USE_NATIVE_DRIVER, useReducedMotion } from '../ui/motion';

export interface LiveRoundScreenProps {
  secondsLeft: number;
  pot: number;
  /**
   * Your PnL curve, in percent — not the price tape.
   *
   * The arena plots what you have made, because that is what the round is
   * scored on. A price line would be the same shape for both players and would
   * say nothing about who is winning.
   */
  equity: number[];
  price: number;
  myPnl: number;
  positionLabel: string;
  opponentName: string;
  /** Null while the count is unreadable — see useDuel. */
  opponentFills: number | null;
  fills: Fill[];
  onLong: () => void;
  /** Sell what you do not own. The mirror of onLong. */
  onShort: () => void;
  onClose: () => void;
  /**
   * Whether either side has been force-closed for running out of equity.
   *
   * The one thing about a live round that is not fogged: a blow-up is
   * announced while it is still running, by decision.
   */
  liquidated?: { me: boolean; opponent: boolean };
  /** Fraction of what is available a fill uses, 0..1. */
  fillSize: number;
  onFillSize: (fraction: number) => void;
  /** What that size would cost against the current mark, already computed. */
  sizeNote?: string;
  /** Fills are signed by a Gum session key rather than by the wallet. */
  sessionActive?: boolean;
  onSkip: () => void;
  busy?: boolean;
  error?: string | null;
  /** Both positions carry an on-chain ACL. Read from chain, not assumed. */
  sealed?: boolean;
  /** Ticker, read off the match account. */
  market?: string;
  /** The mint being traded, for the logo. */
  marketMint?: string;
  /** The market's logo, when its feed publishes one. */
  marketImageUri?: string | null;
  /** Where the mark comes from, named on screen rather than implied. */
  marketSource?: PriceSource;
  /** Formatted mark. The raw px is a scaled integer — see chain/units.ts. */
  priceLabel?: string;
  /** What settlement is doing. Shown once the clock hits zero. */
  settleStages?: Array<{
    id: string;
    label: string;
    note: string;
    state: 'waiting' | 'running' | 'done' | 'failed';
    detail?: string;
  }>;
  /** What the book charged for the most recent fill. */
  lastFill?: {
    side: 'buy' | 'sell';
    price: string;
    mark: string;
    impactPct: number;
    at: number;
  } | null;
  /** Whether this cluster enforces that ACL at read time (TEE only). */
  teeEnforced?: boolean;
  /** Your wallet, shortened, for the board row. */
  myName?: string;
  /** Which way you are facing. Theirs is sealed and is never passed in. */
  mySide?: 'long' | 'short' | 'flat';
  /** Their ticker and mint — read off the match account, not the position. */
  opponentMarket?: string;
  opponentMarketMint?: string;
  /** What taking this round pays, net of rake, already formatted. */
  payout?: string;
  /** Trophies a win is worth. */
  trophies?: number;
  /** Seconds since the round opened, for the chart's x-axis. */
  elapsed?: number;
}

/**
 * The live round. Your side is fully legible; theirs shows a fill count and
 * nothing else, which is the entire premise of the mode.
 */
export default function LiveRoundScreen({
  secondsLeft,
  pot,
  equity,
  price,
  myPnl,
  positionLabel,
  opponentName,
  opponentFills,
  fills,
  onLong,
  onShort,
  onClose,
  liquidated,
  fillSize,
  onFillSize,
  sizeNote,
  sessionActive = false,
  onSkip,
  busy = false,
  error = null,
  sealed = false,
  market = 'SYNTHETIC',
  marketMint = '',
  marketImageUri = null,
  marketSource = 'pump.fun',
  priceLabel,
  lastFill = null,
  settleStages,
  teeEnforced = false,
  myName = 'YOU',
  mySide = 'flat',
  opponentMarket = '',
  opponentMarketMint = '',
  payout = '',
  trophies = 0,
  elapsed = 0,
}: LiveRoundScreenProps) {
  /**
   * The opponent's fill count, beating when it changes.
   *
   * A count is the one thing the fog leaks — you learn *that* they traded and
   * nothing about what. Left as a static number it reads as a label; pulsed on
   * change it reads as the other player moving in the dark, which is what it
   * actually is. Respects reduced motion by simply not pulsing.
   */
  const reduced = useReducedMotion();
  const beat = useRef(new Animated.Value(1)).current;
  const lastFills = useRef(opponentFills);
  useEffect(() => {
    if (opponentFills === lastFills.current) return;
    lastFills.current = opponentFills;
    if (reduced) return;
    Animated.sequence([
      Animated.timing(beat, { toValue: 1.35, duration: FRAME_MS, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(beat, { toValue: 1, duration: FRAME_MS * 3, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
    ]).start();
  }, [opponentFills, reduced, beat]);

  /**
   * Keyboard: L to long, C to close, space to settle.
   *
   * A sixty-second round is short enough that reaching for a mouse costs a
   * fill, and a demo is easier to narrate with hands on the keys. Ignored while
   * a fill is in flight, and ignored entirely when the user is typing into
   * something — a shortcut that fires inside a text field is a bug.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || el?.isContentEditable) return;
      if (busy) return;

      const k = e.key.toLowerCase();
      if (k === 'l') {
        e.preventDefault();
        onLong();
      } else if (k === 's') {
        e.preventDefault();
        onShort();
      } else if (k === 'c') {
        e.preventDefault();
        onClose();
      } else if (e.key === ' ' && secondsLeft <= 0) {
        // Only once settlement is actually possible; before the buzzer the
        // program refuses it and the button says so.
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, secondsLeft, onLong, onShort, onClose, onSkip]);

  const settling = !!settleStages?.some((s) => s.state !== 'waiting');

  return (
    <Stack pad={space.md} gap={space.md}>
      {/* Market, clock, pot. The clock is the loudest thing on the round, so
          it sits alone under the header rather than inside it. */}
      <Row justify="space-between" bg={color.ink} outline={color.panelLight} pad={space.sm + 2}>
        <Row gap={space.sm} align="center">
          {/* The orb is a glanceable read on your position — green when up,
              red when down, cyan while flat. */}
          <Orb size={22} state={orbStateForPnl(myPnl)} />
          {marketMint ? <TokenLogo mint={marketMint} symbol={market} uri={marketImageUri} size={20} /> : null}
          <PixelText variant="numeric" size={8} color={color.textDim}>
            {market}
          </PixelText>
        </Row>
        <PotPill amount={pot} tone={color.green} />
      </Row>

      <EndingIn seconds={secondsLeft} />

      <PixelPanel flat bg={color.chartBg} pad={0}>
        <Stack gap={space.xs}>
          <ArenaChart series={equity} height={200} elapsed={elapsed} />
          <Row justify="space-between" padX={space.sm} padY={space.xs}>
            <Row gap={space.xs} align="center">
              <PixelText variant="bodySmall">MARK {priceLabel ?? price}</PixelText>
              <PixelText variant="bodySmall" size={9} color={color.textFaint}>
                {marketSource}
              </PixelText>
            </Row>
            <Row gap={space.xs}>
              <PixelText variant="bodySmall" color={color.textDim}>
                YOUR PNL
              </PixelText>
              <PnLOdometer value={myPnl} size={11} signed />
            </Row>
          </Row>
        </Stack>
      </PixelPanel>

      {/* A conditional, not a standing. See PotentialEarnings. */}
      {payout ? <PotentialEarnings sol={payout} trophies={trophies} /> : null}

      {/* Shown from the moment settlement starts, not from the clock hitting
          zero: the two are close but not the same, and it is the settlement
          this is reporting on. Once it is under way the fill receipt gives
          way to it. */}
      {settling ? <SettleProgress stages={settleStages!} /> : null}

      {/* What the private book just charged. Only after a fill, and only for
          the player who made it. */}
      {!settling && lastFill ? (
        <FillReceipt
          side={lastFill.side}
          price={lastFill.price}
          mark={lastFill.mark}
          impactPct={lastFill.impactPct}
          nonce={lastFill.at}
        />
      ) : null}

      {/* The board. Both rows are unranked while the round runs — see the
          `rank: null` note on RankRow — and the opponent's PnL and side are
          the two fields the ACL refuses, so they are the two that are fogged.
          Their ticker is not fogged: it is written in the match account. */}
      <Stack gap={space.sm}>
        <RankRow
          rank={null}
          lastRank={2}
          name={myName}
          you
          pnl={myPnl}
          side={mySide}
          token={marketMint ? { mint: marketMint, symbol: market, uri: marketImageUri } : null}
          liquidated={liquidated?.me}
        />
        <Animated.View style={{ transform: [{ scale: beat }] }}>
          <RankRow
            rank={null}
            lastRank={2}
            name={opponentName.toUpperCase()}
            pnl={null}
            side={null}
            token={
              opponentMarketMint ? { mint: opponentMarketMint, symbol: opponentMarket, uri: null } : null
            }
            liquidated={liquidated?.opponent}
          />
        </Animated.View>
        {/* Says exactly what is true: sealed means the ACL is on chain;
            enforced means the rollup will refuse a read against it. */}
        <Row justify="space-between" align="center" gap={space.sm}>
          <Badge
            label={sealed ? (teeEnforced ? 'SEALED · TEE ENFORCED' : 'SEALED · ACL ON CHAIN') : 'NOT SEALED'}
            tone={sealed ? (teeEnforced ? 'live' : 'soon') : 'loss'}
            variant="tabLabel"
          />
          <PixelText variant="tabLabel" size={7} color={color.textFaint}>
            {`${positionLabel} · ${opponentFills === null ? 'THEIR FILLS HIDDEN' : `THEIR FILLS ${opponentFills}`}`}
          </PixelText>
        </Row>
      </Stack>

      {/* Size, then the trade. Impact is quadratic in size against a
          constant-product curve, so this is the decision the private book
          exists to make — and the note says what it costs before it is made. */}
      <SizePicker value={fillSize} onChange={onFillSize} disabled={busy} note={sizeNote} />

      {/* Only shown when it is true. A session key is an optimisation, and an
          absent one is not a fault worth a badge. */}
      {sessionActive ? (
        <Badge
          label="SESSION KEY · NO SIGNATURE PER FILL"
          tone="live"
          variant="tabLabel"
        />
      ) : null}

      <Row gap={space.sm}>
        <PixelButton
          flex={1}
          tone="primary"
          label="LONG"
          padY={16}
          loading={busy}
          disabled={liquidated?.me}
          onPress={onLong}
        />
        <PixelButton
          flex={1}
          tone="short"
          label="SHORT"
          padY={16}
          loading={busy}
          disabled={liquidated?.me}
          onPress={onShort}
        />
        <PixelButton
          flex={1}
          tone="danger"
          label="CLOSE"
          padY={16}
          loading={busy}
          disabled={liquidated?.me}
          onPress={onClose}
        />
      </Row>

      {/* Web only, because that is where a keyboard is. */}
      {Platform.OS === 'web' ? (
        <PixelText variant="bodySmall" size={8} align="center" color={color.textFaint}>
          L LONG · S SHORT · C CLOSE · SPACE SETTLE
        </PixelText>
      ) : null}

      {error ? <Badge label={error.slice(0, 48).toUpperCase()} tone="loss" variant="bodySmall" /> : null}

      <FillTape fills={fills} note="HIDDEN UNTIL REVEAL" />

      <Box>
        {/* Settlement is permissionless, but only once the clock has run out —
            the program refuses request_settle before the buzzer. This used to
            offer SETTLE NOW throughout the round, and pressing it committed
            both positions off the rollup before failing, leaving a match that
            could neither be traded nor settled. It says what it can do. */}
        <PixelButton
          tone="quiet"
          bg={color.panelLight}
          label={secondsLeft > 0 ? 'SETTLES AT THE BUZZER' : 'SETTLE NOW'}
          size={8}
          padY={space.sm}
          disabled={secondsLeft > 0}
          loading={busy}
          onPress={onSkip}
        />
      </Box>
    </Stack>
  );
}
