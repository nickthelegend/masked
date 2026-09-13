import ProofScreen from '../src/screens/ProofScreen';

/** /proof — live on-chain evidence for judges. */
export default function ProofRoute() {
  return <ProofScreen />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../src/ui/RouteErrorBoundary';
