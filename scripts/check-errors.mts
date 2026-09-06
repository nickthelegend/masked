/** Proves the error taxonomy maps real failures to human messages. */
import assert from 'node:assert/strict';
import { explainError, withRetry } from '../src/chain/errors';

let n = 0;
const cases: Array<[unknown, string]> = [
  [{ error: { errorCode: { number: 6003 } } }, 'CANNOT JOIN YOUR OWN MATCH'],
  [new Error('custom program error: 0x1777'), 'NOT ENOUGH QUOTE'],
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

// 0x1777 = 6007 -> NOT ENOUGH QUOTE, confirming hex decoding.
assert.equal(explainError(new Error('custom program error: 0x1770')).title, 'MATCH NOT OPEN');
n += 1;

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
