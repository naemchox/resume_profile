/* ============================================================
   uiState.js — จำสิ่งที่ค้างอยู่บนหน้าจอ กันหายตอนหน้ารีเฟรช

   ข้อมูลของระบบอยู่ใน localStorage อยู่แล้วจึงไม่หาย
   ที่หายคือ "สิ่งที่กำลังทำค้างไว้" — แท็บที่เลือก คำค้น หน้าต่างที่เปิด
   และตัวเลขที่พิมพ์ไปครึ่งทางแต่ยังไม่ได้กดบันทึก

   หน้าเว็บรีโหลดเองได้หลายทางโดยที่เราไม่ได้สั่ง
     · Live Server รีโหลดเมื่อไฟล์ในโฟลเดอร์เปลี่ยน (โฟลเดอร์นี้อยู่ใน Google Drive)
     · Chrome ทิ้งแท็บที่เปิดค้างนาน ๆ เพื่อคืนหน่วยความจำ
     · เผลอกด F5 หรือกดปุ่มย้อนกลับ

   เก็บใน sessionStorage ไม่ใช่ localStorage เพราะ
     · แยกกันคนละแท็บ เปิดสองแท็บทำคนละงานไม่ตีกัน
     · ปิดแท็บแล้วหายเอง ไม่ค้างเป็นขยะข้ามวัน
   ============================================================ */

const keyOf = (page) => `ft.ui.${page}`;

/** อ่านสถานะที่จำไว้ของหน้านั้น */
export function loadUI(page){
  try{ return JSON.parse(sessionStorage.getItem(keyOf(page)) || '{}') || {}; }
  catch(e){ return {}; }
}

/** จำเพิ่ม/ทับเฉพาะคีย์ที่ส่งมา (ไม่ลบคีย์อื่น) */
export function saveUI(page, patch){
  try{
    sessionStorage.setItem(keyOf(page), JSON.stringify({ ...loadUI(page), ...patch }));
  }catch(e){
    /* พื้นที่เต็ม (เช่นมีรูปภาพปนมา) — ไม่ใช่เรื่องคอขาดบาดตาย ปล่อยผ่าน */
    console.warn('[uiState] จำสถานะหน้าจอไม่ได้', e);
  }
}

/** ลืมเฉพาะบางคีย์ เช่นพอกดบันทึกเสร็จแล้วก็ไม่ต้องจำร่างอีก */
export function dropUI(page, ...fields){
  const s = loadUI(page);
  fields.forEach(f => delete s[f]);
  try{ sessionStorage.setItem(keyOf(page), JSON.stringify(s)); }catch(e){}
}

/** รวบการพิมพ์ถี่ ๆ ให้เขียนรอบเดียว */
export function debounce(fn, ms = 300){
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
