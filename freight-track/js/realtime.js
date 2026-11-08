/* ============================================================
   realtime.js — หน้าต่างของงานด่วน (Real-Time) ในหน้า ops
   ก. + งานด่วน          เที่ยวใหม่ทั้งเที่ยว (ปุ่มหัวหน้า)
   ข. + เพิ่มจุดส่งด่วน    เข้าเที่ยวที่เปิดดูอยู่
   ปิดงาน               เติมเลข Invoice / มูลค่า / Shipment No. ให้ครบเหมือนงานปกติ
   กติกาทั้งหมดอยู่ใน store.js (createRealtimeJob / addRealtimeStop / closeRealtimeStop)
   ============================================================ */

import { esc, toast, modal, close } from './ui.js';
import {
  createRealtimeJob, addRealtimeStop, closeRealtimeStop, rtMissing, isRtCode,
  listDrivers, fmtBaht, fmtNum,
  driverName, RT_DOC_TYPES, RT_DOC_OTHER,
} from './store.js';
import { unmatchedRows, hasSyncedRows } from './opsAuto.js';

const BY = { byRole:'ops', byName:'ทีมคลังบางนา' };

/* ---------- เลข Invoice ซ้ำ (31 ต.ค.) ------------------------
   งานด่วนใช้เลข Invoice ที่มีในระบบแล้วได้ (เช่น ส่งใหม่หลังส่งไม่สำเร็จ) แต่ต้องกดยืนยันก่อน
   modal() เปิดได้ทีละใบ — กล่องถามจึงซ้อนอยู่บนหน้าต่างเดิม (css/office.css .rt-dupask) ข้อมูลที่กรอกไว้ไม่หาย */
export function askDupInv(root, err, what = 'สร้างงานด่วน'){
  return new Promise((res) => {
    const box = document.createElement('div');
    box.className = 'rt-dupask';
    box.innerHTML = `
      <div class="rt-dupask-card" role="alertdialog" aria-modal="true">
        <p class="strong" style="margin:0 0 6px">⚠ เลข Invoice ซ้ำ</p>
        <p class="small muted" style="margin:0">${esc(err.message)}</p>
        <p class="small" style="margin:10px 0 0">ยืนยันจะ${esc(what)}ด้วยเลขนี้ใช่ไหม? ระบบจะใช้เลขต่อท้าย (เช่น -2) และติดป้ายเลขบิลซ้ำให้ทุกบิลของเลขนี้</p>
        <div class="row gap-8" style="justify-content:flex-end;margin-top:14px">
          <button type="button" class="btn btn-ghost" data-dupno>ยกเลิก</button>
          <button type="button" class="btn btn-accent" data-dupyes>ยืนยัน${esc(what)}</button>
        </div>
      </div>`;
    const done = (v) => { box.remove(); res(v); };
    box.querySelector('[data-dupno]').onclick = () => done(false);
    box.querySelector('[data-dupyes]').onclick = () => done(true);
    document.body.appendChild(box);
    box.querySelector('[data-dupyes]').focus();
  });
}
/** เรียก fn(dupOk) — เลข Invoice ซ้ำ = ถามยืนยันแล้วเรียกซ้ำด้วย dupOk:true · คืนผลของ fn หรือ null ถ้ากดยกเลิก */
export async function withDupInv(root, fn, what){
  try{ return fn(false); }
  catch(err){
    if (err?.code !== 'DUP_INV') throw err;
    if (!await askDupInv(root, err, what)) return null;
    return fn(true);
  }
}
const todayYMD = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const field = (label, input, { req = false, hint = '' } = {}) => `
  <label class="field">
    <span class="label">${esc(label)}${req ? '<span class="req">*</span>' : ''}</span>
    ${input}
    ${hint ? `<span class="tiny dim">${esc(hint)}</span>` : ''}
  </label>`;
const input = (name, attrs = '') => `<input class="input" name="${name}" ${attrs} autocomplete="off">`;
const val = (root, name) => root.querySelector(`[name="${name}"]`)?.value ?? '';

/* ช่องของจุดส่ง — ใช้ร่วมกันทั้งแบบ ก. และ ข. · withSo = ช่อง SO (เฉพาะแบบ ก. — แบบ ข. ใช้ SO ของเที่ยว) */
const stopFields = ({ withSo = false } = {}) => `
  <div class="grid g2" style="gap:14px">
    ${field('ปลายทาง', input('destName', 'placeholder="ชื่อร้าน / โรงพยาบาล / สาขา"'), { req:true })}
    ${field('ลูกค้า', input('customer', 'placeholder="เว้นว่าง = ใช้ชื่อปลายทาง"'))}
  </div>
  ${field('ที่อยู่ปลายทาง', input('address', 'placeholder="เลขที่ ถนน ตำบล อำเภอ จังหวัด"'), { req:true })}
  <div class="grid ${withSo ? 'g3' : 'g2'}" style="gap:14px">
    ${field('เลข 5 (Delivery)', input('delivery', 'inputmode="numeric" placeholder="ถ้ามี"'),
      { hint:'ใส่ไว้ = ไฟล์ขาวเข้ามาแล้วปิดงานให้เอง' })}
    ${withSo ? field('เลข SO (Shipment No.)', input('shipmentNo', 'inputmode="numeric" placeholder="ถ้ามี"'),
      { hint:'มีเที่ยวเลขนี้แล้ว = รวมเข้าเที่ยวนั้น' }) : ''}
    ${field('เลข Invoice', input('invoice', 'inputmode="numeric" placeholder="ถ้ามี"'),
      { hint:'ไม่มี = ใช้เลขชั่วคราว RT-… ไปก่อน' })}
  </div>
  <div class="grid g2" style="gap:14px">
    ${field('เบอร์โทรปลายทาง', input('phone', 'inputmode="tel"'))}
    ${field('น้ำหนัก (กก.)', input('weightKg', 'type="number" min="0" step="0.01" inputmode="decimal"'))}
  </div>
  ${field('สินค้า', input('cargo', 'placeholder="เช่น ยา 3 กล่อง (เว้นว่างได้)"'))}
  <div class="grid g2" style="gap:14px">
    <label class="field">
      <span class="label">ประเภทเอกสาร</span>
      <select class="input" name="docType">
        <option value="">— ไม่ระบุ —</option>
        ${RT_DOC_TYPES.map(t => `<option>${esc(t)}</option>`).join('')}
      </select>
    </label>
    <label class="field" data-docnote style="display:none">
      <span class="label">หมายเหตุ<span class="req">*</span></span>
      <input class="input" name="docNote" placeholder="ระบุเอกสาร" autocomplete="off">
    </label>
  </div>`;

/* เลือก "อื่นๆ" แล้วโชว์ช่องหมายเหตุ (บังคับกรอก — ตรวจใน store.js) */
const wireDocType = (root) => {
  const sel = root.querySelector('[name="docType"]');
  const box = root.querySelector('[data-docnote]');
  sel.onchange = () => {
    const other = sel.value === RT_DOC_OTHER;
    box.style.display = other ? '' : 'none';
    if (other) box.querySelector('input').focus();
  };
};

const stopValues = (root) => ({
  destName: val(root, 'destName'), customer: val(root, 'customer'), address: val(root, 'address'),
  delivery: val(root, 'delivery'), invoice: val(root, 'invoice'), shipmentNo: val(root, 'shipmentNo'), phone: val(root, 'phone'), weightKg: val(root, 'weightKg'), cargo: val(root, 'cargo'),
  docType: val(root, 'docType'), docNote: val(root, 'docType') === RT_DOC_OTHER ? val(root, 'docNote') : '',
});

/** ก. งานด่วนใหม่ทั้งเที่ยว */
export function newRtJobDialog(onDone){
  const drivers = listDrivers({ active:true });
  modal({
    wide: true,
    title: 'งานด่วน (Real-Time) · เที่ยวใหม่',
    body: `
<div class="stack gap-16">
  <p class="tiny dim" style="margin:0">ส่งก่อน ปิดงานทีหลัง — ยังไม่ต้องมีเลข Invoice / มูลค่า / Shipment No.
    ระบบตั้งเลขชั่วคราว <span class="mono">RT-…</span> ให้ แล้วขึ้นแท็บ "รอปิดงาน" จนกว่าจะกรอกครบ</p>
  ${stopFields({ withSo:true })}
  <div class="grid g3" style="gap:14px">
    ${field('รถ / ทะเบียน', input('vehicle', 'placeholder="เช่น ตัวอย่างกลาง3 4ล้อ"'))}
    ${field('ผู้ขนส่ง', input('carrier', 'placeholder="เช่น ขนส่งตัวอย่าง"'))}
    ${field('วันที่ออกเดินทาง', input('serviceDate', `type="date" value="${todayYMD()}"`), { req:true })}
  </div>
  <div class="field">
    <span class="label">คนขับ<span class="req">*</span></span>
    <div class="crew">
      ${drivers.map(d => `
        <label class="crew-item">
          <input type="checkbox" data-rtcrew="${esc(d.id)}">
          <span class="grow">
            <span class="strong" style="display:block">${esc(driverName(d))}</span>
            <span class="tiny dim mono">${esc(d.plate || '')}</span>
          </span>
        </label>`).join('') || '<p class="tiny dim">ยังไม่มีคนขับในระบบ — เพิ่มที่หน้าข้อมูลคนขับก่อน</p>'}
    </div>
  </div>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>สร้างงานด่วน</button>`,
    onMount(root){
      root.querySelectorAll('[data-rtcrew]').forEach(cb => {
        cb.onchange = () => cb.closest('.crew-item').classList.toggle('is-on', cb.checked);
      });
      root.querySelector('[name="destName"]')?.focus();
      wireDocType(root);
      root.querySelector('[data-ok]').onclick = async () => {
        try{
          const j = await withDupInv(root, (dupOk) => createRealtimeJob({
            ...stopValues(root),
            vehicle: val(root, 'vehicle'), carrier: val(root, 'carrier'), serviceDate: val(root, 'serviceDate'),
            driverIds: [...root.querySelectorAll('[data-rtcrew]:checked')].map(x => x.dataset.rtcrew),
            dupOk,
          }, BY));
          if (!j) return;
          close();
          toast(`สร้างงานด่วน ${j.code} แล้ว — ส่งให้คนขับได้เลย`, 'ok');
          onDone?.(j);
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/** ข. เพิ่มจุดส่งด่วนเข้าเที่ยวที่มีอยู่ */
export function addRtStopDialog(job, onDone){
  modal({
    wide: true,
    title: `เพิ่มจุดส่งด่วน · เที่ยว ${esc(job.code)}`,
    body: `
<div class="stack gap-16">
  <p class="tiny dim" style="margin:0">ใช้รถและคนขับของเที่ยวนี้ · คนขับเห็นจุดใหม่ในแอปทันที ·
    ${isRtCode(job.code) ? 'Shipment No. กรอกตอนปิดงาน' : `Shipment No. ใช้ ${esc(job.code)} ของเที่ยวนี้`} ·
    เลข Invoice และมูลค่ากรอกทีหลังตอนปิดงาน</p>
  ${stopFields()}
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>เพิ่มจุดส่ง</button>`,
    onMount(root){
      root.querySelector('[name="destName"]')?.focus();
      wireDocType(root);
      root.querySelector('[data-ok]').onclick = async () => {
        try{
          const x = await withDupInv(root, (dupOk) => addRealtimeStop(job.id, { ...stopValues(root), dupOk }, BY), 'เพิ่มจุดส่งด่วน');
          if (!x) return;
          close();
          toast(`เพิ่มจุดส่งด่วน ${x.code} แล้ว`, 'ok');
          onDone?.(x);
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/** ปิดงานด่วน — กรอกเอง หรือเลือกแถวจากไฟล์ขาวที่ยังไม่มีงานไหนรับ */
export function closeRtDialog(stop, job, onDone){
  const miss = rtMissing(stop, job);
  const shipFixed = job && !isRtCode(job.code) ? job.code : '';
  const rows = unmatchedRows().slice(0, 60);
  modal({
    wide: true,
    title: `ปิดงานด่วน · ${esc(stop.code)}`,
    body: `
<div class="stack gap-16">
  <div class="panel" style="padding:12px 14px">
    <div class="strong">${esc(stop.dropoff?.name || '')}</div>
    <div class="tiny dim">${esc(stop.dropoff?.address || '')}</div>
    <div class="tiny" style="margin-top:6px;color:var(--red)">ยังขาด: ${esc(miss.join(' · ') || '—')}</div>
  </div>

  <div class="field">
    <span class="label">เลือกจากไฟล์ขาว <span class="tiny dim" style="font-weight:400">— แถวที่ยังไม่มีงานไหนรับ · กดแล้วกรอกช่องด้านล่างให้</span></span>
    ${rows.length ? `
    <div class="scroll-x" style="max-height:220px;overflow:auto;border:1px solid var(--line);border-radius:var(--radius-sm)">
      <table class="rv" style="font-size:12.5px">
        <thead><tr><th>Delivery</th><th>Invoice</th><th>ปลายทาง</th><th class="right">มูลค่า</th><th>Shipment</th><th></th></tr></thead>
        <tbody>${rows.map((r, i) => `
          <tr>
            <td class="mono">${esc(r.delivery)}</td><td class="mono">${esc(r.invoice || '—')}</td>
            <td class="trunc" style="max-width:220px">${esc(r.destName || r.customer || '')}</td>
            <td class="right mono">${r.amount ? esc(fmtBaht(Number(String(r.amount).replace(/,/g, '')) || 0)) : '—'}</td>
            <td class="mono">${esc(r.shipmentNo || '—')}</td>
            <td><button type="button" class="btn btn-quiet btn-sm" data-pickrow="${i}">ใช้แถวนี้</button></td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`
    : `<p class="tiny dim" style="margin:0">${hasSyncedRows()
        ? 'ไม่มีแถวจากไฟล์ขาวที่ยังว่างอยู่ — กรอกเองด้านล่าง'
        : 'ยังไม่ได้ดึงข้อมูลไฟล์ขาว — กด "ตรวจเดี๋ยวนี้" ในหน้า ops ก่อน หรือกรอกเองด้านล่าง'}</p>`}
  </div>

  <div class="grid g2" style="gap:14px">
    ${field('เลข Invoice', input('invoice', `value="${isRtCode(stop.code) ? '' : esc(stop.code)}" inputmode="numeric"`), { req:true })}
    ${field('มูลค่า (บาท)', input('amount', `type="number" min="0" step="0.01" inputmode="decimal" value="${Number(stop.invoice?.amount) || ''}"`), { req:true })}
  </div>
  <div class="grid g2" style="gap:14px">
    ${field('Shipment No.', input('shipmentNo', `value="${esc(shipFixed)}" ${shipFixed ? 'readonly' : ''} inputmode="numeric"`),
      { req:true, hint: shipFixed ? 'ใช้เลขของเที่ยวนี้' : 'มีเที่ยวเลขนี้อยู่แล้ว = ย้ายเข้าเที่ยวนั้น · ยังไม่มี = เปลี่ยนเลขเที่ยวด่วนเป็นเลขนี้' })}
    ${field('เลข 5 (Delivery)', input('delivery', `value="${esc(stop.delivery || '')}" inputmode="numeric"`), { hint:'ไม่บังคับ' })}
  </div>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>ปิดงาน</button>`,
    onMount(root){
      root.querySelectorAll('[data-pickrow]').forEach(b => {
        b.onclick = () => {
          const r = rows[Number(b.dataset.pickrow)];
          const set = (n, v) => { const el = root.querySelector(`[name="${n}"]`); if (el && !el.readOnly && v) el.value = v; };
          set('invoice', r.invoice);
          set('amount', String(r.amount || '').replace(/,/g, ''));
          set('shipmentNo', r.shipmentNo);
          set('delivery', r.delivery);
          root.querySelectorAll('[data-pickrow]').forEach(x => x.closest('tr').style.background = '');
          b.closest('tr').style.background = 'var(--amber-wash)';
          if (shipFixed && r.shipmentNo && r.shipmentNo !== shipFixed){
            toast(`แถวนี้เป็นของ Shipment ${r.shipmentNo} ไม่ใช่ ${shipFixed} — ตรวจอีกครั้ง`, 'warn');
          }
        };
      });
      root.querySelector('[data-ok]').onclick = async () => {
        try{
          const x = await withDupInv(root, (dupOk) => closeRealtimeStop(stop.id, {
            invoice: val(root, 'invoice'), amount: val(root, 'amount'),
            shipmentNo: val(root, 'shipmentNo'), delivery: val(root, 'delivery'), dupOk,
          }, BY), 'ปิดงานด่วน');
          if (!x) return;
          close();
          toast(`ปิดงานด่วนแล้ว · ${x.code} · ${fmtBaht(x.invoice.amount)}`, 'ok');
          onDone?.(x);
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/** แผงในหน้าต่างเที่ยว — จุดส่งด่วนที่ยังปิดงานไม่ครบ */
export function rtPanel(job){
  const pending = (job.stopList || []).filter(x => rtMissing(x, job).length);
  if (!pending.length) return '';
  return `
  <div class="panel" style="border-color:#f2c3bf;background:var(--red-wash)">
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:8px">
      <h4 style="margin:0">งานด่วนรอปิดงาน ${fmtNum(pending.length)} จุด</h4>
      <span class="tiny dim">ส่งไปก่อนแล้ว — กรอกเลข Invoice / มูลค่า / Shipment No. ให้ครบ</span>
    </div>
    ${pending.map(x => `
      <div class="row between wraps gap-10" style="padding:8px 0;border-top:1px solid #f2c3bf">
        <span>
          <span class="code">${esc(x.code)}</span> <span class="strong">${esc(x.dropoff?.name || '')}</span>
          <br><span class="tiny" style="color:var(--red)">ขาด: ${esc(rtMissing(x, job).join(' · '))}</span>
        </span>
        <button type="button" class="btn btn-accent btn-sm" data-rtclose="${esc(x.id)}">ปิดงาน</button>
      </div>`).join('')}
  </div>`;
}
