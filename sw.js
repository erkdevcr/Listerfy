// sw.js — Listerfy Service Worker
const CACHE = 'listerfy-v2';
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
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  if (!e.request.url.startsWith(self.location.origin)) return;
  if (e.request.url.includes('supabase.co')) return;
  if (e.request.url.includes('cdn.jsdelivr.net')) return;

  e.respondWith(
    fetch(e.request)
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
