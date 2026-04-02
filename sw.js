// sw.js — Listerfy Service Worker
const CACHE = 'listerfy-v1';
const OFFLINE = [
  '/Listerfy/index.html',
  '/Listerfy/app.html',
  '/Listerfy/list.html',
  '/Listerfy/profile.html',
  '/Listerfy/style.css',
  '/Listerfy/i18n.js',
  '/Listerfy/supabase.js',
  '/Listerfy/app.js',
  '/Listerfy/list.js',
  '/Listerfy/logo.svg',
];

// Instalar — cachear archivos estáticos
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(OFFLINE);
    })
  );
  self.skipWaiting();
});

// Activar — limpiar caches viejos
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

// Fetch — network first, cache fallback
self.addEventListener('fetch', function(e) {
  // Solo interceptar requests del mismo origen
  if (!e.request.url.startsWith(self.location.origin)) return;
  // No interceptar requests de Supabase
  if (e.request.url.includes('supabase.co')) return;

  e.respondWith(
    fetch(e.request)
      .then(function(res) {
        // Si la respuesta es válida, actualizamos el cache
        if (res && res.status === 200 && res.type === 'basic') {
          var resClone = res.clone();
          caches.open(CACHE).then(function(cache) {
            cache.put(e.request, resClone);
          });
        }
        return res;
      })
      .catch(function() {
        // Sin red → intentar del cache
        return caches.match(e.request).then(function(cached) {
          return cached || caches.match('/Listerfy/app.html');
        });
      })
  );
});
