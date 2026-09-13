/**
 * Live on-chain delegation status.
 *
 * Reads the *actual owner* of each position account and reports whether it is
 * currently delegated. This is the visual proof that the rollup is real: the
 * owner flips to the delegation program when the round starts and back to the
 * program when it settles, and both transitions are visible as they happen.
 */
import { useEffect, useState } from 'react';
import { Connection, PublicKey, type AccountInfo } from '@solana/web3.js';
import { DELEGATION_PROGRAM_ID, FOGDUEL_PROGRAM_ID, PERMISSION_PROGRAM_ID, ACTIVE_CLUSTER } from './config';
import { programCodeBytes } from './programSize';

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
  /**
   * A program's code size, or any other account's data length. Null when a
   * program's code could not be measured: an upgradeable program's own account
   * is a 36-byte pointer, and /proof used to print that as the program's size.
   */
  bytes: number | null;
}

export interface DelegationStatus {
  accounts: AccountStatus[];
  loaded: boolean;
}

/** Code sizes already measured. Only an upgrade changes one, and a reload picks that up. */
const codeBytes = new Map<string, number>();

const sizeOf = async (address: PublicKey, info: AccountInfo<Buffer> | null): Promise<number | null> => {
  if (!info) return 0;
  if (!info.executable) return info.data.length;
  const known = codeBytes.get(address.toBase58());
  if (known !== undefined) return known;
  const bytes = await programCodeBytes(ACTIVE_CLUSTER.l1, info).catch(() => null);
  if (bytes !== null) codeBytes.set(address.toBase58(), bytes);
  return bytes;
};

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
              bytes: await sizeOf(w.address, l1Info),
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
