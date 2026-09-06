import { Badge, MatchRow, Orb, PixelButton, PixelText, Row, Stack, color, money, space } from '../ui';
import { short } from '../chain/useTapes';
import { useOpenMatches } from '../chain/useOpenMatches';
import { TOKEN } from './data';

export interface MatchmakingScreenProps {
  pot: number;
  stake: number;
  busy?: boolean;
  myAddress?: string | null;
  onStart: () => void;
  onJoin?: (address: string, creator: string) => void;
  onCancel?: (address: string) => void;
}

const ago = (secs: number) => (secs < 60 ? `${secs}s ago` : `${Math.floor(secs / 60)}m ago`);

/**
 * Waiting for an opponent — against the real on-chain book.
 *
 * The book is other wallets' `Match` accounts, polled live. OPEN A MATCH
 * creates one and waits; joining takes someone else's.
 */
export default function MatchmakingScreen({
  pot,
  stake,
  busy = false,
  myAddress = null,
  onStart,
  onJoin,
  onCancel,
}: MatchmakingScreenProps) {
  const { matches, loaded } = useOpenMatches();

  return (
    <Stack pad={space.lg} gap={space.lg} align="center">
      <PixelText variant="numeric" size={12} color={color.yellow}>
        MATCHING...
      </PixelText>

      <Orb size={110} state="fog" />

      <PixelText variant="body">
        POT {money(pot)} · {TOKEN}
      </PixelText>

      <PixelButton tone="gold" label="OPEN A MATCH" size={11} loading={busy} onPress={onStart} />

      <Stack gap={space.sm} style={{ width: '100%' }}>
        <Row justify="space-between">
          <PixelText variant="label" size={8}>
            OPEN BOOK
          </PixelText>
          <Badge label={`${matches.length}`} tone="quiet" variant="tabLabel" />
        </Row>

        {matches.map((m) => {
          const mine = !!myAddress && m.creator.toBase58() === myAddress;
          return (
            <MatchRow
              key={m.address.toBase58()}
              creator={mine ? 'YOUR MATCH' : short(m.creator)}
              entrySol={m.entry / 1e9}
              durationSecs={m.duration}
              ageLabel={ago(m.ageSecs)}
              mine={mine}
              busy={busy}
              onJoin={() => onJoin?.(m.address.toBase58(), m.creator.toBase58())}
              onCancel={() => onCancel?.(m.address.toBase58())}
            />
          );
        })}

        {loaded && matches.length === 0 ? (
          <PixelText variant="bodySmall" align="center" color={color.textFaint}>
            NOBODY WAITING — OPEN ONE AT {stake}◎ AND THEY WILL COME TO YOU
          </PixelText>
        ) : null}
      </Stack>
    </Stack>
  );
}
