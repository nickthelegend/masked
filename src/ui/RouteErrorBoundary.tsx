import { useEffect } from 'react';
import { ScrollView } from 'react-native';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import PixelPanel from './PixelPanel';
import PixelText from './PixelText';
import PixelButton from './PixelButton';
import Row from './Row';
import Stack from './Stack';
import { color, space } from './theme';

/**
 * One route's crash, kept to that route.
 *
 * The root layout's ErrorBoundary replaces the whole app with its fallback, so
 * a render error on one screen took the wallet, the toasts and every other
 * route down with it. Expo Router renders a route's exported `ErrorBoundary`
 * around that route alone, so every file in `app/` re-exports this one: the
 * error in the product's own frame, a retry that re-renders only this screen,
 * and a way home. The root boundary stays as the last resort for anything that
 * fails outside a route.
 */
export default function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  useEffect(() => {
    console.error('[fogduel] route render error', error);
  }, [error]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.xl, gap: space.lg, maxWidth: 640, alignSelf: 'center', width: '100%' }}
    >
      <PixelText variant="h2" color={color.red}>
        THIS SCREEN BROKE
      </PixelText>
      <PixelText variant="bodySmall" color={color.textDim}>
        Only this screen stopped. Your wallet and every other screen are still running.
      </PixelText>
      <PixelPanel flat bg={color.chartBg}>
        <Stack gap={space.sm}>
          <PixelText variant="label" size={8}>
            {error.name.toUpperCase()}
          </PixelText>
          <PixelText variant="bodySmall" size={10} color={color.textDim}>
            {error.message}
          </PixelText>
        </Stack>
      </PixelPanel>
      <Row gap={space.sm}>
        <PixelButton flex={1} tone="gold" label="RETRY THIS SCREEN" onPress={() => void retry()} />
        <PixelButton flex={1} tone="quiet" label="HOME" onPress={() => router.replace('/')} />
      </Row>
    </ScrollView>
  );
}
