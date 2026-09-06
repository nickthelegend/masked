import { useCallback, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PixelButton from './PixelButton';
import type { ButtonTone } from './PixelButton';

export interface ConnectWalletButtonProps {
  size?: number;
  padY?: number;
  flex?: number;
  /** Tone used when disconnected. Connected always falls back to `quiet`. */
  tone?: ButtonTone;
}

/** `7xKX…9fRt` — enough to recognise, short enough for the pixel grid. */
const truncate = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/**
 * Wallet connect, built from the existing button so it carries the same bevel
 * and press behaviour as every other control. No new colors, no new component.
 */
export default function ConnectWalletButton({
  size = 9,
  padY = 10,
  flex,
  tone = 'gold',
}: ConnectWalletButtonProps) {
  const { publicKey, connected, connecting, disconnect, select, wallet, wallets } = useWallet();
  const [busy, setBusy] = useState(false);

  const onPress = useCallback(async () => {
    setBusy(true);
    try {
      if (connected) {
        await disconnect();
      } else if (!wallet && wallets.length > 0) {
        // Selecting is enough — the adapter connects on selection. Doing this
        // on press rather than on mount keeps Solflare's iframe from opening
        // itself the instant the page loads.
        select(wallets[0].adapter.name);
      }
    } catch {
      // The adapter surfaces its own modal/errors; a rejected connect is a
      // normal outcome, not something to blow up the HUD over.
    } finally {
      setBusy(false);
    }
  }, [connected, disconnect, select, wallet, wallets]);

  const noWallet = wallets.length === 0;
  const label = noWallet
    ? 'NO WALLET'
    : connected && publicKey
      ? truncate(publicKey.toBase58())
      : 'CONNECT';

  return (
    <PixelButton
      label={label}
      size={size}
      padY={padY}
      flex={flex}
      tone={connected ? 'quiet' : tone}
      disabled={noWallet}
      loading={busy || connecting}
      onPress={onPress}
    />
  );
}
