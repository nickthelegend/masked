/**
 * The game itself, in a window on the page.
 *
 * Not a recording and not a mock-up: an iframe of the app's own routes, served
 * by the same bundle as this page and talking to the same cluster. It mounts
 * only once the reader is getting close, because it is the whole app.
 *
 * Scrolling brings the cabinet forward and flat, the way you step up to a
 * machine; the screen tabs are Framer Motion, and switching one swaps the
 * route and shows a veil until the new screen has loaded.
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, ScrollTrigger, scrollerEl, useGSAP } from '../gsapSetup';
import './window.css';

const SCREENS = [
  { key: 'play', label: 'PLAY', href: '/play', note: 'Open a room or join one' },
  { key: 'watch', label: 'WATCH', href: '/spectate', note: 'Live rounds, fogged for you too' },
  { key: 'tapes', label: 'TAPES', href: '/tape', note: 'Every settled round, in public' },
] as const;

type Screen = (typeof SCREENS)[number];

export default function LiveWindow() {
  const ref = useRef<HTMLElement>(null);
  const [screen, setScreen] = useState<Screen>(SCREENS[0]);
  const [mounted, setMounted] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const host = typeof window === 'undefined' ? '' : window.location.host;

  useGSAP(
    () => {
      const scroller = scrollerEl();
      if (!scroller) return;

      ScrollTrigger.create({
        scroller,
        trigger: ref.current,
        start: 'top 180%',
        once: true,
        refreshPriority: ORDER.window,
        onEnter: () => setMounted(true),
      });

      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.fromTo(
          '.mk-cabinet',
          { scale: 0.8, rotateX: 24, y: 90, transformOrigin: '50% 100%' },
          {
            scale: 1,
            rotateX: 0,
            y: 0,
            ease: 'none',
            scrollTrigger: { scroller, trigger: '.mk-window__stage', start: 'top bottom', end: 'center 62%', scrub: 0.6, refreshPriority: ORDER.window },
          }
        );
      });
    },
    { scope: ref }
  );

  const choose = (next: Screen) => {
    if (next.key === screen.key) return;
    setScreen(next);
    setLoaded(false);
  };

  return (
    <section className="mk-section mk-window" ref={ref} aria-labelledby="mk-window-title">
      <div className="mk-window__head">
        <h2 className="mk-h2" id="mk-window-title">THIS IS THE GAME.</h2>
        <p className="mk-body">The real app, running against the local cluster. Open a room, pick a token and play it right here.</p>
      </div>

      <div className="mk-window__tabs" role="tablist" aria-label="Choose a screen of the app">
        {SCREENS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={s.key === screen.key}
            className={`mk-wtab ${s.key === screen.key ? 'is-on' : ''}`}
            onClick={() => choose(s)}
          >
            {s.key === screen.key ? (
              <motion.span layoutId="mk-wtab-fill" className="mk-wtab__fill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
            ) : null}
            <span className="mk-wtab__label">{s.label}</span>
            <span className="mk-wtab__note">{s.note}</span>
          </button>
        ))}
      </div>

      <div className="mk-window__stage">
        <div className="mk-cabinet">
          <div className="mk-cabinet__bar">
            <span>LIVE APP</span>
            <span className="mk-num">{`${host}${screen.href}`}</span>
          </div>
          <div className="mk-cabinet__screen">
            {mounted ? (
              <iframe key={screen.key} src={screen.href} title={`MASKED, ${screen.label.toLowerCase()} screen`} onLoad={() => setLoaded(true)} />
            ) : null}
            <AnimatePresence>
              {!loaded ? (
                <motion.div className="mk-cabinet__veil" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                  <span className="mk-state">{mounted ? `LOADING ${screen.href}` : 'THE APP LOADS AS YOU REACH IT'}</span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
