/* eslint-env serviceworker */
/*
 * MASKED's service worker: the app shell, available offline, and nothing else.
 *
 * Cached: the page itself, the hashed bundles, fonts and icons, all served by
 * this origin. Never cached: anything from another origin, which is every chain
 * RPC, the market proxy and every token logo. A price, a balance or a round
 * served from a cache would be a number from the past shown as the present, so
 * offline the app opens and says it cannot reach the cluster rather than
 * pretending it can.
 */
const SHELL = 'masked-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Pages: the network first, so an online visitor always gets the current
  // build; the cached page only when the network cannot answer. Every route is
  // the same single page, so one cached copy serves them all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  // Bundles, fonts and icons: their names change whenever their contents do,
  // so a cached copy is never stale, and it is served first.
  if (/^\/(_expo\/static|assets|icons)\//.test(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(SHELL).then((cache) => cache.put(request, copy));
            }
            return response;
          })
      )
    );
  }
});
