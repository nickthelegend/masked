import { Linking, Pressable, type ViewStyle } from 'react-native';
import Box from './Box';
import PixelPanel from './PixelPanel';
import PixelText from './PixelText';
import Row from './Row';
import Stack from './Stack';
import Divider from './Divider';
import Badge from './Badge';
import { border, color, space } from './theme';

export interface LifecycleStep {
  signature: string;
  /** What the step is called, e.g. DELEGATE POSITION TO ER. */
  label: string;
  /** What it demonstrates, in one line. */
  meaning: string;
  slot: number;
  err: boolean;
  url: string;
}

export interface LifecycleFeedProps {
  steps: LifecycleStep[];
  loaded?: boolean;
  title?: string;
  subtitle?: string;
  emptyLabel?: string;
  style?: ViewStyle | ViewStyle[];
}

const short = (s: string) => `${s.slice(0, 8)}…${s.slice(-6)}`;

/**
 * One duel's life, in the order it happened, each step a real signature.
 *
 * The rest of /proof reports state — who owns what account right now. This
 * reports the transitions, which is the part that is otherwise taken on trust:
 * that a position really was handed to the delegation program, that an ACL
 * really was created before it, and that the delegation program itself really
 * gave ownership back. Every row opens in an explorer, so none of it has to be
 * believed on our say-so.
 *
 * Ascending by slot, unlike the feed above it, because a lifecycle read newest
 * first is not a lifecycle.
 */
export default function LifecycleFeed({
  steps,
  loaded = true,
  title = 'THE LIFE OF ONE DUEL',
  subtitle,
  emptyLabel = 'NO DUEL TO TRACE YET',
  style,
}: LifecycleFeedProps) {
  // A refused transaction is still a signature against the account, so it comes
  // back in the history — and it used to be listed as a step of the duel's life,
  // numbered and named for what it had tried to do, with only its colour to say
  // otherwise. Counting the steps counted the failures as progress. They are
  // labelled now, and counted on their own.
  const failed = steps.filter((s) => s.err).length;
  return (
    <PixelPanel flat bg={color.chartBg} style={style}>
      <Stack gap={space.sm}>
        <Row justify="space-between" gap={space.sm}>
          <PixelText variant="label" size={8}>
            {title}
          </PixelText>
          <Badge
            label={failed > 0 ? `${steps.length} · ${failed} FAILED` : `${steps.length}`}
            tone={failed > 0 ? 'loss' : 'quiet'}
            variant="tabLabel"
          />
        </Row>

        {subtitle ? (
          <PixelText variant="bodySmall" size={9} color={color.textFaint}>
            {subtitle}
          </PixelText>
        ) : null}

        <Stack>
          {steps.map((s, i) => (
            <Stack key={s.signature}>
              <Divider color={color.panel} />
              <Pressable
                onPress={() => void Linking.openURL(s.url)}
                accessibilityRole="link"
                accessibilityLabel={`Open ${s.err ? 'failed ' : ''}transaction ${s.signature} in an explorer`}
              >
                <Row gap={space.sm} align="center" style={{ paddingVertical: space.xs }}>
                  <Box
                    bg={s.err ? color.red : color.blue}
                    outline={color.ink}
                    outlineWidth={border.thin}
                    width={16}
                    height={16}
                    align="center"
                    justify="center"
                  >
                    <PixelText variant="tabLabel" size={7} color={color.white}>
                      {i + 1}
                    </PixelText>
                  </Box>
                  <Stack flex={1} gap={1}>
                    <Row justify="space-between" gap={space.sm}>
                      <PixelText variant="bodySmall" size={9} color={s.err ? color.red : color.cyan}>
                        {s.err ? `${s.label} · FAILED` : s.label}
                      </PixelText>
                      <PixelText variant="bodySmall" size={8} color={color.textFaint}>
                        slot {s.slot}
                      </PixelText>
                    </Row>
                    <PixelText variant="bodySmall" size={8} color={s.err ? color.red : color.textDim} numberOfLines={2}>
                      {s.err ? `REFUSED ON CHAIN — changed nothing (${s.meaning})` : s.meaning}
                    </PixelText>
                    <PixelText variant="bodySmall" size={8} color={color.textFaint}>
                      {short(s.signature)}
                    </PixelText>
                  </Stack>
                </Row>
              </Pressable>
            </Stack>
          ))}

          {steps.length === 0 ? (
            <PixelText variant="bodySmall" size={9} color={color.textFaint}>
              {loaded ? emptyLabel : 'READING THE CHAIN…'}
            </PixelText>
          ) : null}
        </Stack>
      </Stack>
    </PixelPanel>
  );
}
