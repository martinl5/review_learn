// Network-first so content edits show up when online; cache fallback for offline.
// ponytail: one cache, refreshed on every successful fetch. Bump VERSION to drop stale files.
const VERSION = 'v1';
const FILES = ['./', 'index.html', 'app.js', 'srs.js', 'style.css', 'manifest.webmanifest', 'icon.svg',
  ...Array.from({ length: 13 }, (_, i) => `data/w${String(i + 1).padStart(2, '0')}.json`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone();
    caches.open(VERSION).then(c => c.put(e.request, copy));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
