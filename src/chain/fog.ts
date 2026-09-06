/**
 * Client-side fog integrity.
 *
 * The rollup is supposed to make the opponent's position unreadable during a
 * live round. On a TEE it does. On a non-TEE cluster it does not, and a client
 * that happily rendered whatever the RPC returned would silently turn a
 * privacy product into a public one the moment it ran on the wrong endpoint.
 *
 * So the client refuses on its own account. `assertFogIntact` throws if
 * anything asks for opponent state while a round is live, and the duel hook
 * routes every opponent read through it.
 *
 * This is a defence in depth, NOT a substitute for the TEE — it protects our
 * own UI from leaking, and does nothing about a third party querying the RPC
 * directly. The proof script says so explicitly.
 */

export class FogViolationError extends Error {
  constructor(what: string) {
    super(`Fog violation: refused to read ${what} while the round is live.`);
    this.name = 'FogViolationError';
  }
}

export type RoundPhase = 'lobby' | 'searching' | 'live' | 'reveal';

/** True once the tape is public and reading the opponent is legitimate. */
export const isRevealed = (phase: RoundPhase): boolean => phase === 'reveal';

/**
 * Guard every opponent-state read. Throws during a live round.
 */
export function assertFogIntact(phase: RoundPhase, what = 'opponent position'): void {
  if (!isRevealed(phase)) throw new FogViolationError(what);
}

/**
 * Safe accessor: returns the value only once the round has revealed, and
 * `null` while it is live. Use where a throw would be too blunt.
 */
export function whenRevealed<T>(phase: RoundPhase, value: T): T | null {
  return isRevealed(phase) ? value : null;
}

/**
 * What the opponent panel is allowed to show mid-round: a fill count and
 * nothing else. Never size, side, price or PnL.
 */
export interface FoggedOpponent {
  name: string;
  fillCount: number;
  fogged: true;
}

export const foggedView = (name: string, fillCount: number): FoggedOpponent => ({
  name,
  fillCount,
  fogged: true,
});
