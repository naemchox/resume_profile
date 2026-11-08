/* ============================================================
   opsAuto.js — รายการไฟล์ของวันนี้ + sync เลข Invoice / Shipment No. / คนขับ

   ไฟล์ขาวเข้ามาได้สองทาง แต่ไปจบที่เดียวกัน
     · ลูกค้าส่งเข้า LINE OA
     · แอดมินลากไฟล์มาวางในหน้านี้ (ส่งไป Apps Script ตัวเดียวกัน)
   Apps Script ตรวจหัวตาราง → เก็บไฟล์ลง Google Drive → ต่อแถวลงแท็บ "แถวจากไฟล์ LINE"
   หน้านี้ดึงแถวจากแท็บนั้น (ตอนเปิดหน้า · ทุก 60 วินาที · ปุ่ม "ตรวจเดี๋ยวนี้")
   ทุกเครื่องจึงเห็นรายการไฟล์ชุดเดียวกัน ไม่ผ่าน Firebase

   ใช้เฉพาะไฟล์ของ "วันนี้" (เวลาไทย) — ขึ้นวันใหม่รายการเริ่มใหม่
   ไฟล์เก่าเมื่อวานจะไม่มาทับเลขที่ถูกแล้ว

   รวมหลายไฟล์ของวันเดียวกันต่อเลข Delivery — ไล่ตามลำดับเวลา แต่ละช่องใช้ค่าล่าสุดที่ "ไม่ว่าง"
   ไฟล์หลังที่ช่อง Invoice ว่างจึงไม่ลบเลข Invoice ที่ไฟล์ก่อนให้มาแล้ว

   กติกาการอัปเดต — จงใจไม่ทับทุกกรณี
     จุดส่งที่ยังใช้เลข 5 (รอ Invoice) → เปลี่ยนเป็นเลข Invoice + Shipment No. + รวมงานให้เลย
     จุดส่งที่มีเลข Invoice จริงอยู่แล้ว แต่ไฟล์บอกเลขอื่น → ไม่แตะ ขึ้นให้ยืนยันเอง
   ============================================================ */

import { $, esc, toast, modal, close, on, confirmDialog } from './ui.js';
import { planDeliverySync, findStopByInvoice, syncStopCodes, syncStopAmounts, findStopsByDelivery, tidyJobs, fmtNum, fmtBaht,
         markDupInvoices, clearDupInvoice, ackBillReport, billWatch, getJob, getDriver, driverName, subscribe, S, META,
         healInvoiceReturns } from './store.js';
import { sheetApiUrl, hasSheetApi } from './driverSheet.js';
import { gate, canWrite } from './auth.js';
import { apiGet, apiPost } from './api.js';

const POLL_MS = 60_000;                /* ดึงซ้ำทุก 1 นาที */
const SEEN_KEY = 'ft.opsAuto.seen';   /* จำว่าเตือนอะไรไปแล้ว กันแจ้งซ้ำทุกนาที */
/* รออัปโหลดได้ 5 นาที — Apps Script ใช้ 60–85 วิ ต่อไฟล์ (24 ต.ค.) และทำได้นานสุด 6 นาทีต่อครั้ง
   ตั้ง 60 วิ เว็บตัดทิ้งก่อนทั้งที่ไฟล์เข้าระบบแล้ว คนกดลองใหม่ = ไฟล์ซ้ำใน Drive */
const TIMEOUT = 300_000;

let conflicts = [];
let last = { state:'idle', files:[], at:null };
/* ทุกแถวจากชีตรอบล่าสุด (ทุกวัน) — หน้าต่าง "ปิดงานด่วน" ใช้หาแถวไฟล์ขาวที่ยังไม่ได้จับคู่ */
let lastRows = [];

/** แถวจากไฟล์ขาวที่เลข Delivery ยังไม่ตรงกับจุดส่งไหนเลย — ใหม่สุดก่อน · ต้อง sync อย่างน้อยหนึ่งรอบ */
export function unmatchedRows(){
  const seen = new Set();
  return lastRows.slice()
    .sort((a, b) => (parseAt(b.at) || 0) - (parseAt(a.at) || 0))
    .filter(r => r.delivery && !seen.has(r.delivery) && seen.add(r.delivery) && !findStopsByDelivery(r.delivery).length);
}
export const hasSyncedRows = () => lastRows.length > 0;
let running = null;

/* ---------- วันที่แบบเวลาไทย -------------------------------- */
const BKK = 7 * 3600e3;
/** Date → '2026-09-28' ตามเวลาไทย */
export const dayKey = (d) => new Date(d.getTime() + BKK).toISOString().slice(0, 10);

/** เวลาที่ชีตส่งมา — ใหม่เป็น ISO '2026-09-28T01:02:03+07:00'
 *  แถวเก่าเป็นแบบ Date.toString() 'Sat Sep 19 2026 11:20:30 GMT+0700 (เวลาอินโดจีน)' */
function parseAt(s){
  const t = String(s || '').replace(/\s*\(.*\)\s*$/, '').trim();
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtHM = (d) => d ? d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Bangkok' }) : '';
const fmtDay = (d) => d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Bangkok' });

/* ---------- จำสิ่งที่เคยเตือนไปแล้ว -------------------------- */
const loadSeen = () => {
  try{ return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); }
  catch(e){ return new Set(); }
};
const saveSeen = (set) => {
  try{ sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-3000))); }catch(e){}
};

/* ---------- ดึงแถวจากชีต ------------------------------------ */
async function fetchRows(){
  /* แนบโทเคนพนักงานไปด้วย — Apps Script เช็คก่อนส่งแถวจากไฟล์ลูกค้าให้ (api.js) */
  const data = await apiGet({ action:'jobs' });
  return data.rows || [];
}

/** แถวของวันนี้ จัดเป็นรายไฟล์ตามลำดับที่เข้ามา */
function todayFiles(rows){
  const today = dayKey(new Date());
  const files = [];
  const byKey = new Map();
  for (const r of rows){
    const at = parseAt(r.at);
    if (!at || dayKey(at) !== today) continue;
    const k = `${r.at}|${r.file}`;
    let f = byKey.get(k);
    if (!f){
      f = { key:k, at, file: r.file || '(ไม่มีชื่อไฟล์)', source: r.source || 'LINE', rows: [] };
      byKey.set(k, f); files.push(f);
    }
    f.rows.push(r);
  }
  files.sort((a, b) => a.at - b.at);
  return files;
}

/** รวมทุกไฟล์ของวันนี้ต่อเลข Delivery — ช่องไหนไฟล์หลังว่าง ใช้ค่าจากไฟล์ก่อน
 *  แถวที่ไม่มีเลข 5 แต่มีเลข Invoice (บิลค้างที่ DC / งานซ่อม) ใช้คีย์ "#inv:เลข" แล้วจับคู่ด้วยเลข Invoice แทน (31 ต.ค.) */
const rowKey = (r) => r.delivery || (INV_RE.test(String(r.invoice || '').trim()) ? `#inv:${String(r.invoice).trim()}` : '');
/** แผน sync ของหนึ่งคีย์ — แถวคีย์ Invoice ใช้จุดที่ findStopByInvoice เจอ (ต้องเจอใบเดียว) */
function planOf(m){
  if (m.delivery) return planDeliverySync(m);
  const x = findStopByInvoice(m.invoice, m.serviceDate);
  return x ? planDeliverySync({ ...m, stops:[x] }) : null;
}
function mergeByDelivery(files){
  const out = new Map();
  const isInv = (v) => /\d{4,}/.test(String(v || ''));
  for (const f of files){
    for (const r of f.rows){
      const key = rowKey(r);
      if (!key) continue;
      const m = out.get(key) || { delivery: r.delivery || '', invoice:'', shipmentNo:'', drivers:'', serviceDate:'', file:f.file };
      if (isInv(r.invoice)) m.invoice = r.invoice;
      if (r.shipmentNo) m.shipmentNo = r.shipmentNo;
      if (r.serviceDate) m.serviceDate = r.serviceDate;   /* ช่อง B "วันที่ออกเดินทาง" — วันของงาน */
      if (r.drivers) m.drivers = r.drivers;
      m.file = f.file;
      out.set(key, m);
    }
  }
  return out;
}

/* ---------- เลขบิลซ้ำ (28 ต.ค.) ------------------------------
   เลข Invoice เดียวกัน (ทุกแบบ ไม่ใช่แค่เลข 8) คนละ Delivery ในวันเดียวกัน = ซ้ำ
   "วันเดียวกัน" = วันที่ออกเดินทาง (ช่อง B) · ว่าง = วันที่ได้รับไฟล์
   แต่ละ Delivery ใช้เลขล่าสุดที่ส่งมา — ลูกค้าส่งไฟล์ที่แก้แล้ว กลุ่มนั้นหายเอง
   กติกาเดียวกับ dupInvoiceText_() ใน apps-script-client/LineOA.js (ตอบกลับใน LINE) — แก้ที่หนึ่งต้องแก้อีกที่ */
const INV_RE = /^(?=.*\d{4})[A-Za-z0-9][A-Za-z0-9\-\/]{4,}$/;   /* เลข Invoice ทุกแบบ (8… · 3… · H…) — กติกาเดียวกับ isInvoiceNo() ใน xlsxImport.js · 31 ต.ค. */
/** @returns {{day:string, invoice:string, deliveries:string[]}[]} */
export function dupGroups(rows){
  const latest = new Map();                       /* day|delivery → invoice */
  rows.slice().sort((a, b) => (parseAt(a.at) || 0) - (parseAt(b.at) || 0)).forEach(r => {
    if (!r.delivery) return;
    const at = parseAt(r.at);
    const day = r.serviceDate || (at ? dayKey(at) : '');
    latest.set(`${day}|${r.delivery}`, { day, delivery: r.delivery, invoice: String(r.invoice || '').trim() });
  });
  const groups = new Map();
  for (const r of latest.values()){
    if (!INV_RE.test(r.invoice)) continue;
    const k = `${r.day}|${r.invoice}`;
    if (!groups.has(k)) groups.set(k, { day: r.day, invoice: r.invoice, deliveries: [] });
    groups.get(k).deliveries.push(r.delivery);
  }
  return [...groups.values()].filter(g => g.deliveries.length > 1)
    .map(g => ({ ...g, deliveries: g.deliveries.sort() }));
}
let lastDups = [];

/* ---------- ตัวหลัก ----------------------------------------- */
/**
 * sync ทุกไฟล์ของวันนี้เข้ากับงานในระบบ — รอบอัตโนมัติและปุ่ม "ตรวจเดี๋ยวนี้" ใช้ตัวเดียวกัน
 * @param {{quiet?:boolean}} opts quiet:true = ไม่ขึ้น toast ถ้าไม่มีอะไรเปลี่ยน
 * @returns {Promise<object|null>} ผลของรอบนี้ (done, moved, held, warns, failed, unknown, conflicts)
 */
export async function runSync(opts = {}){
  /* รอบก่อนยังไม่จบ (เช่น เพิ่งวางไฟล์ระหว่างรอบอัตโนมัติ) — รอให้จบแล้วค่อยทำรอบใหม่ */
  while (running) { try{ await running; }catch(e){} }
  running = doSync(opts);
  try{ return await running; }
  finally{ running = null; }
}

async function doSync({ quiet = true } = {}){
  if (!hasSheetApi()){ last = { state:'off', files:[] }; paintBar(); return null; }

  last = { ...last, state:'working' };
  paintBar();
  try{
    const rows  = await fetchRows();
    lastRows = rows;
    const files = todayFiles(rows);

    /* งานเลขซ้ำจากหลายเครื่อง / งานเลข 5 ที่ว่าง — จัดให้เรียบร้อยก่อนเทียบ */
    const tidy = tidyJobs();

    const merged = mergeByDelivery(files);
    /* เลขบิลซ้ำ — 31 ต.ค. เลิกพักเลขแล้ว (ส่งไม่สำเร็จแล้วส่งใหม่ใช้ Invoice เดิมเป็นเรื่องปกติ)
       ใส่เลขให้ทุก Delivery: ใบแรกได้เลขเปล่า ใบหลังได้เลขต่อท้าย -2 -3 (store.js syncStopCodes)
       ป้าย dupInv ติดไว้จนทุก Delivery ได้เลขจริง · ป้ายบนบิลตลอดไปมาจาก reusedOf() */
    lastDups = dupGroups(rows);
    /* ชีตตอบกลับมาว่าง (เพิ่งล้างแท็บ / อ่านไม่ครบ) — ห้ามถอดป้ายทุกจุดตามกลุ่มว่าง */
    const dupMarked = rows.length ? markDupInvoices(lastDups, { byRole:'ops', byName:'ระบบ (เลขบิลซ้ำ)' }) : 0;
    const updates = [], found = [], unknown = new Set();
    for (const m of merged.values()){
      const r = m;
      const plan = planOf(r);
      if (!plan) continue;
      plan.safe.forEach(u => updates.push({ ...u, file:r.file }));
      plan.conflict.forEach(u => found.push({ ...u, file:r.file }));
      plan.unknownDrivers.forEach(n => unknown.add(n));
    }

    const r = updates.length
      ? syncStopCodes(updates, { byRole:'ops', byName:'ระบบ (ไฟล์ของวันนี้)', note:'อัปเดตจากไฟล์ของวันนี้' })
      : { done:[], failed:[], moved:[], held:[], warns:[] };
    r.warns = [...tidy.warns, ...(r.warns || [])];

    /* มูลค่า (Amount) — ใช้ทุกแถวที่ชีตส่งมา ไม่เฉพาะไฟล์ของวันนี้
       งานที่ sync เลขไปแล้วเมื่อวานก็ได้มูลค่าด้วย · เรียงเก่า→ใหม่ ไฟล์ล่าสุดชนะ */
    const byTime = rows.slice().sort((a, b) => (parseAt(a.at) || 0) - (parseAt(b.at) || 0));
    r.amounts = syncStopAmounts(byTime, { byRole:'ops', byName:'ระบบ (ไฟล์ขาว)' });
    r.unknown = [...unknown];
    r.conflicts = found;
    r.dups = lastDups;
    if (dupMarked) paintWatch();

    if (r.amounts && !r.done.length) toast(`ใส่มูลค่าจากไฟล์แล้ว ${fmtNum(r.amounts)} จุดส่ง`, 'ok');
    if (r.done.length){
      const jobs = new Set((r.moved || []).map(m => m.to)).size;
      toast(`อัปเดตจากไฟล์ของวันนี้ ${fmtNum(r.done.length)} จุดส่ง${jobs ? ` · รวมเป็น ${fmtNum(jobs)} งาน` : ''}`, 'ok');
    }
    if (r.held.length) toast(`มี ${fmtNum(r.held.length)} จุดที่ไม่ได้ย้ายเข้างานตาม Shipment No. — ${r.held[0].msg}`, 'warn');
    if (!quiet) r.warns.forEach(w => toast(w, 'warn'));

    /* จุดที่เลขไม่ตรง — ไม่แตะ รอคนตัดสิน และเตือนครั้งเดียวพอ */
    conflicts = found;
    const seen = loadSeen();
    const fresh = found.filter(c => !seen.has(`${c.delivery}|${c.code}`));
    if (fresh.length && quiet) toast(`มี ${fmtNum(fresh.length)} จุดที่เลขไม่ตรงกับไฟล์ ต้องยืนยันก่อน`, 'warn');
    found.forEach(c => seen.add(`${c.delivery}|${c.code}`));
    saveSeen(seen);

    if (!quiet && !r.done.length && !found.length){
      toast(files.length ? 'ไฟล์ของวันนี้ sync ครบแล้ว ไม่มีอะไรค้าง' : 'วันนี้ยังไม่มีไฟล์เข้ามา', 'ok');
    }

    last = { state:'ok', files, merged, at:new Date() };
    paintBar();
    return r;
  }catch(err){
    last = { ...last, state:'error', msg:err.message };
    paintBar();
    if (!quiet) toast(err.message, 'err');
    return null;
  }
}

/* ---------- ส่งไฟล์ที่ลากมาวางขึ้น Apps Script ------------------ */
/** @param {{onRead?:(frac:number)=>void, onSent?:()=>void}} hooks  บอกความคืบหน้าให้แถบในหน้าจอ
 *  @returns {Promise<{rows:number, sheet:string}>} */
export async function uploadFile(file, hooks = {}){
  const url = sheetApiUrl();
  if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์เชื่อมชีต — ตั้งได้ที่หน้าข้อมูลคนขับ');
  if (!/\.xlsx$/i.test(file.name)) throw new Error('รับเฉพาะไฟล์ .xlsx — ถ้าเป็น .xls ให้เปิดใน Excel แล้ว Save As เป็น .xlsx ก่อน');

  const data = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onprogress = (e) => { if (e.lengthComputable) hooks.onRead?.(e.loaded / e.total); };
    fr.onload = () => { hooks.onRead?.(1); resolve(String(fr.result).split(',')[1] || ''); };
    fr.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'));
    fr.readAsDataURL(file);
  });

  hooks.onSent?.();
  /* แนบโทเคนพนักงาน (api.js) — Apps Script ไม่รับไฟล์จากคนที่ไม่ได้ล็อกอิน */
  return apiPost({ action:'upload', fileName:file.name, data, by:'หน้า ops' }, { timeout:TIMEOUT });
}

/* ---------- สถานะรายไฟล์ ------------------------------------ */
/** ดูผลปัจจุบันของทุกเลข Delivery ในไฟล์นี้ — คำนวณสด ๆ จากงานในระบบ จึงตรงความจริงเสมอ */
function fileStatus(f){
  const st = { ok:0, wait:0, conflict:0, pending:0 };
  const seen = new Set();
  for (const r of f.rows){
    const key = rowKey(r);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const m = last.merged?.get(key) || r;
    const plan = r.delivery ? (findStopsByDelivery(r.delivery).length ? planDeliverySync(m) : null) : planOf(m);
    if (!plan){ st.wait++; continue; }
    if (plan.conflict.length) st.conflict++;
    else if (plan.safe.length) st.pending++;
    else st.ok++;
  }
  return st;
}

/* ---------- แถบรายการไฟล์ของวันนี้ ---------------------------- */
function paintBar(){
  const bar = $('#autoSyncBar');
  if (!bar) return;

  if (last.state === 'off'){
    bar.innerHTML = `
      <p class="tiny dim" style="margin:0">
        ยังไม่ได้เชื่อมกับ Google Sheet — ไฟล์จาก LINE และไฟล์ที่ลากมาวางจะยังไม่เข้าระบบ
        ตั้งลิงก์ได้ที่หน้า <a href="drivers.html" style="color:var(--amber-dim);text-decoration:underline">ข้อมูลคนขับ</a>
      </p>`;
    return;
  }

  const files = last.files || [];
  const head = last.state === 'working' ? 'กำลังตรวจไฟล์ของวันนี้…'
    : last.state === 'error' ? `<span style="color:#b06">ดึงข้อมูลจากชีตไม่สำเร็จ — ${esc(last.msg)}</span>`
    : `ตรวจล่าสุด ${esc(fmtHM(last.at))} น.`;

  const lines = files.map(f => {
    const st = fileStatus(f);
    const bits = [`${fmtNum(f.rows.length)} แถว`];
    if (st.ok)       bits.push(`<span style="color:var(--green)">sync แล้ว ${fmtNum(st.ok)}</span>`);
    if (st.pending)  bits.push(`<span style="color:var(--amber-dim)">ยังไม่ได้ย้าย ${fmtNum(st.pending)}</span>`);
    if (st.wait)     bits.push(`<span class="dim">รอไฟล์เหลือง ${fmtNum(st.wait)}</span>`);
    if (st.conflict) bits.push(`<span style="color:#b06">⚠ ต้องยืนยัน ${fmtNum(st.conflict)}</span>`);
    return `
      <div class="row gap-10" style="padding:7px 0;border-top:1px solid var(--line);align-items:baseline;flex-wrap:wrap">
        <span class="tiny mono" style="min-width:42px">${esc(fmtHM(f.at))}</span>
        <span class="dchip ${f.source === 'LINE' ? 'ok' : 'warn'}" style="margin:0">${esc(f.source)}</span>
        <span class="small trunc grow" style="min-width:160px" title="${esc(f.file)}">${esc(f.file)}</span>
        <span class="tiny">${bits.join(' · ')}</span>
      </div>`;
  }).join('');

  bar.innerHTML = `
    <div class="row between wraps gap-10" style="align-items:baseline">
      <p class="small strong" style="margin:0">ไฟล์ของวันนี้ · ${esc(fmtDay(new Date()))}
        <span class="tiny dim" style="font-weight:400;margin-left:6px">${head}</span></p>
      <button class="btn btn-quiet btn-sm" id="autoSyncNow" ${last.state === 'working' ? 'disabled' : ''}>ตรวจเดี๋ยวนี้</button>
    </div>
    <div style="margin-top:8px">
      ${lines || '<p class="tiny dim" style="margin:6px 0 0">ยังไม่มีไฟล์เข้ามาวันนี้ — ส่งเข้า LINE OA หรือลากไฟล์มาวางด้านล่าง</p>'}
    </div>
    ${conflicts.length ? conflictPanel() : ''}`;

  const btn = $('#autoSyncNow');
  if (btn) btn.onclick = () => runSync({ quiet:false });
  bindConflict();
}

function conflictPanel(){
  return `
    <div class="panel" style="margin-top:10px;border-color:var(--amber)">
      <p class="small strong" style="margin:0">
        ${fmtNum(conflicts.length)} จุดที่ไฟล์บอกเลขไม่ตรงกับในระบบ — ไม่ได้แก้ให้อัตโนมัติ
      </p>
      <p class="tiny dim" style="margin:4px 0 10px">
        จุดพวกนี้มีเลข Invoice จริงอยู่แล้ว การเปลี่ยนเลขอาจทำให้อ้างอิงผิดใบ จึงขอให้ยืนยันเอง
      </p>
      <div class="rv-wrap" style="max-height:220px">
        <table class="rv">
          <thead><tr><th style="width:34px"><input type="checkbox" id="acAll"></th>
            <th>เลขในระบบ</th><th>เลขในไฟล์</th><th>Shipment No.</th><th>Delivery</th><th>ปลายทาง</th><th>ไฟล์</th></tr></thead>
          <tbody>
            ${conflicts.map((c, i) => `
              <tr>
                <td><input type="checkbox" data-ac="${i}"></td>
                <td><span class="code">${esc(c.from)}</span></td>
                <td><span class="code">${esc(c.code)}</span></td>
                <td class="tiny mono">${esc(c.shipmentNo || '—')}</td>
                <td class="tiny dim mono">${esc(c.delivery)}</td>
                <td class="tiny dim trunc" style="max-width:200px">${esc(c.dest)}</td>
                <td class="tiny dim trunc" style="max-width:180px">${esc(c.file || '')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="row between wraps gap-10" style="margin-top:10px">
        <span class="tiny dim">เลขเดิมจะถูกเก็บเป็นเลขอ้างอิงรอง ค้นด้วยเลขเก่ายังเจอ</span>
        <button class="btn btn-accent btn-sm" id="acGo">ยืนยันเปลี่ยนเลขที่เลือก</button>
      </div>
    </div>`;
}

function bindConflict(){
  const all = $('#acAll');
  if (all){
    all.onchange = (e) => document.querySelectorAll('#autoSyncBar [data-ac]')
      .forEach(cb => { cb.checked = e.target.checked; });
  }
  const go = $('#acGo');
  if (go){
    go.onclick = () => {
      const picked = [...document.querySelectorAll('#autoSyncBar [data-ac]')]
        .filter(cb => cb.checked).map(cb => conflicts[+cb.dataset.ac]);
      if (!picked.length) return toast('ยังไม่ได้เลือกจุดไหน', 'warn');
      const r = syncStopCodes(picked, {
        byRole:'ops', byName:'ทีมคลัง',
        note:'ยืนยันเปลี่ยนเลขตามไฟล์ของวันนี้',
      });
      toast(`เปลี่ยนเลขแล้ว ${fmtNum(r.done.length)} จุดส่ง`, r.failed.length ? 'warn' : 'ok');
      conflicts = conflicts.filter(c => !picked.includes(c));
      runSync({ quiet:true });
    };
  }
}

/* ---------- แถบแจ้งเตือนค้าง: เลขบิลซ้ำ + คนขับแจ้งเลขบิล (28 ต.ค.) ----------
   อยู่บนสุดของหน้า ops ปิดเองไม่ได้ — หายเมื่อแก้เลขจนไม่ซ้ำ หรือกดเคลียร์ในหน้าต่าง
   อ่านจากป้ายบนจุดส่ง (store.js billWatch) จึงเห็นตรงกันทุกเครื่อง */
function paintWatch(){
  let bar = $('#billWatch');
  if (!bar){
    bar = document.createElement('div');
    bar.id = 'billWatch';
    bar.className = 'bill-watch no-print';
    bar.setAttribute('role', 'alert');
    const head = $('main.page .page-head');
    head ? head.after(bar) : $('main')?.prepend(bar);
  }
  const { groups, reports } = billWatch();
  if (!groups.length && !reports.length){ bar.hidden = true; bar.innerHTML = ''; return; }
  bar.hidden = false;
  const bits = [];
  if (groups.length) bits.push(`เลขบิลซ้ำ <b>${fmtNum(groups.length)}</b> เลข (${fmtNum(groups.reduce((a, g) => a + g.stops.length, 0))} จุดส่ง)`);
  if (reports.length) bits.push(`คนขับแจ้งเลขบิลไม่ตรง <b>${fmtNum(reports.length)}</b> จุด`);
  bar.innerHTML = `
    <span class="bill-watch-ic" aria-hidden="true">⚠</span>
    <span class="grow">${bits.join(' · ')}
      <span class="bill-watch-sub">ตรวจกับใบบิลจริงว่าเป็นงานส่งใหม่ หรือไฟล์พิมพ์เลขผิด — แถบนี้หายเองเมื่อทุก Delivery ได้เลขแล้ว</span></span>
    <button type="button" class="btn btn-sm bill-watch-btn" data-billwatch>จัดการ →</button>`;
  bar.querySelector('[data-billwatch]').onclick = watchDialog;
}

const stopRowInfo = (x) => {
  const j = x.jobId ? getJob(x.jobId) : null;
  const drv = (x.driverIds || []).map(id => driverName(getDriver(id))).filter(Boolean).join(', ');
  return { j, drv };
};

function watchDialog(){
  const { groups, reports } = billWatch();
  const can = canWrite();
  const stopLine = (x, input) => {
    const { j, drv } = stopRowInfo(x);
    return `
<tr>
  <td><span class="code">${esc(x.code)}</span>${x.source?.provisional ? '<br><span class="tiny" style="color:var(--amber-dim)">ยังเป็นเลข 5</span>' : ''}</td>
  <td class="tiny mono">${esc(x.delivery || '—')}</td>
  <td class="tiny">${esc(j?.code || '—')}<br><span class="dim">${esc(META[x.status]?.short || x.status)}</span></td>
  <td class="tiny" style="min-width:140px">${esc(x.dropoff?.name || '')}<br><span class="dim">${esc(drv || 'ยังไม่มีคนขับ')}</span></td>
  <td class="tiny tnum">${fmtNum(Math.round(x.cargo?.weightKg || 0))} กก.${x.invoice?.amount ? `<br>${esc(fmtBaht(x.invoice.amount))}` : ''}</td>
  ${input ? `<td><input class="input input-sm mono" style="min-width:120px" data-newno="${x.id}" value="${esc(x.source?.provisional ? '' : x.code)}" placeholder="เลขบิลที่ถูก" ${can ? '' : 'disabled'}></td>` : ''}
</tr>`;
  };
  const head = (input) => `<thead><tr><th>เลขในระบบ</th><th>Delivery</th><th>เที่ยว</th><th>ร้าน / คนขับ</th><th>น้ำหนัก / ยอด</th>${input ? '<th>เลขบิลที่ถูกต้อง</th>' : ''}</tr></thead>`;
  modal({
    title: '⚠ เลขบิลที่ต้องเคลียร์',
    wide: true,
    guard: false,
    body: `
${groups.length ? `<p class="small strong">เลขบิลซ้ำ — ไฟล์จากลูกค้าใช้เลขเดียวกันกับหลาย Delivery</p>
<p class="tiny dim" style="margin:2px 0 10px">ตรวจกับใบบิลจริง แล้วพิมพ์เลขที่ถูกให้ทุกจุด (จุดที่เลขถูกอยู่แล้วไม่ต้องแก้) · หรือกด "เคลียร์โดยไม่แก้" ถ้าตรวจแล้วไม่มีปัญหา</p>
${groups.map((g, gi) => {
  const missing = g.deliveries.filter(d => !g.stops.some(x => String(x.delivery).trim() === d));
  return `
<div class="panel" style="margin-bottom:12px;border-color:var(--red)">
  <p class="small strong" style="margin:0">เลขบิล <span class="code">${esc(g.no)}</span> · วันที่ ${esc(g.day || '—')} · ${fmtNum(g.deliveries.length)} Delivery</p>
  <div class="rv-wrap" style="margin-top:8px"><table class="rv">${head(true)}<tbody>${g.stops.map(x => stopLine(x, true)).join('')}</tbody></table></div>
  ${missing.length ? `<p class="tiny dim" style="margin-top:6px">ยังไม่มีในระบบ: Delivery ${missing.map(esc).join(', ')}</p>` : ''}
  ${can ? `<div class="row gap-8 wraps" style="margin-top:10px;justify-content:flex-end">
    <button type="button" class="btn btn-ghost btn-sm" data-dupclear="${gi}">เคลียร์โดยไม่แก้</button>
    <button type="button" class="btn btn-accent btn-sm" data-dupsave="${gi}">บันทึกเลขที่แก้</button>
  </div>` : ''}
</div>`; }).join('')}` : ''}
${reports.length ? `<p class="small strong" style="margin-top:${groups.length ? 18 : 0}px">คนขับแจ้งเลขบิลบนใบในมือ ไม่ตรงกับในระบบ</p>
<p class="tiny dim" style="margin:2px 0 10px">คนขับส่งของจุดนี้ต่อไปแล้ว · ตรวจแล้วกด "ใช้เลขนี้" เพื่อเปลี่ยนเลขในระบบ หรือ "รับทราบ" ถ้าเลขในระบบถูกอยู่แล้ว</p>
${reports.map(({ stop: x, ev }, ri) => `
<div class="panel" style="margin-bottom:10px;border-color:var(--amber)">
  <p class="small" style="margin:0">คนขับ <b>${esc(ev.byName)}</b> แจ้งเลข <span class="code">${esc(ev.billNo)}</span> · ${esc(new Date(ev.at).toLocaleString('th-TH', { dateStyle:'short', timeStyle:'short' }))}</p>
  <div class="rv-wrap" style="margin-top:8px"><table class="rv">${head(false)}<tbody>${stopLine(x, false)}</tbody></table></div>
  ${can ? `<div class="row gap-8 wraps" style="margin-top:10px;justify-content:flex-end">
    <button type="button" class="btn btn-ghost btn-sm" data-repack="${ri}">รับทราบ (ไม่เปลี่ยนเลข)</button>
    <button type="button" class="btn btn-accent btn-sm" data-repuse="${ri}">ใช้เลข ${esc(ev.billNo)}</button>
  </div>` : ''}
</div>`).join('')}` : ''}
${!groups.length && !reports.length ? '<p class="small">ไม่มีอะไรต้องเคลียร์แล้ว ✓</p>' : ''}
${can ? '' : '<p class="tiny dim" style="margin-top:10px">บัญชีนี้ดูได้อย่างเดียว — ต้องการแก้ ติดต่อ admin</p>'}`,
    foot: '<button class="btn btn-accent" data-close>ปิด</button>',
    onMount(root){
      const by = { byRole:'ops', byName:'ทีมคลัง' };
      const after = (msg, kind = 'ok') => {
        /* แก้ครบ = ถอดป้ายทันที ไม่ต้องรอรอบ sync · ยังไม่เคยดึงแถวจากชีต ห้ามเรียก (กลุ่มว่าง = ถอดป้ายทุกจุด) */
        if (hasSyncedRows()) markDupInvoices(lastDups, { byRole:'ops', byName:'ระบบ (เลขบิลซ้ำ)' });
        paintWatch(); toast(msg, kind); watchDialog();
      };
      on(root, 'click', '[data-dupsave]', (e, b) => {
        const g = groups[+b.dataset.dupsave];
        const want = g.stops.map(x => ({ x, code: (root.querySelector(`[data-newno="${x.id}"]`)?.value || '').trim() }))
          .filter(v => v.code && v.code.toUpperCase() !== String(v.x.code).toUpperCase());
        if (!want.length) return toast('ยังไม่ได้พิมพ์เลขใหม่ให้จุดไหน', 'warn');
        const codes = want.map(v => v.code.toUpperCase());
        if (new Set(codes).size !== codes.length) return toast('เลขที่พิมพ์ซ้ำกันเอง — แต่ละจุดต้องเลขไม่ซ้ำ', 'warn');
        /* จุดที่ถือเลขซ้ำอยู่ เปลี่ยนก่อน — เลขจะได้ว่างให้จุดอื่นใช้ */
        want.sort((a, b) => (String(b.x.code).toUpperCase() === g.no.toUpperCase()) - (String(a.x.code).toUpperCase() === g.no.toUpperCase()));
        const fails = [];
        for (const v of want){
          const r = syncStopCodes([{ stopId: v.x.id, code: v.code, invoice: v.code }], { ...by, note:`แก้เลขบิลซ้ำ ${g.no}` });
          fails.push(...r.failed);
        }
        after(fails.length ? `แก้ไม่สำเร็จ ${fmtNum(fails.length)} จุด — ${fails[0].msg}` : `บันทึกเลขบิลแล้ว ${fmtNum(want.length)} จุด`, fails.length ? 'warn' : 'ok');
      });
      on(root, 'click', '[data-dupclear]', async (e, b) => {
        const g = groups[+b.dataset.dupclear];
        const ok = await confirmDialog({ title:'เคลียร์โดยไม่แก้เลข', message:`ยืนยันว่าเลขบิล ${g.no} ไม่ต้องแก้ — แถบแจ้งเตือนของเลขนี้จะหายไป` });
        if (!ok) return;
        clearDupInvoice(g.stops.map(x => x.id), by);
        after(`เคลียร์เลขบิล ${g.no} แล้ว`);
      });
      on(root, 'click', '[data-repuse]', (e, b) => {
        const { stop: x, ev } = reports[+b.dataset.repuse];
        const r = syncStopCodes([{ stopId: x.id, code: ev.billNo, invoice: ev.billNo }], { ...by, note:`ใช้เลขบิลที่คนขับแจ้ง (${ev.byName})` });
        after(r.failed.length ? `เปลี่ยนเลขไม่ได้ — ${r.failed[0].msg}` : `เปลี่ยนเป็นเลข ${ev.billNo} แล้ว`, r.failed.length ? 'warn' : 'ok');
      });
      on(root, 'click', '[data-repack]', (e, b) => {
        ackBillReport(reports[+b.dataset.repack].stop.id, by);
        after('รับทราบแล้ว');
      });
    },
  });
}

/* ---------- เริ่ม -------------------------------------------
   รอด่านสิทธิ์ก่อน — สคริปต์นี้โหลดแยกจาก ops.js จึงต้องรอเอง
   บัญชีที่ดูได้อย่างเดียวไม่ต้อง sync อัตโนมัติ (การ sync คือการแก้ข้อมูล) */
await gate('ops');
paintWatch();
subscribe(() => paintWatch());                    /* คนขับแจ้งเลขบิล / เครื่องอื่นแก้ — แถบอัปเดตเอง */
if (canWrite()){
  /* กติกาคืนบิลใหม่ (28 ต.ค.) — คนขับกดคืนเองไม่นับ คำนวณสถานะใหม่ให้ชีต Master เห็นตรงกัน · รอคลาวด์ส่งข้อมูลมาก่อน */
  setTimeout(() => { try{ healInvoiceReturns(); }catch(e){ console.warn(e); } }, 5000);
  runSync({ quiet:true });
  setInterval(() => runSync({ quiet:true }), POLL_MS);

  /* กลับมาที่แท็บนี้ก็ตรวจให้รอบหนึ่ง จะได้ไม่ต้องรอครบนาที */
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runSync({ quiet:true });
  });
}
