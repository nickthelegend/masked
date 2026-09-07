import {
  Badge,
  Box,
  FillTape,
  Orb,
  orbStateForPnl,
  PixelButton,
  SizePicker,
  PixelPanel,
  PixelText,
  PnLOdometer,
  PnLReadout,
  PotPill,
  Row,
  RoundClock,
  FillReceipt,
  SettleProgress,
  Stack,
  TapeChart,
  TokenLogo,
  color,
  space,
} from '../ui';
import type { Fill, PriceSource } from '../ui';

export interface LiveRoundScreenProps {
  secondsLeft: number;
  pot: number;
  series: number[];
  price: number;
  myPnl: number;
  positionLabel: string;
  opponentName: string;
  opponentFills: number;
  fills: Fill[];
  onLong: () => void;
  onClose: () => void;
  /** Fraction of what is available a fill uses, 0..1. */
  fillSize: number;
  onFillSize: (fraction: number) => void;
  /** What that size would cost against the current mark, already computed. */
  sizeNote?: string;
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
}

/**
 * The live round. Your side is fully legible; theirs shows a fill count and
 * nothing else, which is the entire premise of the mode.
 */
export default function LiveRoundScreen({
  secondsLeft,
  pot,
  series,
  price,
  myPnl,
  positionLabel,
  opponentName,
  opponentFills,
  fills,
  onLong,
  onClose,
  fillSize,
  onFillSize,
  sizeNote,
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
}: LiveRoundScreenProps) {
  const settling = !!settleStages?.some((s) => s.state !== 'waiting');

  return (
    <Stack pad={space.md} gap={space.md}>
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
        <RoundClock seconds={secondsLeft} />
        <PotPill amount={pot} tone={color.green} />
      </Row>

      <PixelPanel flat bg={color.chartBg} pad={space.sm}>
        <Stack gap={space.xs}>
          <TapeChart mine={series} height={200} baseline />
          <Row justify="space-between">
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

      <Row gap={space.sm} align="stretch">
        <PnLReadout panel flex={1} label="YOU" value={myPnl} note={positionLabel} />
        <Stack flex={1} gap={space.xs}>
          <PnLReadout
            panel
            label={opponentName.toUpperCase()}
            fogged
            note={`FOGGED · ${opponentFills} FILLS`}
            accent={color.panelLight}
          />
          {/* Says exactly what is true: sealed means the ACL is on chain;
              enforced means the rollup will refuse a read against it. */}
          <Badge
            label={sealed ? (teeEnforced ? 'SEALED · TEE ENFORCED' : 'SEALED · ACL ON CHAIN') : 'NOT SEALED'}
            tone={sealed ? (teeEnforced ? 'live' : 'soon') : 'loss'}
            variant="tabLabel"
          />
        </Stack>
      </Row>

      {/* Size, then the trade. Impact is quadratic in size against a
          constant-product curve, so this is the decision the private book
          exists to make — and the note says what it costs before it is made. */}
      <SizePicker value={fillSize} onChange={onFillSize} disabled={busy} note={sizeNote} />

      <Row gap={space.sm}>
        <PixelButton flex={1} tone="primary" label="LONG" padY={16} loading={busy} onPress={onLong} />
        <PixelButton flex={1} tone="danger" label="CLOSE" padY={16} loading={busy} onPress={onClose} />
      </Row>

      {error ? <Badge label={error.slice(0, 48).toUpperCase()} tone="loss" variant="bodySmall" /> : null}

      <FillTape fills={fills} note="HIDDEN UNTIL REVEAL" />

      <Box>
        {/* Settles early on purpose. Permissionless on-chain once the clock
            expires; this just triggers it now so a demo need not wait. */}
        <PixelButton tone="quiet" bg={color.panelLight} label="SETTLE NOW" size={8} padY={space.sm} loading={busy} onPress={onSkip} />
      </Box>
    </Stack>
  );
}
