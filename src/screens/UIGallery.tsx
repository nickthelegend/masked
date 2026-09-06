import { ScrollView, View } from 'react-native';
import { PixelText, color, space } from '../ui';

export default function UIGallery() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.screen }} contentContainerStyle={{ padding: space.lg }}>
      <PixelText variant="h2">UI GALLERY</PixelText>
      <View style={{ height: space.md }} />
      <PixelText variant="body">Components land here one commit at a time.</PixelText>
    </ScrollView>
  );
}
