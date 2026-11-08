// ย่อรูปฝั่ง browser + อัปโหลด/ลบไฟล์ใน Storage
import {
  ref, uploadBytesResumable, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { storage, ready } from './firebase.js';
import { IMAGE_MAX_SIDE, JPEG_QUALITY, MAX_UPLOAD_BYTES } from './config.js';
import { focalEditor, CENTER } from './focal.js';

async function decode(file) {
  // createImageBitmap หมุนรูปตาม EXIF ให้ (รูปจากมือถือไม่ตะแคง)
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* ลองวิธีถัดไป */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// คืน Blob JPEG ที่ด้านยาวสุดไม่เกิน maxSide
export async function resizeImage(file, maxSide = IMAGE_MAX_SIDE) {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" ไม่ใช่ไฟล์รูปภาพ`);
  }
  let src;
  try {
    src = await decode(file);
  } catch {
    throw new Error(`เปิดรูป "${file.name}" ไม่ได้ (รองรับ JPG, PNG, WebP; ถ้าเป็น HEIC ให้ตั้งกล้องเป็น JPG)`);
  }
  const w = src.width, h = src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // PNG โปร่งใส → พื้นขาว
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error(`ย่อรูป "${file.name}" ไม่สำเร็จ`);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error(`รูป "${file.name}" ใหญ่เกิน 10MB หลังย่อแล้ว`);
  return blob;
}

// news/{id}/{timestamp}-{filename}
export function buildPath(folder, id, filename) {
  const base = filename.replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  return `${folder}/${id}/${Date.now()}-${base}.jpg`;
}

export function uploadBlob(path, blob, onProgress) {
  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(ref(storage, path), blob, { contentType: 'image/jpeg' });
    task.on('state_changed',
      snap => onProgress?.(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      async () => {
        try {
          resolve({ url: await getDownloadURL(task.snapshot.ref), path });
        } catch (err) { reject(err); }
      });
  });
}

// ลบไฟล์ ถ้าไม่มีไฟล์อยู่แล้วถือว่าสำเร็จ
export async function deleteFile(path) {
  if (!ready || !path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    if (err.code !== 'storage/object-not-found') throw err;
  }
}

// ย่อ + อัปโหลดรูปปกของ doc แล้วคืน { url, path }
export async function uploadImage({ folder, id, file, maxSide = IMAGE_MAX_SIDE, onProgress }) {
  const blob = await resizeImage(file, maxSide);
  return uploadBlob(buildPath(folder, id, file.name), blob, onProgress);
}

// ช่องเลือกรูปในฟอร์ม: แสดงตัวอย่าง + จำไฟล์ที่เลือกไว้
// frames (ไม่บังคับ): ชุดกรอบใน IMAGE_FRAMES → ลากปรับตำแหน่งรูปได้ อ่านค่าที่ .pos
export function bindImageField(root, { frames } = {}) {
  const input = root.querySelector('input[type=file]');
  const img = root.querySelector('img');
  const empty = root.querySelector('.empty');
  const pickBtn = root.querySelector('[data-pick]');
  const focal = frames ? focalEditor(img, frames) : null;
  let file = null;
  let objectUrl = null;

  const show = url => {
    img.hidden = !url;
    if (focal) focal.el.hidden = !url;
    if (url) img.src = url;
    if (empty) empty.hidden = !!url;
    if (pickBtn) pickBtn.textContent = url ? 'เปลี่ยนรูป' : 'เลือกรูป';
  };

  pickBtn?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    const f = input.files[0];
    if (!f) return;
    file = f;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    focal?.set(CENTER); // รูปใหม่เริ่มที่กึ่งกลาง
    show(objectUrl);
  });

  return {
    get file() { return file; },
    get pos() { return focal ? focal.pos : null; },
    reset(url = '', pos = null) {
      file = null;
      input.value = '';
      if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      focal?.set(pos);
      show(url);
    }
  };
}
