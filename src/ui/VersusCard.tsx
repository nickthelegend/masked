import Stack from './Stack';
import Row from './Row';
import Box from './Box';
import PixelText from './PixelText';
import MaskAvatar from './MaskAvatar';
import { color, space, radius, border } from './theme';

export interface VersusCardProps {
  /** Shown under the avatar. Truncated by the caller if it is a raw pubkey. */
  name: string;
  /** The frame colour — the two sides of a duel never share one. */
  accent?: string;
  /** A tick after the name. Set only when the identity is actually attested. */
  verified?: boolean;
  /** Marks which of the two cards is the reader's. */
  you?: boolean;
  /** The wallet, for the generated mask. Falls back to the name. */
  seed?: string | null;
  glyph?: string;
}

/**
 * One fighter on the match-found screen: a framed portrait and a name.
 *
 * Deliberately carries no numbers. At this point in a duel neither side has
 * traded, and a card with an empty PnL on it invites the reader to look for
 * one later — which is exactly what the fog will not give them.
 */
export default function VersusCard({
  name,
  accent = color.cyan,
  verified = false,
  you = false,
  seed = null,
  glyph,
}: VersusCardProps) {
  return (
    <Stack flex={1} align="center" gap={space.sm}>
      <Box
        pad={space.md}
        bg={color.panel}
        round={radius.card}
        outline={accent}
        outlineWidth={border.base}
        align="center"
        width="100%"
      >
        <MaskAvatar size={62} seed={glyph ? null : (seed ?? name)} ring={accent} bg={color.ink} glyph={glyph} />
      </Box>
      <Row align="center" gap={space.xs}>
        <PixelText variant="tabLabel" size={8} color={you ? color.yellow : color.white} numberOfLines={1}>
          {name}
        </PixelText>
        {verified ? (
          <Box
            width={12}
            height={12}
            round={radius.pill}
            bg={color.cyan}
            align="center"
            justify="center"
          >
            <PixelText variant="tabLabel" size={7} color={color.ink}>
              ✓
            </PixelText>
          </Box>
        ) : null}
      </Row>
      {you ? (
        <PixelText variant="tabLabel" size={7} color={color.textFaint}>
          (YOU)
        </PixelText>
      ) : null}
    </Stack>
  );
}
