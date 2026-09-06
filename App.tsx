/**
 * MASKED — Expo entry.
 *
 * Gates render until both pixel faces are ready (per ui/platform-notes.md §1);
 * pixel text reflows badly if it paints in a fallback face first.
 *
 * In development a small switch swaps between the running app and the UI
 * gallery, so every component can be checked on device without a second entry.
 */
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { Silkscreen_400Regular } from '@expo-google-fonts/silkscreen';

import { Box, PixelText, color } from './src/ui';
import MaskedApp from './src/screens/MaskedApp';
import UIGallery from './src/screens/UIGallery';

type Entry = 'app' | 'gallery';

/**
 * On web, `?gallery` opens the component gallery directly — handy for
 * screenshotting the library without walking the app first.
 */
const initialEntry = (): Entry =>
  Platform.OS === 'web' && typeof window !== 'undefined' && window.location.search.includes('gallery')
    ? 'gallery'
    : 'app';

export default function App() {
  const [ready] = useFonts({ PressStart2P_400Regular, Silkscreen_400Regular });
  const [entry, setEntry] = useState<Entry>(initialEntry);

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.screen }} />;

  return (
    <View style={{ flex: 1 }}>
      {entry === 'app' ? <MaskedApp /> : <UIGallery />}
      {__DEV__ ? (
        <Box style={{ position: 'absolute', right: 10, bottom: 10, width: 132 }}>
          <PixelText variant="tabLabel" onPress={() => setEntry(entry === 'app' ? 'gallery' : 'app')}>
            {entry === 'app' ? 'UI GALLERY' : 'BACK TO APP'}
          </PixelText>
        </Box>
      ) : null}
    </View>
  );
}
