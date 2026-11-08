/* ============================================================
   practice/practice.js — แบบฝึกคนขับ (practice.html)

   จำลองหน้าคนขับ (driver.html) ทั้งขั้นตอน ด้วยงานที่สุ่มขึ้นมาเอง (practice/gen.js)
   ส่งครบเที่ยวแล้วได้เที่ยวใหม่ต่อ ฝึกซ้ำได้ไม่จำกัด

   กฎเหล็ก: ห้ามแตะระบบจริงแม้แต่นิดเดียว
     · ไม่ import อะไรจาก js/*.js ของระบบจริง — ไฟล์นี้กับ gen.js อยู่กันเองสองไฟล์
     · ไม่เขียน localStorage / sessionStorage / IndexedDB — ข้อมูลอยู่ในหน่วยความจำของแท็บนี้เท่านั้น
       ปิดหรือรีเฟรชหน้า = เริ่มใหม่ (ห้ามใช้คีย์ร่วมกับแอปจริงบนมือถือคนขับ)
     · ไม่ fetch / ไม่ส่งอะไรออกนอกเครื่อง — practice.html มี CSP connect-src 'none' กันไว้อีกชั้น
     · พิกัดเป็นค่าจำลอง (ไม่เรียก GPS) · ไม่มีเบอร์โทรในงานปลอม
   หน้าตาใช้ CSS ของหน้าคนขับจริง (อ่านอย่างเดียว) ให้คนฝึกเห็นภาพเดียวกับของจริง
   ============================================================ */

import { makeTrip, driverProfile, uid, rnd } from './gen.js';

/* ---------- ขั้นของเที่ยว (เหมือน store.js FLOW ของจริง) ---------- */
const FLOW = ['new', 'received', 'loaded', 'departed', 'delivered'];
const STEP = {
  new:       { label:'รอรับเข้าคลัง',  short:'รอรับเข้าคลัง', word:'รอของ',    tone:'wait' },
  received:  { label:'รับเข้าคลังแล้ว', short:'อยู่ในคลัง',   word:'ของพร้อม', tone:'ware' },
  loaded:    { label:'ขึ้นรถแล้ว',      short:'ขึ้นรถแล้ว',    word:'ขึ้นรถ',   tone:'ware', verb:'ยืนยันแพ็คขึ้นรถครบ',
               desc:'คนขับตรวจนับของทั้งเที่ยวและถ่ายรูปรอบคันก่อนออกเดินทาง', note:'ตรวจนับครบ ล็อกตู้เรียบร้อย' },
  departed:  { label:'ออกจากคลัง',      short:'กำลังเดินทาง',  word:'กำลังส่ง', tone:'move', verb:'ยืนยันออกจากคลัง',
               desc:'รถออกจากคลังต้นทาง เริ่มจับเวลาเดินทาง', note:'ออกจากคลังแล้ว' },
  delivered: { label:'ส่งมอบสำเร็จ',    short:'ส่งมอบสำเร็จ',  word:'ส่งแล้ว',  tone:'done' },
};
const nextOf = (st) => { const i = FLOW.indexOf(st); return i < 0 || i === FLOW.length - 1 ? null : FLOW[i + 1]; };
const OUTCOMES = { ok:'ส่งเรียบร้อย', refused:'ลูกค้าไม่รับของ', returned:'คืนสินค้า', closed:'ร้านปิด', other:'อื่น ๆ' };
const isFail = (o) => !!o && o !== 'ok' && o in OUTCOMES;
const MIN = { loaded: 2, cargo: 2, fail: 1, inv: 1 };
const PHOTO_GUIDE = {
  loaded: ['สินค้าบนรถ มุมท้ายรถ (ให้เห็นของทั้งหมด)', 'สินค้าบนรถ มุมข้างรถ'],
  cargo:  ['สินค้าที่ลงจุดนี้ ให้เห็นของทั้งหมด', 'สินค้าที่ลงจุดนี้ อีกมุมหนึ่ง'],
};
const INVOICE_GUIDE = [
  'ถ่ายเฉพาะเลขที่บิล เท่านั้น — ไม่ใช่รูปสินค้า',
  'วางบนพื้นเรียบ ให้เห็นครบทั้ง 4 มุม ไม่มีนิ้วบัง',
  'ถือให้นิ่ง ตัวหนังสืออ่านออก ไม่มีแสงสะท้อน',
];

/* ---------- สถานะทั้งหมด (หน่วยความจำเท่านั้น) ---------- */
const me = driverProfile();
const state = {
  trips: [makeTrip(), makeTrip()],
  stats: { startedAt: Date.now(), trips: 0, ok: 0, fail: 0, photos: 0 },
};
const OPEN_TRIPS = 2;          /* ปิดเที่ยวไป 1 = สุ่มเที่ยวใหม่มาแทน ให้มีงานรอเสมอ */
const drafts = new Map();      /* งานส่งของที่ทำค้างในหน้าต่าง (ปิดหน้าต่างแล้วเปิดใหม่ทำต่อได้ เหมือนของจริง) */

/* ---------- เครื่องมือเล็ก ๆ ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const fmtNum = (n) => Number(n || 0).toLocaleString('th-TH');
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())} น.`; };
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'เมื่อสักครู่' : m < 60 ? `${m} นาทีที่แล้ว` : `${Math.floor(m / 60)} ชม. ${m % 60} นาทีที่แล้ว`;
};
const mins = (ms) => { const m = Math.max(1, Math.round(ms / 60000)); return m < 60 ? `${m} นาที` : `${Math.floor(m / 60)} ชม. ${m % 60} นาที`; };
function el(html){ const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
function on(root, evt, sel, fn){ root.addEventListener(evt, (e) => { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); }); }

function toast(msg, kind = 'info', ms = 3400){
  let box = $('#toasts');
  if (!box){ box = el('<div id="toasts"></div>'); document.body.appendChild(box); }
  const t = el(`<div class="toast" data-kind="${kind}" role="status">${esc(msg)}</div>`);
  box.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, ms);
}

/* ฉลองตอนส่งสำเร็จ — markup เดียวกับ motion.js celebrate (ใช้ CSS .celebrate ของ app.css) */
function celebrate(title, sub = '', { big = false } = {}){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const n = big ? 18 : 12;
  const dots = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * .3;
    const d = (big ? 92 : 74) + Math.random() * 26;
    const c = ['var(--amber)', 'var(--green)', 'var(--blue)', 'var(--amber-dim)'][i % 4];
    return `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;background:${c}"></i>`;
  }).join('');
  const wrap = el(`
<div class="celebrate" aria-hidden="true">
  <div class="celebrate-card">
    <div class="celebrate-mark">
      <span class="celebrate-ring"></span>
      <svg viewBox="0 0 52 52" width="58" height="58">
        <circle cx="26" cy="26" r="23" fill="none" stroke="var(--green)" stroke-width="3" pathLength="1" class="c-circle"/>
        <path d="M15 27 l7.5 7.5 L37.5 19" fill="none" stroke="var(--green)" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" pathLength="1" class="c-check"/>
      </svg>
      <span class="celebrate-dots">${dots}</span>
    </div>
    <div class="celebrate-title">${esc(title)}</div>
    ${sub ? `<div class="celebrate-sub">${esc(sub)}</div>` : ''}
  </div>
</div>`);
  document.body.appendChild(wrap);
  const bye = () => { if (wrap.isConnected) wrap.animate([{ opacity:1 }, { opacity:0 }], { duration:260 }).onfinish = () => wrap.remove(); };
  wrap.addEventListener('click', bye);
  setTimeout(bye, big ? 2000 : 1600);
}

/* ---------- หน้าต่าง (modal) — โครงเดียวกับ ui.js ของจริง ----------
   ปิดด้วยมือ (× · ยกเลิก · แตะนอกกล่อง · ปุ่มย้อนกลับมือถือ) = ถามยืนยันก่อน */
let openModal = null, openMeta = null, skipPop = 0;
function modal({ title = '', body = '', foot = '', onMount, guard = true, onUserClose = null } = {}){
  const replacing = !!openModal;
  close({ replaced: true });
  const scrim = el(`
<div class="scrim" role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-head">
      <h3 class="grow" style="font-size:16.5px">${title}</h3>
      <button class="icon-btn" data-close aria-label="ปิด">×</button>
    </div>
    <div class="modal-body">${body}</div>
    ${foot ? `<div class="modal-foot">${foot}</div>` : ''}
  </div>
</div>`);
  scrim.addEventListener('click', (e) => {
    const x = e.target === scrim || e.target.closest('[data-close]');
    if (!x || (x !== scrim && x.disabled)) return;
    e.stopImmediatePropagation(); e.preventDefault();
    guard ? askClose() : close({ user: true });
  }, true);
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
  openModal = scrim;
  openMeta = { guard, onUserClose };
  if (!replacing) history.pushState({ ...(history.state || {}), pm: 1 }, '');
  onMount?.(scrim);
  return scrim;
}
function askClose(){
  if (!openModal || $('.confirm-scrim')) return;
  if (!openMeta?.guard) return close({ user: true });
  const box = el(`
<div class="confirm-scrim" role="alertdialog" aria-modal="true">
  <div class="confirm-box">
    <h3>ยืนยัน</h3>
    <p>ต้องการปิดหน้าต่างนี้ใช่ไหม?<br><span class="dim">ที่ทำไว้ยังอยู่ เปิดกลับมาทำต่อได้ (จนกว่าจะปิดหน้าแบบฝึก)</span></p>
    <div class="confirm-acts">
      <button type="button" class="btn btn-ghost" data-cfm="no">ยกเลิก</button>
      <button type="button" class="btn btn-accent" data-cfm="yes">ยืนยัน</button>
    </div>
  </div>
</div>`);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cfm]');
    if (!b && e.target !== box) return;
    box.remove();
    if (b?.dataset.cfm === 'yes') close({ user: true });
  });
  document.body.appendChild(box);
  box.querySelector('[data-cfm="no"]').focus();
}
function close({ user = false, replaced = false, fromPop = false } = {}){
  if (!openModal) return;
  const meta = openMeta;
  $('.confirm-scrim')?.remove();
  openModal.remove();
  openModal = null; openMeta = null;
  document.body.style.overflow = '';
  if (!replaced && !fromPop && history.state?.pm){ skipPop++; history.back(); }
  if (user) try{ meta?.onUserClose?.(); }catch(e){ console.error(e); }
}
function confirmBox({ title, message, ok = 'ยืนยัน' }){
  return new Promise((res) => {
    const box = el(`
<div class="confirm-scrim" role="alertdialog" aria-modal="true">
  <div class="confirm-box">
    <h3>${esc(title)}</h3>
    <p>${message}</p>
    <div class="confirm-acts">
      <button type="button" class="btn btn-ghost" data-cfm="no">ยกเลิก</button>
      <button type="button" class="btn btn-accent" data-cfm="yes">${esc(ok)}</button>
    </div>
  </div>
</div>`);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cfm]');
      if (!b && e.target !== box) return;
      box.remove(); res(b?.dataset.cfm === 'yes');
    });
    document.body.appendChild(box);
  });
}

/* ---------- รูปถ่าย: ย่อในเครื่อง เก็บเป็น dataURL ในหน่วยความจำ ---------- */
function shrinkImage(file, max = 720, q = 0.6){
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('ไฟล์นี้ไม่ใช่รูปภาพ'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปไม่สำเร็จ')); };
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const cv = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * s), height: Math.round(img.height * s) });
      const cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg', q));
    };
    img.src = url;
  });
}

/* ---------- ลายเซ็น — เหมือน ui.js signaturePad ---------- */
function signaturePad(wrap){
  const cv = wrap.querySelector('canvas');
  const cx = cv.getContext('2d');
  let drawing = false, dirty = false, pending = null;
  const drawPending = () => {
    const r = cv.getBoundingClientRect();
    if (!pending || !r.width) return;
    const src = pending; pending = null;
    const i = new Image(); i.onload = () => cx.drawImage(i, 0, 0, r.width, r.height); i.src = src;
  };
  function size(){
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const data = dirty && !pending ? cv.toDataURL() : null;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx.lineWidth = 2.2; cx.lineCap = 'round'; cx.lineJoin = 'round'; cx.strokeStyle = '#0d1c30';
    if (data){ const i = new Image(); i.onload = () => cx.drawImage(i, 0, 0, r.width, r.height); i.src = data; }
    drawPending();
  }
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); drawing = true; const p = pt(e); cx.beginPath(); cx.moveTo(p.x, p.y); });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = pt(e); cx.lineTo(p.x, p.y); cx.stroke();
    if (!dirty){ dirty = true; wrap.classList.add('has-ink'); }
  });
  addEventListener('pointerup', () => { drawing = false; });
  addEventListener('resize', size);
  requestAnimationFrame(size);
  return {
    clear(){ cx.clearRect(0, 0, cv.width, cv.height); dirty = false; pending = null; wrap.classList.remove('has-ink'); },
    isEmpty: () => !dirty,
    load(url){ if (!url) return; pending = url; dirty = true; wrap.classList.add('has-ink'); drawPending(); },
    toDataURL(){
      if (!dirty) return null;
      if (pending) return pending;
      const out = Object.assign(document.createElement('canvas'), { width: 520, height: 150 });
      const ox = out.getContext('2d');
      ox.fillStyle = '#fff'; ox.fillRect(0, 0, 520, 150);
      ox.drawImage(cv, 0, 0, 520, 150);
      return out.toDataURL('image/jpeg', 0.7);
    },
  };
}

/* ตำแหน่งจำลอง — ไม่เรียก GPS จริง (ไม่ต้องขออนุญาต ไม่มีอะไรออกนอกเครื่อง) */
const fakeGeo = () => new Promise(res => setTimeout(() => res({
  lat: +(13.4 + Math.random() * .9).toFixed(5), lng: +(100.4 + Math.random() * 1.1).toFixed(5), acc: rnd(5, 25),
}), 700));

/* ---------- ไอคอน / ป้าย (ชุดเดียวกับ driver.js) ---------- */
const SVG = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TRUCK = SVG('<path d="M1 4h14v12H1zM15 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>');
const PILL_ICON = {
  new:       SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  received:  SVG('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  loaded:    TRUCK,
  departed:  TRUCK,
  delivered: SVG('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
};
const PILL_TEXT = { new:'รอของ', received:'ของพร้อม', loaded:'ขึ้นรถแล้ว', departed:'กำลังส่ง', delivered:'ส่งแล้ว' };
const ICON = {
  ticket: SVG('<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 3"/>'),
  pin:    SVG('<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  weight: SVG('<path d="M6 8h12l3 13H3z"/><circle cx="12" cy="5" r="2.5"/>'),
  truck:  TRUCK,
  plate:  SVG('<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10.5h4M6 13.5h7M15.5 10.5h2.5v3h-2.5z"/>'),
};
const CHECK = SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
const TONE = { loaded:'amber', departed:'blue' };
const drvPill = (st) => `<span class="pill pill-drv" data-tone="${STEP[st].tone}" title="${esc(STEP[st].label)}">${PILL_ICON[st]}${esc(PILL_TEXT[st])}</span>`;
const drvFlow = (j) => {
  const cur = FLOW.indexOf(j.step);
  const closed = j.step === 'delivered';
  return `<div class="dflow" role="list">${FLOW.map((st, i) => {
    const s = (closed || i < cur) ? 'done' : i === cur ? 'now' : 'idle';
    return `<div class="dflow-step" data-state="${s}" role="listitem"><span class="dflow-dot">${s === 'done' ? CHECK : PILL_ICON[st]}</span><span class="dflow-label">${esc(STEP[st].word)}</span></div>`;
  }).join('')}</div>`;
};
const roleChip = () => `<p class="drv-role">${ICON.truck}หน้าคนขับ · <b>โหมดฝึก</b></p>`;
const failTag = (x) => `<span class="tiny strong" style="color:var(--red);white-space:nowrap">✕ ${esc(OUTCOMES[x.proof?.outcome] || 'ส่งไม่สำเร็จ')}</span>`;

/* ---------- ข้อมูลที่คำนวณจากเที่ยว ---------- */
const getTrip = (id) => state.trips.find(t => t.id === id);
const isOpenTrip = (j) => j.step !== 'delivered';
const live = (stops) => stops.filter(x => x.status === 'open');
const tripKg = (j) => j.stops.reduce((a, x) => a + x.weightKg, 0);
const shops = (j) => new Set(j.stops.map(x => x.shop)).size;
function groups(stops){
  const m = new Map();
  for (const x of stops){ if (!m.has(x.shop)) m.set(x.shop, { key: x.shop, stops: [] }); m.get(x.shop).stops.push(x); }
  return [...m.values()];
}
const shopBills = (x) => getTrip(x.tripId)?.stops.filter(b => b.shop === x.shop) || [x];

/* ============================================================
   หน้าจอ
   ============================================================ */
const app = $('#app');
let view = { name: 'list' };
let listTab = null, tripTab = null;
const openGroups = new Set();

function go(v){
  view = v;
  if (v.name === 'trip'){ tripTab = null; history.pushState({ pv: 'trip' }, ''); }
  render();
  scrollTo(0, 0);
}
/* ทุกจุดส่งรู้ว่าอยู่เที่ยวไหน (ใช้หาบิลร้านเดียวกัน) — เที่ยวใหม่เข้ามาได้หลายทาง จึงใส่ทุกครั้งก่อนวาด */
const tagStops = () => state.trips.forEach(j => j.stops.forEach(x => { x.tripId = j.id; }));
function render(){
  tagStops();
  if (view.name === 'trip' && getTrip(view.id)) tripView(getTrip(view.id));
  else { view = { name: 'list' }; listView(); }
}

/* ---------- ปุ่มย้อนกลับของมือถือ: ปิดหน้าต่าง → กลับรายการเที่ยว ---------- */
addEventListener('popstate', () => {
  if (skipPop){ skipPop--; return; }
  if (openModal){ close({ fromPop: true, user: true }); return; }
  if (view.name === 'trip'){ view = { name: 'list' }; render(); }
});

/* ---------- รายการเที่ยว ---------- */
function listView(){
  const open = state.trips.filter(isOpenTrip);
  const closed = state.trips.filter(j => !isOpenTrip(j));
  const failJ = closed.filter(j => j.stops.some(x => x.status === 'fail'));
  const okJ = closed.filter(j => !j.stops.some(x => x.status === 'fail'));
  const stopsLeft = open.reduce((a, j) => a + live(j.stops).length, 0);
  const tab = listTab || 'open';
  const shown = tab === 'fail' ? failJ : okJ;
  const s = state.stats;
  app.innerHTML = `
<div class="driver-card" style="margin-top:14px">
  <div class="driver-hero">
    <div class="row between" style="align-items:flex-start">
      <div>
        ${roleChip()}
        <h2 style="margin-top:6px;font-size:21px">${esc(me.name)}</h2>
      </div>
      <a class="btn btn-sm" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2)" href="index-staff.html">ออกจากแบบฝึก</a>
    </div>
    <div class="drv-kpis">
      <div class="drv-kpi drv-kpi-plate" title="ทะเบียนรถ">
        <span class="drv-kpi-ic">${ICON.plate}</span>
        <span class="drv-kpi-tx"><span class="drv-kpi-l">ทะเบียนรถ (สมมติ)</span><span><b>${esc(me.plate)}</b> <small>${esc(me.truck)}</small></span></span>
      </div>
      <div class="drv-kpi${open.length ? '' : ' is-zero'}">
        <span class="drv-kpi-ic">${ICON.truck}</span>
        <span class="drv-kpi-tx"><span class="drv-kpi-l">เที่ยวค้าง</span><span><b>${fmtNum(open.length)}</b> <small>เที่ยว</small></span></span>
      </div>
      <div class="drv-kpi is-hot${stopsLeft ? '' : ' is-zero'}">
        <span class="drv-kpi-ic">${ICON.pin}</span>
        <span class="drv-kpi-tx"><span class="drv-kpi-l">จุดต้องส่ง</span><span><b>${fmtNum(stopsLeft)}</b> <small>จุด</small></span></span>
      </div>
    </div>
  </div>

  <div class="drv-list-body" style="padding:14px;background:var(--bg)">
    <div class="pr-score">
      <p class="pr-score-h">🎓 ผลการฝึกของคุณ <span class="tiny dim">· ฝึกมาแล้ว ${esc(mins(Date.now() - s.startedAt))}</span></p>
      <div class="pr-score-grid">
        <div><b>${fmtNum(s.trips)}</b><span>เที่ยวที่ปิด</span></div>
        <div><b style="color:var(--green)">${fmtNum(s.ok)}</b><span>บิลส่งสำเร็จ</span></div>
        <div><b style="color:var(--red)">${fmtNum(s.fail)}</b><span>บิลส่งไม่สำเร็จ</span></div>
        <div><b>${fmtNum(s.photos)}</b><span>รูปที่ถ่าย</span></div>
      </div>
    </div>
    <div class="drv-tabs" role="tablist">
      ${[['open', 'รอส่ง', open.length], ['ok', 'ส่งสำเร็จ', okJ.length], ['fail', 'ส่งไม่สำเร็จ', failJ.length]].map(([k, label, n]) => `
      <button type="button" role="tab" aria-selected="${k === tab}" data-tab="list:${k}"${k === 'fail' && n ? ' data-fail' : ''}>${label} <b>${fmtNum(n)}</b></button>`).join('')}
    </div>
    ${tab !== 'open' ? (shown.length ? `
      <p class="drv-hint">${tab === 'fail' ? 'เที่ยวที่มีจุดส่งไม่สำเร็จ — แตะเพื่อดูว่าจุดไหน' : 'แตะเที่ยวเพื่อดูหลักฐานแต่ละจุด'}</p>
      <div class="drv-jobs">${shown.slice().reverse().map(tripCard).join('')}</div>` : `
      <div class="empty"><p class="small">${tab === 'fail' ? 'ไม่มีเที่ยวที่ส่งไม่สำเร็จ' : 'ยังไม่มีเที่ยวที่ส่งสำเร็จครบ'}</p></div>`)
    : `<p class="drv-hint">👇 แตะเที่ยวด้านล่าง เพื่อเริ่มงาน</p>
      <div class="drv-jobs">${open.map(tripCard).join('')}</div>`}
    <button type="button" class="btn btn-ghost btn-block" style="margin-top:14px" data-reset>🎲 สุ่มงานชุดใหม่ทั้งหมด</button>
  </div>
</div>`;
}

function tripCard(j){
  const next = nextOf(j.step);
  const total = j.stops.length;
  const done = total - live(j.stops).length;
  const nFail = j.stops.filter(x => x.status === 'fail').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  return `
<div class="job-card" data-trip="${j.id}" data-active="${isOpenTrip(j) ? 1 : 0}" style="margin-bottom:10px">
  <div class="row between gap-8">
    <span class="code">เที่ยว ${esc(j.code)}</span>
    ${drvPill(j.step)}
  </div>
  <div style="margin-top:10px">
    <div class="strong" style="font-size:17px">${fmtNum(total)} จุดส่ง · ${fmtNum(shops(j))} ปลายทาง</div>
    <div class="tiny dim">${esc(j.vehicle)} · ${fmtNum(Math.round(tripKg(j)))} กก.</div>
    ${j.note ? `<div class="drv-note" data-jobnote="${j.id}" role="button" tabindex="0"><span class="drv-note-tx">📝 ${esc(j.note)}</span><span class="drv-note-more">แตะเพื่อดูเต็ม →</span></div>` : ''}
  </div>
  <div class="tripbar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
  <div class="tiny dim" style="margin-top:4px">ส่งแล้ว ${fmtNum(done)}/${fmtNum(total)} จุด${nFail ? ` · <b style="color:var(--red)">ส่งไม่สำเร็จ ${fmtNum(nFail)} จุด</b>` : ''}</div>
  <div class="row between gap-8" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
    <span class="tiny dim">${esc(ago(j.updatedAt))}</span>
    ${next && next !== 'delivered'
      ? `<span class="tiny strong" style="color:var(--amber-dim)">ถัดไป: ${esc(STEP[next].short)} →</span>`
      : isOpenTrip(j) ? `<span class="tiny strong" style="color:var(--amber-dim)">เหลือส่ง ${fmtNum(live(j.stops).length)} จุด →</span>` : ''}
  </div>
</div>`;
}

/* ---------- ใบงานของเที่ยว ---------- */
function tripView(j){
  const next = nextOf(j.step);
  const canDeliver = FLOW.indexOf(j.step) >= FLOW.indexOf('departed');
  const g = groups(j.stops);
  const part = (f) => g.map(x => ({ ...x, stops: x.stops.filter(f) })).filter(x => x.stops.length);
  const todo = part(x => x.status === 'open');
  const okG = part(x => x.status === 'ok');
  const failG = part(x => x.status === 'fail');
  const tab = tripTab || (todo.length ? 'todo' : failG.length ? 'fail' : 'ok');
  const doneG = tab === 'fail' ? failG : okG;
  const row = (x, i) => x.stops.length > 1 ? groupRow(x, i, canDeliver) : stopRow(x.stops[0], i, canDeliver);

  app.innerHTML = `
<div style="margin:14px 0">
  <button class="btn" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);font-size:20px;font-weight:600;padding:12px 24px;min-height:52px;gap:6px;padding-left:16px" data-back aria-label="กลับไปรายการเที่ยว"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>กลับ</button>
</div>
<div class="driver-card">
  <div class="driver-hero">
    ${roleChip()}
    <div class="row between gap-8" style="align-items:center;flex-wrap:wrap;row-gap:10px;margin-top:10px">
      <span class="dhero-code" title="เลขเที่ยว">${ICON.ticket}${esc(j.code)}</span>
      ${drvPill(j.step)}
    </div>
    <div class="dhero-stats">
      <div class="dhero-stat" title="จำนวนจุดส่ง">${ICON.pin}<b>${fmtNum(j.stops.length)}</b><span>จุด</span></div>
      <div class="dhero-stat" title="น้ำหนักรวม">${ICON.weight}<b>${fmtNum(Math.round(tripKg(j)))}</b><span>กก.</span></div>
    </div>
    <p class="dhero-meta" title="รถ">${ICON.truck}${esc(j.vehicle)}</p>
    ${j.note ? `<div class="drv-note" data-jobnote="${j.id}" role="button" tabindex="0"><span class="drv-note-tx">📝 ${esc(j.note)}</span><span class="drv-note-more">แตะเพื่อดูเต็ม →</span></div>` : ''}
  </div>

  <div class="drv-trip-body" style="padding:16px">
    ${drvFlow(j)}
    <div class="drv-trip">
    <div class="drv-main">
    <hr class="divider" style="margin:18px 0">
    <h4 style="margin-bottom:6px">จุดส่ง ${fmtNum(j.stops.length)} จุด</h4>
    <p class="drv-hint" style="margin-bottom:12px">
      ${canDeliver ? '👇 แตะชื่อจุดที่จะส่ง → ถ่ายรูป → ให้ผู้รับเซ็น → ถ่ายเลขที่บิล'
        : `กดปุ่มด้านล่างให้ครบก่อน (${esc(STEP.loaded.verb)} → ${esc(STEP.departed.verb)}) แล้วจึงส่งของได้`}
    </p>
    <div class="drv-tabs" role="tablist">
      ${[['todo', 'รอส่ง', todo.length], ['ok', 'ส่งสำเร็จ', okG.length], ['fail', 'ส่งไม่สำเร็จ', failG.length]].map(([k, label, n]) => `
      <button type="button" role="tab" aria-selected="${k === tab}" data-tab="trip:${k}"${k === 'fail' && n ? ' data-fail' : ''}>${label} <b>${fmtNum(n)}</b></button>`).join('')}
    </div>
    ${tab !== 'todo'
      ? (doneG.length ? `<p class="drv-hint">แตะ “ดูหลักฐาน” เพื่อเช็คว่าทำครบไหม (รูป · ลายเซ็น · เลขที่บิล · ตำแหน่ง)</p>
         ${doneG.map((x, i) => `<div class="drv-done-item">${row(x, i)}<div class="drv-proof-acts"><button type="button" class="btn btn-ghost btn-sm drv-proof-btn" data-proof="${x.stops[0].id}">🔍 ดูหลักฐาน${x.stops.length > 1 ? ` ${fmtNum(x.stops.length)} บิล` : ''}</button></div></div>`).join('')}`
         : `<div class="empty"><p class="small">${tab === 'fail' ? 'ไม่มีจุดที่ส่งไม่สำเร็จ' : 'ยังไม่มีจุดที่ส่งสำเร็จ'}</p></div>`)
      : todo.length ? todo.map(row).join('')
      : '<div class="empty"><div class="empty-mark">✅</div><p class="small">ไม่มีจุดรอส่งแล้ว — ดูผลในแท็บ “ส่งสำเร็จ” / “ส่งไม่สำเร็จ”</p></div>'}
    </div>
    <div class="drv-side">
    <hr class="divider" style="margin:18px 0">
    <h4 style="margin-bottom:12px">ประวัติเที่ยวนี้</h4>
    ${timeline(j)}
    </div>
    </div>
  </div>
</div>

${next && next !== 'delivered' ? `
<div class="action-bar">
  <div class="inner">
    <button class="confirm-btn" data-jnext="${next}" data-tone="${TONE[next] || 'amber'}">
      <span class="n">${FLOW.indexOf(next) + 1}</span>
      <span class="grow">${esc(STEP[next].verb)}<small>${esc(STEP[next].desc)}</small></span>
      <span style="font-size:20px">→</span>
    </button>
  </div>
</div>` : isOpenTrip(j) ? `
<div class="action-bar">
  <div class="inner" style="text-align:center">
    <p class="small strong" style="color:var(--amber-dim)">เหลือส่ง ${fmtNum(live(j.stops).length)} จุด</p>
    <p class="tiny dim">แตะจุดด้านบน ส่งทีละจุด</p>
  </div>
</div>` : `
<div class="action-bar">
  <div class="inner" style="text-align:center">
    <p class="small strong" style="color:var(--green)">✓ เที่ยวนี้ส่งครบแล้ว</p>
    <p class="tiny dim">${esc(fmtTime(j.updatedAt))}</p>
  </div>
</div>`}`;
}

function timeline(j){
  return `<ul class="tl">${j.events.slice().reverse().map(e => {
    const tone = e.fail ? 'stop' : STEP[e.step]?.tone || 'grey';
    return `
<li class="tl-item" data-tone="${tone}">
  <div class="tl-head"><span class="tl-title">${esc(e.title || STEP[e.step].label)}</span><span class="tl-meta">${esc(fmtTime(e.at))}</span></div>
  <div class="tl-body">โดย ${esc(e.by)}${e.note ? `<br>${esc(e.note)}` : ''}${e.geo ? `<br><span class="tiny mono dim">พิกัด ${e.geo.lat}, ${e.geo.lng} (±${e.geo.acc} ม.) · จำลอง</span>` : ''}</div>
  ${e.photos?.length ? `<div class="photo-grid" style="margin-top:9px">${e.photos.map(p => `<img src="${p}" alt="รูปหน้างาน">`).join('')}</div>` : ''}
</li>`;
  }).join('')}</ul>`;
}

function groupRow(g, i, canDeliver){
  const gid = g.stops[0].id;
  const left = live(g.stops);
  const done = !left.length;
  const shown = openGroups.has(gid);
  const kg = g.stops.reduce((t, x) => t + x.weightKg, 0);
  const sent = g.stops.length - left.length;
  const nFail = g.stops.filter(x => x.status === 'fail').length;
  return `
<div class="stop-grp${shown ? ' is-open' : ''}">
  <div class="stop-row ${done ? 'is-done' : ''}" data-grp="${gid}" style="cursor:pointer">
    <span class="stop-n">${done ? '✓' : i + 1}</span>
    <span class="grow" style="min-width:0">
      <span class="strong" style="display:block">${esc(g.stops[0].dropoff.name)}</span>
      <span class="tiny dim trunc" style="display:block">${esc(g.stops[0].dropoff.address)}</span>
      <span class="tiny dim"><b class="grp-n">${fmtNum(g.stops.length)} บิล</b> · ${fmtNum(Math.round(kg))} กก.${sent && !done ? ` · ส่งแล้ว ${fmtNum(sent)}/${fmtNum(g.stops.length)}` : ''}</span>
    </span>
    <span class="tiny strong" style="color:${nFail ? 'var(--red)' : done ? 'var(--green)' : 'var(--amber-dim)'};white-space:nowrap">${nFail ? `✕ ส่งไม่สำเร็จ ${fmtNum(nFail)} บิล` : done ? 'ส่งแล้ว' : ''} ${shown ? '▴' : 'ดูบิล ▾'}</span>
  </div>
  ${shown ? `
  <div class="stop-grp-body">
    ${g.stops.map((x, k) => billRow(x, k)).join('')}
    ${canDeliver && left.length ? `
    <button type="button" class="btn btn-accent btn-block" data-grpgo="${gid}">ส่งของร้านนี้ (เหลือ ${fmtNum(left.length)} บิล) → เลือกบิลที่คุณจะส่ง</button>` : ''}
  </div>` : ''}
</div>`;
}

function billRow(x, k){
  const done = x.status !== 'open';
  return `
<div class="stop-row ${done ? 'is-done' : ''}">
  <span class="stop-n">${done ? '✓' : k + 1}</span>
  <span class="grow" style="min-width:0">
    <span class="strong" style="display:block">บิล ${esc(x.invoice)}</span>
    <span class="tiny dim">${esc(x.code)} · ${fmtNum(Math.round(x.weightKg))} กก. · ${esc(x.cargo)}</span>
  </span>
  ${x.status === 'fail' ? failTag(x) : `<span class="tiny" style="white-space:nowrap;${done ? 'color:var(--green)' : ''}">${done ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span>`}
</div>`;
}

function stopRow(x, i, canDeliver){
  const done = x.status !== 'open';
  return `
<div class="stop-row ${done ? 'is-done' : ''}" ${!done && canDeliver ? `data-stop="${x.id}"` : ''}>
  <span class="stop-n">${done ? '✓' : i + 1}</span>
  <span class="grow">
    <span class="strong" style="display:block">${esc(x.dropoff.name)}</span>
    <span class="tiny dim trunc" style="display:block">${esc(x.dropoff.address)}</span>
    <span class="tiny dim">บิล ${esc(x.invoice)} · ${fmtNum(Math.round(x.weightKg))} กก. · ${esc(x.cargo)}</span>
  </span>
  ${x.status === 'fail' ? failTag(x)
    : done ? '<span class="tiny" style="color:var(--green);white-space:nowrap">ส่งแล้ว</span>'
    : canDeliver ? '<span class="tiny strong" style="color:var(--amber-dim);white-space:nowrap">ส่งของ →</span>' : ''}
</div>`;
}

/* ---------- หลักฐานของจุดที่ส่งแล้ว ---------- */
function proofDialog(x){
  const bills = shopBills(x).filter(b => b.status !== 'open');
  const mark = (ok, label, extra = '') => `<li data-ok="${ok ? 1 : 0}">${ok ? '✓' : '✕'} ${label}${extra ? ` <span class="dim">${extra}</span>` : ''}</li>`;
  const card = (b) => {
    const p = b.proof;
    const fail = b.status === 'fail';
    return `
<div class="drv-proof">
  <div class="row between gap-8">
    <span class="strong">บิล ${esc(b.invoice)}</span>
    ${fail ? failTag(b) : '<span class="tiny strong" style="color:var(--green)">✓ ส่งเรียบร้อย</span>'}
  </div>
  <p class="tiny dim">ปิดโดย ${esc(me.name)} · ${esc(fmtTime(p.at))}${p.receiver ? ` · ผู้รับ ${esc(p.receiver)}` : ''}</p>
  <ul class="drv-check">
    ${fail ? `
    ${mark(!!p.note, 'หมายเหตุ', esc(p.note))}
    ${mark(p.photos.length >= MIN.fail, 'รูปหลักฐาน', `${fmtNum(p.photos.length)} รูป`)}` : `
    ${mark(p.photos.length >= MIN.cargo, 'รูปสินค้า', `${fmtNum(p.photos.length)} รูป`)}
    ${mark(!!p.sig, 'ลายเซ็นผู้รับ')}
    ${mark(p.inv.length >= MIN.inv, 'รูปเลขที่บิล', `${fmtNum(p.inv.length)} รูป`)}`}
    ${mark(!!p.geo, 'ตำแหน่ง', '(จำลอง)')}
  </ul>
  ${p.photos.length ? `<div class="photo-grid" style="margin-top:8px">${p.photos.map(u => `<img src="${u}" alt="รูปหน้างาน">`).join('')}</div>` : ''}
  ${p.sig ? `<p class="tiny dim" style="margin-top:8px">ลายเซ็นผู้รับ</p><div class="photo-grid"><img src="${p.sig}" alt="ลายเซ็นผู้รับ"></div>` : ''}
  ${p.inv.length ? `<p class="tiny dim" style="margin-top:8px">เลขที่บิล</p><div class="photo-grid">${p.inv.map(u => `<img src="${u}" alt="รูปเลขที่บิล">`).join('')}</div>` : ''}
</div>`;
  };
  modal({
    title: `หลักฐานการส่ง · ${esc(x.dropoff.name)}`,
    body: bills.map(card).join(''),
    foot: '<button class="btn btn-accent" data-close>ปิด</button>',
    guard: false,
  });
}

/* ---------- ขั้นของทั้งเที่ยว: ขึ้นรถ (ถ่ายรูป 2 รูป) · ออกจากคลัง ---------- */
const shotField = ({ key, need, title, sub, guide, btn }) => `
<div class="field" style="margin-top:16px">
  <div class="shot-head">
    <span class="shot-count" data-count="${key}">0 / ${need}</span>
    <span>
      <span class="label" style="margin:0"><span data-title="${key}">${title}</span><span class="req">*</span></span>
      <span class="tiny dim" style="display:block" data-sub="${key}">${sub}</span>
    </span>
  </div>
  <ul class="shot-guide">${(guide || []).map(g => `<li>${esc(g)}</li>`).join('')}</ul>
  <label class="drop" style="display:block">
    <span class="strong">${btn}</span>
    <span class="tiny dim" style="display:block;margin-top:3px">ทีละรูป หรือหลายรูปก็ได้ · ไม่จำกัดจำนวน</span>
    <input type="file" accept="image/*" capture="environment" multiple hidden data-photos="${key}">
  </label>
  <div class="photo-grid" data-shots="${key}" style="margin-top:10px"></div>
  <p class="tiny" data-shotwarn="${key}" style="margin-top:8px;color:var(--amber-dim)"></p>
</div>`;

/** ผูกช่องถ่ายรูปทุกชุดในหน้าต่าง — sets = { key: { list, need, on } } · paint(key) วาดใหม่ */
function bindShots(root, sets, after){
  const short = (k) => sets[k].on ? Math.max(0, sets[k].need - sets[k].list.length) : 0;
  function paint(key){
    const set = sets[key];
    const shots = root.querySelector(`[data-shots="${key}"]`);
    if (shots) shots.innerHTML = set.list.map((p, i) => `<span class="photo-x"><img src="${p}" alt="รูปที่ ${i + 1}"><button type="button" data-rm="${i}" aria-label="ลบรูป">×</button></span>`).join('');
    const c = root.querySelector(`[data-count="${key}"]`);
    const w = root.querySelector(`[data-shotwarn="${key}"]`);
    if (!set.on){
      if (c){ c.textContent = 'ไม่ต้องถ่าย'; c.classList.add('is-ok'); }
      if (w) w.textContent = '';
    } else {
      if (c){ c.textContent = `${set.list.length} / ${set.need}`; c.classList.toggle('is-ok', !short(key)); }
      if (w) w.textContent = short(key) ? `ถ่ายอีก ${short(key)} รูป` : '';
    }
    after?.();
  }
  for (const key of Object.keys(sets)){
    const input = root.querySelector(`[data-photos="${key}"]`);
    if (!input) continue;
    input.addEventListener('change', async () => {
      for (const f of [...input.files]){
        try{ sets[key].list.push(await shrinkImage(f)); }
        catch(err){ toast(err.message, 'err'); }
      }
      input.value = '';
      paint(key);
    });
    on(root.querySelector(`[data-shots="${key}"]`), 'click', '[data-rm]', (e, b) => { sets[key].list.splice(Number(b.dataset.rm), 1); paint(key); });
  }
  return { short, paint };   /* ผู้เรียกวาดครั้งแรกเอง หลังเก็บผลลัพธ์ใส่ตัวแปรแล้ว */
}

function confirmJobStep(j, next){
  const m = STEP[next];
  const needPhoto = next === 'loaded';
  const sets = { cargo: { list: [], need: MIN.loaded, on: needPhoto } };
  let geo = null;
  modal({
    title: esc(m.verb),
    body: `
<p class="muted small">เที่ยว <span class="code">${esc(j.code)}</span> · ${fmtNum(j.stops.length)} จุดส่ง</p>
${needPhoto ? shotField({ key:'cargo', need: MIN.loaded, title:'รูปสินค้า', sub:`ถ่าย ${MIN.loaded} รูปขึ้นไป · เห็นสินค้าบนรถ`, guide: PHOTO_GUIDE.loaded, btn:'📷 แตะเพื่อถ่ายรูป' }) : ''}
<label class="field" style="margin-top:16px">
  <span class="label">หมายเหตุ <span class="hint">(ไม่บังคับ)</span></span>
  <textarea class="textarea" data-note style="min-height:64px" placeholder="${esc(m.note)}"></textarea>
</label>
<button type="button" class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" data-geo>📍 แนบตำแหน่ง (ไม่บังคับ)</button>
<p class="tiny dim" data-geotext style="margin-top:6px"></p>
<p class="tiny dim" style="margin-top:14px">บันทึกในชื่อ <strong>${esc(me.name)}</strong> · กดแล้วแก้ไม่ได้</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>${esc(m.verb)}</button>`,
    onMount(root){
      const okBtn = root.querySelector('[data-ok]');
      const shots = bindShots(root, sets, () => {
        const left = shots.short('cargo');
        okBtn.disabled = left > 0;
        okBtn.title = left ? `ต้องถ่ายรูปสินค้าอีก ${left} รูปก่อน` : '';
      });
      shots.paint('cargo');
      const geoBtn = root.querySelector('[data-geo]'), geoText = root.querySelector('[data-geotext]');
      geoBtn.onclick = async () => {
        geoBtn.disabled = true; geoText.textContent = 'กำลังอ่านตำแหน่ง…';
        geo = await fakeGeo();
        geoText.textContent = `✓ ได้ตำแหน่งแล้ว (คลาดได้ ±${geo.acc} ม.) · แบบฝึกใช้ตำแหน่งจำลอง`;
        geoBtn.textContent = 'อ่านตำแหน่งใหม่'; geoBtn.disabled = false;
      };
      okBtn.onclick = () => {
        if (shots.short('cargo')) return toast(`ถ่ายรูปสินค้าอีก ${shots.short('cargo')} รูป`, 'warn', 4000);
        const now = Date.now();
        j.step = next;
        j.updatedAt = now;
        if (next === 'loaded') j.loadedAt = now;
        j.events.push({ id: uid('ev'), step: next, at: now, by: me.name, note: root.querySelector('[data-note]').value.trim() || m.note, geo, photos: sets.cargo.list });
        state.stats.photos += sets.cargo.list.length;
        close();
        toast(`บันทึก “${m.label}” แล้ว`, 'ok');
        render();
      };
    },
  });
}

/* ---------- ส่งของ: เลือกบิล (ร้านหลายบิล) → ปิดจุดทีละขั้น ---------- */
function deliverFor(x){
  const j = getTrip(x.tripId);
  if (FLOW.indexOf(j.step) < FLOW.indexOf('departed')) return toast(`กด “${STEP[nextOf(j.step)].verb}” ก่อน แล้วจึงส่งของได้`, 'warn', 4500);
  const bills = live(shopBills(x));
  if (bills.length > 1) return pickBills(x);
  confirmDeliver(bills.length ? bills : [x]);
}

function pickBills(x){
  const chosen = new Set(live(shopBills(x)).map(b => b.id));
  modal({
    title: `เลือกบิลที่คุณจะส่ง · ${esc(x.dropoff.name)}`,
    body: `
<p class="small">ติ๊กเฉพาะบิลที่<strong>คุณ</strong>จะส่งตอนนี้ · คนอื่นในเที่ยวเลือกบิลที่เหลือในเครื่องของเขาได้พร้อมกัน</p>
<p class="tiny dim" style="margin-top:4px">(แบบฝึก: ลองติ๊กออกบางบิล แล้วค่อยกลับมาส่งบิลที่เหลือทีหลังได้)</p>
<div data-billpick style="margin-top:12px"></div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>ถัดไป →</button>`,
    guard: false,
    onMount(root){
      const box = root.querySelector('[data-billpick]');
      const okBtn = root.querySelector('[data-ok]');
      function paint(){
        box.innerHTML = shopBills(x).map(b => {
          const done = b.status !== 'open';
          return `
<label class="drv-pick${done ? ' is-done' : ''}">
  <input type="checkbox" value="${b.id}" ${done ? 'disabled' : chosen.has(b.id) ? 'checked' : ''}>
  <span class="grow" style="min-width:0">
    <span class="strong" style="display:block">บิล ${esc(b.invoice)}</span>
    <span class="tiny dim">${esc(b.code)} · ${fmtNum(Math.round(b.weightKg))} กก. · ${esc(b.cargo)}</span>
  </span>
  ${done ? (b.status === 'fail' ? failTag(b) : '<span class="tiny strong" style="color:var(--green);white-space:nowrap">ส่งแล้ว</span>') : ''}
</label>`;
        }).join('');
        okBtn.disabled = !chosen.size;
        okBtn.textContent = chosen.size ? `ถัดไป → ส่ง ${fmtNum(chosen.size)} บิล` : 'เลือกอย่างน้อย 1 บิล';
      }
      box.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type=checkbox]');
        if (!cb) return;
        cb.checked ? chosen.add(cb.value) : chosen.delete(cb.value);
        paint();
      });
      paint();
      okBtn.onclick = () => {
        const bills = live(shopBills(x)).filter(b => chosen.has(b.id));
        if (!bills.length) return toast('เลือกอย่างน้อย 1 บิล', 'warn');
        confirmDeliver(bills);
      };
    },
  });
}

/* ปิดจุดส่งเป็นสเต็ป (เหมือน driver.js confirmStep):
   1) เลือกผลการส่ง + รูปสินค้า  2) ผู้รับเซ็น  3…) รูปเลขที่บิล ทีละบิล — บิลสุดท้ายต่อด้วยหมายเหตุ + ตำแหน่ง
   ส่งไม่สำเร็จ = จบที่ขั้นแรก (รูปหลักฐาน 1 รูป + หมายเหตุบังคับ + ตำแหน่ง) */
function confirmDeliver(bills){
  const s = bills[0];
  const multi = bills.length > 1;
  const nStage = 2 + bills.length;
  const invKey = (k) => `inv${k}`;
  const dKey = bills.map(b => b.id).join(',');
  const saved = drafts.get(dKey);
  const sets = {
    cargo: { list: [...(saved?.cargo || [])], need: MIN.cargo, on: true },
    ...Object.fromEntries(bills.map((b, k) => [invKey(k), { list: [...(saved?.inv?.[k] || [])], need: MIN.inv, on: true }])),
  };
  let outcome = '', geo = null, pad = null, savedSig = saved?.sig || null, stage = 1;
  const fail = () => isFail(outcome);
  const lastStage = () => fail() ? 1 : nStage;

  const finishPart = `
<label class="field" style="margin-top:16px">
  <span class="label">หมายเหตุ <span data-notehint><span class="hint">(ไม่บังคับ)</span></span></span>
  <textarea class="textarea" data-note style="min-height:64px" placeholder="ลงของครบถ้วน"></textarea>
</label>
<div class="field" style="margin-top:16px">
  <span class="label">ตำแหน่ง<span class="req">*</span> <span class="hint">(ระบบอ่านให้เอง)</span></span>
  <button type="button" class="btn btn-ghost btn-sm btn-block" data-geo>📍 แนบตำแหน่งตอนนี้</button>
  <p class="tiny dim" data-geotext style="margin-top:6px">กำลังอ่านตำแหน่ง…</p>
  <p class="tiny dim" style="margin-top:4px">ของจริง: ต้องเปิดระบบระบุตำแหน่ง และกด “อนุญาต” · แบบฝึกใช้ตำแหน่งจำลอง</p>
</div>
<p class="tiny dim" style="margin-top:14px">บันทึกในชื่อ <strong>${esc(me.name)}</strong> · กดแล้วแก้ไม่ได้</p>`;

  let saveDraft = () => {};
  modal({
    title: 'ยืนยันลงของ + ถ่ายรูป + ให้ผู้รับเซ็น',
    onUserClose: () => saveDraft(),
    body: `
<p class="muted small">${multi ? `${esc(s.dropoff.name)} · ${fmtNum(bills.length)} บิล (${bills.map(b => `<span class="code">${esc(b.invoice)}</span>`).join(' ')})`
  : `บิล <span class="code">${esc(s.invoice)}</span> → ${esc(s.dropoff.name)}`}</p>
<p class="small strong" data-stagelabel style="margin-top:10px"></p>
<div data-stage="1">
  <div class="field" style="margin-top:12px">
    <span class="label">ผลการส่ง<span class="req">*</span></span>
    <select class="input select drv-outcome" data-outcome>
      <option value="" selected disabled>— แตะเพื่อเลือกผลการส่ง —</option>
      ${Object.entries(OUTCOMES).map(([k, v]) => `<option value="${k}">${esc(v)}${isFail(k) ? ' (ต้องพิมพ์หมายเหตุ)' : ''}</option>`).join('')}
    </select>
  </div>
  ${shotField({ key:'cargo', need: MIN.cargo, title:'รูปสินค้า', sub:'', guide: PHOTO_GUIDE.cargo, btn:'📷 แตะเพื่อถ่ายรูป' })}
</div>
<div data-stage="2" style="display:none">
  <div class="field" style="margin-top:16px">
    <span class="label">ชื่อผู้รับ</span>
    <input class="input" data-receiver value="${esc(saved?.receiver ?? s.dropoff.contact)}" placeholder="ชื่อคนที่มารับของ">
  </div>
  <div class="field" style="margin-top:14px">
    <span class="label">ลายเซ็นผู้รับ<span class="req">*</span></span>
    <div class="sigwrap" data-sig><canvas></canvas><div class="sighint">ให้ผู้รับเซ็นตรงนี้</div></div>
    <div class="row between wraps gap-8" style="margin-top:8px">
      <span class="tiny" data-sigwarn style="color:var(--amber-dim)">ยังไม่ได้เซ็น</span>
      <button type="button" class="btn btn-quiet btn-sm" data-sigclear>ลบ · เซ็นใหม่</button>
    </div>
  </div>
</div>
${bills.map((b, k) => `<div data-stage="${k + 3}" style="display:none">
<div class="bill-big">
  <span class="bill-big-k">${multi ? `บิลที่ ${k + 1} จาก ${bills.length}` : 'เลขที่บิล'} · ถ่ายใบนี้</span>
  <span class="bill-big-no">${esc(b.invoice)}</span>
</div>
${shotField({ key: invKey(k), need: MIN.inv, title: multi ? `รูปเลขที่บิล บิลที่ ${k + 1} / ${bills.length}` : 'รูปเลขที่บิล',
  sub: `เลขที่บิล <span class="code">${esc(b.invoice)}</span> · อย่างน้อย ${MIN.inv} รูป · ห้ามถ่ายบิลอื่น`, guide: INVOICE_GUIDE, btn:'🧾 แตะเพื่อถ่ายเลขที่บิล' })}
${k === bills.length - 1 ? `<div data-finish>${finishPart}</div>` : ''}
</div>`).join('')}
<p class="tiny dim" style="margin-top:18px;text-align:center">🎓 แบบฝึก — ไม่มีอะไรถูกส่งเข้าระบบจริง</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-ghost" data-back style="display:none">← ย้อนกลับ</button>
           <button class="btn btn-accent" data-nextstage>ถัดไป →</button>
           <button class="btn btn-green" data-ok style="display:none">✓ ยืนยันส่งของ</button>`,
    onMount(root){
      const okBtn = root.querySelector('[data-ok]');
      const nextBtn = root.querySelector('[data-nextstage]');
      const backBtn = root.querySelector('[data-back]');
      const noteEl = root.querySelector('[data-note]');
      const noteText = () => noteEl.value.trim();
      const outSel = root.querySelector('[data-outcome]');
      const finishEl = root.querySelector('[data-finish]');
      const unsigned = () => (!pad || pad.isEmpty()) && !savedSig;
      if (saved?.note) noteEl.value = saved.note;

      const shots = bindShots(root, sets, () => refreshOk());
      const stageKey = (n) => n === 1 ? 'cargo' : invKey(n - 3);
      const stageLeft = (n) => n === 2 ? (unsigned() ? 1 : 0) : n === 1 && !outcome ? 1 : shots.short(stageKey(n));
      const stageMsg = (n) => n === 1 && !outcome ? 'เลือกผลการส่งก่อน'
        : n === 1 ? `ถ่ายรูป${fail() ? 'หลักฐาน' : 'สินค้า'}อีก ${shots.short('cargo')} รูป`
        : n === 2 ? 'ให้ผู้รับเซ็นชื่อ'
        : `ถ่ายเลขที่บิล${multi ? ` บิลที่ ${n - 2}` : ''} อีก ${shots.short(stageKey(n))} รูป`;

      function refreshOk(){
        if (!okBtn) return;
        const left = stageLeft(stage);
        nextBtn.disabled = left > 0;
        const why = [];
        if (!outcome) why.push('เลือกผลการส่ง');
        if (fail() && !noteText()) why.push('พิมพ์หมายเหตุ');
        if (shots.short('cargo')) why.push(`ถ่ายรูป${fail() ? 'หลักฐาน' : 'สินค้า'}อีก ${shots.short('cargo')} รูป`);
        const invLeft = bills.reduce((a, b, k) => a + shots.short(invKey(k)), 0);
        if (invLeft) why.push(`ถ่ายเลขที่บิล อีก ${invLeft} รูป`);
        if (!fail() && unsigned()) why.push('ให้ผู้รับเซ็นชื่อ');
        if (!geo) why.push('รอตำแหน่ง');
        okBtn.disabled = why.length > 0;
        okBtn.title = why.length ? 'ต้อง' + why.join(' และ ') + 'ก่อน' : '';
        const sw = root.querySelector('[data-sigwarn]');
        sw.textContent = unsigned() ? 'ยังไม่ได้เซ็น' : '✓ เซ็นแล้ว';
        sw.style.color = unsigned() ? 'var(--amber-dim)' : 'var(--green)';
      }

      const sig = root.querySelector('[data-sig]');
      function mountSig(){
        if (pad) return;
        pad = signaturePad(sig);
        root.querySelector('[data-sigclear]').onclick = () => { pad.clear(); savedSig = null; refreshOk(); };
        if (savedSig){ pad.load(savedSig); savedSig = null; }
        sig.addEventListener('pointerup', refreshOk);
        sig.addEventListener('pointerleave', refreshOk);
      }

      function showStage(n){
        stage = n;
        for (let k = 1; k <= nStage; k++) root.querySelector(`[data-stage="${k}"]`).style.display = n === k ? '' : 'none';
        const last = n === lastStage();
        root.querySelector('[data-stagelabel]').textContent = `ขั้นที่ ${n} / ${lastStage()} · ` + (n === 1
          ? (!outcome ? 'เลือกผลการส่ง แล้วถ่ายรูป' : fail() ? 'ถ่ายรูปหลักฐาน + พิมพ์หมายเหตุ' : 'ถ่ายรูปสินค้าหลังลงของเสร็จ')
          : n === 2 ? 'ให้ผู้รับเซ็นชื่อ (ก่อนผู้รับไป)'
          : `ถ่ายเลขที่บิล${multi ? ` บิลที่ ${n - 2} (${bills[n - 3].invoice})` : ''}`);
        nextBtn.style.display = last ? 'none' : '';
        nextBtn.textContent = n === 1 ? 'ถัดไป → ให้ผู้รับเซ็น' : n === 2 ? 'ถัดไป → ถ่ายเลขที่บิล' : `ถัดไป → บิลที่ ${n - 1}`;
        backBtn.style.display = n > 1 ? '' : 'none';
        root.querySelector('.modal-foot [data-close]').style.display = n > 1 ? 'none' : '';
        okBtn.style.display = last ? '' : 'none';
        if (n === 2) mountSig();
        root.querySelector('.modal-body').scrollTop = 0;
        refreshOk();
      }

      function applyOutcome(o){
        outcome = o || '';
        outSel.value = outcome;
        const f = fail();
        sets.cargo.need = f ? MIN.fail : MIN.cargo;
        bills.forEach((b, k) => { sets[invKey(k)].on = !f; });
        root.querySelector('[data-title="cargo"]').textContent = f ? 'รูปหลักฐาน' : 'รูปสินค้า';
        root.querySelector('[data-sub="cargo"]').textContent = f
          ? `ถ่าย ${MIN.fail} รูปขึ้นไป · เช่น หน้าร้านที่ปิด / สินค้าที่ลูกค้าไม่รับ`
          : `ถ่าย ${MIN.cargo} รูปขึ้นไป · ${multi ? `หลังลงของเสร็จ ให้เห็นสินค้าทั้ง ${bills.length} บิลของร้านนี้` : 'หลังลงของเสร็จ ให้เห็นสินค้าที่ลงจุดนี้'}`;
        root.querySelector('[data-notehint]').innerHTML = f ? '<span class="req">*</span> <span class="hint">(บังคับ — บอกเหตุผล)</span>' : '<span class="hint">(ไม่บังคับ)</span>';
        noteEl.placeholder = f ? `${OUTCOMES[outcome]} เพราะอะไร เช่น โทรแล้วไม่รับสาย / ของเสียหาย` : 'ลงของครบถ้วน';
        (f ? root.querySelector('[data-stage="1"]') : root.querySelector(`[data-stage="${nStage}"]`)).appendChild(finishEl);
        okBtn.textContent = f ? `✓ บันทึกผล · ${OUTCOMES[outcome]}` : '✓ ยืนยันส่งของ';
        okBtn.classList.toggle('btn-green', !f);
        okBtn.classList.toggle('btn-danger', f);
        Object.keys(sets).forEach(shots.paint);
        showStage(Math.min(stage, lastStage()));
      }
      outSel.addEventListener('change', () => applyOutcome(outSel.value));
      noteEl.addEventListener('input', refreshOk);

      nextBtn.onclick = () => {
        if (stageLeft(stage)) return toast(stageMsg(stage), 'warn', 4000);
        showStage(stage + 1);
      };
      backBtn.onclick = () => showStage(stage - 1);

      /* เก็บงานที่ค้าง (ปิดหน้าต่างด้วยมือ) — ในหน่วยความจำเท่านั้น */
      saveDraft = () => drafts.set(dKey, {
        cargo: sets.cargo.list, inv: bills.map((b, k) => sets[invKey(k)].list),
        sig: pad && !pad.isEmpty() ? pad.toDataURL() : savedSig,
        receiver: root.querySelector('[data-receiver]').value, note: noteEl.value, outcome, stage,
      });

      const geoBtn = root.querySelector('[data-geo]'), geoText = root.querySelector('[data-geotext]');
      async function readGeo(){
        geoBtn.disabled = true; geoText.textContent = 'กำลังอ่านตำแหน่ง…';
        geo = await fakeGeo();
        if (!root.isConnected) return;
        geoText.textContent = `✓ ได้ตำแหน่งแล้ว (คลาดได้ ±${geo.acc} ม.)`;
        geoBtn.textContent = 'อ่านตำแหน่งใหม่'; geoBtn.disabled = false;
        refreshOk();
      }
      geoBtn.onclick = readGeo;
      readGeo();

      applyOutcome(saved?.outcome || '');
      if (saved){
        let to = Math.min(saved.stage || 1, lastStage());
        for (let n = 1; n < to; n++) if (stageLeft(n)){ to = n; break; }
        showStage(to);
        toast('เปิดงานที่ค้างไว้ — ทำต่อได้เลย', 'ok');
      }

      okBtn.onclick = () => {
        if (!outcome) return toast('เลือกผลการส่งก่อน', 'warn', 4000);
        if (fail() && !noteText()) return toast(`${OUTCOMES[outcome]} — พิมพ์หมายเหตุก่อน`, 'warn', 4000);
        if (shots.short('cargo')) return toast(stageMsg(1), 'warn', 4000);
        for (let k = 0; k < bills.length; k++) if (shots.short(invKey(k))) return toast(stageMsg(k + 3), 'warn', 4000);
        if (!geo) return toast('รอระบบอ่านตำแหน่งสักครู่', 'warn', 3000);
        if (!fail() && unsigned()) return toast('ให้ผู้รับเซ็นชื่อก่อน', 'warn', 4000);
        finishDelivery(bills, {
          outcome, geo,
          note: noteText() || (fail() ? '' : 'ลงของครบถ้วน'),
          receiver: fail() ? '' : root.querySelector('[data-receiver]').value.trim(),
          photos: sets.cargo.list,
          sig: fail() ? null : (pad && !pad.isEmpty() ? pad.toDataURL() : savedSig),
          inv: bills.map((b, k) => fail() ? [] : sets[invKey(k)].list),
        });
      };
    },
  });
}

function finishDelivery(bills, r){
  const j = getTrip(bills[0].tripId);
  const now = Date.now();
  const f = isFail(r.outcome);
  bills.forEach((b, k) => {
    b.status = f ? 'fail' : 'ok';
    b.proof = { outcome: r.outcome, at: now, geo: r.geo, note: r.note, receiver: r.receiver, photos: r.photos, sig: r.sig, inv: r.inv[k] };
  });
  drafts.delete(bills.map(b => b.id).join(','));
  const shop = bills[0].dropoff.name;
  const what = bills.length > 1 ? `${shop} · ${bills.length} บิล` : shop;
  j.events.push({ id: uid('ev'), step: 'delivered', at: now, by: me.name, geo: r.geo, photos: r.photos, fail: f,
    title: f ? `ส่งไม่สำเร็จ · ${OUTCOMES[r.outcome]}` : 'ส่งมอบสำเร็จ',
    note: `${what}${r.note ? ` · ${r.note}` : ''}${r.receiver ? ` · ผู้รับ: ${r.receiver}` : ''}` });
  j.updatedAt = now;
  const st = state.stats;
  st[f ? 'fail' : 'ok'] += bills.length;
  st.photos += r.photos.length + r.inv.reduce((a, l) => a + l.length, 0);
  close();

  if (!live(j.stops).length){
    j.step = 'delivered';
    j.closedAt = now;
    st.trips++;
    /* ปิดไปหนึ่งเที่ยว — สุ่มเที่ยวใหม่มาแทน ให้มีงานรออยู่เสมอ */
    while (state.trips.filter(isOpenTrip).length < OPEN_TRIPS) state.trips.push(makeTrip());
    celebrate('ปิดเที่ยวเรียบร้อย', 'ปิดครบทุกจุดแล้ว', { big: true });
    render();
    setTimeout(() => tripSummary(j), 2300);   /* รอฉลองปิดเที่ยว (2 วิ) จางหายก่อน */
    return;
  }
  if (!f) celebrate('ส่งมอบสำเร็จ', what);
  toast(f ? `บันทึก “${OUTCOMES[r.outcome]}” · ${what} แล้ว` : `ส่ง${what}แล้ว`, f ? 'warn' : 'ok');
  render();
}

/** สรุปผลหลังปิดเที่ยว + พาไปเที่ยวใหม่ */
function tripSummary(j){
  const ok = j.stops.filter(x => x.status === 'ok').length;
  const bad = j.stops.filter(x => x.status === 'fail').length;
  const photos = j.events.reduce((a, e) => a + (e.photos?.length || 0), 0) + j.stops.reduce((a, x) => a + (x.proof?.inv.length || 0), 0);
  const fresh = state.trips.filter(isOpenTrip);
  modal({
    title: `🎉 จบเที่ยว ${esc(j.code)}`,
    guard: false,
    body: `
<div class="pr-score" style="margin:0">
  <div class="pr-score-grid">
    <div><b style="color:var(--green)">${fmtNum(ok)}</b><span>บิลส่งสำเร็จ</span></div>
    <div><b style="color:var(--red)">${fmtNum(bad)}</b><span>บิลส่งไม่สำเร็จ</span></div>
    <div><b>${fmtNum(photos)}</b><span>รูปที่ถ่าย</span></div>
    <div><b>${esc(mins(j.closedAt - (j.loadedAt || j.createdAt)))}</b><span>เวลาที่ใช้</span></div>
  </div>
</div>
<p class="small" style="margin-top:14px">รวมทั้งหมดที่ฝึกมา: ปิด <b>${fmtNum(state.stats.trips)}</b> เที่ยว · ส่งสำเร็จ <b>${fmtNum(state.stats.ok)}</b> บิล</p>
<p class="small" style="margin-top:6px">มีเที่ยวใหม่รออยู่ ${fmtNum(fresh.length)} เที่ยว — ฝึกต่อได้เลย</p>`,
    foot: `<button class="btn btn-ghost" data-close>ดูเที่ยวนี้</button>
           <button class="btn btn-accent" data-gonew>ไปเที่ยวใหม่ →</button>`,
    onMount(root){
      root.querySelector('[data-gonew]').onclick = () => {
        close();
        const n = state.trips.filter(isOpenTrip).at(-1);
        if (n){ view = { name: 'trip', id: n.id }; tripTab = null; render(); scrollTo(0, 0); }
      };
    },
  });
}

function noteDialog(j){
  modal({
    title: '📝 หมายเหตุจากทีมคลัง',
    guard: false,
    body: `<p class="tiny dim">เที่ยว <span class="code">${esc(j.code)}</span> · ข้อความสมมติในแบบฝึก</p><div class="drv-note-full">${esc(j.note)}</div>`,
    foot: '<button class="btn btn-accent" data-close>ปิด</button>',
  });
}

/* ---------- ปุ่มต่าง ๆ บนหน้า ---------- */
on(app, 'click', '[data-trip]', (e, b) => { if (!e.target.closest('[data-jobnote]')) go({ name: 'trip', id: b.dataset.trip }); });
on(app, 'click', '[data-jobnote]', (e, b) => { const j = getTrip(b.dataset.jobnote); if (j) noteDialog(j); });
on(app, 'click', '[data-back]', () => { history.state?.pv === 'trip' ? history.back() : (view = { name: 'list' }, render()); });
on(app, 'click', '[data-tab]', (e, b) => {
  const [where, k] = b.dataset.tab.split(':');
  if (where === 'list') listTab = k; else tripTab = k;
  render();
});
on(app, 'click', '[data-grp]', (e, b) => { const id = b.dataset.grp; openGroups.has(id) ? openGroups.delete(id) : openGroups.add(id); render(); });
const findStop = (id) => { for (const j of state.trips){ const x = j.stops.find(s => s.id === id); if (x) return x; } return null; };
on(app, 'click', '[data-grpgo]', (e, b) => { const x = findStop(b.dataset.grpgo); if (x) deliverFor(x); });
on(app, 'click', '[data-stop]', (e, b) => { const x = findStop(b.dataset.stop); if (x) deliverFor(x); });
on(app, 'click', '[data-proof]', (e, b) => { const x = findStop(b.dataset.proof); if (x) proofDialog(x); });
on(document.body, 'click', '[data-jnext]', (e, b) => { const j = getTrip(view.id); if (j) confirmJobStep(j, b.dataset.jnext); });
on(app, 'click', '[data-reset]', async () => {
  const ok = await confirmBox({ title: 'สุ่มงานชุดใหม่', message: 'เที่ยวที่ทำค้างอยู่จะหายไป แล้วได้งานชุดใหม่ 2 เที่ยว<br><span class="dim">ผลการฝึกที่ทำไปแล้วยังนับอยู่</span>', ok: 'สุ่มใหม่' });
  if (!ok) return;
  state.trips = state.trips.filter(j => !isOpenTrip(j));
  while (state.trips.filter(isOpenTrip).length < OPEN_TRIPS) state.trips.push(makeTrip());
  drafts.clear();
  listTab = 'open';
  render();
  toast('ได้งานชุดใหม่แล้ว', 'ok');
});

/* ทุกจุดส่งรู้ว่าอยู่เที่ยวไหน (ใช้หาร้านเดียวกัน) — ใส่ตอนสร้าง และทุกครั้งที่มีเที่ยวใหม่ */
history.replaceState({ pv: 'list' }, '');

/* "x นาทีที่แล้ว" กับเวลาฝึก — วาดใหม่ทุกนาทีตอนอยู่หน้ารายการ (ไม่วาดทับหน้าต่างที่เปิดอยู่) */
setInterval(() => { if (!openModal && view.name === 'list') render(); }, 60000);

render();
document.documentElement.classList.add('is-ready');
