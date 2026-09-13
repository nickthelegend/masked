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
import { useMatchInvite } from '../chain/useMatchInvite';


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
  /** A match address from an invite link, shown above the book. */
  inviteAddress?: string | null;
  /** Copies the invite link for one of this wallet's open matches. */
  onInvite?: (address: string) => void;
  /** What the invite button currently says — COPY, COPIED or BLOCKED. */
  inviteLabel?: string;
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
  inviteAddress = null,
  onInvite,
  inviteLabel = 'COPY INVITE LINK',
}: MatchmakingScreenProps) {
  const { matches: book, loaded } = useOpenMatches();
  const invite = useMatchInvite(inviteAddress, myAddress);
  // A joinable invite is drawn above the book, so it is not listed twice.
  const matches =
    invite.kind === 'joinable' ? book.filter((m) => m.address.toBase58() !== invite.match.address) : book;
  // The newest match this wallet opened that the program would still let
  // someone join — the one an invite link is worth sending for.
  const myOpen = myAddress
    ? book
        .filter((m) => m.creator.toBase58() === myAddress && m.ageSecs <= MAX_OPEN_AGE_SECS)
        .sort((a, b) => a.ageSecs - b.ageSecs)[0]
    : undefined;

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

      {/* 1v1 needs a second person; a link is how you bring one. Only for a
          match the program would still let them join. */}
      {myOpen && onInvite ? (
        <PixelButton
          tone="info"
          label={inviteLabel}
          size={9}
          onPress={() => onInvite(myOpen.address.toBase58())}
        />
      ) : null}

      {invite.kind !== 'none' ? (
        <Stack gap={space.sm} style={{ width: '100%' }}>
          <PixelText variant="label" size={8} color={color.yellow}>
            YOU WERE INVITED
          </PixelText>
          {invite.kind === 'reading' ? (
            <PixelText variant="bodySmall" color={color.textFaint}>
              READING THE INVITED MATCH…
            </PixelText>
          ) : invite.kind === 'joinable' ? (
            <MatchRow
              creator={invite.match.creatorShort}
              symbol={invite.match.symbol}
              mint={invite.match.mint}
              entrySol={invite.match.entry / 1e9}
              durationSecs={invite.match.duration}
              ageLabel={ago(invite.match.ageSecs)}
              busy={busy}
              onJoin={() => onJoin?.(invite.match.address, invite.match.creator)}
            />
          ) : (
            <Stack gap={2}>
              <PixelText variant="label" size={9} color={color.red}>
                {invite.title}
              </PixelText>
              <PixelText variant="bodySmall" color={color.textFaint}>
                {invite.detail}
              </PixelText>
            </Stack>
          )}
        </Stack>
      ) : null}

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
