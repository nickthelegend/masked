/**
 * Getting past the rollup's front door.
 *
 * The query-filtering-service refuses to serve a sealed Position to anyone who
 * has not proved which pubkey they are — including the position's own owner.
 * That is the correct default (the alternative is a door that is open to
 * everybody), and it means a legitimate read needs a token.
 *
 * The proof is a wallet signature over a challenge the service issues, so
 * nothing secret ever reaches the client and no server proxy is needed:
 *
 *   GET  /auth/challenge?pubkey=…   ->  { challenge }
 *   sign the challenge bytes with the wallet
 *   POST /auth/login                ->  { token }
 *   Authorization: Bearer <token>   on every subsequent RPC
 *
 * The token is scoped to the pubkey that signed, which is exactly the property
 * the privacy claim rests on: your token opens your position and nothing else.
 */

/** Anything that can sign a message — a wallet adapter or a bare keypair. */
export interface MessageSigner {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

export class ErAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ErAuthError';
  }
}

const TIMEOUT_MS = 10_000;

const json = async (res: Response, what: string): Promise<Record<string, unknown>> => {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ErAuthError(`${what} failed: HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`, res.status);
  }
  return (await res.json()) as Record<string, unknown>;
};

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * base58, which is what the service expects for the signature.
 *
 * Written out rather than pulled in: the one bs58 already in the tree is
 * untyped, and a signature encoder is fifteen lines of long division.
 */
function toBase58(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  // Every leading zero byte is a leading '1', which long division drops.
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i += 1) out += B58[0];
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58[digits[i]];
  return out;
}

/**
 * Exchange a wallet signature for a bearer token.
 *
 * Throws rather than returning null: a caller that silently continues without
 * a token would read nothing and report it as "no position", which looks
 * identical to a lost round.
 */
export async function authenticate(erUrl: string, signer: MessageSigner): Promise<string> {
  const pubkey = signer.publicKey.toBase58();

  const challengeRes = await fetch(
    `${erUrl.replace(/\/$/, '')}/auth/challenge?pubkey=${encodeURIComponent(pubkey)}`,
    { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  ).catch((e) => {
    throw new ErAuthError(`rollup front door unreachable at ${erUrl}: ${e instanceof Error ? e.message : e}`);
  });
  const { challenge } = (await json(challengeRes, 'challenge')) as { challenge?: string };
  if (!challenge) throw new ErAuthError('challenge response carried no challenge');

  const signature = await signer.signMessage(new TextEncoder().encode(challenge));

  const loginRes = await fetch(`${erUrl.replace(/\/$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ pubkey, challenge, signature: toBase58(signature) }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => {
    throw new ErAuthError(`rollup login unreachable: ${e instanceof Error ? e.message : e}`);
  });
  const { token } = (await json(loginRes, 'login')) as { token?: string };
  if (!token) throw new ErAuthError('login response carried no token');
  return token;
}

/** Who the permission program says may read this account, if anyone. */
export async function authorizedUsers(erUrl: string, pubkey: string): Promise<string[] | null> {
  const res = await fetch(
    `${erUrl.replace(/\/$/, '')}/permission?pubkey=${encodeURIComponent(pubkey)}`,
    { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { authorizedUsers?: string[] | null };
  return body.authorizedUsers ?? null;
}
