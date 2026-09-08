const CACHE = 'train-with-myself-v673';
const SHELL = [
  './',
  './train.html',
  './manifest.webmanifest',
  './train-icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Tapping a block reminder (shown via reg.showNotification) focuses an open tab,
// or opens the app if none is around. Needed so the SW-path notification on mobile
// is actually actionable.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('./train.html');
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isShell = url.origin === location.origin;
  const isCdn = /unpkg\.com$/.test(url.hostname);
  const isEmoji = url.hostname === 'fonts.gstatic.com'; // animated Noto emoji art (avatar/state faces)
  if (!isShell && !isCdn && !isEmoji) return;

  // Network-first for the app document so a reload always renders the latest UI.
  // (Cache-first here is what made redesigns "stick" on the old version even after
  // a hard refresh — the SW returned the cached HTML before the network ever ran.)
  const isDoc = req.mode === 'navigate' ||
    (isShell && /^\/(train\.html)?$/.test(url.pathname));
  if (isDoc) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((c) => c || caches.match('./train.html')))
    );
    return;
  }

  // Stale-while-revalidate for static assets / CDN JS+CSS / map tiles.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        // Emoji art is fetched no-cors (opaque response, status 0) — cache it anyway so
        // the avatar/state faces load instantly on repeat opens instead of re-downloading.
        const ok = res && ((res.status === 200 && (res.type === 'basic' || res.type === 'cors')) || (isEmoji && res.type === 'opaque'));
        if (ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
