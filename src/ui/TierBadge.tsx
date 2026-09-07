import Row from './Row';
import Box from './Box';
import PixelText from './PixelText';
import { CrownIcon } from './icons';
import { color, space, radius, border, onInk } from './theme';

/** The five VIP tiers, in ascending order. */
export const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
export type Tier = (typeof TIERS)[number];

/** Wins needed to hold each tier. The thresholds are the tier's definition. */
export const TIER_AT: Record<Tier, number> = {
  BRONZE: 0,
  SILVER: 3,
  GOLD: 10,
  DIAMOND: 25,
  PLATINUM: 50,
};

const SKIN: Record<Tier, { bg: string; ink: string }> = {
  BRONZE: { bg: '#c9895a', ink: onInk.red },
  SILVER: { bg: '#c8d3f7', ink: onInk.cyan },
  GOLD: { bg: color.yellow, ink: onInk.yellow },
  DIAMOND: { bg: color.cyan, ink: onInk.cyan },
  PLATINUM: { bg: color.green, ink: onInk.green },
};

/** The tier a win count earns. Highest threshold that the count clears. */
export function tierFor(wins: number): Tier {
  let held: Tier = 'BRONZE';
  for (const t of TIERS) if (wins >= TIER_AT[t]) held = t;
  return held;
}

export interface TierBadgeProps {
  tier: Tier;
  /** Dims the chip and drops the crown — used for tiers not yet reached. */
  locked?: boolean;
  /** Draws the win threshold after the name. */
  showThreshold?: boolean;
  full?: boolean;
}

/** One VIP tier chip. */
export default function TierBadge({ tier, locked = false, showThreshold = false, full = false }: TierBadgeProps) {
  const skin = SKIN[tier];
  return (
    <Row
      align="center"
      justify={full ? 'flex-start' : 'center'}
      gap={space.sm}
      bg={locked ? color.panel : skin.bg}
      outline={color.ink}
      outlineWidth={border.thin}
      round={radius.tile}
      padX={space.sm}
      padY={space.xs}
      width={full ? '100%' : undefined}
    >
      <Box width={16} height={16} round={radius.tile} bg={locked ? color.ink : color.ink} align="center" justify="center">
        <CrownIcon size={11} color={locked ? color.textFaint : skin.bg} />
      </Box>
      <PixelText variant="tabLabel" size={8} color={locked ? color.textFaint : skin.ink}>
        {tier}
      </PixelText>
      {showThreshold ? (
        <PixelText variant="tabLabel" size={7} color={locked ? color.textFaint : skin.ink}>
          {TIER_AT[tier] === 0 ? 'START' : `${TIER_AT[tier]} WINS`}
        </PixelText>
      ) : null}
    </Row>
  );
}
