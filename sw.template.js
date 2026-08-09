// Service worker — full offline capability with content-versioned caches.
// __VERSION__ and __PRECACHE__ are stamped by build.js from the shell + trail
// files, so every deploy => new cache name => old shell replaced.
const VERSION = '__VERSION__';
const SHELL_CACHE = 'shell-' + VERSION;
const TILE_CACHE = 'tiles-v1'; // map tiles are immutable; keep across versions
const SHELL = __PRECACHE__;
const TILE_HOSTS = [
  'server.arcgisonline.com',
  'a.tile.opentopomap.org', 'b.tile.opentopomap.org', 'c.tile.opentopomap.org',
  'outdoor.tiles.freemap.sk',
  'tile.openstreetmap.org',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL_CACHE && k !== TILE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin (app shell + trail data): cache-first, network fallback,
  // and the app shell as a last resort for failed navigations while offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(hit => {
        if (hit) return hit;
        return fetch(req).then(res => {
          // opportunistically cache trail JSON fetched after install
          if (res && res.ok && url.pathname.includes('/trails/')) {
            const clone = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, clone));
          }
          return res;
        }).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      })
    );
    return;
  }

  // Map tiles: cache-first, fill from network for offline reuse.
  if (TILE_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        } catch (err) { return hit || Response.error(); }
      })
    );
  }
});
