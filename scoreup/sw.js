/* ScoreUp service worker — offline app shell.
   network-first for code (HTML/JS) → always fresh when online; cache-first for images.
   Bump CACHE when you change cached assets. */
const CACHE = "scoreup-v357";
const AUDIO_CACHE = "scoreup-audio-v1";
const AUDIO_MAX = 60;
const ASSETS = ["./scoreup.html", "./questions.js", "./exam.js", "./vocab-bank.js", "./learn.js", "./manifest.json", "./icon.svg",
  "./images/261013.jpg","./images/18935245.jpg","./images/3585034.jpg","./images/8111881.jpg",
  "./images/7988237.jpg","./images/2422286.jpg","./images/4589506.jpg","./images/5086623.jpg",
  "./images/4487361.jpg","./images/1267338.jpg","./images/4349767.jpg","./images/7884223.jpg",
  // Noto animated emoji — generated from the paths scoreup.html actually references,
  // filtered to what exists on disk (the animated master and the -s poster it falls back to)
  "./emoji/1f393.webp","./emoji/anim-1f31b-s.webp","./emoji/anim-1f31b.webp","./emoji/anim-1f31e-s.webp",
  "./emoji/anim-1f31e.webp","./emoji/anim-1f32a-s.webp","./emoji/anim-1f32a.webp","./emoji/anim-1f331-s.webp",
  "./emoji/anim-1f331.webp","./emoji/anim-1f389-s.webp","./emoji/anim-1f389.webp","./emoji/anim-1f393-s.webp",
  "./emoji/anim-1f393.webp","./emoji/anim-1f3b2-s.webp","./emoji/anim-1f3b2.webp","./emoji/anim-1f3c6-s.webp",
  "./emoji/anim-1f3c6.webp","./emoji/anim-1f407-s.webp","./emoji/anim-1f407.webp","./emoji/anim-1f422-s.webp",
  "./emoji/anim-1f422.webp","./emoji/anim-1f43a-s.webp","./emoji/anim-1f43a.webp","./emoji/anim-1f440-s.webp",
  "./emoji/anim-1f440.webp","./emoji/anim-1f44b-s.webp","./emoji/anim-1f44b.webp","./emoji/anim-1f44d-s.webp",
  "./emoji/anim-1f44d.webp","./emoji/anim-1f451-s.webp","./emoji/anim-1f451.webp","./emoji/anim-1f48e-s.webp",
  "./emoji/anim-1f48e.webp","./emoji/anim-1f4a1-s.webp","./emoji/anim-1f4a1.webp","./emoji/anim-1f4a5-s.webp",
  "./emoji/anim-1f4a5.webp","./emoji/anim-1f4aa-s.webp","./emoji/anim-1f4aa.webp","./emoji/anim-1f4ac-s.webp",
  "./emoji/anim-1f4ac.webp","./emoji/anim-1f4af-s.webp","./emoji/anim-1f4af.webp",
  "./emoji/anim-1f4ca-s.webp","./emoji/anim-1f4ca.webp","./emoji/anim-1f4da-s.webp",
  "./emoji/anim-1f4da.webp","./emoji/anim-1f512-s.webp","./emoji/anim-1f512.webp","./emoji/anim-1f525-s.webp",
  "./emoji/anim-1f525.webp","./emoji/anim-1f63a-s.webp","./emoji/anim-1f63a.webp","./emoji/anim-1f63b.webp",
  "./emoji/anim-1f63f.webp","./emoji/anim-1f640.webp","./emoji/anim-1f947-s.webp","./emoji/anim-1f947.webp",
  "./emoji/anim-1f948-s.webp","./emoji/anim-1f948.webp","./emoji/anim-1f949-s.webp","./emoji/anim-1f949.webp",
  "./emoji/anim-1f981-s.webp","./emoji/anim-1f981.webp","./emoji/anim-1f98a-s.webp","./emoji/anim-1f98a.webp",
  "./emoji/anim-1f9e0-s.webp","./emoji/anim-1f9e0.webp","./emoji/anim-1f9f9-s.webp","./emoji/anim-1f9f9.webp",
  "./emoji/anim-231b-s.webp","./emoji/anim-231b.webp","./emoji/anim-23f3-s.webp","./emoji/anim-23f3.webp",
  "./emoji/anim-2699-s.webp","./emoji/anim-2699.webp","./emoji/anim-26a0-s.webp","./emoji/anim-26a0.webp",
  "./emoji/anim-26a1-s.webp","./emoji/anim-26a1.webp","./emoji/anim-2705-s.webp","./emoji/anim-2705.webp",
  "./emoji/anim-274c-s.webp","./emoji/anim-274c.webp","./emoji/anim-2b50-s.webp","./emoji/anim-2b50.webp",
  "./emoji/anim-grammar-s.webp","./emoji/anim-grammar.webp","./emoji/anim-listening-s.webp",
  "./emoji/anim-listening.webp","./emoji/anim-mock-s.webp","./emoji/anim-mock.webp","./emoji/anim-text-s.webp",
  "./emoji/anim-text.webp","./emoji/anim-vocab-s.webp","./emoji/anim-vocab.webp",
  "./emoji/anim-teacher.webp","./emoji/anim-teacher-s.webp"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.allSettled(
        ASSETS.map(a => cache.add(a).catch(err => console.warn("precache miss", a, err)))
      ))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", e => {
  const keep = [CACHE, AUDIO_CACHE];
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Insert an audio response into the bounded audio cache, evicting oldest entries over the cap.
async function putAudio(request, response) {
  const cache = await caches.open(AUDIO_CACHE);
  await cache.put(request, response);
  const keys = await cache.keys(); // insertion order, oldest first
  for (let i = 0; i < keys.length - AUDIO_MAX; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  const isAudio = /\.mp3$/i.test(url.pathname);
  if (isAudio) {
    // network-first with a SEPARATE bounded (LRU-ish) cache to prevent unbounded growth
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        putAudio(e.request, copy).catch(err => console.warn("audio cache put failed", err));
        return resp;
      }).catch(() => caches.open(AUDIO_CACHE).then(c => c.match(e.request)))
    );
    return;
  }
  const isStatic = /\.(png|jpg|jpeg|webp|svg|ico|woff2?|ttf)$/i.test(url.pathname);
  if (isStatic) {
    // cache-first: images/fonts rarely change
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    })));
    return;
  }
  // network-first: HTML / JS / everything else → always fresh online, cache fallback offline
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./scoreup.html")))
  );
});
