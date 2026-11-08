/* ============================================================
   bills.js — ใบวางบิล (ฝั่งเรา + ฝั่งลูกค้า)

   หนึ่งใบวางบิลครอบหลายเที่ยว เก็บในคอลเลกชัน bills/{รหัส}
   รหัสเอกสาร = รหัสลับในลิงก์ที่ส่งให้ลูกค้า (bill.html?k=รหัส) — ยาวพอให้เดาไม่ได้
   ลูกค้าเปิดลิงก์ได้โดยไม่ต้องล็อกอิน และแก้ได้เฉพาะช่อง reply (กฎใน firestore.rules)

   bills/{id}
     docNo, billTo{name,address,taxId,contact}, issueDate, creditDays, dueDate
     items[{stopId?, jobId, code, date, vehicle, stops, dests, invoices[], amount}], total, note
                  stopId = ใบรายบิล (26 ต.ค. 2026 เป็นต้นไป · แถวละ Invoice) · ไม่มี = ใบรายเที่ยวแบบเดิม
     status       'open' วางบิลแล้ว รอชำระ · 'paid' ชำระแล้ว · 'cancelled' ยกเลิก
     linkActive   false = ปิดลิงก์ (ลูกค้าเปิดไม่ได้)
     paid         { date, method, amount, note, at, by }   ฝั่งเรายืนยันรับเงิน
     cancel       { reason, at, by }
     reply        ฝั่งลูกค้า — { viewedAt, receivedAt, receivedBy, promiseDate, note,
                                notice{ date, method, amount, slipUrl, slipName, at }, updatedAt }
     createdAt, createdBy, updatedAt, updatedBy

   ไฟล์นี้ไม่แตะ store.js — การผูกเที่ยวกับใบ (job.billing.billId) ทำที่ billing.js
   หน้า bill.html (ลูกค้า) ใช้ไฟล์นี้ไฟล์เดียว
   ============================================================ */

import { esc } from './ui.js';
import { fitImageFile } from './imageFit.js';
import { countPhotos } from './photoQuota.js';

export const METHODS = ['เงินโอน', 'เงินสด', 'เครดิต'];
export const SLIP_MAX = 5 * 1024 * 1024;

const fbReady = () => new Promise((res) => {
  if (window.firebase) return res(window.firebase);
  addEventListener('firebase-ready', () => res(window.firebase), { once:true });
});

/* ---------- วันที่ (YYYY-MM-DD ตามเวลาเครื่อง) ---------- */
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayYMD = () => ymd(new Date());
const toDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = toDate(s); d.setDate(d.getDate() + Number(n || 0)); return ymd(d); };
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** 2026-10-02 → 2 ต.ค. 2569 */
export const thDate = (s) => {
  if (!s) return '—';
  const d = toDate(s);
  return `${d.getDate()} ${TH_MON[d.getMonth()]} ${d.getFullYear() + 543}`;
};
/** เวลาเต็มจาก ISO → 2 ต.ค. 2569 · 14:05 น. */
export const thDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return `${thDate(ymd(d))} · ${pad(d.getHours())}:${pad(d.getMinutes())} น.`;
};
export const baht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits:2, maximumFractionDigits:2 });

/* ---------- วิธีชำระ: ทีเดียวทั้งหมด / แยกจ่ายทีละบิล (26 ต.ค. 2026) ----------
   reply.payMode    'all' (ค่าเริ่ม) | 'each' — ลูกค้าเลือกในขั้น 3 · เปลี่ยนได้จนกว่าจะแจ้งชำระครั้งแรก
   reply.notice     แจ้งชำระทั้งใบ (แบบเดิม)
   reply.notices    { <ลำดับรายการ "0","1",…>: notice } แจ้งชำระรายบิล · reply.noticeKey = รายการที่แจ้งล่าสุด (กฎฐานข้อมูลใช้ตรวจ)
   paidItems        { <ลำดับ>: { date, method, amount, note, at, by } } ฝั่งเรายืนยันรับเงินรายบิล — ครบทุกรายการ = ใบชำระแล้ว
   ยอดรายบิลล็อกเท่ายอดของรายการ (ยังไม่รองรับจ่ายไม่ครบ) */
export const PAY_MODES = { all:'จ่ายทีเดียวทั้งหมด', each:'แยกจ่ายทีละบิล' };
export const payModeOf = (b) => b?.reply?.payMode === 'each' ? 'each' : 'all';
export const itemKeyOf = (i) => String(i);
/** ลูกค้าแจ้งชำระไปแล้วหรือยัง (ทั้งใบ หรือบิลใดบิลหนึ่ง) — แจ้งแล้วเปลี่ยนวิธีชำระไม่ได้ */
export const hasNotice = (b) => !!b?.reply?.notice?.at || Object.keys(b?.reply?.notices || {}).length > 0;
/** รายการในใบพร้อมสถานะแจ้ง/ยืนยันรายบิล */
export function payItems(b){
  const notices = b?.reply?.notices || {}, paid = b?.paidItems || {};
  return (b?.items || []).map((it, i) => {
    const k = itemKeyOf(i);
    return { it, i, k, notice: notices[k] || null, paid: paid[k] || null };
  });
}

/* ---------- สถานะสองฝั่ง ---------------------------------- */
/** ฝั่งเรา */
export function ourState(b){
  if (b.status === 'cancelled') return { key:'cancelled', label:'ยกเลิกแล้ว', tone:'grey' };
  if (b.status === 'paid') return { key:'paid', label:'ชำระแล้ว', tone:'done' };
  const n = Object.keys(b.paidItems || {}).length;
  if (n) return { key:'open', label:`ชำระแล้ว ${n}/${(b.items || []).length} บิล`, tone:'move' };
  return { key:'open', label:'วางบิลแล้ว รอชำระ', tone:'move' };
}

/** ฝั่งลูกค้า — ไล่จากขั้นที่ไปไกลที่สุด */
export function custState(b){
  const r = b.reply || {};
  if (b.status === 'cancelled') return { key:'cancelled', label:'ยกเลิกแล้ว', tone:'grey' };
  if (b.status === 'paid') return { key:'paid', label:'ชำระแล้ว', tone:'done' };
  if (r.notice?.at) return { key:'notice', label:'แจ้งชำระแล้ว · รอตรวจ', tone:'ware' };
  const each = payItems(b).filter(p => p.notice?.at);
  if (each.some(p => !p.paid)) return { key:'notice', label:`แจ้งชำระแล้ว ${each.length}/${(b.items || []).length} บิล · รอตรวจ`, tone:'ware' };
  if (each.length) return { key:'received', label:`แจ้งชำระแล้ว ${each.length}/${(b.items || []).length} บิล`, tone:'move' };
  if (r.receivedAt) return { key:'received', label:'รับบิลแล้ว', tone:'move' };
  if (r.viewedAt) return { key:'viewed', label:'เปิดดูแล้ว · ยังไม่กดรับ', tone:'wait' };
  return { key:'sent', label:'ยังไม่เปิดลิงก์', tone:'wait' };
}

/** เกินกำหนดกี่วัน (0 = ยังไม่เกิน / ปิดแล้ว) */
export const overdueDays = (b, today = todayYMD()) =>
  b.status === 'open' && b.dueDate && b.dueDate < today ? daysBetween(b.dueDate, today) : 0;

/* ---------- จำนวนเงินเป็นตัวหนังสือ ------------------------ */
const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function read6(str, higher = false){
  let out = '';
  const len = str.length;
  for (let i = 0; i < len; i++){
    const d = +str[i], pos = len - 1 - i;
    if (!d) continue;
    if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else if (pos === 0 && d === 1 && (higher || /[1-9]/.test(str.slice(0, -1)))) out += 'เอ็ด';
    else out += DIGIT[d] + PLACE[pos];
  }
  return out;
}
function readInt(str){
  str = str.replace(/^0+/, '');
  if (!str) return '';
  if (str.length <= 6) return read6(str);
  return readInt(str.slice(0, -6)) + 'ล้าน' + read6(str.slice(-6), true);
}
/** 1250.5 → หนึ่งพันสองร้อยห้าสิบบาทห้าสิบสตางค์ */
export function bahtText(n){
  const v = Math.round(Math.abs(Number(n) || 0) * 100);
  const b = String(Math.floor(v / 100)), s = v % 100;
  const head = readInt(b) || (s ? '' : 'ศูนย์');
  return (head ? head + 'บาท' : '') + (s ? readInt(String(s)) + 'สตางค์' : 'ถ้วน');
}

/* ---------- เอกสารใบวางบิล (ใช้ทั้งหน้าลูกค้าและตอนพิมพ์) ---- */
/**
 * @param {object} b ใบวางบิล
 * @param {object} co หัวบริษัท (COMPANY ใน config.js)
 */
export function billDocHtml(b, co){
  const to = b.billTo || {};
  const items = b.items || [];
  const line = (label, v) => v ? `<div><span>${esc(label)}</span>${esc(v)}</div>` : '';
  return `
<article class="billdoc">
  <header class="billdoc-head">
    <div class="billdoc-co">
      <div class="billdoc-co-name">${esc(co.name)}</div>
      ${co.nameEn ? `<div class="billdoc-co-en">${esc(co.nameEn)}</div>` : ''}
      ${co.address ? `<div>${esc(co.address)}</div>` : ''}
      ${co.taxId ? `<div>เลขประจำตัวผู้เสียภาษี ${esc(co.taxId)}</div>` : ''}
      ${co.contact || co.phone ? `<div>โทร ${esc(co.contact || co.phone)}</div>` : ''}
    </div>
    <div class="billdoc-title">
      <div class="billdoc-title-th">ใบวางบิล</div>
      <div class="billdoc-title-en">BILLING NOTE</div>
    </div>
  </header>

  <div class="billdoc-meta">
    <div class="billdoc-to">
      <div class="billdoc-label">ลูกค้า</div>
      <div class="billdoc-to-name">${esc(to.name || '—')}</div>
      ${to.address ? `<div>${esc(to.address)}</div>` : ''}
      ${to.taxId ? `<div>เลขประจำตัวผู้เสียภาษี ${esc(to.taxId)}</div>` : ''}
      ${to.contact ? `<div>ติดต่อ ${esc(to.contact)}</div>` : ''}
    </div>
    <div class="billdoc-kv">
      ${line('เลขที่', b.docNo)}
      ${line('วันที่', thDate(b.issueDate))}
      ${line('เครดิต', b.creditDays ? `${b.creditDays} วัน` : 'ชำระทันที')}
      ${line('ครบกำหนดชำระ', thDate(b.dueDate))}
    </div>
  </div>

  <table class="billdoc-tbl">
    <thead><tr>
      <th class="c">ลำดับ</th><th>วันที่</th><th>Shipment No. · รถ</th><th>ปลายทาง</th><th>Invoice</th><th class="r">จำนวนเงิน (บาท)</th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td class="nw">${esc(thDate(it.date))}</td>
        <td><b>${esc(it.code || '—')}</b>${it.vehicle ? `<br><small>${esc(it.vehicle)}</small>` : ''}</td>
        <td>${esc(it.dests || '—')}${it.stops ? `<br><small>${esc(it.stops)} จุดส่ง</small>` : ''}</td>
        <td class="billdoc-inv">${esc((it.invoices || []).join(', ') || '—')}</td>
        <td class="r nw">${esc(baht(it.amount))}</td>
      </tr>`).join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="5" class="r">รวม ${items.length} ${itemUnit(items)} · จำนวนเงินรวม</td><td class="r nw"><b>${esc(baht(b.total))}</b></td></tr>
      <tr><td colspan="6" class="billdoc-words">(${esc(bahtText(b.total))})</td></tr>
    </tfoot>
  </table>

  ${b.note ? `<p class="billdoc-note"><b>หมายเหตุ</b> ${esc(b.note)}</p>` : ''}

  <div class="billdoc-sign">
    <div><span class="billdoc-sign-line"></span>ผู้วางบิล<br><small>วันที่ ____/____/______</small></div>
    <div><span class="billdoc-sign-line"></span>ผู้รับวางบิล<br><small>วันที่ ____/____/______</small></div>
  </div>
</article>`;
}

/** ใบวางบิลเป็นไฟล์ Excel — เนื้อหาเดียวกับ billDocHtml (ยอดรวมเป็นสูตร SUM แก้ตัวเลขแล้วรวมใหม่เอง) */
export async function billXlsx(b, co){
  const X = await import('./xlsxExport.js');
  const to = b.billTo || {};
  const items = b.items || [];
  const wb = await X.newBook();
  const ws = X.sheet(wb, 'ใบวางบิล', [15, 13, 20, 28, 24, 16]);
  X.companyHead(ws, co, 'ใบวางบิล', 'BILLING NOTE');
  X.kv(ws, [
    ['ลูกค้า', to.name || '—'],
    ['ที่อยู่', to.address],
    ['เลขผู้เสียภาษี', to.taxId],
    ['ติดต่อ', to.contact],
  ]);
  X.gap(ws, 6);
  X.kv(ws, [
    ['เลขที่', b.docNo],
    ['วันที่', thDate(b.issueDate)],
    ['เครดิต', b.creditDays ? `${b.creditDays} วัน` : 'ชำระทันที'],
    ['ครบกำหนดชำระ', thDate(b.dueDate)],
  ]);
  X.gap(ws, 8);
  const { first, last } = X.table(ws,
    ['ลำดับ', 'วันที่', 'Shipment No. · รถ', 'ปลายทาง', 'Invoice', 'จำนวนเงิน (บาท)'],
    items.map((it, i) => [
      i + 1,
      thDate(it.date),
      [it.code || '—', it.vehicle].filter(Boolean).join('\n'),
      [it.dests || '—', it.stops ? `${it.stops} จุดส่ง` : ''].filter(Boolean).join('\n'),
      (it.invoices || []).join(', ') || '—',
      Number(it.amount) || 0,
    ]),
    { fmt:{ 5:X.FMT.money }, align:{ 0:'center' } });
  const tot = ws.addRow([`รวม ${items.length} ${itemUnit(items)} · จำนวนเงินรวม`, '', '', '', '',
    { formula: items.length ? `SUM(F${first}:F${last})` : '0', result: Number(b.total) || 0 }]);
  ws.mergeCells(tot.number, 1, tot.number, 5);
  tot.eachCell({ includeEmpty:true }, (c, i) => {
    c.font = { name:'Tahoma', size:10, bold:true };
    c.border = { top:{ style:'thin' }, bottom:{ style:'double' } };
    c.alignment = { horizontal:'right' };
    if (i === 6) c.numFmt = X.FMT.money;
  });
  X.line(ws, `(${bahtText(b.total)})`, { align:'center', size:10 });
  if (b.note){ X.gap(ws); X.kv(ws, [['หมายเหตุ', b.note]]); }
  X.gap(ws, 36);
  const sign = ws.addRow(['..............................', '', '', '..............................', '', '']);
  ws.mergeCells(sign.number, 1, sign.number, 3); ws.mergeCells(sign.number, 4, sign.number, 6);
  const cap = ws.addRow(['ผู้วางบิล', '', '', 'ผู้รับวางบิล', '', '']);
  ws.mergeCells(cap.number, 1, cap.number, 3); ws.mergeCells(cap.number, 4, cap.number, 6);
  const day = ws.addRow(['วันที่ ____/____/______', '', '', 'วันที่ ____/____/______', '', '']);
  ws.mergeCells(day.number, 1, day.number, 3); ws.mergeCells(day.number, 4, day.number, 6);
  [sign, cap, day].forEach(r => r.eachCell(c => { c.alignment = { horizontal:'center' }; c.font = { name:'Tahoma', size:10 }; }));
  await X.save(wb, `ใบวางบิล ${b.docNo || ''} ${to.name || ''}`);
}

/* ============================================================
   ฝั่งเรา (พนักงาน) — อ่าน/เขียนตรงกับ Firestore ต้องออนไลน์
   ============================================================ */

/** รหัสลับ 24 ตัว (a-z A-Z 0-9 ≈ 143 บิต) */
export function newBillId(){
  const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const buf = crypto.getRandomValues(new Uint8Array(24));
  return [...buf].map(x => abc[x % abc.length]).join('');
}

/** เขียนแล้วรอเซิร์ฟเวอร์ตอบ — ออฟไลน์ Firestore จะรอไม่จบ จึงตัดที่ 15 วินาที */
async function commit(p){
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error('timeout')), 15000); });
  try{ return await Promise.race([p, timeout]); }
  catch(err){
    console.error('[bills]', err);
    if (err?.code === 'permission-denied') throw new Error('บัญชีนี้ไม่มีสิทธิ์แก้ใบวางบิล — ติดต่อ admin');
    throw new Error('บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  }
  finally{ clearTimeout(t); }
}

/** ฟังใบวางบิลทั้งหมด (พนักงาน) */
export async function watchBills(fn, onErr){
  const fb = await fbReady();
  if (!fb?.ok){ onErr?.(new Error('เชื่อมต่อฐานข้อมูลไม่ได้')); return () => {}; }
  return fb.onSnapshot(fb.collection(fb.db, 'bills'), (snap) => {
    const rows = [];
    snap.forEach(d => rows.push(d.data()));
    fn(rows);
  }, (err) => { console.error('[bills] ฟังใบวางบิลไม่ได้', err); onErr?.(err); });
}

/** หน่วยของรายการในใบ — ใบรายบิล = บิล · ใบเก่า = เที่ยว */
export const itemUnit = (items) => (items || []).some(it => it.stopId) ? 'บิล' : 'เที่ยว';

/** เลขใบวางบิลถัดไปของเดือนนั้น — BL6910-001 (ปี พ.ศ. 2 หลัก + เดือน) */
export function nextDocNo(bills, issueDate = todayYMD()){
  const d = toDate(issueDate);
  const prefix = `BL${String(d.getFullYear() + 543).slice(-2)}${pad(d.getMonth() + 1)}-`;
  const max = bills.map(b => String(b.docNo || ''))
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10) || 0)
    .reduce((a, x) => Math.max(a, x), 0);
  return prefix + String(max + 1).padStart(3, '0');
}

/** สร้างใบวางบิล — คืนเอกสารที่บันทึกแล้ว */
export async function createBill(p, by){
  const fb = await fbReady();
  const now = new Date().toISOString();
  const items = p.items.map(it => ({ ...it, amount: Math.round((Number(it.amount) || 0) * 100) / 100 }));
  const bill = {
    id: newBillId(),
    docNo: String(p.docNo || '').trim(),
    billTo: {
      name: String(p.billTo?.name || '').trim(),
      address: String(p.billTo?.address || '').trim(),
      taxId: String(p.billTo?.taxId || '').trim(),
      contact: String(p.billTo?.contact || '').trim(),
    },
    issueDate: p.issueDate,
    creditDays: Number(p.creditDays) || 0,
    dueDate: addDays(p.issueDate, p.creditDays),
    items,
    total: Math.round(items.reduce((a, it) => a + it.amount, 0) * 100) / 100,
    note: String(p.note || '').trim(),
    status: 'open',
    linkActive: true,
    paid: null,
    cancel: null,
    reply: {},
    createdAt: now, createdBy: by,
    updatedAt: now, updatedBy: by,
  };
  await commit(fb.setDoc(fb.doc(fb.db, 'bills', bill.id), bill));
  return bill;
}

/** ลบใบวางบิลถาวร (admin ล้างข้อมูล — billing.js FT.wipeBills) · ก้อนละ 400 ใบ */
export async function deleteBills(ids){
  const fb = await fbReady();
  const list = [...new Set(ids || [])];
  for (let i = 0; i < list.length; i += 400){
    const batch = fb.writeBatch(fb.db);
    list.slice(i, i + 400).forEach(id => batch.delete(fb.doc(fb.db, 'bills', id)));
    await commit(batch.commit());
  }
  return list.length;
}

/** แก้ช่องของใบ (ฝั่งเรา) */
export async function patchBill(id, patch, by){
  const fb = await fbReady();
  await commit(fb.updateDoc(fb.doc(fb.db, 'bills', id), { ...patch, updatedAt: new Date().toISOString(), updatedBy: by }));
}

/** เปลี่ยนลิงก์ — ย้ายใบไปรหัสใหม่ ลิงก์เก่าใช้ไม่ได้ทันที · คืนรหัสใหม่ */
export async function renewBillId(bill, by){
  const fb = await fbReady();
  const id = newBillId();
  const now = new Date().toISOString();
  const batch = fb.writeBatch(fb.db);
  batch.set(fb.doc(fb.db, 'bills', id), { ...bill, id, linkActive: true, updatedAt: now, updatedBy: by });
  batch.delete(fb.doc(fb.db, 'bills', bill.id));
  await commit(batch.commit());
  return id;
}

/* ============================================================
   ฝั่งลูกค้า (bill.html — ไม่ได้ล็อกอิน) แก้ได้เฉพาะช่อง reply
   ============================================================ */

/** เปิดดูใบเดียว + ฟังการเปลี่ยนแปลง · fn(null) = ไม่พบ / ลิงก์ถูกปิด */
export async function watchBill(id, fn){
  const fb = await fbReady();
  if (!fb?.ok){ fn(null, 'offline'); return () => {}; }
  return fb.onSnapshot(fb.doc(fb.db, 'bills', id),
    (d) => fn(d.exists() ? d.data() : null),
    (err) => { console.error('[bill] เปิดใบวางบิลไม่ได้', err); fn(null, err.code || 'error'); });
}

/** บันทึกช่องฝั่งลูกค้า — fields = { receivedAt, ... } ใส่ใต้ reply ทั้งหมด */
export async function saveReply(id, fields){
  const fb = await fbReady();
  const patch = { 'reply.updatedAt': new Date().toISOString() };
  Object.entries(fields).forEach(([k, v]) => { patch[`reply.${k}`] = v; });
  await commit(fb.updateDoc(fb.doc(fb.db, 'bills', id), patch));
}

/** หัว Content-Disposition ให้เบราว์เซอร์ "ดาวน์โหลด" ไฟล์แทนการเปิดดู พร้อมชื่อไฟล์เดิม (ชื่อไทยใช้ filename*) */
export function attachment(name){
  const n = String(name || 'slip').slice(0, 120);
  const ascii = n.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(n)}`;
}

/**
 * ดาวน์โหลดสลิป (พนักงาน) — ไฟล์อยู่คนละโดเมน (Firebase Storage) ลิงก์ธรรมดาเบราว์เซอร์จะเปิดดูแทนดาวน์โหลด
 * จึงตั้ง Content-Disposition: attachment ที่ตัวไฟล์ (สลิปที่อัปก่อนมีระบบนี้ยังไม่มี — ตั้งให้ตอนกดครั้งแรก)
 * แล้วกดลิงก์ไฟล์ — เบราว์เซอร์ดาวน์โหลดโดยไม่ออกจากหน้า
 */
export async function downloadSlip(url, name){
  const fb = await fbReady();
  const ref = fb.storageRef(fb.storage, url);
  const want = attachment(name || ref.name);
  const meta = await fb.getMetadata(ref);
  if (meta.contentDisposition !== want) await fb.updateMetadata(ref, { contentDisposition: want });
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** อัปสลิป (รูปหรือ PDF ไม่เกิน 5 MB) — คืน { url, name } */
export async function uploadSlip(id, file){
  if (!file) return null;
  if (!/^image\/|^application\/pdf$/.test(file.type)) throw new Error('แนบได้เฉพาะรูปภาพหรือ PDF');
  file = await fitImageFile(file);   /* รูปไม่เกิน 300 KB เสมอ · PDF ผ่านไปตามเดิม */
  if (file.size > SLIP_MAX) throw new Error('ไฟล์ใหญ่เกิน 5 MB');
  const fb = await fbReady();
  const ext = (file.name.match(/\.[a-z0-9]{1,5}$/i)?.[0] || (file.type === 'application/pdf' ? '.pdf' : '.jpg')).toLowerCase();
  const ref = fb.storageRef(fb.storage, `bills/${id}/slip-${Date.now()}${ext}`);
  try{
    await fb.uploadBytes(ref, file, { contentType: file.type, contentDisposition: attachment(file.name) });
    if (file.type.startsWith('image/')) countPhotos(1);   /* โควตารูปรายเดือน — ลูกค้าไม่ล็อกอินนับไม่ได้ (กฎข้ามเงียบ ๆ) */
    return { url: await fb.getDownloadURL(ref), name: file.name.slice(0, 120) };
  }catch(err){
    console.error('[bill] อัปสลิปไม่สำเร็จ', err);
    throw new Error('อัปโหลดสลิปไม่สำเร็จ — ลองใหม่อีกครั้ง');
  }
}
