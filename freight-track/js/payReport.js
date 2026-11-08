/* ============================================================
   payReport.js — ใบสรุปค่ารอบของคนขับ (หน้าคนขับ · 27 ต.ค.)
   คนขับปริ้น/บันทึกเป็นไฟล์ แล้วเอาไปให้ฝ่ายบัญชีโอนเงิน

   ข้อมูล: ค่ารอบรายคนของแต่ละเที่ยว (store.js getJobPay → payRowsOf / payTotalFor)
           สถานะจ่ายแล้ว (paidOf — ฝ่ายบัญชีกดที่หน้าวางบิล แท็บค่าใช้จ่าย)
   ค่ารอบแบบเก่าที่ยังไม่ได้แยกรายคน (pay.base / pay.items) นับให้เฉพาะเที่ยวที่มีคนขับคนเดียว — กติกาเดียวกับหน้าคนขับ (payView)
   เลือกช่วงวันที่ได้ (ค่าเริ่ม = ต้นเดือนนี้ ถึง วันนี้) · ติ๊ก "เฉพาะที่ยังไม่ได้รับเงิน" ไว้ให้
   ปริ้น = ใบ A4 (ซ่อนบนจอ ขึ้นเฉพาะตอนปริ้น แบบใบ POD) · ไฟล์ตาราง = xlsxExport.js
   ============================================================ */

import { esc, modal, toast } from './ui.js';
import {
  listJobs, getJobPay, payRowsOf, payTotalFor, payTotal, paidOf, getDriver, driverName,
  fmtBaht, fmtNum, fmtDate, fmtDateTime, todayYmd,
} from './store.js';
import { COMPANY } from './config.js';

const dateOf = (j) => String(j.serviceDate || j.createdAt || '').slice(0, 10);
const monthStart = () => `${todayYmd().slice(0, 8)}01`;

/** เที่ยวของคนขับคนนี้ที่มีค่ารอบ ในช่วงวันที่ — เรียงตามวันที่ */
export function payReportRows(driverId, { from = '', to = '', unpaidOnly = false } = {}){
  return listJobs({ driverId }).map(j => {
    const pay = getJobPay(j.id);
    let rows = payRowsOf(pay, driverId);
    let total = payTotalFor(pay, driverId);
    /* ค่ารอบแบบเก่า (ยังไม่แยกคน) — เที่ยวที่มีคนขับคนเดียวถือว่าเป็นของคนนั้น */
    const legacy = Number(pay.base) > 0 || (pay.items || []).length;
    if (!rows.length && legacy && (j.driverIds || []).length === 1 && j.driverIds[0] === driverId){
      rows = [...(Number(pay.base) > 0 ? [{ amount: pay.base, note: 'ค่ารอบ' }] : []), ...(pay.items || [])];
      total = payTotal({ base: pay.base, items: pay.items });
    }
    return { j, date: dateOf(j), rows, total, paid: paidOf(j.pay, driverId) };   /* getJobPay ไม่มีช่อง paid — อ่านจากเที่ยวตรง ๆ แบบ billingCosts.js */
  })
    .filter(r => r.total > 0 && (!from || r.date >= from) && (!to || r.date <= to) && (!unpaidOnly || !r.paid))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.j.code).localeCompare(String(b.j.code), 'en', { numeric:true }));
}

const sumOf = (list) => ({
  all: list.reduce((a, r) => a + r.total, 0),
  paid: list.filter(r => r.paid).reduce((a, r) => a + r.total, 0),
  due: list.filter(r => !r.paid).reduce((a, r) => a + r.total, 0),
});
const itemText = (rows) => rows.map(x => `${x.note || 'ค่ารอบ'} ${fmtBaht(x.amount)}`).join(' · ');
const stateText = (r) => r.paid ? `จ่ายแล้ว ${fmtDate(String(r.paid.at).slice(0, 10))}` : 'ยังไม่ได้รับ';
const periodText = (o) => o.from || o.to ? `${o.from ? fmtDate(o.from) : 'แรกสุด'} – ${o.to ? fmtDate(o.to) : 'ล่าสุด'}` : 'ทั้งหมด';

/* ---------- ใบที่ปริ้น ---------- */
function pageHtml(d, list, o){
  const s = sumOf(list);
  return `
<section class="pr-page">
  <div class="pr-head">
    <div>
      <div class="pr-co">${esc(COMPANY.name)}</div>
      ${COMPANY.phone ? `<div class="pr-small">โทร ${esc(COMPANY.phone)}</div>` : ''}
    </div>
    <div class="pr-title">
      <div class="pr-title-th">ใบสรุปค่ารอบคนขับ</div>
      <div class="pr-small">พิมพ์เมื่อ ${esc(fmtDateTime(new Date().toISOString()))}</div>
    </div>
  </div>
  <table class="pr-info">
    <tr><th>คนขับ</th><td>${esc(driverName(d))}</td><th>ทะเบียนรถ</th><td>${esc(d.plate || '—')}</td></tr>
    <tr><th>เลขบัญชี</th><td>${esc(d.bankAccount || '—')}</td><th>ธนาคาร</th><td>${esc(d.bankName || '—')}</td></tr>
    <tr><th>ช่วงวันที่</th><td>${esc(periodText(o))}</td><th>รายการ</th><td>${o.unpaidOnly ? 'เฉพาะที่ยังไม่ได้รับเงิน' : 'ทั้งหมด (รวมที่จ่ายแล้ว)'}</td></tr>
  </table>
  <table class="pr-tbl">
    <thead><tr><th class="idx">ที่</th><th>วันที่</th><th>เลขเที่ยว</th><th>รถ</th><th>รายการค่ารอบ</th><th class="num">ยอด (บาท)</th><th>สถานะ</th></tr></thead>
    <tbody>${list.map((r, i) => `
      <tr><td class="idx">${i + 1}</td><td class="nowrap">${esc(fmtDate(r.date))}</td><td class="nowrap">${esc(r.j.code)}</td>
          <td>${esc(r.j.vehicle || '')}</td><td>${esc(itemText(r.rows))}</td><td class="num">${esc(fmtBaht(r.total))}</td><td class="nowrap">${esc(stateText(r))}</td></tr>`).join('')}
    </tbody>
    <tfoot>
      <tr><td colspan="5" class="num">รวม ${fmtNum(list.length)} เที่ยว</td><td class="num">${esc(fmtBaht(s.all))}</td><td></td></tr>
      ${s.paid ? `<tr><td colspan="5" class="num">จ่ายแล้ว</td><td class="num">${esc(fmtBaht(s.paid))}</td><td></td></tr>` : ''}
      <tr class="pr-due"><td colspan="5" class="num">ยอดที่ขอเบิก (ยังไม่ได้รับ)</td><td class="num">${esc(fmtBaht(s.due))}</td><td></td></tr>
    </tfoot>
  </table>
  <div class="pr-signs">
    ${['คนขับ (ผู้ขอเบิก)', 'ผู้ตรวจสอบ', 'ผู้อนุมัติจ่าย'].map(t => `
    <div class="pr-sign"><div class="pr-sign-line">ลงชื่อ ..........................................</div><div>( ...................................... )</div><div class="pr-sign-cap">${t}</div><div class="pr-small">วันที่ ........../........../..........</div></div>`).join('')}
  </div>
</section>`;
}

export function printPayReport(d, list, o){
  if (!list.length) throw new Error('ไม่มีค่ารอบในช่วงที่เลือก');
  document.getElementById('pay-print')?.remove();
  const root = document.createElement('div');
  root.id = 'pay-print';
  root.innerHTML = pageHtml(d, list, o);
  document.body.appendChild(root);
  document.body.classList.add('pay-printing');
  const cleanup = () => {
    root.remove();
    document.body.classList.remove('pay-printing');
    removeEventListener('afterprint', cleanup);
  };
  addEventListener('afterprint', cleanup);
  window.print();
}

/* ---------- ไฟล์ตาราง ---------- */
export async function payReportXlsx(d, list, o){
  if (!list.length) throw new Error('ไม่มีค่ารอบในช่วงที่เลือก');
  const X = await import('./xlsxExport.js');
  const wb = await X.newBook();
  const ws = X.sheet(wb, 'ค่ารอบ', [6, 13, 16, 16, 40, 14, 20]);
  X.companyHead(ws, COMPANY, 'ใบสรุปค่ารอบคนขับ');
  X.kv(ws, [
    ['คนขับ', driverName(d)], ['ทะเบียนรถ', d.plate || '—'],
    ['เลขบัญชี', d.bankAccount ? `${d.bankAccount}${d.bankName ? ` (${d.bankName})` : ''}` : '—'],
    ['ช่วงวันที่', periodText(o)], ['รายการ', o.unpaidOnly ? 'เฉพาะที่ยังไม่ได้รับเงิน' : 'ทั้งหมด (รวมที่จ่ายแล้ว)'],
    ['พิมพ์เมื่อ', fmtDateTime(new Date().toISOString())],
  ]);
  X.gap(ws);
  const s = sumOf(list);
  X.table(ws, ['ที่', 'วันที่', 'เลขเที่ยว', 'รถ', 'รายการค่ารอบ', 'ยอด (บาท)', 'สถานะ'],
    list.map((r, i) => [i + 1, fmtDate(r.date), r.j.code, r.j.vehicle || '', itemText(r.rows), r.total, stateText(r)]),
    { fmt: { 0: X.FMT.int, 5: X.FMT.money }, align: { 0:'center' }, total: ['', '', '', '', `รวม ${fmtNum(list.length)} เที่ยว`, s.all, ''] });
  if (s.paid) X.kv(ws, [['จ่ายแล้ว', s.paid, X.FMT.money]]);
  X.kv(ws, [['ยอดที่ขอเบิก', s.due, X.FMT.money]]);
  X.gap(ws, 24);
  X.line(ws, 'ลงชื่อ ............................ คนขับ (ผู้ขอเบิก)     ลงชื่อ ............................ ผู้ตรวจสอบ     ลงชื่อ ............................ ผู้อนุมัติจ่าย');
  await X.save(wb, `ค่ารอบ_${driverName(d)}_${o.from || 'แรกสุด'}_${o.to || todayYmd()}`);
}

/* ---------- หน้าต่างเลือกช่วง ---------- */
export function payReportDialog(driverId){
  const d = getDriver(driverId);
  if (!d) return toast('ไม่พบข้อมูลคนขับ', 'err');
  modal({
    title: '🧾 รีพอร์ตค่ารอบ',
    draftKey: `payreport:${driverId}`,
    reopen: { name:'payreport', args:{ driverId } },
    body: `
<p class="small">สรุปค่ารอบของ <strong>${esc(driverName(d))}</strong> — ปริ้นแล้วส่งให้ฝ่ายบัญชีโอนเงิน</p>
<div class="grid g2" style="gap:12px;margin-top:12px">
  <label class="field"><span class="label">ตั้งแต่วันที่</span><input class="input" type="date" data-from value="${monthStart()}"></label>
  <label class="field"><span class="label">ถึงวันที่</span><input class="input" type="date" data-to value="${todayYmd()}"></label>
</div>
<label class="row gap-8" style="margin-top:12px;align-items:center;cursor:pointer">
  <input type="checkbox" data-unpaid checked style="width:22px;height:22px">
  <span>เฉพาะที่ยังไม่ได้รับเงิน</span>
</label>
<div class="pr-preview" data-preview style="margin-top:14px"></div>`,
    foot: `<button class="btn btn-ghost" data-close>ปิด</button>
           <button class="btn btn-ghost" data-xlsx>⬇ บันทึกเป็นไฟล์ตาราง</button>
           <button class="btn btn-accent" data-print>🖨 ปริ้น / บันทึกเป็นไฟล์</button>`,
    onMount(root){
      const opts = () => ({
        from: root.querySelector('[data-from]').value,
        to: root.querySelector('[data-to]').value,
        unpaidOnly: root.querySelector('[data-unpaid]').checked,
      });
      const paint = () => {
        const list = payReportRows(driverId, opts());
        const s = sumOf(list);
        root.querySelector('[data-preview]').innerHTML = list.length ? `
          <div class="pr-sum"><span>${fmtNum(list.length)} เที่ยว</span><b>${esc(fmtBaht(s.all))}</b></div>
          ${s.paid ? `<p class="tiny dim">จ่ายแล้ว ${esc(fmtBaht(s.paid))} · ยังไม่ได้รับ <b>${esc(fmtBaht(s.due))}</b></p>` : ''}
          <ul class="pr-list">${list.slice(0, 40).map(r => `
            <li><span>${esc(fmtDate(r.date))} · เที่ยว ${esc(r.j.code)}</span><span class="tnum">${esc(fmtBaht(r.total))}${r.paid ? ' ✓' : ''}</span></li>`).join('')}
          </ul>${list.length > 40 ? `<p class="tiny dim">… และอีก ${fmtNum(list.length - 40)} เที่ยว (อยู่ในใบครบ)</p>` : ''}`
          : '<p class="small dim">ไม่มีค่ารอบในช่วงที่เลือก — ลองขยายช่วงวันที่ หรือเอาติ๊ก "เฉพาะที่ยังไม่ได้รับเงิน" ออก</p>';
        root.querySelector('[data-print]').disabled = !list.length;
        root.querySelector('[data-xlsx]').disabled = !list.length;
      };
      root.addEventListener('input', paint);
      root.addEventListener('change', paint);
      paint();
      root.querySelector('[data-print]').onclick = () => {
        try{ printPayReport(d, payReportRows(driverId, opts()), opts()); }catch(err){ toast(err.message, 'err'); }
      };
      root.querySelector('[data-xlsx]').onclick = async (e) => {
        const b = e.currentTarget;
        b.disabled = true; b.textContent = 'กำลังสร้างไฟล์ตาราง…';
        try{ await payReportXlsx(d, payReportRows(driverId, opts()), opts()); toast('บันทึกไฟล์ตารางแล้ว', 'ok'); }
        catch(err){ console.error('[payReport]', err); toast(err.message || 'บันทึกไฟล์ตารางไม่สำเร็จ', 'err'); }
        b.disabled = false; b.textContent = '⬇ บันทึกเป็นไฟล์ตาราง';
      };
    },
  });
}
