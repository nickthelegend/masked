/**
 * The bar across the top: brand, what the cluster is doing right now, and the
 * three places worth going. The gold line under it is how far through the page
 * the reader is, drawn by scroll.
 */
import { useRef } from 'react';
import { gsap, MOTION_OK, scrollerEl, useGSAP } from '../gsapSetup';
import { NavLink, PixelCta, useGo } from '../MotionLink.web';
import { Wordmark } from '../../ui';
import { ACTIVE_CLUSTER } from '../../chain/config';
import { useInstallPrompt } from '../../ui/pwa';
import type { LandingData } from '../useLandingData';

export default function HudNav({ protocol }: Pick<LandingData, 'protocol'>) {
  const ref = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const go = useGo();
  // Offered only once the browser says the page is installable.
  const { canInstall, install } = useInstallPrompt();

  useGSAP(
    () => {
      const scroller = scrollerEl();
      const page = scroller?.querySelector('.mk-page');
      if (scroller && page) {
        gsap.fromTo(
          barRef.current,
          { scaleX: 0 },
          { scaleX: 1, ease: 'none', scrollTrigger: { scroller, trigger: page, start: 'top top', end: 'bottom bottom', scrub: 0.4 } }
        );
      }
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.from(ref.current, { yPercent: -100, duration: 0.7, ease: 'power3.out' });
      });
    },
    { scope: ref }
  );

  const cluster = ACTIVE_CLUSTER.name.toUpperCase();
  const status = !protocol.loaded
    ? 'READING THE CLUSTER'
    : protocol.reachable
      ? `${cluster} CLUSTER LIVE`
      : `${cluster} CLUSTER UNREACHABLE`;

  return (
    <nav className="mk-nav" ref={ref} aria-label="Main">
      <a className="mk-nav__brand" href="/" onClick={go('/')} aria-label="MASKED home">
        <Wordmark size={12} />
      </a>

      <div className="mk-nav__status" aria-live="polite">
        <span className={`mk-live ${protocol.loaded && !protocol.reachable ? 'is-down' : ''}`} aria-hidden />
        <span>{status}</span>
        {protocol.loaded && protocol.reachable ? (
          <span>{`${protocol.open} OPEN ${protocol.open === 1 ? 'ROOM' : 'ROOMS'}`}</span>
        ) : null}
      </div>

      <div className="mk-nav__right">
        <NavLink href="/proof">PROOF</NavLink>
        <NavLink href="/stats">STATS</NavLink>
        <NavLink href="/tape">TAPES</NavLink>
        {canInstall ? (
          <button type="button" className="mk-navlink mk-navlink--button" onClick={() => void install()}>
            INSTALL
          </button>
        ) : null}
        <PixelCta href="/play" label="PLAY" size="small" />
      </div>

      <span className="mk-progress" ref={barRef} aria-hidden />
    </nav>
  );
}
