/**
 * The close: the name, assembled, and the one thing to do next.
 *
 * The wordmark's letters start scattered and come together as the reader
 * arrives, which is the page's last beat: the round is over, the pieces are
 * back in place. The dither band behind it is the fog coming back in for the
 * next round. Both are scroll-scrubbed GSAP; the call to action's magnetic pull
 * is Framer Motion.
 */
import { useRef } from 'react';
import { gsap, MOTION_OK, ORDER, scrollerEl, SplitText, useGSAP } from '../gsapSetup';
import { NavLink, PixelCta } from '../MotionLink.web';
import { ACTIVE_CLUSTER } from '../../chain/config';
import './finale.css';

const clusterHost = (() => {
  try {
    return new URL(ACTIVE_CLUSTER.l1).host;
  } catch {
    return ACTIVE_CLUSTER.l1;
  }
})();

export default function Finale() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const scroller = scrollerEl();
      if (!scroller) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        const split = new SplitText('.mk-finale__word', { type: 'chars', charsClass: 'mk-finale__char' });
        gsap.from(split.chars, {
          xPercent: () => gsap.utils.random(-240, 240),
          yPercent: () => gsap.utils.random(-280, 180),
          rotate: () => gsap.utils.random(-75, 75),
          autoAlpha: 0,
          ease: 'none',
          stagger: { each: 0.05, from: 'random' },
          scrollTrigger: { scroller, trigger: ref.current, start: 'top bottom', end: 'center 58%', scrub: 1, refreshPriority: ORDER.finale },
        });
        gsap.fromTo(
          '.mk-finale__band',
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: { scroller, trigger: ref.current, start: 'top 70%', end: 'bottom bottom', scrub: true, refreshPriority: ORDER.finale },
          }
        );
        return () => split.revert();
      });
    },
    { scope: ref }
  );

  return (
    <footer className="mk-section mk-finale" ref={ref}>
      <div className="mk-finale__band" aria-hidden />
      <h2 className="mk-finale__word">MASKED</h2>
      <p className="mk-finale__line">Two traders, one pot, and nobody sees your hand until the buzzer.</p>
      <PixelCta href="/play" label="PLAY" size="huge" magnetic />
      <nav className="mk-finale__links" aria-label="More of the app">
        <NavLink href="/proof">PROOF</NavLink>
        <NavLink href="/stats">STATS</NavLink>
        <NavLink href="/tape">TAPES</NavLink>
        <NavLink href="/spectate">WATCH</NavLink>
      </nav>
      <p className="mk-finale__note">{`EVERY NUMBER ON THIS PAGE IS READ FROM THE ${ACTIVE_CLUSTER.name.toUpperCase()} CLUSTER AT ${clusterHost}.`}</p>
    </footer>
  );
}
