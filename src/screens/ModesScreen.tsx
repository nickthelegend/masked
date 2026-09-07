import { ModeTile, PixelText, Row, Stack, TierBadge, TIERS, TIER_AT, tierFor, color, space } from '../ui';
import { MODES } from './data';

export interface ModesScreenProps {
  /** Duels this wallet has won, from its on-chain player account. */
  wins?: number;
}

/**
 * The mode grid and the tier ladder.
 *
 * Tiers are derived, not stored: the program counts wins and this reads that
 * count against fixed thresholds. Nothing here is a separate progression
 * system that could drift out of step with the chain.
 */
export default function ModesScreen({ wins = 0 }: ModesScreenProps) {
  const held = tierFor(wins);
  const next = TIERS.find((t) => TIER_AT[t] > wins);

  return (
    <Stack pad={space.md} gap={space.lg}>
      <Stack gap={space.md}>
        <PixelText variant="h2">GAME MODES</PixelText>
        <Row gap={space.md} wrap align="stretch">
          {MODES.map((m) => (
            <ModeTile key={m.name} name={m.name} description={m.description} status={m.status} />
          ))}
        </Row>
      </Stack>

      <Stack gap={space.md}>
        <Row justify="space-between" align="center">
          <PixelText variant="h2">VIP TIERING</PixelText>
          <PixelText variant="tabLabel" size={8} color={color.textDim}>
            {`${TIERS.length} TIERS`}
          </PixelText>
        </Row>

        <Stack gap={space.sm}>
          {TIERS.map((t) => (
            <TierBadge key={t} tier={t} locked={TIER_AT[t] > wins} showThreshold full />
          ))}
        </Stack>

        <PixelText variant="bodySmall" size={10} align="center" color={color.textFaint}>
          {next
            ? `${wins} ${wins === 1 ? 'WIN' : 'WINS'} · ${TIER_AT[next] - wins} MORE FOR ${next}`
            : `${wins} WINS · TOP TIER HELD`}
        </PixelText>
        <PixelText variant="tabLabel" size={7} align="center" color={color.textFaint}>
          {`YOU ARE ${held}`}
        </PixelText>
      </Stack>
    </Stack>
  );
}
