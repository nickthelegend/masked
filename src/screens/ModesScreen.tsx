import { ModeTile, PixelText, Row, Stack, space } from '../ui';
import { MODES } from './data';

/** The mode grid. Only FOG DUEL is playable; the rest are marked SOON. */
export default function ModesScreen() {
  return (
    <Stack pad={space.md} gap={space.md}>
      <PixelText variant="h2">GAME MODES</PixelText>
      <Row gap={space.md} wrap align="stretch">
        {MODES.map((m) => (
          <ModeTile key={m.name} name={m.name} description={m.description} status={m.status} />
        ))}
      </Row>
    </Stack>
  );
}
