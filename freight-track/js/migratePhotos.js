/* ============================================================
   migratePhotos.js — ย้ายรูป base64 ขึ้น Firebase Storage

   ใช้ครั้งเดียวหลัง Storage กลับมาใช้ได้ (เคสวันที่ 20 ก.ย. — free trial
   หมดอายุ บัญชีจ่ายเงินถูกปิด รูปที่ถ่ายช่วงนั้นเลยตกไปเก็บเป็น base64)

   งานหนักอยู่ใน store.js ทั้งหมด (scanLocalPhotos / migrateLocalPhotos)
   ไฟล์นี้ทำแค่หน้าจอกับการยืนยัน
   ============================================================ */

import { shell, $, esc, toast, confirmDialog } from './ui.js';
import { scanLocalPhotos, migrateLocalPhotos, fmtNum, META } from './store.js';
import { cloudReady, onCloud } from './cloud.js';
import { gate } from './auth.js';

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('migrate');
shell({ role: 'เครื่องมือ' });

let stopped = false;
let running = false;

const fmtSize = (b) => b < 1024 * 1024
  ? `${(b / 1024).toFixed(0)} KB`
  : `${(b / 1024 / 1024).toFixed(2)} MB`;

const labelOf = (st) => META[st]?.label || st;
/** ป้ายของรูปหนึ่งใบ — รูปชำระเงินไม่ได้อยู่ในขั้นของงาน จึงบอกเป็นรอบที่บันทึกแทน */
const slotLabel = (sl) => sl.field === 'payment' ? `หลักฐานชำระเงิน รอบที่ ${sl.round}`
  : sl.field === 'invret' ? `รูปเอกสาร Inv. ที่คืน รอบที่ ${sl.round}`
  : `ขั้น "${labelOf(sl.status)}"${sl.field === 'signature' ? ' · ลายเซ็น' : ''}`;

/* ---------- บันทึกการทำงาน -------------------------------- */
function logLine(html, tone = ''){
  $('#logWrap').hidden = false;
  const box = $('#log');
  const row = document.createElement('div');
  row.style.padding = '3px 0';
  if (tone) row.className = tone;
  row.innerHTML = html;
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

/* ---------- 1. สแกน --------------------------------------- */
function paintScan(){
  const { items, total, bytes, invoices } = scanLocalPhotos();
  const out = $('#scanOut');

  if (!total){
    out.innerHTML = `
      <div class="panel" style="border-color:var(--green,#1e8449)">
        <p class="strong" style="margin:0;font-size:14px">ไม่มีรูปค้างแล้ว</p>
        <p class="tiny dim" style="margin:6px 0 0">รูปหลักฐานทุกใบในฐานข้อมูลเป็น URL คลาวด์หมดแล้ว</p>
      </div>
      ${invoices ? `<p class="tiny dim" style="margin-top:10px">
        (ยังมีไฟล์ใบแจ้งหนี้ฝังในฐานข้อมูล ${fmtNum(invoices)} ใบ — คนละเรื่องกัน ดูหมายเหตุท้ายหน้า)</p>` : ''}`;
    $('#runBox').hidden = true;
    return 0;
  }

  /* สรุปว่ากระจุกอยู่ที่ไหนบ้าง จะได้รู้ว่างานใหญ่แค่ไหนก่อนกด */
  const byDoc = new Map();
  items.forEach(x => {
    const k = `${x.kind} ${x.code}`;
    byDoc.set(k, (byDoc.get(k) || 0) + 1);
  });
  const rows = [...byDoc.entries()].sort((a, b) => b[1] - a[1]);

  out.innerHTML = `
    <div class="stat" style="display:flex;gap:22px;flex-wrap:wrap;align-items:baseline">
      <div><b style="font-size:20px;font-weight:600">${fmtNum(total)}</b>
        <span style="font-size:11.5px;color:var(--text-3);display:block">รูปที่ยังไม่ขึ้นคลาวด์</span></div>
      <div><b style="font-size:20px;font-weight:600">${esc(fmtSize(bytes))}</b>
        <span style="font-size:11.5px;color:var(--text-3);display:block">กินพื้นที่ในเครื่องอยู่</span></div>
      <div><b style="font-size:20px;font-weight:600">${fmtNum(rows.length)}</b>
        <span style="font-size:11.5px;color:var(--text-3);display:block">เที่ยว/จุดส่งที่เกี่ยวข้อง</span></div>
    </div>

    <div class="log" style="margin-top:14px;max-height:200px">
      ${rows.slice(0, 40).map(([k, n]) =>
        `<div style="padding:3px 0">${esc(k)} — ${fmtNum(n)} รูป</div>`).join('')}
      ${rows.length > 40 ? `<div style="padding:3px 0" class="dim">และอีก ${fmtNum(rows.length - 40)} รายการ</div>` : ''}
    </div>

    ${invoices ? `<p class="tiny dim" style="margin-top:10px">
      หมายเหตุ: มีไฟล์ใบแจ้งหนี้ฝังในฐานข้อมูลอีก ${fmtNum(invoices)} ใบ —
      <b>ตัวนี้ไม่ย้ายให้</b> เพราะเป็น PDF ได้ ซึ่ง <span class="mono">storage.rules</span> อนุญาตเฉพาะรูปภาพ</p>` : ''}`;

  $('#runBox').hidden = false;
  return total;
}

$('#scanBtn').onclick = () => {
  const n = paintScan();
  toast(n ? `เจอรูปค้าง ${fmtNum(n)} ใบ` : 'ไม่มีรูปค้างแล้ว', n ? 'warn' : 'ok');
};

/* ---------- 2. ย้าย --------------------------------------- */
function setBusy(on){
  running = on;
  $('#tryOne').disabled = on;
  $('#runAll').disabled = on;
  $('#scanBtn').disabled = on;
  $('#stopBtn').hidden = !on;
}

async function run(limit){
  if (running) return;
  if (!cloudReady()) return toast('ยังต่อคลาวด์ไม่ได้ — ต่ออินเทอร์เน็ตแล้วลองใหม่', 'err', 4000);

  stopped = false;
  setBusy(true);
  $('#progWrap').hidden = false;
  $('#progBar').style.width = '0%';

  logLine(`<b>เริ่มย้าย${limit === 1 ? ' (ทดลอง 1 รูป)' : 'ทั้งหมด'}</b> — ${esc(new Date().toLocaleTimeString('th-TH'))}`);

  try{
    const r = await migrateLocalPhotos({
      limit,
      shouldStop: () => stopped,
      onProgress({ done, total, slot }){
        const pct = Math.round(done / total * 100);
        $('#progBar').style.width = pct + '%';
        $('#progNum').textContent = `${fmtNum(done)} / ${fmtNum(total)}`;
        $('#progText').textContent =
          `${slot.kind} ${slot.code} · ${slotLabel(slot)}`;
      },
    });

    if (r.moved) logLine(`ย้ายขึ้นคลาวด์แล้ว <b>${fmtNum(r.moved)}</b> รูป · คืนพื้นที่ในเครื่อง ${esc(fmtSize(r.freedBytes))}`, 'ok');
    if (r.failed) logLine(`ย้ายไม่สำเร็จ <b>${fmtNum(r.failed)}</b> รูป (ยังเป็น base64 เหมือนเดิม ไม่หาย)`, 'bad');
    r.errors.slice(0, 20).forEach(e => logLine(esc(e), 'bad'));
    if (r.errors.length > 20) logLine(`และอีก ${fmtNum(r.errors.length - 20)} รายการ`, 'bad');
    if (stopped) logLine('หยุดกลางคันตามที่สั่ง — ของที่ย้ายไปแล้วบันทึกเรียบร้อย');

    toast(r.failed ? `ย้ายได้ ${r.moved} · ไม่ผ่าน ${r.failed}` : `ย้ายเสร็จ ${r.moved} รูป`,
          r.failed ? 'warn' : 'ok', 4000);
  }catch(err){
    logLine(esc(err.message), 'bad');
    toast(err.message, 'err', 4000);
  }finally{
    setBusy(false);
    $('#progWrap').hidden = true;
    paintScan();          /* สแกนซ้ำให้เห็นยอดคงเหลือทันที */
  }
}

$('#tryOne').onclick = () => run(1);

$('#runAll').onclick = async () => {
  const { total, bytes } = scanLocalPhotos();
  if (!total) return toast('ไม่มีรูปค้างแล้ว', 'ok');

  const ok = await confirmDialog({
    title: `ย้าย ${fmtNum(total)} รูปขึ้นคลาวด์`,
    message: `อัปทีละใบขึ้น Firebase Storage แล้วเก็บแค่ URL แทน base64 `
           + `(${fmtSize(bytes)}) · จำนวนรูปในแต่ละขั้นไม่เปลี่ยน · `
           + `ใบไหนอัปไม่ผ่านจะคงเป็น base64 ไว้เหมือนเดิม ไม่หาย · กดหยุดกลางคันได้`,
    ok: 'เริ่มย้าย',
  });
  if (ok) run(Infinity);
};

$('#stopBtn').onclick = () => {
  stopped = true;
  $('#stopBtn').disabled = true;
  logLine('สั่งหยุด — รอให้รูปใบที่กำลังอัปอยู่จบก่อน…');
};

/* สแกนให้เลยตอนเปิดหน้า พอคลาวด์พร้อม (ต้องรู้ว่าต่อได้ก่อนถึงจะย้ายได้) */
onCloud(() => paintScan());
