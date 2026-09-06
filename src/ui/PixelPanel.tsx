import React from 'react';
import type { ViewProps, ViewStyle } from 'react-native';
import Box from './Box';
import { bevel as bevelToken, color, space } from './theme';

export interface PixelPanelProps extends ViewProps {
  /** Swaps the ink outline for a colored one (cyan = you, magenta = opponent). */
  accent?: string;
  bg?: string;
  /** Bevel depth. Defaults to `bevel.md`, matching ui/rn/PixelPanel.js. */
  depth?: number;
  pad?: number;
  round?: number;
  /** Flat outline with no drop edge — for wells and chart frames. */
  flat?: boolean;
  gap?: number;
  flex?: number;
  style?: ViewStyle | ViewStyle[];
  children?: React.ReactNode;
}

/**
 * Bevelled container — the workhorse surface. `accent` swaps the border to a
 * colored outline; `flat` drops the bevel for recessed wells (chart frames,
 * the fogged opponent panel) which sit *in* the ground rather than on it.
 */
export default function PixelPanel({
  children,
  accent,
  bg = color.panel,
  depth = bevelToken.md,
  pad = space.md,
  round = 0,
  flat = false,
  gap,
  flex,
  style,
  ...rest
}: PixelPanelProps) {
  return (
    <Box
      bg={bg}
      {...(flat ? { outline: accent ?? color.ink } : { bevel: depth, edge: accent ?? color.ink })}
      pad={pad}
      round={round}
      gap={gap}
      flex={flex}
      style={style}
      {...rest}
    >
      {children}
    </Box>
  );
}
