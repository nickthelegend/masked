import { useState } from 'react';
import { MatchCard, PixelText, PixelButton, Row, Stack, color, solExact, space } from '../ui';
import { BIG_POT_LAMPORTS, FEED_FILTERS, type FeedFilter } from './data';
import { marketLabel } from '../chain/market';
import { useWallet } from '@solana/wallet-adapter-react';
import { bpsPct, short, useTapes } from '../chain/useTapes';

export interface FeedScreenProps {
  onChallenge: () => void;
}

/** Reveals feed: finished duels you can copy, fade, or challenge into. */
export default function FeedScreen({ onChallenge }: FeedScreenProps) {
  const [filter, setFilter] = useState<FeedFilter>(FEED_FILTERS[0]);
  const { publicKey } = useWallet();
  const { tapes: allTapes, loaded } = useTapes();

  // Each filter is a real predicate over real tapes.
  const tapes = allTapes.filter((t) => {
    if (filter === 'BIG POTS') return t.potPaid >= BIG_POT_LAMPORTS;
    if (filter === 'MINE') {
      return !!publicKey && (t.winner.equals(publicKey) || t.loser.equals(publicKey));
    }
    return true;
  });

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
          // Off the tape itself. An older tape written before the market was
          // recorded falls back to naming its mint rather than inventing one.
          token={t.symbol || marketLabel(t.mint)}
          pot={solExact((t.potPaid + t.rake) / 1e9)}
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
          {filter === 'MINE'
            ? publicKey
              ? 'YOU HAVE NOT SETTLED A DUEL YET'
              : 'CONNECT A WALLET TO SEE YOUR OWN DUELS'
            : filter === 'BIG POTS'
              ? 'NO POTS AT OR ABOVE 0.20◎ YET'
              : 'NO DUELS SETTLED YET — PLAY ONE AND IT LANDS HERE'}
        </PixelText>
      ) : null}
    </Stack>
  );
}
