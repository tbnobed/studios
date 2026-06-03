// Service worker for OBTV Studio Manager.
// Goal: make the app installable (PWA) and give the shell an offline fallback,
// WITHOUT interfering with live streaming or API data, and WITHOUT serving a
// stale app after a deploy. Bump CACHE_VERSION on any change here to force
// installed clients to drop their old caches.
const CACHE_VERSION = "obtv-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

self.addEventListener("install", (event) => {
  // Activate this worker as soon as it finishes installing.
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(["/"]).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches from older versions.
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GETs. Streams (cross-origin WHEP) and writes pass
  // straight through to the network, untouched.
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses — always go to the network for live data.
  if (url.pathname.startsWith("/api/")) return;

  // App navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put("/", fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match("/");
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Vite fingerprints everything under /assets/ (content hash in the filename),
  // so those URLs are immutable and safe to cache-first forever.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok && fresh.type === "basic") {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      })(),
    );
    return;
  }

  // Everything else same-origin (icons, manifest, /js/*) lives at a STABLE path,
  // so use stale-while-revalidate: serve the cache instantly but refresh it in
  // the background so a deploy's new files land on the next load (no permanent
  // staleness).
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((fresh) => {
          if (fresh.ok && fresh.type === "basic") cache.put(request, fresh.clone());
          return fresh;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })(),
  );
});
