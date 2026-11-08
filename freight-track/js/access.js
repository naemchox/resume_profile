/* ============================================================
   access.js — บทบาท หน้า และระดับสิทธิ์ (ไม่แตะ Firebase — ใช้ได้ทุกหน้า)

   ระดับสิทธิ์ต่อหน้า:  'none' ไม่เห็น · 'view' ดูอย่างเดียว · 'edit' ดูและแก้ได้
   สิทธิ์จริงของแต่ละคน = ค่าที่ admin ตั้งให้รายคน (pages) ถ้าไม่ได้ตั้ง ใช้ค่าตามบทบาท
   admin ได้ 'edit' ทุกหน้าเสมอ ตั้งรายคนทับไม่ได้

   กฎชุดเดียวกันนี้ถูกเขียนซ้ำไว้ใน firestore.rules — แก้ตรงนี้ต้องแก้ที่นั่นด้วย
   ============================================================ */

import { HELPER_URL } from './config.js';

/** หน้าที่ต้องล็อกอินฝั่ง Back office — เรียงตามลำดับเมนู */
export const PAGES = [
  { key:'dashboard', href:'dashboard.html', label:'ภาพรวม' },
  { key:'customer',  href:'customer.html',  label:'ลูกค้า · แจ้งงาน' },
  { key:'ops',       href:'ops.html',       label:'หลังบ้าน · คลัง' },
  { key:'billing',   href:'billing.html',   label:'รายได้ · วางบิล' },
  { key:'returns',   href:'returns.html',   label:'คืนบิล' },
  { key:'drivers',   href:'drivers.html',   label:'ข้อมูลคนขับ' },
  { key:'users',     href:'users.html',     label:'ผู้ใช้และสิทธิ์', adminOnly:true },
];
/** หน้าเครื่องมือที่ไม่อยู่ในเมนู — admin เท่านั้น */
export const TOOL_PAGES = [
  { key:'migrate', href:'migrate-photos.html', label:'ย้ายรูปขึ้นคลาวด์', adminOnly:true },
];

export const pageByKey = (k) => [...PAGES, ...TOOL_PAGES].find(p => p.key === k) || null;
export const pageByHref = (h) => [...PAGES, ...TOOL_PAGES].find(p => p.href === h) || null;

/** หน้าที่ตั้งสิทธิ์รายคนได้ (หน้า admin-only ตั้งไม่ได้ — ต้องเป็น admin เท่านั้น) */
export const GRANTABLE = PAGES.filter(p => !p.adminOnly);

export const LEVELS = [
  { key:'none', label:'ไม่เห็น' },
  { key:'view', label:'ดูอย่างเดียว' },
  { key:'edit', label:'ดูและแก้ไข' },
];
const RANK = { none:0, view:1, edit:2 };
export const levelLabel = (k) => LEVELS.find(l => l.key === k)?.label || k;

/** บทบาทฝั่งออฟฟิศ — defaults = สิทธิ์ตั้งต้นของบทบาทนั้น (หน้าที่ไม่ระบุ = ไม่เห็น) */
export const ROLES = [
  { key:'admin',      label:'Admin',     desc:'เห็นทุกหน้า แก้ได้ทุกอย่าง เพิ่มหรือลด admin ได้',
    defaults:{} },
  { key:'exec',       label:'ผู้บริหาร',   desc:'ดูภาพรวม (Dashboard) อย่างเดียว',
    defaults:{ dashboard:'view' } },
  { key:'warehouse',  label:'ทีมคลัง',    desc:'กระดานงาน · แจ้งงาน · ข้อมูลคนขับ · คืนบิล',
    defaults:{ ops:'edit', customer:'edit', drivers:'edit', returns:'edit' } },
  { key:'accounting', label:'ทีมบัญชี',    desc:'รายได้ · วางบิล และดูภาพรวม · ดูคืนบิล',
    defaults:{ billing:'edit', dashboard:'view', returns:'view' } },
  /* คนที่เข้าร่วมผ่านลิงก์เชิญโดยยังไม่มีบทบาท — ล็อกอินได้แต่ยังไม่เห็นหน้าไหน จนกว่า admin จะตั้งให้ */
  { key:'pending',    label:'รอกำหนดสิทธิ์', desc:'ยังไม่เห็นหน้าใด — รอ admin กำหนดบทบาท',
    defaults:{} },
];
export const roleByKey = (k) => ROLES.find(r => r.key === k) || null;
export const roleLabel = (k) => roleByKey(k)?.label || k || '—';

/** ผู้ใช้ออฟฟิศที่ใช้งานได้จริง (ได้รับเชิญ ไม่ถูกปิด ไม่ถูกถอด) */
export const isActiveStaff = (s) => !!s && s.active !== false && !s.removed;
export const isAdmin = (s) => isActiveStaff(s) && s.role === 'admin';

/** ระดับสิทธิ์ของคนหนึ่งต่อหน้าหนึ่ง */
export function levelOf(staff, pageKey){
  if (!isActiveStaff(staff)) return 'none';
  if (staff.role === 'admin') return 'edit';
  const p = pageByKey(pageKey);
  if (!p || p.adminOnly) return 'none';
  const own = staff.pages?.[pageKey];
  if (own && RANK[own] != null) return own;
  return roleByKey(staff.role)?.defaults?.[pageKey] || 'none';
}

/** ค่าตั้งต้นของบทบาท (ใช้แสดงในฟอร์มว่าถ้าไม่ตั้งรายคนจะได้อะไร) */
export const roleDefault = (roleKey, pageKey) => roleByKey(roleKey)?.defaults?.[pageKey] || 'none';

/** หน้าแรกของคนนี้หลังล็อกอิน = หน้าแรกตามลำดับนี้ที่มีสิทธิ์
 *  (ภาพรวมก่อน แล้วกระดานงาน — ทีมคลังจึงเข้ากระดานงาน ไม่ใช่หน้าแจ้งงาน) */
const HOME_ORDER = ['dashboard', 'ops', 'billing', 'customer', 'drivers', 'users'];
export function homeOf(staff){
  const k = HOME_ORDER.find(k => levelOf(staff, k) !== 'none');
  return k ? pageByKey(k).href : null;
}

/** รายการเมนูบนแถบหัว
 *  session.kind: 'staff' = ฝั่ง Back office · 'driver' = ฝั่งคนขับ · อื่น ๆ = ไม่มีเมนู */
export function navItems(session, driverHref = 'driver.html', driverLabel = 'คนขับ'){
  if (session?.kind === 'driver') return [{ href:driverHref, label:driverLabel, key:'driver' }];
  if (session?.kind !== 'staff') return [];
  const items = PAGES.filter(p => levelOf(session.staff, p.key) !== 'none')
    .map(p => ({ href:p.href, label:p.label, key:p.key }));
  /* หน้าคนขับ · ผู้ช่วยคนขับ · ติดตามพัสดุ ฝั่ง Back office เห็นทุกคนเหมือนเดิม
     แทรกไว้ตำแหน่งเดิมในเมนู: คนขับต่อจากข้อมูลคนขับ (ผู้ช่วยคนขับอยู่ขวาคนขับ) · ติดตามพัสดุท้ายสุด (ก่อนหน้าผู้ใช้) */
  const at = items.findIndex(i => i.key === 'users');
  const tail = [
    { href:driverHref, label:'คนขับ', key:'driver' },
    { href:HELPER_URL, label:'ผู้ช่วยคนขับ', key:'helper' },
    { href:'track.html', label:'ติดตามพัสดุ', key:'track' },
  ];
  if (at === -1) items.push(...tail); else items.splice(at, 0, ...tail);
  return items;
}
