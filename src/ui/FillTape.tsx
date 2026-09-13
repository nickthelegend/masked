import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import Divider from './Divider';
import FogOverlay from './FogOverlay';
import { color, space } from './theme';

export interface Fill {
  /** LONG, SHORT, CLOSE, COVER, FLIP LONG / FLIP SHORT, LIQUIDATED or SETTLE — or any short label. */
  side: string;
  /** Fill price, pre-formatted. */
  px: string;
  /** Round clock at the time of the fill. */
  t: string;
}

export interface FillTapeProps {
  fills: Fill[];
  title?: string;
  /** Right-hand caption, e.g. "HIDDEN UNTIL REVEAL". */
  note?: string;
  /** Draws the fog curtain over the rows — the opponent's tape pre-reveal. */
  fogged?: boolean;
  fogLabel?: string;
  emptyLabel?: string;
  /** Rows shown before older fills are dropped. */
  maxRows?: number;
  style?: ViewStyle | ViewStyle[];
}

// Buys green and sells red, whatever they did to the position — the label says
// which. SHORT used to fall through to white, and COVER did not exist.
const SIDE_TONE: Record<string, string> = {
  LONG: color.green,
  COVER: color.green,
  'FLIP LONG': color.green,
  SHORT: color.red,
  CLOSE: color.red,
  'FLIP SHORT': color.red,
  LIQUIDATED: color.red,
  SETTLE: color.yellow,
};

/**
 * The fill list. Yours is legible to you and captioned "HIDDEN UNTIL REVEAL",
 * because it is hidden from your opponent, not from you. Pass `fogged` to draw
 * the curtain over someone else's tape.
 */
export default function FillTape({
  fills,
  title = 'YOUR TAPE',
  note,
  fogged = false,
  fogLabel = 'HIDDEN',
  emptyLabel = 'no fills yet',
  maxRows = 6,
  style,
}: FillTapeProps) {
  const rows: Fill[] = fills.length ? fills.slice(0, maxRows) : [{ side: '—', px: emptyLabel, t: '' }];

  return (
    <PixelPanel flat style={style}>
      <Stack gap={space.sm}>
        <Row justify="space-between">
          <PixelText variant="label" size={8}>
            {title}
          </PixelText>
          {note ? (
            <PixelText variant="label" size={8} color={color.textFaint}>
              {note}
            </PixelText>
          ) : null}
        </Row>
        <Stack>
          {rows.map((f, i) => (
            <Stack key={`${f.side}-${f.t}-${i}`}>
              <Divider />
              <Row justify="space-between" padY={space.xs}>
                <PixelText variant="bodySmall" color={SIDE_TONE[f.side] ?? color.white}>
                  {f.side}
                </PixelText>
                <PixelText variant="bodySmall" color={color.textDim}>
                  {f.px}
                </PixelText>
                <PixelText variant="bodySmall" color={color.white}>
                  {f.t}
                </PixelText>
              </Row>
            </Stack>
          ))}
        </Stack>
      </Stack>
      <FogOverlay active={fogged} label={fogLabel} />
    </PixelPanel>
  );
}
