/**
 * Jupiter's quote for the most recent fill.
 *
 * See jupiterQuote.ts for what is and is not being claimed: a read of a real
 * venue's price for the same size, beside the private book's, never a route.
 *
 * One question is out at a time. A player trading once a second fills faster
 * than Jupiter answers under load, and the first version of this asked afresh
 * on every fill and abandoned the question before: in a live duel with 38
 * fills it said ASKING JUPITER… for the whole round and never showed a price.
 * Now a question runs to its answer, the newest fill made meanwhile is asked
 * next, and the last answer stays on screen, marked as updating, until then.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { quoteSameFill } from './jupiterQuote';
import { explainRead } from './errors';
import { formatSolPrice, pxFromSolPerToken, solPerTokenFromPx, tokensFromBase, valueOfBase } from './units';

export interface VenueQuoteState {
  status: 'idle' | 'asking' | 'quote' | 'no-route' | 'error';
  side?: 'buy' | 'sell';
  /** Jupiter's price, formatted like the book's. */
  venuePrice?: string;
  /** How much worse (positive) or better (negative) the book filled than Jupiter would, in percent. */
  diffPct?: number;
  hops?: number;
  /** Why there is no comparison, in the source's own terms. */
  message?: string;
  /** A newer fill is being asked about; what is shown is for an earlier one. */
  refreshing?: boolean;
}

interface Question {
  side: 'buy' | 'sell';
  px: number;
  qty: number;
  mint: string;
}

/** A SOL-per-token price in the same format the fill receipt uses. */
const solLabel = (priceSol: number): string => {
  try {
    return `${formatSolPrice(Number(pxFromSolPerToken(priceSol)))}◎`;
  } catch {
    return `${priceSol.toExponential(3)}◎`;
  }
};

export function useVenueQuote(
  fill: { side: 'buy' | 'sell'; px: number; qty: number; at: number } | null,
  mint: string | null
): VenueQuoteState {
  const [state, setState] = useState<VenueQuoteState>({ status: 'idle' });
  const side = fill?.side ?? null;
  const px = fill?.px ?? 0;
  const qty = fill?.qty ?? 0;
  const at = fill?.at ?? null;

  /** The newest fill not yet asked about. */
  const next = useRef<Question | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const ask = useCallback(async (): Promise<void> => {
    const q = next.current;
    if (busy.current || !q) return;
    next.current = null;
    busy.current = true;
    setState((s) => (s.status === 'quote' ? { ...s, refreshing: true } : { status: 'asking', side: q.side }));
    try {
      const answer = await quoteSameFill({
        mint: q.mint,
        side: q.side,
        lamports: valueOfBase(q.qty, q.px),
        tokens: tokensFromBase(q.qty),
      });
      if (!mounted.current) return;
      if (answer.kind === 'no-route') {
        setState({ status: 'no-route', side: q.side, message: answer.reason });
      } else {
        const book = solPerTokenFromPx(q.px);
        const venue = answer.quote.priceSol;
        // Worse means paid more on a buy, received less on a sell.
        const diffPct = q.side === 'buy' ? ((book - venue) / venue) * 100 : ((venue - book) / venue) * 100;
        setState({ status: 'quote', side: q.side, venuePrice: solLabel(venue), diffPct, hops: answer.quote.hops });
      }
    } catch (e) {
      if (mounted.current) setState({ status: 'error', side: q.side, message: explainRead(e, "Jupiter's quote did not answer.") });
    } finally {
      busy.current = false;
      // The newest fill made while this question was out, if any.
      if (mounted.current && next.current) void ask();
    }
  }, []);

  useEffect(() => {
    if (!side || !mint || at === null || px <= 0 || qty <= 0) {
      next.current = null;
      if (!busy.current) setState({ status: 'idle' });
      return;
    }
    next.current = { side, px, qty, mint };
    void ask();
    // One question per fill: keyed on the fill's own fields, never on renders.
  }, [side, px, qty, at, mint, ask]);

  return state;
}
