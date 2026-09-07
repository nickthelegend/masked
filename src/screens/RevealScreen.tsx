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
  sol,
  space,
} from '../ui';
import { replayEquity, type TapeState } from '../chain/tape';

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
  opponentFills: number;
  opponentName: string;
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
  onRematch,
  onShare,
  onPost,
  shareLabel = 'COPY WATCH LINK',
}: RevealScreenProps) {
  // Hold the tape back until the curtain has torn, so the numbers land at the
  // moment the fog lifts rather than before it.
  const [unsealed, setUnsealed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setUnsealed(true), 1400);
    return () => clearTimeout(id);
  }, []);

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

  return (
    <View>
    <RevealCurtain
      active
      label={won ? 'YOU TAKE THE POT' : 'POT LOST'}
      sublabel={won ? `+${sol(pot)}` : `-${sol(stake)}`}
      onDone={() => setUnsealed(true)}
    />
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h1" align="center" color={color.yellow}>
        {won ? 'YOU TAKE THE POT' : 'POT LOST'}
      </PixelText>

      <Badge
        label={won ? `+${sol(pot)}` : `-${sol(stake)}`}
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
            <PixelText variant="bodySmall" color={color.textDim}>{myFills} FILLS</PixelText>
          </Stack>
        </PixelPanel>
        <PixelPanel flat accent={color.magenta} flex={1}>
          <Stack gap={space.xs}>
            <PixelText variant="bodySmall" color={color.magenta}>{opponentName.toUpperCase()}</PixelText>
            <PnLOdometer value={unsealed ? opponentPnl : 0} size={13} signed />
            <PixelText variant="bodySmall" color={color.textDim}>{opponentFills} FILLS</PixelText>
          </Stack>
        </PixelPanel>
      </Row>

      <Row gap={space.sm}>
        <PixelButton flex={1} tone="gold" label="REMATCH" size={10} onPress={onRematch} />
        {/* Was "FADE WINNER", which called the same handler as REMATCH and
            described something the game cannot do — positions are long-only,
            so there is no side to take against anybody. This link is real and
            needs no wallet at the other end. */}
        <PixelButton flex={1} tone="info" label={shareLabel} size={10} onPress={onShare} />
      </Row>

      {/* The tape is public the moment it settles — it is already in the feed.
          The old label promised a posting step that does not exist. */}
      <PixelButton tone="quiet" label="SEE IT IN THE FEED" size={9} onPress={onPost} />
    </Stack>
    </View>
  );
}
