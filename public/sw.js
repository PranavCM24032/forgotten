/**
 * ============================================================================
 * PYKACHU GO v3.4 — OFFLINE-FIRST SERVICE WORKER CACHE
 * ============================================================================
 * Features:
 *   - Pre-caches critical game data (/data/*.json), audio, icons, and shell.
 *   - Stale-While-Revalidate for game catalog JSON files (instant load).
 *   - Cache-First for static fonts, images, and audio assets.
 *   - Network-Only for Google Apps Script telemetry (/exec) so scores are never cached.
 * ============================================================================
 */

const CACHE_NAME = 'pykachu-cache-v3.4.1';

const STATIC_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/data/config.json',
  '/data/puzzle.json',
  '/data/teams.json',
  '/data/meme.json',
  '/data/admin.json',
  '/assets/sound.mp3',
  '/assets/img/pikachu.png',
  '/assets/img/pokeball.svg',
  '/assets/img/ash-3.png',
  '/assets/img/oak.png',
  '/assets/img/brock.png',
  '/assets/img/jenny.png',
  '/assets/fonts/material-symbols-rounded.woff2',
];

// Install Event: Pre-cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_PRECACHE).catch((err) => {
          console.warn('[SW] Some precache assets failed to load:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Intelligent routing
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Never cache telemetry or Apps Script API calls
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('script.googleusercontent.com') ||
    req.method !== 'GET'
  ) {
    return;
  }

  // 2. Data JSON catalog: Stale-While-Revalidate (Instant response from cache + background refresh)
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Static assets (images, audio, fonts): Cache-First with Network fallback
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.mp3')
  ) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes.clone()));
          }
          return networkRes;
        });
      })
    );
    return;
  }

  // 4. App Shell (navigation / HTML / Vite chunks): Network first, falling back to cache
  event.respondWith(
    fetch(req)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && req.method === 'GET') {
          caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes.clone()));
        }
        return networkRes;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === 'navigate') {
          return caches.match('/index.html');
        }
        return new Response('Network error and asset not cached', { status: 503 });
      })
  );
});
