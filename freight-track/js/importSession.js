/* ============================================================
   importSession.js — จำงานที่กำลังตรวจทานไว้ กันหน้าเว็บรีโหลดแล้วข้อมูลหาย

   ทำไมต้องมี: ตารางตรวจทานทั้งหมดอยู่ในตัวแปรในหน่วยความจำ
   หน้าเว็บรีโหลดเมื่อไหร่ก็หายเกลี้ยง ซึ่งรีโหลดเองได้หลายทาง
     · Live Server รีโหลดอัตโนมัติเมื่อมีไฟล์ในโฟลเดอร์เปลี่ยน
       (โฟลเดอร์นี้อยู่ใน Google Drive ที่ซิงก์ไฟล์เองตลอด)
     · Chrome ทิ้งแท็บที่เปิดค้างไว้นาน ๆ เพื่อคืนหน่วยความจำ
     · เผลอกด F5 หรือปิดแท็บ

   แบ่งที่เก็บตามขนาด
     sessionStorage — ตารางที่ตรวจทานไว้ (เล็ก อ่านเขียนเร็ว หายเมื่อปิดแท็บ)
     IndexedDB      — ไฟล์ Excel ต้นฉบับ (ใหญ่เกิน sessionStorage)
                      เก็บไว้เพื่อให้ยังเปลี่ยนชีต/ผังคอลัมน์
                      และดาวน์โหลดไฟล์ที่อัปเดตคนขับได้หลังรีโหลด
   ============================================================ */

const SKEY  = 'ft.import.v1';     /* ตารางตรวจทาน */
const MKEY  = 'ft.manual.v1';     /* ฟอร์มกรอกมือท้ายหน้า */
const DB    = 'ft-import';
const STORE = 'file';
const FILE_ID = 'current';

/* ---------- ตารางตรวจทาน (sessionStorage) ------------------ */

/** เขียนทันทีถี่ ๆ ไม่คุ้ม — รวบไว้เขียนรอบเดียวหลังหยุดนิ่ง */
let timer = null;
export function saveSession(data, delay = 400){
  clearTimeout(timer);
  timer = setTimeout(() => {
    try{
      sessionStorage.setItem(SKEY, JSON.stringify({ ...data, savedAt: Date.now() }));
    }catch(e){
      /* พื้นที่เต็ม (ไฟล์ใหญ่มาก) — ไม่ต้องล้มทั้งหน้า แค่จำไม่ได้รอบนี้ */
      console.warn('[importSession] จำตารางไว้ไม่ได้', e);
    }
  }, delay);
}

export function loadSession(){
  try{
    const raw = sessionStorage.getItem(SKEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return Array.isArray(s?.drafts) && s.drafts.length ? s : null;
  }catch(e){
    console.warn('[importSession] อ่านของที่จำไว้ไม่ได้', e);
    return null;
  }
}

export function clearSession(){
  clearTimeout(timer);
  try{ sessionStorage.removeItem(SKEY); }catch(e){}
  return delFile();
}

/* ---------- ฟอร์มกรอกมือ (sessionStorage) ------------------ */
export function saveManual(values){
  try{ sessionStorage.setItem(MKEY, JSON.stringify(values)); }catch(e){}
}
export function loadManual(){
  try{ return JSON.parse(sessionStorage.getItem(MKEY) || 'null'); }catch(e){ return null; }
}
export function clearManual(){
  try{ sessionStorage.removeItem(MKEY); }catch(e){}
}

/* ---------- ไฟล์ต้นฉบับ (IndexedDB) ------------------------ */
function openDB(){
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('เบราว์เซอร์นี้ไม่มี IndexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function tx(mode, fn){
  return openDB().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror    = () => { db.close(); reject(t.error); };
  }));
}

/** เก็บไฟล์ที่เพิ่งลากเข้ามา ไว้ใช้ตอนกู้คืนหลังรีโหลด */
export async function saveFile(file){
  try{
    const buf = await file.arrayBuffer();
    await tx('readwrite', st => st.put({ name: file.name, buf }, FILE_ID));
  }catch(e){ console.warn('[importSession] เก็บไฟล์ต้นฉบับไม่ได้', e); }
}

/** @returns {Promise<{name:string, buf:ArrayBuffer}|null>} */
export async function loadFile(){
  try{ return (await tx('readonly', st => st.get(FILE_ID))) || null; }
  catch(e){ console.warn('[importSession] อ่านไฟล์ต้นฉบับไม่ได้', e); return null; }
}

export async function delFile(){
  try{ await tx('readwrite', st => st.delete(FILE_ID)); }catch(e){}
}
