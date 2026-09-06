import { Pressable } from 'react-native';
import { Box, ConnectWalletButton, IconPlate, MenuIcon, PixelText, ResetIcon, Row, color, space } from '../ui';

export interface AppHeaderProps {
  balance: number;
  onHome: () => void;
  onMenu?: () => void;
}

const BUTTON_WIDTH = 38;
const BUTTON_HEIGHT = 44;

/** Screen chrome: reset, balance chip, wordmark, menu. */
export default function AppHeader({ balance, onHome, onMenu }: AppHeaderProps) {
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

      <Pressable onPress={onMenu} accessibilityRole="button" accessibilityLabel="Menu" android_ripple={null}>
        <Box
          bg={color.green}
          outline={color.ink}
          width={BUTTON_WIDTH}
          height={BUTTON_HEIGHT}
          align="center"
          justify="center"
        >
          <MenuIcon size={18} color={color.white} />
        </Box>
      </Pressable>
    </Row>
  );
}
