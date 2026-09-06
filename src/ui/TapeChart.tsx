import Svg, { Path } from 'react-native-svg';
import { color } from './theme';
import { bounds, linePath } from './series';

export interface TapeChartProps {
  /** Your equity curve. Drawn solid, in cyan. */
  mine: number[];
  /** The opponent's curve. Drawn dashed, in magenta. Omit while fogged. */
  opponent?: number[];
  /** viewBox width. The SVG itself always stretches to 100% of its parent. */
  width?: number;
  height?: number;
  /**
   * Shared scale. Left undefined, it is computed across *both* series, which
   * is what keeps the two lines comparable.
   */
  lo?: number;
  hi?: number;
  pad?: number;
  strokeWidth?: number;
  /** Draws a flat rule through the vertical middle — the round's break-even. */
  baseline?: boolean;
}

/**
 * Shared-scale tape. Pass two series and both lines stay comparable, because
 * the loser's curve drawing above the winner's would contradict the
 * scoreboard printed underneath it.
 */
export default function TapeChart({
  mine,
  opponent,
  width = 340,
  height = 170,
  lo,
  hi,
  pad = 10,
  strokeWidth = 3,
  baseline = false,
}: TapeChartProps) {
  const scale = bounds(mine, opponent);
  const min = lo ?? scale.lo;
  const max = hi ?? scale.hi;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {baseline ? (
        <Path d={`M0 ${height / 2} H${width}`} stroke={color.panel} strokeWidth="2" fill="none" />
      ) : null}
      <Path d={linePath(mine, width, height, min, max, pad)} stroke={color.cyan} strokeWidth={strokeWidth} fill="none" />
      {opponent ? (
        <Path
          d={linePath(opponent, width, height, min, max, pad)}
          stroke={color.magenta}
          strokeWidth={strokeWidth}
          strokeDasharray="5 4"
          fill="none"
        />
      ) : null}
    </Svg>
  );
}

export { linePath };
