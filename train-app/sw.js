const CACHE = 'train-with-myself-v1313';
const SHELL = [
  './',
  './train.html',
  './train.css',
  './train-i18n.js',
  './train-emoji-kw.js',
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

// Queue a "block done" record the app drains on next open (the SW can't touch localStorage).
function _queueDone(blockId, dayKey) {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open('ijek-pending', 1);
      req.onupgradeneeded = () => { try { req.result.createObjectStore('done', { keyPath: 'id' }); } catch (_) {} };
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('done', 'readwrite');
          tx.objectStore('done').put({ id: dayKey + '|' + blockId, blockId, dayKey, ts: Date.now() });
          tx.oncomplete = () => { try { db.close(); } catch (_) {} resolve(); };
          tx.onerror = () => resolve();
        } catch (_) { resolve(); }
      };
      req.onerror = () => resolve();
    } catch (_) { resolve(); }
  });
}
// Tapping a reminder focuses/opens the app. Tapping its "โ“ Done" action instead logs the block
// (queued for the app to apply) and pings any open tab โ€” without forcing the app open.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  if (event.action === 'done' && data.blockId) {
    event.waitUntil(
      _queueDone(data.blockId, data.dayKey)
        .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
        .then((cls) => { for (const c of cls) { try { c.postMessage({ type: 'pending-done' }); } catch (_) {} } })
    );
    return;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cls) => {
      for (const c of cls) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(data.url || './train.html');
    })
  );
});

// Background Web Push: a scheduled edge fn sends { title, body, tag, url } as JSON; show it even
// when the app is closed. Falls back to a generic nudge if the payload can't be parsed.
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (_) { d = { body: event.data ? event.data.text() : '' }; }
  const title = d.title || 'Ijek';
  const opts = {
    body: d.body || '', tag: d.tag || 'ijek-reminder', renotify: true,
    icon: './icon-192.png', badge: './icon-192.png', vibrate: [80, 40, 80],
    // A "โ“ Done" action logs the block straight from the notification (app closed) โ€” queued in
    // IndexedDB, applied by the app on next open. blockId/dayKey ride in data.
    actions: (d.blockId ? [{ action: 'done', title: 'โ“ Done' }] : []),
    data: { url: d.url || './train.html', blockId: d.blockId || '', dayKey: d.dayKey || '' },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});
// The browser can rotate a push subscription; the app re-subscribes on next open (subscribePush()),
// so here we just acknowledge โ€” no server round-trip from the SW.
self.addEventListener('pushsubscriptionchange', () => {});

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
  // a hard refresh โ€” the SW returned the cached HTML before the network ever ran.)
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

  // Network-first for our OWN app code (CSS + i18n) too โ€” same reason as the document: a CSS/i18n
  // edit must show on the NEXT reload, not the one after. Stale-while-revalidate served the old file
  // first, so a fix appeared to "not work" until a second reload. Offline still falls back to cache.
  const isAppAsset = isShell && /\/(train\.css|train-i18n\.js)$/.test(url.pathname);
  if (isAppAsset) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Stale-while-revalidate for static assets / CDN JS+CSS / map tiles.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        // Emoji art is fetched no-cors (opaque response, status 0) โ€” cache it anyway so
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
