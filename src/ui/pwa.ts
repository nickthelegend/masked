/**
 * The installable shell: a web app manifest, a service worker that keeps the
 * app's own files for offline use, and the browser's install prompt.
 *
 * What works offline is the shell and nothing more: the pages and fonts load,
 * and the offline banner says the cluster cannot be reached. Nothing from the
 * chain or the market feeds is cached (see public/sw.js) — a duel, a price or
 * a balance from a cache would be a number from the past shown as the present.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { color } from './theme';

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * The browser's install prompt, held from the moment it fires.
 *
 * It fires once, early — often before the landing's nav has mounted — so it is
 * caught at startup and kept here rather than listened for by the button.
 */
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function ensureHead(selector: string, make: () => HTMLElement) {
  if (!document.head.querySelector(selector)) document.head.appendChild(make());
}

/** Once, at startup. Does nothing off the web. */
export function startShell(): void {
  if (!isWeb) return;

  // The single-page export writes no manifest link or theme colour, so they
  // are added here, before the browser decides whether the page is installable.
  ensureHead('link[rel="manifest"]', () => Object.assign(document.createElement('link'), { rel: 'manifest', href: '/manifest.webmanifest' }));
  ensureHead('meta[name="theme-color"]', () => Object.assign(document.createElement('meta'), { name: 'theme-color', content: color.bg }));
  ensureHead('link[rel="apple-touch-icon"]', () =>
    Object.assign(document.createElement('link'), { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' })
  );

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });

  // The production export only. Under the dev server a cached bundle would
  // outlive the edit that replaced it.
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // A browser that refuses a service worker still runs the app; it just
    // does not open offline.
  });
}

/** Whether the browser has offered installation, and the call that accepts it. */
export function useInstallPrompt(): { canInstall: boolean; install: () => Promise<'accepted' | 'dismissed' | null> } {
  const [canInstall, setCanInstall] = useState(() => deferred !== null);
  useEffect(() => {
    const update = () => setCanInstall(deferred !== null);
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const install = async () => {
    const e = deferred;
    if (!e) return null;
    await e.prompt();
    const { outcome } = await e.userChoice;
    // A prompt can be shown once; the browser offers another if it wants to.
    deferred = null;
    notify();
    return outcome;
  };

  return { canInstall, install };
}
