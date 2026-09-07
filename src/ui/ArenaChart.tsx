import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { color, font } from './theme';
import { linePath } from './series';

const AXIS_W = 46;
const TAG_W = 52;
const ROWS = 5;

/** Enough decimals to separate two adjacent gridlines, capped at six. */
function axisDigits(span: number): number {
  if (span <= 0) return 3;
  const d = Math.ceil(-Math.log10(span / ROWS)) + 1;
  return Math.min(6, Math.max(2, d));
}

export interface ArenaChartProps {
  /** Your PnL curve, in percent. The only series drawn — theirs is sealed. */
  series: number[];
  height?: number;
  width?: number;
  /** Seconds elapsed at the newest sample, for the x-axis ticks. */
  elapsed?: number;
  /** Seconds between samples, used to label the ticks. */
  stepSeconds?: number;
}

/**
 * The round, drawn the way the arena draws it: a percentage axis, a dashed
 * curve, and a puck riding the leading edge with the live number tagged to it.
 *
 * One series, by design. The opponent's curve is exactly the thing the ACL
 * refuses, and a second line here — even a fogged, flattened, or delayed one —
 * would leak its shape. The empty right-hand half of the plot is the fog.
 */
export default function ArenaChart({
  series,
  height = 210,
  width = 340,
  elapsed = 0,
  stepSeconds = 1,
}: ArenaChartProps) {
  const plotW = width - AXIS_W - TAG_W;
  const values = series.length > 0 ? series : [0];

  // A symmetric scale around zero, so break-even is always the middle rule and
  // an up round and a down round of the same size look the same size.
  const reach = Math.max(Math.abs(Math.min(...values)), Math.abs(Math.max(...values)), 0.02);
  const hi = reach;
  const lo = -reach;
  const digits = axisDigits(hi - lo);

  const pad = 8;
  const inner = height - pad * 2;
  const yFor = (v: number) => pad + inner - ((v - lo) / (hi - lo || 1)) * inner;

  const last = values[values.length - 1];
  const lastY = yFor(last);
  const lastX = AXIS_W + plotW;

  const ticks = Array.from({ length: ROWS + 1 }, (_, i) => hi - ((hi - lo) / ROWS) * i);

  // Six x labels ending at the current second.
  const xLabels = Array.from({ length: 6 }, (_, i) => {
    const back = (5 - i) * Math.max(1, Math.round((values.length * stepSeconds) / 5));
    return Math.max(0, Math.round(elapsed) - back);
  });

  const up = last >= 0;
  const line = up ? color.green : color.magenta;

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x={0} y={0} width={width} height={height} fill={color.chartBg} />

      {ticks.map((t, i) => {
        const y = yFor(t);
        const zero = Math.abs(t) < (hi - lo) / 1000;
        return (
          <G key={`t${i}`}>
            <Path
              d={`M${AXIS_W} ${y} H${width}`}
              stroke={zero ? color.panelLight : color.panel}
              strokeWidth={zero ? 2 : 1}
              fill="none"
            />
            <SvgText
              x={AXIS_W - 4}
              y={y + 3}
              fill={color.textFaint}
              fontSize={7}
              fontFamily={font.body}
              textAnchor="end"
            >
              {`${t >= 0 ? '' : '-'}${Math.abs(t).toFixed(digits)}%`}
            </SvgText>
          </G>
        );
      })}

      <G x={AXIS_W}>
        <Path
          d={linePath(values, plotW, height, lo, hi, pad)}
          stroke={line}
          strokeWidth={3}
          strokeDasharray="6 4"
          strokeLinecap="round"
          fill="none"
        />
      </G>

      {/* The puck: where the reader is, right now. */}
      <Circle cx={lastX} cy={lastY} r={9} fill={color.ink} stroke={line} strokeWidth={3} />
      <Circle cx={lastX} cy={lastY} r={3} fill={line} />

      {/* Its tag, clamped inside the plot so it never leaves the card. */}
      <G>
        <Rect
          x={lastX + 6}
          y={Math.min(height - 16, Math.max(2, lastY - 8))}
          width={TAG_W - 8}
          height={16}
          rx={3}
          fill={line}
        />
        <SvgText
          x={lastX + 6 + (TAG_W - 8) / 2}
          y={Math.min(height - 16, Math.max(2, lastY - 8)) + 11}
          fill={up ? color.ink : color.white}
          fontSize={8}
          fontFamily={font.body}
          textAnchor="middle"
        >
          {`${last >= 0 ? '+' : ''}${last.toFixed(3)}%`}
        </SvgText>
      </G>

      {xLabels.map((s, i) => (
        <SvgText
          key={`x${i}`}
          x={AXIS_W + (plotW / 5) * i}
          y={height - 2}
          fill={color.textFaint}
          fontSize={7}
          fontFamily={font.body}
          textAnchor="middle"
        >
          {String(s)}
        </SvgText>
      ))}
    </Svg>
  );
}
