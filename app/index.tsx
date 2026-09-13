import Landing from '../src/landing/Landing';

/** / — the marketing page. Landing.web.tsx on web, the component-library page on native. */
export default function IndexRoute() {
  return <Landing />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../src/ui/RouteErrorBoundary';
