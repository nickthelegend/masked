import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import Stack from './Stack';
import PixelText from './PixelText';
import { color, space } from './theme';
import { pct, signColor } from './format';
import type { TypeRole } from './tokens';

export interface PnLReadoutProps {
  /** PnL as a percentage. Ignored when `fogged`. */
  value?: number;
  /** Caption above the number: "YOU", "YOUR PNL", the opponent's handle. */
  label?: string;
  /** Caption below: "FLAT", "LONG FROM 0.9981", "3 FILLS". */
  note?: string;
  /** Hides the number behind blocks — the opponent mid-round. */
  fogged?: boolean;
  /** Colors the number by sign instead of printing it white. */
  signed?: boolean;
  /** Overrides the number's color outright. */
  tone?: string;
  /** Wraps the readout in a flat panel outlined in `accent`. */
  panel?: boolean;
  /** Panel outline: cyan for you, magenta for the revealed opponent. */
  accent?: string;
  bg?: string;
  labelVariant?: Extract<TypeRole, 'label' | 'bodySmall' | 'tabLabel'>;
  labelColor?: string;
  size?: number;
  flex?: number;
  style?: ViewStyle | ViewStyle[];
}

const FOG_BLOCKS = '████';

/**
 * The PnL number and its two captions. Font scaling is off (it inherits
 * PixelText's display-face rule) because this sits in fixed-height HUD boxes.
 *
 * `fogged` prints solid blocks instead of the figure — the opponent's score is
 * concealed, not merely blurred, so there is nothing to read off.
 */
export default function PnLReadout({
  value = 0,
  label,
  note,
  fogged = false,
  signed = false,
  tone,
  panel = false,
  accent = color.cyan,
  bg,
  labelVariant = 'label',
  labelColor,
  size = 13,
  flex,
  style,
}: PnLReadoutProps) {
  const body = (
    <Stack gap={space.xs}>
      {label ? (
        <PixelText variant={labelVariant} size={labelVariant === 'label' ? 8 : undefined} color={labelColor ?? (fogged ? color.textFaint : accent)}>
          {label}
        </PixelText>
      ) : null}
      <PixelText
        variant="numeric"
        size={size}
        color={fogged ? color.textFaint : (tone ?? (signed ? signColor(value) : color.white))}
      >
        {fogged ? FOG_BLOCKS : pct(value)}
      </PixelText>
      {note ? (
        <PixelText variant="bodySmall" color={fogged ? color.textFaint : color.textDim}>
          {note}
        </PixelText>
      ) : null}
    </Stack>
  );

  if (!panel) return body;

  return (
    <PixelPanel flat accent={accent} bg={bg ?? (fogged ? color.chartBg : color.panel)} flex={flex} style={style}>
      {body}
    </PixelPanel>
  );
}
