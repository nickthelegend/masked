/**
 * Live on-chain delegation status.
 *
 * Reads the *actual owner* of each position account and reports whether it is
 * currently delegated. This is the visual proof that the rollup is real: the
 * owner flips to the delegation program when the round starts and back to the
 * program when it settles, and both transitions are visible as they happen.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID, ACTIVE_CLUSTER } from './config';

export interface AccountStatus {
  label: string;
  address: PublicKey;
  owner: PublicKey | null;
  delegated: boolean;
  /**
   * This account is a live ACL. True whether it is still owned by the
   * permission program or has since been delegated to the rollup — sealing
   * does both, so checking only for ACLseo would report a sealed match as
   * unsealed.
   */
  isPermission: boolean;
  onEr: boolean;
  bytes: number;
}

export interface DelegationStatus {
  accounts: AccountStatus[];
  loaded: boolean;
}

/**
 * Reads account ownership directly from the RPC.
 *
 * Deliberately takes no wallet: account owners are public, and gating this
 * evidence behind a connected wallet meant /proof showed nothing to a judge
 * who had not connected one — which is exactly the person it is for.
 */
export function useDelegationStatus(
  watch: Array<{ label: string; address: PublicKey }>,
  pollMs = 2000
): DelegationStatus {
  const [accounts, setAccounts] = useState<AccountStatus[]>([]);
  const [loaded, setLoaded] = useState(false);

  const key = watch.map((w) => w.address.toBase58()).join(',');

  useEffect(() => {
    if (watch.length === 0) {
      setAccounts([]);
      setLoaded(true);
      return undefined;
    }
    let alive = true;
    const l1 = new Connection(ACTIVE_CLUSTER.l1, 'confirmed');
    const er = new Connection(ACTIVE_CLUSTER.er, 'confirmed');

    const read = async () => {
      try {
        const rows = await Promise.all(
          watch.map(async (w) => {
            const [l1Info, erInfo] = await Promise.all([
              l1.getAccountInfo(w.address).catch(() => null),
              er.getAccountInfo(w.address).catch(() => null),
            ]);
            const owner = l1Info?.owner ?? null;
            return {
              label: w.label,
              address: w.address,
              owner,
              delegated: !!owner && owner.equals(DELEGATION_PROGRAM_ID),
              isPermission: !!owner && (owner.equals(PERMISSION_PROGRAM_ID) || owner.equals(DELEGATION_PROGRAM_ID)),
              onEr: !!erInfo,
              bytes: l1Info?.data.length ?? 0,
            };
          })
        );
        if (alive) {
          setAccounts(rows);
          setLoaded(true);
        }
      } catch {
        if (alive) setLoaded(true);
      }
    };

    read();
    const id = setInterval(read, pollMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, pollMs]);

  return { accounts, loaded };
}

export { DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID, ACTIVE_CLUSTER };
