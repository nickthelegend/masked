/**
 * The landing page, for the web.
 *
 * The page is built like a round of the game: your side of the seam is
 * legible, the other side is fogged, and scrolling walks through what happens
 * between the stake and the reveal, ending on a real settled duel, unsealed.
 * Every figure on it comes from the same chain hooks the app uses, read once in
 * useLandingData, and every section that cannot read its data says so instead
 * of showing a placeholder.
 *
 * GSAP owns scroll and timelines; Framer Motion owns pointer interaction. The
 * two never animate the same element.
 */
import { useEffect, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import { usePathname } from 'expo-router';
import { requestRefresh, ScrollTrigger, SCROLLER_ID } from './gsapSetup';
import { useLandingData } from './useLandingData';
import HudNav from './sections/HudNav.web';
import Hero from './sections/Hero.web';
import MarketsRail from './sections/MarketsRail.web';
import SealSequence from './sections/SealSequence.web';
import LiveWindow from './sections/LiveWindow.web';
import SpeedLanes from './sections/SpeedLanes.web';
import Reveal from './sections/Reveal.web';
import RecordBento from './sections/RecordBento.web';
import Finale from './sections/Finale.web';
import './landing.css';

export default function Landing() {
  const data = useLandingData();
  const pageRef = useRef<HTMLDivElement>(null);
  // The page is position: fixed over the viewport. If the router keeps this
  // screen mounted underneath another route, it must not paint over it.
  const onLanding = usePathname() === '/';

  // Data that changes the page's shape. When it changes, a section may have
  // rebuilt a pin or grown, and every trigger below it must be re-measured.
  // Children's layout effects have already rebuilt their triggers by the time
  // this effect runs.
  const layoutKey = [
    data.protocol.loaded,
    data.tapesLoaded,
    data.proof.steps.length,
    data.latestTape?.match ?? '',
    data.players.length,
    data.open.length,
    data.memes.markets.length,
    data.majors.markets.length,
  ].join('|');

  // Synchronously: every section has already rebuilt its triggers in this same
  // commit, so one refresh here re-measures the page in its final shape.
  useEffect(() => {
    if (onLanding) ScrollTrigger.refresh();
  }, [layoutKey, onLanding]);

  // Anything else that changes height, such as fonts settling or an image
  // arriving, is caught here, in any tab that is rendering.
  useEffect(() => {
    const page = pageRef.current;
    if (!page) return undefined;
    const observer = new ResizeObserver(() => requestRefresh());
    observer.observe(page);
    return () => observer.disconnect();
  }, [onLanding]);

  if (!onLanding) return null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="mk-root">
        <div id={SCROLLER_ID} className="mk-scroller">
          <div className="mk-page" ref={pageRef}>
            <HudNav protocol={data.protocol} />
            <main>
              <Hero
                protocol={data.protocol}
                live={data.live}
                latestTape={data.latestTape}
                gate={data.gate}
                tapesLoaded={data.tapesLoaded}
              />
              <MarketsRail memes={data.memes} majors={data.majors} />
              <SealSequence proof={data.proof} gate={data.gate} latestTape={data.latestTape} protocol={data.protocol} />
              <LiveWindow />
              <SpeedLanes latency={data.latency} />
              <Reveal latestTape={data.latestTape} tapesLoaded={data.tapesLoaded} protocol={data.protocol} />
              <RecordBento protocol={data.protocol} players={data.players} open={data.open} roomsLoaded={data.roomsLoaded} />
            </main>
            <Finale />
          </div>
        </div>
        <div className="mk-scanlines" aria-hidden />
      </div>
    </MotionConfig>
  );
}
