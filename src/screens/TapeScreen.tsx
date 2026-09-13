import { useMemo } from 'react';
import { Linking, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import {
  Badge,
  MaskAvatar,
  PixelButton,
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
import { useNow } from '../ui/useNow';
import { useHeadToHead } from '../chain/useHeadToHead';
import { fillTokens, fillValue, marketMove, replayEquity, tapeWindowNote, type TapeFill } from '../chain/tape';
import { formatSolPrice } from '../chain/units';
import { bpsPct, short, useTapes } from '../chain/useTapes';
import { RAKE } from './data';
import { proxyBase } from '../chain/marketEndpoints';

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
 * How long ago, from the chain's own settlement timestamp, measured against the
 * app's one shared clock like every other relative time — not a `Date.now()`
 * taken whenever this list last happened to render.
 */
const ago = (ts: number, now: number) => {
  const s = Math.max(0, now - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
};

/**
 * `/tape` with no address: every settled duel on this cluster, newest first.
 *
 * A bare /tape used to answer with an instruction to go and find a match
 * address somewhere else, under a SETTLED badge that described nothing. Tapes
 * are world-readable accounts, so the list is one read away, and each row
 * opens that duel's permanent page.
 */
function TapeIndex() {
  const { tapes, loaded } = useTapes(15_000);
  const now = useNow();

  if (!loaded) {
    return (
      <PixelText variant="bodySmall" color={color.textFaint}>
        READING THE CHAIN…
      </PixelText>
    );
  }
  if (tapes.length === 0) {
    return (
      <PixelText variant="bodySmall" color={color.textFaint}>
        No settled duel on this cluster yet. Play one at /play and its tape lands here.
      </PixelText>
    );
  }
  return (
    <Stack gap={space.xs}>
      <PixelText variant="label" size={8} color={color.textDim}>
        {`${tapes.length} SETTLED DUEL${tapes.length === 1 ? '' : 'S'} · NEWEST FIRST`}
      </PixelText>
      {tapes.slice(0, 50).map((t) => (
        <Pressable
          key={t.match}
          onPress={() => router.push(`/tape/${t.match}`)}
          accessibilityRole="link"
          accessibilityLabel={`Read the tape of duel ${t.match}`}
        >
          <Stack gap={space.xs} pad={space.sm} bg={color.panel} outline={color.panelLight}>
            <Row justify="space-between" align="center" gap={space.sm}>
              <Row gap={space.sm} align="center" wrap style={{ flex: 1 }}>
                <TokenLogo mint={t.mint.toBase58()} symbol={t.symbol || '?'} size={20} />
                <PixelText variant="label" size={9} color={color.yellow}>
                  {t.symbol || 'UNNAMED'}
                </PixelText>
                <PixelText variant="bodySmall" size={9} color={color.textFaint}>
                  vs
                </PixelText>
                <TokenLogo mint={t.loserMint.toBase58()} symbol={t.loserSymbol || '?'} size={20} />
                <PixelText variant="label" size={9} color={color.textDim}>
                  {t.loserSymbol || 'UNNAMED'}
                </PixelText>
              </Row>
              <PixelText variant="bodySmall" size={9} color={color.textFaint}>
                {ago(t.settledTs, now)}
              </PixelText>
            </Row>
            <Row justify="space-between" gap={space.sm} wrap>
              <PixelText variant="bodySmall" size={9} color={color.green}>
                {`${short(t.winner)} ${bpsPct(t.winnerPnlBps)} · paid ${sol(t.potPaid / 1e9)}`}
              </PixelText>
              <PixelText variant="bodySmall" size={9} color={color.red}>
                {`${short(t.loser)} ${bpsPct(t.loserPnlBps)}`}
              </PixelText>
            </Row>
          </Stack>
        </Pressable>
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
 * No wallet, and nothing here is fogged. Every fill the tape keeps is shown —
 * side, size, execution price and the second it landed — and a side busier
 * than the tape's sixteen says how many it made in all.
 */
export default function TapeScreen({ address }: TapeScreenProps) {
  const { data, error, loaded } = useTape(address);

  // The record between these two, counted off every tape they share. On a
  // public page there is no "you", so it is stated in both names.
  const h2h = useHeadToHead(data?.tape.playerA ?? null, data?.tape.playerB ?? null);

  const lanes = useMemo(() => {
    if (!data || data.entry <= 0) return null;
    return {
      // A busy side's tape keeps only its last fills; the window start the
      // program recorded is where their replay begins.
      a: replayEquity(data.tape.fillsA, data.entry, data.startTs, data.tape.startA),
      b: replayEquity(data.tape.fillsB, data.entry, data.startTs, data.tape.startB),
    };
  }, [data]);

  const body = () => {
    if (!address) {
      return <TapeIndex />;
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
      {
        who: tape.playerA,
        bps: tape.pnlABps,
        fills: tape.fillsA,
        count: tape.fillCountA,
        note: tapeWindowNote(tape.fillsA.length, tape.fillCountA),
        tone: color.cyan,
        won: aWon,
      },
      {
        who: tape.playerB,
        bps: tape.pnlBBps,
        fills: tape.fillsB,
        count: tape.fillCountB,
        note: tapeWindowNote(tape.fillsB.length, tape.fillCountB),
        tone: color.magenta,
        won: !aWon,
      },
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
          {/* The pot, and what it paid. `potPaid` alone under a POT label is
              the payout wearing the pot's name — 0.196 rounding to 0.20 and
              reading as though no rake had been taken. The tape records both,
              so both are shown. */}
          <PotPill
            amount={(tape.potPaid + tape.rake) / 1e9}
            rake={RAKE}
            tone={color.yellow}
          />
        </Row>

        <PixelPanel flat bg={color.chartBg} pad={space.sm}>
          <Stack gap={space.sm}>
            <PixelText variant="label" size={8} color={color.textDim}>
              ROUND TIMELINE
            </PixelText>
            {lanes ? (
              <RoundTimeline
                you={{ label: short(tape.playerA), points: lanes.a, tone: color.cyan, note: sides[0].note }}
                opponent={{ label: short(tape.playerB), points: lanes.b, tone: color.magenta, note: sides[1].note }}
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
              <MaskAvatar
                size={40}
                seed={side.who.toBase58()}
                glyphSize={15}
                ring={side.won ? color.yellow : color.panelLight}
              />
              <PixelText variant="bodySmall" size={10} color={side.tone}>
                {short(side.who)}
              </PixelText>
              <PixelText variant="label" size={11} color={side.bps >= 0 ? color.green : color.red}>
                {pct(side.bps)}
              </PixelText>
              <PixelText variant="bodySmall" size={9} color={color.textFaint}>
                {side.count} fill{side.count === 1 ? '' : 's'}
                {side.won ? ' · TOOK THE POT' : ''}
              </PixelText>
            </Stack>
          ))}
        </Row>

        {(() => {
          // Per leg: the two players traded different tokens, so one combined
          // "the market moved" would be an average of unrelated assets.
          const pct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
          // A busy side's first stored fill is not the round's open, so its
          // move is measured over the fills the tape kept, and says so.
          const legs = [
            { move: marketMove(tape.fillsA, data.entry), leg: tape.legA, note: sides[0].note },
            { move: marketMove(tape.fillsB, data.entry), leg: tape.legB, note: sides[1].note },
          ].filter((x) => x.move && x.leg.symbol);
          const whole = legs.every((x) => !x.note);
          const lines = legs.map((x) => {
            const moved = `${x.leg.symbol.toUpperCase()} MOVED ${pct(x.move!.bps)}`;
            if (whole) return moved;
            return x.note ? `${moved} OVER ITS ${x.note}` : `${moved} OVER THE ROUND`;
          });
          return lines.length ? (
            <PixelText variant="bodySmall" size={9} align="center" color={color.textDim}>
              {`${lines.join(' · ')}${whole ? ' OVER THIS ROUND' : ''}`}
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
              {short(side.who)} — {side.note ?? 'EVERY FILL'}
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

        {/* The link goes to the proxy's share page rather than straight to this
            screen: a static export hands every crawler the same HTML, so only
            the server can name this tape's card (server/src/og.ts) in og:image.
            A person following it is redirected here. */}
        <PixelButton
          tone="info"
          size={10}
          label="SHARE ON X"
          onPress={() => {
            const url = `${proxyBase}/t/${tape.match.toBase58()}`;
            const text =
              `${tape.legA.symbol || 'UNNAMED'} ${pct(tape.pnlABps)} vs ${tape.legB.symbol || 'UNNAMED'} ${pct(tape.pnlBBps)}, ` +
              'settled on MASKED. Private during the fight, public after.';
            void Linking.openURL(
              `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
            );
          }}
        />

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
        {/* Says what the page is showing. It read SETTLED on every visit — over
            the bare index, while loading, and over an address holding nothing. */}
        <Badge
          label={!address ? 'ALL TAPES' : !loaded ? 'READING' : data && !error ? 'SETTLED' : 'NOT FOUND'}
          tone={address && loaded && (!data || error) ? 'loss' : 'quiet'}
          variant="label"
        />
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
