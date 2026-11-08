/* ============================================================
   photoVault.js — ที่พักรูปที่ยังไม่ขึ้นคลาวด์ (IndexedDB)
   (OFFLINE.md ข้อ 5)

   ปัญหาเดิม: เน็ตหลุด = รูปตกเป็น base64 (~90 KB/ใบ) ฝังอยู่ในฐานข้อมูล
   ที่เขียนลง localStorage ซึ่งมีเพดาน ~5 MB → ปิด 10 จุด × 4 รูป ก็เต็ม

   ตอนนี้: ก่อนเขียนลง localStorage จะดึง base64 ออกมาเก็บใน IndexedDB (โควตาระดับ GB)
   แล้วฝากไว้แค่ป้าย `idb:<รหัส>` แทน · ตอนอ่านกลับก็สลับป้ายเป็นรูปเดิม
   โค้ดส่วนอื่นยังเห็นรูปเป็น base64 เหมือนเดิมทุกอย่าง (store.js เรียกผ่าน pack/unpack เท่านั้น)

   กันรูปหายตอนสลับที่เก็บ:
     · ใบที่ยังเขียนลง IndexedDB ไม่เสร็จ → pack() ฝาก base64 ไว้ใน localStorage ตามเดิมก่อน
       พอเขียนเสร็จค่อยเรียก onSaved ให้ store.js เขียนซ้ำแบบป้าย (ปิดแอปกลางทางรูปก็ไม่หาย)
     · ลบออกจาก IndexedDB เฉพาะใบที่ฐานข้อมูลไม่อ้างถึงแล้ว (อัปขึ้นคลาวด์ได้ URL แทนแล้ว)
     · เปิด IndexedDB ไม่ได้ (โหมดส่วนตัวบางเบราว์เซอร์) → ทำงานแบบเดิม ฝาก base64 ใน localStorage
   ============================================================ */

const DB_NAME = 'ft.photos';
const STORE = 'photos';
const REF = 'idb:';
/* สั้นกว่านี้ไม่คุ้มย้าย (ลายเซ็นเปล่า ๆ / ไอคอนเล็ก ๆ) */
const MIN_BYTES = 2000;

let idb = null;
const mem = new Map();     /* รหัส → base64 (ทุกใบที่อยู่ใน IndexedDB แล้ว + ที่กำลังเขียน) */
const rev = new Map();     /* base64 → รหัส */
const saved = new Set();   /* รหัสที่เขียนลง IndexedDB สำเร็จแล้ว — ป้ายอ้างได้อย่างปลอดภัย */
const writing = new Set(); /* รหัสที่กำลังเขียน */
let onSaved = () => {};

const isData = (v) => typeof v === 'string' && v.length >= MIN_BYTES && v.startsWith('data:');
const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function tx(mode, fn){
  return new Promise((resolve, reject) => {
    const t = idb.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

function open(){
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('blocked'));
  });
}

function remember(key, dataUrl){
  mem.set(key, dataUrl);
  rev.set(dataUrl, key);
}

/** เปิดที่เก็บแล้วโหลดรูปที่ค้างทั้งหมดขึ้นหน่วยความจำ — store.js รอตัวนี้ก่อนอ่านฐานครั้งแรก
 *  (ปกติมีแค่รูปที่ยังไม่ขึ้นคลาวด์ ไม่กี่สิบใบ) · ช้าเกิน 2 วิ = ไม่ใช้ ทำงานแบบเดิมไปก่อน */
export async function initVault(){
  if (typeof indexedDB === 'undefined') return false;
  try{
    idb = await Promise.race([open(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 2000))]);
    /* อ่านทั้งสองอย่างใน transaction เดียวกัน ลำดับรหัสกับค่าจึงตรงกันแน่นอน */
    const [keys, vals] = await tx('readonly', s => [s.getAllKeys(), s.getAll()]).then(rs => rs.map(r => r.result));
    keys.forEach((k, i) => { remember(k, vals[i]); saved.add(k); });
    return true;
  }catch(err){
    console.warn('[vault] เปิด IndexedDB ไม่ได้ — เก็บรูปค้างใน localStorage แบบเดิม', err);
    idb = null;
    return false;
  }
}

/* tx() คืนตัว request หลัง transaction จบแล้ว — อ่าน .result ได้เลย */
async function getMany(keys){
  return tx('readonly', s => keys.map(k => s.get(k))).then(rs => rs.map(r => r.result));
}

/** ตั้งฟังก์ชันที่เรียกเมื่อรูปชุดใหม่เขียนลง IndexedDB เสร็จ (store.js เขียน localStorage ใหม่แบบป้าย) */
export function setOnSaved(fn){ onSaved = fn; }

export const vaultReady = () => !!idb;

function put(key, dataUrl){
  writing.add(key);
  tx('readwrite', s => s.put(dataUrl, key))
    .then(() => { saved.add(key); writing.delete(key); onSaved(); })
    .catch(err => { writing.delete(key); console.error('[vault] เก็บรูปลง IndexedDB ไม่สำเร็จ — ยังฝากไว้ใน localStorage', err); });
}

/** แปลงฐานข้อมูลเป็น JSON สำหรับ localStorage — base64 ที่เก็บใน IndexedDB แล้วกลายเป็นป้าย
 *  ใบใหม่เริ่มเขียนลง IndexedDB ตรงนี้ (รอบนี้ยังฝาก base64 ไว้ก่อน)
 *  @param {object} db
 *  @param {{refsOnly?:boolean}} opt refsOnly = ใช้ป้ายแม้ยังเขียนไม่เสร็จ (ทางหนีตอน localStorage เต็ม) */
export function pack(db, { refsOnly = false } = {}){
  if (!idb) return JSON.stringify(db);
  const used = new Set();
  const json = JSON.stringify(db, (k, v) => {
    if (!isData(v)) return v;
    let key = rev.get(v);
    if (!key){ key = newKey(); remember(key, v); put(key, v); }
    used.add(key);
    return (saved.has(key) || refsOnly) ? REF + key : v;
  });
  sweep(used, json);
  return json;
}

/* ลบรูปที่ไม่มีใครอ้างแล้ว (อัปขึ้นคลาวด์ได้ URL แทนแล้ว) — เว้นใบที่กำลังเขียนอยู่
   และใบที่ยังมีป้ายอยู่ใน JSON (เผื่อเป็นป้ายที่ยังแปลงกลับไม่ได้) */
let sweepTimer = null;
function sweep(used, json){
  const gone = [...saved].filter(k => !used.has(k) && !writing.has(k) && !json.includes(REF + k));
  if (!gone.length) return;
  clearTimeout(sweepTimer);
  sweepTimer = setTimeout(() => {
    tx('readwrite', s => gone.forEach(k => s.delete(k)))
      .then(() => gone.forEach(k => { rev.delete(mem.get(k)); mem.delete(k); saved.delete(k); }))
      .catch(err => console.warn('[vault] ลบรูปที่อัปแล้วไม่สำเร็จ — ไว้รอบหน้า', err));
  }, 1000);
}

/** อ่าน JSON จาก localStorage กลับเป็นฐานข้อมูล — ป้ายกลายเป็นรูปเดิม
 *  ป้ายที่ไม่มีในหน่วยความจำ (อีกแท็บเพิ่งเขียน) คืน missing ไว้ให้ไปโหลดเพิ่มแล้วอ่านใหม่ */
export function unpack(raw){
  const missing = [];
  const db = JSON.parse(raw, (k, v) => {
    if (typeof v !== 'string' || !v.startsWith(REF)) return v;
    const key = v.slice(REF.length);
    if (mem.has(key)) return mem.get(key);
    missing.push(key);
    return v;
  });
  return { db, missing };
}

/** โหลดรูปที่อีกแท็บเพิ่งเก็บ — คืน true ถ้าได้มาเพิ่มอย่างน้อยหนึ่งใบ */
export async function loadMissing(keys){
  if (!idb || !keys.length) return false;
  try{
    const vals = await getMany(keys);
    let got = 0;
    keys.forEach((k, i) => { if (typeof vals[i] === 'string'){ remember(k, vals[i]); saved.add(k); got++; } });
    if (got < keys.length) console.error('[vault] หารูปใน IndexedDB ไม่เจอ', keys.length - got, 'ใบ');
    return got > 0;
  }catch(err){
    console.error('[vault] โหลดรูปจาก IndexedDB ไม่สำเร็จ', err);
    return false;
  }
}

/** มีรูปที่ยังเขียนลง IndexedDB ไม่เสร็จไหม */
export const vaultBusy = () => writing.size > 0;
