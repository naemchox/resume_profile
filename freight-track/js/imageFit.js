/* ============================================================
   imageFit.js — บีบรูปให้ไม่เกิน 300 KB ก่อนขึ้น Firebase
   ทุกทางที่รูปขึ้นคลาวด์ (Storage หรือ base64 ใน Firestore) ต้องผ่านที่นี่
   รูปที่เล็กกว่า 300 KB อยู่แล้วคืนตัวเดิม ไม่แตะ
   ============================================================ */

export const MAX_IMAGE_BYTES = 300 * 1024;

/** ขนาดจริง (byte) ของข้อมูลใน data URL — base64 ใหญ่กว่าของจริง 4/3 เท่า */
export function dataUrlBytes(u){
  const b64 = u.slice(u.indexOf(',') + 1);
  return Math.floor(b64.length * 3 / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);
}

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('เปิดรูปไม่สำเร็จ'));
  img.src = src;
});

function draw(img, scale, quality){
  const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
  const cv = Object.assign(document.createElement('canvas'), { width:w, height:h });
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h);   /* PNG โปร่งใส → พื้นขาว ไม่ใช่ดำ */
  cx.drawImage(img, 0, 0, w, h);
  return cv.toDataURL('image/jpeg', quality);
}

/**
 * บีบ data URL รูปให้ไม่เกิน maxBytes — ลดคุณภาพก่อน (ภาพยังคมเท่าเดิม) ไม่พอค่อยลดขนาดภาพ
 * ไม่ใช่รูป / เล็กพออยู่แล้ว → คืนตัวเดิม
 */
export async function fitDataUrl(dataUrl, maxBytes = MAX_IMAGE_BYTES){
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return dataUrl;
  if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
  const img = await loadImage(dataUrl);
  let scale = 1, quality = 0.8, out = dataUrl;
  for (let i = 0; i < 20; i++){
    out = draw(img, scale, quality);
    const size = dataUrlBytes(out);
    if (size <= maxBytes) return out;
    if (quality > 0.55) quality -= 0.1;
    else scale *= Math.max(0.5, Math.min(0.9, Math.sqrt(maxBytes / size)));   /* ขนาดไฟล์แปรตามพื้นที่ภาพ */
  }
  return out;
}

/** แบบไฟล์ (File/Blob) — ใช้กับ uploadBytes · ไฟล์ที่ไม่ใช่รูป (เช่น PDF) คืนตัวเดิม */
export async function fitImageFile(file, maxBytes = MAX_IMAGE_BYTES){
  if (!file || !file.type?.startsWith('image/') || file.size <= maxBytes) return file;
  const src = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    fr.readAsDataURL(file);
  });
  const out = await fitDataUrl(src, maxBytes);
  const blob = await (await fetch(out)).blob();
  const name = (file.name || 'image').replace(/\.[a-z0-9]{1,5}$/i, '') + '.jpg';
  return new File([blob], name, { type:'image/jpeg' });
}
