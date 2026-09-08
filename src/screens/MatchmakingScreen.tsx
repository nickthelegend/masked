import {
  Badge,
  Box,
  MatchRow,
  Orb,
  PixelButton,
  PixelText,
  Row,
  Stack,
  TokenLogo,
  VersusCard,
  border,
  color,
  radius,
  sol,
  space,
} from '../ui';
import { short } from '../chain/useTapes';
import { MAX_OPEN_AGE_SECS } from '../chain/units';
import { useOpenMatches } from '../chain/useOpenMatches';


export interface MatchmakingScreenProps {
  pot: number;
  stake: number;
  busy?: boolean;
  myAddress?: string | null;
  /** The market the next match will be opened on. */
  marketSymbol?: string;
  marketMint?: string;
  marketImageUri?: string | null;
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
  marketSymbol,
  marketMint,
  marketImageUri = null,
  onStart,
  onJoin,
  onCancel,
}: MatchmakingScreenProps) {
  const { matches, loaded } = useOpenMatches();

  return (
    <Stack pad={space.lg} gap={space.lg} align="center">
      <PixelText variant="h2" size={13} color={color.white}>
        MATCHMAKING
      </PixelText>
      <PixelText variant="tabLabel" size={8} color={color.yellow}>
        1 VS 1
      </PixelText>

      {/* You, and the empty chair. The right-hand card stays a fogged orb
          until somebody takes it — there is no opponent to name yet, and
          naming a placeholder is the one thing a matchmaking screen must not
          do on a game whose whole premise is not knowing who is opposite. */}
      <Row align="center" gap={space.md} width="100%">
        <VersusCard
          name={myAddress ? `${myAddress.slice(0, 6)}…` : 'YOU'}
          seed={myAddress}
          accent={color.cyan}
          you
        />
        <Box
          width={38}
          height={38}
          round={radius.pill}
          bg={color.red}
          outline={color.ink}
          outlineWidth={border.base}
          align="center"
          justify="center"
        >
          <PixelText variant="h2" size={12} color={color.white}>
            VS
          </PixelText>
        </Box>
        <Stack flex={1} align="center" gap={space.sm}>
          <Box
            pad={space.md}
            bg={color.panel}
            round={radius.card}
            outline={color.panelLight}
            outlineWidth={border.base}
            align="center"
            width="100%"
          >
            <Orb size={62} state="fog" />
          </Box>
          <PixelText variant="tabLabel" size={8} color={color.textFaint}>
            WAITING…
          </PixelText>
        </Stack>
      </Row>

      {/* The market the player actually picked. This used to print a fixed
          "$FOG" from a demo mint, whatever they had chosen. */}
      <Row gap={space.sm} align="center">
        {marketMint ? (
          <TokenLogo mint={marketMint} symbol={marketSymbol ?? '?'} uri={marketImageUri} size={22} />
        ) : null}
        <PixelText variant="body">
          POT {sol(pot)}
          {marketSymbol ? ` · ${marketSymbol}` : ''}
        </PixelText>
      </Row>

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
          const stale = m.ageSecs > MAX_OPEN_AGE_SECS;
          return (
            <MatchRow
              key={m.address.toBase58()}
              creator={mine ? 'YOUR MATCH' : short(m.creator)}
              symbol={m.symbol}
              mint={m.mint.toBase58()}
              entrySol={m.entry / 1e9}
              durationSecs={m.duration}
              ageLabel={ago(m.ageSecs)}
              mine={mine}
              stale={stale}
              busy={busy}
              onJoin={() => onJoin?.(m.address.toBase58(), m.creator.toBase58())}
              onCancel={() => onCancel?.(m.address.toBase58())}
            />
          );
        })}

        {loaded && matches.length === 0 ? (
          <PixelText variant="bodySmall" align="center" color={color.textFaint}>
            NOBODY WAITING — OPEN ONE AT {sol(stake)} AND THEY WILL COME TO YOU
          </PixelText>
        ) : null}
      </Stack>
    </Stack>
  );
}
