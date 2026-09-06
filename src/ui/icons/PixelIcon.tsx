import Svg, { Rect } from 'react-native-svg';

/** Every icon is drawn on this lattice. Keep all art square and on-grid. */
export const GRID = 12;

export interface PixelIconProps {
  size?: number;
  color?: string;
}

export interface PixelIconGridProps extends PixelIconProps {
  /** GRID rows of GRID characters. '#' paints a pixel, anything else is clear. */
  grid: string[];
}

/**
 * Renders a bitmap as hard SVG rectangles.
 *
 * These exist because the tab icons used to be unicode glyphs (▤ ▲ ⚔ ▦ ✓) set
 * in PressStart2P, which has no coverage for any of them — every one silently
 * fell back to a system face, so the bar rendered differently on web, iOS and
 * Android, and ⚔ came out as an unrelated shape. Drawing them means they are
 * identical everywhere and stay on the pixel grid at any size.
 *
 * Horizontal runs are merged into single rects, so a typical icon is ~10 nodes
 * rather than ~40.
 */
export default function PixelIcon({ grid, size = 24, color = '#ffffff' }: PixelIconGridProps) {
  const rects: Array<{ x: number; y: number; w: number }> = [];

  grid.forEach((row, y) => {
    let runStart = -1;
    for (let x = 0; x <= GRID; x += 1) {
      const on = row[x] === '#';
      if (on && runStart < 0) runStart = x;
      if (!on && runStart >= 0) {
        rects.push({ x: runStart, y, w: x - runStart });
        runStart = -1;
      }
    }
  });

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${GRID} ${GRID}`}>
      {rects.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={color} />
      ))}
    </Svg>
  );
}
