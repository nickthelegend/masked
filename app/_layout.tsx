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
import { color, ErrorBoundary, ToastProvider } from '../src/ui';
import OfflineBanner from '../src/ui/OfflineBanner';
import MaskedWalletProvider from '../src/chain/WalletProvider';
import { startShell } from '../src/ui/pwa';

// The manifest, the offline shell and the install prompt, before anything renders.
startShell();

export default function RootLayout() {
  const [ready] = useFonts({ PressStart2P_400Regular, Silkscreen_400Regular });

  if (!ready) return <View style={{ flex: 1, backgroundColor: color.screen }} />;

  return (
    <ErrorBoundary>
      <MaskedWalletProvider>
        <ToastProvider>
          <View style={{ flex: 1 }}>
            <OfflineBanner />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: color.bg },
                animation: 'none',
              }}
            />
          </View>
        </ToastProvider>
      </MaskedWalletProvider>
    </ErrorBoundary>
  );
}
