import type { ViewStyle } from 'react-native';
import Box from './Box';
import { border, color } from './theme';

export interface DividerProps {
  /** Line color. `panelLight` on panels, `panel` on ink grounds. */
  color?: string;
  /** Thickness. Defaults to the 2px thin border. */
  thickness?: number;
  direction?: 'horizontal' | 'vertical';
  style?: ViewStyle | ViewStyle[];
}

/** A single hard rule. Used between fill rows and panel headers. */
export default function Divider({
  color: line = color.panelLight,
  thickness = border.thin,
  direction = 'horizontal',
  style,
}: DividerProps) {
  return (
    <Box
      bg={line}
      {...(direction === 'horizontal' ? { height: thickness } : { width: thickness, alignSelf: 'stretch' })}
      style={style}
    />
  );
}
