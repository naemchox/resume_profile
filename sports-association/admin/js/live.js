// กรอบ "หน้าเว็บตอนนี้": แสดงเฉพาะส่วนของเว็บหลักที่เกี่ยวกับหน้านี้ (?preview=1&focus=…)
// โหลดใหม่เองเมื่อข้อมูลใน Firestore เปลี่ยน (ใครบันทึกก็ตาม) ข้อตกลงกับหน้าหลักอยู่ใน PREVIEW.md หัวข้อ 6
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, ready } from './firebase.js';
import { PREVIEW_SITE_URL, LIVE_VIEWS } from './config.js';
import { esc } from './ui.js';

const SITE_ORIGIN = new URL(PREVIEW_SITE_URL).origin;
const DEVICES = { desktop: [1280, 800], mobile: [390, 760] }; // [กว้าง, สูง] ของหน้าจอในกรอบ
const READY_TIMEOUT = 8000;
const PREF_KEY = 'jr-live';

function loadPref() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function savePref(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* ไม่เป็นไร */ }
}

export function mountLive(viewId) {
  const view = LIVE_VIEWS[viewId];
  if (!view) return;
  const pref = loadPref();
  const st = {
    pageIdx: Math.min(pref[`page-${viewId}`] || 0, view.pages.length - 1),
    device: pref.device || 'desktop',
    open: pref.open !== false,
    height: 0,
    timer: null
  };

  const box = document.createElement('section');
  box.className = 'live';
  box.innerHTML = `
    <div class="live-head">
      <button type="button" class="live-toggle" aria-expanded="true">
        <span class="live-caret" aria-hidden="true">▾</span>
        <strong>หน้าเว็บตอนนี้</strong>
        <span class="live-dot" title="อัปเดตเองเมื่อมีการบันทึก"></span>
      </button>
      <div class="live-tabs" role="tablist">${view.pages.length > 1
        ? view.pages.map(([label], i) => `<button type="button" data-page="${i}">${esc(label)}</button>`).join('')
        : `<span class="live-only">${esc(view.pages[0][0])}</span>`}</div>
      <div class="live-controls">
        <div class="seg" data-group="device">
          <button type="button" data-device="desktop">คอม</button>
          <button type="button" data-device="mobile">มือถือ</button>
        </div>
        <button type="button" class="btn btn-ghost btn-sm" data-reload>โหลดใหม่</button>
        <a class="btn btn-ghost btn-sm" data-full target="_blank" rel="noopener">เปิดเต็มหน้า ↗</a>
      </div>
    </div>
    <div class="live-stage">
      <div class="live-frame"><iframe title="หน้าเว็บตอนนี้" loading="lazy"></iframe></div>
      <div class="live-msg" hidden></div>
    </div>`;
  document.querySelector('.page-head').after(box);

  const $ = s => box.querySelector(s);
  const iframe = $('iframe');
  const stage = $('.live-stage');
  const frame = $('.live-frame');
  const msg = $('.live-msg');

  const url = (bust = false) => {
    const [, path, focus] = view.pages[st.pageIdx];
    const u = new URL(path, PREVIEW_SITE_URL + '/');
    u.searchParams.set('preview', '1');
    u.searchParams.set('slot', 'live');
    u.searchParams.set('focus', focus);
    if (bust) u.searchParams.set('_', Date.now());
    return u.href;
  };
  const fullUrl = () => new URL(view.pages[st.pageIdx][1], PREVIEW_SITE_URL + '/').href;

  function load({ quiet = false } = {}) {
    if (!st.open) return;
    if (!quiet) {
      st.height = 0;
      msg.hidden = false;
      msg.textContent = 'กำลังโหลดหน้าเว็บ…';
    }
    box.classList.add('is-loading');
    iframe.src = url(true);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      box.classList.remove('is-loading');
      msg.hidden = false;
      msg.innerHTML = `<div><strong>เปิดหน้าเว็บไม่ได้</strong><br><small>ตรวจว่าหน้าเว็บหลักเปิดอยู่ที่ <code>${esc(PREVIEW_SITE_URL)}</code></small></div>`;
    }, READY_TIMEOUT);
    fit();
  }

  // ย่อหน้าเว็บให้พอดีความกว้างกรอบ และตัดความสูงให้เท่าส่วนที่แสดง (เกินหน้าจอให้เลื่อนในกรอบ)
  function fit() {
    const [w, h] = DEVICES[st.device];
    const scale = Math.min(1, stage.clientWidth / w);
    const visible = st.height ? Math.min(st.height, h) : h;
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `translateX(-50%) scale(${scale})`;
    stage.style.height = `${Math.round(visible * scale)}px`;
  }

  function render() {
    box.classList.toggle('is-closed', !st.open);
    $('.live-toggle').setAttribute('aria-expanded', String(st.open));
    box.querySelectorAll('[data-page]').forEach(b => b.classList.toggle('active', Number(b.dataset.page) === st.pageIdx));
    box.querySelectorAll('[data-device]').forEach(b => b.classList.toggle('active', b.dataset.device === st.device));
    $('[data-full]').href = fullUrl();
  }

  window.addEventListener('message', e => {
    if (e.origin !== SITE_ORIGIN || e.source !== iframe.contentWindow) return;
    const type = e.data?.type;
    if (type === 'jr-preview-ready') {
      e.source.postMessage({ type: 'jr-preview-data', patch: {} }, SITE_ORIGIN);
    }
    if (type === 'jr-preview-rendered') {
      clearTimeout(st.timer);
      msg.hidden = true;
      box.classList.remove('is-loading');
    }
    if (type === 'jr-preview-size' && Number(e.data.height) > 0) {
      st.height = Number(e.data.height);
      fit();
    }
  });

  $('.live-toggle').addEventListener('click', () => {
    st.open = !st.open;
    savePref({ ...loadPref(), open: st.open });
    render();
    if (st.open) load(); else { iframe.src = 'about:blank'; clearTimeout(st.timer); }
  });
  box.querySelector('.live-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (!b) return;
    st.pageIdx = Number(b.dataset.page);
    savePref({ ...loadPref(), [`page-${viewId}`]: st.pageIdx });
    render();
    load();
  });
  $('[data-group=device]').addEventListener('click', e => {
    const b = e.target.closest('[data-device]');
    if (!b) return;
    st.device = b.dataset.device;
    savePref({ ...loadPref(), device: st.device });
    render();
    load();
  });
  $('[data-reload]').addEventListener('click', () => load());
  new ResizeObserver(fit).observe(stage);

  // ข้อมูลเปลี่ยน (บันทึกถึงเซิร์ฟเวอร์แล้ว) → โหลดกรอบใหม่ ไม่โหลดตอนเปิดหน้าครั้งแรก
  if (ready) {
    // บันทึกจากเครื่องนี้: snapshot แรกยังรอเซิร์ฟเวอร์ (hasPendingWrites) ตัวถัดไปเป็นแค่ metadata
    let first = true, dirty = false, debounce;
    onSnapshot(collection(db, view.watch), { includeMetadataChanges: true }, snap => {
      if (first) { if (!snap.metadata.fromCache) first = false; return; }
      if (snap.docChanges().length) dirty = true;
      if (snap.metadata.hasPendingWrites || !dirty) return;
      dirty = false;
      clearTimeout(debounce);
      debounce = setTimeout(() => load({ quiet: true }), 600);
    }, err => console.warn('[live] ติดตามข้อมูลไม่ได้', err));
  }

  render();
  load();
}
