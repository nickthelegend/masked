/**
 * The reveal: the last round that settled on this cluster, unsealed.
 *
 * On a wide screen the section pins and the scroll plays the buzzer: the fog
 * over both positions tears apart, both masks come in, both equity curves draw
 * themselves fill by fill, and both results count up to what the program
 * actually paid. Everything under the curtain is the tape `settle_match`
 * wrote — the curves are `replayEquity` over its recorded fills, not a line
 * drawn to a final number.
 *
 * The count-up and the curves are GSAP's, so those elements are left empty or
 * undrawn by React and written only by the timeline. The winner/loser focus is
 * Framer Motion, on the wrapping groups rather than the paths.
 *
 * The pinned element always renders and is never keyed: GSAP moves it into a
 * spacer, and React replacing it would crash on removeChild. A new tape
 * replaces the keyed fragment inside it instead.
 */
import { Fragment, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, scrollerEl, useGSAP } from '../gsapSetup';
import { PixelCta } from '../MotionLink.web';
import { PixelMask, shortAddr } from '../PixelMask.web';
import type { LandingData } from '../useLandingData';
import './reveal.css';

const W = 600;
const H = 260;
const PAD = 14;
const FOCI = ['BOTH', 'WINNER', 'LOSER'] as const;
type Focus = (typeof FOCI)[number];

const sol = (lamports: number) => `${(lamports / 1e9).toFixed(3)}◎`;
const pct = (bps: number) => `${bps >= 0 ? '+' : ''}${(bps / 100).toFixed(2)}%`;
const ticker = (symbol: string) => (!symbol ? 'NO MARKET' : symbol.startsWith('$') ? symbol : `$${symbol}`);

function paths(winner: number[], loser: number[]) {
  const all = [...winner, ...loser, 0];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const y = (v: number) => PAD + (H - 2 * PAD) * (1 - (v - min) / (max - min || 1));
  const line = (s: number[]) => s.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (s.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return { winner: line(winner), loser: line(loser), zero: y(0) };
}

export default function Reveal({ latestTape, tapesLoaded, protocol }: Pick<LandingData, 'latestTape' | 'tapesLoaded' | 'protocol'>) {
  const ref = useRef<HTMLElement>(null);
  const [focus, setFocus] = useState<Focus>('BOTH');
  const t = latestTape;
  const matchKey = t?.match ?? '';

  useGSAP(
    () => {
      const scroller = scrollerEl();
      if (!t || !scroller) return;
      const pnls = gsap.utils.toArray<HTMLElement>('.mk-tape__pnl');
      const finals = pnls.map((el) => Number(el.dataset.bps));
      const write = (share: number) => pnls.forEach((el, i) => (el.textContent = pct(Math.round(finals[i] * share))));

      gsap.matchMedia().add({ wide: '(min-width: 900px)', motion: MOTION_OK }, (context) => {
        const { wide, motion } = context.conditions as { wide: boolean; motion: boolean };

        if (!motion || !wide) {
          write(1);
          if (!motion) {
            gsap.set('.mk-tape__path', { strokeDashoffset: 0 });
            return;
          }
          gsap.fromTo(
            '.mk-tape__path',
            { strokeDashoffset: 1 },
            {
              strokeDashoffset: 0,
              duration: 1.4,
              stagger: 0.2,
              ease: 'power2.out',
              scrollTrigger: { scroller, trigger: '.mk-tape', start: 'top 78%', refreshPriority: ORDER.reveal },
            }
          );
          return;
        }

        write(0);
        const share = { v: 0 };
        gsap
          .timeline({
            scrollTrigger: { scroller, trigger: '.mk-reveal__pin', pin: true, start: 'top top', end: '+=150%', scrub: 0.8, refreshPriority: ORDER.reveal },
          })
          .to('.mk-curtain__half--left', { xPercent: -115, rotate: -4, ease: 'power2.in', duration: 0.45 }, 0)
          .to('.mk-curtain__half--right', { xPercent: 115, rotate: 4, ease: 'power2.in', duration: 0.45 }, 0)
          .from('.mk-tape__side .mk-mask', { scale: 0.6, autoAlpha: 0, duration: 0.3, stagger: 0.06 }, 0.22)
          .fromTo('.mk-tape__path', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.42, stagger: 0.06, ease: 'none' }, 0.42)
          .to(share, { v: 1, duration: 0.28, ease: 'none', onUpdate: () => write(share.v) }, 0.68)
          .from('.mk-tape__money', { autoAlpha: 0, y: 26, duration: 0.2 }, 0.8);
      });
    },
    { scope: ref, dependencies: [matchKey], revertOnUpdate: true }
  );

  const chart = t ? paths(t.winnerSeries, t.loserSeries) : null;

  return (
    <section className="mk-section mk-reveal" ref={ref} aria-labelledby="mk-reveal-title">
      <div className="mk-reveal__head">
        <p className="mk-eyebrow">AT THE BUZZER</p>
        <h2 className="mk-h2" id="mk-reveal-title">THEN EVERYTHING IS PUBLIC.</h2>
        <p className="mk-body">
          Both positions commit back to Solana, the program compares PnL and pays the pot, and a tape of every fill is
          written for anyone to read. This is the last one.
        </p>
      </div>

      <div className={`mk-reveal__pin ${t && chart ? '' : 'is-empty'}`}>
        {t && chart ? (
          <Fragment key={t.match}>
            <div className="mk-tape">
              <div className="mk-tape__side">
                <span className="mk-tape__role is-winner">WINNER</span>
                <PixelMask seed={t.winner.toBase58()} />
                <span className="mk-tape__token">{ticker(t.symbol)}</span>
                <span className="mk-tape__who">{shortAddr(t.winner.toBase58())}</span>
                <span className={`mk-tape__pnl ${t.winnerPnlBps >= 0 ? 'mk-win' : 'mk-loss'}`} data-bps={t.winnerPnlBps} aria-label={`Winner PnL ${pct(t.winnerPnlBps)}`} />
              </div>

              <div className="mk-tape__chart">
                <svg className="mk-tape__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Both players' equity, fill by fill">
                  <line className="mk-tape__zero" x1={0} x2={W} y1={chart.zero} y2={chart.zero} />
                  <motion.g animate={{ opacity: focus === 'LOSER' ? 0.14 : 1 }} transition={{ duration: 0.3 }}>
                    <path className="mk-tape__path is-winner" d={chart.winner} pathLength={1} />
                  </motion.g>
                  <motion.g animate={{ opacity: focus === 'WINNER' ? 0.14 : 1 }} transition={{ duration: 0.3 }}>
                    <path className="mk-tape__path is-loser" d={chart.loser} pathLength={1} />
                  </motion.g>
                </svg>
                <div className="mk-tape__axis">
                  <span>ENTRY</span>
                  <span>FILL BY FILL</span>
                  <span>BUZZER</span>
                </div>
                <div className="mk-focus" role="group" aria-label="Highlight a curve">
                  {FOCI.map((f) => (
                    <button key={f} type="button" className={focus === f ? 'is-on' : ''} aria-pressed={focus === f} onClick={() => setFocus(f)}>
                      {focus === f ? <motion.span layoutId="mk-focus-fill" className="mk-focus__fill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} /> : null}
                      <span className="mk-focus__text">{f}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mk-tape__side">
                <span className="mk-tape__role">LOSER</span>
                <PixelMask seed={t.loser.toBase58()} />
                <span className="mk-tape__token">{ticker(t.loserSymbol)}</span>
                <span className="mk-tape__who">{shortAddr(t.loser.toBase58())}</span>
                <span className={`mk-tape__pnl ${t.loserPnlBps >= 0 ? 'mk-win' : 'mk-loss'}`} data-bps={t.loserPnlBps} aria-label={`Loser PnL ${pct(t.loserPnlBps)}`} />
              </div>

              <div className="mk-tape__money">
                <div className="mk-tape__figures mk-num">
                  <span>POT <strong>{sol(t.potPaid + t.rake)}</strong></span>
                  <span>RAKE <strong>{sol(t.rake)}</strong></span>
                  <span>TO THE WINNER <strong>{sol(t.potPaid)}</strong></span>
                  <span>SETTLED <strong>{`${new Date(t.settledTs * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`}</strong></span>
                </div>
                <PixelCta href={`/tape/${t.match}`} label="READ THE TAPE" tone="ghost" size="small" />
              </div>
            </div>

            <div className="mk-curtain" aria-hidden>
              <div className="mk-curtain__half mk-curtain__half--left">
                <span className="mk-curtain__word">SEALED</span>
              </div>
              <div className="mk-curtain__half mk-curtain__half--right">
                <span className="mk-curtain__word">SEALED</span>
              </div>
            </div>
          </Fragment>
        ) : (
          <p className="mk-state mk-reveal__empty">
            {!tapesLoaded
              ? 'READING THE LAST SETTLED ROUND FROM CHAIN'
              : protocol.reachable
                ? 'NO ROUND HAS SETTLED ON THIS CLUSTER YET. THE FIRST ONE IS REVEALED HERE.'
                : 'THE CLUSTER IS NOT ANSWERING, SO THERE IS NO TAPE TO REVEAL.'}
          </p>
        )}
      </div>
    </section>
  );
}
