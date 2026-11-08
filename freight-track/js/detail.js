/* ============================================================
   detail.js — ชิ้นส่วนใบงานที่ใช้ร่วมกันระหว่างหน้าหลังบ้านและหน้าติดตาม
   ============================================================ */

import { esc, modal, on } from './ui.js';
import { META, S, getDriver, fmtDate, fmtDateTime, fmtBaht, fmtNum, qty, duration, FLOW, isExternal, driverName, isFailOutcome, outcomeLabel, trackOutcomeLabel } from './store.js';

const ROLE = { customer:'ลูกค้า', ops:'ทีมคลัง', driver:'คนขับ', assistant:'ผู้ช่วยคนขับ', sheet:'ชีต Master' };

/* ---------- เส้นทาง ---------------------------------------- */
export function routeBlock(s){
  return `
<div class="route">
  <div class="route-rail">
    <span class="route-dot fill"></span><span class="route-line"></span><span class="route-dot${s.status === S.DELIVERED ? ' fill' : ''}"></span>
  </div>
  <div class="grow">
    <div class="route-leg">
      <div class="tiny dim">ต้นทาง</div>
      <div class="strong">${esc(s.pickup.name)}</div>
      ${s.pickup.address ? `<div class="small muted">${esc(s.pickup.address)}</div>` : ''}
    </div>
    <div class="route-leg">
      <div class="tiny dim">ปลายทาง</div>
      <div class="strong">${esc(s.dropoff.name)}</div>
      <div class="small muted">${esc(s.dropoff.address)}</div>
      ${s.dropoff.contact ? `<div class="tiny dim" style="margin-top:3px">ผู้รับ: ${esc(s.dropoff.contact)}${s.dropoff.phone ? ' · ' + esc(s.dropoff.phone) : ''}</div>` : ''}
    </div>
  </div>
</div>`;
}

/* ---------- ใบแจ้งหนี้ ------------------------------------- */
export function invoiceBlock(s){
  const i = s.invoice;
  return `
<div class="panel">
  <div class="row between baseline gap-10">
    <div>
      <div class="tiny dim">ใบแจ้งหนี้</div>
      <div class="mono strong">${esc(i.number)}</div>
    </div>
    ${i.public ? '' : `<div style="text-align:right">
      <div class="tiny dim">มูลค่าสินค้า</div>
      <div class="mono strong">${esc(fmtBaht(i.amount))}</div>
    </div>`}
  </div>
  ${i.public ? '' : i.fileName ? `
  <div class="file-chip" style="margin-top:12px">
    ${i.dataUrl
      ? `<img class="file-thumb" src="${i.dataUrl}" alt="ใบแจ้งหนี้" data-zoom="${i.dataUrl}" style="cursor:zoom-in">`
      : `<span class="file-thumb" style="display:grid;place-items:center;font-size:10px;font-weight:600;color:var(--text-3)">PDF</span>`}
    <span class="grow trunc">${esc(i.fileName)}</span>
    <span class="tiny dim">แนบมากับใบงาน</span>
  </div>` : '<p class="tiny dim" style="margin-top:10px">ไม่ได้แนบไฟล์</p>'}
</div>`;
}

/* ---------- สินค้า ----------------------------------------- */
export function cargoBlock(s){
  return `
<dl class="kv">
  <dt>สินค้า</dt><dd>${esc(s.cargo.desc)}</dd>
  <dt>จำนวน</dt><dd class="mono">${esc(qty(s.cargo))}</dd>
  <dt>น้ำหนัก</dt><dd class="mono">${fmtNum(s.cargo.weightKg)} กก.</dd>
  <dt>วันที่ส่ง</dt><dd>${esc(fmtDate(s.serviceDate))}</dd>
  ${s.cargo.note ? `<dt>หมายเหตุ</dt><dd>${esc(s.cargo.note)}</dd>` : ''}
</dl>`;
}

/* ---------- คนขับ ------------------------------------------ */
export function driverBlock(s){
  const d = s.driverId ? getDriver(s.driverId) : null;
  if (!d) return `<div class="panel"><div class="tiny dim">คนขับ</div><p class="small muted" style="margin-top:4px">ยังไม่ได้จ่ายงาน</p></div>`;
  const meta = [d.truck, d.phone].filter(Boolean).join(' · ');
  return `
<div class="panel">
  <div class="row between baseline gap-8">
    <div class="tiny dim">คนขับที่รับผิดชอบ</div>
    ${isExternal(d) ? '<span class="pill" data-tone="ware">คนขับภายนอก</span>' : ''}
  </div>
  <div class="row between baseline gap-10" style="margin-top:4px">
    <div>
      <div class="strong">${esc(driverName(d))}</div>
      ${meta ? `<div class="tiny dim">${esc(meta)}</div>` : ''}
    </div>
    <span class="code">${esc(d.plate)}</span>
  </div>
</div>`;
}

/* ---------- ไทม์ไลน์ --------------------------------------- */
/**
 * @param {object} s ใบงานหรือเที่ยว
 * @param {{audience?:'ops'|'driver'|'track'}} opts audience:'driver' = ซ่อนเหตุการณ์ที่ติดป้าย scope:'ops' · 'track' = หน้าติดตามลูกค้า (ส่งไม่สมบูรณ์)
 *        (เช่น การแก้ค่ารอบ ซึ่งมียอดรวมของทุกคนอยู่ในนั้น)
 */
/* หน้าคนขับเป็นภาษาไทยทั้งหมด (27 ต.ค.) — บันทึกเก่าที่ระบบเขียนไว้เป็นอังกฤษ แปลตอนแสดง ไม่แก้ข้อมูล */
const driverText = (t) => String(t).replace(/ไฟล์ Excel/g, 'ไฟล์ตาราง').replace(/ใบ Invoice|Invoice/g, 'เลขที่บิล').replace(/\bInv\./g, 'เลขที่บิล');

export function timeline(s, opts = {}){
  /* เหตุการณ์เก่าที่บันทึกไว้ก่อนมีป้าย scope ก็มียอดรวมของทุกคนอยู่เหมือนกัน
     จึงกรองด้วยเนื้อความเพิ่มอีกชั้น ไม่ต้องไปไล่แก้ข้อมูลเดิม */
  const opsOnly = (e) => e.scope === 'ops' || /^ค่ารอบ:/.test(e.note || '');
  const evs = opts.audience === 'driver'
    ? (s.events || []).filter(e => !opsOnly(e))
    : (s.events || []);
  if (!evs.length) return '<p class="small dim">ยังไม่มีประวัติ</p>';
  const items = evs.slice().reverse().map((e, idx, arr) => {
    /* ปิดจุดแบบส่งไม่สำเร็จ (ลูกค้าไม่รับ / คืนสินค้า / ร้านปิด) — ป้ายแดงแทน "ส่งแล้ว" */
    const m = e.status === S.DELIVERED && isFailOutcome(e.outcome)
      ? { label: (opts.audience === 'track' ? trackOutcomeLabel : outcomeLabel)(e.outcome), tone:'stop' }   /* หน้าติดตาม = "ส่งไม่สมบูรณ์" */
      : e.addTo ? { label: 'เพิ่มรูปหลังส่ง', tone:'done' }   /* store.js addDeliveryPhotos */
      : e.whReturn ? { label: e.label || 'คืนของเข้าคลัง', tone:'ware' }   /* store.js recordWhReturn */
      : (META[e.status] || { label:e.status, tone:'grey' });
    const prev = arr[idx + 1];
    const gap = prev ? duration(prev.at, e.at) : null;
    /* opts.signInline (หน้าติดตาม) — กล่องลายเซ็นแยกวางทางขวาของรูปส่งมอบ ใหญ่กว่ารูป (css/track.css .tl-proof) */
    const inlineSign = opts.signInline && e.signature;
    return `
<li class="tl-item" data-tone="${m.tone}">
  <div class="tl-head">
    <span class="tl-title">${esc(m.label)}</span>
    <span class="tl-meta">${esc(fmtDateTime(e.at))}</span>
    ${gap ? `<span class="tl-meta" style="color:var(--text-3)">+${esc(gap)}</span>` : ''}
  </div>
  <div class="tl-body">
    โดย ${esc(e.byName)} <span class="dim">(${esc(ROLE[e.byRole] || e.byRole)})</span>
    ${e.note ? `<br>${esc(opts.audience === 'driver' ? driverText(e.note) : e.note)}` : ''}
    ${e.geo ? `<br><span class="tiny mono dim">พิกัด ${e.geo.lat}, ${e.geo.lng} (±${e.geo.acc} ม.)</span>` : ''}
  </div>
  ${inlineSign ? `<div class="tl-proof">
    ${e.photos?.length ? `<div class="photo-grid">${
      e.photos.map(p => `<img src="${p}" alt="รูปหน้างาน" data-zoom="${p}" style="cursor:zoom-in" loading="lazy">`).join('')
    }</div>` : ''}
    <div class="tl-sign">
      <div class="tiny dim">ลายเซ็นผู้รับ</div>
      <img src="${e.signature}" alt="ลายเซ็นผู้รับ" data-zoom="${e.signature}">
    </div>
  </div>` : e.photos?.length ? `<div class="photo-grid" style="margin-top:9px">${
    e.photos.map(p => `<img src="${p}" alt="รูปหน้างาน" data-zoom="${p}" style="cursor:zoom-in" loading="lazy">`).join('')
  }</div>` : ''}
  ${e.invoicePhotos?.length ? `
  <div style="margin-top:9px">
    <div class="tiny dim" style="margin-bottom:4px">รูปใบ Invoice</div>
    <div class="photo-grid">${e.invoicePhotos.map(p => `<img src="${p}" alt="รูปใบ Invoice" data-zoom="${p}" style="cursor:zoom-in" loading="lazy">`).join('')}</div>
  </div>` : ''}
  ${e.signature && !inlineSign ? `
  <div style="margin-top:9px">
    <div class="tiny dim" style="margin-bottom:4px">ลายเซ็นผู้รับ</div>
    <img src="${e.signature}" alt="ลายเซ็นผู้รับ" style="max-width:240px;border:1px solid var(--line);border-radius:8px;background:#fff">
  </div>` : ''}
</li>`;
  }).join('');
  return `<ul class="tl">${items}</ul>`;
}

/* ---------- สรุปเวลาเดินทาง -------------------------------- */
export function timingBlock(s){
  const at = {};
  s.events.forEach(e => { at[e.status] ??= e.at; });
  const rows = [
    ['อยู่ในคลังก่อนขึ้นรถ', at[S.RECEIVED], at[S.LOADED]],
    ['เวลาเดินทาง',          at[S.DEPARTED], at[S.ARRIVED]],
    ['เวลาลงของ',            at[S.ARRIVED],  at[S.DELIVERED]],
    ['รวมทั้งงาน',           at[S.NEW],      at[S.DELIVERED]],
  ].filter(r => r[1] && r[2]);
  if (!rows.length) return '';
  return `
<div class="panel">
  <div class="tiny dim" style="margin-bottom:6px">สรุปเวลา</div>
  <dl class="kv">${rows.map(([k, a, b]) => `<dt>${esc(k)}</dt><dd class="mono">${esc(duration(a, b))}</dd>`).join('')}</dl>
</div>`;
}

/* ---------- ซูมรูป ----------------------------------------- */
export function bindZoom(root){
  on(root, 'click', '[data-zoom]', (e, img) => {
    e.stopPropagation();
    modal({
      title: 'รูปหลักฐาน',
      wide: true,
      body: `<img src="${img.dataset.zoom}" alt="รูปหลักฐานขนาดเต็ม" style="width:100%;border-radius:10px">`,
    });
  });
}

/* ---------- ความคืบหน้าเป็นข้อความ -------------------------- */
export const progressText = (s) => {
  if (s.status === S.CANCELLED) return 'งานนี้ถูกยกเลิก';
  const i = FLOW.indexOf(s.status);
  return `ขั้นที่ ${i + 1} จาก ${FLOW.length} · ${META[s.status].label}`;
};
