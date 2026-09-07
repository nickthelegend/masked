import { Pressable } from 'react-native';
import {
  Box,
  ConnectWalletButton,
  HudBar,
  SoundOffIcon,
  SoundOnIcon,
  color,
  playSound,
  useSoundEnabled,
} from '../ui';

export interface AppHeaderProps {
  balance: number;
  /** Duels this wallet has won, read from its on-chain player account. */
  trophies?: number;
  onHome: () => void;
}

const BUTTON_WIDTH = 38;
const BUTTON_HEIGHT = 34;

/**
 * Screen chrome: back, what you hold, what you have won, wallet, sound.
 *
 * The green slot used to be a menu button whose `onMenu` was never passed by
 * anything, so it was a control that did nothing — and there is no menu for it
 * to open. It is the sound toggle now, which is a thing the app genuinely
 * needs somewhere: the round has a buzzer and a countdown, and audio nobody
 * can switch off is audio that gets the tab muted instead.
 *
 * The wordmark is gone from here. The shell it sits in already says MASKED
 * above the screen, and at 375px the six controls did not fit beside it.
 */
export default function AppHeader({ balance, trophies = 0, onHome }: AppHeaderProps) {
  const [sound, setSound] = useSoundEnabled();

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    // Confirm by demonstration: turning it on plays the thing being turned on,
    // which also gets the browser's audio context unblocked by this very tap.
    if (next) playSound('fill');
  };

  return (
    <HudBar balance={balance.toFixed(2)} trophies={trophies} onBack={onHome}>
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
            <SoundOnIcon size={16} color={color.white} />
          ) : (
            <SoundOffIcon size={16} color={color.textDim} />
          )}
        </Box>
      </Pressable>
    </HudBar>
  );
}
