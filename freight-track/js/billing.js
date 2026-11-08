/* ============================================================
   billing.js — รายได้ · วางบิล (ฝั่งเรา + ฝั่งลูกค้า)

   มุมมอง "บิล · ค่าขนส่ง" (26 ต.ค. 2026 เปลี่ยนจากรายเที่ยวเป็นรายบิล)
     แถวละ Invoice เรียงตามผู้รับปลายทาง (ไทย → อังกฤษ → ตัวเลข) แล้วเลข Invoice น้อยไปมาก
     ค่าขนส่ง = Amount ของไฟล์อัพเดตเลขที่บิล แก้มือได้ (stopRevenue / setStopRevenue ใน store.js)
     เลือกหลายบิลแล้ว "สร้างใบวางบิล" — เลขที่ใบตั้งต้นเป็นเลข Invoice แรก (แก้ได้)
   มุมมอง "ใบวางบิล"
     ใบวางบิล (js/bills.js → คอลเลกชัน bills) · คัดลอกลิงก์ส่งลูกค้า · พิมพ์ PDF ·
     เห็นสิ่งที่ลูกค้าทำผ่านลิงก์ · ยืนยันรับเงิน · ยกเลิกใบ · ส่งออก Excel

   เที่ยวผูกกับใบผ่าน job.billing.billId (setJobBilling ใน store.js) — Dashboard อ่านทั้งสองที่
   เที่ยวที่วางบิลแบบเก่า (ก่อนมีใบวางบิล) ยังบันทึกชำระ/ยกเลิกสถานะแบบเดิมได้
   ============================================================ */

import { shell, $, $$, esc, toast, modal, close, confirmDialog, demoBar, keepScrollOnClose } from './ui.js';
import {
  listJobs, getDriver, listShipments, subscribe, setJobBilling, billStatus, BILL, fmtBaht, fmtNum, fmtDate, S,
  driverName, stopRevenue, isRevenueManual, stopBilling, setStopRevenue, setStopBilling,
  COLLECT, collectOf, clearAllBilling, isProblem,
} from './store.js';
import { removePhotos } from './cloud.js';
import { isAdmin } from './access.js';
import { collectDialog as collectDialogFor, collectGapOf, COLLECT_TONE, problemTag, clearProblemDialog } from './helper.js';
import { loadUI, saveUI, debounce } from './uiState.js';
import { gate, getSession, canWrite } from './auth.js';
import { pushMaster, pushBill } from './masterSync.js';
import { billUrl, DEFAULT_CREDIT_DAYS } from './config.js';
import {
  METHODS, watchBills, createBill, patchBill, renewBillId, ourState, custState, overdueDays, downloadSlip,
  PAY_MODES, payModeOf, payItems, deleteBills,
  addDays, thDate, thDateTime, baht, todayYMD,
} from './bills.js';
import { loadXLSX } from './xlsxImport.js';
import { fuelBar } from './fuelPrice.js';
import { initCosts, paintCosts } from './billingCosts.js';

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('billing');
shell({ role: 'มุมมองทีมบัญชี' });
keepScrollOnClose();
fuelBar($('#fuelSlot'));   /* ปิดหน้าต่าง (สร้างใบวางบิล / ดูใบ) แล้วอยู่ที่เดิม ไม่ดีดขึ้นบน */
$('#demoBarSlot').appendChild(demoBar('ค่าขนส่งและการวางบิลที่บันทึกที่นี่ขึ้น Dashboard ทันที'));

const ses = getSession();
const BY = { byRole:'ops', byName: ses.staff?.name || ses.staff?.email || 'ทีมบัญชี' };
const WHO = ses.staff?.email || BY.byName;

/* ---------- สลับมุมมอง ------------------------------------- */
const UI = loadUI('billing');

/* ช่วงวันที่ + "เฉพาะวันนี้" จำข้ามการปิดเบราว์เซอร์ (localStorage) — ที่เหลือจำแค่ในแท็บ (uiState) */
const KEEP_KEY = 'ft.billing.range';
const KEEP = (() => { try{ return JSON.parse(localStorage.getItem(KEEP_KEY) || '{}') || {}; }catch(e){ return {}; } })();
const keep = (patch) => {
  Object.assign(KEEP, patch);
  try{ localStorage.setItem(KEEP_KEY, JSON.stringify(KEEP)); }catch(e){}
};
let view = ['bills', 'costs'].includes(UI.view) ? UI.view : 'trips';
function setView(v){
  view = v;
  saveUI('billing', { view });
  $$('#viewTabs [data-view]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $('#tripsView').hidden = v !== 'trips';
  $('#billsView').hidden = v !== 'bills';
  $('#costsView').hidden = v !== 'costs';
  v === 'bills' ? paintBills() : v === 'costs' ? paintCosts() : paint();
}
$('#viewTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (b) setView(b.dataset.view);
});

/* ============================================================
   เที่ยว · ค่าขนส่ง
   ============================================================ */
/* บิลที่ยืนยันรับเงินหน้างานแล้วย้ายไปแท็บ "ใบวางบิล" (ผู้ใช้สั่ง 27 ต.ค. 2026) — ที่นี่เหลือแค่แท็บ "รับเงินหน้างานแล้ว" ไว้ดูย้อน */
const moved = (r) => r.c.st === COLLECT.DONE;
const TABS = [
  { key:'all',    label:'ทั้งหมด',            test: r => !moved(r) },
  { key:'norev',  label:'ยังไม่มีค่าขนส่ง',    test: r => !moved(r) && !(r.rev > 0) },
  /* ยังไม่วางบิล = เฉพาะบิลที่ต้องวางจริง (เครดิต / ยังไม่บันทึกชำระ) — จ่ายหน้างานแล้วไปอยู่แท็บของตัวเอง */
  { key:'none',   label:BILL.NONE,           test: r => r.rev > 0 && r.st === BILL.NONE && r.c.st === COLLECT.BILL },
  { key:'slip',   label:COLLECT.SLIP,        test: r => r.c.st === COLLECT.SLIP },
  { key:'cash',   label:COLLECT.CASH,        test: r => r.c.st === COLLECT.CASH },
  { key:'site',   label:'รับเงินหน้างานแล้ว',   test: r => r.c.st === COLLECT.DONE },
  { key:'billed', label:BILL.BILLED,         test: r => r.st === BILL.BILLED },
  { key:'paid',   label:BILL.PAID,           test: r => r.st === BILL.PAID },
];
let tab = UI.tab || 'all';
let q = UI.q || '';
/* เปิดหน้ามาแสดงทุกงานในระบบเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2026) — ช่วงวันที่ / เฉพาะวันนี้ ใช้กรองได้ แต่ไม่จำข้ามการเปิดหน้า */
let from = '', to = '';
/* ช่วงที่ผู้ใช้เลือกเอง — จำไว้คืนให้ตอนเอาติ๊ก "เฉพาะวันนี้" ออก */
const chosen = { from, to };
const picked = new Set();

$('#q').value = q; $('#from').value = from; $('#to').value = to;
const rememberQ = debounce((v) => saveUI('billing', { q: v }), 300);
$('#q').addEventListener('input', (e) => { q = e.target.value; rememberQ(q); paint(); });
$('#from').addEventListener('change', (e) => { from = chosen.from = e.target.value; paint(); });
$('#to').addEventListener('change', (e) => { to = chosen.to = e.target.value; paint(); });

/* "เฉพาะวันนี้" — ไม่ติ๊กทุกครั้งที่เปิดหน้า (ไม่จำ)
   ติ๊กอยู่ = ช่องวันที่ล็อกเป็นวันนี้ · เอาติ๊กออก = กลับช่วงที่เลือกไว้ (ว่าง = ทุกวัน) */
function setToday(on){
  if (on){ from = to = todayYMD(); }
  else { from = chosen.from; to = chosen.to; }
  $('#onlyToday').checked = on;
  ['#from', '#to'].forEach(s => { $(s).disabled = on; });
  $('#from').value = from; $('#to').value = to;
  picked.clear();
  paint();
}
$('#onlyToday').addEventListener('change', (e) => setToday(e.target.checked));

const dateOf = (j) => String(j?.serviceDate || j?.createdAt || '').slice(0, 10);
function carrierOf(j){
  const raw = String(j?.carrier || j?.source?.carrier || '');
  if (/ตัวอย่าง/.test(raw)) return 'ขนส่งตัวอย่าง';
  if (/พันธมิตร/.test(raw)) return 'พันธมิตร';
  return raw.replace(/^บ\.ขนส่ง\s*/, '').replace(/^บริษัท\s*/, '').trim() || '—';
}
const driverNames = (j) => (j?.driverIds?.length ? j.driverIds : (j?.driverId ? [j.driverId] : []))
  .map(id => driverName(getDriver(id))).filter(Boolean).join(', ');
const invNo = (x) => String(x.invoice?.number || x.code || '');

/** ใบวางบิลที่ยังมีผล (ไม่นับใบที่ยกเลิก) — ของบิลเอง หรือของเที่ยว (ใบแบบรายเที่ยวเดิม) */
const billById = (id) => { const b = id ? billsById.get(id) : null; return b && b.status !== 'cancelled' ? b : null; };

/* ชื่อผู้รับ: ไทย → อังกฤษ → ตัวเลข → อื่น ๆ แล้วตามตัวอักษร (ก อยู่บนสุด) · ผู้รับเดียวกันอยู่ติดกัน → เลข Invoice น้อยไปมาก */
const nameRank = (v) => { const c = String(v || '').trim()[0] || ''; return /[฀-๿]/.test(c) ? 0 : /[a-z]/i.test(c) ? 1 : /\d/.test(c) ? 2 : 3; };
const byName = (a, b) => nameRank(a) - nameRank(b) || String(a || '').localeCompare(String(b || ''), 'th', { numeric:true, sensitivity:'base' });
const byRecipient = (a, b) => byName(a.x.dropoff?.name, b.x.dropoff?.name)
  || invNo(a.x).localeCompare(invNo(b.x), 'en', { numeric:true });

const inRange = (r) => (!from || r.date >= from) && (!to || r.date <= to);

/** ทุกบิลที่ตรงคำค้น ทุกวัน (ยังไม่กรองวันที่/แท็บ) — แถวละ Invoice พร้อมเที่ยว/ค่าขนส่ง/สถานะวางบิล */
function scope(){
  const t = q.trim().toLowerCase();
  const jobs = new Map(listJobs().filter(j => j.status !== 'cancelled').map(j => [j.id, j]));
  return listShipments()
    .filter(x => x.status !== S.CANCELLED && jobs.has(x.jobId))
    .map(x => {
      const j = jobs.get(x.jobId);
      const billing = stopBilling(x, j);
      return { x, j, billing, rev: stopRevenue(x), st: billStatus(billing), date: dateOf(j), bill: billById(billing?.billId), c: collectOf(x) };
    })
    .filter(r => !t || [invNo(r.x), r.x.code, r.x.delivery, ...(r.x.altCodes || []), r.x.dropoff?.name, r.x.customer?.name,
      r.j.code, r.j.vehicle, carrierOf(r.j), driverNames(r.j), r.billing?.docNo].join(' ').toLowerCase().includes(t))
    .sort(byRecipient);
}

/* แท็บ "ยังไม่วางบิล" ไม่สนช่วงวันที่ — งานค้างทุกวันขึ้นเสมอ */
const allDays = (t) => t.key === 'none' || t.key === 'slip' || t.key === 'cash';

function paintKpi(list, every){
  const amt = (st) => (st === BILL.NONE ? every : list).filter(r => r.rev > 0 && r.st === st && (st !== BILL.NONE || r.c.st === COLLECT.BILL));
  const sumRev = (a) => a.reduce((x, r) => x + r.rev, 0);
  const none = amt(BILL.NONE), billed = amt(BILL.BILLED), paid = amt(BILL.PAID);
  const norev = list.filter(r => !(r.rev > 0)).length;
  const items = [
    { label:'ค่าขนส่งรวม',   value:fmtBaht(sumRev(list)),   foot: norev ? `ยังไม่มีค่าขนส่ง ${fmtNum(norev)} บิล` : 'มีค่าขนส่งครบทุกบิล', accent:'violet' },
    { label:BILL.NONE,      value:fmtBaht(sumRev(none)),   foot:`${fmtNum(none.length)} บิล · ทุกวัน`,   accent:'amber' },
    { label:'วางบิลแล้ว รอชำระ', value:fmtBaht(sumRev(billed)), foot:`${fmtNum(billed.length)} บิล`, accent:'blue' },
    { label:BILL.PAID,      value:fmtBaht(sumRev(paid)),   foot:`${fmtNum(paid.length)} บิล`,   accent:'green' },
  ];
  $('#kpis').innerHTML = kpiHtml(items);
}
const kpiHtml = (items) => items.map(k => `
    <div class="kpi" data-accent="${k.accent}">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value" style="font-size:22px">${esc(k.value)}</div>
      <div class="kpi-foot">${esc(k.foot)}</div>
    </div>`).join('');

const statusPill = (r) => {
  const b = r.billing;
  const st = r.st;
  const tone = st === BILL.PAID ? 'done' : st === BILL.BILLED ? 'move' : 'wait';
  const doc = b?.docNo
    ? (r.bill ? `<button class="linkish" type="button" data-open-bill="${esc(r.bill.id)}">${esc(b.docNo)}</button>` : esc(b.docNo))
    : '';
  const meta = st === BILL.NONE ? '' : `<span class="bill-meta">${doc ? `${doc} · ` : ''}วาง ${esc(fmtDate(b.billedAt))}${
    b.paidAt ? ` · ชำระ ${esc(fmtDate(b.paidAt))}` : (b.dueDate ? ` · ครบกำหนด ${esc(fmtDate(b.dueDate))}` : '')}${b.viaJob ? ' · วางทั้งเที่ยว' : ''}</span>`;
  return `<span class="pill" data-tone="${tone}">${esc(st)}</span>${meta}`;
};

/* เก็บเงินหน้างาน (store.collectOf) — ป้ายใต้สถานะวางบิล กดเปิดหลักฐาน/ยืนยันรับเงิน
   ยอดที่คนขับเก็บ ≠ ค่าขนส่ง = ขึ้นเตือนแดง */
const collectGap = (r) => collectGapOf(r.c, r.rev);
function collectPill(r){
  const { c } = r;
  if (c.st === COLLECT.BILL) return c.p?.method === 'เครดิต' ? '<span class="bill-meta">คนขับบันทึก: เครดิต</span>' : '';
  const gap = collectGap(r);
  const label = c.st === COLLECT.SLIP ? `โอนแล้ว · รอตรวจสลิป` : c.st === COLLECT.CASH ? `เงินสด · ค้างที่คนขับ` : `รับเงินแล้ว (${c.p.method})`;
  return `<span class="bill-collect"><button type="button" class="pill" data-tone="${COLLECT_TONE[c.st]}" data-collect="${esc(r.x.id)}"
      title="ดูหลักฐาน${c.st !== COLLECT.DONE ? ' · ยืนยันรับเงิน' : ''}">${esc(label)} ${esc(fmtBaht(c.p.amount))}</button>${
    gap ? `<span class="bill-gap">⚠ ไม่ตรงค่าขนส่ง (${gap > 0 ? '+' : ''}${esc(fmtBaht(gap))})</span>` : ''}</span>`;
}

/* กลุ่มที่กางไว้ — จำในแท็บนี้ ข้อมูลอัปเดตแล้วไม่พับกลับเอง */
const openGroups = new Set(UI.open || []);
const grpKey = (x) => String(x.dropoff?.name || '').trim().replace(/\s+/g, ' ') || '—';
/** แถวที่เรียงตามผู้รับแล้ว → กลุ่มละผู้รับ (คงลำดับเดิม) */
function groupsOf(rows){
  const out = [], at = new Map();
  for (const r of rows){
    const key = grpKey(r.x);
    if (!at.has(key)){ at.set(key, out.length); out.push({ key, name: key, rows: [] }); }
    out[at.get(key)].rows.push(r);
  }
  return out;
}

/* น้ำหนักของบิล (cargo.weightKg จากไฟล์) — ทศนิยมไม่เกิน 2 ตำแหน่ง */
const kgOf = (x) => Number(x.cargo?.weightKg) || 0;
const fmtKg = (n) => n.toLocaleString('th-TH', { maximumFractionDigits:2 });

/** แถวบิลหนึ่งใบ · child = อยู่ใต้หัวกลุ่ม (เส้นส้มซ้าย แบบหน้าคนขับ) */
function billRow({ x, j, rev, bill, ...r }, child = false){
  const manual = isRevenueManual(x);
  const amount = Number(x.invoice?.amount) || 0;
  const prob = isProblem(x);
  const cls = [child && 'bill-child', picked.has(x.id) && 'is-picked', prob && 'is-problem'].filter(Boolean).join(' ');
  return `<tr data-id="${esc(x.id)}" data-clickable${cls ? ` class="${cls}"` : ''}${bill ? ` data-row-bill="${esc(bill.id)}" title="กดเพื่อเปิดใบวางบิล ${esc(bill.docNo || '')}"`
      : prob ? ' title="บิลมีปัญหา — วางบิลไม่ได้จนกว่าจะกดเคลียร์"' : ' title="กดเพื่อเลือกบิลนี้"'}>
      <td><input type="checkbox" data-pick="${esc(x.id)}" ${picked.has(x.id) ? 'checked' : ''} ${prob ? 'disabled title="บิลมีปัญหา — ล็อกไว้ วางบิลไม่ได้"' : ''} aria-label="เลือกบิล ${esc(invNo(x))}"></td>
      <td>${child ? `<span class="strong">บิล <span class="code">${esc(invNo(x))}</span></span>`
        : `<span class="strong">${esc(x.dropoff?.name || '—')}</span><span class="bill-meta">Invoice <span class="code">${esc(invNo(x))}</span></span>`}
        ${problemTag(x)}
        ${prob && canWrite() ? `<button type="button" class="btn btn-sm btn-danger prob-btn" data-clear-problem="${esc(x.id)}">เคลียร์แล้ว…</button>` : ''}</td>
      <td><span class="tiny dim">${esc(fmtDate(r.date))}</span><br><span class="code">${esc(j.code || '—')}</span>
        <span class="tiny dim">${esc(j.vehicle || '')}</span></td>
      <td>${esc(carrierOf(j))}<span class="bill-meta">${esc(driverNames(j) || 'ยังไม่จ่ายงาน')}</span></td>
      <td class="right mono">${kgOf(x) ? `${esc(fmtKg(kgOf(x)))} กก.` : '<span class="dim">—</span>'}</td>
      <td class="right"><input class="input tnum bill-rev" type="number" min="0" step="0.01" inputmode="decimal"
            data-rev="${esc(x.id)}" value="${rev || ''}" placeholder="0.00" ${r.st !== BILL.NONE ? 'title="วางบิลแล้ว — แก้ได้แต่ยอดในใบวางบิลจะไม่เปลี่ยนตาม"' : ''}
            aria-label="ค่าขนส่งบิล ${esc(invNo(x))}">
        <span class="bill-meta">${manual
          ? `แก้เอง · <button class="linkish" type="button" data-rev-reset="${esc(x.id)}" title="กลับไปใช้ Amount ${esc(fmtBaht(amount))}">ใช้ตาม Amount</button>`
          : 'ตาม Amount'}</span></td>
      <td>${statusPill({ ...r, bill })}${collectPill({ ...r, x, rev })}</td>
    </tr>`;
}

let shownRows = [];
function paint(){
  if (view !== 'trips') return;
  /* กำลังพิมพ์ค่าขนส่งอยู่ — ข้อมูลจากเครื่องอื่นเข้ามาก็รอก่อน ไม่งั้นช่องที่พิมพ์ค้างจะหาย */
  if (document.activeElement?.matches?.('[data-rev]')){ pending = true; return; }
  pending = false;

  const every = scope();
  const list = every.filter(inRange);
  paintKpi(list, every);
  paintCash(every);
  $('#tabs').innerHTML = TABS.map(t => `
    <button class="tab" role="tab" data-tab="${t.key}" aria-selected="${t.key === tab}"${allDays(t) ? ' title="บิลค้างทุกวัน ไม่ขึ้นกับช่วงวันที่"' : ''}>
      ${esc(t.label)}<span class="cnt">${fmtNum((allDays(t) ? every : list).filter(t.test).length)}</span>
    </button>`).join('');

  const cur = TABS.find(t => t.key === tab) || TABS[0];
  const rows = (allDays(cur) ? every : list).filter(cur.test);
  shownRows = rows;
  const shown = new Set(rows.map(r => r.x.id));
  [...picked].forEach(id => { if (!shown.has(id)) picked.delete(id); });
  rows.forEach(r => { if (isProblem(r.x)) picked.delete(r.x.id); });
  /* บิลมีปัญหา (คนขับส่งไม่สำเร็จ) ปักบนสุด ไม่รวมกลุ่ม — ล็อกห้ามวางบิลจนกว่าจะกดเคลียร์ */
  const probRows = rows.filter(r => isProblem(r.x));

  /* รวมบิลของผู้รับเดียวกันเป็นกลุ่ม (แบบหน้าคนขับ) — บิลเดียวไม่ต้องรวม · ค้นหาอยู่ = กางทุกกลุ่ม */
  const searching = !!q.trim();
  $('#rows').innerHTML = (probRows.length ? `<tr class="prob-head"><td colspan="7">⚠ บิลมีปัญหา ${fmtNum(probRows.length)} บิล — คนขับส่งไม่สำเร็จ · ล็อกไว้ วางบิลไม่ได้จนกว่าจะกด “เคลียร์แล้ว”</td></tr>`
      + probRows.map(r => billRow(r)).join('') : '')
    + groupsOf(rows.filter(r => !isProblem(r.x))).map(g => {
    if (g.rows.length === 1) return billRow(g.rows[0]);
    const open = searching || openGroups.has(g.key);
    const ids = g.rows.map(r => r.x.id);
    const n = ids.filter(id => picked.has(id)).length;
    const sum = g.rows.reduce((a, r) => a + r.rev, 0);
    const kg = g.rows.reduce((a, r) => a + kgOf(r.x), 0);
    const counts = [BILL.NONE, BILL.BILLED, BILL.PAID].map(st => [st, g.rows.filter(r => r.st === st).length]).filter(([, c]) => c);
    const dates = [...new Set(g.rows.map(r => r.date).filter(Boolean))].sort();
    return `<tr class="bill-grp${open ? ' is-open' : ''}${n ? ' is-picked' : ''}" data-grp="${esc(g.key)}" data-clickable title="แตะเพื่อ${open ? 'พับ' : 'กาง'}บิลของผู้รับนี้">
      <td><input type="checkbox" data-pick-grp="${esc(g.key)}" ${n === ids.length ? 'checked' : ''} data-some="${n && n < ids.length ? 1 : ''}" aria-label="เลือกทุกบิลของ ${esc(g.name)}"></td>
      <td><span class="strong">${esc(g.name)}</span><span class="bill-meta"><b class="grp-n">${fmtNum(ids.length)} บิล</b>${n ? ` · เลือก ${fmtNum(n)}` : ''}</span></td>
      <td><span class="tiny dim">${esc(dates.length > 1 ? `${fmtDate(dates[0])} – ${fmtDate(dates[dates.length - 1])}` : fmtDate(dates[0]))}</span></td>
      <td></td>
      <td class="right mono">${kg ? `${esc(fmtKg(kg))} กก.` : '<span class="dim">—</span>'}</td>
      <td class="right mono strong">${esc(fmtBaht(sum))}</td>
      <td><span class="row between gap-8" style="align-items:center">
        <span class="tiny">${counts.map(([st, c]) => `${esc(st)} ${fmtNum(c)}`).join(' · ')}</span>
        <span class="tiny strong grp-toggle">${open ? '▴' : 'ดูบิล ▾'}</span></span></td>
    </tr>${open ? g.rows.map(r => billRow(r, true)).join('') : ''}`;
  }).join('');
  /* ติ๊กที่หัวกลุ่มได้บางบิล = ขีด (–) */
  $$('#rows [data-some="1"]').forEach(c => { c.indeterminate = true; });

  $('#emptyState').innerHTML = rows.length ? '' : `<div class="empty"><div class="empty-mark">฿</div>
    ${!(allDays(cur) ? every : list).length ? ($('#onlyToday').checked ? 'วันนี้ยังไม่มีบิล — เอาติ๊ก "เฉพาะวันนี้" ออกเพื่อดูวันอื่น' : 'ไม่มีบิลในช่วงวันที่ที่เลือก')
      : tab === 'norev' ? 'ทุกบิลในช่วงนี้มีค่าขนส่งครบแล้ว' : 'ไม่มีบิลในแท็บนี้'}</div>`;
  $('#checkAll').checked = rows.length > 0 && rows.every(r => picked.has(r.x.id));
  paintBulk(rows);
}
let pending = false;

/* ---------- แถบคำสั่งเมื่อเลือกหลายบิล -------------------- */
/* วางบิลแบบเก่า (ทั้งเที่ยว ไม่มีใบวางบิล) — ยังบันทึกชำระ/ยกเลิกสถานะแบบเดิมได้ (ทำทั้งเที่ยว) */
const legacyOf = (rows) => rows.filter(r => r.billing?.viaJob && !r.bill && r.st !== BILL.NONE);
function paintBulk(rows){
  const bar = $('#bulkBar');
  const sel = rows.filter(r => picked.has(r.x.id));
  if (!sel.length){ bar.hidden = true; bar.innerHTML = ''; return; }
  const total = sel.reduce((a, r) => a + r.rev, 0);
  const free = sel.filter(r => !r.bill && r.st !== BILL.PAID && r.c.st === COLLECT.BILL);
  const due = sel.filter(r => r.c.st === COLLECT.SLIP || r.c.st === COLLECT.CASH);
  const legacy = legacyOf(sel);
  bar.hidden = false;
  bar.innerHTML = `
    <span class="strong">เลือก ${fmtNum(sel.length)} บิล · ค่าขนส่งรวม ${esc(fmtBaht(total))}</span>
    <span class="grow"></span>
    ${due.length ? `<button class="btn btn-green btn-sm" data-act="collect">ยืนยันรับเงินหน้างาน (${fmtNum(due.length)} บิล)…</button>` : ''}
    ${free.length ? '<button class="btn btn-accent btn-sm" data-act="bill">สร้างใบวางบิล…</button>' : ''}
    ${legacy.some(r => r.st === BILL.BILLED) ? '<button class="btn btn-sm" data-act="paid">บันทึกว่าชำระแล้ว…</button>' : ''}
    ${legacy.length ? '<button class="btn btn-ghost btn-sm" data-act="undo">ยกเลิกสถานะ</button>' : ''}
    <button class="btn btn-quiet btn-sm" data-act="clear">ล้างที่เลือก</button>`;
}

$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab; saveUI('billing', { tab }); picked.clear(); paint();
});

$('#rows').addEventListener('change', (e) => {
  const grp = e.target.closest('[data-pick-grp]');
  if (grp){
    /* ติ๊กหัวกลุ่ม = ทุกบิลของผู้รับนี้ที่แสดงอยู่ (รวมตอนพับ) */
    shownRows.filter(r => grpKey(r.x) === grp.dataset.pickGrp && !isProblem(r.x))
      .forEach(r => grp.checked ? picked.add(r.x.id) : picked.delete(r.x.id));
    paint();
    return;
  }
  const pick = e.target.closest('[data-pick]');
  if (pick){
    pick.checked ? picked.add(pick.dataset.pick) : picked.delete(pick.dataset.pick);
    paint();
    return;
  }
  const rev = e.target.closest('[data-rev]');
  if (rev) saveRevenue(rev.dataset.rev, rev.value, rev);
});
$('#rows').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('[data-rev]')) e.target.blur();
});
$('#rows').addEventListener('focusout', (e) => {
  if (e.target.matches('[data-rev]') && pending) setTimeout(paint, 0);
});
/* กดตรงไหนในแถวก็ได้ (แบบหน้า ops) — มีใบวางบิลแล้ว = เปิดใบ · ยังไม่มี = ติ๊กเลือกบิล
   ยกเว้นช่องที่กดเองได้อยู่แล้ว (ติ๊ก · ช่องค่าขนส่ง · ปุ่ม/ลิงก์) */
$('#rows').addEventListener('click', (e) => {
  const cp = e.target.closest('[data-clear-problem]');
  if (cp){ const r = shownRows.find(v => v.x.id === cp.dataset.clearProblem); return r && clearProblemDialog(r.x, BY, paint); }
  const b = e.target.closest('[data-open-bill]');
  if (b) return openBill(b.dataset.openBill);
  const col = e.target.closest('[data-collect]');
  if (col){ const r = shownRows.find(v => v.x.id === col.dataset.collect); return r && collectDialog([r]); }
  const reset = e.target.closest('[data-rev-reset]');
  if (reset) return saveRevenue(reset.dataset.revReset, null);
  if (e.target.closest('input, button, a, label, select, textarea')) return;
  if (getSelection()?.toString()) return;          /* ลากคลุมข้อความเพื่อคัดลอก ไม่นับเป็นการกด */
  const head = e.target.closest('tr[data-grp]');
  if (head){
    const k = head.dataset.grp;
    openGroups.has(k) ? openGroups.delete(k) : openGroups.add(k);
    saveUI('billing', { open: [...openGroups] });
    return paint();
  }
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  if (tr.dataset.rowBill) return openBill(tr.dataset.rowBill);
  const id = tr.dataset.id;
  if (tr.classList.contains('is-problem')) return toast('บิลมีปัญหา — ล็อกไว้ วางบิลไม่ได้ กด “เคลียร์แล้ว” ก่อน', 'warn', 4000);
  picked.has(id) ? picked.delete(id) : picked.add(id);
  paint();
});

/** ค่าขนส่งของบิล — value null = กลับไปใช้ Amount */
function saveRevenue(stopId, value, input){
  if (!canWrite()) return toast('บัญชีนี้ดูได้อย่างเดียวในหน้านี้ — ต้องการแก้ไข ติดต่อ admin', 'err');
  try{
    const changed = setStopRevenue(stopId, value, BY);
    if (changed){
      if (input){
        input.classList.add('is-saved');
        setTimeout(() => input.classList.remove('is-saved'), 1200);
      }
      toast(value === null ? 'กลับไปใช้ค่าขนส่งตาม Amount แล้ว' : 'บันทึกค่าขนส่งแล้ว', 'ok', 1800);
      /* ชีตรวม Shipments ช่อง O (รวมทุกบิลของเที่ยว) — ไม่ต้องเด้งบอก ช่องนี้บันทึกถี่ตอนไล่กรอกทีละบิล */
      const jobId = listShipments().find(x => x.id === stopId)?.jobId;
      if (jobId) pushMaster(jobId, 'shipments', stopId, { quiet:true });
    }
    if (!input || !changed) setTimeout(paint, 0);
  }catch(err){
    toast(err.message, 'err');
    pending = true;                    /* วาดค่าเดิมกลับมาหลังออกจากช่อง */
  }
}

$('#checkAll').addEventListener('change', (e) => {
  /* ติ๊กทั้งหมด = ทุกบิลในแท็บนี้ (รวมกลุ่มที่พับไว้) */
  const ids = shownRows.filter(r => !isProblem(r.x)).map(r => r.x.id);
  ids.forEach(id => e.target.checked ? picked.add(id) : picked.delete(id));
  paint();
});

$('#bulkBar').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  const sel = shownRows.filter(r => picked.has(r.x.id));
  if (act === 'clear'){ picked.clear(); paint(); return; }
  if (act === 'bill') return createBillDialog(sel);
  if (act === 'collect') return collectDialog(sel.filter(r => r.c.st === COLLECT.SLIP || r.c.st === COLLECT.CASH));
  /* วางบิลแบบเก่าเป็นทั้งเที่ยว — ทำได้ทีละเที่ยว (ทุกบิลในเที่ยวเปลี่ยนพร้อมกัน) */
  const legacyJobs = [...new Set(legacyOf(sel).map(r => r.j.id))];
  if (act === 'paid') return paidDialog(legacyJobs, sel.length - legacyOf(sel).length);
  if (act === 'undo'){
    const ok = await confirmDialog({
      title: 'ยกเลิกสถานะวางบิล',
      message: `${legacyJobs.length} เที่ยวที่วางบิลแบบเดิม (ทั้งเที่ยว) จะกลับเป็น "${BILL.NONE}" ทุกบิลในเที่ยว (เลขใบวางบิลและวันที่จะถูกล้าง ค่าขนส่งยังอยู่)` +
        (sel.length > legacyOf(sel).length ? ` · ข้าม ${sel.length - legacyOf(sel).length} บิลที่อยู่ในใบวางบิล — ยกเลิกที่ใบวางบิลแทน` : ''),
      ok: 'ยกเลิกสถานะ', tone: 'btn-danger',
    });
    if (!ok) return;
    run(() => setJobBilling(legacyJobs, { docNo:'', billedAt:'', paidAt:'' }, BY), 'ยกเลิกสถานะแล้ว');
  }
});

/* ยืนยันรับเงินหน้างาน — หน้าต่างกลางใน helper.js (หน้าคืนบิลของคลังใช้ตัวเดียวกัน) */
const collectDialog = (list) => collectDialogFor(list.map(r => ({ x: r.x, rev: r.rev })),
  { by: BY, onDone: () => { picked.clear(); paint(); } });

/** เงินสดค้างที่คนขับ (ทุกวัน) — กดชื่อ = แท็บเงินสดค้าง + ค้นชื่อคนขับคนนั้น */
function paintCash(every){
  const by = new Map();
  every.filter(r => r.c.st === COLLECT.CASH).forEach(r => {
    const k = r.c.holder || '';
    const v = by.get(k) || { n: 0, sum: 0 };
    v.n++; v.sum += Number(r.c.p.amount) || 0;
    by.set(k, v);
  });
  const rows = [...by.entries()].sort((a, b) => b[1].sum - a[1].sum);
  $('#cashSlot').innerHTML = rows.length ? `
    <div class="card cash-card">
      <div class="row between wraps gap-8"><b>💵 เงินสดค้างที่คนขับ</b>
        <span class="small">รวม <b class="mono">${esc(fmtBaht(rows.reduce((a, [, v]) => a + v.sum, 0)))}</b> · ${fmtNum(rows.reduce((a, [, v]) => a + v.n, 0))} บิล</span></div>
      <div class="cash-list">${rows.map(([id, v]) => {
        const nm = id ? (driverName(getDriver(id)) || `คนขับรหัส ${id}`) : 'ไม่ทราบคนขับ';
        return `<button type="button" class="cash-chip" data-cash="${esc(id ? (getDriver(id)?.name || '') : '')}">
          <span>${esc(nm)}</span><b class="mono">${esc(fmtBaht(v.sum))}</b><span class="tiny dim">${fmtNum(v.n)} บิล</span></button>`; }).join('')}</div>
    </div>` : '';
}
$('#cashSlot').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cash]');
  if (!b) return;
  tab = 'cash'; saveUI('billing', { tab });
  q = b.dataset.cash; $('#q').value = q; saveUI('billing', { q });
  picked.clear(); paint();
});

function run(fn, msg){
  try{
    const n = fn();
    close();
    picked.clear();
    paint();
    toast(n ? `${msg} ${fmtNum(n)} เที่ยว` : 'ไม่มีอะไรเปลี่ยน', 'ok');
  }catch(err){ toast(err.message, 'err'); }
}

/** บันทึกชำระแบบเดิม — เฉพาะเที่ยวที่วางบิลก่อนมีใบวางบิล */
function paidDialog(ids, skipBills = 0){
  const jobs = listJobs().filter(j => ids.includes(j.id) && billStatus(j.billing) === BILL.BILLED);
  const skip = ids.length - jobs.length;
  modal({
    title: `บันทึกว่าชำระแล้ว ${fmtNum(jobs.length)} เที่ยว`,
    body: `
      ${skip ? `<p class="small dim" style="margin-top:0">ข้าม ${fmtNum(skip)} เที่ยวที่ยังไม่ได้วางบิลหรือชำระไปแล้ว</p>` : ''}
      ${skipBills ? `<p class="small dim" style="margin-top:0">ข้าม ${fmtNum(skipBills)} เที่ยวที่อยู่ในใบวางบิล — ยืนยันรับเงินที่ใบวางบิลแทน</p>` : ''}
      <label class="field"><span class="small strong">วันที่ชำระ</span>
        <input class="input" type="date" id="pDate" value="${todayYMD()}"></label>
      <p class="tiny dim" style="margin-top:12px">ยอดที่ชำระ ${esc(fmtBaht(jobs.reduce((a, j) => a + (Number(j.revenue) || 0), 0)))}</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok ${jobs.length ? '' : 'disabled'}>บันทึก</button>`,
    onMount(root){
      root.querySelector('[data-ok]').onclick = () => {
        const paidAt = root.querySelector('#pDate').value;
        if (!paidAt) return toast('ใส่วันที่ชำระก่อน', 'err');
        run(() => setJobBilling(jobs.map(j => j.id), { paidAt }, BY), 'บันทึกการชำระแล้ว');
      };
    },
  });
}

/* ============================================================
   ใบวางบิล
   ============================================================ */
let bills = null;                 /* null = ยังโหลดไม่เสร็จ */
let billsErr = '';
const billsById = new Map();

/* ---------- ล้างใบวางบิลทั้งหมด (ผู้ใช้ขอ 27 ต.ค. 2026 — ล้างข้อมูลทดสอบก่อนใช้จริง) ----------
   เรียกจาก Console หน้านี้: FT.wipeBills() · admin เท่านั้น · ถามยืนยันก่อน · ย้อนกลับไม่ได้
   ลบ bills ทุกใบ (รวมที่ยกเลิก) + สลิปที่ลูกค้าแนบ (Storage bills/…) + สถานะวางบิลในบิล/เที่ยว
   งาน จุดส่ง ค่าขนส่ง การเก็บเงินหน้างาน ไม่แตะ · ชีต Master ไม่ได้ล้างตาม */
async function wipeBills(){
  if (!isAdmin(getSession().staff) || !canWrite()) throw new Error('ล้างใบวางบิลได้เฉพาะ admin');
  if (bills === null) throw new Error('ใบวางบิลยังโหลดไม่เสร็จ — รอสักครู่แล้วลองใหม่');
  const list = bills.slice();
  const slips = [...new Set((JSON.stringify(list).match(/https:\/\/firebasestorage\.googleapis\.com[^"\\]+/g) || [])
    .filter(u => u.includes('/o/bills%2F')))];
  const linked = listShipments().filter(x => x.billing).length + listJobs().filter(j => j.billing).length;
  const ok = await confirmDialog({
    title: 'ล้างใบวางบิลทั้งหมด',
    message: `ลบใบวางบิล ${fmtNum(list.length)} ใบ · สลิปลูกค้า ${fmtNum(slips.length)} ไฟล์ · ล้างสถานะวางบิล ${fmtNum(linked)} รายการ ` +
      '— บิลทุกใบกลับเป็น "ยังไม่วางบิล" · งาน ค่าขนส่ง และการเก็บเงินหน้างานยังอยู่ · ลิงก์ที่ส่งให้ลูกค้าจะเปิดไม่ได้ · ย้อนกลับไม่ได้',
    ok: 'ล้างเลย', tone: 'btn-danger',
  });
  if (!ok) return null;
  const n = await deleteBills(list.map(b => b.id));
  const files = slips.length ? await removePhotos(slips) : 0;
  const cleared = clearAllBilling(BY);
  picked.clear();
  paint();
  toast(`ล้างแล้ว — ใบวางบิล ${fmtNum(n)} ใบ · สลิป ${fmtNum(files)} ไฟล์ · สถานะวางบิล ${fmtNum(cleared.stops + cleared.jobs)} รายการ`, 'ok', 6000);
  return { bills: n, slips: files, ...cleared };
}
window.FT = { ...(window.FT || {}), wipeBills };

watchBills((rows) => {
  bills = rows;
  billsById.clear();
  rows.forEach(b => billsById.set(b.id, b));
  billsErr = '';
  const open = rows.filter(b => b.status === 'open').length;
  $('#billCount').textContent = open ? String(open) : '';
  view === 'bills' ? paintBills() : paint();
  refreshDetail();
}, (err) => {
  billsErr = err?.code === 'permission-denied' ? 'บัญชีนี้ไม่มีสิทธิ์ดูใบวางบิล' : 'โหลดใบวางบิลไม่ได้ — ตรวจอินเทอร์เน็ตแล้วรีเฟรชหน้า';
  bills = bills || [];
  if (view === 'bills') paintBills();
});

/* ---------- รายการในใบ (แถวละบิล) ----------
   stopId = บิลในแอป · ใบเก่า (รายเที่ยว) ไม่มี stopId มีแค่ jobId */
function itemOf({ x, j, rev }){
  return {
    stopId: x.id,
    jobId: x.jobId,
    code: j?.code || '',
    date: dateOf(j),
    vehicle: j?.vehicle || '',
    stops: 0,
    dests: x.dropoff?.name || '',
    invoices: [invNo(x)].filter(Boolean),
    amount: rev,
  };
}
/** บิล/เที่ยวที่ผูกกับใบนี้ — ใบรายบิลแก้ที่บิล · ใบรายเที่ยวเดิมแก้ที่เที่ยว */
function linksOf(b){
  const stops = new Set(listShipments().map(x => x.id));
  const jobs = new Set(listJobs().map(j => j.id));
  const items = b.items || [];
  return {
    stopIds: items.filter(i => i.stopId && stops.has(i.stopId)).map(i => i.stopId),
    jobIds: items.filter(i => !i.stopId && jobs.has(i.jobId)).map(i => i.jobId),
  };
}
function relink(b, patch){
  const { stopIds, jobIds } = linksOf(b);
  if (stopIds.length) setStopBilling(stopIds, patch, BY);
  if (jobIds.length) setJobBilling(jobIds, patch, BY);
  return stopIds.length + jobIds.length;
}

/** ลูกค้าที่เคยวางบิล — ใบล่าสุดของแต่ละชื่อ (ใช้เติมที่อยู่/เลขภาษีให้) */
function knownCustomers(){
  const map = new Map();
  (bills || []).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .forEach(b => { if (b.billTo?.name) map.set(b.billTo.name, b.billTo); });
  return map;
}

function createBillDialog(sel){
  if (bills === null) return toast('ใบวางบิลยังโหลดไม่เสร็จ — รอสักครู่แล้วลองใหม่', 'err');
  /* ด่านสุดท้าย — บิลมีปัญหาไม่มีทางเข้าใบวางบิล แม้หลุดมาในชุดที่เลือก */
  sel = sel.filter(r => !isProblem(r.x));
  if (!sel.length) return toast('บิลที่เลือกมีปัญหาทั้งหมด — เคลียร์ก่อนจึงวางบิลได้', 'warn', 4000);
  const onBill = sel.filter(r => r.bill);
  const paidOld = sel.filter(r => !r.bill && r.st === BILL.PAID);
  const norev = sel.filter(r => !r.bill && !(r.rev > 0));
  const onSite = sel.filter(r => !r.bill && r.st !== BILL.PAID && r.c.st !== COLLECT.BILL);
  const rows = sel.filter(r => !r.bill && r.st !== BILL.PAID && r.rev > 0 && r.c.st === COLLECT.BILL).sort(byRecipient);
  const total = rows.reduce((a, r) => a + r.rev, 0);
  const known = knownCustomers();
  const today = todayYMD();
  /* เลขที่ใบตั้งต้น = เลข Invoice แรก (น้อยสุด) ในใบ — แก้ได้ */
  const invs = rows.map(r => invNo(r.x)).sort((a, b) => a.localeCompare(b, 'en', { numeric:true }));
  const firstInv = invs[0] || '';
  /* ออกบิลในนามผู้รับปลายทางของบิลที่เลือก (ลูกค้าขอ 26 ต.ค. 2026) — ชื่อเดียวเลือกไว้ให้ · อื่น ๆ = พิมพ์เอง (เช่น บริษัทผู้ว่าจ้าง) */
  const names = [...new Set(rows.map(r => String(r.x.dropoff?.name || '').trim()).filter(Boolean))].sort(byName);
  const skip = (list, why) => list.length ? `<li>${fmtNum(list.length)} บิล${why} (${esc(list.slice(0, 5).map(r => invNo(r.x)).join(', '))}${list.length > 5 ? ' …' : ''})</li>` : '';
  const skipped = skip(norev.filter(r => r.c.st === COLLECT.BILL), 'ยังไม่มีค่าขนส่ง') + skip(onBill, 'อยู่ในใบวางบิลอื่นแล้ว') + skip(paidOld, 'ชำระไปแล้ว')
    + skip(onSite, 'ผู้รับจ่ายหน้างานแล้ว — ยืนยันรับเงินแทนการวางบิล');

  modal({
    title: `สร้างใบวางบิล · ${fmtNum(rows.length)} บิล`,
    wide: true,
    body: `
      ${skipped ? `<div class="bill-warn"><b>ข้ามบิลต่อไปนี้</b><ul>${skipped}</ul></div>` : ''}
      <div class="bill-form">
        <label class="field span2"><span class="small strong">ลูกค้า (ผู้ว่าจ้าง) *</span>
          <select class="input" id="cPick">
            ${names.length !== 1 ? '<option value="">— เลือกชื่อผู้รับ —</option>' : ''}
            ${names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
            <option value="__other">อื่น ๆ (พิมพ์เอง)</option>
          </select>
          <input class="input" id="cName" list="cList" maxlength="150" autocomplete="off" placeholder="พิมพ์ชื่อที่จะออกบิล" style="margin-top:8px;display:none">
          <datalist id="cList">${[...known.keys()].map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <label class="field span2"><span class="small strong">ที่อยู่</span>
          <textarea class="input" id="cAddr" rows="2" maxlength="400"></textarea></label>
        <label class="field"><span class="small strong">เลขประจำตัวผู้เสียภาษี</span>
          <input class="input mono" id="cTax" maxlength="20" inputmode="numeric"></label>
        <label class="field"><span class="small strong">ผู้ติดต่อ / เบอร์</span>
          <input class="input" id="cContact" maxlength="150"></label>
        <label class="field"><span class="small strong">เลขที่ใบวางบิล *</span>
          <input class="input mono" id="bDoc" maxlength="40" value="${esc(firstInv)}">
          ${rows.length > 1 ? `<span class="tiny dim">Invoice ที่เลือก ${fmtNum(rows.length)} บิล: ${esc(invs.join(' · '))}</span>` : ''}</label>
        <label class="field"><span class="small strong">วันที่วางบิล *</span>
          <input class="input" type="date" id="bDate" value="${today}"></label>
        <label class="field"><span class="small strong">เครดิต (วัน)</span>
          <input class="input tnum" type="number" id="bCredit" min="0" max="365" step="1" value="${DEFAULT_CREDIT_DAYS}"></label>
        <div class="field"><span class="small strong">ครบกำหนดชำระ</span>
          <div class="bill-due" id="bDue"></div></div>
        <label class="field span2"><span class="small strong">หมายเหตุบนใบ</span>
          <input class="input" id="bNote" maxlength="300" placeholder="เช่น โอนเข้าบัญชี … ธนาคาร …"></label>
      </div>
      <div class="bill-sum">
        <span>${fmtNum(rows.length)} บิล</span>
        <span class="grow"></span>
        <span>ยอดรวม <b class="mono">${esc(fmtBaht(total))}</b></span>
      </div>
      <p class="tiny dim" style="margin-top:8px">ยังไม่คำนวณ VAT / หัก ณ ที่จ่าย — ยอดตามค่าขนส่งที่กรอก</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok ${rows.length ? '' : 'disabled'}>สร้างใบวางบิล</button>`,
    onMount(root){
      const v = (s) => root.querySelector(s);
      const due = () => {
        const d = v('#bDate').value, c = Math.max(0, Math.floor(Number(v('#bCredit').value) || 0));
        v('#bDue').textContent = d ? thDate(addDays(d, c)) : '—';
      };
      v('#bDate').addEventListener('input', due);
      v('#bCredit').addEventListener('input', due);
      /* ชื่อที่จะออกบิล: dropdown ผู้รับ หรือ อื่น ๆ = ช่องพิมพ์ */
      const nameOf = () => v('#cPick').value === '__other' ? v('#cName').value.trim() : v('#cPick').value;
      /* ชื่อที่เคยวางบิล → เติมที่อยู่/เลขภาษี/ผู้ติดต่อ — ทับได้เฉพาะช่องที่ยังไม่ได้พิมพ์เอง */
      const typed = new Set();
      ['#cAddr', '#cTax', '#cContact'].forEach(id => v(id).addEventListener('input', () => typed.add(id)));
      const fill = () => {
        const c = known.get(nameOf()) || {};
        [['#cAddr', c.address], ['#cTax', c.taxId], ['#cContact', c.contact]]
          .forEach(([id, val]) => { if (!typed.has(id)) v(id).value = val || ''; });
      };
      v('#cPick').addEventListener('change', () => {
        const other = v('#cPick').value === '__other';
        v('#cName').style.display = other ? '' : 'none';
        if (other) v('#cName').focus();
        fill();
      });
      v('#cName').addEventListener('change', fill);
      due();
      fill();
      v('#cPick').focus();

      v('[data-ok]').onclick = async () => {
        const name = nameOf();
        const docNo = v('#bDoc').value.trim();
        const issueDate = v('#bDate').value;
        const creditDays = Math.floor(Number(v('#bCredit').value) || 0);
        if (!name) return toast(v('#cPick').value === '__other' ? 'พิมพ์ชื่อลูกค้าก่อน' : 'เลือกชื่อลูกค้าก่อน', 'err');
        if (!docNo) return toast('ใส่เลขที่ใบวางบิลก่อน', 'err');
        if (!issueDate) return toast('ใส่วันที่วางบิลก่อน', 'err');
        if (creditDays < 0 || creditDays > 365) return toast('เครดิตต้องอยู่ระหว่าง 0–365 วัน', 'err');
        if (bills.some(b => b.status !== 'cancelled' && String(b.docNo).trim().toLowerCase() === docNo.toLowerCase())){
          return toast(`เลขที่ใบวางบิล ${docNo} ถูกใช้แล้ว`, 'err');
        }
        if (!canWrite()) return toast('บัญชีนี้ดูได้อย่างเดียวในหน้านี้ — ต้องการแก้ไข ติดต่อ admin', 'err');
        const btn = v('[data-ok]');
        btn.disabled = true; btn.textContent = 'กำลังสร้าง…';
        try{
          const bill = await createBill({
            docNo, issueDate, creditDays, note: v('#bNote').value,
            billTo: { name, address: v('#cAddr').value, taxId: v('#cTax').value, contact: v('#cContact').value },
            items: rows.map(itemOf),
          }, WHO);
          setStopBilling(rows.map(r => r.x.id),
            { docNo: bill.docNo, billedAt: bill.issueDate, paidAt:'', billId: bill.id, dueDate: bill.dueDate, payMethod:'' }, BY);
          billsById.set(bill.id, bill);
          pushBill(bill.id);
          picked.clear();
          /* วาดตารางใหม่แล้วอยู่ที่เดิม — ไม่ดีดกลับขึ้นบน */
          const y = scrollY;
          paint();
          requestAnimationFrame(() => scrollTo(0, y));
          toast(`สร้างใบวางบิล ${bill.docNo} แล้ว — คัดลอกลิงก์ส่งให้ลูกค้าได้เลย`, 'ok');
          openBill(bill.id, bill);
        }catch(err){
          toast(err.message, 'err');
          btn.disabled = false; btn.textContent = 'สร้างใบวางบิล';
        }
      };
    },
  });
}

/* ---------- รายการใบวางบิล ---------- */
/* แถวในแท็บนี้มีสองแบบ: ใบวางบิล (kind 'bill') · บิลที่ยืนยันรับเงินหน้างานแล้ว (kind 'site' — ย้ายมาจาก "บิล · ค่าขนส่ง")
   รวมเป็นกลุ่มตามผู้รับปลายทาง กดหัวกลุ่มย่อ/ขยาย (แบบแท็บบิล · ค่าขนส่ง) */
const isBill = (fn) => (r) => r.kind === 'bill' && fn(r.b);
const BTABS = [
  { key:'all',      label:'ทั้งหมด',              test: r => r.kind === 'site' || r.b.status !== 'cancelled' },
  { key:'site',     label:'ชำระหน้างาน',          test: r => r.kind === 'site' },
  { key:'sent',     label:'รอลูกค้ารับบิล',        test: isBill(b => ['sent', 'viewed'].includes(custState(b).key)) },
  { key:'received', label:'ลูกค้ารับบิลแล้ว',       test: isBill(b => custState(b).key === 'received') },
  { key:'notice',   label:'แจ้งชำระ · รอตรวจ',     test: isBill(b => custState(b).key === 'notice') },
  { key:'late',     label:'เกินกำหนด',            test: isBill(b => overdueDays(b) > 0) },
  { key:'paid',     label:'ชำระแล้ว',             test: r => r.kind === 'site' || r.b.status === 'paid' },
  { key:'cancelled',label:'ยกเลิก',               test: isBill(b => b.status === 'cancelled') },
];
const openBGroups = new Set(UI.bopen || []);
let btab = UI.btab || 'all';
let bq = UI.bq || '', bFrom = KEEP.bFrom || '', bTo = KEEP.bTo || '';
$('#bq').value = bq; $('#bFrom').value = bFrom; $('#bTo').value = bTo;
const rememberBq = debounce((v) => saveUI('billing', { bq: v }), 300);
$('#bq').addEventListener('input', (e) => { bq = e.target.value; rememberBq(bq); paintBills(); });
$('#bFrom').addEventListener('change', (e) => { bFrom = e.target.value; keep({ bFrom }); paintBills(); });
$('#bTo').addEventListener('change', (e) => { bTo = e.target.value; keep({ bTo }); paintBills(); });
$('#billTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-btab]');
  if (!b) return;
  btab = b.dataset.btab; saveUI('billing', { btab }); paintBills();
});

function billScope(){
  const t = bq.trim().toLowerCase();
  const day = (v) => String(v || '').slice(0, 10);
  const inDays = (d) => (!bFrom || d >= bFrom) && (!bTo || d <= bTo);
  const docs = (bills || [])
    .filter(b => inDays(b.issueDate))
    .filter(b => !t || [b.docNo, b.billTo?.name, ...(b.items || []).map(i => i.code), ...(b.items || []).flatMap(i => i.invoices || [])]
      .join(' ').toLowerCase().includes(t))
    .map(b => ({ kind:'bill', id:b.id, b, name: String(b.billTo?.name || '').trim() || '—', date: b.issueDate,
                 amount: Number(b.total) || 0, at: b.createdAt || '', no: b.docNo || '' }));
  /* ยืนยันรับเงินหน้างานแล้ว — วันที่ = วันที่ยืนยัน · ยอด = ที่เก็บได้จริง */
  const jobs = new Set(listJobs().filter(j => j.status !== 'cancelled').map(j => j.id));
  const site = listShipments()
    .filter(x => x.status !== S.CANCELLED && jobs.has(x.jobId))
    .map(x => ({ x, c: collectOf(x) }))
    .filter(({ c }) => c.st === COLLECT.DONE && inDays(day(c.ok.at)))
    .filter(({ x }) => !t || [invNo(x), x.code, x.delivery, x.dropoff?.name, x.customer?.name].join(' ').toLowerCase().includes(t))
    .map(({ x, c }) => ({ kind:'site', id:x.id, x, c, name: grpKey(x), date: day(c.ok.at),
                          amount: Number(c.p.amount) || 0, at: c.ok.at, no: invNo(x) }));
  /* กลุ่มเรียงตามชื่อผู้รับ (ไทย → อังกฤษ → ตัวเลข) · ในกลุ่มล่าสุดอยู่บน */
  return [...docs, ...site].sort((a, b) => byName(a.name, b.name)
    || String(b.date).localeCompare(String(a.date)) || String(b.at).localeCompare(String(a.at)) || String(a.no).localeCompare(String(b.no), 'en', { numeric:true }));
}

function paintBills(){
  if (view !== 'bills') return;
  if (bills === null){
    $('#billRows').innerHTML = '';
    $('#billEmpty').innerHTML = '<div class="empty"><div class="empty-mark">฿</div>กำลังโหลดใบวางบิล…</div>';
    return;
  }
  const all = billScope();
  const list = all.filter(r => r.kind === 'bill').map(r => r.b);
  const site = all.filter(r => r.kind === 'site');
  const live = list.filter(b => b.status !== 'cancelled');
  const sum = (a, f = b => b.total) => a.reduce((x, b) => x + (Number(f(b)) || 0), 0);
  const open = live.filter(b => b.status === 'open');
  const late = open.filter(b => overdueDays(b) > 0);
  const notice = open.filter(b => custState(b).key === 'notice');
  const paid = live.filter(b => b.status === 'paid');
  $('#billKpis').innerHTML = kpiHtml([
    { label:'วางบิลแล้ว รอชำระ', value:fmtBaht(sum(open)), foot:`${fmtNum(open.length)} ใบ`, accent:'blue' },
    { label:'เกินกำหนด', value:fmtBaht(sum(late)), foot: late.length ? `${fmtNum(late.length)} ใบ` : 'ไม่มีใบเกินกำหนด', accent:'amber' },
    { label:'ลูกค้าแจ้งชำระ · รอตรวจ', value:fmtBaht(sum(notice)), foot:`${fmtNum(notice.length)} ใบ`, accent:'violet' },
    { label:'ชำระแล้ว', value:fmtBaht(sum(paid, b => b.paid?.amount ?? b.total) + site.reduce((a, r) => a + r.amount, 0)),
      foot:`ใบวางบิล ${fmtNum(paid.length)} ใบ · ชำระหน้างาน ${fmtNum(site.length)} บิล`, accent:'green' },
  ]);
  $('#billTabs').innerHTML = BTABS.map(t => `
    <button class="tab" role="tab" data-btab="${t.key}" aria-selected="${t.key === btab}">
      ${esc(t.label)}<span class="cnt">${fmtNum(all.filter(t.test).length)}</span>
    </button>`).join('');

  const rows = all.filter((BTABS.find(t => t.key === btab) || BTABS[0]).test);
  /* แถวใบวางบิล / แถวชำระหน้างาน · child = อยู่ใต้หัวกลุ่ม */
  const docRow = (b, child) => {
    const our = ourState(b), cust = custState(b), lateBy = overdueDays(b);
    const r = b.reply || {};
    const custMeta = cust.key === 'received' && r.promiseDate ? `นัดชำระ ${thDate(r.promiseDate)}`
      : cust.key === 'notice' && r.notice ? `${baht(r.notice.amount)} · ${r.notice.method}`
      : payModeOf(b) === 'each' ? PAY_MODES.each : '';
    return `<tr class="is-click${child ? ' bill-child' : ''}" data-bill="${esc(b.id)}">
      <td><span class="code">${esc(b.docNo || '—')}</span><span class="bill-meta">${esc(thDate(b.issueDate))}</span></td>
      <td>${child ? '<span class="tiny dim">ใบวางบิล</span>' : esc(b.billTo?.name || '—')}${b.linkActive === false && b.status === 'open' ? '<span class="bill-meta">ลิงก์ถูกปิด</span>' : ''}</td>
      <td class="right mono">${fmtNum((b.items || []).length)}</td>
      <td class="right mono">${esc(fmtBaht(b.total))}</td>
      <td>${esc(thDate(b.dueDate))}${lateBy ? `<span class="bill-meta bill-late">เกินกำหนด ${fmtNum(lateBy)} วัน</span>` : ''}</td>
      <td><span class="pill" data-tone="${our.tone}">${esc(our.label)}</span></td>
      <td><span class="pill" data-tone="${cust.tone}">${esc(cust.label)}</span>${custMeta ? `<span class="bill-meta">${esc(custMeta)}</span>` : ''}</td>
    </tr>`;
  };
  const siteRow = ({ x, c }, child) => `<tr class="is-click${child ? ' bill-child' : ''}" data-site="${esc(x.id)}" title="ดูหลักฐานการชำระ">
      <td><span class="code">${esc(invNo(x))}</span><span class="bill-meta">ยืนยัน ${esc(thDate(String(c.ok.at).slice(0, 10)))}</span></td>
      <td>${child ? '<span class="tiny dim">ชำระหน้างาน</span>' : esc(x.dropoff?.name || '—')}</td>
      <td class="right mono">1</td>
      <td class="right mono">${esc(fmtBaht(c.p.amount))}</td>
      <td><span class="dim">—</span></td>
      <td><span class="pill" data-tone="done">รับเงินแล้ว</span><span class="bill-meta">${esc(c.ok.byName || '—')}</span></td>
      <td><span class="pill" data-tone="done">จ่ายหน้างาน · ${esc(c.p.method)}</span><span class="bill-meta">${esc(c.p.byName || '—')}</span></td>
    </tr>`;
  const one = (r, child) => r.kind === 'bill' ? docRow(r.b, child) : siteRow(r, child);

  /* รวมตามผู้รับปลายทาง — แถวเดียวไม่ต้องรวม · ค้นหาอยู่ = กางทุกกลุ่ม */
  const groups = [], at = new Map();
  rows.forEach(r => {
    if (!at.has(r.name)){ at.set(r.name, groups.length); groups.push({ name: r.name, rows: [] }); }
    groups[at.get(r.name)].rows.push(r);
  });
  const searching = !!bq.trim();
  $('#billRows').innerHTML = groups.map(g => {
    if (g.rows.length === 1) return one(g.rows[0], false);
    const open = searching || openBGroups.has(g.name);
    const nb = g.rows.filter(r => r.kind === 'bill').length, ns = g.rows.length - nb;
    const total = g.rows.reduce((a, r) => a + r.amount, 0);
    return `<tr class="bill-grp${open ? ' is-open' : ''}" data-bgrp="${esc(g.name)}" data-clickable title="แตะเพื่อ${open ? 'พับ' : 'กาง'}รายการของผู้รับนี้">
      <td colspan="2"><span class="strong">${esc(g.name)}</span><span class="bill-meta"><b class="grp-n">${fmtNum(g.rows.length)} รายการ</b>${
        [nb && `ใบวางบิล ${fmtNum(nb)}`, ns && `ชำระหน้างาน ${fmtNum(ns)}`].filter(Boolean).map(v => ` · ${v}`).join('')}</span></td>
      <td class="right mono">${fmtNum(g.rows.reduce((a, r) => a + (r.kind === 'bill' ? (r.b.items || []).length : 1), 0))}</td>
      <td class="right mono strong">${esc(fmtBaht(total))}</td>
      <td colspan="3" class="right"><span class="tiny strong grp-toggle">${open ? '▴' : 'ดูรายการ ▾'}</span></td>
    </tr>${open ? g.rows.map(r => one(r, true)).join('') : ''}`;
  }).join('');
  $('#billEmpty').innerHTML = billsErr ? `<div class="empty"><div class="empty-mark">!</div>${esc(billsErr)}</div>`
    : rows.length ? '' : `<div class="empty"><div class="empty-mark">฿</div>${
      all.length ? 'ไม่มีรายการในแท็บนี้' : 'ยังไม่มีใบวางบิลหรือบิลที่ยืนยันรับเงิน — ไปที่ "บิล · ค่าขนส่ง" ยืนยันรับเงินหน้างาน หรือเลือกบิลแล้วกด "สร้างใบวางบิล…"'}</div>`;
}

$('#billRows').addEventListener('click', (e) => {
  const head = e.target.closest('tr[data-bgrp]');
  if (head){
    const k = head.dataset.bgrp;
    openBGroups.has(k) ? openBGroups.delete(k) : openBGroups.add(k);
    saveUI('billing', { bopen: [...openBGroups] });
    return paintBills();
  }
  const site = e.target.closest('[data-site]');
  if (site){
    const x = listShipments().find(v => v.id === site.dataset.site);
    return x && collectDialogFor([{ x, rev: stopRevenue(x) }], { by: BY, onDone: () => { paint(); paintBills(); } });
  }
  const tr = e.target.closest('[data-bill]');
  if (tr) openBill(tr.dataset.bill);
});

/* ---------- รายละเอียดใบ ---------- */
let detailId = null;            /* ใบที่เปิดหน้าต่างรายละเอียดอยู่ — ข้อมูลเปลี่ยนแล้ววาดใหม่ */

function refreshDetail(){
  if (!detailId) return;
  if (!document.querySelector('.scrim [data-bill-detail]')){ detailId = null; return; }
  const b = billsById.get(detailId);
  if (b) openBill(detailId, b, { keepScroll:true });
}

function openBill(id, given, { keepScroll = false } = {}){
  const b = given || billsById.get(id);
  if (!b) return toast('ไม่พบใบวางบิลนี้', 'err');
  const prevScroll = keepScroll ? document.querySelector('.scrim .modal-body')?.scrollTop : 0;
  detailId = b.id;
  const our = ourState(b), cust = custState(b), lateBy = overdueDays(b);
  const r = b.reply || {}, n = r.notice;
  const url = billUrl(b.id);
  const edit = canWrite();
  /* ค่าขนส่งที่แก้หลังวางบิล — ยอดในใบไม่เปลี่ยนตาม แจ้งให้เห็น (ใบรายบิลเทียบกับบิล · ใบเก่าเทียบกับเที่ยว) */
  const jobsNow = new Map(listJobs().map(j => [j.id, j]));
  const stopsNow = new Map(listShipments().map(x => [x.id, x]));
  const drift = (b.items || []).filter(it => {
    const now = it.stopId ? (stopsNow.has(it.stopId) ? stopRevenue(stopsNow.get(it.stopId)) : null)
      : (jobsNow.has(it.jobId) ? Number(jobsNow.get(it.jobId).revenue) || 0 : null);
    return now !== null && Math.abs(now - (Number(it.amount) || 0)) > 0.005;
  });
  const perBill = (b.items || []).some(it => it.stopId);
  /* ลูกค้าเลือกแยกจ่ายทีละบิล — ยืนยันรับเงินทีละรายการ */
  const each = payModeOf(b) === 'each';
  const eachRows = payItems(b);
  const unit = perBill ? 'บิล' : 'เที่ยว';
  const step = (done, label, detail) => `<li class="${done ? 'is-done' : ''}"><span>${done ? '✓' : '○'}</span><div><b>${esc(label)}</b>${detail ? `<br><span class="small dim">${detail}</span>` : ''}</div></li>`;

  const scrim = modal({
    title: `ใบวางบิล ${esc(b.docNo || '')}`,
    wide: true,
    body: `
      <div data-bill-detail>
        <div class="row wraps gap-8" style="margin-bottom:12px">
          <span class="pill" data-tone="${our.tone}">ฝั่งเรา · ${esc(our.label)}</span>
          <span class="pill" data-tone="${cust.tone}">ฝั่งลูกค้า · ${esc(cust.label)}</span>
          ${lateBy ? `<span class="pill" data-tone="stop">เกินกำหนด ${fmtNum(lateBy)} วัน</span>` : ''}
        </div>
        <dl class="kv bill-kv">
          <dt>ลูกค้า</dt><dd>${esc(b.billTo?.name || '—')}${b.billTo?.taxId ? ` <span class="dim small">· ${esc(b.billTo.taxId)}</span>` : ''}</dd>
          <dt>วันที่วางบิล</dt><dd>${esc(thDate(b.issueDate))} · เครดิต ${fmtNum(b.creditDays)} วัน</dd>
          <dt>ครบกำหนด</dt><dd>${esc(thDate(b.dueDate))}</dd>
          <dt>ยอดรวม</dt><dd class="mono strong">${esc(fmtBaht(b.total))} <span class="dim small">· ${fmtNum((b.items || []).length)} ${unit}</span></dd>
          ${b.paid ? `<dt>รับเงินแล้ว</dt><dd>${esc(fmtBaht(b.paid.amount))} · ${esc(b.paid.method)} · ${esc(thDate(b.paid.date))}${b.paid.note ? ` · ${esc(b.paid.note)}` : ''}</dd>` : ''}
          ${b.cancel ? `<dt>ยกเลิก</dt><dd>${esc(thDateTime(b.cancel.at))}${b.cancel.reason ? ` · ${esc(b.cancel.reason)}` : ''}</dd>` : ''}
        </dl>

        ${drift.length ? `<div class="bill-warn">ค่าขนส่งของ ${fmtNum(drift.length)} ${unit}ถูกแก้หลังวางบิล (${esc(drift.map(i => perBill ? (i.invoices || [])[0] || i.code : i.code).join(', '))})
          — ยอดในใบยังเป็นยอดเดิม ถ้าต้องการยอดใหม่ ให้ยกเลิกใบนี้แล้วสร้างใหม่</div>` : ''}

        ${b.status !== 'cancelled' ? `
        <div class="bill-link">
          <div class="row between wraps gap-8">
            <b class="small">ลิงก์สำหรับลูกค้า</b>
            <span class="pill" data-tone="${b.linkActive === false ? 'grey' : 'done'}">${b.linkActive === false ? 'ลิงก์ถูกปิด' : 'ลิงก์เปิดอยู่'}</span>
          </div>
          <div class="row gap-8" style="margin-top:8px">
            <input class="input mono grow" readonly value="${esc(url)}" data-url aria-label="ลิงก์ใบวางบิล">
            <button class="btn btn-accent btn-sm" data-do="copy" ${b.linkActive === false ? 'disabled' : ''}>คัดลอกลิงก์</button>
          </div>
          <div class="row wraps gap-8" style="margin-top:8px">
            <a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">เปิดดูแบบลูกค้า ↗</a>
            <a class="btn btn-ghost btn-sm" href="${esc(billUrl(b.id, 'print=1'))}" target="_blank" rel="noopener">พิมพ์ / PDF ↗</a>
            ${edit && b.status === 'open' ? `
              <button class="btn btn-quiet btn-sm" data-do="toggle">${b.linkActive === false ? 'เปิดลิงก์อีกครั้ง' : 'ปิดลิงก์'}</button>
              <button class="btn btn-quiet btn-sm" data-do="renew">เปลี่ยนเป็นลิงก์ใหม่</button>` : ''}
          </div>
        </div>` : ''}

        <h4 class="bill-h">ฝั่งลูกค้า</h4>
        <ol class="bill-steps">
          ${step(!!r.viewedAt, 'เปิดดูใบวางบิล', r.viewedAt ? esc(thDateTime(r.viewedAt)) : 'ยังไม่เปิดลิงก์')}
          ${step(!!r.receivedAt, 'รับบิล', r.receivedAt ? `${esc(r.receivedBy || '')} · ${esc(thDateTime(r.receivedAt))}` : '')}
          ${step(!!r.promiseDate, 'นัดวันชำระ', r.promiseDate ? `${esc(thDate(r.promiseDate))}${r.note ? ` · ${esc(r.note)}` : ''}` : '')}
          ${step(!!r.payMode, 'วิธีชำระ', r.payMode ? esc(PAY_MODES[payModeOf(b)]) : 'ยังไม่เลือก (ถือว่าจ่ายทีเดียวทั้งหมด)')}
          ${each ? step(eachRows.every(p => p.notice || p.paid), 'แจ้งชำระเงิน (ทีละบิล)',
            `แจ้งแล้ว ${fmtNum(eachRows.filter(p => p.notice).length)}/${fmtNum(eachRows.length)} บิล · ยืนยันรับเงินแล้ว ${fmtNum(eachRows.filter(p => p.paid).length)}/${fmtNum(eachRows.length)} บิล — ดูทีละบิลด้านล่าง`)
          : step(!!n?.at, 'แจ้งชำระเงิน', n?.at ? `${esc(fmtBaht(n.amount))} · ${esc(n.method)} · ${esc(thDate(n.date))}${
            n.slipUrl ? ` · <button class="linkish" type="button" data-slip="${esc(n.slipUrl)}" data-slip-name="${esc(n.slipName || '')}" title="ดาวน์โหลดไฟล์ที่ลูกค้าแนบ">📎 ${esc(n.slipName || 'สลิป')}</button>` : ''}${
            Math.abs((Number(n.amount) || 0) - (Number(b.total) || 0)) > 0.005 ? ' · <b style="color:var(--red)">ยอดไม่ตรงกับบิล</b>' : ''}${slipPreview(n)}` : '')}
        </ol>

        ${each ? `
        <h4 class="bill-h">ชำระทีละบิล</h4>
        <div class="scroll-x">
          <table class="tbl tbl-tight">
            <thead><tr><th>Invoice · ปลายทาง</th><th class="right">ยอด</th><th>ลูกค้าแจ้งชำระ</th><th>ฝั่งเรา</th></tr></thead>
            <tbody>${eachRows.map(({ it, k, notice: nt, paid }) => `<tr>
              <td><span class="code">${esc((it.invoices || []).join(', ') || it.code)}</span><span class="bill-meta">${esc(it.dests || '')}</span></td>
              <td class="right mono">${esc(fmtBaht(it.amount))}</td>
              <td class="small">${nt ? `${esc(nt.method)} · ${esc(thDate(nt.date))}${nt.slipUrl
                ? ` · <button class="linkish" type="button" data-slip="${esc(nt.slipUrl)}" data-slip-name="${esc(nt.slipName || '')}">📎 ${esc(nt.slipName || 'สลิป')}</button>` : ''}${slipPreview(nt)}`
                : '<span class="dim">ยังไม่แจ้ง</span>'}</td>
              <td class="small">${paid
                ? `<span style="color:var(--green)">✓ รับเงินแล้ว</span> ${esc(paid.method)} · ${esc(thDate(paid.date))}
                   ${edit && b.status !== 'cancelled' ? `<br><button class="linkish" type="button" data-do="unpayitem" data-k="${esc(k)}">ยกเลิกการยืนยัน</button>` : ''}`
                : edit && b.status === 'open' ? `<button class="btn btn-accent btn-sm" type="button" data-do="payitem" data-k="${esc(k)}">ยืนยันรับเงิน…</button>` : '<span class="dim">รอชำระ</span>'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : ''}

        <h4 class="bill-h">รายการ${unit}</h4>
        <div class="scroll-x">
          <table class="tbl tbl-tight">
            <thead><tr><th>วันที่</th><th>Shipment No.</th><th>ปลายทาง</th>${perBill ? '<th>Invoice</th>' : '<th class="right">จุดส่ง</th>'}<th class="right">จำนวนเงิน</th></tr></thead>
            <tbody>${(b.items || []).map(it => `<tr>
              <td>${esc(thDate(it.date))}</td><td class="code">${esc(it.code)}</td><td class="small">${esc(it.dests || '—')}</td>
              ${perBill ? `<td class="code">${esc((it.invoices || []).join(', ') || '—')}</td>` : `<td class="right mono">${fmtNum(it.stops)}</td>`}<td class="right mono">${esc(fmtBaht(it.amount))}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <p class="tiny dim" style="margin-top:10px">สร้างโดย ${esc(b.createdBy || '—')} · ${esc(thDateTime(b.createdAt))}${
          b.updatedAt && b.updatedAt !== b.createdAt ? ` · แก้ล่าสุด ${esc(b.updatedBy || '')} ${esc(thDateTime(b.updatedAt))}` : ''}</p>
      </div>`,
    foot: `
      ${edit && b.status === 'open' ? '<button class="btn btn-danger btn-sm" data-do="cancel">ยกเลิกใบวางบิล</button>' : ''}
      ${edit && b.status === 'paid' && !each ? '<button class="btn btn-ghost btn-sm" data-do="unpay">ยกเลิกการยืนยันรับเงิน</button>' : ''}
      <span class="grow"></span>
      <button class="btn btn-ghost" data-close>ปิด</button>
      ${edit && b.status === 'open' && !each ? '<button class="btn btn-accent" data-do="pay">ยืนยันรับเงิน…</button>' : ''}`,
    onMount(root){
      if (prevScroll) root.querySelector('.modal-body').scrollTop = prevScroll;
      root.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-do]');
        if (btn) billAction(btn.dataset.do, b, root, btn.dataset.k);
      });
    },
  });
  return scrim;
}

async function billAction(act, b, root, k){
  try{
    if (act === 'copy'){
      const input = root.querySelector('[data-url]');
      try{ await navigator.clipboard.writeText(input.value); toast('คัดลอกลิงก์แล้ว — ส่งให้ลูกค้าทางไลน์หรืออีเมลได้เลย', 'ok'); }
      catch{ input.select(); toast('กด Ctrl/Cmd + C เพื่อคัดลอกลิงก์', 'info'); }
      return;
    }
    if (act === 'toggle'){
      const on = b.linkActive === false;
      if (!on){
        const ok = await confirmDialog({ title:'ปิดลิงก์', message:'ลูกค้าจะเปิดใบวางบิลนี้ไม่ได้จนกว่าจะเปิดลิงก์อีกครั้ง', ok:'ปิดลิงก์', tone:'btn-danger' });
        if (!ok) return openBill(b.id);
      }
      await patchBill(b.id, { linkActive: on }, WHO);
      toast(on ? 'เปิดลิงก์อีกครั้งแล้ว' : 'ปิดลิงก์แล้ว', 'ok');
      return openBill(b.id);
    }
    if (act === 'renew'){
      const ok = await confirmDialog({ title:'เปลี่ยนเป็นลิงก์ใหม่',
        message:'ลิงก์เดิมจะใช้ไม่ได้ทันที (เช่น ส่งผิดคน) — ข้อมูลที่ลูกค้าตอบไว้ยังอยู่ครบ แล้วส่งลิงก์ใหม่ให้ลูกค้าอีกครั้ง', ok:'เปลี่ยนลิงก์' });
      if (!ok) return openBill(b.id);
      const id = await renewBillId(b, WHO);
      relink(b, { billId: id });
      billsById.delete(b.id);
      billsById.set(id, { ...b, id, linkActive: true });
      toast('เปลี่ยนลิงก์แล้ว — คัดลอกลิงก์ใหม่ส่งให้ลูกค้า', 'ok');
      return openBill(id);
    }
    if (act === 'pay') return payDialog(b);
    if (act === 'payitem') return payItemDialog(b, k);
    if (act === 'unpayitem'){
      const it = (b.items || [])[Number(k)];
      const ok = await confirmDialog({ title:'ยกเลิกการยืนยันรับเงินบิลนี้',
        message:`บิล ${(it?.invoices || [])[0] || it?.code || ''} จะกลับเป็นรอชำระ${b.status === 'paid' ? ` และใบ ${b.docNo} กลับเป็น "วางบิลแล้ว รอชำระ"` : ''}`,
        ok:'ยกเลิกการยืนยัน', tone:'btn-danger' });
      if (!ok) return openBill(b.id);
      const paidItems = { ...(b.paidItems || {}) };
      delete paidItems[k];
      await patchBill(b.id, { paidItems, status:'open', paid:null }, WHO);
      billsById.set(b.id, { ...b, paidItems, status:'open', paid:null });
      relinkItem(it, { paidAt:'', payMethod:'' });
      pushBill(b.id);
      toast('ยกเลิกการยืนยันรับเงินบิลนี้แล้ว', 'ok');
      return openBill(b.id);
    }
    if (act === 'unpay'){
      const ok = await confirmDialog({ title:'ยกเลิกการยืนยันรับเงิน',
        message:`ใบ ${b.docNo} จะกลับเป็น "วางบิลแล้ว รอชำระ" และ ${(b.items || []).length} รายการในใบกลับเป็นรอชำระ`, ok:'ยกเลิกการยืนยัน', tone:'btn-danger' });
      if (!ok) return openBill(b.id);
      await patchBill(b.id, { status:'open', paid:null }, WHO);
      relink(b, { paidAt:'', payMethod:'' });
      pushBill(b.id);
      toast('ยกเลิกการยืนยันรับเงินแล้ว', 'ok');
      return openBill(b.id);
    }
    if (act === 'cancel') return cancelDialog(b);
  }catch(err){ toast(err.message, 'err'); }
}

/* รายการเดียวในใบ — ใบรายบิลแก้ที่บิล · ใบรายเที่ยวเดิมแก้ที่เที่ยว */
function relinkItem(it, patch){
  if (!it) return;
  if (it.stopId && listShipments().some(x => x.id === it.stopId)) setStopBilling([it.stopId], patch, BY);
  else if (!it.stopId && listJobs().some(j => j.id === it.jobId)) setJobBilling([it.jobId], patch, BY);
}

/** ยืนยันรับเงินบิลเดียว (ลูกค้าเลือกแยกจ่าย) — ยอดล็อกเท่ายอดบิล · ครบทุกบิล = ใบชำระแล้ว */
function payItemDialog(b, k){
  const it = (b.items || [])[Number(k)];
  if (!it) return toast('ไม่พบบิลนี้ในใบ', 'err');
  const n = b.reply?.notices?.[k];
  const inv = (it.invoices || [])[0] || it.code || '';
  modal({
    title: `ยืนยันรับเงิน · บิล ${esc(inv)}`,
    body: `
      <p class="small" style="margin-top:0">ใบ ${esc(b.docNo)} · ${esc(it.dests || '')} · ยอด <b class="mono">${esc(fmtBaht(it.amount))}</b></p>
      ${n ? `<p class="small">ลูกค้าแจ้งชำระ ${esc(n.method)} · ${esc(thDate(n.date))}${
        n.slipUrl ? ` · <button class="linkish" type="button" data-slip="${esc(n.slipUrl)}" data-slip-name="${esc(n.slipName || '')}">📎 ${esc(n.slipName || 'สลิป')}</button>` : ''} — ตรวจกับบัญชีธนาคารก่อนยืนยัน</p>${slipPreview(n)}`
        : '<p class="small dim">ลูกค้ายังไม่ได้แจ้งชำระบิลนี้ผ่านลิงก์</p>'}
      <div class="bill-form">
        <label class="field"><span class="small strong">วันที่ได้รับเงิน</span>
          <input class="input" type="date" id="pDate" value="${esc(n?.date || todayYMD())}"></label>
        <label class="field"><span class="small strong">ช่องทาง</span>
          <select class="input" id="pMethod">${METHODS.map(m => `<option${(n?.method || METHODS[0]) === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="field span2"><span class="small strong">หมายเหตุ</span>
          <input class="input" id="pNote" maxlength="200" placeholder="เช่น เลขที่ใบเสร็จ"></label>
      </div>
      <p class="tiny dim" style="margin-top:10px">ยอดรับเท่ากับยอดบิล ${esc(fmtBaht(it.amount))} — ยังไม่รองรับการรับเงินไม่ครบ</p>`,
    foot: `<button class="btn btn-ghost" data-back>กลับ</button>
           <button class="btn btn-accent" data-ok>ยืนยันรับเงินบิลนี้</button>`,
    onMount(root){
      root.querySelector('[data-back]').onclick = () => openBill(b.id);
      root.querySelector('[data-ok]').onclick = async () => {
        const date = root.querySelector('#pDate').value;
        const method = root.querySelector('#pMethod').value;
        if (!date) return toast('ใส่วันที่ได้รับเงินก่อน', 'err');
        if (date < b.issueDate) return toast('วันที่ได้รับเงินอยู่ก่อนวันที่วางบิล', 'err');
        const btn = root.querySelector('[data-ok]');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
        try{
          const now = new Date().toISOString();
          const paidItems = { ...(b.paidItems || {}), [k]: {
            date, method, amount: Number(it.amount) || 0, note: root.querySelector('#pNote').value.trim(), at: now, by: WHO } };
          const patch = { paidItems };
          /* ครบทุกบิล = ใบชำระแล้ว — วันที่ = วันที่รับเงินบิลสุดท้าย · ช่องทางเดียวกันหมดใช้ช่องทางนั้น */
          const all = (b.items || []).every((_, i) => paidItems[String(i)]);
          if (all){
            const list = Object.values(paidItems);
            const methods = [...new Set(list.map(p => p.method))];
            patch.status = 'paid';
            patch.paid = { date: list.map(p => p.date).sort().pop(), method: methods.length === 1 ? methods[0] : methods.join(' / '),
              amount: Number(b.total) || 0, note: 'แยกจ่ายทีละบิล', at: now, by: WHO };
          }
          await patchBill(b.id, patch, WHO);
          billsById.set(b.id, { ...b, ...patch });   /* กดบิลถัดไปทันทีก็เห็นบิลนี้แล้ว ไม่ต้องรอข้อมูลจากคลาวด์ */
          relinkItem(it, { paidAt: date, payMethod: method });
          pushBill(b.id);
          toast(all ? `ยืนยันรับเงินครบทุกบิล — ใบ ${b.docNo} ชำระแล้ว` : `ยืนยันรับเงินบิล ${inv} แล้ว`, 'ok');
          openBill(b.id);
        }catch(err){
          toast(err.message, 'err');
          btn.disabled = false; btn.textContent = 'ยืนยันรับเงินบิลนี้';
        }
      };
    },
  });
}

function payDialog(b){
  const n = b.reply?.notice;
  modal({
    title: `ยืนยันรับเงิน · ${esc(b.docNo)}`,
    body: `
      ${n ? `<p class="small" style="margin-top:0">ลูกค้าแจ้งชำระ ${esc(fmtBaht(n.amount))} · ${esc(n.method)} · ${esc(thDate(n.date))}${
        n.slipUrl ? ` · <button class="linkish" type="button" data-slip="${esc(n.slipUrl)}" data-slip-name="${esc(n.slipName || '')}" title="ดาวน์โหลดไฟล์ที่ลูกค้าแนบ">📎 ${esc(n.slipName || 'สลิป')}</button>` : ''} — ตรวจกับบัญชีธนาคารก่อนยืนยัน</p>${slipPreview(n)}` : ''}
      <div class="bill-form">
        <label class="field"><span class="small strong">วันที่ได้รับเงิน</span>
          <input class="input" type="date" id="pDate" value="${esc(n?.date || todayYMD())}"></label>
        <label class="field"><span class="small strong">ช่องทาง</span>
          <select class="input" id="pMethod">${METHODS.map(m => `<option${(n?.method || METHODS[0]) === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="field"><span class="small strong">ยอดที่ได้รับ (บาท)</span>
          <input class="input tnum" type="number" id="pAmt" min="0" step="0.01" value="${esc(n?.amount ?? b.total)}"></label>
        <label class="field"><span class="small strong">หมายเหตุ</span>
          <input class="input" id="pNote" maxlength="200" placeholder="เช่น เลขที่ใบเสร็จ"></label>
      </div>
      <p class="tiny dim" style="margin-top:10px">ยอดบิล ${esc(fmtBaht(b.total))} · ยังไม่รองรับการรับเงินบางส่วน — ยอดต้องเท่ากับยอดบิล</p>`,
    foot: `<button class="btn btn-ghost" data-back>กลับ</button>
           <button class="btn btn-accent" data-ok>ยืนยันรับเงิน</button>`,
    onMount(root){
      root.querySelector('[data-back]').onclick = () => openBill(b.id);
      root.querySelector('[data-ok]').onclick = async () => {
        const date = root.querySelector('#pDate').value;
        const method = root.querySelector('#pMethod').value;
        const amount = Math.round(Number(root.querySelector('#pAmt').value) * 100) / 100;
        if (!date) return toast('ใส่วันที่ได้รับเงินก่อน', 'err');
        if (date < b.issueDate) return toast('วันที่ได้รับเงินอยู่ก่อนวันที่วางบิล', 'err');
        if (Math.abs(amount - (Number(b.total) || 0)) > 0.005) return toast(`ยอดที่ได้รับต้องเท่ากับยอดบิล ${fmtBaht(b.total)} — ยังไม่รองรับการรับเงินบางส่วน`, 'err');
        const btn = root.querySelector('[data-ok]');
        btn.disabled = true; btn.textContent = 'กำลังบันทึก…';
        try{
          await patchBill(b.id, { status:'paid', paid:{ date, method, amount, note: root.querySelector('#pNote').value.trim(), at: new Date().toISOString(), by: WHO } }, WHO);
          relink(b, { paidAt: date, payMethod: method });
          pushBill(b.id);
          toast(`ยืนยันรับเงิน ${b.docNo} แล้ว`, 'ok');
          openBill(b.id);
        }catch(err){
          toast(err.message, 'err');
          btn.disabled = false; btn.textContent = 'ยืนยันรับเงิน';
        }
      };
    },
  });
}

function cancelDialog(b){
  modal({
    title: `ยกเลิกใบวางบิล ${esc(b.docNo)}`,
    body: `
      <p class="small" style="margin-top:0">ลิงก์ของลูกค้าจะใช้ไม่ได้ และ ${fmtNum((b.items || []).length)} รายการในใบนี้จะกลับเป็น "${esc(BILL.NONE)}" (ค่าขนส่งยังอยู่) — ย้อนกลับไม่ได้</p>
      <label class="field"><span class="small strong">เหตุผล</span>
        <input class="input" id="cReason" maxlength="200" placeholder="เช่น ยอดผิด ออกใบใหม่แทน"></label>`,
    foot: `<button class="btn btn-ghost" data-back>ไม่ยกเลิก</button>
           <button class="btn btn-danger" data-ok>ยกเลิกใบวางบิล</button>`,
    onMount(root){
      root.querySelector('[data-back]').onclick = () => openBill(b.id);
      root.querySelector('[data-ok]').onclick = async () => {
        const btn = root.querySelector('[data-ok]');
        btn.disabled = true;
        try{
          await patchBill(b.id, { status:'cancelled', linkActive:false,
            cancel:{ reason: root.querySelector('#cReason').value.trim(), at: new Date().toISOString(), by: WHO } }, WHO);
          relink(b, { docNo:'', billedAt:'', paidAt:'', billId:'', dueDate:'', payMethod:'' });
          pushBill(b.id);
          toast(`ยกเลิกใบวางบิล ${b.docNo} แล้ว`, 'ok');
          close();
          paint();
        }catch(err){
          toast(err.message, 'err');
          btn.disabled = false;
        }
      };
    },
  });
}

/* ---------- รูปสลิปที่ลูกค้าแนบ — โชว์ในหน้าต่างเลย ไม่ต้องดาวน์โหลดก่อน · PDF ยังเป็นลิงก์ดาวน์โหลด ---------- */
const isPdfSlip = (n) => /\.pdf($|\?)/i.test(n.slipName || '') || /\.pdf(\?|$)/i.test(decodeURIComponent(String(n.slipUrl || '').split('?')[0]));
function slipPreview(n){
  if (!n?.slipUrl || isPdfSlip(n)) return '';
  return `<span class="bill-slip"><img src="${esc(n.slipUrl)}" alt="หลักฐานการโอน" loading="lazy" data-slip-zoom
    title="กดเพื่อขยาย / ย่อ" onerror="this.closest('.bill-slip').remove()"></span>`;
}
document.addEventListener('click', (e) => {
  const img = e.target.closest('[data-slip-zoom]');
  if (img) img.closest('.bill-slip').classList.toggle('is-big');
});

/* ---------- ดาวน์โหลดสลิปที่ลูกค้าแนบ (หน้าต่างใบ + หน้าต่างยืนยันรับเงิน) ---------- */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-slip]');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try{
    await downloadSlip(btn.dataset.slip, btn.dataset.slipName);
    toast(`กำลังดาวน์โหลด ${btn.dataset.slipName || 'สลิป'}`, 'ok', 2200);
  }catch(err){
    console.error('[billing] ดาวน์โหลดสลิปไม่ได้', err);
    window.open(btn.dataset.slip, '_blank', 'noopener');
    toast('ดาวน์โหลดตรงไม่ได้ — เปิดไฟล์ในแท็บใหม่แทน (คลิกขวา → บันทึกรูปภาพ)', 'err');
  }finally{ btn.disabled = false; }
});

/* ---------- ส่งออก Excel ---------- */
$('#exportBtn').addEventListener('click', async () => {
  const list = billScope().filter((BTABS.find(t => t.key === btab) || BTABS[0]).test);
  if (!list.length) return toast('ไม่มีใบวางบิลให้ส่งออกในแท็บนี้', 'err');
  const btn = $('#exportBtn');
  btn.disabled = true;
  try{
    const XLSX = await loadXLSX();
    const d = (s) => s ? new Date(`${String(s).slice(0, 10)}T00:00:00`) : '';
    const head = list.map(b => {
      const r = b.reply || {}, n = r.notice || {};
      return {
        'เลขที่ใบวางบิล': b.docNo, 'วันที่วางบิล': d(b.issueDate), 'ลูกค้า': b.billTo?.name || '',
        'เลขผู้เสียภาษีลูกค้า': b.billTo?.taxId || '', 'จำนวนเที่ยว': (b.items || []).length, 'ยอดเงิน (บาท)': Number(b.total) || 0,
        'เครดิต (วัน)': b.creditDays || 0, 'ครบกำหนด': d(b.dueDate), 'ฝั่งเรา': ourState(b).label, 'ฝั่งลูกค้า': custState(b).label,
        'เกินกำหนด (วัน)': overdueDays(b) || '', 'ผู้รับบิล': r.receivedBy || '', 'วันที่รับบิล': r.receivedAt ? d(r.receivedAt.slice(0, 10)) : '',
        'วันนัดชำระ': d(r.promiseDate), 'แจ้งชำระ: วันที่': d(n.date), 'แจ้งชำระ: ช่องทาง': n.method || '', 'แจ้งชำระ: ยอด': n.amount ?? '',
        'สลิป': n.slipUrl || '', 'รับเงิน: วันที่': d(b.paid?.date), 'รับเงิน: ช่องทาง': b.paid?.method || '', 'รับเงิน: ยอด': b.paid?.amount ?? '',
        'หมายเหตุ': [b.note, b.cancel?.reason ? `ยกเลิก: ${b.cancel.reason}` : ''].filter(Boolean).join(' · '),
      };
    });
    const lines = list.flatMap(b => (b.items || []).map(it => ({
      'เลขที่ใบวางบิล': b.docNo, 'ลูกค้า': b.billTo?.name || '', 'สถานะ': ourState(b).label,
      'วันที่': d(it.date), 'Shipment No.': it.code, 'รถ': it.vehicle || '', 'ปลายทาง': it.dests || '',
      'จุดส่ง': it.stops || 0, 'Invoice': (it.invoices || []).join(', '), 'จำนวนเงิน (บาท)': Number(it.amount) || 0,
    })));
    const wb = XLSX.utils.book_new();
    const sheet = (rows, widths) => {
      const ws = XLSX.utils.json_to_sheet(rows, { cellDates:true, dateNF:'dd/mm/yyyy' });
      ws['!cols'] = widths.map(w => ({ wch:w }));
      return ws;
    };
    XLSX.utils.book_append_sheet(wb, sheet(head, [16, 12, 30, 16, 10, 14, 10, 12, 18, 22, 12, 20, 12, 12, 12, 12, 12, 30, 12, 12, 12, 30]), 'ใบวางบิล');
    XLSX.utils.book_append_sheet(wb, sheet(lines, [16, 30, 18, 12, 16, 14, 40, 8, 40, 14]), 'รายการเที่ยว');
    const range = bFrom || bTo ? `${bFrom || 'ต้น'}_ถึง_${bTo || todayYMD()}` : todayYMD();
    XLSX.writeFile(wb, `ใบวางบิล_${range}.xlsx`);
    toast(`ส่งออก ${fmtNum(list.length)} ใบแล้ว`, 'ok');
  }catch(err){
    console.error('[billing] ส่งออก Excel ไม่สำเร็จ', err);
    toast('ส่งออก Excel ไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่', 'err');
  }finally{ btn.disabled = false; }
});

initCosts(() => view === 'costs');
subscribe(() => (view === 'trips' ? paint() : view === 'costs' ? paintCosts() : paintBills()));
setToday(false);
setView(view);
