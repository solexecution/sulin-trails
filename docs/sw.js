// Service worker — full offline capability with content-versioned caches.
// 76c4901857a2 and ["./","index.html","app.css","app.js","manifest.webmanifest","icon-192.png","icon-512.png","vendor/leaflet.js","vendor/leaflet.css","vendor/leaflet-rotate.js","vendor/images/layers-2x.png","vendor/images/layers.png","vendor/images/marker-icon-2x.png","vendor/images/marker-icon.png","vendor/images/marker-shadow.png","trails/index.json","trails/mtb-eliasovka-jarabina.json","trails/mtb-eliasovka-lackova.json","trails/mtb-eliasovka-lubovna.json","trails/mtb-eliasovka-mnisek.json","trails/mtb-eliasovka-nestville.json","trails/mtb-eliasovka-ruzbachy.json","trails/mtb-eliasovka-sulin.json","trails/mtb-eliasovka-vsetinska.json","trails/mtb-jarabina-eliasovka.json","trails/mtb-jarabina-lackova.json","trails/mtb-jarabina-lubovna.json","trails/mtb-jarabina-mnisek.json","trails/mtb-jarabina-nestville.json","trails/mtb-jarabina-ruzbachy.json","trails/mtb-jarabina-sulin.json","trails/mtb-jarabina-vsetinska.json","trails/mtb-lackova-eliasovka.json","trails/mtb-lackova-jarabina.json","trails/mtb-lackova-lubovna.json","trails/mtb-lackova-mnisek.json","trails/mtb-lackova-nestville.json","trails/mtb-lackova-ruzbachy.json","trails/mtb-lackova-sulin.json","trails/mtb-lackova-vsetinska.json","trails/mtb-lubovna-eliasovka.json","trails/mtb-lubovna-jarabina.json","trails/mtb-lubovna-lackova.json","trails/mtb-lubovna-mnisek.json","trails/mtb-lubovna-nestville.json","trails/mtb-lubovna-ruzbachy.json","trails/mtb-lubovna-sulin.json","trails/mtb-lubovna-vsetinska.json","trails/mtb-mnisek-eliasovka.json","trails/mtb-mnisek-jarabina.json","trails/mtb-mnisek-lackova.json","trails/mtb-mnisek-lubovna.json","trails/mtb-mnisek-nestville.json","trails/mtb-mnisek-ruzbachy.json","trails/mtb-mnisek-sulin.json","trails/mtb-mnisek-vsetinska.json","trails/mtb-nestville-eliasovka.json","trails/mtb-nestville-jarabina.json","trails/mtb-nestville-lackova.json","trails/mtb-nestville-lubovna.json","trails/mtb-nestville-mnisek.json","trails/mtb-nestville-ruzbachy.json","trails/mtb-nestville-sulin.json","trails/mtb-nestville-vsetinska.json","trails/mtb-ruzbachy-eliasovka.json","trails/mtb-ruzbachy-jarabina.json","trails/mtb-ruzbachy-lackova.json","trails/mtb-ruzbachy-lubovna.json","trails/mtb-ruzbachy-mnisek.json","trails/mtb-ruzbachy-nestville.json","trails/mtb-ruzbachy-sulin.json","trails/mtb-ruzbachy-vsetinska.json","trails/mtb-sulin-eliasovka.json","trails/mtb-sulin-jarabina.json","trails/mtb-sulin-lackova.json","trails/mtb-sulin-lubovna.json","trails/mtb-sulin-mnisek.json","trails/mtb-sulin-nestville.json","trails/mtb-sulin-ruzbachy.json","trails/mtb-sulin-vsetinska.json","trails/mtb-vsetinska-eliasovka.json","trails/mtb-vsetinska-jarabina.json","trails/mtb-vsetinska-lackova.json","trails/mtb-vsetinska-lubovna.json","trails/mtb-vsetinska-mnisek.json","trails/mtb-vsetinska-nestville.json","trails/mtb-vsetinska-ruzbachy.json","trails/mtb-vsetinska-sulin.json","pois.json"] are stamped by build.js from the shell + trail
// files, so every deploy => new cache name => old shell replaced.
const VERSION = '76c4901857a2';
const SHELL_CACHE = 'shell-' + VERSION;
const TILE_CACHE = 'tiles-v1'; // map tiles are immutable; keep across versions
const SHELL = ["./","index.html","app.css","app.js","manifest.webmanifest","icon-192.png","icon-512.png","vendor/leaflet.js","vendor/leaflet.css","vendor/leaflet-rotate.js","vendor/images/layers-2x.png","vendor/images/layers.png","vendor/images/marker-icon-2x.png","vendor/images/marker-icon.png","vendor/images/marker-shadow.png","trails/index.json","trails/mtb-eliasovka-jarabina.json","trails/mtb-eliasovka-lackova.json","trails/mtb-eliasovka-lubovna.json","trails/mtb-eliasovka-mnisek.json","trails/mtb-eliasovka-nestville.json","trails/mtb-eliasovka-ruzbachy.json","trails/mtb-eliasovka-sulin.json","trails/mtb-eliasovka-vsetinska.json","trails/mtb-jarabina-eliasovka.json","trails/mtb-jarabina-lackova.json","trails/mtb-jarabina-lubovna.json","trails/mtb-jarabina-mnisek.json","trails/mtb-jarabina-nestville.json","trails/mtb-jarabina-ruzbachy.json","trails/mtb-jarabina-sulin.json","trails/mtb-jarabina-vsetinska.json","trails/mtb-lackova-eliasovka.json","trails/mtb-lackova-jarabina.json","trails/mtb-lackova-lubovna.json","trails/mtb-lackova-mnisek.json","trails/mtb-lackova-nestville.json","trails/mtb-lackova-ruzbachy.json","trails/mtb-lackova-sulin.json","trails/mtb-lackova-vsetinska.json","trails/mtb-lubovna-eliasovka.json","trails/mtb-lubovna-jarabina.json","trails/mtb-lubovna-lackova.json","trails/mtb-lubovna-mnisek.json","trails/mtb-lubovna-nestville.json","trails/mtb-lubovna-ruzbachy.json","trails/mtb-lubovna-sulin.json","trails/mtb-lubovna-vsetinska.json","trails/mtb-mnisek-eliasovka.json","trails/mtb-mnisek-jarabina.json","trails/mtb-mnisek-lackova.json","trails/mtb-mnisek-lubovna.json","trails/mtb-mnisek-nestville.json","trails/mtb-mnisek-ruzbachy.json","trails/mtb-mnisek-sulin.json","trails/mtb-mnisek-vsetinska.json","trails/mtb-nestville-eliasovka.json","trails/mtb-nestville-jarabina.json","trails/mtb-nestville-lackova.json","trails/mtb-nestville-lubovna.json","trails/mtb-nestville-mnisek.json","trails/mtb-nestville-ruzbachy.json","trails/mtb-nestville-sulin.json","trails/mtb-nestville-vsetinska.json","trails/mtb-ruzbachy-eliasovka.json","trails/mtb-ruzbachy-jarabina.json","trails/mtb-ruzbachy-lackova.json","trails/mtb-ruzbachy-lubovna.json","trails/mtb-ruzbachy-mnisek.json","trails/mtb-ruzbachy-nestville.json","trails/mtb-ruzbachy-sulin.json","trails/mtb-ruzbachy-vsetinska.json","trails/mtb-sulin-eliasovka.json","trails/mtb-sulin-jarabina.json","trails/mtb-sulin-lackova.json","trails/mtb-sulin-lubovna.json","trails/mtb-sulin-mnisek.json","trails/mtb-sulin-nestville.json","trails/mtb-sulin-ruzbachy.json","trails/mtb-sulin-vsetinska.json","trails/mtb-vsetinska-eliasovka.json","trails/mtb-vsetinska-jarabina.json","trails/mtb-vsetinska-lackova.json","trails/mtb-vsetinska-lubovna.json","trails/mtb-vsetinska-mnisek.json","trails/mtb-vsetinska-nestville.json","trails/mtb-vsetinska-ruzbachy.json","trails/mtb-vsetinska-sulin.json","pois.json"];
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

  // Same-origin (app shell + trail data): NETWORK-FIRST so a new deploy shows
  // immediately whenever online; fall back to cache (and the shell) offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) { const clone = res.clone(); caches.open(SHELL_CACHE).then(c => c.put(req, clone)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
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
