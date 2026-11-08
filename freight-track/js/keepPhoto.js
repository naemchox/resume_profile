/* ============================================================
   keepPhoto.js — เก็บรูปที่คนขับ/ผู้ช่วยถ่ายไว้ในเครื่องด้วย (เหมือนถ่ายรูปปกติ)

   เว็บเขียนลงคลังรูปตรง ๆ ไม่ได้ จึงทำเท่าที่เบราว์เซอร์ยอม:
     · Android / อื่น ๆ → ดาวน์โหลดไฟล์ต้นฉบับ (ยังไม่ย่อ) ทันทีหลังถ่าย
       ไปอยู่โฟลเดอร์ Download → แกลเลอรี/Google Photos เห็นในอัลบั้ม "Download"
       ครั้งแรก Chrome อาจถาม "ดาวน์โหลดหลายไฟล์" → กดอนุญาตครั้งเดียว
     · iPhone / iPad → ดาวน์โหลดเองไม่ได้ ขึ้นปุ่ม "บันทึกรูปลงเครื่อง" ใต้กริดรูป
       กดแล้วเปิดหน้าแชร์ → เลือก "บันทึกภาพ" (ต้องเป็นการกดของคน เบราว์เซอร์บังคับ)

   เก็บเฉพาะรูปที่เพิ่งถ่าย (ไฟล์อายุไม่เกิน FRESH_MS) — รูปที่เลือกจากคลังอยู่ในเครื่องแล้ว ไม่ซ้ำ
   ทำเฉพาะหน้า driver.html / helper.html — หน้าออฟฟิศที่ใช้หน้าต่างเดียวกันไม่ดาวน์โหลด
   ============================================================ */

const FRESH_MS = 3 * 60 * 1000;
const PAGES = new Set(['driver.html', 'helper.html']);

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const pad2 = (n) => String(n).padStart(2, '0');
function fileName(f, label, i){
  const d = new Date(f.lastModified || Date.now());
  const ext = (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `FT_${stamp}_${label}${i ? `_${i + 1}` : ''}.${ext}`;
}

function download(f, name){
  const url = URL.createObjectURL(f);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* iPhone: รูปที่รอให้กดบันทึก แยกตามปุ่ม (กริดรูปแต่ละชุด) */
const waiting = new WeakMap();

function iosButton(anchor){
  let btn = anchor.nextElementSibling;
  if (btn?.dataset.keepPhoto == null){
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost';
    btn.dataset.keepPhoto = '';
    btn.style.cssText = 'margin-top:8px;width:100%';
    anchor.after(btn);
    btn.addEventListener('click', async () => {
      const files = waiting.get(btn) || [];
      if (!files.length) return;
      try{
        await navigator.share({ files });
        waiting.set(btn, []);
        btn.remove();
      }catch(err){
        if (err?.name === 'AbortError') return;   /* กดยกเลิกเอง — ปุ่มยังอยู่ กดใหม่ได้ */
        files.forEach((f) => download(f, f.name));  /* แชร์ไฟล์ไม่ได้ → ลองดาวน์โหลดแทน */
        waiting.set(btn, []);
        btn.remove();
      }
    });
  }
  return btn;
}

/**
 * เรียกตอนช่องถ่ายรูปได้ไฟล์มา (ก่อนล้าง input.value)
 * @param {FileList|File[]} list  ไฟล์จาก input
 * @param {string} label          ชื่อสั้น ๆ ใส่ในชื่อไฟล์ เช่น สินค้า / Invoice / สลิป
 * @param {Element} anchor        กริดรูปของชุดนี้ — iPhone วางปุ่มบันทึกไว้ใต้ตัวนี้
 */
export function keepPhotos(list, label, anchor){
  if (!PAGES.has(location.pathname.split('/').pop() || '')) return;
  const now = Date.now();
  const fresh = [...list].filter((f) => f.type.startsWith('image/') && now - (f.lastModified || now) < FRESH_MS);
  if (!fresh.length) return;
  const named = fresh.map((f, i) => new File([f], fileName(f, label, fresh.length > 1 ? i : 0), { type: f.type, lastModified: f.lastModified }));

  if (isIOS() && navigator.canShare?.({ files: named }) && anchor){
    const btn = iosButton(anchor);
    const files = [...(waiting.get(btn) || []), ...named];
    waiting.set(btn, files);
    btn.textContent = `💾 บันทึกรูปลงเครื่อง (${files.length})`;
    return;
  }
  /* เว้นจังหวะทีละใบ — Chrome ทิ้งดาวน์โหลดที่ยิงพร้อมกันหลายไฟล์ */
  named.forEach((f, i) => setTimeout(() => download(f, f.name), i * 400));
}
