import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  Badge,
  PixelButton,
  PixelPanel,
  PixelText,
  PnLOdometer,
  RevealCurtain,
  Row,
  Stack,
  TapeChart,
  color,
  sol,
  mulberry32,
  space,
  toEnd,
} from '../ui';

export interface RevealScreenProps {
  won: boolean;
  pot: number;
  stake: number;
  /** Your equity curve from the round. */
  equity: number[];
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

/** A short curve stands in when the round ended before enough samples landed. */
const FALLBACK = [0, 0.2, -0.1, 0.4, 0.1];

/**
 * The reveal. Both tapes are drawn on one shared scale and the opponent's
 * synthesized curve is pinned to its stated final PnL, so the picture and the
 * scoreboard cannot disagree. The curve is seeded from that PnL, so it stays
 * put instead of reshuffling on every render.
 */
export default function RevealScreen({
  won,
  pot,
  stake,
  equity,
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

  const mine = equity.length > 2 ? equity : [...FALLBACK, myPnl];
  const theirs = useMemo(
    () => toEnd(mine.length, opponentPnl, mulberry32(Math.round(opponentPnl * 1000) + mine.length)),
    [mine.length, opponentPnl],
  );

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
            TAPE REVEAL
          </PixelText>
          {/* The tape only draws once the curtain is off. */}
          {unsealed ? <TapeChart mine={mine} opponent={theirs} height={170} /> : <View style={{ height: 170 }} />}
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
