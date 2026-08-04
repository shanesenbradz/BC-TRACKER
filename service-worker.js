const CACHE_NAME = "bc-tracker-v4";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/foods.js",
  "./js/workouts.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-blue.png",
  "./icons/icon-512-blue.png",
  "./icons/icon-192-green.png",
  "./icons/icon-512-green.png",
  "./icons/icon-192-orange.png",
  "./icons/icon-512-orange.png",
  "./icons/icon-192-pink.png",
  "./icons/icon-512-pink.png",
  "./icons/icon-192-purple.png",
  "./icons/icon-512-purple.png",
  "./icons/icon-192-teal.png",
  "./icons/icon-512-teal.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => cached);
    })
  );
});
