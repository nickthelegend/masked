import { Pressable } from 'react-native';
import {
  Box,
  ConnectWalletButton,
  IconPlate,
  PixelText,
  ResetIcon,
  Row,
  SoundOffIcon,
  SoundOnIcon,
  color,
  playSound,
  space,
  useSoundEnabled,
} from '../ui';

export interface AppHeaderProps {
  balance: number;
  onHome: () => void;
}

const BUTTON_WIDTH = 38;
const BUTTON_HEIGHT = 44;

/**
 * Screen chrome: reset, balance chip, wordmark, wallet, sound.
 *
 * The green slot used to be a menu button whose `onMenu` was never passed by
 * anything, so it was a control that did nothing — and there is no menu for it
 * to open. It is the sound toggle now, which is a thing the app genuinely
 * needs somewhere: the round has a buzzer and a countdown, and audio nobody
 * can switch off is audio that gets the tab muted instead.
 */
export default function AppHeader({ balance, onHome }: AppHeaderProps) {
  const [sound, setSound] = useSoundEnabled();

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    // Confirm by demonstration: turning it on plays the thing being turned on,
    // which also gets the browser's audio context unblocked by this very tap.
    if (next) playSound('fill');
  };

  return (
    <Row gap={space.sm} pad={space.sm}>
      <Pressable onPress={onHome} accessibilityRole="button" accessibilityLabel="Back to feed" android_ripple={null}>
        <Box
          bg={color.blue}
          outline={color.ink}
          width={BUTTON_WIDTH}
          height={BUTTON_HEIGHT}
          align="center"
          justify="center"
        >
          <ResetIcon size={18} color={color.white} />
        </Box>
      </Pressable>

      <Row gap={space.sm} bg={color.panel} outline={color.ink} pad={space.xs}>
        <IconPlate glyph="$" bg={color.blue} ink={color.yellow} size={22} glyphSize={9} edge={color.ink} />
        <PixelText variant="numeric" size={10}>
          {balance.toFixed(2)}
        </PixelText>
      </Row>

      <PixelText variant="wordmark" size={13} align="center" style={{ flex: 1 }}>
        MASKED
      </PixelText>

      <ConnectWalletButton size={8} padY={8} />

      <Pressable
        onPress={toggleSound}
        accessibilityRole="switch"
        accessibilityState={{ checked: sound }}
        accessibilityLabel={sound ? 'Sound on' : 'Sound off'}
        android_ripple={null}
      >
        <Box
          bg={sound ? color.green : color.panel}
          outline={color.ink}
          width={BUTTON_WIDTH}
          height={BUTTON_HEIGHT}
          align="center"
          justify="center"
        >
          {sound ? (
            <SoundOnIcon size={18} color={color.white} />
          ) : (
            <SoundOffIcon size={18} color={color.textDim} />
          )}
        </Box>
      </Pressable>
    </Row>
  );
}
