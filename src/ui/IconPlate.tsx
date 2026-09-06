import type { ViewStyle } from 'react-native';
import Box from './Box';
import PixelText from './PixelText';
import { border, color, onInk, radius } from './theme';
import type { PixelIconProps } from './icons';

/**
 * The glyph set. Geometric unicode only — no emoji, no icon font, because a
 * pixel face renders these on the same grid as the text next to it.
 */
export const GLYPH = {
  feed: '▤', //   ▤ tape rows
  rank: '▲', //   ▲ podium
  duel: '⚔', //   ⚔ crossed blades
  modes: '▦', //  ▦ grid
  quest: '✓', //  ✓ check
  gem: '◆', //    ◆
  dot: '●', //    ●
  block: '■', //  ■
  play: '▶', //   ▶
  close: '✕', //  ✕
} as const;

export type GlyphName = keyof typeof GLYPH;

export interface IconPlateProps {
  /**
   * A drawn pixel icon. Preferred over `glyph`: the geometric unicode set has
   * no coverage in either pixel font, so glyphs fall back to a system face and
   * render differently per platform.
   */
  icon?: (props: PixelIconProps) => React.ReactElement;
  /** A glyph name from `GLYPH`, or any geometric unicode character. */
  glyph?: GlyphName | string;
  /** Plate background. Pair with `ink` from the `onInk` map. */
  bg?: string;
  /** Glyph color printed on the plate. */
  ink?: string;
  size?: number;
  /** Glyph size. Defaults to just under half the plate. */
  glyphSize?: number;
  round?: number;
  /** Plate border. Defaults to the ink color, which reads as a darker edge. */
  edge?: string;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Colored square glyph tile — the tab icons, the balance chip, store badges.
 * Always a square: the plate is the pixel, the glyph is what is drawn on it.
 */
export default function IconPlate({
  icon: Icon,
  glyph,
  bg = color.blue,
  ink = color.white,
  size = 26,
  glyphSize,
  round = radius.tile,
  edge,
  style,
}: IconPlateProps) {
  const char = glyph ? ((GLYPH as Record<string, string>)[glyph] ?? glyph) : '';
  const drawnSize = glyphSize ?? Math.round(size * 0.62);
  return (
    <Box
      bg={bg}
      outline={edge ?? (ink === color.white ? onInk.red : ink)}
      outlineWidth={border.thin}
      round={round}
      width={size}
      height={size}
      align="center"
      justify="center"
      style={style}
    >
      {Icon ? (
        <Icon size={drawnSize} color={ink} />
      ) : (
        <PixelText variant="numeric" size={glyphSize ?? Math.round(size * 0.46)} color={ink}>
          {char}
        </PixelText>
      )}
    </Box>
  );
}
