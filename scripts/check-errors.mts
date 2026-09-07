/**
 * Proves the error taxonomy maps real failures to human messages.
 *
 * Codes are looked up by name from the deployed IDL rather than written in.
 * Inserting one error in the middle of errors.rs shifts every code after it,
 * and a test that hardcodes numbers then passes while the app mislabels
 * failures — or fails for the wrong reason, which is what happened here.
 */
import assert from 'node:assert/strict';
import { explainError, withRetry } from '../src/chain/errors';
import { FOGDUEL_IDL } from '../src/chain/idl';

const IDL_ERRORS = (FOGDUEL_IDL as { errors?: Array<{ code: number; name: string }> }).errors ?? [];
/** The on-chain code for a named program error. */
const codeFor = (name: string): number => {
  const e = IDL_ERRORS.find((x) => x.name === name);
  if (!e) throw new Error(`the program has no error named ${name}`);
  return e.code;
};
const hexFor = (name: string) => `custom program error: 0x${codeFor(name).toString(16)}`;

let n = 0;
const cases: Array<[unknown, string]> = [
  [{ error: { errorCode: { number: codeFor('SelfJoin') } } }, 'CANNOT JOIN YOUR OWN MATCH'],
  [new Error(hexFor('InsufficientQuote')), 'NOT ENOUGH QUOTE'],
  [new Error(hexFor('MatchStale')), 'THAT MATCH IS STALE'],
  [new Error('User rejected the request'), 'SIGNATURE DECLINED'],
  [new Error('Attempt to debit an account but found no record of a prior credit'), 'NOT ENOUGH SOL'],
  [new Error('transaction verification error: This account may not be used to pay transaction fees'), 'FEE PAYER NOT DELEGATED'],
  [new Error('Transaction loads a writable account that cannot be written'), 'ACCOUNT NOT DELEGATED'],
  [new Error('failed to fetch'), 'CANNOT REACH THE CLUSTER'],
  [new Error('Blockhash not found'), 'TRANSACTION EXPIRED'],
  [new Error('something nobody has ever seen'), 'TRANSACTION FAILED'],
];
for (const [input, expected] of cases) {
  assert.equal(explainError(input).title, expected, `mapping for ${expected}`);
  n += 1;
}

// Hex decoding, against the code the program really uses.
assert.equal(explainError(new Error(hexFor('MatchNotOpen'))).title, 'MATCH NOT OPEN');
n += 1;

// Every error the program declares must map to something a human can read —
// never a bare hex code, and never another error's message.
const titles = new Set<string>();
for (const e of IDL_ERRORS) {
  const friendly = explainError({ error: { errorCode: { number: e.code } } });
  assert.ok(friendly.title && !/0x/.test(friendly.title), `${e.name} has no readable title`);
  assert.ok(!titles.has(friendly.title), `${e.name} reuses the message of another error`);
  titles.add(friendly.title);
  n += 1;
}

// Unknown errors keep a diagnosable fragment.
assert.ok(explainError(new Error('weird failure xyz')).detail?.includes('weird failure xyz'));
n += 1;

// Retry only retries retryable failures.
let calls = 0;
await assert.rejects(
  () => withRetry(async () => { calls += 1; throw new Error('Cannot join your own match: custom program error: 0x1773'); }, 3, 1)
);
assert.equal(calls, 1, 'a non-retryable failure must not be retried');
n += 1;

calls = 0;
const ok = await withRetry(async () => {
  calls += 1;
  if (calls < 3) throw new Error('failed to fetch');
  return 'recovered';
}, 3, 1);
assert.equal(ok, 'recovered');
assert.equal(calls, 3, 'a retryable failure retries until it succeeds');
n += 2;

console.log(`errors ok — ${n} assertions across the failure taxonomy`);
