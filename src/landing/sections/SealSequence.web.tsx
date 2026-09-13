/**
 * The seal, shown as the real transactions of the last duel on this cluster.
 *
 * On a wide screen the section pins and scrolling steps through that duel's
 * life one transaction at a time: the stage names the instruction, says what
 * it did, and decodes the signature the chain handed back. Order is the point —
 * a position is escrowed, gets an access list, is handed to the rollup, and
 * comes home at the buzzer — so the scroll is the timeline. On a narrow screen
 * or with reduced motion it is the same list, unpinned.
 *
 * Below it, the door itself: the gate probe /proof runs, run again from this
 * page, with the answer it gives.
 *
 * The pinned element is rendered unconditionally and never re-keyed. GSAP pins
 * by moving it into a spacer, so if React ever removed or replaced it, React
 * would call removeChild on the section, which no longer holds it, and the
 * page would crash. Only its children change with the data.
 */
import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, ScrollTrigger, scrollerEl, useGSAP } from '../gsapSetup';
import { explorerUrl } from '../../chain/useTxFeed';
import type { GateVerdict } from '../../chain/useGateProbe';
import type { LandingData } from '../useLandingData';
import './seal.css';

const clean = (s: string) => s.replace(/[–—]/g, '-');
const sentence = (s: string) => clean(s.charAt(0).toUpperCase() + s.slice(1));
const shortSig = (s: string) => `${s.slice(0, 10)}…${s.slice(-10)}`;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

type Tone = 'pass' | 'fail' | 'quiet';

const VERDICT: Record<GateVerdict, { text: string; tone: Tone }> = {
  enforced: { text: 'ENFORCED', tone: 'pass' },
  open: { text: 'NOT ENFORCED', tone: 'fail' },
  shut: { text: 'INCONCLUSIVE', tone: 'quiet' },
  'nothing-sealed': { text: 'NOTHING TO TEST', tone: 'quiet' },
  unreachable: { text: 'GATE UNREACHABLE', tone: 'fail' },
};

function doorRows(verdict: GateVerdict, controlBytes: number | null) {
  const served = controlBytes === null ? 'SERVED' : `SERVED ${controlBytes} BYTES`;
  switch (verdict) {
    case 'enforced':
      return [
        { key: 'sealed', label: 'A SEALED POSITION', value: 'REFUSED', tone: 'pass' as Tone },
        { key: 'control', label: 'AN UNSEALED ACCOUNT', value: served, tone: 'quiet' as Tone },
      ];
    case 'open':
      return [
        { key: 'sealed', label: 'A SEALED POSITION', value: 'SERVED', tone: 'fail' as Tone },
        { key: 'control', label: 'AN UNSEALED ACCOUNT', value: served, tone: 'quiet' as Tone },
      ];
    case 'shut':
      return [
        { key: 'sealed', label: 'A SEALED POSITION', value: 'REFUSED', tone: 'quiet' as Tone },
        { key: 'control', label: 'AN UNSEALED ACCOUNT', value: 'REFUSED', tone: 'fail' as Tone },
      ];
    case 'nothing-sealed':
      return [
        { key: 'sealed', label: 'A SEALED POSITION', value: 'NONE UNDER WAY', tone: 'quiet' as Tone },
        { key: 'control', label: 'AN UNSEALED ACCOUNT', value: 'NOT PROBED', tone: 'quiet' as Tone },
      ];
    default:
      return [
        { key: 'sealed', label: 'A SEALED POSITION', value: 'NO ANSWER', tone: 'fail' as Tone },
        { key: 'control', label: 'AN UNSEALED ACCOUNT', value: 'NO ANSWER', tone: 'fail' as Tone },
      ];
  }
}

function Door({ gate }: Pick<LandingData, 'gate'>) {
  const verdict = VERDICT[gate.verdict];
  return (
    <div className="mk-door" aria-live="polite">
      <div className="mk-door__head">
        <h3 className="mk-door__title">THE DOOR, TESTED FROM THIS PAGE</h3>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={gate.loaded ? gate.verdict : 'probing'}
            className={`mk-door__verdict mk-tone-${gate.loaded ? verdict.tone : 'quiet'}`}
            initial={{ y: -18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            {gate.loaded ? verdict.text : 'PROBING'}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="mk-door__grid">
        {doorRows(gate.verdict, gate.controlBytes).map((row) => (
          <div key={row.key} className="mk-door__row">
            <span className="mk-door__label">{row.label}</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={gate.loaded ? row.value : 'probing'}
                className={`mk-door__value mk-tone-${gate.loaded ? row.tone : 'quiet'}`}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 460, damping: 24 }}
              >
                {gate.loaded ? row.value : 'PROBING'}
              </motion.span>
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className="mk-door__note">
        Checked every eight seconds against the same rollup endpoint the app reads from. Enforced by the gate on this
        cluster, and not yet attested by a TEE.
      </p>
    </div>
  );
}

export default function SealSequence({ proof, gate, latestTape, protocol }: Pick<LandingData, 'proof' | 'gate' | 'latestTape' | 'protocol'>) {
  const ref = useRef<HTMLElement>(null);
  const steps = proof.steps;
  const stepKey = steps.map((s) => s.signature).join();

  useGSAP(
    () => {
      const scroller = scrollerEl();
      if (!scroller) return;
      const mm = gsap.matchMedia();

      mm.add({ wide: '(min-width: 900px)', motion: MOTION_OK }, (context) => {
        const { wide, motion } = context.conditions as { wide: boolean; motion: boolean };
        if (!motion) return;

        gsap.from('.mk-door__row', {
          autoAlpha: 0,
          x: 48,
          stagger: 0.14,
          duration: 0.7,
          ease: 'power4.out',
          scrollTrigger: { scroller, trigger: '.mk-door', start: 'top 82%', toggleActions: 'play none none reverse', refreshPriority: ORDER.seal },
        });

        if (steps.length === 0) return;
        const rows = gsap.utils.toArray<HTMLElement>('.mk-life__row');

        if (!wide) {
          gsap.set(rows, { autoAlpha: 0, x: -28 });
          ScrollTrigger.batch(rows, {
            scroller,
            start: 'top 90%',
            once: true,
            onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, x: 0, stagger: 0.08, duration: 0.55, ease: 'power3.out' }),
          });
          return;
        }

        const root = ref.current!;
        const label = root.querySelector<HTMLElement>('.mk-stage__label')!;
        const meaning = root.querySelector<HTMLElement>('.mk-stage__meaning')!;
        const sig = root.querySelector<HTMLElement>('.mk-stage__sig')!;
        const meta = root.querySelector<HTMLElement>('.mk-stage__meta')!;
        const list = root.querySelector<HTMLElement>('.mk-life')!;
        const indicator = root.querySelector<HTMLElement>('.mk-life__indicator')!;
        let active = -1;

        const show = (i: number) => {
          active = i;
          const step = steps[i];
          gsap.to(label, { duration: 0.7, overwrite: true, scrambleText: { text: step.label, chars: 'upperCase', speed: 0.7 } });
          meaning.textContent = sentence(step.meaning);
          gsap.fromTo(meaning, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45, overwrite: true });
          gsap.to(sig, { duration: 0.9, overwrite: true, scrambleText: { text: shortSig(step.signature), chars: BASE58, speed: 0.8 } });
          meta.textContent = `SLOT ${step.slot.toLocaleString('en-US')}    FEE ${(step.fee / 1e9).toFixed(6)}◎${step.err ? '    FAILED' : ''}`;
          rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
          const row = rows[i];
          gsap.to(indicator, { y: row.offsetTop, height: row.offsetHeight, duration: 0.4, ease: 'power3.out', overwrite: true });
          gsap.to(list, { scrollTop: Math.max(0, row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2), duration: 0.5, ease: 'power2.out', overwrite: true });
        };

        show(0);
        ScrollTrigger.create({
          scroller,
          trigger: '.mk-seal__pin',
          pin: true,
          start: 'top top',
          end: () => `+=${steps.length * 42}%`,
          refreshPriority: ORDER.seal,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const i = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
            if (i !== active) show(i);
          },
        });
      });
    },
    { scope: ref, dependencies: [stepKey], revertOnUpdate: true }
  );

  const emptyText = !protocol.reachable
    ? 'THE CLUSTER IS NOT ANSWERING, SO NO TRANSACTIONS CAN BE READ.'
    : latestTape && !proof.loaded
      ? 'READING THE LAST DUEL FROM CHAIN'
      : 'NO DUEL HAS SETTLED ON THIS CLUSTER YET, SO THERE ARE NO TRANSACTIONS TO SHOW.';

  return (
    <section className="mk-section mk-seal" ref={ref} aria-labelledby="mk-seal-title">
      <div className="mk-seal__head">
        <h2 className="mk-h2" id="mk-seal-title">SEALED WHILE IT MATTERS.</h2>
        <p className="mk-body">
          Your position moves to a MagicBlock ephemeral rollup behind an on-chain access list. These are the real
          transactions of the last duel on this cluster.
        </p>
      </div>

      <div className={`mk-seal__pin ${steps.length > 0 ? '' : 'is-empty'}`}>
        {steps.length > 0 ? (
          <>
            {/* Written by GSAP as the scroll advances; React leaves these empty on purpose. */}
            <div className="mk-stage" aria-hidden>
              <span className="mk-stage__label" />
              <p className="mk-stage__meaning" />
              <code className="mk-stage__sig" />
              <span className="mk-stage__meta" />
            </div>
            <ol className="mk-life" aria-label="Transactions of the last duel, oldest first">
              <li className="mk-life__indicator" aria-hidden />
              {steps.map((s) => (
                <li key={s.signature} className="mk-life__row">
                  <motion.a
                    href={explorerUrl(s.signature)}
                    target="_blank"
                    rel="noreferrer"
                    className="mk-life__link"
                    whileHover={{ x: 8 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  >
                    <span className="mk-life__label">{s.label}</span>
                    <span className="mk-life__meaning">{sentence(s.meaning)}</span>
                    <span className="mk-life__sig">{shortSig(s.signature)}</span>
                  </motion.a>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="mk-state mk-seal__empty">{emptyText}</p>
        )}
      </div>

      <Door gate={gate} />
    </section>
  );
}
