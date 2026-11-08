/* ============================================================
   sheetAuth.js — ตรวจ ID / PASSWORD ของคนขับจาก Google Sheet
   ชีต: A = ID · B = PASSWORD · C = ชื่อ–นามสกุล · D = ทะเบียนรถ · E = เบอร์โทร

   ตัวอ่านชีตย้ายไปอยู่ที่ driverSheet.js ที่เดียวแล้ว (เลข SHEET_ID
   และตัวแกะ CSV ก็อยู่ที่นั่น) ไฟล์นี้เหลือแค่เรื่องตรวจรหัสผ่าน
   เปลี่ยนชีตทีหลังจึงแก้ที่เดียว ไม่ต้องกลัวหน้าล็อกอินคนขับพังตามหลัง

   ทางหลัก (ตั้ง Apps Script แล้ว): ส่ง ID/รหัสไปตรวจที่ Apps Script (action:'driverLogin')
     Apps Script อ่านชีตเอง คืนบัญชี + รหัสคนขับในระบบ + บัตรผ่าน Firebase (custom token)
     → เบราว์เซอร์ไม่เคยเห็นรหัสของคนอื่น และชีตเลิกเปิดสาธารณะได้
   ทางเดิมที่อ่านชีตจากเบราว์เซอร์ (ต้องเปิดชีตสาธารณะ) ถูกเอาออกแล้ว 13 ต.ค. 2026 — ชีตรหัสเป็นส่วนตัว
   ============================================================ */

import { hasApi, apiPost } from './api.js';
import { signInDriverToken } from './auth.js';
export { normName } from './store.js';

/** @typedef {{id:string, pass:string, name:string, plate:string, phone:string}} Account */

/* ---------- ล็อกอินตอนไม่มีเน็ต -----------------------------
   คนขับถึงโรงพยาบาลแล้วไม่มีสัญญาณ ต้องยังเข้าแอปได้ (OFFLINE.md ข้อ 6)
   แต่ห้ามเก็บรหัสผ่านไว้ในเครื่องเป็นข้อความธรรมดา ถ้ามือถือหายจะซ้ำเติมปัญหา

   จึงเก็บแค่ค่า hash ของรหัส พร้อมเกลือ (salt) ที่สุ่มแยกต่อเครื่อง
   ค่า hash ย้อนกลับเป็นรหัสไม่ได้ และเครื่องอื่นเอาไปใช้ต่อไม่ได้เพราะเกลือคนละตัว

   สำคัญ: วิธีนี้ "ไม่ได้เปิดสิทธิ์ใหม่" ให้ใคร — ล็อกอินออฟไลน์ได้เฉพาะบัญชีที่
   เคยล็อกอินสำเร็จบนเครื่องนี้มาก่อนเท่านั้น และหมดอายุใน 14 วัน
   ------------------------------------------------------------ */
const CRED_KEY = 'ft.driver.creds.v1';
const SALT_KEY = 'ft.driver.salt.v1';
const OFFLINE_TTL = 14 * 24 * 60 * 60 * 1000;

/** เกลือประจำเครื่อง สุ่มครั้งเดียวแล้วใช้ตลอด */
function deviceSalt(){
  let salt = null;
  try{ salt = localStorage.getItem(SALT_KEY); }catch(e){}
  if (salt) return salt;
  const a = new Uint8Array(16);
  (globalThis.crypto?.getRandomValues
    ? crypto.getRandomValues(a)
    : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); }));
  salt = [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  try{ localStorage.setItem(SALT_KEY, salt); }catch(e){}
  return salt;
}

async function hashPass(id, pass){
  const text = `${deviceSalt()}:${String(id).toLowerCase()}:${pass}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const readCreds = () => {
  try{ return JSON.parse(localStorage.getItem(CRED_KEY) || '[]'); }catch(e){ return []; }
};

/** จำบัญชีที่ล็อกอินผ่านแล้ว ไว้ใช้ตอนไม่มีเน็ต — เก็บเฉพาะ hash ไม่เก็บรหัสจริง */
async function rememberForOffline(acct, pass){
  if (!globalThis.crypto?.subtle) return;          /* หน้าเว็บที่ไม่ได้เปิดผ่าน https */
  try{
    const hash = await hashPass(acct.id, pass);
    const rest = readCreds().filter(c => String(c.id).toLowerCase() !== String(acct.id).toLowerCase());
    rest.push({ id: acct.id, name: acct.name, plate: acct.plate, phone: acct.phone,
                hash, at: Date.now() });
    localStorage.setItem(CRED_KEY, JSON.stringify(rest));
  }catch(e){ console.warn('[auth] จำบัญชีไว้ใช้ออฟไลน์ไม่สำเร็จ', e); }
}

/** ลืมบัญชีที่เคยจำไว้ — ใช้ตอนออกจากระบบ */
export function forgetOfflineCreds(){
  try{ localStorage.removeItem(CRED_KEY); }catch(e){}
}

async function verifyOffline(uid, pw){
  if (!globalThis.crypto?.subtle) return null;
  const hit = readCreds().find(c => String(c.id).toLowerCase() === uid.toLowerCase());
  if (!hit) return null;
  if (Date.now() - (hit.at || 0) > OFFLINE_TTL){
    throw new Error('ออฟไลน์อยู่ และข้อมูลล็อกอินที่จำไว้ในเครื่องหมดอายุแล้ว — ต่อเน็ตแล้วล็อกอินใหม่หนึ่งครั้ง');
  }
  const hash = await hashPass(uid, pw);
  if (hash !== hit.hash) return null;              /* รหัสผิด — ตอบเหมือนตอนออนไลน์ */
  return { id: hit.id, pass: '', name: hit.name, plate: hit.plate, phone: hit.phone, offline: true };
}

/** ตรวจ ID/PASSWORD — คืนบัญชีที่ตรง หรือ null ถ้าไม่ตรง
 *  ตรวจที่ Apps Script เท่านั้น (ชีตรหัสปิดเป็นส่วนตัวแล้ว เบราว์เซอร์อ่านชีตตรงไม่ได้)
 *  ต่อ Apps Script ไม่ได้ (ไม่มีเน็ต / สคริปต์ล่ม) → ถอยไปตรวจกับบัญชีที่เคยล็อกอินสำเร็จบนเครื่องนี้
 *  @returns {Promise<Account|null>} */
export async function verify(id, pass){
  const uid = String(id ?? '').trim();
  const pw  = String(pass ?? '').trim();
  if (!uid || !pw) return null;
  if (!hasApi()) throw new Error('ยังไม่ได้ตั้งลิงก์ Apps Script — ติดต่อทีมคลัง');

  if (navigator.onLine !== false){
    let data = null;
    try{ data = await apiPost({ action:'driverLogin', id:uid, pass:pw }, { auth:false }); }
    catch(err){
      if (err.code === 'bad-login') return null;                       /* รหัสผิด */
      /* เน็ตหลุด / Apps Script ตอบไม่ทัน → ล็อกอินออฟไลน์ · อย่างอื่น (ล็อก ปิดใช้งาน ไม่มีในระบบ) แจ้งตรง ๆ */
      if (!/ต่อ Apps Script ไม่ได้|ตอบไม่ทัน/.test(err.message)) throw err;
    }
    if (data?.account){
      if (data.token) await signInDriverToken(data.token);
      const acct = { ...data.account, driverId:data.driverId || '', tokenIssued:!!data.token };
      await rememberForOffline(acct, pw);
      return acct;
    }
  }

  /* ---- ออฟไลน์ ---- */
  const offline = await verifyOffline(uid, pw);
  /* ล็อกอินออฟไลน์ไม่มีบัตรผ่าน — ติดธงไว้ให้หน้าคนขับขอล็อกอินใหม่ทันทีที่มีเน็ต */
  if (offline) return { ...offline, tokenIssued: true };
  /* แยกให้ชัดระหว่าง "พิมพ์รหัสผิด" กับ "เครื่องนี้ไม่เคยรู้จัก ID นี้" */
  const known = readCreds().some(c => String(c.id).toLowerCase() === uid.toLowerCase());
  if (known) return null;
  throw new Error('ออฟไลน์อยู่ หรือต่อระบบไม่ได้ และเครื่องนี้ยังไม่เคยล็อกอินด้วยรหัสคนขับนี้สำเร็จมาก่อน — ต่อเน็ตแล้วลองใหม่');
}
