const VERSION = '2026-07-08-admin-drag-v2';
const APP_CACHE = `voyage-app-${VERSION}`;
const MAP_CACHE = `voyage-map-${VERSION}`;
const API_CACHE = `voyage-api-${VERSION}`;
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([APP_CACHE, MAP_CACHE, API_CACHE]);
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !currentCaches.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const isTripsRequest = (url) => url.origin === self.location.origin && url.pathname === '/api/trips';
const isAppShell = (url) => url.origin === self.location.origin && (
  url.pathname === '/' ||
  url.pathname === '/index.html'
);
const isStaticAsset = (url) => url.origin === self.location.origin && (
  url.pathname.startsWith('/assets/') ||
  url.pathname.endsWith('.css') ||
  (url.pathname.endsWith('.js') && url.pathname !== '/voyage-sw.js')
);
const isMapAsset = (request, url) => request.destination === 'image' && (
  url.hostname.includes('basemaps.cartocdn.com') ||
  url.hostname.endsWith('googleapis.com') ||
  url.hostname.endsWith('gstatic.com') ||
  url.hostname.endsWith('amap.com') ||
  url.hostname.endsWith('autonavi.com')
);

const cacheable = (response) => response && (response.ok || response.type === 'opaque');

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (cacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (cacheable(response)) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return cached || refresh;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (isTripsRequest(url)) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }
  if (isAppShell(url)) {
    event.respondWith(networkFirst(event.request, APP_CACHE));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(event.request, APP_CACHE));
    return;
  }
  if (isMapAsset(event.request, url)) {
    event.respondWith(staleWhileRevalidate(event.request, MAP_CACHE));
  }
});