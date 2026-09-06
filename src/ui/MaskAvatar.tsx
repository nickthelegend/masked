import type { ViewStyle } from 'react-native';
import Box from './Box';
import PixelText from './PixelText';
import { color } from './theme';

export interface MaskAvatarProps {
  size?: number;
  /** Ring color carries rank or side: gold = winner, panelLight = fogged. */
  ring?: string;
  /** The mask face. "?" while identity is hidden. */
  glyph?: string;
  /** Glyph size. Defaults to 34% of the plate, as in ui/rn/MaskAvatar.js. */
  glyphSize?: number;
  bg?: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Masked identity: a "?" plate on ink. Everyone in MASKED is anonymous until
 * the reveal, so this — not a profile picture — is the identity primitive.
 */
export default function MaskAvatar({
  size = 58,
  ring = color.blue,
  glyph = '?',
  glyphSize,
  bg = color.ink,
  style,
}: MaskAvatarProps) {
  return (
    <Box bg={bg} outline={ring} width={size} height={size} align="center" justify="center" style={style}>
      <PixelText variant="numeric" size={glyphSize ?? Math.round(size * 0.34)} color={ring}>
        {glyph}
      </PixelText>
    </Box>
  );
}
