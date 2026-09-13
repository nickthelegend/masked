/**
 * Any token: the live market list, in motion.
 *
 * The rows are the app's own feeds — pump.fun's memecoins and Jupiter's list,
 * which includes tokenized stocks — fetched by the same hook the picker uses
 * and re-priced every twenty seconds. Scrolling pushes the rows faster and
 * scrolling back reverses them: forty-odd markets only read as breadth when
 * they move, and tying them to the scroll makes the list feel handled rather
 * than decorative.
 *
 * Logos are the app's own `TokenLogo`, so a logo the image relay cannot serve
 * is never requested and becomes the same lettered tile the picker shows.
 *
 * The filter is Framer Motion's (a state change: matching chips stay lit); the
 * rows' travel is GSAP's. They touch different elements.
 */
import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { gsap, MOTION_OK, ORDER, ScrollTrigger, scrollerEl, useGSAP } from '../gsapSetup';
import { TokenLogo } from '../../ui';
import type { TradableMarket } from '../../chain/markets';
import type { LandingData } from '../useLandingData';
import './markets.css';

const FILTERS = ['ALL', 'MEMES', 'MAJORS', 'STOCKS'] as const;
type Filter = (typeof FILTERS)[number];

/** Jupiter names its tokenized equities "<Company> xStock". */
const isStock = (m: TradableMarket) => /xstock$/i.test(m.name.trim());

const inFilter = (f: Filter, m: TradableMarket) =>
  f === 'ALL' ||
  (f === 'MEMES' && m.kind === 'meme') ||
  (f === 'MAJORS' && m.kind !== 'meme' && !isStock(m)) ||
  (f === 'STOCKS' && isStock(m));

function usd(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return 'NO PRICE';
  if (p >= 1000) return `$${Math.round(p).toLocaleString('en-US')}`;
  if (p >= 1) return `$${p.toFixed(2)}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  return `$${p.toFixed(Math.min(12, Math.ceil(-Math.log10(p)) + 2))}`;
}

function Chip({ m, dim, copy }: { m: TradableMarket; dim: boolean; copy: boolean }) {
  const stock = isStock(m);
  return (
    <motion.li
      className="mk-chip"
      aria-hidden={copy || undefined}
      animate={{ opacity: dim ? 0.2 : 1 }}
      whileHover={{ y: -7 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
    >
      <span className="mk-chip__logo">
        <TokenLogo mint={m.mint} symbol={m.symbol} uri={m.imageUri} size={28} />
      </span>
      <span className="mk-chip__sym">{m.symbol}</span>
      <span className="mk-chip__px mk-num">{usd(m.priceUsd)}</span>
      <span className={`mk-chip__tag ${stock ? 'is-stock' : ''}`}>{stock ? 'STOCK' : m.kind === 'meme' ? 'PUMP.FUN' : 'JUPITER'}</span>
    </motion.li>
  );
}

/** Two identical halves, each wide enough to cover a wide screen, so the loop never shows its seam. */
function Rail({ items, filter }: { items: TradableMarket[]; filter: Filter }) {
  const reps = Math.max(1, Math.ceil(16 / Math.max(1, items.length)));
  const half = Array.from({ length: reps }, (_, r) => items.map((m) => ({ m, r }))).flat();
  return (
    <div className="mk-rail">
      <ul className="mk-rail__track">
        {[false, true].map((copy) =>
          half.map(({ m, r }) => <Chip key={`${copy ? 'b' : 'a'}-${r}-${m.mint}`} m={m} dim={!inFilter(filter, m)} copy={copy || r > 0} />)
        )}
      </ul>
    </div>
  );
}

function GhostRail() {
  return (
    <div className="mk-rail" aria-hidden>
      <ul className="mk-rail__track">
        {Array.from({ length: 12 }, (_, i) => (
          <li key={i} className="mk-chip mk-chip--ghost mk-skeleton" />
        ))}
      </ul>
    </div>
  );
}

export default function MarketsRail({ memes, majors }: Pick<LandingData, 'memes' | 'majors'>) {
  const ref = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState<Filter>('ALL');

  const counts = useMemo(() => {
    const all = [...memes.markets, ...majors.markets];
    return Object.fromEntries(FILTERS.map((f) => [f, all.filter((m) => inFilter(f, m)).length])) as Record<Filter, number>;
  }, [memes.markets, majors.markets]);

  // Rebuild the loops only when the set of markets changes, not on every
  // re-price: a price ticking over must not jump the rows back to the start.
  const mintKey = `${memes.markets.map((m) => m.mint).join()}|${majors.markets.map((m) => m.mint).join()}`;

  useGSAP(
    () => {
      const scroller = scrollerEl();
      const tracks = gsap.utils.toArray<HTMLElement>('.mk-rail__track');
      if (!scroller || tracks.length === 0 || mintKey === '|') return undefined;

      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const loops = tracks.map((track, i) =>
          gsap.fromTo(
            track,
            { xPercent: i % 2 ? -50 : 0 },
            { xPercent: i % 2 ? 0 : -50, ease: 'none', duration: i % 2 ? 110 : 85, repeat: -1 }
          )
        );

        ScrollTrigger.create({
          scroller,
          trigger: ref.current,
          start: 'top bottom',
          end: 'bottom top',
          refreshPriority: ORDER.markets,
          onToggle: (self) => loops.forEach((t) => (self.isActive ? t.play() : t.pause())),
          onUpdate: (self) => {
            const push = gsap.utils.clamp(-9, 9, self.getVelocity() / 320);
            loops.forEach((t) => {
              gsap.killTweensOf(t);
              t.timeScale(self.direction * (1 + Math.abs(push)));
              gsap.to(t, { timeScale: self.direction, duration: 1.4, ease: 'power2.out' });
            });
          },
        });
      });
      // The loops repeat forever; revert them explicitly with the hook so none
      // survives a rebuild or an unmount.
      return () => mm.revert();
    },
    { scope: ref, dependencies: [mintKey], revertOnUpdate: true }
  );

  return (
    <section className="mk-section mk-markets" ref={ref} aria-labelledby="mk-markets-title">
      <div className="mk-markets__head">
        <h2 className="mk-h2" id="mk-markets-title">PICK ANY TOKEN.</h2>
        <p className="mk-body">
          Memecoins minted an hour ago, majors and tokenized stocks. Every price here is read live from pump.fun and Jupiter.
        </p>
        <div className="mk-tabs" aria-label="Highlight a kind of market">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`mk-tab ${filter === f ? 'is-on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {filter === f ? (
                <motion.span layoutId="mk-tab-fill" className="mk-tab__fill" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
              ) : null}
              <span className="mk-tab__text">
                {f} <span className="mk-num">{counts[f]}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="mk-rails">
        {memes.markets.length > 0 ? <Rail items={memes.markets} filter={filter} /> : memes.loading ? <GhostRail /> : null}
        {majors.markets.length > 0 ? <Rail items={majors.markets} filter={filter} /> : majors.loading ? <GhostRail /> : null}
      </div>

      {memes.error || majors.error ? (
        <div className="mk-markets__status" aria-live="polite">
          {/* A failed refresh keeps the last list, so say which of the two it is:
              "nothing is listed" beside a full row would contradict the page. */}
          {memes.error ? (
            <p className="mk-state">
              {memes.markets.length > 0
                ? 'PUMP.FUN DID NOT ANSWER THE LAST REFRESH. THE MEMECOIN PRICES ABOVE ARE FROM THE READ BEFORE IT.'
                : 'PUMP.FUN IS NOT ANSWERING RIGHT NOW, SO NO MEMECOINS ARE LISTED.'}
            </p>
          ) : null}
          {majors.error ? (
            <p className="mk-state">
              {majors.markets.length > 0
                ? 'JUPITER DID NOT ANSWER THE LAST REFRESH. THE MAJOR AND STOCK PRICES ABOVE ARE FROM THE READ BEFORE IT.'
                : 'JUPITER IS NOT ANSWERING RIGHT NOW, SO NO MAJORS OR STOCKS ARE LISTED.'}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
