import Box, { type BoxProps } from './Box';

export type StackProps = Omit<BoxProps, 'direction'>;

/** Vertical flex stack. Same rule as `Row`: gap, never margins. */
export default function Stack(props: StackProps) {
  return <Box direction="column" {...props} />;
}
