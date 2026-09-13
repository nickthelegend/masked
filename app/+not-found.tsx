import { Link } from 'expo-router';
import { ScrollView } from 'react-native';
import { PixelButton, PixelPanel, PixelText, Stack, Wordmark, color, space } from '../src/ui';

/**
 * Branded 404.
 *
 * expo-router ships an unstyled "Unmatched Route" screen. It works, but a
 * mistyped URL in front of a judge should still look like the product.
 */
export default function NotFound() {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: color.bg }}
      contentContainerStyle={{ padding: space.xl, gap: space.lg, maxWidth: 560, alignSelf: 'center', width: '100%' }}
    >
      <Wordmark size={16} />

      <PixelText variant="h1" color={color.yellow}>
        404
      </PixelText>

      <PixelPanel flat bg={color.chartBg}>
        <Stack gap={space.sm}>
          <PixelText variant="label" size={8}>
            NO SUCH ROUTE
          </PixelText>
          <PixelText variant="bodySmall" color={color.textDim}>
            That page does not exist. Every route this app has is below.
          </PixelText>
        </Stack>
      </PixelPanel>

      <Stack gap={space.sm}>
        <Link href="/" asChild>
          <PixelButton tone="gold" label="LANDING" size={10} />
        </Link>
        <Link href="/play" asChild>
          <PixelButton tone="primary" label="PLAY A DUEL" size={10} />
        </Link>
        <Link href="/proof" asChild>
          <PixelButton tone="info" label="ON-CHAIN PROOF" size={10} />
        </Link>
        <Link href="/stats" asChild>
          <PixelButton tone="info" label="PROTOCOL STATS" size={10} />
        </Link>
        <Link href="/health" asChild>
          <PixelButton tone="quiet" label="SYSTEM HEALTH" size={10} />
        </Link>
        <Link href="/spectate" asChild>
          <PixelButton tone="quiet" label="WATCH A DUEL" size={10} />
        </Link>
        <Link href="/tape" asChild>
          <PixelButton tone="quiet" label="READ A SETTLED TAPE" size={10} />
        </Link>
        <Link href="/gallery" asChild>
          <PixelButton tone="quiet" label="COMPONENT GALLERY" size={10} />
        </Link>
      </Stack>
    </ScrollView>
  );
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../src/ui/RouteErrorBoundary';
