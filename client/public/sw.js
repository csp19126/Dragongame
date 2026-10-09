// Network-first service worker: always fetch the latest game, fall back to the
// cached copy only when offline. The API is never cached.
const CACHE_NAME = 'vnslot-888-v16';
const PRECACHE_URLS = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      // Offline: serve the cached copy. Only page navigations may fall back to the
      // app shell; a script or image must never be answered with HTML.
      .catch(() =>
        caches.match(event.request).then((hit) => hit || (event.request.mode === 'navigate' ? caches.match('/') : Response.error()))
      )
  );
});
