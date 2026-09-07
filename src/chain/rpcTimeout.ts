/**
 * A deadline for a chain read.
 *
 * A validator that has stopped answering does not fail — it hangs. web3.js has
 * no default timeout, so a promise that never settles leaves whatever depends
 * on it pending forever: /health showed DEGRADED above an empty dependency
 * list, and the ticker went on insisting there were no duels while the chain
 * holding nineteen of them was simply unreachable.
 *
 * A missed deadline is an answer, and the difference between "none" and
 * "cannot tell" is one this app makes a point of drawing.
 */
export const RPC_TIMEOUT_MS = 8000;

export class RpcTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`${what} did not answer in ${ms / 1000}s`);
    this.name = 'RpcTimeoutError';
  }
}

export function withDeadline<T>(
  work: Promise<T>,
  what = 'the cluster',
  ms = RPC_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    work,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new RpcTimeoutError(what, ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}
