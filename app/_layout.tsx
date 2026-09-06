/**
 * Root layout. Gates every route until both pixel faces are ready — per
 * ui/platform-notes.md, pixel text reflows badly if it paints in a fallback
 * face first, and that is far more visible on a landing page than in-app.
 */
// Must come first: web3.js touches Buffer/crypto at import time.
import '../src/chain/polyfills';
import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { Silkscreen_400Regular } from '@expo-google-fonts/silkscreen';
import { color } from '../src/ui';
import MaskedWalletProvider from '../src/chain/WalletProvider';

export default function RootLayout() {
  const [ready] = useFonts({ PressStart2P_400Regular, Silkscreen_400Regular });

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.screen }} />;

  return (
    <MaskedWalletProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: color.bg },
          animation: 'none',
        }}
      />
    </MaskedWalletProvider>
  );
}
