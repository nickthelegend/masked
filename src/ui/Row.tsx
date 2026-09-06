import { forwardRef } from 'react';
import type { View } from 'react-native';
import Box, { type BoxProps } from './Box';

export type RowProps = Omit<BoxProps, 'direction'>;

/**
 * Horizontal flex row. Spacing is `gap` only — sibling margins are banned,
 * because they break the pixel rhythm as soon as one child is conditional.
 */
const Row = forwardRef<View, RowProps>(function Row({ align = 'center', ...rest }, ref) {
  return <Box ref={ref} direction="row" align={align} {...rest} />;
});

export default Row;
