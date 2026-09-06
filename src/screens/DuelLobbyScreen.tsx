import { Badge, Box, MaskAvatar, PixelButton, PixelText, Row, Stack, StakePicker, color, sol, onInk, space } from '../ui';
import { TOKEN } from './data';

export interface DuelLobbyScreenProps {
  stake: number;
  onStakeChange: (stake: number) => void;
  pot: number;
  onFind: () => void;
}

/** Side rails are decorative slots for perks that are not wired up yet. */
const LEFT_RAIL: Array<[string, string, string]> = [
  ['DOUBLE\nPOT', color.sand, color.ink],
  ['FREE\nENTRY', color.blue, color.white],
  ['SWAP', color.purple, onInk.purple],
];

const RIGHT_RAIL: Array<[string, string, string]> = [
  ['DAILY\nQUEST', color.green, color.white],
  ['SOCIAL\nBONUS', color.greenDeep, color.white],
  ['RANK\nB1', color.panelLight, color.white],
];

const RAIL_WIDTH = 72;

function Rail({ items }: { items: Array<[string, string, string]> }) {
  return (
    <Stack width={RAIL_WIDTH} gap={space.sm}>
      {items.map(([label, bg, fg]) => (
        <Box key={label} bg={bg} bevel={space.sm} padY={space.sm} padX={space.xs} align="center">
          <PixelText variant="tabLabel" color={fg} align="center" lineHeight={13}>
            {label}
          </PixelText>
        </Box>
      ))}
    </Stack>
  );
}

/** Pick a stake, see today's token, find a match. */
export default function DuelLobbyScreen({ stake, onStakeChange, pot, onFind }: DuelLobbyScreenProps) {
  return (
    <Stack pad={space.lg} gap={space.md}>
      <Row gap={space.md} align="stretch">
        <Rail items={LEFT_RAIL} />

        <Stack flex={1} align="center" justify="center" gap={space.sm} bg={color.chartBg} outline={color.ink} padY={space.md}>
          <PixelText variant="label" size={8} color={color.textDim}>
            TODAY&apos;S TOKEN
          </PixelText>
          <PixelText variant="statBig">{TOKEN}</PixelText>
          <MaskAvatar size={118} ring={color.blue} glyphSize={44} />
          <Badge label="HIDDEN FILLS · 5 MIN" tone="quiet" variant="bodySmall" />
        </Stack>

        <Rail items={RIGHT_RAIL} />
      </Row>

      <StakePicker value={stake} onChange={onStakeChange} note={`WINNER TAKES ${sol(pot)} · 2% RAKE`} />

      <PixelButton tone="primary" label="FIND MATCH" size={14} padY={18} onPress={onFind} />

      <PixelText variant="bodySmall" align="center" color={color.textFaint}>
        FOG DUEL 1V1 · PRIVATE ROLLUP · SETTLES ON SOLANA
      </PixelText>
    </Stack>
  );
}
