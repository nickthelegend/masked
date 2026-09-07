import { useMemo } from 'react';
import { ScrollView } from 'react-native';
import {
  Badge,
  MaskAvatar,
  PixelPanel,
  PixelText,
  PotPill,
  RoundTimeline,
  Row,
  Stack,
  TokenLogo,
  Wordmark,
  color,
  sol,
  solExact,
  space,
} from '../ui';
import { useTape } from '../chain/useTape';
import { useHeadToHead } from '../chain/useHeadToHead';
import { fillTokens, fillValue, marketMove, replayEquity, type TapeFill } from '../chain/tape';
import { formatSolPrice } from '../chain/units';
import { short } from '../chain/useTapes';

export interface TapeScreenProps {
  /** Match address from the URL. */
  address: string | null;
}

const pct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;

/**
 * A fill's side, named for what it did.
 *
 * These used to read LONG and CLOSE, which was accurate while the product was
 * long-only. A sell now either closes a long or opens a short, and a buy either
 * opens a long or covers a short — the side alone cannot tell you which, so it
 * says what it literally was and the running position says the rest.
 */
const SIDE_LABEL: Record<TapeFill['side'], string> = {
  buy: 'BUY',
  sell: 'SELL',
  settle: 'BUZZER',
  liquidation: 'LIQUIDATED',
};

const when = (ts: number, startTs: number) => {
  const s = Math.max(0, ts - startTs);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Every fill of one player, in the order they happened. */
function FillList({ fills, startTs, tone }: { fills: TapeFill[]; startTs: number; tone: string }) {
  if (fills.length === 0) {
    return (
      <PixelText variant="bodySmall" size={9} color={color.textFaint}>
        never traded
      </PixelText>
    );
  }
  return (
    <Stack gap={2}>
      {fills.map((f, i) => (
        <Row key={i} justify="space-between" gap={space.sm}>
          <PixelText variant="bodySmall" size={9} color={tone}>
            {when(f.ts, startTs)} {SIDE_LABEL[f.side]}
          </PixelText>
          <PixelText variant="bodySmall" size={9} color={color.textDim}>
            {fillTokens(f).toFixed(2)} @ {formatSolPrice(f.px)}◎
          </PixelText>
          <PixelText variant="bodySmall" size={9} color={color.textFaint}>
            {sol(fillValue(f) / 1e9)}
          </PixelText>
        </Row>
      ))}
    </Stack>
  );
}

/**
 * A settled duel at a permanent address.
 *
 * `/spectate/<match>` is for a round that is happening; once it settles there
 * is nothing left to watch, and the interesting thing — what both players
 * actually did — has just become public. This is that, at a URL that keeps
 * working: the `Tape` never changes after `settle_match` writes it, so this
 * page reads once and is the same page forever.
 *
 * No wallet, and nothing here is fogged. Every fill of both players is on
 * chain and shown: side, size, execution price and the second it landed.
 */
export default function TapeScreen({ address }: TapeScreenProps) {
  const { data, error, loaded } = useTape(address);

  // The record between these two, counted off every tape they share. On a
  // public page there is no "you", so it is stated in both names.
  const h2h = useHeadToHead(data?.tape.playerA ?? null, data?.tape.playerB ?? null);

  const lanes = useMemo(() => {
    if (!data || data.entry <= 0) return null;
    return {
      a: replayEquity(data.tape.fillsA, data.entry, data.startTs),
      b: replayEquity(data.tape.fillsB, data.entry, data.startTs),
    };
  }, [data]);

  const body = () => {
    if (!address) {
      return (
        <PixelText variant="bodySmall" color={color.textFaint}>
          Open /tape/&lt;match address&gt; to read a settled duel.
        </PixelText>
      );
    }
    if (!loaded) {
      return (
        <PixelText variant="bodySmall" color={color.textFaint}>
          READING THE CHAIN…
        </PixelText>
      );
    }
    if (error || !data) {
      return (
        <Stack gap={space.sm}>
          <PixelText variant="label" size={9} color={color.red}>
            NOTHING TO READ
          </PixelText>
          <PixelText variant="bodySmall" color={color.text}>
            {error ?? 'No settled duel at that address.'}
          </PixelText>
        </Stack>
      );
    }

    const { tape, startTs, duration } = data;
    const aWon = tape.winner.equals(tape.playerA);
    const sides = [
      { who: tape.playerA, bps: tape.pnlABps, fills: tape.fillsA, tone: color.cyan, won: aWon },
      { who: tape.playerB, bps: tape.pnlBBps, fills: tape.fillsB, tone: color.magenta, won: !aWon },
    ];

    return (
      <Stack gap={space.lg}>
        <Row justify="space-between" align="center" gap={space.md} wrap>
          <Stack gap={space.xs}>
            {/* Both markets. The duel was fought over two tokens, and naming
                only one of them would misdescribe half the record. */}
            <Row gap={space.md} align="center" wrap>
              {[
                { leg: tape.legA, tone: color.cyan },
                { leg: tape.legB, tone: color.magenta },
              ].map(({ leg, tone }, i) => (
                <Row gap={space.sm} align="center" key={`${leg.symbol}-${i}`}>
                  <TokenLogo mint={leg.mint.toBase58()} symbol={leg.symbol || '?'} size={30} />
                  <PixelText variant="label" size={11} color={tone}>
                    {leg.symbol || 'UNNAMED'}
                  </PixelText>
                </Row>
              ))}
            </Row>
            <PixelText variant="bodySmall" size={10} color={color.textFaint}>
              {sol(data.entry / 1e9)} a side · {duration}s
            </PixelText>
          </Stack>
          <PotPill amount={tape.potPaid / 1e9} tone={color.yellow} />
        </Row>

        <PixelPanel flat bg={color.chartBg} pad={space.sm}>
          <Stack gap={space.sm}>
            <PixelText variant="label" size={8} color={color.textDim}>
              ROUND TIMELINE
            </PixelText>
            {lanes ? (
              <RoundTimeline
                you={{ label: short(tape.playerA), points: lanes.a, tone: color.cyan }}
                opponent={{ label: short(tape.playerB), points: lanes.b, tone: color.magenta }}
                startTs={startTs}
                duration={duration}
                height={170}
              />
            ) : (
              <PixelText variant="bodySmall" size={9} color={color.textFaint}>
                The match account this tape names has been closed, so the entry the
                replay starts from is gone. The fills below are still on chain.
              </PixelText>
            )}
          </Stack>
        </PixelPanel>

        <Row gap={space.md} align="stretch">
          {sides.map((side, i) => (
            <Stack
              key={i}
              flex={1}
              gap={space.sm}
              pad={space.md}
              bg={color.panel}
              outline={side.won ? color.yellow : color.blue}
              align="center"
            >
              <MaskAvatar size={40} glyphSize={15} ring={side.won ? color.yellow : color.panelLight} />
              <PixelText variant="bodySmall" size={10} color={side.tone}>
                {short(side.who)}
              </PixelText>
              <PixelText variant="label" size={11} color={side.bps >= 0 ? color.green : color.red}>
                {pct(side.bps)}
              </PixelText>
              <PixelText variant="bodySmall" size={9} color={color.textFaint}>
                {side.fills.length} fill{side.fills.length === 1 ? '' : 's'}
                {side.won ? ' · TOOK THE POT' : ''}
              </PixelText>
            </Stack>
          ))}
        </Row>

        {(() => {
          // Per leg: the two players traded different tokens, so one combined
          // "the market moved" would be an average of unrelated assets.
          const pct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
          const lines = [
            { move: marketMove(tape.fillsA, data.entry), leg: tape.legA },
            { move: marketMove(tape.fillsB, data.entry), leg: tape.legB },
          ]
            .filter((x) => x.move && x.leg.symbol)
            .map((x) => `${x.leg.symbol.toUpperCase()} MOVED ${pct(x.move!.bps)}`);
          return lines.length ? (
            <PixelText variant="bodySmall" size={9} align="center" color={color.textDim}>
              {`${lines.join(' · ')} OVER THIS ROUND`}
            </PixelText>
          ) : null;
        })()}

        {h2h && h2h.played > 1 ? (
          <PixelText variant="label" size={9} align="center" color={color.yellow}>
            {h2h.mine === h2h.theirs
              ? `${h2h.played} MEETINGS · ${h2h.mine}-${h2h.theirs}, ALL SQUARE`
              : `${h2h.played} MEETINGS · ${short(h2h.mine > h2h.theirs ? tape.playerA : tape.playerB)} LEADS ${Math.max(h2h.mine, h2h.theirs)}-${Math.min(h2h.mine, h2h.theirs)}`}
          </PixelText>
        ) : null}

        {/* Fill by fill. This is the part that could not be shown while the
            round was running, and the reason the page exists. */}
        {sides.map((side, i) => (
          <Stack key={i} gap={space.sm} pad={space.md} bg={color.ink} outline={color.panelLight}>
            <PixelText variant="label" size={9} color={side.tone}>
              {short(side.who)} — EVERY FILL
            </PixelText>
            <FillList fills={side.fills} startTs={startTs} tone={side.tone} />
          </Stack>
        ))}

        <Stack gap={space.sm} pad={space.md} bg={color.ink} outline={color.panelLight}>
          <PixelText variant="label" size={9} color={color.yellow}>
            SETTLED ON SOLANA
          </PixelText>
          <Row justify="space-between">
            <PixelText variant="bodySmall" color={color.textDim}>
              paid to winner
            </PixelText>
            <PixelText variant="bodySmall">{solExact(tape.potPaid / 1e9)}</PixelText>
          </Row>
          <Row justify="space-between">
            <PixelText variant="bodySmall" color={color.textDim}>
              rake
            </PixelText>
            <PixelText variant="bodySmall">{solExact(tape.rake / 1e9)}</PixelText>
          </Row>
          <Row justify="space-between">
            <PixelText variant="bodySmall" color={color.textDim}>
              settled
            </PixelText>
            <PixelText variant="bodySmall">
              {new Date(tape.settledTs * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC
            </PixelText>
          </Row>
        </Stack>

        <PixelText variant="bodySmall" size={10} color={color.textFaint}>
          {tape.match.toBase58()}
        </PixelText>
      </Stack>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{
        padding: space.lg,
        paddingBottom: 80,
        gap: space.lg,
        maxWidth: 640,
        alignSelf: 'center',
        width: '100%',
      }}
      showsVerticalScrollIndicator={false}
    >
      <Row justify="space-between" align="center">
        <Wordmark size={16} />
        <Badge label="SETTLED" tone="quiet" variant="label" />
      </Row>

      <Stack gap={space.xs}>
        <PixelText variant="h2">THE TAPE</PixelText>
        <PixelText variant="bodySmall">
          Private during the fight, public after. Both positions were sealed on the
          rollup for the whole round; this is what was underneath, straight off the
          tape the program wrote at settlement.
        </PixelText>
      </Stack>

      {body()}
    </ScrollView>
  );
}
