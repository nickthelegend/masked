import React from 'react';
import { View, type DimensionValue, type FlexAlignType, type ViewProps, type ViewStyle } from 'react-native';
import { bevelBox, border as borderToken, color } from './theme';

export interface BoxProps extends ViewProps {
  /** Flex direction. `Row` and `Stack` are the named shorthands. */
  direction?: 'row' | 'column';
  /** Gap between children. The only legal way to space siblings — never margins. */
  gap?: number;
  wrap?: boolean;
  align?: FlexAlignType;
  justify?: ViewStyle['justifyContent'];
  alignSelf?: ViewStyle['alignSelf'];
  flex?: number;
  /** Uniform padding. `padX` / `padY` override it on their axis. */
  pad?: number;
  padX?: number;
  padY?: number;
  bg?: string;
  /**
   * Bevel depth in px. Draws the 3px ink outline plus the heavier bottom drop
   * edge. Mutually exclusive with `outline`, which is a flat 3px border.
   */
  bevel?: number;
  /** Flat border color, no drop edge (wells, chart frames, fogged panels). */
  outline?: string;
  /** Border width for `outline`. Defaults to the 3px house border. */
  outlineWidth?: number;
  /** Bevel edge color. Defaults to ink. */
  edge?: string;
  round?: number;
  width?: DimensionValue;
  height?: DimensionValue;
  minHeight?: DimensionValue;
  overflow?: ViewStyle['overflow'];
  children?: React.ReactNode;
}

/**
 * The layout atom. Everything visual in MASKED is a `Box` with tokens on it:
 * a background, an ink outline, and — when it needs to sit above the ground —
 * a bevel. There is no shadow or elevation anywhere in this library.
 */
export default function Box({
  direction,
  gap,
  wrap,
  align,
  justify,
  alignSelf,
  flex,
  pad,
  padX,
  padY,
  bg,
  bevel,
  outline,
  outlineWidth,
  edge = color.ink,
  round,
  width,
  height,
  minHeight,
  overflow,
  style,
  children,
  ...rest
}: BoxProps) {
  const layout: ViewStyle = {
    flexDirection: direction,
    gap,
    flexWrap: wrap ? 'wrap' : undefined,
    alignItems: align,
    justifyContent: justify,
    alignSelf,
    flex,
    padding: pad,
    paddingHorizontal: padX,
    paddingVertical: padY,
    borderRadius: round,
    width,
    height,
    minHeight,
    overflow,
  };

  const surface: ViewStyle =
    bevel !== undefined
      ? bevelBox(bg, bevel, edge)
      : outline !== undefined
        ? { backgroundColor: bg, borderWidth: outlineWidth ?? borderToken.base, borderColor: outline }
        : { backgroundColor: bg };

  return (
    <View style={[surface, layout, style]} {...rest}>
      {children}
    </View>
  );
}
