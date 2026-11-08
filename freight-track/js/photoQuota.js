/* ============================================================
   photoQuota.js — นับรูปที่ขึ้น Storage รายเดือน (โควตาลูกค้า 10,000 รูป/เดือน · 31 ต.ค.)

   Storage ไม่มีตัวนับรายเดือนให้ — นับเองตอนอัปสำเร็จ (cloud.js uploadPhoto · bills.js uploadSlip)
   เก็บใน Firestore photoUsage/<yyyy-mm> { count, updatedAt } เดือนละเอกสาร
   รวบหลายรูปเป็นการเขียนครั้งเดียว (รอ 1.5 วิ) · กฎฐานข้อมูลให้บวกทีละ 1–50 เท่านั้น (firestore.rules)
   นับไม่สำเร็จ (ลูกค้าไม่ล็อกอิน / เน็ตหลุด) = ข้ามเงียบ ๆ ไม่กระทบการอัปรูป
   เกินโควตาแล้วยังอัปได้ตามปกติ — รูปเป็นหลักฐานส่งของ แค่เตือนที่หน้า ops + แสดงที่ dashboard
   ============================================================ */

export const PHOTO_LIMIT = 10000;
const MAX_STEP = 50;

const pad = (n) => String(n).padStart(2, '0');
/** เดือนตามเวลาเครื่อง (ไทย) เช่น 2026-11 */
export const monthKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const fbReady = () => new Promise((resolve) => {
  if (window.firebase) return resolve(window.firebase);
  addEventListener('firebase-ready', () => resolve(window.firebase), { once: true });
});

let pending = 0, timer = null;

async function flush(){
  timer = null;
  const fb = await fbReady();
  if (!fb?.ok || !fb.increment) { pending = 0; return; }
  const ref = fb.doc(fb.db, 'photoUsage', monthKey());
  while (pending > 0){
    const n = Math.min(pending, MAX_STEP);
    pending -= n;
    try{
      await fb.setDoc(ref, { count: fb.increment(n), updatedAt: fb.serverTimestamp() }, { merge: true });
    }catch(err){
      console.warn('[photoQuota] นับรูปไม่สำเร็จ — ข้าม', err?.code || err);
    }
  }
}

/** จดว่าเพิ่งอัปรูปขึ้น Storage สำเร็จ n รูป */
export function countPhotos(n = 1){
  if (!(n > 0)) return;
  pending += n;
  clearTimeout(timer);
  timer = setTimeout(flush, 1500);
}

/** ฟังยอดเดือนนี้แบบ realtime — fn(count) · ข้ามเดือนแล้วเปลี่ยนไปฟังเดือนใหม่เอง · คืนฟังก์ชันเลิกฟัง */
export function watchPhotos(fn){
  let off = () => {}, cur = '', stopped = false;
  const listen = async () => {
    const fb = await fbReady();
    if (stopped || !fb?.ok) return;
    const key = monthKey();
    if (key === cur) return;
    off(); cur = key;
    off = fb.onSnapshot(fb.doc(fb.db, 'photoUsage', key),
      (snap) => fn(Number(snap.data()?.count) || 0),
      (err) => console.warn('[photoQuota] อ่านยอดรูปไม่ได้', err?.code || err));
  };
  listen();
  const tick = setInterval(listen, 60000);
  return () => { stopped = true; clearInterval(tick); off(); };
}

/** ระดับเตือน: 0 · 70 · 80 · 90 · 100 */
export function quotaLevel(count){
  const p = count / PHOTO_LIMIT * 100;
  return p >= 100 ? 100 : p >= 90 ? 90 : p >= 80 ? 80 : p >= 70 ? 70 : 0;
}

const fmt = (n) => Number(n).toLocaleString('en-US');

/** ข้อความเตือนหน้า ops — ต่ำกว่า 70% = '' */
export function quotaWarning(count){
  const lv = quotaLevel(count);
  if (!lv) return '';
  if (lv === 100){
    const over = count - PHOTO_LIMIT;
    return over > 0 ? `เดือนนี้ใส่รูปใน storage เกินไปแล้ว ${fmt(over)} รูป`
                    : `เดือนนี้ใส่รูปใน storage ครบ ${fmt(PHOTO_LIMIT)} รูปแล้ว`;
  }
  return `เดือนนี้ใส่รูปใน storage ไปแล้ว ${fmt(count)} รูป (${Math.floor(count / PHOTO_LIMIT * 100)}%) จาก ${fmt(PHOTO_LIMIT)} รูป`;
}
