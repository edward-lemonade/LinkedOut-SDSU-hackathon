const CACHE_NAME = 'linkedout-static-v1';
const API_CACHE = 'linkedout-api-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/styles.css',
  '/main.js'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return Promise.allSettled(
          STATIC_ASSETS.map(url => 
            cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Helper: network-first for API, cache-first for navigation and static
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GET requests
  if (req.method !== 'GET') return;

  // Handle API requests (simple heuristic)
  if (url.pathname.startsWith('/resources') || url.pathname.startsWith('/posts') || url.pathname.startsWith('/search')) {
    event.respondWith(
      fetch(req).then(networkRes => {
        
        const copy = networkRes.clone();
        caches.open(API_CACHE).then(cache => cache.put(req, copy));
        return networkRes;
      }).catch(() => {
        
        return caches.match(req).then(cached => cached || new Response(JSON.stringify({error: 'offline'}), {headers: {'Content-Type': 'application/json'}}));
      })
    );
    return;
  }


  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(networkRes => {
      if (url.origin === location.origin) {
        caches.open(CACHE_NAME).then(cache => cache.put(req, networkRes.clone()));
      }
      return networkRes;
    }).catch(() => {
      // If navigation request and offline, try to serve index.html
      if (req.mode === 'navigate') {
        return caches.match('/index.html');
      }
    }))
  );
});

// Simple message handler for clients
self.addEventListener('message', (event) => {
  console.log('[SW] message', event.data);
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});