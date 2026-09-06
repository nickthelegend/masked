import { PixelText, QuestRow, Stack, space } from '../ui';
import { QUESTS } from './data';

/** Daily quests. */
export default function QuestsScreen() {
  return (
    <Stack pad={space.md} gap={space.md}>
      <PixelText variant="h2">DAILY QUESTS</PixelText>
      <Stack gap={space.md}>
        {QUESTS.map((q) => (
          <QuestRow key={q.name} name={q.name} reward={q.reward} value={q.value} progress={q.progress} />
        ))}
      </Stack>
    </Stack>
  );
}
