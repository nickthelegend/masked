import { View } from 'react-native';
import { PixelText, color } from '../ui';

export default function MaskedApp() {
  return (
    <View style={{ flex: 1, backgroundColor: color.screen, alignItems: 'center', justifyContent: 'center' }}>
      <PixelText variant="wordmark">MASKED</PixelText>
    </View>
  );
}
