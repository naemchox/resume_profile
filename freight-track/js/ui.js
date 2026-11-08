/* ============================================================
   ui.js — เปลือกแอป
   ทุกอย่างที่ต้องมีทุกหน้า ผูกไว้ที่นี่ที่เดียว
   header · toast · modal · reveal · รูปภาพ · ลายเซ็น · ตัวช่วย DOM
   ============================================================ */

import { pageReady } from './motion.js';
import { settings, resetDemo, wipeJobs, META, FLOW, S, stepIndex, fmtTime, onLocalWrite } from './store.js';
import { getSession, backToPicker, isHelperPage } from './auth.js';
import { navItems, roleLabel, isAdmin } from './access.js';
import { driverUrl, HELPER_URL, STAFF_URL } from './config.js';
import { fitDataUrl } from './imageFit.js';

/* ---------- DOM helpers ----------------------------------- */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
));

export function el(html){
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function on(root, evt, sel, fn){
  root.addEventListener(evt, (e) => {
    const m = e.target.closest(sel);
    if (m && root.contains(m)) fn(e, m);
  });
}

/* ---------- header ----------------------------------------
   เมนูขึ้นตามสิทธิ์ของคนที่ล็อกอิน (js/access.js) — ฝั่งคนขับเห็นแค่ "คนขับ"
   หน้าไหนยังไม่ได้เรียก gate() (ไม่มี session) จะไม่มีเมนู */
export function header(role = '', { nav = true, picker = false } = {}){
  const st = settings();
  const ses = getSession();
  const here = location.pathname.split('/').pop() || 'index.html';
  const helper = ses.kind === 'driver' && isHelperPage();
  const drvHref = helper ? HELPER_URL : driverUrl();
  const items = nav ? navItems(ses, drvHref, helper ? 'ผู้ช่วยคนขับ' : 'คนขับ') : [];
  /* ฝั่งคนขับมีเมนูเดียว (คนขับ หรือ ผู้ช่วยคนขับ) · ฝั่ง Back office แยกสองเมนู จึงไฮไลต์ตามหน้าจริง */
  const isHere = (href) => href === here || (href === drvHref && (here === 'driver.html' || (here === 'helper.html' && ses.kind !== 'staff')));
  const home = ses.kind === 'staff' ? (items[0]?.href || STAFF_URL) : ses.kind === 'driver' ? drvHref : 'index.html';
  const who = ses.kind === 'staff' ? ses.staff : null;   /* พนักงาน: ไม่ต้องมีป้ายมุมมอง — บทบาทขึ้นใต้ชื่ออยู่แล้ว (แถบหัวจะได้ไม่แน่น) */
  const bar = el(`
<header class="appbar${items.length === 1 ? ' nav-single' : ''}">
  <div class="wrap-wide appbar-inner">
    <a class="brand" href="${esc(home)}">
      <span class="brand-mark">FT</span>
      <span>
        <span class="brand-name">ขนส่งตัวอย่าง</span><br>
        <span class="brand-sub">${esc(st.companyEn)}</span>
      </span>
    </a>
    ${role && !who ? `<span class="appbar-role hide-sm">${esc(role)}</span>` : ''}
    ${items.length ? `<nav class="appnav">
      ${items.map(n => `<a href="${esc(n.href)}"${isHere(n.href) ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('')}
    </nav>` : ''}
    ${who || ses.kind === 'driver' || picker ? `<div class="appbar-user">
      ${who ? `<span class="appbar-user-name" title="${esc(who.email)}">${esc(who.name || who.email)}<small>${esc(roleLabel(who.role))}</small></span>` : ''}
      <button class="appbar-out" type="button" data-picker title="ออกจากระบบฝั่งนี้ แล้วกลับไปเลือกฝั่งใหม่">
        <span class="hide-sm">กลับไปหน้าเลือกผู้ใช้</span><span class="show-sm">← เลือกฝั่ง</span>
      </button>
    </div>` : ''}
    <button class="theme-btn" type="button" data-theme-toggle title="สลับโหมดสว่าง / มืด" aria-label="สลับโหมดสว่าง / มืด"></button>
  </div>
</header>`);
  /* กลับไปหน้าเลือกผู้ใช้ = ออกจากระบบฝั่งนี้ (ไม่งั้นหน้าเลือกฝั่งจะพากลับมาฝั่งเดิมทันที) */
  bar.querySelector('[data-picker]')?.addEventListener('click', async () => {
    let driverIn = false;
    try{ driverIn = !!localStorage.getItem('ft.driver.session'); }catch{}
    if (who || driverIn){
      const ok = await confirmDialog({
        title:'กลับไปหน้าเลือกผู้ใช้',
        message: who
          ? 'ระบบจะออกจากบัญชี Back office นี้ แล้วพากลับไปหน้าเลือกฝั่ง — เข้าใหม่ได้ด้วยการล็อกอิน Google อีกครั้ง'
          : 'ระบบจะออกจากบัญชีคนขับนี้ แล้วพากลับไปหน้าเลือกฝั่ง — เข้าใหม่ได้ด้วย ID และรหัสผ่านเดิม',
        ok:'กลับไปหน้าเลือกผู้ใช้',
      });
      if (!ok) return;
    }
    backToPicker();
  });
  document.body.prepend(bar);
  /* สิทธิ์ดูอย่างเดียว — บอกให้ชัดตั้งแต่เปิดหน้า ไม่ต้องรอกดแล้วโดนปฏิเสธ */
  if (ses.kind === 'staff' && ses.level === 'view'){
    bar.after(el(`<div class="readonly-bar">บัญชีนี้ <b>ดูได้อย่างเดียว</b> ในหน้านี้ — ต้องการแก้ไข ติดต่อ admin</div>`));
  }
  return bar;
}

/* ---------- toast ----------------------------------------- */
export function toast(msg, kind = 'info', ms = 3400){
  let box = $('#toasts');
  if (!box){ box = el('<div id="toasts"></div>'); document.body.appendChild(box); }
  const t = el(`<div class="toast" data-kind="${kind}" role="status">${esc(msg)}</div>`);
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
  return t;
}

/* ---------- modal -----------------------------------------
   (27 ต.ค.) ทุกหน้าต่างทั้งระบบ:
   1) ปิดด้วยมือ (× · ปุ่ม data-close เช่น "ยกเลิก" · แตะนอกกล่อง · Esc · ปุ่มย้อนกลับมือถือ)
      → ขึ้นกล่อง "ยืนยัน" ซ้อนก่อน (ยกเลิก = กลับไปทำต่อ · ยืนยัน = ปิด) · guard:false = ปิดเลย (กล่องคำถามเอง)
   2) เซฟอัตโนมัติทุกการเปลี่ยนแปลง — ช่องกรอกทุกช่องเก็บเองใน localStorage (คีย์ = หน้า + หัวกล่อง)
      รูป/ลายเซ็น/ขั้น ส่งผ่าน draft:{get,set} เก็บใน IndexedDB · เปิดกล่องเดิมอีกครั้ง = ใส่ค่าที่ค้างไว้กลับให้
      ปิดด้วยมือ = เก็บไว้ · ปิดจากโค้ดหลังบันทึกสำเร็จ (close()) = ลบทิ้ง · กล่องใหม่เปิดทับ = เก็บไว้
   3) reopen:{name, args} = จดว่ากล่องนี้เปิดค้าง — หน้าโหลดใหม่ (เช่น เบราว์เซอร์รีเฟรชตอนเปิดกล้อง)
      หน้านั้นเรียก reopenDialog(ตารางชื่อ→ฟังก์ชัน) เปิดกล่องเดิมให้เอง */
let openModal = null;
let openMeta = null;           /* { key, guard, draft, reopen, onClose } ของกล่องที่เปิดอยู่ */
let asking = null;             /* กล่องยืนยันที่ซ้อนอยู่ */

/* ตำแหน่งเลื่อนหน้าตอนเปิดหน้าต่างแรก — ปิดแล้วกลับที่เดิม (หน้าต่างต่อกันหลายอันยังจำของอันแรก)
   เปิดใช้เฉพาะหน้าที่เรียก keepScrollOnClose() (ตอนนี้ billing) */
let keepY = null, keepOn = false;
export const keepScrollOnClose = (on = true) => { keepOn = on; };

const PAGE = () => (location.pathname.split('/').pop() || 'index.html');
const DRAFT_PREFIX = 'ft.dlg.';
const OPEN_KEY = () => `ft.dlg.open.${PAGE()}`;
const OPEN_TTL = 12 * 3600 * 1000;
const lsGet = (k) => { try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch{ return null; } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ console.warn('[ui] เซฟอัตโนมัติไม่ได้', e); } };
const lsDel = (k) => { try{ localStorage.removeItem(k); }catch{} };

/* ที่เก็บรูป/ลายเซ็นของกล่อง (ใหญ่เกิน localStorage) — IndexedDB · เปิดไม่ได้ = ข้ามเงียบ ๆ */
let idbP = null;
function idb(){
  return idbP ||= new Promise((res) => {
    try{
      const r = indexedDB.open('ft.dialogs', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('drafts');
      r.onsuccess = () => res(r.result);
      r.onerror = r.onblocked = () => res(null);
    }catch{ res(null); }
  });
}
async function idbDo(mode, fn){
  const db = await idb();
  if (!db) return null;
  return new Promise((res) => {
    try{
      const t = db.transaction('drafts', mode);
      const r = fn(t.objectStore('drafts'));
      t.oncomplete = () => res(r?.result ?? null);
      t.onerror = t.onabort = () => res(null);
    }catch{ res(null); }
  });
}
const extraGet = (k) => idbDo('readonly', s => s.get(k));
const extraPut = (k, v) => idbDo('readwrite', s => s.put(v, k));
const extraDel = (k) => idbDo('readwrite', s => s.delete(k));

/* ช่องกรอกที่เซฟอัตโนมัติ — ไม่เก็บรหัสผ่าน / ไฟล์ / ช่องที่ติด data-nosave */
const FIELDS = 'input:not([type=file]):not([type=password]):not([type=hidden]):not([data-nosave]), select:not([data-nosave]), textarea:not([data-nosave])';
const fieldsOf = (root) => $$(`.modal-body ${FIELDS.split(', ').join(', .modal-body ')}`, root);
const snap = (f) => (f.type === 'checkbox' || f.type === 'radio') ? { c: f.checked } : { v: f.value };
const keyOf = (title) => DRAFT_PREFIX + PAGE() + '.' + String(title || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

function saveNow(){
  const m = openMeta;
  if (!m || !openModal) return;
  const fields = fieldsOf(openModal).map(snap);
  const hasExtra = !!m.draft?.get;
  if (fields.length || hasExtra) lsSet(m.key, { at: Date.now(), fields, extra: hasExtra });
  if (hasExtra){ try{ extraPut(m.key, m.draft.get()); }catch(e){ console.warn('[ui] เซฟรูปไม่ได้', e); } }
}
let saveT = null;
const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; saveNow(); }, 350); };
/** กล่องที่มีของที่ไม่ใช่ช่องกรอก (รูป ลายเซ็น ขั้น) เรียกตัวนี้ทุกครั้งที่เปลี่ยน */
export const markDirty = () => saveSoon();

async function restore(root, meta){
  const rec = lsGet(meta.key);
  if (!rec) return;
  const fields = fieldsOf(root);
  let used = false;
  if (rec.fields?.length && rec.fields.length === fields.length){
    rec.fields.forEach((s, i) => {
      const f = fields[i];
      if ('c' in s){ if (f.checked !== s.c){ f.checked = s.c; used = true; } }
      else if (f.value !== s.v){ f.value = s.v; used = true; }
      else return;
      f.dispatchEvent(new Event('input', { bubbles:true }));
      f.dispatchEvent(new Event('change', { bubbles:true }));
    });
  }
  if (rec.extra && meta.draft?.set){
    const x = await extraGet(meta.key);
    if (x && root.isConnected && openModal === root){ try{ meta.draft.set(x); used = true; }catch(e){ console.warn('[ui] ใส่รูปที่ค้างไว้คืนไม่ได้', e); } }
  }
  if (used && root.isConnected) toast('เปิดงานที่ค้างไว้ — ทำต่อได้เลย', 'ok', 2600);
}

/** ลบที่เซฟไว้ของกล่องนี้ (ทำงานสำเร็จแล้ว) */
function dropDraft(key){ lsDel(key); extraDel(key); }
/** งานในกล่องที่เปิดอยู่บันทึกเข้าระบบแล้ว (เช่น เลือกคนขับแล้วจ่ายงานทันที) — ทิ้งที่เซฟไว้ กันเปิดใหม่แล้วได้ค่าเก่าคืน */
export function doneDraft(){ if (!openMeta) return; clearTimeout(saveT); saveT = null; dropDraft(openMeta.key); }
onLocalWrite(doneDraft);

/* ---------- ปุ่มย้อนกลับของมือถือ: เปิดกล่อง = เพิ่มประวัติ 1 ขั้น · กดย้อนกลับ = ถามยืนยัน ---------- */
const HKEY = 'ftModal';
let skipPop = 0;
addEventListener('popstate', (e) => {
  if (skipPop){
    skipPop--;
    e.stopImmediatePropagation();
    /* ปิดกล่องแล้วเปิดกล่องใหม่ต่อทันที — ย้อนกลับที่สั่งไว้กินขั้นของกล่องใหม่ไป ใส่คืน */
    if (openModal && !history.state?.[HKEY]) history.pushState({ ...(history.state || {}), [HKEY]: 1 }, '');
    return;
  }
  if (!openModal) return;
  e.stopImmediatePropagation();
  history.pushState({ ...(history.state || {}), [HKEY]: 1 }, '');   /* ยังอยู่หน้าเดิม — ใส่ขั้นคืน */
  askClose();
}, true);

export function modal({ title = '', body = '', foot = '', wide = false, onMount, guard = true, draft = null, reopen = null, onClose = null, autosave = true, draftKey = '' } = {}){
  const y = openModal ? keepY : scrollY;
  const replacing = !!openModal;
  close({ replaced: true });
  keepY = y;
  const scrim = el(`
<div class="scrim" role="dialog" aria-modal="true">
  <div class="modal${wide ? ' modal-lg' : ''}">
    <div class="modal-head">
      <h3 class="grow" style="font-size:16.5px">${title}</h3>
      <button class="icon-btn" data-close aria-label="ปิด">×</button>
    </div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>
</div>`);
  /* จับก่อนตัวอื่น (capture) — ยังไม่ยืนยัน ห้าม listener อื่นของ [data-close] ทำงาน */
  scrim.addEventListener('click', (e) => {
    const x = e.target === scrim || e.target.closest('[data-close]');
    if (!x || (x !== scrim && x.disabled)) return;
    if (guard){ e.stopImmediatePropagation(); e.preventDefault(); askClose(); }
    else close({ user: true });
  }, true);
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  openModal = scrim;
  /* draftKey = คีย์ของงานนั้นเอง (หัวกล่องซ้ำกันได้ เช่น "ยืนยันแพ็คขึ้นรถครบ" ทุกเที่ยว) */
  const meta = openMeta = { key: keyOf(draftKey || title), guard, draft, reopen, onClose, autosave };
  if (!replacing) history.pushState({ ...(history.state || {}), [HKEY]: 1 }, '');
  if (reopen) lsSet(OPEN_KEY(), { ...reopen, at: Date.now() });
  else lsDel(OPEN_KEY());
  onMount?.(scrim);
  if (autosave && guard){
    scrim.addEventListener('input', saveSoon);
    scrim.addEventListener('change', saveSoon);
    restore(scrim, meta);
  }
  return scrim;
}

/** ถามยืนยันก่อนปิดกล่องที่เปิดอยู่ (กล่องซ้อน ไม่แตะกล่องเดิม) */
export function askClose(){
  if (!openModal || asking) return;
  if (openMeta && !openMeta.guard) return close({ user: true });
  const box = el(`
<div class="confirm-scrim" role="alertdialog" aria-modal="true" aria-labelledby="cfm-t">
  <div class="confirm-box">
    <h3 id="cfm-t">ยืนยัน</h3>
    <p>ต้องการปิดหน้าต่างนี้ใช่ไหม?<br><span class="dim">ที่ทำไว้บันทึกอัตโนมัติแล้ว เปิดกลับมาทำต่อได้</span></p>
    <div class="confirm-acts">
      <button type="button" class="btn btn-ghost" data-cfm="no">ยกเลิก</button>
      <button type="button" class="btn btn-accent" data-cfm="yes">ยืนยัน</button>
    </div>
  </div>
</div>`);
  const done = (yes) => { box.remove(); asking = null; if (yes){ saveNow(); close({ user: true }); } };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cfm]');
    if (b) done(b.dataset.cfm === 'yes');
    else if (e.target === box) done(false);
  });
  document.body.appendChild(box);
  asking = box;
  box.querySelector('[data-cfm="no"]').focus();
}

/** ปิดกล่อง · เรียกจากโค้ด (หลังบันทึกสำเร็จ) = ลบที่เซฟไว้ด้วย
 *  {user:true} = ผู้ใช้ปิดเอง (ยืนยันแล้ว) เก็บที่เซฟไว้ · {replaced:true} = มีกล่องใหม่เปิดทับ เก็บไว้ ไม่แตะประวัติ */
export function close({ user = false, replaced = false } = {}){
  if (!openModal) return;
  clearTimeout(saveT);
  const meta = openMeta;
  if (meta){
    if (user || (replaced && saveT)) saveNow();          /* กล่องใหม่เปิดทับ: เซฟเฉพาะที่ยังค้างรอเซฟ */
    else if (!replaced && meta.autosave) dropDraft(meta.key);
  }
  saveT = null;
  asking?.remove(); asking = null;
  openModal.remove();
  openModal = null;
  openMeta = null;
  document.body.style.overflow = '';
  if (!replaced){
    lsDel(OPEN_KEY());
    if (history.state?.[HKEY]){ skipPop++; history.back(); }
  }
  try{ meta?.onClose?.({ user, replaced }); }catch(e){ console.error(e); }
  /* วาดหน้าใหม่หลังปิดหน้าต่าง (เช่น สร้างใบวางบิลแล้ว) ต้องไม่ดีดกลับขึ้นบน */
  const y = keepY;
  if (!replaced && keepOn && y !== null) requestAnimationFrame(() => { if (!openModal && Math.abs(scrollY - y) > 2) scrollTo(0, y); });
}

/** เปิดกล่องที่ค้างไว้ก่อนหน้าโหลดใหม่ · table = { ชื่อ: (args) => เปิดกล่อง (คืน false = ยังเปิดไม่ได้ ข้อมูลยังไม่มา) }
 *  @returns {boolean} true = จบแล้ว (เปิดได้ หรือไม่มีอะไรค้าง) · false = ลองใหม่ทีหลัง */
export function reopenDialog(table){
  const rec = lsGet(OPEN_KEY());
  if (!rec || openModal) return true;
  if (Date.now() - (rec.at || 0) > OPEN_TTL || !table[rec.name]){ lsDel(OPEN_KEY()); return true; }
  let ok = false;
  try{ ok = table[rec.name](rec.args || {}) !== false; }catch(e){ console.warn('[ui] เปิดกล่องเดิมไม่ได้', e); lsDel(OPEN_KEY()); return true; }
  return ok;
}

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (asking){ asking.querySelector('[data-cfm="no"]').click(); return; }
  if (openModal) askClose();
});

export function confirmDialog({ title, message, ok = 'ยืนยัน', tone = 'btn-accent' }){
  return new Promise((res) => {
    const m = modal({
      title: esc(title),
      body: `<p class="muted">${esc(message)}</p>`,
      foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
             <button class="btn ${tone}" data-ok>${esc(ok)}</button>`,
      guard: false,                 /* กล่องนี้เป็นคำถามยืนยันอยู่แล้ว — ไม่ถามซ้อน */
      onMount(root){
        root.querySelector('[data-ok]').onclick = () => { close(); res(true); };
        root.addEventListener('click', (e) => {
          if (e.target === root || e.target.closest('[data-close]')) res(false);
        });
      },
    });
    return m;
  });
}

/* ---------- reveal ---------------------------------------- */
export function reveal(root = document){
  const items = $$('[data-reveal]', root);
  if (!items.length) return;
  if (!('IntersectionObserver' in window)){ items.forEach(i => i.classList.add('is-in')); return; }
  const io = new IntersectionObserver((es) => {
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const d = Number(e.target.dataset.reveal) || 0;
      setTimeout(() => e.target.classList.add('is-in'), d * 70);
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  items.forEach(i => io.observe(i));
}

/* ---------- รูปภาพ: ย่อก่อนเก็บ ---------------------------- */
/** อ่านไฟล์รูป → ย่อด้านยาวสุดเหลือ max px → JPEG dataURL
 *  localStorage มีเพดาน ~5MB ถ้าเก็บรูปดิบจะเต็มทันที */
export function shrinkImage(file, max = 900, quality = 0.62){
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพ'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const cv = Object.assign(document.createElement('canvas'), { width:w, height:h });
        const cx = cv.getContext('2d');
        cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        /* ด่านสุดท้าย: ไม่เกิน 300 KB เสมอ (js/imageFit.js) */
        fitDataUrl(cv.toDataURL('image/jpeg', quality)).then(resolve, reject);
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export const readAsDataURL = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(new Error('อ่านไฟล์ไม่สำเร็จ'));
  fr.readAsDataURL(file);
});

export const fmtBytes = (b) => b < 1024 ? b + ' B'
  : b < 1048576 ? (b / 1024).toFixed(0) + ' KB'
  : (b / 1048576).toFixed(1) + ' MB';

/* ---------- ลายเซ็นผู้รับ ---------------------------------- */
export function signaturePad(wrap){
  const cv = wrap.querySelector('canvas');
  const cx = cv.getContext('2d');
  let drawing = false, dirty = false;
  let sized = false;
  let pending = null;          /* ลายเซ็นเดิมที่ยังไม่ได้วาด (กู้จากงานที่บันทึกไว้) — รอ canvas มีขนาดก่อน */
  const drawPending = () => {
    const r = cv.getBoundingClientRect();
    if (!pending || !r.width) return;
    const src = pending; pending = null;
    const i = new Image(); i.onload = () => cx.drawImage(i, 0, 0, r.width, r.height); i.src = src;
  };

  function size(){
    const r = cv.getBoundingClientRect();
    /* ช่องเซ็นถูกซ่อนอยู่ (เซ็นแล้วไปถ่ายบิลต่อ) — มือถือยิง resize ตอนแถบที่อยู่เว็บหด/ขยาย
       ถ้าปรับขนาดตอนกว้าง 0 ลายเซ็นจะหายเงียบ ๆ จึงไม่แตะจนกว่าจะมองเห็นอีกครั้ง */
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const data = dirty && !pending ? cv.toDataURL() : null;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#0d1c30';
    sized = true;
    if (data){ const i = new Image(); i.onload = () => cx.drawImage(i, 0, 0, r.width, r.height); i.src = data; }
    drawPending();
  }
  const pt = (e) => {
    const r = cv.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  };
  const down = (e) => { e.preventDefault(); drawing = true; const p = pt(e); cx.beginPath(); cx.moveTo(p.x, p.y); };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pt(e); cx.lineTo(p.x, p.y); cx.stroke();
    if (!dirty){ dirty = true; wrap.classList.add('has-ink'); }
  };
  const up = () => { drawing = false; };

  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('resize', size);
  requestAnimationFrame(size);

  return {
    clear(){ cx.clearRect(0, 0, cv.width, cv.height); dirty = false; pending = null; wrap.classList.remove('has-ink'); },
    isEmpty: () => !dirty,
    /** ใส่ลายเซ็นเดิมกลับ (รูปจาก toDataURL) */
    load(url){
      if (!url) return;
      pending = url; dirty = true; wrap.classList.add('has-ink');
      if (sized) drawPending();
    },
    toDataURL(){
      if (!dirty) return null;
      if (pending) return pending;
      const out = document.createElement('canvas');
      out.width = 520; out.height = 150;
      const ox = out.getContext('2d');
      ox.fillStyle = '#fff'; ox.fillRect(0, 0, 520, 150);
      ox.drawImage(cv, 0, 0, 520, 150);
      return out.toDataURL('image/jpeg', 0.7);
    },
  };
}

/* ---------- พิกัด (กดเองเท่านั้น ไม่ขออัตโนมัติ) ------------ */
export function getGeo(){
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('อุปกรณ์นี้ไม่รองรับพิกัด'));
    navigator.geolocation.getCurrentPosition(
      p => res({ lat:+p.coords.latitude.toFixed(5), lng:+p.coords.longitude.toFixed(5), acc:Math.round(p.coords.accuracy) }),
      e => rej(new Error(e.code === 1 ? 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง' : 'อ่านตำแหน่งไม่สำเร็จ')),
      { enableHighAccuracy:true, timeout:8000, maximumAge:30000 }
    );
  });
}

/* ---------- ชิ้นส่วนที่ใช้ซ้ำหลายหน้า ---------------------- */
export const pill = (status) => {
  const m = META[status] || { label:status, tone:'grey' };
  return `<span class="pill" data-tone="${m.tone}">${esc(m.label)}</span>`;
};

/** แถบ 6 ขั้นแนวนอน
 *  opts.failLabel (หน้าติดตาม · 6 พ.ย.) = ปิดจุดแบบส่งไม่สำเร็จ → ขั้นสุดท้ายเป็นสีแดง + คำนี้แทน "ส่งมอบสำเร็จ" */
export function flowBar(shipment, opts = {}){
  const cur = stepIndex(shipment.status);
  const cancelled = shipment.status === S.CANCELLED;
  const closed = shipment.status === S.DELIVERED;
  const last = {};
  shipment.events.forEach(e => { last[e.status] = e.at; });
  return `<div class="flow">${FLOW.map((st, i) => {
    const state = (cancelled || closed) ? (i <= cur ? 'done' : 'idle')
      : i < cur ? 'done' : i === cur ? 'now' : 'idle';
    const fail = closed && opts.failLabel && st === S.DELIVERED;
    return `<div class="flow-step" data-state="${fail ? 'fail' : state}">
      <div class="flow-label">${esc(fail ? opts.failLabel : META[st].short)}</div>
      <div class="flow-time">${last[st] ? esc(fmtTime(last[st])) : '—'}</div>
    </div>`;
  }).join('')}</div>`;
}

/* ---------- แถบเดโม่ (รีเซ็ตข้อมูล) ------------------------ */
/**
 * @param {string} text
 * @param {{clear?:boolean}} opts  clear:true = เพิ่มปุ่ม "ล้างข้อมูลทั้งหมด"
 *   ใส่เฉพาะหน้าหลังบ้าน ไม่ใส่หน้าคนขับ กันกดพลาดหน้างาน
 */
export function demoBar(text = 'ข้อมูลทั้งหมดเป็นข้อมูลจำลอง เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น', opts = {}){
  /* ปุ่มล้าง/รีเซ็ตกระทบข้อมูลทั้งระบบ — เฉพาะ admin และเฉพาะโหมดทดสอบ (Emulator พอร์ต 5600)
     ระบบจริงห้ามมี: กดครั้งเดียวลบเที่ยว/จุดส่งบน Firestore จริงทั้งหมด (QA TC-132) */
  const admin = isAdmin(getSession().staff) && !!window.__FT_EMU;
  const bar = el(`
<div class="demo-bar no-print">
  <span class="sync-dot" title="ซิงก์ข้ามแท็บอัตโนมัติ"></span>
  <span class="grow">${esc(text)}</span>
  ${admin && opts.clear ? '<button class="btn btn-quiet btn-sm" data-clear>ล้างข้อมูลทั้งหมด</button>' : ''}
  ${admin ? '<button class="btn btn-quiet btn-sm" data-reset>รีเซ็ตข้อมูลเดโม่</button>' : ''}
</div>`);

  bar.querySelector('[data-clear]')?.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title:'ล้างข้อมูลทั้งหมด',
      message:'งานขนส่ง รูปถ่าย และประวัติทั้งหมดจะถูกลบ — รายชื่อคนขับเก็บไว้เหมือนเดิม ย้อนกลับไม่ได้ ถ้าอยากได้ข้อมูลตัวอย่างคืนให้กด “รีเซ็ตข้อมูลเดโม่”',
      ok:'ล้างเลย',
      tone:'btn-danger',
    });
    if (!ok) return;
    /* ล้างเฉพาะงาน ไม่แตะทะเบียนคนขับ — ของเดิมใช้ wipe() ซึ่งลบคนขับทิ้งไปด้วย
       ทั้งในเครื่องและบนคลาวด์ ทำให้หน้าคนขับว่างทุกครั้งที่กดปุ่มนี้ */
    wipeJobs();
    toast('ล้างงานแล้ว — รายชื่อคนขับยังอยู่ครบ', 'ok');
    setTimeout(() => location.reload(), 500);
  });
  if (admin) bar.querySelector('[data-reset]').onclick = async () => {
    const ok = await confirmDialog({
      title:'รีเซ็ตข้อมูลเดโม่',
      message:'งานขนส่ง รูปถ่าย และประวัติทั้งหมดจะถูกแทนที่ด้วยชุดตัวอย่างเริ่มต้น — รายชื่อคนขับเก็บไว้เหมือนเดิม ใช้ก่อนเริ่มพรีเซนต์รอบใหม่',
      ok:'รีเซ็ตเลย',
    });
    if (!ok) return;
    resetDemo();
    toast('รีเซ็ตข้อมูลเดโม่เรียบร้อย', 'ok');
    setTimeout(() => location.reload(), 500);
  };
  return bar;
}

/* ---------- shell ----------------------------------------- */
/** nav:false = ไม่แสดงเมนูหลังบ้าน ใช้กับหน้าที่เปิดจากลิงก์ภายนอก
 *  picker:true = แสดงปุ่ม "กลับไปหน้าเลือกผู้ใช้" แม้ไม่ได้ล็อกอิน (หน้าติดตามพัสดุที่เข้าจากหน้าเลือกฝั่ง) */
export function shell({ role = '', nav = true, picker = false } = {}){
  header(role, { nav, picker });
  reveal();
  pageReady();
  return { toast, modal, close };
}


/* ---------- แถบความคืบหน้าตอนวางไฟล์ ------------------------
   วัดไบต์ที่อัปโหลดจริงไม่ได้ — ถ้าฟังความคืบหน้าการอัปโหลด เบราว์เซอร์จะยิงคำขอ preflight
   ซึ่ง Apps Script ไม่ตอบ แล้วการส่งไฟล์จะพังทั้งหมด
   จึงแบ่งเป็นขั้น ๆ ให้เห็นว่ากำลังทำอะไรอยู่ ช่วงที่รอเซิร์ฟเวอร์ แถบจะค่อย ๆ ไหลไปเอง
   แต่ไม่ถึงปลายขั้นจนกว่าขั้นนั้นจะเสร็จจริง */
/**
 * @param {HTMLElement} host  กล่องที่จะวางแถบลงไป (เนื้อหาเดิมถูกแทนที่)
 * @param {{title:string, steps:string[]}} opts
 */
export function progressBox(host, { title, steps }){
  host.innerHTML = `
    <div class="upbox" role="status" aria-live="polite">
      <div class="upbox-head">
        <span class="upbox-spin" aria-hidden="true"></span>
        <span class="small strong trunc grow" data-title>${esc(title)}</span>
        <span class="tiny mono dim" data-pct>0%</span>
      </div>
      <div class="upbox-road" aria-hidden="true"><span class="upbox-truck">${TRUCK}</span></div>
      <div class="upbox-bar"><i></i></div>
      <div class="upbox-steps">${steps.map((t, i) => `<span data-step="${i}">${i + 1}. ${esc(t)}</span>`).join('')}</div>
      <div class="tiny dim" data-note style="margin-top:6px"></div>
    </div>`;
  const box  = host.querySelector('.upbox');
  const bar  = box.querySelector('.upbox-bar i');
  const truck = box.querySelector('.upbox-truck');
  const pctEl = box.querySelector('[data-pct]');
  const note = box.querySelector('[data-note]');
  let pct = 0, timer = null;

  const set = (v) => {
    pct = Math.max(pct, Math.min(100, v));
    bar.style.width = pct + '%';
    truck.style.left = `clamp(12px, ${pct}%, calc(100% - 12px))`;
    pctEl.textContent = Math.round(pct) + '%';
  };
  const stop = () => { clearInterval(timer); timer = null; };

  return {
    /** เข้าขั้นที่ i — แถบกระโดดไปที่ from แล้วค่อย ๆ ไหลเข้าหา to (ไม่ถึง) ระหว่างรอ */
    step(i, from, to, text = ''){
      stop();
      box.querySelectorAll('[data-step]').forEach(s => {
        const k = +s.dataset.step;
        s.className = k < i ? 'ok' : k === i ? 'on' : '';
      });
      note.textContent = text;
      set(from);
      if (to > from){
        timer = setInterval(() => set(pct + (to - pct) * 0.06), 250);
      }
    },
    /** ความคืบหน้าจริงภายในขั้น (0–1) เช่น ตอนอ่านไฟล์ */
    within(from, to, frac){ set(from + (to - from) * frac); },
    done(text = 'เสร็จแล้ว'){
      stop(); set(100);
      box.classList.add('is-done');
      box.querySelectorAll('[data-step]').forEach(s => { s.className = 'ok'; });
      note.textContent = text;
    },
    fail(text){
      stop();
      box.classList.add('is-fail');
      note.textContent = text || 'ไม่สำเร็จ';
    },
  };
}

/** รถบรรทุกเล็ก ๆ วิ่งบนแถบความคืบหน้า — ใช้ currentColor เปลี่ยนสีตามสถานะ */
const TRUCK = `<svg width="24" height="16" viewBox="0 0 24 16" fill="currentColor">
  <rect x="0.5" y="2" width="13.5" height="9" rx="1.6"/>
  <path d="M14.8 5h4.3l3.4 3.6V11H14.8z"/>
  <circle cx="5" cy="12.8" r="2.3" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/>
  <circle cx="18.3" cy="12.8" r="2.3" fill="var(--surface)" stroke="currentColor" stroke-width="1.6"/>
</svg>`;


/* ---------- เบอร์โทร: กดแล้วขยายขึ้นมา คัดลอกได้ + โทรเลย (ผู้ใช้สั่ง 27 ต.ค. 2026) ----------
   ทุกลิงก์ tel: ในแอป (หน้าคนขับ/ผู้ช่วย · หน้าติดตามพัสดุ) ไม่โทรออกทันที — เปิดหน้าต่างเบอร์ตัวใหญ่แทน
   data-tel-label="สำนักงาน" = ชื่อบนหัวหน้าต่าง · data-tel-direct = โทรเลยไม่ต้องเปิดหน้าต่าง (ปุ่มที่อยู่ในหน้าต่างนี้เอง) */
/** 0812345678 → 081-234-5678 · 020000000 → 02-000-0000 */
export const fmtPhone = (p) => {
  const d = String(p || '').replace(/[^0-9]/g, '');
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
    : d.length === 9 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : String(p || '');
};

/** คัดลอกลงคลิปบอร์ด — มือถือบางรุ่น/เปิดผ่าน http ไม่มี clipboard API ใช้วิธีเลือกข้อความแทน */
export async function copyText(text, what){
  try{
    if (!navigator.clipboard?.writeText) throw new Error('no-clipboard');
    await navigator.clipboard.writeText(text);
  }catch{
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try{ ok = document.execCommand('copy'); }catch{}
    ta.remove();
    if (!ok) return toast('คัดลอกไม่ได้ — กดค้างที่เบอร์แล้วเลือก "คัดลอก" เอง', 'warn', 5000);
  }
  toast(`คัดลอก${what}แล้ว — ไปกดค้างแล้ว "วาง" ในแอปอื่นได้เลย`, 'ok', 3500);
}

/** หน้าต่างเบอร์โทร — เบอร์ตัวใหญ่ (เลือกคัดลอกเองก็ได้) + 📋 คัดลอกเบอร์ + 📞 โทรเลย */
export function phoneDialog(num, label = ''){
  const raw = String(num || '').replace(/[^0-9+]/g, '');
  if (!raw) return;
  const shown = fmtPhone(raw);
  modal({
    title: `📞 ${esc(label || 'เบอร์โทร')}`,
    body: `<p class="tel-big" aria-label="เบอร์โทร">${esc(shown)}</p>`,
    foot: `<button type="button" class="btn btn-ghost" data-tel-copy>📋 คัดลอกเบอร์</button>
           <a class="btn btn-accent" href="tel:${esc(raw)}" data-tel-direct>📞 โทรเลย</a>`,
    onMount(root){
      root.querySelector('[data-tel-copy]').onclick = () => copyText(shown, `เบอร์ ${shown}`);
    },
  });
}

/* ดักทุกลิงก์ tel: ของหน้า — รวมที่วาดทีหลัง (ฟังที่ document) · ปุ่มที่ติด data-tel-direct โทรออกตามปกติ */
if (typeof document !== 'undefined'){
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href^="tel:"]');
    if (!a || a.hasAttribute('data-tel-direct') || e.defaultPrevented) return;
    e.preventDefault();
    const label = a.dataset.telLabel || '';
    phoneDialog(a.getAttribute('href').slice(4), label);
  });
}
