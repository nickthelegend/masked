import { useWallet } from '@solana/wallet-adapter-react';
import { Badge, PixelText, QuestRow, Row, Stack, color, space } from '../ui';
import { useQuests } from '../chain/useQuests';

/**
 * Achievements, derived from the player's on-chain record. Without a wallet
 * there is no record to derive from, and the screen says so rather than
 * showing someone else's numbers or invented ones.
 *
 * Not "daily". Every number behind these is a lifetime counter on the player's
 * `PlayerStats` account — wins, best streak, total taken — and none of them
 * resets at midnight. This is the same mistake the leaderboard made with a
 * "24H" heading over all-time totals, and it is wrong for the same reason:
 * the label described a window the data does not have.
 */
export default function QuestsScreen() {
  const { publicKey } = useWallet();
  const { quests, connected } = useQuests(publicKey ?? null);

  return (
    <Stack pad={space.md} gap={space.md}>
      <Row justify="space-between" align="center">
        <PixelText variant="h2">ACHIEVEMENTS</PixelText>
        <Badge
          label={`${quests.filter((q) => q.done).length}/${quests.length} CLEARED`}
          tone={quests.every((q) => q.done) ? 'gold' : 'quiet'}
          variant="tabLabel"
        />
      </Row>
      <PixelText variant="bodySmall" size={10} color={color.textFaint}>
        ALL TIME · read from your on-chain record
      </PixelText>

      {!connected ? (
        <PixelText variant="bodySmall" color={color.textFaint}>
          CONNECT A WALLET TO TRACK PROGRESS — THESE READ YOUR ON-CHAIN RECORD
        </PixelText>
      ) : null}

      <Stack gap={space.md}>
        {quests.map((q) => (
          <QuestRow key={q.name} name={q.name} value={q.value} progress={q.progress} />
        ))}
      </Stack>
    </Stack>
  );
}
