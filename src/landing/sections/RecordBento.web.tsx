/**
 * The record: what this cluster has actually done, as five cells.
 *
 * Every figure is the same aggregate /stats shows, from `useProtocolStats`:
 * summed over Match and Tape accounts, with the rake checked against the
 * treasury's own balance rather than restated. The biggest cell is the players
 * themselves, every wallet that has finished a duel, each as the mask it wears
 * in the game.
 *
 * GSAP reveals the cells in order and brings the masks in as the grid enters;
 * figures rolling over on update and a mask naming its wallet on hover are
 * Framer Motion, on inner elements GSAP never touches.
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, scrollerEl, useGSAP } from '../gsapSetup';
import { useGo } from '../MotionLink.web';
import { MaskTile, shortAddr } from '../PixelMask.web';
import type { LandingData } from '../useLandingData';
import './record.css';

const sol = (lamports: number) => `${(lamports / 1e9).toFixed(3)}◎`;
const WALL_MAX = 64;

function Figure({ value, accent = false }: { value: string; accent?: boolean }) {
  return (
    <span className={`mk-cell__value ${accent ? 'is-accent' : ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="mk-cell__roll"
          initial={{ y: '55%', opacity: 0 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={{ y: '-55%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export default function RecordBento({ protocol, players, open, roomsLoaded }: Pick<LandingData, 'protocol' | 'players' | 'open' | 'roomsLoaded'>) {
  const ref = useRef<HTMLElement>(null);
  const go = useGo();
  const [hovered, setHovered] = useState<string | null>(null);

  const known = protocol.loaded && protocol.reachable;
  const unknown = protocol.loaded ? 'UNKNOWN' : 'READING';
  const withdrawable = protocol.treasuryLamports - protocol.treasuryRentFloor;
  const drift = withdrawable - protocol.rakeLamports;
  const wall = players.slice(0, WALL_MAX);
  const wallKey = wall.join();

  useGSAP(
    () => {
      const scroller = scrollerEl();
      if (!scroller) return;
      gsap.matchMedia().add(MOTION_OK, () => {
        const tl = gsap
          .timeline({
            scrollTrigger: { scroller, trigger: '.mk-bento', start: 'top 80%', toggleActions: 'play none none reverse', refreshPriority: ORDER.record },
          })
          .fromTo(
            '.mk-cell',
            { clipPath: 'inset(100% 0% 0% 0%)' },
            { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.8, stagger: 0.1, ease: 'power4.inOut' }
          );
        // The wall has no slots until the first tape is read, and a tween with
        // nothing to move only logs a warning. It is rebuilt when the wall fills.
        if (wall.length > 0) {
          tl.from('.mk-wall__slot', { scale: 0, autoAlpha: 0, duration: 0.3, stagger: { amount: 0.9, from: 'random' }, ease: 'back.out(2.5)' }, 0.35);
        }
      });
    },
    { scope: ref, dependencies: [wallKey], revertOnUpdate: true }
  );

  return (
    <section className="mk-section mk-record" ref={ref} aria-labelledby="mk-record-title">
      <div className="mk-record__head">
        <h2 className="mk-h2" id="mk-record-title">THE RECORD, READ FROM CHAIN.</h2>
        <p className="mk-body">
          Summed from every Match and Tape account on this cluster and the treasury&apos;s own balance, and read again
          while you are on the page.
        </p>
      </div>

      <div className="mk-bento">
        <div className="mk-cell mk-cell--players">
          <div className="mk-cell__top">
            <span className="mk-cell__label">PLAYERS</span>
            <Figure value={known ? String(protocol.players) : unknown} accent />
          </div>
          {wall.length > 0 ? (
            <div
              className="mk-wall"
              /* Fewer players, bigger faces: five masks sized for sixty-four read as an empty cell. */
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${wall.length <= 8 ? 104 : wall.length <= 24 ? 64 : 40}px, 1fr))` }}
              onPointerLeave={() => setHovered(null)}
            >
              {wall.map((seed) => (
                <div key={seed} className="mk-wall__slot">
                  <motion.button
                    type="button"
                    className="mk-wall__tile"
                    aria-label={`Wallet ${shortAddr(seed)}`}
                    onHoverStart={() => setHovered(seed)}
                    onFocus={() => setHovered(seed)}
                    whileHover={{ scale: 1.3 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                  >
                    <MaskTile seed={seed} />
                  </motion.button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mk-state">{known ? 'NO DUEL HAS FINISHED YET, SO THERE ARE NO PLAYERS TO SHOW.' : 'WAITING FOR THE CLUSTER.'}</p>
          )}
          <p className="mk-cell__note" aria-live="polite">
            {hovered
              ? `Wallet ${shortAddr(hovered)}. Its mask is derived from the address, so it is the same face in every duel.`
              : players.length > WALL_MAX
                ? `The ${WALL_MAX} most recent of ${players.length} wallets that have finished a duel.`
                : 'Every wallet that has finished a duel here, as the mask it wears in the game.'}
          </p>
        </div>

        <div className="mk-cell mk-cell--settled">
          <span className="mk-cell__label">DUELS SETTLED</span>
          <Figure value={known ? String(protocol.settled) : unknown} />
          <p className="mk-cell__note">{known ? `${protocol.fills} fills recorded on their tapes.` : 'Read from Tape accounts.'}</p>
        </div>

        <div className="mk-cell mk-cell--paid">
          <span className="mk-cell__label">PAID TO WINNERS</span>
          <Figure value={known ? sol(protocol.paidLamports) : unknown} />
          <p className="mk-cell__note">Pots, less the rake, sent to whoever had the better PnL.</p>
        </div>

        <div className="mk-cell mk-cell--rake">
          <span className="mk-cell__label">THE 2% RAKE, CHECKED</span>
          <Figure value={known ? (Math.abs(drift) <= 1 ? 'AGREES TO THE LAMPORT' : `OFF BY ${drift} LAMPORTS`) : unknown} accent={known && Math.abs(drift) <= 1} />
          <p className="mk-cell__note">
            {known
              ? `Summed from tapes ${sol(protocol.rakeLamports)}. Treasury, less the rent it must hold, ${sol(Math.max(0, withdrawable))}.`
              : 'Compared against the treasury account the program pays into.'}
          </p>
        </div>

        <div className="mk-cell mk-cell--rooms">
          <div className="mk-cell__top">
            <span className="mk-cell__label">ROOMS OPEN RIGHT NOW</span>
            <Figure value={roomsLoaded ? String(open.length) : 'READING'} />
          </div>
          {open.length > 0 ? (
            <ul className="mk-rooms">
              {open.slice(0, 4).map((m) => (
                <li key={m.address.toBase58()}>
                  <motion.a
                    href="/play"
                    onClick={go('/play')}
                    className="mk-room"
                    whileHover={{ x: 8 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 30 }}
                  >
                    <MaskTile seed={m.creator.toBase58()} />
                    <span className="mk-room__token">{m.symbol ? (m.symbol.startsWith('$') ? m.symbol : `$${m.symbol}`) : 'NO MARKET'}</span>
                    <span className="mk-room__stake mk-num">{`${(m.entry / 1e9).toFixed(2)}◎ EACH`}</span>
                    <span className="mk-room__len mk-num">{m.duration % 60 === 0 ? `${m.duration / 60} MIN` : `${m.duration}S`}</span>
                  </motion.a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mk-state">{roomsLoaded ? 'NO ROOM IS OPEN. THE NEXT ONE YOU OPEN IS LISTED HERE.' : 'READING THE OPEN BOOK.'}</p>
          )}
        </div>
      </div>
    </section>
  );
}
