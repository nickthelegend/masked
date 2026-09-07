/**
 * Live proof that the rollup's front door enforces the access-control list.
 *
 * "The opponent's position is unreadable" is the product's entire claim, and a
 * page that simply asserts it is worth nothing. This probes it, from the
 * browser, against the same endpoint the app uses:
 *
 *   1. a sealed position — delegated, with an ACLseo… permission
 *   2. an unsealed account on the same rollup, as a control
 *
 * If (1) is refused and (2) is served, the door is reading the permission
 * rather than being shut for everyone — which is the difference between access
 * control and an outage. Both readings are reported, including the case where
 * the probe finds nothing to test.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { permissionPdaFromAccount } from '@magicblock-labs/ephemeral-rollups-sdk';
import { ACTIVE_CLUSTER, DELEGATION_PROGRAM_ID } from './config';

export type GateVerdict =
  | 'enforced'      // sealed refused, control served
  | 'shut'          // both refused — unreadable, but not proof of the ACL
  | 'open'          // sealed was served: the claim does not hold
  | 'nothing-sealed'// no delegated position to probe right now
  | 'unreachable';

export interface GateProbe {
  verdict: GateVerdict;
  /** The position that was probed, if one was found. */
  sealed: PublicKey | null;
  sealedBytes: number | null;
  controlBytes: number | null;
  loaded: boolean;
}

/**
 * @param sealedCandidates positions believed to be delegated, newest first.
 * @param control an account on the rollup that carries no permission.
 */
export function useGateProbe(
  sealedCandidates: PublicKey[],
  control: PublicKey | null,
  pollMs = 6000
): GateProbe {
  const [probe, setProbe] = useState<GateProbe>({
    verdict: 'nothing-sealed',
    sealed: null,
    sealedBytes: null,
    controlBytes: null,
    loaded: false,
  });

  const key = sealedCandidates.map((k) => k.toBase58()).join(',');

  useEffect(() => {
    let alive = true;
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const front = new Connection(ACTIVE_CLUSTER.er, 'confirmed');

    const read = async () => {
      try {
        // Sealed means two things, and both have to hold before a served read
        // counts as a leak: the position is delegated, *and* it carries a
        // permission. A delegated position with no permission is supposed to
        // be served — that is the control this whole check rests on, and
        // check:gate leaves exactly such a position on chain. Probing one of
        // those and calling it a breach is how this panel came to report a
        // privacy failure on a working system.
        let sealed: PublicKey | null = null;
        for (const k of sealedCandidates) {
          const info = await l1.getAccountInfo(k);
          if (!info?.owner.equals(DELEGATION_PROGRAM_ID)) continue;
          const permission = await l1.getAccountInfo(permissionPdaFromAccount(k));
          if (!permission) continue;
          sealed = k;
          break;
        }
        if (!alive) return;

        if (!sealed) {
          setProbe({ verdict: 'nothing-sealed', sealed: null, sealedBytes: null, controlBytes: null, loaded: true });
          return;
        }

        const [s, c] = await Promise.all([
          front.getAccountInfo(sealed).catch(() => null),
          control ? front.getAccountInfo(control).catch(() => null) : Promise.resolve(null),
        ]);
        if (!alive) return;

        const verdict: GateVerdict =
          s !== null ? 'open' : c !== null ? 'enforced' : 'shut';

        setProbe({
          verdict,
          sealed,
          sealedBytes: s?.data.length ?? null,
          controlBytes: c?.data.length ?? null,
          loaded: true,
        });
      } catch {
        if (alive) {
          setProbe((p) => ({ ...p, verdict: 'unreachable', loaded: true }));
        }
      }
    };

    void read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, control?.toBase58(), pollMs]);

  return probe;
}
