// Offline support. The server prepends the version and the list of files that
// make up this version of the app (lib/service-worker.mjs); both change
// whenever any of those files change.
const VERSION = self.__ELIAS_VERSION__ || 'dev';
const SHELL = self.__ELIAS_SHELL__ || ['/', '/index.html', '/src/styles.css', '/src/app.js'];
const APP_CACHE = `elias-app-${VERSION}`;
const DATA_CACHE = 'elias-dados';

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache, so the new set is fetched
  // fresh from the server rather than half from yesterday's copies.
  event.waitUntil(caches.open(APP_CACHE)
    .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== APP_CACHE && key !== DATA_CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && new URL(request.url).pathname.startsWith('/design/')) {
    (await caches.open(APP_CACHE)).put(request, response.clone());
  }
  return response;
}

// Never answered from a cache: an old Zoom link or an old calendar would send
// people to the wrong place, and the panel must always run the latest code.
const NETWORK_ONLY = /^\/(admin|src\/admin|api\/meetings|api\/config|calendario\.ics|healthz)/;

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || NETWORK_ONLY.test(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data/')) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  event.respondWith(cacheFirst(request));
});
