/* ============================================================
   ops.js — ขั้นที่ 2: ทีมคลังตรวจรับ จ่ายงานคนขับ และคุมกระดาน
   ============================================================ */

import {
  shell, $, $$, esc, el, toast, modal, close, confirmDialog, demoBar, pill, flowBar, on,
  shrinkImage, fmtBytes, reopenDialog,
} from './ui.js';
import {
  listShipments, getShipment, counts, listDrivers, assignDriver, advance, cancelShipment, updateShipment,
  subscribe, fmtDateTime, ago, fmtBaht, fmtNum, qty, META, S, FLOW, nextOf, isOpen, getDriver,
  isExternal, isLinkOpen, updateEventPhotos, updateJobEventPhotos,
  NEEDS_PHOTO, minPhotos, PHOTO_GUIDE,
  listJobs, getJob, advanceJob, deliverStops, assignJobDriver, setJobNote, MAX_JOB_NOTE, jobStops, tidyJobs,
  getJobPay, setJobPay, payTotal, isRtCode, rtDocLabel, setRtNumbers, stopGroups, todayYmd,
  driverName, OUTCOMES, isFailOutcome, isProblem, whReturnOf, crewStep, reusedOf, purgeStops, purgePending,
} from './store.js';
import { routeBlock, invoiceBlock, cargoBlock, driverBlock, timeline, timingBlock, bindZoom, progressText } from './detail.js';
import { loadUI, saveUI, dropUI, debounce } from './uiState.js';
import { newExternalDialog, linkDialog, driverLinkUrl, copyLink } from './extlink.js';
import { uploadPhotos, stopPhotoDir, jobPhotoDir } from './cloud.js';
import { runSync, uploadFile } from './opsAuto.js';
import { progressBox } from './ui.js';
import { countUp, liveList, celebrate } from './motion.js';
import { newRtJobDialog, addRtStopDialog, closeRtDialog, rtPanel, withDupInv } from './realtime.js';
import { gate, getSession } from './auth.js';
import { payDialog, groupActs, tripTools, invRetDialog, invRetAllDialog, podStop, podTrip, problemTag, clearProblemDialog, failed, sentBy, crewChip, crewBox, whReturnDialog } from './helper.js';
import { isAdmin } from './access.js';
import { pushMaster, purgeMaster } from './masterSync.js';
import { driverUrl } from './config.js';
import { parseTrip } from './xlsxImport.js';
import { pttPrices } from './fuelPrice.js';
import { watchPhotos, quotaLevel, quotaWarning } from './photoQuota.js';

/* แถวใหม่เลื่อนเข้า · แถวที่สถานะเปลี่ยนไฮไลต์ — ไม่ขยับแถวที่เหมือนเดิม */
const liveRows = liveList('#rows', { row:'tr[data-id]' });
let lastView = null;

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('ops');
document.querySelector('[data-driver-link]')?.setAttribute('href', driverUrl());
shell({ role: 'มุมมองทีมคลัง' });
$('#demoBarSlot').appendChild(demoBar('กระดานนี้อัปเดตทันทีเมื่อคนขับกดยืนยันในอีกแท็บหนึ่ง', { clear: true }));

/* ---------- แท็บ ------------------------------------------- */
const TABS = [
  { key:'all',      label:'ทั้งหมด',        test: () => true },
  { key:'new',      label:'รอตรวจรับ',      test: s => s.status === S.NEW },
  { key:'ware',     label:'อยู่ในคลัง',      test: s => s.status === S.RECEIVED || s.status === S.LOADED },
  { key:'move',     label:'กำลังขนส่ง',      test: s => s.status === S.DEPARTED },
  { key:'done',     label:'ส่งมอบแล้ว',      test: s => s.status === S.DELIVERED },
  { key:'cancel',   label:'ยกเลิก',          test: s => s.status === S.CANCELLED },
  /* งานด่วนที่ส่งไปแล้วแต่เอกสารยังไม่ครบ (ดู realtime.js) */
  { key:'rt',       label:'รอปิดงาน',        test: j => j.rtPending > 0 },
];
/* จำแท็บกับคำค้นไว้ กันหายตอนหน้ารีเฟรช */
const UI = loadUI('ops');
let tab = UI.tab || 'all';
let q = UI.q || '';

$('#q').value = q;
const rememberQ = debounce((v) => saveUI('ops', { q: v }), 300);
$('#q').addEventListener('input', (e) => { q = e.target.value; rememberQ(q); paint(); });

/* ---------- ตัวกรองวันที่ (แบบหน้า Dashboard) ----------------
   กรองตามวันงานของเที่ยว (serviceDate · ไม่มีใช้วันที่สร้าง) เหมือน Dashboard
   เที่ยวที่ยังไม่ปิด (รวมงานด่วนที่รอปิดงาน) ขึ้นเสมอไม่ว่าวันไหน — ทีมคลังจะไม่พลาดงานค้างจากวันก่อน
   กรองจริงเฉพาะเที่ยวที่ส่งมอบครบ / ยกเลิกแล้ว
   เปิดครั้งแรก = เฉพาะวันนี้ · หลังจากนั้นจำค่าที่เลือกล่าสุด (เหมือนแท็บกับคำค้น)
   เอาติ๊ก "เฉพาะวันนี้" ออก = กลับช่วงเดิม (ตั้งต้น: ต้นเดือนที่แล้ว → วันนี้) */
/* ต้นเดือนที่แล้ว — ตั้งเวลาเที่ยงวัน แปลงเป็น UTC แล้ววันที่ไม่เลื่อน */
const monthAgo = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1, 12).toISOString().slice(0, 10); };
const D = { today: UI.dToday ?? true, from: UI.dFrom || monthAgo(), to: UI.dTo || todayYmd() };
const dayOf = (j) => String(j.serviceDate || j.createdAt || '').slice(0, 10);
const inDates = (j) => {
  if (isOpen(j.status) || j.rtPending > 0) return true;
  const d = dayOf(j);
  return D.today ? d === todayYmd() : d >= D.from && d <= D.to;
};
function paintDates(){
  $('#dToday').checked = D.today;
  [['#dFrom', 'from'], ['#dTo', 'to']].forEach(([sel, k]) => {
    $(sel).disabled = D.today;
    $(sel).value = D.today ? todayYmd() : D[k];
  });
}
const rememberDates = () => saveUI('ops', { dToday: D.today, dFrom: D.from, dTo: D.to });
$('#dToday').addEventListener('change', (e) => { D.today = e.target.checked; rememberDates(); paintDates(); paint(); });
[['#dFrom', 'from'], ['#dTo', 'to']].forEach(([sel, k]) => $(sel).addEventListener('change', (e) => {
  if (!e.target.value) return paintDates();
  D[k] = e.target.value;
  if (D.from > D.to) [D.from, D.to] = [D.to, D.from];
  rememberDates(); paintDates(); paint();
}));
paintDates();

/* ---------- KPI -------------------------------------------- */
function paintKpi(){
  const jobs = listJobs().filter(inDates);
  const c = {
    [S.NEW]:       jobs.filter(j => j.status === S.NEW).length,
    [S.RECEIVED]:  jobs.filter(j => j.status === S.RECEIVED).length,
    [S.LOADED]:    jobs.filter(j => j.status === S.LOADED).length,
    [S.DEPARTED]:  jobs.filter(j => j.status === S.DEPARTED).length,
    [S.ARRIVED]:   0,
    [S.DELIVERED]: jobs.filter(j => j.status === S.DELIVERED).length,
  };
  const items = [
    { label:'เที่ยวรอตรวจรับ',   value:c[S.NEW],                       foot:'นำเข้าจาก Excel แล้ว',   accent:'amber' },
    { label:'เที่ยวอยู่ในคลัง',  value:c[S.RECEIVED] + c[S.LOADED],    foot:'รอจ่ายรถ / รอออกเดินทาง', accent:'violet' },
    { label:'เที่ยวกำลังวิ่ง',   value:c[S.DEPARTED],                  foot:'ออกจากคลังแล้ว',        accent:'blue' },
    { label:'เที่ยวปิดครบแล้ว',  value:c[S.DELIVERED],                 foot:'ปิดทุกจุดพร้อมหลักฐาน',  accent:'green' },
  ];
  $('#kpis').innerHTML = items.map(k => `
    <div class="kpi" data-accent="${k.accent}">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-foot">${esc(k.foot)}</div>
    </div>`).join('');
  countUp($('#kpis'), '.kpi-value', 'ops-kpi');
}

/** เลขบิลของจุดส่งในงาน — โชว์เป็นบรรทัดใต้ชื่อรถ ส่วนป้ายด้านบนเป็นเลขงาน
 *  (เลข 5 ก่อนไฟล์ขาวมา · Shipment No. หลังรวมงานแล้ว) */
function billLine(j){
  const stops = jobStops(j.id);
  if (!stops.length) return { codes: '', waiting: '' };
  const codes = stops.map(x => x.code);
  /* งานเลข 5 ที่มีจุดเดียวและเลขจุดตรงกับเลขงาน ไม่ต้องโชว์ซ้ำ */
  if (codes.length === 1 && codes[0] === j.code) return { codes: '', waiting: '' };
  const waiting = stops.filter(x => x.source?.provisional).length;
  const show = codes.slice(0, 3).map(c => esc(c)).join(' · ');
  const more = codes.length > 3 ? ` +${fmtNum(codes.length - 3)}` : '';
  return {
    codes: `<span class="mono" title="${esc(codes.join(' · '))}">${show}${more}</span>`,
    waiting: waiting ? `<br><span class="tiny" style="color:#e2b765">รอเลข Invoice ${fmtNum(waiting)} ใบ</span>` : '',
  };
}

/* ---------- กลุ่มจัดส่งโดย ----------------------------------
   เที่ยวที่นำเข้าจากไฟล์ SM มีกลุ่ม (job.group) เช่น "กลาง1 4ล้อ1คัน (19/10/69)"
   ตารางขึ้นหัวกลุ่มหนึ่งแถว แล้วงานย่อยข้างใต้: งานเลข 7 (จากไฟล์อัพเดตเลขที่บิล) และงานที่ยังไม่มีเลข 7
   งานที่ยังไม่มีเลข 7 คืองานที่ชื่อเท่ากับชื่อกลุ่ม — รอไฟล์อัพเดตเลขที่บิลมาย้ายเข้าเลข 7 (store.js regroupStop) */
const noSeven = (j) => j.group && j.code === j.group;

/* 3 ชั้น (31 ต.ค. ผู้ใช้ขอ — เดิม ตัวย่อ → วัน → รถ → งาน): วันในวงเล็บ → ตัวย่อ+รถ → งานเรียงตามเลขบิล
   "ตวอ1 4ล้อ1คัน (17/10/69)" = ตัวย่อ "ตวอ1" · วัน "17/10/69" · รถ "4ล้อ1คัน"
   ตัวย่อ = คำแรกก่อนเว้นวรรค (ไม่มีเว้นวรรค = ตัดหน้าจำนวนล้อ เช่น 4ล้อ) · เรียง ก–ฮ / เลขแบบตัวเลข
   วันใหม่อยู่บน ไม่มีวันที่ไว้ท้าย · รถเรียงแบบตัวเลข (4ล้อ1คัน ก่อน 4ล้อ11คัน) · งานเรียงตามเลขบิลที่น้อยที่สุดของงาน */
const grpName = (g) => parseTrip(g).name || g;
const grpDay = (g) => { const m = String(g).match(/\(([^()]*)\)\s*$/); return m ? m[1].trim() : ''; };
function grpSplit(g){
  const name = grpName(g);
  const m = name.match(/^(\S+)\s+(.+)$/)
    || name.match(/^(.+?)((?:4|6|10|12|18|22)\s*ล้อ.*)$/)      /* พิมพ์ติดกัน "กลาง24ล้อ1คัน" = กลาง2 + 4ล้อ1คัน */
    || name.match(/^([^\d\s]+\d+)(.+)$/);
  return m ? { zone: m[1], truck: m[2].trim() } : { zone: name, truck: '' };
}
const sumOf = (kids) => ({
  stops: kids.reduce((t, x) => t + (x.stops || 0), 0),
  sent:  kids.reduce((t, x) => t + (x.delivered || 0), 0),
  live:  kids.reduce((t, x) => t + (x.live ?? x.stops ?? 0), 0),
});
const progress = (kids) => { const { stops, sent, live } = sumOf(kids); return `${fmtNum(stops)} จุดส่ง · ส่งแล้ว ${fmtNum(sent)}/${fmtNum(live)}${stops > live ? ` · ยกเลิก ${fmtNum(stops - live)}` : ''}`; };
/** จัดกลุ่มตามคีย์ คงลำดับที่เจอก่อน */
const bucket = (list, key) => {
  const m = new Map();
  for (const x of list){ const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
};
const byThai = (a, b) => a.localeCompare(b, 'th', { numeric: true });

function grpHead(day, kids){
  /* แถวเว้นช่องก่อนแต่ละวัน — ถ้าเป็นแถวแรกของตาราง CSS ซ่อนไว้ */
  return `
<tr class="grp-gap" aria-hidden="true"><td colspan="9"></td></tr>
<tr class="grp-head"><td colspan="9">
  <span class="strong">${esc(day || 'ไม่ระบุวันที่')}</span>
  <span class="tiny dim"> · ${progress(kids)}</span>
</td></tr>`;
}

function grpTruck(truck, kids){
  const sevens = kids.filter(x => !noSeven(x)).map(x => x.code);
  return `
<tr class="grp-truck"><td colspan="9">
  <span class="strong">${esc(truck || 'ไม่ระบุรถ')}</span>
  <span class="tiny dim"> · ${sevens.length ? `เลข 7: ${sevens.map(esc).join(', ')}` : 'ยังไม่มีเลข 7'}${
    kids.some(noSeven) && sevens.length ? ' · มีจุดส่งรอเลข 7' : ''} · ${progress(kids)}</span>
</td></tr>`;
}

/** เลขบิลที่น้อยที่สุดของงาน — ใช้เรียงงานในกลุ่ม · ไม่มีบิล = ใช้เลขงาน */
const firstBill = (j) => jobStops(j.id).map(x => x.code).filter(Boolean).sort(byThai)[0] || j.code || '';

/** ตารางของงานที่มีกลุ่ม: วันที่ → ตัวย่อ+รถ → งาน (เรียงตามเลขบิล) */
function groupedRows(list){
  /* คีย์วัน = yyyy-mm-dd (ไม่มีวันที่ = '' ไว้ท้าย) · ป้าย = ข้อความในวงเล็บ */
  const days = bucket(list, j => parseTrip(j.group).date || '');
  return [...days.keys()].sort((a, b) => b.localeCompare(a)).map(dk => {
    const dkids = days.get(dk);
    const cars = bucket(dkids, j => { const g = grpSplit(j.group); return `${g.zone}\u0000${g.truck}`; });
    return grpHead(dk ? grpDay(dkids[0].group) : '', dkids) + [...cars.keys()].sort((a, b) => {
      const [za, ta] = a.split('\u0000'), [zb, tb] = b.split('\u0000');
      return byThai(za, zb) || byThai(ta, tb);
    }).map(k => {
      const kids = cars.get(k).map(j => ({ j, b: firstBill(j) })).sort((a, b) => byThai(a.b, b.b)).map(v => v.j);
      return grpTruck(k.replace('\u0000', ' ').trim(), kids) + kids.map(x => jobRow(x, true)).join('');
    }).join('');
  }).join('');
}

/* ---------- บิลมีปัญหา (คนขับส่งไม่สำเร็จ ยังไม่เคลียร์) — ปักบนสุด + ไฮไลต์แดง ----------
   นับจากจุดส่งทั้งหมดครั้งเดียวต่อการวาด (listJobs ไม่มี stopList) */
let probByJob = new Map();
function countProblems(){
  probByJob = new Map();
  for (const x of listShipments()) if (isProblem(x)) probByJob.set(x.jobId, (probByJob.get(x.jobId) || 0) + 1);
}
/** สถานะของจุดส่ง — ปิดแบบส่งไม่สำเร็จ (ร้านปิด ฯลฯ) ไม่ขึ้นว่า "ส่งมอบสำเร็จ" */
const stopPill = (x) => failed(x) ? `<span class="prob-tag${isProblem(x) ? '' : ' is-cleared'}">✕ ส่งไม่สำเร็จ</span>` : pill(x.status);
/** ร้านที่มีบิลมีปัญหาขึ้นก่อน — ที่เหลือคงลำดับเดิม */
const probFirst = (groups) => [...groups].sort((a, b) => b.stops.some(isProblem) - a.stops.some(isProblem));

/* ---------- ตาราง ------------------------------------------ */
function jobRow(j, kid = false){
  const names = (j.driverIds || []).map(id => getDriver(id)).filter(Boolean);
  const pct = j.live ? Math.round(j.delivered / j.live * 100) : 0;
  const bill = billLine(j);
  const rt = j.isRt || isRtCode(j.code);
  const nProb = probByJob.get(j.id) || 0;
  const cls = [kid && 'grp-kid', rt && 'is-rt', nProb && 'is-problem'].filter(Boolean);
  return `
<tr data-clickable data-id="${j.id}"${cls.length ? ` class="${cls.join(' ')}"` : ''} data-sig="${esc([j.code, j.status, j.stops, j.delivered, j.rtPending, rt, (j.rtDocs || []).join(','), (j.driverIds || []).join(','), nProb, (j.events || []).length].join('|'))}">
  <td>
    ${nProb ? `<span class="prob-tag">⚠ บิลมีปัญหา ${fmtNum(nProb)} บิล</span><br>` : ''}
    ${bill.codes || '<span class="tiny dim">—</span>'}
    <br><span class="tiny dim">${esc(j.vehicle || '—')}</span>
    ${bill.waiting}
    ${rt ? `<br><span class="rt-badge">⚡ งานด่วน${(j.rtDocs || []).map(d => ` · ${esc(d)}`).join('')}</span>` : ''}
    ${j.rtPending ? `<br><span class="tiny strong" style="color:var(--red)">รอปิดงาน ${fmtNum(j.rtPending)} จุด</span>` : ''}
  </td>
  <td>
    ${noSeven(j) ? `<span class="tiny strong" style="color:var(--amber-ink)">ยังไม่มีเลข 7</span><br><span class="tiny dim">รอไฟล์อัพเดตเลขที่บิล</span>`
      : `<span class="code code-lg strong">${esc(j.code)}</span>`}
  </td>
  <td>
    <span class="strong">${fmtNum(j.stops)} จุดส่ง</span>
    <br><span class="tiny dim">${fmtNum(j.dests)} ปลายทาง</span>
  </td>
  <td style="min-width:150px">
    <div class="tripbar"><i style="width:${pct}%"></i></div>
    <span class="tiny dim">ส่งแล้ว ${fmtNum(j.delivered)} / ${fmtNum(j.live)}${j.cancelled ? ` · ยกเลิก ${fmtNum(j.cancelled)}` : ''}</span>
  </td>
  <td><span class="tiny dim mono">${fmtNum(Math.round(j.weightKg))} กก.</span></td>
  <td>
    <span class="tiny dim mono">${esc(fmtBaht(j.amount))}</span>
    ${j.payTotal ? `<br><span class="tiny mono" style="color:var(--amber-ink)">ค่ารอบ ${esc(fmtBaht(j.payTotal))}</span>`
                 : '<br><span class="tiny dim">ยังไม่ใส่ค่ารอบ</span>'}
  </td>
  <td>${names.length
    ? names.map(d => `${esc(driverName(d))}<br><span class="tiny dim mono">${esc(d.plate)}</span>${names.length > 1 ? `<br>${crewChip(j, d.id)}` : ''}`).join('<br>')
    : '<span class="tiny dim">— ยังไม่จ่ายงาน —</span>'}</td>
  <td>${pill(j.status)}</td>
  <td class="right"><span class="tiny dim nowrap">${esc(ago(j.updatedAt))}</span></td>
</tr>`;
}

function paint(){
  paintKpi();
  countProblems();
  const all = listJobs({ q }).filter(inDates);
  const def = TABS.find(t => t.key === tab);
  const rows = all.filter(def.test);
  const prob = rows.filter(j => probByJob.has(j.id));
  const rest = rows.filter(j => !probByJob.has(j.id));

  $('#tabs').innerHTML = TABS.map(t => `
    <button class="tab" role="tab" data-tab="${t.key}" aria-selected="${t.key === tab}">
      ${esc(t.label)}<span class="cnt">${all.filter(t.test).length}</span>
    </button>`).join('');

  /* งานที่ไม่มีกลุ่ม (งานด่วน / ของเก่า) ขึ้นก่อนตามลำดับอัปเดตล่าสุด แล้วตามด้วยกลุ่มจัดส่งโดย */
  /* เที่ยวที่มีบิลมีปัญหาปักบนสุดก่อนทุกอย่าง (ไม่เข้ากลุ่ม) */
  $('#rows').innerHTML = prob.map(j => jobRow(j)).join('')
                       + rest.filter(j => !j.group).map(j => jobRow(j)).join('')
                       + groupedRows(rest.filter(j => j.group));

  /* เปลี่ยนแท็บหรือคำค้น = มุมมองใหม่ ไม่ใช่ข้อมูลใหม่ — อย่าไฮไลต์ทุกแถวว่าเพิ่งเปลี่ยน */
  const view = `${tab}|${q}|${D.today ? 'today' : `${D.from}~${D.to}`}`;
  liveRows({ reset: view !== lastView });
  lastView = view;

  $('#emptyState').innerHTML = rows.length ? '' :
    `<div class="empty"><div class="empty-mark">🗂️</div><p class="small">${q ? 'ไม่พบงานที่ตรงกับคำค้นในช่วงวันที่นี้' : 'ยังไม่มีงานในกลุ่มนี้ในช่วงวันที่นี้'}</p></div>`;
}

on(document, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; saveUI('ops', { tab }); paint(); });
on(document, 'click', 'tr[data-id]', (e, tr) => openTrip(tr.dataset.id));

/* ---------- ใบงานฉบับเต็ม ---------------------------------- */
/** คนขับที่จ่ายงานได้ + คนที่ถือใบงานนี้อยู่ (เผื่อถูกปิดใช้งานภายหลัง) */
function assignable(s){
  const list = listDrivers({ active:true });
  if (s.driverId && !list.some(d => d.id === s.driverId)){
    const cur = getDriver(s.driverId);
    if (cur) list.unshift(cur);
  }
  return list;
}

/** ค่าพิเศษในรายการจ่ายงาน = "สร้างคนขับภายนอกคนใหม่" ไม่ใช่ id ของใคร */
const NEW_EXTERNAL = '__new_external__';

/**
 * ตัวเลือกในรายการจ่ายงาน — แยกคนขับในระบบกับคนขับภายนอกออกจากกัน
 * @param {boolean} allowNew  ใส่ตัวเลือก "สร้างลิงก์คนขับภายนอก" ท้ายรายการ
 */
function driverOptions(s, { allowNew = false } = {}){
  const list = assignable(s);
  const opt = (d) => `<option value="${d.id}"${d.id === s.driverId ? ' selected' : ''}>` +
    `${esc(driverName(d))} · ${esc(d.plate)}${d.truck ? ` (${esc(d.truck)})` : ''}</option>`;
  const inhouse = list.filter(d => !isExternal(d));
  const ext     = list.filter(isExternal);
  return `
    <option value="">— ยังไม่จ่ายงาน —</option>
    ${inhouse.length ? `<optgroup label="คนขับในระบบ">${inhouse.map(opt).join('')}</optgroup>` : ''}
    ${ext.length ? `<optgroup label="คนขับภายนอก · มีลิงก์แล้ว">${ext.map(opt).join('')}</optgroup>` : ''}
    ${allowNew ? `<optgroup label="จ้างคนขับนอก"><option value="${NEW_EXTERNAL}">+ คนขับภายนอก — สร้างลิงก์ใหม่…</option></optgroup>` : ''}`;
}

/** แผงลิงก์ในใบงาน — บอกทันทีว่างานนี้จ่ายให้คนขับภายนอก และลิงก์ยังใช้ได้อยู่ไหม */
function linkPanel(d){
  const live = isLinkOpen(d);
  return `
<div class="panel"${live ? ' style="border-color:var(--amber);background:var(--amber-wash)"' : ''}>
  <div class="row between gap-10" style="align-items:flex-start">
    <div>
      <div class="tiny dim">จ่ายงานผ่านลิงก์คนขับภายนอก</div>
      <div class="strong" style="margin-top:2px">${esc(driverName(d))}</div>
      <div class="tiny dim">${esc(d.phone)} · ${esc(d.plate)}</div>
    </div>
    <span class="pill" data-tone="${live ? 'done' : 'grey'}">${live ? 'ลิงก์เปิดอยู่' : 'ลิงก์ถูกปิด'}</span>
  </div>
  <div class="row gap-8" style="margin-top:12px">
    <button class="btn btn-accent btn-sm" data-copylink ${live ? '' : 'disabled'}>คัดลอกลิงก์</button>
    <button class="btn btn-ghost btn-sm" data-managelink>จัดการลิงก์</button>
  </div>
</div>`;
}

/* ---------- สถานะรายบิลในใบงานเที่ยว (31 ต.ค.) --------------
   สถานะเที่ยวขยับตามคนขับแต่ละคน (crewStep) จึงไม่บอกว่าบิลไหนถึงไหน — ให้เลือกดูทีละบิล
   ว่าง = ภาพรวมทั้งเที่ยวแบบเดิม · จำบิลที่เลือกไว้ตอนหน้าต่างเปิดใหม่หลังกดบันทึก ปิดหน้าต่างแล้วล้าง */
let billPick = null;   /* { trip, stop } */
const pickedBill = (j) => {
  const id = billPick?.trip === j.id ? billPick.stop : '';
  return (j.stopList || []).some(x => x.id === id) ? id : '';
};
/** ข้อมูลให้ flowBar — สถานะของบิล · เวลาขั้นทั้งเที่ยว (รับงาน/ขึ้นรถ/ออกรถ) จากเที่ยว ถึงขั้นที่บิลอยู่ · เวลาส่งมอบจากบิลเอง */
function billFlow(j, stopId){
  const x = stopId && j.stopList.find(v => v.id === stopId);
  if (!x) return j;
  const upTo = x.status === S.CANCELLED ? FLOW.length : FLOW.indexOf(x.status);
  const tripEvs = (j.events || []).filter(e => e.status !== S.DELIVERED && FLOW.indexOf(e.status) <= upTo);
  return { status: x.status, events: [...tripEvs, ...(x.events || [])] };
}
function billOptions(j, stopId){
  return `<option value="">ภาพรวมทั้งเที่ยว · ${esc(META[j.status]?.label || j.status)}</option>` +
    (j.stopList || []).map(x => `<option value="${x.id}"${x.id === stopId ? ' selected' : ''}>${
      esc([x.invoice?.number || x.code, x.dropoff?.name, META[x.status]?.label || x.status].filter(Boolean).join(' · '))}</option>`).join('');
}

/* ---------- ใบงานของ "เที่ยว" ------------------------------ */
function openTrip(id){
  rememberScroll();
  const j = getJob(id);
  if (!j){ dropUI('ops', 'trip', 'payDraft'); return toast('ไม่พบเที่ยวนี้', 'err'); }

  /* จำว่ากำลังเปิดเที่ยวไหนอยู่ หน้ารีเฟรชแล้วจะได้เปิดกลับมาที่เดิม */
  saveUI('ops', { trip: id });

  const names = (j.driverIds || []).map(x => getDriver(x)).filter(Boolean);

  /* รูปที่คนขับถ่ายไว้ในขั้นของทั้งเที่ยว (ขึ้นรถ) — ทำสำเนามาแก้ก่อน
     ค่อยเขียนจริงตอนกดบันทึก จะได้กดยกเลิกด้วยการปิดหน้าต่างได้ */
  const shotEvents = (j.events || [])
    .filter(e => Array.isArray(e.photos) && (e.photos.length || NEEDS_PHOTO.has(e.status)));
  const shotEdits = new Map(shotEvents.map(e => [e.id, e.photos.slice()]));

  modal({
    wide: true,
    reopen: { name:'trip', args:{ id } },
    title: `<span class="row gap-10 wraps">${j.group ? `<span class="strong">${esc(j.group)}</span>` : ''}<span class="code code-lg">${
      noSeven(j) ? 'ยังไม่มีเลข 7' : j.group ? `เลข 7 · ${esc(j.code)}` : `เที่ยว ${esc(j.code)}`}</span>${pill(j.status)}${
      j.note ? `<span class="job-note" title="${esc(j.note)}">📝 ${esc(j.note)}</span>` : ''}</span>`,
    body: `
<div class="stack gap-18">
  <div>
    <p class="tiny dim" style="margin-bottom:10px">
      ${esc(j.vehicle || 'ไม่ระบุรถ')} · ${fmtNum(j.stops)} จุดส่ง · ${fmtNum(j.dests)} ปลายทาง ·
      ${fmtNum(Math.round(j.weightKg))} กก. · ${esc(fmtBaht(j.amount))}
    </p>
    <div data-flowbox>${flowBar(billFlow(j, pickedBill(j)))}</div>
    ${(() => {
      /* เลข 7 เดียวมีจุดส่งจากหลายกลุ่มจัดส่งโดย — ไฟล์ SM กับไฟล์อัพเดตเลขที่บิลจัดรถไม่ตรงกัน */
      const groups = [...new Set((j.stopList || []).map(x => x.source?.tripGroup).filter(Boolean))];
      return groups.length > 1 ? `<div class="panel tiny" style="margin-top:10px;border-color:var(--amber);background:var(--amber-wash)">
        ⚠ เที่ยวนี้มีจุดส่งจาก ${fmtNum(groups.length)} กลุ่มจัดส่งโดย: ${groups.map(esc).join(' · ')} — แสดงใต้กลุ่ม ${esc(j.group || groups[0])}</div>` : '';
    })()}
  </div>

  <!-- เลือกบิลที่จะดูสถานะ (31 ต.ค.: สถานะเที่ยวขยับตามคนขับแต่ละคน ไม่บอกว่าบิลไหนถึงไหน) -->
  <label class="trip-billpick">
    <span class="label" style="margin:0">ดูสถานะของ</span>
    <select class="select" data-billpick>${billOptions(j, pickedBill(j))}</select>
  </label>

  <!-- ปุ่มแก้ไข/ลบงาน (31 ต.ค.: ผู้ใช้ขอให้อยู่ระหว่างแถบสถานะกับคนขับ หาง่าย) — ลบงานเฉพาะแอดมิน -->
  <div class="trip-editbar">
    <button type="button" class="btn btn-ghost" data-tripedit>✏️ แก้ไขงาน</button>
    ${canActFor() ? '<button type="button" class="btn btn-danger" data-tripdel>🗑 ลบงาน</button>' : ''}
  </div>

  ${crewBox(j)}

  <div class="panel">
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:8px">
      <span class="label" style="margin:0">คนขับของเที่ยวนี้</span>
      <span class="tiny dim">เลือกได้หลายคน · ทุกคนเห็นเที่ยวนี้และปิดจุดไหนก็ได้</span>
    </div>
    <div class="crew">
      ${listDrivers({ active:true }).map(d => `
        <label class="crew-item${(j.driverIds || []).includes(d.id) ? ' is-on' : ''}">
          <input type="checkbox" data-crew="${d.id}" ${(j.driverIds || []).includes(d.id) ? 'checked' : ''}>
          <span class="grow">
            <span class="strong" style="display:block">${esc(driverName(d))}</span>
            <span class="tiny dim mono">${esc(d.plate)}${d.truck ? ` · ${esc(d.truck)}` : ''}</span>
          </span>
        </label>`).join('') || '<p class="tiny dim">ยังไม่มีคนขับในระบบ — เพิ่มที่หน้าข้อมูลคนขับก่อน</p>'}
    </div>
    <div class="row between wraps gap-10" style="margin-top:10px">
      <span class="tiny dim" data-crewnow>${names.length
        ? `ตอนนี้ ${fmtNum(names.length)} คน: ${esc(names.map(d => driverName(d)).join(' · '))}`
        : 'ยังไม่จ่ายงาน'}</span>
      <button class="btn btn-accent btn-sm" data-crewsave>บันทึกคนขับ</button>
    </div>
  </div>

  <div class="panel">
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:8px">
      <span class="label" style="margin:0">หมายเหตุ</span>
      <span class="tiny dim">โชว์ต่อท้ายสถานะด้านบน และบนการ์ดเที่ยวในหน้าคนขับ · เว้นว่าง = ลบ</span>
    </div>
    <textarea class="textarea" data-jobnote maxlength="${MAX_JOB_NOTE}" style="min-height:60px"
      placeholder="เช่น ไปร้าน A ก่อน 10 โมง · ของเย็น ห้ามวางทับ">${esc(j.note || '')}</textarea>
    <div class="row between wraps gap-10" style="margin-top:10px">
      <span class="tiny dim" data-jobnotehint></span>
      <button class="btn btn-accent btn-sm" data-jobnotesave>บันทึกหมายเหตุ</button>
    </div>
  </div>

  <div class="panel">
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:4px">
      <h4 style="margin:0">ค่ารอบ</h4>
      <span class="tiny dim">คนขับเห็นยอดนี้ในแอป แต่แก้ไม่ได้</span>
    </div>
    <div id="payBox"></div>
  </div>

  ${shotEvents.length ? `
  <div class="panel">
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:4px">
      <h4 style="margin:0">รูปหลักฐานของเที่ยว</h4>
      <span class="tiny dim">ลบรูปที่ถ่ายพลาด หรือเพิ่มรูปที่คนขับส่งตามมาทีหลัง — ขั้นขึ้นรถต้องเหลืออย่างน้อย ${minPhotos(S.LOADED)} รูป · ส่งมอบ ${minPhotos(S.DELIVERED)} รูป</span>
    </div>
    ${shotEvents.map(e => `
      <div class="shotbox" data-ev="${e.id}">
        <div class="row between wraps gap-8" style="align-items:baseline">
          <span class="strong" style="font-size:14px">${esc(META[e.status]?.label || e.status)}</span>
          <span class="tiny dim">
            <span data-n>${e.photos.length}</span>${NEEDS_PHOTO.has(e.status) ? ` / ${minPhotos(e.status)} ขั้นต่ำ` : ' รูป'}
            · โดย ${esc(e.byName || '—')} · ${esc(fmtDateTime(e.at))}
            ${e.photoEditedBy ? ` · แก้โดย ${esc(e.photoEditedBy)}` : ''}
          </span>
        </div>
        ${(PHOTO_GUIDE[e.status] || []).length
          ? `<p class="tiny dim" style="margin:4px 0 0">ควรมี: ${esc((PHOTO_GUIDE[e.status] || []).join(' · '))}</p>` : ''}
        <div class="photo-grid" data-shots style="margin-top:8px"></div>
        <label class="btn btn-quiet btn-sm" style="margin-top:8px;align-self:flex-start">
          + เพิ่มรูป
          <input type="file" accept="image/*" multiple hidden data-addshot>
        </label>
      </div>`).join('')}
    <div class="row between wraps gap-10" style="margin-top:10px">
      <span class="tiny dim" data-shotnote>แก้แล้วต้องกดบันทึก ปิดหน้าต่างไปเฉย ๆ จะไม่เปลี่ยนอะไร</span>
      <button class="btn btn-accent btn-sm" data-shotsave>บันทึกรูป</button>
    </div>
  </div>` : ''}

  ${rtPanel(j)}

  ${actsPanel(() => tripTools(j))}

  <div>
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:10px">
      <h4 style="margin:0">จุดส่ง ${fmtNum(j.stops)} จุด · ปิดแล้ว ${fmtNum(j.delivered)}/${fmtNum(j.live)}${j.cancelled ? ` · ยกเลิก ${fmtNum(j.cancelled)}` : ''}</h4>
      ${j.status !== S.CANCELLED ? '<button type="button" class="btn btn-rush btn-sm" data-rtadd title="ส่งก่อน ปิดงานทีหลัง">⚡ + เพิ่มจุดส่งด่วน</button>' : ''}
    </div>
    <table class="rv" style="font-size:13px">
      <thead><tr><th style="width:38px">#</th><th>เลขจุดส่ง</th><th>ลูกค้า · ปลายทาง</th><th>น้ำหนัก</th><th>สถานะ</th></tr></thead>
      <tbody>
        ${probFirst(stopGroups(j.stopList)).map((g, i) => g.stops.length > 1 ? groupTr(g, i) : g.stops.map(x => `
          <tr data-clickable data-stopid="${x.id}"${isProblem(x) ? ' class="is-problem"' : ''}>
            <td>${x.status === S.DELIVERED ? '✓' : i + 1}</td>
            <td>
              ${problemTag(x, { note:false })}${isProblem(x) ? '<br>' : ''}
              <span class="code">${esc(x.code)}</span>${rtTag(x)}${!x.realtime && x.source?.provisional ? '<span class="prov">รอ Invoice</span>' : ''}${reuseTag(x)}
              ${x.delivery ? `<br><span class="tiny dim mono">Delivery ${esc(x.delivery)}</span>` : ''}
              ${x.source?.shipmentNo ? `<br><span class="tiny dim mono">Shipment ${esc(x.source.shipmentNo)}</span>` : ''}
            </td>
            <td><span class="strong trunc" style="display:block;max-width:280px">${esc(x.dropoff.name)}</span>
                <span class="tiny dim trunc" style="display:block;max-width:280px">${esc(x.customer.name)}</span>
                ${sentBy(x)}</td>
            <td class="tnum nowrap">${fmtNum(Math.round(x.cargo.weightKg))} กก.</td>
            <td>${stopPill(x)}</td>
          </tr>`).join('')).join('')}
      </tbody>
    </table>
  </div>

  <div>
    <h4 style="margin-bottom:12px">ไทม์ไลน์ของเที่ยว</h4>
    ${timeline(j)}
  </div>
</div>`,
    foot: [
      `<span class="grow"></span>`,
      j.status === S.NEW ? `<button class="btn btn-accent" data-jreceive>ตรวจรับเข้าคลัง</button>` : '',
      crewStandable(j).length
        ? `<button class="btn btn-ghost" data-jstep title="คนขับแจ้งทางโทรศัพท์/LINE หรือมือถือคนขับใช้ไม่ได้">ยืนยันแทนคนขับ…</button>` : '',
    ].filter(Boolean).join(''),
    onMount(root){
      bindZoom(root);
      /* เลือกคนขับได้หลายคน แล้วกดบันทึกทีเดียว — ไม่ยิงทุกครั้งที่ติ๊ก */
      root.querySelectorAll('[data-crew]').forEach(cb => {
        cb.onchange = () => {
          cb.closest('.crew-item').classList.toggle('is-on', cb.checked);
          const picked = [...root.querySelectorAll('[data-crew]:checked')]
            .map(x => getDriver(x.dataset.crew)).filter(Boolean);
          root.querySelector('[data-crewnow]').textContent = picked.length
            ? `เลือกไว้ ${picked.length} คน: ${picked.map(d => driverName(d)).join(' · ')}`
            : 'ยังไม่เลือกใคร';
        };
      });
      root.querySelector('[data-crewsave]')?.addEventListener('click', () => {
        const ids = [...root.querySelectorAll('[data-crew]:checked')].map(x => x.dataset.crew);
        try{
          assignJobDriver(j.id, ids, { byRole:'ops', byName:'ทีมคลังบางนา' });
          toast(ids.length ? `จ่ายงานให้คนขับ ${ids.length} คนแล้ว` : 'ยกเลิกการจ่ายงานแล้ว', 'ok');
          openTrip(j.id);
          pushMaster(j.id, 'jobs', j.id);
        }catch(err){ toast(err.message, 'err'); }
      });
      root.querySelector('[data-jobnotesave]')?.addEventListener('click', () => {
        const ses = getSession();
        try{
          const r = setJobNote(j.id, root.querySelector('[data-jobnote]').value,
            { byRole:'ops', byName: ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง' });
          toast(r.note ? 'บันทึกหมายเหตุแล้ว — คนขับเห็นบนการ์ดเที่ยว' : 'ลบหมายเหตุแล้ว', 'ok');
          openTrip(j.id);
        }catch(err){ toast(err.message, 'err'); }
      });
      root.querySelector('[data-jobnote]')?.addEventListener('input', (e) => {
        const changed = e.target.value.trim() !== (j.note || '');
        const hint = root.querySelector('[data-jobnotehint]');
        hint.textContent = changed ? 'ยังไม่ได้บันทึก — กด "บันทึกหมายเหตุ"' : '';
        hint.style.color = changed ? 'var(--amber-dim)' : '';
      });
      root.querySelector('[data-jreceive]')?.addEventListener('click', () => {
        try{ advanceJob(j.id, S.RECEIVED, { byRole:'ops', byName:'ทีมคลังบางนา', note:'ตรวจรับของเข้าคลัง' });
             toast('รับเข้าคลังแล้ว', 'ok'); openTrip(j.id); }
        catch(err){ toast(err.message, 'err'); }
      });
      root.querySelector('[data-jstep]')?.addEventListener('click', () => crewStandIn(j));
      /* แก้ไขงาน = เลือกบิลก่อน แล้วเปิดหน้าแก้ไขข้อมูลใบงานของบิลนั้น */
      root.querySelector('[data-tripedit]')?.addEventListener('click', () => tripEditPick(j));
      root.querySelector('[data-tripdel]')?.addEventListener('click', () => tripCancelDialog(j));
      /* dropdown บิล — เลือกแล้วแถบสถานะเปลี่ยนตามบิลนั้น · ข้อมูลเข้ามาใหม่ (คนขับกด/ซิงก์) วาดแถบกับรายการใหม่ทันที */
      const pick = root.querySelector('[data-billpick]');
      const paintFlow = () => {
        const fresh = getJob(j.id);
        if (!fresh) return;
        const sel = pickedBill(fresh);
        root.querySelector('[data-flowbox]').innerHTML = flowBar(billFlow(fresh, sel));
        pick.innerHTML = billOptions(fresh, sel);
      };
      pick.addEventListener('change', () => { billPick = { trip: j.id, stop: pick.value }; paintFlow(); });
      const offLive = subscribe(() => root.isConnected ? paintFlow() : offLive());
      mountShots(root, j, shotEvents, shotEdits);
      mountPay(root, j);
      wireActs(root, j, [], () => openTrip(j.id));
      keepScroll(root, `trip:${j.id}`);

      /* ปิดหน้าต่างเมื่อไหร่ก็เลิกจำ — เช็กว่าไม่มีหน้าต่างอื่นเปิดแทน
         เพราะตอนกดบันทึกระบบจะปิดแล้วเปิดใบเดิมใหม่ทันที */
      const watch = new MutationObserver(() => {
        if (root.isConnected || document.querySelector('.scrim')) return;
        dropUI('ops', 'trip', 'payDraft');
        /* ปิดจนไม่เหลือหน้าต่างแล้ว = เลิกดูเที่ยวนี้ เปิดใหม่คราวหน้าเริ่มที่บนสุด + กลับไปดูภาพรวมทั้งเที่ยว */
        scrollMemo.clear();
        billPick = null;
        offLive();
        watch.disconnect();
      });
      watch.observe(document.body, { childList: true });
      /* ไม่เรียก close() เอง — modal() ปิดใบเดิมให้อยู่แล้ว และถ้าปิดก่อน
         openJob() จะจำตำแหน่งเลื่อนไม่ทัน เพราะหน้าต่างหลุดจาก DOM ไปแล้ว */
      on(root, 'click', 'tr[data-stopid]', (e, tr) => openJob(tr.dataset.stopid));
      on(root, 'click', 'tr[data-grpid]', (e, tr) => openGroup(j.id, tr.dataset.grpid));
      root.querySelector('[data-rtadd]')?.addEventListener('click', () => addRtStopDialog(j, () => openTrip(j.id)));
      root.querySelectorAll('[data-rtclose]').forEach(b => b.addEventListener('click', () => {
        const x = j.stopList.find(v => v.id === b.dataset.rtclose);
        /* ปิดงานแล้วเที่ยวด่วนอาจถูกรวมเข้าเที่ยวอื่น (เลขเปลี่ยน) — เปิดเที่ยวที่จุดนี้อยู่ตอนนี้ */
        if (x) closeRtDialog(x, j, (done) => openTrip(done.jobId));
      }));
    },
  });
}

/* ---------- ร้านเดียวกันหลายบิล ----------------------------
   จุดส่งในเที่ยวที่ผู้รับชื่อเดียวกัน (stopGroups ใน store.js) แสดงเป็นแถวเดียว กดเข้าไปดูทีละบิล
   คนขับส่งร้านนี้ทีเดียว: รูปสินค้าชุดเดียวกัน ใบ Invoice แยกของแต่ละบิล */
const pendingOf = (stops) => {
  const live = stops.filter(x => x.status !== S.CANCELLED);
  if (!live.length) return S.CANCELLED;
  return live.reduce((a, x) => FLOW.indexOf(x.status) < FLOW.indexOf(a) ? x.status : a, live[0].status);
};

/* ป้ายงานด่วนของจุดส่ง — ติดตลอดแม้ปิดงานแล้ว · ต่อท้ายประเภทเอกสารถ้าเลือกไว้ */
/* ป้ายบิลเลขซ้ำ (31 ต.ค.: ส่งใหม่ด้วย Invoice เดิม — นำเข้าได้ แต่เตือนทุกบิลของเลขนั้น) */
const reuseTag = (x) => {
  const r = reusedOf(x);
  return r ? `<span class="dup-tag" title="${esc(r.others.map(o => o.code).join(', '))}">🔁 เลขบิล ${esc(r.no)} ซ้ำ · มีอีก ${fmtNum(r.others.length)} บิล</span>` : '';
};
const rtTag = (x) => x.realtime
  ? `<span class="prov prov-rt">⚡ งานด่วน${rtDocLabel(x) ? ` · ${esc(rtDocLabel(x))}` : ''}</span>` : '';

function groupTr(g, i){
  const sent = g.stops.filter(x => x.status === S.DELIVERED).length;
  const kg = g.stops.reduce((t, x) => t + (Number(x.cargo?.weightKg) || 0), 0);
  const first = g.stops[0];
  const nProb = g.stops.filter(isProblem).length;
  return `
          <tr data-clickable data-grpid="${first.id}"${nProb ? ' class="is-problem"' : ''}>
            <td>${sent === g.stops.length ? '✓' : i + 1}</td>
            <td>
              ${nProb ? `<span class="prob-tag">⚠ บิลมีปัญหา ${fmtNum(nProb)} บิล</span><br>` : ''}
              <span class="code">${fmtNum(g.stops.length)} บิล</span>
              ${g.stops.map(x => `<br><span class="tiny dim mono">${esc(x.code)}</span>${rtTag(x)}${reuseTag(x)}`).join('')}
            </td>
            <td><span class="strong trunc" style="display:block;max-width:280px">${esc(first.dropoff.name)}</span>
                <span class="tiny dim trunc" style="display:block;max-width:280px">${esc(first.customer.name)}</span>
                <span class="tiny" style="color:var(--amber-dim)">กดเพื่อดูแยกทีละบิล →</span></td>
            <td class="tnum nowrap">${fmtNum(Math.round(kg))} กก.</td>
            <td>${pill(pendingOf(g.stops))}${sent && sent < g.stops.length ? `<br><span class="tiny dim">ส่งแล้ว ${fmtNum(sent)}/${fmtNum(g.stops.length)}</span>` : ''}</td>
          </tr>`;
}

/** กลุ่มที่จุดส่งนี้อยู่ (เฉพาะร้านที่มีมากกว่า 1 บิล) */
function groupOf(j, stopId){
  const g = j && stopGroups(j.stopList).find(v => v.stops.some(x => x.id === stopId));
  return g && g.stops.length > 1 ? g : null;
}

function openGroup(jobId, stopId){
  rememberScroll();
  const j = getJob(jobId);
  const g = groupOf(j, stopId);
  if (!g) return j ? openTrip(jobId) : toast('ไม่พบเที่ยวนี้', 'err');
  const first = g.stops[0];
  const sent = g.stops.filter(x => x.status === S.DELIVERED).length;

  modal({
    wide: true,
    reopen: { name:'group', args:{ jobId, stopId } },
    title: `<span class="row gap-10 wraps">${backArrow(`เที่ยว ${j.code}`)}<span class="strong">${esc(first.dropoff.name)}</span>${pill(pendingOf(g.stops))}</span>`,
    body: `
<div class="stack gap-18">
  <p class="tiny dim">
    <button type="button" class="linkish" data-back>เที่ยว ${esc(j.code)}</button> ·
    ${fmtNum(g.stops.length)} บิล · ส่งแล้ว ${fmtNum(sent)} · ${esc(first.dropoff.address || '')}
  </p>
  <p class="tiny dim">คนขับส่งร้านนี้ครั้งเดียว: ถ่ายรูปสินค้า 1 ชุดใช้ร่วมกัน แล้วถ่ายใบ Invoice แยกทีละบิล — กดบิลเพื่อดูรายละเอียดและหลักฐานของบิลนั้น</p>
  <table class="rv" style="font-size:13px">
    <thead><tr><th style="width:38px">บิล</th><th>เลขจุดส่ง</th><th>ใบ Invoice</th><th>น้ำหนัก</th><th>สถานะ</th></tr></thead>
    <tbody>
      ${[...g.stops].sort((a, b) => isProblem(b) - isProblem(a)).map((x, k) => `
        <tr data-clickable data-stopid="${x.id}"${isProblem(x) ? ' class="is-problem"' : ''}>
          <td>${x.status === S.DELIVERED ? '✓' : k + 1}</td>
          <td>
            ${problemTag(x, { note:false })}${isProblem(x) ? '<br>' : ''}
            <span class="code">${esc(x.code)}</span>${rtTag(x)}${!x.realtime && x.source?.provisional ? '<span class="prov">รอ Invoice</span>' : ''}
            ${x.delivery ? `<br><span class="tiny dim mono">Delivery ${esc(x.delivery)}</span>` : ''}
            ${x.source?.shipmentNo ? `<br><span class="tiny dim mono">Shipment ${esc(x.source.shipmentNo)}</span>` : ''}
          </td>
          <td>${x.invoice?.number ? `<span class="mono">${esc(x.invoice.number)}</span>` : '<span class="tiny dim">—</span>'}
              ${x.invoice?.amount ? `<br><span class="tiny dim tnum">${esc(fmtBaht(x.invoice.amount))}</span>` : ''}
              ${sentBy(x)}</td>
          <td class="tnum nowrap">${fmtNum(Math.round(x.cargo.weightKg))} กก.</td>
          <td>${stopPill(x)}</td>
        </tr>`).join('')}
    </tbody>
  </table>
  ${actsPanel(() => groupActs(g.stops))}
</div>`,
    foot: (() => {
      const left = g.stops.filter(x => isOpen(x.status));
      return left.length && FLOW.indexOf(j.status) >= FLOW.indexOf(S.DEPARTED)
        ? `<span class="grow"></span><button class="btn btn-ghost" data-standin>ยืนยันแทนคนขับ · ส่งมอบ ${fmtNum(left.length)} บิล</button>` : '';
    })(),
    onMount(root){
      keepScroll(root, `grp:${first.id}`);
      root.querySelector('[data-standin]')?.addEventListener('click', () =>
        standInShop(j, g.stops.filter(x => isOpen(x.status)), () => openGroup(jobId, stopId)));
      wireBack(root, () => openTrip(jobId));
      wireActs(root, j, g.stops, () => openGroup(jobId, stopId));
      on(root, 'click', 'tr[data-stopid]', (e, tr) => openJob(tr.dataset.stopid));
    },
  });
}

/** ยืนยันขั้นของทั้งเที่ยวแทนคนขับ (ขึ้นรถ · ออกจากคลัง) */
function standInJob(j, next, driverId = j.driverId){
  standInDialog({ step: next, jobId: j.id, driverId,
    head: `เที่ยว <span class="code">${esc(j.code)}</span> · ${fmtNum(j.stops)} จุดส่ง`,
    onDone: () => openTrip(j.id) });
}

/* ---------- ยืนยันแทนคนขับ เลือกได้ว่าแทนใคร (31 ต.ค. — ลูกค้าแจ้ง: งานไป 3 คน ยืนยันแทนได้คนเดียว) ----------
   แต่ละคนมีขั้นของตัวเอง (store.js crewStep) → ขั้นถัดไปของคนนั้น · บันทึกในชื่อคนนั้น (byId) ขยับเฉพาะคนนั้น
   ส่งมอบไม่อยู่ที่นี่ — ปิดทีละจุดส่งเหมือนเดิม */
const crewStandable = (j) => isOpen(j.status) ? (j.driverIds || []).filter(id => getDriver(id)).map(id => {
  const nx = nextOf(crewStep(j, id));
  return { id, next: nx && nx !== S.DELIVERED ? nx : null };
}).filter(c => c.next) : [];

function crewStandIn(j){
  const all = isOpen(j.status) ? (j.driverIds || []).filter(id => getDriver(id)) : [];
  const ok = crewStandable(j);
  if (!ok.length) return toast('ไม่มีคนขับที่ต้องยืนยันขั้นถัดไป — ส่งของยืนยันทีละจุดส่ง', 'warn');
  if (all.length === 1) return standInJob(j, ok[0].next, ok[0].id);
  rememberScroll();
  modal({
    title: `<span class="row gap-10 wraps">${backArrow(`เที่ยว ${j.code}`)}ยืนยันแทนคนขับ · เลือกคน</span>`,
    body: `
<p class="muted small" style="margin-bottom:12px">เที่ยว <span class="code">${esc(j.code)}</span> · แต่ละคนขยับขั้นของตัวเอง กดแทนคนไหน จะบันทึกในชื่อคนนั้นคนเดียว</p>
<div class="stack gap-10">
  ${all.map(id => {
    const d = getDriver(id), c = ok.find(v => v.id === id);
    return `
  <div class="panel row between wraps gap-10" style="align-items:center">
    <span class="grow"><span class="strong" style="display:block">${esc(driverName(d))}</span>
      <span class="tiny dim">ตอนนี้: ${esc(META[crewStep(j, id)]?.label || '')}</span></span>
    ${c ? `<button type="button" class="btn btn-accent btn-sm" data-standfor="${esc(id)}">ยืนยันแทน · ${esc(META[c.next].label)}</button>`
        : '<span class="tiny dim">ออกจากคลังแล้ว — ส่งของทีละจุดส่ง</span>'}
  </div>`;
  }).join('')}
</div>`,
    foot: '<button class="btn btn-ghost" data-back>กลับ</button>',
    onMount(root){
      wireBack(root, () => openTrip(j.id));
      root.querySelectorAll('[data-standfor]').forEach(b => b.addEventListener('click', () => {
        const c = ok.find(v => v.id === b.dataset.standfor);
        if (c) standInJob(j, c.next, c.id);
      }));
    },
  });
}

/* ---------- แก้ไขงานจากหน้าต่างเที่ยว ---------------------------
   หน้าแก้ไขข้อมูลใบงานแก้ได้ทีละบิล — ขึ้นรายชื่อบิลของเที่ยวให้เลือกก่อนทุกครั้ง
   (บิลที่ยกเลิกแล้วแก้ไม่ได้ เหมือนปุ่มในหน้าใบงาน) */
function tripEditPick(j){
  const bills = (getJob(j.id)?.stopList || j.stopList || []).filter(x => x.status !== S.CANCELLED);
  if (!bills.length) return toast('เที่ยวนี้ไม่มีบิลที่แก้ไขได้', 'warn');
  rememberScroll();
  modal({
    title: `<span class="row gap-10 wraps">${backArrow(`เที่ยว ${j.code}`)}แก้ไขงาน · เลือกบิล</span>`,
    body: `
<p class="muted small" style="margin-bottom:12px">เที่ยว <span class="code">${esc(j.code)}</span> · ${fmtNum(bills.length)} บิล · กดบิลที่จะแก้ไข</p>
<div class="stack gap-10">
  ${bills.map(x => `
  <button type="button" class="panel row between wraps gap-10" data-editbill="${esc(x.id)}"
    style="align-items:center;text-align:left;cursor:pointer;width:100%">
    <span class="grow">
      <span class="code">${esc(x.code)}</span>
      <span class="strong trunc" style="display:block;margin-top:4px">${esc(x.dropoff.name)}</span>
      <span class="tiny dim">${esc(fmtBaht(x.invoice?.amount || 0))} · ${fmtNum(Math.round(x.cargo.weightKg))} กก.</span>
    </span>
    ${stopPill(x)}
  </button>`).join('')}
</div>`,
    foot: '<button class="btn btn-ghost" data-back>กลับ</button>',
    onMount(root){
      wireBack(root, () => openTrip(j.id));
      root.querySelectorAll('[data-editbill]').forEach(b => b.addEventListener('click', () => {
        const s = getShipment(b.dataset.editbill);
        if (s) editDialog(s);
      }));
    },
  });
}

/* ---------- ทีมคลังยืนยันแทนคนขับ ----------------------------
   ใช้ได้ทุกขั้นของคนขับ (ขึ้นรถ · ออกจากคลัง · ส่งมอบ) — ตอนคนขับแจ้งทางโทรศัพท์/LINE หรือมือถือมีปัญหา
   รูป พิกัด ลายเซ็น ไม่บังคับ (store.js standInBy) แต่แนบรูปที่คนขับส่งมาได้เลย
   ส่งมอบของร้านเดียวกันหลายบิลปิดพร้อมกันทั้งร้าน เหมือนฝั่งคนขับ: รูปสินค้าชุดเดียว + ใบ Invoice แยกบิล
   บันทึกเป็นชื่อคนขับ "(บันทึกแทนโดย …)" และ event ติดป้าย standIn
   ส่งมอบ: เลือกผลการส่งเหมือนหน้าคนขับ (2 พ.ย. — ลูกค้าขอ) · ส่งไม่สำเร็จ = บังคับหมายเหตุ ซ่อนรูป Invoice + ชื่อผู้รับ */
function standInDialog({ step, jobId, driverId, bills = [], head, onDone }){
  const ses = getSession();
  const staffName = ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง';
  const d = driverId ? getDriver(driverId) : null;
  const byName = `${d ? driverName(d) : 'คนขับ'} (บันทึกแทนโดย ${staffName})`;
  const deliver = step === S.DELIVERED;
  const multi = bills.length > 1;
  /* ชุดรูป (ไม่บังคับ) — cargo = รูปสินค้า · inv0, inv1… = ใบ Invoice ของแต่ละบิล */
  const sets = {
    ...(NEEDS_PHOTO.has(step) ? { cargo: { list: [], max: 900, q: 0.6, title: 'รูปสินค้า' } } : {}),
    ...Object.fromEntries((deliver ? bills : []).map((b, k) => [`inv${k}`,
      { list: [], max: 1600, q: 0.8, title: `ใบ Invoice ${multi ? `บิลที่ ${k + 1} ` : ''}(${b.invoice?.number || b.code})`, bill: b }])),
  };
  const shotBox = (key, set) => `
  <div class="shotbox" data-set="${key}">
    <div class="row between wraps gap-8" style="align-items:baseline">
      <span class="strong" style="font-size:14px">${esc(set.title)} <span class="hint">(ไม่บังคับ)</span></span>
      <span class="tiny dim"><span data-n>0</span> รูป</span>
    </div>
    <div class="photo-grid" data-shots style="margin-top:8px"></div>
    <label class="btn btn-quiet btn-sm" style="margin-top:8px;align-self:flex-start">
      + เพิ่มรูป<input type="file" accept="image/*" multiple hidden data-add>
    </label>
  </div>`;

  modal({
    title: `ยืนยันแทนคนขับ · ${esc(META[step].label)}`,
    body: `
<div class="stack gap-14">
  <p class="muted small">${head}</p>
  <p class="tiny dim">ใช้ตอนคนขับแจ้งทางโทรศัพท์/LINE หรือมือถือคนขับใช้ไม่ได้ — รูป พิกัด ลายเซ็น ไม่บังคับ
    มีรูปที่คนขับส่งมาก็แนบได้เลย (เพิ่มทีหลังได้จากหน้าต่างเที่ยว/ใบงาน)</p>
  ${deliver ? `
  <div class="field">
    <span class="label">ผลการส่ง<span class="req">*</span></span>
    <select class="input select" data-outcome>
      <option value="" selected disabled>— เลือกผลการส่ง —</option>
      ${Object.entries(OUTCOMES).map(([k, v]) => `<option value="${k}">${esc(v)}${isFailOutcome(k) ? ' (ต้องพิมพ์หมายเหตุ)' : ''}</option>`).join('')}
    </select>
  </div>` : ''}
  ${Object.entries(sets).map(([k, v]) => shotBox(k, v)).join('')}
  ${deliver ? `
  <label class="field" data-recv>
    <span class="label">ชื่อผู้รับ <span class="hint">(ไม่บังคับ)</span></span>
    <input class="input" data-receiver value="${esc(bills[0]?.dropoff?.contact || '')}" placeholder="ชื่อคนที่มารับของ">
  </label>` : ''}
  <label class="field">
    <span class="label">หมายเหตุ <span class="hint" data-notehint>(ไม่บังคับ)</span></span>
    <textarea class="textarea" data-note style="min-height:56px" placeholder="เช่น คนขับโทรแจ้ง 14:30 · มือถือแบตหมด"></textarea>
  </label>
  <p class="tiny dim">บันทึกในชื่อ <strong>${esc(byName)}</strong></p>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn ${deliver ? 'btn-green' : 'btn-accent'}" data-ok>ยืนยัน · ${esc(META[step].label)}${multi ? ` ${fmtNum(bills.length)} บิล` : ''}</button>`,
    onMount(root){
      bindZoom(root);
      function paint(key){
        const box = root.querySelector(`[data-set="${key}"]`);
        const list = sets[key].list;
        box.querySelector('[data-n]').textContent = list.length;
        box.querySelector('[data-shots]').innerHTML = list.map((p, i) => `
          <span class="photo-x"><img src="${p}" alt="รูป ${i + 1}"><button type="button" data-rm="${i}" aria-label="ลบรูป">×</button></span>`).join('');
      }
      for (const [key, set] of Object.entries(sets)){
        const box = root.querySelector(`[data-set="${key}"]`);
        const inp = box.querySelector('[data-add]');
        inp.addEventListener('change', async () => {
          for (const f of [...inp.files]){
            try{ set.list.push(await shrinkImage(f, set.max, set.q)); }
            catch(err){ toast(err.message, 'err'); }
          }
          inp.value = '';
          paint(key);
        });
        on(box, 'click', '[data-rm]', (e, b) => { set.list.splice(Number(b.dataset.rm), 1); paint(key); });
      }

      const okBtn = root.querySelector('[data-ok]');
      const outSel = root.querySelector('[data-outcome]');
      const noteEl = root.querySelector('[data-note]');
      const okText = okBtn.textContent;
      let outcome = '';
      const fail = () => isFailOutcome(outcome);
      outSel?.addEventListener('change', () => {
        outcome = outSel.value;
        const f = fail();
        root.querySelectorAll('[data-set^="inv"], [data-recv]').forEach(el => { el.style.display = f ? 'none' : ''; });
        root.querySelector('[data-notehint]').innerHTML = f ? '<span class="req">*</span>' : '(ไม่บังคับ)';
        noteEl.placeholder = f ? `${OUTCOMES[outcome]} เพราะอะไร เช่น โทรแล้วไม่รับสาย / ของเสียหาย` : 'เช่น คนขับโทรแจ้ง 14:30 · มือถือแบตหมด';
        okBtn.className = `btn ${f ? 'btn-danger' : 'btn-green'}`;
        okBtn.textContent = f ? `บันทึกผล · ${OUTCOMES[outcome]}${multi ? ` ${fmtNum(bills.length)} บิล` : ''}` : okText;
      });
      okBtn.onclick = async () => {
        if (deliver && !outcome) return toast('เลือกผลการส่งก่อน', 'warn', 4000);
        if (fail() && !noteEl.value.trim()) return toast(`${OUTCOMES[outcome]} — พิมพ์หมายเหตุก่อน`, 'warn', 4000);
        const note0 = noteEl.value.trim() || 'ยืนยันแทนคนขับ';
        const receiver = fail() ? '' : root.querySelector('[data-receiver]')?.value.trim();
        const note = receiver ? `${note0} · ผู้รับ: ${receiver}` : note0;
        const label = okBtn.textContent;
        okBtn.disabled = true;
        okBtn.textContent = 'กำลังบันทึก…';
        const up = async (key, dir) => {
          const list = sets[key]?.list || [];
          if (!list.length) return [];
          try{ return await uploadPhotos(list, dir); }
          catch(err){ console.error('[ops] อัปรูปแทนคนขับไม่สำเร็จ', err); return list; }
        };
        try{
          const by = { byRole:'ops', byName, note, standIn: true, byId: driverId || '' };
          if (deliver){
            by.fuel = await pttPrices();   /* ราคาน้ำมันวันนี้ — จดไว้ในบันทึกปิดเฉย ๆ (ค่ารอบให้พนักงานกรอกเอง) */
            const photos = await up('cargo', stopPhotoDir(bills[0], step, 'cargo'));
            const inv = fail() ? bills.map(() => []) : await Promise.all(bills.map((b, k) => up(`inv${k}`, stopPhotoDir(b, step, 'invoice'))));
            const r = deliverStops(bills.map((b, k) => ({ stopId: b.id, by: { ...by, photos, invoicePhotos: inv[k], ...(fail() ? { outcome } : {}) } })));
            toast(r.jobClosed ? 'ปิดครบทุกจุดแล้ว — เที่ยวนี้ปิดแล้ว'
              : fail() ? `บันทึก “${OUTCOMES[outcome]}”${multi ? ` ${fmtNum(bills.length)} บิล` : ''} แทนคนขับแล้ว`
              : `บันทึกส่งมอบ${multi ? ` ${fmtNum(bills.length)} บิล` : ''} แทนคนขับแล้ว`, fail() ? 'warn' : 'ok');
            if (jobId) pushMaster(jobId, 'jobs', jobId);
          } else {
            const photos = await up('cargo', jobPhotoDir(getJob(jobId) || { id: jobId }, step));
            advanceJob(jobId, step, { ...by, photos });
            toast(`บันทึก “${META[step].label}” แทนคนขับแล้ว`, 'ok');
          }
          onDone();
        }catch(err){
          toast(err.message, 'err');
          okBtn.textContent = label;
          okBtn.disabled = false;
        }
      };
    },
  });
}

/* ---------- แก้รูปหลักฐานของเที่ยว --------------------------
   รูปขั้น "ขึ้นรถแล้ว" คนขับถ่ายครั้งเดียวต่อเที่ยว จึงถูกเก็บไว้ในไทม์ไลน์
   ของ "เที่ยว" ไม่ได้อยู่ในใบจุดส่งใบไหนเลย หน้าต่างแก้ใบงานรายจุดส่ง
   จึงมองไม่เห็นรูปชุดนี้ แอดมินต้องแก้จากหน้าต่างเที่ยวตรงนี้เท่านั้น

   แก้ในสำเนาก่อน (edits) แล้วเขียนจริงตอนกดบันทึก — ปิดหน้าต่างไปเฉย ๆ
   คือการยกเลิก ไม่ต้องมีปุ่มยกเลิกแยก --------------------------- */
function mountShots(root, j, shotEvents, edits){
  if (!shotEvents.length) return;
  const note = root.querySelector('[data-shotnote]');
  const IDLE = 'แก้แล้วต้องกดบันทึก ปิดหน้าต่างไปเฉย ๆ จะไม่เปลี่ยนอะไร';

  const labelOf = (st) => META[st]?.label || st;

  function touched(){
    note.textContent = 'มีรูปที่แก้ไว้ยังไม่ได้บันทึก — กด "บันทึกรูป"';
    note.style.color = 'var(--amber-dim)';
  }

  function paintShots(evId){
    const box = root.querySelector(`[data-ev="${evId}"]`);
    if (!box) return;
    const list = edits.get(evId) || [];
    const ev = shotEvents.find(e => e.id === evId);
    const short = NEEDS_PHOTO.has(ev.status) && list.length < minPhotos(ev.status);

    box.querySelector('[data-shots]').innerHTML = list.length
      ? list.map((p, i) => `<span class="photo-x"><img src="${p}" alt="รูปหลักฐาน ${i + 1}"
          data-zoom="${p}" style="cursor:zoom-in" loading="lazy">
          <button type="button" data-rmshot="${i}" aria-label="ลบรูป">×</button></span>`).join('')
      : '<p class="tiny dim">ยังไม่มีรูปในขั้นนี้</p>';

    const n = box.querySelector('[data-n]');
    n.textContent = list.length;
    n.style.color = short ? 'var(--red)' : '';
    n.style.fontWeight = short ? '700' : '';
  }
  shotEvents.forEach(e => paintShots(e.id));

  on(root, 'click', '[data-rmshot]', (e, b) => {
    const evId = b.closest('[data-ev]').dataset.ev;
    edits.get(evId).splice(Number(b.dataset.rmshot), 1);
    paintShots(evId);
    touched();
  });

  $$('[data-addshot]', root).forEach(inp => {
    inp.addEventListener('change', async () => {
      const evId = inp.closest('[data-ev]').dataset.ev;
      const list = edits.get(evId);
      const added = [];
      for (const f of [...inp.files]){
        try{ added.push(await shrinkImage(f, 900, 0.6)); }
        catch(err){ toast(err.message, 'err'); }
      }
      inp.value = '';
      if (!added.length) return;

      /* อัปขึ้น Storage ก่อนแล้วเก็บแค่ URL เหมือนฝั่งคนขับ
         ไม่งั้นรูป base64 หลายใบจะทำให้เอกสารเที่ยวใหญ่เกินลิมิต */
      note.textContent = `กำลังอัปโหลด ${added.length} รูป…`;
      try{
        const urls = await uploadPhotos(added, jobPhotoDir(j, j.events?.find(e => e.id === evId)?.status || evId));
        list.push(...urls);
        paintShots(evId);
        touched();
      }catch(err){
        toast(`อัปโหลดรูปไม่สำเร็จ: ${err.message}`, 'err');
        note.textContent = IDLE;
      }
    });
  });

  root.querySelector('[data-shotsave]')?.addEventListener('click', () => {
    /* ตรวจให้ครบทุกขั้นก่อนเขียนแม้แต่ขั้นเดียว — ไม่งั้นขั้นแรกบันทึกไปแล้ว
       ขั้นหลังค่อย error จะได้ข้อมูลครึ่ง ๆ กลาง ๆ */
    for (const e of shotEvents){
      const list = edits.get(e.id) || [];
      if (NEEDS_PHOTO.has(e.status) && list.length < minPhotos(e.status)){
        return toast(`ขั้น "${labelOf(e.status)}" ต้องมีอย่างน้อย ${minPhotos(e.status)} รูป — ตอนนี้เหลือ ${list.length} รูป`, 'warn', 4500);
      }
    }
    try{
      let n = 0;
      for (const [evId, list] of edits){
        if (updateJobEventPhotos(j.id, evId, list, { byRole:'ops', byName:'ทีมคลังบางนา' }).changed) n++;
      }
      if (!n) return toast('ยังไม่มีรูปที่เปลี่ยน', 'warn');
      toast(`บันทึกรูปแล้ว ${n} ขั้น`, 'ok');
      openTrip(j.id);
    }catch(err){ toast(err.message, 'err'); }
  });

  note.textContent = IDLE;
}

/* ---------- จำตำแหน่งเลื่อนของหน้าต่าง ------------------------
   การ "ย้อนกลับ" คือวาดหน้าต่างเดิมขึ้นมาใหม่ทั้งใบ กล่องที่เลื่อนจึงเริ่มที่ 0 เสมอ
   เที่ยวหนึ่งมีจุดส่งเป็นร้อย ถ้าดูจุดล่าง ๆ แล้วกดย้อนกลับมาเจอบนสุดทุกครั้ง
   แทบใช้งานไม่ได้ จึงจำตำแหน่งไว้ต่อหนึ่งหน้าต่าง แล้วคืนให้ตอนเปิดใบเดิมซ้ำ

   ตัวที่เลื่อนคือ .modal เอง (overflow:auto) ไม่ใช่ .modal-body

   จับตำแหน่ง ณ ตอนกดสลับหน้าต่าง ไม่ดักอีเวนต์ scroll — เพราะเบราว์เซอร์
   ไม่ยิง scroll ให้เลยตอนแท็บไม่ได้อยู่หน้าจอ ดักไว้ก็ได้ค่าว่าง */
const scrollMemo = new Map();

/** บันทึกตำแหน่งของหน้าต่างที่เปิดอยู่ตอนนี้ — เรียกก่อนเปิดหน้าต่างใบใหม่เสมอ */
function rememberScroll(){
  const box = document.querySelector('.scrim .modal');
  const key = box?.dataset.scrollKey;
  if (key) scrollMemo.set(key, box.scrollTop);
}

/** คืนตำแหน่งเดิมให้หน้าต่างที่เพิ่งวาดใหม่
 *  เรียกท้าย onMount หลังเนื้อหาที่เติมทีหลัง (ค่ารอบ/รูป) ขึ้นครบแล้ว
 *  ไม่งั้นความสูงยังไม่เต็ม ค่าที่ตั้งจะถูกหั่นให้เหลือเท่าที่เลื่อนได้ตอนนั้น */
function keepScroll(root, key){
  const box = root.querySelector('.modal');
  if (!box) return;
  box.dataset.scrollKey = key;

  const saved = scrollMemo.get(key);
  if (!saved) return;
  box.scrollTop = saved;
  requestAnimationFrame(() => { if (box.isConnected) box.scrollTop = saved; });
}

/* ---------- ทางย้อนกลับของหน้าต่างลูก ------------------------
   หน้าต่างที่เปิดต่อจากหน้าต่างอื่นต้องมีทางกลับเสมอ ของเดิมมีแต่ปุ่มปิด
   ปิดไปแล้วต้องไล่เปิดใหม่ตั้งแต่กระดาน → เที่ยว → จุดส่ง ทุกครั้ง

   `modal()` เปิดได้ทีละใบ การ "ย้อนกลับ" จึงคือปิดใบนี้แล้วเปิดใบแม่ใหม่ */
const backArrow = (label) =>
  `<button class="icon-btn" data-back title="กลับไปที่ ${esc(label)}"
     aria-label="กลับไปที่ ${esc(label)}">←</button>`;

/** ผูกปุ่มย้อนกลับทุกตัวในหน้าต่าง (หัวหน้าต่าง ลิงก์ในเนื้อหา และปุ่มยกเลิกท้ายหน้าต่าง) */
function wireBack(root, go){
  /* go() เปิดหน้าต่างใบแม่ ซึ่ง modal() จะปิดใบนี้ให้เอง — ห้ามปิดเองก่อน
     ไม่งั้น rememberScroll() ในใบแม่จะหาหน้าต่างปัจจุบันไม่เจอ */
  $$('[data-back]', root).forEach(b => b.addEventListener('click', () => go()));
}

/* ---------- ใบงานรายจุดส่ง (ของเดิม) ----------------------- */
function openJob(id){
  rememberScroll();
  const s = getShipment(id);
  if (!s) return toast('ไม่พบจุดส่งนี้', 'err');

  const assigned = s.driverId ? getDriver(s.driverId) : null;
  const extDriver = isExternal(assigned) ? assigned : null;
  /* จุดส่งเปิดได้จากหน้าต่างเที่ยวทางเดียว จึงมีทางกลับเสมอถ้ารู้ว่าอยู่เที่ยวไหน
     ของเดิมมีแต่ปุ่มปิด ต้องปิดแล้วเปิดเที่ยวใหม่เองทุกครั้ง */
  const backTrip = s.jobId ? getJob(s.jobId) : null;
  /* ร้านเดียวกันหลายบิล — ย้อนกลับไปหน้ารวมบิลของร้าน ไม่ใช่เที่ยว */
  const backGroup = groupOf(backTrip, s.id);
  const next = nextOf(s.status);
  const nextIsDriver = next && META[next].actor === 'คนขับ';
  const canReceive = s.status === S.NEW;

  const foot = [
    isOpen(s.status) ? `<button class="btn btn-danger" data-cancel>ยกเลิกงาน</button>` : '',
    s.status !== S.CANCELLED ? `<button class="btn btn-ghost" data-edit>แก้ไขข้อมูลใบงาน</button>` : '',
    `<span class="grow"></span>`,
    canReceive ? `<button class="btn btn-accent" data-receive>ตรวจรับเข้าคลัง</button>` : '',
    /* คนขับเป็นของเที่ยว — จุดส่งที่นำเข้ามาอาจไม่มี driverId ของตัวเอง ดูที่เที่ยวด้วย */
    (nextIsDriver && (s.driverId || backTrip?.driverId)) ? `<button class="btn btn-ghost" data-standin title="คนขับแจ้งทางโทรศัพท์/LINE หรือมือถือคนขับใช้ไม่ได้">ยืนยันแทนคนขับ · ${esc(META[next].label)}${backGroup && next === S.DELIVERED ? ` ทั้งร้าน` : ''}</button>` : '',
  ].filter(Boolean).join('');

  modal({
    wide: true,
    reopen: { name:'job', args:{ id } },
    title: `<span class="row gap-10 wraps">${backGroup ? backArrow(backGroup.stops[0].dropoff.name) : backTrip ? backArrow(`เที่ยว ${backTrip.code}`) : ''
      }<span class="code code-lg">${esc(s.code)}</span>${stopPill(s)}</span>`,
    body: `
<div class="stack gap-18">
  <div>
    <p class="tiny dim" style="margin-bottom:10px">${backTrip
      ? (backGroup
        ? `บิลที่ ${fmtNum(backGroup.stops.findIndex(x => x.id === s.id) + 1)} / ${fmtNum(backGroup.stops.length)} ของ
           <button type="button" class="linkish" data-back>${esc(backGroup.stops[0].dropoff.name)}</button> · เที่ยว ${esc(backTrip.code)} · `
        : `${s.seq ? `จุดส่งที่ ${fmtNum(s.seq)} ของ` : 'จุดส่งใน'}
         <button type="button" class="linkish" data-back>เที่ยว ${esc(backTrip.code)}</button> · `) : ''
      }${esc(progressText(s))}</p>
    ${flowBar(s)}
  </div>
  ${(() => { const r = reusedOf(s); return r ? `
  <div class="panel tiny" style="border-color:var(--red);background:rgba(169,35,26,.06)">
    <b>🔁 เลขบิล ${esc(r.no)} ซ้ำ</b> — มีบิลเลขนี้อีก ${fmtNum(r.others.length)} บิล (คนละ Delivery · เช่น งานส่งใหม่หลังส่งไม่สำเร็จ) ตรวจกับใบบิลจริง
    <div class="row wraps gap-6" style="margin-top:6px">${r.others.map(o =>
      `<button type="button" class="code" data-reuse="${esc(o.id)}" style="cursor:pointer">${esc(o.code)} <span class="dim">${esc(META[o.status]?.short || o.status)}</span></button>`).join('')}</div>
  </div>` : ''; })()}
  ${isProblem(s) || s.problemCleared ? `
  <div class="prob-box${isProblem(s) ? '' : ' is-cleared'}">
    <div class="row between wraps gap-8" style="align-items:center">
      <span>${problemTag(s)}</span>
      <span class="row gap-8">
        ${isProblem(s) ? `<button type="button" class="btn btn-sm btn-ghost" data-whreturn>📦 ${whReturnOf(s) ? 'เพิ่มรูปคืนคลัง' : 'คืนของเข้าคลัง'}</button>` : ''}
        ${isProblem(s) ? '<button type="button" class="btn btn-sm btn-danger" data-clear-problem>เคลียร์แล้ว…</button>' : ''}
      </span>
    </div>
    ${isProblem(s) ? '<p class="tiny" style="margin-top:6px">ล็อกไว้ — หน้าวางบิลเลือกบิลนี้ไม่ได้จนกว่าจะกดเคลียร์</p>'
      : `<p class="tiny dim" style="margin-top:6px">${esc(s.problemCleared.byName)} · ${esc(fmtDateTime(s.problemCleared.at))}: ${esc(s.problemCleared.note)}</p>`}
  </div>` : ''}

  <div class="grid g2" style="gap:16px">
    <div class="stack gap-14">
      ${routeBlock(s)}
      ${cargoBlock(s)}
    </div>
    <div class="stack gap-12">
      ${invoiceBlock(s)}
      ${payPanel(s)}
      ${actsPanel(() => groupActs([s]))}
      ${driverBlock(s)}
      ${isOpen(s.status) ? `
      <div class="panel">
        <label class="field">
          <span class="label">จ่ายงานให้คนขับ</span>
          <select class="select" data-assign>${driverOptions(s, { allowNew:true })}</select>
          <span class="hint">คนขับในระบบจะเห็นงานนี้ทันทีที่ล็อกอิน · คนขับภายนอกเห็นผ่านลิงก์เฉพาะของตัวเอง</span>
        </label>
      </div>` : ''}
      ${extDriver ? linkPanel(extDriver) : ''}
      ${timingBlock(s)}
    </div>
  </div>

  <div>
    <h4 style="margin-bottom:12px">ไทม์ไลน์และหลักฐาน</h4>
    ${timeline(s)}
  </div>
</div>`,
    foot,
    onMount(root){
      bindZoom(root);
      keepScroll(root, `stop:${s.id}`);
      root.querySelector('[data-whreturn]')?.addEventListener('click', () => {
        const ses = getSession();
        whReturnDialog([s], { byRole:'ops', byName: ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง' }, () => openJob(s.id));
      });
      root.querySelector('[data-clear-problem]')?.addEventListener('click', () => {
        const ses = getSession();
        clearProblemDialog(s, { byRole:'ops', byName: ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง' }, () => openJob(s.id));
      });

      if (backGroup) wireBack(root, () => openGroup(s.jobId, s.id));
      else if (backTrip) wireBack(root, () => openTrip(s.jobId));

      const sel = root.querySelector('[data-assign]');
      sel?.setAttribute('data-nosave', '');   /* เลือกแล้วจ่ายงานทันที — ห้ามเซฟอัตโนมัติ/เติมค่าเก่าคืน (ui.js) */
      if (sel) sel.onchange = () => {
        /* คนขับภายนอก — กรอกข้อมูลสั้น ๆ สร้างลิงก์ แล้วจ่ายงานให้ในทีเดียว */
        if (sel.value === NEW_EXTERNAL){
          sel.value = s.driverId || '';
          return newExternalDialog((d) => {
            try{
              assignDriver(s.id, d.id, { byRole:'ops', byName:'ทีมคลังบางนา' });
              toast(`สร้างลิงก์ให้ ${d.name} และจ่ายงานแล้ว`, 'ok');
            }catch(err){ toast(err.message, 'err'); }
            linkDialog(d.id);
          });
        }
        try{
          assignDriver(s.id, sel.value || null, { byRole:'ops', byName:'ทีมคลังบางนา' });
          toast(sel.value ? 'จ่ายงานให้คนขับแล้ว' : 'ยกเลิกการจ่ายงานแล้ว', 'ok');
          openJob(s.id);
        }catch(err){ toast(err.message, 'err'); }
      };

      root.querySelector('[data-copylink]')?.addEventListener('click', () => copyLink(driverLinkUrl(extDriver)));
      root.querySelector('[data-managelink]')?.addEventListener('click', () => linkDialog(extDriver.id));

      root.querySelector('[data-edit]')?.addEventListener('click', () => editDialog(s));
      root.querySelectorAll('[data-reuse]').forEach(b => b.addEventListener('click', () => openJob(b.dataset.reuse)));
      root.querySelector('[data-pay=""]')?.addEventListener('click', () => officePay(s, backTrip));   /* ปุ่มของแผงชำระเงิน — การ์ดทำแทนคนขับใช้ data-pay="<id>" */
      wireActs(root, backTrip || { id: s.jobId, status: s.status }, [s], () => openJob(s.id));
      root.querySelector('[data-receive]')?.addEventListener('click', () => receiveDialog(s));
      root.querySelector('[data-standin]')?.addEventListener('click', () => standIn(s, next));
      root.querySelector('[data-cancel]')?.addEventListener('click', () => cancelDialog(s));
    },
  });
}

/* ---------- ช่องทางชำระเงิน (ออฟฟิศแก้) --------------------
   ปกติผู้ช่วยคนขับบันทึกหน้างาน (helper.html) — ออฟฟิศแก้ตามที่ได้รับแจ้ง ใช้หน้าต่างเดียวกัน
   บันทึก (ช่องทางชำระเงิน · คนขับ · ค่ารอบ) แล้วส่งขึ้นชีตรวม (Master) ทันที ถ้าเที่ยวนี้ส่งครบทุกจุดแล้ว
   ยังไม่ครบ = ยังไม่ส่ง — ตัวตั้งเวลาใน Apps Script ส่งให้เองเมื่อส่งครบ (AppsScript-master.gs)
   ทางกลับ (คนแก้ในชีต → แอป) Apps Script เขียน Firestore เอง หน้านี้เห็นเองผ่านตัวฟังข้อมูลสด */
const PAY_TONE = { 'เงินโอน':'move', 'เงินสด':'done', 'เครดิต':'ware' };

function payPanel(s){
  if (s.status === S.CANCELLED) return '';
  const p = s.payment;
  return `
<div class="panel">
  <div class="row between gap-8" style="align-items:center">
    <span class="label" style="margin:0">ช่องทางชำระเงิน</span>
    <button type="button" class="btn btn-ghost btn-sm" data-pay>${p ? 'แก้ไข' : 'บันทึก'}</button>
  </div>
  ${p ? `
  <div class="row gap-8" style="margin-top:8px;align-items:center;flex-wrap:wrap">
    <span class="pill" data-tone="${PAY_TONE[p.method] || 'grey'}">${esc(p.method)}</span>
    <span class="small tnum">${esc(fmtBaht(p.amount))}</span>
    <span class="tiny dim">โดย ${esc(p.byName || '—')} · ${esc(fmtDateTime(p.at))}${p.round > 1 ? ` · รอบที่ ${fmtNum(p.round)}` : ''}</span>
  </div>` : `<p class="small dim" style="margin-top:6px">ยังไม่ได้บันทึก</p>`}
  <p class="hint" style="margin-top:8px">ขึ้นชีตรวม (Master) เมื่อเที่ยวนี้ส่งครบทุกจุดแล้ว</p>
</div>`;
}

function officePay(s, trip){
  const ses = getSession();
  const byName = ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง';
  payDialog(s, trip || { id: s.jobId, status: s.status }, {
    office: true, byName,
    onSaved: async () => {
      openJob(s.id);
      if (s.jobId) await pushMaster(s.jobId, 'shipments', s.id);
    },
  });
}

/* ---------- ทำแทนคนขับ: ชำระเงิน · คืน Inv. · POD (admin เท่านั้น) ----------
   การ์ดและหน้าต่างชุดเดียวกับหน้าคนขับ/ผู้ช่วย (js/helper.js) — บันทึกในชื่อ admin (byRole 'ops')
   เที่ยว = คืน Inv. ทุกจุด · ปริ้น POD ทุกจุด · ร้าน = ทุกบิลของร้าน · บิล = บิลเดียว
   ชำระเงินส่งขึ้นชีตรวม (Master) ทันทีเหมือนแผงชำระเงิน · คืน Inv. ให้ตัวตั้งเวลาใน Apps Script ส่งเหมือนฝั่งคนขับ */
const canActFor = () => isAdmin(getSession()?.staff);
const actsPanel = (draw) => {
  const inner = canActFor() ? draw() : '';
  return inner ? `
<div class="panel" data-acts>
  <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:8px">
    <span class="label" style="margin:0">ทำแทนคนขับ</span>
    <span class="tiny dim">admin เท่านั้น · บันทึกในชื่อคุณ</span>
  </div>
  ${inner}
</div>` : '';
};

function wireActs(root, j, bills, reopen){
  const box = root.querySelector('[data-acts]');
  if (!box) return;
  const ses = getSession();
  const opts = { byName: ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง', byRole: 'ops', onSaved: reopen };
  const live = bills.filter(x => x.status !== S.CANCELLED);
  const x = live[0];
  box.querySelector('[data-pay]')?.addEventListener('click', () => payDialog(x, j, {
    ...opts, office: true, bills: live,
    onSaved: async () => {
      reopen();
      for (const b of live) if (b.jobId) await pushMaster(b.jobId, 'shipments', b.id);
    },
  }));
  box.querySelector('[data-invret]')?.addEventListener('click', () => invRetDialog(x, j, { ...opts, bills: live }));
  box.querySelector('[data-pod]')?.addEventListener('click', () => podStop(x, j, live));
  box.querySelector('[data-invret-all]')?.addEventListener('click', () => invRetAllDialog(j, opts));
  box.querySelector('[data-pod-trip]')?.addEventListener('click', () => podTrip(j));
}

/* ---------- แก้ไขข้อมูลใบงาน --------------------------------
   ใช้ตอนใบแจ้งหนี้ตามมาทีหลัง เปลี่ยนคนขับ หรือลูกค้าแจ้งแก้ปลายทาง
   ทุกการแก้ไขถูกบันทึกลงไทม์ไลน์ว่าใครแก้อะไร ------------------ */
function editDialog(s){
  rememberScroll();
  const closed = !isOpen(s.status);

  /* รูปหลักฐานแยก 3 กล่อง (31 ต.ค.: รูปที่แอดมินเพิ่มทีหลังต้องรู้ว่าเป็นของส่วนไหน ไม่งั้น POD พิมพ์ผิดที่)
     up = ขนขึ้น (ขั้นขึ้นรถ — อยู่ที่เที่ยว ถ่ายครั้งเดียวทั้งเที่ยว · ใบงานเก่าที่ไม่มีเที่ยวอยู่ที่ใบงาน)
     down = ขนลง (ev.photos ของขั้นส่งมอบ = รูปสินค้าใน POD) · bill = ev.invoicePhotos (หน้ารูปใบ Invoice ใน POD)
     ทำสำเนามาแก้ก่อน ค่อยเขียนตอนกดบันทึก */
  const tripOf = s.jobId ? getJob(s.jobId) : null;
  const hasShots = (e) => Array.isArray(e.photos) && (e.photos.length || NEEDS_PHOTO.has(e.status));
  const slots = [];
  const slot = (part, holder, e, field = 'photos') =>
    slots.push({ key:`${part}-${holder}-${e.id}-${field}`, part, holder, ev:e, field, list:(e[field] || []).slice() });
  (tripOf?.events || []).filter(e => e.status === S.LOADED && hasShots(e)).forEach(e => slot('up', 'job', e));
  s.events.filter(hasShots).forEach(e => {
    if (e.status === S.LOADED) return slot('up', 'stop', e);
    if (e.status !== S.DELIVERED) return slot('other', 'stop', e);
    slot('down', 'stop', e);
    slot('bill', 'stop', e, 'invoicePhotos');
  });
  const edits = new Map(slots.map(x => [x.key, x.list]));
  const PARTS = [
    { part:'up',    title:'① รูปตอนขนขึ้น', hint:`ถ่ายครั้งเดียวทั้งเที่ยว — แก้ตรงนี้ เปลี่ยนให้ทุกบิลในเที่ยว · ต้องเหลืออย่างน้อย ${minPhotos(S.LOADED)} รูป`,
      none:'ยังไม่มีรูปขั้นขึ้นรถ' },
    { part:'down',  title:'② รูปตอนขนลง', hint:`รูปสินค้าที่ลงจุดนี้ — พิมพ์ในหน้าแรกของใบส่งของ · ต้องเหลืออย่างน้อย ${minPhotos(S.DELIVERED)} รูป`,
      none:'ยังไม่ได้ส่งมอบ — เพิ่มรูปได้หลังคนขับปิดจุดนี้' },
    { part:'bill',  title:'③ รูปบิล / ใบ Invoice', hint:'ถ่ายเฉพาะใบบิล ให้อ่านเลขออก — ใบส่งของพิมพ์รูปละหน้า A4 ต่อท้าย',
      none:'ยังไม่ได้ส่งมอบ — เพิ่มรูปได้หลังคนขับปิดจุดนี้' },
    { part:'other', title:'รูปหลักฐานอื่น', hint:'' },
  ];
  const slotHead = (x) => x.part === 'up' && x.holder === 'job' ? `เที่ยว ${tripOf.code}`
    : x.part === 'other' ? (META[x.ev.status]?.label || x.ev.status) : '';
  const slotMin = (x) => x.field === 'photos' && NEEDS_PHOTO.has(x.ev.status) ? minPhotos(x.ev.status) : 0;

  /* ไฟล์ใบแจ้งหนี้ปัจจุบัน — null = ไม่มี/ถูกเอาออก */
  let file = s.invoice.fileName
    ? { fileName:s.invoice.fileName, kind:s.invoice.kind, dataUrl:s.invoice.dataUrl, size:null }
    : null;

  const f = (name, attrs = '') => `data-f="${name}" ${attrs}`;
  /* งานด่วน: เลข 5 / SO / Invoice แก้ในกล่องของมันเอง (setRtNumbers) */
  const rt = !!s.realtime;
  const rtJob = rt && s.jobId ? getJob(s.jobId) : null;
  const rtSo = rtJob && !isRtCode(rtJob.code) ? rtJob.code : '';
  const rtInv = isRtCode(s.code) ? '' : s.code;

  modal({
    wide: true,
    title: `<span class="row gap-10 wraps">${backArrow(`ใบงาน ${s.code}`)
      }แก้ไขข้อมูลใบงาน <span class="code">${esc(s.code)}</span></span>`,
    body: `
<div class="stack gap-18">
  ${closed ? `<p class="tiny dim">งานนี้ปิดแล้ว — แก้ไขได้เพื่อให้ข้อมูลตรงความจริง เช่น ใบแจ้งหนี้เพิ่งตามมา ระบบจะบันทึกไว้ในไทม์ไลน์ทุกครั้ง</p>` : ''}

  ${rt ? `
  <fieldset class="fieldset stack gap-14">
    <legend>เลขงานด่วน</legend>
    <p class="tiny dim" style="margin:0">เลขมาทีหลัง หรือพิมพ์ผิด แก้ตรงนี้ได้ · เว้นว่าง = ไม่เปลี่ยน · ครบ Invoice + มูลค่า + SO = ปิดงานให้เอง</p>
    <div class="grid g3" style="gap:14px">
      <label class="field">
        <span class="label">เลข 5 (Delivery)</span>
        <input class="input mono" ${f('rtDelivery')} value="${esc(s.delivery || '')}" placeholder="ถ้ามี" inputmode="numeric">
      </label>
      <label class="field">
        <span class="label">เลข SO (Shipment No.)</span>
        <input class="input mono" ${f('rtShip')} value="${esc(rtSo)}" placeholder="ถ้ามี" inputmode="numeric">
        <span class="tiny dim">เปลี่ยนเลข = ย้ายไปเที่ยวเลขนั้น</span>
      </label>
      <label class="field">
        <span class="label">เลข Invoice</span>
        <input class="input mono" ${f('rtInvoice')} value="${esc(rtInv)}" placeholder="ถ้ามี" inputmode="numeric">
      </label>
    </div>
  </fieldset>` : ''}

  <fieldset class="fieldset stack gap-14">
    <legend>ใบแจ้งหนี้</legend>
    <div class="grid g2" style="gap:14px">
      ${rt ? '' : `<label class="field">
        <span class="label">เลขที่ใบแจ้งหนี้</span>
        <input class="input mono" ${f('invNumber')} value="${esc(s.invoice.number)}" placeholder="INV-2601-0000">
      </label>`}
      <label class="field">
        <span class="label">มูลค่าสินค้า (บาท)</span>
        <input class="input tnum" ${f('invAmount')} type="number" min="0" step="0.01" value="${esc(s.invoice.amount)}" inputmode="decimal">
      </label>
    </div>
    <div class="field">
      <span class="label">ไฟล์ใบแจ้งหนี้</span>
      <div class="drop" data-drop tabindex="0" role="button">
        <div class="strong">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</div>
        <div class="tiny dim" style="margin-top:4px">รองรับ PDF และรูปภาพ · แนบทีหลังได้ ไฟล์เดิมจะถูกแทนที่</div>
      </div>
      <input type="file" data-file accept="application/pdf,image/*" hidden>
      <div data-preview style="margin-top:10px"></div>
    </div>
  </fieldset>

  <fieldset class="fieldset stack gap-14">
    <legend>คนขับที่รับผิดชอบ</legend>
    <label class="field">
      <span class="label">จ่ายงานให้</span>
      <select class="select" ${f('driverId')}>${driverOptions(s)}</select>
      <span class="hint">${closed
        ? 'งานปิดแล้ว — เปลี่ยนได้เฉพาะกรณีบันทึกคนขับผิดคน'
        : 'คนขับคนใหม่จะเห็นงานนี้ในหน้าคนขับทันที คนเดิมจะไม่เห็นแล้ว'}</span>
    </label>
  </fieldset>

  <fieldset class="fieldset stack gap-14">
    <legend>ปลายทางและผู้รับ</legend>
    <div class="grid g2" style="gap:14px">
      <label class="field" style="grid-column:1/-1">
        <span class="label">ปลายทาง</span>
        <input class="input" ${f('dName')} value="${esc(s.dropoff.name)}">
      </label>
      <label class="field" style="grid-column:1/-1">
        <span class="label">ที่อยู่ปลายทาง</span>
        <textarea class="textarea" ${f('dAddress')} style="min-height:70px">${esc(s.dropoff.address)}</textarea>
      </label>
      <label class="field">
        <span class="label">ชื่อผู้รับ</span>
        <input class="input" ${f('dContact')} value="${esc(s.dropoff.contact)}">
      </label>
      <label class="field">
        <span class="label">เบอร์ผู้รับ</span>
        <input class="input" ${f('dPhone')} value="${esc(s.dropoff.phone)}" inputmode="tel">
      </label>
    </div>
  </fieldset>

  <fieldset class="fieldset stack gap-14">
    <legend>สินค้า</legend>
    <div class="grid g2" style="gap:14px">
      <label class="field" style="grid-column:1/-1">
        <span class="label">รายละเอียดสินค้า</span>
        <input class="input" ${f('cargoDesc')} value="${esc(s.cargo.desc)}">
      </label>
      <div class="field">
        <span class="label">จำนวนและหน่วย</span>
        <div class="row gap-8">
          <input class="input tnum grow" ${f('pieces')} type="number" min="0" step="1" value="${esc(s.cargo.pieces)}" inputmode="numeric">
          <input class="input" ${f('unit')} aria-label="หน่วยนับ" value="${esc(s.cargo.unit)}" maxlength="20" style="width:130px;flex:none">
        </div>
      </div>
      <label class="field">
        <span class="label">น้ำหนักรวม (กก.)</span>
        <input class="input tnum" ${f('weightKg')} type="number" min="0" step="1" value="${esc(s.cargo.weightKg)}" inputmode="numeric">
      </label>
      <label class="field">
        <span class="label">วันที่ส่ง</span>
        <input class="input" ${f('serviceDate')} type="date" value="${esc(s.serviceDate)}">
      </label>
      <label class="field" style="grid-column:1/-1">
        <span class="label">หมายเหตุถึงคนขับ</span>
        <textarea class="textarea" ${f('cargoNote')} style="min-height:64px">${esc(s.cargo.note)}</textarea>
      </label>
    </div>
  </fieldset>

  <fieldset class="fieldset stack gap-14">
    <legend>ผู้ส่ง</legend>
    <div class="grid g2" style="gap:14px">
      <label class="field" style="grid-column:1/-1">
        <span class="label">ชื่อบริษัท / ผู้ส่ง</span>
        <input class="input" ${f('cName')} value="${esc(s.customer.name)}">
      </label>
      <label class="field">
        <span class="label">ผู้ติดต่อ</span>
        <input class="input" ${f('cContact')} value="${esc(s.customer.contact)}">
      </label>
      <label class="field">
        <span class="label">เบอร์โทร</span>
        <input class="input" ${f('cPhone')} value="${esc(s.customer.phone)}" inputmode="tel">
      </label>
    </div>
  </fieldset>

  ${PARTS.map(P => {
    const mine = slots.filter(x => x.part === P.part);
    if (!mine.length && !P.none) return '';
    return `
  <fieldset class="fieldset stack gap-14">
    <legend>${esc(P.title)}</legend>
    ${P.hint ? `<p class="tiny dim" style="margin:0">${esc(P.hint)}</p>` : ''}
    ${mine.length ? mine.map(x => `
      <div class="shotbox" data-ev="${x.key}">
        <div class="row between wraps gap-8" style="align-items:baseline">
          <span class="strong" style="font-size:14px">${esc(slotHead(x))}</span>
          <span class="tiny dim">
            <span data-n>${x.list.length}</span>${slotMin(x) ? ` / ${slotMin(x)} ขั้นต่ำ` : ' รูป'}
            · โดย ${esc(x.ev.byName || '—')} · ${esc(fmtDateTime(x.ev.at))}
          </span>
        </div>
        ${x.field === 'photos' && (PHOTO_GUIDE[x.ev.status] || []).length
          ? `<p class="tiny dim" style="margin:4px 0 0">ควรมี: ${esc((PHOTO_GUIDE[x.ev.status] || []).join(' · '))}</p>` : ''}
        <div class="photo-grid" data-shots style="margin-top:8px"></div>
        <label class="btn btn-quiet btn-sm" style="margin-top:8px;align-self:flex-start">
          + เพิ่ม${esc(P.title.replace(/^[①②③]\s*/, ''))}
          <input type="file" accept="image/*" multiple hidden data-addshot>
        </label>
      </div>`).join('') : `<p class="tiny dim" style="margin:0">${esc(P.none)}</p>`}
  </fieldset>`;
  }).join('')}

  <fieldset class="fieldset stack gap-14">
    <legend>บันทึกการแก้ไข</legend>
    <div class="grid g2" style="gap:14px">
      <label class="field">
        <span class="label">ผู้แก้ไข</span>
        <input class="input" ${f('by')} value="ทีมคลังบางนา">
      </label>
      <label class="field">
        <span class="label">เหตุผล</span>
        <input class="input" ${f('note')} placeholder="ใบแจ้งหนี้ตัวจริงเพิ่งส่งมา / คนขับเดิมรถเสีย">
      </label>
    </div>
    <p class="tiny dim">ระบบจะบันทึกลงไทม์ไลน์เองว่าแก้ค่าไหนจากอะไรเป็นอะไร</p>
  </fieldset>
</div>`,
    foot: `<button class="btn btn-ghost" data-back>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>บันทึกการแก้ไข</button>`,
    onMount(root){
      wireBack(root, () => openJob(s.id));
      const drop = root.querySelector('[data-drop]');
      const input = root.querySelector('[data-file]');
      const preview = root.querySelector('[data-preview]');

      function paintFile(){
        if (!file){
          preview.innerHTML = '<p class="tiny dim">ยังไม่ได้แนบไฟล์ใบแจ้งหนี้</p>';
          return;
        }
        preview.innerHTML = `
          <div class="file-chip">
            ${file.dataUrl
              ? `<img class="file-thumb" src="${file.dataUrl}" alt="ตัวอย่างใบแจ้งหนี้">`
              : `<span class="file-thumb" style="display:grid;place-items:center;font-size:10px;font-weight:600;color:var(--text-3)">PDF</span>`}
            <span class="grow">
              <span class="strong trunc" style="display:block">${esc(file.fileName)}</span>
              <span class="tiny dim">${file.size ? fmtBytes(file.size) : 'ไฟล์เดิมของใบงานนี้'}</span>
            </span>
            <button type="button" class="icon-btn" data-drop-file aria-label="เอาไฟล์ออก">×</button>
          </div>`;
        preview.querySelector('[data-drop-file]').onclick = () => { file = null; input.value = ''; paintFile(); };
      }

      async function takeFile(f2){
        if (!f2) return;
        if (f2.size > 12 * 1024 * 1024) return toast('ไฟล์ใหญ่เกิน 12 MB', 'err');
        try{
          if (f2.type.startsWith('image/')){
            file = { fileName:f2.name, kind:'image', dataUrl: await shrinkImage(f2, 1100, 0.6), size:f2.size };
          } else if (f2.type === 'application/pdf'){
            /* เดโม่: เก็บชื่อไฟล์อย่างเดียว เหมือนหน้าลูกค้า */
            file = { fileName:f2.name, kind:'pdf', dataUrl:null, size:f2.size };
          } else {
            return toast('รองรับเฉพาะ PDF และรูปภาพ', 'warn');
          }
          paintFile();
        }catch(err){ toast(err.message, 'err'); }
      }

      drop.addEventListener('click', () => input.click());
      drop.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); }
      });
      ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => {
        e.preventDefault(); drop.classList.add('is-over');
      }));
      ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => {
        e.preventDefault(); drop.classList.remove('is-over');
      }));
      drop.addEventListener('drop', (e) => takeFile(e.dataTransfer.files?.[0]));
      input.addEventListener('change', () => takeFile(input.files?.[0]));
      paintFile();

      /* ---- รูปหลักฐาน: ลบ/เพิ่มทีละขั้น ---- */
      function paintShots(evId){
        const box = root.querySelector(`[data-ev="${evId}"]`);
        if (!box) return;
        const list = edits.get(evId) || [];
        const x = slots.find(v => v.key === evId);
        const short = list.length < slotMin(x);

        box.querySelector('[data-shots]').innerHTML = list.length
          ? list.map((p, i) => `<span class="photo-x"><img src="${p}" alt="รูปหลักฐาน ${i+1}">
              <button type="button" data-rmshot="${i}" aria-label="ลบรูป">×</button></span>`).join('')
          : '<p class="tiny dim">ยังไม่มีรูป</p>';

        const n = box.querySelector('[data-n]');
        n.textContent = list.length;
        n.style.color = short ? 'var(--red)' : '';
        n.style.fontWeight = short ? '700' : '';
      }
      slots.forEach(x => paintShots(x.key));

      on(root, 'click', '[data-rmshot]', (e, b) => {
        const evId = b.closest('[data-ev]').dataset.ev;
        edits.get(evId).splice(Number(b.dataset.rmshot), 1);
        paintShots(evId);
      });

      $$('[data-addshot]', root).forEach(inp => {
        inp.addEventListener('change', async () => {
          const evId = inp.closest('[data-ev]').dataset.ev;
          const list = edits.get(evId);
          const added = [];
          for (const f2 of [...inp.files]){
            try{ added.push(await shrinkImage(f2, 900, 0.6)); }
            catch(err){ toast(err.message, 'err'); }
          }
          inp.value = '';
          if (added.length){
            const x = slots.find(v => v.key === evId);
            const dir = x.holder === 'job' ? jobPhotoDir(tripOf, x.ev.status)
              : stopPhotoDir(s, x.ev.status, x.field === 'invoicePhotos' ? 'invoice' : 'cargo');
            try{ list.push(...await uploadPhotos(added, dir)); }
            catch(err){ toast(`อัปโหลดรูปไม่สำเร็จ: ${err.message}`, 'err'); }
          }
          paintShots(evId);
        });
      });

      const v = (name) => root.querySelector(`[data-f="${name}"]`).value.trim();

      root.querySelector('[data-ok]').onclick = async () => {
        try{
          const by = { byRole:'ops', byName:v('by') || 'ทีมคลัง', note:v('note') };
          /* รูปไม่ถึงขั้นต่ำ — เตือนก่อนบันทึกอะไรเลย ไม่ให้ข้อมูลบันทึกไปครึ่งเดียว */
          const shortSlot = slots.find(x => edits.get(x.key).length < slotMin(x));
          if (shortSlot) return toast(`${PARTS.find(P => P.part === shortSlot.part).title} ต้องมีอย่างน้อย ${slotMin(shortSlot)} รูป`, 'warn', 4500);
          const rtNums = rt ? { delivery:v('rtDelivery'), shipmentNo:v('rtShip'), invoice:v('rtInvoice') } : null;
          /* ตรวจเลขก่อน ไม่ให้บันทึกครึ่งทาง · เลข Invoice ซ้ำ = ถามยืนยันก่อน (31 ต.ค.) */
          if (rtNums && !await withDupInv(root, (dupOk) => setRtNumbers(s.id, Object.assign(rtNums, { dupOk }), by, { dry:true }), 'บันทึก')) return;
          const { changes } = updateShipment(s.id, {
            customer: { name:v('cName'), contact:v('cContact'), phone:v('cPhone') },
            dropoff:  { name:v('dName'), address:v('dAddress'), contact:v('dContact'), phone:v('dPhone') },
            cargo:    { desc:v('cargoDesc'), pieces:v('pieces'), unit:v('unit'), weightKg:v('weightKg'), note:v('cargoNote') },
            invoice:  { number: rt ? undefined : v('invNumber'), amount:v('invAmount'), file },
            serviceDate: v('serviceDate'),
            driverId: v('driverId') || null,
          }, { byRole:'ops', byName:v('by') || 'ทีมคลัง', note:v('note') });

          const rtChanges = rtNums ? setRtNumbers(s.id, rtNums, by).changes : [];

          /* บันทึกรูปทีละขั้น — ถ้าขั้นไหนต่ำกว่าขั้นต่ำจะโยน error พร้อมบอกว่าขั้นไหน */
          const shotBy = { byRole:'ops', byName:v('by') || 'ทีมคลัง', note:v('note') };
          let shotChanges = 0;
          for (const x of slots){
            const list = edits.get(x.key);
            const r = x.holder === 'job'
              ? updateJobEventPhotos(tripOf.id, x.ev.id, list, shotBy)
              : updateEventPhotos(s.id, x.ev.id, list, shotBy, x.field);
            if (r.changed) shotChanges++;
          }

          if (!changes.length && !shotChanges && !rtChanges.length) return toast('ยังไม่มีข้อมูลที่เปลี่ยน', 'warn');
          const parts = [];
          if (changes.length) parts.push(`${changes.length} รายการ`);
          if (rtChanges.length) parts.push(rtChanges.join(' · '));
          if (shotChanges) parts.push(`รูป ${shotChanges} กล่อง`);
          toast(`บันทึกการแก้ไขแล้ว ${parts.join(' · ')}`, 'ok');
          openJob(s.id);
          const jobNow = getShipment(s.id)?.jobId || s.jobId;
          if (jobNow) pushMaster(jobNow, 'shipments', s.id);
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/* ---------- ตรวจรับเข้าคลัง -------------------------------- */
function receiveDialog(s){
  rememberScroll();
  modal({
    title: `<span class="row gap-10 wraps">${backArrow(`ใบงาน ${s.code}`)}ตรวจรับของเข้าคลัง</span>`,
    body: `
<p class="muted small">เทียบจำนวนของจริงกับใบแจ้งหนี้ <span class="mono strong">${esc(s.invoice.number)}</span> ก่อนยืนยัน</p>
<div class="panel" style="margin-top:14px">
  <dl class="kv">
    <dt>ตามใบงาน</dt><dd>${esc(s.cargo.desc)}</dd>
    <dt>จำนวน</dt><dd class="mono">${esc(qty(s.cargo))} · ${fmtNum(s.cargo.weightKg)} กก.</dd>
    <dt>มูลค่า</dt><dd class="mono">${esc(fmtBaht(s.invoice.amount))}</dd>
  </dl>
</div>
<label class="field" style="margin-top:16px">
  <span class="label">ผู้ตรวจรับ</span>
  <input class="input" data-by value="ทีมคลังบางนา">
</label>
<label class="field" style="margin-top:12px">
  <span class="label">บันทึกการตรวจรับ</span>
  <textarea class="textarea" data-note style="min-height:70px">ตรวจนับครบตามใบแจ้งหนี้ สภาพบรรจุภัณฑ์ปกติ</textarea>
</label>`,
    foot: `<button class="btn btn-ghost" data-back>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>ยืนยันรับเข้าคลัง</button>`,
    onMount(root){
      wireBack(root, () => openJob(s.id));
      root.querySelector('[data-ok]').onclick = () => {
        try{
          advance(s.id, S.RECEIVED, {
            byRole:'ops',
            byName: root.querySelector('[data-by]').value.trim() || 'ทีมคลัง',
            note: root.querySelector('[data-note]').value.trim(),
          });
          toast('รับเข้าคลังแล้ว — จ่ายงานให้คนขับได้เลย', 'ok');
          openJob(s.id);
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/* ---------- ยืนยันแทนคนขับ (โหมดสาธิต) --------------------- */
/** ยืนยันแทนคนขับจากใบงานรายจุด — ส่งมอบ: ปิดทั้งร้าน (บิลที่ยังไม่ส่ง) · ขั้นอื่นเดินทั้งเที่ยว */
function standIn(s, next){
  const j = s.jobId ? getJob(s.jobId) : null;
  if (next !== S.DELIVERED){
    if (!j){ /* งานเดี่ยวแบบเก่าที่ไม่มีเที่ยว */
      try{ advance(s.id, next, { byRole:'ops', byName:`${getDriver(s.driverId)?.name || 'คนขับ'} (บันทึกแทนโดยทีมคลัง)`, note:'ยืนยันแทนคนขับ', standIn:true });
           toast(`อัปเดตเป็น “${META[next].label}” แล้ว`, 'ok'); openJob(s.id); }
      catch(err){ toast(err.message, 'err'); }
      return;
    }
    return standInJob(j, next);
  }
  const g = groupOf(j, s.id);
  const bills = (g ? g.stops : [s]).filter(x => x.status !== S.DELIVERED && x.status !== S.CANCELLED);
  standInShop(j, bills.length ? bills : [s], () => openJob(s.id));
}

function standInShop(j, bills, onDone){
  const first = bills[0];
  standInDialog({ step: S.DELIVERED, jobId: j?.id, driverId: j?.driverId || first.driverId, bills,
    head: bills.length > 1
      ? `${esc(first.dropoff.name)} · ${fmtNum(bills.length)} บิล (${bills.map(b => `<span class="code">${esc(b.code)}</span>`).join(' ')})`
      : `จุดส่ง <span class="code">${esc(first.code)}</span> → ${esc(first.dropoff.name)}`,
    onDone });
}

/* ---------- ยกเลิก ----------------------------------------- */
function cancelDialog(s){
  rememberScroll();
  modal({
    title: `<span class="row gap-10 wraps">${backArrow(`ใบงาน ${s.code}`)}ยกเลิกงานขนส่ง</span>`,
    body: `<p class="muted small">งาน <span class="code">${esc(s.code)}</span> จะถูกปิดและติดสถานะยกเลิก ย้อนกลับไม่ได้</p>
      <label class="field" style="margin-top:14px">
        <span class="label">เหตุผล</span>
        <input class="input" data-reason placeholder="ลูกค้าแจ้งเลื่อน / ของไม่พร้อม">
      </label>`,
    foot: `<button class="btn btn-ghost" data-back>ไม่ยกเลิก</button>
           <button class="btn" style="background:var(--red)" data-ok>ยืนยันยกเลิกงาน</button>`,
    onMount(root){
      wireBack(root, () => openJob(s.id));
      root.querySelector('[data-ok]').onclick = () => {
        try{
          cancelShipment(s.id, root.querySelector('[data-reason]').value.trim(), { byRole:'ops', byName:'ทีมคลังบางนา' });
          toast('ยกเลิกงานแล้ว', 'warn');
          close();
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/* ---------- ลบงานทั้งเที่ยว / รายบิล (31 ต.ค.) ---------------
   แอดมินเท่านั้น · "ลบ" = ลบถาวร ทั้งแถวในชีต Master และในแอป (ผู้ใช้สั่ง 31 ต.ค. — ไม่ต้องเหลือไว้)
   ขั้นตอน: cancelShipment(force) ติดป้าย masterPurge → ชีต Master ลบแถว (purgeMaster) → ลบเอกสารจริง (purgeStops)
   ชีตลบไม่ได้ (เน็ต/สคริปต์) = บิลค้างเป็นยกเลิกไว้ก่อน แล้ว sweepPurge() ลองใหม่ตอนเปิดหน้า ops
   เลือก ทั้งเที่ยว / รายบิล (ติ๊กบิล) → ถามยืนยันอีกชั้น ตัวเลือกตัวใหญ่สีแดง
   บิลที่ส่งมอบแล้วก็ลบได้ (force · ผู้ใช้ขอ 31 ต.ค.) — ยืนยันจะเตือนเป็นสีแดง · บิลที่ยกเลิกไปแล้วไม่อยู่ในรายการ
   แถวในชีต Master ถูกลบตาม (masterPurge → AppsScript-master.gs appDeletes_) */
function tripCancelDialog(j){
  if (!canActFor()) return toast('ลบงานได้เฉพาะแอดมิน', 'err');
  rememberScroll();
  const bills = jobStops(j.id).filter(x => x.status !== S.CANCELLED);
  const billName = (x) => `${x.invoice?.number || x.code} · ${x.dropoff?.name || ''}`;
  const tripName = noSeven(j) ? 'เที่ยวนี้' : `เที่ยว ${j.code}`;
  modal({
    title: `<span class="row gap-10 wraps">${backArrow(tripName)}ลบงาน · ${esc(tripName)}</span>`,
    body: bills.length ? `
<p class="muted small">บิลในเที่ยวนี้ ${fmtNum(bills.length)} บิล${(() => { const n = bills.filter(x => x.status === S.DELIVERED).length;
  return n ? ` · <b style="color:var(--red)">ส่งมอบแล้ว ${fmtNum(n)} บิล ลบได้ แต่หลักฐานการส่ง (รูป · ลายเซ็น) จะถูกลบไปด้วย</b>` : ''; })()}</p>
<div class="trip-delpick" style="margin-top:12px">
  <label class="crew-item"><input type="radio" name="delmode" value="all"> <span class="strong">ลบทั้งเที่ยว</span></label>
  <label class="crew-item"><input type="radio" name="delmode" value="some"> <span class="strong">ลบรายบิล</span></label>
</div>
<div data-delbills hidden style="margin-top:12px">
  <p class="label">ติ๊กบิลที่จะลบ</p>
  <div class="crew">
    ${bills.map(x => `
    <label class="crew-item">
      <input type="checkbox" data-delbill="${x.id}">
      <span class="grow"><span class="strong" style="display:block">${esc(x.invoice?.number || x.code)}</span>
        <span class="tiny dim">${esc(x.dropoff?.name || '')}${x.status === S.DELIVERED ? ' · <b style="color:var(--red)">ส่งมอบแล้ว</b>' : ''}</span></span>
    </label>`).join('')}
  </div>
</div>
<label class="field" style="margin-top:14px">
  <span class="label">เหตุผล</span>
  <input class="input" data-reason placeholder="ลูกค้าแจ้งเลื่อน / นำเข้าผิด">
</label>` : '<p class="muted">ไม่มีบิลที่ลบได้ — ทุกบิลในเที่ยวนี้ถูกยกเลิกไปแล้ว</p>',
    foot: `<button class="btn btn-ghost" data-back>ไม่ลบ</button>
           ${bills.length ? '<button class="btn" style="background:var(--red)" data-next>ถัดไป</button>' : ''}`,
    onMount(root){
      wireBack(root, () => openTrip(j.id));
      const mode = () => root.querySelector('[name="delmode"]:checked')?.value;
      root.querySelectorAll('[name="delmode"]').forEach(r => r.onchange = () => {
        root.querySelector('[data-delbills]').hidden = mode() !== 'some';
      });
      root.querySelectorAll('[data-delbill]').forEach(cb => cb.onchange = () =>
        cb.closest('.crew-item').classList.toggle('is-on', cb.checked));
      root.querySelector('[data-next]')?.addEventListener('click', () => {
        const m = mode();
        if (!m) return toast('เลือกก่อนว่าจะลบทั้งเที่ยว หรือรายบิล', 'warn');
        const ids = m === 'all' ? bills.map(x => x.id)
          : [...root.querySelectorAll('[data-delbill]:checked')].map(x => x.dataset.delbill);
        if (!ids.length) return toast('ติ๊กบิลที่จะลบอย่างน้อย 1 บิล', 'warn');
        const reason = root.querySelector('[data-reason]').value.trim();
        const picked = bills.filter(x => ids.includes(x.id));
        modal({
          title: 'ยืนยันการลบ',
          guard: false,
          body: `
<p style="font-size:20px;line-height:1.5">ยืนยันการลบ<b class="trip-delword">${m === 'all' ? 'ทั้งเที่ยว' : `${fmtNum(ids.length)} บิล`}</b>ใช่มั้ย?</p>
<p class="small muted" style="margin-top:8px">${esc(tripName)}${m === 'all' ? ` · ${fmtNum(ids.length)} บิล` : ''} · ลบออกจากชีต Master และหน้างานทั้งหมด รวมรูปหลักฐาน · ย้อนกลับไม่ได้</p>
${picked.some(x => x.status === S.DELIVERED) ? `<p class="small" style="margin-top:8px;color:var(--red);font-weight:700">⚠ มีบิลที่ส่งมอบแล้ว ${fmtNum(picked.filter(x => x.status === S.DELIVERED).length)} บิล — หลักฐานการส่งจะหายไปด้วย</p>` : ''}
${m === 'some' ? `<ul class="small" style="margin:8px 0 0 18px">${picked.map(x => `<li>${esc(billName(x))}</li>`).join('')}</ul>` : ''}`,
          foot: `<button class="btn btn-ghost" data-no>ไม่ลบ</button>
                 <button class="btn" style="background:var(--red)" data-yes>ยืนยันลบ${m === 'all' ? 'ทั้งเที่ยว' : `${fmtNum(ids.length)} บิล`}</button>`,
          onMount(r2){
            r2.querySelector('[data-no]').onclick = () => tripCancelDialog(j);
            r2.querySelector('[data-yes]').onclick = async (e) => {
              e.currentTarget.disabled = true;
              const ses = getSession();
              const by = { byRole:'ops', byName: ses?.staff?.name || ses?.staff?.email || 'ทีมคลัง' };
              const done = [];
              for (const id of ids){
                try{ cancelShipment(id, reason, by, { force:true }); done.push(id); }
                catch(err){ toast(err.message, 'err'); }
              }
              if (!done.length) return openTrip(j.id);
              toast(`กำลังลบ ${fmtNum(done.length)} บิล — ลบแถวในชีต Master ก่อน…`, 'info', 8000);
              /* ชีตก่อน แล้วค่อยลบในแอป — ไม่งั้น Apps Script หาป้ายลบไม่เจอ แถวในชีตค้าง */
              if (await purgeMaster(j.id, done)){
                const r = purgeStops(done);
                toast(`ลบแล้ว ${fmtNum(r.stops)} บิล${r.jobs ? ' · ลบเที่ยวแล้ว' : ''} — ออกจากชีต Master และหน้างานแล้ว`, 'ok');
                if (r.jobs) return close();
              } else {
                toast('ลบแถวในชีต Master ยังไม่ได้ (เน็ต/สคริปต์) — บิลค้างเป็น "ยกเลิก" ไว้ก่อน ระบบจะลองลบให้อีกครั้งตอนเปิดหน้านี้', 'warn', 9000);
              }
              openTrip(j.id);
            };
          },
        });
      });
    },
  });
}

/* ---------- เก็บกวาดบิลที่ลบค้าง (31 ต.ค.) ----------
   บิลที่กดลบแล้วแต่ชีต Master ยังลบไม่ได้ (เน็ตหลุด / สคริปต์ล่ม) และบิลที่ลบด้วยปุ่มเดิมก่อน 31 ต.ค. (ค้างเป็นยกเลิก)
   ลองลบแถวในชีตอีกรอบ สำเร็จแล้วลบออกจากแอป — เฉพาะแอดมิน รอข้อมูลจากคลาวด์มาก่อน 8 วินาที */
async function sweepPurge(){
  if (!canActFor()) return;
  const left = purgePending();
  if (!left.length) return;
  const jobs = [...new Set(left.map(x => x.jobId).filter(Boolean))];
  if (!(await purgeMaster(jobs, left.map(x => x.id)))) return;
  try{
    const r = purgeStops(left.map(x => x.id));
    if (r.stops) toast(`ลบบิลที่ค้างลบไว้แล้ว ${fmtNum(r.stops)} บิล${r.jobs ? ` · ${fmtNum(r.jobs)} เที่ยว` : ''}`, 'ok');
  }catch(err){ console.warn('[ops] เก็บกวาดบิลที่ลบไม่สำเร็จ', err); }
}
setTimeout(() => { sweepPurge().catch(() => {}); }, 8000);

/* ---------- เริ่ม ------------------------------------------ */
paint();
subscribe(paint);

/* ---------- เตือนโควตารูปใน Storage เดือนนี้ (10,000 รูป) — 70 / 80 / 90 / 100% ---------- */
watchPhotos((count) => {
  const box = $('#photoQuota');
  const lv = quotaLevel(count);
  box.hidden = !lv;
  if (!lv) return;
  box.dataset.lv = lv;
  box.innerHTML = `<span aria-hidden="true">${lv === 100 ? '⛔' : '⚠'}</span><span>${esc(quotaWarning(count))}</span>`;
});


/* ⚡ งานด่วน — เที่ยวใหม่ทั้งเที่ยว (ส่งก่อน ปิดงานทีหลัง) */
$('#rtNew')?.addEventListener('click', () => newRtJobDialog((j) => openTrip(j.id)));

/* เปิดเที่ยวที่ค้างไว้กลับมาให้ หลังจากกระดานวาดเสร็จแล้ว */
/* กล่องที่เปิดค้างก่อนหน้าโหลดใหม่ (ui.js reopenDialog) — เที่ยว / ร้าน / จุดส่ง · ไม่มี = เปิดเที่ยวที่จำไว้แบบเดิม */
setTimeout(() => {
  reopenDialog({ trip: ({ id }) => openTrip(id), group: ({ jobId, stopId }) => openGroup(jobId, stopId), job: ({ id }) => openJob(id) });
  if (!document.querySelector('.scrim') && UI.trip) openTrip(UI.trip);
}, 0);

/* งานเลข 5 ที่ถูกรวมเข้างาน Shipment No. ไปหมดแล้วแต่ยังค้างอยู่ — ลบให้
   รอข้อมูลจากคลาวด์มาถึงก่อน จะได้เห็นจุดส่งครบ ไม่ลบงานที่ยังมีจุดส่งอยู่บนคลาวด์ */
setTimeout(() => { const t = tidyJobs(); if (t.merged || t.pruned || t.crews) paint(); }, 4000);


/* ============================================================
   sync เลข Invoice จากไฟล์ Excel รอบใหม่

   ตอนนำเข้ารอบแรก (ไฟล์เหลือง) บิลที่ Invoice ยังไม่มา ใช้เลข Sales Number (5…) ไปก่อน
   พอได้ไฟล์ขาว (อัพเดตเลขที่บิล) ลากมาวางตรงนี้
   ระบบจับคู่ช่อง Delivery ของไฟล์ขาวกับเลข 5 ที่เก็บไว้ แล้วเปลี่ยนเป็นเลข Invoice
   พร้อมอัปเดต Shipment No. ตามไฟล์ขาว
   ============================================================ */
const sDrop = $('#syncDrop');
const sFile = $('#syncFile');
sDrop.addEventListener('click', () => sFile.click());
sDrop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); sFile.click(); }
});
['dragenter','dragover'].forEach(t => sDrop.addEventListener(t, (e) => { e.preventDefault(); sDrop.classList.add('is-over'); }));
['dragleave','drop'].forEach(t => sDrop.addEventListener(t, (e) => { e.preventDefault(); sDrop.classList.remove('is-over'); }));
sDrop.addEventListener('drop', (e) => scanFile(e.dataTransfer.files?.[0]));
sFile.addEventListener('change', () => scanFile(sFile.files?.[0]));

async function scanFile(f){
  if (!f) return;
  const out  = $('#syncResult');
  const info = $('#syncInfo');
  out.innerHTML = '';
  const pg = progressBox(info, {
    title: f.name,
    steps: ['อ่านไฟล์', 'ส่งเข้าระบบ · ตรวจหัวตาราง · เก็บลง Google Drive', 'sync งาน'],
  });
  sDrop.style.pointerEvents = 'none'; sDrop.style.opacity = '.55';   /* กันวางซ้อนระหว่างรอ */
  try{
    /* ส่งไปทางเดียวกับไฟล์จาก LINE — ทุกเครื่องจะเห็นไฟล์นี้ในรายการไฟล์ของวันนี้ */
    pg.step(0, 2, 2);
    const up = await uploadFile(f, {
      onRead: (x) => pg.within(2, 15, x),
      onSent: () => pg.step(1, 15, 78, 'รอ Apps Script ตรวจไฟล์และเก็บลง Drive — ไฟล์ใหญ่อาจใช้เวลาหลายวินาที'),
    });
    pg.step(2, 80, 97, `รับไฟล์แล้ว · ชีต "${up.sheet}" · ${fmtNum(up.rows)} แถว — กำลังเทียบกับงานในระบบ`);
    const r = await runSync({ quiet:false });
    paint();
    if (!r){ pg.fail('ส่งไฟล์แล้ว แต่ดึงข้อมูลกลับมา sync ไม่สำเร็จ — กด "ตรวจเดี๋ยวนี้" อีกครั้ง'); return; }
    pg.done(`เสร็จแล้ว · ${fmtNum(up.rows)} แถว · อัปเดต ${fmtNum(r.done.length)} จุดส่ง`);
    if (r.done.length){
      const merged = new Set(r.moved.map(m => m.to)).size;
      celebrate(`อัปเดต ${fmtNum(r.done.length)} จุดส่ง`, merged ? `รวมเป็น ${fmtNum(merged)} งานตาม Shipment No.` : f.name);
    }
    const jobs = new Set(r.moved.map(m => m.to));
    out.innerHTML = `
      <div class="panel">
        <p class="small strong" style="color:var(--green)">อัปเดตแล้ว ${fmtNum(r.done.length)} จุดส่ง
          ${jobs.size ? ` · รวมเป็น ${fmtNum(jobs.size)} งานตาม Shipment No.` : ''}</p>
        ${jobs.size ? `<div class="tiny dim" style="margin-top:6px;max-height:120px;overflow:auto">
          ${[...jobs].map(t => `<span class="code">${esc(t)}</span> ← ${r.moved.filter(m => m.to === t).map(m => esc(m.code)).join(' · ')}`).join('<br>')}</div>` : ''}
        ${r.held.length ? `<div class="tiny" style="margin-top:8px;color:var(--amber-dim)">
          ไม่ได้ย้าย ${fmtNum(r.held.length)} จุด<br>
          ${r.held.slice(0, 8).map(x => `${esc(x.code)} → ${esc(x.ship)} — ${esc(x.msg)}`).join('<br>')}</div>` : ''}
        ${r.warns.length ? `<div class="tiny" style="margin-top:8px;color:var(--amber-dim)">${r.warns.map(esc).join('<br>')}</div>` : ''}
        ${r.unknown.length ? `<div class="tiny" style="margin-top:8px;color:var(--amber-dim)">
          ชื่อคนขับในไฟล์ที่จับคู่ไม่ได้ (ไม่มีในทะเบียน หรือตรงหลายคน) — ข้ามไป: ${r.unknown.map(esc).join(', ')}</div>` : ''}
        ${r.conflicts.length ? `<div class="tiny" style="margin-top:8px;color:#b06">
          ${fmtNum(r.conflicts.length)} จุดมีเลข Invoice อยู่แล้วแต่ไม่ตรงกับไฟล์ — ติ๊กยืนยันได้ในกล่องไฟล์ของวันนี้ด้านบน</div>` : ''}
        ${up.dupText ? `<div class="tiny" style="margin-top:8px;color:#b06;white-space:pre-line">${esc(up.dupText)}</div>` : ''}
        ${r.failed.length ? `<div class="tiny" style="margin-top:8px;color:#b06">
          ไม่สำเร็จ ${fmtNum(r.failed.length)} จุด<br>
          ${r.failed.slice(0, 6).map(x => `${esc(x.code)} — ${esc(x.msg)}`).join('<br>')}</div>` : ''}
      </div>`;
  }catch(err){
    pg.fail('ไม่สำเร็จ');
    out.innerHTML = `<p class="small" style="color:#b06;white-space:pre-line">${esc(err.message)}</p>`;
  }finally{
    sFile.value = '';
    sDrop.style.pointerEvents = ''; sDrop.style.opacity = '';
  }
}


/* ============================================================
   ค่ารอบ — แยกรายคนขับ

   หนึ่งเที่ยวมีคนขับหลายคน และแต่ละคนได้ไม่เท่ากัน
   จึงลิสต์ชื่อคนขับทีละบรรทัด แต่ละชื่อมีช่องเงินกับช่องโน้ตของตัวเอง
   ปุ่ม ＋ ท้ายบรรทัดชื่อ ใช้เพิ่มบรรทัดย่อยใต้คนนั้น (ค่าน้ำมัน ค่าทางด่วน ฯลฯ)

   ลิสต์นี้เปลี่ยนตามช่อง "คนขับของเที่ยวนี้" ด้านบนทันทีที่ติ๊ก
   ไม่ต้องกดบันทึกคนขับก่อน จะได้กรอกรวดเดียวจบ
   ============================================================ */
function mountPay(root, j){
  const box = root.querySelector('#payBox');
  if (!box) return;

  const pay = getJobPay(j.id);

  /* ชื่อรายการที่ใช้บ่อย — กดเลือกเร็วกว่าพิมพ์ */
  const PRESETS = ['ค่าน้ำมัน', 'ค่าทางด่วน', 'ค่าจอดรถ', 'ค่าแรงยกของ', 'เบี้ยเลี้ยง', 'ค่ากาแฟ'];

  /* rows[driverId] = [{amount, note}] — เริ่มจากที่เคยบันทึกไว้ */
  const rows = {};
  Object.keys(pay.drivers || {}).forEach(id => {
    rows[id] = (pay.drivers[id] || []).map(x => ({ ...x }));
  });

  /* ถ้ามีร่างที่พิมพ์ค้างไว้ก่อนหน้ารีเฟรช ให้ใช้ร่างนั้นแทน */
  const draft = loadUI('ops').payDraft;
  let usedDraft = false;
  if (draft && draft.jobId === j.id && draft.rows){
    Object.keys(draft.rows).forEach(id => { rows[id] = draft.rows[id].map(x => ({ ...x })); });
    usedDraft = true;
  }

  /* เขียนร่างทุกครั้งที่พิมพ์ รวบไว้เขียนรอบเดียวหลังหยุดนิ่ง */
  const keepDraft = debounce(() => saveUI('ops', { payDraft: { jobId: j.id, rows } }), 350);

  /* ข้อมูลเก่าที่ยังไม่ได้แยกคน — ถ้าเที่ยวนี้มีคนขับคนเดียวก็ยกให้เขาไปเลย
     ถ้ามีหลายคนจะไม่เดาว่าเงินเป็นของใคร ปล่อยไว้ให้แอดมินกรอกใหม่เอง */
  const legacy = Number(pay.base) > 0 || (pay.items || []).length;
  let legacyNote = '';
  if (legacy){
    const ids = j.driverIds || [];
    if (ids.length === 1){
      const id = ids[0];
      rows[id] = rows[id] || [];
      if (Number(pay.base) > 0) rows[id].unshift({ amount: pay.base, note: '' });
      (pay.items || []).forEach(x => rows[id].push({ ...x }));
      legacyNote = 'ย้ายค่ารอบเดิมมาเป็นของคนขับคนนี้ให้แล้ว ตรวจอีกครั้งก่อนบันทึก';
    } else {
      legacyNote = `เที่ยวนี้เคยกรอกค่ารอบรวมไว้ ${fmtBaht(payTotal({ base: pay.base, items: pay.items }))} ` +
                   'แต่ยังไม่รู้ว่าเป็นของใคร กรอกแยกรายคนแล้วกดบันทึก ยอดเดิมจะถูกแทนที่';
    }
  }

  /* คนขับที่กำลังติ๊กอยู่ในช่องด้านบน (ยังไม่ต้องกดบันทึกคนขับ) */
  const crewIds = () => {
    const checked = [...root.querySelectorAll('[data-crew]:checked')].map(x => x.dataset.crew);
    return checked.length ? checked : (j.driverIds || []);
  };

  const rowsOf = (id) => {
    if (!rows[id] || !rows[id].length) rows[id] = [{ amount:'', note:'' }];
    return rows[id];
  };

  const sumAll = () => Object.entries(rows).reduce((a, [id, rs]) => {
    if (!crewIds().includes(id)) return a;            /* คนที่ถูกเอาออกแล้ว ไม่นับ */
    return a + rs.reduce((b, x) => {
      const n = Number(String(x.amount ?? '').replace(/[, ]/g, ''));
      return b + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  }, 0);

  const sumOf = (id) => (rows[id] || []).reduce((a, x) => {
    const n = Number(String(x.amount ?? '').replace(/[, ]/g, ''));
    return a + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  function draw(){
    const ids = crewIds();

    if (!ids.length){
      box.innerHTML = `<p class="tiny dim" style="margin:0">
        ยังไม่ได้เลือกคนขับ — ติ๊กชื่อคนขับด้านบนก่อน แล้วช่องกรอกค่ารอบของแต่ละคนจะขึ้นมาเอง</p>`;
      return;
    }

    box.innerHTML = `
      ${usedDraft ? `<p class="tiny" style="margin:0 0 10px;color:var(--green)">กู้ตัวเลขที่พิมพ์ค้างไว้กลับมาแล้ว ยังไม่ได้บันทึก</p>` : ''}
      ${legacyNote ? `<p class="tiny" style="margin:0 0 10px;color:var(--amber-dim)">${esc(legacyNote)}</p>` : ''}

      <div class="pay-grid">
        ${ids.map(id => {
          const d = getDriver(id);
          const rs = rowsOf(id);
          return rs.map((x, i) => `
            <div class="pay-drv-row${i === 0 ? ' is-first' : ''}">
              <div class="pay-drv-name">
                ${i === 0 ? `<span class="strong">${esc(d ? driverName(d) : 'คนขับที่ถูกลบไปแล้ว')}</span>
                  ${d ? `<span class="tiny dim mono" style="display:block">${esc(d.plate)}</span>` : ''}` : ''}
              </div>
              <input class="input tnum" data-amt="${esc(id)}|${i}" type="number" min="0" step="0.01"
                     inputmode="decimal" value="${x.amount || ''}"
                     placeholder="${i === 0 ? 'ค่ารอบ' : '0.00'}" aria-label="จำนวนเงิน">
              <input class="input" data-note="${esc(id)}|${i}" value="${esc(x.note || '')}"
                     placeholder="${i === 0 ? 'โน้ต (ไม่ใส่ก็ได้)' : 'เป็นค่าอะไร เช่น ค่าน้ำมัน'}"
                     aria-label="โน้ต" list="payPresets">
              ${i === 0
                ? `<button type="button" class="icon-btn" data-add="${esc(id)}" title="เพิ่มรายการให้ ${esc(d ? d.name : '')}" aria-label="เพิ่มรายการ">＋</button>`
                : `<button type="button" class="icon-btn" data-del="${esc(id)}|${i}" aria-label="ลบรายการนี้">×</button>`}
            </div>`).join('') + `
            <div class="pay-drv-sum">
              <span class="tiny dim">รวมของ ${esc(d ? d.name.split(' ')[0] : '—')}</span>
              <b class="tnum">${esc(fmtBaht(sumOf(id)))}</b>
            </div>`;
        }).join('')}
      </div>

      <datalist id="payPresets">${PRESETS.map(p => `<option value="${esc(p)}">`).join('')}</datalist>

      <div class="row between wraps gap-10" style="margin-top:12px">
        <span class="tiny dim">${pay.updatedAt
          ? `แก้ล่าสุด ${esc(fmtDateTime(pay.updatedAt))} โดย ${esc(pay.updatedBy || '—')}`
          : 'ยังไม่เคยกรอกค่ารอบของเที่ยวนี้'}</span>
        <span class="row gap-10">
          <span class="pay-total"><span class="tiny dim">รวมทั้งเที่ยว</span><b>${esc(fmtBaht(sumAll()))}</b></span>
          <button type="button" class="btn btn-accent btn-sm" data-save>บันทึกค่ารอบ</button>
        </span>
      </div>`;

    const at = (key) => { const [id, i] = key.split('|'); return { id, i: +i }; };

    box.querySelectorAll('[data-amt]').forEach(el => {
      el.oninput = () => {
        const { id, i } = at(el.dataset.amt);
        rows[id][i].amount = el.value;
        retotal(id);
        keepDraft();
      };
    });
    box.querySelectorAll('[data-note]').forEach(el => {
      el.oninput = () => { const { id, i } = at(el.dataset.note); rows[id][i].note = el.value; keepDraft(); };
    });
    box.querySelectorAll('[data-add]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.add;
        rowsOf(id).push({ amount:'', note:'' });
        keepDraft();
        draw();
        box.querySelector(`[data-amt="${id}|${rows[id].length - 1}"]`)?.focus();
      };
    });
    box.querySelectorAll('[data-del]').forEach(b => {
      b.onclick = () => {
        const { id, i } = at(b.dataset.del);
        rows[id].splice(i, 1);
        keepDraft();
        draw();
      };
    });
    box.querySelector('[data-save]').onclick = () => {
      const picked = {};
      crewIds().forEach(id => { picked[id] = rows[id] || []; });
      try{
        /* base/items เดิมถูกแทนที่ด้วยของที่แยกรายคนแล้ว */
        setJobPay(j.id, { base: 0, items: [], drivers: picked }, { byRole:'ops', byName:'ทีมคลังบางนา' });
        dropUI('ops', 'payDraft');
        toast('บันทึกค่ารอบแล้ว', 'ok');
        openTrip(j.id);
        pushMaster(j.id, 'jobs', j.id);
      }catch(err){ toast(err.message, 'err'); }
    };
  }

  /* อัปเดตยอดโดยไม่วาดใหม่ จะได้ไม่หลุดโฟกัสตอนพิมพ์ */
  function retotal(id){
    const all = box.querySelector('.pay-total b');
    if (all) all.textContent = fmtBaht(sumAll());
    const sums = [...box.querySelectorAll('.pay-drv-sum')];
    const idx = crewIds().indexOf(id);
    if (idx >= 0 && sums[idx]) sums[idx].querySelector('b').textContent = fmtBaht(sumOf(id));
  }

  /* ติ๊กคนขับด้านบนแล้วลิสต์ค่ารอบต้องขยับตามทันที */
  root.querySelectorAll('[data-crew]').forEach(cb => {
    cb.addEventListener('change', () => draw());
  });

  draw();
}
