/* ============================================================
   driverSheet.js — ทะเบียนคนขับผูกกับ Google Sheet

   ชีตเดียวกับที่คนขับใช้ล็อกอิน (sheetAuth.js อ่านชีตนี้เหมือนกัน)
     A = ID (ใช้ล็อกอิน)   B = PASSWORD   C = ชื่อ–นามสกุล
     D = ทะเบียนรถ         E = เบอร์โทร   F = เลขที่บัญชี   G = ธนาคาร
     H = ประเภทคนขับ (รถประจำ / รถนอก — ว่าง = รถประจำ)
     (F/G อยู่ในชีตกับในเครื่องเท่านั้น ไม่ขึ้นฐานข้อมูล — เหมือน PIN)

   สองทิศทาง
     อ่าน  — ผ่าน Apps Script (action:'roster' · เฉพาะพนักงานที่ล็อกอิน) ชีตจึงไม่ต้องเปิดสาธารณะ
             (ทางเดิมที่อ่าน gviz CSV ตรงจากเบราว์เซอร์ถูกเอาออกแล้ว — ชีตรหัสเป็นส่วนตัว)
     เขียน — ผ่าน Apps Script Web App ที่ deploy จากชีตนั้น (ดู AppsScript-drivers.gs)
             เพราะหน้าเว็บนิ่ง ๆ เขียน Google Sheet ตรง ๆ ไม่ได้ ต้องมีตัวกลางเสมอ
             ยังไม่ได้ตั้งลิงก์ = เพิ่มคนขับในเว็บได้ตามปกติ แต่จะยังไม่ขึ้นชีต
             ระบบจะจำไว้ว่าใครยังไม่ได้ซิงก์ แล้วดันขึ้นให้ทีเดียวตอนตั้งลิงก์เสร็จ
   ============================================================ */

import { listDrivers, createDriver, updateDriver, normName, driverFleet, FLEET_OUT, FLEET_OWN } from './store.js';
import { apiUrl, hasApi, setLocalApiUrl, apiPost } from './api.js';

export const SHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';
export const SHEET_LINK = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;

/* ---------- ลิงก์ Apps Script (ย้ายไปอยู่ api.js — config.js ก่อน แล้วค่อยลิงก์ในเครื่อง) ---------- */
export const sheetApiUrl = apiUrl;
export const hasSheetApi = hasApi;
export const setSheetApiUrl = setLocalApiUrl;

/** อ่านทุกแถวจากชีต ผ่าน Apps Script (พนักงานที่ล็อกอินเท่านั้น) — คนขับหนึ่งคนต่อหนึ่งแถว
 *  @returns {Promise<{id:string,pass:string,name:string,plate:string,phone:string,bankAccount:string,bankName:string,fleet:string}[]>} */
export async function fetchSheetRows(){
  if (!hasApi()) throw new Error('ยังไม่ได้ตั้งลิงก์ Apps Script — อ่านชีตรหัสคนขับไม่ได้');
  const data = await apiPost({ action:'roster' });
  return (data.drivers || []).map(r => ({
    id:    String(r.id ?? '').trim(),
    pass:  String(r.pass ?? '').trim(),
    name:  normName(r.name),
    plate: normName(r.plate),
    phone: normName(r.phone),
    bankAccount: String(r.bankAccount ?? '').trim(),
    bankName:    normName(r.bankName),
    fleet:       normName(r.fleet) === FLEET_OUT ? FLEET_OUT : FLEET_OWN,
    fuelType:    normName(r.fuelType),
  })).filter(a => a.name);
}

/* ---------- ชีต → เครื่อง ----------------------------------- */
/**
 * ดึงจากชีตมาอัปเดตทะเบียนในเครื่อง — ของใหม่เพิ่มให้ ของเดิมแก้ให้ตรงชีต
 * จับคู่ด้วย ID ในช่อง A ก่อน ถ้าไม่มีค่อยเทียบชื่อ (คนที่เพิ่มในเว็บก่อนมีชีต)
 * @returns {Promise<{added:string[], updated:string[], failed:{name:string,msg:string}[], total:number}>}
 */
export async function syncFromSheet(){
  const rows = await fetchSheetRows();
  const local = listDrivers();
  const bySheetId = new Map(local.filter(d => d.sheetId).map(d => [String(d.sheetId), d]));
  const byName    = new Map(local.map(d => [d.name.toLowerCase(), d]));

  const out = { added: [], updated: [], failed: [], total: rows.length };

  for (const r of rows){
    const hit = (r.id && bySheetId.get(r.id)) || byName.get(r.name.toLowerCase()) || null;
    /* ทะเบียนในชีตยังว่างได้ จึงสั่ง plateRequired:false เฉพาะทางนี้
       ส่วนการเพิ่มมือในหน้าเว็บยังบังคับกรอกทะเบียนเหมือนเดิม */
    const patch = {
      name: r.name,
      plate: r.plate,
      phone: r.phone,
      bankAccount: r.bankAccount,
      bankName: r.bankName,
      fleet: r.fleet,
      fuelType: r.fuelType,
      sheetId: r.id,
      plateRequired: false,
    };
    if (/^\d{4,6}$/.test(r.pass)) patch.pin = r.pass;

    try{
      if (hit){
        const same = hit.name === r.name
                  && normName(hit.plate || '') === r.plate
                  && normName(hit.phone || '') === r.phone
                  && String(hit.bankAccount || '') === r.bankAccount
                  && normName(hit.bankName || '') === r.bankName
                  && driverFleet(hit) === r.fleet
                  && normName(hit.fuelType || '') === r.fuelType
                  && String(hit.sheetId || '') === r.id;
        if (same) continue;
        updateDriver(hit.id, patch);
        out.updated.push(r.name);
      } else {
        createDriver({ ...patch, active: true });
        out.added.push(r.name);
      }
    }catch(err){
      out.failed.push({ name: r.name, msg: err.message });
    }
  }
  return out;
}

/* ---------- เครื่อง → ชีต ----------------------------------- */
const callApi = (payload) => apiPost(payload);

/** เขียนคนขับหนึ่งคนขึ้นชีต — มี sheetId แล้วคือแก้แถวเดิม ไม่มีคือต่อแถวใหม่
 *  @returns {Promise<{sheetId:string}>} ID ที่ชีตให้มา เก็บกลับไว้ในเครื่องเพื่อจับคู่รอบหน้า */
export async function pushDriver(d){
  const data = await callApi({
    action: 'upsert',
    driver: {
      sheetId: d.sheetId || '',
      pass:    d.pin || '',
      name:    d.name,
      plate:   d.plate || '',
      phone:   d.phone || '',
      /* ว่าง = Apps Script ใช้ค่าเดิมในชีต (เครื่องที่ยังไม่เคยดึงจากชีตจะไม่มีค่านี้) */
      bankAccount: d.bankAccount || '',
      bankName:    d.bankName || '',
      fleet:       driverFleet(d),
      /* ว่าง = Apps Script ใช้ค่าเดิมในชีต (ช่อง I) */
      fuelType:    d.fuelType || '',
    },
  });
  const sheetId = String(data.id || '');
  /* จำ ID จากชีตไว้ รอบหน้าจะได้แก้แถวเดิมแทนที่จะเพิ่มซ้ำ */
  if (sheetId && sheetId !== String(d.sheetId || '')){
    try{ updateDriver(d.id, { sheetId, plateRequired: false }); }catch(e){ console.warn('[driverSheet]', e); }
  }
  return { sheetId };
}

/** คนที่ยังไม่ได้ขึ้นชีต (เพิ่มในเว็บตอนยังไม่ได้ตั้งลิงก์ หรือตอนเน็ตหลุด) */
export const pendingDrivers = () => listDrivers().filter(d => !d.sheetId);

/** ดันคนที่ยังค้างขึ้นชีตให้หมด — ใช้ตอนเพิ่งตั้งลิงก์เสร็จ */
export async function pushPending(){
  const out = { pushed: [], failed: [] };
  for (const d of pendingDrivers()){
    try{ await pushDriver(d); out.pushed.push(d.name); }
    catch(err){ out.failed.push({ name: d.name, msg: err.message }); }
  }
  return out;
}
