// คลังไฟล์แนบ — จุดเดียวที่คุยกับ Supabase Storage
//
// ทำไมไม่เก็บไฟล์เป็น base64 ในตาราง: ใบเสนอราคาสแกนมาทีละหลายเมกะไบต์
// ถ้ายัดลงคอลัมน์ text ทุกครั้งที่ดึงตารางมาเปรียบเทียบราคาจะลากไฟล์มาทั้งก้อนด้วย
//
// ในฐานข้อมูลเก็บแค่ "ที่อยู่ไฟล์" (attachment_path) ไม่เก็บลิงก์
// เพราะลิงก์ของ bucket ส่วนตัวมีอายุ ถ้าเก็บลิงก์ไว้ พรุ่งนี้กดแล้วจะเปิดไม่ได้
import { sb } from './supabase.js';
import { t } from './i18n.js';

export const BUCKET = 'attachments';

export const MAX_BYTES = 10 * 1024 * 1024;   // 10 MB — เท่ากับที่ตั้งไว้ใน db/10_storage.sql
export const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.xls,.doc,.docx';

const OK_EXT = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic',
                        'xlsx', 'xls', 'doc', 'docx']);

// Supabase Storage รับเฉพาะอักษรอังกฤษ ตัวเลข และเครื่องหมายไม่กี่ตัวในชื่อไฟล์
// ชื่อไทยจะโดนปฏิเสธด้วย "Invalid key" (เจอตอนเทสอัปโหลดจริง 29 ส.ค. 2569)
//
// แต่จะทิ้งชื่อไทยไปเฉยๆ ไม่ได้ เพราะผู้ใช้ต้องเห็นว่าไฟล์ที่แนบคือใบไหน
// จึงเข้ารหัสชื่อเดิมเป็น base64url (มีแต่ A-Z a-z 0-9 - _ ปลอดภัยแน่นอน)
// แล้วติดหัว b64. ไว้ให้ fileLabel ถอดกลับมาแสดงผลได้
const B64 = 'b64.';
const enc = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = (s) => {
  try {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
  } catch { return s; }
};

const safeName = (name) => {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const raw = (dot > 0 ? name.slice(0, dot) : name).normalize('NFC').trim();
  // ชื่ออังกฤษล้วนเก็บเป็นตัวอ่านได้ตามเดิม จะได้หาไฟล์เจอตอนเปิดดูใน Supabase
  const ascii = raw.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/.test(raw)
    ? ascii.slice(0, 60)
    : B64 + enc(raw.slice(0, 60));
  return { base: base || 'file', ext };
};

// คืนชื่อไฟล์ที่คนอ่านรู้เรื่อง จากที่อยู่ที่เก็บในฐานข้อมูล
export const fileLabel = (path) => {
  if (!path) return '';
  const last = String(path).split('/').pop()
    .replace(/^[0-9a-f]{8}-/i, '');            // ตัดรหัสสุ่มหน้าชื่อออก
  if (!last.startsWith(B64)) return last;
  const dot = last.lastIndexOf('.');
  const body = dot > B64.length ? last.slice(B64.length, dot) : last.slice(B64.length);
  return dec(body) + (dot > B64.length ? last.slice(dot) : '');
};

export function checkFile(file) {
  const { ext } = safeName(file.name);
  if (!OK_EXT.has(ext)) throw new Error(t('file.badType'));
  if (file.size > MAX_BYTES) throw new Error(t('file.tooBig'));
}

// folder = ชนิดเอกสาร เช่น 'quotes' 'invoices' — ใช้แยกโฟลเดอร์ให้หาไฟล์ง่ายตอนตรวจสอบย้อนหลัง
export async function uploadFile(file, folder = 'misc') {
  checkFile(file);
  const { base, ext } = safeName(file.name);
  const id = crypto.randomUUID().slice(0, 8);
  const path = `${folder}/${id}-${base}${ext ? '.' + ext : ''}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// ชนิดไฟล์ — ใช้ตัดสินว่าเอามาแสดงตัวอย่างในหน้าได้ไหม
// heic ไม่นับเป็นรูป เพราะเบราว์เซอร์ส่วนใหญ่ยังแสดงไม่ได้ (ขึ้นเป็นกรอบว่าง)
export const fileKind = (path) => {
  const ext = String(path ?? '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'image';
  return 'other';
};

// bucket เป็นแบบส่วนตัว จึงต้องขอลิงก์ชั่วคราวทุกครั้งที่จะเปิด
// download = true สั่งให้เบราว์เซอร์บันทึกไฟล์แทนการเปิดดู และตั้งชื่อกลับเป็นชื่อเดิม
// (ในคลังชื่อไฟล์ไทยถูกเข้ารหัสเป็น b64. ถ้าไม่ตั้งชื่อกลับ ผู้ใช้จะได้ไฟล์ชื่ออ่านไม่ออก)
export async function fileUrl(path, seconds = 300, download = false) {
  const { data, error } = await sb.storage.from(BUCKET)
    .createSignedUrl(path, seconds, download ? { download: fileLabel(path) } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

// ดาวน์โหลดโดยไม่พาออกจากหน้าเดิม — ลิงก์ที่ได้ส่ง Content-Disposition: attachment มาด้วย
// เบราว์เซอร์จึงบันทึกไฟล์แล้วปล่อยให้หน้าที่กำลังคีย์อยู่ค้างไว้ตามเดิม
export async function downloadFile(path) {
  const url = await fileUrl(path, 60, true);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileLabel(path);
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

export async function openFile(path) {
  // เปิดแท็บไว้ก่อนแล้วค่อยเปลี่ยนที่อยู่ ถ้ารอลิงก์เสร็จแล้วค่อยเปิด Safari จะกันว่าเป็นป๊อปอัป
  const tab = window.open('', '_blank');
  try {
    const url = await fileUrl(path);
    if (tab) tab.location = url; else window.location = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
