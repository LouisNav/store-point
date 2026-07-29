/* Store Point service worker — offline-first cache for PWA resilience.
 *
 * Strategy:
 *   - Pre-cache the app shell on install.
 *   - Navigation: network-first, fall back to cached shell or offline page.
 *   - Static assets (_next/static, icons, manifest): stale-while-revalidate.
 *   - App pages: network-first with offline fallback.
 *   - API requests: network-only (never cache auth or sync).
 *
 * Bump CACHE on each deploy to evict stale caches.
 */
const CACHE = 'storepoint-shell-v3';
const SHELL = ['/', '/offline', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/favicon.ico'
  );
}

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API / auth / sync: never cache, network-only.
  if (isApi(url)) return;

  // Static assets: stale-while-revalidate (serve cached instantly, update cache in background).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(req).then((cached) => {
          const fetchPromise = fetch(req)
            .then((networkRes) => {
              if (networkRes.ok) cache.put(req, networkRes.clone());
              return networkRes;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        }),
      ),
    );
    return;
  }

  // Navigation (app pages): network-first with offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Cache the response for offline fallback.
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req.url, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() =>
          // Try exact URL match first, then fall back to cached /, then offline page.
          caches
            .match(req.url)
            .then((exact) => exact || caches.match('/'))
            .then((fallback) => fallback || caches.match('/offline'))
            .then((last) => last || Response.error()),
        ),
    );
  }
});
