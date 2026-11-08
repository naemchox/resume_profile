// ดูตัวอย่างบนหน้าเว็บจริง: เปิดหน้าเว็บหลักในกรอบ 2 ฝั่ง (ก่อนแก้ / หลังแก้)
// ฝั่งหลังแก้ส่งข้อมูลที่กำลังแก้ผ่าน postMessage ตามข้อตกลงใน admin/PREVIEW.md
import { PREVIEW_SITE_URL } from './config.js';
import { esc } from './ui.js';
import { resizeImage } from './upload.js';

const SITE_ORIGIN = new URL(PREVIEW_SITE_URL).origin;
const DEVICES = { desktop: 1280, mobile: 390 };
const READY_TIMEOUT = 8000;

// Timestamp → millis เพราะ postMessage ส่ง object ของ Firestore ไม่ได้
export function toPlain(value) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
  }
  return value;
}

// รูปที่เลือกแต่ยังไม่อัปโหลด → data URL (กรอบเป็นคนละ origin ใช้ blob: URL ไม่ได้)
export async function fileToDataUrl(file, maxSide = 1600) {
  const blob = await resizeImage(file, maxSide);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// รูปสำหรับฝั่งหลังแก้: ไฟล์ที่เพิ่งเลือก (ย่อแล้วแปลงเป็น data URL) หรือ URL เดิม
const dataUrlCache = new WeakMap();
export async function previewImage(file, currentUrl = '') {
  if (!file) return currentUrl;
  if (!dataUrlCache.has(file)) dataUrlCache.set(file, await fileToDataUrl(file));
  return dataUrlCache.get(file);
}

let dlg = null;
let state = null; // { pages, patch, pageIdx, mode, device, timers }

function build() {
  dlg = document.createElement('dialog');
  dlg.className = 'preview-dlg';
  dlg.innerHTML = `
    <div class="pv">
      <div class="pv-head">
        <div class="pv-title"><strong></strong><small class="pv-note"></small></div>
        <div class="pv-tabs" role="tablist"></div>
        <div class="pv-controls">
          <div class="seg" data-group="mode">
            <button type="button" data-mode="before">ก่อนแก้</button>
            <button type="button" data-mode="after">หลังแก้</button>
            <button type="button" data-mode="both" class="pv-both">เทียบคู่</button>
          </div>
          <div class="seg" data-group="device">
            <button type="button" data-device="desktop">คอม</button>
            <button type="button" data-device="mobile">มือถือ</button>
          </div>
          <button type="button" class="dlg-close" data-pv-close aria-label="ปิด">×</button>
        </div>
      </div>
      <div class="pv-body">
        <section class="pv-pane" data-slot="before">
          <div class="pv-label">ก่อนแก้ <small>(ที่เผยแพร่อยู่ตอนนี้)</small></div>
          <div class="pv-stage"><div class="pv-frame"><iframe title="ก่อนแก้"></iframe></div><div class="pv-msg" hidden></div></div>
        </section>
        <section class="pv-pane" data-slot="after">
          <div class="pv-label">หลังแก้</div>
          <div class="pv-stage"><div class="pv-frame"><iframe title="หลังแก้"></iframe></div><div class="pv-msg" hidden></div></div>
        </section>
      </div>
      <div class="pv-foot"></div>
    </div>`;
  document.body.appendChild(dlg);

  dlg.querySelector('[data-pv-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => {
    // หยุดโหลดหน้าในกรอบเมื่อปิด
    dlg.querySelectorAll('iframe').forEach(f => { f.src = 'about:blank'; });
    Object.values(state?.timers || {}).forEach(clearTimeout);
  });
  dlg.querySelector('[data-group=mode]').addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (b) { state.mode = b.dataset.mode; layout(); }
  });
  dlg.querySelector('[data-group=device]').addEventListener('click', e => {
    const b = e.target.closest('[data-device]');
    if (b) { state.device = b.dataset.device; layout(); }
  });
  dlg.querySelector('.pv-tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (b) { state.pageIdx = Number(b.dataset.page); loadFrames(); }
  });

  new ResizeObserver(() => fit()).observe(dlg.querySelector('.pv-body'));
  window.addEventListener('message', onMessage);
}

function pane(slot) { return dlg.querySelector(`.pv-pane[data-slot=${slot}]`); }

function frameUrl(path, slot) {
  const u = new URL(path, PREVIEW_SITE_URL + '/');
  u.searchParams.set('preview', '1');
  u.searchParams.set('slot', slot);
  return u.href;
}

function loadFrames() {
  const page = state.pages[state.pageIdx];
  dlg.querySelectorAll('.pv-tabs [data-page]').forEach(b =>
    b.classList.toggle('active', Number(b.dataset.page) === state.pageIdx));
  ['before', 'after'].forEach(slot => {
    const p = pane(slot);
    const msg = p.querySelector('.pv-msg');
    msg.hidden = false;
    msg.textContent = 'กำลังโหลดหน้าเว็บ…';
    p.querySelector('iframe').src = frameUrl(page.path, slot);
    clearTimeout(state.timers[slot]);
    state.timers[slot] = setTimeout(() => {
      msg.hidden = false;
      msg.innerHTML = `<div><strong>เปิดหน้าตัวอย่างไม่ได้</strong><br><small>ตรวจว่าหน้าเว็บหลักเปิดอยู่ที่ <code>${esc(PREVIEW_SITE_URL)}</code> และรองรับโหมดตัวอย่างแล้ว (ดู admin/PREVIEW.md)</small></div>`;
    }, READY_TIMEOUT);
  });
}

// หน้าเว็บหลักในกรอบพร้อมแล้ว → ส่งข้อมูลให้ (ฝั่งก่อนแก้ส่ง patch ว่าง)
function onMessage(e) {
  if (!state || e.origin !== SITE_ORIGIN) return;
  const type = e.data?.type;
  const slot = ['before', 'after'].find(s => pane(s).querySelector('iframe').contentWindow === e.source);
  if (!slot) return;
  if (type === 'jr-preview-ready') {
    e.source.postMessage({ type: 'jr-preview-data', patch: slot === 'after' ? state.patch : {} }, SITE_ORIGIN);
  }
  if (type === 'jr-preview-rendered' || type === 'jr-preview-ready') {
    clearTimeout(state.timers[slot]);
    pane(slot).querySelector('.pv-msg').hidden = true;
  }
}

function layout() {
  const narrow = matchMedia('(max-width: 860px)').matches;
  if (narrow && state.mode === 'both') state.mode = 'after';
  dlg.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  dlg.querySelectorAll('[data-device]').forEach(b => b.classList.toggle('active', b.dataset.device === state.device));
  pane('before').hidden = state.mode === 'after';
  pane('after').hidden = state.mode === 'before';
  fit();
}

// ย่อหน้าเว็บให้พอดีกรอบ โดยยังแสดงผลที่ความกว้างจริงของอุปกรณ์
function fit() {
  if (!state || !dlg?.open) return;
  const w = DEVICES[state.device];
  ['before', 'after'].forEach(slot => {
    const p = pane(slot);
    if (p.hidden) return;
    const stage = p.querySelector('.pv-stage');
    const frame = p.querySelector('.pv-frame');
    const scale = Math.min(1, stage.clientWidth / w);
    frame.style.width = `${w}px`;
    frame.style.height = `${stage.clientHeight / scale}px`;
    frame.style.transform = `scale(${scale})`;
  });
}

/**
 * pages: [{ label, path }] path ของหน้าเว็บหลัก เช่น 'article.html?id=abc'
 * patch: ข้อมูลที่จะแสดงในฝั่งหลังแก้ (รูปแบบตาม PREVIEW.md)
 * actions: ปุ่มด้านล่าง [{ label, primary, onClick }] (ไม่ใส่ = มีแค่ "กลับไปแก้ไข")
 */
export function openPreview({ title = 'ดูตัวอย่าง', note = '', pages, patch, actions }) {
  if (!dlg) build();
  state = { pages, patch, pageIdx: 0, mode: matchMedia('(max-width: 860px)').matches ? 'after' : 'both', device: 'desktop', timers: {} };

  dlg.querySelector('.pv-title strong').textContent = title;
  dlg.querySelector('.pv-note').textContent = note;
  dlg.querySelector('.pv-tabs').innerHTML = pages.length > 1
    ? pages.map((p, i) => `<button type="button" data-page="${i}">${esc(p.label)}</button>`).join('')
    : '';

  const foot = dlg.querySelector('.pv-foot');
  foot.innerHTML = '';
  const list = actions?.length ? actions : [{ label: 'กลับไปแก้ไข', onClick: () => dlg.close() }];
  list.forEach(a => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${a.primary ? 'btn-primary' : 'btn-secondary'}`;
    b.textContent = a.label;
    if (a.write) b.dataset.write = '';
    b.addEventListener('click', () => a.onClick(dlg));
    foot.appendChild(b);
  });

  dlg.showModal();
  layout();
  loadFrames();
  return dlg;
}
