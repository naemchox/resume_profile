/* ============================================================
   billView.js — ใบวางบิลฝั่งลูกค้า (bill.html?k=รหัส)

   เปิดได้โดยไม่ต้องล็อกอิน — รหัสในลิงก์คือรหัสเอกสาร bills/{รหัส}
   ลูกค้าทำได้ 4 อย่าง (เขียนเฉพาะช่อง reply ตามกฎฐานข้อมูล)
     1. รับบิล        ใส่ชื่อผู้รับ
     2. นัดวันชำระ    วันที่ + หมายเหตุ
     3. วิธีชำระ      จ่ายทีเดียวทั้งหมด / แยกจ่ายทีละบิล (เปลี่ยนได้จนกว่าจะแจ้งชำระครั้งแรก)
     4. แจ้งชำระเงิน  วันที่ ช่องทาง ยอด และแนบสลิป — ทั้งใบ หรือทีละบิล (ยอดล็อกเท่ายอดบิล)
   ฝั่งเรา (billing.html) เห็นทันที แล้วกด "ยืนยันรับเงิน" เมื่อตรวจแล้ว

   ?print=1 — เปิดหน้าพิมพ์ทันที (ปุ่ม "พิมพ์" ในหน้ารายได้·วางบิล)
   ============================================================ */

import { shell, $, esc, toast } from './ui.js';
import { gate, getSession } from './auth.js';
import { COMPANY } from './config.js';
import {
  METHODS, SLIP_MAX, watchBill, saveReply, uploadSlip, billDocHtml, ourState, custState, overdueDays,
  thDate, thDateTime, baht, todayYMD, billXlsx, PAY_MODES, payModeOf, hasNotice, payItems,
} from './bills.js';

await gate('bill');
shell({ role: 'ใบวางบิล', nav: false });

const params = new URLSearchParams(location.search);
const id = (params.get('k') || '').trim();
const wantPrint = params.get('print') === '1';
const isStaff = getSession().kind === 'staff';

let bill = null;
let shownSig = '';
let printed = false;
let busy = false;

function dead(title, text){
  $('#title').textContent = title;
  $('#sub').textContent = '';
  $('#printBtn').hidden = true;
  $('#xlsxBtn').hidden = true;
  $('#actions').innerHTML = '';
  $('#doc').innerHTML = '';
  $('#state').innerHTML = `<div class="card card-pad empty"><div class="empty-mark">฿</div>
    <p class="strong">${esc(title)}</p>
    <p class="small dim" style="margin-top:6px">${esc(text)}</p></div>`;
}

if (!/^[A-Za-z0-9]{16,40}$/.test(id)){
  dead('ลิงก์นี้ใช้ไม่ได้', 'ลิงก์อาจคัดลอกมาไม่ครบ — ขอลิงก์ใหม่จากขนส่งตัวอย่าง');
} else {
  watchBill(id, (b, err) => {
    if (!b){
      if (err === 'offline') return dead('เปิดใบวางบิลไม่ได้', 'ตรวจอินเทอร์เน็ตแล้วรีเฟรชหน้าอีกครั้ง');
      return dead('ลิงก์นี้ใช้ไม่ได้', `ลิงก์อาจถูกปิดหรือเปลี่ยนใหม่แล้ว — ติดต่อขนส่งตัวอย่าง${COMPANY.contact ? ` โทร ${COMPANY.contact}` : ''} เพื่อขอลิงก์ล่าสุด`);
    }
    bill = b;
    paint();
    markViewed();
  });
}

/* เปิดดูครั้งแรก — ให้ฝั่งเรารู้ว่าลูกค้าเห็นบิลแล้ว (พนักงานเปิดดู/พิมพ์ไม่นับ) */
let viewSent = false;
function markViewed(){
  if (viewSent || isStaff || !bill || bill.status !== 'open' || bill.linkActive !== true || bill.reply?.viewedAt) return;
  viewSent = true;
  saveReply(bill.id, { viewedAt: new Date().toISOString() }).catch(() => { viewSent = false; });
}

function paint(){
  const b = bill;
  const our = ourState(b), cust = custState(b), late = overdueDays(b);
  $('#title').textContent = `ใบวางบิล ${b.docNo || ''}`.trim();
  $('#sub').textContent = `จาก ${COMPANY.name} ถึง ${b.billTo?.name || 'ลูกค้า'}`;
  $('#printBtn').hidden = false;
  $('#xlsxBtn').hidden = false;
  document.title = `ใบวางบิล ${b.docNo || ''} · ${COMPANY.name}`;

  const r = b.reply || {};
  $('#state').innerHTML = `
    <div class="card card-pad billstate" data-tone="${b.status === 'paid' ? 'done' : late ? 'late' : b.status === 'cancelled' ? 'grey' : 'open'}">
      <div class="billstate-total">
        <span class="small dim">ยอดชำระ</span>
        <span class="billstate-amt">${esc(baht(b.total))} <small>บาท</small></span>
      </div>
      <dl class="billstate-kv">
        <div><dt>ครบกำหนด</dt><dd>${esc(thDate(b.dueDate))}${late ? ` <span class="pill" data-tone="stop">เกินกำหนด ${late} วัน</span>` : ''}</dd></div>
        <div><dt>สถานะ</dt><dd><span class="pill" data-tone="${our.tone}">${esc(our.label)}</span></dd></div>
        ${r.receivedAt ? `<div><dt>รับบิลแล้ว</dt><dd>${esc(r.receivedBy || '')} · ${esc(thDateTime(r.receivedAt))}</dd></div>` : ''}
        ${r.promiseDate ? `<div><dt>นัดชำระ</dt><dd>${esc(thDate(r.promiseDate))}</dd></div>` : ''}
        ${b.status === 'paid' ? `<div><dt>ชำระเมื่อ</dt><dd>${esc(thDate(b.paid?.date))}${b.paid?.method ? ` · ${esc(b.paid.method)}` : ''}</dd></div>` : ''}
      </dl>
    </div>`;

  /* วาดฟอร์มใหม่เฉพาะเมื่อสถานะเปลี่ยน — ไม่งั้นข้อความที่ลูกค้ากำลังพิมพ์จะหาย */
  const sig = JSON.stringify([b.status, b.linkActive, r, b.total, cust.key, b.paidItems || null]);
  if (sig !== shownSig && !busy){ shownSig = sig; paintActions(); }

  $('#doc').innerHTML = `<div class="billdoc-wrap">${billDocHtml(b, COMPANY)}</div>`;

  if (wantPrint && !printed){ printed = true; setTimeout(() => print(), 400); }
}

$('#printBtn').addEventListener('click', () => print());
$('#xlsxBtn').addEventListener('click', async (e) => {
  if (!bill) return;
  const btn = e.currentTarget;
  btn.disabled = true;
  try{ await billXlsx(bill, COMPANY); toast('บันทึกใบวางบิลเป็น Excel แล้ว', 'ok'); }
  catch(err){ console.error('[bill] Excel', err); toast(err.message || 'บันทึก Excel ไม่สำเร็จ', 'err'); }
  finally{ btn.disabled = false; }
});

/* ---------- ฟอร์มฝั่งลูกค้า -------------------------------- */
/** บิลหนึ่งใบในโหมดแยกจ่าย — สถานะ + ฟอร์มแจ้งชำระของบิลนั้น (ยอดล็อกเท่ายอดบิล) */
function itemHtml({ it, k, notice: nt, paid }){
  const inv = (it.invoices || []).join(', ') || it.code || '—';
  return `
  <div class="billeach-row${paid ? ' is-paid' : nt ? ' is-sent' : ''}">
    <div class="billeach-head">
      <span><b class="mono">${esc(inv)}</b><br><span class="small dim">${esc(it.dests || '')}</span></span>
      <span class="mono strong">${esc(baht(it.amount))} บาท</span>
    </div>
    ${paid ? `<p class="small" style="color:var(--green)">✓ ยืนยันรับเงินแล้ว · ${esc(paid.method || '')} · ${esc(thDate(paid.date))}</p>`
      : `${nt ? `<p class="small">✓ แจ้งชำระแล้ว · ${esc(nt.method)} · ${esc(thDate(nt.date))}${nt.slipUrl ? ` · <a href="${esc(nt.slipUrl)}" target="_blank" rel="noopener">ดูสลิป</a>` : ''}
          <br><span class="dim">รอขนส่งตัวอย่างตรวจและยืนยันรับเงิน</span></p>` : ''}
      <details${nt ? '' : ' open'}>
        <summary class="small strong">${nt ? 'แก้การแจ้งชำระบิลนี้' : 'แจ้งชำระบิลนี้'}</summary>
        <form class="billform" data-form="notice-item" data-k="${esc(k)}">
          <div class="billform-row">
            <label class="field"><span class="small strong">วันที่ชำระ</span>
              <input class="input" type="date" name="date" required value="${esc(nt?.date || todayYMD())}"></label>
            <label class="field"><span class="small strong">ช่องทาง</span>
              <select class="input" name="method" required>
                ${METHODS.map(m => `<option${(nt?.method || METHODS[0]) === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}
              </select></label>
          </div>
          <label class="field"><span class="small strong">แนบสลิป / หลักฐาน <span class="dim" data-slip-hint>(รูปหรือ PDF ไม่เกิน 5 MB)</span></span>
            <input class="input" type="file" name="slip" accept="image/*,application/pdf"></label>
          <button class="btn btn-accent" type="submit">${nt ? 'ส่งแจ้งชำระใหม่' : `ส่งแจ้งชำระ ${esc(baht(it.amount))} บาท`}</button>
        </form>
      </details>`}
  </div>`;
}

function paintActions(){
  const b = bill, r = b.reply || {};
  const box = $('#actions');
  if (b.status === 'paid'){
    box.innerHTML = `<div class="card card-pad billdone">✓ ชำระเรียบร้อยแล้ว — ขอบคุณที่ใช้บริการ${COMPANY.name ? ` ${esc(COMPANY.name)}` : ''}</div>`;
    return;
  }
  if (b.status !== 'open'){
    box.innerHTML = `<div class="card card-pad billdone" data-tone="grey">ใบวางบิลนี้ถูกยกเลิกแล้ว${b.cancel?.reason ? ` — ${esc(b.cancel.reason)}` : ''}</div>`;
    return;
  }
  if (isStaff && b.linkActive !== true){
    box.innerHTML = `<div class="card card-pad billdone" data-tone="grey">ลิงก์ของใบนี้ถูกปิดอยู่ — ลูกค้าเปิดไม่ได้ (คุณเห็นเพราะล็อกอินฝั่ง Back office)</div>`;
    return;
  }
  const n = r.notice || null;
  const received = !!r.receivedAt;
  const mode = payModeOf(b);
  const locked = hasNotice(b) || Object.keys(b.paidItems || {}).length > 0;
  /* ใบที่แจ้งชำระไปก่อนมีขั้นนี้ (ไม่มี payMode) = จ่ายทีเดียวทั้งหมด */
  const chosen = !!r.payMode || hasNotice(b);
  const ready = received && chosen;
  const items = payItems(b);
  box.innerHTML = `
  <div class="billsteps">
    <div class="card card-pad billstep${received ? ' is-done' : ''}">
      <h3 class="billstep-h"><span class="billstep-n">1</span>รับบิล</h3>
      ${received
        ? `<p class="small">✓ รับบิลแล้วโดย <b>${esc(r.receivedBy || '—')}</b> · ${esc(thDateTime(r.receivedAt))}</p>`
        : `<p class="small dim">ตรวจรายการด้านล่าง แล้วกด “ยืนยันรับบิล”</p>
           <form class="billform" data-form="receive">
             <label class="field"><span class="small strong">ชื่อผู้รับบิล</span>
               <input class="input" name="who" maxlength="100" required autocomplete="name" placeholder="ชื่อ-นามสกุล หรือฝ่ายที่รับ"></label>
             <button class="btn btn-accent" type="submit">ยืนยันรับบิล</button>
           </form>`}
    </div>

    <div class="card card-pad billstep${r.promiseDate ? ' is-done' : ''}${received ? '' : ' is-locked'}">
      <h3 class="billstep-h"><span class="billstep-n">2</span>นัดวันชำระ</h3>
      ${r.promiseDate ? `<p class="small">✓ นัดชำระ <b>${esc(thDate(r.promiseDate))}</b>${r.note ? ` · ${esc(r.note)}` : ''}</p>` : ''}
      ${received ? `
        <form class="billform" data-form="promise">
          <label class="field"><span class="small strong">${r.promiseDate ? 'เปลี่ยนวันนัดชำระ' : 'วันที่จะชำระ'}</span>
            <input class="input" type="date" name="date" required min="${esc(b.issueDate || '')}" value="${esc(r.promiseDate || b.dueDate || '')}"></label>
          <label class="field"><span class="small strong">หมายเหตุ <span class="dim">(ไม่บังคับ)</span></span>
            <input class="input" name="note" maxlength="500" value="${esc(r.note || '')}" placeholder="เช่น จ่ายรอบวางบิลสิ้นเดือน"></label>
          <button class="btn" type="submit">บันทึกวันนัดชำระ</button>
        </form>` : '<p class="small dim">กดรับบิลก่อน แล้วค่อยนัดวันชำระ</p>'}
    </div>

    <div class="card card-pad billstep${chosen ? ' is-done' : ''}${received ? '' : ' is-locked'}">
      <h3 class="billstep-h"><span class="billstep-n">3</span>วิธีชำระ</h3>
      ${chosen ? `<p class="small">✓ ${esc(PAY_MODES[mode])}${mode === 'each' ? ` · ${(b.items || []).length} บิล` : ''}</p>` : ''}
      ${!received ? '<p class="small dim">กดรับบิลก่อน แล้วค่อยเลือกวิธีชำระ</p>'
        : locked ? '<p class="small dim">แจ้งชำระไปแล้ว — เปลี่ยนวิธีชำระไม่ได้ ติดต่อขนส่งตัวอย่างถ้าต้องการเปลี่ยน</p>'
        : `<form class="billform" data-form="mode">
            ${Object.entries(PAY_MODES).map(([k, label]) => `
            <label class="billmode"><input type="radio" name="mode" value="${k}" ${(r.payMode || 'all') === k ? 'checked' : ''}>
              <span><b>${esc(label)}</b><br><span class="small dim">${k === 'all'
                ? `แจ้งชำระครั้งเดียว ${esc(baht(b.total))} บาท`
                : `แจ้งชำระแยกทีละ Invoice (${(b.items || []).length} บิล) ยอดตามแต่ละบิล`}</span></span></label>`).join('')}
            <button class="btn" type="submit">${r.payMode ? 'เปลี่ยนวิธีชำระ' : 'บันทึกวิธีชำระ'}</button>
          </form>`}
    </div>

    <div class="card card-pad billstep${(mode === 'all' ? n : items.every(p => p.notice || p.paid)) ? ' is-done' : ''}${ready ? '' : ' is-locked'}${ready && mode === 'each' ? ' is-wide' : ''}">
      <h3 class="billstep-h"><span class="billstep-n">4</span>แจ้งชำระเงิน</h3>
      ${!ready ? `<p class="small dim">${received ? 'เลือกวิธีชำระก่อน แล้วค่อยแจ้งชำระ' : 'กดรับบิลก่อน แล้วค่อยแจ้งชำระ'}</p>`
        : mode === 'all' ? `
      ${n ? `<p class="small">✓ แจ้งชำระแล้ว ${esc(baht(n.amount))} บาท · ${esc(n.method)} · ${esc(thDate(n.date))}
              ${n.slipUrl ? ` · <a href="${esc(n.slipUrl)}" target="_blank" rel="noopener">ดูสลิป</a>` : ''}
              <br><span class="dim">รอขนส่งตัวอย่างตรวจและยืนยันรับเงิน</span></p>` : ''}
        <form class="billform" data-form="notice">
          <div class="billform-row">
            <label class="field"><span class="small strong">วันที่ชำระ</span>
              <input class="input" type="date" name="date" required value="${esc(n?.date || todayYMD())}"></label>
            <label class="field"><span class="small strong">ช่องทาง</span>
              <select class="input" name="method" required>
                ${METHODS.map(m => `<option${(n?.method || METHODS[0]) === m ? ' selected' : ''}>${esc(m)}</option>`).join('')}
              </select></label>
            <label class="field"><span class="small strong">ยอดที่ชำระ (บาท)</span>
              <input class="input tnum" type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" required value="${esc(n?.amount ?? b.total)}"></label>
          </div>
          <label class="field"><span class="small strong">แนบสลิป / หลักฐาน <span class="dim" data-slip-hint>(รูปหรือ PDF ไม่เกิน 5 MB)</span></span>
            <input class="input" type="file" name="slip" accept="image/*,application/pdf"></label>
          <button class="btn btn-accent" type="submit">${n ? 'ส่งแจ้งชำระใหม่' : 'ส่งแจ้งชำระ'}</button>
        </form>` : `
      <p class="small dim">แจ้งแล้ว ${items.filter(p => p.notice).length}/${items.length} บิล · ยืนยันรับเงินแล้ว ${items.filter(p => p.paid).length}/${items.length} บิล</p>
      <div class="billeach">${items.map(p => itemHtml(p)).join('')}</div>`}
    </div>
  </div>`;

  /* ช่องสลิปบอกว่าจำเป็นไหม — ฟอร์มทั้งใบ และฟอร์มรายบิลแต่ละใบ */
  const hint = (f) => {
    const old = f.dataset.form === 'notice' ? n : (r.notices || {})[f.dataset.k];
    const need = f.elements.method.value === 'เงินโอน' && !old?.slipUrl;
    f.querySelector('[data-slip-hint]').textContent = need ? '(จำเป็นสำหรับเงินโอน · รูปหรือ PDF ไม่เกิน 5 MB)' : '(รูปหรือ PDF ไม่เกิน 5 MB)';
  };
  box.querySelectorAll('[data-form="notice"], [data-form="notice-item"]').forEach(f => {
    f.elements.method.addEventListener('change', () => hint(f));
    hint(f);
  });
}

$('#actions').addEventListener('submit', async (e) => {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  if (busy) return;
  const btn = f.querySelector('[type="submit"]');
  const label = btn.textContent;
  const kind = f.dataset.form;
  const now = new Date().toISOString();
  let saved = false;
  try{
    let fields, msg;
    if (kind === 'receive'){
      const name = f.elements.who.value.trim();
      if (!name) return toast('ใส่ชื่อผู้รับบิลก่อน', 'err');
      fields = { receivedAt: now, receivedBy: name };
      msg = 'รับบิลแล้ว';
    } else if (kind === 'mode'){
      const mode = f.elements.mode.value;
      if (!PAY_MODES[mode]) return toast('เลือกวิธีชำระก่อน', 'err');
      if (hasNotice(bill)) return toast('แจ้งชำระไปแล้ว — เปลี่ยนวิธีชำระไม่ได้', 'err');
      fields = { payMode: mode };
      msg = `เลือก "${PAY_MODES[mode]}" แล้ว`;
    } else if (kind === 'notice-item'){
      const k = f.dataset.k;
      const it = (bill.items || [])[Number(k)];
      if (!it) return toast('ไม่พบบิลนี้ในใบ — รีเฟรชหน้าแล้วลองใหม่', 'err');
      if (bill.paidItems?.[k]) return toast('บิลนี้ยืนยันรับเงินแล้ว', 'info');
      if (!f.elements.date.value) return toast('ใส่วันที่ชำระก่อน', 'err');
      const file = f.elements.slip.files[0] || null;
      const old = bill.reply?.notices?.[k];
      if (f.elements.method.value === 'เงินโอน' && !file && !old?.slipUrl) return toast('เงินโอน — แนบสลิปการโอนก่อนส่ง', 'err');
      if (file && !file.type.startsWith('image/') && file.size > SLIP_MAX) return toast('ไฟล์ใหญ่เกิน 5 MB', 'err');
      busy = true; btn.disabled = true; btn.textContent = file ? 'กำลังอัปโหลดสลิป…' : 'กำลังส่ง…';
      const slip = file ? await uploadSlip(bill.id, file) : (old?.slipUrl ? { url: old.slipUrl, name: old.slipName || '' } : null);
      /* ยอดล็อกเท่ายอดบิล (ยังไม่รองรับจ่ายไม่ครบ) · noticeKey = รายการที่แก้ (กฎฐานข้อมูลตรวจทีละรายการ) */
      fields = { [`notices.${k}`]: {
        date: f.elements.date.value, method: f.elements.method.value, amount: Math.round((Number(it.amount) || 0) * 100) / 100,
        slipUrl: slip?.url || '', slipName: slip?.name || '', at: now,
      }, noticeKey: k };
      msg = `ส่งแจ้งชำระบิล ${(it.invoices || [])[0] || it.code || ''} แล้ว — รอขนส่งตัวอย่างยืนยันรับเงิน`;
    } else if (kind === 'promise'){
      if (!f.elements.date.value) return toast('เลือกวันที่จะชำระก่อน', 'err');
      fields = { promiseDate: f.elements.date.value, note: f.elements.note.value.trim() };
      msg = 'บันทึกวันนัดชำระแล้ว';
    } else {
      const amount = Math.round(Number(f.elements.amount.value) * 100) / 100;
      if (!f.elements.date.value) return toast('ใส่วันที่ชำระก่อน', 'err');
      if (!(amount > 0)) return toast('ใส่ยอดที่ชำระก่อน', 'err');
      const file = f.elements.slip.files[0] || null;
      const old = bill.reply?.notice;
      if (f.elements.method.value === 'เงินโอน' && !file && !old?.slipUrl) return toast('เงินโอน — แนบสลิปการโอนก่อนส่ง', 'err');
      if (file && !file.type.startsWith('image/') && file.size > SLIP_MAX) return toast('ไฟล์ใหญ่เกิน 5 MB', 'err');   /* รูปถูกย่อเหลือ 300 KB ตอนอัปอยู่แล้ว */
      busy = true; btn.disabled = true; btn.textContent = file ? 'กำลังอัปโหลดสลิป…' : 'กำลังส่ง…';
      const slip = file ? await uploadSlip(bill.id, file) : (old?.slipUrl ? { url: old.slipUrl, name: old.slipName || '' } : null);
      fields = { notice: {
        date: f.elements.date.value, method: f.elements.method.value, amount,
        slipUrl: slip?.url || '', slipName: slip?.name || '', at: now,
      } };
      msg = 'ส่งแจ้งชำระแล้ว — รอขนส่งตัวอย่างยืนยันรับเงิน';
    }
    busy = true; btn.disabled = true; if (btn.textContent === label) btn.textContent = 'กำลังบันทึก…';
    await saveReply(bill.id, fields);
    saved = true;
    toast(msg, 'ok');
  }catch(err){
    toast(err.message || 'บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง', 'err');
  }finally{
    busy = false;
    btn.disabled = false; btn.textContent = label;
    /* บันทึกสำเร็จ = วาดฟอร์มใหม่ตามข้อมูลล่าสุด · กรอกไม่ครบ/ส่งไม่ผ่าน = คงที่ลูกค้ากรอกไว้ */
    if (saved){ shownSig = ''; if (bill) paint(); }
  }
});
