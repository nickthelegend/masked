/**
 * Turns chain errors into something a human can act on.
 *
 * Raw Solana/Anchor failures are unreadable in a demo — "custom program error:
 * 0x1771" tells a judge nothing. Each known failure maps to a short line that
 * says what happened and, where there is one, what to do about it.
 */

export interface FriendlyError {
  title: string;
  detail?: string;
  /** Whether retrying the same action could plausibly work. */
  retryable: boolean;
}

/** Anchor custom error codes from programs/fogduel/src/errors.rs. */
const PROGRAM_ERRORS: Record<number, FriendlyError> = {
  6000: { title: 'MATCH NOT OPEN', detail: 'Someone joined first.', retryable: false },
  6001: { title: 'MATCH NOT LIVE', retryable: false },
  6002: { title: 'MATCH NOT SETTLING', retryable: false },
  6003: { title: 'CANNOT JOIN YOUR OWN MATCH', retryable: false },
  6004: { title: 'ROUND STILL RUNNING', detail: 'Wait for the clock.', retryable: true },
  6005: { title: 'ROUND EXPIRED', detail: 'The buzzer already went.', retryable: false },
  6006: { title: 'NOT A PARTICIPANT', retryable: false },
  6007: { title: 'NOT ENOUGH QUOTE', detail: 'Reduce the size.', retryable: false },
  6008: { title: 'NOT ENOUGH BASE', detail: 'You are flat.', retryable: false },
  6009: { title: 'SIZE MUST BE ABOVE ZERO', retryable: false },
  6010: { title: 'PRICE FEED STALE', retryable: true },
  6011: { title: 'BAD DURATION', retryable: false },
  6012: { title: 'ENTRY MUST BE ABOVE ZERO', retryable: false },
  6013: { title: 'MATH OVERFLOW', retryable: false },
  6014: { title: 'VAULT UNDERFUNDED', retryable: false },
};

/** Patterns matched against the raw message when there is no error code. */
const PATTERNS: Array<[RegExp, FriendlyError]> = [
  [/user rejected|user denied|rejected the request/i,
    { title: 'SIGNATURE DECLINED', detail: 'You cancelled it in the wallet.', retryable: true }],
  [/insufficient (lamports|funds)|attempt to debit an account/i,
    { title: 'NOT ENOUGH SOL', detail: 'Fund the wallet and try again.', retryable: true }],
  [/blockhash not found|block height exceeded/i,
    { title: 'TRANSACTION EXPIRED', detail: 'Network was slow. Retry.', retryable: true }],
  [/may not be used to pay transaction fees/i,
    { title: 'FEE PAYER NOT DELEGATED', detail: 'The rollup only funds delegated accounts.', retryable: false }],
  [/loads a writable account that cannot be written/i,
    { title: 'ACCOUNT NOT DELEGATED', detail: 'That write is only legal on the base layer.', retryable: false }],
  [/already in use/i,
    { title: 'ALREADY EXISTS', detail: 'That account has been created before.', retryable: false }],
  [/failed to fetch|network request failed|econnrefused|fetch failed/i,
    { title: 'CANNOT REACH THE CLUSTER', detail: 'Is the validator running?', retryable: true }],
  [/timed out|timeout/i, { title: 'TIMED OUT', retryable: true }],
  [/wallet not connected|no wallet/i,
    { title: 'CONNECT A WALLET', detail: 'Nothing can be signed without one.', retryable: false }],
];

const UNKNOWN: FriendlyError = { title: 'TRANSACTION FAILED', retryable: true };

/** Pull an Anchor error code out of whatever shape the error arrived in. */
const codeOf = (err: unknown): number | null => {
  const e = err as { error?: { errorCode?: { number?: number } }; code?: number };
  if (typeof e?.error?.errorCode?.number === 'number') return e.error.errorCode.number;
  if (typeof e?.code === 'number' && e.code >= 6000) return e.code;
  const m = String((err as Error)?.message ?? err).match(/custom program error: 0x([0-9a-f]+)/i);
  return m ? parseInt(m[1], 16) : null;
};

export function explainError(err: unknown): FriendlyError {
  if (!err) return UNKNOWN;

  const code = codeOf(err);
  if (code !== null && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];

  const message = String((err as Error)?.message ?? err);
  for (const [pattern, friendly] of PATTERNS) {
    if (pattern.test(message)) return friendly;
  }

  // Keep a fragment of the raw message so an unknown failure is still
  // diagnosable rather than a shrug.
  return { ...UNKNOWN, detail: message.slice(0, 80) };
}

/** Retry with backoff, but only for failures where retrying makes sense. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!explainError(e).retryable || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i));
    }
  }
  throw last;
}
