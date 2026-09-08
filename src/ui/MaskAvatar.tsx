import type { ViewStyle } from 'react-native';
import Box from './Box';
import PixelText from './PixelText';
import PixelIcon from './icons/PixelIcon';
import { faceTone, maskGrid } from './maskFace';
import { color } from './theme';

export interface MaskAvatarProps {
  size?: number;
  /** Ring color carries rank or side: gold = winner, panelLight = fogged. */
  ring?: string;
  /**
   * The wallet this mask belongs to.
   *
   * Given one, the face is generated from it and is stable for that wallet
   * forever. Without one the plate falls back to the "?" glyph, which is
   * correct in the one place identity genuinely is not known yet — the empty
   * chair on the matchmaking screen.
   */
  seed?: string | null;
  /** The mask face. "?" while identity is hidden. */
  glyph?: string;
  /** Glyph size. Defaults to 34% of the plate, as in ui/rn/MaskAvatar.js. */
  glyphSize?: number;
  bg?: string;
  /** Tints the generated face. Defaults to the wallet's own tone. */
  tone?: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Masked identity: a "?" plate on ink. Everyone in MASKED is anonymous until
 * the reveal, so this — not a profile picture — is the identity primitive.
 */
export default function MaskAvatar({
  size = 58,
  ring = color.blue,
  seed = null,
  glyph = '?',
  glyphSize,
  bg = color.ink,
  tone,
  style,
}: MaskAvatarProps) {
  return (
    <Box bg={bg} outline={ring} width={size} height={size} align="center" justify="center" style={style}>
      {seed ? (
        <PixelIcon
          grid={maskGrid(seed)}
          size={Math.round(size * 0.74)}
          color={tone ?? faceTone(seed)}
        />
      ) : (
        <PixelText variant="numeric" size={glyphSize ?? Math.round(size * 0.34)} color={ring}>
          {glyph}
        </PixelText>
      )}
    </Box>
  );
}
