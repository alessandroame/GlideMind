/**
 * GlideMind - Offline-First Progressive Web App Service Worker
 *
 * Implements:
 * 1. Cache-First strategy with stale-while-revalidate update for static app shell assets.
 * 2. Pass-through (Network-Only) strategy for Open-Meteo APIs (delegating meteorological
 *    and elevation caching to core/openMeteoApi.js and core/terrainEngine.js) and external map tiles.
 */

const CACHE_NAME = 'glidemind-shell-v2';

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/theme.css',
  './ui/app.js',
  './ui/router.js',
  './ui/sheetManager.js',
  './core/store.js',
  './core/units.js',
  './core/comprensorio.js',
  './core/flyabilityEngine.js',
  './core/openMeteoApi.js',
  './core/gliderCatalog.js',
  './core/logbookDb.js',
  './data/locations.json'
];

const PASS_THROUGH_HOSTS = [
  'open-meteo.com',
  'opentopomap.org',
  'arcgisonline.com',
  'cartocdn.com',
  'openstreetmap.fr',
  'openstreetmap.org',
  'overpass-api.de',
  'overpass.osm.ch',
  'overpass.kumi.systems',
  'generativelanguage.googleapis.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(
        APP_SHELL_ASSETS.map((assetUrl) => cache.add(assetUrl).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Pass-through for external weather, AI, and map tile endpoints
  if (PASS_THROUGH_HOSTS.some((host) => url.hostname.includes(host))) {
    return;
  }

  // Same-origin static assets: Cache-First with network fallback and cache population
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
