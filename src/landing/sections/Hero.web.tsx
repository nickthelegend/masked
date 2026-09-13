/**
 * The hero. Your half is legible; the other half is a real duel.
 *
 * The right-hand side is not an illustration. It is the round under way on the
 * cluster right now if there is one, with both positions sealed and a peek
 * whose answer is the rollup gate's own verdict, measured by the same probe
 * /proof runs. Without a live round it is the last one that settled, whose
 * positions are public by then. With neither, it says so.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, scrollerEl, useGSAP } from '../gsapSetup';
import { PixelCta } from '../MotionLink.web';
import { PixelMask, shortAddr } from '../PixelMask.web';
import { bpsPct } from '../../chain/useTapes';
import type { GateVerdict } from '../../chain/useGateProbe';
import type { LandingData } from '../useLandingData';
import './hero.css';

type HeroProps = Pick<LandingData, 'protocol' | 'live' | 'latestTape' | 'gate' | 'tapesLoaded'>;

/** What the stamp says, straight from the probe's verdict. */
const STAMP: Record<GateVerdict, { text: string; served?: boolean }> = {
  enforced: { text: 'REFUSED' },
  open: { text: 'SERVED', served: true },
  shut: { text: 'NO ANSWER' },
  'nothing-sealed': { text: 'NOTHING SEALED' },
  unreachable: { text: 'GATE DOWN' },
};

const CAPTION: Record<GateVerdict, string> = {
  enforced: 'The rollup refused this sealed position and served an unsealed account in the same check.',
  open: 'A sealed position was served. The privacy claim does not hold right now.',
  shut: 'The gate refused every read, so this check proves nothing yet.',
  'nothing-sealed': 'No position is sealed at this moment. Open a room and yours will be.',
  unreachable: 'The rollup gate is not answering.',
};

const sol = (lamports: number) => `${(lamports / 1e9).toFixed(3)}◎`;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const ticker = (symbol: string) => (!symbol ? 'NO MARKET' : symbol.startsWith('$') ? symbol : `$${symbol}`);

/** Nobody at the page for this long and the hero starts playing itself. */
const IDLE_MS = 8_000;
/** One beat of the loop: a peek opened or closed, or a pair of faces rebuilt. */
const ATTRACT_BEAT_MS = 3_200;

/**
 * True once nobody has touched the page for `ms`.
 *
 * Any pointer, key, wheel or scroll ends it at once. Scroll is heard on the
 * page's own scroller as well as the window, because the landing scrolls
 * inside an element and a scroll there never reaches the window.
 */
function useIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, arm, { passive: true }));
    const scroller = scrollerEl();
    scroller?.addEventListener('scroll', arm, { passive: true });
    arm();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, arm));
      scroller?.removeEventListener('scroll', arm);
    };
  }, [ms]);
  return idle;
}

/**
 * Attract mode: the beats of the hero's loop while nobody is at the page.
 *
 * An arcade cabinet plays itself when nobody is at it; this does the same with
 * the real round rather than a recording. It only counts beats: what a beat
 * does is up to the face-off, and every beat shows something the chain or the
 * gate actually said. Zero while anyone is at the page, and it never runs for
 * reduced motion, in a hidden tab, or with the hero scrolled out of view.
 */
function useAttractBeat(): number {
  const idle = useIdle(IDLE_MS);
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    setBeat(0);
    if (!idle || typeof window === 'undefined' || !window.matchMedia(MOTION_OK).matches) return undefined;
    const id = setInterval(() => {
      const scroller = scrollerEl();
      if (document.hidden || (scroller && scroller.scrollTop > window.innerHeight * 0.6)) return;
      setBeat((b) => b + 1);
    }, ATTRACT_BEAT_MS);
    return () => clearInterval(id);
  }, [idle]);
  return beat;
}

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface Side {
  seed: string;
  token: string;
  pnlBps?: number;
}

function Player({ side, settled }: { side: Side; settled: boolean }) {
  return (
    <div className="mk-player">
      <PixelMask seed={side.seed} />
      <span className="mk-player__token">{ticker(side.token)}</span>
      <span className="mk-player__who">{shortAddr(side.seed)}</span>
      {settled && side.pnlBps !== undefined ? (
        <span className={`mk-player__pnl ${side.pnlBps >= 0 ? 'mk-win' : 'mk-loss'}`}>{bpsPct(side.pnlBps)}</span>
      ) : (
        <span className="mk-player__pnl mk-player__pnl--sealed">SEALED</span>
      )}
    </div>
  );
}

function FaceOff({ protocol, live, latestTape, gate, tapesLoaded }: HeroProps) {
  const now = useNow();
  const ref = useRef<HTMLDivElement>(null);
  const [peek, setPeek] = useState(false);
  const beat = useAttractBeat();
  // Whether the peek on screen was opened by the loop rather than a person, so
  // a person arriving closes the loop's peek and never their own.
  const autoPeek = useRef(false);

  const running = live.find((m) => m.duration - (now - m.startTs) > 0) ?? null;
  const left: Side | null = running
    ? { seed: running.creator.toBase58(), token: running.symbol }
    : latestTape
      ? { seed: latestTape.winner.toBase58(), token: latestTape.symbol, pnlBps: latestTape.winnerPnlBps }
      : null;
  const right: Side | null = running
    ? { seed: running.joiner.toBase58(), token: running.joinerSymbol }
    : latestTape
      ? { seed: latestTape.loser.toBase58(), token: latestTape.loserSymbol, pnlBps: latestTape.loserPnlBps }
      : null;
  const seedKey = `${left?.seed ?? ''}:${right?.seed ?? ''}`;

  // In a live round the loop works the peek, so a visitor who never hovers
  // still sees the gate's real verdict stamped on the sealed position.
  useEffect(() => {
    if (!running) return;
    if (beat > 0) {
      autoPeek.current = true;
      setPeek(beat % 2 === 1);
    } else if (autoPeek.current) {
      autoPeek.current = false;
      setPeek(false);
    }
  }, [beat, running]);

  // With no live round, every other beat rebuilds the settled pair's masks
  // from their wallets, the same assembly a new pair of faces gets.
  const rebuild = running ? 0 : Math.floor(beat / 2);

  // New faces assemble pixel by pixel: a mask is derived from its wallet, and
  // building it from scattered bits is that derivation made visible.
  useGSAP(
    () => {
      if (!left || !right) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        gsap.from('.mk-px.on', { scale: 0, autoAlpha: 0, duration: 0.45, ease: 'back.out(3)', stagger: { amount: 1.2, from: 'random' } });
        gsap.from('.mk-vs', { scale: 3, autoAlpha: 0, duration: 0.55, delay: 0.7, ease: 'power4.out' });
      });
    },
    { scope: ref, dependencies: [seedKey, rebuild], revertOnUpdate: true }
  );

  if (!left || !right) {
    const reading = !protocol.loaded || !tapesLoaded;
    return (
      <div className="mk-faceoff" ref={ref}>
        <div className="mk-faceoff__row" aria-hidden>
          <div className="mk-player"><div className="mk-skeleton mk-faceoff__ghost" /></div>
          <span className="mk-vs">VS</span>
          <div className="mk-player"><div className="mk-skeleton mk-faceoff__ghost" /></div>
        </div>
        <p className="mk-state">
          {reading
            ? 'READING THE LAST ROUND FROM CHAIN'
            : protocol.reachable
              ? 'NO ROUND HAS SETTLED ON THIS CLUSTER YET. THE FIRST ONE APPEARS HERE.'
              : 'THE CLUSTER IS NOT ANSWERING, SO THERE IS NO ROUND TO SHOW.'}
        </p>
      </div>
    );
  }

  return (
    <div className="mk-faceoff" ref={ref}>
      <div className="mk-faceoff__head">
        <span>{running ? 'LIVE ROUND' : 'LAST ROUND, NOW PUBLIC'}</span>
        {running ? (
          <span className="mk-faceoff__clock mk-num" aria-label="Time left in the round">
            {mmss(Math.max(0, running.duration - (now - running.startTs)))}
          </span>
        ) : (
          <span className="mk-num">{`POT ${sol(latestTape!.potPaid + latestTape!.rake)}`}</span>
        )}
      </div>

      <div className="mk-faceoff__row">
        <Player side={left} settled={!running} />
        <span className="mk-vs">VS</span>
        <Player side={right} settled={!running} />
      </div>

      {running ? (
        <>
          <motion.button
            type="button"
            className="mk-peek"
            onHoverStart={() => {
              autoPeek.current = false;
              setPeek(true);
            }}
            onHoverEnd={() => setPeek(false)}
            onTap={() => {
              autoPeek.current = false;
              setPeek((p) => !p);
            }}
            whileTap={{ scale: 0.985 }}
            aria-pressed={peek}
          >
            <span className="mk-fog" aria-hidden />
            <span className="mk-peek__label">PEEK AT THEIR POSITION</span>
            <AnimatePresence>
              {peek ? (
                <motion.span
                  key={gate.verdict}
                  className={`mk-stamp ${STAMP[gate.verdict].served ? 'is-served' : ''}`}
                  initial={{ scale: 2.2, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: -7 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 20 }}
                >
                  {STAMP[gate.verdict].text}
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.button>
          <p className="mk-faceoff__caption" aria-live="polite">
            {peek
              ? CAPTION[gate.verdict]
              : `Each side staked ${sol(running.entry)}. Sizes, sides and fills stay on the rollup until the buzzer.`}
          </p>
        </>
      ) : (
        <p className="mk-faceoff__caption">
          Both positions were sealed until the buzzer. Now every fill from that round is on the public tape.
        </p>
      )}

      {/* Space always reserved, so the label arriving never moves the hero. */}
      <p className="mk-attract" data-on={beat > 0 ? 'true' : 'false'} aria-hidden>
        {running ? 'DEMO LOOP · PEEKING FOR YOU' : 'DEMO LOOP · REBUILDING THE MASKS'} · MOVE TO TAKE OVER
      </p>
    </div>
  );
}

export default function Hero(props: HeroProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      gsap.matchMedia().add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
        tl.from('.mk-seam', { scale: 0, duration: 1, ease: 'expo.inOut' })
          .fromTo(
            '.mk-hero__them',
            { clipPath: 'inset(0% 0% 0% 100%)' },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'expo.inOut', clearProps: 'clipPath' },
            0.15
          )
          .from('.mk-hero__you .mk-eyebrow', { autoAlpha: 0, x: -24, duration: 0.6 }, 0.3)
          .from('.mk-hero__you .mk-line > span', { yPercent: 118, duration: 1, stagger: 0.14 }, 0.35)
          .from(['.mk-hero__sub', '.mk-hero__ctas'], { autoAlpha: 0, y: 22, duration: 0.7, stagger: 0.12 }, 0.9);

        // Leaving the hero, the halves drift apart: the seam between your side
        // and theirs is the idea the rest of the page keeps returning to.
        const scroller = scrollerEl();
        if (scroller && ref.current) {
          const drift = { scroller, trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true, refreshPriority: ORDER.hero };
          gsap.to('.mk-hero__you', { yPercent: -14, ease: 'none', scrollTrigger: drift });
          gsap.to('.mk-hero__them', { yPercent: 10, ease: 'none', scrollTrigger: { ...drift } });
        }
      });
    },
    { scope: ref }
  );

  return (
    <header className="mk-hero" ref={ref}>
      <div className="mk-hero__you">
        <p className="mk-eyebrow">1V1 TRADING DUELS ON SOLANA</p>
        <h1 className="mk-hero__title">
          <span className="mk-line"><span>TRADE BLIND.</span></span>
          <span className="mk-line mk-line--accent"><span>TAKE THE POT.</span></span>
        </h1>
        <p className="mk-hero__sub">
          Each player picks any token and trades it long or short. Positions stay sealed until the buzzer.
        </p>
        <div className="mk-hero__ctas">
          <PixelCta href="/play" label="PLAY" />
          <PixelCta href="/proof" label="PROOF" tone="ghost" />
        </div>
      </div>
      <div className="mk-seam" aria-hidden />
      <div className="mk-hero__them">
        <FaceOff {...props} />
      </div>
    </header>
  );
}
