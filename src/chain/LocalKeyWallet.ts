/**
 * A wallet that lives in the page, for local development only.
 *
 * Not a mock. It holds a real ed25519 keypair, produces real signatures, and
 * the validator verifies them like any other — the transactions it signs are
 * indistinguishable on chain from ones signed by Solflare. What makes it
 * "unsafe" is only that the key is generated in the browser and kept in
 * localStorage, which is exactly right for a throwaway key on a validator
 * whose SOL is worthless and wrong for anything else.
 *
 * It exists because the whole product past the lobby is behind a wallet: no
 * signature, no match, no fill, no settlement. A browser without an unlocked
 * extension can otherwise only ever see the lobby, which leaves most of the
 * app untestable end to end.
 *
 * Refuses to construct anywhere but the local cluster, or devnet in a build
 * that opts in (see `burnerWalletAllowed`). That check is the only thing
 * standing between this and a key generated in a stranger's browser holding
 * real funds, so it throws rather than degrading.
 */
import { Keypair, Transaction, VersionedTransaction, type PublicKey } from '@solana/web3.js';
import {
  BaseMessageSignerWalletAdapter,
  WalletReadyState,
  type SupportedTransactionVersions,
  type WalletName,
} from '@solana/wallet-adapter-base';
import nacl from 'tweetnacl';
import { ACTIVE_CLUSTER } from './config';

export const LocalKeyWalletName = 'Local Key (dev)' as WalletName<'Local Key (dev)'>;

/**
 * Where an in-page key may exist: the local validator always, and devnet only
 * when the build sets EXPO_PUBLIC_BURNER_WALLET=1. Devnet SOL is as worthless
 * as local SOL, and without this a devnet build cannot be played end to end
 * except through a browser extension. No other cluster, flag or not.
 */
export const burnerWalletAllowed = (): boolean =>
  ACTIVE_CLUSTER.name === 'local' ||
  (ACTIVE_CLUSTER.name === 'devnet' && process.env.EXPO_PUBLIC_BURNER_WALLET === '1');

const STORAGE_KEY = 'masked.localKeypair.v1';

/**
 * The same key across reloads, so a round survives a refresh and the balance
 * on screen belongs to somebody who has been funded.
 */
function loadOrCreate(): Keypair {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(saved) as number[]));
  } catch {
    // Corrupt or unreadable: fall through and mint a new one.
  }
  const kp = Keypair.generate();
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...kp.secretKey]));
  } catch {
    // Private browsing. The key then lasts as long as the tab, which is fine.
  }
  return kp;
}

export class LocalKeyWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = LocalKeyWalletName;
  url = 'https://github.com/solana-labs/wallet-adapter';
  // A 1x1 transparent gif: the picker wants an icon and this wallet has none.
  icon =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  supportedTransactionVersions: SupportedTransactionVersions = new Set(['legacy', 0]);
  readyState = WalletReadyState.Installed;

  private keypair: Keypair | null = null;
  /**
   * The address, held once.
   *
   * `Keypair.publicKey` is a getter that constructs a fresh `PublicKey` on
   * every access, so returning it directly gave this adapter a different
   * `publicKey` identity on every read. React sees that as a changed value:
   * every `useMemo` and `useEffect` keyed on `wallet.publicKey` re-ran on
   * essentially every render. In the live round that rebuilt the price-crank
   * interval about twice a second — 63 five-second timers created in 25
   * seconds — so the crank ran at roughly one hertz instead of 0.2.
   */
  private cachedPublicKey: PublicKey | null = null;

  constructor() {
    super();
    if (!burnerWalletAllowed()) {
      throw new Error('LocalKeyWalletAdapter is local-cluster only, or devnet with EXPO_PUBLIC_BURNER_WALLET=1');
    }
  }

  get connecting(): boolean {
    return false;
  }

  get publicKey(): PublicKey | null {
    return this.cachedPublicKey;
  }

  async connect(): Promise<void> {
    if (this.keypair) return;
    this.keypair = loadOrCreate();
    this.cachedPublicKey = this.keypair.publicKey;
    this.emit('connect', this.cachedPublicKey);
  }

  async disconnect(): Promise<void> {
    this.keypair = null;
    this.cachedPublicKey = null;
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    const kp = this.requireKey();
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) await this.signTransaction(tx);
    return txs;
  }

  /** Signs the rollup's login challenge, same as any other wallet would. */
  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    return nacl.sign.detached(message, this.requireKey().secretKey);
  }

  private requireKey(): Keypair {
    if (!this.keypair) throw new Error('wallet not connected');
    return this.keypair;
  }
}
