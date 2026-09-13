import StatsScreen from '../src/screens/StatsScreen';

/**
 * /stats — protocol-wide numbers, summed from chain, no wallet required.
 */
export default function StatsRoute() {
  return <StatsScreen />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../src/ui/RouteErrorBoundary';
