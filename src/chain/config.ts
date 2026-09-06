/**
 * Cluster and MagicBlock endpoints.
 *
 * Verified against docs.magicblock.gg. The validator identity is the same
 * pubkey on mainnet and devnet; only the URL differs.
 */
import { PublicKey } from '@solana/web3.js';

export type ClusterName = 'local' | 'devnet';

export const DELEGATION_PROGRAM_ID = new PublicKey('DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh');
export const PERMISSION_PROGRAM_ID = new PublicKey('ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1');

/** ER validator identities. TEE is the one that gives privacy. */
export const VALIDATORS = {
  local: new PublicKey('mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev'),
  tee: new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo'),
  us: new PublicKey('MUS3hc9TCw4cGC12vHNoYcCGzJG1txjgQLZWVoeNHNd'),
  eu: new PublicKey('MEUGGrYPxKk17hCr7wpT6s8dtNokZj5U2L57vjYMS8e'),
  as: new PublicKey('MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57'),
} as const;

export interface ClusterConfig {
  name: ClusterName;
  /** Base layer RPC. */
  l1: string;
  /** Ephemeral rollup RPC. */
  er: string;
  /** Validator identity to delegate to. */
  validator: PublicKey;
  /** True when `er` is a TEE, i.e. when privacy is actually enforced. */
  tee: boolean;
}

export const CLUSTERS: Record<ClusterName, ClusterConfig> = {
  local: {
    name: 'local',
    l1: 'http://127.0.0.1:8999',
    er: 'http://127.0.0.1:7799',
    validator: VALIDATORS.local,
    // The local ephemeral-validator is NOT a TEE. Delegation and speed work;
    // ephemeral permissions do not. Privacy needs the devnet TEE.
    tee: false,
  },
  devnet: {
    name: 'devnet',
    l1: 'https://api.devnet.solana.com',
    er: 'https://devnet-tee.magicblock.app',
    validator: VALIDATORS.tee,
    tee: true,
  },
};

/** Program id from the Anchor build. */
export const FOGDUEL_PROGRAM_ID = new PublicKey('3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1');

/** Switchable at runtime; defaults to local for development. */
export const ACTIVE_CLUSTER: ClusterConfig =
  process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;
