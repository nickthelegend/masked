import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Badge,
  PixelButton,
  PixelPanel,
  PixelText,
  PnLOdometer,
  RevealCurtain,
  RoundTimeline,
  Row,
  Stack,
  color,
  playSound,
  sol,
  solExact,
  space,
} from '../ui';
import { marketMove, replayEquity, type TapeState } from '../chain/tape';

export interface RevealScreenProps {
  won: boolean;
  pot: number;
  stake: number;
  /**
   * The settled tape, carrying both players' real fill lists. Null only while
   * it is still being read back, which is the one case the timeline is absent.
   */
  tape: TapeState | null;
  /** Which side of the tape is yours. */
  isPlayerA: boolean;
  /** Per-player entry in lamports — what the replay starts each side from. */
  entryLamports: number;
  /** When the round went live, and how long it ran. */
  startTs: number;
  duration: number;
  myPnl: number;
  opponentPnl: number;
  myFills: number;
  /** Null if it was never readable — see useDuel. The tape supersedes it. */
  opponentFills: number | null;
  opponentName: string;
  /** The record against this opponent, counted off chain. Null while unknown. */
  record?: string | null;
  onRematch: () => void;
  /** Copies a spectate link for this duel. */
  onShare: () => void;
  onPost: () => void;
  /** Label for the share button, so it can confirm after a copy. */
  shareLabel?: string;
}

/**
 * The reveal.
 *
 * This is the moment the fog lifts, so it is the one screen that must not
 * contain anything invented. It used to: the opponent's curve was a seeded
 * random walk pinned to their final PnL, and a five-point constant stood in
 * for your own round when too few samples had landed. Both are gone. The
 * timeline is replayed from the fill lists `settle_match` wrote into the
 * public tape, and the replay lands on the chain's own PnL to the basis point
 * (`npm run check:tape` asserts exactly that against every settled tape).
 */
/** Basis points as a signed percentage: `+2.10%`, `-0.44%`. */
const signedPct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;

export default function RevealScreen({
  won,
  pot,
  stake,
  tape,
  isPlayerA,
  entryLamports,
  startTs,
  duration,
  myPnl,
  opponentPnl,
  myFills,
  opponentFills,
  opponentName,
  record,
  onRematch,
  onShare,
  onPost,
  shareLabel = 'COPY TAPE LINK',
}: RevealScreenProps) {
  // Hold the tape back until the curtain has torn, so the numbers land at the
  // moment the fog lifts rather than before it.
  const [unsealed, setUnsealed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setUnsealed(true), 1400);
    return () => clearTimeout(id);
  }, []);

  // The sting lands with the curtain, not with the mount, so the result is
  // heard at the moment it is seen.
  useEffect(() => {
    if (unsealed) playSound(won ? 'win' : 'loss');
  }, [unsealed, won]);

  // Both sides replayed from the tape the program wrote. No fallback: if the
  // tape has not been read back yet the timeline says so rather than drawing
  // a shape nothing produced.
  const lanes = useMemo(() => {
    if (!tape || entryLamports <= 0) return null;
    const mineFills = isPlayerA ? tape.fillsA : tape.fillsB;
    const theirFills = isPlayerA ? tape.fillsB : tape.fillsA;
    return {
      mine: replayEquity(mineFills, entryLamports, startTs),
      theirs: replayEquity(theirFills, entryLamports, startTs),
      myCount: mineFills.length,
      theirCount: theirFills.length,
    };
  }, [tape, isPlayerA, entryLamports, startTs]);

  /**
   * What the token itself did, so the score can be read against something.
   * Losing 0.4% while the market fell 6% is a good round; the two numbers above
   * cannot say that on their own.
   */
  /**
   * Fill counts, from the tape.
   *
   * The tape is the public record the program just wrote, so at the reveal it
   * is both authoritative and certainly readable — unlike the live position,
   * which is sealed and may never have been read at all. Falls back to what
   * was passed only until the tape arrives, and says "—" rather than zero if
   * neither is available.
   */
  const shownMyFills = tape
    ? (isPlayerA ? tape.fillsA : tape.fillsB).length
    : myFills;
  const shownTheirFills = tape
    ? (isPlayerA ? tape.fillsB : tape.fillsA).length
    : opponentFills ?? '—';

  const myMove = useMemo(
    () => (tape ? marketMove(isPlayerA ? tape.fillsA : tape.fillsB, entryLamports) : null),
    [tape, entryLamports, isPlayerA]
  );
  const theirMove = useMemo(
    () => (tape ? marketMove(isPlayerA ? tape.fillsB : tape.fillsA, entryLamports) : null),
    [tape, entryLamports, isPlayerA]
  );
  const myLeg = tape ? (isPlayerA ? tape.legA : tape.legB) : null;
  const theirLeg = tape ? (isPlayerA ? tape.legB : tape.legA) : null;

  return (
    <View>
    <RevealCurtain
      active
      label={won ? 'YOU TAKE THE POT' : 'POT LOST'}
      sublabel={won ? `+${solExact(pot)}` : `-${sol(stake)}`}
      onDone={() => setUnsealed(true)}
    />
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h1" align="center" color={color.yellow}>
        {won ? 'YOU TAKE THE POT' : 'POT LOST'}
      </PixelText>

      <Badge
        label={won ? `+${solExact(pot)}` : `-${sol(stake)}`}
        tone={won ? 'win' : 'loss'}
        variant="numeric"
        style={{ alignSelf: 'center' }}
      />

      <PixelPanel flat bg={color.chartBg} pad={space.sm}>
        <Stack gap={space.sm}>
          <PixelText variant="label" size={8} color={color.textDim}>
            ROUND TIMELINE
          </PixelText>
          {/* Held back until the curtain tears, so the fills land with it. */}
          {unsealed && lanes ? (
            <RoundTimeline
              you={{ label: 'YOU', points: lanes.mine, tone: color.cyan }}
              opponent={{ label: opponentName, points: lanes.theirs, tone: color.magenta }}
              startTs={startTs}
              duration={duration}
              height={150}
            />
          ) : (
            <View style={{ height: 150, justifyContent: 'center' }}>
              <PixelText variant="bodySmall" size={9} color={color.textFaint} align="center">
                {unsealed ? 'READING THE TAPE…' : ''}
              </PixelText>
            </View>
          )}
        </Stack>
      </PixelPanel>

      {/* Both figures roll up to their settled values as the tape unseals. */}
      <Row gap={space.sm} align="stretch">
        <PixelPanel flat accent={color.cyan} flex={1}>
          <Stack gap={space.xs}>
            <PixelText variant="bodySmall" color={color.cyan}>YOU</PixelText>
            <PnLOdometer value={unsealed ? myPnl : 0} size={13} signed />
            <PixelText variant="bodySmall" color={color.textDim}>{shownMyFills} FILLS</PixelText>
          </Stack>
        </PixelPanel>
        <PixelPanel flat accent={color.magenta} flex={1}>
          <Stack gap={space.xs}>
            <PixelText variant="bodySmall" color={color.magenta}>{opponentName.toUpperCase()}</PixelText>
            <PnLOdometer value={unsealed ? opponentPnl : 0} size={13} signed />
            <PixelText variant="bodySmall" color={color.textDim}>{shownTheirFills} FILLS</PixelText>
          </Stack>
        </PixelPanel>
      </Row>

      {/* One line per market, because there are two of them now. "Both traded a
          market that moved X%" was true when the duel had one token; with a leg
          each it averaged a memecoin against SOL and reported +11,975%. */}
      {myMove || theirMove ? (
        <PixelText variant="bodySmall" size={9} align="center" color={color.textDim}>
          {[
            myMove && myLeg?.symbol
              ? `${myLeg.symbol.toUpperCase()} MOVED ${signedPct(myMove.bps)}`
              : null,
            theirMove && theirLeg?.symbol
              ? `${theirLeg.symbol.toUpperCase()} MOVED ${signedPct(theirMove.bps)}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </PixelText>
      ) : null}

      {/* The rivalry, recounted from every tape these two wallets share. It is
          the reason to press REMATCH, so it sits directly above it. */}
      {record ? (
        <PixelText variant="label" size={9} align="center" color={color.yellow}>
          {record}
        </PixelText>
      ) : null}

      <Row gap={space.sm}>
        <PixelButton flex={1} tone="gold" label="REMATCH" size={10} onPress={onRematch} />
        {/* Was "FADE WINNER", which called the same handler as REMATCH and
            described something the game cannot do — positions are long-only,
            so there is no side to take against anybody. The link is real, needs
            no wallet at the other end, and keeps working: it points at the
            Tape, which the program never rewrites. */}
        <PixelButton flex={1} tone="info" label={shareLabel} size={10} onPress={onShare} />
      </Row>

      {/* The tape is public the moment it settles — it is already in the feed.
          The old label promised a posting step that does not exist. */}
      <PixelButton tone="quiet" label="SEE IT IN THE FEED" size={9} onPress={onPost} />
    </Stack>
    </View>
  );
}
