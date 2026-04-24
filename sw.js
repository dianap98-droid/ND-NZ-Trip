const SHELL_CACHE = 'nd-nz-shell-v2';
const TILE_CACHE  = 'nd-nz-tiles-v1';
const DATA_CACHE  = 'nd-nz-data-v1';

// ── INSTALL: cache the app shell ──────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then(c => c.addAll(['./index.html', './']))
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean up old caches ─────────────────────────────────────────────
self.addEventListener('activate', e => {
  const valid = [SHELL_CACHE, TILE_CACHE, DATA_CACHE];
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !valid.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: route to the right strategy ────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Map tiles → stale-while-revalidate (show cached instantly, refresh in bg)
  if (/tile\.openstreetmap\.org|arcgisonline\.com|opentopomap\.org/.test(url)) {
    e.respondWith(staleWhileRevalidate(e.request, TILE_CACHE));
    return;
  }

  // Google Sheets CSV → network-first, fallback to last known data
  if (url.includes('docs.google.com')) {
    e.respondWith(networkFirst(e.request, DATA_CACHE));
    return;
  }

  // Fonts + OSRM routes → cache-first (stable, no need to re-fetch)
  if (/fonts\.gstatic\.com|fonts\.googleapis\.com|router\.project-osrm\.org/.test(url)) {
    e.respondWith(cacheFirst(e.request, DATA_CACHE));
    return;
  }

  // App shell + everything else → network-first, fallback to cache
  e.respondWith(networkFirst(e.request, SHELL_CACHE));
});

// ── STRATEGIES ────────────────────────────────────────────────────────────────
async function cacheFirst(req, cacheName) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const fresh = await fetch(req);
    if (fresh.ok) (await caches.open(cacheName)).put(req, fresh.clone());
    return fresh;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req, cacheName) {
  try {
    const fresh = await fetch(req);
    if (fresh.ok) (await caches.open(cacheName)).put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fresh  = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
  return cached || await fresh || new Response('Offline', { status: 503 });
}
