// อ่านข้อมูลจาก Firestore ตาม CONTRACT.md
// FIREBASE_READY === false → ใช้ข้อมูลตัวอย่างจาก seed.js
// ?preview=1 ในกรอบของหน้าแอดมิน → รวมข้อมูลที่กำลังแก้ (patch) ตาม admin/PREVIEW.md
import { firebaseConfig, FIREBASE_READY } from './firebase-config.js';
import { SEED, seedPhotos } from './seed.js';
import { IMG, SITE_IMAGE_FALLBACK } from './content.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
let dbPromise;

function db() {
  dbPromise ??= (async () => {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    return { fs, db: fs.getFirestore(initializeApp(firebaseConfig)) };
  })();
  return dbPromise;
}

// ---- โหมดตัวอย่าง ----
const params = new URLSearchParams(location.search);
export const PREVIEW = params.get('preview') === '1' && window.parent !== window;
const patchPromise = !PREVIEW ? Promise.resolve({}) : new Promise(resolve => {
  const done = p => { window.removeEventListener('message', onMsg); resolve(p && typeof p === 'object' ? p : {}); };
  const onMsg = e => { if (e.source === window.parent && e.data?.type === 'jr-preview-data') done(e.data.patch); };
  window.addEventListener('message', onMsg);
  window.parent.postMessage({ type: 'jr-preview-ready' }, '*');
  setTimeout(() => done({}), 3000);
});

if (PREVIEW) {
  // กดลิงก์ภายในแล้วยังอยู่ในโหมดตัวอย่าง (ช่องเดิม)
  const slot = params.get('slot') || '';
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank') return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('.html')) return;
    url.searchParams.set('preview', '1');
    if (slot) url.searchParams.set('slot', slot);
    a.href = url.href;
  }, true);
}

// ?focus=id1,id2 → แสดงเฉพาะส่วนที่มี id นั้น ซ่อนเมนู footer และส่วนอื่น (กรอบ "หน้าเว็บตอนนี้" ของแอดมิน)
// ส่งความสูงของเนื้อหาให้แอดมินด้วย { type: 'jr-preview-size', height }
let onRendered = () => {};
const FOCUS = PREVIEW ? (params.get('focus') || '').split(',').map(s => s.trim()).filter(Boolean) : [];
if (FOCUS.length) {
  const root = document.documentElement;
  root.classList.add('jr-focus', 'jr-focus-pending');
  document.head.insertAdjacentHTML('beforeend', `<style>
    html.jr-focus { --rail: 0px; scroll-behavior: auto; }
    html.jr-focus body { padding: 0 !important; }
    html.jr-focus-pending body { visibility: hidden; }
    .jr-focus-hide { display: none !important; }
  </style>`);

  const apply = () => {
    const targets = FOCUS.map(id => document.getElementById(id)).filter(Boolean);
    if (!targets.length || !document.body) return false;
    const inside = el => targets.some(t => t !== el && t.contains(el));
    const keep = new Set();
    targets.forEach(t => { for (let el = t; el && el !== document.body; el = el.parentElement) keep.add(el); });
    keep.forEach(el => {
      if (inside(el)) return;
      for (const sib of el.parentElement.children) {
        const hide = !keep.has(sib) && !inside(sib) && sib.tagName !== 'SCRIPT' && sib.tagName !== 'STYLE';
        if (sib.classList.contains('jr-focus-hide') !== hide) sib.classList.toggle('jr-focus-hide', hide);
      }
    });
    return true;
  };
  const reveal = () => {
    apply();
    root.classList.remove('jr-focus-pending');
    window.scrollTo(0, 0);
  };
  let lastH = 0;
  const sendSize = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h !== lastH) { lastH = h; window.parent.postMessage({ type: 'jr-preview-size', height: h }, '*'); }
  };

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; if (apply()) sendSize(); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  const watchSize = () => new ResizeObserver(sendSize).observe(document.body);
  if (document.body) watchSize(); else document.addEventListener('DOMContentLoaded', watchSize);
  onRendered = reveal;
  setTimeout(reveal, 4000); // กันค้างถ้าหน้าไม่เรียก get* เลย
}

// ส่ง jr-preview-rendered เมื่อทุก get* ที่หน้าเรียกเสร็จแล้ว (ไม่มีอะไรค้างอยู่ 150ms)
let inflight = 0, renderedTimer, renderedSent = false;
function settle() {
  clearTimeout(renderedTimer);
  renderedTimer = setTimeout(() => {
    if (inflight || renderedSent) return;
    renderedSent = true;
    requestAnimationFrame(() => {
      onRendered();
      window.parent.postMessage({ type: 'jr-preview-rendered' }, '*');
    });
  }, 150);
}
if (PREVIEW) patchPromise.then(settle);
const tracked = fn => !PREVIEW ? fn : async (...args) => {
  inflight++;
  try { return await fn(...args); } finally { inflight--; settle(); }
};

const toDate = v => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : null);
const DATE_FIELDS = ['publishedAt', 'startDate', 'endDate', 'date', 'createdAt', 'updatedAt'];
function norm(doc) {
  const o = { ...doc };
  for (const f of DATE_FIELDS) if (f in o) o[f] = toDate(o[f]);
  return o;
}

// ดึงทั้ง collection ตามเงื่อนไขเดียว แล้วเรียงฝั่ง browser (ไม่ต้องสร้าง composite index)
async function list(name, field, value) {
  const { fs, db: d } = await db();
  const q = fs.query(fs.collection(d, name), fs.where(field, '==', value));
  const snap = await fs.getDocs(q);
  return snap.docs.map(x => norm({ id: x.id, ...x.data() }));
}

async function get(name, id) {
  const { fs, db: d } = await db();
  const snap = await fs.getDoc(fs.doc(d, name, id));
  return snap.exists() ? norm({ id: snap.id, ...snap.data() }) : null;
}

const byDesc = f => (a, b) => (b[f]?.getTime() ?? 0) - (a[f]?.getTime() ?? 0);
const byAsc = f => (a, b) => (a[f]?.getTime?.() ?? a[f] ?? 0) - (b[f]?.getTime?.() ?? b[f] ?? 0);

// ตัดรายการที่ถูกลบ/แก้ออก เติมฉบับที่แก้ แล้วกรองด้วยเงื่อนไขเดิม (เรียงต่อทีหลัง)
function applyPatch(items, part, keep) {
  if (!part) return items;
  const drop = new Set([...(part.remove || []), ...(part.upsert || []).map(d => d.id)]);
  return [...items.filter(d => !drop.has(d.id)), ...(part.upsert || []).map(norm)].filter(keep);
}
// รายการเดียว: undefined = patch ไม่เกี่ยว, null = ถูกลบ
function patchedOne(part, id) {
  if (part?.remove?.includes(id)) return null;
  const d = part?.upsert?.find(x => x.id === id);
  return d ? norm(d) : undefined;
}

async function safe(fn, fallback) {
  if (!FIREBASE_READY) return fallback();
  try { return await fn(); }
  catch (err) { console.warn('[JR] Firestore error, ใช้ข้อมูลตัวอย่างแทน', err); return fallback(); }
}

const published = d => d.status === 'published';

export const getBanners = tracked(async () => {
  const [patch, items] = await Promise.all([patchPromise, safe(
    () => list('banners', 'active', true),
    () => SEED.banners,
  )]);
  const out = applyPatch(items, patch.banners, b => b.active === true).sort(byAsc('order'));
  // ยังไม่มีแบนเนอร์จริงสักอัน → ใช้แบนเนอร์ตัวอย่างไปก่อน (หายเองเมื่อแอดมินเพิ่มอันแรก)
  if (!out.length && !items.length) return SEED.banners.filter(b => b.active).sort(byAsc('order'));
  return out;
});

export const getNews = tracked(async ({ category, limit } = {}) => {
  const [patch, items] = await Promise.all([patchPromise, safe(
    () => list('news', 'status', 'published'),
    () => SEED.news,
  )]);
  const all = applyPatch(items, patch.news, published).sort(byDesc('publishedAt'));
  const out = category ? all.filter(n => n.category === category) : all;
  return limit ? out.slice(0, limit) : out;
});

export const getNewsById = tracked(async id => {
  const p = patchedOne((await patchPromise).news, id);
  if (p !== undefined) return p && published(p) ? p : null;
  return safe(
    async () => { const n = await get('news', id); return n && published(n) ? n : null; },
    () => SEED.news.find(n => n.id === id && published(n)) ?? null,
  );
});

export const getEvents = tracked(async () => {
  const [patch, items] = await Promise.all([patchPromise, safe(
    () => list('events', 'status', 'published'),
    () => SEED.events,
  )]);
  return applyPatch(items, patch.events, published).sort(byAsc('startDate'));
});

export const getAlbums = tracked(async () => {
  const [patch, items] = await Promise.all([patchPromise, safe(
    () => list('albums', 'status', 'published'),
    () => SEED.albums,
  )]);
  return applyPatch(items, patch.albums, published).sort(byDesc('date'));
});

const photosOf = list => [...list].sort(byAsc('order')).map(p => ({ ...p, thumb: p.thumb || p.url }));

async function fetchPhotos(id) {
  return safe(
    async () => {
      const { fs, db: d } = await db();
      const snap = await fs.getDocs(fs.collection(d, 'albums', id, 'photos'));
      return photosOf(snap.docs.map(x => ({ id: x.id, ...x.data() })));
    },
    () => { const a = SEED.albums.find(x => x.id === id); return a ? seedPhotos(a) : []; },
  );
}

export const getAlbum = tracked(async id => {
  const p = patchedOne((await patchPromise).albums, id);
  if (p !== undefined) {
    if (!p || !published(p)) return null;
    return { ...p, photos: Array.isArray(p.photos) ? photosOf(p.photos) : await fetchPhotos(id) };
  }
  const album = await safe(
    () => get('albums', id),
    () => SEED.albums.find(a => a.id === id) ?? null,
  );
  if (!album || !published(album)) return null;
  return { ...album, photos: await fetchPhotos(id) };
});

// คืน URL รูปประจำหน้า ถ้ายังไม่มีใน siteImages ใช้รูปสำรอง
// ตำแหน่งรูปที่แอดมินตั้ง (pos) อ่านด้วย siteImagePos(key) หลัง await getSiteImage(key) แล้ว
const sitePos = {};
export const siteImagePos = key => sitePos[key];
export const getSiteImage = tracked(async (key, w = 1920) => {
  const fallback = () => { sitePos[key] = undefined; return IMG(SITE_IMAGE_FALLBACK[key], w); };
  const use = d => { if (!d?.url) return fallback(); sitePos[key] = d.pos; return d.url; };
  const p = patchedOne((await patchPromise).siteImages, key);
  if (p !== undefined) return use(p);
  return safe(async () => use(await get('siteImages', key)), fallback);
});
