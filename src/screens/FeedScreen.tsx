import { useState } from 'react';
import { MatchCard, PixelButton, Row, Stack, space } from '../ui';
import { FEED, FEED_FILTERS } from './data';

export interface FeedScreenProps {
  onChallenge: () => void;
}

/** Reveals feed: finished duels you can copy, fade, or challenge into. */
export default function FeedScreen({ onChallenge }: FeedScreenProps) {
  const [filter, setFilter] = useState<string>(FEED_FILTERS[0]);

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

      {FEED.map((m) => (
        <MatchCard key={m.token} {...m} onChallenge={onChallenge} />
      ))}
    </Stack>
  );
}
