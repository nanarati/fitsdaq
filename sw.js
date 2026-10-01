/* 핏스닥 오프라인 캐시 */
const CACHE = 'fitsdaq-v2';
const CORE = ['./', 'index.html', 'css/style.css', 'js/engine.js', 'js/charts.js', 'js/app.js',
  'data/fit-quantiles.js', 'data/twins.js', 'data/market.js', 'manifest.webmanifest', 'assets/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
