import { useEffect, useRef, useState } from 'react';
import { Platform, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { color, font } from './theme';
import { linePath } from './series';

const AXIS_W = 46;
const TAG_W = 52;
const ROWS = 5;
/** Advance of one body-face character at the readout's size, for sizing its plate. */
const READOUT_CHAR_W = 5.4;
const READOUT_SIZE = 8;

/** Enough decimals to separate two adjacent gridlines, capped at six. */
function axisDigits(span: number): number {
  if (span <= 0) return 3;
  const d = Math.ceil(-Math.log10(span / ROWS)) + 1;
  return Math.min(6, Math.max(2, d));
}

/** What was known about one sample at the moment it was taken. */
export interface ArenaMoment {
  /** Seconds into the round. */
  sec: number;
  /** The mark behind the sample, formatted. Null when it was not known. */
  mark: string | null;
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
  /**
   * One entry per sample, aligned to `series` from its newest end, so a series
   * trimmed from the front stays aligned. A sample with no entry — one taken
   * before this chart mounted — gets an estimated second and no mark in the
   * crosshair, rather than a mark it never had.
   */
  moments?: (ArenaMoment | null)[];
}

/**
 * The round, drawn the way the arena draws it: a percentage axis, a dashed
 * curve, and a puck riding the leading edge with the live number tagged to it.
 *
 * One series, by design. The opponent's curve is exactly the thing the ACL
 * refuses, and a second line here — even a fogged, flattened, or delayed one —
 * would leak its shape. The empty right-hand half of the plot is the fog.
 *
 * Pointing at the plot (or touching it) draws a crosshair on the nearest
 * sample with its second, your PnL and the mark at that moment: the round's
 * own history, read back, not a projection.
 */
export default function ArenaChart({
  series,
  height = 210,
  width = 340,
  elapsed = 0,
  stepSeconds = 1,
  moments,
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
  // Down is the loss colour. It was magenta, which every other chart uses for
  // the opponent's line, and which the colour-blind palette cannot swap.
  const line = up ? color.green : color.red;

  /**
   * The crosshair, held as a fraction of the plot's width rather than a sample
   * index, so it stays under a still pointer while a new sample lands every
   * second and the curve compresses beneath it.
   */
  const [cursor, setCursor] = useState<number | null>(null);
  const hostRef = useRef<View>(null);
  const hostWidth = useRef(0);

  // A pointer's x within the element to a fraction of the plot. The SVG keeps
  // its aspect ratio, so an element wider than the viewBox centres the drawing
  // with an empty band either side, and the mapping allows for that.
  const toCursor = (px: number, w: number): number | null => {
    if (w <= 0) return null;
    const s = Math.min(w / width, 1);
    const x = (px - (w - width * s) / 2) / s - AXIS_W;
    if (x < -8 || x > plotW + 8) return null;
    return Math.min(1, Math.max(0, x / plotW));
  };
  // The listeners are attached once; they read the mapping for the current
  // size through this ref.
  const toCursorRef = useRef(toCursor);
  toCursorRef.current = toCursor;

  // Web: a mouse hovers, so the crosshair follows the pointer without a press.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const el = hostRef.current as unknown as HTMLElement | null;
    if (!el || typeof el.addEventListener !== 'function') return undefined;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      setCursor(toCursorRef.current(e.clientX - r.left, r.width));
    };
    const leave = () => setCursor(null);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', move);
    el.addEventListener('pointerleave', leave);
    return () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', move);
      el.removeEventListener('pointerleave', leave);
    };
  }, []);

  // Native: nothing hovers, so the crosshair follows a finger held on the plot.
  const onTouch = (e: GestureResponderEvent) => setCursor(toCursor(e.nativeEvent.locationX, hostWidth.current));
  const native = Platform.OS !== 'web';

  const n = values.length;
  const at = cursor !== null && n >= 2 ? Math.round(cursor * (n - 1)) : null;
  let readout: { x: number; y: number; text: string; plateX: number; plateW: number } | null = null;
  if (at !== null) {
    const v = values[at];
    const moment = moments ? (moments[moments.length - (n - at)] ?? null) : null;
    const sec = moment
      ? `${moment.sec}s`
      : `~${Math.max(0, Math.round(elapsed - (n - 1 - at) * stepSeconds))}s`;
    const parts = [sec, `${v >= 0 ? '+' : ''}${v.toFixed(3)}%`];
    if (moments) parts.push(`MARK ${moment?.mark ?? '—'}`);
    const text = parts.join(' · ');
    const x = AXIS_W + (at / (n - 1)) * plotW;
    const plateW = text.length * READOUT_CHAR_W + 12;
    readout = {
      x,
      y: yFor(v),
      text,
      plateW,
      plateX: Math.min(width - plateW - 2, Math.max(AXIS_W, x - plateW / 2)),
    };
  }

  return (
    <View
      ref={hostRef}
      testID="arena-chart"
      onLayout={(e) => {
        hostWidth.current = e.nativeEvent.layout.width;
      }}
      onStartShouldSetResponder={() => native}
      onMoveShouldSetResponder={() => native}
      onResponderGrant={onTouch}
      onResponderMove={onTouch}
      onResponderRelease={() => setCursor(null)}
      onResponderTerminate={() => setCursor(null)}
    >
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

        {readout ? (
          <G testID="arena-crosshair">
            <Line
              x1={readout.x}
              y1={pad}
              x2={readout.x}
              y2={height - pad}
              stroke={color.white}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <Line
              x1={AXIS_W}
              y1={readout.y}
              x2={AXIS_W + plotW}
              y2={readout.y}
              stroke={color.white}
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <Circle cx={readout.x} cy={readout.y} r={4} fill={color.white} stroke={color.ink} strokeWidth={2} />
            <Rect
              x={readout.plateX}
              y={2}
              width={readout.plateW}
              height={15}
              fill={color.ink}
              stroke={color.panelLight}
              strokeWidth={1}
            />
            <SvgText
              x={readout.plateX + readout.plateW / 2}
              y={12.5}
              fill={color.white}
              fontSize={READOUT_SIZE}
              fontFamily={font.body}
              textAnchor="middle"
            >
              {readout.text}
            </SvgText>
          </G>
        ) : null}

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
    </View>
  );
}
