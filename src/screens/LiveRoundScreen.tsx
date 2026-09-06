import {
  Badge,
  Box,
  FillTape,
  Orb,
  orbStateForPnl,
  PixelButton,
  PixelPanel,
  PixelText,
  PnLOdometer,
  PnLReadout,
  PotPill,
  Row,
  RoundClock,
  Stack,
  TapeChart,
  color,
  space,
} from '../ui';
import type { Fill } from '../ui';
import { TOKEN } from './data';

export interface LiveRoundScreenProps {
  secondsLeft: number;
  pot: number;
  series: number[];
  price: number;
  myPnl: number;
  positionLabel: string;
  opponentName: string;
  opponentFills: number;
  fills: Fill[];
  onLong: () => void;
  onClose: () => void;
  onSkip: () => void;
  busy?: boolean;
  error?: string | null;
}

/**
 * The live round. Your side is fully legible; theirs shows a fill count and
 * nothing else, which is the entire premise of the mode.
 */
export default function LiveRoundScreen({
  secondsLeft,
  pot,
  series,
  price,
  myPnl,
  positionLabel,
  opponentName,
  opponentFills,
  fills,
  onLong,
  onClose,
  onSkip,
  busy = false,
  error = null,
}: LiveRoundScreenProps) {
  return (
    <Stack pad={space.md} gap={space.md}>
      <Row justify="space-between" bg={color.ink} outline={color.panelLight} pad={space.sm + 2}>
        <Row gap={space.sm}>
          {/* The orb is a glanceable read on your position — green when up,
              red when down, cyan while flat. */}
          <Orb size={22} state={orbStateForPnl(myPnl)} />
          <PixelText variant="numeric" size={8} color={color.textDim}>
            {TOKEN}
          </PixelText>
        </Row>
        <RoundClock seconds={secondsLeft} />
        <PotPill amount={pot} tone={color.green} />
      </Row>

      <PixelPanel flat bg={color.chartBg} pad={space.sm}>
        <Stack gap={space.xs}>
          <TapeChart mine={series} height={200} baseline />
          <Row justify="space-between">
            <PixelText variant="bodySmall">PRICE {price.toFixed(4)}</PixelText>
            <Row gap={space.xs}>
              <PixelText variant="bodySmall" color={color.textDim}>
                YOUR PNL
              </PixelText>
              <PnLOdometer value={myPnl} size={11} signed />
            </Row>
          </Row>
        </Stack>
      </PixelPanel>

      <Row gap={space.sm} align="stretch">
        <PnLReadout panel flex={1} label="YOU" value={myPnl} note={positionLabel} />
        <PnLReadout
          panel
          flex={1}
          label={opponentName.toUpperCase()}
          fogged
          note={`FOGGED · ${opponentFills} FILLS`}
          accent={color.panelLight}
        />
      </Row>

      <Row gap={space.sm}>
        <PixelButton flex={1} tone="primary" label="LONG" padY={16} loading={busy} onPress={onLong} />
        <PixelButton flex={1} tone="danger" label="CLOSE" padY={16} loading={busy} onPress={onClose} />
      </Row>

      {error ? <Badge label={error.slice(0, 48).toUpperCase()} tone="loss" variant="bodySmall" /> : null}

      <FillTape fills={fills} note="HIDDEN UNTIL REVEAL" />

      <Box>
        {/* Settles early on purpose. Permissionless on-chain once the clock
            expires; this just triggers it now so a demo need not wait. */}
        <PixelButton tone="quiet" bg={color.panelLight} label="SETTLE NOW" size={8} padY={space.sm} loading={busy} onPress={onSkip} />
      </Box>
    </Stack>
  );
}
