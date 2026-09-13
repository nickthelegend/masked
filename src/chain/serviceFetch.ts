/**
 * A fetch that says which service it could not reach.
 *
 * A browser reports a refused connection as `TypeError: Failed to fetch` and
 * nothing more — no host, no port. So when the rollup's read gate was killed in
 * a real round, the fill failed as CANNOT REACH THE CLUSTER, "the base layer or
 * the ephemeral rollup", while the base layer was fine: the error table's port
 * patterns only match a message that happens to carry a URL, which a browser's
 * never does, and devnet's endpoints have no port to match anyway.
 *
 * Every client connection is built knowing which service it talks to, so the
 * name is attached there, where it is known, rather than guessed afterwards.
 */
export type ServiceName = 'rollup' | 'base layer';

export const serviceFetch =
  (service: ServiceName): typeof fetch =>
  async (input, init) => {
    try {
      return await fetch(input, init);
    } catch (e) {
      // A caller's own abort is not an outage; let it report itself.
      if (e instanceof Error && e.name === 'AbortError') throw e;
      throw new TypeError(`${service} unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
