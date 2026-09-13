import { useLocalSearchParams } from 'expo-router';
import SpectateScreen from '../../src/screens/SpectateScreen';

/** /spectate/<match address> — watch a duel with no wallet. */
export default function SpectateRoute() {
  const { match } = useLocalSearchParams<{ match?: string }>();
  return <SpectateScreen address={typeof match === 'string' ? match : null} />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../../src/ui/RouteErrorBoundary';
