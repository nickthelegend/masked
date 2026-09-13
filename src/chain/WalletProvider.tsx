/**
 * Solflare wallet wiring.
 *
 * This is not cosmetic: MagicBlock's Private ER mints its RPC auth token from
 * a wallet signature (`getAuthToken`), so without a connected wallet there is
 * no way to read your own private position. Wallet connect is a hard
 * dependency of the privacy path, not a nice-to-have.
 *
 * Platform note: @solana/wallet-adapter is browser-only. On native this
 * provider degrades to "no wallet available" rather than crashing; a native
 * build needs Solflare deeplinks or Mobile Wallet Adapter instead.
 */
import { useMemo, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { ConnectionProvider, WalletProvider as AdapterProvider } from '@solana/wallet-adapter-react';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import type { Adapter } from '@solana/wallet-adapter-base';
import { ACTIVE_CLUSTER } from './config';
import { LocalKeyWalletAdapter, LocalKeyWalletName, burnerWalletAllowed } from './LocalKeyWallet';

export interface MaskedWalletProviderProps {
  children: ReactNode;
}

/** Which wallets may reconnect themselves on load. See the provider below. */
const autoConnect = async (adapter: Adapter): Promise<boolean> =>
  adapter.name === LocalKeyWalletName;

export default function MaskedWalletProvider({ children }: MaskedWalletProviderProps) {
  const wallets = useMemo<Adapter[]>(() => {
    if (Platform.OS !== 'web') return [];
    const list: Adapter[] = [new SolflareWalletAdapter()];
    // On a local validator, or a devnet build that opts in, offer an in-page
    // key as well. It signs real transactions with a real keypair — see
    // LocalKeyWallet — and it is the only way to exercise the app end to end
    // without an unlocked extension. The adapter refuses to exist elsewhere.
    if (burnerWalletAllowed()) list.push(new LocalKeyWalletAdapter());
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={ACTIVE_CLUSTER.l1}>
      {/* Auto-connect, but not to Solflare: its adapter opens an embedded
          web-wallet iframe the moment it connects, which would take over the
          screen on first load. Everything else reconnects on its own, so a
          refresh mid-round comes back to the round instead of to a
          disconnected lobby. */}
      <AdapterProvider wallets={wallets} autoConnect={autoConnect}>
        {children}
      </AdapterProvider>
    </ConnectionProvider>
  );
}
