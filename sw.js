// sw.js — Listerfy Service Worker
const CACHE = 'listerfy-v16';
const OFFLINE = [
  './app.html',
  './list.html',
  './profile.html',
  './trash.html',
  './style.css',
  './i18n.js',
  './supabase.js',
  './app.js',
  './list.js',
  './logo.svg',
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(OFFLINE);
    }).catch(function() {}) // no falla si algún archivo no existe
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      var old = keys.filter(function(k) { return k !== CACHE; });
      return Promise.all(old.map(function(k) { return caches.delete(k); }))
        .then(function() { return old.length > 0; }); // true = real update
    }).then(function(wasUpdate) {
      return self.clients.claim().then(function() { return wasUpdate; });
    }).then(function(wasUpdate) {
      if (!wasUpdate) return;
      return self.clients.matchAll({ type: 'window' }).then(function(clients) {
        clients.forEach(function(c) { c.postMessage({ type: 'SW_UPDATED' }); });
      });
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('cdn.jsdelivr.net')) return;

  // Force bypass of browser HTTP cache for own-origin assets
  var fetchReq = new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(fetchReq)
      .then(function(res) {
        if (res && res.status === 200) {
          var clone = res.clone();
          caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
        }
        return res;
      })
      .catch(function() {
        return caches.match(e.request)
          .then(function(cached) { return cached || caches.match('./app.html'); });
      })
  );
});
