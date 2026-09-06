/**
 * Stub for Mobile Wallet Adapter.
 *
 * The demo targets Expo web, but @solana/wallet-adapter-react imports
 * @solana-mobile/wallet-adapter-mobile unconditionally at module scope and
 * calls its factories inside a useMemo. Installing the real package drags in
 * the whole native protocol stack (and fails to resolve on web), so metro
 * resolves those specifiers here instead.
 *
 * These are only ever *constructed* on web, never used: WalletProvider filters
 * the mobile adapter out unless `getIsMobile()` is true, which it is not in a
 * desktop browser.
 *
 * PLAN.md 7.2.7: a real native build needs Mobile Wallet Adapter or Solflare
 * deeplinks, which is deliberately out of scope for this submission.
 */
const SolanaMobileWalletAdapterWalletName = 'Mobile Wallet Adapter';

class SolanaMobileWalletAdapter {
  constructor() {
    this.name = SolanaMobileWalletAdapterWalletName;
    this.url = 'https://solanamobile.com';
    this.icon = '';
    this.readyState = 'Unsupported';
    this.publicKey = null;
    this.connecting = false;
    this.connected = false;
    this.supportedTransactionVersions = null;
  }
  async autoConnect() {}
  async connect() {
    throw new Error('Mobile Wallet Adapter is not available on web.');
  }
  async disconnect() {}
  on() { return this; }
  off() { return this; }
  once() { return this; }
  removeListener() { return this; }
  removeAllListeners() { return this; }
  emit() { return false; }
  eventNames() { return []; }
  listeners() { return []; }
  listenerCount() { return 0; }
  addListener() { return this; }
}

const createDefaultAddressSelector = () => ({
  select: async (addresses) => addresses[0],
});
const createDefaultAuthorizationResultCache = () => ({
  clear: async () => {},
  get: async () => undefined,
  set: async () => {},
});
const createDefaultWalletNotFoundHandler = () => async () => {};

module.exports = {
  SolanaMobileWalletAdapter,
  SolanaMobileWalletAdapterWalletName,
  createDefaultAddressSelector,
  createDefaultAuthorizationResultCache,
  createDefaultWalletNotFoundHandler,
};
