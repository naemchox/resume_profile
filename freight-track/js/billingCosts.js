/* ============================================================
   billingCosts.js — แท็บ "ค่าใช้จ่าย" ในหน้ารายได้ · วางบิล (26 ต.ค. 2026)

   รายชื่อคนขับทั้งหมด + ยอดที่แต่ละคนได้ในช่วงวันที่ที่เลือก (วันที่ออกเดินทางของเที่ยว)
   แตะชื่อ = กาง/พับ การ์ดเที่ยว (แบบหน้าคนขับ) แต่ละใบบอกยอดที่คนนั้นได้จากเที่ยวนั้น
   ยอดมาจากค่ารอบรายคนที่กรอกในหน้าหลังบ้าน (job.pay.drivers) — ดูอย่างเดียว แก้ที่หน้าหลังบ้าน
   ค่ารอบแบบเก่าที่ยังไม่แยกคน (pay.base / pay.items) แสดงเป็นแถว "ยังไม่ระบุคนขับ" ยอดรวมจะได้ตรงกับยอดจริง

   จ่ายค่ารอบ (26 ต.ค. 2026): ติ๊กเลือกเที่ยวของคนขับ (หลายคนได้) → แถบรวมยอด → "จ่ายเงิน" = การ์ดทีละคน
   ยอด + ชื่อธนาคาร + เลขบัญชีจากชีตคนขับ (F/G ผ่าน Apps Script — ไม่อยู่ในฐานข้อมูล) ให้โอนเอง
   → "ยืนยันจ่ายแล้ว" = store.markRoundPaid · เลิกใช้ QR แล้ว (ผู้ใช้สั่ง 26 ต.ค.)
   จ่ายแล้วยังติ๊กได้แต่ไม่นับในยอดที่จะจ่าย · admin ยกเลิกได้ (unmarkRoundPaid) · แก้ค่ารอบหลังจ่าย = เตือนยอดไม่ตรง
   ============================================================ */

import { $, esc, toast, modal, confirmDialog } from './ui.js';
import { listJobs, listDrivers, getDriver, driverName, payRowsOf, fmtBaht, fmtNum, fmtDate, fmtDateTime,
         paidOf, markRoundPaid, unmarkRoundPaid, driverFleet, FLEET_OWN } from './store.js';
import { getSession, canWrite } from './auth.js';
import { isAdmin } from './access.js';
import { fetchSheetRows } from './driverSheet.js';
import { loadUI, saveUI, debounce } from './uiState.js';
import { loadXLSX } from './xlsxImport.js';

const NONE = '__none';          /* แถวค่ารอบที่ยังไม่ระบุคนขับ */
const UI = loadUI('billingCosts');
const KEEP_KEY = 'ft.billing.costRange';
const KEEP = (() => { try{ return JSON.parse(localStorage.getItem(KEEP_KEY) || '{}') || {}; }catch{ return {}; } })();
const keep = (patch) => { Object.assign(KEEP, patch); try{ localStorage.setItem(KEEP_KEY, JSON.stringify(KEEP)); }catch{} };

const todayYMD = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const dateOf = (j) => String(j?.serviceDate || j?.createdAt || '').slice(0, 10);
const money = (v) => { const n = Number(String(v ?? '').replace(/[, ]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0; };
const sum = (rows) => (rows || []).reduce((a, r) => a + money(r.amount), 0);

let from = KEEP.from || '', to = KEEP.to || '', onlyToday = !!KEEP.onlyToday;
const chosen = { from, to };
let q = UI.q || '';
const open = new Set(UI.open || []);
let shown = [];
let active = () => false;
/* เที่ยวที่ติ๊กไว้ — picked: driverId → Set(jobId) · อยู่ในหน้านี้อย่างเดียว รีเฟรชแล้วล้าง */
const picked = new Map();
const isPicked = (did, jid) => !!picked.get(did)?.has(jid);
const BY = () => { const s = getSession(); return { byRole:'ops', byName: s.staff?.name || s.staff?.email || 'ฝ่ายบัญชี' }; };

/** ค่ารอบเก่าที่ยังไม่แยกคน — โครงเดิม pay.base + pay.items */
const legacyRows = (pay) => [
  ...(money(pay?.base) ? [{ amount: pay.base, note: 'ค่ารอบ (ยังไม่ระบุคนขับ)' }] : []),
  ...(pay?.items || []),
].filter(r => money(r.amount));

/* ประเภทค่าใช้จ่าย — แบบเดียวกับชีตรวม (AppsScript-master.gs rowCat_):
   โน้ตมี "น้ำมัน" / "ทางด่วน" / "ค่ารอบ" ตามนั้น · บรรทัดแรกที่ไม่มีคำพวกนี้ = ค่ารอบ · ที่เหลือ = อื่น ๆ (ใช้โน้ตเป็นชื่อ) */
const CATS = [['round', 'ค่ารอบ'], ['fuel', 'ค่าน้ำมัน'], ['toll', 'ค่าทางด่วน'], ['other', 'อื่น ๆ']];
function catOf(r, first){
  const n = String(r.note || '');
  if (/น้ำมัน/.test(n)) return 'fuel';
  if (/ทางด่วน/.test(n)) return 'toll';
  if (/ค่ารอบ/.test(n)) return 'round';
  return first ? 'round' : 'other';
}
/** แยกบรรทัดค่ารอบเป็นรายการที่โชว์ได้ [{ cat, label, amount }] — อื่น ๆ ใช้โน้ตเป็นชื่อ */
function breakdown(rows){
  return (rows || []).filter(r => money(r.amount)).map((r, i) => {
    const cat = catOf(r, i === 0);
    const note = String(r.note || '').trim();
    return { cat, label: cat === 'other' ? (note || 'อื่น ๆ') : CATS.find(c => c[0] === cat)[1], note, amount: money(r.amount) };
  });
}
const catSum = (rows, cat) => breakdown(rows).filter(b => b.cat === cat).reduce((a, b) => a + b.amount, 0);

/** คนขับทุกคน + ยอดในช่วง → [{ id, name, sub, trips:[{ j, rows, total }], total }] */
function scope(){
  const inRange = (j) => (!from || dateOf(j) >= from) && (!to || dateOf(j) <= to);
  const jobs = listJobs().filter(j => j.status !== 'cancelled' && inRange(j))
    .sort((a, b) => dateOf(b).localeCompare(dateOf(a)) || String(b.code).localeCompare(String(a.code)));
  const by = new Map();
  const add = (id, j, rows) => {
    if (!by.has(id)) by.set(id, []);
    by.get(id).push({ j, rows, total: sum(rows) });
  };
  for (const j of jobs){
    const ids = new Set([...(j.driverIds || []), ...(j.driverId ? [j.driverId] : []), ...Object.keys(j.pay?.drivers || {})]);
    ids.forEach(id => add(id, j, payRowsOf(j.pay, id)));
    const old = legacyRows(j.pay);
    if (old.length) add(NONE, j, old);
  }
  const drivers = listDrivers().filter(d => !d.removed);
  const known = new Set(drivers.map(d => d.id));
  const out = drivers
    .filter(d => d.active !== false || by.has(d.id))
    .map(d => ({ id: d.id, name: driverName(d), sub: [d.plate, d.phone].filter(Boolean).join(' · '), fleet: driverFleet(d), trips: by.get(d.id) || [] }));
  /* คนขับที่ถูกลบไปแล้วแต่ยังมีค่ารอบในช่วงนี้ */
  [...by.keys()].filter(id => id !== NONE && !known.has(id))
    .forEach(id => out.push({ id, name: driverName(getDriver(id)) || `คนขับรหัส ${id}`, sub: 'ไม่มีในรายชื่อแล้ว', fleet: FLEET_OWN, trips: by.get(id) }));
  if (by.has(NONE)) out.push({ id: NONE, name: 'ยังไม่ระบุคนขับ', sub: 'ค่ารอบแบบเก่า — แบ่งให้คนขับได้ที่หน้าหลังบ้าน', trips: by.get(NONE) });
  out.forEach(d => { d.total = d.trips.reduce((a, t) => a + t.total, 0); });
  const t = q.trim().toLowerCase();
  return out
    .filter(d => !t || `${d.name} ${d.sub}`.toLowerCase().includes(t))
    .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name), 'th'));
}

const kpi = (label, value, foot, accent) => `
    <div class="kpi" data-accent="${accent}">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value" style="font-size:22px">${esc(value)}</div>
      <div class="kpi-foot">${esc(foot)}</div>
    </div>`;

/** การ์ดเที่ยว (หน้าตาแบบหน้าคนขับ) — มุมขวาเป็นยอดที่คนขับคนนี้ได้แทนสถานะ */
function tripCard({ j, rows, total }, did){
  /* คนขับได้ค่าอะไรบ้าง — บรรทัดละรายการ (โน้ตที่กรอกต่อท้ายถ้าไม่ซ้ำกับชื่อ) */
  const items = breakdown(rows);
  const detail = items.length ? `
      <ul class="cost-items">${items.map(b => `
        <li><span>${esc(b.label)}${b.note && b.note !== b.label && b.cat !== 'other' ? ` <span class="dim">· ${esc(b.note)}</span>` : ''}</span>
          <b class="mono">${esc(fmtBaht(b.amount))}</b></li>`).join('')}
      </ul>` : '';
  const paid = did !== NONE ? paidOf(j.pay, did) : null;
  const canPick = did !== NONE && (total || paid);
  const admin = isAdmin(getSession().staff);
  const paidBox = paid ? `
      <div class="cost-paid">
        <span>✓ จ่ายแล้ว <b class="mono">${esc(fmtBaht(paid.amount))}</b> · ${esc(fmtDateTime(paid.at))} · ${esc(paid.by || '—')}</span>
        ${admin ? `<button type="button" class="btn btn-ghost btn-sm" data-unpay="${esc(did)}|${esc(j.id)}">ยกเลิกการจ่าย</button>` : ''}
        ${Math.abs(paid.amount - total) > 0.004 ? `<span class="cost-paid-warn">⚠ ยอดตอนนี้ ${esc(fmtBaht(total))} ไม่ตรงกับที่จ่าย (ต่าง ${esc(fmtBaht(total - paid.amount))})</span>` : ''}
      </div>` : '';
  return `
  <div class="job-card cost-card${paid ? ' is-paid' : ''}${isPicked(did, j.id) ? ' is-picked' : ''}">
    <div class="row between gap-8">
      <span class="row gap-8" style="align-items:center">
        ${canPick ? `<input type="checkbox" class="cost-check" data-pick="${esc(did)}|${esc(j.id)}"${isPicked(did, j.id) ? ' checked' : ''} aria-label="เลือกเที่ยว ${esc(j.code || '')}">` : ''}
        <span class="code">เที่ยว ${esc(j.code || '—')}</span>
      </span>
      <span class="mono strong cost-amt${total ? '' : ' dim'}">${total ? esc(fmtBaht(total)) : 'ยังไม่กรอกค่ารอบ'}</span>
    </div>
    <div style="margin-top:8px">
      <div class="strong">${fmtNum(j.stops)} จุดส่ง · ${fmtNum(j.dests)} ปลายทาง</div>
      <div class="tiny dim">${esc(fmtDate(dateOf(j)))} · ${esc(j.vehicle || '—')} · ${fmtNum(Math.round(j.weightKg || 0))} กก.</div>
      ${detail}
    </div>
    ${paidBox}
  </div>`;
}

/** ยอดที่ติ๊กไว้ของคนขับหนึ่งคน — จ่ายแล้วไม่นับ */
function pickOf(d){
  const set = picked.get(d.id);
  const trips = d.trips.filter(t => set?.has(t.j.id));
  const due = trips.filter(t => !paidOf(t.j.pay, d.id) && t.total > 0);
  return { trips, due, paidN: trips.length - due.length, amount: due.reduce((a, t) => a + t.total, 0) };
}

/** แถบในการ์ดคนขับ — เลือกทั้งหมด + ยอดที่เลือก */
function selBar(d){
  if (d.id === NONE) return '';
  const can = d.trips.filter(t => t.total || paidOf(t.j.pay, d.id));
  if (!can.length) return '';
  const p = pickOf(d);
  const all = can.every(t => isPicked(d.id, t.j.id));
  return `
      <div class="cost-sel">
        <label><input type="checkbox" data-pickall="${esc(d.id)}"${all ? ' checked' : ''}> เลือกทั้งหมด ${fmtNum(can.length)} เที่ยว</label>
        <span class="tiny">${p.trips.length
          ? `เลือก ${fmtNum(p.trips.length)} เที่ยว · ต้องจ่าย <b class="mono">${esc(fmtBaht(p.amount))}</b>${p.paidN ? ` · จ่ายแล้ว ${fmtNum(p.paidN)} เที่ยว (ไม่นับ)` : ''}`
          : 'ติ๊กเที่ยวที่จะจ่าย'}</span>
      </div>`;
}

/** แถบบนสุด — รวมทุกคนที่ติ๊กไว้ + ปุ่มจ่ายเงิน */
function payBar(list){
  const sel = list.map(d => ({ d, p: pickOf(d) })).filter(x => x.p.trips.length);
  if (!sel.length) return '';
  const due = sel.filter(x => x.p.amount > 0);
  const total = due.reduce((a, x) => a + x.p.amount, 0);
  return `
    <div class="cost-paybar">
      <span class="grow">เลือก ${fmtNum(sel.length)} คน · ${fmtNum(sel.reduce((a, x) => a + x.p.trips.length, 0))} เที่ยว ·
        ต้องจ่าย <b class="mono">${esc(fmtBaht(total))}</b>${due.length < sel.length ? ` <span class="tiny dim">(${fmtNum(sel.length - due.length)} คนจ่ายครบแล้ว)</span>` : ''}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-pickclear>ล้างที่เลือก</button>
      <button type="button" class="btn btn-accent btn-sm" data-payqr${due.length ? '' : ' disabled title="งานที่เลือกจ่ายครบแล้ว"'}>จ่ายเงิน${due.length > 1 ? ` (${fmtNum(due.length)} คน)` : ''}</button>
    </div>`;
}

export function paintCosts(){
  if (!active()) return;
  const list = scope();
  shown = list;
  const all = list.reduce((a, d) => a + d.total, 0);
  const withWork = list.filter(d => d.trips.length && d.id !== NONE).length;
  const trips = new Set(list.flatMap(d => d.trips.map(t => t.j.id))).size;
  const unpaid = new Set(list.flatMap(d => d.trips.filter(t => !t.total && d.id !== NONE).map(t => t.j.id))).size;
  $('#costKpis').innerHTML = [
    kpi('ยอดรวมคนขับทุกคน', fmtBaht(all), from || to ? `${from ? fmtDate(from) : 'ต้น'} – ${to ? fmtDate(to) : 'ล่าสุด'}` : 'ทุกวัน', 'violet'),
    kpi('คนขับที่มีงาน', `${fmtNum(withWork)} คน`, `จากทั้งหมด ${fmtNum(list.filter(d => d.id !== NONE).length)} คน`, 'blue'),
    kpi('จำนวนเที่ยว', `${fmtNum(trips)} เที่ยว`, unpaid ? `ยังไม่กรอกค่ารอบ ${fmtNum(unpaid)} เที่ยว` : 'กรอกค่ารอบครบแล้ว', 'amber'),
    kpi('เฉลี่ยต่อเที่ยว', trips ? fmtBaht(all / trips) : '—', 'ยอดรวม ÷ จำนวนเที่ยว', 'green'),
  ].join('');

  /* แบ่งกลุ่มแบบหน้าข้อมูลคนขับ: รถประจำ · รถนอก · ยังไม่ระบุคนขับ (ค่ารอบแบบเก่า) ไว้ล่างสุด */
  const groups = [
    { label:'คนขับรถประจำ',    list: list.filter(d => d.id !== NONE && d.fleet === FLEET_OWN) },
    { label:'คนขับรถนอก',      list: list.filter(d => d.id !== NONE && d.fleet !== FLEET_OWN) },
    { label:'ยังไม่ระบุคนขับ', list: list.filter(d => d.id === NONE) },
  ].filter(g => g.list.length);
  $('#costRows').innerHTML = payBar(list) + groups.map(g => `
    <section class="cost-fleet">
      <h3 class="fleet-head cost-fleet-head"><span class="grow">${esc(g.label)} <span class="cnt">${fmtNum(g.list.length)}</span></span>
        <span class="mono cost-total">${esc(fmtBaht(g.list.reduce((a, d) => a + d.total, 0)))}</span></h3>
      ${g.list.map(drvRow).join('')}
    </section>`).join('');
  $('#costEmpty').innerHTML = list.length ? '' : '<div class="empty"><div class="empty-mark">฿</div>ไม่พบคนขับ</div>';
}

function drvRow(d){
    const isOpen = open.has(d.id);
    return `
    <div class="cost-drv${isOpen ? ' is-open' : ''}">
      <button class="cost-head" type="button" data-cost-open="${esc(d.id)}" aria-expanded="${isOpen}">
        <span class="grow" style="min-width:0;text-align:left">
          <span class="strong" style="display:block">${esc(d.name)}</span>
          <span class="tiny dim">${d.sub ? `${esc(d.sub)} · ` : ''}${fmtNum(d.trips.length)} เที่ยว</span>
        </span>
        ${pickOf(d).trips.length ? `<span class="tiny strong cost-picked">เลือก ${fmtNum(pickOf(d).trips.length)} เที่ยว</span>` : ''}
        <span class="mono strong cost-total${d.total ? '' : ' dim'}">${esc(fmtBaht(d.total))}</span>
        <span class="tiny strong cost-toggle">${d.trips.length ? (isOpen ? '▴' : 'ดูงาน ▾') : ''}</span>
      </button>
      ${isOpen && d.trips.length ? `<div class="cost-body">${selBar(d)}${d.trips.map(t => tripCard(t, d.id)).join('')}
        <a class="tiny" href="ops.html" style="display:inline-block;margin-top:2px">แก้ค่ารอบที่หน้าหลังบ้าน →</a></div>` : ''}
    </div>`;
}

function setToday(on){
  onlyToday = on;
  keep({ onlyToday: on });
  if (on){ from = to = todayYMD(); }
  else { from = chosen.from; to = chosen.to; }
  $('#cOnlyToday').checked = on;
  ['#cFrom', '#cTo'].forEach(s => { $(s).disabled = on; });
  $('#cFrom').value = from; $('#cTo').value = to;
  paintCosts();
}

/** ผูกตัวกรอง/ปุ่ม — isActive() = แท็บนี้เปิดอยู่ไหม */
export function initCosts(isActive){
  active = isActive;
  $('#cq').value = q;
  const rememberQ = debounce((v) => saveUI('billingCosts', { q: v }), 300);
  $('#cq').addEventListener('input', (e) => { q = e.target.value; rememberQ(q); paintCosts(); });
  $('#cFrom').addEventListener('change', (e) => { from = chosen.from = e.target.value; keep({ from }); paintCosts(); });
  $('#cTo').addEventListener('change', (e) => { to = chosen.to = e.target.value; keep({ to }); paintCosts(); });
  $('#cOnlyToday').addEventListener('change', (e) => setToday(e.target.checked));
  $('#costRows').addEventListener('change', (e) => {
    const one = e.target.closest('[data-pick]');
    const all = e.target.closest('[data-pickall]');
    if (one){
      const [did, jid] = one.dataset.pick.split('|');
      if (!picked.has(did)) picked.set(did, new Set());
      one.checked ? picked.get(did).add(jid) : picked.get(did).delete(jid);
      paintCosts();
    } else if (all){
      const d = shown.find(x => x.id === all.dataset.pickall);
      if (!d) return;
      const ids = d.trips.filter(t => t.total || paidOf(t.j.pay, d.id)).map(t => t.j.id);
      picked.set(d.id, new Set(all.checked ? ids : []));
      paintCosts();
    }
  });
  $('#costRows').addEventListener('click', (e) => {
    if (e.target.closest('[data-pickclear]')){ picked.clear(); return paintCosts(); }
    if (e.target.closest('[data-payqr]')) return payDialog();
    const un = e.target.closest('[data-unpay]');
    if (un) return unpay(...un.dataset.unpay.split('|'));
    const b = e.target.closest('[data-cost-open]');
    if (!b) return;
    const id = b.dataset.costOpen;
    open.has(id) ? open.delete(id) : open.add(id);
    saveUI('billingCosts', { open: [...open] });
    paintCosts();
  });
  $('#costExport').addEventListener('click', exportCosts);
  setToday(onlyToday);
}

/* ---------- จ่ายค่ารอบ: ยอด + เลขบัญชี ทีละคน + ยืนยัน ---------- */
/** เลขบัญชี/ธนาคารของคนขับ — จากชีต (Apps Script roster) ก่อน ไม่ได้ค่อยใช้ที่เก็บในเครื่องนี้ */
async function bankOf(ids){
  let rows = [];
  try{ rows = await fetchSheetRows(); }catch(err){ console.warn('[billing] อ่านเลขบัญชีจากชีตไม่ได้', err); }
  const out = {};
  for (const id of ids){
    const d = getDriver(id) || {};
    const r = rows.find(x => d.sheetId && x.id === String(d.sheetId)) || rows.find(x => x.name === d.name);
    out[id] = { account: r?.bankAccount || d.bankAccount || '', bankName: r?.bankName || d.bankName || '' };
  }
  return out;
}

async function payDialog(){
  const sel = shown.map(d => ({ d, p: pickOf(d) })).filter(x => x.p.amount > 0);
  if (!sel.length) return toast('งานที่เลือกจ่ายครบแล้ว', 'warn');
  modal({ title: 'จ่ายค่ารอบ', wide: true, body: '<p class="muted">กำลังดึงเลขบัญชีจากชีตคนขับ…</p>' });
  const bank = await bankOf(sel.map(x => x.d.id));
  const cards = sel.map(({ d, p }) => ({ d, p, b: bank[d.id] }));
  if (!document.querySelector('.scrim')) return;     /* ปิดหน้าต่างไประหว่างรอ */
  modal({
    title: `จ่ายค่ารอบ · ${fmtNum(cards.length)} คน`,
    wide: true,
    body: `
<p class="tiny dim" style="margin:0 0 12px">โอนตามยอดและเลขบัญชีด้านล่าง · โอนเสร็จแล้วกด <b>ยืนยันจ่ายแล้ว</b> เที่ยวเหล่านี้จะล็อกไม่ให้จ่ายซ้ำ</p>
<div class="pay-qr-list">${cards.map(c => `
  <div class="pay-qr-card" data-qrcard="${esc(c.d.id)}">
    <div class="strong">${esc(c.d.name)}</div>
    <div class="tiny dim">${fmtNum(c.p.due.length)} เที่ยว · ${c.p.due.map(t => esc(t.j.code || '—')).join(', ')}</div>
    <div class="pay-qr-amt mono">${esc(fmtBaht(c.p.amount))}</div>
    <div class="pay-bank">
      <div class="pay-bank-name">${c.b.bankName ? esc(c.b.bankName) : '<span class="pay-qr-err">⚠ ยังไม่มีชื่อธนาคาร (ชีตคนขับ ช่อง G)</span>'}</div>
      <div class="pay-bank-acct mono">${c.b.account ? esc(c.b.account) : '<span class="pay-qr-err">⚠ ยังไม่มีเลขที่บัญชี (ชีตคนขับ ช่อง F)</span>'}</div>
      ${c.b.account ? `<button type="button" class="btn btn-ghost btn-sm" data-copyacct="${esc(c.b.account)}">คัดลอกเลขบัญชี</button>` : ''}
    </div>
    <button type="button" class="btn btn-accent" data-paid="${esc(c.d.id)}" style="margin-top:10px;width:100%">ยืนยันจ่ายแล้ว ${esc(fmtBaht(c.p.amount))}</button>
  </div>`).join('')}
</div>`,
    foot: '<button class="btn btn-ghost" data-close>ปิด</button>',
    onMount(root){
      root.addEventListener('click', async (e) => {
        const cp = e.target.closest('[data-copyacct]');
        if (cp){
          try{ await navigator.clipboard.writeText(cp.dataset.copyacct.replace(/\D/g, '')); toast('คัดลอกเลขบัญชีแล้ว', 'ok'); }
          catch{ toast('คัดลอกไม่ได้ — จดเลขเอง', 'warn'); }
          return;
        }
        const btn = e.target.closest('[data-paid]');
        if (!btn) return;
        if (!canWrite()) return toast('บัญชีนี้ดูได้อย่างเดียวในหน้านี้ — ต้องการแก้ไข ติดต่อ admin', 'err');
        const c = cards.find(x => x.d.id === btn.dataset.paid);
        /* หน้าต่างยืนยันจะปิดหน้าต่างจ่ายเงิน — ถามในปุ่มเองแทน (กดสองครั้ง) */
        if (!btn.dataset.sure){
          btn.dataset.sure = '1';
          btn.textContent = `แตะอีกครั้งเพื่อยืนยัน — โอน ${fmtBaht(c.p.amount)} ให้ ${c.d.name} แล้ว`;
          btn.classList.add('btn-green');
          return;
        }
        try{
          const r = markRoundPaid(c.p.due.map(t => ({ jobId: t.j.id, driverId: c.d.id })), BY());
          toast(`บันทึกจ่าย ${fmtBaht(r.total)} ให้ ${c.d.name} แล้ว (${fmtNum(r.count)} เที่ยว)`, 'ok');
          btn.disabled = true;
          btn.textContent = '✓ ยืนยันจ่ายแล้ว';
          root.querySelector(`[data-qrcard="${CSS.escape(c.d.id)}"]`)?.classList.add('is-done');
        }catch(err){ toast(err.message, 'err'); }
      });
    },
  });
}

async function unpay(did, jid){
  if (!isAdmin(getSession().staff)) return toast('ยกเลิกการจ่ายได้เฉพาะ admin', 'err');
  const j = listJobs().find(x => x.id === jid);
  const p = paidOf(j?.pay, did);
  if (!p) return;
  const ok = await confirmDialog({
    title: 'ยกเลิกการจ่าย',
    message: `เที่ยว ${j.code} · ${driverName(getDriver(did)) || 'คนขับ'} · ${fmtBaht(p.amount)} (จ่ายเมื่อ ${fmtDateTime(p.at)} โดย ${p.by}) — ยกเลิกแล้วเที่ยวนี้จะกลับมาจ่ายได้อีก บันทึกลงประวัติเที่ยวด้วย`,
    ok: 'ยกเลิกการจ่าย', tone: 'btn-danger',
  });
  if (!ok) return;
  try{ unmarkRoundPaid(jid, did, BY()); toast('ยกเลิกการจ่ายแล้ว', 'ok'); }
  catch(err){ toast(err.message, 'err'); }
}

async function exportCosts(){
  const list = shown.filter(d => d.trips.length);
  if (!list.length) return toast('ไม่มีค่ารอบในช่วงที่เลือก', 'err');
  const btn = $('#costExport');
  btn.disabled = true;
  try{
    const XLSX = await loadXLSX();
    const d = (s) => s ? new Date(`${String(s).slice(0, 10)}T00:00:00`) : '';
    const sumRows = list.map(x => ({ 'คนขับ': x.name, 'ทะเบียน · เบอร์': x.sub, 'จำนวนเที่ยว': x.trips.length, 'ยอดรวม (บาท)': x.total }));
    sumRows.push({ 'คนขับ': 'รวมทุกคน', 'ทะเบียน · เบอร์': '', 'จำนวนเที่ยว': '', 'ยอดรวม (บาท)': list.reduce((a, x) => a + x.total, 0) });
    const lines = list.flatMap(x => x.trips.map(t => ({
      'คนขับ': x.name, 'วันที่': d(dateOf(t.j)), 'เที่ยว': t.j.code || '', 'ทะเบียน': t.j.vehicle || '',
      'จุดส่ง': t.j.stops || 0,
      ...Object.fromEntries(CATS.map(([k, label]) => [label, catSum(t.rows, k) || ''])),
      'รายละเอียดอื่น ๆ': breakdown(t.rows).filter(b => b.cat === 'other').map(b => `${b.label} ${b.amount}`).join(', '),
      'ยอด (บาท)': t.total,
      'จ่ายแล้ว (บาท)': paidOf(t.j.pay, x.id)?.amount ?? '',
      'วันที่จ่าย': paidOf(t.j.pay, x.id) ? fmtDateTime(paidOf(t.j.pay, x.id).at) : '',
    })));
    const wb = XLSX.utils.book_new();
    const sheet = (rows, widths) => {
      const ws = XLSX.utils.json_to_sheet(rows, { cellDates:true, dateNF:'dd/mm/yyyy' });
      ws['!cols'] = widths.map(w => ({ wch:w }));
      return ws;
    };
    XLSX.utils.book_append_sheet(wb, sheet(sumRows, [32, 26, 12, 16]), 'สรุปรายคน');
    XLSX.utils.book_append_sheet(wb, sheet(lines, [32, 12, 16, 14, 8, 12, 12, 12, 12, 34, 14, 14, 20]), 'รายเที่ยว');
    const range = from || to ? `${from || 'ต้น'}_ถึง_${to || todayYMD()}` : 'ทุกวัน';
    XLSX.writeFile(wb, `ค่าใช้จ่ายคนขับ_${range}.xlsx`);
    toast(`บันทึก ${fmtNum(list.length)} คนเป็น Excel แล้ว`, 'ok');
  }catch(err){
    console.error('[billing] ส่งออกค่าใช้จ่ายไม่สำเร็จ', err);
    toast('บันทึก Excel ไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่', 'err');
  }finally{ btn.disabled = false; }
}
