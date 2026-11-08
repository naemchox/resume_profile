// จุดเดียวที่ต่อกับ Supabase — ไฟล์อื่นเรียกผ่านที่นี่เท่านั้น
//
// ไลบรารีเก็บไว้ใน js/vendor/ ไม่ดึงจาก CDN ตอนใช้งาน
// เพราะลูกค้าองค์กรหลายรายล็อกเน็ตขาออก ถ้าพึ่ง CDN คือเปิดระบบไม่ได้เลย
import { createClient } from './vendor/supabase-js.js';

let cfg = null;
try {
  cfg = await import('./config.js');
} catch {
  // ยังไม่ได้ตั้งค่า — หน้าเข้าสู่ระบบจะขึ้นวิธีตั้งค่าให้เอง
}

export const configured = !!(
  cfg?.SUPABASE_URL && cfg?.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('xxxx')
);

export const sb = configured
  ? createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

export const DEFAULT_LANG = cfg?.DEFAULT_LANG ?? 'th';
