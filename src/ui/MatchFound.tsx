import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Stack from './Stack';
import Row from './Row';
import Box from './Box';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import VersusCard from './VersusCard';
import TokenLogo from './TokenLogo';
import { ClockIcon } from './icons';
import { color, space, radius, border } from './theme';

export interface MatchFoundProps {
  /** Shortened wallet of the reader. */
  me: string;
  /** Shortened wallet of the other side. */
  them: string;
  /** Full wallets, for the generated masks. */
  meSeed?: string | null;
  themSeed?: string | null;
  /** Each side's ticker. Both are public — they live in the match account. */
  myToken?: { mint: string; symbol: string; uri?: string | null } | null;
  theirToken?: { mint: string; symbol: string; uri?: string | null } | null;
  /** Round length in seconds, printed as minutes. */
  duration: number;
  /** Seconds the card stays up before it dismisses itself. */
  hold?: number;
  onDone: () => void;
}

/**
 * The lock-in card, shown once as a duel goes live.
 *
 * It says the round is already running, because it is: `join_match` starts the
 * clock in the same transaction that pairs the two wallets, so there is no
 * pre-round lobby to narrate. A "starts in 3…" here would be a countdown to
 * something that had already happened, and would cost the reader three seconds
 * of a five-minute round to watch it.
 */
export default function MatchFound({
  me,
  them,
  meSeed = null,
  themSeed = null,
  myToken = null,
  theirToken = null,
  duration,
  hold = 4,
  onDone,
}: MatchFoundProps) {
  const [left, setLeft] = useState(hold);

  /**
   * The dismiss callback, held in a ref so it is not a dependency.
   *
   * Callers pass an inline arrow, so its identity changes on every render —
   * and this screen re-renders about once a second, because the match poll
   * replaces the match object at that rate. As a dependency it tore down the
   * one-second interval and built a new one before the old could ever fire,
   * so the countdown never counted and the card never dismissed itself: it sat
   * over a live round, reading `TRADE NOW (4)`, until it was tapped.
   */
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const id = setInterval(() => {
      setLeft((n) => {
        if (n <= 1) {
          clearInterval(id);
          onDoneRef.current();
          return 0;
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const mins = Math.round(duration / 60);

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(6,10,28,0.96)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: space.lg,
        zIndex: 40,
      }}
    >
      <Pressable onPress={onDone} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ width: '100%' }}>
        <Stack gap={space.lg} align="center" width="100%">
          <PixelText variant="h1" size={17} color={color.white}>
            MATCH FOUND
          </PixelText>

          <Row align="center" gap={space.xs}>
            <ClockIcon size={10} color={color.yellow} />
            <PixelText variant="tabLabel" size={9} color={color.yellow}>
              {`${mins} MIN ROUND · LIVE NOW`}
            </PixelText>
          </Row>

          <Row align="center" gap={space.md} width="100%">
            <VersusCard name={me} seed={meSeed ?? me} accent={color.cyan} you />
            <Box
              width={40}
              height={40}
              round={radius.pill}
              bg={color.red}
              outline={color.ink}
              outlineWidth={border.base}
              align="center"
              justify="center"
            >
              <PixelText variant="h2" size={13} color={color.white}>
                VS
              </PixelText>
            </Box>
            <VersusCard name={them} seed={themSeed ?? them} accent={color.magenta} />
          </Row>

          {/* Both tickers, side by side. Each leg is on chain the moment it is
              chosen, so naming them costs the fog nothing. */}
          <Row align="center" justify="space-between" gap={space.sm} width="100%">
            {[myToken, theirToken].map((t, i) =>
              t ? (
                <Row
                  key={`${t.symbol}-${i}`}
                  flex={1}
                  align="center"
                  justify="center"
                  gap={space.xs}
                  bg={color.panel}
                  outline={i === 0 ? color.cyan : color.magenta}
                  outlineWidth={border.thin}
                  round={radius.tile}
                  padY={space.xs}
                >
                  <TokenLogo mint={t.mint} symbol={t.symbol} uri={t.uri ?? null} size={16} />
                  <PixelText variant="tabLabel" size={8} color={color.white}>
                    {`$${t.symbol}`}
                  </PixelText>
                </Row>
              ) : (
                <Box key={`gap-${i}`} flex={1} />
              )
            )}
          </Row>

          <Stack gap={space.xs} align="center">
            <PixelText variant="h2" size={13} color={color.yellow}>
              GET READY
            </PixelText>
            <PixelText variant="bodySmall" size={11} align="center" color={color.textDim}>
              Both players are locked in. Your positions are sealed from each other until the buzzer.
            </PixelText>
          </Stack>

          <PixelButton tone="primary" label={`TRADE NOW (${left})`} size={11} onPress={onDone} />
        </Stack>
      </Pressable>
    </View>
  );
}
