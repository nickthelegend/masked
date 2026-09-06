import { useState } from 'react';
import { MatchCard, PixelText, PixelButton, Row, Stack, color, space } from '../ui';
import { FEED_FILTERS, TOKEN } from './data';
import { bpsPct, short, useTapes } from '../chain/useTapes';

export interface FeedScreenProps {
  onChallenge: () => void;
}

/** Reveals feed: finished duels you can copy, fade, or challenge into. */
export default function FeedScreen({ onChallenge }: FeedScreenProps) {
  const [filter, setFilter] = useState<string>(FEED_FILTERS[0]);
  const { tapes, loaded } = useTapes();

  const ago = (ts: number) => {
    const mins = Math.max(0, Math.floor((Date.now() / 1000 - ts) / 60));
    return mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <Stack pad={space.md} gap={space.lg}>
      <Row gap={space.sm}>
        {FEED_FILTERS.map((f) => (
          <PixelButton
            key={f}
            flex={1}
            label={f}
            size={9}
            padY={space.sm}
            tone={f === filter ? 'gold' : 'quiet'}
            onPress={() => setFilter(f)}
          />
        ))}
      </Row>

      {/* Real settled tapes, read from chain. */}
      {tapes.map((t) => (
        <MatchCard
          key={t.match}
          token={TOKEN}
          pot={`${(t.potPaid / 1e9).toFixed(2)}◎`}
          ago={ago(t.settledTs)}
          winner={short(t.winner)}
          loser={short(t.loser)}
          winnerPnl={bpsPct(t.winnerPnlBps)}
          loserPnl={bpsPct(t.loserPnlBps)}
          winnerSeries={t.winnerSeries}
          loserSeries={t.loserSeries}
          onChallenge={onChallenge}
        />
      ))}

      {loaded && tapes.length === 0 ? (
        <PixelText variant="bodySmall" align="center" color={color.textFaint}>
          NO DUELS SETTLED YET — PLAY ONE AND IT LANDS HERE
        </PixelText>
      ) : null}
    </Stack>
  );
}
