import UIGallery from '../src/screens/UIGallery';

/** /gallery — every component in every state. */
export default function GalleryRoute() {
  return <UIGallery />;
}

// A render error here stays on this screen — see RouteErrorBoundary.
export { default as ErrorBoundary } from '../src/ui/RouteErrorBoundary';
