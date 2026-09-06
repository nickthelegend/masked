import type { ViewStyle } from 'react-native';
import Box from './Box';
import PixelText from './PixelText';
import { border, color, onInk, space } from './theme';
import type { TypeRole } from './tokens';

export type BadgeTone = 'live' | 'soon' | 'gold' | 'quiet' | 'win' | 'loss';

interface BadgeSpec {
  bg: string;
  fg: string;
  edge?: string;
}

const TONES: Record<BadgeTone, BadgeSpec> = {
  live: { bg: color.ink, fg: color.green },
  soon: { bg: color.ink, fg: color.yellow },
  gold: { bg: color.yellow, fg: onInk.yellow },
  quiet: { bg: color.ink, fg: color.white, edge: color.panelLight },
  win: { bg: color.green, fg: color.white },
  loss: { bg: color.red, fg: color.white },
};

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Type role for the caption. `tabLabel` (7px) is the floor. */
  variant?: Extract<TypeRole, 'tabLabel' | 'label' | 'numeric' | 'bodySmall' | 'body'>;
  /** Draw the 2px outline. On by default only for the `quiet` tone. */
  outlined?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Small caption plate: mode tags (LIVE / SOON), the reset timer, the pot
 * result chip, "HIDDEN FILLS · 5 MIN". Square corners — pills are reserved
 * for `PotPill`, which is the only rounded caption in the app.
 */
export default function Badge({ label, tone = 'quiet', variant = 'tabLabel', outlined, style }: BadgeProps) {
  const t = TONES[tone];
  const showEdge = outlined ?? Boolean(t.edge);
  return (
    <Box
      bg={t.bg}
      {...(showEdge ? { outline: t.edge ?? color.ink, outlineWidth: border.thin } : {})}
      padX={space.sm}
      padY={space.xs}
      alignSelf="flex-start"
      style={style}
    >
      <PixelText variant={variant} color={t.fg}>
        {label}
      </PixelText>
    </Box>
  );
}
