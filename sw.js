/* Service worker — AI Photo Editor
   - App files: network first (so your GitHub/Vercel updates show up right away),
     cached copy is used when offline.
   - Images / model files: cache first.
   - Other websites (CDN, Hugging Face) and /api/ are never touched. */

const CACHE = "ai-photo-editor-v1";

const PRECACHE = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "retouch.js",
  "skin.js",
  "adjustments.html",
  "manifest.json",
  "icon-192.png",
  "icon-512.png",
  "enhance-icon.png",
  "hair-icon.png",
  "retouch-icon.png",
  "smooth-icon.png",
  "hair_segmenter.tflite"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // one missing file must not break the install
      Promise.allSettled(PRECACHE.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;     // CDN, Hugging Face ...
  if (url.pathname.startsWith("/api/")) return;         // your backend

  const isStatic = /\.(png|jpg|jpeg|webp|svg|ico|tflite|wasm|woff2?)$/i.test(url.pathname);

  if (isStatic) {
    // cache first
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // network first for html / css / js / json
  event.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }).catch(() =>
      caches.match(req).then(hit => hit || (req.mode === "navigate" ? caches.match("index.html") : undefined))
    )
  );
});
