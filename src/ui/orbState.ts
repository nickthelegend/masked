/**
 * Orb state selection, kept free of React Native imports so it can be unit
 * tested without a bundler.
 */
export type OrbState = 'fog' | 'live' | 'reveal' | 'up' | 'down';

/**
 * Map a PnL percentage onto an orb state.
 *
 * The flat band matters: without it the orb would flicker between up and down
 * on every tick while a position sits near break-even.
 */
export const orbStateForPnl = (pct: number, flatBand = 0.25): OrbState =>
  pct > flatBand ? 'up' : pct < -flatBand ? 'down' : 'live';
