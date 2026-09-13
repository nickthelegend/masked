import TapeScreen from '../../src/screens/TapeScreen';

/** /tape with no address — explains what to do. */
export default function TapeIndexRoute() {
  return <TapeScreen address={null} />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../../src/ui/RouteErrorBoundary';
