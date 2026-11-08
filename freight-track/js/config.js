/* ============================================================
   config.js — ค่าที่ผู้พัฒนาตั้งให้ลูกค้าแต่ละราย แก้ที่นี่ที่เดียว
   ============================================================ */

/** อีเมล Google ของ admin ชุดแรก — ใช้ตอนเริ่มระบบครั้งแรกเท่านั้น
 *  คนในรายการนี้ล็อกอินครั้งแรกแล้วจะได้บทบาท admin อัตโนมัติ (ถ้ายังไม่มีข้อมูลของอีเมลนั้นในระบบ)
 *  หลังจากนั้นเป็น admin ธรรมดา — admin คนอื่นถอดหรือปิดใช้งานได้ ถอดแล้วไม่กลับมาเองอีก
 *  ใส่เป็นตัวพิมพ์เล็กทั้งหมด */
export const BOOTSTRAP_ADMINS = [
  'admin@example.com',
];

/** ที่อยู่หน้าคนขับ — ตอนนี้อยู่โดเมนเดียวกัน
 *  วันที่แยกฝั่งคนขับไปอีกโดเมน เปลี่ยนบรรทัดนี้เป็น URL เต็ม เช่น 'https://driver.example.com/driver.html'
 *  เมนู "คนขับ" · ปุ่มเปิดหน้าคนขับ · ลิงก์คนขับภายนอก จะชี้ไปที่ใหม่ทั้งหมด */
export const DRIVER_URL = 'driver.html';

/** หน้าผู้ช่วยคนขับ — ล็อกอินด้วยบัญชีคนขับเหมือนกัน แต่มีหน้าบันทึกการชำระเงิน (js/helper.js)
 *  แยกโดเมนเมื่อไหร่ เปลี่ยนคู่กับ DRIVER_URL */
export const HELPER_URL = 'helper.html';

/** หน้าเลือกฝั่งของพนักงาน (ออฟฟิศ · คนขับ · ผู้ช่วยคนขับ) — ออกจากระบบ/ถูกเด้งออกแล้วกลับมาที่นี่
 *  index.html เหลือเฉพาะฝั่งลูกค้า (ติดตามการจัดส่ง) */
export const STAFF_URL = 'index-staff.html';

/** ลิงก์เต็มของหน้าคนขับ (ต่อ query ได้) */
export const driverUrl = (query = '') =>
  new URL(DRIVER_URL + (query ? `?${query}` : ''), location.href).href;

/** ลิงก์ Apps Script Web App (ที่ได้ตอนกด Deploy — ขึ้นต้น https://script.google.com/macros/s/…/exec)
 *  ใส่ไว้ที่นี่เพื่อให้ "ทุกเครื่อง" ใช้ได้ทันที รวมมือถือคนขับ (ใช้ตรวจรหัสคนขับ + ออกบัตรผ่านเข้าฐานข้อมูล)
 *  เว้นว่าง = ใช้ลิงก์ที่ตั้งไว้ในเครื่องจากหน้าข้อมูลคนขับ → ปุ่ม "เชื่อม Google Sheet" (แบบเดิม) */
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec';

/** หัวบริษัทบนใบวางบิล (bill.html) — ช่องที่เว้นว่างจะไม่ขึ้นบนใบ
 *  ยังไม่มีที่อยู่และเลขผู้เสียภาษีในเอกสารที่มี — เติมให้ครบก่อนส่งใบวางบิลจริง */
export const COMPANY = {
  name:    'บริษัท ขนส่งตัวอย่าง จำกัด',
  nameEn:  'EXAMPLE TRANSPORT CO., LTD.',
  address: '',
  taxId:   '',
  phone:   '02-000-0000',                      /* สำนักงาน */
  adminPhones: ['080-000-0001', '080-000-0002'],  /* แอดมิน — ปุ่มโทรของคนขับขึ้นต่อจากเบอร์สำนักงาน */
};
/** บรรทัดเบอร์ติดต่อที่ขึ้นบนใบ / หน้าลูกค้า */
COMPANY.contact = [
  COMPANY.phone ? `สำนักงาน ${COMPANY.phone}` : '',
  COMPANY.adminPhones.length ? `แอดมิน ${COMPANY.adminPhones.join(', ')}` : '',
].filter(Boolean).join(' · ');

/** จ่าหัวใบ POD (ใบส่งสินค้า) — ใช้แบบฟอร์มของต้นทาง SAMPLE ORIGIN ตามที่ลูกค้าใช้ (28 ต.ค.)
 *  โลโก้ตัดจากภาพหน้าจอ (img/origin-logo.png) — ได้ไฟล์จริงจากลูกค้าแล้ววางทับชื่อเดิมได้เลย */
export const POD_ORIGIN = {
  name:    'SAMPLE ORIGIN CO., LTD.',
  address: ['123 Example Rd.,', 'Bangkok 10000'],
  tel:     '02-000-0099',
  logo:    'img/origin-logo.png',
};

/** เครดิตเทอมตั้งต้นของใบวางบิล (วัน) — แก้ได้ทุกใบตอนสร้าง */
export const DEFAULT_CREDIT_DAYS = 30;

/** ลิงก์ใบวางบิลสำหรับส่งให้ลูกค้า (เปิดได้โดยไม่ต้องล็อกอิน) */
export const billUrl = (id, query = '') =>
  new URL(`bill.html?k=${encodeURIComponent(id)}${query ? `&${query}` : ''}`, location.href).href;
