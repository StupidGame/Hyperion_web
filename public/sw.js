const APP_CACHE = 'hyperion-app-v2';
const RUNTIME_CACHE = 'hyperion-runtime-v1';
const RSS_CACHE = 'hyperion-rss-v1';

const APP_SHELL = [
  '/',
  '/index.html',
  '/offline.html',
  '/site.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/maskable-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_CACHE).then(async (cache) => {
      await cache.addAll(APP_SHELL);
      await cacheBuiltAssets(cache);
      await self.skipWaiting();
    }),
  );
});

self.addEventListener('activate', (event) => {
  const currentCaches = new Set([APP_CACHE, RUNTIME_CACHE, RSS_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(cacheNames.map((cacheName) => (currentCaches.has(cacheName) ? undefined : caches.delete(cacheName)))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (requestUrl.pathname.startsWith('/api/rss')) {
    event.respondWith(networkFirst(event.request, RSS_CACHE));
    return;
  }

  if (isStaticAsset(event.request, requestUrl)) {
    event.respondWith(cacheFirst(event.request, RUNTIME_CACHE));
  }
});

function isStaticAsset(request, requestUrl) {
  return (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'worker' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'manifest' ||
    requestUrl.pathname.startsWith('/assets/')
  );
}

async function cacheBuiltAssets(cache) {
  try {
    const response = await fetch('/index.html', { cache: 'no-store' });

    if (!response.ok) {
      return;
    }

    const html = await response.clone().text();
    const assetUrls = Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), (match) => match[1]);
    const uniqueAssetUrls = Array.from(new Set(assetUrls));

    await cache.put('/index.html', response);
    await Promise.all(uniqueAssetUrls.map((assetUrl) => cache.add(assetUrl).catch(() => undefined)));
  } catch {
    // The navigation fallback still works if optional asset warmup fails.
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(APP_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put('/index.html', response.clone());
    }

    return response;
  } catch {
    return (await cache.match('/index.html')) ?? (await cache.match('/offline.html'));
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    throw new Error('Offline and no cached response is available.');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}
