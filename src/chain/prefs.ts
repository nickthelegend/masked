/**
 * What this browser remembers between visits.
 *
 * Stake, round length and the last market picked — the three things a player
 * re-chooses every single time otherwise, and the three a judge re-chooses on
 * every reload while demoing. Nothing here is state the chain owns: a wallet's
 * balance, its record and its open matches are all read from chain on mount,
 * and none of them are cached here.
 *
 * Deliberately per-origin and per-browser, via `localStorage`. It is a
 * convenience, not an account — every read is wrapped, because a private
 * window, cleared site data, or a browser configured to refuse storage must
 * leave the app working with its defaults rather than throwing on boot.
 */

const KEY = 'masked.prefs.v1';

export interface Prefs {
  /** Stake in SOL. */
  stake?: number;
  /** Round length in seconds, for matches this wallet opens. */
  duration?: number;
  /** Mint of the last market chosen. Re-priced on load, never trusted as a price. */
  marketMint?: string;
}

const canStore = (): boolean => {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
};

export function readPrefs(): Prefs {
  if (!canStore()) return {};
  try {
    const raw = globalThis.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const p = parsed as Prefs;
    // Validate rather than trust. A hand-edited or stale entry must not be
    // able to put the lobby into a state the program would refuse — a stake
    // of NaN or a duration outside MIN_DURATION..MAX_DURATION would fail at
    // `create_match` with an error the player could not act on.
    const out: Prefs = {};
    if (typeof p.stake === 'number' && Number.isFinite(p.stake) && p.stake > 0) out.stake = p.stake;
    if (
      typeof p.duration === 'number' &&
      Number.isFinite(p.duration) &&
      p.duration >= 10 &&
      p.duration <= 3600
    ) {
      out.duration = Math.floor(p.duration);
    }
    if (typeof p.marketMint === 'string' && p.marketMint.length >= 32 && p.marketMint.length <= 64) {
      out.marketMint = p.marketMint;
    }
    return out;
  } catch {
    return {};
  }
}

export function writePrefs(next: Prefs): void {
  if (!canStore()) return;
  try {
    globalThis.localStorage.setItem(KEY, JSON.stringify({ ...readPrefs(), ...next }));
  } catch {
    // Storage refused — a quota, a private window, a policy. The app keeps
    // working; it simply will not remember.
  }
}
