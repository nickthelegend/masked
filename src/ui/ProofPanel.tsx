import type { ViewStyle } from 'react-native';
import PixelPanel from './PixelPanel';
import Row from './Row';
import Stack from './Stack';
import PixelText from './PixelText';
import Badge from './Badge';
import Divider from './Divider';
import { color, space } from './theme';

export interface ProofRow {
  label: string;
  value: string;
  /** good = green, bad = red, neutral = default. */
  tone?: 'good' | 'bad' | 'neutral';
  mono?: boolean;
}

export interface ProofPanelProps {
  title: string;
  note?: string;
  rows: ProofRow[];
  /** Shown as a badge in the header. */
  status?: { label: string; tone: 'live' | 'soon' | 'win' | 'loss' | 'quiet' | 'gold' };
  style?: ViewStyle | ViewStyle[];
}

const toneColor = (t: ProofRow['tone']) =>
  t === 'good' ? color.green : t === 'bad' ? color.red : color.white;

/**
 * A labelled readout of things that are true on-chain right now.
 *
 * Exists because "we use Ephemeral Rollups" is a claim, and an account whose
 * owner is visibly `DELeGG…` is evidence. Judges get the evidence.
 */
export default function ProofPanel({ title, note, rows, status, style }: ProofPanelProps) {
  return (
    <PixelPanel flat bg={color.chartBg} style={style}>
      <Stack gap={space.sm}>
        <Row justify="space-between" gap={space.sm}>
          <PixelText variant="label" size={8}>
            {title}
          </PixelText>
          {status ? <Badge label={status.label} tone={status.tone} /> : null}
        </Row>

        {note ? (
          <PixelText variant="bodySmall" size={10} color={color.textFaint}>
            {note}
          </PixelText>
        ) : null}

        <Stack>
          {rows.map((r) => (
            <Stack key={r.label}>
              <Divider color={color.panel} />
              <Row justify="space-between" gap={space.sm} padY={space.xs}>
                <PixelText variant="bodySmall" size={10} color={color.textDim}>
                  {r.label}
                </PixelText>
                <PixelText
                  variant={r.mono ? 'bodySmall' : 'numeric'}
                  size={r.mono ? 10 : 8}
                  color={toneColor(r.tone)}
                  numberOfLines={1}
                >
                  {r.value}
                </PixelText>
              </Row>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </PixelPanel>
  );
}
