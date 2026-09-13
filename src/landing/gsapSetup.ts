/**
 * GSAP for the landing page, registered once.
 *
 * The page scrolls inside its own element, not the window: Expo Router's web
 * shell sets `body { overflow: hidden }` and gives each screen a fixed-height
 * container. Every ScrollTrigger here names that element as its scroller.
 *
 * It is looked up by id, not passed down as a ref. React runs a child's layout
 * effects before it attaches the parent's ref, so a section building triggers
 * on first mount would still see `ref.current === null` while the element is
 * already in the document. And it is passed as an element, not a selector:
 * inside a scoped gsap.context, selector text resolves within the section, and
 * the scroller is not inside any section.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin, useGSAP);

// Development builds only: a handle for driving and inspecting the page's
// timelines from a browser session — for instance advancing them in a
// background tab, where requestAnimationFrame never fires. Stripped from the
// production export, where NODE_ENV is "production".
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as unknown as { __mkMotion?: unknown }).__mkMotion = { gsap, ScrollTrigger };
}

export const SCROLLER_ID = 'mk-scroller';

/** The page's scrolling element. In the document from the first layout pass. */
export const scrollerEl = (): HTMLElement | null =>
  typeof document === 'undefined' ? null : document.getElementById(SCROLLER_ID);

/**
 * Refresh order, top of the page first.
 *
 * Several sections build their triggers only once chain data has arrived, which
 * is not top-to-bottom, and a pin adds its whole scroll distance to everything
 * below it, so sections must be measured in page order. ScrollTrigger refreshes
 * a HIGHER refreshPriority first (its sort weighs each trigger by
 * refreshPriority * -1e6), so the hero carries the largest number. Numbered the
 * other way round, the reveal was measured before the seal above it had pinned,
 * and started three thousand pixels too early.
 */
export const ORDER = {
  hero: 8,
  markets: 7,
  seal: 6,
  window: 5,
  speed: 4,
  reveal: 3,
  record: 2,
  finale: 1,
} as const;

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Recompute every trigger's start and end, once, soon.
 *
 * For layout changes nothing else announces, such as fonts settling or an
 * image arriving. Several calls in the same moment collapse into one refresh.
 */
export function requestRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 60);
}

/** Choreography only runs for people who have not asked for less motion. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)';

export { gsap, ScrollTrigger, SplitText, useGSAP };
