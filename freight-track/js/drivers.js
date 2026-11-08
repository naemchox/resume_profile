/* ============================================================
   drivers.js — ข้อมูลหลัก: ทะเบียนคนขับและรถ
   เพิ่ม · แก้ไข · ปิดใช้งาน · ลบ  (ทีมคลังเป็นคนดูแล)
   ============================================================ */

import { shell, $, esc, toast, modal, close, confirmDialog, demoBar, on } from './ui.js';
import {
  listDrivers, getDriver, driverStats, createDriver, updateDriver, setDriverActive, deleteDriver,
  listShipments, subscribe, ago, isActiveDriver, isExternal, isLinkOpen,
  FLEETS, FLEET_OWN, driverFleet, driverName, setBillCollector, isBillCollector, ensureDefaultCollector,
} from './store.js';
import { linkDialog } from './extlink.js';
import { loadUI, saveUI, dropUI, debounce } from './uiState.js';
import {
  syncFromSheet, pushDriver, pushPending, pendingDrivers,
  sheetApiUrl, setSheetApiUrl, hasSheetApi, SHEET_LINK,
} from './driverSheet.js';
import { apiFromConfig } from './api.js';
import { gate } from './auth.js';
import { pttPrices } from './fuelPrice.js';

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('drivers');
shell({ role: 'มุมมองทีมคลัง' });
$('#demoBarSlot').appendChild(demoBar('ข้อมูลคนขับใช้ร่วมกับหน้าจ่ายงานและหน้าคนขับทันทีที่บันทึก'));

/* ---------- แท็บและค้นหา ----------------------------------- */
const TABS = [
  { key:'all',  label:'ทั้งหมด',     test: () => true },
  { key:'on',   label:'ใช้งานอยู่',   test: d => isActiveDriver(d) },
  { key:'off',  label:'ปิดใช้งาน',    test: d => !isActiveDriver(d) },
  { key:'busy', label:'มีงานค้าง',    test: d => driverStats(d.id).open > 0 },
  { key:'ext',  label:'คนขับภายนอก',  test: d => isExternal(d) },
];
/* จำแท็บกับคำค้นไว้ กันหายตอนหน้ารีเฟรช */
const UI = loadUI('drivers');
let tab = UI.tab || 'all';
let q = UI.q || '';

$('#q').value = q;
const rememberQ = debounce((v) => saveUI('drivers', { q: v }), 300);
$('#q').addEventListener('input', (e) => { q = e.target.value; rememberQ(q); paint(); });

const match = (d) => {
  const t = q.trim().toLowerCase();
  return !t || [d.name, d.plate, d.phone, d.truck, d.note, driverFleet(d), d.fuelType].join(' ').toLowerCase().includes(t);
};

const statusPill = (d) => {
  if (isExternal(d)) return isLinkOpen(d)
    ? '<span class="pill" data-tone="ware">ลิงก์เปิดอยู่</span>'
    : '<span class="pill" data-tone="grey">ลิงก์ถูกปิด</span>';
  return isActiveDriver(d)
    ? '<span class="pill" data-tone="done">ใช้งานอยู่</span>'
    : '<span class="pill" data-tone="grey">ปิดใช้งาน</span>';
};

/* ---------- KPI -------------------------------------------- */
function paintKpi(){
  const all = listDrivers();
  const on = all.filter(isActiveDriver);
  const openJobs = listShipments({ open:true });
  const items = [
    { label:'คนขับทั้งหมด',   value:all.length,                                          foot:'ในทะเบียน',            accent:'violet' },
    { label:'ใช้งานอยู่',      value:on.length,                                           foot:'จ่ายงานได้',            accent:'green' },
    { label:'ปิดใช้งาน',       value:all.length - on.length,                              foot:'เก็บประวัติไว้',         accent:'amber' },
    { label:'งานที่ยังไม่จ่าย', value:openJobs.filter(s => !s.driverId).length,             foot:'รอเลือกคนขับ',          accent:'blue' },
  ];
  $('#kpis').innerHTML = items.map(k => `
    <div class="kpi" data-accent="${k.accent}">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-foot">${esc(k.foot)}</div>
    </div>`).join('');
}

/* หนึ่งแถวในตารางคนขับ */
const rowHtml = (d) => {
  const st = driverStats(d.id);
  const off = !isActiveDriver(d);
  return `
<tr${off ? ' style="opacity:.62"' : ''}>
  <td style="max-width:230px">
    <span class="strong">${esc(driverName(d))}</span>
    ${isExternal(d) ? ' <span class="tiny" style="color:var(--amber-dim);font-weight:600">· ภายนอก</span>' : ''}
    <br><span class="tiny dim mono">${esc(d.phone || '—')}</span>
    ${d.note ? `<br><span class="tiny dim trunc" style="display:block">${esc(d.note)}</span>` : ''}
  </td>
  <td>
    <span class="code">${esc(d.plate)}</span>
    <br><span class="tiny dim">${esc(d.truck || '—')}</span>
    ${d.fuelType
      ? `<br><span class="tiny dim">⛽ ${esc(d.fuelType)}</span>`
      : (isExternal(d) ? '' : '<br><span class="tiny" style="color:var(--amber-dim)">⛽ ยังไม่ตั้งน้ำมัน</span>')}
  </td>
  <td style="text-align:center">${isExternal(d) ? '<span class="dim">—</span>'
    : `<input type="checkbox" data-collector-row="${d.id}" ${isBillCollector(d) ? 'checked' : ''} aria-label="ผู้รวบรวมบิล ${esc(d.name)}" style="width:20px;height:20px;cursor:pointer">`}</td>
  <td class="right"><span class="mono${st.open ? ' strong' : ' dim'}">${st.open}</span></td>
  <td class="right"><span class="mono dim">${st.total}</span></td>
  <td><span class="tiny dim nowrap">${esc(st.lastAt ? ago(st.lastAt) : 'ยังไม่เคยรับงาน')}</span></td>
  <td>${statusPill(d)}</td>
  <td class="right">
    <span class="row gap-8" style="justify-content:flex-end;flex-wrap:nowrap">
      <button class="btn btn-quiet btn-sm" data-act="edit" data-id="${d.id}">แก้ไข</button>
      ${isExternal(d)
        ? `<button class="btn btn-ghost btn-sm" data-act="link" data-id="${d.id}">จัดการลิงก์</button>`
        : `<button class="btn btn-ghost btn-sm" data-act="toggle" data-id="${d.id}">${off ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</button>`}
      <button class="btn btn-danger btn-sm" data-act="del" data-id="${d.id}">ลบ</button>
    </span>
  </td>
</tr>`;
};

/* ---------- ตาราง ------------------------------------------ */
function paint(){
  paintKpi();
  const all = listDrivers().filter(match);
  const def = TABS.find(t => t.key === tab);
  const rows = all.filter(def.test);

  $('#tabs').innerHTML = TABS.map(t => `
    <button class="tab" role="tab" data-tab="${t.key}" aria-selected="${t.key === tab}">
      ${esc(t.label)}<span class="cnt">${all.filter(t.test).length}</span>
    </button>`).join('');

  /* สองตาราง: รถประจำ ข้างบน · รถนอก ข้างล่าง (driverFleet — คนขับภายนอกแบบลิงก์นับเป็นรถนอก) */
  const groups = [
    { label:'คนขับรถประจำ', list: rows.filter(d => driverFleet(d) === FLEET_OWN) },
    { label:'คนขับรถนอก',   list: rows.filter(d => driverFleet(d) !== FLEET_OWN) },
  ];
  $('#fleetTables').innerHTML = groups.map(g => `
    <div class="card fleet-group" style="overflow:hidden">
      <h3 class="fleet-head">${esc(g.label)} <span class="cnt">${g.list.length}</span></h3>
      ${g.list.length ? `
      <div class="scroll-x">
        <table class="tbl">
          <thead>
            <tr>
              <th>คนขับ</th>
              <th>ทะเบียน / ประเภทรถ</th>
              <th style="text-align:center" title="เห็นบิลของทุกงานในหน้าผู้ช่วย → รวบรวมคืนบิล · สถานะคืนบิลนับจากคนนี้เท่านั้น">ผู้รวบรวมบิล</th>
              <th class="right">งานค้าง</th>
              <th class="right">งานทั้งหมด</th>
              <th>ใช้งานล่าสุด</th>
              <th>สถานะ</th>
              <th class="right">จัดการ</th>
            </tr>
          </thead>
          <tbody>${g.list.map(rowHtml).join('')}</tbody>
        </table>
      </div>` : `<div class="empty" style="padding:18px 16px"><p class="small dim">${q ? 'ไม่พบคนขับที่ตรงกับคำค้น' : 'ยังไม่มีคนขับในกลุ่มนี้'}</p></div>`}
    </div>`).join('');
}

on(document, 'click', '[data-tab]', (e, b) => { tab = b.dataset.tab; saveUI('drivers', { tab }); paint(); });
/* ผู้รวบรวมบิล — ติ๊กในตารางได้เลย (หลายคนก็ได้) */
on(document, 'change', '[data-collector-row]', (e, cb) => {
  try{
    const d = setBillCollector(cb.dataset.collectorRow, cb.checked);
    toast(cb.checked ? `ตั้ง ${d.name} เป็นผู้รวบรวมบิลแล้ว — ให้ออกจากระบบแล้วเข้าหน้าผู้ช่วยใหม่หนึ่งครั้ง` : `${d.name} ไม่ใช่ผู้รวบรวมบิลแล้ว`, 'ok', 5000);
  }catch(err){ cb.checked = !cb.checked; toast(err.message, 'err'); }
});
on(document, 'click', '[data-act]', (e, b) => {
  const d = getDriver(b.dataset.id);
  if (!d) return toast('ไม่พบคนขับคนนี้', 'err');
  if (b.dataset.act === 'edit')   return driverForm(d);
  if (b.dataset.act === 'link')   return linkDialog(d.id);
  if (b.dataset.act === 'toggle') return toggleActive(d);
  if (b.dataset.act === 'del')    return removeDriver(d);
});

$('#addDriver').onclick = () => driverForm(null);

/* ================= เชื่อมกับ Google Sheet ==================
   ชีตเดียวกับที่คนขับใช้ล็อกอิน  A=ID · B=PASSWORD · C=ชื่อ · D=ทะเบียน · E=เบอร์
     อ่าน  — ปุ่ม "รีเฟรชจากชีต" ใช้ได้เลย ไม่ต้องตั้งค่า
     เขียน — ต้องตั้งลิงก์ Apps Script ก่อน (ดูไฟล์ AppsScript-drivers.gs)
   ========================================================== */

function paintSheetBar(){
  const bar = $('#sheetBar');
  const pending = pendingDrivers().length;

  if (hasSheetApi()){
    if (!pending){ bar.style.display = 'none'; return; }
    bar.style.display = '';
    bar.innerHTML = `
      <div class="row between gap-12 wraps">
        <p class="small" style="margin:0">มีคนขับ <b>${pending} คน</b> ที่ยังไม่ได้ขึ้น Google Sheet</p>
        <button class="btn btn-green btn-sm" id="pushNow">ส่งขึ้นชีตเลย</button>
      </div>`;
    $('#pushNow').onclick = doPushPending;
    return;
  }

  bar.style.display = '';
  bar.style.borderColor = 'var(--amber)';
  bar.innerHTML = `
    <div class="row between gap-12 wraps">
      <p class="small" style="margin:0">
        ยังไม่ได้เชื่อมกับ Google Sheet — <b>รีเฟรชดึงข้อมูลลงมาได้</b>
        แต่คนขับที่เพิ่มในเว็บจะยังไม่ขึ้นชีต${pending ? ` (ค้างอยู่ ${pending} คน)` : ''}
      </p>
      <button class="btn btn-accent btn-sm" id="setupNow">ตั้งลิงก์เชื่อมชีต</button>
    </div>`;
  $('#setupNow').onclick = sheetSetupDialog;
}

/* ---------- ดึงจากชีตมาอัปเดตในเครื่อง ---------------------- */
async function doRefresh(){
  const btn = $('#refreshSheet');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'กำลังดึงจากชีต…';
  try{
    const r = await syncFromSheet();
    paint(); paintSheetBar();

    const bits = [];
    if (r.added.length)   bits.push(`เพิ่มใหม่ ${r.added.length} คน`);
    if (r.updated.length) bits.push(`อัปเดต ${r.updated.length} คน`);
    if (r.failed.length)  bits.push(`ข้าม ${r.failed.length} คน`);
    toast(bits.length ? `ซิงก์จากชีตแล้ว — ${bits.join(' · ')}` : `ข้อมูลตรงกับชีตอยู่แล้ว (${r.total} คน)`,
          r.failed.length ? 'warn' : 'ok');

    if (r.failed.length){
      modal({
        title: 'มีบางแถวที่ดึงเข้าไม่ได้',
        body: `<p class="muted small">แถวที่เหลือเข้าระบบเรียบร้อยแล้ว เฉพาะรายชื่อข้างล่างนี้ที่ติดปัญหา</p>
          <div class="panel" style="margin-top:12px;max-height:220px;overflow:auto">
            ${r.failed.map(f => `<div class="tiny" style="padding:5px 0;border-bottom:1px solid var(--line)">
              <span class="strong">${esc(f.name)}</span> — ${esc(f.msg)}</div>`).join('')}
          </div>`,
        foot: `<button class="btn btn-ghost" data-close>ปิด</button>
               <a class="btn btn-accent" href="${SHEET_LINK}" target="_blank" rel="noopener">เปิดชีตไปแก้</a>`,
      });
    }
  }catch(err){
    toast(err.message, 'err');
  }finally{
    btn.disabled = false; btn.textContent = label;
  }
}

/* ---------- ดันคนที่ยังค้างขึ้นชีต -------------------------- */
async function doPushPending(){
  const btn = $('#pushNow');
  if (btn){ btn.disabled = true; btn.textContent = 'กำลังส่ง…'; }
  try{
    const r = await pushPending();
    paint(); paintSheetBar();
    toast(r.failed.length
      ? `ส่งขึ้นชีตแล้ว ${r.pushed.length} คน · ไม่สำเร็จ ${r.failed.length} คน`
      : `ส่งขึ้นชีตครบแล้ว ${r.pushed.length} คน`, r.failed.length ? 'warn' : 'ok');
  }catch(err){
    toast(err.message, 'err');
    paintSheetBar();
  }
}

/* ---------- กล่องตั้งลิงก์ Apps Script ---------------------- */
function sheetSetupDialog(){
  /* ลิงก์ตั้งไว้ใน js/config.js แล้ว — ทุกเครื่องใช้ร่วมกัน ไม่ต้อง (และไม่ควร) ตั้งแยกในเครื่อง */
  if (apiFromConfig()) return toast('ลิงก์ Apps Script ตั้งไว้ใน js/config.js แล้ว — ทุกเครื่องใช้ลิงก์เดียวกัน', 'ok', 4200);
  modal({
    title: 'เชื่อมกับ Google Sheet',
    body: `
<div class="stack gap-14">
  <p class="muted small" style="margin:0">
    การ<b>อ่าน</b>จากชีตใช้ได้อยู่แล้ว ปุ่ม “รีเฟรชจากชีต” ทำงานได้ทันที<br>
    ส่วนการ<b>เขียนกลับขึ้นชีต</b> ต้องมีตัวกลาง เพราะหน้าเว็บนิ่ง ๆ เขียน Google Sheet ตรง ๆ ไม่ได้
  </p>
  <ol class="small muted" style="margin:0;padding-left:18px;line-height:1.9">
    <li>เปิดชีต → เมนู <b>Extensions → Apps Script</b></li>
    <li>วางโค้ดจากไฟล์ <span class="mono">AppsScript-drivers.gs</span> ในโฟลเดอร์โปรเจกต์ → บันทึก</li>
    <li>กด <b>Deploy → New deployment → Web app</b><br>
        Execute as = <b>Me</b> · Who has access = <b>Anyone</b></li>
    <li>คัดลอกลิงก์ที่ได้ (ลงท้ายด้วย <span class="mono">/exec</span>) มาวางข้างล่างนี้</li>
  </ol>
  <label class="field">
    <span class="label">ลิงก์ Web app</span>
    <input class="input mono" id="apiUrl" placeholder="https://script.google.com/macros/s/…/exec"
           value="${esc(sheetApiUrl())}" autocomplete="off" spellcheck="false">
    <span class="hint">เก็บไว้ในเบราว์เซอร์เครื่องนี้เท่านั้น ไม่ได้ฝังในโค้ด</span>
  </label>
  <p class="tiny dim" style="margin:0">
    เปิดชีตดูได้ที่ <a href="${SHEET_LINK}" target="_blank" rel="noopener"
    style="color:var(--amber-dim);text-decoration:underline">Google Sheet ทะเบียนคนขับ</a>
  </p>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           ${hasSheetApi() ? '<button class="btn btn-quiet" data-clear>เลิกเชื่อม</button>' : ''}
           <button class="btn btn-accent" data-ok>บันทึกลิงก์</button>`,
    onMount(root){
      const input = root.querySelector('#apiUrl');
      input.focus();

      root.querySelector('[data-clear]')?.addEventListener('click', () => {
        try{ setSheetApiUrl(''); toast('เลิกเชื่อมกับชีตแล้ว', 'warn'); close(); paintSheetBar(); }
        catch(err){ toast(err.message, 'err'); }
      });

      root.querySelector('[data-ok]').onclick = async () => {
        try{
          setSheetApiUrl(input.value);
          close();
          paintSheetBar();
          const left = pendingDrivers().length;
          if (hasSheetApi() && left){
            toast(`บันทึกลิงก์แล้ว — กำลังส่งคนขับที่ค้างอยู่ ${left} คนขึ้นชีต`, 'ok');
            await doPushPending();
          } else {
            toast('บันทึกลิงก์แล้ว — เพิ่มคนขับครั้งต่อไปจะขึ้นชีตอัตโนมัติ', 'ok');
          }
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

$('#refreshSheet').onclick = doRefresh;
$('#sheetSetup').onclick = sheetSetupDialog;

/* ---------- ฟอร์มเพิ่ม / แก้ไข ------------------------------ */
/* ตัวเลือกประเภทน้ำมัน = ชื่อตามราคา ปตท. (js/fuelPrice.js) · ดึงไม่ได้ใช้ชุดนี้ไปก่อน · พิมพ์ชื่ออื่นได้ */
let FUEL_NAMES = ['ดีเซล B7', 'ดีเซล B20', 'ดีเซลพรีเมียม', 'แก๊สโซฮอล์ 91', 'แก๊สโซฮอล์ 95', 'แก๊สโซฮอล์ E20', 'เบนซิน 95', 'แก๊ส NGV'];
pttPrices().then(p => { if (p?.list?.length) FUEL_NAMES = p.list.map(o => o.name); });

function driverForm(d){
  const add = !d;
  const v = d || { name:'', phone:'', plate:'', truck:'', pin:'1234', note:'', bankAccount:'', bankName:'', fleet:FLEET_OWN, fuelType:'' };
  const st = d ? driverStats(d.id) : null;

  modal({
    title: add ? 'เพิ่มคนขับใหม่' : `แก้ไขข้อมูล · ${esc(driverName(v))}`,
    body: `
<div class="stack gap-16">
  ${st && st.open ? `<p class="tiny dim">คนขับคนนี้มีงานค้างอยู่ ${st.open} ใบ — แก้ทะเบียนหรือเบอร์โทรได้ทันที ใบงานที่ถืออยู่จะใช้ข้อมูลใหม่</p>` : ''}
  <div class="grid g2" style="gap:14px">
    <label class="field" style="grid-column:1/-1">
      <span class="label">ชื่อ–นามสกุล<span class="req">*</span></span>
      <input class="input" data-f="name" value="${esc(v.name)}" placeholder="สมชาย พูลทรัพย์">
    </label>
    <label class="field">
      <span class="label">เบอร์โทร</span>
      <input class="input" data-f="phone" value="${esc(v.phone)}" placeholder="081-234-5678" inputmode="tel">
    </label>
    <label class="field">
      <span class="label">${add ? 'รหัสผ่าน (PIN)' : 'ตั้งรหัสผ่านใหม่ (PIN)'}</span>
      <input class="input mono" data-f="pin" value="${add ? esc(v.pin) : ''}" placeholder="${add ? '1234' : 'เว้นว่าง = ใช้รหัสเดิม'}" inputmode="numeric" maxlength="6" autocomplete="off">
      <span class="hint">ตัวเลข 4–6 หลัก · เก็บใน Google Sheet ที่เดียว ไม่เก็บในฐานข้อมูล${add ? '' : ' — ไม่แสดงรหัสเดิม'}</span>
    </label>
    <label class="field">
      <span class="label">ทะเบียนรถ<span class="req">*</span></span>
      <input class="input" data-f="plate" value="${esc(v.plate)}" placeholder="70-8842 กทม.">
      <span class="hint">ห้ามซ้ำกับคนขับคนอื่น</span>
    </label>
    <label class="field">
      <span class="label">ประเภทรถ</span>
      <input class="input" data-f="truck" value="${esc(v.truck)}" placeholder="6 ล้อ ตู้ทึบ">
    </label>
    <label class="field" style="grid-column:1/-1">
      <span class="label">ประเภทคนขับ</span>
      <select class="input" data-f="fleet"${d && isExternal(d) ? ' disabled' : ''}>
        ${FLEETS.map(f => `<option value="${f}"${driverFleet(v) === f ? ' selected' : ''}>${f}</option>`).join('')}
      </select>
      <span class="hint">ขึ้นเป็นวงเล็บหลังชื่อคนขับทุกหน้า${d && isExternal(d) ? ' · คนขับภายนอกแบบลิงก์เป็นรถนอกเสมอ' : ''}</span>
    </label>
    <label class="field" style="grid-column:1/-1">
      <span class="label">ประเภทน้ำมัน</span>
      <input class="input" data-f="fuelType" value="${esc(v.fuelType || '')}" placeholder="ดีเซล B7" list="fuelNames" autocomplete="off">
      <datalist id="fuelNames">${FUEL_NAMES.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      <span class="hint">พิมพ์ให้ตรงชื่อของ ปตท. · ช่อง I ในชีตคนขับ${add ? '' : ' · เว้นว่าง = ใช้ค่าเดิมในชีต'}</span>
    </label>
    <label class="field">
      <span class="label">เลขที่บัญชี</span>
      <input class="input mono" data-f="bankAccount" value="${esc(v.bankAccount || '')}" placeholder="123-4-56789-0" inputmode="numeric" autocomplete="off">
      <span class="hint">เก็บใน Google Sheet กับเครื่องนี้เท่านั้น ไม่เก็บในฐานข้อมูล${add ? '' : ' · เว้นว่าง = ใช้ค่าเดิมในชีต'}</span>
    </label>
    <label class="field">
      <span class="label">ธนาคาร</span>
      <input class="input" data-f="bankName" value="${esc(v.bankName || '')}" placeholder="กสิกรไทย">
    </label>
    <label class="field" style="grid-column:1/-1">
      <span class="label">หมายเหตุ</span>
      <input class="input" data-f="note" value="${esc(v.note || '')}" placeholder="ขับรถห้องเย็นเท่านั้น / วิ่งสายอีสาน">
    </label>
  </div>
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>${add ? 'เพิ่มคนขับ' : 'บันทึกการแก้ไข'}</button>`,
    onMount(root){
      const val = (n) => root.querySelector(`[data-f="${n}"]`).value.trim();
      const FIELDS = ['name','phone','pin','plate','truck','fleet','fuelType','note','bankAccount','bankName'];

      /* กู้สิ่งที่พิมพ์ค้างไว้ก่อนหน้ารีเฟรช */
      const draft = loadUI('drivers').form;
      if (draft && draft.id === (d ? d.id : 'new')){
        FIELDS.forEach(n => {
          const el = root.querySelector(`[data-f="${n}"]`);
          if (el && draft.values[n] != null) el.value = draft.values[n];
        });
        toast('กู้ข้อมูลที่กรอกค้างไว้กลับมาแล้ว ยังไม่ได้บันทึก', 'ok');
      }

      const keepDraft = debounce(() => {
        const values = {};
        FIELDS.forEach(n => { values[n] = root.querySelector(`[data-f="${n}"]`)?.value || ''; });
        saveUI('drivers', { form: { id: d ? d.id : 'new', values } });
      }, 350);
      root.addEventListener('input', keepDraft);

      /* ปิดหน้าต่างเมื่อไหร่ก็เลิกจำ */
      const watch = new MutationObserver(() => {
        if (root.isConnected || document.querySelector('.scrim')) return;
        dropUI('drivers', 'form');
        watch.disconnect();
      });
      watch.observe(document.body, { childList: true });

      const first = root.querySelector('[data-f="name"]');
      first.focus();
      first.setSelectionRange(first.value.length, first.value.length);

      root.querySelector('[data-ok]').onclick = async () => {
        const p = { name:val('name'), phone:val('phone'), plate:val('plate'), truck:val('truck'), fleet:val('fleet'), fuelType:val('fuelType'), pin:val('pin'), note:val('note'),
                    bankAccount:val('bankAccount'), bankName:val('bankName') };
        let saved = null;
        try{
          saved = add ? createDriver(p) : updateDriver(d.id, p);
          dropUI('drivers', 'form');
          toast(add ? `เพิ่ม ${saved.name} เข้าทะเบียนแล้ว` : 'บันทึกข้อมูลคนขับแล้ว', 'ok');
          close();
        }catch(err){ return toast(err.message, 'err'); }

        /* เขียนกลับขึ้นชีตให้อัตโนมัติ — ยังไม่ได้ตั้งลิงก์ก็ไม่เป็นไร
           ข้อมูลอยู่ในเครื่องครบ แถบด้านบนจะบอกว่าค้างอยู่กี่คน */
        if (!hasSheetApi()){ paintSheetBar(); return; }
        try{
          await pushDriver(saved);
          toast(`อัปเดต ${saved.name} ขึ้น Google Sheet แล้ว`, 'ok');
        }catch(err){
          toast(`บันทึกในเว็บแล้ว แต่ขึ้นชีตไม่สำเร็จ — ${err.message}`, 'warn');
        }
        paintSheetBar();
      };
    },
  });
}

/* ---------- ปิด / เปิดใช้งาน -------------------------------- */
async function toggleActive(d){
  const off = !isActiveDriver(d);
  if (off){
    try{
      setDriverActive(d.id, true);
      toast(`เปิดใช้งาน ${d.name} แล้ว — จ่ายงานได้ตามปกติ`, 'ok');
    }catch(err){ toast(err.message, 'err'); }
    return;
  }

  const st = driverStats(d.id);
  if (st.open){
    return modal({
      title: 'ปิดใช้งานยังไม่ได้',
      body: `<p class="muted small">${esc(d.name)} ยังถืองานค้างอยู่ <span class="strong">${st.open} ใบ</span>
             ย้ายงานให้คนขับคนอื่นที่หน้ากระดานงานก่อน แล้วค่อยกลับมาปิดใช้งาน</p>`,
      foot: `<button class="btn btn-ghost" data-close>ปิด</button>
             <a class="btn btn-accent" href="ops.html">ไปกระดานงาน</a>`,
    });
  }

  const ok = await confirmDialog({
    title: `ปิดใช้งาน ${d.name}`,
    message: 'จะไม่ขึ้นในรายการจ่ายงานและหน้าล็อกอินคนขับอีก ประวัติงานเดิมยังอยู่ครบ และเปิดกลับมาได้ทุกเมื่อ',
    ok: 'ปิดใช้งาน',
  });
  if (!ok) return;
  try{
    setDriverActive(d.id, false);
    toast(`ปิดใช้งาน ${d.name} แล้ว`, 'warn');
  }catch(err){ toast(err.message, 'err'); }
}

/* ---------- ลบถาวร ----------------------------------------- */
async function removeDriver(d){
  const st = driverStats(d.id);

  /* มีประวัติงานผูกอยู่ = ลบไม่ได้ ไม่งั้นใบงานเก่าจะหาคนขับไม่เจอ */
  if (st.total){
    return modal({
      title: 'ลบคนขับคนนี้ไม่ได้',
      body: `<p class="muted small">${esc(d.name)} มีใบงานผูกอยู่ <span class="strong">${st.total} ใบ</span>
             (ค้างอยู่ ${st.open} ใบ) ถ้าลบทิ้ง ไทม์ไลน์และใบงานเก่าจะหาคนขับไม่เจอ</p>
             <p class="muted small" style="margin-top:10px">ใช้ “ปิดใช้งาน” แทน — คนขับจะหายจากรายการจ่ายงาน แต่ประวัติยังอยู่ครบ</p>`,
      foot: `<button class="btn btn-ghost" data-close>ปิด</button>
             ${isActiveDriver(d) ? '<button class="btn btn-accent" data-off>ปิดใช้งานแทน</button>' : ''}`,
      onMount(root){
        root.querySelector('[data-off]')?.addEventListener('click', () => { close(); toggleActive(d); });
      },
    });
  }

  const ok = await confirmDialog({
    title: `ลบ ${d.name} ออกจากทะเบียน`,
    message: 'คนขับคนนี้ยังไม่เคยมีใบงาน ลบแล้วย้อนกลับไม่ได้',
    ok: 'ลบถาวร',
    tone: 'btn-danger',
  });
  if (!ok) return;
  try{
    deleteDriver(d.id);
    toast(`ลบ ${d.name} ออกจากทะเบียนแล้ว`, 'warn');
  }catch(err){ toast(err.message, 'err'); }
}

/* ---------- เริ่ม ------------------------------------------ */
paint();
paintSheetBar();

/* ทะเบียนว่างเปล่า (เช่น เพิ่งล้างข้อมูล) — ดึงคืนจาก Google Sheet ให้เอง
   รอให้ข้อมูลจากคลาวด์มาถึงก่อน ไม่งั้นจะสร้างคนขับซ้ำกับของที่อยู่บนคลาวด์ */
setTimeout(async () => {
  if (listDrivers().length) return;
  try{
    const r = await syncFromSheet();
    paint(); paintSheetBar();
    if (r.added.length) toast(`ทะเบียนคนขับว่างอยู่ — ดึงคืนจาก Google Sheet แล้ว ${r.added.length} คน`, 'ok');
  }catch(err){ console.warn('[drivers] ดึงคนขับจากชีตไม่ได้', err); }
}, 3000);

/* ฟอร์มที่กรอกค้างไว้ก่อนรีเฟรช — เปิดกลับมาให้เลย */
if (UI.form){
  setTimeout(() => {
    const target = UI.form.id === 'new' ? null : getDriver(UI.form.id);
    if (UI.form.id === 'new' || target) driverForm(target);
    else dropUI('drivers', 'form');
  }, 0);
}
subscribe(() => { paint(); paintSheetBar(); });
/* ผู้รวบรวมบิลตั้งต้น = ผู้เก็บเงินตั้งต้น (ยังไม่เคยตั้งใคร) — รอรายชื่อคนขับจากคลาวด์มาก่อน */
setTimeout(() => { try{ const d = ensureDefaultCollector(); if (d) toast(`ตั้ง ${d.name} เป็นผู้รวบรวมบิลตั้งต้นแล้ว`, 'ok'); }catch(e){ console.warn(e); } }, 4000);
