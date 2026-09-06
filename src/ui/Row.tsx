import Box, { type BoxProps } from './Box';

export type RowProps = Omit<BoxProps, 'direction'>;

/**
 * Horizontal flex row. Spacing is `gap` only — sibling margins are banned,
 * because they break the pixel rhythm as soon as one child is conditional.
 */
export default function Row({ align = 'center', ...rest }: RowProps) {
  return <Box direction="row" align={align} {...rest} />;
}
