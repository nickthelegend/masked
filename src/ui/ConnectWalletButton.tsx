import { useCallback, useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import PixelButton from './PixelButton';
import WalletPicker from './WalletPicker';
import type { ButtonTone } from './PixelButton';

export interface ConnectWalletButtonProps {
  size?: number;
  padY?: number;
  flex?: number;
  /** Tone used when disconnected. Connected always falls back to `quiet`. */
  tone?: ButtonTone;
  /**
   * While set, a connected wallet is not disconnected on the first press: the
   * button turns red and asks with this label, and a second press within a few
   * seconds disconnects. Passed while a round is live, where a disconnect
   * leaves the round with nobody signing for it.
   */
  confirmDisconnect?: string | null;
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
  confirmDisconnect = null,
}: ConnectWalletButtonProps) {
  const { publicKey, connected, connecting, connect, disconnect, select, wallet, wallets } =
    useWallet();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [wantConnect, setWantConnect] = useState(false);
  const [armed, setArmed] = useState(false);

  // The question expires, and it is withdrawn if the round ends first.
  useEffect(() => {
    if (!armed) return undefined;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  useEffect(() => {
    if (!confirmDisconnect) setArmed(false);
  }, [confirmDisconnect]);

  const choose = useCallback(
    (name: string) => {
      setPicking(false);
      // Selection only tells the provider which adapter to use. With
      // autoConnect off — and it is off, so Solflare's iframe does not open
      // itself on page load — nothing then connects, so the wallet sat
      // selected-but-disconnected and the button kept saying CONNECT. The
      // effect below finishes the job once the provider has the adapter.
      select(name as Parameters<typeof select>[0]);
      setWantConnect(true);
    },
    [select]
  );

  useEffect(() => {
    if (!wantConnect || !wallet || connected || connecting) return undefined;
    setWantConnect(false);
    // Deferred a tick on purpose. React runs child effects before parent ones,
    // so connecting straight from here happens before the provider above has
    // attached its listeners to the freshly selected adapter — the adapter
    // connects, emits, and the provider never hears it, leaving the app
    // showing CONNECT next to a wallet that is connected.
    const id = setTimeout(() => {
      connect().catch(() => {
        // A refused connect is a normal outcome, and the adapter reports it.
      });
    }, 0);
    return () => clearTimeout(id);
  }, [wantConnect, wallet, connected, connecting, connect]);

  const onPress = useCallback(async () => {
    setBusy(true);
    try {
      if (connected) {
        if (confirmDisconnect && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        await disconnect();
      } else if (wallets.length === 1) {
        choose(wallets[0].adapter.name);
      } else if (wallets.length > 1) {
        // More than one: ask. Picking the first for them was silently wrong.
        setPicking(true);
      }
    } catch {
      // The adapter surfaces its own modal/errors; a rejected connect is a
      // normal outcome, not something to blow up the HUD over.
    } finally {
      setBusy(false);
    }
  }, [armed, choose, confirmDisconnect, connected, disconnect, wallets]);

  const noWallet = wallets.length === 0;
  const asking = armed && connected && !!confirmDisconnect;
  const label = noWallet
    ? 'NO WALLET'
    : asking
      ? (confirmDisconnect as string)
      : connected && publicKey
      ? truncate(publicKey.toBase58())
      : 'CONNECT';

  return (
    <>
      <PixelButton
        label={label}
        size={size}
        padY={padY}
        flex={flex}
        tone={asking ? 'danger' : connected ? 'quiet' : tone}
        disabled={noWallet}
        loading={busy || connecting}
        onPress={onPress}
      />
      <WalletPicker
        visible={picking}
        wallets={wallets.map((w) => ({
          name: w.adapter.name,
          ready: w.readyState === 'Installed',
        }))}
        onSelect={choose}
        onClose={() => setPicking(false)}
      />
    </>
  );
}
