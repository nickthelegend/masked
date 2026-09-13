/**
 * Speed, measured from this page, not claimed.
 *
 * `useLatency` asks both chains for their slot every three seconds and divides
 * slots gained by time elapsed. The lanes draw that literally: one square per
 * block, moving at the rate just measured, so the rollup's lane runs as much
 * faster than Solana's as the numbers say and no faster. Before a rate is
 * known the lanes sit still; if the cluster never answers they say so.
 *
 * GSAP runs the lanes and the scroll entrance; the disclosure and the figure's
 * roll on update are Framer Motion.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, scrollerEl, useGSAP } from '../gsapSetup';
import type { LandingData } from '../useLandingData';
import './speed.css';

/** One square plus its gap, in px. The lanes move ten of these per loop. */
const CELL = 24;

export default function SpeedLanes({ latency }: Pick<LandingData, 'latency'>) {
  const ref = useRef<HTMLElement>(null);
  const loops = useRef<{ er?: gsap.core.Tween; l1?: gsap.core.Tween }>({});
  const [open, setOpen] = useState(false);
  const { erSlotsPerSec: er, l1SlotsPerSec: l1, speedup, erMs, l1Ms, samples } = latency;

  useGSAP(
    () => {
      const scroller = scrollerEl();
      if (!scroller) return undefined;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        // Ten cells per loop over ten seconds is one cell per second at a
        // timeScale of 1, so a lane's timeScale is exactly its blocks per second.
        loops.current.er = gsap.fromTo('.mk-lane--rollup .mk-lane__blocks', { x: 0 }, { x: -CELL * 10, duration: 10, ease: 'none', repeat: -1 }).timeScale(0);
        loops.current.l1 = gsap.fromTo('.mk-lane--base .mk-lane__blocks', { x: 0 }, { x: -CELL * 10, duration: 10, ease: 'none', repeat: -1 }).timeScale(0);

        gsap.from('.mk-speed__x', {
          scale: 0.55,
          autoAlpha: 0,
          ease: 'none',
          scrollTrigger: { scroller, trigger: ref.current, start: 'top 85%', end: 'top 25%', scrub: true, refreshPriority: ORDER.speed },
        });
        gsap.from('.mk-lane--rollup', {
          xPercent: -24,
          autoAlpha: 0,
          ease: 'none',
          scrollTrigger: { scroller, trigger: '.mk-lanes', start: 'top 98%', end: 'top 55%', scrub: true, refreshPriority: ORDER.speed },
        });
        gsap.from('.mk-lane--base', {
          xPercent: 24,
          autoAlpha: 0,
          ease: 'none',
          scrollTrigger: { scroller, trigger: '.mk-lanes', start: 'top 98%', end: 'top 55%', scrub: true, refreshPriority: ORDER.speed },
        });
      });
      // Reverted here as well as by the hook: the lane loops repeat forever,
      // and one that outlived an unmount would keep running on detached nodes.
      return () => mm.revert();
    },
    { scope: ref }
  );

  // A lane's playback rate is its measured blocks per second, set outright
  // rather than tweened. Changing timeScale never moves the playhead, so the
  // squares do not jump, and successive three-second measurements differ by a
  // fraction of a block. (Tweening it put a tween on a tween held in a ref,
  // which went on driving the previous mount's loops after a remount.)
  useEffect(() => {
    loops.current.er?.timeScale(er ?? 0);
    loops.current.l1?.timeScale(l1 ?? 0);
  }, [er, l1]);

  const waiting = samples === 0;
  const rate = (n: number | null) => (n === null ? (waiting ? 'WAITING' : 'MEASURING') : `${n.toFixed(1)} BLOCKS/S`);
  const figure = speedup === null ? null : speedup.toFixed(1);

  return (
    <section className="mk-section mk-speed" ref={ref} aria-labelledby="mk-speed-title">
      <div className="mk-speed__grid">
        <div className="mk-speed__copy">
          <h2 className="mk-h2" id="mk-speed-title">FILLS LAND IN THE FAST LANE.</h2>
          <p className="mk-body">
            Measured in your browser right now: blocks per second on the ephemeral rollup against the Solana base layer.
          </p>
        </div>
        <div className="mk-speed__x" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={figure ?? 'none'}
              className="mk-speed__xval"
              initial={{ y: '60%', opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              exit={{ y: '-60%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            >
              {figure ?? (waiting ? 'WAITING' : 'MEASURING')}
            </motion.span>
          </AnimatePresence>
          {figure ? <span className="mk-speed__xunit">× FASTER</span> : null}
        </div>
      </div>

      <div className="mk-lanes">
        <div className={`mk-lane mk-lane--rollup ${er ? '' : 'is-idle'}`}>
          <div className="mk-lane__head">
            <span className="mk-lane__name">MAGICBLOCK EPHEMERAL ROLLUP</span>
            <span className="mk-lane__rate mk-num">{rate(er)}</span>
          </div>
          <div className="mk-lane__track" aria-hidden>
            <div className="mk-lane__blocks" />
          </div>
        </div>
        <div className={`mk-lane mk-lane--base ${l1 ? '' : 'is-idle'}`}>
          <div className="mk-lane__head">
            <span className="mk-lane__name">SOLANA BASE LAYER</span>
            <span className="mk-lane__rate mk-num">{rate(l1)}</span>
          </div>
          <div className="mk-lane__track" aria-hidden>
            <div className="mk-lane__blocks" />
          </div>
        </div>
      </div>

      <div className="mk-speed__foot">
        <p className="mk-state">EACH SQUARE IS ONE BLOCK, MOVING AT THE RATE MEASURED ABOVE.</p>
        <p className="mk-state">A SESSION KEY SIGNS YOUR FILLS, SO ONE WALLET SIGNATURE COVERS A WHOLE ROUND.</p>
      </div>

      <motion.div layout className="mk-disclose-wrap">
        <button type="button" className="mk-disclose" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          HOW THIS IS MEASURED
          <motion.span aria-hidden animate={{ rotate: open ? 45 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}>
            +
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open ? (
            <motion.p
              key="how"
              className="mk-disclose__body"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              Every three seconds this page asks both chains for their current slot, and blocks per second is slots gained
              over the time since the first answer. Round trips right now: rollup{' '}
              {erMs === null ? 'unknown' : `${erMs.toFixed(0)} ms`}, base {l1Ms === null ? 'unknown' : `${l1Ms.toFixed(0)} ms`}.
              On one machine the rollup&apos;s round trip includes the access gate, so it can be the slower of the two. Block
              rate is the claim.
            </motion.p>
          ) : null}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
