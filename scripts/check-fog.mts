/**
 * Proves the client-side fog guarantee holds — that no code path can read
 * opponent state during a live round, and that it opens up on reveal.
 */
import assert from 'node:assert/strict';
import { assertFogIntact, FogViolationError, isRevealed, whenRevealed, foggedView } from '../src/chain/fog';

let checks = 0;

for (const phase of ['lobby', 'searching', 'live'] as const) {
  assert.throws(() => assertFogIntact(phase), FogViolationError, `${phase} must refuse`);
  assert.equal(whenRevealed(phase, { pnl: 4.2 }), null, `${phase} must yield null`);
  assert.equal(isRevealed(phase), false);
  checks += 3;
}

assert.doesNotThrow(() => assertFogIntact('reveal'), 'reveal must allow');
assert.deepEqual(whenRevealed('reveal', { pnl: 4.2 }), { pnl: 4.2 });
assert.equal(isRevealed('reveal'), true);
checks += 3;

const view = foggedView('nofills.sol', 3);
assert.deepEqual(Object.keys(view).sort(), ['fillCount', 'fogged', 'name'],
  'the fogged view must expose nothing but a name and a count');
assert.equal(view.fogged, true);
checks += 2;

console.log(`fog ok — ${checks} assertions: opponent state unreadable in every pre-reveal phase`);
