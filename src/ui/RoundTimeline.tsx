import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import Row from './Row';
import PixelText from './PixelText';
import { color, space } from './theme';
import type { EquityPoint, TapeFill } from '../chain/tape';

export interface TimelinePlayer {
  label: string;
  /** Replayed from that player's real fills. See chain/tape.ts. */
  points: EquityPoint[];
  tone: string;
}

export interface RoundTimelineProps {
  you: TimelinePlayer;
  opponent: TimelinePlayer;
  /** Round start, unix seconds. Fills before this are clamped to zero. */
  startTs: number;
  /** Round length in seconds, so the axis is the round and not just the fills. */
  duration: number;
  /** Fallback viewBox width, used until the first layout pass reports one. */
  width?: number;
  height?: number;
  style?: ViewStyle | ViewStyle[];
}

const MARGIN = { left: 6, right: 6, top: 10, bottom: 16 };

/** A fill's marker. A buy points up, a sell down, the buzzer close is a square. */
function FillMark({
  fill,
  x,
  y,
  tone,
}: {
  fill: TapeFill;
  x: number;
  y: number;
  tone: string;
}) {
  if (fill.side === 'settle') {
    return <Rect x={x - 3.5} y={y - 3.5} width={7} height={7} fill={tone} stroke={color.ink} strokeWidth={1} />;
  }
  const up = fill.side === 'buy';
  const d = up
    ? `M${x} ${y - 4.5} L${x + 4} ${y + 3} L${x - 4} ${y + 3} Z`
    : `M${x} ${y + 4.5} L${x + 4} ${y - 3} L${x - 4} ${y - 3} Z`;
  return <Path d={d} fill={tone} stroke={color.ink} strokeWidth={1} />;
}

/**
 * Both players' rounds on one shared time axis.
 *
 * The reveal used to be two numbers and a curve that had been *synthesized*
 * from the opponent's final PnL — a seeded random walk pinned to the right
 * endpoint. It looked like evidence and was not. Every mark here is a real
 * fill off the settled tape: the side the program recorded, at the price it
 * executed, at the second the chain stamped it.
 *
 * The two paths only connect points that exist. Between fills the tape holds
 * no record of where either position stood, so the line is drawn straight
 * through — the honest reading of a timeline is "these are the moments
 * something happened", not a claim about the ground in between.
 */
export default function RoundTimeline({
  you,
  opponent,
  startTs,
  duration,
  width = 340,
  height = 150,
  style,
}: RoundTimelineProps) {
  // An SVG with a viewBox and width="100%" does not stretch: the default
  // preserveAspectRatio fits the box inside the element and letterboxes the
  // rest, which left the timeline as a narrow strip in the middle of its
  // panel. Setting preserveAspectRatio="none" would fill it but shear every
  // marker, so the viewBox is matched to the measured width instead.
  const [measured, setMeasured] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && w !== measured) setMeasured(w);
  };
  const vbWidth = measured || width;
  const plotW = vbWidth - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;

  const geom = useMemo(() => {
    const all = [...you.points, ...opponent.points];
    // The axis spans the declared round, extended if a fill somehow lands
    // outside it — a clock skew should stretch the axis, not hide a fill.
    const lastTs = all.reduce((m, p) => Math.max(m, p.ts), startTs + duration);
    const firstTs = all.reduce((m, p) => Math.min(m, p.ts), startTs);
    const span = Math.max(1, lastTs - firstTs);

    // One shared vertical scale, symmetric about break-even so "above the
    // middle line" always means "up on the round" for both players.
    const reach = all.reduce((m, p) => Math.max(m, Math.abs(p.bps)), 0);
    const hi = Math.max(reach, 1);

    const x = (ts: number) => MARGIN.left + ((ts - firstTs) / span) * plotW;
    const y = (bps: number) => MARGIN.top + plotH / 2 - (bps / hi) * (plotH / 2 - 6);
    return { x, y, firstTs, lastTs, span, hi };
  }, [you.points, opponent.points, startTs, duration, plotW, plotH]);

  /**
   * A lane's path.
   *
   * The line stops at the last point, except in the one case where carrying it
   * on is a fact rather than a guess: a position holding no base is entirely
   * quote, and quote does not move with the market. So a player who closed out
   * early — or who never traded at all — is flat from there to the buzzer, and
   * drawing that is reporting, not interpolating. A player still holding size
   * gets no such segment, because where they stood between their last fill and
   * the buzzer is exactly what the tape does not record.
   */
  const pathFor = (points: EquityPoint[]) => {
    if (points.length === 0) return '';
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${geom.x(p.ts).toFixed(2)} ${geom.y(p.bps).toFixed(2)}`)
      .join(' ');
    const last = points[points.length - 1];
    if (Math.abs(last.base) < 1 && last.ts < geom.lastTs) {
      return `${d} L${geom.x(geom.lastTs).toFixed(2)} ${geom.y(last.bps).toFixed(2)}`;
    }
    return d;
  };

  const players = [you, opponent];

  return (
    // `alignSelf` because the SVG asks for 100% of its parent, and a plain View
    // inside a Stack sizes to its content — which collapsed the chart to a
    // fraction of the panel it was sitting in.
    <View style={[{ alignSelf: 'stretch', width: '100%' }, style as ViewStyle]} onLayout={onLayout}>
      <Svg width="100%" height={height} viewBox={`0 0 ${vbWidth} ${height}`}>
        {/* Break-even. */}
        <Line
          x1={MARGIN.left}
          y1={MARGIN.top + plotH / 2}
          x2={vbWidth - MARGIN.right}
          y2={MARGIN.top + plotH / 2}
          stroke={color.panel}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        {/* The buzzer, where the round was declared to end. */}
        {startTs + duration <= geom.lastTs ? (
          <Line
            x1={geom.x(startTs + duration)}
            y1={MARGIN.top}
            x2={geom.x(startTs + duration)}
            y2={MARGIN.top + plotH}
            stroke={color.textFaint}
            strokeWidth={1}
          />
        ) : null}

        {players.map((p, pi) => (
          <Path
            key={`path-${p.label}`}
            d={pathFor(p.points)}
            stroke={p.tone}
            strokeWidth={2}
            strokeDasharray={pi === 1 ? '4 3' : undefined}
            fill="none"
          />
        ))}

        {players.map((p) =>
          p.points.map((pt, i) =>
            pt.fill ? (
              <FillMark
                key={`${p.label}-${i}`}
                fill={pt.fill}
                x={geom.x(pt.ts)}
                y={geom.y(pt.bps)}
                tone={p.tone}
              />
            ) : null
          )
        )}

        <SvgText x={MARGIN.left} y={height - 4} fill={color.textFaint} fontSize={7}>
          0s
        </SvgText>
        <SvgText x={vbWidth - MARGIN.right} y={height - 4} fill={color.textFaint} fontSize={7} textAnchor="end">
          {`${Math.round(geom.span)}s`}
        </SvgText>
      </Svg>

      {/* What the shapes mean. Two lines, because a legend that needs a
          paragraph is a chart that has not decided what it is showing. */}
      <Row gap={space.md} style={{ flexWrap: 'wrap' }}>
        {players.map((p) => (
          <Row key={`key-${p.label}`} gap={space.xs} align="center">
            <View style={{ width: 8, height: 3, backgroundColor: p.tone }} />
            <PixelText variant="bodySmall" size={8} color={color.textDim}>
              {p.label.toUpperCase()}
            </PixelText>
          </Row>
        ))}
        <PixelText variant="bodySmall" size={8} color={color.textFaint}>
          ▲ BUY  ▼ SELL  ■ BUZZER  ✕ LIQUIDATED
        </PixelText>
      </Row>
    </View>
  );
}

/** A one-line description of a fill, for a caption or a list row. */
export function describeFill(f: TapeFill): string {
  // Named for what the fill was, not for a direction it no longer implies: a
  // sell opens a short as readily as it closes a long.
  const label =
    f.side === 'buy'
      ? 'BUY'
      : f.side === 'sell'
        ? 'SELL'
        : f.side === 'liquidation'
          ? 'LIQUIDATED'
          : 'BUZZER';
  return `${label} ${(f.qty / 1_000_000).toFixed(2)}`;
}
