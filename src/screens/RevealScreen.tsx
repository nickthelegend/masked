import { useMemo } from 'react';
import {
  Badge,
  PixelButton,
  PixelPanel,
  PixelText,
  PnLReadout,
  Row,
  Stack,
  TapeChart,
  color,
  money,
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
  onFade: () => void;
  onPost: () => void;
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
  onFade,
  onPost,
}: RevealScreenProps) {
  const mine = equity.length > 2 ? equity : [...FALLBACK, myPnl];
  const theirs = useMemo(
    () => toEnd(mine.length, opponentPnl, mulberry32(Math.round(opponentPnl * 1000) + mine.length)),
    [mine.length, opponentPnl],
  );

  return (
    <Stack pad={space.lg} gap={space.md}>
      <PixelText variant="h1" align="center" color={color.yellow}>
        {won ? 'YOU TAKE THE POT' : 'POT LOST'}
      </PixelText>

      <Badge
        label={won ? `+${money(pot)}` : `-${money(stake)}`}
        tone={won ? 'win' : 'loss'}
        variant="numeric"
        style={{ alignSelf: 'center' }}
      />

      <PixelPanel flat bg={color.chartBg} pad={space.sm}>
        <Stack gap={space.sm}>
          <PixelText variant="label" size={8} color={color.textDim}>
            TAPE REVEAL
          </PixelText>
          <TapeChart mine={mine} opponent={theirs} height={170} />
        </Stack>
      </PixelPanel>

      <Row gap={space.sm} align="stretch">
        <PnLReadout panel flex={1} label="YOU" value={myPnl} signed note={`${myFills} FILLS`} labelVariant="bodySmall" />
        <PnLReadout
          panel
          flex={1}
          label={opponentName.toUpperCase()}
          value={opponentPnl}
          signed
          accent={color.magenta}
          note={`${opponentFills} FILLS`}
          labelVariant="bodySmall"
        />
      </Row>

      <Row gap={space.sm}>
        <PixelButton flex={1} tone="gold" label="REMATCH" size={10} onPress={onRematch} />
        <PixelButton flex={1} tone="danger" label="FADE WINNER" size={10} onPress={onFade} />
      </Row>

      <PixelButton tone="info" label="POST REVEAL TO FEED" size={9} onPress={onPost} />
    </Stack>
  );
}
