/* ============================================================
   driver.js — ขั้นที่ 3–6: คนขับยืนยันสถานะบนมือถือ
   ออกแบบให้กดด้วยนิ้วโป้งข้างเดียว ปุ่มใหญ่หนึ่งปุ่มต่อหนึ่งขั้น
   ============================================================ */

import { celebrate } from './motion.js';
import {
  shell, $, $$, esc, el, toast, modal, close, confirmDialog,
  shrinkImage, signaturePad, getGeo, pill, flowBar, on, fmtPhone, copyText, markDirty, reopenDialog,
} from './ui.js';
import {
  listShipments, getShipment, listDrivers, getDriver, advance, isActiveDriver,
  listJobs, getJob, advanceJob, deliverStops, stopGroups, hasDriver, getJobPay, payTotal, fmtBaht,
  subscribe, fmtDate, fmtDateTime, ago, fmtNum, qty, META, S, FLOW, nextOf, isOpen, NEEDS_PHOTO, NEEDS_GEO,
  minPhotos, PHOTO_GUIDE, MIN_INVOICE_PHOTOS, INVOICE_PHOTO_GUIDE, validSign,
  getDriverByToken, isExternal, isLinkOpen, cloudSynced,
  payTotalFor, payRowsOf, isRtCode, scanLocalPhotos, migrateLocalPhotos, saveFailed,
  driverName, jobStops, OUTCOMES, isFailOutcome, MIN_FAIL_PHOTOS, outcomeOf,
  deliveryProof, canAddPhotos, addDeliveryPhotos, crewStep, crewStepAt,
  whReturnOf, needsWhReturn, canWhReturn, dupOf, reusedOf, billReportOf, reportBillNo, isBillCollector, inCollectRange,
} from './store.js';
import { COMPANY } from './config.js';
import { collectView, restoreBatch } from './billCollect.js';
import { billIdTags, paidLine, payStopRow, groupActs, payDialog, tripTools, invRetDialog, invRetAllDialog, podStop, podTrip, rtLive, rtTag, needRebill, REBILL, rebillTag, failed, failTag, sentBy, whReturnTag, whReturnDialog } from './helper.js';
import { routeBlock, cargoBlock, timeline, bindZoom } from './detail.js';
import { uploadPhotos, cloudReady, isLocalPhoto, stopPhotoDir, jobPhotoDir } from './cloud.js';
import { verify, forgetOfflineCreds, normName } from './sheetAuth.js';
import { loadUI, saveUI, dropUI } from './uiState.js';
import { gate, getSession, authUser, driverIdOf, signInDriverToken, signOutFirebase, isHelperPage } from './auth.js';
import { hasApi, apiPost } from './api.js';
import { saveDraft, loadDraft, dropDrafts, trimDrafts, draftBadge } from './deliverDraft.js';
import { mountFontScale } from './fontScale.js';
import { pttPrices } from './fuelPrice.js';
import { keepPhotos } from './keepPhoto.js';
import { payReportDialog } from './payReport.js';

/* โหมดลิงก์คนขับภายนอก — driver.html?k=<token>
   ไม่มีหน้าเลือกคนขับ ไม่จำลงเครื่อง ไม่เห็นเมนูหลังบ้าน
   และเห็นเฉพาะงานที่ผูกกับลิงก์นั้นเท่านั้น */
const TOKEN = new URLSearchParams(location.search).get('k') || '';
/* token ไม่อยู่ในรายชื่อคนขับแล้ว (ย้ายไป driverLinks ที่คนขับอ่านไม่ได้ — QA TC-058)
   จึงใช้รหัสคนขับที่ Apps Script ตอบกลับมาตอน extLogin · getDriverByToken เหลือไว้ให้ข้อมูลเก่าในเครื่องพนักงาน */
let linkedId = '';
const linked = () => (TOKEN ? (linkedId ? getDriver(linkedId) : getDriverByToken(TOKEN)) : null);

/* ด่านสิทธิ์ — ไม่มีสิทธิ์ถูกพาออกไปก่อนเห็นข้อมูล (js/auth.js) */
await gate('driver');
/* พนักงาน (ล็อกอิน Google) เปิดหน้านี้ = เลือกดูงานของคนขับคนไหนก็ได้ แบบดูอย่างเดียว
   ไม่ต้องล็อกอินคนขับ — การล็อกอินคนขับจะเตะบัญชี Google ออก แล้วเมนูอื่นจะพากลับมาหน้านี้หมด */
const STAFF = !TOKEN && getSession().kind === 'staff';
/* หน้าผู้ช่วยคนขับ (helper.html) — ใช้ไฟล์นี้ร่วมกับหน้าคนขับ ล็อกอินด้วยบัญชีของคนขับที่ไปด้วยกัน
   เห็นงานเหมือนคนขับทุกอย่าง (ทำงานแทนคนขับได้) และกดจุดส่งแล้วได้หน้าบันทึกการชำระเงิน (js/helper.js) */
const ASSIST = !TOKEN && !STAFF && isHelperPage();
/* ฟีเจอร์ของผู้ช่วย (ชำระเงิน · คืน Inv. · POD) เปิดให้คนขับด้วย — คนขับที่ไปคนเดียวต้องทำเองได้
   ยกเว้นพนักงานที่เปิดดูแทน (ดูอย่างเดียว) */
const EXTRAS = !STAFF;
const ROLE = ASSIST ? 'assistant' : 'driver';
shell({ role: TOKEN ? 'คนขับภายนอก' : ASSIST ? 'มุมมองผู้ช่วยคนขับ' : 'มุมมองคนขับ', nav: !TOKEN });
mountFontScale();
/** ชื่อที่ประทับลงบันทึก — ผู้ช่วยใช้บัญชีคนขับ จึงต่อท้ายให้รู้ว่าใครกด */
const actorName = (d) => ASSIST ? `${driverName(d)} (ผู้ช่วย)` : driverName(d);

/* เก็บ session หลังล็อกอิน — ไม่เก็บรหัสผ่านลงเครื่อง เก็บแค่ว่าเป็นใคร */
const KEY = 'ft.driver.session';
const app = $('#app');

localStorage.removeItem('ft.driver.me');   /* คีย์เก่าสมัยเลือกคนขับเองได้ ล้างทิ้งให้ล็อกอินใหม่ */

function loadSession(){
  try{ return JSON.parse(localStorage.getItem(KEY)) || null; }catch{ return null; }
}
function saveSession(driverId, acct){
  /* fb = ได้บัตรผ่าน Firebase ตอนล็อกอิน (Apps Script ตั้งครบแล้ว) — ใช้ตัดสินว่าเปิดหน้าใหม่ต้องมีบัตรผ่านไหม */
  localStorage.setItem(KEY, JSON.stringify({ driverId, uid:acct.id, name:acct.name, at:Date.now(), fb:!!acct.tokenIssued }));
}
const clearSession = () => localStorage.removeItem(KEY);

let me = TOKEN ? (linked()?.id || null) : STAFF ? (loadUI('driver').as || null) : (loadSession()?.driverId || null);
/* คนขับภายนอกเข้าได้ทางลิงก์เท่านั้น ห้ามค้างในเครื่องเป็นบัญชีปกติ
   (ตัดเฉพาะเมื่อเห็นข้อมูลคนขับแล้วว่าใช้ไม่ได้ — ข้อมูลยังมาไม่ถึงไม่ได้แปลว่าไม่มีคนนี้) */
if (!TOKEN && !STAFF && me){
  const d = getDriver(me);
  if (d && (!isActiveDriver(d) || isExternal(d))){ me = null; clearSession(); }
}

/* ล็อกอินค้างอยู่ แต่ไม่มีบัตรผ่าน Firebase (เช่น ล็อกอินตอนออฟไลน์ หรือเปิดเบราว์เซอร์ใหม่)
   ตอนมีเน็ต → ให้ล็อกอินใหม่หนึ่งครั้ง ไม่งั้นงานที่ทำจะส่งขึ้นระบบไม่ได้ (งานที่ค้างในเครื่องไม่หาย) */
let reloginNote = '';
if (!TOKEN && !STAFF && me && loadSession()?.fb && navigator.onLine){
  const u = await authUser();          /* รอ Firebase โหลดสถานะเดิมก่อน — currentUser ทันทีอาจยังว่าง */
  if ((await driverIdOf(u)) !== me){
    me = null; clearSession();
    reloginNote = 'เข้าสู่ระบบอีกครั้ง — งานที่ทำไว้ยังอยู่ครบ';
  }
}

/* ลิงก์คนขับภายนอก — ขอบัตรผ่านเฉพาะงานของลิงก์นี้จาก Apps Script ก่อนเห็นข้อมูล */
let linkState = TOKEN ? 'checking' : '';
let linkErr = '';
if (TOKEN && hasApi()){
  apiPost({ action:'extLogin', token:TOKEN }, { auth:false })
    .then(async (r) => { linkedId = r.driverId || ''; if (r.token) await signInDriverToken(r.token); linkState = 'ok'; render(); })
    .catch((err) => {
      /* Apps Script รุ่นเก่า → ใช้แบบเดิม (อ่านรายชื่อคนขับตรง) */
      if (/ไม่รู้จักคำสั่ง/.test(err.message)){ linkState = 'ok'; render(); return; }
      linkState = 'error'; linkErr = err.message; render();
    });
} else if (TOKEN){
  linkState = 'ok';
}

/* ป้ายสถานะฝั่งคนขับ — ไอคอนใหญ่ + คำสั้น ให้คนขับสูงอายุเห็นแวบเดียวรู้เลย
   (หน้าอื่นยังใช้ pill() ตัวเต็มจาก ui.js เหมือนเดิม) */
const SVG = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const DRV_PILL = {
  [S.NEW]:       { icon:SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),                          text:'รอของ' },
  [S.RECEIVED]:  { icon:SVG('<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),          text:'ของพร้อม' },
  [S.LOADED]:    { icon:SVG('<path d="M1 4h14v12H1zM15 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'), text:'ขึ้นรถแล้ว' },
  [S.DEPARTED]:  { icon:SVG('<path d="M1 4h14v12H1zM15 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'), text:'กำลังส่ง' },
  [S.ARRIVED]:   { icon:SVG('<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'), text:'ถึงแล้ว' },
  [S.DELIVERED]: { icon:SVG('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),                        text:'ส่งแล้ว' },
  [S.CANCELLED]: { icon:SVG('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),                    text:'ยกเลิก' },
};
const drvPill = (status) => {
  const p = DRV_PILL[status];
  if (!p) return pill(status);
  const m = META[status];
  return `<span class="pill pill-drv" data-tone="${m.tone}" title="${esc(m.label)}">${p.icon}${esc(p.text)}</span>`;
};

/* แถบขั้นตอนฝั่งคนขับ — วงกลมใหญ่มีไอคอน + คำสั้น ไม่มีเวลา
   เสร็จแล้ว = เขียวมีเครื่องหมายถูก · ตอนนี้ = ส้มใหญ่ · ยังไม่ถึง = เทาจาง
   (หน้าอื่นยังใช้ flowBar() จาก ui.js เหมือนเดิม) */
const FLOW_WORD = { [S.NEW]:'รอของ', [S.RECEIVED]:'ของพร้อม', [S.LOADED]:'ขึ้นรถ', [S.DEPARTED]:'กำลังส่ง', [S.DELIVERED]:'ส่งแล้ว' };
const CHECK = SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>');
/* ขั้นของ "ฉัน" ในเที่ยว — เที่ยวหลายคนขับ แต่ละคนกดขั้นของทั้งเที่ยวเอง (store.js crewStep · 27 ต.ค.) */
const myStatus = (j) => crewStep(j, me);

const drvFlow = (j) => {
  const cur = FLOW.indexOf(myStatus(j));
  const closed = j.status === S.DELIVERED;
  return `<div class="dflow" role="list">${FLOW.map((st, i) => {
    const state = (closed || i < cur) ? 'done' : i === cur ? 'now' : 'idle';
    return `<div class="dflow-step" data-state="${state}" role="listitem" aria-current="${state === 'now' ? 'step' : 'false'}">
      <span class="dflow-dot">${state === 'done' ? CHECK : DRV_PILL[st].icon}</span>
      <span class="dflow-label">${esc(FLOW_WORD[st])}</span>
    </div>`;
  }).join('')}</div>`;
};

/* ไอคอนหัวการ์ดเที่ยวฝั่งคนขับ — ใช้คู่ตัวเลขแทนคำอธิบายยาวๆ */
const ICON = {
  ticket: SVG('<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 3"/>'),
  pin:    SVG('<path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>'),
  weight: SVG('<path d="M6 8h12l3 13H3z"/><circle cx="12" cy="5" r="2.5"/>'),
  truck:  SVG('<path d="M1 4h14v12H1zM15 9h4l4 4v3h-8z"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'),
  plate:  SVG('<rect x="2" y="6" width="20" height="12" rx="2.5"/><path d="M6 10.5h4M6 13.5h7M15.5 10.5h2.5v3h-2.5z"/>'),
  people: SVG('<circle cx="9" cy="8" r="3.5"/><path d="M2 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5"/><circle cx="17.5" cy="8.5" r="2.5"/><path d="M18 14.5c2.5.3 4 2.4 4 5.5"/>'),
};

const TONE = { [S.LOADED]:'amber', [S.DEPARTED]:'blue', [S.ARRIVED]:'blue', [S.DELIVERED]:'green' };

/* ป้ายบอกว่าเป็นหน้าของใคร — ขึ้นบนหัวการ์ดทุกหน้า เปิดมาแล้วรู้ทันทีว่าเป็นหน้าคนขับ หรือหน้าผู้ช่วย */
function roleChip(){
  const [cls, icon, text] = TOKEN ? ['', ICON.truck, 'คนขับภายนอก']
    : STAFF ? ['is-staff', ICON.people, 'พนักงาน · ดูอย่างเดียว']
    : ASSIST ? ['is-assist', ICON.people, 'หน้าผู้ช่วยคนขับ']
    : ['', ICON.truck, 'หน้าคนขับ'];
  return `<p class="drv-role ${cls}">${icon}${esc(text)}</p>`;
}

/* ปุ่มโทรหาทีมคลัง — เด่นพอให้เห็น แต่ไม่แย่งปุ่มหลักของหน้า */
const PHONE = SVG('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>');
function helpCall(lead = 'มีปัญหา / เข้าไม่ได้'){
  const nums = [
    ...(COMPANY.phone ? [['โทรสำนักงาน', COMPANY.phone]] : []),
    ...COMPANY.adminPhones.map(n => ['โทรแอดมิน', n]),
  ];
  return nums.map(([who, num]) => `<a class="drv-help" href="tel:${esc(num.replace(/[^0-9+]/g, ''))}" data-tel-label="${esc(who.replace(/^โทร/, ''))}">
    <span class="drv-help-ic">${PHONE}</span>
    <span class="drv-help-tx"><span>${esc(lead)}</span><b>${who} ${esc(num)}</b></span>
  </a>`).join('');
}

/* ---------- หน้าเข้าสู่ระบบ --------------------------------
   ตรวจ ID/รหัสผ่านกับ Google Sheet (คอลัมน์ A, B) แล้วจับคู่ชื่อในคอลัมน์ C
   กับคนขับในระบบ — คนขับจึงเปิดได้เฉพาะงานของตัวเอง */
/* ปลุก Apps Script ไว้ก่อนตั้งแต่เปิดหน้าล็อกอิน — ถ้าไม่มีใครเรียกมาสักพัก ครั้งแรกใช้ 10–20 วินาที
   ยิงคำขอเปล่าไปก่อนระหว่างที่คนขับพิมพ์ ID พอกดเข้าสู่ระบบจะเหลือไม่กี่วินาที (ผลลัพธ์ไม่ได้ใช้) */
let warmed = false;
function warmUp(){
  if (warmed || !hasApi()) return;
  warmed = true;
  apiPost({ action:'ping' }, { auth:false }).catch(() => {});
}

function loginView(){
  warmUp();
  app.innerHTML = `
<div class="driver-card drv-narrow" style="margin-top:22px">
  <div class="driver-hero">
    ${roleChip()}
    <h2 style="margin-top:8px;font-size:22px">เข้าสู่ระบบ</h2>
    <p class="small" style="color:#9fb2c8;margin-top:4px">${ASSIST
      ? 'ใช้รหัสคนขับและรหัสผ่าน ของคนขับที่ไปด้วยกัน'
      : 'ใช้รหัสคนขับและรหัสผ่าน ที่ได้จากทีมคลัง'}</p>
  </div>
  <form style="padding:18px" data-login novalidate>
    <label class="field">
      <span class="label">รหัสคนขับ<span class="req">*</span></span>
      <input class="input" name="uid" autocomplete="username" autocapitalize="none"
             spellcheck="false" enterkeyhint="next" placeholder="รหัสคนขับ" required>
    </label>
    <label class="field" style="margin-top:14px">
      <span class="label">รหัสผ่าน<span class="req">*</span></span>
      <input class="input" name="pw" type="password" autocomplete="current-password"
             enterkeyhint="go" placeholder="รหัสผ่าน" required>
    </label>
    <p class="err" data-err style="margin-top:12px">${esc(reloginNote)}</p>
    <button class="btn btn-accent btn-block" type="submit" data-submit style="margin-top:8px">เข้าสู่ระบบ</button>
    ${helpCall('ลืมรหัส / เข้าไม่ได้')}
  </form>
</div>`;
  requestAnimationFrame(() => app.querySelector('[name="uid"]')?.focus());
}

/* ตรวจรหัส → หาคนขับในระบบที่ชื่อตรงกับคอลัมน์ C → เปิดรายการงาน */
async function doLogin(form){
  const errEl = form.querySelector('[data-err]');
  const btn   = form.querySelector('[data-submit]');
  const uid   = form.uid.value.trim();
  const pw    = form.pw.value;
  errEl.textContent = '';
  if (!uid || !pw){ errEl.textContent = 'ใส่รหัสคนขับและรหัสผ่านให้ครบ'; return; }

  btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ…';
  /* ช้ากว่าปกติ (Apps Script เพิ่งตื่น) — บอกให้รอ ไม่ให้คนขับนึกว่าค้างแล้วกดซ้ำ */
  const slow = setTimeout(() => { if (btn.isConnected && btn.disabled) btn.textContent = 'กำลังตรวจสอบ… รอสักครู่'; }, 4000);
  try{
    const acct = await verify(uid, pw);
    if (!acct){ errEl.textContent = 'รหัสคนขับหรือรหัสผ่านไม่ถูก — ลองใหม่'; return; }

    /* Apps Script บอกรหัสคนขับมาแล้ว (ทางหลัก) — ไม่ต้องเดาจากชื่อ · ข้อมูลอาจยังมาไม่ถึงเครื่อง ใช้ชื่อจากชีตไปก่อน */
    const d = acct.driverId
      ? (getDriver(acct.driverId) || { id:acct.driverId, name:acct.name })
      : listDrivers({ active:true, external:false }).find(x => normName(x.name) === normName(acct.name));
    if (!d){
      errEl.textContent = `ยังไม่มีชื่อ “${acct.name}” ในระบบ — โทรแจ้งทีมคลัง`;
      return;
    }

    saveSession(d.id, acct);
    me = d.id;
    reloginNote = '';
    toast(`เข้าสู่ระบบแล้ว · ${d.name}`, 'ok');
    go({ name:'list' });
  }catch(err){
    errEl.textContent = err.message;
  }finally{
    clearTimeout(slow);
    /* ถ้าล็อกอินผ่าน หน้าถูกวาดใหม่แล้ว ปุ่มเดิมหลุดจาก DOM — เช็คก่อนคืนค่า */
    if (btn.isConnected){ btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }
  }
}

/* ---------- ลิงก์ใช้ไม่ได้ ----------------------------------- */
/* help = มีปุ่มโทรทีมคลัง (หน้าผิดพลาด) · หน้ากำลังโหลดไม่ต้องมี */
function linkErrorView(title, detail, help = true){
  app.innerHTML = `
<div class="driver-card drv-narrow" style="margin-top:22px">
  <div class="driver-hero">
    ${roleChip()}
    <h2 style="margin-top:8px;font-size:21px">${esc(title)}</h2>
  </div>
  <div style="padding:18px">
    <p class="small muted">${esc(detail)}</p>
    ${help ? helpCall() : ''}
  </div>
</div>`;
}

/* ---------- รายการเที่ยวของฉัน ------------------------------ */
function listView(){
  const d = getDriver(me);
  const mine = listJobs({ driverId: me });
  const open = byOrder(mine.filter(j => isOpen(j.status)), j => j.id, 'trips', j => j.rtOpen > 0);
  /* 3 แท็บ (27 ต.ค.): รอส่ง · ส่งสำเร็จ · ส่งไม่สำเร็จ — เที่ยวที่ปิดแล้วมีจุดส่งไม่สำเร็จแม้จุดเดียว = ส่งไม่สำเร็จ */
  const closed = mine.filter(j => !isOpen(j.status));
  const hasFail = (j) => jobStops(j.id).some(failed);
  const failJ = closed.filter(hasFail);
  const okJ = closed.filter(j => !hasFail(j));
  const stopsLeft = open.reduce((a, j) => a + j.remaining, 0);
  const tab = listTab || (open.length || !closed.length ? 'open' : failJ.length ? 'fail' : 'ok');
  const shown = tab === 'fail' ? failJ : okJ;
  if (tab !== 'open') sorting = false;

  app.innerHTML = `
<div class="driver-card" style="margin-top:14px">
  <div class="driver-hero">
    <div class="row between" style="align-items:flex-start">
      <div>
        ${roleChip()}
        <h2 style="margin-top:6px;font-size:21px">${ASSIST ? 'ไปกับ ' : STAFF ? 'งานของ ' : ''}${esc(driverName(d))}</h2>
      </div>
      ${TOKEN
        ? `<span class="pill" data-tone="ware">คนขับภายนอก</span>`
        : STAFF
        ? `<button class="btn btn-sm" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2)" data-pick>เปลี่ยนคนขับ</button>`
        : `<button class="btn btn-sm" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2)" data-logout>ออกจากระบบ</button>`}
    </div>
    <!-- กระดานสรุปงานที่เหลือ — ตัวเลขใหญ่ เห็นแวบเดียวรู้ว่าเหลืออะไร · เหลือ 0 = จางลง -->
    <div class="drv-kpis">
      ${d.plate || d.truck ? `
      <div class="drv-kpi drv-kpi-plate" title="ทะเบียนรถ">
        <span class="drv-kpi-ic">${ICON.plate}</span>
        <span class="drv-kpi-tx"><span class="drv-kpi-l">ทะเบียนรถ</span><span><b>${esc(d.plate || '—')}</b>${d.truck ? ` <small>${esc(d.truck)}</small>` : ''}</span></span>
      </div>` : ''}
      <div class="drv-kpi${open.length ? '' : ' is-zero'}">
        <span class="drv-kpi-ic">${ICON.truck}</span>
        <span class="drv-kpi-tx"><span class="drv-kpi-l">เที่ยวค้าง</span><span><b>${fmtNum(open.length)}</b> <small>เที่ยว</small></span></span>
      </div>
      <div class="drv-kpi is-hot${stopsLeft ? '' : ' is-zero'}">
        <span class="drv-kpi-ic">${ICON.pin}</span>
        <span class="drv-kpi-tx"><span class="drv-kpi-l">จุดต้องส่ง</span><span><b>${fmtNum(stopsLeft)}</b> <small>จุด</small></span></span>
      </div>
    </div>
  </div>

  <div class="drv-list-body" style="padding:14px;background:var(--bg)">
    ${whPendingBox()}
    ${ASSIST && isBillCollector(d) ? (() => {
      const wait = listShipments({ status: S.DELIVERED }).filter(x => inCollectRange(x) && !x.invoiceReturn && !x.billIn).length;
      return `<button type="button" class="btn btn-accent btn-block" data-collectopen style="min-height:56px;font-size:18px;margin-bottom:10px">📦 รวบรวมคืนบิล${wait ? ` · ยังไม่ได้ใบ ${fmtNum(wait)} บิล` : ''}</button>`; })() : ''}
    <button type="button" class="btn btn-ghost btn-block drv-payreport" data-payreport>🧾 รีพอร์ตค่ารอบ · ปริ้นให้ฝ่ายบัญชี</button>
    ${drvTabs('list', tab, [['open', 'รอส่ง', open.length], ['ok', 'ส่งสำเร็จ', okJ.length], ['fail', 'ส่งไม่สำเร็จ', failJ.length]])}
    ${tab !== 'open' ? (shown.length ? `
      <p class="drv-hint">${tab === 'fail' ? 'เที่ยวที่มีจุดส่งไม่สำเร็จ — แตะเพื่อดูว่าจุดไหน' : 'แตะเที่ยวเพื่อดูหลักฐานแต่ละจุด'}</p>
      <div class="drv-jobs">${shown.map(tripCard).join('')}</div>` : `
      <div class="empty"><p class="small">${tab === 'fail' ? 'ไม่มีเที่ยวที่ส่งไม่สำเร็จ' : 'ยังไม่มีเที่ยวที่ส่งสำเร็จครบ'}</p></div>`)
    : open.length ? `
      ${sortBar('trips', open.length)}
      ${sorting ? sortList('trips', open.map(j => ({ id: j.id, name: `เที่ยว ${j.code}`, sub: `${fmtNum(j.stops)} จุดส่ง · เหลือ ${fmtNum(j.remaining)} จุด` })))
        : `<p class="drv-hint">👇 แตะเที่ยวด้านล่าง เพื่อ${STAFF ? 'ดูงาน' : 'เริ่มงาน'}</p>
      <div class="drv-jobs">${open.map(tripCard).join('')}</div>`}` : `
      <div class="empty"><div class="empty-mark">✅</div><p class="small">ยังไม่มีงาน — รอทีมคลังส่งงานให้</p></div>`}
    ${STAFF ? '' : helpCall()}
  </div>
</div>`;
}

/* ---------- รอคืนเข้าคลัง (บิลส่งไม่สำเร็จที่ยังไม่ได้ถ่ายรูปคืนคลัง) ----------
   รวมทุกเที่ยวของฉัน ไม่จำกัดวันที่ — เที่ยวปิดไปหลายวันแล้วก็ยังหาเจอ กดคืนได้จากตรงนี้เลย */
function whPending(){
  return listJobs({ driverId: me }).flatMap(j => jobStops(j.id).filter(needsWhReturn).map(x => ({ x, j })));
}
function whPendingBox(){
  if (STAFF) return '';
  const list = whPending();
  if (!list.length) return '';
  return `
<div class="wh-pending">
  <p class="wh-pending-h">📦 รอคืนเข้าคลัง ${fmtNum(list.length)} บิล <span class="tiny">ถ่ายรูปของตอนถึงคลัง (≥ 2 รูป)</span></p>
  ${list.map(({ x, j }) => `
  <div class="wh-pending-row">
    <span class="grow" style="min-width:0">
      <span class="strong" style="display:block">${esc(x.dropoff?.name || '')}</span>
      <span class="tiny dim">บิล ${esc(x.invoice?.number || x.code)} · เที่ยว ${esc(j.code)} · ${esc(fmtDate(String((x.events || []).filter(e => e.status === S.DELIVERED).at(-1)?.at || '').slice(0, 10)))}</span>
      ${failTag(x)}
    </span>
    <button type="button" class="btn btn-accent btn-sm" data-whreturn="${x.id}">📦 คืนเข้าคลัง</button>
  </div>`).join('')}
</div>`;
}
/** บิลส่งไม่สำเร็จร้านเดียวกันที่อยู่สถานะเดียวกัน (ยังไม่คืน / คืนแล้ว) — คืนพร้อมกันทีเดียว */
function whBills(x){
  const due = needsWhReturn(x);
  return shopBills(x, x.jobId).filter(b => canWhReturn(b) && needsWhReturn(b) === due && (due || b.id === x.id));
}
const whBy = () => ({ byRole: ROLE, byName: actorName(getDriver(me)), byId: me || '' });

/** หมายเหตุจากทีมคลัง (ops.js setJobNote) — กล่องเด่น ตัวใหญ่ คนขับต้องเห็นก่อนออกรถ
 *  แตะแล้วเปิดหน้าต่างตัวใหญ่ (noteDialog) — คัดลอกข้อความ/เบอร์โทรไปวางในแอปอื่นได้ */
const noteBox = (j) => j.note ? `
<div class="drv-note" data-jobnote="${j.id}" role="button" tabindex="0">
  <span class="drv-note-tx">📝 ${esc(j.note)}</span>
  <span class="drv-note-more">แตะเพื่อดูเต็ม · คัดลอก${phonesIn(j.note).length ? 'เบอร์' : 'ข้อความ'} →</span>
</div>` : '';

/* เบอร์โทรไทยในข้อความ — 08x-xxx-xxxx · 02 xxx xxxx · +66 8x xxx xxxx (มีขีด/เว้นวรรคได้) */
const PHONE_RE = /(?:\+66[\s-]?|0)\d(?:[\s-]?\d){7,8}(?!\d)/g;
const phonesIn = (t) => [...new Set((String(t || '').match(PHONE_RE) || [])
  .map(p => p.replace(/[\s-]/g, '').replace(/^\+66/, '0')))];
/* fmtPhone / copyText ย้ายไป ui.js แล้ว (ใช้ร่วมกับหน้าต่างเบอร์โทร phoneDialog) */

function noteDialog(j){
  const phones = phonesIn(j.note);
  modal({
    title: '📝 หมายเหตุจากทีมคลัง',
    reopen: { name:'note', args:{ jobId: j.id } },
    body: `
<p class="tiny dim">เที่ยว <span class="code">${esc(j.code)}</span></p>
<div class="drv-note-full">${esc(j.note)}</div>
${phones.length ? `
<p class="label" style="margin-top:18px">เบอร์โทรในหมายเหตุ</p>
${phones.map(p => `
<div class="drv-phone">
  <span class="drv-phone-no">${esc(fmtPhone(p))}</span>
  <span class="row gap-8">
    <button type="button" class="btn btn-accent" data-copyphone="${esc(p)}">📋 คัดลอก</button>
    <a class="btn btn-ghost" href="tel:${esc(p)}" data-tel-direct>📞 โทร</a>
  </span>
</div>`).join('')}` : ''}`,
    foot: `<button class="btn btn-ghost" data-copynote>📋 คัดลอกข้อความทั้งหมด</button>
           <button class="btn btn-accent" data-close>ปิด</button>`,
    onMount(root){
      on(root, 'click', '[data-copyphone]', (e, b) => copyText(b.dataset.copyphone, `เบอร์ ${fmtPhone(b.dataset.copyphone)}`));
      root.querySelector('[data-copynote]').onclick = () => copyText(j.note, 'ข้อความ');
    },
  });
}

/** เที่ยวหลายคนขับ — ใครกดถึงขั้นไหนแล้ว (รับเข้าคลัง / ขึ้นรถ / ออกจากคลัง) แต่ละคนกดของตัวเอง ไม่ต้องรอกัน */
function crewBoard(j){
  const ids = (j.driverIds || []).filter(id => getDriver(id));
  if (ids.length < 2 || !isOpen(j.status)) return '';
  return `
<div class="crew-board">
  <p class="crew-board-h">แต่ละคนกดยืนยันขั้นของตัวเอง · ใครมาถึงก่อนไปก่อนได้เลย</p>
  ${ids.map(id => {
    const st = crewStep(j, id);
    const at = st === S.NEW ? '' : crewStepAt(j, id, st);
    return `
  <div class="crew-row${id === me ? ' is-me' : ''}">
    <span class="grow">${id === me ? '<b>คุณ</b> · ' : ''}${esc(driverName(getDriver(id)))}</span>
    <span class="crew-st" data-st="${st}">${st === S.NEW ? 'ยังไม่ได้รับเข้าคลัง' : esc(META[st].label)}${at ? ` · ${esc(fmtDateTime(at))}` : ''}</span>
  </div>`;
  }).join('')}
</div>`;
}

/** เพื่อนร่วมเที่ยว — บอกให้รู้ว่าไม่ได้วิ่งคนเดียว จะได้ไม่ปิดจุดซ้ำกัน */
function mates(j){
  const others = (j.driverIds || []).filter(id => id !== me).map(id => getDriver(id)).filter(Boolean);
  if (!others.length) return '';
  return `<div class="tiny" style="color:var(--amber-dim);margin-top:3px">วิ่งร่วมกับ ${esc(others.map(d => driverName(d)).join(' · '))}</div>`;
}

/* แถวเที่ยวในหน้าแรก (31 ต.ค.: ผู้ใช้ขอเปลี่ยนจากการ์ดเป็นแถวแบบหน้าจัดลำดับ + เลข 1 2 3 นำหน้า)
   ข้อมูลข้างในเท่าเดิมทุกอย่าง แค่ย้ายไปอยู่ขวาวงเลข · เลขตามลำดับที่แสดง (ลำดับที่คนขับจัดไว้) */
function tripCard(j, i){
  const next = nextOf(myStatus(j));
  const pct = j.live ? Math.round(j.delivered / j.live * 100) : 0;
  return `
<div class="job-card trip-row" data-trip="${j.id}" data-active="${isOpen(j.status) ? 1 : 0}" style="margin-bottom:10px">
  <span class="stop-n">${i + 1}</span>
  <div class="trip-row-body">
  <div class="row between gap-8">
    <span class="code">เที่ยว ${esc(j.code)}</span>
    ${drvPill(myStatus(j))}
  </div>
  <div style="margin-top:10px">
    ${j.rtOpen ? `<span class="rt-tag">⚡ มีงานด่วน ${fmtNum(j.rtOpen)} จุด</span>` : ''}
    <div class="strong" style="font-size:17px">${fmtNum(j.stops)} จุดส่ง · ${fmtNum(j.dests)} ปลายทาง</div>
    <div class="tiny dim">${esc(j.vehicle || '')} · ${fmtNum(Math.round(j.weightKg))} กก.</div>
    ${mates(j)}
    ${noteBox(j)}
  </div>
  ${j.stops ? `
  <div class="tripbar" style="margin-top:10px"><i style="width:${pct}%"></i></div>
  <div class="tiny dim" style="margin-top:4px">ส่งแล้ว ${fmtNum(j.delivered)}/${fmtNum(j.live)} จุด${j.cancelled ? ` · ยกเลิก ${fmtNum(j.cancelled)} จุด` : ''}${(() => { const n = jobStops(j.id).filter(failed).length;
    return n ? ` · <b style="color:var(--red)">ส่งไม่สำเร็จ ${fmtNum(n)} จุด</b>` : ''; })()}</div>
  ${EXTRAS ? paidLine(j) : ''}` : ''}
  <div class="row between gap-8" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
    <span class="tiny dim">${esc(ago(j.updatedAt))}</span>
    ${next && next !== S.DELIVERED
      ? `<span class="tiny strong" style="color:var(--amber-dim)">ถัดไป: ${esc(META[next].short)} →</span>`
      : (isOpen(j.status) ? `<span class="tiny strong" style="color:var(--amber-dim)">เหลือส่ง ${fmtNum(j.remaining)} จุด →</span>` : '')}
  </div>
  </div>
</div>`;
}

/* ---------- ใบงานของเที่ยว --------------------------------- */
function tripView(id){
  const j = getJob(id);
  if (!j || !hasDriver(j, me)){ toast('ไม่พบเที่ยวนี้ในรายการของคุณ', 'err'); return go({ name:'list' }); }
  const next = nextOf(myStatus(j));
  const canDeliver = !STAFF && FLOW.indexOf(myStatus(j)) >= FLOW.indexOf(S.DEPARTED);
  /* 3 แท็บ: รอส่ง · ส่งสำเร็จ · ส่งไม่สำเร็จ — แยกรายบิล ร้านหลายบิลที่ผลปนกันขึ้นได้หลายแท็บ
     แต่ละแท็บเห็นเฉพาะบิลของแท็บนั้น · บิลที่ออฟฟิศยกเลิกไม่อยู่แท็บไหน */
  const scope = `trip:${j.id}`;
  const groups = stopGroups(j.stopList);
  const part = (f) => groups.map(g => ({ ...g, stops: g.stops.filter(f) })).filter(g => g.stops.length);
  const todo = byOrder(part(x => liveStops([x]).length), g => g.key, scope, g => rtLive(g.stops));
  const okG = part(x => x.status === S.DELIVERED && !failed(x));
  const failG = part(failed);
  const tab = tripTab || (todo.length ? 'todo' : failG.length ? 'fail' : 'ok');
  const doneG = tab === 'fail' ? failG : okG;
  if (tab !== 'todo') sorting = false;
  const row = (g, i) => g.stops.length > 1 ? groupRow(g, i, canDeliver) : stopRow(g.stops[0], i, canDeliver);
  findTabs = [['todo', 'รอส่ง', todo], ['ok', 'ส่งสำเร็จ', okG], ['fail', 'ส่งไม่สำเร็จ', failG]]
    .map(([k, label, gs]) => ({ k, label, hay: gs.map(g => hayOf(g.stops)) }));
  findCur = tab;
  const typing = document.activeElement?.matches?.('[data-findq]') ? document.activeElement.selectionStart : null;

  app.innerHTML = `
<div style="margin:14px 0">
  <button class="btn" style="background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.2);font-size:20px;font-weight:600;padding:12px 24px;min-height:52px;gap:6px;padding-left:16px" data-back aria-label="กลับไปรายการเที่ยว"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>กลับ</button>
</div>
<div class="driver-card">
  <div class="driver-hero">
    ${roleChip()}
    <div class="row between gap-8" style="align-items:center;flex-wrap:wrap;row-gap:10px;margin-top:10px">
      <span class="dhero-code" title="เลขเที่ยว">${ICON.ticket}${esc(j.code)}</span>
      ${drvPill(myStatus(j))}
    </div>
    <div class="dhero-stats">
      <div class="dhero-stat" title="จำนวนจุดส่ง">${ICON.pin}<b>${fmtNum(j.stops)}</b><span>จุด</span></div>
      <div class="dhero-stat" title="น้ำหนักรวม">${ICON.weight}<b>${fmtNum(Math.round(j.weightKg))}</b><span>กก.</span></div>
    </div>
    ${j.vehicle ? `<p class="dhero-meta" title="รถ">${ICON.truck}${esc(j.vehicle)}</p>` : ''}
    ${noteBox(j)}
    ${(() => { const o = (j.driverIds || []).filter(id => id !== me).map(id => getDriver(id)).filter(Boolean);
       return o.length ? `<p class="dhero-meta" style="color:var(--amber)" title="วิ่งร่วมกับ">${ICON.people}${esc(o.map(d => driverName(d)).join(' · '))}</p>` : ''; })()}
    ${crewBoard(j)}
  </div>

  <div class="drv-trip-body" style="padding:16px">
    ${drvFlow(j)}

    <div class="drv-trip">
    <div class="drv-main">
    ${payView(j)}

    <hr class="divider" style="margin:18px 0">
    <h4 style="margin-bottom:6px">จุดส่ง ${fmtNum(j.stops)} จุด</h4>
    <p class="drv-hint" style="margin-bottom:12px">
      ${STAFF ? 'ดูอย่างเดียว — ปุ่มยืนยันเป็นของคนขับ'
        : ASSIST ? '👇 แต่ละจุดมี 3 ปุ่ม: ชำระเงิน · คืนเลขที่บิล · ใบส่งของ'
        : canDeliver ? '👇 แตะชื่อจุดที่จะส่ง → ถ่ายรูป → ให้ผู้รับเซ็น · ปุ่มใต้แต่ละจุด: ชำระเงิน · คืนเลขที่บิล · ใบส่งของ'
        : `กดปุ่ม "${esc(META[S.DEPARTED].label)}" ด้านล่างก่อน แล้วจึงส่งของได้ · บันทึกการชำระเงินได้ทุกเมื่อ`}
    </p>
    ${EXTRAS ? tripTools(j) : ''}
    ${findBox()}
    ${drvTabs('trip', tab, [['todo', 'รอส่ง', todo.length], ['ok', 'ส่งสำเร็จ', okG.length], ['fail', 'ส่งไม่สำเร็จ', failG.length]])}
    ${tab !== 'todo'
      ? (doneG.length ? `<p class="drv-hint">แตะ “ดูหลักฐาน” เพื่อเช็คว่าทำครบไหม (รูป · ลายเซ็น · เลขที่บิล · ตำแหน่ง)</p>
         ${doneG.map((g, i) => `<div class="drv-done-item" data-hay="${esc(hayOf(g.stops))}">${row(g, i)}${proofBtn(g.stops)}</div>`).join('')}`
         : `<div class="empty"><p class="small">${tab === 'fail' ? 'ไม่มีจุดที่ส่งไม่สำเร็จ' : 'ยังไม่มีจุดที่ส่งสำเร็จ'}</p></div>`)
      : todo.length ? `${sortBar(scope, todo.length)}
         ${sorting ? sortList(scope, todo.map(g => ({ id: g.key, name: g.stops[0].dropoff.name,
             sub: `${g.stops.length > 1 ? `${fmtNum(g.stops.length)} บิล · ` : ''}${g.stops[0].dropoff.address || ''}` })))
           : todo.map((g, i) => `<div data-hay="${esc(hayOf(g.stops))}">${row(g, i)}${g.stops.length === 1 ? preBtn(g.stops[0]) : ''}</div>`).join('')}`
      : '<div class="empty"><div class="empty-mark">✅</div><p class="small">ไม่มีจุดรอส่งแล้ว — ดูผลในแท็บ “ส่งสำเร็จ” / “ส่งไม่สำเร็จ”</p></div>'}
    </div>

    <div class="drv-side">
    <hr class="divider" style="margin:18px 0">
    <h4 style="margin-bottom:12px">ประวัติเที่ยวนี้</h4>
    ${timeline(j, { audience:'driver' })}
    ${STAFF ? '' : helpCall()}
    </div>
    </div>
  </div>
</div>

${STAFF ? '' : next && next !== S.DELIVERED ? `
<div class="action-bar">
  <div class="inner">
    <button class="confirm-btn" data-jnext="${next}" data-tone="${TONE[next] || 'amber'}">
      <span class="n">${FLOW.indexOf(next) + 1}</span>
      <span class="grow">
        ${esc(META[next].verb)}
        <small>${esc(META[next].desc)}</small>
      </span>
      <span style="font-size:20px">→</span>
    </button>
  </div>
</div>` : (isOpen(j.status) ? `
<div class="action-bar">
  <div class="inner" style="text-align:center">
    <p class="small strong" style="color:var(--amber-dim)">เหลือส่ง ${fmtNum(j.remaining)} จุด</p>
    <p class="tiny dim">แตะจุดด้านบน ส่งทีละจุด</p>
  </div>
</div>` : `
<div class="action-bar">
  <div class="inner" style="text-align:center">
    <p class="small strong" style="color:var(--green)">✓ เที่ยวนี้ส่งครบแล้ว</p>
    <p class="tiny dim">${esc(fmtDateTime(j.updatedAt))}</p>
  </div>
</div>`)}`;
  applyFind();
  if (typing !== null){
    const q = app.querySelector('[data-findq]');
    if (q){ q.focus(); try{ q.setSelectionRange(typing, typing); }catch{} }
  }
}

/* ---------- ค้นหาบิลในเที่ยว + หาบิลไม่เจอ (28 ต.ค.) ----------
   เลขบิลซ้ำในไฟล์ลูกค้า → บางจุดค้างเป็นเลข 5 คนขับถือใบเลข 8 หาไม่เจอ
   ค้นได้ทั้งเลขบิล · เลข Delivery · เลขเก่า · ชื่อร้าน · เลขที่เคยแจ้ง — กรองแถวที่วาดไว้แล้ว ไม่วาดหน้าใหม่ (คีย์บอร์ดไม่หุบ)
   ยังไม่เจออีก → "หาบิลไม่เจอ?" เลือกร้าน + พิมพ์เลขบนใบในมือ → แจ้งออฟฟิศ แล้วส่งของต่อได้เลย */
let findQ = '', findTabs = [], findCur = 'todo';
const norm = (v) => String(v ?? '').toLowerCase().replace(/[\s-]/g, '');
function hayOf(stops){
  return stops.flatMap(x => [x.code, x.invoice?.number, x.delivery, x.baseCode, ...(x.altCodes || []),
    x.dropoff?.name, ...(x.events || []).filter(e => e.billNo).map(e => e.billNo)])
    .filter(Boolean).map(norm).join(' ');
}
const findBox = () => `
<div class="drv-find">
  <input class="input" type="search" data-findq value="${esc(findQ)}" placeholder="🔎 ค้นหาเลขบิล / Delivery / ชื่อร้าน" aria-label="ค้นหาบิลในเที่ยวนี้" autocomplete="off">
  ${STAFF ? '' : '<button type="button" class="btn btn-ghost" data-lostbill>หาบิลไม่เจอ?</button>'}
</div>
<p class="drv-find-note" data-findnote hidden></p>`;
function applyFind(){
  const q = norm(findQ);
  const rows = [...app.querySelectorAll('[data-hay]')];
  let shown = 0;
  rows.forEach(r => { const hit = !q || r.dataset.hay.includes(q); r.hidden = !hit; if (hit) shown++; });
  const note = app.querySelector('[data-findnote]');
  if (!note) return;
  if (!q || shown){ note.hidden = !q; note.textContent = q ? `เจอ ${fmtNum(shown)} รายการ` : ''; return; }
  const other = findTabs.find(t => t.k !== findCur && t.hay.some(h => h.includes(q)));
  note.hidden = false;
  note.innerHTML = other
    ? `ไม่เจอในแท็บนี้ · เจอในแท็บ “${esc(other.label)}” <button type="button" class="linkish" data-findtab="${other.k}">ไปดู →</button>`
    : `ไม่เจอเลขนี้ในเที่ยว — ลองค้นด้วยชื่อร้าน${STAFF ? '' : ' หรือกด “หาบิลไม่เจอ?”'}`;
}

function lostBillDialog(j){
  const live = liveStops(j.stopList);
  if (!live.length) return toast('เที่ยวนี้ไม่มีจุดรอส่งแล้ว', 'warn');
  if (FLOW.indexOf(myStatus(j)) < FLOW.indexOf(S.DEPARTED)){
    return toast(`กด “${META[nextOf(myStatus(j))]?.verb || 'ยืนยันขั้นของเที่ยว'}” ของคุณก่อน แล้วจึงส่งของได้`, 'warn', 4500);
  }
  const typed = /\d{4,}/.test(findQ) ? findQ.replace(/[^0-9A-Za-z-]/g, '') : '';
  modal({
    title: 'หาบิลในแอปไม่เจอ',
    draftKey: `lostbill:${j.id}`,
    body: `
<p class="small">เลือกบิลที่คุณกำลังจะส่ง แล้วพิมพ์เลขบิลจากใบที่อยู่ในมือ — ระบบจะแจ้งออฟฟิศให้แก้เลข <b>คุณส่งของต่อได้เลย</b></p>
<label class="field" style="margin-top:14px">
  <span class="label">เลขบิลบนใบในมือ<span class="req">*</span></span>
  <input class="input mono" data-billno inputmode="numeric" autocomplete="off" value="${esc(typed)}" placeholder="เช่น 8xxxxxxxxx" style="font-size:20px">
</label>
<p class="label" style="margin-top:14px">บิลนี้คือบิลไหน<span class="req">*</span> <span class="hint">(เทียบชื่อร้าน / น้ำหนัก)</span></p>
<div data-lbpick>
${live.map(x => `
<label class="drv-pick">
  <input type="radio" name="lostbill" value="${x.id}">
  <span class="grow" style="min-width:0">
    <span class="strong" style="display:block">${esc(x.dropoff?.name || '')}</span>
    <span class="tiny dim">ในระบบ ${esc(x.code)}${x.delivery && x.delivery !== x.code ? ` · Delivery ${esc(x.delivery)}` : ''} · ${fmtNum(Math.round(x.cargo?.weightKg || 0))} กก.</span>
    ${dupOf(x) ? `<span class="dup-tag">⚠ เลขบิล ${esc(dupOf(x).no)} ซ้ำ</span>` : ''}
  </span>
</label>`).join('')}
</div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>แจ้งออฟฟิศ แล้วไปส่งของ →</button>`,
    onMount(root){
      root.querySelector('[data-ok]').onclick = () => {
        const no = root.querySelector('[data-billno]').value.trim();
        const id = root.querySelector('input[name="lostbill"]:checked')?.value;
        if (!/^[0-9A-Za-z-]{4,}$/.test(no)) return toast('พิมพ์เลขบิลจากใบในมือให้ครบก่อน', 'warn', 4000);
        if (!id) return toast('เลือกบิลที่คุณกำลังจะส่งก่อน', 'warn', 4000);
        try{
          reportBillNo(id, no, { byRole: ROLE, byName: actorName(getDriver(me)), byId: me || '' });
        }catch(err){ return toast(err.message, 'err'); }
        close();
        findQ = '';
        toast('แจ้งออฟฟิศแล้ว — ส่งของต่อได้เลย', 'ok');
        const x = getShipment(id);
        if (x) deliverFor(x, j.id);
      };
    },
  });
}

/** ค่ารอบ — คนขับเห็นเฉพาะของตัวเอง ไม่เห็นของเพื่อนร่วมเที่ยว
    ทีมคลังเป็นคนกรอก คนขับแก้ไม่ได้ */
function payView(j){
  const pay = getJobPay(j.id);
  const rows = payRowsOf(pay, me);
  const mine = payTotalFor(pay, me);

  /* ข้อมูลเก่าที่ยังไม่ได้แยกรายคน — เที่ยวที่มีคนขับคนเดียวถือว่าเป็นของเขา */
  const legacy = Number(pay.base) > 0 || (pay.items || []).length;
  const alone = (j.driverIds || []).length === 1 && (j.driverIds || [])[0] === me;
  const showLegacy = legacy && alone && !rows.length;

  if (!mine && !showLegacy) return '';

  const list = showLegacy
    ? [ ...(Number(pay.base) > 0 ? [{ amount: pay.base, note: 'ค่ารอบ' }] : []), ...(pay.items || []) ]
    : rows;
  const total = showLegacy ? payTotal({ base: pay.base, items: pay.items }) : mine;

  return `
    <hr class="divider" style="margin:18px 0">
    <h4 style="margin-bottom:6px">ค่ารอบของคุณ</h4>
    <p class="tiny dim" style="margin-bottom:10px">ยอดไม่ตรง โทรแจ้งทีมคลัง</p>
    <div class="pay-view">
      ${list.map(x => `
        <div class="r"><span>${esc(x.note || 'ค่ารอบ')}</span><span class="tnum">${esc(fmtBaht(x.amount))}</span></div>`).join('')}
      <div class="r sum"><span>รวมรอบนี้</span><span class="tnum">${esc(fmtBaht(total))}</span></div>
    </div>`;
}

/* ร้านเดียวกันหลายบิล — แถวเดียว แตะเพื่อกางดูทีละบิล · ส่งของทีเดียวทั้งร้าน (ถ่ายสินค้าครั้งเดียว ใบ Invoice ทีละบิล)
   จำว่ากางกลุ่มไหนไว้ด้วยรหัสจุดแรกของกลุ่ม วาดหน้าใหม่แล้วยังกางอยู่ */
const openGroups = new Set();
const liveStops = (stops) => stops.filter(x => x.status !== S.DELIVERED && x.status !== S.CANCELLED);

/* ---------- จัดลำดับการ์ดเอง (เที่ยว / ปลายทางในเที่ยว) — เก็บในเครื่องนี้ แยกตามคนขับ ----------
   ไม่เขียนลงฐานข้อมูล: เพื่อนร่วมเที่ยวกับออฟฟิศยังเห็นลำดับเดิม · ล้างข้อมูลเว็บ = กลับลำดับเดิม
   งานที่ยังไม่เคยจัด (งานใหม่) ต่อท้าย — ยกเว้นงานด่วนที่ยังไม่ได้จัด ขึ้นบนสุดเหมือนเดิม */
let sorting = false;
const orderKey = () => `ft.driver.order.${me}`;
function loadOrder(){
  try{ return JSON.parse(localStorage.getItem(orderKey()) || '{}') || {}; }catch{ return {}; }
}
function byOrder(list, idOf, scope, urgent = () => false){
  const pos = new Map((loadOrder()[scope] || []).map((id, i) => [id, i]));
  return list.map((v, i) => ({ v, i, p: pos.has(idOf(v)) ? pos.get(idOf(v)) : urgent(v) ? -1 : Infinity }))
    .sort((a, b) => a.p - b.p || a.i - b.i).map(o => o.v);
}
function saveOrder(scope, ids){
  const o = loadOrder();
  o[scope] = ids;
  /* เที่ยวที่จบแล้วไม่ต้องจำ — กันที่เก็บโตไม่สิ้นสุด */
  for (const k2 of Object.keys(o)) if (k2.startsWith('trip:') && !getJob(k2.slice(5))) delete o[k2];
  try{ localStorage.setItem(orderKey(), JSON.stringify(o)); }catch{}
}
const sortBar = (scope, n) => STAFF || n < 2 ? '' : `
<div class="drv-sortbar">
  ${sorting ? '<span class="tiny dim">กดค้างที่การ์ด แล้วลากไปวางตำแหน่งใหม่ · จำไว้ในเครื่องนี้</span>' : '<span></span>'}
  <button type="button" class="btn btn-sm ${sorting ? 'btn-accent' : 'btn-ghost'}" data-sorting>${sorting ? '✓ เสร็จ' : '↕ จัดลำดับ'}</button>
</div>`;
const sortList = (scope, items) => `
<ol class="drv-sortlist" data-scope="${esc(scope)}">
  ${items.map((it, i) => `
  <li data-id="${esc(it.id)}">
    <span class="stop-n">${i + 1}</span>
    <span class="grow" style="min-width:0">
      <span class="strong" style="display:block">${esc(it.name)}</span>
      <span class="tiny dim trunc" style="display:block">${esc(it.sub || '')}</span>
    </span>
    <span class="drv-grip" aria-hidden="true">⠿</span>
  </li>`).join('')}
</ol>`;

/* ---------- ลากเรียง: กดค้างแล้วลาก (นิ้ว / เมาส์) ----------
   กดค้าง 0.3 วิ (เมาส์ 0.15) การ์ดยกขึ้น แล้วลากไปวาง · ขยับนิ้วก่อนครบเวลา = เลื่อนหน้าตามปกติ ไม่นับเป็นการลาก
   ระหว่างลากสลับการ์ดใน DOM เลย (ผ่านกึ่งกลางการ์ดข้าง ๆ = สลับ) · ปล่อยนิ้ว = จำลำดับใหม่แล้ววาดหน้าใหม่ */
let drag = null;
const HOLD_MS = { mouse:150, touch:300, pen:300 };
app.addEventListener('pointerdown', (e) => {
  const li = e.target.closest('.drv-sortlist li[data-id]');
  if (!li || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const st = { li, ol: li.parentElement, pid: e.pointerId, x0: e.clientX, y0: e.clientY, py: e.pageY, on: false };
  st.timer = setTimeout(() => {
    st.on = true;
    st.base = st.py;                               /* ตำแหน่งนิ้ว (page) ที่ตรงกับการ์ดตอนไม่เลื่อน */
    li.classList.add('is-drag');
    st.ol.classList.add('is-sorting');
    navigator.vibrate?.(15);
    try{ li.setPointerCapture(st.pid); }catch{}
  }, HOLD_MS[e.pointerType] || 300);
  drag = st;
});
addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.on){
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 8){ clearTimeout(drag.timer); drag = null; }
    else drag.py = e.pageY;
    return;
  }
  e.preventDefault();
  /* ลากเข้าใกล้ขอบจอ = เลื่อนหน้าตาม */
  if (e.clientY < 70) scrollBy(0, -14); else if (e.clientY > innerHeight - 70) scrollBy(0, 14);
  const { li, ol } = drag;
  const y = e.pageY;
  const shift = () => { li.style.transform = `translateY(${y - drag.base}px)`; };
  shift();
  for (;;){
    const r = li.getBoundingClientRect(), mid = r.top + r.height / 2;
    const prev = li.previousElementSibling, next = li.nextElementSibling;
    const before = li.offsetTop;
    if (next && mid > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) ol.insertBefore(next, li);
    else if (prev && mid < prev.getBoundingClientRect().top + prev.getBoundingClientRect().height / 2) ol.insertBefore(li, prev);
    else break;
    drag.base += li.offsetTop - before;            /* ตำแหน่งจริงของการ์ดขยับ — ชดเชยให้ยังอยู่ใต้นิ้ว */
    shift();
  }
});
/* นิ้วค้างแล้วลาก — ห้ามหน้าเลื่อนแทน (ต้องเป็น listener แบบ passive:false) */
addEventListener('touchmove', (e) => { if (drag?.on) e.preventDefault(); }, { passive:false });
function endDrag(e){
  if (!drag || (e && e.pointerId !== drag.pid)) return;
  clearTimeout(drag.timer);
  const st = drag;
  drag = null;
  if (!st.on) return;
  st.li.classList.remove('is-drag');
  st.li.style.transform = '';
  st.ol.classList.remove('is-sorting');
  saveOrder(st.ol.dataset.scope, [...st.ol.querySelectorAll('li[data-id]')].map(v => v.dataset.id));
  render();
}
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

/* ---------- แท็บ ค้าง / เสร็จแล้ว ---------- */
let listTab = null, tripTab = null;   /* null = เลือกให้เอง (มีงานรอส่ง → รอส่ง · ไม่มี → ส่งไม่สำเร็จถ้ามี ไม่งั้นส่งสำเร็จ) */
const drvTabs = (where, cur, tabs) => `
<div class="drv-tabs" role="tablist">
  ${tabs.map(([k, label, n]) => `
  <button type="button" role="tab" aria-selected="${k === cur}" data-tab="${where}:${k}"${k === 'fail' && n ? ' data-fail' : ''}>${label} <b>${fmtNum(n)}</b></button>`).join('')}
</div>`;

/* ---------- หลักฐานของจุดที่ส่งแล้ว — เช็คว่าทำครบไหม ---------- */
const proofBtn = (stops) => {
  const sent = stops.filter(x => x.status === S.DELIVERED);
  if (!sent.length) return '';
  const add = STAFF ? [] : sent.filter(canAddPhotos);
  return `<div class="drv-proof-acts">
    <button type="button" class="btn btn-ghost btn-sm drv-proof-btn" data-proof="${sent[0].id}">🔍 ดูหลักฐาน${sent.length > 1 ? ` ${fmtNum(sent.length)} บิล` : ''}</button>
    ${add.length ? `<button type="button" class="btn btn-ghost btn-sm drv-proof-btn" data-addphoto="${add[0].id}" data-many="${sent.length > 1 ? 1 : ''}">📷 เพิ่มรูป</button>` : ''}
    ${(() => { if (STAFF) return '';
      const due = sent.filter(needsWhReturn), more = sent.filter(x => canWhReturn(x) && whReturnOf(x));
      return due.length ? `<button type="button" class="btn btn-accent btn-sm drv-proof-btn" data-whreturn="${due[0].id}">📦 คืนของเข้าคลัง${due.length > 1 ? ` ${fmtNum(due.length)} บิล` : ''}</button>`
        : more.length ? `<button type="button" class="btn btn-ghost btn-sm drv-proof-btn" data-whreturn="${more[0].id}">📦 เพิ่มรูปคืนคลัง</button>` : ''; })()}
  </div>`;
};
function proofDialog(x, jobId){
  const bills = shopBills(x, jobId).filter(b => b.status === S.DELIVERED);
  const mark = (ok, label, extra = '') => `<li data-ok="${ok ? 1 : 0}">${ok ? '✓' : '✕'} ${label}${extra ? ` <span class="dim">${extra}</span>` : ''}</li>`;
  const card = (b) => {
    const ev = deliveryProof(b) || {};   /* รวมรูปที่เพิ่มทีหลังแล้ว */
    const more = ev.added?.photos + ev.added?.invoicePhotos || 0;
    const o = outcomeOf(b);
    const fail = isFailOutcome(o);
    const nP = (ev.photos || []).length, nI = (ev.invoicePhotos || []).length;
    return `
<div class="drv-proof">
  <div class="row between gap-8">
    <span class="strong">บิล ${esc(b.invoice?.number || b.code)}</span>
    ${fail ? failTag(b) : '<span class="tiny strong" style="color:var(--green)">✓ ส่งเรียบร้อย</span>'}
  </div>
  <p class="tiny dim">ปิดโดย ${esc(ev.byName || '—')} · ${esc(fmtDateTime(ev.at))}</p>
  <ul class="drv-check">
    ${fail ? `
    ${mark(!!(ev.note || '').trim(), 'หมายเหตุ', esc(ev.note || ''))}
    ${mark(nP >= MIN_FAIL_PHOTOS, 'รูปหลักฐาน', `${fmtNum(nP)} รูป`)}
    ${(() => { const r = whReturnOf(b); return mark(!!r, 'คืนของเข้าคลัง', r ? `${esc(r.byName)} · ${esc(fmtDateTime(r.at))} · ${fmtNum(r.photos.length)} รูป` : 'ยังไม่คืน'); })()}` : `
    ${mark(nP >= minPhotos(S.DELIVERED), 'รูปสินค้า', `${fmtNum(nP)} รูป`)}
    ${mark(!!ev.signature, 'ลายเซ็นผู้รับ')}
    ${mark(nI >= MIN_INVOICE_PHOTOS, 'รูปเลขที่บิล', `${fmtNum(nI)} รูป`)}`}
    ${mark(!!ev.geo, 'ตำแหน่ง')}
    ${EXTRAS || ASSIST ? `
    ${mark(!!b.payment, 'ชำระเงิน', b.payment ? `${esc(b.payment.method)} ${esc(fmtBaht(b.payment.amount))}` : 'ยังไม่บันทึก')}
    ${mark(!!b.invoiceReturn, 'คืนเลขที่บิล', b.invoiceReturn ? esc(fmtDate(b.invoiceReturn.date)) : needRebill(b) ? REBILL : 'ยังไม่คืน')}` : ''}
  </ul>
  ${nP ? `<div class="photo-grid" style="margin-top:8px">${ev.photos.map(p => `<img src="${p}" alt="รูปหน้างาน" data-zoom="${p}" loading="lazy">`).join('')}</div>` : ''}
  ${ev.signature ? `<p class="tiny dim" style="margin-top:8px">ลายเซ็นผู้รับ</p><div class="photo-grid"><img src="${ev.signature}" alt="ลายเซ็นผู้รับ" data-zoom="${ev.signature}"></div>` : ''}
  ${nI ? `<p class="tiny dim" style="margin-top:8px">เลขที่บิล</p><div class="photo-grid">${ev.invoicePhotos.map(p => `<img src="${p}" alt="รูปเลขที่บิล" data-zoom="${p}" loading="lazy">`).join('')}</div>` : ''}
  ${more ? `<p class="tiny dim" style="margin-top:6px">รวมรูปที่เพิ่มทีหลัง ${fmtNum(more)} รูป</p>` : ''}
  ${whReturnOf(b)?.photos.length ? `<p class="tiny dim" style="margin-top:8px">รูปตอนคืนเข้าคลัง</p><div class="photo-grid">${whReturnOf(b).photos.map(p => `<img src="${p}" alt="รูปคืนคลัง" data-zoom="${p}" loading="lazy">`).join('')}</div>` : ''}
  ${STAFF ? '' : canAddPhotos(b)
    ? `<button type="button" class="btn btn-ghost btn-sm btn-block" style="margin-top:10px" data-addphoto="${b.id}">📷 เพิ่มรูป (รูปไม่ชัด)</button>`
    : '<p class="tiny dim" style="margin-top:8px">วางบิลแล้ว — เพิ่มรูปไม่ได้</p>'}
</div>`;
  };
  modal({
    title: `หลักฐานการส่ง · ${esc(x.dropoff.name)}`,
    reopen: { name:'proof', args:{ stopId: x.id, jobId } },
    body: bills.map(card).join(''),
    foot: '<button class="btn btn-accent" data-close>ปิด</button>',
    onMount(root){
      bindZoom(root);
      on(root, 'click', '[data-addphoto]', (e, btn) => { const b = getShipment(btn.dataset.addphoto); if (b) addPhotoDialog(b, jobId); });
    },
  });
}

/* ---------- เพิ่มรูปหลังส่ง (รูปไม่ชัด) — store.js addDeliveryPhotos ----------
   รูปเดิมดูได้อย่างเดียว ลบไม่ได้ · รูปใหม่ที่ยังไม่บันทึกกด × เอาออกได้
   รูปสินค้าใช้ร่วมกันทุกบิลที่ปิดพร้อมกัน (event ปิดจุดเวลาเดียวกัน) · รูปเลขที่บิล เข้าเฉพาะบิลนี้ */
function addPhotoDialog(b, jobId){
  const ev = deliveryProof(b);
  if (!ev || !canAddPhotos(b)) return toast('บิลนี้วางบิลแล้ว — เพิ่มรูปไม่ได้', 'warn');
  const fail = isFailOutcome(outcomeOf(b));
  const sameRound = shopBills(b, jobId).filter(v => canAddPhotos(v)
    && (v.events || []).filter(e => e.status === S.DELIVERED).at(-1)?.at === (b.events || []).filter(e => e.status === S.DELIVERED).at(-1)?.at);
  const sets = {
    cargo: { list: [], max: 900, q: 0.6, label: fail ? 'รูปหลักฐาน' : 'รูปสินค้า', had: ev.photos || [] },
    ...(fail ? {} : { inv: { list: [], max: 1600, q: 0.8, label: 'รูปเลขที่บิล', had: ev.invoicePhotos || [] } }),
  };
  const field = (k) => `
<div class="field" style="margin-top:14px">
  <span class="label">${sets[k].label}</span>
  <span class="tiny dim" style="display:block">${k === 'cargo' && sameRound.length > 1 ? `เข้าทุกบิลที่ส่งพร้อมกัน (${fmtNum(sameRound.length)} บิล)` : k === 'inv' ? `เฉพาะบิล ${esc(b.invoice?.number || b.code)}` : ''}</span>
  ${sets[k].had.length ? `<p class="tiny dim" style="margin-top:6px">รูปเดิม ${fmtNum(sets[k].had.length)} รูป · ลบไม่ได้</p>
  <div class="photo-grid drv-had">${sets[k].had.map(p => `<img src="${p}" alt="${sets[k].label}เดิม" data-zoom="${p}" loading="lazy">`).join('')}</div>` : ''}
  <div class="drv-addsrc">
    <label class="drop">
      <span class="strong">📷 ถ่ายรูป</span>
      <input type="file" accept="image/*" capture="environment" multiple hidden data-add="${k}">
    </label>
    <label class="drop">
      <span class="strong">🖼 เลือกจากคลัง</span>
      <input type="file" accept="image/*" multiple hidden data-add="${k}">
    </label>
  </div>
  <div class="photo-grid" data-new="${k}" style="margin-top:8px"></div>
</div>`;
  /* รูปใหม่ที่ยังไม่บันทึก — เซฟอัตโนมัติผ่าน ui.js (ปิดเผลอ/แอปรีเฟรช เปิดใหม่ได้รูปคืน) */
  const addHook = {};
  modal({
    title: `เพิ่มรูป · บิล ${esc(b.invoice?.number || b.code)}`,
    draftKey: `addphoto:${b.id}`,
    reopen: { name:'addphoto', args:{ stopId: b.id, jobId } },
    draft: addHook,
    body: `<p class="small">${esc(b.dropoff.name)} · รูปไม่ชัด ถ่ายเพิ่มได้ไม่จำกัดจำนวน · <strong>รูปที่ส่งไปแล้วลบไม่ได้</strong></p>
           ${Object.keys(sets).map(field).join('')}`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok disabled>บันทึกรูปเพิ่ม</button>`,
    onMount(root){
      bindZoom(root);
      const ok = root.querySelector('[data-ok]');
      const n = () => Object.values(sets).reduce((a, v) => a + v.list.length, 0);
      addHook.get = () => Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.list]));
      addHook.set = (x) => { for (const k of Object.keys(sets)){ sets[k].list = [...(x[k] || [])]; paint(k); } };
      const paint = (k) => {
        markDirty();
        root.querySelector(`[data-new="${k}"]`).innerHTML = sets[k].list.map((p, i) => `
          <span class="photo-x"><img src="${p}" alt="${sets[k].label}ใหม่ ${i + 1}"><button type="button" data-rm="${k}:${i}" aria-label="เอารูปใหม่ออก">×</button></span>`).join('');
        ok.disabled = !n();
        ok.textContent = n() ? `บันทึกรูปเพิ่ม ${fmtNum(n())} รูป` : 'บันทึกรูปเพิ่ม';
      };
      /* ช่องละ 2 ทาง: ถ่ายใหม่ (capture) หรือเลือกจากคลังรูปในเครื่อง — keepPhotos เซฟเฉพาะรูปที่เพิ่งถ่าย ไม่ซ้ำรูปในคลัง */
      for (const k of Object.keys(sets)) for (const input of root.querySelectorAll(`[data-add="${k}"]`)){
        input.addEventListener('change', async () => {
          if (!STAFF) keepPhotos(input.files, k === 'cargo' ? (fail ? 'หลักฐาน' : 'สินค้า') : 'เลขที่บิล', root.querySelector(`[data-new="${k}"]`));
          for (const f of [...input.files]){
            try{ sets[k].list.push(await shrinkImage(f, sets[k].max, sets[k].q)); }
            catch(err){ toast(err.message, 'err'); }
          }
          input.value = '';
          paint(k);
        });
      }
      /* × มีเฉพาะรูปใหม่ที่ยังไม่บันทึก — รูปเดิมไม่มีปุ่มลบ */
      on(root, 'click', '[data-rm]', (e, btn) => {
        const [k, i] = btn.dataset.rm.split(':');
        sets[k].list.splice(Number(i), 1); paint(k);
      });
      ok.onclick = async () => {
        if (!n()) return;
        ok.disabled = true; ok.textContent = 'กำลังส่งรูป…';
        let cargo = sets.cargo.list, inv = sets.inv?.list || [];
        try{
          [cargo, inv] = await Promise.all([
            uploadPhotos(cargo, stopPhotoDir(b, S.DELIVERED, 'cargo')),
            uploadPhotos(inv, stopPhotoDir(b, S.DELIVERED, 'invoice')),
          ]);
        }catch(err){ console.error('[driver] อัปรูปเพิ่มไม่สำเร็จ', err); }
        try{
          const d = getDriver(me);
          addDeliveryPhotos((cargo.length ? sameRound : [b]).map(v => ({
            stopId: v.id, photos: cargo, invoicePhotos: v.id === b.id ? inv : [],
          })), { byRole: ROLE, byName: actorName(d), byId: me || '' });
          warnStuck([...cargo, ...inv]);
          toast(`เพิ่มรูปแล้ว ${fmtNum(cargo.length + inv.length)} รูป`, 'ok');
          proofDialog(b, jobId);
        }catch(err){
          toast(err.message, 'err');
          ok.disabled = false; ok.textContent = `บันทึกรูปเพิ่ม ${fmtNum(n())} รูป`;
        }
      };
    },
  });
}

function groupRow(g, i, canDeliver){
  const gid = g.stops[0].id;
  const left = liveStops(g.stops);
  const done = !left.length;
  const shown = openGroups.has(gid);
  const kg = g.stops.reduce((t, x) => t + (Number(x.cargo?.weightKg) || 0), 0);
  const sent = g.stops.filter(x => x.status === S.DELIVERED).length;
  const rebill = g.stops.filter(needRebill).length;
  return `
<div class="stop-grp${shown ? ' is-open' : ''}">
  <div class="stop-row ${EXTRAS || ASSIST ? `helper-row${done ? ' is-sent' : ''}` : done ? 'is-done' : ''}${rtLive(g.stops) ? ' is-rt' : ''}">
  <div class="helper-row-top" data-grp="${gid}" style="cursor:pointer;flex:1;min-width:0">
    <span class="stop-n">${done ? '✓' : i + 1}</span>
    <span class="grow" style="min-width:0">
      ${rtTag(g.stops)}
      <span class="strong" style="display:block">${esc(g.stops[0].dropoff.name)}</span>
      <span class="tiny dim trunc" style="display:block">${esc(g.stops[0].dropoff.address)}</span>
      <span class="tiny dim"><b class="grp-n">${fmtNum(g.stops.length)} บิล</b> · ${fmtNum(Math.round(kg))} กก.${sent && !done ? ` · ส่งแล้ว ${fmtNum(sent)}/${fmtNum(g.stops.length)}` : ''}</span>
      ${g.stops.some(x => dupOf(x) || billReportOf(x)) ? '<span class="dup-tag">⚠ มีบิลที่เลขต้องตรวจ — แตะ "ดูบิล"</span>'
        : g.stops.some(x => reusedOf(x)) ? '<span class="dup-tag">🔁 มีบิลเลขซ้ำกับงานเก่า (ส่งใหม่) — ถ่ายใบที่ถืออยู่</span>' : ''}
      ${done ? '' : draftBadge(left[0]?.id, me)}
    </span>
    <span class="tiny strong" style="color:${g.stops.some(failed) ? 'var(--red)' : done && !rebill ? 'var(--green)' : 'var(--amber-dim)'};white-space:nowrap">${g.stops.some(failed) ? `✕ ส่งไม่สำเร็จ ${fmtNum(g.stops.filter(failed).length)} บิล` : rebill ? `${REBILL} ${fmtNum(rebill)} บิล` : done ? 'ส่งแล้ว' : ''} ${shown ? '▴' : 'ดูบิล ▾'}</span>
  </div>
  ${EXTRAS || ASSIST ? groupActs(g.stops) : ''}
  </div>
  ${shown ? `
  <div class="stop-grp-body">
    ${g.stops.map((x, k) => billRow(x, k)).join('')}
    ${canDeliver && left.length ? `
    <button type="button" class="btn btn-accent btn-block" data-grpgo="${gid}">ส่งของร้านนี้ (เหลือ ${fmtNum(left.length)} บิล) → เลือกบิลที่คุณจะส่ง</button>
    <p class="tiny dim" style="margin-top:6px">หลายคนช่วยกันส่งร้านนี้ได้ — แต่ละคนเลือกบิลของตัวเอง บิลที่คนอื่นส่งแล้วจะขึ้นว่า “ส่งแล้ว” ให้เอง</p>` : ''}
  </div>` : ''}
</div>`;
}

/* บิลหนึ่งใบในกลุ่ม — ดูข้อมูลอย่างเดียว ส่งของ/ชำระเงิน/คืน Inv./POD ทำทีเดียวทั้งร้านจากหัวกลุ่ม */
function billRow(x, k){
  const done = x.status === S.DELIVERED;
  const p = x.payment, r = x.invoiceReturn;
  return `
<div class="stop-row ${done ? 'is-done' : ''}">
  <span class="stop-n">${done ? '✓' : k + 1}</span>
  <span class="grow" style="min-width:0">
    <span class="strong" style="display:block">บิล ${esc(x.invoice?.number || x.code)}</span>
    <span class="tiny dim">${esc(x.code)} · ${fmtNum(Math.round(x.cargo.weightKg))} กก.${x.invoice?.amount ? ` · ${esc(fmtBaht(x.invoice.amount))}` : ''}</span>
    ${billIdTags(x)}
    ${sentBy(x)}
    ${whReturnTag(x)}
    ${EXTRAS || ASSIST ? `<span class="tiny dim" style="display:block">${p ? `💰 ${esc(p.method)} ${esc(fmtBaht(p.amount))}` : '💰 ยังไม่บันทึก'} · ${r ? `📄 คืนแล้ว ${esc(fmtDate(r.date))}` : needRebill(x) ? `📄 ยกเลิกการคืน · ${REBILL}` : '📄 ยังไม่คืน'}</span>` : ''}
  </span>
  ${failed(x) ? failTag(x) : needRebill(x) ? rebillTag : `<span class="tiny" style="white-space:nowrap;${done ? 'color:var(--green)' : ''}">${done ? 'ส่งแล้ว' : x.status === S.CANCELLED ? 'ยกเลิก' : 'ยังไม่ส่ง'}</span>`}
</div>${preBtn(x)}`;
}

/* ---------- แนบรูปไว้ก่อน (6 พ.ย. — ลูกค้าขอ: ยังไม่ปิดจุดก็ใส่รูปเป็นรายบิลได้) ----------
   รูปเก็บในงานค้างของเครื่องนี้ (deliverDraft.js — ชุดเดียวกับที่หน้าต่างส่งของเซฟอัตโนมัติ) ยังไม่ขึ้นระบบ
   ตอนกดส่งของ รูปพวกนี้รออยู่ในช่องรูปสินค้า / รูปเลขที่บิลของบิลนั้นให้เลย · ออฟฟิศเห็นหลังปิดจุดเท่านั้น */
const preBtn = (x) => STAFF || ASSIST || !liveStops([x]).length ? ''
  : `<button type="button" class="btn btn-ghost btn-sm drv-pre-btn" data-preattach="${x.id}">📎 แนบรูปไว้ก่อน · บิล ${esc(x.invoice?.number || x.code)}</button>`;

async function preAttachDialog(x, jobId){
  const shop = liveStops(shopBills(x, jobId));
  const ids = shop.length ? shop.map(b => b.id) : [x.id];
  const rec = await loadDraft(me, ids).catch(() => null);
  const multi = ids.length > 1;
  const sets = {
    cargo: { list: [...(rec?.cargo || [])], max: 900, q: 0.6, label: 'รูปสินค้า',
             sub: multi ? `ใช้ร่วมกันทั้งร้าน (${fmtNum(ids.length)} บิล)` : 'หลังลงของ ให้เห็นสินค้าที่ลงจุดนี้' },
    inv:   { list: [...(rec?.inv?.[x.id] || [])], max: 1600, q: 0.8, label: 'รูปเลขที่บิล',
             sub: `เฉพาะบิล <span class="code">${esc(x.invoice?.number || x.code)}</span> · ห้ามถ่ายบิลอื่น` },
  };
  const field = (k) => `
<div class="field" style="margin-top:14px">
  <span class="label">${sets[k].label}</span>
  <span class="tiny dim" style="display:block">${sets[k].sub}</span>
  <div class="drv-addsrc">
    <label class="drop"><span class="strong">📷 ถ่ายรูป</span><input type="file" accept="image/*" capture="environment" multiple hidden data-pre="${k}"></label>
    <label class="drop"><span class="strong">🖼 เลือกจากคลัง</span><input type="file" accept="image/*" multiple hidden data-pre="${k}"></label>
  </div>
  <div class="photo-grid" data-preshots="${k}" style="margin-top:8px"></div>
</div>`;
  /* รูปที่เลือกแล้วแต่ยังไม่กดบันทึก — เซฟอัตโนมัติผ่าน ui.js เหมือนหน้าต่างเพิ่มรูป (เผลอปิดแล้วเปิดใหม่ได้รูปคืน) */
  const hook = {};
  modal({
    title: `แนบรูปไว้ก่อน · บิล ${esc(x.invoice?.number || x.code)}`,
    draftKey: `preattach:${x.id}`,
    draft: hook,
    body: `<p class="small">${esc(x.dropoff.name)} · ยังไม่ต้องปิดจุด</p>
<p class="tiny dim" style="margin-top:4px">รูปเก็บไว้ในเครื่องนี้ก่อน <strong>ยังไม่ส่งเข้าระบบ</strong> — ตอนกด “ส่งของ” รูปจะรออยู่ในช่องให้เลย ไม่ต้องถ่ายซ้ำ · ต้องส่งของด้วยเครื่องนี้</p>
${field('cargo')}${field('inv')}`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>บันทึกไว้ในเครื่อง</button>`,
    onMount(root){
      bindZoom(root);
      hook.get = () => ({ cargo: sets.cargo.list, inv: sets.inv.list });
      hook.set = (v) => { sets.cargo.list = [...(v.cargo || [])]; sets.inv.list = [...(v.inv || [])]; paint('cargo'); paint('inv'); };
      const paint = (k) => {
        markDirty();
        root.querySelector(`[data-preshots="${k}"]`).innerHTML = sets[k].list.map((p, i) => `
          <span class="photo-x"><img src="${p}" alt="${sets[k].label} ${i + 1}" data-zoom="${p}"><button type="button" data-rm="${k}:${i}" aria-label="เอารูปออก">×</button></span>`).join('');
      };
      for (const input of root.querySelectorAll('[data-pre]')){
        const k = input.dataset.pre;
        input.addEventListener('change', async () => {
          keepPhotos(input.files, k === 'cargo' ? 'สินค้า' : 'เลขที่บิล', root.querySelector(`[data-preshots="${k}"]`));
          for (const f of [...input.files]){
            try{ sets[k].list.push(await shrinkImage(f, sets[k].max, sets[k].q)); }
            catch(err){ toast(err.message, 'err'); }
          }
          input.value = '';
          paint(k);
        });
      }
      on(root, 'click', '[data-rm]', (e, b) => { const [k, i] = b.dataset.rm.split(':'); sets[k].list.splice(Number(i), 1); paint(k); });
      paint('cargo'); paint('inv');
      root.querySelector('[data-ok]').onclick = async () => {
        /* รวมกับงานค้างเดิมของร้านนี้ (ถ้ามี) — ขั้น / ลายเซ็น / หมายเหตุที่ทำไว้คงเดิม */
        const stopIds = [...new Set([...(rec?.stopIds || []), ...ids])];
        try{
          await saveDraft({
            ...(rec || {}), driverId: me, stopIds, stage: rec?.stage || 1, of: 2 + stopIds.length,
            cargo: sets.cargo.list, inv: { ...(rec?.inv || {}), [x.id]: sets.inv.list },
            sig: rec?.sig || null, receiver: rec?.receiver || '', note: rec?.note || '', outcome: rec?.outcome || '',
          });
          const n = sets.cargo.list.length + sets.inv.list.length;
          toast(n ? `แนบไว้ในเครื่องแล้ว ${fmtNum(n)} รูป — ตอนส่งของรูปจะรออยู่ในช่อง` : 'บันทึกแล้ว', 'ok', 4000);
          close(); render();
        }catch(err){ toast(err.message || 'บันทึกในเครื่องไม่ได้', 'err', 5000); }
      };
    },
  });
}

/** " · โดย ชื่อ" เมื่อคนอื่นเป็นคนปิดบิลนี้ — ร้านที่หลายคนช่วยกันส่งจะได้รู้ว่าใครทำบิลไหน */
function doneBy(x){
  const ev = (x.events || []).filter(e => e.status === S.DELIVERED).at(-1);
  return ev?.byId && ev.byId !== me ? ` · โดย ${esc(ev.byName || '')}` : '';
}

/** บิลทุกใบของร้านเดียวกับจุดนี้ในเที่ยว (รวมจุดนี้) — ร้านที่มีบิลเดียวได้ [จุดนี้] */
function shopBills(x, jobId){
  const j = getJob(jobId);
  const g = j && stopGroups(j.stopList).find(v => v.stops.some(y => y.id === x.id));
  return g ? g.stops : [x];
}

/** ส่งของจุดนี้ — ร้านเดียวกันยังเหลือหลายบิล ให้เลือกก่อนว่าคนนี้จะส่งบิลไหน
 *  (27 ต.ค.) เดิมบังคับส่งทั้งร้านในหน้าต่างเดียว คนเดียวต้องทำครบทุกบิล
 *  ตอนนี้หลายคนในเที่ยวแยกกันทำร้านเดียวกันได้ — ข้อมูลซิงก์ผ่าน Firestore ทุกเครื่องเห็นทันที */
function deliverFor(x, jobId){
  /* เที่ยวหลายคนขับ — ฉันต้องกด "ออกจากคลัง" ของตัวเองก่อน (แม้เพื่อนออกไปแล้ว) */
  const j = getJob(jobId);
  if (j && FLOW.indexOf(myStatus(j)) < FLOW.indexOf(S.DEPARTED)){
    return toast(`กด “${META[nextOf(myStatus(j))]?.verb || 'ยืนยันขั้นของเที่ยว'}” ของคุณก่อน แล้วจึงส่งของได้`, 'warn', 4500);
  }
  const bills = liveStops(shopBills(x, jobId));
  if (bills.length > 1) return pickBills(x, jobId);
  confirmStep(x, S.DELIVERED, { stop:true, jobId, bills: bills.length ? bills : [x] });
}

/* หน้าต่างที่เปิดอยู่ฟังข้อมูลใหม่ได้ผ่านตัวนี้ (subscribe ท้ายไฟล์ไม่วาดหน้าใหม่ตอนมีหน้าต่างเปิด) */
let liveHook = null;

function pickBills(x, jobId){
  const chosen = new Set(liveStops(shopBills(x, jobId)).map(b => b.id));
  modal({
    title: `เลือกบิลที่คุณจะส่ง · ${esc(x.dropoff.name)}`,
    draftKey: `pick:${x.id}`,
    reopen: { name:'pick', args:{ stopId: x.id, jobId } },
    body: `
<p class="small">ติ๊กเฉพาะบิลที่<strong>คุณ</strong>จะส่งตอนนี้ · คนอื่นในเที่ยวเลือกบิลที่เหลือในเครื่องของเขาได้พร้อมกัน</p>
<p class="tiny dim" style="margin-top:4px">บิลที่คนอื่นส่งไปแล้วจะขึ้นว่า “ส่งแล้ว” ในรายการนี้ทันที</p>
<div data-billpick style="margin-top:12px"></div>`,
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           <button class="btn btn-accent" data-ok>ถัดไป →</button>`,
    onMount(root){
      const box = root.querySelector('[data-billpick]');
      const okBtn = root.querySelector('[data-ok]');
      function paint(){
        const all = shopBills(x, jobId).filter(b => b.status !== S.CANCELLED);
        for (const b of all) if (b.status === S.DELIVERED) chosen.delete(b.id);
        box.innerHTML = all.map(b => {
          const done = b.status === S.DELIVERED;
          return `
<label class="drv-pick${done ? ' is-done' : ''}">
  <input type="checkbox" value="${b.id}" ${done ? 'disabled' : chosen.has(b.id) ? 'checked' : ''}>
  <span class="grow" style="min-width:0">
    <span class="strong" style="display:block">บิล ${esc(b.invoice?.number || b.code)}</span>
    <span class="tiny dim">${esc(b.code)} · ${fmtNum(Math.round(b.cargo?.weightKg || 0))} กก.</span>
  </span>
  ${done ? (failed(b) ? failTag(b) : `<span class="tiny strong" style="color:var(--green);white-space:nowrap">ส่งแล้ว${doneBy(b)}</span>`) : ''}
</label>`;
        }).join('');
        okBtn.disabled = !chosen.size;
        okBtn.textContent = chosen.size ? `ถัดไป → ส่ง ${fmtNum(chosen.size)} บิล` : 'เลือกอย่างน้อย 1 บิล';
        if (!all.some(b => b.status !== S.DELIVERED)){ close(); toast('ร้านนี้ส่งครบทุกบิลแล้ว', 'ok'); }
      }
      box.addEventListener('change', (e) => {
        const cb = e.target.closest('input[type=checkbox]');
        if (!cb) return;
        if (cb.checked) chosen.add(cb.value); else chosen.delete(cb.value);
        paint();
      });
      liveHook = () => root.isConnected ? paint() : (liveHook = null);
      paint();
      okBtn.onclick = () => {
        const bills = liveStops(shopBills(x, jobId)).filter(b => chosen.has(b.id));
        if (!bills.length) return toast('เลือกอย่างน้อย 1 บิล', 'warn');
        confirmStep(bills[0], S.DELIVERED, { stop:true, jobId, bills });
      };
    },
  });
}

function stopRow(x, i, canDeliver){
  const done = x.status === S.DELIVERED;
  if (ASSIST) return payStopRow(x, i);
  if (EXTRAS) return payStopRow(x, i, { canDeliver, badge: done ? '' : draftBadge(x.id, me) });
  return `
<div class="stop-row ${done ? 'is-done' : ''}${rtLive([x]) ? ' is-rt' : ''}" ${!done && canDeliver ? `data-stop="${x.id}"` : ''}>
  <span class="stop-n">${done ? '✓' : i + 1}</span>
  <span class="grow">
    ${rtTag([x])}
    <span class="strong" style="display:block">${esc(x.dropoff.name)}</span>
    <span class="tiny dim trunc" style="display:block">${esc(x.dropoff.address)}</span>
    <span class="tiny dim">${esc(x.code)} · ${fmtNum(Math.round(x.cargo.weightKg))} กก.</span>
    ${billIdTags(x)}
    ${sentBy(x)}
    ${whReturnTag(x)}
    ${done ? '' : draftBadge(x.id, me)}
  </span>
  ${failed(x) ? failTag(x) : needRebill(x) ? rebillTag
    : done ? `<span class="tiny" style="color:var(--green);white-space:nowrap">ส่งแล้ว</span>`
    : (canDeliver ? `<span class="tiny strong" style="color:var(--amber-dim);white-space:nowrap">ส่งของ →</span>` : '')}
</div>`;
}

/* ---------- ยืนยันสถานะ ------------------------------------ */
/* ช่องถ่ายรูปหนึ่งชุด — ใช้ทั้งรูปสินค้าและรูปใบ Invoice (key แยกชุดกัน)
   gallery (6 พ.ย. — ลูกค้าขอ) = ตอนปิดจุดส่ง เลือกรูปจากคลังในเครื่องได้ด้วย (เดิมบังคับถ่ายอย่างเดียว) · ขั้นของทั้งเที่ยวยังถ่ายอย่างเดียว */
const shotField = ({ key, need, title, sub, guide, btn, gallery }) => `
<div class="field" style="margin-top:16px">
  <div class="shot-head">
    <span class="shot-count" data-count="${key}">0 / ${need}</span>
    <span>
      <span class="label" style="margin:0"><span data-title="${key}">${title}</span><span class="req">*</span></span>
      <span class="tiny dim" style="display:block" data-sub="${key}">${sub}</span>
    </span>
  </div>

  <ul class="shot-guide">
    ${(guide || []).map(g => `<li>${esc(g)}</li>`).join('')}
  </ul>

  ${gallery ? `<div class="drv-addsrc">
    <label class="drop">
      <span class="strong">${btn}</span>
      <input type="file" accept="image/*" capture="environment" multiple hidden data-photos="${key}">
    </label>
    <label class="drop">
      <span class="strong">🖼 เลือกจากคลัง</span>
      <input type="file" accept="image/*" multiple hidden data-photos="${key}">
    </label>
  </div>
  <span class="tiny dim" style="display:block;margin-top:4px">ทีละรูป หรือหลายรูปก็ได้ · ไม่จำกัดจำนวน</span>` : `
  <label class="drop" style="display:block">
    <span class="strong">${btn}</span>
    <span class="tiny dim" style="display:block;margin-top:3px">ทีละรูป หรือหลายรูปก็ได้ · ไม่จำกัดจำนวน</span>
    <input type="file" accept="image/*" capture="environment" multiple hidden data-photos="${key}">
  </label>`}
  <div class="photo-grid" data-shots="${key}" style="margin-top:10px"></div>
  <p class="tiny" data-shotwarn="${key}" style="margin-top:8px;color:var(--amber-dim)"></p>
</div>`;

function confirmStep(s, next, opts = {}){
  const m = META[next];
  const isStop = !!opts.stop;          /* true = ปิดจุดส่ง · false = ขั้นของทั้งเที่ยว */
  const needPhoto = NEEDS_PHOTO.has(next);
  const needGeo   = isStop;            /* พิกัดบังคับเฉพาะตอนปิดจุด */
  /* ปิดจุดส่งเป็นสเต็ป: 1) รูปสินค้าหลังลงของ  2) ผู้รับเซ็น (ก่อนผู้รับเดินไป — 20 ต.ค. ย้ายมาก่อนถ่ายบิล)
     3…) รูปเลขที่บิล ทีละบิล — บิลสุดท้ายต่อด้วยหมายเหตุ + GPS แล้วกดยืนยัน
     ร้านเดียวกันหลายบิล (opts.bills) ถ่ายสินค้าครั้งเดียว เซ็นครั้งเดียว แล้วถ่ายเลขที่บิล แยกของแต่ละบิล */
  const staged    = isStop && needPhoto;
  const bills     = staged ? (opts.bills?.length ? opts.bills : [s]) : [];
  const multi     = bills.length > 1;
  const nStage    = 2 + bills.length;
  const invKey    = (k) => `inv${k}`;
  const d = getDriver(me);
  /* ชุดรูป — cargo = รูปสินค้า (ขึ้นรถ 2 · ส่งมอบ 2) · inv0, inv1… = รูปใบ Invoice ของแต่ละบิล (อย่างน้อยบิลละ 1)
     เลขที่บิล ต้องอ่านออกตอนปริ้น — ถ่ายละเอียดกว่ารูปสินค้า (cloud.js ยังบีบไม่เกิน 300 KB ตอนอัป) */
  const sets = {
    cargo: { list: [], need: minPhotos(next), on: needPhoto, max: 900, q: 0.6, alt: 'รูปสินค้า' },
    ...Object.fromEntries(bills.map((b, k) => [invKey(k),
      { list: [], need: MIN_INVOICE_PHOTOS, on: true, max: 1600, q: 0.8, alt: `รูปเลขที่บิล บิลที่ ${k + 1}` }])),
  };
  const invOf = (b) => b.invoice?.number || b.code;
  let geo = null;
  let pad = null;
  /* ผลการส่ง (store.js OUTCOMES) — ต้องเลือกทุกครั้งก่อนไปต่อ · ส่งไม่สำเร็จ = จบที่ขั้นแรก
     (รูปหลักฐาน 1 รูป + หมายเหตุบังคับ + GPS) ไม่ต้องให้ผู้รับเซ็น ไม่ต้องถ่ายเลขที่บิล */
  let outcome = '';
  const fail = () => isFailOutcome(outcome);
  const lastStage = () => fail() ? 1 : nStage;
  const outcomeField = staged ? `
<div class="field" style="margin-top:12px">
  <span class="label">ผลการส่ง<span class="req">*</span></span>
  <select class="input select drv-outcome" data-outcome>
    <option value="" selected disabled>— แตะเพื่อเลือกผลการส่ง —</option>
    ${Object.entries(OUTCOMES).map(([k, v]) => `<option value="${k}">${esc(v)}${isFailOutcome(k) ? ' (ต้องพิมพ์หมายเหตุ)' : ''}</option>`).join('')}
  </select>
</div>` : '';

  const cargoField = needPhoto ? shotField({
    key: 'cargo', need: sets.cargo.need, title: 'รูปสินค้า',
    sub: `ถ่าย ${sets.cargo.need} รูปขึ้นไป · ${isStop ? (multi ? `หลังลงของเสร็จ ให้เห็นสินค้าทั้ง ${bills.length} บิลของร้านนี้` : 'หลังลงของเสร็จ ให้เห็นสินค้าที่ลงจุดนี้') : 'เห็นสินค้าบนรถ'}`,
    guide: PHOTO_GUIDE[next], btn: isStop ? '📷 ถ่ายรูป' : '📷 แตะเพื่อถ่ายรูป', gallery: isStop,
  }) : '';

  const invField = (b, k) => shotField({
    key: invKey(k), need: MIN_INVOICE_PHOTOS, title: multi ? `รูปเลขที่บิล บิลที่ ${k + 1} / ${bills.length}` : 'รูปเลขที่บิล',
    sub: `เลขที่บิล <span class="code">${esc(invOf(b))}</span> · อย่างน้อย ${MIN_INVOICE_PHOTOS} รูป · ห้ามถ่ายบิลอื่น`,
    guide: INVOICE_PHOTO_GUIDE, btn: '🧾 ถ่ายเลขที่บิล', gallery: true,
  });

  /* เลขบิลตัวใหญ่หัวสเต็ป — คนขับสูงอายุต้องเทียบเลขกับใบในมือได้ทันที ไม่ต้องเพ่งตัวเล็ก */
  const bigBill = (b, k) => `
<div class="bill-big">
  <span class="bill-big-k">${multi ? `บิลที่ ${k + 1} จาก ${bills.length}` : 'เลขที่บิล'} · ถ่ายใบนี้</span>
  <span class="bill-big-no">${esc(invOf(b))}</span>
  ${(() => { const v = getShipment(b.id) || b, r = billReportOf(v), d = dupOf(v);
    return r ? `<span class="bill-big-k">ใบในมือ (ที่คุณแจ้ง): <b>${esc(r.billNo)}</b> — ถ่ายใบนี้ได้เลย</span>`
      : d ? `<span class="bill-big-k">⚠ เลขนี้ซ้ำในไฟล์ลูกค้า — ถ่ายใบที่ถืออยู่ของร้านนี้</span>` : ''; })()}
</div>`;

  const signPart = `
${isStop && needPhoto ? `
<div class="field" style="margin-top:16px">
  <span class="label">ชื่อผู้รับ</span>
  <input class="input" data-receiver value="${esc(s.dropoff.contact || '')}" placeholder="ชื่อคนที่มารับของ">
</div>

<div class="field" style="margin-top:14px">
  <span class="label">ลายเซ็นผู้รับ<span class="req">*</span></span>
  <div class="sigwrap" data-sig><canvas></canvas><div class="sighint">ให้ผู้รับเซ็นตรงนี้</div></div>
  <div class="row between wraps gap-8" style="margin-top:8px">
    <span class="tiny" data-sigwarn style="color:var(--amber-dim)">ยังไม่ได้เซ็น</span>
    <button type="button" class="btn btn-quiet btn-sm" data-sigclear>ลบ · เซ็นใหม่</button>
  </div>
</div>` : ''}`;

  const finishPart = `

<label class="field" style="margin-top:16px">
  <span class="label">หมายเหตุ <span data-notehint><span class="hint">(ไม่บังคับ)</span></span></span>
  <textarea class="textarea" data-note style="min-height:64px" placeholder="${esc(defaultNote(next))}"></textarea>
</label>

${needGeo ? `
<div class="field" style="margin-top:16px">
  <span class="label">ตำแหน่ง<span class="req">*</span> <span class="hint">(ระบบอ่านให้เอง)</span></span>
  <button type="button" class="btn btn-ghost btn-sm btn-block" data-geo>📍 แนบตำแหน่งตอนนี้</button>
  <p class="tiny dim" data-geotext style="margin-top:6px">กำลังอ่านตำแหน่ง…</p>
  <p class="tiny dim" style="margin-top:4px">ต้องเปิดระบบระบุตำแหน่ง และกด “อนุญาต”</p>
</div>` : `
<button type="button" class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" data-geo>📍 แนบตำแหน่ง (ไม่บังคับ)</button>
<p class="tiny dim" data-geotext style="margin-top:6px"></p>`}

<p class="tiny dim" style="margin-top:14px">
  บันทึกในชื่อ <strong>${esc(actorName(d))}</strong> · กดแล้วแก้ไม่ได้
</p>`;

  /* เซฟอัตโนมัติ (27 ต.ค.): ปิดจุด = deliverDraft.js (รูป/ลายเซ็น/ขั้น ใน IndexedDB) ทุกครั้งที่เปลี่ยน
     ขั้นของทั้งเที่ยว (ขึ้นรถ/ออกจากคลัง) = ระบบกลางใน ui.js (ช่องกรอก + รูปผ่าน draftHook) */
  const draftHook = {};
  modal({
    title: `${esc(m.verb)}`,
    autosave: !staged,
    draft: staged ? null : draftHook,
    draftKey: staged ? '' : `jobstep:${opts.jobId}:${next}`,
    reopen: staged ? { name:'deliver', args:{ jobId: opts.jobId, stopIds: bills.map(b => b.id) } }
                   : { name:'jobstep', args:{ jobId: opts.jobId, next } },
    body: `
<p class="muted small">${isStop
  ? (multi ? `${esc(s.dropoff.name)} · ${fmtNum(bills.length)} บิล (${bills.map(b => `<span class="code">${esc(b.code)}</span>`).join(' ')})`
    : `จุดส่ง <span class="code">${esc(s.code)}</span> → ${esc(s.dropoff.name)}`)
  : `เที่ยว <span class="code">${esc(s.code)}</span> · ${fmtNum(opts.stops || 0)} จุดส่ง`}</p>
${staged ? `
<p class="small strong" data-stagelabel style="margin-top:10px"></p>
<div data-stage="1">${outcomeField}${cargoField}</div>
<div data-stage="2" style="display:none">${signPart}</div>
${bills.map((b, k) => `<div data-stage="${k + 3}" style="display:none">${bigBill(b, k)}${invField(b, k)}${k === bills.length - 1 ? `<div data-finish>${finishPart}</div>` : ''}</div>`).join('')}
<p class="tiny dim" style="margin-top:18px;text-align:center">💾 เซฟอัตโนมัติในเครื่องนี้ทุกครั้งที่เปลี่ยน · ปิดแล้วกลับมาทำต่อได้ · ยังไม่ส่งเข้าระบบจนกว่าจะกดยืนยันส่งของ</p>
<p class="tiny" data-draftnote style="display:none;margin-top:8px;text-align:center"></p>` : `${cargoField}${signPart}${finishPart}`}`,
    /* ปุ่มท้ายหน้าต่างมีได้ทีละ 2 ปุ่ม — มือถือจอแคบ ปุ่มยาวหลายปุ่มล้นทับกัน (20 ต.ค.)
       สเต็ปแรก: ยกเลิก + ถัดไป · สเต็ปถัดมา: ย้อนกลับ + ถัดไป/ยืนยัน (ปิดหน้าต่างใช้ × ด้านบน) */
    foot: `<button class="btn btn-ghost" data-close>ยกเลิก</button>
           ${staged ? `<button class="btn btn-ghost" data-back style="display:none">← ย้อนกลับ</button>
           <button class="btn btn-accent" data-nextstage>ถัดไป → ถ่ายเลขที่บิล</button>` : ''}
           <button class="btn ${next === S.DELIVERED ? 'btn-green' : 'btn-accent'}" data-ok${staged ? ' style="display:none"' : ''}>${staged ? '✓ ยืนยันส่งของ' : esc(m.verb)}</button>`,
    onMount(root){
      const okBtn = root.querySelector('[data-ok]');
      const nextBtn = root.querySelector('[data-nextstage]');
      const backBtn = root.querySelector('[data-back]');
      /* มีอะไรเปลี่ยน = เซฟ · ระหว่างใส่ของที่ค้างไว้กลับยังไม่เซฟ (กันเขียนทับด้วยของครึ่ง ๆ กลาง ๆ) */
      let restoring = staged, draftT = null;
      function dirty(){
        if (!staged) return markDirty();
        if (restoring) return;
        clearTimeout(draftT);
        draftT = setTimeout(autoDraft, 400);
      }
      draftHook.get = () => ({ cargo: sets.cargo.list });
      draftHook.set = (x) => { sets.cargo.list = [...(x.cargo || [])]; paintShots('cargo'); };
      root.addEventListener('input', dirty);
      root.addEventListener('change', dirty);
      const short = (k) => sets[k]?.on ? Math.max(0, sets[k].need - sets[k].list.length) : 0;
      const invShort = () => bills.map((b, k) => short(invKey(k))).reduce((a, n) => a + n, 0);
      let stage = 1;
      /* สิ่งที่ต้องครบก่อนกด "ถัดไป" ของสเต็ปนี้ — 1 = รูปสินค้า · 2 = ลายเซ็น · k+3 = ใบ Invoice บิล k */
      let savedSig = null;           /* ลายเซ็นจากงานที่บันทึกไว้ — ใส่กลับเข้าช่องเซ็นตอนเปิดขั้นเซ็น */
      const unsigned = () => (!pad || pad.isEmpty()) && !savedSig;
      const stageKey = (n) => n === 1 ? 'cargo' : invKey(n - 3);
      const stageLeft = (n) => n === 2 ? (unsigned() ? 1 : 0) : n === 1 && staged && !outcome ? 1 : short(stageKey(n));
      const stageMsg = (n) => n === 1 && staged && !outcome ? 'เลือกผลการส่งก่อน'
        : n === 1 ? `ถ่ายรูป${fail() ? 'หลักฐาน' : 'สินค้า'}อีก ${short('cargo')} รูป`
        : n === 2 ? 'ให้ผู้รับเซ็นชื่อ'
        : `ถ่ายเลขที่บิล${multi ? ` บิลที่ ${n - 2}` : ''} อีก ${short(stageKey(n))} รูป`;

      /* รูปถ่าย — แต่ละชุดมีช่องเลือกไฟล์ ตัวนับ และกริดของตัวเอง */
      for (const [key, set] of Object.entries(sets)){
        /* ช่องละ 1–2 ปุ่ม (ถ่ายรูป · เลือกจากคลัง) — ใส่รูปเข้าชุดเดียวกัน */
        const inputs = [...root.querySelectorAll(`[data-photos="${key}"]`)];
        if (!inputs.length) continue;
        for (const input of inputs) input.addEventListener('change', async () => {
          /* เก็บรูปที่เพิ่งถ่ายไว้ในเครื่องด้วย (js/keepPhoto.js) — พนักงานเปิดดูแทนไม่ต้องเก็บ */
          if (!STAFF) keepPhotos(input.files, key === 'cargo' ? 'สินค้า' : 'เลขที่บิล', root.querySelector(`[data-shots="${key}"]`));
          for (const f of [...input.files]){
            try{ set.list.push(await shrinkImage(f, set.max, set.q)); }
            catch(err){ toast(err.message, 'err'); }
          }
          input.value = '';
          paintShots(key);
        });
        on(root.querySelector(`[data-shots="${key}"]`), 'click', '[data-rm]', (e, b) => {
          set.list.splice(Number(b.dataset.rm), 1); paintShots(key);
        });
      }
      function paintShots(key){
        const set = sets[key];
        const shots = root.querySelector(`[data-shots="${key}"]`);
        if (shots){
          shots.innerHTML = set.list.map((p, i) => `
            <span class="photo-x"><img src="${p}" alt="${set.alt} ${i+1}"><button type="button" data-rm="${i}" aria-label="ลบรูป">×</button></span>`).join('');
        }
        if (!set.on){
          /* ชุดที่ไม่ต้องถ่ายแล้ว (ส่งไม่สำเร็จ / บิลที่เครื่องอื่นปิดไปแล้ว) — บอกให้ชัด ไม่ค้างตัวเลขเดิม */
          const c = root.querySelector(`[data-count="${key}"]`);
          if (c){ c.textContent = 'ไม่ต้องถ่าย'; c.classList.add('is-ok'); }
          const w = root.querySelector(`[data-shotwarn="${key}"]`);
          if (w) w.textContent = '';
          return;
        }

        /* ตัวนับตัวใหญ่ + บอกตรง ๆ ว่าขาดอีกกี่รูป ไม่ปล่อยให้กดแล้วค่อยเด้ง error */
        const left = short(key);
        const counter = root.querySelector(`[data-count="${key}"]`);
        if (counter){
          counter.textContent = `${set.list.length} / ${set.need}`;
          counter.classList.toggle('is-ok', left <= 0);
        }
        const warn = root.querySelector(`[data-shotwarn="${key}"]`);
        if (warn) warn.textContent = left > 0 ? `ถ่ายอีก ${left} รูป` : '';
        refreshOk();
        dirty();
      }

      /* ปุ่มยืนยันเปิดได้ก็ต่อเมื่อครบทุกเงื่อนไข — รูปครบ และ (ถ้าเป็นการปิดจุด) ผู้รับเซ็นแล้ว */
      function refreshOk(){
        if (nextBtn){
          const left = stageLeft(stage);
          nextBtn.disabled = left > 0;
          nextBtn.title = left ? `ต้อง${stageMsg(stage)}ก่อน` : '';
        }
        if (!okBtn) return;
        const noSign = isStop && !fail() && unsigned();

        const why = [];
        if (staged && !outcome) why.push('เลือกผลการส่ง');
        if (fail() && !noteText()) why.push('พิมพ์หมายเหตุ');
        if (short('cargo')) why.push(`ถ่ายรูป${fail() ? 'หลักฐาน' : 'สินค้า'}อีก ${short('cargo')} รูป`);
        if (invShort()) why.push(`ถ่ายเลขที่บิล อีก ${invShort()} รูป`);
        if (noSign) why.push('ให้ผู้รับเซ็นชื่อ');

        okBtn.disabled = why.length > 0;
        okBtn.title = why.length ? 'ต้อง' + why.join(' และ ') + 'ก่อน' : '';

        const sw = root.querySelector('[data-sigwarn]');
        if (sw){
          sw.textContent = noSign ? 'ยังไม่ได้เซ็น' : '✓ เซ็นแล้ว';
          sw.style.color = noSign ? 'var(--amber-dim)' : 'var(--green)';
        }
      }

      /* ลายเซ็น — สร้างตอนช่องเซ็นมองเห็นแล้วเท่านั้น (ตอนซ่อนอยู่ canvas กว้าง 0 เซ็นไม่ติด) */
      const sig = root.querySelector('[data-sig]');
      function mountSig(){
        if (pad || !sig) return;
        pad = signaturePad(sig);
        root.querySelector('[data-sigclear]').onclick = () => { pad.clear(); savedSig = null; refreshOk(); };
        if (savedSig){ pad.load(savedSig); savedSig = null; }
        /* ลายเซ็นไม่มี event ของตัวเอง — เช็คตอนปล่อยนิ้วแทน */
        sig.addEventListener('pointerup', () => { refreshOk(); dirty(); });
        sig.addEventListener('pointerleave', refreshOk);
      }

      /* สเต็ปของการปิดจุด — สลับแค่การมองเห็น รูปที่ถ่ายไว้ไม่หาย */
      function showStage(n){
        if (!staged) return;
        stage = n;
        for (let k = 1; k <= nStage; k++){
          root.querySelector(`[data-stage="${k}"]`).style.display = n === k ? '' : 'none';
        }
        const last = n === lastStage();
        root.querySelector('[data-stagelabel]').textContent = `ขั้นที่ ${n} / ${lastStage()} · ` + (n === 1
          ? (!outcome ? 'เลือกผลการส่ง แล้วถ่ายรูป' : fail() ? 'ถ่ายรูปหลักฐาน + พิมพ์หมายเหตุ' : 'ถ่ายรูปสินค้าหลังลงของเสร็จ')
          : n === 2 ? 'ให้ผู้รับเซ็นชื่อ (ก่อนผู้รับไป)'
          : `ถ่ายเลขที่บิล${multi ? ` บิลที่ ${n - 2} (${invOf(bills[n - 3])})` : ''}`);
        nextBtn.style.display = last ? 'none' : '';
        nextBtn.textContent = n === 1 ? 'ถัดไป → ให้ผู้รับเซ็น'
          : n === 2 ? 'ถัดไป → ถ่ายเลขที่บิล' : `ถัดไป → บิลที่ ${n - 1}`;
        backBtn.style.display = n > 1 ? '' : 'none';
        root.querySelector('.modal-foot [data-close]').style.display = n > 1 ? 'none' : '';
        okBtn.style.display = last ? '' : 'none';
        if (n === 2) mountSig();
        dirty();
        root.querySelector('.modal-body').scrollTop = 0;
        refreshOk();
      }
      /* เลือกผลการส่ง — ส่งไม่สำเร็จ: ย้ายช่องหมายเหตุ+GPS ขึ้นมาขั้นแรก ปิดชุดรูปใบ Invoice · กลับเป็นส่งเรียบร้อย: ย้ายกลับ */
      const noteEl = root.querySelector('[data-note]');
      const noteText = () => (noteEl?.value || '').trim();
      const finishEl = root.querySelector('[data-finish]');
      const outSel = root.querySelector('[data-outcome]');
      function applyOutcome(o){
        outcome = o || '';
        if (outSel) outSel.value = outcome;
        const f = fail();
        sets.cargo.need = f ? MIN_FAIL_PHOTOS : minPhotos(next);
        const goneIds = new Set(othersDone().map(b => b.id));
        bills.forEach((b, k) => { sets[invKey(k)].on = !f && !goneIds.has(b.id); });
        const t = root.querySelector('[data-title="cargo"]');
        if (t) t.textContent = f ? 'รูปหลักฐาน' : 'รูปสินค้า';
        const sb = root.querySelector('[data-sub="cargo"]');
        if (sb) sb.textContent = f
          ? `ถ่าย ${MIN_FAIL_PHOTOS} รูปขึ้นไป · เช่น หน้าร้านที่ปิด / สินค้าที่ลูกค้าไม่รับ`
          : `ถ่าย ${sets.cargo.need} รูปขึ้นไป · ${multi ? `หลังลงของเสร็จ ให้เห็นสินค้าทั้ง ${bills.length} บิลของร้านนี้` : 'หลังลงของเสร็จ ให้เห็นสินค้าที่ลงจุดนี้'}`;
        const nh = root.querySelector('[data-notehint]');
        if (nh) nh.innerHTML = f ? '<span class="req">*</span> <span class="hint">(บังคับ — บอกเหตุผล)</span>' : '<span class="hint">(ไม่บังคับ)</span>';
        if (noteEl) noteEl.placeholder = f ? `${OUTCOMES[outcome]} เพราะอะไร เช่น โทรแล้วไม่รับสาย / ของเสียหาย` : defaultNote(next);
        if (finishEl){
          const home = root.querySelector(`[data-stage="${nStage}"]`);
          (f ? root.querySelector('[data-stage="1"]') : home).appendChild(finishEl);
        }
        okBtn.textContent = f ? `✓ บันทึกผล · ${OUTCOMES[outcome]}` : '✓ ยืนยันส่งของ';
        okBtn.classList.toggle('btn-green', !f);
        okBtn.classList.toggle('btn-danger', f);
        Object.keys(sets).forEach(paintShots);
        showStage(Math.min(stage, lastStage()));
      }
      if (outSel) outSel.addEventListener('change', () => applyOutcome(outSel.value));
      if (noteEl) noteEl.addEventListener('input', refreshOk);

      /* อีกคนในเที่ยวปิดบิลที่อยู่ในหน้าต่างนี้ไปแล้ว — เตือนทันที ตอนยืนยันจะปิดเฉพาะบิลที่เหลือ */
      const othersDone = () => bills.filter(b => { const v = getShipment(b.id); return v && v.status !== b.status && !isOpen(v.status); });
      if (isStop){
        const warnBox = document.createElement('p');
        warnBox.className = 'tiny strong drv-livewarn';
        warnBox.style.display = 'none';
        root.querySelector('.modal-body').prepend(warnBox);
        liveHook = () => {
          if (!root.isConnected){ liveHook = null; return; }
          const gone = othersDone();
          /* บิลที่คนอื่นปิดแล้ว ไม่ต้องถ่ายใบ Invoice ของบิลนั้นอีก (ขั้นของบิลนั้นกดถัดไปผ่านได้เลย) */
          bills.forEach((b, k) => { if (gone.some(g => g.id === b.id) && sets[invKey(k)].on){ sets[invKey(k)].on = false; paintShots(invKey(k)); } });
          refreshOk();
          warnBox.style.display = gone.length ? '' : 'none';
          warnBox.textContent = gone.length
            ? `⚠ บิล ${gone.map(invOf).join(', ')} ถูกปิดไปแล้วจากเครื่องอื่น — กดยืนยันจะบันทึกเฉพาะบิลที่เหลือ` : '';
        };
      }

      if (nextBtn) nextBtn.onclick = () => {
        if (stageLeft(stage)) return toast(stageMsg(stage), 'warn', 4000);
        showStage(stage + 1);
      };
      if (backBtn) backBtn.onclick = () => showStage(stage - 1);

      Object.keys(sets).forEach(paintShots);
      if (staged) showStage(1); else mountSig();
      refreshOk();

      /* ---------- บันทึกไว้ก่อน / ทำต่อ (deliverDraft.js · เก็บในเครื่องนี้) ---------- */
      const billIds = bills.map(b => b.id);
      const draftNote = root.querySelector('[data-draftnote]');
      let rest = { ids: [], inv: {} };   /* บิลอื่นของร้านที่แนบรูปไว้ก่อน แต่ไม่ได้เลือกส่งรอบนี้ — เซฟทับแล้วต้องไม่หาย */
      /* เซฟอัตโนมัติ — แทนปุ่ม "บันทึกไว้ก่อน" เดิม · ยังไม่มีอะไรเลย (เปิดแล้วยังไม่แตะ) ไม่ต้องเซฟ */
      async function autoDraft(){
        if (!root.isConnected) return;
        const sig = pad && !pad.isEmpty() ? pad.toDataURL() : savedSig;
        const empty = !outcome && !sets.cargo.list.length && !sig && bills.every((b, k) => !sets[invKey(k)].list.length)
          && !(root.querySelector('[data-note]')?.value || '').trim();
        if (empty && stage === 1) return;
        try{
          await saveDraft({
            driverId: me, stopIds: [...billIds, ...rest.ids], stage, of: nStage,
            cargo: sets.cargo.list,
            inv: { ...rest.inv, ...Object.fromEntries(bills.map((b, k) => [b.id, sets[invKey(k)].list])) },
            sig,
            receiver: root.querySelector('[data-receiver]')?.value || '',
            note: root.querySelector('[data-note]')?.value || '',
            outcome,
          });
        }catch(err){ console.warn('[driver] เซฟอัตโนมัติไม่ได้', err); }
      }
      if (staged) loadDraft(me, billIds).then(rec => {
        if (!rec || !root.isConnected){ restoring = false; return; }
        const others = (rec.stopIds || []).filter(id => !billIds.includes(id));
        rest = { ids: others, inv: Object.fromEntries(others.map(id => [id, rec.inv?.[id] || []])) };
        sets.cargo.list = [...(rec.cargo || [])];
        bills.forEach((b, k) => { sets[invKey(k)].list = [...(rec.inv?.[b.id] || [])]; });
        savedSig = rec.sig || null;
        const rcv = root.querySelector('[data-receiver]');
        if (rcv && rec.receiver) rcv.value = rec.receiver;
        const nt = root.querySelector('[data-note]');
        if (nt && rec.note) nt.value = rec.note;
        Object.keys(sets).forEach(paintShots);
        if (rec.outcome) applyOutcome(rec.outcome);
        /* กลับไปขั้นเดิม — ขั้นก่อนหน้ายังไม่ครบ (เช่น ชุดบิลเปลี่ยน) ก็หยุดที่ขั้นนั้นแทน */
        let to = Math.min(rec.stage || 1, lastStage());
        for (let n = 1; n < to; n++) if (stageLeft(n)){ to = n; break; }
        showStage(to);
        draftNote.style.display = '';
        draftNote.innerHTML = `ทำต่อจากที่ค้างไว้ · <button type="button" class="linkish" data-dropdraft>ทิ้งที่ค้างไว้ เริ่มใหม่</button>`;
        draftNote.querySelector('[data-dropdraft]').onclick = async () => {
          await dropDrafts(me, billIds);
          sets.cargo.list = [];
          bills.forEach((b, k) => { sets[invKey(k)].list = []; });
          savedSig = null; pad?.clear();
          if (rcv) rcv.value = s.dropoff.contact || '';
          if (nt) nt.value = '';
          applyOutcome('');
          Object.keys(sets).forEach(paintShots);
          draftNote.style.display = 'none';
          showStage(1);
          toast('ทิ้งที่บันทึกไว้แล้ว — เริ่มขั้นที่ 1 ใหม่', 'ok');
        };
        toast('เปิดงานที่ค้างไว้ — ทำต่อได้เลย', 'ok');
        restoring = false;
      }).catch(() => { restoring = false; });

      /* พิกัด — ขั้นส่งมอบบังคับแนบ จึงยิงอ่านให้เลยตอนเปิดหน้าต่าง */
      const geoBtn = root.querySelector('[data-geo]');
      const geoText = root.querySelector('[data-geotext]');
      async function readGeo(){
        geoBtn.disabled = true; geoText.textContent = 'กำลังอ่านตำแหน่ง…';
        try{
          geo = await getGeo();
          geoText.textContent = `✓ ได้ตำแหน่งแล้ว (คลาดได้ ±${geo.acc} ม.)`;
          geoBtn.textContent = 'อ่านตำแหน่งใหม่';
        }catch(err){
          geo = null;
          geoText.textContent = needGeo ? `${err.message} — แตะปุ่มด้านบนอีกครั้ง` : err.message;
          if (needGeo) geoBtn.textContent = 'ลองอีกครั้ง';
        }
        geoBtn.disabled = false;
      }
      geoBtn.onclick = readGeo;
      if (needGeo) readGeo();

      /* ยืนยัน */
      okBtn.onclick = async () => {
        if (staged && !outcome) return toast('เลือกผลการส่งก่อน', 'warn', 4000);
        if (fail() && !noteText()) return toast(`${OUTCOMES[outcome]} — พิมพ์หมายเหตุก่อน`, 'warn', 4000);
        if (short('cargo')) return toast(stageMsg(1), 'warn', 4000);
        for (let k = 0; k < bills.length; k++){
          if (short(invKey(k))) return toast(stageMsg(k + 3), 'warn', 4000);
        }
        if (needGeo && !geo) return toast('ยังไม่มีตำแหน่ง — เปิดระบบระบุตำแหน่งแล้วกด “แนบตำแหน่งตอนนี้”', 'warn', 4200);
        if (isStop && !fail() && unsigned()) return toast('ให้ผู้รับเซ็นชื่อก่อน', 'warn', 4000);
        /* บิลที่เครื่องอื่นปิดไปแล้วระหว่างนี้ — ตัดออก ปิดเฉพาะที่เหลือ */
        const gone = new Set(isStop ? othersDone().map(b => b.id) : []);
        if (isStop && gone.size === bills.length){
          close(); dropDrafts(me, bills.map(b => b.id));
          toast('บิลทั้งหมดในหน้าต่างนี้ถูกปิดจากเครื่องอื่นแล้ว', 'warn', 4500);
          return go({ name:'trip', id: opts.jobId });
        }
        const note = noteText() || defaultNote(next);
        const receiver = fail() ? '' : root.querySelector('[data-receiver]')?.value.trim();
        /* อัปรูปขึ้น Storage ก่อน แล้วเก็บแค่ URL ลงฐานข้อมูล
           รูป 28 ใบต่อเที่ยวใหญ่เกินกว่าจะยัดลงเอกสารได้ */
        const label = okBtn.textContent;
        okBtn.disabled = true;
        okBtn.textContent = 'กำลังส่งรูป…';
        /* รูปสินค้า + ลายเซ็นอัปครั้งเดียว ใช้ร่วมกันทุกบิล · ใบ Invoice อัปเข้าโฟลเดอร์ของบิลนั้น */
        let urls = sets.cargo.list, sigUrl = fail() ? null : (pad && !pad.isEmpty() ? pad.toDataURL() : savedSig) || null;
        let invUrls = bills.map((b, k) => fail() ? [] : sets[invKey(k)].list);
        try{
          const dir = (kind) => isStop ? stopPhotoDir(s, next, kind) : jobPhotoDir(getJob(opts.jobId) || { id: opts.jobId }, next, kind);
          [urls, ...invUrls] = await Promise.all([
            uploadPhotos(sets.cargo.list, dir('cargo')),
            ...bills.map((b, k) => uploadPhotos(invUrls[k], stopPhotoDir(b, next, 'invoice'))),
          ]);
          if (sigUrl) [sigUrl] = await uploadPhotos([sigUrl], dir('signature'));
        }catch(err){
          console.error('[driver] อัปรูปไม่สำเร็จ', err);
        }
        /* ราคาน้ำมัน ปตท. วันนี้ — จดไว้กับจุดส่งเพื่อคิดค่ารอบ (ดึงไม่ได้ = null ไม่ขวางการปิด) */
        const fuel = isStop ? await pttPrices() : null;
        okBtn.textContent = label;
        okBtn.disabled = false;

        try{
          const by = {
            byRole:'driver', byName:actorName(d), byId:d.id, fuel,
            note: receiver ? `${note} · ผู้รับ: ${receiver}` : note,
            photos: urls, geo, signature: sigUrl,
            ...(isStop && outcome ? { outcome } : {}),
          };
          if (isStop){
            const keep = bills.map((b, k) => ({ b, k })).filter(({ b }) => !gone.has(b.id));
            const r = deliverStops(keep.map(({ b, k }) => ({ stopId: b.id, by: { ...by, invoicePhotos: invUrls[k] } })));
            trimDrafts(me, bills.map(b => b.id));   /* บิลอื่นของร้านที่แนบรูปไว้ก่อน (ยังไม่ส่ง) เก็บรูปต่อ */
            close();
            const what = keep.length > 1 ? `${s.dropoff.name} · ${keep.length} บิล` : multi ? `บิล ${invOf(keep[0].b)}` : `จุด ${s.code}`;
            /* จังหวะที่คนขับทำงานเสร็จจริง — ให้รู้สึกว่าสำเร็จ ปิดเที่ยวครบได้ใหญ่กว่าหน่อย */
            if (r.jobClosed) celebrate('ปิดเที่ยวเรียบร้อย', 'ปิดครบทุกจุดแล้ว', { big:true });
            else if (!fail()) celebrate('ส่งมอบสำเร็จ', what);
            toast(r.jobClosed ? 'ปิดครบทุกจุดแล้ว — เที่ยวนี้จบ'
              : fail() ? `บันทึก “${OUTCOMES[outcome]}” · ${what} แล้ว` : `ส่ง${what}แล้ว`, fail() ? 'warn' : 'ok');
            warnStuck([...urls, ...invUrls.flat(), sigUrl]);
            go({ name:'trip', id: opts.jobId });
          } else {
            advanceJob(opts.jobId, next, by);
            close();
            toast(`บันทึก “${META[next].label}” แล้ว`, 'ok');
            warnStuck([...urls, sigUrl]);
            go({ name:'trip', id: opts.jobId });
          }
        }catch(err){ toast(err.message, 'err'); }
      };
    },
  });
}

const defaultNote = (st) => ({
  [S.LOADED]:   'ตรวจนับครบ ล็อกตู้เรียบร้อย',
  [S.DEPARTED]: 'ออกจากคลังแล้ว',
  [S.ARRIVED]:  'ถึงจุดส่ง รอลงของ',
  [S.DELIVERED]:'ลงของครบถ้วน',
}[st] || '');

/* ---------- ตัวควบคุมหน้าจอ --------------------------------
   จำว่าเปิดเที่ยวไหนค้างไว้ คนขับทำงานบนมือถือ สลับแอปไปถ่ายรูปแล้วกลับมา
   เบราว์เซอร์มักโหลดหน้าใหม่ ถ้าเด้งกลับหน้ารายการทุกครั้งจะเสียเวลามาก */
const savedView = loadUI('driver').view;
let view = (savedView && savedView.name === 'trip' && savedView.id)
  ? { name:'trip', id: savedView.id }
  : savedView?.name === 'collect' ? { name:'collect' }    /* รวบรวมคืนบิล — กลับจากกล้องแล้วอยู่หน้าเดิม */
  : { name:'list' };

function render(){
  /* เช็คลิงก์ทุกครั้งที่วาดใหม่ เผื่อทีมคลังปิดลิงก์ระหว่างคนขับใช้งานอยู่ */
  if (TOKEN){
    if (linkState === 'checking') return linkErrorView('กำลังเปิดงาน…', 'รอสักครู่', false);
    if (linkState === 'error') return linkErrorView('ลิงก์นี้ใช้ไม่ได้', linkErr);
    const d = linked();
    if (!d && linkedId && !cloudSynced()) return linkErrorView('กำลังเปิดงาน…', 'รอสักครู่', false);
    if (!d) return linkErrorView('ลิงก์นี้ใช้ไม่ได้',
      'ลิงก์ไม่ครบ หรือถูกยกเลิกแล้ว — ขอลิงก์ใหม่จากทีมคลัง');
    if (!isLinkOpen(d)) return linkErrorView('ลิงก์นี้ถูกปิดแล้ว',
      `ทีมคลังปิดลิงก์ของ ${d.name} แล้ว — ยังมีงาน ขอลิงก์ใหม่จากทีมคลัง`);
    me = d.id;
  }
  if (!me) return STAFF ? pickView() : loginView();
  if (STAFF && !getDriver(me)){
    if (!cloudSynced()) return linkErrorView('กำลังโหลดข้อมูลคนขับ…', 'รอสักครู่', false);
    me = null; dropUI('driver', 'as');
    return pickView();
  }
  /* คนขับที่ล็อกอินค้างไว้ยังไม่มีในข้อมูล — ยังโหลดไม่เสร็จ: รอ · โหลดครบแล้วยังไม่มี: บัญชีถูกลบ/เปลี่ยน ให้ล็อกอินใหม่ */
  if (!TOKEN && !getDriver(me)){
    if (!cloudSynced()) return linkErrorView('กำลังโหลดงานของคุณ…', 'รอสักครู่', false);
    me = null; clearSession();
    reloginNote = 'ไม่พบบัญชีนี้แล้ว — เข้าใหม่ หรือโทรทีมคลัง';
    return loginView();
  }
  if (view.name === 'collect'){
    if (ASSIST && isBillCollector(getDriver(me))){
      return collectView(app, { me, byName: driverName(getDriver(me)), onBack: () => go({ name:'list' }), rerender: render });
    }
    view = { name:'list' };            /* ไม่ใช่ผู้รวบรวมแล้ว (ออฟฟิศเอาติ๊กออก) */
    dropUI('driver', 'view');
  }
  if (view.name === 'trip'){
    if (getJob(view.id)) return tripView(view.id);
    view = { name:'list' };            /* เที่ยวหายไปแล้ว กลับหน้ารายการ */
    dropUI('driver', 'view');
  }
  listView();
}
function go(v){
  view = v;
  if ((v.name === 'trip' && v.id) || v.name === 'collect') saveUI('driver', { view: v });
  else dropUI('driver', 'view');
  syncHistory(v);
  render();
}

/* ---------- ปุ่มย้อนกลับของเบราว์เซอร์ / มือถือ Android ----------
   หน้านี้สลับ รายการเที่ยว ↔ ใบงาน ในหน้าเดียว ถ้าไม่ลงประวัติไว้ ปุ่มย้อนกลับจะพาออกจากหน้า (ไป index.html)
   เปิดใบงาน = เพิ่มประวัติ 1 ขั้น · ย้อนกลับ = กลับรายการเที่ยว
   มีหน้าต่างเปิดอยู่ (ชำระเงิน ถ่ายรูป คืนเลขที่บิล) = ปิดหน้าต่างก่อน ยังอยู่ใบงานเดิม
   URL ไม่เปลี่ยน — ลิงก์คนขับภายนอก (?k=…) ยังใช้ได้เหมือนเดิม */
const HIST = 'ftDriver';
const atTrip = () => ['trip', 'collect'].includes(history.state?.[HIST]);   /* หน้าย่อย (ใบงาน / รวบรวมคืนบิล) */
const tripState = (id) => id === 'collect' ? { [HIST]:'collect' } : ({ [HIST]:'trip', id });

function syncHistory(v){
  if ((v.name === 'trip' && v.id) || v.name === 'collect'){
    const s = tripState(v.name === 'collect' ? 'collect' : v.id);
    if (atTrip()) history.replaceState(s, '');   /* ใบงาน → ใบงาน (เช่น แตะแจ้งเตือนงานใหม่) */
    else history.pushState(s, '');
  } else if (atTrip()){
    history.back();                     /* กลับรายการด้วยปุ่มในหน้า — ใช้ขั้นประวัติเดิม ไม่ซ้อนขั้นใหม่ */
  }
}

addEventListener('popstate', (e) => {
  if (document.querySelector('.scrim')){
    close();
    if (view.name === 'trip') history.pushState(tripState(view.id), '');
    if (view.name === 'collect') history.pushState(tripState('collect'), '');
    return;
  }
  const st = e.state;
  view = (st?.[HIST] === 'trip' && st.id) ? { name:'trip', id: st.id } : st?.[HIST] === 'collect' ? { name:'collect' } : { name:'list' };
  if (view.name !== 'list') saveUI('driver', { view }); else dropUI('driver', 'view');
  render();
});

/* เปิดหน้ามาที่ใบงานค้าง (กลับจากแอปกล้อง / รีเฟรช) — วางรายการไว้ข้างใต้ ย้อนกลับแล้วเจอรายการ */
history.replaceState({ [HIST]:'list' }, '');
if (view.name === 'trip') history.pushState(tripState(view.id), '');
if (view.name === 'collect'){
  history.pushState(tripState('collect'), '');
  if (me) restoreBatch(me).then(got => { if (got){ render(); toast('เปิดรอบส่งคืนที่ค้างไว้ — ทำต่อได้เลย', 'ok'); } });
}

/* ---------- พนักงาน: เลือกคนขับที่จะดู ---------------------- */
function pickView(){
  const drivers = listDrivers({ active:true })
    .map(d => ({ d, open: listJobs({ driverId:d.id }).filter(j => isOpen(j.status)).length }))
    .sort((a, b) => b.open - a.open || a.d.name.localeCompare(b.d.name, 'th'));
  app.innerHTML = `
<div class="driver-card" style="margin-top:14px">
  <div class="driver-hero">
    ${roleChip()}
    <h2 style="margin-top:6px;font-size:21px">เลือกคนขับที่จะดู</h2>
    <p class="tiny" style="color:#9fb2c8;margin-top:2px">เห็นจอเหมือนคนขับ · ไม่ต้องล็อกอินคนขับ</p>
  </div>
  <div class="drv-list-body" style="padding:14px;background:var(--bg)">
    ${drivers.length ? `<div class="drv-jobs">${drivers.map(({ d, open }) => `
      <div class="job-card" data-as="${esc(d.id)}" data-active="${open ? 1 : 0}">
        <div class="row between gap-8">
          <span class="strong" style="font-size:17px">${esc(driverName(d))}</span>
          <span class="pill ${open ? '' : 'pill-plain'}" data-tone="${open ? 'move' : 'grey'}">${open ? `${fmtNum(open)} เที่ยวค้าง` : 'ไม่มีงานค้าง'}</span>
        </div>
        <div class="tiny dim" style="margin-top:4px">${esc(d.truck || '')}${d.plate ? ` · ${esc(d.plate)}` : ''}</div>
      </div>`).join('')}</div>` : `
      <div class="empty"><p class="small">${cloudSynced() ? 'ยังไม่มีคนขับในระบบ' : 'กำลังโหลดรายชื่อคนขับ…'}</p></div>`}
  </div>
</div>`;
}

/* ผูก event ครั้งเดียวที่ตัวคอนเทนเนอร์ — render ทำแค่เปลี่ยน innerHTML */
bindZoom(app);
on(app, 'submit', 'form[data-login]', (e, f) => { e.preventDefault(); doLogin(f); });
on(app, 'click', '[data-logout]', async () => {
  if (await confirmDialog({ title:'ออกจากระบบ', message:'ออกจากระบบและกลับไปหน้าเข้าสู่ระบบ', ok:'ออกจากระบบ' })){
    clearSession();
    forgetOfflineCreds();   /* ลืมบัญชีที่จำไว้ใช้ออฟไลน์ด้วย ไม่งั้นคนที่ถือเครื่องต่อยังเข้าได้ */
    await signOutFirebase();
    me = null; go({ name:'list' });
  }
});
on(app, 'click', '[data-as]', (e, b) => { me = b.dataset.as; saveUI('driver', { as: me }); go({ name:'list' }); });
on(app, 'click', '[data-pick]', () => { me = null; dropUI('driver', 'as'); go({ name:'list' }); });
/* แตะหมายเหตุบนการ์ดเที่ยว = เปิดหมายเหตุ ไม่เปิดเที่ยว */
on(app, 'click', '[data-jobnote]', (e, b) => { const j = getJob(b.dataset.jobnote); if (j?.note) noteDialog(j); });
on(app, 'click', '[data-trip]', (e, b) => {
  if (e.target.closest('[data-jobnote]')) return;
  tripTab = null; sorting = false; findQ = '';   /* เปิดเที่ยวใหม่ = ล้างคำค้น */
  go({ name:'trip', id:b.dataset.trip });
});
on(app, 'click', '[data-back]', () => { sorting = false; go({ name:'list' }); });

/* แท็บ ค้าง / เสร็จแล้ว · โหมดจัดลำดับ · ดูหลักฐานจุดที่ส่งแล้ว */
on(app, 'click', '[data-tab]', (e, b) => {
  const [where, k] = b.dataset.tab.split(':');
  if (where === 'list') listTab = k; else tripTab = k;
  sorting = false;
  render();
});
on(app, 'click', '[data-whreturn]', (e, b) => {
  const x = getShipment(b.dataset.whreturn);
  if (!x) return;
  const bills = whBills(x);
  whReturnDialog(bills, whBy(), render, { reopen: { name:'whreturn', args:{ stopIds: bills.map(v => v.id) } } });
});
on(app, 'click', '[data-payreport]', () => { if (me) payReportDialog(me); });
on(app, 'click', '[data-sorting]', () => { sorting = !sorting; render(); });
on(app, 'click', '[data-addphoto]', (e, b) => {
  const x = getShipment(b.dataset.addphoto);
  if (!x) return;
  /* ร้านหลายบิล → เปิดหน้าหลักฐานให้เลือกบิลก่อน */
  if (b.dataset.many) proofDialog(x, view.id); else addPhotoDialog(x, view.id);
});
on(app, 'click', '[data-preattach]', (e, b) => {
  e.stopPropagation();
  const x = getShipment(b.dataset.preattach);
  if (x) preAttachDialog(x, view.id);
});
on(app, 'click', '[data-proof]', (e, b) => {
  const x = getShipment(b.dataset.proof);
  if (x) proofDialog(x, view.id);
});

/* ขั้นของทั้งเที่ยว — ขึ้นรถ / ออกจากคลัง */
on(app, 'click', '[data-jnext]', (e, b) => {
  const j = getJob(view.id);
  if (j) confirmStep(j, b.dataset.jnext, { jobId: j.id, stops: j.stops });
});
/* บันทึกการชำระเงินของจุดส่ง (ผู้ช่วย หรือคนขับที่ไปคนเดียว) */
on(app, 'click', '[data-pay]', (e, b) => {
  const x = getShipment(b.dataset.pay);
  const j = getJob(view.id);
  if (x && j) payDialog(x, j, {
    byName: actorName(getDriver(me)), byRole: ROLE, byId: me || '', bills: shopBills(x, j.id),
    onDeliver: (s, job) => deliverFor(s, job.id),
    onSaved: render,
  });
});
/* คืนเอกสาร Inv. (ทีละจุด / ทั้งเที่ยว) และปริ้น POD — ผู้ช่วย หรือคนขับที่ไปคนเดียว */
const helperOpts = () => ({ byName: actorName(getDriver(me)), byRole: ROLE, onSaved: render });
on(app, 'click', '[data-invret]', (e, b) => {
  const x = getShipment(b.dataset.invret);
  const j = getJob(view.id);
  if (x && j) invRetDialog(x, j, { ...helperOpts(), bills: shopBills(x, j.id) });
});
on(app, 'click', '[data-invret-all]', () => { const j = getJob(view.id); if (j) invRetAllDialog(j, helperOpts()); });
on(app, 'click', '[data-pod]', (e, b) => {
  const x = getShipment(b.dataset.pod);
  const j = getJob(view.id);
  if (x && j) podStop(x, j, shopBills(x, j.id));
});
on(app, 'click', '[data-pod-trip]', () => { const j = getJob(view.id); if (j) podTrip(j); });
/* ปิดจุดส่ง — ร้านเดียวกันหลายบิลส่งพร้อมกัน (deliverFor) */
on(app, 'click', '[data-stop]', (e, b) => {
  const x = getShipment(b.dataset.stop);
  if (x) deliverFor(x, view.id);
});
/* กลุ่มบิลของร้านเดียวกัน — แตะเพื่อกาง/พับ · ปุ่มใต้กลุ่ม = ส่งของทั้งร้าน */
on(app, 'click', '[data-grp]', (e, b) => {
  const id = b.dataset.grp;
  if (openGroups.has(id)) openGroups.delete(id); else openGroups.add(id);
  render();
});
app.addEventListener('input', (e) => {
  if (!e.target.matches('[data-findq]')) return;
  findQ = e.target.value;
  applyFind();
});
on(app, 'click', '[data-findtab]', (e, b) => { tripTab = b.dataset.findtab; render(); });
on(app, 'click', '[data-collectopen]', () => go({ name:'collect' }));
on(app, 'click', '[data-lostbill]', () => { const j = getJob(view.id); if (j) lostBillDialog(j); });
on(app, 'click', '[data-grpgo]', (e, b) => {
  const x = getShipment(b.dataset.grpgo);
  if (x) deliverFor(x, view.id);
});

/* ---------- แจ้งเตือนงานใหม่ / งานด่วนระหว่างทำงาน ---------------
   แอดมินจ่ายเที่ยวใหม่ หรือเพิ่มจุดส่ง (รวมงานด่วน ⚡) ให้คนขับคนนี้ → เด้งหน้าต่างใหญ่ให้กด "รับทราบ"
   นับจาก "จุดส่ง" ที่ยังไม่ส่งในเที่ยวที่เปิดอยู่ ไม่ใช่จากเที่ยว — งานด่วนที่ถูกรวมเข้าเที่ยวจริง
   (เลขเที่ยวเปลี่ยน แต่จุดส่งเดิม) จะได้ไม่เด้งซ้ำ
   จุดที่เคยเห็นแล้วจำไว้ในเครื่อง แยกตามคนขับ · เปิดครั้งแรกในเครื่องนี้ = จำของเดิมไว้เฉย ๆ ไม่เด้ง
   หน้าต่างนี้ไม่ใช้ modal() — เพราะ modal() ปิดหน้าต่างเดิมทิ้ง คนขับที่กำลังถ่ายรูปอยู่จะเสียรูป */
const seenKey = () => `ft.driver.seen.${me}`;
function loadSeen(){
  try{ const v = JSON.parse(localStorage.getItem(seenKey())); return Array.isArray(v) ? new Set(v) : null; }catch{ return null; }
}
function saveSeen(ids){ try{ localStorage.setItem(seenKey(), JSON.stringify([...ids])); }catch{} }

/** จุดส่งที่ยังไม่ส่งของเที่ยวที่เปิดอยู่ทั้งหมดของคนขับคนนี้ → [{ job, stops }] */
function pendingWork(){
  return listJobs({ driverId: me }).filter(j => isOpen(j.status))
    .map(j => getJob(j.id)).filter(Boolean)
    .map(j => ({ job:j, stops: j.stopList.filter(x => x.status !== S.DELIVERED && x.status !== S.CANCELLED) }))
    .filter(w => w.stops.length);
}

function checkNewWork(){
  if (STAFF || !me || !cloudSynced() || document.querySelector('.newjob')) return;
  const work = pendingWork();
  const all = new Set(work.flatMap(w => w.stops.map(x => x.id)));
  const seen = loadSeen();
  if (!seen){ saveSeen(all); return; }
  const fresh = work.map(w => ({ ...w, stops: w.stops.filter(x => !seen.has(x.id)) })).filter(w => w.stops.length);
  if (!fresh.length) return;
  showNewWork(fresh, () => saveSeen(all));
}

/* ปุ่มในหน้าต่างแจ้งเตือน — ทุกปุ่มบันทึกว่า "เห็นแล้ว" (ack) ก่อนเสมอ หน้าต่างจะได้ไม่เด้งซ้ำ
     ดูรายละเอียดงาน = เปิดเที่ยวแรก (งานด่วนขึ้นก่อน) · แตะเที่ยวในรายการ = เปิดเที่ยวนั้น · รับทราบ = ปิดหน้าต่าง อยู่หน้าเดิม
   การเปิดเที่ยวใช้ go() → tripView() ตัวเดิม ซึ่งเช็คอยู่แล้วว่าเที่ยวนั้นเป็นของคนขับที่ล็อกอิน (hasDriver) */
const NJ_ICON = {
  bell:  SVG('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>'),
  flash: SVG('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
};
function showNewWork(fresh, ack){
  const isRt = (w) => isRtCode(w.job.code) || w.stops.some(x => x.realtime);
  fresh = [...fresh].sort((a, b) => isRt(b) - isRt(a));   /* งานด่วนขึ้นก่อน */
  const urgent = fresh.some(isRt);
  const nStops = fresh.reduce((a, w) => a + w.stops.length, 0);
  const many = fresh.length > 1;
  const box = el(`
<div class="scrim newjob" role="alertdialog" aria-modal="true" aria-labelledby="nj-title">
  <div class="newjob-card" data-urgent="${urgent ? 1 : 0}">
    <div class="newjob-icon" aria-hidden="true">${urgent ? NJ_ICON.flash : NJ_ICON.bell}</div>
    <h2 id="nj-title" class="newjob-title">${urgent ? 'งานด่วนเข้ามา' : 'มีงานใหม่'}</h2>
    <p class="newjob-sub">ทีมคลังเพิ่มงานให้คุณ <b>${fmtNum(nStops)} จุดส่ง</b></p>
    ${many ? `<p class="newjob-hint">แตะเที่ยวที่ต้องการดู</p>` : ''}
    <div class="newjob-list">
      ${fresh.map(w => {
        const rt = isRt(w);
        return `<button type="button" class="newjob-item" data-nj-trip="${esc(w.job.id)}" data-urgent="${rt ? 1 : 0}">
          <span class="row between gap-8">
            <span class="newjob-code">${rt ? '⚡ ' : ''}เที่ยว ${esc(w.job.code)}</span>
            <span class="newjob-n">+${fmtNum(w.stops.length)} จุด</span>
          </span>
          ${w.stops.slice(0, 3).map(x => `<span class="newjob-stop">📍 ${esc(x.dropoff?.name || x.code)}</span>`).join('')}
          ${w.stops.length > 3 ? `<span class="newjob-stop dim">และอีก ${fmtNum(w.stops.length - 3)} จุด</span>` : ''}
          <span class="newjob-go">ดูงานเที่ยวนี้ →</span>
        </button>`;
      }).join('')}
    </div>
    <button class="newjob-ok" type="button" data-nj-view>ดูรายละเอียดงาน${many ? ` · เที่ยว ${esc(fresh[0].job.code)}` : ''}</button>
    <button class="newjob-later" type="button" data-nj-ok>รับทราบ</button>
  </div>
</div>`);
  const finish = () => {
    ack();
    box.remove();
    if (!document.querySelector('.scrim')) document.body.style.overflow = '';
  };
  box.addEventListener('click', (e) => {
    const trip = e.target.closest('[data-nj-trip]');
    if (trip){ finish(); go({ name:'trip', id: trip.dataset.njTrip }); return; }
    if (e.target.closest('[data-nj-view]')){ finish(); go({ name:'trip', id: fresh[0].job.id }); return; }
    if (e.target.closest('[data-nj-ok]')){ finish(); if (!document.querySelector('.scrim')) render(); }
  });
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  box.querySelector('[data-nj-view]').focus();
  try{ navigator.vibrate?.(urgent ? [400, 150, 400, 150, 400] : [300, 120, 300]); }catch{}
  beep(urgent);
}

/* เสียงเตือนสั้น ๆ — เบราว์เซอร์ยอมให้มีเสียงหลังคนขับเคยแตะหน้าจอแล้วเท่านั้น ไม่ได้ก็เงียบไป */
let audio = null;
document.addEventListener('pointerdown', () => { try{ audio ||= new AudioContext(); audio.resume(); }catch{} }, { once:true });
function beep(urgent){
  try{
    if (!audio || audio.state !== 'running') return;
    const times = urgent ? [0, .28, .56] : [0, .3];
    times.forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = urgent ? 1046 : 880;
      g.gain.setValueAtTime(.0001, audio.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.35, audio.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + t + .22);
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .24);
    });
  }catch{}
}

/* ---------- รูปที่อัปไม่ผ่าน (เน็ตหลุดระหว่างอัป / ถ่ายตอนไม่มีเน็ต) ----------
   รูปค้างไว้ในเครื่องก่อน (พักใน IndexedDB — js/photoVault.js) งานบันทึกตามปกติไม่ต้องรอ
   ส่งขึ้นเองอัตโนมัติ ไม่ต้องให้คนขับกด (OFFLINE.md ข้อ 5) — ลองเมื่อ
     · เน็ตกลับมา · เปิดแอปแล้วต่อคลาวด์ได้ · เพิ่งบันทึกงานที่มีรูปค้าง
     · ส่งไม่ผ่าน → ลองใหม่เองเป็นระยะ 20 วิ → 40 → … สูงสุด 5 นาที (สัญญาณแย่ที่เครื่องยังคิดว่ามีเน็ต)
   แถบเหลืองด้านบนบอกความคืบหน้า · ปุ่ม "ส่งเลย" มีไว้ให้คนใจร้อน กดแล้วเห็นรายการรูป
   (งานหนักอยู่ที่ migrateLocalPhotos ใน store.js ตัวเดียวกับหน้า migrate-photos.html) */
const RETRY_ON = !STAFF;   /* พนักงานดูอย่างเดียว — รูปค้างของทุกคนจัดการที่หน้าย้ายรูปแทน */
const photoShell = el('<div class="driver-shell pend-shell" hidden><div class="photo-pend"></div></div>');
const photoBar = photoShell.firstElementChild;
app.before(photoShell);
let retrying = false;
let progress = '';            /* "2 / 5" ระหว่างกำลังส่งอัตโนมัติ */
let autoTimer = null, autoWait = 0;

/** รูปค้างของเครื่องนี้ — ถ้ายังไม่มีคนขับที่ล็อกอิน ถือว่าไม่มี */
const stuckPhotos = () => (RETRY_ON && me ? scanLocalPhotos().items : []);

const slotText = (sl) => sl.field === 'payment' ? `หลักฐานชำระเงิน รอบที่ ${sl.round}`
  : sl.field === 'invret' ? `รูปเอกสารเลขที่บิล ที่คืน รอบที่ ${sl.round}`
  : sl.field === 'signature' ? 'ลายเซ็นผู้รับ'
  : `รูปขั้น "${META[sl.status]?.label || sl.status}"`;

/** หลังกดบันทึก — ถ้ามีรูปที่ยังไม่ขึ้นระบบ บอกให้รู้ตรงนั้นเลย แล้วเริ่มส่งเอง */
function warnStuck(list){
  const n = (list || []).filter(isLocalPhoto).length;
  if (n) toast(`รูป ${n} รูปยังส่งไม่ขึ้น (เน็ตหลุด) — รูปไม่หาย ระบบจะส่งให้เองเมื่อมีเน็ต`, 'warn', 6000);
  paintPhotoBar();
  autoUpload(0);
}

function paintPhotoBar(){
  /* เขียนลงเครื่องไม่สำเร็จ (พื้นที่เต็ม) — สำคัญกว่ารูปค้าง ขึ้นแดงทับ */
  if (RETRY_ON && saveFailed()){
    photoShell.hidden = false;
    photoBar.dataset.online = 'err';
    photoBar.innerHTML = `<span>⛔ <b>บันทึกลงเครื่องไม่สำเร็จ (พื้นที่เต็ม)</b> — อย่าเพิ่งปิดแอป ต่อเน็ตให้งานส่งขึ้นระบบก่อน</span>`;
    return;
  }
  const items = stuckPhotos();
  photoShell.hidden = !items.length;
  if (!items.length) return;
  const online = navigator.onLine !== false;
  photoBar.dataset.online = online ? 1 : 0;
  photoBar.innerHTML = !online
    ? `<span>📵 ไม่มีเน็ต · รูป <b>${fmtNum(items.length)}</b> รูปรอส่ง — รูปไม่หาย มีเน็ตแล้วส่งให้เอง</span>`
    : retrying
    ? `<span>⏫ กำลังส่งรูปขึ้นระบบอัตโนมัติ${progress ? ` <b>${progress}</b>` : '…'}</span>`
    : `<span>⚠️ รูป <b>${fmtNum(items.length)}</b> รูปยังส่งไม่ขึ้น — ระบบจะลองส่งใหม่เอง</span>
       <button type="button" class="btn btn-sm" data-photo-list>ส่งเลย</button>`;
}

/** ส่งรูปค้างทั้งหมด — ใช้ทั้งแบบอัตโนมัติและตอนกดปุ่ม
 *  @returns {Promise<{moved:number, left:number}|null>} null = ยังส่งไม่ได้ตอนนี้ (ไม่มีเน็ต / กำลังส่งอยู่) */
async function sendStuck(onProgress){
  if (retrying || !stuckPhotos().length) return null;
  if (navigator.onLine === false || !cloudReady()) return null;
  retrying = true;
  progress = '';
  paintPhotoBar();
  try{
    const r = await migrateLocalPhotos({
      onProgress: (p) => { progress = `${fmtNum(p.done)} / ${fmtNum(p.total)}`; paintPhotoBar(); onProgress?.(p); },
      /* เน็ตหลุดกลางทาง — หยุดเลย ไม่ต้องไล่ลองทีละใบให้เสียเวลา */
      shouldStop: () => navigator.onLine === false,
      stopOnFail: true,
    });
    return { moved: r.moved, left: stuckPhotos().length };
  }finally{
    retrying = false;
    progress = '';
    paintPhotoBar();
  }
}

/** ส่งอัตโนมัติ — ไม่ผ่านก็นัดลองใหม่เองโดยเว้นช่วงห่างขึ้นเรื่อย ๆ
 *  @param {number} [delay] ms ก่อนเริ่ม (ไม่ระบุ = ตามรอบพักปัจจุบัน) */
function autoUpload(delay){
  if (!RETRY_ON) return;
  clearTimeout(autoTimer);
  autoTimer = setTimeout(async () => {
    if (!stuckPhotos().length){ autoWait = 0; return; }
    let r = null;
    try{ r = await sendStuck(); }
    catch(err){ console.warn('[driver] ส่งรูปอัตโนมัติไม่สำเร็จ', err); }
    if (r && r.moved && !r.left){
      autoWait = 0;
      toast(`ส่งรูปขึ้นระบบครบแล้ว ${fmtNum(r.moved)} รูป`, 'ok', 4000);
      return;
    }
    /* ยังเหลือ — ส่งได้บางส่วนเริ่มนับใหม่ ไม่ได้เลยเว้นห่างขึ้น */
    if (r && r.moved) autoWait = 0;
    autoWait = Math.min(300000, autoWait ? autoWait * 2 : 20000);
    if (r?.moved) toast(`ส่งรูปได้ ${fmtNum(r.moved)} รูป · เหลือ ${fmtNum(r.left)} รูป ระบบจะลองต่อให้เอง`, 'warn', 4000);
    autoUpload(autoWait);
  }, delay ?? autoWait);
}

/** รายการรูปที่ค้าง + ปุ่มส่งเลย — เปิดจากแถบเหลืองเท่านั้น (ไม่เด้งเองแล้ว เพราะระบบส่งให้เอง) */
function retryDialog(note = ''){
  const items = stuckPhotos();
  if (!items.length){ paintPhotoBar(); return; }
  /* จัดกลุ่ม "จุดส่ง X · รูปขั้นส่งมอบ" ให้อ่านง่าย */
  const groups = new Map();
  items.forEach(sl => {
    const k = `${sl.kind} ${sl.code} · ${slotText(sl)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(sl);
  });
  modal({
    title: 'รูปที่ยังส่งไม่ขึ้น',
    reopen: { name:'retry', args:{} },
    body: `
${note ? `<p class="small strong" style="color:var(--amber-dim);margin-bottom:10px">${esc(note)}</p>` : ''}
<p class="small muted">รูปยังอยู่ในเครื่องครบ ระบบจะส่งให้เองเมื่อเน็ตดี — กดส่งเลยได้ถ้าไม่อยากรอ</p>
<div class="pend-list">
  ${[...groups.entries()].map(([k, list]) => `
  <div class="pend-group">
    <div class="small strong">${esc(k)} <span class="tiny dim">(${fmtNum(list.length)} รูป)</span></div>
    <div class="photo-grid" style="margin-top:6px">${list.map((sl, i) =>
      `<img src="${sl.src}" alt="${esc(slotText(sl))} ${i + 1}">`).join('')}</div>
  </div>`).join('')}
</div>
<p class="tiny dim" style="margin-top:10px">ปิดไปก่อนได้ รูปไม่หาย ระบบส่งต่อให้เอง</p>`,
    foot: `<button class="btn btn-ghost" data-close>ปิด</button>
           <button class="btn btn-accent" data-retry>ส่งเลย (${fmtNum(items.length)} รูป)</button>`,
    onMount(root){
      const btn = root.querySelector('[data-retry]');
      btn.onclick = async () => {
        if (retrying) return toast('กำลังส่งอยู่แล้ว — รอสักครู่', 'warn', 3000);
        if (navigator.onLine === false) return toast('ยังไม่มีเน็ต — ระบบจะส่งให้เองเมื่อมีเน็ต', 'warn', 4000);
        if (!cloudReady()) return toast('ยังต่อระบบไม่ได้ — ลองใหม่อีกครั้ง', 'warn', 4000);
        btn.disabled = true;
        root.querySelector('[data-close]').disabled = true;
        try{
          const r = await sendStuck(({ done, total }) => { btn.textContent = `กำลังส่ง ${fmtNum(done)} / ${fmtNum(total)}…`; });
          if (r?.left){
            retryDialog(`ส่งได้ ${fmtNum(r.moved)} รูป · ยังไม่ขึ้น ${fmtNum(r.left)} รูป — ระบบจะลองต่อให้เอง`);
            autoUpload();
          } else {
            close();
            if (r) toast(`ส่งรูปครบแล้ว ${fmtNum(r.moved)} รูป`, 'ok', 4000);
          }
        }catch(err){
          retryDialog(err.message);
          autoUpload();
        }
      };
    },
  });
}

photoBar.addEventListener('click', (e) => { if (e.target.closest('[data-photo-list]')) retryDialog(); });
/* เน็ตกลับมา → ส่งเลย ไม่ต้องถามใคร (เว้น 1.5 วิ ให้สัญญาณนิ่งก่อน) */
addEventListener('online', () => { paintPhotoBar(); autoWait = 0; autoUpload(1500); });
addEventListener('offline', paintPhotoBar);

render();
checkNewWork();
paintPhotoBar();

/* ---------- เปิดกล่องที่ค้างไว้ก่อนหน้าโหลดใหม่ (ui.js reopenDialog) ----------
   เช่น เปิดกล้องแล้วเบราว์เซอร์รีเฟรชหน้า — กลับมาที่กล่องเดิม ขั้นเดิม ของที่ทำไว้ครบ
   ข้อมูลยังไม่มา (คืน false) = ลองใหม่ตอนข้อมูลเข้า (subscribe) สูงสุด 15 วิ */
const REOPEN = {
  deliver({ jobId, stopIds = [] }){
    const bills = stopIds.map(getShipment).filter(Boolean).filter(x => liveStops([x]).length);
    if (!me || !getJob(jobId)) return false;
    if (!bills.length) return true;
    if (view.name !== 'trip' || view.id !== jobId) go({ name:'trip', id: jobId });
    confirmStep(bills[0], S.DELIVERED, { stop:true, jobId, bills });
  },
  jobstep({ jobId, next }){
    const j = getJob(jobId);
    if (!me || !j) return false;
    if (nextOf(myStatus(j)) !== next) return true;       /* ขั้นนี้ฉันทำไปแล้ว */
    if (view.name !== 'trip' || view.id !== jobId) go({ name:'trip', id: jobId });
    confirmStep(j, next, { jobId, stops: j.stops });
  },
  addphoto({ stopId, jobId }){ const x = getShipment(stopId); if (!me || !x) return false; addPhotoDialog(x, jobId); },
  proof({ stopId, jobId }){ const x = getShipment(stopId); if (!me || !x) return false; proofDialog(x, jobId); },
  pick({ stopId, jobId }){ const x = getShipment(stopId); if (!me || !x) return false; if (liveStops(shopBills(x, jobId)).length > 1) pickBills(x, jobId); },
  note({ jobId }){ const j = getJob(jobId); if (!me || !j) return false; if (j.note) noteDialog(j); },
  pay({ stopId }){
    const x = getShipment(stopId), j = x && getJob(x.jobId);
    if (!me || !x || !j) return false;
    payDialog(x, j, { byName: actorName(getDriver(me)), byRole: ROLE, byId: me || '', bills: shopBills(x, j.id),
      onDeliver: (s, job) => deliverFor(s, job.id), onSaved: render });
  },
  invret({ stopId }){
    const x = getShipment(stopId), j = x && getJob(x.jobId);
    if (!me || !x || !j) return false;
    invRetDialog(x, j, { ...helperOpts(), bills: shopBills(x, j.id) });
  },
  invretall({ jobId }){ const j = getJob(jobId); if (!me || !j) return false; invRetAllDialog(j, helperOpts()); },
  retry(){ if (!me) return false; retryDialog(); },
  whreturn({ stopIds = [] }){
    const bills = stopIds.map(getShipment).filter(Boolean).filter(canWhReturn);
    if (!me || !bills.length) return !!me;
    whReturnDialog(bills, whBy(), render, { reopen: { name:'whreturn', args:{ stopIds } } });
  },
  payreport({ driverId }){ if (!me) return false; if (driverId === me) payReportDialog(me); },
};
if (!STAFF){
  const t0 = Date.now();
  const tryReopen = () => reopenDialog(REOPEN) || Date.now() - t0 > 15000;
  if (!tryReopen()){ const off = subscribe(() => { if (tryReopen()) off(); }); }
}
/* เปิดแอปมาแล้วมีรูปค้างจากรอบก่อน → ส่งเอง (ตอนนี้คลาวด์อาจยังต่อไม่เสร็จ รอ 3 วิ ไม่ทันก็เข้ารอบลองใหม่ปกติ) */
autoUpload(3000);
/* ซิงก์ข้ามแท็บ — แต่ไม่รีเฟรชทับตอนกำลังกรอกใน modal (แจ้งเตือนงานใหม่เด้งได้เสมอ ซ้อนบน modal ได้) */
subscribe(() => { if (drag?.on) return; if (!document.querySelector('.scrim')) render(); else liveHook?.(); checkNewWork(); if (!retrying) paintPhotoBar(); });
