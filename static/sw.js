const CACHE_NAME = "voicebank-v1";
const SHELL = [
  "/",
  "/static/style.css",
  "/static/app.js",
  "/static/manifest.json",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  // Never cache API calls or voice data
  if (event.request.url.includes("/api/")) return;

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
