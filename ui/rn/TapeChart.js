import React from 'react';
import Svg, { Path } from 'react-native-svg';
import { color } from './theme';

/** Shared-scale tape. Pass two series and both lines stay comparable. */
export const linePath = (v, w, h, lo, hi, pad = 10) => {
  const min = lo ?? Math.min(...v), max = hi ?? Math.max(...v), r = (max - min) || 1, ih = h - pad * 2;
  return v.map((x, i) => `${i ? 'L' : 'M'}${(i / (v.length - 1) * w).toFixed(1)},${(pad + ih - (x - min) / r * ih).toFixed(1)}`).join(' ');
};

export default function TapeChart({ mine, opponent, width = 340, height = 170 }) {
  const all = opponent ? [...mine, ...opponent] : mine;
  const lo = Math.min(...all), hi = Math.max(...all);
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path d={linePath(mine, width, height, lo, hi)} stroke={color.cyan} strokeWidth="3" fill="none" />
      {opponent ? (
        <Path d={linePath(opponent, width, height, lo, hi)} stroke={color.magenta} strokeWidth="3" strokeDasharray="5 4" fill="none" />
      ) : null}
    </Svg>
  );
}
