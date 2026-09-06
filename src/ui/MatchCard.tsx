import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import Box from './Box';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import MaskAvatar from './MaskAvatar';
import TapeChart from './TapeChart';
import PotPill from './PotPill';
import { border, color, space } from './theme';

export interface MatchCardProps {
  /** Token traded, e.g. "$BONK". */
  token: string;
  /** Pot as displayed, e.g. "$50". */
  pot: string;
  /** Relative time, e.g. "2m ago". */
  ago: string;
  /** Mode eyebrow. */
  mode?: string;
  winner: string;
  loser: string;
  /** Pre-formatted PnL strings, e.g. "+4.12%" / "-1.80%". */
  winnerPnl: string;
  loserPnl: string;
  /** Equity curves. Drawn on one shared scale so the winner is always on top. */
  winnerSeries: number[];
  loserSeries: number[];
  onCopy?: () => void;
  onFade?: () => void;
  onChallenge?: () => void;
  style?: ViewStyle | ViewStyle[];
}

const SIDE_WIDTH = 88;
const SPARK_HEIGHT = 58;

/**
 * A revealed duel in the feed: both masks, both scores, the two tapes on one
 * shared scale, and the three things you can do about it.
 *
 * The winner's mask is ringed gold and the loser's in `panelLight`, so the
 * result is readable before any number is.
 */
export default function MatchCard({
  token,
  pot,
  ago,
  mode = 'FOG DUEL',
  winner,
  loser,
  winnerPnl,
  loserPnl,
  winnerSeries,
  loserSeries,
  onCopy,
  onFade,
  onChallenge,
  style,
}: MatchCardProps) {
  return (
    <PixelPanel pad={0} style={style}>
      <Row
        justify="space-between"
        bg={color.panelLight}
        pad={space.sm + 2}
        style={{ borderBottomWidth: border.base, borderBottomColor: color.ink }}
      >
        <PixelText variant="label" size={8}>
          {mode} · {token}
        </PixelText>
        <PixelText variant="bodySmall">{ago}</PixelText>
      </Row>

      <Row gap={space.sm} pad={space.md} align="flex-start">
        <Stack width={SIDE_WIDTH} gap={space.xs}>
          <MaskAvatar size={58} ring={color.yellow} glyphSize={20} />
          <PixelText variant="bodySmall" numberOfLines={1} color={color.white}>
            {winner}
          </PixelText>
          <PixelText variant="label" color={color.green}>
            {winnerPnl}
          </PixelText>
        </Stack>

        <Box flex={1} bg={color.ink} height={SPARK_HEIGHT}>
          <TapeChart
            mine={winnerSeries}
            opponent={loserSeries}
            width={200}
            height={SPARK_HEIGHT}
            pad={6}
            strokeWidth={2}
          />
          <PotPill amount={pot} style={{ position: 'absolute', right: 4, top: 4 }} />
        </Box>

        <Stack width={SIDE_WIDTH} gap={space.xs} align="flex-end">
          <MaskAvatar size={58} ring={color.panelLight} glyphSize={20} />
          <PixelText variant="bodySmall" numberOfLines={1}>
            {loser}
          </PixelText>
          <PixelText variant="label" color={color.red}>
            {loserPnl}
          </PixelText>
        </Stack>
      </Row>

      <Row gap={space.sm} padX={space.sm} style={{ paddingBottom: space.md }}>
        <PixelButton flex={1} tone="primary" label="COPY" size={8} onPress={onCopy} />
        <PixelButton flex={1} tone="danger" label="FADE" size={8} onPress={onFade} />
        <PixelButton flex={1.4} tone="gold" label="CHALLENGE" size={8} onPress={onChallenge} />
      </Row>
    </PixelPanel>
  );
}
