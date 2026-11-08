/* ============================================================
   customer.js — ขั้นที่ 1: นำเข้างานขนส่งจากไฟล์ Excel

   ไหลงาน: เลือกไฟล์ → เลือกชีต/ผังคอลัมน์ → ตรวจทานทีละแถว
            (รวมถึงเลือกคนขับให้ครบ) → กดนำเข้าทีเดียวทั้งชุด

   ของเดิมที่เป็นฟอร์มกรอกมือยังอยู่ ย้ายไปพับไว้ท้ายหน้า
   เพราะยังต้องใช้ตอนมีงานแทรกด่วนที่ไม่อยู่ในไฟล์
   ============================================================ */

import {
  shell, $, $$, esc, toast, modal, close, demoBar, progressBox, markDirty,
} from './ui.js';
import {
  createShipment, createJob, createDriver, listDrivers, searchDrivers, isActiveDriver,
  matchDriverName, codeExists, findShipments, subscribe, batchWrites,
  settings, fmtNum, fmtBaht, fmtDate, todayYmd,
  driverName,
} from './store.js';
import {
  loadXLSX, readWorkbook, readWorkbookBuffer, sheetGrid, buildDrafts, draftToPayload, groupJobs,
  driversChanged, driverTextOf, buildUpdatedFile,
  DEFAULT_MAP, FIELD_LABELS, colLetter, splitDrivers, autoMap, NO_TRIP,
} from './xlsxImport.js';
import {
  saveSession, loadSession, clearSession, saveFile, loadFile,
  saveManual, loadManual, clearManual,
} from './importSession.js';
import { celebrate } from './motion.js';
import { gate } from './auth.js';
import { pttPrices } from './fuelPrice.js';

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('customer');
shell({ role: 'มุมมองลูกค้า' });
$('#demoBarSlot').appendChild(demoBar('หน้านี้คือจุดที่ข้อมูลทั้งหมดเข้าระบบ — อัปโหลดไฟล์ครั้งเดียวได้งานทั้งวัน'));

const WAREHOUSE = settings().warehouse;

/* ---------- สถานะของหน้า ---------------------------------- */
const state = {
  file: null,
  wb: null,
  sheets: [],
  sheet: null,
  headerRow: 1,
  map: { ...DEFAULT_MAP },
  grid: [],
  drafts: [],
  onlyProblem: false,
  needsFileUpdate: false,
};

/* ---------- จำไว้กันหน้าเว็บรีโหลดแล้วข้อมูลหาย --------------
   ตารางตรวจทานอยู่ในตัวแปรนี้อย่างเดียว หน้าเว็บโหลดใหม่เมื่อไหร่ก็หายหมด
   ซึ่งโหลดใหม่เองได้หลายทางโดยที่เราไม่ได้สั่ง
     · Live Server รีโหลดเมื่อไฟล์ในโฟลเดอร์เปลี่ยน (โฟลเดอร์นี้อยู่ใน Google Drive
       ที่ซิงก์เองตลอด แค่มีไฟล์ใหม่ลงโฟลเดอร์ก็รีโหลดแล้ว)
     · Chrome ทิ้งแท็บที่เปิดค้างไว้นาน ๆ เพื่อคืนหน่วยความจำ
   จึงเซฟทุกครั้งที่วาดตารางใหม่ แล้วกู้กลับตอนเปิดหน้า */
function persist(){
  if (!state.drafts.length) return;
  saveSession({
    fileName: state.file?.name || '',
    sheets: state.sheets,
    sheet: state.sheet,
    headerRow: state.headerRow,
    map: state.map,
    mapTouched: state.mapTouched,
    onlyProblem: state.onlyProblem,
    needsFileUpdate: !!state.needsFileUpdate,
    drafts: state.drafts,
  });
}

/** ป้ายชื่อไฟล์ใต้กล่องลากไฟล์ */
function fileChip(name, sub){
  return `
    <div class="file-chip">
      <span class="file-thumb" style="display:grid;place-items:center;font-size:10px;font-weight:600;color:var(--text-3)">XLS</span>
      <span class="grow">
        <span class="strong trunc" style="display:block">${esc(name)}</span>
        <span class="tiny dim">${esc(sub)}</span>
      </span>
    </div>`;
}

/* ================= 1. รับไฟล์ ============================== */
const drop = $('#xlDrop');
const fileInput = $('#xlFile');

drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); fileInput.click(); }
});
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => {
  e.preventDefault(); drop.classList.add('is-over');
}));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => {
  e.preventDefault(); drop.classList.remove('is-over');
}));
drop.addEventListener('drop', (e) => takeFile(e.dataTransfer.files?.[0]));
fileInput.addEventListener('change', () => takeFile(fileInput.files?.[0]));

async function takeFile(f){
  if (!f) return;
  if (!/\.xlsx?$/i.test(f.name)) return toast('รองรับเฉพาะไฟล์ .xlsx และ .xls', 'warn');

  const pg = progressBox($('#fileInfo'), {
    title: f.name,
    steps: ['เตรียมตัวอ่าน Excel', 'อ่านไฟล์', 'จัดกลุ่มตามเลข 5 · ตรวจทุกแถว'],
  });
  try{
    /* ครั้งแรกต้องโหลดตัวอ่านจากอินเทอร์เน็ต เลยแยกเป็นขั้นให้เห็น */
    pg.step(0, 3, 30);
    await loadXLSX();
    pg.step(1, 32, 65, `${(f.size / 1024).toFixed(0)} KB`);
    const { wb, sheets } = await readWorkbook(f);
    state.file = f; state.wb = wb; state.sheets = sheets;
    state.sheet = sheets[0];
    pg.step(2, 68, 95, `${sheets.length} ชีต — ${sheets.join(' · ')}`);
    await new Promise(r => setTimeout(r, 30));      /* ให้จอได้วาดแถบก่อนเริ่มงานหนัก */
    /* เก็บไฟล์ต้นฉบับไว้ด้วย ถ้าหน้าเว็บรีโหลดจะได้กู้ตารางกลับมาได้ครบ
       และยังเปลี่ยนชีต/ผังคอลัมน์ กับดาวน์โหลดไฟล์ที่อัปเดตคนขับได้เหมือนเดิม */
    saveFile(f);

    const sel = $('#sheetSel');
    sel.innerHTML = sheets.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    sel.value = state.sheet;

    $('#stepMap').hidden = false;
    $('#resetAll').hidden = false;
    buildMapUI();
    await reparse();
    pg.done(`อ่านครบแล้ว · ${fmtNum(state.drafts.length)} จุดส่ง`);
    setTimeout(() => {
      $('#fileInfo').innerHTML = fileChip(f.name, `${sheets.length} ชีต — ${sheets.join(' · ')}`);
    }, 900);
  }catch(err){
    pg.fail(err.message);
    toast(err.message, 'err');
  }
}

$('#resetAll').onclick = async () => {
  await clearSession();
  clearManual();
  location.reload();
};

/* ================= 2. ผังคอลัมน์ =========================== */
function buildMapUI(){
  const width = Math.max(26, ...state.sheets.map(() => 26));
  const opts = Array.from({ length: width }, (_, i) => colLetter(i));
  $('#mapGrid').innerHTML = Object.keys(FIELD_LABELS).map(k => `
    <label>
      <span class="dim">${esc(FIELD_LABELS[k])}</span>
      <select class="input" data-map="${k}">
        ${k === 'key' ? '' : '<option value="">— ไม่ใช้ —</option>'}
        ${opts.map(c => `<option value="${c}"${state.map[k] === c ? ' selected' : ''}>${c}</option>`).join('')}
      </select>
    </label>`).join('');

  const note = $('#mapNote');
  if (note){
    const miss = (state.autoMissing || []).filter(k => !state.map[k]);
    note.innerHTML = state.mapTouched
      ? 'คุณตั้งค่าผังเองแล้ว ระบบจะไม่เดาทับให้'
      : `ระบบเดาผังจากชื่อหัวตารางให้แล้ว${miss.length
          ? ` · <b style="color:var(--amber-dim)">เดาไม่ได้ ${miss.length} ช่อง: ${miss.map(k => esc(FIELD_LABELS[k])).join(', ')}</b>`
          : ' ครบทุกช่อง'}`;
  }

  $$('#mapGrid select').forEach(sel => {
    sel.onchange = () => { state.mapTouched = true; state.map[sel.dataset.map] = sel.value; reparse(); };
  });
}

$('#toggleMap').onclick = () => {
  const box = $('#mapBox');
  box.hidden = !box.hidden;
  $('#toggleMap').textContent = box.hidden ? 'ตั้งค่าผังคอลัมน์' : 'ซ่อนผังคอลัมน์';
};
$('#sheetSel').onchange = (e) => { state.sheet = e.target.value; reparse(); };
$('#headerRow').onchange = (e) => {
  state.headerRow = Math.max(1, Number(e.target.value) || 1);
  reparse();
};

/* ================= 3. อ่านและตรวจทาน ======================= */
async function reparse(){
  if (!state.wb || !state.sheet) return;
  try{
    state.grid = await sheetGrid(state.wb, state.sheet);

    /* เดาผังจากชื่อหัวตารางก่อนเสมอ — ยึดตัวอักษรคอลัมน์ตายตัวไม่ได้
       เพราะไฟล์แต่ละชุดคอลัมน์ไม่ตรงกัน ถ้าผู้ใช้แก้เองแล้วจะไม่ทับ */
    if (!state.mapTouched){
      const { map, missing, matched } = autoMap(state.grid[state.headerRow - 1] || []);
      /* ช่องที่เดาไม่ได้ ค่อยถอยไปใช้ตัวอักษรตั้งต้น — แต่ห้ามไปทับช่องที่เดาได้แล้ว
         ไม่งั้นจะได้ผังที่สองช่องชี้คอลัมน์เดียวกัน ซึ่งอ่านข้อมูลผิดแน่นอน */
      const taken = new Set(Object.values(map));
      const filled = { ...map };
      /* ถอยไปใช้ตัวอักษรตั้งต้นเฉพาะตอนอ่านหัวตารางไม่ออกเลย
         ไฟล์เหลืองคอลัมน์คนละชุดกับไฟล์ขาว ถ้าเติมตัวอักษรของไฟล์ขาวให้ช่องที่ไม่มี
         จะได้ขยะ เช่น ช่อง P ของไฟล์เหลืองคือ Batch No. ไม่ใช่ Amount */
      const guessOK = matched.length >= 4;
      for (const k of missing){
        const fallback = guessOK ? '' : DEFAULT_MAP[k];
        if (fallback && !taken.has(fallback)){ filled[k] = fallback; taken.add(fallback); }
        else filled[k] = '';
      }
      state.map = filled;
      state.autoMissing = missing.filter(k => !filled[k]);
      buildMapUI();
    }

    const { drafts, span } = buildDrafts(state.grid, state.map, state.headerRow,
      { matchDriverName, codeExists, findShipments, sheet: state.sheet });
    state.drafts = drafts;
    /* ช่วงที่อ่าน (แถวที่มี "เริ่ม" … แถวที่มี "จบ") — หาไม่เจอ = ไม่อ่านเลย บอกให้แก้ไฟล์
       ขึ้นสองที่: ใต้ช่องเลือกชีต (ขั้น 2) และเหนือตารางตรวจทาน (ขั้น 3) */
    const cells = span.ranges.map(x => `<b>A${x.from} – A${x.to}</b>`).join(' · ');
    const marks = span.ranges.map(x => `“เริ่ม” ที่ A${x.from - 1} และ “จบ” ที่ A${x.to + 1}`).join(' · ');
    const note = span.error
      ? `<b style="color:var(--red)">ไม่ได้อ่านงานจากชีตนี้</b> — ${esc(span.error)}`
      : `ดึงงานจาก ${cells} <span class="dim">(ระหว่าง ${marks})</span>`;
    $$('[data-rangenote]').forEach(el => { el.innerHTML = note; });
    if (span.error) toast(span.error, 'warn', 6000);
    $('#stepReview').hidden = false;
    paint();
  }catch(err){ toast(err.message, 'err'); }
}


/* ช่องคนขับ — ป้ายหนึ่งใบต่อหนึ่งคน กดกากบาทเอาออก กด + เพิ่มคนใหม่
   ไม่ใช้ dropdown ต่อแถวแล้ว เพราะวันละ 100+ บิลกดไม่ไหว */
function driverCell(d, di){
  const chips = d.drivers.map((x, xi) => {
    if (x.driver){
      const tag = x.added ? 'เพิ่มในเว็บ' : 'จากไฟล์';
      return `<span class="dchip ok" title="${esc(tag)}">${esc(driverName(x.driver))}<button type="button"
                class="dx" data-rm="${di}" data-x="${xi}" aria-label="เอาออก">×</button></span>`;
    }
    /* ชื่อจากไฟล์ที่ยังไม่มีในระบบ — กดที่ป้ายเพื่อจับคู่หรือสร้าง */
    return `<span class="dchip bad" title="ยังไม่มีในระบบ — กดเพื่อจับคู่หรือสร้าง"><button type="button"
              class="dlink" data-fix="${di}" data-x="${xi}">${esc(x.raw)}</button><button type="button"
              class="dx" data-rm="${di}" data-x="${xi}" aria-label="เอาออก">×</button></span>`;
  }).join('');

  return `${chips}<button type="button" class="dadd" data-add="${di}" title="เพิ่มคนขับให้งานนี้">+</button>`;
}

/* ---------- กล่องเลือก/สร้างคนขับ ---------------------------- */
/**
 * @param {string} preset ชื่อตั้งต้น (มาจากช่องคนขับที่หาไม่เจอ)
 * @param {{multi?:boolean, have?:string[]}} opt
 *   multi = ติ๊กได้หลายคนแล้วกดเพิ่มทีเดียว (ปุ่ม "+ เพิ่มคนขับ" · 27 ต.ค. เดิมกดทีละคน กล่องปิดทุกครั้ง)
 *           คืน [คนขับ] · ไม่ multi = เลือกคนเดียว คืนคนขับ (ปุ่มแก้ชื่อที่หาไม่เจอ — แทนชื่อเดียว)
 *   have  = รหัสคนขับที่อยู่ในจุดส่งนี้แล้ว (ขึ้นติ๊กไว้ แก้ไม่ได้)
 */
function pickDriver(preset = '', { multi = false, have = [] } = {}){
  return new Promise((resolve) => {
    const total = listDrivers().length;
    let settled = false, off = null;
    const done = (v) => { if (!settled){ settled = true; resolve(v); } };
    const already = new Set(have);
    const chosen = new Set();                 /* ติ๊กไว้ — คงอยู่แม้พิมพ์ค้นหาใหม่ */
    const hook = {};
    modal({
      title: multi ? 'เพิ่มคนขับให้จุดส่งนี้' : 'เพิ่มคนขับให้งานนี้',
      draft: multi ? hook : null,
      /* ปิดกล่องทางไหนก็ตาม (ยืนยันปิดแล้ว) = ไม่ได้เลือกใคร */
      onClose: () => { off?.(); done(null); },
      body: `
        <div class="stack gap-14">
          <label class="field">
            <span class="label">ค้นหาคนขับที่มีอยู่</span>
            <input class="input" id="dq" placeholder="พิมพ์ชื่อ นามสกุล ทะเบียนรถ หรือเบอร์โทร" value="${esc(preset)}" autocomplete="off">
            <span class="tiny dim" id="dhint"></span>
          </label>
          ${multi ? '<p class="tiny strong" id="dsum" style="color:var(--amber-dim)">ยังไม่ได้ติ๊กใคร — ติ๊กได้หลายคน แล้วกด “เพิ่ม” ด้านล่าง</p>' : ''}
          <div id="dlist" class="stack gap-6" style="max-height:${multi ? 320 : 240}px;overflow:auto"></div>

          <details id="dnew" ${total ? '' : 'open'} style="border-top:1px solid var(--line);padding-top:12px">
            <summary style="cursor:pointer;font-size:13px;color:var(--amber-dim)">สร้างคนขับใหม่</summary>
            <div class="grid g2" style="gap:10px;margin-top:10px">
              <label class="field" style="grid-column:1/-1">
                <span class="label">ชื่อ–นามสกุล<span class="req">*</span></span>
                <input class="input" id="nName" value="${esc(preset)}" placeholder="สมชาย พูลทรัพย์">
              </label>
              <label class="field">
                <span class="label">ทะเบียนรถ<span class="req">*</span></span>
                <input class="input" id="nPlate" placeholder="70-8842 กทม.">
              </label>
              <label class="field">
                <span class="label">เบอร์โทร</span>
                <input class="input" id="nPhone" placeholder="081-234-5678">
              </label>
            </div>
            <button type="button" class="btn btn-green btn-sm" id="nSave" style="margin-top:10px">${multi ? 'สร้างแล้วติ๊กไว้ให้' : 'สร้างแล้วใส่ให้งานนี้'}</button>
          </details>
        </div>`,
      foot: multi
        ? `<button class="btn btn-ghost" data-close>ปิด</button>
           <button class="btn btn-accent" id="dAdd" disabled>เพิ่มคนขับ</button>`
        : `<button class="btn btn-ghost" data-close>ปิด</button>`,
      onMount(root){
        const q    = root.querySelector('#dq');
        const list = root.querySelector('#dlist');
        const hint = root.querySelector('#dhint');
        const sum  = root.querySelector('#dsum');
        const addBtn = root.querySelector('#dAdd');

        /* ติ๊กไว้กี่คน ใครบ้าง — ปุ่มเพิ่มบอกจำนวน */
        const paintSum = () => {
          if (!multi) return;
          const ppl = [...chosen].map(id => listDrivers().find(d => d.id === id)).filter(Boolean);
          sum.textContent = ppl.length ? `ติ๊กไว้ ${ppl.length} คน: ${ppl.map(driverName).join(' · ')}` : 'ยังไม่ได้ติ๊กใคร — ติ๊กได้หลายคน แล้วกด “เพิ่ม” ด้านล่าง';
          addBtn.disabled = !ppl.length;
          addBtn.textContent = ppl.length ? `เพิ่ม ${ppl.length} คน` : 'เพิ่มคนขับ';
          markDirty();
        };
        hook.get = () => ({ chosen: [...chosen] });
        hook.set = (x) => { (x.chosen || []).forEach(id => { if (!already.has(id)) chosen.add(id); }); draw(); };

        /* แบบติ๊ก — ทั้งแถวกดได้ (นิ้วโดนง่าย) · คนที่อยู่ในจุดนี้แล้วติ๊กค้าง แก้ไม่ได้ */
        const tick = (p) => {
          const had = already.has(p.id);
          return `
          <label class="drv-tick${isActiveDriver(p) ? '' : ' is-off'}${had ? ' is-had' : ''}">
            <input type="checkbox" data-tick="${p.id}" data-nosave ${had || chosen.has(p.id) ? 'checked' : ''} ${had ? 'disabled' : ''}>
            <span class="grow">${esc(driverName(p))}
              <span class="tiny dim" style="margin-left:6px">${esc(p.plate || '—')}</span>
              ${p.phone ? `<span class="tiny dim" style="margin-left:6px">${esc(p.phone)}</span>` : ''}
            </span>
            ${had ? '<span class="tiny dim">อยู่ในจุดนี้แล้ว</span>' : isActiveDriver(p) ? '' : '<span class="dchip warn" style="margin:0">ปิดใช้งานอยู่</span>'}
          </label>`;
        };

        const line = (p) => multi ? tick(p) : `
          <button type="button" class="btn btn-ghost btn-sm" data-pick="${p.id}"
            style="justify-content:flex-start;text-align:left;width:100%;${isActiveDriver(p) ? '' : 'opacity:.62'}">
            <span class="grow">${esc(driverName(p))}
              <span class="tiny dim" style="margin-left:6px">${esc(p.plate || '—')}</span>
              ${p.phone ? `<span class="tiny dim" style="margin-left:6px">${esc(p.phone)}</span>` : ''}
            </span>
            ${isActiveDriver(p) ? '' : '<span class="dchip warn" style="margin:0">ปิดใช้งานอยู่</span>'}
          </button>`;

        /* อ่านจากทะเบียนคนขับสด ๆ ทุกครั้งที่พิมพ์ — หน้าข้อมูลคนขับเพิ่มคนใหม่
           ระหว่างที่กล่องนี้เปิดค้างอยู่ก็เจอทันที ไม่ต้องปิดแล้วเปิดใหม่ */
        const draw = () => {
          /* นับสดทุกครั้ง เผื่อมีคนเพิ่มคนขับจากอีกแท็บระหว่างที่กล่องนี้เปิดอยู่ */
          const now = listDrivers().length;

          /* ทะเบียนว่างเปล่า — บอกตรง ๆ ว่ายังไม่มีใครในระบบ
             ไม่ใช่ขึ้นว่า "ไม่พบคนที่ตรง" ซึ่งทำให้เข้าใจผิดว่าพิมพ์ผิด */
          if (!now){
            list.innerHTML = `<p class="tiny dim">ยังไม่มีคนขับในทะเบียนเลยสักคน —
              <a href="drivers.html" target="_blank" rel="noopener"
                 style="color:var(--amber-dim);text-decoration:underline">เปิดหน้าข้อมูลคนขับ</a>
              เพื่อเพิ่มทีเดียวหลายคน หรือสร้างเฉพาะคนนี้ด้านล่างก็ได้</p>`;
            hint.textContent = 'ทะเบียนคนขับยังว่าง';
            return;
          }

          const hit = searchDrivers(q.value);
          const on  = hit.filter(isActiveDriver);
          const off = hit.filter(p => !isActiveDriver(p));

          list.innerHTML = hit.length
            ? on.map(line).join('') + (off.length
                ? `<p class="tiny dim" style="margin:8px 0 2px;padding-top:8px;border-top:1px solid var(--line)">
                     ปิดใช้งานอยู่ — เลือกได้ แต่คนขับจะยังไม่เห็นงานจนกว่าจะเปิดใช้งานที่หน้าข้อมูลคนขับ</p>`
                  + off.map(line).join('')
                : '')
            : `<p class="tiny dim">ไม่พบคนขับที่ตรงกับ “${esc(q.value.trim())}” — ตรวจตัวสะกดอีกที หรือสร้างใหม่ด้านล่าง</p>`;

          hint.textContent = q.value.trim()
            ? `เจอ ${hit.length} คน จากทั้งหมด ${now} คนในทะเบียน`
            : `ทะเบียนคนขับมี ${now} คน — พิมพ์ชื่อหรือนามสกุลก็ได้`;

          paintSum();
          list.querySelectorAll('[data-tick]').forEach(cb => {
            cb.onchange = () => {
              if (cb.checked) chosen.add(cb.dataset.tick); else chosen.delete(cb.dataset.tick);
              const got = listDrivers().find(p => p.id === cb.dataset.tick);
              if (cb.checked && got && !isActiveDriver(got)) toast(`${got.name} ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าข้อมูลคนขับก่อนเริ่มงานจริง`, 'warn');
              paintSum();
            };
          });
          list.querySelectorAll('[data-pick]').forEach(b => {
            b.onclick = () => {
              const got = hit.find(p => p.id === b.dataset.pick) || null;
              if (got && !isActiveDriver(got)) toast(`${got.name} ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าข้อมูลคนขับก่อนเริ่มงานจริง`, 'warn');
              done(got); close();
            };
          });
        };

        q.oninput = draw; draw();

        /* ทะเบียนคนขับเปลี่ยนจากแท็บอื่น (หน้าข้อมูลคนขับ) ก็วาดรายการใหม่ */
        off = subscribe(() => {
          if (!root.isConnected) return off();   /* กล่องปิดไปแล้ว เลิกฟัง */
          draw();
        });

        root.querySelector('#nSave').onclick = () => {
          const v = (id) => root.querySelector(id).value.trim();
          try{
            const made = createDriver({ name:v('#nName'), plate:v('#nPlate'), phone:v('#nPhone') });
            toast(`เพิ่มคนขับ ${made.name} แล้ว`, 'ok');
            if (multi){
              /* แบบติ๊ก — สร้างแล้วติ๊กไว้ให้ ยังไม่ปิดกล่อง เลือกคนอื่นต่อได้ */
              chosen.add(made.id);
              ['#nName', '#nPlate', '#nPhone'].forEach(k => { root.querySelector(k).value = ''; });
              root.querySelector('#dnew').open = false;
              draw();
              return;
            }
            off(); done(made); close();
          }catch(err){ toast(err.message, 'err'); }
        };

        addBtn?.addEventListener('click', () => {
          const ppl = [...chosen].map(id => listDrivers().find(d => d.id === id)).filter(Boolean);
          if (!ppl.length) return;
          off?.(); done(ppl); close();
        });
        /* ปิดด้วย × / ยกเลิก / แตะนอกกล่อง → onClose (ui.js ถามยืนยันก่อน) */
      },
    });
  });
}

/* คำนวณคำเตือนเรื่องคนขับใหม่หลังแอดมินแก้ — ไม่ยุ่งคำเตือนเรื่องอื่น */
function refreshWarns(d){
  d.warns = d.warns.filter(w => !w.includes('คนขับ'));
  d.drivers.forEach(x => {
    if (!x.driver) d.warns.push(`ยังไม่ได้จับคู่คนขับชื่อ "${x.raw}"`);
  });
}

function statusCell(d){
  const bits = [];
  d.errors.forEach(e => bits.push(`<b>✕ ${esc(e)}</b>`));
  d.warns.forEach(w  => bits.push(`<i>! ${esc(w)}</i>`));
  if (!bits.length) return `<span class="dchip ok">พร้อมนำเข้า</span>`;
  return `<div class="why">${bits.join('<br>')}</div>`;
}

function paint(){
  const rows = state.drafts;
  const jobs = groupJobs(rows);

  const pickedRows = rows.filter(d => d.include && d.ok);
  const pickedJobs = jobs.filter(g => g.stops.some(d => d.include && d.ok));
  const badCount   = rows.filter(d => !d.ok).length;
  const weight     = pickedRows.reduce((a, d) => a + d.weight, 0);
  const amount     = pickedRows.reduce((a, d) => a + d.amount, 0);

  $('#summary').innerHTML = `
    <div><b style="color:#6fd6a6">${fmtNum(pickedJobs.length)}</b><span>เที่ยว</span></div>
    <div><b>${fmtNum(pickedRows.length)}</b><span>จุดส่ง</span></div>
    <div><b style="color:${badCount ? '#ef9a9a' : 'inherit'}">${fmtNum(badCount)}</b><span>ข้าม (ข้อมูลไม่ครบ)</span></div>
    <div><b>${fmtNum(Math.round(weight))}</b><span>น้ำหนักรวม (กก.)</span></div>
    <div><b>${esc(fmtBaht(amount))}</b><span>มูลค่ารวม</span></div>`;

  const html = [];
  for (const g of jobs){
    const stops = state.onlyProblem
      ? g.stops.filter(d => d.errors.length || d.warns.length)
      : g.stops;
    if (!stops.length) continue;

    const on = g.stops.filter(d => d.include && d.ok).length;
    html.push(`
      <tr class="jrow">
        <td class="c-chk"><input type="checkbox" data-jinc="${esc(g.code)}"
            ${on === g.stops.filter(d => d.ok).length && on > 0 ? 'checked' : ''}></td>
        <td colspan="5">
          ${g.code === NO_TRIP
            ? `<span class="jcode" style="color:var(--red)">ไม่มีเลขเที่ยว — นำเข้าไม่ได้</span>
               <span class="jmeta">${fmtNum(g.stops.length)} แถวที่ช่อง “${esc(FIELD_LABELS.shipment)}” ว่าง ·
                 เติมเลขในไฟล์ Excel แล้วอัปโหลดใหม่ หรือแก้ผังคอลัมน์ถ้าเดาผิดช่อง</span>`
            : `<span class="jcode">เที่ยว ${esc(g.code)}</span>
               <span class="jmeta">${esc(g.vehicle || 'ไม่ระบุรถ')} · ${fmtNum(g.stops.length)} จุดส่ง
                 · ${fmtNum(g.dests)} ปลายทาง · ${fmtNum(Math.round(g.weightKg))} กก. · ${esc(fmtBaht(g.amount))}</span>`}
        </td>
        <td><span class="tiny dim">${g.code === NO_TRIP ? '—' : `ใส่คนขับรายจุดส่ง`}</span></td>
        <td><span class="tiny dim">${g.code === NO_TRIP ? 'แถวเหล่านี้ถูกข้าม'
          : (() => { const n = g.stops.filter(d => d.ok && !d.drivers.some(x => x.driver)).length;
                     return n ? `ยังไม่มีคนขับ ${fmtNum(n)} จุด` : 'มีคนขับครบทุกจุด'; })()}</span></td>
      </tr>`);

    for (const d of stops){
      const di = rows.indexOf(d);
      html.push(`
      <tr class="srow ${d.ok ? '' : 'is-bad'} ${d.include ? '' : 'is-off'}">
        <td class="c-chk">
          <input type="checkbox" data-inc="${di}" ${d.include ? 'checked' : ''} ${d.ok ? '' : 'disabled'}>
        </td>
        <td class="c-row">${d.rowNo}</td>
        <td class="nowrap">
          <span class="code">${esc(d.code || '—')}</span>
          ${d.provisional ? '<span class="prov">รอ Invoice</span>' : ''}
          <span class="sub">${d.delivery ? 'Sales ' + esc(d.delivery) : ''}</span>
          ${d.shipmentNo ? `<span class="sub">Shipment ${esc(d.shipmentNo)}</span>` : ''}
          ${d.items?.length ? `<span class="sub">${fmtNum(d.items.length)} รายการสินค้า</span>` : ''}
          <span class="sub">${d.serviceDate ? esc(fmtDate(d.serviceDate)) : '<i style="color:#e2b765">ไม่มีวันที่</i>'}</span>
        </td>
        <td>
          <span class="trunc" style="display:block;max-width:300px">${esc(d.customer || '—')}</span>
          <span class="sub trunc" style="max-width:300px">${esc(d.destName || '')}</span>
          <span class="sub trunc" style="max-width:300px">${esc(d.address || '')}</span>
        </td>
        <td class="nowrap tnum">${d.weight ? fmtNum(Math.round(d.weight * 100) / 100) : '—'}</td>
        <td class="nowrap tnum">${d.amount ? esc(fmtBaht(d.amount)) : '—'}</td>
        <td>${driverCell(d, di)}</td>
        <td>${statusCell(d)}</td>
      </tr>`);
    }
  }

  $('#rvBody').innerHTML = html.join('') ||
    `<tr><td colspan="8"><p class="small dim" style="padding:20px;text-align:center">ไม่มีแถวที่ตรงเงื่อนไข</p></td></tr>`;

  /* ติ๊กรายจุด */
  $$('#rvBody [data-inc]').forEach(cb => {
    cb.onchange = () => { rows[+cb.dataset.inc].include = cb.checked; paint(); };
  });
  /* ติ๊กทั้งเที่ยว */
  $$('#rvBody [data-jinc]').forEach(cb => {
    cb.onchange = () => {
      jobs.find(g => g.code === cb.dataset.jinc)?.stops
        .forEach(d => { if (d.ok) d.include = cb.checked; });
      paint();
    };
  });
  /* คนขับรายจุดส่ง — หนึ่งชีตเป็นหนึ่งเที่ยว แต่แต่ละจุดอาจไปคนละคัน/คนละคน */
  $$('#rvBody [data-rm]').forEach(b => {
    b.onclick = () => {
      const d = rows[+b.dataset.rm];
      d.drivers.splice(+b.dataset.x, 1);
      refreshWarns(d); paint();
    };
  });
  $$('#rvBody [data-fix]').forEach(b => {
    b.onclick = async () => {
      const d = rows[+b.dataset.fix];
      const x = d.drivers[+b.dataset.x];
      const picked = await pickDriver(x.raw);
      if (!picked) return;
      x.driver = picked; x.status = 'manual';
      refreshWarns(d); paint();
    };
  });
  $$('#rvBody [data-add]').forEach(b => {
    b.onclick = async () => {
      const d = rows[+b.dataset.add];
      const picked = await pickDriver('', { multi: true, have: d.drivers.map(x => x.driver?.id).filter(Boolean) });
      if (!picked?.length) return;
      const fresh = picked.filter(p => !d.drivers.some(x => x.driver?.id === p.id));
      fresh.forEach(p => d.drivers.push({ raw: p.name, status:'manual', driver: p, matches:[], added:true }));
      if (fresh.length) toast(`เพิ่มคนขับ ${fresh.length} คนแล้ว`, 'ok');
      refreshWarns(d); paint();
    };
  });

  $('#doImport').disabled = pickedJobs.length === 0;
  $('#doImport').textContent = pickedJobs.length
    ? `นำเข้า ${fmtNum(groupJobs(pickedRows).length)} เที่ยว (${fmtNum(pickedRows.length)} จุดส่ง)`
    : 'ไม่มีงานที่เลือก';

  const drift = rows.filter(driversChanged).length;
  const dl = $('#dlUpdated');
  dl.hidden = !(drift || state.needsFileUpdate);
  if (!dl.hidden) dl.textContent = `ดาวน์โหลด Excel ที่อัปเดตคนขับ (${fmtNum(drift)} แถว)`;
  $('#importHint').innerHTML = drift
    ? `แถวสีแดงจะถูกข้าม · <b style="color:var(--amber-dim)">มี ${fmtNum(drift)} แถวที่คนขับไม่ตรงกับไฟล์ Excel</b>`
    : '1 ชีต = 1 เที่ยว · 1 เลข 5… = 1 จุดส่ง · แถวสีแดงจะถูกข้าม';

  persist();
}

$('#dlUpdated').onclick = downloadUpdated;
$('#onlyProblem').onchange = (e) => { state.onlyProblem = e.target.checked; paint(); };
$('#selAll').onclick  = () => { state.drafts.forEach(d => { if (d.ok) d.include = true; });  paint(); };
$('#selNone').onclick = () => { state.drafts.forEach(d => d.include = false); paint(); };
$('#chkAll').onchange = (e) => {
  state.drafts.forEach(d => { if (d.ok) d.include = e.target.checked; });
  paint();
};

/* ================= 4. นำเข้าจริง =========================== */
$('#doImport').onclick = () => {
  const picked = state.drafts.filter(d => d.include && d.ok);
  if (!picked.length) return;

  const noDriver = picked.filter(d => !d.drivers.some(x => x.driver)).length;
  /* เทียบกับไฟล์ที่อัปโหลดมาตอนแรก — ถ้าคนขับไม่ตรงแปลว่าแอดมินแก้ในเว็บ */
  const changed = picked.filter(driversChanged);

  modal({
    title: `ยืนยันนำเข้า ${fmtNum(picked.length)} งาน`,
    body: `
      <p class="muted">ระบบจะสร้างใบงานตามเลขอ้างอิงในไฟล์ โดยไม่สร้างเลขใหม่</p>
      <dl class="kv" style="margin-top:14px">
        <dt>ไฟล์</dt><dd>${esc(state.file?.name || '—')}</dd>
        <dt>ชีต</dt><dd>${esc(state.sheet || '—')}</dd>
        <dt>จำนวนเที่ยว (ตามจัดส่งโดย)</dt><dd class="mono">${fmtNum(groupJobs(picked).length)}</dd>
        <dt>จำนวนจุดส่ง</dt><dd class="mono">${fmtNum(picked.length)}</dd>
        <dt>จ่ายคนขับแล้ว</dt><dd class="mono">${fmtNum(picked.length - noDriver)} จุดส่ง</dd>
        <dt>ยังไม่มีคนขับ</dt><dd class="mono">${fmtNum(noDriver)} จุดส่ง</dd>
      </dl>
      ${changed.length ? `
        <div class="panel" style="margin-top:14px;border-color:var(--amber);background:var(--amber-wash,rgba(214,160,60,.08))">
          <p class="strong" style="font-size:13.5px;margin:0">⚠ ข้อมูลคนขับไม่ตรงกับไฟล์ Excel แล้ว</p>
          <p class="tiny" style="margin:6px 0 0">
            มี ${fmtNum(changed.length)} แถวที่คนขับถูกเพิ่มหรือแก้ในเว็บ หลังนำเข้าเสร็จจะมีปุ่มให้ดาวน์โหลดไฟล์ Excel
            ที่อัปเดตช่องคนขับให้แล้ว เอาไปใช้แทนไฟล์เดิมได้เลย
          </p>
          <div class="tiny dim" style="margin-top:8px;max-height:96px;overflow:auto">
            ${changed.slice(0, 12).map(d => `แถว ${d.rowNo} · ${esc(d.code)} → ${esc(driverTextOf(d) || '— ไม่มีคนขับ —')}`).join('<br>')}
            ${changed.length > 12 ? `<br>และอีก ${fmtNum(changed.length - 12)} แถว` : ''}
          </div>
        </div>` : `<p class="tiny dim" style="margin-top:12px">ข้อมูลคนขับตรงกับไฟล์ Excel ทุกแถว</p>`}`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" id="goImport">นำเข้าเลย</button>`,
  });

  $('#goImport').onclick = async (e) => {
    /* ราคาน้ำมัน ปตท. วันนี้ — จดลงจุดส่งไว้เฉย ๆ เผื่อใช้ทีหลัง (ค่ารอบให้พนักงานกรอกเอง) · ดึงไม่ได้ (≤5 วิ) = นำเข้าต่อได้ */
    e.currentTarget.disabled = true;
    const fuel = await pttPrices();
    const done = [], failed = [];
    let jobCount = 0;
    /* หนึ่งกลุ่ม "จัดส่งโดย" = หนึ่งเที่ยวในหน้า ops (ชื่อเที่ยว = ชื่อกลุ่ม) — มีเที่ยวชื่อนี้แล้วเพิ่มจุดส่งเข้าเที่ยวเดิม
       ไฟล์อัพเดตเลขที่บิลเข้ามาที่หน้า ops แล้วจะแยกจุดส่งไปงานเลข 7 โดยยังอยู่ใต้กลุ่มเดิม
       ห่อด้วย batchWrites — บันทึกลงเครื่อง/ส่งขึ้นคลาวด์ครั้งเดียวตอนจบ ไม่ใช่ทุกแถว (QA TC-092) */
    batchWrites(() => {
      for (const g of groupJobs(picked)){
        let job;
        /* คนขับของงาน = ทุกคนที่ถูกใส่ไว้ในจุดส่งของงานนี้ (ใส่รายจุดในตารางตรวจทาน) */
        const crew = [...new Set(g.stops.flatMap(d => d.drivers.map(x => x.driver?.id).filter(Boolean)))];
        try{
          job = createJob({
            code: g.code, group: g.code, vehicle: g.vehicle, carrier: g.carrier, serviceDate: g.serviceDate,
            driverIds: crew,
            byRole:'ops', byName:'นำเข้าจาก Excel',
            source: { kind:'excel', sheet: state.sheet, tripGroup: g.code, vehicle:g.vehicle },
          });
          jobCount++;
        }catch(err){
          g.stops.forEach(d => failed.push({ d, msg:`สร้างเที่ยวไม่ได้: ${err.message}` }));
          continue;
        }
        for (const d of g.stops){
          /* คนขับของจุดนี้เอง (draftToPayload ใส่ให้จาก d.drivers)
             จุดที่ยังไม่มีคนขับ ใช้คนขับทั้งเที่ยวไปก่อน ไม่งั้นไปตายตอนคนขับกดปิดจุด
             ว่า "ต้องจ่ายงานให้คนขับก่อน" ทั้งที่หน้าจอแสดงว่าจ่ายงานแล้ว */
          const payload = draftToPayload(d, WAREHOUSE, job.id);
          if (fuel) payload.source.fuel = fuel;
          if (!payload.driverIds.length && crew.length) payload.driverIds = crew;
          try{ createShipment(payload); done.push(d); }
          catch(err){ failed.push({ d, msg: err.message }); }
        }
      }
    });

    close();   /* นำเข้าเสร็จ — ปิดจากโค้ด ไม่ต้องถามยืนยัน */

    /* แถวที่เข้าแล้วไม่ควรเข้าซ้ำ */
    const doneCodes = new Set(done.map(d => d.code.toUpperCase()));
    state.drafts.forEach(d => {
      if (doneCodes.has(d.code.toUpperCase())){
        d.include = false; d.ok = false;
        d.errors = ['นำเข้าเรียบร้อยแล้ว'];
      }
    });

    /* เปิดปุ่มดาวน์โหลดไฟล์ใหม่ค้างไว้ ให้กดตอนไหนก็ได้ */
    state.needsFileUpdate = state.needsFileUpdate || changed.length > 0;
    paint();

    modal({
      title: failed.length ? 'นำเข้าเสร็จ แต่มีบางแถวไม่ผ่าน' : 'นำเข้าเรียบร้อย',
      body: `
        <dl class="kv">
          <dt>สำเร็จ</dt><dd class="mono" style="color:#6fd6a6">${fmtNum(jobCount)} งาน · ${fmtNum(done.length)} จุดส่ง</dd>
          ${failed.length ? `<dt>ไม่สำเร็จ</dt><dd class="mono" style="color:#ef9a9a">${fmtNum(failed.length)} งาน</dd>` : ''}
        </dl>
        ${failed.length ? `
          <div class="panel" style="margin-top:14px;max-height:200px;overflow:auto">
            ${failed.map(f => `<div class="tiny" style="padding:4px 0;border-bottom:1px solid var(--line)">
              <span class="code">${esc(f.d.code)}</span> — ${esc(f.msg)}</div>`).join('')}
          </div>` : ''}
        ${changed.length ? `
          <p class="small" style="margin-top:14px">
            มี ${fmtNum(changed.length)} แถวที่คนขับต่างจากไฟล์เดิม — ดาวน์โหลดไฟล์ที่อัปเดตแล้วได้เลย
            หรือกดทีหลังจากปุ่มด้านล่างตาราง
          </p>` : ''}`,
      foot: `${changed.length ? '<button class="btn btn-green" id="dlNow">ดาวน์โหลดไฟล์ Excel ที่อัปเดต</button>' : ''}
             <button class="btn btn-ghost" data-close>อยู่หน้านี้ต่อ</button>
             <a class="btn btn-accent" href="ops.html">ไปกระดานงาน</a>`,
    });
    $('#dlNow')?.addEventListener('click', downloadUpdated);
    toast(`นำเข้า ${jobCount} งาน ${done.length} จุดส่งแล้ว`, done.length ? 'ok' : 'warn');
    if (done.length && !failed.length) celebrate('นำเข้าเรียบร้อย', `${fmtNum(jobCount)} งาน · ${fmtNum(done.length)} จุดส่ง`);
  };
};

/* ---------- เขียนช่องคนขับกลับลงไฟล์ Excel ------------------- */
async function downloadUpdated(){
  if (!state.wb) return toast('ไฟล์ต้นฉบับยังโหลดไม่เสร็จ รอสักครู่แล้วลองใหม่', 'warn');
  try{
    toast('กำลังสร้างไฟล์…', 'ok');
    const blob = await buildUpdatedFile(state.wb, state.sheet, state.drafts, state.map, state.headerRow);
    const base = (state.file?.name || 'shipment.xlsx').replace(/\.xlsx?$/i, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}-อัปเดตคนขับ.xlsx`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('ดาวน์โหลดไฟล์ที่อัปเดตแล้ว', 'ok');
  }catch(err){ toast(err.message, 'err'); }
}

/* ================= กรอกเองทีละใบ =========================== */
const form = $('#jobForm');
$('[name=serviceDate]', form).value = todayYmd();

$('#manualToggle').onclick = () => {
  form.hidden = !form.hidden;
  $('#manualCaret').textContent = form.hidden ? 'แสดง ▾' : 'ซ่อน ▴';
};

/* ---------- ฟอร์มกรอกมือก็หายตอนรีโหลดเหมือนกัน จึงจำไว้ด้วย ---- */
const MANUAL_FIELDS = ['code','serviceDate','cName','dName','dAddress','weightKg','invAmount','driverNames','cargoDesc'];
const manualValues = () => Object.fromEntries(
  MANUAL_FIELDS.map(n => [n, form.elements[n]?.value || '']));

form.addEventListener('input', () => saveManual(manualValues()));

(function restoreManual(){
  const saved = loadManual();
  if (!saved) return;
  /* วันที่ถูกเติมให้อัตโนมัติอยู่แล้ว ไม่นับว่าผู้ใช้พิมพ์อะไรไว้ */
  const typed = MANUAL_FIELDS.some(n => n !== 'serviceDate' && String(saved[n] || '').trim());
  if (!typed) return;
  MANUAL_FIELDS.forEach(n => { if (form.elements[n] && saved[n] != null) form.elements[n].value = saved[n]; });
  form.hidden = false;
  $('#manualCaret').textContent = 'ซ่อน ▴';
  toast('กู้ข้อความที่พิมพ์ค้างไว้ในฟอร์มกรอกมือกลับมาแล้ว', 'ok');
})();

const REQUIRED = {
  code:     'กรอกเลขอ้างอิง',
  cName:    'กรอกชื่อลูกค้า',
  dName:    'กรอกชื่อสถานที่จัดส่ง',
  dAddress: 'กรอกที่อยู่ปลายทาง',
};

function validate(){
  $$('[data-err]', form).forEach(n => n.textContent = '');
  $$('[aria-invalid]', form).forEach(n => n.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(REQUIRED)){
    const input = form.elements[name];
    if (input.value.trim()) continue;
    input.setAttribute('aria-invalid', 'true');
    const slot = $(`[data-err="${name}"]`, form);
    if (slot) slot.textContent = msg;
    first ??= input;
  }
  if (first){
    first.focus();
    toast('ยังกรอกไม่ครบ — ดูช่องที่ขึ้นสีแดง', 'warn');
    return false;
  }
  return true;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validate()) return;
  const v = (n) => form.elements[n].value.trim();

  /* ชื่อคนขับพิมพ์มาแบบเดียวกับช่องคนขับในไฟล์ — ใช้ตัวจับคู่ตัวเดียวกัน */
  const unmatched = [];
  const ids = splitDrivers(v('driverNames')).map(name => {
    const m = matchDriverName(name);
    if (m.status === 'ambiguous' || m.status === 'none'){ unmatched.push(name); return null; }
    return m.driver?.id || null;
  }).filter(Boolean);

  if (unmatched.length){
    return toast(`หาคนขับไม่เจอ หรือชื่อซ้ำหลายคน: ${unmatched.join(', ')}`, 'warn');
  }

  try{
    const s = createShipment({
      code: v('code'),
      customer: { name:v('cName'), contact:'', phone:'' },
      pickup:   { name: WAREHOUSE },
      dropoff:  { name:v('dName'), address:v('dAddress'), contact:'', phone:'' },
      cargo:    { desc: v('cargoDesc') || `สินค้าตามบิล ${v('code')}`, pieces:0, unit:'', weightKg:v('weightKg'), note:'' },
      invoice:  { number:v('code'), amount:v('invAmount'), fileName:'', kind:'', dataUrl:null },
      serviceDate: v('serviceDate'),
      driverIds: ids,
      byRole: 'ops', byName: 'กรอกมือ',
      note: 'สร้างงานแทรกด่วนจากหน้านำเข้า',
    });
    form.reset();
    clearManual();
    setTimeout(() => { $('[name=serviceDate]', form).value = todayYmd(); }, 0);
    toast('สร้างใบงาน ' + s.code + ' แล้ว', 'ok');
  }catch(err){
    toast(err.message, 'err');
  }
});


/* ================= กู้ของที่ค้างไว้ตอนเปิดหน้า ================
   รันท้ายสุดของไฟล์ เพราะต้องใช้ buildMapUI / paint ที่นิยามไว้ข้างบน */
(async function restoreSession(){
  const saved = loadSession();
  if (!saved) return;

  state.sheets      = saved.sheets || [];
  state.sheet       = saved.sheet || state.sheets[0] || null;
  state.headerRow   = saved.headerRow || 1;
  /* ผังที่บันทึกไว้ก่อนเปลี่ยนโครงสร้าง (ยังมีช่อง key) ใช้ไม่ได้แล้ว — ทิ้งแล้วเดาใหม่ */
  const staleMap = !saved.map || 'key' in saved.map;
  state.map        = staleMap ? { ...DEFAULT_MAP } : { ...DEFAULT_MAP, ...saved.map };
  state.mapTouched = !staleMap && !!saved.mapTouched;
  state.onlyProblem = !!saved.onlyProblem;
  state.needsFileUpdate = !!saved.needsFileUpdate;
  state.drafts      = saved.drafts || [];
  state.file        = saved.fileName ? { name: saved.fileName } : null;

  $('#fileInfo').innerHTML = fileChip(saved.fileName || 'ไฟล์ที่อัปโหลดไว้', 'กู้รายการที่ค้างไว้กลับมาให้แล้ว');
  const sel = $('#sheetSel');
  sel.innerHTML = state.sheets.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value = state.sheet;
  $('#headerRow').value = state.headerRow;
  $('#onlyProblem').checked = state.onlyProblem;
  $('#stepMap').hidden = false;
  $('#stepReview').hidden = false;
  $('#resetAll').hidden = false;
  buildMapUI();
  paint();
  toast(`กู้รายการที่ตรวจทานค้างไว้ ${fmtNum(state.drafts.length)} แถวกลับมาแล้ว`, 'ok');

  /* ไฟล์ต้นฉบับอ่านช้ากว่า ให้ตารางขึ้นก่อน แล้วค่อยตามมา
     ได้ wb เมื่อไหร่จึงจะเปลี่ยนชีต/ผังคอลัมน์ และเขียนไฟล์กลับได้อีกครั้ง */
  const rec = await loadFile();
  if (!rec?.buf) return;
  try{
    const { wb, sheets } = await readWorkbookBuffer(rec.buf);
    state.wb = wb;
    if (!state.sheets.length){
      state.sheets = sheets;
      sel.innerHTML = sheets.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
      sel.value = state.sheet || sheets[0];
    }
    if (rec.name) state.file = { name: rec.name };
  }catch(err){
    console.warn('[customer] กู้ไฟล์ต้นฉบับไม่ได้', err);
  }
})();
