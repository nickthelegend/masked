import { useLocalSearchParams } from 'expo-router';
import TapeScreen from '../../src/screens/TapeScreen';

/** /tape/<match address> — a settled duel at a permanent URL, no wallet. */
export default function TapeRoute() {
  const { match } = useLocalSearchParams<{ match?: string }>();
  return <TapeScreen address={typeof match === 'string' ? match : null} />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../../src/ui/RouteErrorBoundary';
