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
  /**
   * The rollup's public front door, and the only ER endpoint the app talks to.
   *
   * Locally this is the query-filtering-service, which reads ACLseo… to decide
   * what a caller may see. On devnet it is the TEE's own ingress. Either way,
   * a privacy claim is a claim about *this* URL.
   */
  er: string;
  /**
   * The rollup validator's own RPC, which answers anybody — no permission
   * check, because it is the validator, not the door.
   *
   * Only the proof script uses it, precisely to show the difference between
   * the two. Nothing in the product may read from here: doing so would make
   * "the opponent's position is unreadable" false while appearing to work.
   */
  erRaw?: string;
  /** Validator identity to delegate to. */
  validator: PublicKey;
  /** True when `er` is a TEE, i.e. when privacy is enforced by hardware. */
  tee: boolean;
}

/**
 * Endpoint overrides.
 *
 * A deployment does not run on 127.0.0.1, and neither does a test that wants
 * to watch what the app asks the rollup for — pointing it at a recorder is the
 * only way to see the request bodies, since the RPC client captures `fetch`
 * before anything in the page can wrap it.
 */
const envL1 = process.env.EXPO_PUBLIC_L1_URL;
const envEr = process.env.EXPO_PUBLIC_ER_URL;

export const CLUSTERS: Record<ClusterName, ClusterConfig> = {
  local: {
    name: 'local',
    l1: envL1 || 'http://127.0.0.1:8999',
    // The query-filtering-service. See scripts/localnet.sh.
    er: envEr || 'http://127.0.0.1:6699',
    erRaw: 'http://127.0.0.1:7799',
    validator: VALIDATORS.local,
    // The local ephemeral-validator is not a TEE: the permission gate in front
    // of it is a process we run, not hardware anyone can attest. It enforces
    // the ACL — proven in scripts/prove-privacy.mts — but a judge has only our
    // word that the process is the one we say it is. That is what the TEE adds.
    tee: false,
  },
  devnet: {
    name: 'devnet',
    l1: envL1 || 'https://api.devnet.solana.com',
    er: envEr || 'https://devnet-tee.magicblock.app',
    validator: VALIDATORS.tee,
    tee: true,
  },
};

/** Program id from the Anchor build. */
export const FOGDUEL_PROGRAM_ID = new PublicKey('3K3v1bp6uUGVdzRfZmkwZGK82BHgCJxAroXJ3ZRs1Rj1');

/** Switchable at runtime; defaults to local for development. */
export const ACTIVE_CLUSTER: ClusterConfig =
  process.env.EXPO_PUBLIC_CLUSTER === 'devnet' ? CLUSTERS.devnet : CLUSTERS.local;
