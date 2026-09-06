import { useWallet } from '@solana/wallet-adapter-react';
import { PixelText, QuestRow, Stack, color, space } from '../ui';
import { useQuests } from '../chain/useQuests';

/**
 * Daily quests, derived from the player's on-chain record. Without a wallet
 * there is no record to derive from, and the screen says so rather than
 * showing someone else's numbers or invented ones.
 */
export default function QuestsScreen() {
  const { publicKey } = useWallet();
  const { quests, connected } = useQuests(publicKey ?? null);

  return (
    <Stack pad={space.md} gap={space.md}>
      <PixelText variant="h2">DAILY QUESTS</PixelText>

      {!connected ? (
        <PixelText variant="bodySmall" color={color.textFaint}>
          CONNECT A WALLET TO TRACK PROGRESS — THESE READ YOUR ON-CHAIN RECORD
        </PixelText>
      ) : null}

      <Stack gap={space.md}>
        {quests.map((q) => (
          <QuestRow key={q.name} name={q.name} reward={q.reward} value={q.value} progress={q.progress} />
        ))}
      </Stack>
    </Stack>
  );
}
