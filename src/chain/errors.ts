/**
 * Turns chain errors into something a human can act on.
 *
 * Raw Solana/Anchor failures are unreadable in a demo — "custom program error:
 * 0x1771" tells a judge nothing. Each known failure maps to a short line that
 * says what happened and, where there is one, what to do about it.
 */
import { FOGDUEL_IDL } from './idl';
import { RpcTimeoutError } from './rpcTimeout';

export interface FriendlyError {
  title: string;
  detail?: string;
  /** Whether retrying the same action could plausibly work. */
  retryable: boolean;
}

/**
 * Friendly text per program error, keyed by the error's *name*.
 *
 * Keyed by name rather than by number because numbers move. Inserting
 * `MatchStale` in the middle of errors.rs shifted every code after it by one,
 * and a hand-numbered table then silently mislabelled seven failures — a round
 * that was still running would have been reported as "not a participant".
 * Names are stable; the codes are read from the IDL below.
 */
const BY_NAME: Record<string, Omit<FriendlyError, 'retryable'> & { retryable: boolean }> = {
  MatchNotOpen: { title: 'MATCH NOT OPEN', detail: 'Someone joined first.', retryable: false },
  MatchNotLive: { title: 'MATCH NOT LIVE', retryable: false },
  MatchNotSettling: { title: 'MATCH NOT SETTLING', retryable: false },
  SelfJoin: { title: 'CANNOT JOIN YOUR OWN MATCH', retryable: false },
  MatchStale: {
    title: 'THAT MATCH IS STALE',
    detail: 'It was opened too long ago and its price is out of date. Ask for a fresh one.',
    retryable: false,
  },
  MatchStillRunning: { title: 'ROUND STILL RUNNING', detail: 'Wait for the clock.', retryable: true },
  MatchExpired: { title: 'ROUND EXPIRED', detail: 'The buzzer already went.', retryable: false },
  NotAParticipant: { title: 'NOT A PARTICIPANT', retryable: false },
  InsufficientQuote: { title: 'NOT ENOUGH QUOTE', detail: 'Reduce the size.', retryable: false },
  InsufficientBase: { title: 'NOT ENOUGH BASE', detail: 'You are flat.', retryable: false },
  ZeroQuantity: { title: 'SIZE MUST BE ABOVE ZERO', retryable: false },
  StalePrice: { title: 'PRICE FEED STALE', retryable: true },
  InvalidDuration: { title: 'BAD DURATION', retryable: false },
  InvalidEntry: { title: 'ENTRY MUST BE ABOVE ZERO', retryable: false },
  MathOverflow: { title: 'MATH OVERFLOW', retryable: false },
  VaultUnderfunded: { title: 'VAULT UNDERFUNDED', retryable: false },
  PriceTooSoon: { title: 'MARK POSTED TOO SOON', detail: 'The feed is rate-limited to one push a second.', retryable: true },
  PriceJump: { title: 'MARK MOVED TOO FAR', detail: 'A single push may not move the mark more than 5%.', retryable: true },
  InvalidPrice: { title: 'BAD PRICE', retryable: false },
};

/**
 * Code to friendly text, built from the deployed IDL so the numbers can never
 * drift from the program again. An error the table does not name still gets
 * its own name rather than a hex code.
 */
const PROGRAM_ERRORS: Record<number, FriendlyError> = Object.fromEntries(
  ((FOGDUEL_IDL as { errors?: Array<{ code: number; name: string; msg?: string }> }).errors ?? []).map(
    (e) => [
      e.code,
      BY_NAME[e.name] ?? {
        title: e.name.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(),
        detail: e.msg,
        retryable: false,
      },
    ]
  )
);

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

/**
 * Whether a failure is a specific program error, named rather than numbered.
 *
 * The code is resolved from the deployed IDL, so this cannot drift when an
 * error is inserted in the middle of `errors.rs` — which has already happened
 * once and silently renumbered seven of them.
 */
export function isProgramError(err: unknown, name: string): boolean {
  const code = codeOf(err);
  if (code === null) return false;
  const declared = ((FOGDUEL_IDL as { errors?: Array<{ code: number; name: string }> }).errors ?? [])
    .find((e) => e.name === name);
  return !!declared && declared.code === code;
}

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

/**
 * A failed chain *read*, phrased for the person looking at it.
 *
 * `fetchNullable` returns null for an account that is not there, but throws for
 * one that is there with the wrong shape. So `/tape/<any Solana address>` — the
 * system program, a token mint, a wallet — put Anchor's own "Invalid account
 * discriminator" on screen, which tells a player nothing about what they pasted
 * or what to paste instead.
 *
 * A missed deadline already phrases itself ("the base layer did not answer in
 * 8s") and is kept verbatim: the difference between "no duel here" and "cannot
 * tell right now" is one this app makes a point of drawing, and collapsing it
 * into a generic message would throw that away.
 */
export function explainRead(err: unknown, fallback = 'Could not reach the cluster.'): string {
  if (err instanceof RpcTimeoutError) return err.message;
  const message = String((err as Error)?.message ?? err);
  if (/discriminator/i.test(message)) {
    return 'That address is a Solana account, but not a duel.';
  }
  if (/did not answer in/.test(message)) return message;
  return fallback;
}
