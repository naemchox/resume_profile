/* ============================================================
   track.js — หน้าติดตามสำหรับลูกค้า (เปิดสาธารณะ ไม่ต้องล็อกอิน)

   อ่านจากสำเนาสาธารณะเท่านั้น (cloud.js → putTracking)
     trackKeys/{เลขที่ค้น} → { sids }   แล้ว   trackData/{sid} → ข้อมูลจุดส่ง
   ต้องรู้เลขก่อนถึงจะเห็น — ดึงรายการทั้งหมดไม่ได้ (กฎฐานข้อมูลอนุญาตแค่ get)
   พนักงานที่ล็อกอินอยู่: ถ้าสำเนายังไม่มี (ข้อมูลเก่า) ถอยไปหาจากข้อมูลเต็มในเครื่อง
   ============================================================ */

import { shell, $, el, esc, toast, demoBar, pill, flowBar, on } from './ui.js';
import {
  findShipments, getDriver, META, fmtDateTime, ago, fmtNum,
  driverName, isFailOutcome, trackOutcomeLabel,
} from './store.js';
import { routeBlock, invoiceBlock, cargoBlock, timeline, timingBlock, bindZoom, progressText } from './detail.js';
import { gate, getSession } from './auth.js';
import { podOriginHead } from './pod.js';
import { COMPANY } from './config.js';

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('track');
shell({ role: 'มุมมองลูกค้า', picker: true });

const form = $('#findForm');
const input = $('#code');
const out = $('#result');
let hits = [];         /* ทุกใบของเลขที่ค้นล่าสุด (เลขเดียวอาจแยกเป็น -1 -2 · หรือเลขบิลซ้ำจากงานส่งใหม่) */
let picked = new Set(); /* ใบที่ติ๊กเลือกไว้ (31 ต.ค.: เลือกได้หลายใบ บนจอและ POD เรียงต่อกัน วันที่ล่าสุดก่อน) */
let current = null;    /* ใบแรกที่แสดงอยู่ (object) */
let miss = '';         /* เลขที่ค้นแล้วไม่พบ */
let unlisten = null;   /* ฟังการเปลี่ยนแปลงของใบที่แสดงอยู่ — คนขับปิดงานแล้วหน้านี้ขยับเอง */
const fb = window.firebase;

/* ---------- ส่งไม่สมบูรณ์ (6 พ.ย. — ลูกค้าขอ) ----------
   คนขับปิดจุดแบบส่งไม่สำเร็จ (ลูกค้าไม่รับของ / คืนสินค้า / ร้านปิด / อื่น ๆ) สถานะยังเป็น delivered
   เดิมหน้านี้ขึ้น "ส่งมอบสำเร็จ" → ขึ้น "ส่งไม่สมบูรณ์ · เหตุผล" ป้ายแดงแทน (ผลอยู่ใน event ปิดจุดล่าสุด · cloud.js publicStop) */
function failOf(s){
  if (s?.status !== 'delivered') return '';
  const ev = [...(s.events || [])].reverse().find(e => e?.status === 'delivered');
  return isFailOutcome(ev?.outcome) ? ev.outcome : '';
}
const statusLabel = (s) => failOf(s) ? trackOutcomeLabel(failOf(s)) : (META[s.status]?.label || s.status);
const statusPill = (s) => failOf(s) ? `<span class="pill" data-tone="stop">${esc(statusLabel(s))}</span>` : pill(s.status);
const statusDesc = (s) => failOf(s) ? 'จุดนี้ส่งไม่สมบูรณ์ — สอบถามรายละเอียดเพิ่มเติมได้ที่บริษัท' : (META[s.status]?.desc || '');
const trkProgress = (s) => failOf(s) ? progressText(s).replace(META[s.status].label, statusLabel(s)) : progressText(s);

/** หาทุกใบของเลขนี้จากสำเนาสาธารณะ */
async function lookup(code){
  const key = String(code || '').trim().toUpperCase();
  if (!key || key.includes('/')) return [];
  let sids = [];
  try{
    const k = await fb.getDoc(fb.doc(fb.db, 'trackKeys', key));
    sids = k.exists() ? (k.data().sids || []) : [];
  }catch(err){ console.error('[track] ค้นเลขไม่ได้', err); }
  const docs = await Promise.all(sids.map(id =>
    fb.getDoc(fb.doc(fb.db, 'trackData', id)).then(d => (d.exists() ? d.data() : null)).catch(() => null)));
  let found = docs.filter(Boolean);
  /* พนักงาน: ข้อมูลเก่าที่ยังไม่มีสำเนา — หาจากข้อมูลเต็มในเครื่องแทน */
  if (!found.length && getSession().kind === 'staff'){
    found = findShipments(key).map(x => {
      const dv = x.driverId ? getDriver(x.driverId) : null;
      return { ...x, driver: dv ? { name:driverName(dv), truck:dv.truck, plate:dv.plate, phone:dv.phone } : null };
    });
  }
  return found.sort((a, b) => String(a.code).localeCompare(String(b.code), 'th', { numeric:true }));
}

function listen(ids){
  unlisten?.(); unlisten = null;
  const offs = [];
  for (const id of ids){
    try{
      offs.push(fb.onSnapshot(fb.doc(fb.db, 'trackData', id), (d) => {
        if (!d.exists() || !hits.some(h => h.id === id)) return;
        const fresh = d.data();
        hits = hits.map(h => (h.id === id ? fresh : h));
        paint();
      }, () => {}));
    }catch{}
  }
  unlisten = () => offs.forEach(f => f());
}

/** วันที่ของใบ (เรียงล่าสุดก่อน): ส่งมอบ → เหตุการณ์ล่าสุด → วันส่ง */
const dateOf = (s) => podOf(s)?.at || s.events?.[s.events.length - 1]?.at || s.serviceDate || '';
const byDate = (a, b) => String(dateOf(b)).localeCompare(String(dateOf(a)));
/** ใบที่ติ๊กไว้ เรียงวันที่ล่าสุดก่อน */
const shown = () => hits.filter(h => picked.has(h.id)).sort(byDate);

/* ---------- กล่องติ๊กเลือกใบ เมื่อเลขเดียวมีหลายใบ ----------
   เลขเดียวมีหลายใบได้สองแบบ: บิลแยก -1 -2 ตามรายการสินค้า (Shipment เดียวกัน)
   และเลขบิลซ้ำจากงานส่งใหม่หลังส่งไม่สำเร็จ (Shipment ใหม่ · 31 ต.ค.) → ติ๊กกี่ใบก็ได้ */
function pickBar(){
  if (hits.length < 2) return '';
  const ships = new Set(hits.map(h => h.shipmentNo || h.source?.shipmentNo || ''));
  return `
    <div class="card card-pad no-print" style="margin-bottom:14px">
      <div class="row between wraps gap-8" style="align-items:baseline">
        <p class="small strong">เลขนี้มี ${fmtNum(hits.length)} ใบ${ships.size > 1 ? ` · ${fmtNum(ships.size)} Shipment` : ''}</p>
        <button type="button" class="linkish tiny" data-pickall>${picked.size === hits.length ? 'ล้างที่เลือก' : 'เลือกทั้งหมด'}</button>
      </div>
      <p class="tiny dim" style="margin:3px 0 10px">ติ๊กใบที่ต้องการดู — กี่ใบก็ได้ · บนจอ ดูใบส่งของ และดาวน์โหลด เรียงวันที่ล่าสุดขึ้นก่อน</p>
      <div class="stack gap-6">
        ${hits.slice().sort(byDate).map(x => `
        <label class="row gap-10 trk-pick${picked.has(x.id) ? ' is-on' : ''}">
          <input type="checkbox" data-pickbill="${esc(x.id)}" ${picked.has(x.id) ? 'checked' : ''}>
          <span class="grow" style="min-width:0">
            <span class="strong">Shipment ${esc(x.shipmentNo || x.source?.shipmentNo || '—')}</span>
            <span class="tiny dim" style="display:block">บิล ${esc(x.code)} · ${esc(dateOf(x) ? fmtDateTime(dateOf(x)) : '—')}</span>
          </span>
          ${statusPill(x)}
        </label>`).join('')}
      </div>
    </div>`;
}

/* ---------- ส่วนที่ขึ้นเฉพาะตอนพิมพ์ / บันทึกเป็น PDF ---------
   รูปใบ Invoice (หน้าละรูป) ต่อท้ายหน้าติดตามเดิม เหมือนใบ POD (js/pod.js)
   บนจอไม่เปลี่ยน (css/track.css .trk-print-only) · สำเนาสาธารณะเก็บไว้ที่ s.pod (cloud.js publicStop)
   พนักงานที่ถอยไปใช้ข้อมูลเต็มในเครื่อง ไม่มี s.pod — หยิบจากเหตุการณ์ส่งมอบล่าสุดแทน */
function podOf(s){
  if (s.pod) return s.pod;
  if (s.status !== 'delivered') return null;
  const ev = [...(s.events || [])].reverse().find(e => e.status === 'delivered');
  return ev ? { at: ev.at, signature: ev.signature || '', invoicePhotos: ev.invoicePhotos || [], geo: ev.geo || null } : null;
}

/* บนจอ — รูปใบ Invoice ต่อท้าย "ประวัติสถานะและหลักฐาน" แตะรูปเพื่อขยาย (bindZoom) · ตอนพิมพ์ซ่อน ใช้ printExtras แทน
   ลายเซ็นไม่อยู่ตรงนี้ — วางในแถวรูปของ "ส่งมอบสำเร็จ" ทางขวาของรูปสินค้า (signedTimeline) */
function podScreen(s){
  const inv = (podOf(s)?.invoicePhotos || []).filter(Boolean);
  if (!inv.length) return '';
  return `
  <div class="no-print">
    <hr class="divider" style="margin:22px 0">
    <h4 style="margin-bottom:14px">หลักฐานการส่งมอบ</h4>
    <div class="panel">
      <div class="tiny dim">รูปใบ Invoice ${esc(s.invoice?.number || s.code)} · แตะเพื่อขยาย</div>
      <div class="photo-grid" style="margin-top:8px">${inv.map((u, i) =>
        `<img src="${esc(u)}" alt="รูปใบ Invoice ${i + 1}" data-zoom="${esc(u)}" style="cursor:zoom-in" loading="lazy">`).join('')}</div>
    </div>
  </div>`;
}

/* ไทม์ไลน์ที่ใส่ลายเซ็น + พิกัดส่งมอบจาก s.pod กลับเข้าเหตุการณ์ส่งมอบล่าสุด (สำเนาสาธารณะตัดสองอย่างนี้ออกจาก events)
   พิกัดขึ้นเป็นตัวเลขใต้ "ส่งมอบสำเร็จ" (detail.js timeline) — ทั้งบนจอ ดู POD และไฟล์ที่ดาวน์โหลด */
function signedTimeline(s){
  const p = podOf(s);
  const sig = p?.signature, geo = p?.geo || null;
  const at = sig || geo ? s.events.map(e => e.status).lastIndexOf('delivered') : -1;
  const evs = at < 0 ? s.events : s.events.map((e, i) => (i === at ? { ...e, signature: sig || e.signature, geo: geo || e.geo } : e));
  return timeline({ ...s, events: evs }, { signInline: true, audience: 'track' });
}

function printExtras(s){
  /* ลายเซ็นพิมพ์ไปกับไทม์ไลน์แล้ว (signedTimeline) — ตรงนี้เหลือรูปใบ Invoice หน้าละรูป */
  const p = podOf(s);
  const inv = (p?.invoicePhotos || []).filter(Boolean);
  if (!inv.length) return '';
  return `
<div class="trk-print-only">
  ${inv.map((u, i) => `
  <section class="pod-inv-page trk-inv-page">
    <header class="pod-inv-head">
      <span><b>รูปใบ Invoice ${esc(s.invoice?.number || s.code)}</b> · ${esc(s.dropoff?.name || '')}</span>
      <span>รูปที่ ${i + 1} / ${inv.length} · ${esc(s.code)}</span>
    </header>
    <img class="pod-inv-img" src="${esc(u)}" alt="รูปใบ Invoice ${i + 1}">
    <footer class="pod-foot">ถ่ายตอนส่งมอบ ${esc(fmtDateTime(p.at))}</footer>
  </section>`).join('')}
</div>`;
}

/* ---------- ผลลัพธ์ ---------------------------------------- */
/** ใบเดียว: หน้าแรกของ PDF (.trk-p1) + หน้ารูปใบ Invoice */
function billHtml(s){
  const d = s.driver || null;
  const last = s.events[s.events.length - 1];
  const m = META[s.status];

  /* .trk-p1 = หน้าแรกของ PDF (ย่อให้พอดีหน้าเดียวตอนพิมพ์ — fitFirstPage) · รูปใบ Invoice ต่อหน้า 2 เป็นต้นไป */
  return `<div class="trk-bill" data-sid="${esc(s.id)}"><div class="trk-p1">
<div class="trk-print-only trk-print-head">${podOriginHead()}</div>` + `
<div class="card card-pad">
  <div class="row between wraps gap-12" style="align-items:flex-start">
    <div>
      <span class="code code-lg">${esc(s.code)}</span>
      <h2 style="font-size:20px;margin-top:10px">${esc(s.dropoff.name)}</h2>
      <p class="tiny dim">${esc(trkProgress(s))} · อัปเดต ${esc(ago(s.updatedAt))}</p>
    </div>
    ${statusPill(s)}
  </div>

  <div class="panel" style="margin-top:16px;background:var(--surface-2)">
    <div class="strong"${failOf(s) ? ' style="color:var(--red)"' : ''}>${esc(failOf(s) ? statusLabel(s) : m.label)}</div>
    <p class="small muted" style="margin-top:2px">${esc(last.note || (failOf(s) ? statusDesc(s) : m.desc))}</p>
    <p class="tiny dim mono" style="margin-top:6px">${esc(fmtDateTime(last.at))} · โดย ${esc(last.byName)}</p>
  </div>

  <div style="margin-top:22px">${flowBar(s, failOf(s) ? { failLabel: 'ส่งไม่สมบูรณ์' } : {})}</div>

  <hr class="divider" style="margin:22px 0">

  <div class="grid g2" style="gap:18px" id="trackGrid">
    <div class="stack gap-14">
      ${routeBlock(s)}
      ${cargoBlock(s)}
    </div>
    <div class="stack gap-12">
      ${invoiceBlock(s)}
      ${d ? `<div class="panel">
        <div class="tiny dim">คนขับ</div>
        <div class="row between baseline gap-10" style="margin-top:4px">
          <div><div class="strong">${esc(d.name)}</div><div class="tiny dim">${esc(d.truck)}</div></div>
          <span class="code">${esc(d.plate)}</span>
        </div>
        ${d.phone ? `<a class="btn btn-ghost btn-sm btn-block no-print" style="margin-top:10px" href="tel:${esc(d.phone.replace(/[^0-9+]/g,''))}" data-tel-label="คนขับ ${esc(d.name || '')}">โทรหาคนขับ · ${esc(d.phone)}</a>` : ''}
      </div>` : `<div class="panel"><div class="tiny dim">คนขับ</div><p class="small muted" style="margin-top:4px">ยังไม่ได้จัดรถ</p></div>`}
      ${timingBlock(s)}
    </div>
  </div>

  <hr class="divider" style="margin:22px 0">
  <h4 style="margin-bottom:14px">ประวัติสถานะและหลักฐาน</h4>
  ${signedTimeline(s)}
  ${podScreen(s)}
</div></div>${printExtras(s)}</div>`;
}

function paint(){
  if (!hits.length){
    current = null;
    out.innerHTML = !miss ? '' : `<div class="card card-pad empty"><div class="empty-mark">🔍</div>
      <p class="strong">ไม่พบเลขนี้ในระบบ</p>
      <p class="small dim" style="margin-top:4px">ตรวจตัวอักษรอีกครั้ง หรือติดต่อ${esc(' ' + COMPANY.contact)}</p></div>`;
    return;
  }
  const list = shown();
  current = list[0] || null;
  out.innerHTML = pickBar() + (list.length ? list.map(billHtml).join('')
    : '<div class="card card-pad empty"><p class="small">ติ๊กเลือกอย่างน้อย 1 ใบ</p></div>');
  measureFit();
}

/* ---------- เหตุการณ์ -------------------------------------- */
async function find(code){
  const c = String(code || '').trim();
  if (!c) return toast('กรอกเลขก่อน', 'warn');

  out.innerHTML = '<div class="card card-pad empty"><p class="small dim">กำลังค้นหา…</p></div>';
  hits = await lookup(c);
  picked = new Set(hits.map(h => h.id));
  miss = hits.length ? '' : c;
  input.value = hits.length === 1 ? hits[0].code : c;
  listen([...picked]);
  paint();
  if (!hits.length) return;

  if (hits.length > 1) toast(`เลขนี้มี ${hits.length} ใบ — ติ๊กเลือกใบที่ต้องการได้`, 'ok', 3500);
  history.replaceState(null, '', `?code=${encodeURIComponent(c)}`);
  out.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

form.addEventListener('submit', (e) => { e.preventDefault(); find(input.value); });
on(document, 'change', '[data-pickbill]', (e, b) => {
  b.checked ? picked.add(b.dataset.pickbill) : picked.delete(b.dataset.pickbill);
  listen([...picked]);
  paint();
});
on(document, 'click', '[data-pickall]', () => {
  picked = picked.size === hits.length ? new Set() : new Set(hits.map(h => h.id));
  listen([...picked]);
  paint();
});
/* รอรูปลายเซ็น/ใบ Invoice (ซ่อนอยู่บนจอ) โหลดครบก่อนพิมพ์ ไม่งั้น PDF ได้กรอบว่าง — ไม่เกิน 10 วินาที */
async function printReady(){
  const imgs = [...out.querySelectorAll('.trk-print-only img')].filter(i => !i.complete);
  if (imgs.length) await Promise.race([
    Promise.all(imgs.map(i => new Promise(r => { i.onload = i.onerror = r; }))),
    new Promise(r => setTimeout(r, 10000)),
  ]);
  await measureFit();
}
$('#printBtn').onclick = async () => {
  if (!shown().length) return toast(hits.length ? 'ติ๊กเลือกอย่างน้อย 1 ใบ' : 'ค้นหาเลขก่อน แล้วค่อยดาวน์โหลดใบส่งของ', 'warn');
  await printReady(); window.print();
};
/* ดู POD เปิดเป็นแท็บใหม่ (ผู้ใช้ขอ 31 ต.ค. — เปิดทิ้งไว้แล้วไปทำอย่างอื่นได้)
   แท็บใหม่ = หน้าเดียวกัน ?code=…&sid=…&pod=1 → ค้นเลขเดิม เลือกใบเดิม แล้วเปิดใบ POD เต็มหน้า (รีเฟรชได้) */
$('#podViewBtn').onclick = () => {
  const list = shown();
  if (!list.length) return toast(hits.length ? 'ติ๊กเลือกอย่างน้อย 1 ใบ' : 'ค้นหาเลขก่อน แล้วค่อยดูใบส่งของ', 'warn');
  const q = new URLSearchParams({ code: input.value.trim() || list[0].code, sids: list.map(x => x.id).join(','), pod: '1' });
  const w = window.open(`${location.pathname}?${q}`, '_blank');
  if (!w) podView();   /* เบราว์เซอร์บล็อกแท็บใหม่ (บางแอปในมือถือ) — เปิดในหน้านี้แทน */
};

/* ---------- ดู POD บนจอ (31 ต.ค. — ลูกค้าอยากเช็คในมือถือโดยไม่ต้องดาวน์โหลด / ไม่ต้องมีแอป PDF) ----------
   เบราว์เซอร์ในแอป LINE มักกดพิมพ์ไม่ได้เลย และมือถือบันทึก PDF ยุ่งหลายขั้น → วาดใบเป็นหน้า A4 บนจอแทน
   ใช้ CSS ชุดตอนพิมพ์ (printCss) ใน iframe เหมือน measureFit — เนื้อหาตรงกับไฟล์ที่ดาวน์โหลด
   หน้ากระดาษกว้าง A4 จริง แล้วย่อทั้งก้อนให้พอดีจอ (scale) · ซูมสองนิ้วได้ตามปกติ */
async function podView({ page = false } = {}){
  const A4_W = 210 * MM, A4_H = 297 * MM, A4_PAD = 12 * MM, PV_GAP = 16;   /* MM ประกาศท้ายไฟล์ — อ่านตอนกดปุ่มเท่านั้น */
  if (!out.querySelector('.trk-p1')) return toast('ค้นหาเลขก่อน แล้วค่อยดูใบส่งของ', 'warn');
  const list = shown();
  const s = list.length === 1 ? list[0] : null;
  const box = el(`
<div class="pod-view" role="dialog" aria-modal="true" aria-label="ดูใบส่งของ">
  <div class="pod-view-bar">
    <span class="pod-view-t">ใบส่งของ${s ? ` · ${esc(s.code)}` : list.length > 1 ? ` · ${fmtNum(list.length)} ใบ` : ''}</span>
    <button type="button" class="btn btn-ghost btn-sm" data-pvsave>⬇ ดาวน์โหลด</button>
    ${page ? '' : '<button type="button" class="btn btn-accent btn-sm" data-pvclose>✕ ปิด</button>'}
  </div>
  <div class="pod-view-scroll"><p class="pod-view-wait">กำลังเตรียมใบส่งของ…</p><div class="pod-view-stage"><iframe title="ใบส่งของ"></iframe></div></div>
</div>`);
  document.body.appendChild(box);
  document.body.classList.add('pod-view-open');
  const shut = () => { box.remove(); document.body.classList.remove('pod-view-open'); removeEventListener('keydown', esc_); removeEventListener('resize', fit); };
  const esc_ = (e) => { if (e.key === 'Escape') shut(); };
  addEventListener('keydown', esc_);
  box.querySelector('[data-pvclose]')?.addEventListener('click', shut);
  if (page && list.length) document.title = `ใบส่งของ ${list.map(x => x.code).join(', ')} · ${document.title}`;
  box.querySelector('[data-pvsave]').onclick = async () => { shut(); await printReady(); window.print(); };

  await printReady();
  if (!box.isConnected) return;
  const frame = box.querySelector('iframe');
  const stage = box.querySelector('.pod-view-stage');
  const scroller = box.querySelector('.pod-view-scroll');
  const W = A4_W + PV_GAP * 2;
  const doc = frame.contentDocument;
  const { links, css } = printCss();
  doc.open();
  doc.write(`<!doctype html><html lang="th" data-theme="light"><head><meta charset="utf-8">${links.map(h => `<link rel="stylesheet" href="${h}">`).join('')}<style>${css}
html,body{background:transparent!important;margin:0;color-scheme:light}
.pv-wrap,.pv-wrap *{max-width:none}
.pv-page{box-sizing:border-box;width:${A4_W}px;min-height:${A4_H}px;margin:${PV_GAP}px;padding:${A4_PAD}px;background:#fff;color:#000;
  box-shadow:0 2px 10px rgba(0,0,0,.25);overflow:hidden}
.pv-page > *{margin-top:0!important}
</style></head><body class="${document.body.className.replace('pod-view-open', '')}"></body></html>`);
  doc.close();

  /* ห่อด้วยโครงเดิม (… → #result) ให้กฎที่อิงคลาสแม่ทำงานเหมือนหน้าจริง · หน้าละ .pv-page */
  /* หลายใบ = ต่อกันตามลำดับบนจอ (วันที่ล่าสุดก่อน): หน้าแรกของใบ → หน้ารูปใบ Invoice ของใบนั้น → ใบถัดไป */
  const pages = doc.createElement('div');
  out.querySelectorAll('.trk-bill').forEach(bill => {
    const p1 = bill.querySelector('.trk-p1').cloneNode(true);
    const z = Number(bill.querySelector('.trk-p1').dataset.fit || 1);
    if (z < 1) p1.style.zoom = String(z);
    const first = doc.createElement('div'); first.className = 'pv-page'; first.appendChild(p1); pages.appendChild(first);
    bill.querySelectorAll('.trk-inv-page').forEach(pg => {
      const holder = bill.querySelector('.trk-print-only').cloneNode(false);   /* ให้ display:block ของ .trk-print-only ทำงาน */
      holder.appendChild(pg.cloneNode(true));
      const d = doc.createElement('div'); d.className = 'pv-page'; d.appendChild(holder); pages.appendChild(d);
    });
  });
  let node = pages;
  for (let e = out; e && e !== document.body; e = e.parentElement){
    const c = e.cloneNode(false); c.removeAttribute('style'); c.classList.add('pv-wrap');
    c.style.cssText = 'padding:0;margin:0;width:auto'; c.appendChild(node); node = c;
  }
  doc.body.appendChild(node);
  frame.style.width = `${W}px`;

  function fit(){
    if (!box.isConnected) return;
    const k = Math.min(1, scroller.clientWidth / W);
    const h = doc.documentElement.scrollHeight;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${k})`;
    stage.style.width = `${W * k}px`;
    stage.style.height = `${h * k}px`;
  }
  addEventListener('resize', fit);
  [...doc.images].forEach(i => { if (!i.complete) i.addEventListener('load', fit); });
  doc.fonts?.ready.then(fit);
  fit();
  box.classList.add('is-ready');
}

/* ---------- รีพอร์ต JOBLIST ตามช่วงวันที่ (6 พ.ย. — ลูกค้าขอ · แทนปุ่ม "บันทึกเป็น Excel" รายใบเดิม) ----------
   ช่วงเริ่มต้น = ต้นเดือนนี้ → วันนี้ (เวลาไทย) · ไฟล์ทำใน js/jobReport.js */
const thaiYmd = (d = new Date()) => new Date(d.getTime() + 7 * 3600e3).toISOString().slice(0, 10);
const rptFrom = $('#rptFrom'), rptTo = $('#rptTo');
rptTo.value = thaiYmd();
rptFrom.value = `${rptTo.value.slice(0, 8)}01`;
/* ช่วงวันที่ต้องไม่กลับด้าน (6 พ.ย. — ผู้ใช้แจ้ง: เดิมเลือก 01/11 – 25/10 ได้ แล้วค่อยสลับตอนกด)
   ปฏิทินห้ามเลือกวันสุดท้ายก่อนวันเริ่ม / วันเริ่มหลังวันสุดท้าย (min/max) · พิมพ์เองจนกลับด้าน → ขยับอีกช่องให้เท่ากันทันที
   วันในอนาคตเลือกได้ (ผู้ใช้สั่ง — ไม่มีงานก็แค่ได้ไฟล์ว่าง) */
function rptBounds(){
  rptTo.min = rptFrom.value || '';
  rptFrom.max = rptTo.value || '';
}
function rptFix(changed){
  const from = rptFrom.value, to = rptTo.value;
  if (from && to && from > to){
    if (changed === rptFrom){ rptTo.value = from; toast('วันสุดท้ายต้องไม่ก่อนวันเริ่มต้น — ขยับวันสุดท้ายให้แล้ว', 'warn', 3500); }
    else { rptFrom.value = to; toast('วันเริ่มต้นต้องไม่หลังวันสุดท้าย — ขยับวันเริ่มต้นให้แล้ว', 'warn', 3500); }
  }
  rptBounds();
}
/* เลือกวันเริ่มต้นจากปฏิทินเสร็จ → เด้งปฏิทินวันสุดท้ายต่อเลย (6 พ.ย. — ผู้ใช้ขอ)
   พิมพ์ด้วยคีย์บอร์ดไม่เด้ง (Chrome ยิง change ทุกครั้งที่พิมพ์ครบวันที่ — เด้งกลางคันจะขวาง) · showPicker ใช้ไม่ได้ (Safari บางรุ่น) → โฟกัสช่องแทน */
let rptTyping = 0;
rptFrom.addEventListener('keydown', () => { rptTyping = Date.now(); });
function rptOpenTo(){
  if (Date.now() - rptTyping < 1500) return;
  try{ if (typeof rptTo.showPicker === 'function'){ rptTo.showPicker(); return; } }catch{}
  rptTo.focus();
}
rptFrom.addEventListener('change', () => { rptFix(rptFrom); if (rptFrom.value) setTimeout(rptOpenTo, 50); });
rptTo.addEventListener('change', () => rptFix(rptTo));
rptBounds();
/* ลิงก์ "Job 5 Picture" ในรีพอร์ต = เปิดใบส่งของของใบนั้นบนหน้านี้ (เหมือนปุ่มดูใบส่งของ) */
const podUrl = (s) => `${location.origin}${location.pathname}?${new URLSearchParams({ code: s.code, sids: s.id, pod: '1' })}`;
$('#rptBtn').onclick = async (e) => {
  const from = rptFrom.value, to = rptTo.value;
  if (!from || !to) return toast('เลือกวันที่ให้ครบทั้งสองช่องก่อน', 'warn');
  if (from > to) return rptFix(rptTo);   /* กันไว้อีกชั้น — ปกติ change แก้ให้แล้ว */
  const btn = e.currentTarget, label = btn.textContent;
  btn.disabled = true; btn.textContent = 'กำลังเตรียมรีพอร์ต…';
  try{
    const { downloadJobList } = await import('./jobReport.js');
    const n = await downloadJobList({ from, to, podUrl });
    n ? toast(`ดาวน์โหลดรีพอร์ตแล้ว ${fmtNum(n)} รายการ`, 'ok')
      : toast('ช่วงวันที่นี้ยังไม่มีงานในระบบ', 'warn', 3500);
  }catch(err){ console.error('[track] รีพอร์ต', err); toast(err.message || 'ดาวน์โหลดรีพอร์ตไม่สำเร็จ', 'err', 4500); }
  finally{ btn.disabled = false; btn.textContent = label; }
};

/* ปุ่มโทรบน hero — ใช้เบอร์บริษัทจาก config.js */
if (COMPANY.phone){
  $('#callNum').textContent = COMPANY.phone;
  $('#callBtn').href = `tel:${COMPANY.phone.replace(/[^0-9+]/g, '')}`;
}
$('#adminNums').innerHTML = COMPANY.adminPhones.length
  ? `แอดมิน ${COMPANY.adminPhones.map(n => `<a href="tel:${esc(n.replace(/[^0-9+]/g, ''))}" data-tel-label="แอดมิน">${esc(n)}</a>`).join(' · ')}`
  : '';
bindZoom(out);

/* ---------- PDF: หน้าแรกต้องจบในหน้าเดียว ----------
   ไทม์ไลน์ยาว/รูปเยอะทำให้บรรทัดท้าย ๆ ล้นไปหน้า 2 ก่อนถึงหน้ารูปใบ Invoice → ย่อหน้าแรก (zoom) ให้พอดี A4
   วัดบนจอตรง ๆ ไม่ได้ — ตอนพิมพ์ใช้ CSS อีกชุด (@media print · ไม่ใช้ @media screen) และกว้างเท่ากระดาษ
   จึงจำลองหน้ากระดาษใน iframe ที่ซ่อนไว้: กว้าง A4 ลบขอบ 12 มม. (app.css @page) · ใส่ CSS ทุกกฎแบบตอนพิมพ์ · วัดแล้วย่อ
   คำนวณไว้ล่วงหน้าหลังวาดผล (paint) แล้วใส่ตอน beforeprint — ได้ทั้งปุ่ม "พิมพ์ / บันทึกเป็น PDF" และ Cmd+P */
const MM = 96 / 25.4;
const PAGE_W = (210 - 24) * MM, PAGE_H = (297 - 24) * MM;
let fitRun = 0;   /* ค่าย่อของแต่ละใบเก็บที่ .trk-p1 data-fit */

/** CSS ทั้งหน้าในแบบตอนพิมพ์: กฎ @media print ใช้เลย · @media screen ทิ้ง · ที่เหลือ (ตามความกว้าง) คงไว้ให้ iframe ตัดสินเอง */
function printCss(){
  const links = [], out = [];
  const walk = (rules) => {
    for (const r of rules){
      if (r instanceof CSSMediaRule){
        const m = r.media.mediaText;
        if (/\bprint\b/.test(m)) walk(r.cssRules);
        else if (/\bscreen\b/.test(m) && !/\bprint\b/.test(m)) continue;
        else out.push(r.cssText);
      } else out.push(r.cssText);
    }
  };
  for (const sh of document.styleSheets){
    try{ walk(sh.cssRules); }
    catch{ if (sh.href) links.push(sh.href); }   /* ฟอนต์จาก Google — อ่านกฎข้ามโดเมนไม่ได้ ใส่เป็นลิงก์แทน */
  }
  return { links, css: out.join('\n') };
}

async function measureFit(){
  const run = ++fitRun;
  const all = [...out.querySelectorAll('.trk-p1')];
  if (!all.length) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${PAGE_W}px;height:${PAGE_H}px;border:0;visibility:hidden`;
  document.body.appendChild(frame);
  try{
    const doc = frame.contentDocument;
    const { links, css } = printCss();
    doc.open();
    doc.write(`<!doctype html><html lang="th"><head><meta charset="utf-8">${links.map(h => `<link rel="stylesheet" href="${h}">`).join('')}<style>${css}</style></head><body class="${document.body.className}" style="margin:0"></body></html>`);
    doc.close();
    /* วัดทีละใบในกรอบเดียวกัน (หลายใบติ๊กพร้อมกัน — แต่ละใบขึ้นหน้าใหม่ ย่อของใครของมัน) */
    for (const p1 of all){
      /* ห่อด้วยโครงเดิม (body → … → #result) ให้กฎที่อิงคลาสแม่ทำงานเหมือนหน้าจริง */
      let node = p1.cloneNode(true);
      for (let el = out; el && el !== document.body; el = el.parentElement){
        const c = el.cloneNode(false); c.appendChild(node); node = c;
      }
      doc.body.replaceChildren(node);
      const box = doc.querySelector('.trk-p1');
      const wait = [...doc.images].filter(i => !i.complete).map(i => new Promise(r => { i.onload = i.onerror = r; }));
      await Promise.race([Promise.all([...wait, doc.fonts?.ready]), new Promise(r => setTimeout(r, 4000))]);
      if (run !== fitRun) return;
      /* เผื่อ 4% · ย่อแล้วบรรทัดกว้างขึ้น เนื้อหาเตี้ยลงมากกว่าสัดส่วน — วัดซ้ำทีละรอบ */
      const target = PAGE_H * 0.96;
      let z = 1;
      for (let i = 0; i < 6; i++){
        box.style.zoom = String(z);
        const h = box.getBoundingClientRect().height;
        if (h <= target && (z === 1 || h > target * 0.97)) break;
        z = Math.max(0.4, Math.min(1, z * target / h));
      }
      p1.dataset.fit = String(z);
    }
  }catch(err){ console.warn('[track] วัดหน้าแรกสำหรับพิมพ์ไม่ได้', err); }
  finally{ frame.remove(); }
}
window.addEventListener('beforeprint', () => {
  out.querySelectorAll('.trk-p1').forEach(p1 => { const z = Number(p1.dataset.fit || 1); p1.style.zoom = z < 1 ? String(z) : ''; });
});
window.addEventListener('afterprint', () => { out.querySelectorAll('.trk-p1').forEach(p1 => { p1.style.zoom = ''; }); });

/* ---------- เริ่ม ------------------------------------------ */
/* ไม่มีรายการ "เลขงานในระบบ" ให้กดแล้ว — หน้าสาธารณะต้องไม่เปิดเผยเลขของลูกค้าคนอื่น */
const params = new URLSearchParams(location.search);
const initial = params.get('code');
if (initial) find(initial).then(() => {
  if (params.get('pod') !== '1' || !hits.length) return;
  history.replaceState(null, '', `?${params}`);   /* find() เขียน ?code= ทับ — คืนลิงก์เต็ม รีเฟรชแล้วยังเป็นใบ POD */
  /* ใบที่ติ๊กไว้ในแท็บเดิม (sids) · ลิงก์เก่าก่อน 31 ต.ค. ใช้ sid ใบเดียว */
  const want = new Set(String(params.get('sids') || params.get('sid') || '').split(',').filter(Boolean));
  const keep = hits.filter(h => want.has(h.id)).map(h => h.id);
  if (keep.length){ picked = new Set(keep); listen(keep); paint(); }
  podView({ page:true });
});
