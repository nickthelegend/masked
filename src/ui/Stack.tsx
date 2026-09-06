import { forwardRef } from 'react';
import type { View } from 'react-native';
import Box, { type BoxProps } from './Box';

export type StackProps = Omit<BoxProps, 'direction'>;

/** Vertical flex stack. Same rule as `Row`: gap, never margins. */
const Stack = forwardRef<View, StackProps>(function Stack(props, ref) {
  return <Box ref={ref} direction="column" {...props} />;
});

export default Stack;
