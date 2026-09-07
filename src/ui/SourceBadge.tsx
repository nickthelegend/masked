import type { ViewStyle } from 'react-native';
import Badge from './Badge';

export type PriceSource = 'pump.fun' | 'jupiter';

const LABEL: Record<PriceSource, string> = {
  'pump.fun': 'PUMP.FUN',
  jupiter: 'JUPITER',
};

export interface SourceBadgeProps {
  source: PriceSource;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Where a price came from.
 *
 * Shown on every market and on the live round, because "the mark is real" is a
 * claim, and a claim needs an attribution the viewer can go and check. It also
 * marks the boundary the product never crosses: these feeds price the round,
 * and the fills happen on each player's own book, never routed to either
 * venue.
 */
export default function SourceBadge({ source, style }: SourceBadgeProps) {
  return <Badge label={LABEL[source]} tone="quiet" variant="tabLabel" style={style} />;
}
