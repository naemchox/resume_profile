/* ============================================================
   billCollect.js — รวบรวมคืนบิล (หน้าผู้ช่วย ของคนขับที่ติ๊ก "ผู้รวบรวมบิลคืน" · 28 ต.ค.)

   คนขับไม่ต้องคืนบิลเองแล้ว — ผู้รวบรวมคนเดียวทำแทนทั้งหมด
     แท็บ ① ตรวจบิลในมือ   บิลที่ส่งแล้วของทุกงาน (รวมส่งไม่สำเร็จ ป้ายแดง) · ค่าเริ่ม = ยังไม่คืนทั้งหมด ไม่จำกัดวัน
                           ติ๊กบิลกระดาษที่ได้คืนมา → "ได้ใบแล้ว · รอส่งคลัง" (store.js markBillIn · เอาติ๊กออกได้จนกว่าจะส่ง)
     แท็บ ② ส่งคืนคลัง     กด + สร้างรอบ → บิลที่ได้ใบแล้วทั้งหมด (เอาออกได้) + รูปหลักฐานไม่จำกัด → ยืนยันส่ง
                           ทุกบิลในรอบ = คืนแล้ว (store.js sendBillBatch) → หน้าคืนบิลของออฟฟิศเห็นทันที
                           ดึงกลับแท็บ ① ได้ (31 ต.ค.): บิลรอส่ง ↩ ยังไม่ได้ใบ (markBillIn off)
                           · บิลที่ส่งคลังแล้ว กางรอบ → ↩ ดึงกลับ + เหตุผล (store.js undoBillReturn)
   รูปของรอบที่ยังไม่ยืนยัน เก็บใน IndexedDB (deliverDraft.js) — เปิดกล้องแล้วหน้าโหลดใหม่ รูปไม่หาย
   ============================================================ */

import { esc, toast, shrinkImage, on, confirmDialog, modal, close } from './ui.js';
import { listShipments, getJob, getDriver, fmtNum, fmtDate, fmtDateTime, S,
         markBillIn, sendBillBatch, undoBillReturn, billBatches, outcomeOf, isFailOutcome, OUTCOMES, inCollectRange } from './store.js';
import { uploadPhotos, jobPhotoDir } from './cloud.js';
import { saveDraft, loadDraft, dropDrafts } from './deliverDraft.js';

const DRAFT = ['__billbatch'];                 /* คีย์ของรอบส่งคืนที่ยังไม่ยืนยัน (ใน deliverDraft.js) */
const localYmd = (v) => { const d = new Date(v); return isNaN(d) ? '' : new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const deliveredAt = (x) => (x.events || []).filter(e => e.status === S.DELIVERED).map(e => e.at).pop() || '';
const norm = (v) => String(v ?? '').toLowerCase().replace(/[\s-]/g, '');
const failedBill = (x) => isFailOutcome(outcomeOf(x));

/* ตัวกรอง — อยู่ในหน่วยความจำ (เปิดหน้าใหม่ = กลับค่าเริ่ม "ยังไม่คืนทั้งหมด" ไม่ใช่วันนี้) */
const st = { tab: 'check', show: 'wait', from: '', to: '', q: '', batch: null, open: '' };   /* open = รอบส่งคืนที่กางอยู่ */

/** บิลทั้งหมดที่ผู้รวบรวมต้องดู — ส่งของแล้ว (สำเร็จ / ไม่สำเร็จ) ตั้งแต่ COLLECT_FROM · เก่าสุดอยู่บน (ค้างนานสุดต้องตามก่อน) */
function allBills(){
  return listShipments({ status: S.DELIVERED }).filter(inCollectRange)
    .map(x => ({ x, day: localYmd(deliveredAt(x)) }))
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.x.code).localeCompare(String(b.x.code)));
}
const stateOf = (x) => x.invoiceReturn ? 'back' : x.billIn ? 'held' : 'wait';
const hay = (x) => [x.code, x.invoice?.number, x.delivery, ...(x.altCodes || []), x.dropoff?.name,
  getJob(x.jobId)?.code].filter(Boolean).map(norm).join(' ');

/**
 * วาดหน้ารวบรวมคืนบิล
 * @param {HTMLElement} app
 * @param {{me:string, byName:string, onBack:()=>void, rerender:()=>void}} ctx
 */
export function collectView(app, ctx){
  /* ข้อมูลใหม่เข้ามาระหว่างพิมพ์ค้นหา — วาดใหม่แล้วคืนเคอร์เซอร์ คีย์บอร์ดไม่หุบ */
  const typing = document.activeElement?.matches?.('[data-cfind]') ? document.activeElement.selectionStart : null;
  const rows = allBills();
  const cnt = { wait: 0, held: 0, back: 0 };
  rows.forEach(({ x }) => cnt[stateOf(x)]++);

  app.innerHTML = `
<div style="margin:14px 0">
  <button class="btn" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);font-size:20px;font-weight:600;padding:12px 24px;min-height:52px;gap:6px;padding-left:16px" data-back aria-label="กลับ"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>กลับ</button>
</div>
<div class="driver-card">
  <div class="driver-hero">
    <p class="drv-role is-assist">📦 ผู้รวบรวมบิลคืน</p>
    <h2 style="margin-top:6px;font-size:21px">รวบรวมคืนบิล</h2>
    <div class="drv-kpis">
      <div class="drv-kpi is-hot${cnt.wait ? '' : ' is-zero'}"><span class="drv-kpi-tx"><span class="drv-kpi-l">ยังไม่ได้ใบ</span><span><b>${fmtNum(cnt.wait)}</b> <small>บิล</small></span></span></div>
      <div class="drv-kpi${cnt.held ? '' : ' is-zero'}"><span class="drv-kpi-tx"><span class="drv-kpi-l">ได้ใบแล้ว · รอส่งคลัง</span><span><b>${fmtNum(cnt.held)}</b> <small>บิล</small></span></span></div>
    </div>
  </div>
  <div class="drv-list-body" style="padding:14px;background:var(--bg)">
    <div class="drv-tabs" role="tablist">
      <button type="button" role="tab" aria-selected="${st.tab === 'check'}" data-ctab="check">① ตรวจบิลในมือ <b>${fmtNum(cnt.wait)}</b></button>
      <button type="button" role="tab" aria-selected="${st.tab === 'send'}" data-ctab="send">② ส่งคืนคลัง <b>${fmtNum(cnt.held)}</b></button>
    </div>
    ${st.tab === 'check' ? checkTab(rows) : sendTab(rows)}
  </div>
</div>`;
  bind(app, ctx);
  if (st.tab === 'check') applyFind(app);
  else if (st.batch) paintBatch(app, ctx);
  if (typing !== null){
    const q = app.querySelector('[data-cfind]');
    if (q){ q.focus(); try{ q.setSelectionRange(typing, typing); }catch{} }
  }
}

/* ---------- ① ตรวจบิลในมือ ---------- */
function checkTab(rows){
  const inRange = rows.filter(({ day }) => (!st.from || day >= st.from) && (!st.to || day <= st.to));
  const shown = inRange.filter(({ x }) => st.show === 'all' || stateOf(x) === st.show);
  return `
<p class="drv-hint">เทียบใบบิลกระดาษในมือกับรายการนี้ — แตะบิลที่ได้ใบคืนมาแล้ว</p>
<div class="row gap-8 wraps" style="margin-bottom:10px">
  <select class="input select" data-cshow style="flex:1;min-width:150px">
    <option value="wait"${st.show === 'wait' ? ' selected' : ''}>ยังไม่ได้ใบ</option>
    <option value="held"${st.show === 'held' ? ' selected' : ''}>ได้ใบแล้ว · รอส่งคลัง</option>
    <option value="back"${st.show === 'back' ? ' selected' : ''}>ส่งคืนคลังแล้ว</option>
    <option value="all"${st.show === 'all' ? ' selected' : ''}>ทั้งหมด</option>
  </select>
</div>
<div class="row gap-8 wraps" style="margin-bottom:10px;align-items:center">
  <span class="tiny dim">วันที่ส่ง</span>
  <input type="date" class="input" data-cfrom value="${esc(st.from)}" style="flex:1;min-width:130px">
  <span class="tiny dim">ถึง</span>
  <input type="date" class="input" data-cto value="${esc(st.to)}" style="flex:1;min-width:130px">
  ${st.from || st.to ? '<button type="button" class="btn btn-quiet btn-sm" data-cclear>ทุกวัน</button>' : ''}
</div>
<div class="drv-find"><input class="input" type="search" data-cfind value="${esc(st.q)}" placeholder="🔎 เลขบิล / Delivery / ชื่อร้าน / เลขเที่ยว" autocomplete="off"></div>
<p class="drv-find-note" data-cnote hidden></p>
${shown.length ? shown.map(({ x, day }) => billRow(x, day)).join('')
  : `<div class="empty"><div class="empty-mark">✅</div><p class="small">ไม่มีบิลในรายการนี้${st.from || st.to ? 'ในช่วงวันที่เลือก' : ''}</p></div>`}`;
}

function billRow(x, day){
  const s = stateOf(x);
  const j = getJob(x.jobId);
  const drv = (x.driverIds || []).map(id => getDriver(id)?.name).filter(Boolean).join(', ');
  const fail = failedBill(x);
  return `
<label class="drv-pick${s === 'back' ? ' is-done' : ''}" data-hay="${esc(hay(x))}">
  <input type="checkbox" data-billin="${x.id}" ${s !== 'wait' ? 'checked' : ''} ${s === 'back' ? 'disabled' : ''}>
  <span class="grow" style="min-width:0">
    <span class="strong" style="display:block">บิล ${esc(x.invoice?.number || x.code)}</span>
    <span class="tiny dim" style="display:block">${esc(x.dropoff?.name || '')}</span>
    <span class="tiny dim">ส่ง ${esc(fmtDate(day))} · เที่ยว ${esc(j?.code || '—')}${drv ? ` · ${esc(drv)}` : ''}${x.delivery && x.delivery !== x.code ? ` · Delivery ${esc(x.delivery)}` : ''}</span>
    ${fail ? `<span class="dup-tag">✕ ส่งไม่สำเร็จ · ${esc(OUTCOMES[outcomeOf(x)])}</span>` : ''}
  </span>
  <span class="tiny strong" style="white-space:nowrap;color:${s === 'back' ? 'var(--green)' : s === 'held' ? 'var(--amber-dim)' : 'var(--text-3)'}">
    ${s === 'back' ? `คืนคลังแล้ว<br><span class="dim" style="font-weight:400">${esc(fmtDate(x.invoiceReturn.date))}</span>` : s === 'held' ? 'ได้ใบแล้ว' : 'ยังไม่ได้ใบ'}</span>
</label>`;
}

function applyFind(app){
  const q = norm(st.q);
  let shown = 0;
  app.querySelectorAll('[data-hay]').forEach(r => { const hit = !q || r.dataset.hay.includes(q); r.hidden = !hit; if (hit) shown++; });
  const note = app.querySelector('[data-cnote]');
  if (!note) return;
  note.hidden = !q;
  note.textContent = q ? (shown ? `เจอ ${fmtNum(shown)} บิล` : 'ไม่เจอในรายการนี้ — ลองเปลี่ยนเป็น "ทั้งหมด" หรือ "ทุกวัน"') : '';
}

/* ---------- ② ส่งคืนคลัง ---------- */
function sendTab(rows){
  const held = rows.filter(({ x }) => stateOf(x) === 'held');
  const done = billBatches().slice(0, 30);
  return `
${st.batch ? '<div data-batch></div>' : `
<button type="button" class="btn btn-accent btn-block" data-newbatch style="min-height:56px;font-size:18px" ${held.length ? '' : 'disabled'}>＋ สร้างรอบส่งคืนคลัง (${fmtNum(held.length)} บิล)</button>
<p class="tiny dim" style="margin-top:6px">${held.length ? 'รวมบิลที่ติ๊ก "ได้ใบแล้ว" ทั้งหมด · ถ่ายรูปตอนส่งให้คลังเป็นหลักฐาน' : 'ยังไม่มีบิลที่ได้ใบแล้ว — ติ๊กในแท็บ ① ก่อน'}</p>
${held.length ? `<h4 style="margin:16px 0 10px">บิลที่รอส่งคลัง</h4>
${held.map(({ x }) => `
<div class="drv-pick">
  <span class="grow" style="min-width:0"><span class="strong">บิล ${esc(x.invoice?.number || x.code)}</span>
  <span class="tiny dim" style="display:block">${esc(x.dropoff?.name || '')}</span></span>
  ${unheldBtn(x)}
</div>`).join('')}` : ''}`}
<hr class="divider" style="margin:18px 0">
<h4 style="margin-bottom:10px">รอบที่ส่งคืนแล้ว</h4>
${done.length ? '<p class="tiny dim" style="margin:-4px 0 10px">แตะรอบเพื่อดูบิล · ส่งผิดบิลกด ↩ ดึงกลับ</p>' : ''}
${done.length ? done.map(b => {
  const isOpen = st.open === b.id;
  const live = b.stops.filter(x => inBatch(x, b.id)).length;
  return `
<div class="drv-proof" style="margin-bottom:10px">
  <button type="button" data-bopen="${esc(b.id)}" aria-expanded="${isOpen}" style="all:unset;display:block;width:100%;cursor:pointer">
    <div class="row between gap-8"><span class="strong">${isOpen ? '▾' : '▸'} ${esc(fmtDateTime(b.at))}</span><span class="tiny dim">${fmtNum(live)} บิล${live < b.stops.length ? ` (ดึงกลับ ${fmtNum(b.stops.length - live)})` : ''} · รูป ${fmtNum(b.photos.length)}</span></div>
    ${isOpen ? '' : `<p class="tiny dim" style="margin-top:4px">${b.stops.slice(0, 12).map(x => esc(x.invoice?.number || x.code)).join(' · ')}${b.stops.length > 12 ? ` · และอีก ${fmtNum(b.stops.length - 12)} บิล` : ''}</p>`}
  </button>
  ${isOpen ? b.stops.map(x => inBatch(x, b.id) ? `
  <div class="drv-pick" style="margin-top:8px">
    <span class="grow" style="min-width:0"><span class="strong">บิล ${esc(x.invoice?.number || x.code)}</span>
    <span class="tiny dim" style="display:block">${esc(x.dropoff?.name || '')}</span></span>
    <button type="button" class="btn btn-ghost btn-sm" data-undo="${x.id}" style="white-space:nowrap">↩ ดึงกลับ</button>
  </div>` : `
  <div class="drv-pick is-done" style="margin-top:8px">
    <span class="grow" style="min-width:0"><span class="strong" style="text-decoration:line-through">บิล ${esc(x.invoice?.number || x.code)}</span>
    <span class="tiny dim" style="display:block">${esc(x.dropoff?.name || '')}</span></span>
    <span class="tiny strong" style="white-space:nowrap;color:var(--amber-dim)">ดึงกลับแล้ว</span>
  </div>`).join('') : ''}
  <div class="photo-grid" style="margin-top:8px">${b.photos.slice(0, 8).map(p => `<img src="${esc(p)}" alt="รูปส่งคืนคลัง" loading="lazy">`).join('')}</div>
</div>`; }).join('') : '<p class="small dim">ยังไม่เคยส่งคืน</p>'}`;
}

/** บิลยังนับว่าอยู่ในรอบนี้ไหม — ดึงกลับแล้ว / ส่งใหม่รอบอื่น = ไม่อยู่ */
const inBatch = (x, id) => x.invoiceReturn?.batch === id;
const unheldBtn = (x) => `<button type="button" class="btn btn-ghost btn-sm" data-unheld="${x.id}" style="white-space:nowrap">↩ ยังไม่ได้ใบ</button>`;

/** ถามเหตุผลดึงกลับ — คืน null ถ้ากดยกเลิก */
function askReason(code){
  return new Promise((res) => {
    let done = false;
    const end = (v) => { if (!done){ done = true; res(v); } };
    modal({
      title: `ดึงบิล ${esc(code)} กลับ`,
      body: `<p class="muted">บิลจะกลับไปเป็น "ยังไม่ได้ใบ" ในแท็บ ① · หน้าคืนบิลของออฟฟิศจะเห็นเป็นยังไม่คืน</p>
<label class="label" style="margin-top:10px">เหตุผล<span class="req">*</span></label>
<input class="input" data-why maxlength="200" placeholder="เช่น ส่งผิดบิล / ใบยังไม่ครบ" autocomplete="off">`,
      foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
             <button class="btn btn-accent" data-ok>↩ ดึงกลับ</button>`,
      guard: false,
      onMount(root){
        const why = root.querySelector('[data-why]');
        setTimeout(() => why.focus(), 50);
        root.querySelector('[data-ok]').onclick = () => {
          const v = why.value.trim();
          if (!v){ why.focus(); return toast('ใส่เหตุผลก่อน', 'warn'); }
          end(v); close();          /* end ก่อน — close() เรียก onClose → end(null) */
        };
        root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) end(null); });
      },
      onClose: () => end(null),
    });
  });
}

/** รอบที่กำลังสร้าง — บิลที่จะส่ง (เอาออกได้) + รูป + ปุ่มยืนยัน */
function paintBatch(app, ctx){
  const box = app.querySelector('[data-batch]');
  if (!box) return;
  const b = st.batch;
  const held = allBills().filter(({ x }) => stateOf(x) === 'held').map(v => v.x);
  b.ids = b.ids.filter(id => held.some(x => x.id === id));        /* บิลที่หลุดสถานะไปแล้ว (เช่น ออฟฟิศคืนให้) เอาออก */
  box.innerHTML = `
<div class="drv-proof" style="border-color:var(--amber)">
  <p class="strong">รอบส่งคืนคลัง · ${esc(fmtDate(new Date()))}</p>
  <p class="tiny dim" style="margin:2px 0 10px">เอาติ๊กออก = ไม่ส่งรอบนี้ (ยังอยู่ในรายการ "ได้ใบแล้ว")</p>
  ${held.map(x => `
  <div class="row gap-8" style="align-items:center">
  <label class="drv-pick grow"><input type="checkbox" data-bpick="${x.id}" ${b.ids.includes(x.id) ? 'checked' : ''}>
    <span class="grow" style="min-width:0"><span class="strong">บิล ${esc(x.invoice?.number || x.code)}</span>
    <span class="tiny dim" style="display:block">${esc(x.dropoff?.name || '')}</span></span></label>
  ${unheldBtn(x)}</div>`).join('')}
  <div class="field" style="margin-top:14px">
    <div class="shot-head">
      <span class="shot-count${b.photos.length ? ' is-ok' : ''}">${fmtNum(b.photos.length)} รูป</span>
      <span><span class="label" style="margin:0">รูปหลักฐานตอนส่งคืน<span class="req">*</span></span>
      <span class="tiny dim" style="display:block">ถ่ายได้ไม่จำกัด · เช่น ปึกบิลที่ส่ง · คนที่รับในคลัง</span></span>
    </div>
    <label class="drop" style="display:block;margin-top:8px">
      <span class="strong">📷 แตะเพื่อถ่ายรูป</span>
      <input type="file" accept="image/*" capture="environment" multiple hidden data-bphotos>
    </label>
    <div class="photo-grid" style="margin-top:10px">${b.photos.map((p, i) => `<span class="photo-x"><img src="${p}" alt="รูปที่ ${i + 1}"><button type="button" data-brm="${i}" aria-label="ลบรูป">×</button></span>`).join('')}</div>
  </div>
  <div class="row gap-8" style="margin-top:14px">
    <button type="button" class="btn btn-ghost" data-bcancel>ยกเลิกรอบนี้</button>
    <button type="button" class="btn btn-green grow" data-bsend ${b.ids.length && b.photos.length ? '' : 'disabled'}>✓ ยืนยันส่งคืน ${fmtNum(b.ids.length)} บิล</button>
  </div>
  ${!b.photos.length ? '<p class="tiny" style="margin-top:6px;color:var(--amber-dim)">ถ่ายรูปอย่างน้อย 1 รูปก่อนยืนยัน</p>' : ''}
</div>`;
}

const keepDraft = (ctx) => st.batch && saveDraft({ driverId: ctx.me, stopIds: DRAFT, stage: 1, of: 1, cargo: st.batch.photos, ids: st.batch.ids })
  .catch(err => console.warn('[collect] เก็บรอบที่ค้างไม่ได้', err));

function bind(app, ctx){
  app.querySelector('[data-back]').onclick = ctx.onBack;
  on(app, 'click', '[data-ctab]', (e, b) => { st.tab = b.dataset.ctab; ctx.rerender(); });
  const val = (sel) => app.querySelector(sel);
  val('[data-cshow]')?.addEventListener('change', (e) => { st.show = e.target.value; ctx.rerender(); });
  val('[data-cfrom]')?.addEventListener('change', (e) => { st.from = e.target.value; ctx.rerender(); });
  val('[data-cto]')?.addEventListener('change', (e) => { st.to = e.target.value; ctx.rerender(); });
  val('[data-cclear]')?.addEventListener('click', () => { st.from = st.to = ''; ctx.rerender(); });
  val('[data-cfind]')?.addEventListener('input', (e) => { st.q = e.target.value; applyFind(app); });
  app.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-billin]');
    if (!cb) return;
    try{ markBillIn([cb.dataset.billin], cb.checked, { byName: ctx.byName, byId: ctx.me }); }
    catch(err){ toast(err.message, 'err'); cb.checked = !cb.checked; }
  });

  /* ---- ดึงกลับแท็บ ① (31 ต.ค.) ----
     #app เป็นตัวเดิมทุกครั้งที่วาด → ผูกครั้งเดียว ไม่งั้นกด 1 ครั้งทำงานซ้ำตามจำนวนรอบที่วาด (กาง/หุบสลับกันเอง)
     ctx ล่าสุดเก็บไว้ใน undoCtx */
  undoCtx = ctx;
  if (bound.has(app)) return bindBatch(app, ctx);
  bound.add(app);
  on(app, 'click', '[data-unheld]', (e, b) => {
    const ctx = undoCtx;
    e.preventDefault();
    try{
      if (markBillIn([b.dataset.unheld], false, { byName: ctx.byName, byId: ctx.me })) toast('ย้ายกลับไป "ยังไม่ได้ใบ" แล้ว', 'ok');
      if (st.batch){ st.batch.ids = st.batch.ids.filter(v => v !== b.dataset.unheld); keepDraft(ctx); }
      ctx.rerender();
    }catch(err){ toast(err.message, 'err'); }
  });
  on(app, 'click', '[data-bopen]', (e, b) => { st.open = st.open === b.dataset.bopen ? '' : b.dataset.bopen; undoCtx.rerender(); });
  on(app, 'click', '[data-undo]', async (e, b) => {
    const ctx = undoCtx;
    const id = b.dataset.undo;
    const x = billBatches().flatMap(v => v.stops).find(v => v.id === id);
    const why = await askReason(x?.invoice?.number || x?.code || '');
    if (!why) return;
    try{
      undoBillReturn([id], why, { byName: ctx.byName });
      toast('ดึงกลับแล้ว — บิลอยู่ที่แท็บ ① "ยังไม่ได้ใบ"', 'ok');
      ctx.rerender();
    }catch(err){ toast(err.message, 'err'); }
  });
  bindBatch(app, ctx);
}

const bound = new WeakSet();
let undoCtx = null;

function bindBatch(app, ctx){
  const val = (sel) => app.querySelector(sel);
  /* ---- รอบส่งคืน ---- */
  val('[data-newbatch]')?.addEventListener('click', () => {
    st.batch = { ids: allBills().filter(({ x }) => stateOf(x) === 'held').map(v => v.x.id), photos: [] };
    keepDraft(ctx); ctx.rerender();
  });
  const box = app.querySelector('[data-batch]');
  if (!box) return;
  box.addEventListener('change', async (e) => {
    const pick = e.target.closest('[data-bpick]');
    if (pick){
      const id = pick.dataset.bpick;
      st.batch.ids = pick.checked ? [...new Set([...st.batch.ids, id])] : st.batch.ids.filter(v => v !== id);
      keepDraft(ctx); return paintBatch(app, ctx);
    }
    const input = e.target.closest('[data-bphotos]');
    if (!input) return;
    for (const f of [...input.files]){
      try{ st.batch.photos.push(await shrinkImage(f, 1200, 0.7)); }
      catch(err){ toast(err.message, 'err'); }
    }
    input.value = '';
    keepDraft(ctx); paintBatch(app, ctx);
  });
  box.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-brm]');
    if (rm){ st.batch.photos.splice(+rm.dataset.brm, 1); keepDraft(ctx); return paintBatch(app, ctx); }
    if (e.target.closest('[data-bcancel]')){
      if (st.batch.photos.length && !(await confirmDialog({ title:'ยกเลิกรอบนี้', message:'รูปที่ถ่ายไว้ในรอบนี้จะหายไป — บิลยังอยู่ในรายการ "ได้ใบแล้ว"', ok:'ยกเลิกรอบ' }))) return;
      st.batch = null; dropDrafts(ctx.me, DRAFT); return ctx.rerender();
    }
    const send = e.target.closest('[data-bsend]');
    if (!send) return;
    const b = st.batch;
    if (!b.ids.length) return toast('เลือกบิลอย่างน้อย 1 บิล', 'warn');
    if (!b.photos.length) return toast('ถ่ายรูปหลักฐานอย่างน้อย 1 รูป', 'warn');
    const ok = await confirmDialog({ title:'ยืนยันส่งคืนคลัง', message:`ส่งคืน ${fmtNum(b.ids.length)} บิล พร้อมรูป ${fmtNum(b.photos.length)} รูป — ทุกบิลในรอบนี้จะเป็น "คืนแล้ว" ทันที`, ok:'ยืนยันส่ง', tone:'btn-green' });
    if (!ok) return;
    send.disabled = true; send.textContent = 'กำลังส่งรูป…';
    try{
      const ymd = localYmd(new Date());
      const urls = await uploadPhotos(b.photos, jobPhotoDir({ code: `BILLRETURN-${ymd}` }, 'return', 'photo'));
      const r = sendBillBatch(b.ids, urls, { byName: ctx.byName });
      st.batch = null; dropDrafts(ctx.me, DRAFT);
      toast(`ส่งคืนคลังแล้ว ${fmtNum(r.n)} บิล`, 'ok');
      ctx.rerender();
    }catch(err){
      toast(err.message, 'err');
      send.disabled = false; send.textContent = `✓ ยืนยันส่งคืน ${fmtNum(b.ids.length)} บิล`;
    }
  });
}

/** เปิดหน้ามาใหม่ (กลับจากกล้อง) — เอารอบที่ค้างไว้กลับมา */
export async function restoreBatch(me){
  if (st.batch) return false;
  const rec = await loadDraft(me, DRAFT).catch(() => null);
  if (!rec) return false;
  st.tab = 'send';
  st.batch = { ids: rec.ids || [], photos: rec.cargo || [] };
  return true;
}
