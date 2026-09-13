import SpectateScreen from '../../src/screens/SpectateScreen';

/** /spectate with no address — explains what to do. */
export default function SpectateIndexRoute() {
  return <SpectateScreen address={null} />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../../src/ui/RouteErrorBoundary';
