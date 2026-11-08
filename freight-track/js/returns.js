/* ============================================================
   returns.js — คืนบิลรายวัน (returns.html)

   ทุกบิลที่ส่งของแล้ว ล่าสุดอยู่บน (27 ต.ค. 2026 — เดิมทีละวัน) · กรองช่วงวันที่ส่ง / เฉพาะวันนี้ได้ (ไม่จำข้ามการเปิดหน้า)
   พร้อมสถานะคืน Inv. · คืนที่ (ORIGIN / คลัง / ชื่อคนรับ) · วันที่คืน · ครั้งล่าสุดที่ฝั่งออฟฟิศบันทึก/แก้
   หัวหน้าสรุปจำนวนบิลและยอดเงินตาม Invoice ของช่วงที่เลือก
   กดแถว = หน้าต่างคืน Inv. ตัวเดียวกับหน้าคนขับ/หลังบ้าน (js/helper.js) — สิทธิ์ 'edit' เท่านั้น
   ============================================================ */

import { shell, $, esc, toast, modal } from './ui.js';
import { listShipments, listDrivers, getJob, getDriver, subscribe, fmtBaht, fmtNum, fmtDate, fmtDateTime, S, driverName, todayYmd,
         COLLECT, collectOf, stopRevenue, lastCountedReturn, healInvoiceReturns } from './store.js';
import { loadUI, saveUI, debounce } from './uiState.js';
import { gate, getSession, canWrite } from './auth.js';
import { invRetDialog, needRebill, REBILL, collectDialog, COLLECT_TONE } from './helper.js';
import { loadXLSX } from './xlsxImport.js';

await gate('returns');
shell({ role: 'มุมมองคืนบิล' });

const ses = getSession();
const BY = { byRole:'ops', byName: ses.staff?.name || ses.staff?.email || 'ทีมคลัง' };
/* ฝั่งออฟฟิศ = ไม่ใช่คนขับ/ผู้ช่วย (หน้าออฟฟิศบันทึกเป็น 'ops') */
const isOffice = (r) => r.byRole !== 'driver' && r.byRole !== 'assistant';
const RET_PLACES = ['ORIGIN', 'คลัง'];

const UI = loadUI('returns');
let from = '', to = '';
const chosen = { from, to };
let tab = UI.tab || 'all';
let drv = UI.drv || '';
let q = UI.q || '';

/* วันที่ตามเวลาเครื่อง (ไม่ใช่ UTC) — ส่งตีหนึ่งต้องนับเป็นวันนั้น */
const localYmd = (v) => { const d = new Date(v); return isNaN(d) ? '' : new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const deliveredAt = (x) => (x.events || []).filter(e => e.status === S.DELIVERED).map(e => e.at).pop() || '';

/* held = ผู้รวบรวมบิลติ๊กว่าได้ใบกระดาษคืนมาแล้ว ยังไม่ได้ส่งคลัง (store.js markBillIn · 28 ต.ค.) */
const stateOf = (x) => x.invoiceReturn ? 'back' : needRebill(x) ? 'rebill' : x.billIn ? 'held' : 'wait';
const STATE = {
  back:   { label:'คืนแล้ว',  tone:'done' },
  held:   { label:'ได้ใบแล้ว · อยู่กับผู้รวบรวม', tone:'ware' },
  wait:   { label:'ยังไม่คืน', tone:'wait' },
  rebill: { label:REBILL,    tone:'stop' },
};
const placeOf = (x) => {
  const v = x.invoiceReturn?.receivedBy || '';
  return !v ? '' : RET_PLACES.includes(v) ? v : 'อื่น ๆ';
};
const lastOffice = (x) => [...(x.invoiceReturns || [])].reverse().find(isOffice) || null;
/* คนที่กดคืนจริง (รอบคืนล่าสุดที่ยังใช้อยู่) — ไม่ใช่รายชื่อคนขับของงาน
   ผู้ช่วยใช้บัญชีคนขับ ชื่อจึงเป็น "ชื่อคนขับ (ผู้ช่วย)" (js/driver.js actorName) */
const ROLE_TH = { driver:'คนขับ', assistant:'ผู้ช่วย', ops:'ออฟฟิศ', sheet:'ชีต', collector:'ผู้รวบรวมบิล' };
/* นับเฉพาะรอบของผู้รวบรวม / ออฟฟิศ / ชีต — คนขับกดคืนเองไม่มีผล (store.js RETURN_ROLES) */
const returnedBy = (x) => {
  const r = lastCountedReturn(x);
  return x.invoiceReturn && r && r.action !== 'cancel' ? r : null;
};
const driversOf = (x) => {
  const ids = x.driverIds?.length ? x.driverIds : (x.driverId ? [x.driverId] : []);
  return ids.map(id => driverName(getDriver(id))).filter(Boolean).join(', ');
};

const TABS = [
  { key:'all',    label:'ทั้งหมด',     test: () => true },
  { key:'wait',   label:'ยังไม่คืน',    test: x => stateOf(x) !== 'back' },
  { key:'held',   label:'อยู่กับผู้รวบรวม', test: x => stateOf(x) === 'held' },
  { key:'back',   label:'คืนแล้ว',     test: x => stateOf(x) === 'back' },
  { key:'rebill', label:REBILL,       test: x => stateOf(x) === 'rebill' },
  /* เงินที่คนขับเก็บหน้างานแล้วยังไม่ได้ยืนยันรับ (store.collectOf) — คลังยืนยันตอนคนขับส่งเงิน/บิลคืน */
  { key:'collect', label:'รอยืนยันรับเงิน', test: x => [COLLECT.SLIP, COLLECT.CASH].includes(collectOf(x).st) },
];
/* ป้ายเก็บเงินหน้างาน — กดดูหลักฐาน/ยืนยันรับเงิน · เครดิต/ยังไม่บันทึก = ขีด */
function collectCell(x){
  const c = collectOf(x);
  if (c.st === COLLECT.BILL) return `<span class="dim">${c.p?.method === 'เครดิต' ? 'เครดิต' : '—'}</span>`;
  const label = c.st === COLLECT.SLIP ? 'โอน · รอตรวจสลิป' : c.st === COLLECT.CASH ? 'เงินสด · รอรับเงิน' : `รับเงินแล้ว (${c.p.method})`;
  return `<button type="button" class="pill" data-tone="${COLLECT_TONE[c.st]}" data-collect="${esc(x.id)}" style="border:0;font:inherit;font-size:12px;cursor:pointer">${esc(label)}</button>
    <span class="bill-meta mono">${esc(fmtBaht(c.p.amount))}</span>`;
}

/** บิลที่ส่งของในช่วงที่เลือก (ว่าง = ทุกวัน) + คนขับที่เลือก (ยังไม่กรองแท็บ/คำค้น) · ส่งล่าสุดอยู่บน */
function dayList(){
  return listShipments({ status:S.DELIVERED, driverId: drv || undefined })
    .filter(x => { const d = localYmd(deliveredAt(x)); return (!from || d >= from) && (!to || d <= to); })
    .sort((a, b) => String(deliveredAt(b)).localeCompare(String(deliveredAt(a))) || a.code.localeCompare(b.code, 'th', { numeric:true }));
}
const rangeLabel = () => from || to
  ? (from === to ? fmtDate(from) : `${from ? fmtDate(from) : 'ต้น'} – ${to ? fmtDate(to) : 'ล่าสุด'}`) : 'ทุกวัน';
const match = (x) => {
  const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const j = getJob(x.jobId);
  const text = [x.code, x.invoice?.number, x.delivery, x.dropoff?.name, x.customer?.name, j?.code, j?.vehicle, driversOf(x)]
    .join(' ').toLowerCase();
  return terms.every(t => text.includes(t));
};

const kpiHtml = (items) => items.map(k => `
    <div class="kpi" data-accent="${k.accent}">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value" style="font-size:22px">${esc(k.value)}</div>
      <div class="kpi-foot">${esc(k.foot)}</div>
    </div>`).join('');

function paintKpi(list){
  const amt = list.reduce((t, x) => t + (Number(x.invoice?.amount) || 0), 0);
  const noAmt = list.filter(x => !(Number(x.invoice?.amount) > 0)).length;
  const back = list.filter(x => x.invoiceReturn);
  const by = (p) => back.filter(x => placeOf(x) === p).length;
  const rebill = list.filter(needRebill).length;
  $('#kpis').innerHTML = kpiHtml([
    { label:'บิลที่ส่งแล้ว', value:`${fmtNum(list.length)} บิล`, foot:rangeLabel(), accent:'violet' },
    { label:'ยอดเงินตาม Invoice', value:fmtBaht(amt), foot: noAmt ? `ไม่มียอด ${fmtNum(noAmt)} บิล` : 'มียอดครบทุกบิล', accent:'blue' },
    { label:'คืนแล้ว', value:`${fmtNum(back.length)} บิล`, foot:`ORIGIN ${fmtNum(by('ORIGIN'))} · คลัง ${fmtNum(by('คลัง'))} · อื่น ๆ ${fmtNum(by('อื่น ๆ'))}`, accent:'green' },
    { label:'ยังไม่คืน', value:`${fmtNum(list.length - back.length)} บิล`, foot: rebill ? `${REBILL} ${fmtNum(rebill)} บิล` : '—', accent:'amber' },
  ]);
}

function paintDrivers(){
  const opts = listDrivers().sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'));
  if (drv && !opts.some(d => d.id === drv)) drv = '';
  $('#drv').innerHTML = `<option value="">คนขับทั้งหมด</option>` +
    opts.map(d => `<option value="${esc(d.id)}" ${d.id === drv ? 'selected' : ''}>${esc(driverName(d))}</option>`).join('');
}

let shown = [];
function paint(){
  const list = dayList();
  paintKpi(list);
  const hit = list.filter(match);
  $('#tabs').innerHTML = TABS.map(t => `
    <button class="tab" role="tab" data-tab="${t.key}" aria-selected="${t.key === tab}">
      ${esc(t.label)}<span class="cnt">${fmtNum(hit.filter(t.test).length)}</span>
    </button>`).join('');
  const cur = TABS.find(t => t.key === tab) || TABS[0];
  shown = hit.filter(cur.test);
  const edit = canWrite();

  $('#rows').innerHTML = shown.map(x => {
    const j = getJob(x.jobId);
    const r = x.invoiceReturn;
    const st = STATE[stateOf(x)];
    const ofc = lastOffice(x);
    const place = placeOf(x);
    return `<tr data-id="${esc(x.id)}"${edit ? ' data-clickable title="กดเพื่อบันทึก / แก้การคืนบิลนี้"' : ''}>
      <td>${esc(fmtDate(localYmd(deliveredAt(x))))}<span class="bill-meta">${esc(fmtDateTime(deliveredAt(x)).split(' · ')[1] || '')}</span></td>
      <td><span class="code">${esc(x.invoice?.number || x.code)}</span>
        <span class="bill-meta">${esc(x.dropoff?.name || '—')}</span></td>
      <td><span class="code">${esc(j?.code || '—')}</span> <span class="tiny dim">${esc(j?.vehicle || '')}</span>
        <span class="bill-meta">${esc(driversOf(x) || '—')}</span></td>
      <td class="right mono">${x.invoice?.amount ? esc(fmtBaht(x.invoice.amount)) : '<span class="dim">—</span>'}</td>
      <td><span class="pill" data-tone="${st.tone}">${esc(st.label)}</span></td>
      <td>${place ? esc(place === 'อื่น ๆ' ? r.receivedBy : place) : '<span class="dim">—</span>'}
        ${place === 'อื่น ๆ' ? '<span class="bill-meta">อื่น ๆ</span>' : ''}</td>
      <td>${r?.date ? esc(fmtDate(r.date)) : '<span class="dim">—</span>'}</td>
      <td>${(() => { const by = returnedBy(x); return by
        ? `${esc(by.byName || '—')}<span class="bill-meta">${esc(ROLE_TH[by.byRole] || by.byRole || '')} · ${esc(fmtDateTime(by.at))}</span>${
            by.batch && by.photos?.length ? `<button type="button" class="btn btn-quiet btn-sm" data-batchpics="${esc(x.id)}" style="margin-top:4px">📷 รูปส่งคืน ${fmtNum(by.photos.length)}</button>` : ''}`
        : x.billIn ? `${esc(x.billIn.byName)}<span class="bill-meta">ได้ใบแล้ว · ${esc(fmtDateTime(x.billIn.at))}</span>`
        : '<span class="dim">—</span>'; })()}</td>
      <td>${ofc ? `${esc(fmtDateTime(ofc.at))}<span class="bill-meta">${esc(ofc.byName)}${ofc.action === 'cancel' ? ' · ยกเลิกการคืน' : ''}</span>` : '<span class="dim">—</span>'}</td>
      <td>${collectCell(x)}</td>
    </tr>`;
  }).join('');

  $('#emptyState').innerHTML = shown.length ? '' : `<div class="empty"><div class="empty-mark">📄</div>
    ${!list.length ? `ไม่มีบิลที่ส่งของ${from || to ? `ช่วง ${esc(rangeLabel())}` : ''}${drv ? ' ของคนขับคนนี้' : ''}` : 'ไม่มีบิลในแท็บนี้'}</div>`;
}

/* ---------- ตัวกรอง ---------- */
/* ช่วงวันที่ส่ง — ว่าง = ทุกวัน · "เฉพาะวันนี้" ล็อกช่องวันที่เป็นวันนี้ เอาติ๊กออก = กลับช่วงที่เลือกไว้ (แบบหน้า billing) */
$('#from').addEventListener('change', (e) => { from = chosen.from = e.target.value; paint(); });
$('#to').addEventListener('change', (e) => { to = chosen.to = e.target.value; paint(); });
$('#onlyToday').addEventListener('change', (e) => {
  const on = e.target.checked;
  if (on){ from = to = todayYmd(); } else { from = chosen.from; to = chosen.to; }
  ['#from', '#to'].forEach(k => { $(k).disabled = on; });
  $('#from').value = from; $('#to').value = to;
  paint();
});
$('#drv').addEventListener('change', (e) => { drv = e.target.value; saveUI('returns', { drv }); paint(); });
const rememberQ = debounce((v) => saveUI('returns', { q: v }), 300);
$('#q').value = q;
$('#q').addEventListener('input', (e) => { q = e.target.value; rememberQ(q); paint(); });
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  saveUI('returns', { tab });
  paint();
});

/* ---------- กดแถว = หน้าต่างคืน Inv. ของบิลนั้น ---------- */
$('#rows').addEventListener('click', (e) => {
  const pics = e.target.closest('[data-batchpics]');
  if (pics){
    const x = shown.find(v => v.id === pics.dataset.batchpics), r = x && returnedBy(x);
    if (!r) return;
    return modal({
      title: `รูปส่งคืนคลัง · ${esc(r.byName)} · ${esc(fmtDateTime(r.at))}`,
      guard: false,
      body: `<div class="photo-grid">${r.photos.map(p => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="รูปส่งคืนคลัง" loading="lazy"></a>`).join('')}</div>`,
      foot: '<button class="btn btn-accent" data-close>ปิด</button>',
    });
  }
  const col = e.target.closest('[data-collect]');
  if (col){
    const x = shown.find(v => v.id === col.dataset.collect);
    return x && collectDialog([{ x, rev: stopRevenue(x) }], { by: BY, onDone: paint });
  }
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  if (!canWrite()) return toast('บัญชีนี้ดูได้อย่างเดียวในหน้านี้', 'warn');
  const x = shown.find(v => v.id === tr.dataset.id);
  const j = x && getJob(x.jobId);
  if (x && j) invRetDialog(x, j, { ...BY, bills: [x], onSaved: paint });
});

/* ---------- บันทึกเป็น Excel ---------- */
$('#exportBtn').addEventListener('click', async () => {
  const list = dayList();
  if (!list.length) return toast('ไม่มีบิลในช่วงที่เลือก', 'err');
  const btn = $('#exportBtn');
  btn.disabled = true;
  try{
    const XLSX = await loadXLSX();
    const d = (s) => s ? new Date(`${String(s).slice(0, 10)}T00:00:00`) : '';
    const rows = list.map(x => {
      const j = getJob(x.jobId), r = x.invoiceReturn, ofc = lastOffice(x);
      return {
        'วันที่ส่ง': d(localYmd(deliveredAt(x))), 'เวลาส่ง': fmtDateTime(deliveredAt(x)), 'เลข Invoice': x.invoice?.number || '', 'รหัสบิล': x.code,
        'ร้าน': x.dropoff?.name || '', 'เที่ยว': j?.code || '', 'ทะเบียน': j?.vehicle || '', 'คนขับ': driversOf(x),
        'ยอด Invoice (บาท)': Number(x.invoice?.amount) || 0, 'สถานะคืน': STATE[stateOf(x)].label,
        'คืนที่': placeOf(x), 'ผู้รับคืน': r?.receivedBy || '', 'วันที่คืน': d(r?.date),
        'คืนโดย': returnedBy(x)?.byName || '', 'คืนโดย (บทบาท)': ROLE_TH[returnedBy(x)?.byRole] || '', 'เวลาที่กดคืน': returnedBy(x) ? fmtDateTime(returnedBy(x).at) : '',
        'Admin ดำเนินการล่าสุด': ofc ? fmtDateTime(ofc.at) : '', 'Admin': ofc?.byName || '',
        'หมายเหตุ': r?.note || '',
      };
    });
    const back = list.filter(x => x.invoiceReturn);
    const by = (p) => back.filter(x => placeOf(x) === p).length;
    const sum = [
      { 'หัวข้อ': 'ช่วงวันที่ส่ง', 'ค่า': rangeLabel() },
      { 'หัวข้อ': 'จำนวนบิลที่ส่ง', 'ค่า': list.length },
      { 'หัวข้อ': 'ยอดเงินตาม Invoice (บาท)', 'ค่า': list.reduce((t, x) => t + (Number(x.invoice?.amount) || 0), 0) },
      { 'หัวข้อ': 'คืนแล้ว', 'ค่า': back.length },
      { 'หัวข้อ': '· คืนที่ ORIGIN', 'ค่า': by('ORIGIN') },
      { 'หัวข้อ': '· คืนที่คลัง', 'ค่า': by('คลัง') },
      { 'หัวข้อ': '· คืนที่อื่น ๆ', 'ค่า': by('อื่น ๆ') },
      { 'หัวข้อ': 'ยังไม่คืน', 'ค่า': list.length - back.length },
      { 'หัวข้อ': `· ${REBILL}`, 'ค่า': list.filter(needRebill).length },
      ...(drv ? [{ 'หัวข้อ': 'คนขับ', 'ค่า': driverName(getDriver(drv)) }] : []),
    ];
    const wb = XLSX.utils.book_new();
    const sheet = (data, widths) => {
      const ws = XLSX.utils.json_to_sheet(data, { cellDates:true, dateNF:'dd/mm/yyyy' });
      ws['!cols'] = widths.map(w => ({ wch:w }));
      return ws;
    };
    XLSX.utils.book_append_sheet(wb, sheet(sum, [28, 20]), 'สรุป');
    XLSX.utils.book_append_sheet(wb, sheet(rows, [12, 20, 16, 16, 30, 18, 12, 26, 16, 16, 10, 20, 12, 24, 12, 20, 22, 20, 30]), 'รายการบิล');
    XLSX.writeFile(wb, `คืนบิล_${from || to ? `${from || 'ต้น'}_${to || todayYmd()}` : `ทั้งหมด_${todayYmd()}`}.xlsx`);
    toast(`บันทึก ${fmtNum(list.length)} บิลเป็น Excel แล้ว`, 'ok');
  }catch(err){
    console.error('[returns] บันทึก Excel ไม่สำเร็จ', err);
    toast('บันทึก Excel ไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่', 'err');
  }finally{ btn.disabled = false; }
});

subscribe(() => { paintDrivers(); paint(); });
paintDrivers();
paint();
/* กติกาใหม่ (28 ต.ค.) — คำนวณสถานะคืนบิลใหม่ทั้งชุด (คนขับกดเองไม่นับแล้ว) · รอคลาวด์ส่งข้อมูลมาก่อนสักครู่ */
setTimeout(() => { try{ healInvoiceReturns(); }catch(e){ console.warn(e); } }, 4000);
