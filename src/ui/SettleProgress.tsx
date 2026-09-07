import { useEffect, useRef } from 'react';
import { Animated, Easing, type ViewStyle } from 'react-native';
import Row from './Row';
import Stack from './Stack';
import Box from './Box';
import PixelText from './PixelText';
import { border, color, space } from './theme';
import { useReducedMotion } from './motion';

export interface SettleStageView {
  id: string;
  label: string;
  note: string;
  state: 'waiting' | 'running' | 'done' | 'failed';
  detail?: string;
}

export interface SettleProgressProps {
  stages: SettleStageView[];
  style?: ViewStyle | ViewStyle[];
}

const TONE = {
  waiting: color.textFaint,
  running: color.yellow,
  done: color.green,
  failed: color.red,
} as const;

const MARK = { waiting: '·', running: '>', done: '#', failed: 'x' } as const;

/** A pulsing marker for the stage that is currently working. */
function StageMark({ state }: { state: SettleStageView['state'] }) {
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state !== 'running' || reduced) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, reduced, pulse]);

  return (
    <Animated.View style={{ opacity: pulse }}>
      <Box
        bg={state === 'waiting' ? color.ink : TONE[state]}
        outline={color.ink}
        outlineWidth={border.thin}
        width={16}
        height={16}
        align="center"
        justify="center"
      >
        <PixelText variant="tabLabel" size={7} color={state === 'waiting' ? color.textFaint : color.ink}>
          {MARK[state]}
        </PixelText>
      </Box>
    </Animated.View>
  );
}

/**
 * What settling a duel is actually doing.
 *
 * Between the buzzer and the reveal there are twenty-odd seconds of the most
 * interesting work in the product — positions coming off the rollup, Solana
 * taking ownership back, the pot being paid — and the app used to show nothing
 * at all while it happened. Every line here reflects a real stage that has
 * really completed, with the real count of transactions it took.
 */
export default function SettleProgress({ stages, style }: SettleProgressProps) {
  return (
    <Stack gap={space.sm} pad={space.md} bg={color.ink} outline={color.panelLight} outlineWidth={border.thin} style={style}>
      <PixelText variant="label" size={8} color={color.yellow}>
        SETTLING ON SOLANA
      </PixelText>
      {stages.map((s) => (
        <Row key={s.id} gap={space.sm} align="center">
          <StageMark state={s.state} />
          <Stack flex={1} gap={1}>
            <PixelText variant="bodySmall" size={10} color={TONE[s.state]}>
              {s.label}
            </PixelText>
            <PixelText variant="bodySmall" size={9} color={color.textFaint} numberOfLines={1}>
              {s.detail ?? s.note}
            </PixelText>
          </Stack>
        </Row>
      ))}
    </Stack>
  );
}
