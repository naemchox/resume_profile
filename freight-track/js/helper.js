/* ============================================================
   helper.js — หน้าผู้ช่วยคนขับ (helper.html)
   หน้าคนขับ (driver.html) ใช้ฟีเจอร์ชุดนี้ด้วย สำหรับคนขับที่ไปคนเดียว (js/driver.js EXTRAS)
   ผู้ช่วยล็อกอินด้วยบัญชีของคนขับที่ไปด้วยกัน — แกนของหน้า (ล็อกอิน · รายการงาน · ขั้นตอนส่งของ)
   ใช้ js/driver.js ร่วมกับหน้าคนขับ ไฟล์นี้มีเฉพาะส่วนที่ผู้ช่วยมีเพิ่ม

   ทุกจุดส่งมีสามปุ่ม
     ชำระเงิน   — ช่องทาง (เงินโอน · เงินสด · เครดิต) + ยอด + รูปหลักฐาน ≥1   (store.js recordStopPayment)
     คืนเลขที่บิล   — ติ๊กว่าคนขับคืนเอกสารเลขที่บิล แล้ว + วันที่ได้คืน (รูปไม่บังคับ) (store.js recordInvoiceReturn)
     POD        — ปริ้นใบรับสินค้าพร้อมลายเซ็นผู้รับ (js/pod.js)
   หัวรายการจุดส่งมีปุ่มทั้งเที่ยว: ติ๊กคืนเลขที่บิล ทุกจุดที่ส่งแล้ว · ปริ้น POD ทั้งเที่ยว
   บันทึกผิดแก้ด้วย "บันทึกรอบใหม่" ทั้งสองเรื่อง — รอบเก่าเก็บไว้เป็นประวัติ
   ============================================================ */

import { esc, toast, modal, close, shrinkImage, on, markDirty } from './ui.js';
import { keepPhotos } from './keepPhoto.js';
import {
  getJob, S, FLOW, fmtNum, fmtBaht, fmtDate, fmtDateTime,
  PAY_METHODS, PAY_PROOF, MAX_PAY_PHOTOS, recordStopPayment,
  MAX_INVRET_PHOTOS, recordInvoiceReturn, returnInvoicesForJob, todayYmd,
  COLLECT, collectOf, confirmCollected, unconfirmCollected, driverName, getDriver,
  outcomeOf, isFailOutcome, OUTCOMES, isProblem, clearProblem, crewStep, crewStepAt, META, isOpen,
  whReturnOf, needsWhReturn, canWhReturn, recordWhReturn, MIN_RETURN_PHOTOS,
  dupOf, billReportOf, lastCountedReturn, RETURN_ROLES,
} from './store.js';
import { uploadPhotos, isLocalPhoto, stopPhotoDir } from './cloud.js';
import { isAdmin } from './access.js';
import { getSession, canWrite } from './auth.js';
import { canPod, printPod, podXlsx } from './pod.js';

const PAY_TONE = { 'เงินโอน':'move', 'เงินสด':'done', 'เครดิต':'ware' };

const liveStops = (j) => (getJob(j.id)?.stopList || []).filter(x => x.status !== S.CANCELLED);

/* ---------- ป้ายงานด่วน ⚡ (จุดส่งที่ติดธง realtime) ------------
   ยังไม่ส่ง = แถวกรอบแดง + ป้ายแดงทึบเหนือชื่อร้าน · ส่งแล้ว = แถวปกติ + ป้ายเล็กสีเทา บอกว่าเคยเป็นงานด่วน */
export const rtLive = (stops) => stops.some(x => x.realtime && x.status !== S.DELIVERED && x.status !== S.CANCELLED);
export function rtTag(stops){
  if (rtLive(stops)) return '<span class="rt-tag">⚡ งานด่วน</span>';
  return stops.some(x => x.realtime && x.status === S.DELIVERED) ? '<span class="rt-tag is-past">⚡ ด่วน</span>' : '';
}

/** บรรทัดสรุปบนการ์ดเที่ยว — ชำระเงิน N/M · คืน Inv. N/M (นับคืน Inv. เฉพาะจุดที่ส่งแล้ว) */
export function paidLine(j){
  const stops = liveStops(j);
  if (!stops.length) return '';
  const paid = stops.filter(x => x.payment).length;
  const sent = stops.filter(x => x.status === S.DELIVERED);
  const back = sent.filter(x => x.invoiceReturn).length;
  const tone = (a, b) => (a === b ? 'var(--green)' : 'var(--amber-dim)');
  return `<div class="tiny" style="margin-top:2px">
    <span style="color:${tone(paid, stops.length)}">ชำระเงิน ${fmtNum(paid)}/${fmtNum(stops.length)} จุด</span>
    ${sent.length ? ` · <span style="color:${tone(back, sent.length)}">คืนเลขที่บิล ${fmtNum(back)}/${fmtNum(sent.length)} จุด</span>` : ''}
  </div>`;
}

/** แถบเครื่องมือทั้งเที่ยว — วางเหนือรายการจุดส่งในหน้าเที่ยว */
export function tripTools(j){
  const stops = liveStops(j);
  const sent = stops.filter(x => x.status === S.DELIVERED);
  const back = sent.filter(x => x.invoiceReturn).length;
  const waiting = sent.length - back;
  return `
<div class="helper-tools">
  <div class="helper-tools-sum">
    <span>คืนเลขที่บิล แล้ว <b class="tnum">${fmtNum(back)}/${fmtNum(sent.length)}</b> จุด</span>
    ${waiting ? `<span class="tiny" style="color:var(--amber-dim)">รอคืนอีก ${fmtNum(waiting)} จุด</span>`
      : sent.length ? `<span class="tiny" style="color:var(--green)">คืนครบแล้ว</span>` : ''}
  </div>
  <div class="helper-tools-btns">
    <button type="button" class="btn btn-ghost btn-sm" data-invret-all ${waiting ? '' : 'disabled'}>✓ คืนเลขที่บิล ทุกจุด</button>
    <button type="button" class="btn btn-ghost btn-sm" data-pod-trip ${sent.length ? '' : 'disabled'}>🖨 ปริ้นใบส่งของทุกจุด</button>
  </div>
</div>`;
}

/** ส่งของแล้วแต่รอบล่าสุดของคืน Inv. คือยกเลิก — คนขับต้องเอาบิลไปส่งใหม่ (คืนใหม่แล้วหายเอง) */
export const needRebill = (x) => x.status === S.DELIVERED && !x.invoiceReturn
  && lastCountedReturn(x)?.action === 'cancel';
export const REBILL = 'ต้องส่งบิลใหม่';
/* ปิดจุดแบบส่งไม่สำเร็จ (store.js OUTCOMES) — ป้ายแดงแทน "ส่งแล้ว" */
export const failed = (x) => isFailOutcome(outcomeOf(x));
export const failTag = (x) => `<span class="tiny strong" style="color:var(--red);white-space:nowrap">✕ ${OUTCOMES[outcomeOf(x)]}</span>`;

/* ---------- คืนของเข้าคลัง (บิลส่งไม่สำเร็จ · store.js recordWhReturn) ---------- */
/** ป้าย "📦 ยังไม่คืนคลัง" / "📦 คืนคลังแล้ว · เวลา" — เฉพาะบิลส่งไม่สำเร็จ */
export function whReturnTag(x){
  if (!isFailOutcome(outcomeOf(x))) return '';
  const r = whReturnOf(x);
  if (!r && x.problemCleared) return '';   /* ออฟฟิศเคลียร์ไปก่อนมีขั้นคืนคลัง — ไม่ต้องเตือน */
  return r ? `<span class="wh-tag is-done">📦 คืนคลังแล้ว · ${esc(r.byName || '')} · ${esc(fmtDateTime(r.at))}</span>`
           : '<span class="wh-tag">📦 ยังไม่คืนคลัง</span>';
}
/**
 * หน้าต่างคืนของเข้าคลัง — ถ่ายรูปของที่คลัง (ครั้งแรก ≥ 2 รูป · เพิ่มทีหลังได้) + หมายเหตุ
 * @param {object[]} bills บิลส่งไม่สำเร็จที่คืนพร้อมกัน (ร้านเดียวกัน) · by = { byRole, byName, byId }
 */
export function whReturnDialog(bills, by, onDone, { reopen = null } = {}){
  const list = (bills || []).filter(canWhReturn);
  if (!list.length) return toast('ไม่มีบิลที่ต้องคืนคลัง', 'warn');
  const first = list.some(b => !whReturnOf(b));
  let photos = [];
  const hook = {};
  const had = list.flatMap(b => whReturnOf(b)?.photos || []);
  modal({
    title: first ? '📦 คืนของเข้าคลัง' : '📦 เพิ่มรูปคืนเข้าคลัง',
    draftKey: `whreturn:${list.map(b => b.id).join(',')}`,
    draft: hook, reopen,
    body: `
<p class="small">${esc(list[0].dropoff?.name || '')} · ${list.map(b => `บิล <span class="code">${esc(b.invoice?.number || b.code)}</span> ${esc(OUTCOMES[outcomeOf(b)] || '')}`).join(' · ')}</p>
<p class="tiny dim" style="margin-top:4px">ถ่ายรูปของที่ตีกลับ ตอนถึงคลังแล้ว ${first ? `· อย่างน้อย ${MIN_RETURN_PHOTOS} รูป` : '· เพิ่มรูปได้ รูปเดิมลบไม่ได้'} · ไม่จำกัดจำนวน</p>
${had.length ? `<p class="tiny dim" style="margin-top:10px">รูปคืนคลังเดิม ${fmtNum(had.length)} รูป · ลบไม่ได้</p>
<div class="photo-grid">${had.map(p => `<img src="${p}" alt="รูปคืนคลังเดิม" loading="lazy">`).join('')}</div>` : ''}
<div class="shot-head" style="margin-top:12px">
  <span class="shot-count" data-count>0 / ${first ? MIN_RETURN_PHOTOS : 1}</span>
  <span class="label" style="margin:0">รูปของที่คลัง<span class="req">*</span></span>
</div>
<div class="drv-addsrc">
  <label class="drop"><span class="strong">📷 ถ่ายรูป</span><input type="file" accept="image/*" capture="environment" multiple hidden data-wh></label>
  <label class="drop"><span class="strong">🖼 เลือกจากคลัง</span><input type="file" accept="image/*" multiple hidden data-wh></label>
</div>
<div class="photo-grid" data-shots style="margin-top:10px"></div>
<label class="field" style="margin-top:12px">
  <span class="label">หมายเหตุ <span class="hint">(ไม่บังคับ)</span></span>
  <textarea class="textarea" data-note style="min-height:56px" placeholder="เช่น ของครบ กล่องบุบ 1 ลัง / ฝากไว้ชั้น B"></textarea>
</label>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok disabled>✓ ${first ? 'ยืนยันคืนเข้าคลัง' : 'บันทึกรูปเพิ่ม'}</button>`,
    onMount(root){
      const need = first ? MIN_RETURN_PHOTOS : 1;
      const ok = root.querySelector('[data-ok]');
      const shots = root.querySelector('[data-shots]');
      const paint = () => {
        markDirty();
        shots.innerHTML = photos.map((p, i) => `
          <span class="photo-x"><img src="${p}" alt="รูปคืนคลัง ${i + 1}"><button type="button" data-rm="${i}" aria-label="เอารูปออก">×</button></span>`).join('');
        const c = root.querySelector('[data-count]');
        c.textContent = `${photos.length} / ${need}`;
        c.classList.toggle('is-ok', photos.length >= need);
        ok.disabled = photos.length < need;
        ok.title = ok.disabled ? `ถ่ายรูปอีก ${need - photos.length} รูป` : '';
      };
      hook.get = () => ({ photos });
      hook.set = (v) => { photos = [...(v.photos || [])]; paint(); };
      root.querySelectorAll('[data-wh]').forEach(input => input.addEventListener('change', async () => {
        keepPhotos(input.files, 'คืนคลัง', shots);
        for (const f of [...input.files]){
          try{ photos.push(await shrinkImage(f, 1200, 0.7)); }catch(err){ toast(err.message, 'err'); }
        }
        input.value = '';
        paint();
      }));
      on(root, 'click', '[data-rm]', (e, b) => { photos.splice(Number(b.dataset.rm), 1); paint(); });
      paint();
      ok.onclick = async () => {
        if (photos.length < need) return toast(`ถ่ายรูปอีก ${need - photos.length} รูป`, 'warn');
        ok.disabled = true; ok.textContent = 'กำลังส่งรูป…';
        let urls = photos;
        try{ urls = await uploadPhotos(photos, stopPhotoDir(list[0], 'return', 'warehouse')); }
        catch(err){ console.error('[helper] อัปรูปคืนคลังไม่สำเร็จ', err); }
        try{
          recordWhReturn(list.map(b => b.id), { photos: urls, note: root.querySelector('[data-note]').value }, by);
          close();
          toast(first ? `คืนของเข้าคลังแล้ว · ${fmtNum(list.length)} บิล` : 'เพิ่มรูปคืนคลังแล้ว', 'ok');
          const stuck = urls.filter(isLocalPhoto).length;
          if (stuck) toast(`รูป ${stuck} รูปยังส่งไม่ขึ้น (เน็ตหลุด) — รูปไม่หาย ระบบจะส่งให้เองเมื่อมีเน็ต`, 'warn', 6000);
          onDone?.();
        }catch(err){
          toast(err.message, 'err');
          ok.disabled = false; ok.textContent = `✓ ${first ? 'ยืนยันคืนเข้าคลัง' : 'บันทึกรูปเพิ่ม'}`;
        }
      };
    },
  });
}

/** "ส่งโดย ชื่อ · วันเวลา" ใต้บิลที่ส่งแล้ว (ส่งไม่สำเร็จด้วย) — ชื่อจาก event ปิดจุดล่าสุด
 *  ผู้ช่วยมี "(ผู้ช่วย)" ต่อท้ายอยู่แล้ว (driver.js actorName) · ออฟฟิศยืนยันแทน = "(บันทึกแทนโดย …)" */
/** เลข Delivery + ป้ายเลขบิลซ้ำ / เลขที่คนขับแจ้ง (28 ต.ค.) — ช่วยคนขับเทียบใบในมือ
 *  เลข Delivery ขึ้นเฉพาะตอนต่างจากเลขที่โชว์อยู่แล้ว (จุดที่ยังเป็นเลข 5 ไม่ต้องซ้ำสองบรรทัด) */
export function billIdTags(x){
  const d = dupOf(x), rep = billReportOf(x);
  const del = String(x.delivery || '').trim();
  return `${del && del !== x.code ? `<span class="tiny dim" style="display:block">Delivery ${esc(del)}</span>` : ''}${d
    ? `<span class="dup-tag">⚠ เลขบิล ${esc(d.no)} ซ้ำ — รอออฟฟิศแก้ · เทียบใบในมือด้วยชื่อร้าน / น้ำหนัก</span>` : ''}${rep
    ? `<span class="dup-tag is-rep">📝 แจ้งเลขบิลในมือ ${esc(rep.billNo)} แล้ว · รอออฟฟิศยืนยัน</span>` : ''}`;
}

export function sentBy(x){
  if (x?.status !== S.DELIVERED) return '';
  const ev = (x.events || []).filter(e => e.status === S.DELIVERED).at(-1);
  return ev ? `<span class="sent-by">ส่งโดย <b>${esc(ev.byName || '—')}</b> · ${esc(fmtDateTime(ev.at))}</span>` : '';
}

/* ---------- คนขับแต่ละคนถึงขั้นไหน (ops.js · 27 ต.ค.) ----------
   เที่ยวหลายคนขับ แต่ละคนกด รับเข้าคลัง / ขึ้นรถ / ออกจากคลัง ของตัวเอง (store.js crewStep) */
const CREW_TEXT = { new:'ยังไม่รับเข้าคลัง', received:'รับเข้าคลังแล้ว', loaded:'ขึ้นรถแล้ว', departed:'ออกจากคลังแล้ว' };
const crewText = (st) => CREW_TEXT[st] || META[st]?.label || st;
/** ป้ายเล็กของคนขับหนึ่งคน (ใต้ชื่อในตารางกระดานงาน) · เที่ยวปิดแล้ว = ไม่ต้องแสดง */
export function crewChip(j, driverId){
  if (!isOpen(j.status)) return '';
  const st = crewStep(j, driverId);
  return `<span class="crew-chip" data-st="${st}">${esc(crewText(st))}</span>`;
}
/** กล่องในใบงานเที่ยว — ทุกคนในเที่ยว ขั้นล่าสุด + เวลา · คนที่ตามหลังสถานะเที่ยวขึ้นสีส้ม */
export function crewBox(j){
  const ids = (j.driverIds || []).filter(id => getDriver(id));
  if (!ids.length || !isOpen(j.status)) return '';
  const lead = FLOW.indexOf(j.status);
  return `
  <div class="panel">
    <div class="row between wraps gap-8" style="align-items:baseline;margin-bottom:8px">
      <span class="label" style="margin:0">คนขับแต่ละคนถึงขั้นไหน</span>
      <span class="tiny dim">แต่ละคนกดของตัวเอง · มาก่อนไปก่อน</span>
    </div>
    ${ids.map(id => {
      const st = crewStep(j, id);
      const at = st === S.NEW ? '' : crewStepAt(j, id, st);
      const behind = FLOW.indexOf(st) < lead;
      return `
    <div class="crew-line${behind ? ' is-behind' : ''}">
      <span class="grow strong">${esc(driverName(getDriver(id)))}</span>
      <span class="crew-chip" data-st="${st}">${esc(crewText(st))}</span>
      <span class="tiny dim nowrap">${at ? esc(fmtDateTime(at)) : '—'}</span>
    </div>`;
    }).join('')}
  </div>`;
}

/* ---------- บิลมีปัญหา (ฝั่งออฟฟิศ: billing.js / ops.js) ---------- */
/** หมายเหตุที่คนขับพิมพ์ตอนปิดแบบส่งไม่สำเร็จ */
export const failNote = (x) => (x.events || []).filter(e => e.status === S.DELIVERED).at(-1)?.note || '';
/** ป้ายแดง "⚠ บิลมีปัญหา · ร้านปิด" + หมายเหตุคนขับ · เคลียร์แล้ว = ป้ายเทาบอกว่าเคยมีปัญหา */
export function problemTag(x, { note = true } = {}){
  if (isProblem(x)) return `<span class="prob-tag">⚠ บิลมีปัญหา · ${esc(OUTCOMES[outcomeOf(x)])}</span>${
    note && failNote(x) ? `<span class="prob-note">คนขับ: ${esc(failNote(x))}</span>` : ''}${note ? `<span class="prob-note">${whReturnTag(x)}</span>` : ''}`;
  const c = x.problemCleared;
  return c ? `<span class="prob-tag is-cleared" title="${esc(`${c.byName} · ${fmtDateTime(c.at)}: ${c.note}`)}">✓ เคลียร์แล้ว · ${esc(OUTCOMES[c.outcome] || '')}</span>` : '';
}
/** หน้าต่างเคลียร์บิลมีปัญหา — บังคับพิมพ์ว่าจัดการยังไง */
export function clearProblemDialog(x, by, onDone){
  modal({
    title: `เคลียร์บิลมีปัญหา · ${esc(x.invoice?.number || x.code)}`,
    body: `
<p class="small">${esc(x.dropoff?.name || '')} · <span class="code">${esc(x.code)}</span></p>
<div class="prob-box" style="margin-top:10px">${problemTag(x)}</div>
<label class="field" style="margin-top:14px">
  <span class="label">จัดการยังไง<span class="req">*</span></span>
  <textarea class="textarea" data-clearnote style="min-height:72px" placeholder="เช่น ส่งใหม่แล้ววันที่ … / ยกเลิกบิลนี้ ไม่เก็บเงิน / คุยกับลูกค้าแล้ว รับของรอบหน้า"></textarea>
</label>
<p class="tiny dim" style="margin-top:8px">เคลียร์แล้วบิลจะกลับเป็นปกติ วางบิลได้ · ผลการส่งเดิมของคนขับยังอยู่ในประวัติ</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           ${whReturnOf(x) ? '' : '<button class="btn btn-ghost" data-whgo>📦 คืนของเข้าคลังก่อน</button>'}
           <button class="btn btn-accent" data-ok disabled>✓ เคลียร์แล้ว</button>`,
    onMount(root){
      const ta = root.querySelector('[data-clearnote]');
      const ok = root.querySelector('[data-ok]');
      /* ยังไม่คืนของเข้าคลัง = เคลียร์ไม่ได้ (กันของหายระหว่างทาง) */
      const back = !!whReturnOf(x);
      if (!back){
        root.querySelector('.prob-box').insertAdjacentHTML('afterend', `<p class="small strong" style="margin-top:10px;color:var(--red)">ยังไม่ได้คืนของเข้าคลัง — ถ่ายรูปคืนคลัง (≥ ${MIN_RETURN_PHOTOS} รูป) ก่อน แล้วจึงเคลียร์ได้</p>`);
      }
      root.querySelector('[data-whgo]')?.addEventListener('click', () => whReturnDialog([x], by, onDone));
      ta.addEventListener('input', () => { ok.disabled = !back || !ta.value.trim(); });
      ta.focus();
      ok.onclick = () => {
        try{
          clearProblem(x.id, ta.value, by);
          close();
          toast('เคลียร์บิลแล้ว — วางบิลได้ตามปกติ', 'ok');
          onDone?.();
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}
export const rebillTag = `<span class="tiny strong" style="color:var(--amber-dim);white-space:nowrap">${REBILL}</span>`;

/**
 * แถวจุดส่งพร้อมปุ่ม ชำระเงิน · คืน Inv. · POD
 * @param {{canDeliver?:boolean}} opts canDeliver = หน้าคนขับ — แตะส่วนบนของแถวเพื่อส่งของ (data-stop)
 *        ปุ่มสามปุ่มอยู่นอกส่วนนั้น แตะปุ่มจึงไม่เปิดหน้าส่งของซ้อน
 */
export function payStopRow(x, i, { canDeliver = false, badge = '' } = {}){
  const done = x.status === S.DELIVERED;
  const off = x.status === S.CANCELLED;
  const p = x.payment;
  const r = x.invoiceReturn;
  const go = canDeliver && !done && !off;
  return `
<div class="stop-row helper-row${done ? ' is-sent' : ''}${rtLive([x]) ? ' is-rt' : ''}">
  <div class="helper-row-top"${go ? ` data-stop="${x.id}" style="cursor:pointer"` : ''}>
    <span class="stop-n">${done ? '✓' : i + 1}</span>
    <span class="grow" style="min-width:0">
      ${rtTag([x])}
      <span class="strong" style="display:block">${esc(x.dropoff.name)}</span>
      <span class="tiny dim trunc" style="display:block">${esc(x.dropoff.address)}</span>
      <span class="tiny dim">${esc(x.code)}${x.invoice?.amount ? ` · ยอดบิล ${esc(fmtBaht(x.invoice.amount))}` : ''}</span>
      ${billIdTags(x)}
      ${sentBy(x)}
      ${whReturnTag(x)}
      ${badge}
    </span>
    ${off ? `<span class="tiny dim" style="white-space:nowrap">ยกเลิก</span>`
      : go ? `<span class="tiny strong" style="color:var(--amber-dim);white-space:nowrap">ส่งของ →</span>`
      : failed(x) ? failTag(x)
      : needRebill(x) ? rebillTag
      : `<span class="tiny ${done ? '' : 'dim'}" style="white-space:nowrap;${done ? 'color:var(--green)' : ''}">${done ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}</span>`}
  </div>
  ${off ? '' : `
  <div class="helper-acts">
    <button type="button" class="helper-act" data-pay="${x.id}" data-state="${p ? 'ok' : 'todo'}">
      <span class="helper-act-k">💰 ชำระเงิน</span>
      <span class="helper-act-v">${p ? `${esc(p.method)} · ${esc(fmtBaht(p.amount))}${p.round > 1 ? ` · แก้ ${fmtNum(p.round - 1)}` : ''}` : 'ยังไม่บันทึก'}</span>
    </button>
    <button type="button" class="helper-act" data-invret="${x.id}" data-state="${r ? 'ok' : done ? 'todo' : 'off'}">
      <span class="helper-act-k">📄 คืนเลขที่บิล</span>
      <span class="helper-act-v">${r ? `คืนแล้ว ${esc(fmtDate(r.date))}` : needRebill(x) ? `ยกเลิกการคืน · ${REBILL}` : done ? 'ยังไม่คืน' : 'รอส่งของก่อน'}</span>
    </button>
    <button type="button" class="helper-act" data-pod="${x.id}" data-state="${canPod(x) ? 'go' : 'off'}" ${canPod(x) ? '' : 'disabled'}>
      <span class="helper-act-k">🖨 ใบส่งของ</span>
      <span class="helper-act-v">${canPod(x) ? 'แตะเพื่อปริ้น' : 'รอส่งของก่อน'}</span>
    </button>
  </div>`}
</div>`;
}

/**
 * ปุ่มสามปุ่มของร้านเดียวกันหลายบิล (js/driver.js groupRow) — กดครั้งเดียวทำทุกบิลของร้าน
 * ใช้ data-pay/data-invret/data-pod ตัวเดียวกับรายจุด (รหัสบิลแรก) หน้าคนขับหาบิลที่เหลือของร้านเอง
 */
export function groupActs(stops){
  const live = stops.filter(x => x.status !== S.CANCELLED);
  if (!live.length) return '';
  const id = live[0].id;
  const n = live.length;
  const paid = live.filter(x => x.payment);
  const methods = [...new Set(paid.map(x => x.payment.method))];
  const total = paid.reduce((t, x) => t + (Number(x.payment.amount) || 0), 0);
  const sent = live.every(x => x.status === S.DELIVERED);
  const back = live.filter(x => x.invoiceReturn);
  const pod = live.some(canPod);
  return `
  <div class="helper-acts">
    <button type="button" class="helper-act" data-pay="${id}" data-state="${paid.length === n ? 'ok' : 'todo'}">
      <span class="helper-act-k">💰 ชำระเงิน</span>
      <span class="helper-act-v">${paid.length === n ? `${esc(methods.join('/'))} · ${esc(fmtBaht(total))}`
        : paid.length ? `บันทึกแล้ว ${fmtNum(paid.length)}/${fmtNum(n)} บิล` : 'ยังไม่บันทึก'}</span>
    </button>
    <button type="button" class="helper-act" data-invret="${id}" data-state="${back.length === n ? 'ok' : sent ? 'todo' : 'off'}">
      <span class="helper-act-k">📄 คืนเลขที่บิล</span>
      <span class="helper-act-v">${back.length === n ? `คืนแล้ว ${esc(fmtDate(live[0].invoiceReturn.date))}`
        : back.length ? `คืนแล้ว ${fmtNum(back.length)}/${fmtNum(n)} บิล` : sent ? 'ยังไม่คืน' : 'รอส่งของก่อน'}</span>
    </button>
    <button type="button" class="helper-act" data-pod="${id}" data-state="${pod ? 'go' : 'off'}" ${pod ? '' : 'disabled'}>
      <span class="helper-act-k">🖨 ใบส่งของ</span>
      <span class="helper-act-v">${pod ? `ปริ้น ${fmtNum(n)} บิล` : 'รอส่งของก่อน'}</span>
    </button>
  </div>`;
}

/* หัวหน้าต่างของจุดเดียว / ร้านเดียวกันหลายบิล */
const whoLine = (x, bills) => bills.length > 1
  ? `<p class="muted small">${esc(x.dropoff.name)} · ${fmtNum(bills.length)} บิล (${bills.map(b => `<span class="code">${esc(b.code)}</span>`).join(' ')})</p>`
  : `<p class="muted small">จุดส่ง <span class="code">${esc(x.code)}</span> → ${esc(x.dropoff.name)}</p>`;
/* ประวัติของแต่ละบิล — หลายบิลขึ้นหัวบอกว่าบิลไหน */
const perBill = (bills, key, draw) => bills.map(b => (b[key] || []).length
  ? `${bills.length > 1 ? `<p class="tiny strong" style="margin-top:12px">บิล ${esc(b.invoice?.number || b.code)}</p>` : ''}${draw(b[key])}` : '').join('');

const thumb = (src, alt) => /^https?:/.test(src)
  ? `<a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(alt)}"></a>`
  : `<img src="${esc(src)}" alt="${esc(alt)}">`;

function payHistory(list){
  if (!list.length) return '';
  return `
<div class="pay-log">
  <p class="label" style="margin-bottom:8px">ประวัติการบันทึก (${fmtNum(list.length)} รอบ)</p>
  ${[...list].reverse().map((r, k) => `
  <div class="pay-log-row${k === 0 ? ' is-now' : ''}">
    <div class="row between gap-8">
      <span class="small strong">รอบที่ ${fmtNum(r.round)}${k === 0 ? ' · ใช้อยู่' : ' · ถูกแทนแล้ว'}</span>
      <span class="tiny dim">${esc(fmtDateTime(r.at))}</span>
    </div>
    <div class="row gap-8" style="margin-top:4px;align-items:center;flex-wrap:wrap">
      ${r.action === 'cancel'
        ? `<span class="pill" data-tone="grey">ยกเลิก</span>`     /* ล้างช่องในชีต Master (AppsScript-master.gs) */
        : `<span class="pill" data-tone="${PAY_TONE[r.method] || 'grey'}">${esc(r.method)}</span>
      <span class="small tnum">${esc(fmtBaht(r.amount))}</span>`}
      <span class="tiny dim">โดย ${esc(r.byName)}</span>
    </div>
    ${r.note ? `<p class="tiny" style="margin-top:4px">${esc(r.note)}</p>` : ''}
    <div class="photo-grid" style="margin-top:6px">${(r.photos || []).map((u, n) => thumb(u, `หลักฐานรอบ ${r.round} รูป ${n + 1}`)).join('')}</div>
  </div>`).join('')}
</div>`;
}

/**
 * หน้าต่างบันทึกการชำระเงินของจุดส่ง
 * @param {object} x  จุดส่ง (getShipment)
 * @param {object} j  เที่ยวของจุดนี้ (getJob)
 * @param {{byName:string, byRole?:string, byId?:string, onDeliver?:Function, onSaved:Function, office?:boolean}} opts
 *        byName = ชื่อที่ประทับลงบันทึก · byRole = 'assistant' (ค่าตั้งต้น) | 'driver' (หน้าคนขับ)
 *        onDeliver = เปิดหน้าปิดจุดส่งของคนขับ · onSaved(row) = วาดหน้าใหม่
 *        office = ออฟฟิศแก้จากหน้า ops — รูปไม่บังคับ ไม่มีปุ่มไปส่งของ
 */
export function payDialog(x, j, { byName, byRole = 'assistant', byId = '', onDeliver, onSaved, office = false, bills: group }){
  /* ร้านเดียวกันหลายบิล — เลือกแบบจ่าย/ถ่ายหลักฐานครั้งเดียว กรอกยอดแยกบิล แล้วบันทึกลงทุกบิล */
  const bills = (group?.length ? group : [x]).filter(b => b.status !== S.CANCELLED);
  const multi = bills.length > 1;
  const list = x.payments || [];
  const last = list[list.length - 1];
  const again = bills.some(b => (b.payments || []).length);
  const round = Math.max(...bills.map(b => (b.payments || []).length)) + 1;
  const canDeliver = !office && bills.some(b => b.status !== S.DELIVERED)
    && FLOW.indexOf(j.status) >= FLOW.indexOf(S.DEPARTED);
  const invSum = bills.reduce((t, b) => t + (Number(b.invoice?.amount) || 0), 0);
  let photos = [];
  /* รูปหลักฐานที่ถ่ายไว้ — เซฟอัตโนมัติผ่าน ui.js (ช่องกรอกอื่นเซฟเอง) */
  const payHook = {};

  modal({
    title: 'บันทึกการชำระเงิน',
    draftKey: `pay:${x.id}`,
    draft: payHook,
    reopen: { name:'pay', args:{ stopId: x.id } },
    body: `
${whoLine(x, bills)}
${invSum ? `<p class="tiny dim" style="margin-top:2px">ยอดตามบิล ${multi ? 'รวม ' : ''}${esc(fmtBaht(invSum))}</p>` : ''}

${perBill(bills, 'payments', payHistory)}

${again ? `<p class="small strong" style="margin-top:16px;color:var(--amber-dim)">บันทึกรอบที่ ${fmtNum(round)} — รอบเก่ายังเก็บไว้</p>` : ''}

${multi ? '' : `
<div class="field" style="margin-top:14px">
  <span class="label">ลูกค้าจ่ายแบบไหน<span class="req">*</span></span>
  <div class="pay-opts" role="radiogroup">
    ${PAY_METHODS.map(m => `
    <label class="pay-opt"><input type="radio" name="pm" value="${esc(m)}" ${last?.method === m ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}
  </div>
</div>`}

${multi ? `
<div class="field" style="margin-top:14px">
  <span class="label">แต่ละบิลจ่ายแบบไหน · ยอดเงิน (บาท)<span class="req">*</span></span>
  ${bills.map((b, i) => {
    const p = (b.payments || []).at(-1);
    const pm = p?.action === 'cancel' ? '' : p?.method;
    return `
  <div class="pay-bill">
    <span class="small pay-bill-no">บิล ${esc(b.invoice?.number || b.code)}</span>
    <span class="pay-opts pay-opts-sm" role="radiogroup" aria-label="บิล ${esc(b.invoice?.number || b.code)} จ่ายแบบไหน">
      ${PAY_METHODS.map(m => `
      <label class="pay-opt"><input type="radio" name="pm${i}" value="${esc(m)}" ${pm === m ? 'checked' : ''}><span>${esc(m)}</span></label>`).join('')}
    </span>
    <input class="input tnum pay-bill-amt" data-amt="${i}" inputmode="decimal" placeholder="0.00"
           aria-label="ยอดเงินบิล ${esc(b.invoice?.number || b.code)}" value="${esc(p?.amount ?? b.invoice?.amount ?? '')}">
  </div>`; }).join('')}
  <p class="small strong" style="margin-top:8px;text-align:right">รวม <span data-amtsum class="tnum"></span></p>
</div>` : `
<label class="field" style="margin-top:14px">
  <span class="label">ยอดเงิน (บาท)<span class="req">*</span></span>
  <input class="input tnum" data-amount inputmode="decimal" placeholder="0.00"
         value="${esc(last?.amount ?? x.invoice?.amount ?? '')}">
</label>`}

<div class="field" style="margin-top:14px">
  <div class="shot-head">
    <span class="shot-count" data-count>0 / 1</span>
    <span>
      <span class="label" style="margin:0">รูปหลักฐาน${office ? ' <span class="hint">(ไม่บังคับ)</span>' : '<span class="req">*</span>'}</span>
      <span class="tiny dim" style="display:block" data-proof>เลือกแบบจ่ายก่อน แล้วถ่ายรูป 1 รูปขึ้นไป</span>
    </span>
  </div>
  <label class="drop" style="display:block">
    <span class="strong">📷 แตะเพื่อถ่ายรูป</span>
    <span class="tiny dim" style="display:block;margin-top:3px">ได้สูงสุด ${MAX_PAY_PHOTOS} รูป</span>
    <input type="file" accept="image/*" multiple hidden data-photos>
  </label>
  <div class="photo-grid" data-shots style="margin-top:10px"></div>
</div>

<label class="field" style="margin-top:14px">
  <span class="label">${again ? 'เหตุผลที่แก้<span class="req">*</span>' : 'หมายเหตุ <span class="hint">(ไม่บังคับ)</span>'}</span>
  <textarea class="textarea" data-note style="min-height:60px" placeholder="${again ? 'เช่น แนบสลิปผิด / ยอดผิด' : ''}"></textarea>
</label>

<p class="tiny dim" style="margin-top:12px">บันทึกในชื่อ <strong>${esc(byName)}</strong></p>
${canDeliver ? `
<hr class="divider" style="margin:16px 0">
<button type="button" class="btn btn-ghost btn-block" data-godeliver>📦 ไปส่งของ${multi ? `ร้านนี้ ${fmtNum(bills.length)} บิล` : 'จุดนี้'} (ถ่ายรูป + ลายเซ็น)</button>` : ''}`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok disabled>${again ? `บันทึกรอบที่ ${fmtNum(round)}` : 'บันทึกการชำระเงิน'}</button>`,
    onMount(root){
      const okBtn = root.querySelector('[data-ok]');
      const input = root.querySelector('[data-photos]');
      const shots = root.querySelector('[data-shots]');
      const counter = root.querySelector('[data-count]');
      const proof = root.querySelector('[data-proof]');
      /* หลายบิล = แต่ละบิลเลือกวิธีจ่ายของตัวเอง (name="pm0" "pm1" …) · บิลเดียว = ชุดเดียวด้านบน */
      const methods = () => multi ? bills.map((b, i) => root.querySelector(`[name="pm${i}"]:checked`)?.value || '')
        : [root.querySelector('[name="pm"]:checked')?.value || ''];
      const num = (el) => Number(String(el.value).replace(/[, ]/g, ''));
      const amounts = () => multi ? bills.map((b, i) => num(root.querySelector(`[data-amt="${i}"]`)))
        : [num(root.querySelector('[data-amount]'))];
      const note = () => root.querySelector('[data-note]').value.trim();

      payHook.get = () => ({ photos });
      payHook.set = (v) => { photos = [...(v.photos || [])]; refresh(); };
      function refresh(){
        markDirty();
        const ms = methods();
        /* เลือกปนกันหลายแบบ = รวมหลักฐานทุกแบบในข้อความเดียว */
        const m = [...new Set(ms.filter(Boolean))].map(v => PAY_PROOF[v]).join(' / ');
        proof.textContent = office
          ? (m ? `แนบ${m}ได้ถ้ามี` : 'แนบหลักฐานได้ถ้ามี — ไม่แนบก็บันทึกได้')
          : (m ? `ถ่าย${m} 1 รูปขึ้นไป` : 'เลือกแบบจ่ายก่อน แล้วถ่ายรูป 1 รูปขึ้นไป');
        /* ออฟฟิศไม่บังคับรูป — ไม่ต้องขึ้นแดงเหมือนยังขาด */
        counter.textContent = office ? `${photos.length} / ${MAX_PAY_PHOTOS}` : `${photos.length} / 1`;
        counter.classList.toggle('is-ok', photos.length > 0 || office);
        shots.innerHTML = photos.map((p, i) => `
          <span class="photo-x"><img src="${p}" alt="หลักฐาน ${i + 1}"><button type="button" data-rm="${i}" aria-label="ลบรูป">×</button></span>`).join('');
        const why = [];
        if (!ms.every(Boolean)) why.push(multi ? 'เลือกแบบจ่ายให้ครบทุกบิล' : 'เลือกแบบจ่าย');
        if (!amounts().every(a => a > 0)) why.push(multi ? 'กรอกยอดเงินให้ครบทุกบิล' : 'กรอกยอดเงิน');
        const sum = root.querySelector('[data-amtsum]');
        if (sum) sum.textContent = fmtBaht(amounts().reduce((t, a) => t + (a > 0 ? a : 0), 0));
        if (!photos.length && !office) why.push('แนบรูปหลักฐาน');
        if (again && !note()) why.push('บอกเหตุผลที่แก้');
        okBtn.disabled = why.length > 0;
        okBtn.title = why.length ? 'ต้อง' + why.join(' · ') + 'ก่อน' : '';
      }
      root.addEventListener('input', refresh);
      root.addEventListener('change', refresh);
      input.addEventListener('change', async () => {
        keepPhotos(input.files, 'สลิป', shots);   /* เก็บรูปที่เพิ่งถ่ายไว้ในเครื่องด้วย (js/keepPhoto.js) */
        for (const f of [...input.files]){
          if (photos.length >= MAX_PAY_PHOTOS){ toast(`แนบได้สูงสุด ${MAX_PAY_PHOTOS} รูป`, 'warn'); break; }
          try{ photos.push(await shrinkImage(f, 1200, 0.7)); }   /* สลิปต้องอ่านตัวเลขออก — ใหญ่กว่ารูปสินค้านิดหน่อย */
          catch(err){ toast(err.message, 'err'); }
        }
        input.value = '';
        refresh();
      });
      on(shots, 'click', '[data-rm]', (e, b) => { photos.splice(Number(b.dataset.rm), 1); refresh(); });
      refresh();

      root.querySelector('[data-godeliver]')?.addEventListener('click', () => {
        close();
        onDeliver(x, j);
      });

      okBtn.onclick = async () => {
        const label = okBtn.textContent;
        okBtn.disabled = true;
        okBtn.textContent = 'กำลังส่งรูป…';
        let urls = photos;
        try{ urls = await uploadPhotos(photos, stopPhotoDir(x, 'payment', 'slip')); }
        catch(err){ console.error('[helper] อัปรูปหลักฐานชำระเงินไม่สำเร็จ', err); }   /* เก็บแบบในเครื่องไว้ก่อน ซิงก์ทีหลัง */
        try{
          const amt = amounts();
          const ms = methods();
          let r;
          for (const [i, b] of bills.entries()){
            r = recordStopPayment(b.id, { method:ms[i], amount:amt[i], photos:urls, note:note() },
              { byRole: office ? 'ops' : byRole, byName, byId });
          }
          close();
          toast(multi ? `บันทึก ${[...new Set(ms)].join(' + ')} ${fmtBaht(amt.reduce((t, a) => t + a, 0))} · ${fmtNum(bills.length)} บิล แล้ว`
            : `บันทึก ${r.method} ${fmtBaht(r.amount)} · จุด ${x.code} แล้ว`, 'ok');
          const stuck = urls.filter(isLocalPhoto).length;
          if (stuck) toast(`รูป ${stuck} รูปยังส่งไม่ขึ้น (เน็ตหลุด) — รูปไม่หาย เน็ตมาแล้วจะถามให้ส่งใหม่`, 'warn', 6000);
          onSaved(r);
        }catch(err){
          toast(err.message, 'err');
          okBtn.textContent = label;
          okBtn.disabled = false;
        }
      };
    },
  });
}

/* ---------- คืนเอกสาร Inv. -------------------------------- */
function invRetHistory(list){
  if (!list.length) return '';
  return `
<div class="pay-log">
  <p class="label" style="margin-bottom:8px">ประวัติการคืนเอกสาร (${fmtNum(list.length)} รอบ)</p>
  ${[...list].reverse().map((r, k) => `
  <div class="pay-log-row${k === 0 ? ' is-now' : ''}">
    <div class="row between gap-8">
      <span class="small strong">รอบที่ ${fmtNum(r.round)}${k === 0 ? ' · ใช้อยู่' : ' · ถูกแทนแล้ว'}</span>
      <span class="tiny dim">${esc(fmtDateTime(r.at))}</span>
    </div>
    <div class="row gap-8" style="margin-top:4px;align-items:center;flex-wrap:wrap">
      ${r.action === 'cancel'
        ? `<span class="pill" data-tone="stop">ยกเลิกการคืน</span>`
        : `<span class="pill" data-tone="done">คืนแล้ว ${esc(fmtDate(r.date))}</span>`}
      ${r.receivedBy ? `<span class="tiny">ผู้รับคืน ${esc(r.receivedBy)}</span>` : ''}
      <span class="tiny dim">โดย ${esc(r.byName)}</span>
    </div>
    ${r.note ? `<p class="tiny" style="margin-top:4px">${esc(r.note)}</p>` : ''}
    ${(r.photos || []).length ? `<div class="photo-grid" style="margin-top:6px">${r.photos.map((u, n) => thumb(u, `เอกสารเลขที่บิล รอบ ${r.round} รูป ${n + 1}`)).join('')}</div>` : ''}
  </div>`).join('')}
</div>`;
}

/* ที่คืนบิล — นอกจากนี้เลือก "อื่น ๆ" แล้วพิมพ์ชื่อคนรับ */
const RET_TO = ['ORIGIN', 'คลัง'];
/** dropdown คืนที่ + ช่องชื่อ (โชว์เมื่อเลือกอื่น ๆ) ของบิลหนึ่งใบ · was = receivedBy เดิม */
function retToField(b, was = ''){
  const to = RET_TO.includes(was) ? was : was ? 'other' : '';
  return `
      <select class="input invret-to" data-to="${b.id}" aria-label="คืนบิล ${esc(b.invoice?.number || b.code)} ที่">
        <option value="">— เลือก —</option>
        ${RET_TO.map(v => `<option value="${v}" ${to === v ? 'selected' : ''}>${v}</option>`).join('')}
        <option value="other" ${to === 'other' ? 'selected' : ''}>อื่น ๆ</option>
      </select>
      <input class="input invret-who" data-who="${b.id}" maxlength="80" placeholder="พิมพ์ชื่อคนรับบิล" value="${to === 'other' ? esc(was) : ''}">`;
}
/* คืนที่ไหนของบิลนี้ — อื่น ๆ ใช้ชื่อที่พิมพ์ · ยังไม่ครบได้ '' */
function retToOf(root, id){
  const v = root.querySelector(`[data-to="${id}"]`)?.value || '';
  return v === 'other' ? (root.querySelector(`[data-who="${id}"]`)?.value.trim() || '') : v;
}
/* เปิด/ปิด dropdown ตามบิลที่ติ๊ก · ช่องชื่อขึ้นเฉพาะตอนเลือกอื่น ๆ */
function syncRetTo(root, isOn = () => true){
  root.querySelectorAll('[data-to]').forEach(t => {
    const on = isOn(t.dataset.to);
    t.disabled = !on;
    root.querySelector(`[data-who="${t.dataset.to}"]`).hidden = !on || t.value !== 'other';
  });
}

/**
 * หน้าต่างคืนเอกสาร Inv. ของจุดเดียว — บันทึก / แก้วันที่ / ยกเลิก
 * @param {{byName:string, onSaved:Function}} opts
 */
export function invRetDialog(x, j, { byName, byRole = 'assistant', onSaved, bills: group }){
  /* ร้านเดียวกันหลายบิล — ติ๊กเลือกบิลที่จะคืน วันที่/รูป ครั้งเดียว บันทึกลงบิลที่เลือก
     แต่ละบิลต้องเลือกว่าคืนที่ไหน (ORIGIN / คลัง / อื่น ๆ + ชื่อคนรับ) เก็บลง receivedBy ของบิลนั้น */
  const all = (group?.length ? group : [x]).filter(b => b.status !== S.CANCELLED);
  const bills = all.filter(b => b.status === S.DELIVERED);
  if (!bills.length){
    toast(`${all.length > 1 ? 'ร้านนี้' : 'จุดนี้'}ยังไม่ได้ส่งของ — ส่งของก่อน แล้วค่อยคืนเลขที่บิล`, 'warn', 4000);
    return;
  }
  const pick = all.length > 1;
  /* ค่าเริ่ม = บิลที่ยังไม่คืน · คืนครบแล้วเลือกทุกบิล (ไว้แก้วันที่ / ยกเลิก) */
  const wait = bills.filter(b => !b.invoiceReturn);
  const sel = new Set((wait.length ? wait : bills).map(b => b.id));
  const chosen = () => bills.filter(b => sel.has(b.id));
  const back = all.filter(b => b.invoiceReturn);
  const cur = back.length === all.length ? x.invoiceReturn : null;
  const again0 = bills.some(b => (b.invoiceReturns || []).length);
  let photos = [];
  const retHook = {};

  modal({
    title: 'คืนเอกสารเลขที่บิล',
    draftKey: `invret:${x.id}`,
    draft: retHook,
    reopen: { name:'invret', args:{ stopId: x.id } },
    body: `
${whoLine(x, all)}
${pick ? '' : `<p class="tiny dim" style="margin-top:2px">เลขที่บิล ${esc(x.invoice?.number || x.code)}</p>`}
<div class="invret-now" data-state="${cur ? 'ok' : 'todo'}">
  ${cur ? `✓ คืนเอกสารแล้ว เมื่อ <b>${esc(fmtDate(cur.date))}</b>${cur.receivedBy ? ` · ผู้รับคืน ${esc(cur.receivedBy)}` : ''}`
        : back.length ? `คืนแล้ว ${fmtNum(back.length)}/${fmtNum(all.length)} บิล` : 'ยังไม่ได้คืนเอกสาร'}
</div>

<div class="field" style="margin-top:14px">
  <span class="label">${pick ? 'เลือกบิลที่จะคืน และคืนที่ไหน' : 'คืนบิลที่'}<span class="req">*</span></span>
  <div class="invret-pick">
    ${all.map(b => {
      const ok = b.status === S.DELIVERED;
      return `
    <div class="invret-pick-row"${ok ? '' : ' data-off'}>
      <label class="invret-pick-main">
        <input type="checkbox" data-bill="${b.id}" ${sel.has(b.id) ? 'checked' : ''} ${ok ? '' : 'disabled'} ${pick ? '' : 'hidden'}>
        <span style="min-width:0">
          <span class="code">${esc(b.invoice?.number || b.code)}</span>
          <span class="tiny" style="display:block;${b.invoiceReturn ? 'color:var(--green)' : ''}">${b.invoiceReturn ? `คืนแล้ว ${esc(fmtDate(b.invoiceReturn.date))}` : ok ? 'ยังไม่คืน' : 'รอส่งของก่อน'}</span>
        </span>
      </label>
      ${ok ? retToField(b, b.invoiceReturn?.receivedBy || '') : ''}
    </div>`;
    }).join('')}
  </div>
</div>

${perBill(all, 'invoiceReturns', invRetHistory)}

<p class="small strong" data-round style="margin-top:16px;color:var(--amber-dim)" hidden></p>

<label class="field" style="margin-top:14px">
  <span class="label">วันที่ได้เอกสารคืน<span class="req">*</span></span>
  <input class="input" type="date" data-date max="${todayYmd()}" value="${esc(cur?.date || todayYmd())}">
</label>

<div class="field" style="margin-top:14px">
  <span class="label">รูปเอกสารเลขที่บิล ที่คืน <span class="hint">(ไม่บังคับ · สูงสุด ${MAX_INVRET_PHOTOS} รูป)</span></span>
  <label class="drop" style="display:block">
    <span class="strong">📷 แตะเพื่อถ่ายรูป</span>
    <input type="file" accept="image/*" multiple hidden data-photos>
  </label>
  <div class="photo-grid" data-shots style="margin-top:10px"></div>
</div>

<label class="field" style="margin-top:14px">
  <span class="label" data-note-k></span>
  <textarea class="textarea" data-note style="min-height:60px"></textarea>
</label>

<p class="tiny dim" style="margin-top:12px">บันทึกในชื่อ <strong>${esc(byName)}</strong></p>`,
    foot: `${bills.some(b => b.invoiceReturn) ? `<button class="btn btn-ghost" data-cancel-ret style="margin-right:auto;color:var(--red,#c0392b)">ยกเลิกการคืน</button>` : ''}
           <button class="btn btn-ghost" data-close>ปิด</button>
           <button class="btn btn-accent" data-ok>บันทึกว่าคืนแล้ว</button>`,
    onMount(root){
      const okBtn = root.querySelector('[data-ok]');
      const cancelBtn = root.querySelector('[data-cancel-ret]');
      const input = root.querySelector('[data-photos]');
      const shots = root.querySelector('[data-shots]');
      const note = () => root.querySelector('[data-note]').value.trim();
      const date = () => root.querySelector('[data-date]').value;

      const roundLine = root.querySelector('[data-round]');
      const noteK = root.querySelector('[data-note-k]');
      const noteBox = root.querySelector('[data-note]');
      let again = null;
      const toOf = (b) => retToOf(root, b.id);

      retHook.get = () => ({ photos });
      retHook.set = (v) => { photos = [...(v.photos || [])]; refresh(); };
      function refresh(){
        markDirty();
        shots.innerHTML = photos.map((p, i) => `
          <span class="photo-x"><img src="${p}" alt="เอกสาร ${i + 1}"><button type="button" data-rm="${i}" aria-label="ลบรูป">×</button></span>`).join('');
        root.querySelectorAll('[data-bill]').forEach(c => { if (!c.disabled) c.checked ? sel.add(c.dataset.bill) : sel.delete(c.dataset.bill); });
        const list = chosen();
        syncRetTo(root, id => sel.has(id));
        /* แก้ซ้ำ = มีบิลที่เลือกเคยบันทึกไว้แล้ว → ต้องบอกเหตุผล */
        const redo = list.length ? list.some(b => (b.invoiceReturns || []).length) : again0;
        const round = Math.max(0, ...list.map(b => (b.invoiceReturns || []).length)) + 1;
        if (redo !== again){
          again = redo;
          noteK.innerHTML = redo ? 'เหตุผลที่แก้ / ยกเลิก<span class="req">*</span>' : 'หมายเหตุ <span class="hint">(ไม่บังคับ)</span>';
          noteBox.placeholder = redo ? 'เช่น ลงวันที่ผิด / ติ๊กผิดจุด' : '';
        }
        roundLine.hidden = !redo;
        roundLine.textContent = `บันทึกรอบที่ ${fmtNum(round)} — รอบเก่ายังเก็บไว้`;
        okBtn.textContent = pick && list.length ? `บันทึกคืนแล้ว ${fmtNum(list.length)} บิล`
          : redo ? `บันทึกรอบที่ ${fmtNum(round)}` : 'บันทึกว่าคืนแล้ว';
        const why = [];
        if (!list.length) why.push('เลือกบิลอย่างน้อย 1 บิล');
        const miss = list.filter(b => !toOf(b)).length;
        if (miss) why.push(pick ? `เลือกว่าคืนที่ไหนให้ครบ (ขาด ${fmtNum(miss)} บิล)` : 'เลือกว่าคืนที่ไหน');
        if (!date()) why.push('เลือกวันที่');
        if (redo && !note()) why.push('บอกเหตุผลที่แก้');
        okBtn.disabled = why.length > 0;
        okBtn.title = why.length ? 'ต้อง' + why.join(' · ') + 'ก่อน' : '';
        if (cancelBtn){
          const can = list.some(b => b.invoiceReturn);
          cancelBtn.disabled = !note() || !can;
          cancelBtn.title = !can ? 'บิลที่เลือกยังไม่ได้คืน' : note() ? '' : 'ต้องบอกเหตุผลที่ยกเลิกก่อน';
        }
      }
      root.addEventListener('input', refresh);
      root.addEventListener('change', refresh);
      input.addEventListener('change', async () => {
        keepPhotos(input.files, 'คืนเลขที่บิล', shots);   /* เก็บรูปที่เพิ่งถ่ายไว้ในเครื่องด้วย (js/keepPhoto.js) */
        for (const f of [...input.files]){
          if (photos.length >= MAX_INVRET_PHOTOS){ toast(`แนบได้สูงสุด ${MAX_INVRET_PHOTOS} รูป`, 'warn'); break; }
          try{ photos.push(await shrinkImage(f, 1200, 0.7)); }
          catch(err){ toast(err.message, 'err'); }
        }
        input.value = '';
        refresh();
      });
      on(shots, 'click', '[data-rm]', (e, b) => { photos.splice(Number(b.dataset.rm), 1); refresh(); });
      refresh();

      async function save(action){
        const btn = action === 'cancel' ? cancelBtn : okBtn;
        const label = btn.textContent;
        btn.disabled = true;
        let urls = [];
        if (action === 'return' && photos.length){
          btn.textContent = 'กำลังส่งรูป…';
          try{ urls = await uploadPhotos(photos, stopPhotoDir(x, 'return', 'invoice')); }
          catch(err){ urls = photos; console.error('[helper] อัปรูปเอกสารคืนไม่สำเร็จ', err); }
        }
        try{
          /* ยกเลิกได้เฉพาะบิลที่บันทึกคืนไว้แล้ว */
          const todo = action === 'cancel' ? chosen().filter(b => b.invoiceReturn) : chosen();
          for (const b of todo){
            recordInvoiceReturn(b.id, { action, date:date(), receivedBy: action === 'return' ? toOf(b) : '', note:note(), photos:urls },
              { byRole, byName });
          }
          close();
          const what = pick ? `${fmtNum(todo.length)} บิล` : `จุด ${x.code}`;
          toast(action === 'cancel' ? `ยกเลิกการคืนเอกสาร · ${what} แล้ว` : `บันทึกคืนเอกสารเลขที่บิล · ${what} แล้ว`, 'ok');
          /* คนขับ/ผู้ช่วยกดเอง — เก็บเป็นประวัติ แต่สถานะคืนบิลนับจากผู้รวบรวมบิลเท่านั้น (store.js RETURN_ROLES · 28 ต.ค.) */
          if (!RETURN_ROLES.has(byRole)) toast('หมายเหตุ: สถานะ "คืนแล้ว" นับจากผู้รวบรวมบิลเท่านั้น — ส่งใบให้ผู้รวบรวมตามปกติ', 'warn', 6000);
          const stuck = urls.filter(isLocalPhoto).length;
          if (stuck) toast(`รูป ${stuck} รูปยังส่งไม่ขึ้น (เน็ตหลุด) — รูปไม่หาย เน็ตมาแล้วจะถามให้ส่งใหม่`, 'warn', 6000);
          onSaved();
        }catch(err){
          toast(err.message, 'err');
          btn.textContent = label;
          btn.disabled = false;
        }
      }
      okBtn.onclick = () => save('return');
      if (cancelBtn) cancelBtn.onclick = () => save('cancel');
    },
  });
}

/** ติ๊กคืนเอกสารทั้งเที่ยว — เลือกวันที่ครั้งเดียว ใช้กับทุกจุดที่ส่งแล้วและยังไม่คืน */
export function invRetAllDialog(j, { byName, byRole = 'assistant', onSaved }){
  const todo = liveStops(j).filter(x => x.status === S.DELIVERED && !x.invoiceReturn);
  if (!todo.length) return toast('ไม่มีจุดที่รอคืนเอกสารในเที่ยวนี้', 'info');
  modal({
    title: 'คืนเลขที่บิล ทุกจุดที่ส่งแล้ว',
    draftKey: `invretall:${j.id}`,
    reopen: { name:'invretall', args:{ jobId: j.id } },
    body: `
<p class="muted small">เที่ยว <span class="code">${esc(j.code)}</span> · รอคืนเลขที่บิล ${fmtNum(todo.length)} จุด</p>
<div class="field" style="margin-top:14px">
  <span class="label">คืนแต่ละจุดที่ไหน<span class="req">*</span></span>
  <div class="invret-pick">
    ${todo.map(x => `
    <div class="invret-pick-row">
      <span class="invret-pick-main" style="cursor:default">
        <span style="min-width:0">
          <span class="code">${esc(x.invoice?.number || x.code)}</span>
          <span class="tiny dim" style="display:block">${esc(x.code)} · ${esc(x.dropoff.name)}</span>
        </span>
      </span>
      ${retToField(x)}
    </div>`).join('')}
  </div>
</div>
<label class="field" style="margin-top:14px">
  <span class="label">วันที่ได้เอกสารคืน<span class="req">*</span></span>
  <input class="input" type="date" data-date max="${todayYmd()}" value="${todayYmd()}">
</label>
<label class="field" style="margin-top:14px">
  <span class="label">หมายเหตุ <span class="hint">(ไม่บังคับ)</span></span>
  <textarea class="textarea" data-note style="min-height:56px"></textarea>
</label>
<p class="tiny dim" style="margin-top:10px">จะแนบรูปเอกสาร ให้กดคืนเลขที่บิล ทีละจุด</p>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>บันทึกคืนแล้ว ${fmtNum(todo.length)} จุด</button>`,
    onMount(root){
      const okBtn = root.querySelector('[data-ok]');
      function refresh(){
        syncRetTo(root);
        const miss = todo.filter(x => !retToOf(root, x.id)).length;
        const why = [];
        if (miss) why.push(`เลือกว่าคืนที่ไหนให้ครบ (ขาด ${fmtNum(miss)} จุด)`);
        if (!root.querySelector('[data-date]').value) why.push('เลือกวันที่');
        okBtn.disabled = why.length > 0;
        okBtn.title = why.length ? 'ต้อง' + why.join(' · ') + 'ก่อน' : '';
      }
      root.addEventListener('input', refresh);
      root.addEventListener('change', refresh);
      refresh();
      okBtn.onclick = () => {
        try{
          const n = returnInvoicesForJob(j.id, {
            date: root.querySelector('[data-date]').value,
            to: Object.fromEntries(todo.map(x => [x.id, retToOf(root, x.id)])),
            note: root.querySelector('[data-note]').value.trim(),
          }, { byRole, byName });
          close();
          toast(`บันทึกคืนเอกสารเลขที่บิล ${fmtNum(n)} จุดแล้ว`, 'ok');
          onSaved();
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

/* ---------- POD ------------------------------------------- */
/* กด POD → เลือกว่าจะปริ้น / บันทึก PDF (หน้าตัวอย่างของเบราว์เซอร์) หรือบันทึกเป็นไฟล์ Excel */
function podChoice(list, j, skipped = 0){
  const n = list.length;
  modal({
    title: `ใบส่งของ ${fmtNum(n)} จุด`,
    body: `
      <p class="small muted" style="margin-bottom:12px">${n > 1 ? 'จุดละหนึ่งหน้า' : esc(list[0].dropoff?.name || '')}${skipped ? ` · ข้าม ${fmtNum(skipped)} จุดที่ยังไม่ส่ง` : ''}</p>
      <div class="stack gap-8">
        <button type="button" class="btn btn-accent btn-block" data-podgo="print">🖨 ปริ้น / บันทึกเป็นไฟล์</button>
        <button type="button" class="btn btn-ghost btn-block" data-podgo="xlsx">⬇ บันทึกเป็นไฟล์ตาราง</button>
      </div>`,
    onMount: (m) => m.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-podgo]');
      if (!b) return;
      if (b.dataset.podgo === 'print'){
        close();
        try{ await printPod(list, j); }catch(err){ toast(err.message, 'warn', 4000); }
        return;
      }
      b.disabled = true;
      b.textContent = 'กำลังสร้างไฟล์ตาราง…';
      try{ await podXlsx(list, j); close(); toast(`บันทึกใบส่งของ ${fmtNum(n)} จุดเป็นไฟล์ตารางแล้ว`, 'ok'); }
      catch(err){ console.error('[pod] Excel', err); toast(err.message || 'บันทึกไฟล์ตารางไม่สำเร็จ', 'err', 4000); b.disabled = false; b.textContent = '⬇ บันทึกเป็นไฟล์ตาราง'; }
    }),
  });
}
export function podStop(x, j, bills){
  const list = (bills?.length ? bills : [x]).filter(canPod);
  if (!list.length) return toast('ยังไม่มีจุดที่ส่งของแล้ว — ปริ้นใบส่งของได้หลังปิดจุดส่ง', 'warn', 4000);
  podChoice(list, j);
}
export function podTrip(j){
  const stops = liveStops(j);
  const ready = stops.filter(canPod);
  if (!ready.length) return toast('ยังไม่มีจุดที่ส่งของแล้ว — ปริ้นใบส่งของได้หลังปิดจุดส่ง', 'warn', 4000);
  podChoice(ready, j, stops.length - ready.length);
}

/* ---------- เก็บเงินหน้างาน: หลักฐาน + ยืนยันรับเงิน (27 ต.ค. 2026) ----------
   ใช้ร่วม: billing.html (ฝ่ายบัญชี) · returns.html (คลัง ตอนคนขับส่งเงิน/บิลคืน) · กติกาอยู่ที่ store.collectOf
   ยกเลิกการยืนยันได้เฉพาะ admin */
export const COLLECT_TONE = { [COLLECT.SLIP]:'move', [COLLECT.CASH]:'wait', [COLLECT.DONE]:'done' };
/** ยอดที่เก็บหน้างาน − ค่าขนส่ง (0 = ตรง หรือเทียบไม่ได้) */
export const collectGapOf = (c, rev) => c?.p && rev > 0 && Math.abs((Number(c.p.amount) || 0) - rev) > 0.004
  ? (Number(c.p.amount) || 0) - rev : 0;

/**
 * @param {{x:object, rev?:number}[]} list จุดส่ง (+ ค่าขนส่งไว้เทียบยอด)
 * @param {{by:object, onDone?:Function}} opts
 */
export function collectDialog(list, { by, onDone } = {}){
  const items = (list || []).map(v => ({ ...v, c: collectOf(v.x) })).filter(v => v.c.st !== COLLECT.BILL);
  if (!items.length) return toast('บิลที่เลือกไม่ได้จ่ายหน้างาน (เงินโอน/เงินสด)', 'warn');
  const can = canWrite();
  const admin = isAdmin(getSession().staff);
  const todo = items.filter(v => v.c.st === COLLECT.SLIP || v.c.st === COLLECT.CASH);
  const sum = todo.reduce((a, v) => a + (Number(v.c.p.amount) || 0), 0);
  const inv = (x) => x.invoice?.number || x.code;
  modal({
    title: items.length > 1 ? `ยืนยันรับเงินหน้างาน · ${fmtNum(items.length)} บิล` : `เก็บเงินหน้างาน · บิล ${esc(inv(items[0].x))}`,
    wide: true,
    body: `
      <div class="collect-list">${items.map(({ x, c, rev }) => {
        const gap = collectGapOf(c, rev);
        return `
        <div class="collect-item">
          <div class="row between wraps gap-8">
            <span><span class="strong">${esc(x.dropoff?.name || '—')}</span> · บิล <span class="code">${esc(inv(x))}</span></span>
            <span class="pill" data-tone="${COLLECT_TONE[c.st]}">${esc(c.st)}</span>
          </div>
          <p class="small" style="margin-top:6px">${esc(c.p.method)} <b class="mono">${esc(fmtBaht(c.p.amount))}</b>${
            rev > 0 ? ` · ค่าขนส่ง ${esc(fmtBaht(rev))}` : ''}${gap ? ` <span class="bill-gap">⚠ ต่าง ${esc(fmtBaht(gap))}</span>` : ''}</p>
          <p class="tiny dim">บันทึกโดย ${esc(c.p.byName || '—')} · ${esc(fmtDateTime(c.p.at))} · รอบที่ ${fmtNum(c.p.round)}${
            c.st === COLLECT.CASH && c.holder ? ` · เงินอยู่ที่ ${esc(driverName(getDriver(c.holder)) || '—')}` : ''}</p>
          ${c.p.note ? `<p class="tiny" style="margin-top:4px">${esc(c.p.note)}</p>` : ''}
          ${(c.p.photos || []).length ? `<div class="photo-grid" style="margin-top:8px">${c.p.photos.map((u, n) => thumb(u, `หลักฐานบิล ${inv(x)} รูป ${n + 1}`)).join('')}</div>`
            : '<p class="tiny dim" style="margin-top:6px">ไม่มีรูปหลักฐาน</p>'}
          ${c.ok ? `<p class="tiny" style="margin-top:8px;color:var(--green)">✓ ยืนยันรับเงินแล้ว โดย ${esc(c.ok.byName)} · ${esc(fmtDateTime(c.ok.at))}${
            admin && can ? ` · <button type="button" class="linkish" data-uncollect="${esc(x.id)}">ยกเลิกการยืนยัน</button>` : ''}</p>` : ''}
        </div>`; }).join('')}</div>`,
    foot: `<button class="btn btn-ghost" data-close>ปิด</button>
      ${todo.length && can ? `<button class="btn btn-green" data-collect-ok>ยืนยันรับเงิน${todo.length > 1 ? ` ${fmtNum(todo.length)} บิล` : ''} · ${esc(fmtBaht(sum))}</button>` : ''}`,
    onMount(root){
      root.querySelector('[data-collect-ok]')?.addEventListener('click', () => {
        try{
          const n = confirmCollected(todo.map(v => v.x.id), by);
          close();
          toast(`ยืนยันรับเงินแล้ว ${fmtNum(n)} บิล — ย้ายไปอยู่แท็บ "ใบวางบิล" หน้ารายได้ · วางบิล`, 'ok', 5000);
          onDone?.();
        }catch(err){ toast(err.message, 'err'); }
      });
      on(root, 'click', '[data-uncollect]', (e, b) => {
        if (b.dataset.armed !== '1'){ b.dataset.armed = '1'; b.textContent = 'แตะอีกครั้งเพื่อยกเลิกการยืนยัน'; return; }
        try{ unconfirmCollected(b.dataset.uncollect, by); close(); toast('ยกเลิกการยืนยันแล้ว — กลับไปรอยืนยันรับเงิน', 'ok'); onDone?.(); }
        catch(err){ toast(err.message, 'err'); }
      });
    },
  });
}
