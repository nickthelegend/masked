import { Modal, Pressable, View } from 'react-native';
import Stack from './Stack';
import Row from './Row';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import { border, color, space } from './theme';

export interface WalletChoice {
  name: string;
  /** Adapters report this; "Installed" is the only one worth pre-selecting. */
  ready: boolean;
}

export interface WalletPickerProps {
  visible: boolean;
  wallets: WalletChoice[];
  onSelect: (name: string) => void;
  onClose: () => void;
}

/**
 * Which wallet to connect with.
 *
 * The connect button used to select `wallets[0]` outright, which is fine with
 * one wallet and silently wrong with two — on a local validator the app also
 * offers an in-page key, and there was no way to reach it.
 */
export default function WalletPicker({ visible, wallets, onSelect, onClose }: WalletPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Tapping the scrim dismisses, which is what every picker does. */}
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close wallet picker"
        style={{
          flex: 1,
          backgroundColor: 'rgba(6,10,28,0.82)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: space.lg,
        }}
      >
        {/* Swallow presses inside the panel so it does not close itself. */}
        <Pressable onPress={() => {}}>
          <Stack
            gap={space.md}
            pad={space.lg}
            bg={color.panel}
            outline={color.blue}
            outlineWidth={border.base}
            style={{ width: 300, maxWidth: '100%' }}
          >
            <Row justify="space-between" align="center">
              <PixelText variant="label" size={9} color={color.yellow}>
                CONNECT A WALLET
              </PixelText>
            </Row>

            <Stack gap={space.sm}>
              {wallets.map((w) => (
                <PixelButton
                  key={w.name}
                  label={w.name.toUpperCase()}
                  tone={w.ready ? 'primary' : 'quiet'}
                  size={9}
                  onPress={() => onSelect(w.name)}
                />
              ))}
            </Stack>

            <PixelButton label="CANCEL" tone="quiet" size={8} onPress={onClose} />
          </Stack>
        </Pressable>
      </Pressable>
      <View />
    </Modal>
  );
}
