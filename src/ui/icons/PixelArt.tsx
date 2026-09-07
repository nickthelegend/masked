import Svg, { Rect } from 'react-native-svg';

/**
 * A pixel bitmap with more than one colour.
 *
 * `PixelIcon` paints a single-colour glyph, which is right for UI furniture —
 * a tab icon should take the colour of its tab. It is wrong for a brand mark:
 * Solana's is three bars in a purple-to-green ramp and USDC's is a white glyph
 * on a specific blue, and flattening either to one ink makes it unrecognisable.
 *
 * So each row is a string of palette keys, '.' is transparent, and horizontal
 * runs of the same key are merged into one rect — a mark is a dozen nodes
 * rather than a hundred.
 */
export interface PixelArtProps {
  /** Rows of palette keys. All rows must be the same length. */
  grid: string[];
  /** Key to colour. Any key not present here is left transparent. */
  palette: Record<string, string>;
  size?: number;
}

export default function PixelArt({ grid, palette, size = 24 }: PixelArtProps) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const rects: Array<{ x: number; y: number; w: number; fill: string }> = [];

  grid.forEach((row, y) => {
    let start = -1;
    let key = '';
    for (let x = 0; x <= cols; x += 1) {
      const k = row[x] ?? '.';
      if (k !== key) {
        if (start >= 0 && palette[key]) rects.push({ x: start, y, w: x - start, fill: palette[key] });
        start = k === '.' ? -1 : x;
        key = k;
      }
    }
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${cols} ${rows}`}>
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
    </Svg>
  );
}
