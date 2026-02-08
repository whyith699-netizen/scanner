const CACHE_NAME = 'cloudscanner-v1';
const ASSETS = ['/', '/app.js', '/manifest.json'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(keys => 
        Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ));
});
