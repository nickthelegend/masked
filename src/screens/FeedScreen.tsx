import { useState } from 'react';
import { MatchCard, PixelText, PixelButton, Row, Stack, color, solExact, space } from '../ui';
import { BIG_POT_LAMPORTS, FEED_FILTERS, type FeedFilter } from './data';
import { marketLabel } from '../chain/market';
import { useWallet } from '@solana/wallet-adapter-react';
import { bpsPct, short, useTapes } from '../chain/useTapes';
import { useNow } from '../ui/useNow';

export interface FeedScreenProps {
  /** Opens a duel on the token this tape was fought over. */
  onChallenge: (mint: string, symbol: string) => void;
  /** Opens a settled duel's public tape. */
  onReadTape: (match: string) => void;
}

/** Rounds drawn at once. SHOW MORE adds another page of the same list. */
const PAGE = 10;

/** Reveals feed: finished duels you can copy, fade, or challenge into. */
export default function FeedScreen({ onChallenge, onReadTape }: FeedScreenProps) {
  const [filter, setFilter] = useState<FeedFilter>(FEED_FILTERS[0]);
  const [shown, setShown] = useState(PAGE);
  const { publicKey } = useWallet();
  const { tapes: allTapes, loaded } = useTapes();

  const choose = (f: FeedFilter) => {
    setFilter(f);
    setShown(PAGE);
  };

  // Each filter is a real predicate over real tapes. `useTapes` reads every
  // Tape account and sorts newest first, so MINE is the wallet's whole
  // settled history, not its recent slice.
  const tapes = allTapes.filter((t) => {
    if (filter === 'BIG POTS') return t.potPaid >= BIG_POT_LAMPORTS;
    if (filter === 'MINE') {
      return !!publicKey && (t.winner.equals(publicKey) || t.loser.equals(publicKey));
    }
    return true;
  });

  // From the shared clock, so "just now" turns into "1m ago" on screen even
  // when the tape poll has nothing new to say.
  const now = useNow();
  const ago = (ts: number) => {
    const mins = Math.max(0, Math.floor((now - ts) / 60));
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
            onPress={() => choose(f)}
          />
        ))}
      </Row>

      {filter === 'MINE' && tapes.length > 0 ? (
        <PixelText variant="bodySmall" color={color.textDim}>
          {`${tapes.length} SETTLED DUEL${tapes.length === 1 ? '' : 'S'} WITH THIS WALLET · NEWEST FIRST`}
        </PixelText>
      ) : null}

      {/* Real settled tapes, read from chain, a page at a time. */}
      {tapes.slice(0, shown).map((t) => (
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
          onChallenge={() => onChallenge(t.mint.toBase58(), t.symbol || marketLabel(t.mint))}
          onReadTape={() => onReadTape(t.match)}
        />
      ))}

      {tapes.length > shown ? (
        <PixelButton
          tone="quiet"
          size={9}
          padY={space.sm}
          label={`SHOW ${Math.min(PAGE, tapes.length - shown)} MORE · ${shown} OF ${tapes.length}`}
          onPress={() => setShown((n) => n + PAGE)}
        />
      ) : null}

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
