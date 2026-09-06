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

export interface MaskedWalletProviderProps {
  children: ReactNode;
}

export default function MaskedWalletProvider({ children }: MaskedWalletProviderProps) {
  const wallets = useMemo<Adapter[]>(
    () => (Platform.OS === 'web' ? [new SolflareWalletAdapter()] : []),
    []
  );

  return (
    <ConnectionProvider endpoint={ACTIVE_CLUSTER.l1}>
      {/* autoConnect is off deliberately: Solflare's adapter opens its embedded
          web-wallet iframe the moment it connects, which would take over the
          screen on first load. Connecting is user-initiated. */}
      <AdapterProvider wallets={wallets} autoConnect={false}>
        {children}
      </AdapterProvider>
    </ConnectionProvider>
  );
}
