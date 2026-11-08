/* ============================================================
   store.js — ชั้นข้อมูลเดียวของทั้งระบบ
   ทุกหน้าจออ่าน–เขียนผ่านไฟล์นี้เท่านั้น

   ที่เก็บข้อมูลมีสองชั้น
     localStorage — แคชในเครื่อง อ่านได้ทันทีแบบ synchronous
                    หน้าจอทุกหน้าจึงเรียกใช้ตรง ๆ ได้โดยไม่ต้อง await
     Firestore    — ตัวจริงที่ใช้ร่วมกันทุกเครื่อง ซิงก์เข้ามาเองผ่าน onSnapshot

   เขียนลงเครื่องก่อนเสมอให้จอขยับทันที แล้วค่อยดันขึ้นคลาวด์เบื้องหลัง
   เน็ตหลุดก็ยังกดงานต่อได้ กลับมามีเน็ตแล้วค่อยส่ง

   รูปถ่ายไม่เก็บในฐานข้อมูล — อัปขึ้น Firebase Storage แล้วเก็บแค่ URL
   (หน้าจอที่เรียก advance/deliverStop เป็นคนอัปก่อนส่งเข้ามา)
   ============================================================ */

import { canWrite, whenGated, getSession, onAuthUser, driverIdOf } from './auth.js';
import { hasApi } from './api.js';
import { initCloud, cloudReady, watchAll, pushAll, putDoc, putDocs, removeDocs, wipeCloud,
         uploadPhoto, isLocalPhoto, putTracking, removeTracking, trackKeysOf,
         markWiped, wipedAt, removePhotos, stopPhotoDir, jobPhotoDir } from './cloud.js';
import { initVault, vaultReady, setOnSaved, pack, unpack, loadMissing } from './photoVault.js';

const KEY = 'ft.db.v1';
const SCHEMA = 3;   /* 3 = แยกชั้น เที่ยว (job) ออกจาก จุดส่ง (stop) */

/* รูปที่ยังไม่ขึ้นคลาวด์พักใน IndexedDB ไม่ใช่ localStorage (OFFLINE.md ข้อ 5 — js/photoVault.js)
   ต้องโหลดเสร็จก่อนอ่านฐานครั้งแรก ไม่งั้นป้าย idb:… จะยังแปลงกลับเป็นรูปไม่ได้ */
await initVault();
let lastSaveFailed = false;   /* ดู saveLocal() */

/* ---------- สถานะ (แกนกลางของทั้งระบบ) -------------------- */
export const S = {
  NEW:       'new',        // 1. ลูกค้าส่งคำสั่ง + invoice
  RECEIVED:  'received',   // 2. ก ตรวจรับของเข้าคลัง
  LOADED:    'loaded',     // 3. แพ็คขึ้นรถ — คนขับยืนยัน
  DEPARTED:  'departed',   // 4. ออกจากคลัง — คนขับยืนยัน
  ARRIVED:   'arrived',    // 5. ถึงปลายทาง — คนขับยืนยัน
  DELIVERED: 'delivered',  // 6. ลงของหมด + ถ่ายรูป — คนขับยืนยัน
  CANCELLED: 'cancelled',
};

/** ลำดับสถานะปกติ — ห้ามข้ามขั้น
 *  ARRIVED ถูกตัดออกตั้งแต่ schema 3 เพราะหนึ่งเที่ยวมีหลายจุดส่ง
 *  ให้คนขับกด "ถึงแล้ว" ทุกจุดคือการกดเปล่า ๆ พิกัดตอนปิดจุดเป็นหลักฐานพอแล้ว
 *  (ยังคงไว้ใน META เพื่อให้ข้อมูลเก่าที่มีเหตุการณ์นี้ยังแสดงผลได้) */
export const FLOW = [S.NEW, S.RECEIVED, S.LOADED, S.DEPARTED, S.DELIVERED];

/** ขั้นที่เป็นของ "ทั้งเที่ยว" — กดครั้งเดียวมีผลกับทุกจุดส่งในเที่ยวนั้น */
export const JOB_STEPS = new Set([S.RECEIVED, S.LOADED, S.DEPARTED]);

/** เหตุการณ์ "แก้ไขข้อมูล" — เป็นแค่บันทึกในไทม์ไลน์ ไม่ใช่สถานะงาน จึงไม่อยู่ใน FLOW */
export const EDITED = 'edited';

export const META = {
  [S.NEW]:       { step:1, label:'รอรับเข้าคลัง',  short:'รอรับเข้าคลัง', tone:'wait',  actor:'ลูกค้า', verb:'ลูกค้าส่งคำสั่งขนส่ง',
                   desc:'ลูกค้าแจ้งงานพร้อมแนบใบแจ้งหนี้ รอทีมคลังตรวจรับ' },
  [S.RECEIVED]:  { step:2, label:'รับเข้าคลังแล้ว', short:'อยู่ในคลัง',   tone:'ware',  actor:'ทีมคลัง', verb:'ตรวจรับของเข้าคลัง',
                   desc:'ตรวจนับพัสดุตรงกับใบแจ้งหนี้ รอจัดรถและคนขับ' },
  [S.LOADED]:    { step:3, label:'ขึ้นรถแล้ว',      short:'ขึ้นรถแล้ว',    tone:'ware',  actor:'คนขับ', verb:'ยืนยันแพ็คขึ้นรถครบ',
                   desc:'คนขับตรวจนับของทั้งเที่ยวและถ่ายรูปรอบคันก่อนออกเดินทาง' },
  [S.DEPARTED]:  { step:4, label:'ออกจากคลัง',      short:'กำลังเดินทาง',  tone:'move',  actor:'คนขับ', verb:'ยืนยันออกจากคลัง',
                   desc:'รถออกจากคลังต้นทาง เริ่มจับเวลาเดินทาง' },
  [S.ARRIVED]:   { step:0, label:'ถึงปลายทาง',      short:'ถึงปลายทาง',    tone:'move',  actor:'คนขับ', verb:'ยืนยันถึงปลายทาง',
                   desc:'รถถึงจุดส่ง รอลงของ' },
  [S.DELIVERED]: { step:5, label:'ส่งมอบสำเร็จ',    short:'ส่งมอบสำเร็จ',  tone:'done',  actor:'คนขับ', verb:'ยืนยันลงของ + ถ่ายรูป + ให้ผู้รับเซ็น',
                   desc:'ลงของครบพร้อมรูปหน้างาน พิกัดจุดส่ง และลายเซ็นผู้รับ เป็นหลักฐานปิดงาน' },
  [S.CANCELLED]: { step:0, label:'ยกเลิก',          short:'ยกเลิก',        tone:'stop',  actor:'ทีมคลัง', verb:'ยกเลิกงาน', desc:'' },
  [EDITED]:      { step:0, label:'แก้ไขข้อมูลใบงาน', short:'แก้ไขข้อมูล',   tone:'grey',  actor:'ทีมคลัง', verb:'แก้ไขข้อมูลใบงาน',
                   desc:'ทีมคลังแก้ไขข้อมูลใบงาน เช่น ใบแจ้งหนี้ตามมาทีหลัง หรือเปลี่ยนคนขับ' },
};

/** หน่วยนับ ลูกค้าพิมพ์เองได้อิสระ (พาเลท · ลัง · ม้วน · ถัง …) ปล่อยว่างแล้วใช้ค่านี้แทน */
export const DEFAULT_UNIT = 'ชิ้น';

/** ขั้นที่บังคับให้แนบรูปก่อนยืนยัน — ขึ้นรถ (ทั้งเที่ยว) และปิดงาน (ทุกจุดส่ง) */
export const NEEDS_PHOTO = new Set([S.LOADED, S.DELIVERED]);

/** จำนวนรูปขั้นต่ำแยกตามขั้น — ขึ้นรถ 2 รูป · ส่งมอบ 2 รูปสินค้าหลังลงของ (+ ใบ Invoice บิลละอย่างน้อย 1 รูป ดูด้านล่าง) */
export const MIN_PHOTOS_BY = { [S.LOADED]: 2, [S.DELIVERED]: 2 };
export const minPhotos = (status) => MIN_PHOTOS_BY[status] || 0;

/** รูปขึ้นรถ / ส่งของ / รูปบิล / เพิ่มรูปหลังส่ง — ไม่จำกัดจำนวน (ผู้ใช้สั่ง 27 ต.ค. · เดิม 8 รูปต่อชุด)
 *  ทุกรูปยังถูกย่อไม่เกิน 300 KB ก่อนขึ้นคลาวด์ (cloud.js) · สลิปชำระเงิน / รูปคืนบิลยังมีเพดานของตัวเอง */

/** สิ่งที่ต้องถ่าย — คนขับสูงอายุทำตามง่ายกว่าบอกลอย ๆ ว่า "ถ่าย N รูป" */
export const PHOTO_GUIDE = {
  [S.LOADED]:    ['สินค้าบนรถ มุมท้ายรถ (ให้เห็นของทั้งหมด)', 'สินค้าบนรถ มุมข้างรถ'],
  [S.DELIVERED]: ['สินค้าที่ลงจุดนี้ ให้เห็นของทั้งหมด', 'สินค้าที่ลงจุดนี้ อีกมุมหนึ่ง'],
};

/** ปิดจุดส่งเป็นสเต็ป: ถ่ายสินค้าหลังลงของ → ถ่ายใบ Invoice ทีละบิล (ร้านเดียวกันหลายบิล ถ่ายสินค้าครั้งเดียว ดู stopGroups)
 *  รูปใบ Invoice เก็บแยกในช่อง ev.invoicePhotos (ไม่ปนกับ ev.photos) เพื่อให้ POD ขยายเต็มหน้าให้อ่านออก
 *  และไม่หลุดไปหน้าติดตามสาธารณะ (cloud.js publicStop ส่งเฉพาะ photos) */
/** ผลการส่งตอนปิดจุด (คนขับเลือกจาก dropdown ทุกครั้ง · 27 ต.ค.)
 *  ok = ส่งเรียบร้อย ตามกติกาเดิม (รูปสินค้า + ลายเซ็น + ใบ Invoice + GPS)
 *  ที่เหลือ = ส่งไม่สำเร็จ — ปิดจุดได้ (เที่ยวปิดได้) แต่ต้องพิมพ์หมายเหตุ + รูปหลักฐาน 1 รูป + GPS · ไม่ต้องเซ็น/ถ่าย Invoice
 *  เก็บไว้ใน event (events[].outcome) ไม่ใช่ช่องของจุดส่ง — กฎ Firestore ให้เครื่องคนขับแก้ได้แค่ status/events (driverEdit) */
export const OUTCOMES = { ok:'ส่งเรียบร้อย', refused:'ลูกค้าไม่รับของ', returned:'คืนสินค้า', closed:'ร้านปิด', other:'อื่น ๆ' };   /* other = เหตุอื่น บอกในหมายเหตุ (27 ต.ค.) */
export const MIN_FAIL_PHOTOS = 1;
export const isFailOutcome = (o) => !!o && o !== 'ok' && o in OUTCOMES;
/** ผลของจุดที่ปิดแล้ว — ดูจาก event ปิดจุดล่าสุด · ข้อมูลเก่า/ยังไม่ปิด = 'ok' */
export function outcomeOf(x){
  if (x?.status !== S.DELIVERED) return '';
  const ev = (x.events || []).filter(e => e.status === S.DELIVERED).at(-1);
  return isFailOutcome(ev?.outcome) ? ev.outcome : 'ok';
}
export const outcomeLabel = (o) => isFailOutcome(o) ? `ส่งไม่สำเร็จ · ${OUTCOMES[o]}` : '';
/** คำที่ลูกค้าเห็นที่หน้าติดตาม (6 พ.ย. — ลูกค้าขอ "ส่งไม่สมบูรณ์" · ออฟฟิศ/คนขับยังใช้ "ส่งไม่สำเร็จ") */
export const trackOutcomeLabel = (o) => isFailOutcome(o) ? `ส่งไม่สมบูรณ์ · ${OUTCOMES[o]}` : '';
/** บิลมีปัญหา = ปิดแบบส่งไม่สำเร็จ และออฟฟิศยังไม่กดเคลียร์ — ไฮไลต์ ปักบนสุด และล็อกห้ามวางบิล (billing.js / ops.js) */
export const isProblem = (x) => isFailOutcome(outcomeOf(x)) && !x?.problemCleared;

export const MIN_INVOICE_PHOTOS = 1;   /* ต่อบิล — เดิมบังคับ 2 (20 ต.ค. ลดเหลืออย่างน้อย 1) */
export const INVOICE_PHOTO_GUIDE = [
  'ถ่ายเฉพาะเลขที่บิล เท่านั้น — ไม่ใช่รูปสินค้า',
  'วางบนพื้นเรียบ ให้เห็นครบทั้ง 4 มุม ไม่มีนิ้วบัง',
  'ถือให้นิ่ง ตัวหนังสืออ่านออก ไม่มีแสงสะท้อน',
];

/** ขั้นที่บังคับให้แนบพิกัด GPS ก่อนยืนยัน — หลักฐานว่าไปถึงจุดส่งจริง */
export const NEEDS_GEO = new Set([S.DELIVERED]);

/** ขั้นที่บังคับให้ผู้รับเซ็นชื่อ — หลักฐานว่ามีคนรับของจริง ไม่ใช่วางทิ้งไว้ */
export const NEEDS_SIGN = new Set([S.DELIVERED]);

/** ลายเซ็นที่ใช้ได้ต้องเป็นรูปจริง ไม่ใช่ค่าว่างหรือสตริงเปล่า */
export const validSign = (v) => typeof v === 'string' &&
  ((v.startsWith('data:image/') && v.length > 200) || /^https?:\/\//i.test(v));

/** พิกัดที่ใช้ได้ต้องมีละติจูด/ลองจิจูดเป็นตัวเลขและอยู่ในช่วงจริง */
export const validGeo = (g) =>
  !!g && Number.isFinite(+g.lat) && Number.isFinite(+g.lng) &&
  Math.abs(+g.lat) <= 90 && Math.abs(+g.lng) <= 180;

export const nextOf = (status) => {
  const i = FLOW.indexOf(status);
  return (i < 0 || i === FLOW.length - 1) ? null : FLOW[i + 1];
};
export const stepIndex = (status) => FLOW.indexOf(status);
export const isOpen = (s) => s !== S.DELIVERED && s !== S.CANCELLED;

/* ---------- utils ----------------------------------------- */
const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);
/* ID เอกสารเที่ยว = job_<เลข 7> เช่น job_7372008501 (31 ต.ค. ผู้ใช้ขอ — เปิด Firestore แล้วรู้เลยว่าเที่ยวไหน)
   งานด่วน RT- · เที่ยวที่ใช้ชื่อกลุ่มแทนเลข 7 (มี / ซึ่ง Firestore ห้าม) · ID นี้มีอยู่แล้ว = สุ่มแบบเดิม
   เที่ยวเก่าใช้ ID สุ่มเดิมต่อ ไม่ย้าย · งานด่วนได้เลข 7 ทีหลัง → เปลี่ยน ID ให้ใน attachRtJob */
function jobIdFor(db, code){
  const c = String(code || '').trim().toUpperCase();
  const id = `job_${c}`;
  return /^[0-9A-Z-]+$/.test(c) && !isRtCode(c) && !db.jobs.some(j => j.id === id) ? id : uid('job');
}
const clone = (o) => JSON.parse(JSON.stringify(o));
const iso = (d) => new Date(d).toISOString();
const pad = (n) => String(n).padStart(2, '0');

export const fmtDate = (v) => v ? new Date(v).toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }) : '—';
export const fmtTime = (v) => v ? new Date(v).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) + ' น.' : '—';
export const fmtDateTime = (v) => v ? `${fmtDate(v)} · ${fmtTime(v)}` : '—';
export const fmtBaht = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits:2, maximumFractionDigits:2 }) + ' ฿';
export const fmtNum = (n) => (Number(n) || 0).toLocaleString('th-TH');

/** "12 พาเลท" — ใช้แทนการต่อสตริงเองทุกหน้า */
export const qty = (cargo) => `${fmtNum(cargo?.pieces)} ${cargo?.unit || DEFAULT_UNIT}`;

export function ago(v){
  if (!v) return '—';
  const ms = Date.now() - new Date(v).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return 'เมื่อครู่';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.${m % 60 ? ' ' + (m % 60) + ' นาที' : ''}ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

export function duration(a, b){
  if (!a || !b) return '—';
  const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
  return m < 60 ? `${m} นาที` : `${Math.floor(m/60)} ชม. ${m%60} นาที`;
}

/* ---------- seed ------------------------------------------ */
function seed(){
  /* รูปจำลองสำหรับเดโม่ — จุดสี 1x1 ให้เห็นว่ามีหลักฐานครบโดยไม่กินพื้นที่ */
  const TINY = ['#c0504d','#4f81bd','#9bbb59','#8064a2','#f79646','#4bacc6'];
  /* ลายเซ็นจำลองสำหรับเดโม่ — ข้อมูลตัวอย่างต้องผ่านกฎเดียวกับของจริง */
  const SIG = `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" width="520" height="150"><rect width="520" height="150" fill="#fff"/><path d="M40 105 C90 40 120 120 170 75 S250 30 300 85 S380 120 450 60" stroke="#0d1c30" stroke-width="3" fill="none" stroke-linecap="round"/></svg>')}`;
  const shots = (n) => Array.from({ length:n }, (_, i) =>
    `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" fill="${TINY[i % TINY.length]}"/><text x="48" y="58" font-size="34" fill="#fff" text-anchor="middle" font-family="sans-serif">${i + 1}</text></svg>`)}`);

  const now = new Date();
  const H = (h) => iso(new Date(now.getTime() - h * 3600e3));
  const day = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); return x.toISOString().slice(0,10); };
  const stamp = `${String(now.getFullYear() + 543).slice(-2)}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  let seq = 0;
  const code = () => `FT-${stamp}-${pad(++seq)}`;

  const drivers = [
    { id:'drv_1', name:'สมชาย พูลทรัพย์',  phone:'081-234-5678', plate:'70-8842 กทม.', truck:'6 ล้อ ตู้ทึบ',  pin:'1234', active:true, note:'' },
    { id:'drv_2', name:'ประยุทธ อินทร์แก้ว', phone:'089-441-2290', plate:'82-1157 กทม.', truck:'10 ล้อ คอก',   pin:'1234', active:true, note:'' },
    { id:'drv_3', name:'วิเชียร ทองดี',     phone:'086-772-3311', plate:'71-3390 สป.',  truck:'6 ล้อ ตู้เย็น', pin:'1234', active:true, note:'ขับรถห้องเย็นเท่านั้น' },
    { id:'drv_4', name:'อนุชา แซ่ลิ้ม',      phone:'092-880-1145', plate:'83-5521 กทม.', truck:'10 ล้อ ตู้ทึบ', pin:'1234', active:true, note:'' },
  ];

  const cust = [
    { name:'บจก. ไทยฟู้ดส์ ซัพพลาย',  contact:'คุณมาลี',   phone:'02-114-5500' },
    { name:'บจก. เอส.พี. อิเล็คทริค', contact:'คุณธนากร',  phone:'02-889-3311' },
    { name:'หจก. รุ่งเรืองวัสดุก่อสร้าง', contact:'คุณสมพงษ์', phone:'044-221-889' },
    { name:'บจก. นอร์ทเทิร์น เท็กซ์ไทล์', contact:'คุณพิมพ์ใจ', phone:'053-334-120' },
  ];

  /* งาน 8 ใบ กระจายทุกสถานะ — เล่าทั้ง workflow ได้ในหน้าเดียว */
  const rows = [
    { c:0, from:'คลัง FT บางนา กม.19', to:'บจก. ซีพี ออลล์ DC ลาดกระบัง', toAddr:'88/2 ถ.ฉลองกรุง แขวงลำปลาทิว เขตลาดกระบัง กทม. 10520',
      recv:'คุณวิรัตน์ (คลังรับสินค้า)', recvPhone:'02-326-7700',
      cargo:'อาหารแช่แข็ง 12 พาเลท', pieces:12, unit:'พาเลท', kg:4800, inv:'INV-2601-0455', amt:186400,
      status:S.DELIVERED, drv:'drv_3', t:[H(28),H(26),H(24.5),H(24),H(20.5),H(20)] },

    { c:1, from:'คลัง FT บางนา กม.19', to:'บจก. เอส.พี. สาขาระยอง', toAddr:'55/9 นิคมฯ มาบตาพุด อ.เมือง จ.ระยอง 21150',
      recv:'คุณอรรถพล', recvPhone:'038-681-220',
      cargo:'ตู้ควบคุมไฟฟ้า 6 ลัง', pieces:6, unit:'ลัง', kg:1250, inv:'INV-2601-0461', amt:742000,
      status:S.ARRIVED, drv:'drv_1', t:[H(9),H(7.5),H(6),H(5.5),H(0.4)] },

    { c:2, from:'คลัง FT บางนา กม.19', to:'ไซต์งานโคราช เฟส 2', toAddr:'ต.จอหอ อ.เมือง จ.นครราชสีมา 30310',
      recv:'ช่างบุญมี (โฟร์แมน)', recvPhone:'081-909-4477',
      cargo:'เหล็กเส้น + ปูน 30 ถุง', pieces:44, unit:'ชิ้น', kg:9200, inv:'INV-2601-0462', amt:238900,
      status:S.DEPARTED, drv:'drv_2', t:[H(11),H(8),H(4.2),H(3.6)] },

    { c:3, from:'คลัง FT บางนา กม.19', to:'ศูนย์กระจายสินค้าเชียงใหม่', toAddr:'199 ม.4 ต.หนองผึ้ง อ.สารภี จ.เชียงใหม่ 50140',
      recv:'คุณกิตติ', recvPhone:'053-119-880',
      cargo:'ผ้าม้วน 18 ม้วน', pieces:18, unit:'ม้วน', kg:2600, inv:'INV-2601-0468', amt:412500,
      status:S.LOADED, drv:'drv_4', t:[H(6),H(4),H(0.7)] },

    { c:0, from:'คลัง FT บางนา กม.19', to:'บจก. แมคโคร สาขาศรีนครินทร์', toAddr:'9 ถ.ศรีนครินทร์ เขตประเวศ กทม. 10250',
      recv:'คุณสุนีย์', recvPhone:'02-728-1140',
      cargo:'เครื่องดื่มกระป๋อง 20 พาเลท', pieces:20, unit:'พาเลท', kg:7400, inv:'INV-2601-0470', amt:96200,
      status:S.RECEIVED, drv:'drv_1', t:[H(3.4),H(2.1)] },

    { c:1, from:'คลัง FT บางนา กม.19', to:'บจก. เอส.พี. คลังหลัก บางพลี', toAddr:'123 ม.7 ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540',
      recv:'คุณเอกชัย', recvPhone:'02-750-3311',
      cargo:'สายไฟ + อุปกรณ์ 9 ลัง', pieces:9, unit:'ลัง', kg:880, inv:'INV-2601-0471', amt:158000,
      status:S.RECEIVED, drv:null, t:[H(2.6),H(1.2)] },

    { c:3, from:'คลัง FT บางนา กม.19', to:'ห้างหุ้นส่วน ล้านนาแฟบริค', toAddr:'44/1 ถ.ช้างคลาน อ.เมือง จ.เชียงใหม่ 50100',
      recv:'คุณนพดล', recvPhone:'053-274-118',
      cargo:'ผ้าสำเร็จรูป 25 กล่อง', pieces:25, unit:'กล่อง', kg:1100, inv:'INV-2601-0473', amt:227800,
      status:S.NEW, drv:null, t:[H(0.9)] },

    { c:2, from:'คลัง FT บางนา กม.19', to:'ร้านวัสดุรุ่งเรือง สาขาปากช่อง', toAddr:'77 ถ.มิตรภาพ อ.ปากช่อง จ.นครราชสีมา 30130',
      recv:'คุณสมหมาย', recvPhone:'044-311-556',
      cargo:'กระเบื้อง 40 กล่อง', pieces:40, unit:'กล่อง', kg:3200, inv:'INV-2601-0474', amt:88400,
      status:S.NEW, drv:null, t:[H(0.3)] },
  ];

  const notes = {
    [S.RECEIVED]:  'ตรวจนับครบตามใบแจ้งหนี้ สภาพบรรจุภัณฑ์ปกติ',
    [S.LOADED]:    'ตรวจนับครบ ล็อกตู้เรียบร้อย',
    [S.DEPARTED]:  'ออกจากคลังตามเวลานัด',
    [S.ARRIVED]:   'ถึงจุดส่ง รอคิวลงของ',
    [S.DELIVERED]: 'ลงของครบถ้วน ผู้รับเซ็นรับเรียบร้อย',
  };

  /* จัดกลุ่มเป็นเที่ยว — เลียนแบบไฟล์จริงที่หนึ่ง Shipment No. มีหลายบิล
     เที่ยว 1: 1 จุด ปิดแล้ว · เที่ยว 2: 3 จุด กำลังวิ่ง ปิดไป 1 · เที่ยว 3: 2 จุด รอรถ · เที่ยว 4: 2 จุด งานใหม่ */
  const trips = [
    { code:'7372007584', vehicle:'ตัวอย่างตวอ1 4ล้อ2คัน', drv:'drv_3', status:S.DELIVERED, rows:[0],       t:[H(28),H(26),H(24.5),H(24)] },
    { code:'7372007589', vehicle:'ตัวอย่างกลาง3 4ล้อ2คัน', drv:'drv_2', status:S.DEPARTED,  rows:[1,2,3],   t:[H(11),H(8),H(4.2),H(3.6)] },
    { code:'7372007595', vehicle:'ตัวอย่างกลาง1 4ล้อ4คัน', drv:'drv_1', status:S.RECEIVED,  rows:[4,5],     t:[H(3.4),H(2.1)] },
    { code:'7372007596', vehicle:'ตัวอย่างกลาง2 4ล้อ1คัน', drv:null,    status:S.NEW,       rows:[6,7],     t:[H(0.9)] },
  ];

  const jobs = [];
  const shipments = [];

  trips.forEach((tp) => {
    const jobId = `job_${tp.code}`;
    const upTo = FLOW.indexOf(tp.status === S.DELIVERED ? S.DEPARTED : tp.status);

    /* เหตุการณ์ระดับเที่ยว — ขึ้นรถแนบรูปครบตามกฎ (2 รูป) */
    const jev = [];
    for (let i = 0; i <= upTo; i++){
      const st = FLOW[i];
      jev.push({
        id: uid('ev'), status: st, at: tp.t[i] || tp.t[tp.t.length - 1],
        byRole: i === 0 ? 'ops' : (i === 1 ? 'ops' : 'driver'),
        byName: i <= 1 ? 'ทีมคลังบางนา' : (drivers.find(d => d.id === tp.drv)?.name || 'คนขับ'),
        note: i === 0 ? 'สร้างเที่ยวจากไฟล์ Excel' : (notes[st] || ''),
        photos: st === S.LOADED ? shots(minPhotos(S.LOADED)) : [],
        geo: null, signature: null, label: META[st].label,
      });
    }

    const stopRows = tp.rows.map((ri, k) => {
      const r = rows[ri];
      const c = cust[r.c];
      const delivered = tp.status === S.DELIVERED || (tp.code === '7372007589' && k === 0);
      const stStatus = delivered ? S.DELIVERED : tp.status;
      const ev = [{
        id: uid('ev'), status: S.NEW, at: tp.t[0],
        byRole: 'ops', byName: 'นำเข้าจาก Excel',
        note: `จุดส่งที่ ${k + 1} ของเที่ยว ${tp.code}`,
        photos: [], geo: null, signature: null, label: META[S.NEW].label,
      }];
      if (delivered){
        ev.push({
          id: uid('ev'), status: S.DELIVERED, at: tp.t[tp.t.length - 1],
          byRole: 'driver', byName: drivers.find(d => d.id === tp.drv)?.name || 'คนขับ',
          note: notes[S.DELIVERED], photos: shots(2), invoicePhotos: shots(2),
          geo: { lat:'13.6891', lng:'100.7501', acc:12 },
          signature: SIG, label: META[S.DELIVERED].label,
        });
      }
      return {
        id: uid('sh'), jobId, seq: k + 1,
        code: r.inv,
        customer: clone(c),
        invoice: { number:r.inv, amount:r.amt, fileName:`${r.inv}.pdf`, kind:'pdf', dataUrl:null },
        delivery: `537014${7000 + ri}`,
        pickup: { name:r.from, address:'19 ถ.บางนา–ตราด กม.19 ต.บางโฉลง อ.บางพลี จ.สมุทรปราการ 10540' },
        dropoff: { name:r.to, address:r.toAddr, contact:r.recv, phone:r.recvPhone },
        cargo: { desc:r.cargo, pieces:r.pieces, unit:r.unit, weightKg:r.kg, note:'' },
        serviceDate: day(0),
        driverId: tp.drv, driverIds: tp.drv ? [tp.drv] : [],
        status: stStatus,
        createdAt: tp.t[0], updatedAt: tp.t[tp.t.length - 1],
        source: { kind:'excel', shipmentNo:tp.code, vehicle:tp.vehicle, seq:k + 1 },
        events: ev,
      };
    });

    const allDone = stopRows.every(x => x.status === S.DELIVERED);
    if (allDone){
      jev.push({
        id: uid('ev'), status: S.DELIVERED, at: tp.t[tp.t.length - 1],
        byRole: 'driver', byName: drivers.find(d => d.id === tp.drv)?.name || 'คนขับ',
        note: 'ปิดจุดส่งครบทุกจุดแล้ว', photos: [], geo: null, signature: null,
        label: META[S.DELIVERED].label,
      });
    }

    jobs.push({
      id: jobId, code: tp.code,
      vehicle: tp.vehicle, carrier: 'บ.ขนส่ง บริษัท ขนส่งตัวอย่าง',
      serviceDate: day(0),
      pickup: { name:'คลัง FT บางนา กม.19' },
      driverId: tp.drv, driverIds: tp.drv ? [tp.drv] : [],
      status: allDone ? S.DELIVERED : tp.status,
      createdAt: tp.t[0], updatedAt: tp.t[tp.t.length - 1],
      source: { kind:'excel', shipmentNo:tp.code, vehicle:tp.vehicle },
      events: jev,
    });
    shipments.push(...stopRows);
  });

  return {
    schema: SCHEMA,
    settings: {
      company: 'บริษัท ขนส่งตัวอย่าง จำกัด',
      companyEn: 'EXAMPLE TRANSPORT CO., LTD.',
      hotline: '02-000-0000',
      warehouse: 'คลัง FT บางนา กม.19',
    },
    drivers, jobs, shipments,
  };
}

/** ซ่อมข้อมูลเก่า: จุดส่งที่อยู่ในเที่ยวแต่ไม่มีคนขับ ให้รับคนขับของเที่ยวมา
 *  เกิดกับงานที่นำเข้าก่อนแก้บั๊ก — คนขับถูกเก็บไว้ที่เที่ยวอย่างเดียว
 *  ทำตอนอ่านครั้งแรก ครั้งเดียวจบ ถ้าไม่มีอะไรต้องซ่อมก็ไม่เขียนทับ
 *  @returns {boolean} true = มีการซ่อมจริง */
function healStopDrivers(db){
  let fixed = 0;
  for (const j of db.jobs || []){
    if (!j.driverId) continue;
    for (const x of db.shipments || []){
      if (x.jobId !== j.id || x.driverId) continue;
      x.driverId = j.driverId;
      x.driverIds = (j.driverIds || []).slice();
      fixed++;
    }
  }
  if (fixed) console.info(`[store] ซ่อมคนขับให้จุดส่ง ${fixed} จุด จากเที่ยวที่จ่ายงานไว้แล้ว`);
  return fixed > 0;
}

/* ---------- driver: localStorage -------------------------- */
let cache = null;
let reuseIdx = null, reuseOf_ = null;   /* ดัชนีเลขบิลซ้ำของ reusedOf() */

function read(){
  if (cache) return cache;
  try{
    const raw = localStorage.getItem(KEY);
    if (raw){
      const { db, missing } = unpack(raw);
      /* อีกแท็บเพิ่งเก็บรูปใหม่ — โหลดจาก IndexedDB แล้วอ่านใหม่อีกรอบ */
      if (missing.length) loadMissing(missing).then(got => { if (got) refetch(); });
      if (db && db.schema === SCHEMA){
        db.jobs ||= [];                 /* กันข้อมูลที่บันทึกไว้ก่อนมีชั้นเที่ยว */
        /* ซ่อมในแคชให้หน้าจอใช้ได้ · ส่งขึ้นคลาวด์เฉพาะเครื่องออฟฟิศ (เครื่องคนขับแก้ช่องคนขับไม่ได้) */
        if (healStopDrivers(db)) { cache = db; if (getSession().kind === 'staff') persist(); return cache; }
        cache = db;
        /* ข้อมูลเก่าที่ยังฝังรูป base64 ใน localStorage — ย้ายไป IndexedDB เลย คืนพื้นที่ตั้งแต่เปิดแอป */
        if (vaultReady() && raw.includes('"data:')) saveLocal(db);
        return cache;
      }
    }
  }catch(e){ console.warn('[store] อ่านข้อมูลเดิมไม่ได้ — สร้างชุดใหม่', e); }
  /* เครื่องนี้ยังไม่เคยมีข้อมูล — ใส่ชุดเดโม่ไว้ให้หน้าจอมีอะไรโชว์ระหว่างรอคลาวด์
     ติดธง seeded ไว้: ห้ามดันขึ้นคลาวด์เด็ดขาด และทิ้งไปเองเมื่อข้อมูลจริงจากคลาวด์มาถึง
     (เคยหลุดขึ้น Firestore จริงมาแล้ว 29 ก.ย. — คนขับซ้ำ 4 คน + เที่ยวปลอม 4 เที่ยว) */
  cache = seed();
  cache.seeded = true;
  persist();
  return cache;
}

/** บันทึกจากการกระทำของผู้ใช้ — กันบัญชีที่ดูได้อย่างเดียวไว้ตรงนี้ที่เดียว
 *  (ทุกฟังก์ชันที่แก้ข้อมูลผ่าน write() ทั้งหมด) · ของที่ระบบซ่อมเองตอนอ่านใช้ persist() ไม่ผ่านด่านนี้ */
/* ui.js ฟังว่ามีการบันทึกจากเครื่องนี้ — งานในกล่องที่เปิดอยู่เข้าระบบแล้ว ที่เซฟอัตโนมัติไว้ทิ้งได้ */
const localWriteFns = new Set();
export const onLocalWrite = (fn) => { localWriteFns.add(fn); return () => localWriteFns.delete(fn); };

function write(){
  if (!canWrite()){
    cache = null;   /* ทิ้งสิ่งที่ฟังก์ชันผู้เรียกเพิ่งแก้ในแคช ให้กลับไปตรงกับของที่บันทึกไว้ */
    throw new Error('บัญชีนี้ดูได้อย่างเดียวในหน้านี้ — ต้องการแก้ไข ติดต่อ admin');
  }
  reuseOf_ = null;   /* ดัชนีเลขบิลซ้ำ (reusedOf) — ข้อมูลเปลี่ยนในที่เดิม ต้องสร้างใหม่ */
  localWriteFns.forEach(fn => { try{ fn(); }catch(e){ console.error(e); } });
  if (batchDepth){ batchDirty = true; return; }   /* อยู่ในชุดเขียน — บันทึกทีเดียวตอนจบชุด */
  persist();
}

/* ---------- ชุดเขียน (batch) --------------------------------
   persist() บันทึกทั้งฐานลง localStorage + เทียบทุกเอกสาร + วาดหน้าจอใหม่ ทุกครั้งที่เรียก
   นำเข้า 1,200 แถว = เรียก 2,400 ครั้ง ฐานยิ่งใหญ่ยิ่งช้า (QA TC-092: หน้าค้างเกิน 12 นาที)
   ห่อการเขียนหลายครั้งด้วย batchWrites() → ทำงานในแคชอย่างเดียว แล้ว persist ครั้งเดียวตอนจบ */
let batchDepth = 0, batchDirty = false;
export function batchWrites(fn){
  batchDepth++;
  try{ return fn(); }
  finally{
    batchDepth--;
    if (!batchDepth && batchDirty){ batchDirty = false; if (cache) persist(); }
  }
}

function persist(){
  /* จดว่ามีอะไรค้างส่งก่อนเสมอ — ต้องอยู่ก่อนการเขียนฐาน เพราะถ้าฐานเขียนไม่ลง
     (พื้นที่เต็ม) อย่างน้อยยังรู้ว่ามีงานค้าง ไม่ใช่เงียบไปทั้งคู่ */
  markDirty(cache);
  saveLocal(cache);
  syncUp();
  emit();
}

/* ---------- เขียนแคชลงเครื่อง -------------------------------
   รูป base64 ถูกดึงไปพักใน IndexedDB (pack) เหลือแค่ป้ายใน localStorage
   เขียนไม่ลง (เต็ม) ไม่โยน error — ข้อมูลอยู่ในหน่วยความจำและกล่องขาออกแล้ว
   ถ้าโยนตอนนี้ หน้าจอจะค้างฟอร์มไว้ให้คนขับกดซ้ำ = บันทึกซ้ำ
   แต่ห้ามเงียบ: ตั้งธง saveFailed ให้หน้าคนขับขึ้นแถบแดงบอกว่าอย่าเพิ่งปิดแอป */
/** เขียนแคชในเครื่องไม่สำเร็จล่าสุด (พื้นที่เต็ม) — ปิดแอปตอนนี้งานที่ยังไม่ขึ้นคลาวด์จะหาย */
export const saveFailed = () => lastSaveFailed;

function saveLocal(db){
  const was = lastSaveFailed;
  try{
    localStorage.setItem(KEY, pack(db));
    lastSaveFailed = false;
  }catch(e){
    /* รูปชุดใหม่ที่ยังเขียนลง IndexedDB ไม่เสร็จถูกฝากเป็น base64 ไว้ก่อน — เต็มก็ลองฝากเป็นป้ายแทน
       (อีกไม่กี่มิลลิวินาทีก็เขียนเสร็จ ดีกว่าไม่ได้บันทึกอะไรเลย) */
    try{
      if (!vaultReady()) throw e;
      localStorage.setItem(KEY, pack(db, { refsOnly:true }));
      lastSaveFailed = false;
    }catch(e2){
      console.error('[store] เขียนแคชในเครื่องไม่สำเร็จ (พื้นที่เต็ม?)', e2);
      lastSaveFailed = true;
    }
  }
  if (was !== lastSaveFailed) emit();
  return !lastSaveFailed;
}

/* รูปชุดใหม่เขียนลง IndexedDB เสร็จ → เขียน localStorage ใหม่ให้เหลือแค่ป้าย (คืนพื้นที่ทันที) */
setOnSaved(() => { if (cache) saveLocal(cache); });

/* ---------- ดันขึ้นคลาวด์ + กล่องขาออก ----------------------
   ส่งเฉพาะเอกสารที่เปลี่ยนจริง ไม่ใช่ทั้งฐาน (แก้ 20 ก.ย. — ดู STATUS.md 4.2)

   "กล่องขาออก" (outbox) คือรายชื่อเอกสารที่แก้ในเครื่องแล้วแต่ยังไม่ขึ้นคลาวด์
   มีไว้แก้ปัญหาข้อมูลหายตอนคนขับทำงานออฟไลน์ (ดู OFFLINE.md ข้อ 3):

     ของเดิม  snapshot จากคลาวด์ทับแคชในเครื่องเสมอ → งานที่ทำตอนไม่มีเน็ต
              ถูกลบทิ้งทันทีที่เน็ตกลับมา ก่อนจะได้ส่งขึ้นไปด้วยซ้ำ
     ของใหม่  เอกสารที่อยู่ในกล่องขาออก snapshot ห้ามทับ ต้องรอส่งขึ้นไปสำเร็จก่อน

   กล่องขาออกเก็บแค่ "รหัสเอกสาร" ไม่ได้เก็บตัวข้อมูล (ตัวข้อมูลอยู่ในแคชปกติอยู่แล้ว)
   จึงเล็กมากและไม่กินพื้นที่ซ้ำซ้อน · เขียนลง localStorage คนละคีย์กับฐานข้อมูล
   จะได้ไม่หายไปพร้อมกันถ้าเขียนฐานไม่สำเร็จ

   ทำไมมาร์กตอน write() ไม่ใช่ตอนส่ง — ถ้ารอไปมาร์กตอนส่ง (หน่วง 400 ms)
   แล้วคนขับปิดแอปในช่วงนั้นพอดี งานจะไม่ถูกจดว่าค้างส่ง แล้วหายเงียบ */
const CLOUD_COLLECTIONS = ['jobs', 'shipments', 'drivers'];
const OUTBOX_KEY = 'ft.outbox.v1';

/** ลายนิ้วมือของสิ่งที่อยู่บนคลาวด์แล้ว — `{ jobs: Map<id, json>, ... }` */
const pushed = Object.fromEntries(CLOUD_COLLECTIONS.map(n => [n, new Map()]));
let pushedSettings = null;

/** รหัสเอกสารที่ยังไม่ขึ้นคลาวด์ — `Set<"ชื่อคอลเลกชัน/รหัส">` */
let outbox = new Set();
try{ outbox = new Set(JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]')); }catch(e){}

const outKey = (name, id) => `${name}/${id}`;
const inOutbox = (name, id) => outbox.has(outKey(name, id));

function saveOutbox(){
  try{
    if (outbox.size) localStorage.setItem(OUTBOX_KEY, JSON.stringify([...outbox]));
    else localStorage.removeItem(OUTBOX_KEY);
  }catch(e){ console.error('[store] จดกล่องขาออกไม่สำเร็จ', e); }
}

/** มีงานค้างส่งกี่ชิ้น — หน้าจอเอาไปขึ้นป้ายบอกคนขับได้ */
export const pendingCount = () => outbox.size;

/** ส่งของค้างขึ้นคลาวด์เดี๋ยวนี้ไม่ต้องรอรวบ แล้วรอจนเสร็จ — ใช้ก่อนเรียกงานฝั่งเซิร์ฟเวอร์ที่อ่าน Firestore
 *  @return {Promise<boolean>} true = เอกสารนี้ขึ้นคลาวด์แล้ว (ไม่ระบุ = ทั้งกล่องขาออกว่าง) */
export async function flushNow(name, id, timeout = 10000){
  const done = () => (name && id) ? !inOutbox(name, id) : !outbox.size;
  if (!cloudReady()) return false;
  clearTimeout(pushTimer);
  const until = Date.now() + timeout;
  while (!done() && Date.now() < until){
    if (pushing) await new Promise(r => setTimeout(r, 200));     /* รอบก่อนยังส่งอยู่ */
    else await flushChanges().catch(() => {});
    if (!done() && !pushing) await new Promise(r => setTimeout(r, 500));   /* ส่งไม่ผ่าน — พักแล้วลองใหม่ */
  }
  return done();
}

const fingerprint = (o) => JSON.stringify(o ?? null);

/** จำว่าทั้งฐานตรงกับคลาวด์แล้ว — ใช้หลัง pushAll หรือหลังรับ snapshot มาทับ
 *  ข้ามเอกสารที่อยู่ในกล่องขาออก เพราะของในเครื่อง "ไม่ตรง" กับคลาวด์
 *  ถ้าเผลอมาร์ก ระบบจะนึกว่าส่งไปแล้วแล้วไม่ส่งอีกเลย = งานค้างอยู่ในเครื่องตลอดไป */
function markPushed(db, only){
  for (const name of CLOUD_COLLECTIONS){
    if (only && only !== name) continue;
    const m = pushed[name];
    m.clear();
    (db[name] || []).forEach(row => {
      if (row?.id && !inOutbox(name, row.id)) m.set(row.id, fingerprint(row));
    });
  }
  if (!only) pushedSettings = fingerprint(db.settings || {});
}

/** ลืมลายนิ้วมือและกล่องขาออกทั้งหมด — ใช้ตอนล้างคลาวด์ทิ้ง ของบนนั้นไม่เหลือแล้ว */
function forgetPushed(){
  CLOUD_COLLECTIONS.forEach(n => pushed[n].clear());
  pushedSettings = null;
  outbox.clear();
  saveOutbox();
}

/** หาว่ามีอะไรเปลี่ยนบ้างแล้วจดลงกล่องขาออก — เรียกแบบ synchronous ตอน write()
 *  นับรวมเอกสารที่ถูกลบออกจากเครื่องด้วย (มีในลายนิ้วมือแต่ไม่มีในแคชแล้ว) */
function markDirty(db){
  if (db?.seeded) return;             /* ข้อมูลเดโม่ในเครื่อง — ไม่ใช่ของที่ต้องส่งขึ้นคลาวด์ */
  let added = 0;
  for (const name of CLOUD_COLLECTIONS){
    const m = pushed[name];
    const alive = new Set();
    for (const row of db[name] || []){
      if (!row?.id) continue;
      alive.add(row.id);
      if (m.get(row.id) === fingerprint(row)) continue;
      if (!inOutbox(name, row.id)){ outbox.add(outKey(name, row.id)); added++; }
    }
    for (const id of m.keys()){
      if (alive.has(id)) continue;
      if (!inOutbox(name, id)){ outbox.add(outKey(name, id)); added++; }
    }
  }
  if (added) saveOutbox();
}

let pushTimer = null;
let pushing = false;

let holdUntil = 0, holdMs = 0;
/* รวบการเขียนหลายครั้งติด ๆ กันให้ส่งทีเดียว กันยิง Firestore รัว ๆ ตอนนำเข้าทีละร้อยแถว */
function syncUp(){
  if (!cloudReady()) return;
  clearTimeout(pushTimer);
  /* รอบก่อนส่งไม่ผ่าน (เน็ตหลุด / กฎปฏิเสธ) — พักตามเวลาที่ตั้งไว้ กันยิงซ้ำรัว ๆ วนไม่จบ */
  const wait = Math.max(400, holdUntil - Date.now());
  pushTimer = setTimeout(() => { flushChanges().catch(() => {}); }, wait);
}
/** จดผลรอบส่ง — ครบ = เลิกพัก · ไม่ครบ = พักนานขึ้นเรื่อย ๆ (15 วิ → 30 → … สูงสุด 5 นาที) */
function noteFlush(allOk){
  if (allOk){ holdMs = 0; holdUntil = 0; return; }
  holdMs = Math.min(300000, holdMs ? holdMs * 2 : 15000);
  holdUntil = Date.now() + holdMs;
}

/** ส่งของในกล่องขาออกขึ้นคลาวด์ แล้วเอาออกจากกล่องเฉพาะใบที่ส่งสำเร็จ
 *  ใบที่ส่งไม่ผ่าน (เน็ตหลุดกลางทาง) ยังอยู่ในกล่อง รอบหน้าจึงลองใหม่ให้เอง */
async function flushChanges(){
  if (pushing){ syncUp(); return; }   /* รอบก่อนยังไม่จบ — ต่อคิวไว้ */
  if (!cloudReady() || !outbox.size) return;

  pushing = true;
  const sent = [];
  let allOk = true;
  try{
    const db = cache;
    if (!db) return;

    for (const name of CLOUD_COLLECTIONS){
      const byId = new Map((db[name] || []).filter(r => r?.id).map(r => [r.id, r]));
      const ids = [...outbox]
        .filter(k => k.startsWith(name + '/'))
        .map(k => k.slice(name.length + 1));
      if (!ids.length) continue;

      const rows = ids.filter(id => byId.has(id)).map(id => byId.get(id));
      const gone = ids.filter(id => !byId.has(id));

      if (rows.length){
        const ok = await putDocs(name, rows);
        /* สำเนาหน้าติดตามพัสดุ (สาธารณะ) — คนขับเขียนได้แค่ข้อมูล ไม่ได้เขียนเลขค้นหา */
        if (name === 'shipments' && ok) putTracking(rows, db.drivers || [], { keys: isStaffSession() }).catch(() => {});
        /* putDocs เขียนเป็นก้อนละ 400 ใบ ก้อนไหนล้มจะข้ามไป — ถ้าไม่ครบก็ไม่เอาออกจากกล่อง
           ปล่อยให้รอบหน้าส่งซ้ำทั้งชุด ดีกว่าเอาออกผิดแล้วข้อมูลค้างไม่ขึ้นคลาวด์ */
        if (ok === rows.length){
          rows.forEach(r => {
            pushed[name].set(r.id, fingerprint(r));
            outbox.delete(outKey(name, r.id));
          });
        } else allOk = false;
        sent.push(`${name} ${ok}/${rows.length}`);
      }

      if (gone.length){
        const ok = await removeDocs(name, gone);
        if (name === 'shipments' && ok && isStaffSession()) removeTracking(gone).catch(() => {});
        if (ok === gone.length){
          gone.forEach(id => { pushed[name].delete(id); outbox.delete(outKey(name, id)); });
        } else allOk = false;
        sent.push(`ลบ ${name} ${ok}`);
      }
    }

    const sfp = fingerprint(db.settings || {});
    /* ค่าตั้งค่ากลางเป็นของออฟฟิศ — คนขับไม่ส่ง (กฎฐานข้อมูลปฏิเสธอยู่แล้ว จะได้ไม่วนส่งซ้ำ) */
    if (sfp !== pushedSettings && isStaffSession()){
      if (await putDoc('meta', { id:'settings', ...(db.settings || {}) })) pushedSettings = sfp;
    }
  }finally{
    pushing = false;
    noteFlush(allOk);
    saveOutbox();
    /* เปิดคอนโซลดูได้ว่าการกดหนึ่งครั้งเขียนขึ้นคลาวด์กี่ใบจริง ๆ
       ถ้าเห็นตัวเลขโตผิดปกติแปลว่ามีอะไรแก้ข้อมูลรัวโดยไม่ตั้งใจ */
    if (sent.length) console.info('[cloud] ซิงก์ขึ้นคลาวด์ —', sent.join(' · '),
      outbox.size ? `· ค้างอีก ${outbox.size}` : '');
    emit();
  }
}

/** ลองส่งของค้างใหม่ — เรียกตอนเน็ตกลับมา หรือตอนเปิดแอปแล้วพบว่ามีของค้าง */
export function retrySync(){ if (outbox.size) syncUp(); }

if (typeof window !== 'undefined'){
  /* เน็ตกลับมาแล้วส่งต่อทันที ไม่ต้องรอให้คนขับกดอะไรอีกครั้ง */
  addEventListener('online', () => { holdUntil = 0; holdMs = 0; retrySync(); });
}

/* ---------- รับข้อมูลจากคลาวด์ ----------------------------- */
/** รวมไทม์ไลน์สองฝั่งโดยไม่ให้ซ้ำ — ยึดของในเครื่องเป็นหลัก เติมของที่คลาวด์มีเพิ่ม
 *  events เป็นรายการที่มีแต่เพิ่ม ไม่เคยแก้ของเดิม จึงรวมกันได้โดยไม่ต้องตัดสินว่าใครถูก */
function mergeEvents(local, cloud){
  const seen = new Set((local.events || []).map(e => e.id));
  const extra = (cloud.events || []).filter(e => e?.id && !seen.has(e.id));
  const out = extra.length ? { ...local, events: [...(local.events || []), ...extra]
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || ''))) } : local;
  return mergeInvoiceReturns(mergePayments(out, cloud), cloud);
}

/** ประวัติการคืนเอกสาร Inv. (invoiceReturns) — มีแต่เพิ่มเหมือน payments รวมสองฝั่งแบบเดียวกัน */
function mergeInvoiceReturns(local, cloud){
  const seen = new Set((local.invoiceReturns || []).map(r => r.id));
  const extra = (cloud.invoiceReturns || []).filter(r => r?.id && !seen.has(r.id));
  if (!extra.length) return local;
  const invoiceReturns = [...(local.invoiceReturns || []), ...extra]
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
    .map((r, i) => ({ ...r, round: i + 1 }));
  return { ...local, invoiceReturns, invoiceReturn: currentInvoiceReturn(invoiceReturns) };
}

/** ประวัติการชำระเงินของจุดส่ง (payments) ก็มีแต่เพิ่มเหมือน events — รวมสองฝั่งได้ตรง ๆ
 *  คนขับกับผู้ช่วยใช้บัญชีเดียวกันคนละเครื่อง ถ้าไม่รวม รอบที่อีกเครื่องบันทึกจะหายตอนเครื่องนี้ส่งทับ */
function mergePayments(local, cloud){
  const seen = new Set((local.payments || []).map(p => p.id));
  const extra = (cloud.payments || []).filter(p => p?.id && !seen.has(p.id));
  if (!extra.length) return local;
  const payments = [...(local.payments || []), ...extra]
    .sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
    .map((p, i) => ({ ...p, round: i + 1 }));
  return { ...local, payments, payment: latestPayment(payments) };
}

/* เครื่องคนขับ/ผู้ช่วยแก้ได้แค่ช่องของหน้าคนขับ (กฎฐานข้อมูล driverEdit — QA TC-114)
   เอกสารที่ค้างส่ง ช่องอื่นต้องยึดของคลาวด์ (เช่น ค่ารอบที่ออฟฟิศเพิ่งแก้) ไม่งั้นตอนส่งขึ้นไป
   จะกลายเป็นการแก้ช่องของออฟฟิศ แล้วโดนกฎปฏิเสธค้างอยู่ในกล่องขาออก */
const DRIVER_FIELDS = ['status', 'events', 'updatedAt', 'payments', 'payment', 'invoiceReturns', 'invoiceReturn'];
/* billIn เป็นของผู้รวบรวมบิลคนเดียว — เครื่องคนขับคนอื่นต้องยึดของคลาวด์ ไม่งั้นค่าเก่าในเครื่องไปทับ (และโดนกฎปฏิเสธ) */
const amCollector = () => !!watchKey && watchKey.includes('"since"');
function driverOwned(name, local, cloud){
  if (isStaffSession() || (name !== 'jobs' && name !== 'shipments')) return local;
  const out = { ...cloud };
  [...DRIVER_FIELDS, ...(amCollector() ? ['billIn'] : [])].forEach(k => { if (k in local) out[k] = local[k]; });
  /* สถานะเดินหน้าอย่างเดียว — ออฟฟิศเดินไปไกลกว่า หรือยกเลิกไปแล้ว ให้ยึดของคลาวด์ */
  if (stepIndex(cloud.status) < 0 || stepIndex(cloud.status) > stepIndex(local.status)) out.status = cloud.status;
  return out;
}

/* Firestore เป็นตัวจริง — ของที่ส่งมาทับแคชในเครื่องเสมอ
   ยกเว้นตอนคลาวด์ยังว่างเปล่าแต่เครื่องมีข้อมูลอยู่ (เพิ่งต่อครั้งแรก) ให้ดันของเครื่องขึ้นไปแทน */
let firstSnapshot = { jobs:true, shipments:true, drivers:true };

function applyFromCloud(name, rows){
  if (name === 'drivers' && !isStaffSession() && watchKey && !watchKey.includes('"since"')){
    const me = (() => { try{ return JSON.parse(watchKey).driverId; }catch{ return ''; } })();
    if (me && isBillCollector(rows.find(d => d.id === me))) setTimeout(() => rewatch(lastUser).catch(() => {}), 0);
  }
  const db = read();
  if (firstSnapshot[name]){
    firstSnapshot[name] = false;
    if (!rows.length && (db[name] || []).length && !db.seeded && isStaffSession() && canWrite()){
      /* คลาวด์ยังว่างแต่เครื่องมีของ — ปกติคือเพิ่งต่อครั้งแรก ดันทั้งชุดขึ้นไป
         แต่ถ้าเคยกด "ล้างข้อมูลทั้งหมด" (meta/wipe) คลาวด์ว่างเพราะถูกล้าง — ของในเครื่องคือของเก่า ทิ้งให้ตรงคลาวด์
         (ไม่งั้นงานที่ล้างไปจะฟื้นกลับมาจากเบราว์เซอร์เครื่องอื่น) */
      wipedAt().then(at => {
        if (!at || name === 'drivers'){ pushAll(db).then(ok => { if (ok) markPushed(db); }).catch(() => {}); return; }
        for (const k of [...outbox]) if (k.startsWith(name + '/')) outbox.delete(k);
        saveOutbox();
        applyFromCloud(name, []);
        console.info(`[store] คลาวด์ถูกล้างเมื่อ ${new Date(at).toLocaleString('th-TH')} — ทิ้ง ${name} เก่าในเครื่องแล้ว`);
      }).catch(() => {});
      return;
    }
  }
  /* ---- รวมข้อมูลจากคลาวด์เข้ากับของในเครื่อง ----
     ของเดิมทับทั้งคอลเลกชัน (db[name] = rows) ซึ่งลบงานที่ทำตอนออฟไลน์ทิ้ง
     ตอนนี้เอกสารที่ยังค้างส่ง (อยู่ในกล่องขาออก) จะไม่ถูกทับ

     ยกเว้น events ที่รวมสองฝั่งเข้าด้วยกัน เพราะเป็นรายการที่มีแต่เพิ่ม ไม่เคยลบ
     ทำให้บันทึกที่แอดมินเพิ่มบนเว็บระหว่างที่คนขับออฟไลน์อยู่ไม่หายไปด้วย */
  const localById = new Map((db[name] || []).filter(r => r?.id).map(r => [r.id, r]));
  const fromCloud = new Set();
  const merged = [];

  for (const row of rows){
    if (!row?.id){ merged.push(row); continue; }
    fromCloud.add(row.id);
    const local = localById.get(row.id);
    /* ลบในเครื่องแล้วแต่คำสั่งลบยังไม่ถึงคลาวด์ — ห้ามเอากลับมา
       ไม่งั้นงานที่ถูกรวม/ล้างไปแล้วจะฟื้นขึ้นมา แล้วถูกส่งขึ้นคลาวด์ใหม่ค้างถาวร */
    if (!local && inOutbox(name, row.id)) continue;
    if (local && inOutbox(name, row.id)) merged.push(mergeEvents(driverOwned(name, local, row), row));
    else merged.push(row);
  }

  /* งานที่เพิ่งสร้างในเครื่องและยังไม่เคยขึ้นคลาวด์ ต้องไม่หายไปกับ snapshot */
  for (const [id, local] of localById){
    if (!fromCloud.has(id) && inOutbox(name, id)) merged.push(local);
  }

  db[name] = merged;
  /* ได้ข้อมูลจริงครบทุกคอลเลกชันแล้ว — เลิกเป็นเครื่องเดโม่ งานที่ทำหลังจากนี้ส่งขึ้นคลาวด์ตามปกติ */
  if (db.seeded && !Object.values(firstSnapshot).some(Boolean)) delete db.seeded;
  /* ของที่เพิ่งรับมาจากคลาวด์ = ตรงกับคลาวด์อยู่แล้ว ต้องมาร์กไว้
     ไม่งั้นรอบส่งถัดไปจะนึกว่าทุกใบ "เปลี่ยน" แล้วส่งกลับขึ้นไปอีก วนไม่จบ
     (markPushed ข้ามใบที่อยู่ในกล่องขาออกให้เอง) */
  markPushed(db, name);
  saveLocal(db);
  emit(true);
  /* มีของค้างอยู่และตอนนี้คลาวด์ตอบแล้ว = ต่อเน็ตได้ ลองส่งใหม่เลย */
  retrySync();
}

/* ---------- เริ่มซิงก์ — หลังผ่านด่านสิทธิ์ และดึงเฉพาะที่คนนี้มีสิทธิ์ ----------
   ออฟฟิศ (Google)          → ทุกคอลเลกชัน
   คนขับ (บัตรผ่านจาก Apps Script) → เฉพาะเที่ยว/จุดส่งของตัวเอง + รายชื่อคนขับ
   หน้าสาธารณะ (ติดตามพัสดุ)   → ไม่ดึงอะไรเลย (หน้านั้นอ่านจากสำเนาสาธารณะเอง)
   คนขับที่ยังไม่มีบัตรผ่าน (Apps Script ยังไม่ได้ตั้ง) → ดึงทั้งหมดแบบเดิม ใช้ได้เฉพาะตอนกฎฐานข้อมูลยังเปิด
   สถานะล็อกอินเปลี่ยน (คนขับเพิ่งล็อกอิน / ออก) → เลิกฟังชุดเดิมแล้วฟังชุดใหม่ */
const isStaffSession = () => getSession().kind === 'staff';
/** ได้ข้อมูลจากคลาวด์ครบทุกคอลเลกชันของชุดที่ฟังอยู่แล้ว (ใช้แยก "ยังโหลดไม่เสร็จ" กับ "ไม่มีข้อมูลนี้จริง") */
export const cloudSynced = () => !!watchKey && watchKey !== 'none' && !Object.values(firstSnapshot).some(Boolean);
let unwatch = null, watchKey = null;

let lastUser = null;
async function rewatch(user){
  lastUser = user;
  const ses = getSession();
  let scope = null;
  if (ses.kind === 'staff') scope = {};
  else if (ses.kind === 'driver' || ses.kind === 'external'){
    const driverId = await driverIdOf(user);
    /* ยังไม่มีบัตรผ่าน: ตั้ง Apps Script แล้ว = รอล็อกอินก่อน ไม่ต้องดึงอะไร (กฎฐานข้อมูลปฏิเสธอยู่แล้ว)
       ยังไม่ได้ตั้ง = โหมดเดิม ดึงทั้งหมด (ใช้ได้เฉพาะตอนกฎยังเปิด) */
    scope = driverId ? { driverId } : (hasApi() ? null : {});
    /* ผู้รวบรวมบิลคืน — ดึงงานของทุกคนย้อนหลัง COLLECT_DAYS วันเพิ่ม (กฎ isCollector ยอมให้อ่าน) */
    if (driverId && isBillCollector(read().drivers.find(d => d.id === driverId))) scope.since = collectSince();
  }
  const key = scope ? JSON.stringify(scope) : 'none';
  if (key === watchKey) return;
  watchKey = key;
  if (unwatch){ unwatch(); unwatch = null; }
  /* เปลี่ยนชุดข้อมูล — snapshot แรกของชุดใหม่ต้องได้รับการปฏิบัติเหมือนครั้งแรกอีกรอบ */
  firstSnapshot = { jobs:true, shipments:true, drivers:true };
  if (!scope) return;
  unwatch = watchAll(applyFromCloud, scope);
  /* เปิดแอปมาแล้วมีงานค้างจากรอบที่แล้ว (ปิดแอปตอนไม่มีเน็ต) — ส่งต่อให้เลย */
  if (outbox.size){
    console.info(`[store] มีงานค้างส่งจากรอบที่แล้ว ${outbox.size} ชิ้น — กำลังส่งต่อ`);
    retrySync();
  }
}

initCloud().then(async (ok) => {
  console.log(ok ? '[store] ต่อ Firestore แล้ว' : '[store] ทำงานแบบออฟไลน์ (เก็บในเครื่องอย่างเดียว)');
  if (!ok) return;
  await whenGated();
  onAuthUser((u) => { rewatch(u).catch(err => console.error('[store] เริ่มซิงก์ไม่สำเร็จ', err)); });
});

/** เตรียมข้อมูลก่อนเปิดกฎฐานข้อมูล (admin กดครั้งเดียว · กดซ้ำได้ไม่เสียหาย)
 *  1) สร้างสำเนาหน้าติดตามพัสดุของทุกจุดส่ง  2) เขียนรายชื่อคนขับใหม่ทั้งชุดเพื่อลบ PIN ออกจากฐานข้อมูล
 *  @returns {Promise<{tracking:number, drivers:number, total:number}>} */
export async function prepareForRules(){
  if (!cloudReady()) throw new Error('ยังต่อฐานข้อมูลไม่ได้ — ตรวจอินเทอร์เน็ต');
  if (!isStaffSession() || !canWrite()) throw new Error('ต้องเป็นพนักงานที่แก้ไขได้');
  const db = read();
  const tracking = await putTracking(db.shipments || [], db.drivers || [], { keys:true });
  const drivers = await putDocs('drivers', db.drivers || []);
  return { tracking, drivers, total:(db.shipments || []).length };
}

/* ---------- pub/sub (ข้ามแท็บได้) -------------------------- */
const subs = new Set();
let chan = null;
try{ chan = new BroadcastChannel('ft.sync'); }catch(e){ chan = null; }

function emit(fromRemote){
  reuseOf_ = null;
  if (!fromRemote && chan) { try{ chan.postMessage({ t: Date.now() }); }catch(e){} }
  subs.forEach(fn => { try{ fn(); }catch(e){ console.error(e); } });
}
function refetch(){ cache = null; read(); emit(true); }

if (chan) chan.onmessage = refetch;
addEventListener('storage', (e) => { if (e.key === KEY) refetch(); });

/** ฟังทุกการเปลี่ยนแปลง — คืนฟังก์ชันสำหรับเลิกฟัง */
export function subscribe(fn){ subs.add(fn); return () => subs.delete(fn); }

/** งาน/เที่ยวนี้เป็นของคนขับคนนี้ไหม — เช็คทั้งชุด ไม่ใช่แค่คนแรก
 *  หนึ่งเที่ยวมีคนขับได้หลายคน (ช่องคนขับในไฟล์ใส่ได้หลายชื่อ) ทุกคนต้องเห็นงานเดียวกัน */
export const hasDriver = (row, id) =>
  !!id && (row?.driverId === id || (Array.isArray(row?.driverIds) && row.driverIds.includes(id)));

/* ---------- อ่าน ------------------------------------------ */
export const settings = () => clone(read().settings);
export const getDriver = (id) => clone(read().drivers.find(d => d.id === id) || null);

/** คนขับที่ยังรับงานได้ — ข้อมูลชุดเก่าไม่มีฟิลด์ active จึงถือว่าใช้งานอยู่ */
export const isActiveDriver = (d) => !!d && d.active !== false;

/** @param {{active?:boolean, external?:boolean}} filter
 *  active:true   = เอาเฉพาะคนที่ยังรับงานได้
 *  external:true = เฉพาะคนขับภายนอก · false = เฉพาะคนขับในระบบ · ไม่ใส่ = ทั้งหมด */
export const listDrivers = (filter = {}) =>
  clone(read().drivers.filter(d =>
    (filter.active ? isActiveDriver(d) : true) &&
    (filter.external === undefined ? true : isExternal(d) === !!filter.external)));

/** สรุปภาระงานของคนขับ ใช้ในหน้าจัดการข้อมูลคนขับ */
export function driverStats(id){
  const rows = read().shipments.filter(s => hasDriver(s, id));
  return {
    total: rows.length,
    open: rows.filter(s => isOpen(s.status)).length,
    delivered: rows.filter(s => s.status === S.DELIVERED).length,
    lastAt: rows.map(s => s.updatedAt).sort().pop() || null,
  };
}

export function listShipments(filter = {}){
  let out = read().shipments.slice();
  if (filter.status)   out = out.filter(s => s.status === filter.status);
  if (filter.driverId) out = out.filter(s => hasDriver(s, filter.driverId));
  if (filter.open)     out = out.filter(s => isOpen(s.status));
  if (filter.q){
    const q = filter.q.trim().toLowerCase();
    out = out.filter(s =>
      [s.code, s.customer.name, s.dropoff.name, s.dropoff.address, s.invoice.number, s.cargo.desc]
        .join(' ').toLowerCase().includes(q));
  }
  out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return clone(out);
}

/** ค้นจุดส่งด้วยเลขใดก็ได้ — คืน "ทุกใบ" ที่ตรง
 *  เลขบิลที่ซ้ำกันในไฟล์จะถูกแยกเป็น -1 -2 ลูกค้าค้นด้วยเลขเปล่าต้องเจอครบทั้งชุด
 *  @returns {object[]} เรียงตามลำดับใบในชุด */
export function findShipments(key){
  if (!key) return [];
  const k = String(key).trim().toUpperCase();
  if (!k) return [];
  const hit = read().shipments.filter(x =>
    x.id === key ||
    x.code.toUpperCase() === k ||
    String(x.baseCode ?? '').toUpperCase() === k ||
    (x.altCodes || []).some(c => String(c).toUpperCase() === k) ||
    String(x.delivery ?? '').toUpperCase() === k);
  hit.sort((a, b) => a.code.localeCompare(b.code, 'th', { numeric:true }));
  return clone(hit);
}

export function getShipment(key){
  return findShipments(key)[0] || null;
}

export function counts(){
  const c = { total:0, open:0 };
  FLOW.concat(S.CANCELLED).forEach(k => c[k] = 0);
  read().shipments.forEach(s => { c.total++; c[s.status]++; if (isOpen(s.status)) c.open++; });
  return c;
}

/* ---------- เขียน ----------------------------------------- */
function nextCode(db){
  const now = new Date();
  const stamp = `${String(now.getFullYear() + 543).slice(-2)}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
  const n = db.shipments.filter(s => s.code.includes(stamp)).length + 1;
  return `FT-${stamp}-${pad(n)}`;
}

/** 1. ลูกค้าสร้างคำสั่งขนส่ง + แนบใบแจ้งหนี้ */
export function createShipment(p){
  const db = read();
  const missing = [];
  if (!p.customer?.name)   missing.push('ชื่อบริษัทผู้ส่ง');
  if (!p.dropoff?.name)    missing.push('ปลายทาง');
  if (!p.dropoff?.address) missing.push('ที่อยู่ปลายทาง');
  if (!p.cargo?.desc)      missing.push('รายละเอียดสินค้า');
  if (!p.invoice?.number && !p.code) missing.push('เลขที่ใบแจ้งหนี้');
  if (missing.length) throw new Error('กรอกไม่ครบ: ' + missing.join(', '));

  /* เลขงานจากไฟล์นำเข้า (Delivery หรือ Invoice) — ใช้เลขนั้นตรง ๆ ไม่สร้างเลขใหม่
     ตรงตามที่ลูกค้าสั่งว่า "เลข Tag อยากให้เป็นเลข Inv. เหมือนกันทั้งหมด" */
  const givenCode = String(p.code ?? '').trim();
  if (givenCode && db.shipments.some(x => x.code.toUpperCase() === givenCode.toUpperCase())){
    throw new Error(`เลข ${givenCode} มีอยู่ในระบบแล้ว`);
  }

  /* คนขับหลายคนต่อหนึ่งใบ (ช่องคนขับในไฟล์ Excel) — คนแรกเป็นคนหลักเพื่อให้หน้าเดิมทำงานได้
     ส่วนรายชื่อเต็มเก็บไว้ที่ driverIds รอโครงสร้างรอบวิ่งในเฟสถัดไป */
  const ids = (Array.isArray(p.driverIds) ? p.driverIds : [])
    .filter(id => db.drivers.some(d => d.id === id));

  const at = iso(Date.now());
  const s = {
    id: uid('sh'), code: givenCode || nextCode(db),
    jobId: p.jobId || null, seq: Number(p.seq) || 0,
    delivery: String(p.delivery ?? '').trim(),
    /* เลขบิลดิบก่อนต่อท้าย -1 -2 — ลูกค้าค้นด้วยเลขนี้แล้วต้องเจอทุกใบในชุด */
    baseCode: String(p.baseCode ?? '').trim(),
    customer: { name:p.customer.name, contact:p.customer.contact || '', phone:p.customer.phone || '' },
    invoice: {
      number: p.invoice.number, amount: Number(p.invoice.amount) || 0,
      fileName: p.invoice.fileName || '', kind: p.invoice.kind || '', dataUrl: p.invoice.dataUrl || null,
    },
    pickup: { name: p.pickup?.name || db.settings.warehouse, address: p.pickup?.address || '' },
    dropoff: { name:p.dropoff.name, address:p.dropoff.address, contact:p.dropoff.contact || '', phone:p.dropoff.phone || '' },
    cargo: {
      desc: p.cargo.desc, pieces: Number(p.cargo.pieces) || 0,
      unit: String(p.cargo.unit || '').trim().slice(0, 20) || DEFAULT_UNIT,
      weightKg: Number(p.cargo.weightKg) || 0, note: p.cargo.note || '',
    },
    serviceDate: p.serviceDate || localYMD(),
    driverId: ids[0] || null, driverIds: ids,
    source: p.source || null,
    /* จุดส่งที่เพิ่มเข้าเที่ยวที่เดินไปแล้ว ต้องตามสถานะเที่ยวทันที ไม่ย้อนกลับไป "งานใหม่" */
    status: (p.jobId && db.jobs.find(j => j.id === p.jobId)?.status) || S.NEW,
    createdAt: at, updatedAt: at,
    events: [{
      id: uid('ev'), status:S.NEW, at,
      byRole: p.byRole || 'customer',
      byName: p.byName || p.customer.contact || p.customer.name,
      note: p.note || 'สร้างคำสั่งขนส่งผ่านหน้าลูกค้า',
      photos:[], geo:null, signature:null, label:META[S.NEW].label,
    }],
  };
  if (ids.length){
    s.events.push(editEvent(`คนขับจากไฟล์: ${ids.map(id => driverName(db.drivers.find(d => d.id === id))).join(' · ')}`,
      { byRole: p.byRole || 'ops', byName: p.byName || 'นำเข้าจาก Excel' }));
  }
  db.shipments.push(s);
  write();
  return clone(s);
}

/* ============================================================
   ชั้น "เที่ยว" (job) — หนึ่ง Shipment No. = หนึ่งเที่ยวรถ = หนึ่งงาน

   หนึ่งเที่ยวมีได้หลายจุดส่ง (stop) ซึ่งก็คือ shipment หนึ่งใบต่อหนึ่งบิล
   ขั้น รับเข้าคลัง / ขึ้นรถ / ออกจากคลัง เป็นของทั้งเที่ยว กดครั้งเดียวมีผลทุกจุด
   ส่วนขั้น ส่งมอบสำเร็จ เป็นของรายจุด ต้องถ่ายรูปและแนบพิกัดของจุดนั้น ๆ
   ============================================================ */

/** จุดส่งทั้งหมดของเที่ยวนี้ เรียงตามลำดับในไฟล์ */
const stopsOf = (db, jobId) =>
  db.shipments.filter(x => x.jobId === jobId).sort((a, b) => (a.seq || 0) - (b.seq || 0));

/** ยอดรวมของทั้งเที่ยว ใช้โชว์บนการ์ดโดยไม่ต้องบวกเองทุกหน้า */
function jobRollup(db, j){
  const stops = stopsOf(db, j.id);
  const done = stops.filter(x => x.status === S.DELIVERED).length;
  return {
    stops: stops.length,
    delivered: done,
    remaining: stops.filter(x => isOpen(x.status)).length,
    /* บิลที่ยกเลิก — ตัวนับ "ส่งแล้ว x/y" ใช้ y = live (ไม่นับบิลยกเลิก) ให้ตรงกับกฎปิดเที่ยว (jobStatusOf) */
    cancelled: stops.filter(x => x.status === S.CANCELLED).length,
    live: stops.filter(x => x.status !== S.CANCELLED).length,
    weightKg: stops.reduce((a, x) => a + (Number(x.cargo?.weightKg) || 0), 0),
    amount:   stops.reduce((a, x) => a + (Number(x.invoice?.amount) || 0), 0),
    /* ค่าขนส่งของเที่ยว = รวมค่าขนส่งรายบิล (stopRevenue) · job.revenue = ที่เก็บไว้ (ใบวางบิลรายเที่ยวแบบเก่าเทียบกับค่านี้) */
    revenueSum: stops.filter(x => x.status !== S.CANCELLED).reduce((a, x) => a + stopRevenue(x), 0),
    dests: [...new Set(stops.map(x => x.dropoff?.name).filter(Boolean))].length,
    payTotal: payTotal(j.pay),
    /* จุดส่งด่วนที่ส่งไปแล้วแต่เอกสารยังไม่ครบ (แท็บ "รอปิดงาน" ในหน้า ops) */
    rtPending: stops.filter(x => rtMissing(x, j).length).length,
    /* งานด่วนติดป้ายตลอด แม้ปิดงานแล้ว หรือถูกรวมเข้าเที่ยวอื่น (ดูจากธง realtime ไม่ใช่เลข RT-) */
    isRt: !!j.realtime || stops.some(x => x.realtime),
    /* งานด่วนที่ยังไม่ส่ง — ป้ายแดงบนการ์ดเที่ยวหน้าคนขับ */
    rtOpen: stops.filter(x => x.realtime && isOpen(x.status)).length,
    rtDocs: [...new Set(stops.map(rtDocLabel).filter(Boolean))],
  };
}

/* สถานะเที่ยวตามบิลจริง (31 ต.ค. — ผู้ใช้เจอเที่ยว "รอของ" ทั้งที่ส่งแล้ว 4/4)
   บิลที่ไม่ยกเลิกส่งครบทุกใบ = ส่งมอบสำเร็จ ไม่ว่าเที่ยวค้างขั้นไหน (ไม่รอชำระเงิน/คืนบิล)
   เที่ยวที่ปิดแล้วแต่มีบิลใหม่ยังไม่ส่ง = กลับเป็นกำลังเดินทาง (รถออกไปแล้ว ส่งบิลใหม่ได้เลย)
   ใช้ทั้งหน้าคนขับและหน้าพนักงาน (withRollup · listJobs) · เครื่องพนักงานบันทึกลงฐานข้อมูลให้ใน tidyJobs (settleJobs) */
function jobStatusOf(db, j){
  if (j.status === S.CANCELLED) return j.status;
  const live = stopsOf(db, j.id).filter(x => x.status !== S.CANCELLED);
  if (!live.length) return j.status;
  if (live.every(x => x.status === S.DELIVERED)) return S.DELIVERED;
  if (j.status === S.DELIVERED) return S.DEPARTED;
  return j.status;
}

const withRollup = (db, j) => ({ ...clone(j), ...jobRollup(db, j), status: jobStatusOf(db, j) });

export function listJobs(filter = {}){
  const db = read();
  let out = db.jobs.slice();
  if (filter.status)   out = out.filter(j => jobStatusOf(db, j) === filter.status);
  if (filter.driverId) out = out.filter(j => hasDriver(j, filter.driverId));
  if (filter.open)     out = out.filter(j => isOpen(jobStatusOf(db, j)));
  if (filter.q){
    /* ค้นได้ทุกคีย์เวิร์ด — หลายคำคั่นด้วยเว้นวรรค ต้องเจอครบทุกคำ (ลำดับไม่สำคัญ)
       เช่น "สมชาย 7372007589" หรือ "พูลทรัพย์ ตราด" */
    const terms = filter.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const drvText = (ids) => (ids || []).map(id => db.drivers.find(d => d.id === id))
      .filter(Boolean).map(d => `${d.name} ${d.plate || ''} ${d.phone || ''} ${d.truck || ''}`).join(' ');
    const hit = (j) => {
      const stops = stopsOf(db, j.id);
      const text = [
        j.code, j.group, j.vehicle, j.carrier, j.serviceDate, META[j.status]?.label,
        drvText([...(j.driverIds || []), j.driverId]),
        ...stops.map(x => [
          x.code, x.baseCode, x.delivery, ...(x.altCodes || []),
          x.invoice?.number, x.source?.shipmentNo, x.source?.fileShipmentNo, x.source?.sheet,
          x.customer?.name, x.customer?.contact, x.customer?.phone,
          x.dropoff?.name, x.dropoff?.address, x.dropoff?.contact, x.dropoff?.phone,
          x.cargo?.desc, x.cargo?.note,
          drvText([...(x.driverIds || []), x.driverId]),
        ].join(' ')),
      ].join(' ').toLowerCase();
      return terms.every(t => text.includes(t));
    };
    out = out.filter(hit);
  }
  out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return out.map(j => withRollup(db, j));
}

export function getJob(key){
  if (!key) return null;
  const db = read();
  const k = String(key).trim().toUpperCase();
  const j = db.jobs.find(x => x.id === key || x.code.toUpperCase() === k);
  if (!j) return null;
  return { ...withRollup(db, j), stopList: stopsOf(db, j.id).map(clone) };
}

/** จุดส่งของเที่ยวนี้ เรียงลำดับแล้ว */
export const jobStops = (jobId) => stopsOf(read(), jobId).map(clone);

/** สร้างเที่ยวใหม่ — เรียกจากตัวนำเข้า Excel ก่อนสร้างจุดส่ง */
export function createJob(p = {}){
  const db = read();
  const code = trim(p.code);
  if (!code) throw new Error('เที่ยวนี้ไม่มีเลข Shipment No.');
  const dup = db.jobs.find(j => j.code.toUpperCase() === code.toUpperCase());
  if (dup) return clone(dup);        /* มีอยู่แล้ว ใช้ของเดิม แล้วไปเพิ่มจุดส่งต่อ */

  const ids = (Array.isArray(p.driverIds) ? p.driverIds : []).filter(id => db.drivers.some(d => d.id === id));
  const at = iso(Date.now());
  const j = {
    id: jobIdFor(db, code), code,
    /* กลุ่มจากช่องจัดส่งโดยของไฟล์ SM — งานเลข 7 ที่แยกออกไปทีหลังเก็บชื่อกลุ่มเดียวกัน (regroupStop) */
    group: trim(p.group),
    vehicle: trim(p.vehicle), carrier: trim(p.carrier),
    serviceDate: p.serviceDate || localYMD(),
    pickup: { name: p.pickup?.name || db.settings.warehouse },
    driverId: ids[0] || null, driverIds: ids,
    status: S.NEW, createdAt: at, updatedAt: at,
    source: p.source || null,
    events: [{
      id: uid('ev'), status: S.NEW, at,
      byRole: p.byRole || 'ops', byName: p.byName || 'นำเข้าจาก Excel',
      note: p.note || 'สร้างเที่ยวจากไฟล์ Excel',
      photos: [], geo: null, signature: null, label: META[S.NEW].label,
    }],
  };
  db.jobs.push(j);
  write();
  return clone(j);
}

/** จ่ายงานทั้งเที่ยวให้คนขับ — จุดส่งทุกจุดตามไปด้วย */
export function assignJobDriver(jobId, driverIds, by = {}){
  const db = read();
  const j = db.jobs.find(x => x.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');

  const ids = (Array.isArray(driverIds) ? driverIds : [driverIds]).filter(Boolean)
    .filter(id => db.drivers.some(d => d.id === id));
  for (const id of ids){
    const d = db.drivers.find(x => x.id === id);
    if (!isActiveDriver(d)) throw new Error(`${d.name} ถูกปิดใช้งานอยู่`);
  }

  const from = j.driverIds.map(id => driverName(db.drivers.find(d => d.id === id))).filter(Boolean).join(' · ') || 'ยังไม่จ่ายงาน';
  const to   = ids.map(id => driverName(db.drivers.find(d => d.id === id))).filter(Boolean).join(' · ') || 'ยังไม่จ่ายงาน';

  j.driverIds = ids;
  j.driverId = ids[0] || null;
  j.updatedAt = iso(Date.now());
  /* ownDriverIds = แอดมินจ่ายเอง — ย้ายไปงานเลข 7 แล้วคนขับตามจุดไปด้วย (ownersOf) */
  stopsOf(db, j.id).forEach(x => { x.driverId = j.driverId; x.driverIds = ids.slice(); x.ownDriverIds = ids.slice(); });
  if (from !== to) j.events.push(editEvent(`คนขับ: ${from} → ${to}`, by));

  write();
  return withRollup(db, j);
}

/** หมายเหตุของเที่ยว — ทีมคลังพิมพ์ในหน้าต่างเที่ยว (ops) โชว์ต่อท้ายสถานะ และบนการ์ดเที่ยวของคนขับ
 *  เว้นว่าง = ลบหมายเหตุ · เปลี่ยนแต่ละครั้งลงประวัติเที่ยว */
export const MAX_JOB_NOTE = 300;
export function setJobNote(jobId, note, by = {}){
  const db = read();
  const j = db.jobs.find(x => x.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');
  const next = String(note || '').replace(/\s+/g, ' ').trim().slice(0, MAX_JOB_NOTE);
  const prev = j.note || '';
  if (next === prev) return withRollup(db, j);
  j.note = next;
  j.updatedAt = iso(Date.now());
  j.events.push(editEvent(next ? `หมายเหตุเที่ยว: ${next}` : 'ลบหมายเหตุเที่ยว', by));
  write();
  return withRollup(db, j);
}

/** เดินสถานะของทั้งเที่ยว (รับเข้าคลัง / ขึ้นรถ / ออกจากคลัง)
 *  ขั้น "ขึ้นรถ" บังคับรูปสินค้าบนรถอย่างน้อย 2 รูป — ถ่ายครั้งเดียวต่อเที่ยว */
/** ทีมคลังยืนยันแทนคนขับ (by.standIn จากเครื่องพนักงานเท่านั้น) — รูป/พิกัด/ลายเซ็นไม่บังคับ
 *  เพราะคนขับไม่ได้อยู่ตรงหน้า แนบรูปที่ได้มาทีหลังได้ · event ติดป้าย standIn ให้รู้ว่าไม่ใช่หลักฐานจากหน้างาน */
const standInBy = (by) => by.standIn === true && isStaffSession();

/* ---------- ขั้นของทั้งเที่ยว แยกรายคนขับ (27 ต.ค.) ----------
   เที่ยวที่มีคนขับหลายคน มาถึงคลังไม่พร้อมกัน — แต่ละคนกด รับเข้าคลัง / ขึ้นรถ / ออกจากคลัง ของตัวเอง
   คนที่มาก่อนไปต่อได้เลย ไม่ต้องรอ · สถานะเที่ยว (j.status) = คนที่ไปไกลสุด · คนมาทีหลังกดตามทีหลัง
   ดูจาก events ของเที่ยว: event ที่มี byId = ของคนนั้น · ไม่มี byId (ออฟฟิศ / ข้อมูลก่อน 27 ต.ค.) = นับให้ทุกคน
   เก็บใน events อย่างเดียว — กฎ driverEdit ยอม (events มีแต่เพิ่ม · สถานะไม่ถอยหลัง) */
const CREW_STEPS = [S.NEW, S.RECEIVED, S.LOADED, S.DEPARTED];
export function crewStep(j, driverId){
  if (!j) return S.NEW;
  if (!isOpen(j.status)) return j.status;
  let k = 0;
  for (const e of j.events || []){
    const i = CREW_STEPS.indexOf(e.status);
    if (i > k && (!e.byId || e.byId === driverId)) k = i;
  }
  return CREW_STEPS[k];
}
/** เวลาที่คนขับคนนี้กดขั้นนั้น (event ล่าสุดที่นับให้คนนี้) */
export const crewStepAt = (j, driverId, st) =>
  (j?.events || []).filter(e => e.status === st && (!e.byId || e.byId === driverId)).at(-1)?.at || '';

export function advanceJob(jobId, to, by = {}){
  const db = read();
  const j = db.jobs.find(x => x.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');
  if (j.status === S.CANCELLED) throw new Error('เที่ยวนี้ถูกยกเลิกแล้ว');

  /* คนขับกดของตัวเอง = ขั้นถัดไปของคนนั้น (อาจตามหลังสถานะเที่ยว) · ออฟฟิศ = ขั้นถัดไปของเที่ยว */
  const mine = by.byId && hasDriver(j, by.byId) && isOpen(j.status);
  const want = mine ? nextOf(crewStep(j, by.byId)) : nextOf(j.status);
  if (!want) throw new Error('เที่ยวนี้ปิดแล้ว');
  if (want === S.DELIVERED){
    throw new Error('ปิดเที่ยวเองไม่ได้ — ต้องปิดจุดส่งให้ครบทุกจุด แล้วระบบจะปิดเที่ยวให้เอง');
  }
  if (to && to !== want) throw new Error(`ข้ามขั้นไม่ได้ — ขั้นถัดไปคือ "${META[want].label}"`);

  const stops = stopsOf(db, j.id);
  if (!stops.length) throw new Error('เที่ยวนี้ยังไม่มีจุดส่ง');

  const photos = (by.photos || []).filter(Boolean);
  if (NEEDS_PHOTO.has(want) && !standInBy(by) && photos.length < minPhotos(want)){
    throw new Error(`ขั้นตอนนี้ต้องแนบรูปอย่างน้อย ${minPhotos(want)} รูป (ตอนนี้มี ${photos.length} รูป)`);
  }
  if (want !== S.RECEIVED && !j.driverId) throw new Error('ต้องจ่ายงานให้คนขับก่อน');

  const at = iso(Date.now());
  /* คนที่มาทีหลัง (ขั้นนี้เที่ยวผ่านไปแล้ว) = จดของตัวเองอย่างเดียว สถานะเที่ยว/จุดส่งไม่ถอยหลัง */
  const ahead = stepIndex(want) > stepIndex(j.status);
  if (ahead) j.status = want;
  j.updatedAt = at;
  j.events.push({
    id: uid('ev'), status: want, at,
    byRole: by.byRole || 'ops', byName: by.byName || '—', ...(mine ? { byId: by.byId } : {}),
    note: by.note || '', photos, geo: validGeo(by.geo) ? by.geo : null,
    signature: null, label: META[want].label, ...(standInBy(by) ? { standIn: true } : {}),
  });
  if (!ahead){ write(); return withRollup(db, j); }

  /* จุดส่งทุกจุดที่ยังไม่ปิด เดินตามเที่ยวไปด้วย เพื่อให้หน้าจอเดิมอ่าน s.status ได้เหมือนเดิม */
  stops.forEach(x => {
    if (x.status === S.DELIVERED || x.status === S.CANCELLED) return;
    x.status = want;
    x.updatedAt = at;
  });

  write();
  return withRollup(db, j);
}

/** จุดส่งในเที่ยวที่ผู้รับชื่อเดียวกัน = ร้านเดียวกันหลายบิล → รวมเป็นกลุ่มเดียว
 *  คืน [{ key, name, stops }] เรียงตามจุดแรกของแต่ละกลุ่ม (ลำดับเดิมของเที่ยว)
 *  ใช้ทั้งหน้าคนขับ (ถ่ายรูปสินค้าครั้งเดียว แล้วถ่ายใบ Invoice ทีละบิล) และหน้าออฟฟิศ (แถวเดียว กดเข้าไปดูทีละบิล) */
export const groupKey = (x) => String(x?.dropoff?.name || x?.customer?.name || x?.id || '')
  .replace(/\s+/g, ' ').trim().toLowerCase();
export function stopGroups(stopList = []){
  const map = new Map();
  for (const x of stopList){
    const k = groupKey(x) || x.id;
    if (!map.has(k)) map.set(k, { key: k, name: x.dropoff?.name || x.customer?.name || '', stops: [] });
    map.get(k).stops.push(x);
  }
  return [...map.values()];
}

/** ปิดจุดส่งหนึ่งจุด — บังคับรูปสินค้า 2 รูป + รูปใบ Invoice อย่างน้อย 1 รูป + พิกัด + ลายเซ็นผู้รับของจุดนั้น
 *  ปิดครบทุกจุดเมื่อไหร่ เที่ยวจะปิดให้เองอัตโนมัติ */
export function deliverStop(stopId, by = {}){
  const r = deliverStops([{ stopId, by }]);
  return { stop: r.stops[0], job: r.job, jobClosed: r.jobClosed };
}

/* ---------- เพิ่มรูปหลังส่ง (คนขับ/ผู้ช่วย · 27 ต.ค.) ----------
   รูปไม่ชัด → กลับมาเพิ่มได้จนกว่าออฟฟิศจะวางบิล · ลบรูปเดิมไม่ได้
   ไม่แก้ event ปิดจุดเดิม แต่ต่อ event ใหม่ (status edited · addTo = id ของ event ปิดจุด)
   — สองคนเพิ่มพร้อมกันก็ไม่ทับกัน (events รวมสองฝั่งตาม id) และกฎ driverEdit ยอม (events มีแต่เพิ่ม) */
const lastDelivered = (x) => (x?.events || []).filter(e => e.status === S.DELIVERED).at(-1) || null;
/** event ปิดจุดล่าสุด + รูปที่เพิ่มทีหลัง รวมเป็นชุดเดียว (photos / invoicePhotos) · added = จำนวนที่เพิ่มทีหลัง */
export function deliveryProof(x){
  const ev = lastDelivered(x);
  if (!ev) return null;
  const adds = (x.events || []).filter(e => e.addTo === ev.id);
  const p = adds.flatMap(a => a.photos || []), ip = adds.flatMap(a => a.invoicePhotos || []);
  return { ...ev, photos: [...(ev.photos || []), ...p], invoicePhotos: [...(ev.invoicePhotos || []), ...ip],
           added: { photos: p.length, invoicePhotos: ip.length } };
}
/** เพิ่มรูปได้ไหม — ส่งแล้ว และบิลยังไม่ถูกวางบิล */
export const canAddPhotos = (x) => x?.status === S.DELIVERED && !!lastDelivered(x) && billStatus(stopBilling(x)) === BILL.NONE;

/** @param {{stopId:string, photos?:string[], invoicePhotos?:string[]}[]} items  ตรวจครบทุกใบก่อนเขียน */
export function addDeliveryPhotos(items = [], by = {}){
  const db = read();
  const list = items.map(({ stopId, photos = [], invoicePhotos = [] }) => {
    const x = db.shipments.find(v => v.id === stopId);
    if (!x) throw new Error('ไม่พบจุดส่งนี้');
    if (!canAddPhotos(x)) throw new Error(`บิล ${x.invoice?.number || x.code} ${x.status === S.DELIVERED ? 'วางบิลแล้ว — เพิ่มรูปไม่ได้' : 'ยังไม่ได้ส่ง'}`);
    const p = photos.filter(Boolean), ip = invoicePhotos.filter(Boolean);
    return { x, ev: lastDelivered(x), p, ip };
  }).filter(v => v.p.length || v.ip.length);
  if (!list.length) throw new Error('ยังไม่ได้เลือกรูป');
  const at = iso(Date.now());
  for (const { x, ev, p, ip } of list){
    x.events.push({
      id: uid('ev'), status: EDITED, at, addTo: ev.id,
      byRole: by.byRole || 'driver', byName: by.byName || '—', ...(by.byId ? { byId: by.byId } : {}),
      note: `เพิ่มรูปหลังส่ง:${p.length ? ` รูปสินค้า ${p.length} รูป` : ''}${ip.length ? ` รูปเลขที่บิล ${ip.length} รูป` : ''}`,
      photos: p, invoicePhotos: ip, geo: null, signature: null, label: 'เพิ่มรูปหลังส่ง',
    });
    x.updatedAt = at;
  }
  write();
  return list.map(v => clone(v.x));
}

/* ---------- คืนของเข้าคลัง (ส่งไม่สำเร็จ · 27 ต.ค.) ----------
   บิลที่ส่งไม่สำเร็จ (ลูกค้าไม่รับ / คืนสินค้า / ร้านปิด / อื่น ๆ) ของตีกลับเข้าคลัง — ถ่ายรูปหลักฐานตอนถึงคลัง (≥ 2 รูป)
   คนขับ/ผู้ช่วย (หน้าคนขับ) หรือทีมคลัง (ops) กดได้ · ทำทีหลังได้หลายวัน · เพิ่มรูปทีหลังได้จนกว่าออฟฟิศเคลียร์บิล
   เก็บเป็น event (status edited · whReturn:true) — กฎ driverEdit ยอม (events มีแต่เพิ่ม) · ออฟฟิศเคลียร์บิลมีปัญหาได้เมื่อคืนคลังแล้ว */
export const MIN_RETURN_PHOTOS = 2;
/** การคืนคลังของบิลนี้ (รวมทุกครั้งที่กด) · ยังไม่คืน = null */
export function whReturnOf(x){
  const evs = (x?.events || []).filter(e => e.whReturn);
  if (!evs.length) return null;
  return { at: evs[0].at, byName: evs[0].byName, last: evs.at(-1).at,
           photos: evs.flatMap(e => e.photos || []), notes: evs.map(e => e.note).filter(Boolean), count: evs.length };
}
/** คืนคลังได้ / เพิ่มรูปคืนคลังได้ — ส่งไม่สำเร็จ และออฟฟิศยังไม่เคลียร์ */
export const canWhReturn = (x) => isFailOutcome(outcomeOf(x)) && !x?.problemCleared;
/** บิลนี้ต้องคืนคลังแต่ยังไม่ได้คืน (ออฟฟิศเคลียร์ไปแล้ว = ไม่ต้อง) */
export const needsWhReturn = (x) => canWhReturn(x) && !whReturnOf(x);

/** @param {string[]} stopIds บิลที่คืนพร้อมกัน (รูปชุดเดียวกัน) */
export function recordWhReturn(stopIds = [], { photos = [], note = '' } = {}, by = {}){
  const db = read();
  const p = photos.filter(Boolean);
  const list = stopIds.map(id => {
    const x = db.shipments.find(v => v.id === id);
    if (!x) throw new Error('ไม่พบจุดส่งนี้');
    if (!canWhReturn(x)) throw new Error(`บิล ${x.invoice?.number || x.code} ${isFailOutcome(outcomeOf(x)) ? 'ออฟฟิศเคลียร์แล้ว — แก้ไม่ได้' : 'ส่งสำเร็จ ไม่ต้องคืนคลัง'}`);
    return x;
  });
  if (!list.length) throw new Error('ยังไม่ได้เลือกบิล');
  const first = list.some(x => !whReturnOf(x));
  if (first && p.length < MIN_RETURN_PHOTOS) throw new Error(`ต้องถ่ายรูปของที่คลังอย่างน้อย ${MIN_RETURN_PHOTOS} รูป (ตอนนี้มี ${p.length} รูป)`);
  if (!p.length) throw new Error('ยังไม่ได้เลือกรูป');
  const at = iso(Date.now());
  const n = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  for (const x of list){
    const again = !!whReturnOf(x);
    x.events.push({
      id: uid('ev'), status: EDITED, at, whReturn: true,
      byRole: by.byRole || 'driver', byName: by.byName || '—', ...(by.byId ? { byId: by.byId } : {}),
      note: `${again ? 'เพิ่มรูปคืนเข้าคลัง' : 'คืนของเข้าคลัง'} ${p.length} รูป${n ? ` · ${n}` : ''}`,
      photos: p, geo: null, signature: null, label: again ? 'เพิ่มรูปคืนเข้าคลัง' : 'คืนของเข้าคลัง',
    });
    x.updatedAt = at;
  }
  write();
  return list.map(clone);
}

/** ออฟฟิศเคลียร์บิลมีปัญหา — ต้องบอกว่าจัดการยังไง (ส่งใหม่แล้ว / ยกเลิกบิล / คุยกับลูกค้าแล้ว …)
 *  ผลการส่งเดิมของคนขับยังอยู่ใน events · ปลดล็อกให้วางบิลได้ตามปกติ */
export function clearProblem(stopId, note, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบจุดส่งนี้');
  if (!isProblem(x)) throw new Error('บิลนี้ไม่มีปัญหาค้างแล้ว');
  if (!whReturnOf(x)) throw new Error('ยังไม่ได้คืนของเข้าคลัง — ถ่ายรูปคืนคลังก่อน แล้วจึงเคลียร์ได้');
  const n = String(note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!n) throw new Error('พิมพ์ก่อนว่าจัดการยังไง');
  const o = outcomeOf(x);
  const at = iso(Date.now());
  x.problemCleared = { at, byName: by.byName || 'ทีมคลัง', note: n, outcome: o };
  x.updatedAt = at;
  x.events.push(editEvent(`เคลียร์บิลมีปัญหา (${OUTCOMES[o]}): ${n}`, by));
  write();
  return clone(x);
}

/** ปิดหลายบิลของร้านเดียวกันในครั้งเดียว — รูปสินค้า/ลายเซ็น/พิกัดชุดเดียวกัน ใบ Invoice แยกของแต่ละบิล
 *  items = [{ stopId, by }] · ตรวจครบทุกบิลก่อนเขียน บิลไหนไม่ผ่านจะไม่มีบิลไหนถูกปิดเลย */
export function deliverStops(items = []){
  const db = read();
  if (!items.length) throw new Error('ไม่มีบิลที่จะปิด');
  const list = items.map(({ stopId, by = {} }) => {
    const x = db.shipments.find(v => v.id === stopId);
    if (!x) throw new Error('ไม่พบจุดส่งนี้');
    const tag = items.length > 1 ? `บิล ${x.code}: ` : '';
    if (x.status === S.DELIVERED) throw new Error(`${tag}จุดนี้ปิดไปแล้ว`);
    if (x.status === S.CANCELLED) throw new Error(`${tag}จุดนี้ถูกยกเลิกแล้ว`);

    const j = db.jobs.find(v => v.id === x.jobId);
    if (j && stepIndex(j.status) < stepIndex(S.DEPARTED)){
      throw new Error(`ยังปิดจุดไม่ได้ — เที่ยวนี้ต้อง "${META[S.DEPARTED].label}" ก่อน`);
    }

    /* คนขับเป็นของ "เที่ยว" ไม่ใช่ของจุดส่ง — ถามที่เที่ยวเป็นหลักเสมอ
       ของเดิมถามที่จุดส่ง (x.driverId) ซึ่งว่างได้ง่ายมาก เพราะตอนนำเข้า
       ชื่อคนขับที่แอดมินเลือกให้ "ทั้งเที่ยว" ไม่ได้ถูกประทับลงจุดส่งทุกจุด
       คนขับจึงทำงานครบทุกอย่างแล้วมาตายตอนกดปิดจุดว่า "ต้องจ่ายงานให้คนขับก่อน" */
    if (!x.driverId && !j?.driverId) throw new Error('ต้องจ่ายงานให้คนขับก่อน');

    const photos = (by.photos || []).filter(Boolean);
    const invoicePhotos = (by.invoicePhotos || []).filter(Boolean);
    const fail = isFailOutcome(by.outcome);
    if (fail && !standInBy(by)){
      if (!String(by.note || '').trim()) throw new Error(`${tag}${OUTCOMES[by.outcome]} — ต้องพิมพ์หมายเหตุ`);
      if (photos.length < MIN_FAIL_PHOTOS) throw new Error(`ต้องแนบรูปหลักฐานอย่างน้อย ${MIN_FAIL_PHOTOS} รูป`);
      if (!validGeo(by.geo)) throw new Error('ต้องแนบพิกัดจุดส่งจากเครื่องคนขับ');
    } else if (!standInBy(by)){
      if (photos.length < minPhotos(S.DELIVERED)){
        throw new Error(`ต้องแนบรูปอย่างน้อย ${minPhotos(S.DELIVERED)} รูป (ตอนนี้มี ${photos.length} รูป)`);
      }
      if (invoicePhotos.length < MIN_INVOICE_PHOTOS){
        throw new Error(`${tag}ต้องแนบรูปเลขที่บิล อย่างน้อย ${MIN_INVOICE_PHOTOS} รูป (ตอนนี้มี ${invoicePhotos.length} รูป)`);
      }
      if (!validGeo(by.geo)) throw new Error('ต้องแนบพิกัดจุดส่งจากเครื่องคนขับ');
      if (!validSign(by.signature)) throw new Error('ต้องให้ผู้รับเซ็นชื่อก่อนปิดจุดส่ง');
    }
    return { x, j, by, photos, invoicePhotos };
  });

  const at = iso(Date.now());
  const jobs = new Map();
  for (const { x, j, by, photos, invoicePhotos } of list){
    /* เครื่องคนขับห้ามแก้ช่องคนขับ (กฎ keepsDrivers) จึงใช้คนขับของเที่ยวตรวจเฉย ๆ ไม่เขียนลงจุดส่ง
       เครื่องออฟฟิศเขียนซ่อมลงจุดส่งให้ด้วยเหมือนเดิม */
    if (j && !x.driverId && j.driverId && isStaffSession()){
      x.driverId = j.driverId;
      x.driverIds = (j.driverIds || []).slice();
    }
    x.status = S.DELIVERED;
    x.updatedAt = at;
    /* byId = คนขับที่กดปิด (บัญชีที่ล็อกอิน — ผู้ช่วยใช้บัญชีคนขับ) · fuel = ราคาน้ำมัน ปตท. วันที่ปิด
       จดไว้เฉย ๆ (ค่ารอบอัตโนมัติเอาออกแล้ว — พนักงานกรอกเอง) · fuel มีเสมอแม้เป็น null = ปิดด้วยโค้ดชุดนี้แล้ว */
    x.events.push({
      id: uid('ev'), status: S.DELIVERED, at,
      byRole: by.byRole || 'driver', byName: by.byName || '—',
      ...(by.byId ? { byId: by.byId } : {}), fuel: by.fuel || null,
      note: by.note || '', photos, invoicePhotos, geo: validGeo(by.geo) ? by.geo : null,
      signature: by.signature || null, label: isFailOutcome(by.outcome) ? outcomeLabel(by.outcome) : META[S.DELIVERED].label,
      ...(isFailOutcome(by.outcome) ? { outcome: by.outcome } : {}),
      ...(standInBy(by) ? { standIn: true } : {}),
    });
    if (j) jobs.set(j.id, { j, by });
  }

  /* ปิดเที่ยวอัตโนมัติเมื่อจุดสุดท้ายปิด */
  let jobClosed = false, job = null;
  for (const { j, by } of jobs.values()){
    const rest = stopsOf(db, j.id).filter(v => isOpen(v.status));
    if (!rest.length){
      j.status = S.DELIVERED;
      j.updatedAt = at;
      j.events.push({
        id: uid('ev'), status: S.DELIVERED, at,
        byRole: by.byRole || 'driver', byName: by.byName || '—',
        note: 'ปิดจุดส่งครบทุกจุดแล้ว', photos: [], geo: null, signature: null,
        label: META[S.DELIVERED].label,
      });
      jobClosed = true;
    }
    j.updatedAt = at;
    job = j;
  }

  write();
  return { stops: list.map(v => clone(v.x)), job: job ? withRollup(db, job) : null, jobClosed };
}

/* ---------- การชำระเงินของจุดส่ง (หน้าผู้ช่วยคนขับ) ----------
   ผู้ช่วยคนขับบันทึกว่าลูกค้าจุดนี้จ่ายแบบไหน เท่าไร พร้อมรูปหลักฐาน

     stop.payments = [ {id, round, method, amount, photos, note, at, byRole, byName}, ... ]
     stop.payment  = รอบล่าสุด {method, amount, at, round, byName} — Dashboard อ่านช่องนี้ (payment.method)

   บันทึกผิดแก้ด้วยการ "บันทึกรอบใหม่" เท่านั้น รอบเก่ายังอยู่ครบเป็นประวัติ ไม่มีการลบหรือเขียนทับ
   ออฟฟิศแก้ได้จากหน้า ops (byRole:'ops') — ไม่บังคับรูป เพราะออฟฟิศแก้ตามที่ได้รับแจ้ง ไม่ได้อยู่หน้างาน

   ซิงก์สองทางกับชีตรวม (Master) แท็บ "ช่องทางชำระเงิน" — ขึ้นชีตเมื่อเที่ยวส่งครบทุกจุดแล้ว
   คนแก้ในชีตเข้าแอปเป็นรอบใหม่ byRole:'sheet' (AppsScript-master.gs ส่วน "ซิงก์สองทาง")
   ------------------------------------------------------------ */
export const PAY_METHODS = ['เงินโอน', 'เงินสด', 'เครดิต'];
/** หลักฐานที่ต้องถ่ายของแต่ละช่องทาง — ขึ้นเป็นคำแนะนำในฟอร์ม */
export const PAY_PROOF = {
  'เงินโอน': 'สลิปโอนเงิน',
  'เงินสด':  'ใบเสร็จ / ใบรับเงิน หรือรูปเงินสดที่รับ',
  'เครดิต':  'ใบรับสินค้าหรือเอกสารเครดิตที่ลูกค้าเซ็น',
};
export const MAX_PAY_PHOTOS = 4;

function latestPayment(payments){
  const p = (payments || [])[payments.length - 1];
  return p ? { method:p.method, amount:p.amount, at:p.at, round:p.round, byName:p.byName } : null;
}

/** ประวัติการชำระเงินของจุดส่ง เก่า → ใหม่ */
export const stopPayments = (stopId) =>
  clone(read().shipments.find(v => v.id === stopId)?.payments || []);

export function recordStopPayment(stopId, p = {}, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบจุดส่งนี้');
  if (x.status === S.CANCELLED) throw new Error('จุดนี้ถูกยกเลิกแล้ว');
  if (!PAY_METHODS.includes(p.method)) throw new Error('เลือกช่องทางการชำระเงินก่อน');
  const amount = money(p.amount);
  if (!(amount > 0)) throw new Error('กรอกยอดเงินให้ถูกต้อง');
  const photos = (p.photos || []).filter(Boolean);
  if (!photos.length && by.byRole !== 'ops') throw new Error('ต้องแนบรูปหลักฐานอย่างน้อย 1 รูป');
  if (photos.length > MAX_PAY_PHOTOS) throw new Error(`แนบรูปได้สูงสุด ${MAX_PAY_PHOTOS} รูป`);
  const prev = x.payments || [];
  const note = String(p.note || '').trim();
  if (prev.length && !note) throw new Error('บันทึกรอบใหม่ต้องบอกเหตุผลที่แก้');

  const at = iso(Date.now());
  const row = {
    id: uid('pay'), round: prev.length + 1, method: p.method, amount, photos, note, at,
    byRole: by.byRole || 'assistant', byName: by.byName || '—',
    /* คนขับเจ้าของบัญชีที่บันทึก — ใช้ติดตามเงินสดค้างที่คนขับ (collectOf) */
    ...(by.byId ? { byId: by.byId } : {}),
  };
  x.payments = [...prev, row];
  x.payment = latestPayment(x.payments);
  x.updatedAt = at;
  write();
  return clone(row);
}

/* ---------- เก็บเงินหน้างาน → ยืนยันรับเงิน (ผู้ใช้กำหนด 27 ต.ค. 2026) ----------
   ผู้รับจ่ายตอนคนขับไปส่ง (บันทึกชำระเงิน + รูปหลักฐาน) — บิลพวกนี้ไม่ต้องวางบิลซ้ำ
     เงินโอน → "รอตรวจสลิป" → ฝ่ายบัญชี/คลังกดยืนยัน = "รับเงินแล้ว"
     เงินสด  → "เงินสดค้างที่คนขับ" (นับตามคนขับที่บันทึก) → คนขับส่งเงินคืน กดยืนยัน = "รับเงินแล้ว"
     เครดิต / ยังไม่บันทึก → "ต้องวางบิล" (ใบวางบิลตามเดิม)
   stop.collected = { round, method, amount, at, byName, byRole } — ผูกกับรอบการชำระ
   คนขับบันทึกรอบใหม่ทีหลัง (แก้สลิป/ยอด) = รอบไม่ตรง → กลับไปรอยืนยันใหม่เอง
   คนขับเขียนช่องนี้ไม่ได้ (กฎ driverEdit) · ยกเลิกการยืนยันได้เฉพาะ admin */
export const COLLECT = { BILL:'ต้องวางบิล', SLIP:'รอตรวจสลิป', CASH:'เงินสดค้างที่คนขับ', DONE:'รับเงินแล้ว' };
const ON_SITE = ['เงินโอน', 'เงินสด'];

/** สถานะเก็บเงินหน้างานของจุดส่ง · holder = คนขับที่ถือเงินสด (คนบันทึก › คนขับหลักของจุด) */
export function collectOf(x){
  const p = (x?.payments || []).at(-1);
  if (!p || p.action === 'cancel' || !ON_SITE.includes(p.method)) return { st: COLLECT.BILL, p: p?.action === 'cancel' ? null : p || null };
  const ok = x.collected && x.collected.round === p.round ? x.collected : null;
  return { st: ok ? COLLECT.DONE : p.method === 'เงินโอน' ? COLLECT.SLIP : COLLECT.CASH,
           p, ok, holder: p.byId || x.driverId || (x.driverIds || [])[0] || null };
}

/** ยืนยันรับเงินที่เก็บหน้างาน (หลายบิลพร้อมกันได้) · คืนจำนวนบิลที่ยืนยัน */
export function confirmCollected(stopIds, by = {}){
  if (!isStaffSession()) throw new Error('ยืนยันรับเงินได้เฉพาะพนักงาน');
  const db = read();
  const at = iso(Date.now());
  let n = 0;
  for (const id of stopIds || []){
    const x = db.shipments.find(v => v.id === id);
    if (!x) continue;
    const c = collectOf(x);
    if (c.st !== COLLECT.SLIP && c.st !== COLLECT.CASH) continue;
    x.collected = { round: c.p.round, method: c.p.method, amount: c.p.amount, at,
                    byName: by.byName || 'ทีมบัญชี', byRole: by.byRole || 'ops' };
    x.events.push({ ...editEvent(`ยืนยันรับเงิน${c.p.method === 'เงินสด' ? 'สด' : 'โอน'} ${fmtBaht(c.p.amount)} (รอบที่ ${c.p.round})`, by), scope: 'ops' });
    x.updatedAt = at;
    n++;
  }
  if (n) write();
  return n;
}

/** ยกเลิกการยืนยันรับเงิน (admin) — กลับไปรอตรวจสลิป / เงินสดค้างที่คนขับ */
export function unconfirmCollected(stopId, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x?.collected) throw new Error('บิลนี้ยังไม่ได้ยืนยันรับเงิน');
  const was = x.collected;
  delete x.collected;
  x.events.push({ ...editEvent(`ยกเลิกการยืนยันรับเงิน ${fmtBaht(was.amount)} (เดิมยืนยันโดย ${was.byName})`, by), scope: 'ops' });
  x.updatedAt = iso(Date.now());
  write();
}

/* ---------- การคืนเอกสาร Inv. (หน้าผู้ช่วยคนขับ) ---------------
   คนขับเอาเอกสารเลขที่บิล ที่ลูกค้าเซ็นรับแล้วกลับมาคืน — ผู้ช่วยติ๊กว่าคืนแล้ว พร้อมวันที่ที่ได้คืน

     stop.invoiceReturns = [ {id, round, action:'return'|'cancel', date, receivedBy, note, photos, at, byRole, byName}, ... ]
     stop.invoiceReturn  = สถานะตอนนี้ {at:'YYYY-MM-DD', date, receivedBy, round, byName} · null = ยังไม่คืน
                           Dashboard อ่านช่องนี้ (invoiceReturn.at = วันที่ได้เอกสารเลขที่บิล คืน)

   แก้วันที่ = บันทึกรอบใหม่ · ยกเลิก = รอบใหม่แบบ action:'cancel' — รอบเก่าเก็บเป็นประวัติทั้งหมด
   ------------------------------------------------------------ */
export const MAX_INVRET_PHOTOS = 4;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
/** วันนี้ตามเวลาเครื่อง (ไม่ใช่ UTC — คืนเอกสารตอนตีหนึ่งต้องได้วันนี้ ไม่ใช่เมื่อวาน) */
export const todayYmd = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/* (28 ต.ค.) สถานะ "คืนแล้ว" นับเฉพาะผู้รวบรวมบิล (collector) · ออฟฟิศ (ops) · ชีต Master (sheet)
   คนขับ/ผู้ช่วยกดคืนเองยังบันทึกเป็นประวัติได้ แต่ไม่มีผลกับสถานะ — ของเก่าที่คนขับกดไว้ก็ไม่นับ (ผู้ใช้สั่งให้ตรวจใหม่หมด) */
export const RETURN_ROLES = new Set(['collector', 'ops', 'sheet']);
/** รอบคืน Inv. ล่าสุดที่นับ (คืน หรือ ยกเลิก) · ไม่มี = null */
export const lastCountedReturn = (x) => (x?.invoiceReturns || []).filter(r => RETURN_ROLES.has(r.byRole)).at(-1) || null;
function currentInvoiceReturn(list){
  const r = (list || []).filter(v => RETURN_ROLES.has(v.byRole)).at(-1);
  if (!r || r.action === 'cancel') return null;
  return { at:r.date, date:r.date, receivedBy:r.receivedBy || '', round:r.round, byName:r.byName, ...(r.batch ? { batch:r.batch } : {}) };
}

function pushInvoiceReturn(x, p, by){
  if (x.status === S.CANCELLED) throw new Error(`จุด ${x.code} ถูกยกเลิกแล้ว`);
  if (x.status !== S.DELIVERED) throw new Error(`จุด ${x.code} ยังไม่ได้ส่งของ — ต้องส่งก่อนถึงจะคืนเอกสารได้`);
  const prev = x.invoiceReturns || [];
  const action = p.action === 'cancel' ? 'cancel' : 'return';
  const note = String(p.note || '').trim();
  const photos = (p.photos || []).filter(Boolean);
  if (action === 'return'){
    if (!isDate(p.date)) throw new Error('เลือกวันที่ได้เอกสารคืนก่อน');
    if (p.date > todayYmd()) throw new Error('วันที่คืนเอกสารต้องไม่เกินวันนี้');
    if (photos.length > MAX_INVRET_PHOTOS && by.byRole !== 'collector') throw new Error(`แนบรูปได้สูงสุด ${MAX_INVRET_PHOTOS} รูป`);
  } else if (!x.invoiceReturn){
    throw new Error(`จุด ${x.code} ยังไม่ได้บันทึกคืนเอกสาร`);
  }
  /* มีรอบก่อนแล้ว (แก้วันที่ / ยกเลิก) ต้องบอกเหตุผล — ประวัติจะได้อ่านรู้เรื่อง */
  if (lastCountedReturn(x) && RETURN_ROLES.has(by.byRole) && !note && !p.bulk) throw new Error(action === 'cancel' ? 'ยกเลิกต้องบอกเหตุผล' : 'แก้ไขต้องบอกเหตุผล');

  const at = iso(Date.now());
  const row = {
    id: uid('ir'), round: prev.length + 1, action,
    date: action === 'return' ? p.date : '',
    receivedBy: action === 'return' ? String(p.receivedBy || '').trim().slice(0, 80) : '',
    note, photos: action === 'return' ? photos : [], at,
    byRole: by.byRole || 'assistant', byName: by.byName || '—',
    ...(p.batch ? { batch: p.batch } : {}),
  };
  x.invoiceReturns = [...prev, row];
  x.invoiceReturn = currentInvoiceReturn(x.invoiceReturns);
  x.updatedAt = at;
  return row;
}

/** บันทึก/แก้/ยกเลิก การคืนเอกสาร Inv. ของจุดเดียว — p.action 'return' (ตั้งต้น) | 'cancel' */
export function recordInvoiceReturn(stopId, p = {}, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบจุดส่งนี้');
  const row = pushInvoiceReturn(x, p, by);
  write();
  return clone(row);
}

/* ---------- ผู้รวบรวมบิลคืน (28 ต.ค.) ----------
   คนขับไม่ต้องคืนบิลเองแล้ว — ผู้รวบรวม (คนขับที่ติ๊ก billCollector ในหน้าข้อมูลคนขับ) ทำแทนทั้งหมดจากหน้าผู้ช่วย
     ① ตรวจบิลในมือ   ติ๊กบิลกระดาษที่ได้คืนมา → stop.billIn = {at, byName, byId} (ยกเลิกได้จนกว่าจะส่งคลัง)
     ② ส่งคืนคลัง     รวมบิลที่ได้ใบแล้วเป็นรอบ + รูปหลักฐานไม่จำกัด → ทุกบิลในรอบ "คืนแล้ว" (invoiceReturns byRole collector · batch)
   หน้าคืนบิลของออฟฟิศนับเฉพาะผู้รวบรวม / ออฟฟิศ / ชีต (RETURN_ROLES) */
export const COLLECT_DAYS = 365;               /* ผู้รวบรวมเห็นงานย้อนหลังกี่วัน (ตามวันส่ง serviceDate) */
/* เริ่มเก็บบิลตั้งแต่วันออกเดินทาง 1 พ.ย. 2569 (ผู้ใช้สั่ง 31 ต.ค.) — บิลก่อนหน้านี้ไม่ขึ้นหน้ารวบรวม ไม่โหลดลงเครื่องผู้รวบรวม
   ไม่ได้ลบข้อมูล: หน้า ops / หน้าคืนบิลออฟฟิศ / รายงาน ยังเห็นบิลเก่าครบ */
export const COLLECT_FROM = '2026-11-01';
/** บิลนี้อยู่ในช่วงที่ผู้รวบรวมต้องเก็บไหม — วันออกเดินทางของบิล (ไม่มี = ของเที่ยว) ตั้งแต่ COLLECT_FROM */
export function inCollectRange(x){
  const day = x?.serviceDate || read().jobs.find(j => j.id === x?.jobId)?.serviceDate || '';
  return String(day) >= COLLECT_FROM;
}
export const isBillCollector = (d) => !!d?.billCollector;
function collectSince(){
  const d = new Date(Date.now() - COLLECT_DAYS * 864e5);
  const since = new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return since > COLLECT_FROM ? since : COLLECT_FROM;
}
/** ออฟฟิศติ๊ก/เอาออก ผู้รวบรวมบิลคืน (หน้าข้อมูลคนขับ) */
export function setBillCollector(id, on){
  const db = read();
  const d = db.drivers.find(x => x.id === id);
  if (!d) throw new Error('ไม่พบคนขับคนนี้');
  if (!!d.billCollector === !!on) return clone(d);
  d.billCollector = !!on;
  write();
  return clone(d);
}
/* ผู้รวบรวมตั้งต้น = ผู้เก็บเงินตั้งต้น (ผู้ใช้สั่ง 28 ต.ค.) — ใช้จนกว่าออฟฟิศจะติ๊ก/เอาติ๊กออกในหน้าข้อมูลคนขับเอง
   "ยังไม่เคยตั้ง" = ไม่มีคนขับคนไหนมีช่อง billCollector เลย (เอาติ๊กออกจะเก็บเป็น false ไว้ ไม่ย้อนกลับมาตั้งให้อีก) */
const DEFAULT_COLLECTOR = { phone:'0800000003', name:'ผู้เก็บเงิน' };
/** หน้าข้อมูลคนขับเรียกตอนเปิด (พนักงานที่แก้ทะเบียนคนขับได้) · @returns {object|null} คนที่ถูกตั้งให้ */
export function ensureDefaultCollector(){
  if (!isStaffSession() || !canWrite()) return null;
  const db = read();
  if (db.seeded || !db.drivers.length || db.drivers.some(d => 'billCollector' in d)) return null;
  const digits = (v) => String(v || '').replace(/\D/g, '');
  const d = db.drivers.find(x => digits(x.phone) === DEFAULT_COLLECTOR.phone)
         || db.drivers.find(x => String(x.name || '').includes(DEFAULT_COLLECTOR.name));
  if (!d) return null;
  d.billCollector = true;
  write();
  return clone(d);
}

/** ติ๊ก / เอาติ๊กออก "ได้บิลกระดาษคืนแล้ว" — บิลที่ส่งคลังแล้วแก้ไม่ได้ */
export function markBillIn(stopIds = [], on = true, by = {}){
  const db = read();
  const at = iso(Date.now());
  let n = 0;
  for (const id of stopIds){
    const x = db.shipments.find(v => v.id === id);
    if (!x || x.status !== S.DELIVERED || x.invoiceReturn) continue;
    if (on === !!x.billIn) continue;
    x.billIn = on ? { at, byName: by.byName || '—', ...(by.byId ? { byId: by.byId } : {}) } : null;
    x.updatedAt = at;
    n++;
  }
  if (n) write();
  return n;
}
/** ส่งคืนคลังหนึ่งรอบ — ทุกบิลในรอบ = คืนแล้ว (วันนี้ · คืนที่คลัง · รูปชุดเดียวกัน)
 *  @returns {{batch:string, n:number}} */
export function sendBillBatch(stopIds = [], photos = [], by = {}, note = ''){
  const pics = photos.filter(Boolean);
  if (!pics.length) throw new Error('ถ่ายรูปหลักฐานอย่างน้อย 1 รูป');
  const db = read();
  const list = stopIds.map(id => db.shipments.find(v => v.id === id)).filter(x => x && x.status === S.DELIVERED && !x.invoiceReturn);
  if (!list.length) throw new Error('ไม่มีบิลที่รอส่งคืนในรอบนี้');
  const batch = uid('rb');
  list.forEach(x => pushInvoiceReturn(x, { action:'return', date: todayYmd(), receivedBy:'คลัง', photos: pics, bulk:true, batch,
    note: note || 'ส่งคืนคลังโดยผู้รวบรวมบิล' }, { byRole:'collector', byName: by.byName || '—' }));
  write();
  return { batch, n: list.length };
}
/** ดึงบิลที่ส่งคืนคลังแล้วกลับมา "ยังไม่ได้ใบ" (ผู้ใช้สั่ง 31 ต.ค. — เช่น ส่งผิดบิล)
 *  = รอบใหม่แบบ action:'cancel' (ประวัติเก่าเก็บไว้) + ล้างติ๊กได้ใบแล้ว · ต้องบอกเหตุผล
 *  @returns {number} จำนวนบิลที่ดึงกลับ */
export function undoBillReturn(stopIds = [], reason = '', by = {}){
  const note = String(reason || '').trim();
  if (!note) throw new Error('ดึงกลับต้องบอกเหตุผล');
  const db = read();
  const list = stopIds.map(id => db.shipments.find(v => v.id === id)).filter(x => x && x.invoiceReturn);
  if (!list.length) throw new Error('บิลนี้ไม่ได้อยู่ในสถานะส่งคืนคลังแล้ว');
  list.forEach(x => {
    pushInvoiceReturn(x, { action:'cancel', note }, { byRole:'collector', byName: by.byName || '—' });
    x.billIn = null;
  });
  write();
  return list.length;
}
/** รอบส่งคืนคลังทั้งหมด (ใหม่สุดก่อน) — รวมจากประวัติคืน Inv. ของทุกบิล */
export function billBatches(){
  const map = new Map();
  for (const x of read().shipments){
    for (const r of x.invoiceReturns || []){
      if (!r.batch || r.action !== 'return') continue;
      if (!map.has(r.batch)) map.set(r.batch, { id: r.batch, at: r.at, byName: r.byName, date: r.date, photos: r.photos || [], stops: [] });
      map.get(r.batch).stops.push(clone(x));
    }
  }
  return [...map.values()].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
/** ออฟฟิศ: คำนวณสถานะคืนบิลใหม่ทุกใบตามกติกา RETURN_ROLES แล้วบันทึกที่เปลี่ยน (ชีต Master อ่านช่องนี้)
 *  ทำซ้ำได้ ผลเหมือนเดิม · หน้า returns / ops เรียกตอนเปิด
 *  @returns {number} จำนวนบิลที่สถานะเปลี่ยน */
export function healInvoiceReturns(){
  if (!isStaffSession() || !canWrite()) return 0;
  const db = read();
  let n = 0;
  for (const x of db.shipments){
    if (!(x.invoiceReturns || []).length) continue;
    const want = currentInvoiceReturn(x.invoiceReturns);
    if (JSON.stringify(want) === JSON.stringify(x.invoiceReturn ?? null)) continue;
    x.invoiceReturn = want;
    n++;
  }
  if (n){ persist(); console.info(`[store] คำนวณสถานะคืนบิลใหม่ ${n} ใบ (นับเฉพาะผู้รวบรวม/ออฟฟิศ/ชีต)`); }
  return n;
}

/** ติ๊กคืนเอกสารทั้งเที่ยวทีเดียว — เฉพาะจุดที่ส่งแล้วและยังไม่ได้คืน (จุดที่คืนแล้วไม่แตะ)
 *  p.to = { <stopId>: 'ORIGIN' | 'คลัง' | ชื่อคนรับ } ที่คืนรายจุด · ไม่มีใช้ p.receivedBy ทุกจุด */
export function returnInvoicesForJob(jobId, p = {}, by = {}){
  const db = read();
  const list = stopsOf(db, jobId).filter(x => x.status === S.DELIVERED && !x.invoiceReturn);
  if (!list.length) throw new Error('ไม่มีจุดที่รอคืนเอกสารในเที่ยวนี้');
  if (p.to && list.some(x => !String(p.to[x.id] || '').trim())) throw new Error('เลือกว่าคืนที่ไหนให้ครบทุกจุดก่อน');
  list.forEach(x => pushInvoiceReturn(x, { ...p, receivedBy: p.to ? p.to[x.id] : p.receivedBy, action:'return', bulk:true }, by));
  write();
  return list.length;
}

/* ---------- ค่ารอบของคนขับ ----------------------------------
   หนึ่งเที่ยวมีคนขับได้หลายคน และแต่ละคนได้ไม่เท่ากัน
   ค่ารอบจึงเก็บแยกรายคน ไม่ใช่ก้อนเดียวของทั้งเที่ยว

     pay.drivers = { <driverId>: [ {amount, note}, ... ] }

   หนึ่งคนมีได้หลายบรรทัด (ค่ารอบ + ค่าน้ำมัน + ค่าทางด่วน ฯลฯ)
   โน้ตไม่บังคับ เพราะชื่อคนขับบอกอยู่แล้วว่าเงินก้อนนี้ของใคร

   pay.base / pay.items คือโครงเก่าตอนที่ยังไม่แยกรายคน
   ยังนับรวมในยอดของเที่ยวอยู่ เพื่อไม่ให้ข้อมูลเดิมหาย
   แต่หน้าจอจะย้ายเข้าไปเป็นของคนขับตอนเปิดฟอร์มครั้งถัดไป
   ------------------------------------------------------------ */

const money = (v) => {
  const n = Number(String(v ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

const rowsSum = (rows) => (rows || []).reduce((a, x) => a + money(x.amount), 0);

/** ยอดรวมทั้งเที่ยว = ของเดิมที่ยังไม่ได้แยกคน + ของคนขับทุกคนรวมกัน */
export const payTotal = (pay) =>
  money(pay?.base)
  + rowsSum(pay?.items)
  + Object.values(pay?.drivers || {}).reduce((a, rows) => a + rowsSum(rows), 0);

/** ยอดของคนขับคนเดียว — ใช้ในหน้าคนขับ ให้เห็นเฉพาะของตัวเอง */
export const payTotalFor = (pay, driverId) => rowsSum(pay?.drivers?.[driverId]);

/** รายการค่ารอบของคนขับคนเดียว */
export const payRowsOf = (pay, driverId) => clone(pay?.drivers?.[driverId] || []);

/** ค่ารอบของเที่ยวนี้ — คืนโครงว่างถ้ายังไม่เคยกรอก */
export const getJobPay = (jobId) => {
  const j = read().jobs.find(x => x.id === jobId);
  const pay = j?.pay || {};
  return clone({
    base: pay.base || 0,
    items: pay.items || [],
    drivers: pay.drivers || {},
    updatedAt: pay.updatedAt || null,
    updatedBy: pay.updatedBy || '',
  });
};

/**
 * บันทึกค่ารอบ — เขียนทับทั้งก้อน แล้วลงไทม์ไลน์ว่ายอดเปลี่ยนจากเท่าไหร่เป็นเท่าไหร่
 * @param {{base?:number|string, items?:{amount:*,note:*}[],
 *          drivers?:Object<string,{amount:*,note:*}[]>}} pay
 */
export function setJobPay(jobId, pay = {}, by = {}){
  const db = read();
  const j = db.jobs.find(x => x.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');

  /* บรรทัดที่ไม่มีเงินคือบรรทัดที่ยังกรอกไม่เสร็จ ทิ้งไปเงียบ ๆ ไม่ต้องฟ้อง
     ชีตรวมแบ่งหมวดจากโน้ต (AppsScript-master.gs rowCat_) — แก้ค่ารอบได้ที่นี่ที่เดียว ชีตแก้แล้วไม่เข้าแอป */
  const cleanRows = (rows) => (Array.isArray(rows) ? rows : [])
    .map(x => ({ amount: money(x.amount), note: trim(x.note) }))
    .filter(x => x.amount > 0);

  const drivers = {};
  const src = pay.drivers || {};
  for (const id of Object.keys(src)){
    const rows = cleanRows(src[id]);
    if (rows.length) drivers[id] = rows;
  }

  const items = cleanRows(pay.items);
  const bad = items.find(x => !x.note);
  if (bad) throw new Error(`รายการ ${fmtBaht(bad.amount)} ยังไม่ได้ใส่ว่าเป็นค่าอะไร`);

  const next = {
    base: money(pay.base),
    items,
    drivers,
    updatedAt: iso(Date.now()),
    updatedBy: by.byName || 'ทีมคลัง',
    /* ธงค่ารอบอัตโนมัติแบบเก่า — เก็บไว้เฉย ๆ */
    ...(j.pay?.autoRoundAt ? { autoRoundAt: j.pay.autoRoundAt } : {}),
    /* สถานะค่ารอบอัตโนมัติแบบที่เอาออกแล้ว — เก็บไว้เฉย ๆ ไม่ลบข้อมูลเก่า */
    ...(j.pay?.auto ? { auto: j.pay.auto } : {}),
    /* จ่ายแล้ว (หน้า billing) — แก้ค่ารอบไม่ลบสถานะจ่าย หน้า billing เตือนเองถ้ายอดไม่ตรงกับที่จ่าย */
    ...(j.pay?.paid ? { paid: j.pay.paid } : {}),
  };

  const before = payTotal(j.pay);
  const after  = payTotal(next);
  j.pay = next;
  j.updatedAt = next.updatedAt;

  if (before !== after){
    /* scope:'ops' = เห็นเฉพาะฝั่งหลังบ้าน
       ยอดรวมทั้งเที่ยวเป็นความลับระหว่างคนขับด้วยกัน ถ้าโชว์ในไทม์ไลน์
       คนขับเอายอดรวมลบยอดตัวเองก็รู้ของเพื่อนทันที */
    j.events.push({ ...editEvent(`ค่ารอบ: ${fmtBaht(before)} → ${fmtBaht(after)}`, by), scope: 'ops' });
  }
  write();
  return withRollup(db, j);
}

/* ---------- ค่ารอบอัตโนมัติ — เอาออกแล้ว (ผู้ใช้สั่ง 26 ต.ค. 2026: สร้างความไม่ยุติธรรมได้ ให้พนักงานกรอกเอง) ----------
   เคยมี: ค่ารอบ = น้ำหนักที่ปิด × ราคา ปตท. · ค่ารอบเบื้องต้นจากชื่อคนขับในไฟล์ Excel + ค่ารอบเสริม (ดู git 2949243)
   ข้อมูลที่ยังจดไว้เงียบ ๆ เผื่อใช้ทีหลัง (ไม่มีผลกับยอดเงิน): event.byId / event.fuel ตอนปิดจุดส่ง ·
   source.excelDriverIds / source.fuel ตอนนำเข้า · pay.autoRoundAt / pay.auto ของเที่ยวที่เคยเติม (setJobPay เก็บไว้เฉย ๆ) */

/* ---------- จ่ายค่ารอบให้คนขับ (หน้า billing แท็บค่าใช้จ่าย · 26 ต.ค. 2026) ----------
   job.pay.paid[driverId] = { amount, at, by, ref } — ยอดตอนกดยืนยัน · ref = ชุดที่จ่ายพร้อมกัน
   จ่ายแล้วล็อก กดจ่ายซ้ำไม่ได้ (ยังติ๊กเลือกได้) · admin ยกเลิกได้ · ทุกครั้งลงประวัติเที่ยว (scope ops) */
export const paidOf = (pay, driverId) => pay?.paid?.[driverId] || null;

/** ยืนยันจ่ายแล้ว — items = [{ jobId, driverId }] · ตรวจครบทุกเที่ยวก่อน ผิดเที่ยวเดียว = ไม่บันทึกเลย */
export function markRoundPaid(items = [], by = {}){
  const db = read();
  if (!items.length) throw new Error('ยังไม่ได้เลือกงานที่จะจ่าย');
  const list = items.map(({ jobId, driverId }) => {
    const j = db.jobs.find(x => x.id === jobId);
    if (!j) throw new Error('ไม่พบเที่ยวนี้');
    if (j.pay?.paid?.[driverId]) throw new Error(`เที่ยว ${j.code} จ่ายให้คนขับคนนี้ไปแล้ว`);
    const amount = payTotalFor(j.pay, driverId);
    if (!amount) throw new Error(`เที่ยว ${j.code} ยังไม่มีค่ารอบของคนขับคนนี้`);
    return { j, driverId, amount };
  });
  const at = iso(Date.now());
  const ref = uid('pay');
  const who = by.byName || 'ฝ่ายบัญชี';
  for (const { j, driverId, amount } of list){
    j.pay = { ...(j.pay || {}), paid: { ...(j.pay?.paid || {}), [driverId]: { amount, at, by: who, ref } } };
    j.updatedAt = at;
    const name = driverName(db.drivers.find(d => d.id === driverId)) || 'คนขับ';
    j.events.push({ ...editEvent(`จ่ายค่ารอบ ${fmtBaht(amount)} ให้ ${name}`, by), scope: 'ops' });
  }
  write();
  return { ref, total: list.reduce((a, x) => a + x.amount, 0), count: list.length };
}

/** ยกเลิกการยืนยันจ่าย (admin) — ลงประวัติเที่ยวว่าใครยกเลิก */
export function unmarkRoundPaid(jobId, driverId, by = {}){
  const db = read();
  const j = db.jobs.find(x => x.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');
  const p = j.pay?.paid?.[driverId];
  if (!p) throw new Error('เที่ยวนี้ยังไม่ได้จ่ายให้คนขับคนนี้');
  const paid = { ...j.pay.paid };
  delete paid[driverId];
  j.pay = { ...j.pay, paid };
  j.updatedAt = iso(Date.now());
  const name = driverName(db.drivers.find(d => d.id === driverId)) || 'คนขับ';
  j.events.push({ ...editEvent(`ยกเลิกการจ่ายค่ารอบ ${fmtBaht(p.amount)} ของ ${name} (จ่ายเมื่อ ${fmtDateTime(p.at)} โดย ${p.by})`, by), scope: 'ops' });
  write();
}

/* ---------- รายได้ + วางบิล (ฝั่งเรา) ------------------------
   job.revenue            ค่าขนส่งของเที่ยว (บาท) — รายได้ของเรา
   job.billing            { docNo, billedAt, paidAt, billId, dueDate, payMethod, status, updatedAt, updatedBy }
                          billId = ใบวางบิลในคอลเลกชัน bills (js/bills.js) · เที่ยวที่วางบิลแบบเก่าไม่มีช่องนี้
   สถานะคิดจากวันที่เสมอ (แบบเดียวกับชีต Billing ในไฟล์ Master) ไม่ให้เลือกเอง จะได้ไม่ขัดกัน
   Dashboard (index.html) อ่านสองช่องนี้ตรงจาก Firestore */
export const BILL = { NONE:'ยังไม่วางบิล', BILLED:'รอชำระ', PAID:'ชำระแล้ว' };
export const billStatus = (b) => b?.paidAt ? BILL.PAID : (b?.billedAt ? BILL.BILLED : BILL.NONE);
/* ช่องที่ผูกเที่ยวกับใบวางบิล — ว่าง = ไม่ผูก (เก็บเฉพาะเมื่อมีค่า) */
const BILL_LINK = ['billId', 'dueDate', 'payMethod'];

/**
 * แก้รายได้/สถานะวางบิลของหลายเที่ยวพร้อมกัน (ใบวางบิลใบเดียวครอบหลายเที่ยวได้)
 * ส่งเฉพาะช่องที่จะแก้ · ค่าว่าง = ล้างช่องนั้น · ตรวจครบทุกเที่ยวก่อน ผิดเที่ยวเดียว = ไม่บันทึกเลย
 * @param {string|string[]} jobIds
 * @param {{revenue?:number|string, docNo?:string, billedAt?:string, paidAt?:string,
 *          billId?:string, dueDate?:string, payMethod?:string}} patch วันที่เป็น YYYY-MM-DD
 */
export function setJobBilling(jobIds, patch = {}, by = {}){
  const db = read();
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
  const plan = [].concat(jobIds).map(id => {
    const j = db.jobs.find(x => x.id === id);
    if (!j) throw new Error('ไม่พบเที่ยวนี้');
    const rev = has('revenue') ? money(patch.revenue) : money(j.revenue);
    const b = { ...(j.billing || {}) };
    if (has('docNo'))    b.docNo = trim(patch.docNo);
    if (has('billedAt')) b.billedAt = trim(patch.billedAt);
    if (has('paidAt'))   b.paidAt = trim(patch.paidAt);
    for (const k of BILL_LINK) if (has(k)) b[k] = trim(patch[k]);
    if (b.paidAt && !b.billedAt) throw new Error(`${j.code}: ยังไม่ได้วางบิล — บันทึกว่าชำระแล้วไม่ได้`);
    if (b.paidAt && b.paidAt < b.billedAt) throw new Error(`${j.code}: วันที่ชำระอยู่ก่อนวันที่วางบิล`);
    if (b.billedAt && !(rev > 0)) throw new Error(`${j.code}: ยังไม่ได้ใส่ค่าขนส่ง — วางบิลไม่ได้`);
    return { j, rev, b };
  });

  const stamp = iso(Date.now());
  let changed = 0;
  for (const { j, rev, b } of plan){
    const beforeRev = money(j.revenue), beforeSt = billStatus(j.billing);
    const next = { docNo: b.docNo || '', billedAt: b.billedAt || '', paidAt: b.paidAt || '' };
    BILL_LINK.forEach(k => { if (b[k]) next[k] = b[k]; });
    next.status = billStatus(next);
    const old = j.billing || {};
    if (beforeRev === rev && ['docNo', 'billedAt', 'paidAt', ...BILL_LINK].every(k => (old[k] || '') === (next[k] || ''))) continue;

    const notes = [];
    if (beforeRev !== rev) notes.push(`ค่าขนส่ง: ${fmtBaht(beforeRev)} → ${fmtBaht(rev)}`);
    if (beforeSt !== next.status || (j.billing?.docNo || '') !== next.docNo){
      notes.push(`วางบิล: ${beforeSt} → ${next.status}${next.docNo ? ` (${next.docNo})` : ''}`);
    }
    j.revenue = rev;
    j.billing = { ...next, updatedAt: stamp, updatedBy: by.byName || 'ทีมบัญชี' };
    j.updatedAt = stamp;
    /* scope:'ops' — รายได้ของบริษัท คนขับไม่ต้องเห็นในไทม์ไลน์ */
    if (notes.length) j.events.push({ ...editEvent(notes.join(' · '), by), scope: 'ops' });
    changed++;
  }
  if (changed) write();
  return changed;
}

/* ---------- ค่าขนส่ง + วางบิล รายบิล (26 ต.ค. 2026) ----------
   ลูกค้าวางบิลตาม Invoice ไม่ใช่ตามเที่ยว
   stop.revenue         ค่าขนส่งที่แก้ด้วยมือ — ไม่มีช่องนี้ = ใช้ Amount ของไฟล์อัพเดตเลขที่บิล (stop.invoice.amount)
                        Amount เปลี่ยนจากไฟล์ใหม่/ชีต ค่าขนส่งเปลี่ยนตาม เว้นแต่แก้มือไว้
   stop.billing         รูปเดียวกับ job.billing — ไม่มี = ใช้ของเที่ยว (เที่ยวที่วางบิลแบบรายเที่ยวไว้ก่อน)
   job.revenue          สำเนาผลรวมของทุกบิลในเที่ยว (อัปเดตตอนแก้ที่นี่) — ชีตรวมช่อง O / ของเก่าอ่าน */
export const isRevenueManual = (x) => x?.revenue !== undefined && x?.revenue !== null && x?.revenue !== '';
export const stopRevenue = (x) => isRevenueManual(x) ? money(x.revenue) : money(x?.invoice?.amount);
/** สถานะวางบิลของบิลนี้ — ของบิลเอง หรือของเที่ยว (วางแบบรายเที่ยวไว้ก่อน) */
export function stopBilling(x, job){
  if (x?.billing && (x.billing.billedAt || x.billing.billId)) return x.billing;
  const jb = (job || read().jobs.find(j => j.id === x?.jobId))?.billing;
  return jb && jb.billedAt ? { ...jb, viaJob: true } : (x?.billing || null);
}

/**
 * ค่าขนส่งของบิล — value ว่าง / null = กลับไปใช้ Amount
 * @returns {boolean} เปลี่ยนไหม
 */
export function setStopRevenue(stopId, value, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบบิลนี้');
  const before = stopRevenue(x), wasManual = isRevenueManual(x);
  const clear = value === null || value === undefined || trim(value) === '';
  if (clear){
    if (!wasManual) return false;
    delete x.revenue;
  } else {
    const n = money(value);
    if (wasManual && money(x.revenue) === n) return false;
    if (!wasManual && n === money(x.invoice?.amount)) return false;   /* พิมพ์เท่า Amount = ยังตาม Amount */
    x.revenue = n;
  }
  const after = stopRevenue(x);
  const stamp = iso(Date.now());
  x.updatedAt = stamp;
  (x.events ||= []).push({ ...editEvent(`ค่าขนส่ง: ${fmtBaht(before)} → ${fmtBaht(after)}${clear ? ' (ใช้ตาม Amount)' : ''}`, by), scope: 'ops' });
  syncJobRevenue(db, x.jobId, stamp);
  write();
  return true;
}

/* เก็บผลรวมค่าขนส่งของเที่ยวไว้ใน job.revenue (ชีตรวมช่อง O / ของเก่า) */
function syncJobRevenue(db, jobId, stamp){
  const j = db.jobs.find(v => v.id === jobId);
  if (!j) return;
  const sum = Math.round(stopsOf(db, jobId).filter(x => x.status !== S.CANCELLED)
    .reduce((a, x) => a + stopRevenue(x), 0) * 100) / 100;
  if (money(j.revenue) === sum) return;
  j.revenue = sum;
  j.updatedAt = stamp;
}

/**
 * สถานะวางบิลของหลายบิลพร้อมกัน — ช่องเดียวกับ setJobBilling (ไม่มี revenue — ใช้ setStopRevenue)
 * ตรวจครบทุกบิลก่อน ผิดบิลเดียว = ไม่บันทึกเลย
 */
/** ล้างสถานะวางบิลทุกบิลและทุกเที่ยว (หลังลบใบวางบิลทั้งหมด — billing.js FT.wipeBills)
 *  ค่าขนส่งที่แก้เอง (revenue) ไม่แตะ · คืน { stops, jobs } ที่ล้าง */
export function clearAllBilling(by = {}){
  if (!isStaffSession() || !canWrite()) throw new Error('ล้างได้เฉพาะพนักงานที่มีสิทธิ์แก้ไข');
  const db = read();
  const at = iso(Date.now());
  let stops = 0, jobs = 0;
  for (const x of db.shipments){
    if (!x.billing) continue;
    delete x.billing;
    x.events.push({ ...editEvent('ล้างสถานะวางบิล (ล้างใบวางบิลทั้งหมด)', by), scope: 'ops' });
    x.updatedAt = at;
    stops++;
  }
  for (const j of db.jobs){
    if (!j.billing) continue;
    delete j.billing;
    j.events.push({ ...editEvent('ล้างสถานะวางบิล (ล้างใบวางบิลทั้งหมด)', by), scope: 'ops' });
    j.updatedAt = at;
    jobs++;
  }
  if (stops || jobs) write();
  return { stops, jobs };
}

export function setStopBilling(stopIds, patch = {}, by = {}){
  const db = read();
  const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
  const plan = [].concat(stopIds).map(id => {
    const x = db.shipments.find(v => v.id === id);
    if (!x) throw new Error('ไม่พบบิลนี้');
    const name = x.invoice?.number || x.code;
    const b = { ...(stopBilling(x, db.jobs.find(j => j.id === x.jobId)) || {}) };
    delete b.viaJob;
    if (has('docNo'))    b.docNo = trim(patch.docNo);
    if (has('billedAt')) b.billedAt = trim(patch.billedAt);
    if (has('paidAt'))   b.paidAt = trim(patch.paidAt);
    for (const k of BILL_LINK) if (has(k)) b[k] = trim(patch[k]);
    if (b.paidAt && !b.billedAt) throw new Error(`${name}: ยังไม่ได้วางบิล — บันทึกว่าชำระแล้วไม่ได้`);
    if (b.paidAt && b.paidAt < b.billedAt) throw new Error(`${name}: วันที่ชำระอยู่ก่อนวันที่วางบิล`);
    if (b.billedAt && !(stopRevenue(x) > 0)) throw new Error(`${name}: ยังไม่มีค่าขนส่ง — วางบิลไม่ได้`);
    return { x, b };
  });
  const stamp = iso(Date.now());
  let changed = 0;
  for (const { x, b } of plan){
    const next = { docNo: b.docNo || '', billedAt: b.billedAt || '', paidAt: b.paidAt || '' };
    BILL_LINK.forEach(k => { if (b[k]) next[k] = b[k]; });
    next.status = billStatus(next);
    const old = x.billing || {};
    if (x.billing && ['docNo', 'billedAt', 'paidAt', ...BILL_LINK].every(k => (old[k] || '') === (next[k] || ''))) continue;
    const beforeSt = billStatus(old);
    x.billing = { ...next, updatedAt: stamp, updatedBy: by.byName || 'ทีมบัญชี' };
    x.updatedAt = stamp;
    if (beforeSt !== next.status || (old.docNo || '') !== next.docNo){
      (x.events ||= []).push({ ...editEvent(`วางบิล: ${beforeSt} → ${next.status}${next.docNo ? ` (${next.docNo})` : ''}`, by), scope: 'ops' });
    }
    changed++;
  }
  if (changed) write();
  return changed;
}

/* ---------- sync เลขจุดส่งจากไฟล์รอบใหม่ -------------------- */
/** หาจุดส่งด้วยเลข Delivery (ช่องจับคู่) — ใช้ตอน drop ไฟล์เข้ามาเทียบ */
export function findStopByDelivery(delivery){
  return findStopsByDelivery(delivery)[0] || null;
}

/** ทุกจุดส่งที่ใช้เลข 5 นี้ — ใต้เลข 5 เดียวมีได้หลายปลายทาง (ไฟล์เหลือง) */
export function findStopsByDelivery(delivery){
  const k = String(delivery ?? '').trim();
  if (!k) return [];
  return read().shipments.filter(v => String(v.delivery ?? '').trim() === k).map(clone);
}

/** จุดส่งที่ไม่มีเลข 5 และใช้เลข Invoice นี้ — แถวไฟล์อัพเดตเลขที่บิลที่ไม่มีเลข 5 จับคู่ด้วยตัวนี้ (31 ต.ค.)
 *  คืนเฉพาะเมื่อเจอใบเดียว · เลขบิลซ้ำ (ส่งใหม่ Invoice เดิม) แยกไม่ออกว่าใบไหน จึงไม่เดา */
export function findStopByInvoice(invoice, day = ''){
  const k = baseNo(invoice);
  if (!k) return null;
  const all = read().shipments.filter(x => x.status !== S.CANCELLED && [x.code, x.baseCode].some(v => v && baseNo(v) === k));
  if (all.some(x => trim(x.delivery))) return null;
  const hit = pickRound(all, day);
  return hit.length === 1 ? clone(hit[0]) : null;
}

/** เลขเดียวกันมีบิลหลายรอบ (ส่งใหม่ด้วย Invoice/Delivery เดิม คนละวันส่ง — 2 พ.ย.)
 *  → เอาเฉพาะรอบของวันที่ไฟล์บอก (ช่อง B) ไม่ตรงรอบไหนเลยก็เอารอบล่าสุด · บิลรอบเก่าจะได้ไม่ถูกย้ายเข้าเลข 7 ใหม่ */
function pickRound(stops, day = ''){
  const days = [...new Set(stops.map(x => trim(x.serviceDate)))];
  if (days.length < 2) return stops;
  const d = days.includes(trim(day)) ? trim(day) : days.sort().pop();
  return stops.filter(x => trim(x.serviceDate) === d);
}

/**
 * วางแผนว่าไฟล์ขาวหนึ่งแถว (Delivery → Invoice + Shipment No.) ต้องเปลี่ยนจุดส่งไหนบ้าง
 *   · จุดที่ยังใช้เลข 5 (รอ Invoice) → เปลี่ยนเป็นเลข Invoice
 *     ถ้าเลข 5 นี้มีหลายจุดที่รอ Invoice อยู่ ต่อท้าย -1 -2 ตามลำดับ
 *   · จุดที่มีเลข Invoice ของตัวเองอยู่แล้ว → ไม่แตะเลข อัปเดตแค่ Shipment No.
 * @returns {{safe:object[], conflict:object[]}}
 *   safe = อัปเดตได้เลย · conflict = เลข Invoice จริงไม่ตรงกับไฟล์ ต้องให้คนยืนยัน
 */
/* ---------- งานด่วน (Real-Time) — ส่งก่อน ปิดงานทีหลัง --------------
   แอดมินเพิ่มได้สองแบบ
     ก. งานด่วนใหม่ทั้งเที่ยว   createRealtimeJob()  เลขเที่ยวชั่วคราว RT-yymmdd-NN
     ข. จุดส่งด่วนในเที่ยวเดิม   addRealtimeStop()    ใช้รถ/คนขับ/Shipment No. ของเที่ยวนั้น
   จุดส่งด่วนติดธง realtime และ source.provisional = true (แบบเดียวกับจุดเลข 5 ที่รอ Invoice)
   ปิดงานได้สองทาง
     · ใส่เลข 5 ไว้ → ไฟล์ขาวเข้ามา sync ผูกเลข Invoice / มูลค่า / Shipment No. ให้เอง
     · ไม่มีเลข 5   → แอดมินกด "ปิดงาน" กรอกเอง หรือเลือกแถวจากไฟล์ขาว  closeRealtimeStop()
   "รอปิดงาน" คิดสดจากข้อมูลเสมอ (rtMissing) — ครบเมื่อมีเลข Invoice + มูลค่า + Shipment No. เหมือนงานปกติ */
export const isRtCode = (c) => /^RT-/i.test(String(c || ''));

/* ประเภทเอกสารของงานด่วน (ไม่บังคับเลือก) · "อื่นๆ" ต้องพิมพ์หมายเหตุ · เก็บใน x.realtime.doc / docNote */
export const RT_DOC_TYPES = ['ใบเบิก', 'ใบขนส่งสินค้า', 'ใบเบิกสินค้า', 'ใบวางบิล', 'ใบขนสินค้ากลับ', 'อื่นๆ'];
export const RT_DOC_OTHER = 'อื่นๆ';
export const rtDocLabel = (x) => {
  const d = x?.realtime?.doc;
  if (!d) return '';
  return d === RT_DOC_OTHER ? `${d}: ${x.realtime.docNote || ''}` : d;
};
function rtDocOf(p){
  const doc = trim(p.docType), note = trim(p.docNote);
  if (!doc) return {};
  if (!RT_DOC_TYPES.includes(doc)) throw new Error('ประเภทเอกสารไม่ถูกต้อง');
  if (doc === RT_DOC_OTHER && !note) throw new Error('เลือก "อื่นๆ" แล้วต้องพิมพ์หมายเหตุด้วย');
  return doc === RT_DOC_OTHER ? { doc, docNote: note } : { doc };
}

function nextRtCode(db){
  const d = new Date();
  const stamp = `${String(d.getFullYear() + 543).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  /* รวมเลขเก่า (altCodes) ด้วย — เลข RT ที่ปิดงานไปแล้วห้ามวนกลับมาใช้ ไม่งั้นค้นเลขเดิมเจอสองงาน */
  const used = new Set([...db.jobs, ...db.shipments]
    .flatMap(v => [v.code, ...(v.altCodes || [])]).map(c => String(c || '').toUpperCase()));
  let n = 1;
  while (used.has(`RT-${stamp}-${pad(n)}`)) n++;
  return `RT-${stamp}-${pad(n)}`;
}
const localYMD = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/** จุดส่งด่วนยังขาดอะไร — [] = ปิดงานครบแล้ว (หรือไม่ใช่จุดส่งด่วน) */
export function rtMissing(x, job){
  if (!x?.realtime || x.status === S.CANCELLED) return [];
  const j = job || read().jobs.find(v => v.id === x.jobId);
  const miss = [];
  if (isRtCode(x.code) || !trim(x.invoice?.number)) miss.push('เลข Invoice');
  if (!(money(x.invoice?.amount) > 0)) miss.push('มูลค่า');
  if (!j || isRtCode(j.code)) miss.push('Shipment No.');
  return miss;
}

/** เที่ยวนี้มีจุดส่งด่วนที่ยังปิดงานไม่ครบกี่จุด */
export const rtPendingOf = (jobId) => {
  const db = read();
  const j = db.jobs.find(v => v.id === jobId);
  return stopsOf(db, jobId).filter(x => rtMissing(x, j).length).length;
};

function rtStopPayload(p, by){
  const name = trim(p.destName), address = trim(p.address);
  if (!name) throw new Error('ใส่ชื่อปลายทางก่อน');
  if (!address) throw new Error('ใส่ที่อยู่ปลายทางก่อน');
  return {
    delivery: trim(p.delivery),
    customer: { name: trim(p.customer) || name, contact:'', phone:'' },
    invoice: { number:'', amount:0 },
    dropoff: { name, address, contact: trim(p.contact), phone: trim(p.phone) },
    cargo: { desc: trim(p.cargo) || 'งานด่วน — ยังไม่ระบุสินค้า', pieces: Number(p.pieces) || 0, weightKg: Number(p.weightKg) || 0 },
    byRole: 'ops', byName: by.byName || 'ทีมคลัง',
    note: 'เพิ่มจุดส่งด่วน (Real-Time) — ส่งก่อน ปิดงานทีหลัง',
  };
}

function checkRtDelivery(db, delivery){
  if (delivery && db.shipments.some(x => String(x.delivery ?? '').trim() === delivery)){
    throw new Error(`เลข ${delivery} มีจุดส่งอยู่ในระบบแล้ว — เปิดงานนั้นแทนการสร้างงานด่วนซ้ำ`);
  }
}

/** แบบ ข. เพิ่มจุดส่งด่วนเข้าเที่ยวที่มีอยู่ */
export function addRealtimeStop(jobId, p = {}, by = {}, { code = '' } = {}){
  const db = read();
  const j = db.jobs.find(v => v.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');
  if (j.status === S.CANCELLED) throw new Error('เที่ยวนี้ถูกยกเลิกแล้ว');
  const payload = rtStopPayload(p, by);
  const doc = rtDocOf(p);
  checkRtDelivery(db, payload.delivery);
  checkRtNumbers(db, { invoice: p.invoice, dupOk: p.dupOk });

  /* เที่ยวปิดครบไปแล้ว — เปิดกลับเป็น "ออกจากคลัง" ให้คนขับปิดจุดใหม่ได้ */
  if (j.status === S.DELIVERED){
    j.status = S.DEPARTED;
    j.updatedAt = iso(Date.now());
    j.events.push(editEvent(`เพิ่มจุดส่งด่วนหลังปิดเที่ยวแล้ว — เที่ยวกลับเป็น "${META[S.DEPARTED].label}"`, by));
  }
  const seq = Math.max(0, ...stopsOf(db, j.id).map(x => x.seq || 0)) + 1;
  const made = createShipment({
    ...payload, code: code || nextRtCode(db), jobId: j.id, seq,
    serviceDate: j.serviceDate, driverIds: j.driverIds || [],
  });
  const x = read().shipments.find(v => v.id === made.id);
  x.realtime = { at: iso(Date.now()), by: by.byName || 'ทีมคลัง', ...doc };
  x.source = { kind:'realtime', provisional:true, shipmentNo: isRtCode(j.code) ? '' : j.code };
  write();
  if (trim(p.invoice)) return setRtNumbers(x.id, { invoice: p.invoice, dupOk: p.dupOk }, by).stop;
  return clone(x);
}

/** แบบ ก. งานด่วนใหม่ทั้งเที่ยว — จุดส่งแรกใช้เลขเดียวกับเที่ยว */
export function createRealtimeJob(p = {}, by = {}){
  const db = read();
  rtStopPayload(p, by);                       /* ตรวจช่องบังคับก่อนสร้างอะไร */
  rtDocOf(p);
  checkRtNumbers(db, { invoice: p.invoice, shipmentNo: p.shipmentNo, dupOk: p.dupOk });
  checkRtDelivery(db, trim(p.delivery));
  const ids = (Array.isArray(p.driverIds) ? p.driverIds : []).filter(id => db.drivers.some(d => d.id === id));
  if (!ids.length) throw new Error('เลือกคนขับอย่างน้อย 1 คน');
  for (const id of ids){
    const d = db.drivers.find(v => v.id === id);
    if (!isActiveDriver(d)) throw new Error(`${d.name} ถูกปิดใช้งานอยู่`);
  }
  const code = nextRtCode(db);
  const job = createJob({
    code, vehicle: p.vehicle, carrier: p.carrier, serviceDate: p.serviceDate || localYMD(),
    driverIds: ids, source: { kind:'realtime' },
    byRole: 'ops', byName: by.byName || 'ทีมคลัง', note: 'สร้างงานด่วน (Real-Time) — ส่งก่อน ปิดงานทีหลัง',
  });
  read().jobs.find(v => v.id === job.id).realtime = { at: iso(Date.now()), by: by.byName || 'ทีมคลัง' };
  const x = addRealtimeStop(job.id, p, by, { code });
  /* ใส่ SO มาด้วย = เปลี่ยนเลขเที่ยวเป็น SO หรือรวมเข้าเที่ยวเลขนั้นที่มีอยู่แล้ว */
  if (trim(p.shipmentNo)) return getJob(setRtNumbers(x.id, { shipmentNo: p.shipmentNo }, by).jobId);
  return getJob(job.id);
}

/** เลข Invoice ของงานด่วนซ้ำกับบิลในระบบ (31 ต.ค.: ใช้ซ้ำได้ แต่ต้องกดยืนยันก่อน)
 *  โยน error code 'DUP_INV' + taken (เลขในระบบที่ชน) → หน้าจอถามยืนยัน แล้วเรียกซ้ำด้วย dupOk:true */
function rtDupCheck(db, inv, exceptId = ''){
  const k = inv.toUpperCase();
  if (sameInv(db.shipments.find(v => v.id === exceptId), inv)) return;   /* เลขเดิมของตัวเอง — ไม่ได้เปลี่ยน */
  const taken = db.shipments.filter(v => v.id !== exceptId && v.status !== S.CANCELLED &&
    [v.code, v.baseCode, v.invoice?.number].some(c => String(c || '').toUpperCase() === k)).map(v => v.code);
  if (!taken.length) return;
  const err = new Error(`เลข Invoice ${inv} ซ้ำกับบิลในระบบ (${taken.slice(0, 3).join(', ')})`);
  err.code = 'DUP_INV';
  err.taken = taken;
  throw err;
}
/** ใส่เลข Invoice ให้จุดส่งด่วน — เลขชนจุดอื่น (ยืนยันแล้ว) ใช้เลขต่อท้ายที่ยังว่าง · baseCode = เลขที่พิมพ์ ค้นเลขเปล่าเจอครบ */
const sameInv = (x, inv) => !!x && [x.code, x.baseCode].some(c => String(c || '').toUpperCase() === inv.toUpperCase());
function rtSetCode(db, x, inv){
  x.code = codeTaken(db, inv, x.id) ? freeCode(db, inv, x.id) : inv;
  if (x.code !== inv) x.baseCode = inv;
}

/** ตรวจเลข Invoice / SO / เลข 5 ก่อนบันทึก (ช่องว่าง = ไม่ตรวจ) · exceptId = จุดส่งตัวเอง · f.dupOk = ยืนยันเลข Invoice ซ้ำแล้ว */
function checkRtNumbers(db, f = {}, exceptId = ''){
  const inv = trim(f.invoice), ship = trim(f.shipmentNo), del = trim(f.delivery);
  if (inv && isRtCode(inv)) throw new Error('เลข Invoice ห้ามขึ้นต้นด้วย RT-');
  if (ship && isRtCode(ship)) throw new Error('เลข SO ห้ามขึ้นต้นด้วย RT-');
  if (inv && !f.dupOk) rtDupCheck(db, inv, exceptId);
  if (del && db.shipments.some(v => v.id !== exceptId && String(v.delivery ?? '').trim() === del)){
    throw new Error(`เลข 5 ${del} ผูกกับจุดส่งอื่นอยู่แล้ว`);
  }
}

/** ย้ายจุดส่งเดียวออกจากเที่ยวเดิมไปเที่ยวเลข ship (ไม่มี = สร้างเที่ยวใหม่ ใช้รถ/คนขับ/วันของเที่ยวเดิม) */
function moveStopToShip(db, x, from, ship, by){
  const at = iso(Date.now());
  let target = db.jobs.find(v => v.code.toUpperCase() === ship.toUpperCase());
  if (!target){
    const made = createJob({
      code: ship, vehicle: from.vehicle, carrier: from.carrier, serviceDate: from.serviceDate,
      driverIds: from.driverIds || [], source: { kind:'realtime' },
      byRole: 'ops', byName: by.byName || 'ทีมคลัง', note: `แยกจุดส่งด่วน ${x.code} ออกจากเที่ยว ${from.code}`,
    });
    target = db.jobs.find(v => v.id === made.id);
    target.realtime = { at, by: by.byName || 'ทีมคลัง' };
  }
  x.jobId = target.id;
  x.seq = Math.max(0, ...stopsOf(db, target.id).filter(v => v.id !== x.id).map(v => v.seq || 0)) + 1;
  x.driverIds = [...(target.driverIds || [])];
  from.events.push(editEvent(`ย้ายจุดส่งด่วน ${x.code} ไปเที่ยว ${ship}`, by));
  target.events.push(editEvent(`รับจุดส่งด่วน ${x.code} ย้ายมาจากเที่ยว ${from.code}`, by));
  from.updatedAt = target.updatedAt = at;
  return target;
}

/**
 * กรอก/แก้เลขของจุดส่งด่วนทีละตัว — เลขมาทีหลัง หรือพนักงานพิมพ์ผิด (ช่องว่าง = ไม่แตะ)
 *   invoice    → เปลี่ยนเลขจุดส่งเป็นเลขนี้ (เลขเดิมเก็บใน altCodes ให้ค้นเจอ)
 *   shipmentNo → เที่ยวที่มีแต่จุดส่งด่วน: ย้ายทั้งเที่ยว (เปลี่ยนเลข หรือรวมเข้าเที่ยวเลขนั้น — attachRtJob)
 *                เที่ยวที่มีจุดปกติปนอยู่: ย้ายเฉพาะจุดนี้ไปเที่ยวเลขนั้น (ไม่มี = สร้างใหม่)
 *   delivery   → เลข 5
 * ครบ Invoice + มูลค่า + SO แล้วถือว่าปิดงาน · dry = ตรวจอย่างเดียว ไม่บันทึก
 * @returns {{stop:object, jobId:string, changes:string[]}}
 */
export function setRtNumbers(stopId, f = {}, by = {}, { dry = false } = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบจุดส่งนี้');
  if (!x.realtime) throw new Error('จุดส่งนี้ไม่ใช่งานด่วน');
  checkRtNumbers(db, f, x.id);
  if (dry) return { stop: clone(x), jobId: x.jobId, changes: [] };

  const inv = trim(f.invoice), ship = trim(f.shipmentNo), del = trim(f.delivery);
  const at = iso(Date.now());
  const changes = [];
  if (del && del !== trim(x.delivery)){
    changes.push(`เลข 5: ${trim(x.delivery) || '—'} → ${del}`);
    x.delivery = del;
  }
  if (inv && !sameInv(x, inv)){
    x.altCodes = [...new Set([...(x.altCodes || []), x.code].filter(Boolean))];
    const was = x.code;
    rtSetCode(db, x, inv);
    changes.push(`Invoice: ${was} → ${x.code}${x.code !== inv ? ` (เลข ${inv} ซ้ำ — ยืนยันแล้ว)` : ''}`);
    x.invoice = { ...(x.invoice || {}), number: inv };
    x.source = { ...(x.source || {}), invoice: inv };
  }
  let j = db.jobs.find(v => v.id === x.jobId);
  if (ship && j && ship.toUpperCase() !== j.code.toUpperCase()){
    changes.push(`SO: ${isRtCode(j.code) ? '—' : j.code} → ${ship}`);
    const stops = stopsOf(db, j.id);
    if (stops.every(v => v.realtime)){
      attachRtJob(db, j, ship, by);
    } else {
      moveStopToShip(db, x, j, ship, by);
      x.source = { ...(x.source || {}), shipmentNo: ship };
    }
    j = db.jobs.find(v => v.id === x.jobId);
  }
  if (!changes.length) return { stop: clone(x), jobId: x.jobId, changes };

  /* ครบทุกเลขแล้ว = ปิดงาน (เหมือนกดปิดงาน) */
  if (x.source?.provisional && !rtMissing(x, j).length){
    x.source = { ...x.source, provisional: false };
    x.realtime = { ...x.realtime, closedAt: at, closedBy: by.byName || 'ทีมคลัง' };
    changes.push('ปิดงานด่วนครบแล้ว');
  }
  x.updatedAt = at;
  x.events.push(editEvent(`แก้เลขงานด่วน: ${changes.join(' · ')}`, by));
  write();
  return { stop: clone(x), jobId: x.jobId, changes };
}

/**
 * ย้ายงานด่วน (เลข RT-) ไปอยู่ใต้ Shipment No. จริง
 *   ยังไม่มีเที่ยวเลขนั้น → เปลี่ยนเลขเที่ยวด่วนเป็นเลขนั้นเลย
 *   มีแล้ว → ย้ายทุกจุดเข้าเที่ยวนั้น รวมคนขับและค่ารอบ แล้วลบเที่ยวด่วนทิ้ง
 * ไม่สนว่าออกจากคลังไปแล้วหรือยัง เพราะงานด่วนส่งก่อนเอกสารเสมอ
 */
function attachRtJob(db, j, ship, by){
  const at = iso(Date.now());
  const stops = stopsOf(db, j.id);
  stops.forEach(s => { s.source = { ...(s.source || {}), shipmentNo: ship }; s.updatedAt = at; });
  const target = db.jobs.find(v => v.id !== j.id && v.code.toUpperCase() === ship.toUpperCase());
  if (!target){
    j.altCodes = [...new Set([...(j.altCodes || []), j.code])];
    j.events.push(editEvent(`งานด่วนได้ Shipment No. แล้ว: ${j.code} → ${ship}`, by));
    j.code = ship;
    j.updatedAt = at;
    /* ได้เลข 7 จริงแล้ว — ย้ายไปเอกสาร job_<เลข 7> (ID เดิมหายจากเครื่อง = markDirty ส่งคำสั่งลบเอกสารเดิมให้) */
    const nid = jobIdFor(db, ship);
    if (nid === `job_${String(ship).trim().toUpperCase()}`){ j.id = nid; stops.forEach(s => { s.jobId = nid; }); }
    return;
  }
  stops.forEach(s => { s.jobId = target.id; });
  target.driverIds = [...new Set([...(target.driverIds || []), ...(j.driverIds || [])])];
  target.driverId = target.driverId || target.driverIds[0] || null;
  if (payTotal(j.pay) > 0){
    const p = target.pay || { base:0, items:[], drivers:{} };
    p.base = money(p.base) + money(j.pay.base);
    p.items = [...(p.items || []), ...(j.pay.items || [])];
    p.drivers = { ...(p.drivers || {}) };
    Object.entries(j.pay.drivers || {}).forEach(([id, rows]) => { p.drivers[id] = [...(p.drivers[id] || []), ...rows]; });
    p.updatedAt = at;
    target.pay = p;
  }
  target.events.push(editEvent(`รวมงานด่วน ${j.code} (${stops.length} จุด) เข้าเที่ยวนี้`, by));
  target.updatedAt = at;
  db.jobs.splice(db.jobs.indexOf(j), 1);
}

/** ปิดงานด่วน — ต้องครบเหมือนงานปกติ: เลข Invoice + มูลค่า + Shipment No. */
export function closeRealtimeStop(stopId, f = {}, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบจุดส่งนี้');
  const j = db.jobs.find(v => v.id === x.jobId);
  const inv = trim(f.invoice), amt = money(f.amount);
  const ship = trim(f.shipmentNo) || (j && !isRtCode(j.code) ? j.code : '');
  const miss = [];
  if (!inv || isRtCode(inv)) miss.push('เลข Invoice');
  if (!(amt > 0)) miss.push('มูลค่า');
  if (!ship || isRtCode(ship)) miss.push('Shipment No.');
  if (miss.length) throw new Error('กรอกไม่ครบ: ' + miss.join(', '));
  if (!f.dupOk) rtDupCheck(db, inv, x.id);
  if (j && !isRtCode(j.code) && j.code.toUpperCase() !== ship.toUpperCase()){
    throw new Error(`จุดนี้อยู่ในเที่ยว ${j.code} — Shipment No. ต้องเป็นเลขเดียวกัน`);
  }
  const delivery = trim(f.delivery);
  if (delivery && db.shipments.some(v => v.id !== x.id && String(v.delivery ?? '').trim() === delivery)){
    throw new Error(`เลข ${delivery} ผูกกับจุดส่งอื่นอยู่แล้ว`);
  }

  const at = iso(Date.now());
  const old = x.code;
  x.altCodes = [...new Set([...(x.altCodes || []), old].filter(Boolean))];
  if (!sameInv(x, inv)) rtSetCode(db, x, inv);
  x.invoice = { ...(x.invoice || {}), number: inv, amount: amt };
  if (delivery) x.delivery = delivery;
  x.source = { ...(x.source || {}), shipmentNo: ship, invoice: inv, provisional: false };
  x.realtime = { ...(x.realtime || {}), closedAt: at, closedBy: by.byName || 'ทีมคลัง' };
  x.updatedAt = at;
  x.events.push(editEvent(`ปิดงานด่วน: ${old} → ${x.code} · มูลค่า ${fmtBaht(amt)} · Shipment ${ship}`, by));
  if (j && isRtCode(j.code)) attachRtJob(db, j, ship, by);
  write();
  return clone(x);
}

/**
 * มูลค่า (ช่อง Amount ของไฟล์ขาว) → invoice.amount ของจุดส่ง
 * มูลค่าของงานคิดสดจากผลรวมจุดส่งเสมอ (jobRollup) — ตอนยังเป็นงานเลข 5 ก็เห็นมูลค่าของงานนั้น
 * พอย้ายเข้างานเลข 7 (Shipment No.) มูลค่าก็รวมกันเองโดยไม่ต้องทำอะไรเพิ่ม
 *
 * ไม่ขึ้นกับการเปลี่ยนเลข จึงแยกจาก planDeliverySync — จุดที่ sync เลขไปแล้วก่อนมีฟีเจอร์นี้ก็ได้มูลค่าด้วย
 * ใต้เลข 5 เดียวมีหลายจุดได้ (ไฟล์เหลือง) แต่ไฟล์ขาวมีมูลค่าแถวเดียว → ลงที่จุดที่เลข Invoice ตรง
 * ไม่เจอก็ลงจุดแรก จุดอื่นใต้เลขเดียวกันไม่แตะ ยอดรวมของงานจึงไม่นับซ้ำ
 * @param {{delivery:string, invoice?:string, amount:*}[]} rows เรียงเก่า→ใหม่ แถวหลังชนะ
 * @returns {number} จำนวนจุดที่มูลค่าเปลี่ยน
 */
export function syncStopAmounts(rows, by = {}){
  const db = read();
  const byDel = new Map();
  db.shipments.forEach(x => {
    const d = trim(x.delivery);
    if (!d || x.status === S.CANCELLED) return;
    if (!byDel.has(d)) byDel.set(d, []);
    byDel.get(d).push(x);
  });
  /* หาจุดเป้าหมายของทุกแถวก่อน (จุด → มูลค่า แถวหลังชนะ) แล้วค่อยใส่ทีเดียว
     ใต้เลข 5 เดียวกันมีหลายรอบได้ (ส่งใหม่) — แถวของแต่ละวันลงเฉพาะบิลรอบนั้น (pickRound) */
  const want = new Map();
  for (const r of rows || []){
    const d = trim(r.delivery);
    if (trim(r.amount) === '') continue;
    /* แถวที่ไม่มีเลข 5 — จับคู่ด้วยเลข Invoice (findStopByInvoice)
       แถวพวกนี้มักใส่ Amount 0 — ไม่เอา 0 ไปทับมูลค่าที่แอดมินใส่เอง */
    if (!d && !money(r.amount)) continue;
    let stops;
    if (d) stops = pickRound(byDel.get(d) || [], r.serviceDate).slice().sort((a, b) => (a.seq || 0) - (b.seq || 0));
    else {
      const x = trim(r.invoice) && findStopByInvoice(r.invoice, r.serviceDate);
      stops = x ? db.shipments.filter(v => v.id === x.id) : [];
    }
    if (!stops.length) continue;
    const inv = trim(r.invoice).toUpperCase();
    const hit = (inv && stops.find(x => [x.code, x.baseCode, x.invoice?.number]
      .some(v => String(v || '').toUpperCase() === inv))) || stops[0];
    want.set(hit.id, money(r.amount));
  }
  let changed = 0;
  const stamp = iso(Date.now());
  for (const [id, amount] of want){
    const hit = db.shipments.find(x => x.id === id);
    const w = { amount };
    const before = money(hit.invoice?.amount);
    if (before === w.amount) continue;
    hit.invoice = { ...(hit.invoice || {}), amount: w.amount };
    hit.updatedAt = stamp;
    /* ครั้งแรกที่ได้มูลค่า (จาก 0) ไม่ต้องลงไทม์ไลน์ — มีเฉพาะตอนไฟล์ใหม่เปลี่ยนตัวเลข */
    if (before) (hit.events ||= []).push(editEvent(`มูลค่า: ${fmtBaht(before)} → ${fmtBaht(w.amount)}`, by));
    changed++;
  }
  if (changed) write();
  return changed;
}

export function planDeliverySync({ delivery, invoice, shipmentNo, vehicle = '', carrier = '', serviceDate = '', drivers = '', stops: given = null }){
  /* given = จุดที่หาเจอด้วยเลข Invoice แล้ว (แถวที่ไม่มีเลข 5 · findStopByInvoice)
     เลข 5 เดียวกันหลายรอบ (ส่งใหม่) — แก้เฉพาะบิลรอบของวันที่ในไฟล์ ไม่ตรงก็รอบล่าสุด */
  const stops = (given || pickRound(findStopsByDelivery(delivery), serviceDate)).sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const inv  = trim(invoice);
  const ship = trim(shipmentNo);
  const safe = [], conflict = [], unknownDrivers = [];
  if (!stops.length) return { safe, conflict, unknownDrivers };
  /* ข้อมูลรถจากไฟล์ขาว — ใช้ตอนต้องสร้างงานใหม่ของ Shipment No. นี้ */
  const day = trim(serviceDate);
  const trip = { vehicle: trim(vehicle), carrier: trim(carrier), serviceDate: day };
  /* จุดที่ Shipment No. ตรงแล้ว แต่ยังไม่อยู่ในงานของเลขนั้น — ต้องส่งไปย้ายอีกรอบ */
  const jobs = read().jobs;
  const placed = (x) => !ship || jobs.find(j => j.id === x.jobId)?.code.toUpperCase() === ship.toUpperCase();
  /* วันที่ออกเดินทาง (ช่อง B ของไฟล์ขาว) ยังไม่ตรงกับจุดส่งหรืองาน — ไฟล์เป็นตัวจริง */
  const dateOff = (x) => !!day && (x.serviceDate !== day || jobs.find(j => j.id === x.jobId)?.serviceDate !== day);

  /* คนขับจากช่อง "คนขับ" ของไฟล์ขาว — เพิ่มเข้าไป ไม่ลบคนขับที่มีอยู่แล้ว
     ชื่อที่จับคู่ไม่ได้ (ไม่มีในทะเบียน / ตรงหลายคน) ข้ามไป แล้วแจ้งให้แอดมินรู้ */
  const driverIds = [];
  String(drivers ?? '').split(/[,،;|/]+/).map(v => v.trim()).filter(Boolean).forEach(name => {
    const m = matchDriverName(name);
    if (m.driver){ if (!driverIds.includes(m.driver.id)) driverIds.push(m.driver.id); }
    else unknownDrivers.push(name);
  });
  const newDrivers = (x) => driverIds.filter(id => !(x.driverIds || []).includes(id));

  const waiting = stops.filter(x => x.source?.provisional);
  waiting.forEach((x, i) => {
    const code = inv ? (waiting.length > 1 ? `${inv}-${i + 1}` : inv) : x.code;
    const add = newDrivers(x);
    if (code === x.code && (!ship || ship === (x.source?.shipmentNo || '')) && placed(x) && !add.length && !dateOff(x)) return;
    safe.push({ stopId:x.id, from:x.code, code, invoice: inv, shipmentNo: ship, delivery, trip,
                addDriverIds: add, dest: x.dropoff?.name || '', provisional:true });
  });

  /* ใบที่เลขจริงอยู่แล้ว — ถ้าเลข 5 นี้มีจุดเดียวและ Invoice ไม่ตรง แปลว่ามีอะไรผิดปกติ */
  stops.filter(x => !x.source?.provisional).forEach(x => {
    const sameShip = !ship || ship === (x.source?.shipmentNo || '');
    const add = newDrivers(x);
    if (inv && stops.length === 1 && baseNo(x.code) !== baseNo(inv)){
      conflict.push({ stopId:x.id, from:x.code, code:inv, invoice:inv, shipmentNo:ship, delivery, trip,
                      addDriverIds: add, dest: x.dropoff?.name || '', provisional:false });
    } else if (!sameShip || !placed(x) || add.length || dateOff(x)){
      safe.push({ stopId:x.id, from:x.code, code:x.code, invoice:'', shipmentNo:ship, delivery, trip,
                  addDriverIds: add, dest: x.dropoff?.name || '', provisional:false });
    }
  });
  return { safe, conflict, unknownDrivers };
}

/**
 * เปลี่ยนเลขจุดส่งเป็นเลข Invoice ที่เพิ่งตามมา + อัปเดต Shipment No. จากไฟล์ขาว
 * เลขเดิม (เลข 5) ถูกเก็บไว้เป็นเลขอ้างอิงรอง ค้นด้วยเลขเก่ายังเจอ
 * และช่อง delivery ไม่เปลี่ยน — ไฟล์ขาวรอบหน้ายังจับคู่ได้
 * @param {{stopId:string, code:string, invoice?:string, shipmentNo?:string}[]} updates
 */
export function syncStopCodes(updates, by = {}){
  const db = read();
  const done = [], failed = [];
  const out = { moved: [], held: [], warns: [] };

  for (const u of updates){
    const x = db.shipments.find(v => v.id === u.stopId);
    if (!x){ failed.push({ ...u, msg:'ไม่พบจุดส่งนี้แล้ว' }); continue; }

    let code = trim(u.code) || x.code;
    const ship = trim(u.shipmentNo);
    const codeChanged = code.toUpperCase() !== x.code.toUpperCase();
    const shipChanged = !!ship && ship !== (x.source?.shipmentNo || '');
    /* Shipment No. ตรงแล้วแต่ยังไม่อยู่ในงานของเลขนั้น (เช่น รอบก่อนย้ายไม่ได้) ก็ลองย้ายอีกรอบ */
    const misplaced = !!ship && db.jobs.find(j => j.id === x.jobId)?.code.toUpperCase() !== ship.toUpperCase();
    const addIds = (u.addDriverIds || []).filter(id => !(x.driverIds || []).includes(id) && db.drivers.some(d => d.id === id));
    /* วันที่ออกเดินทางจากไฟล์ (ช่อง B) — ทั้งจุดส่งและงานของ Shipment No. นี้ใช้วันตามไฟล์ */
    const day = trim(u.trip?.serviceDate);
    const ownJob = () => db.jobs.find(j => j.id === x.jobId && (!ship || j.code.toUpperCase() === ship.toUpperCase()));
    const dateOff = !!day && (x.serviceDate !== day || (ownJob() && ownJob().serviceDate !== day));
    if (!codeChanged && !shipChanged && !misplaced && !addIds.length && !dateOff) continue;     /* ตรงอยู่แล้ว ข้าม */
    /* เลขบิลซ้ำกับจุดส่งอื่น (31 ต.ค.: ส่งไม่สำเร็จแล้วส่งใหม่ด้วย Invoice เดิม) — ไม่ปฏิเสธแล้ว
       ใช้เลขต่อท้ายที่ยังว่าง (เช่น 8371079532-2) ให้เลขในระบบไม่ชนกัน · baseCode = เลขเปล่า ค้นเลขเปล่าเจอครบทุกใบ
       ป้ายเตือนบนบิลมาจาก reusedOf() (คำนวณจากเลขฐานเดียวกัน คนละ Delivery) */
    let reuse = '';
    if (codeChanged && codeTaken(db, code, x.id)){
      reuse = code;
      code = freeCode(db, baseNo(code), x.id);
    }

    const old = x.code;
    const notes = [];
    if (codeChanged){
      x.altCodes = [...new Set([...(x.altCodes || []), old, x.baseCode].filter(Boolean))];
      x.code = code;
      if (reuse) x.baseCode = baseNo(reuse);
      if (u.invoice) x.invoice.number = trim(u.invoice);
      x.source = { ...(x.source || {}), provisional: false, invoice: trim(u.invoice) || x.source?.invoice || '' };
      notes.push(reuse ? `เลขจุดส่ง: ${old} → ${code} (เลขบิล ${reuse} มีบิลอื่นใช้อยู่แล้ว — ใช้เลขต่อท้าย)` : `เลขจุดส่ง: ${old} → ${code} (Invoice ตามมาแล้ว)`);
    }
    if (shipChanged){
      const was = x.source?.shipmentNo || '—';
      x.source = { ...(x.source || {}), shipmentNo: ship };
      notes.push(`Shipment No.: ${was} → ${ship}`);
    }
    if (addIds.length){
      /* คนขับจากไฟล์ขาว — ใส่ทั้งจุดส่งและงานที่จุดนี้อยู่ คนในงานจะเห็นทุกจุดของงาน */
      x.ownDriverIds = [...new Set([...ownersOf(x), ...addIds])];
      x.driverIds = [...(x.driverIds || []), ...addIds];
      x.driverId = x.driverId || x.driverIds[0];
      const job = db.jobs.find(j => j.id === x.jobId);
      if (job){
        job.driverIds = [...new Set([...(job.driverIds || []), ...addIds])];
        job.driverId = job.driverId || job.driverIds[0];
        job.updatedAt = iso(Date.now());
        if (!isGroupJob(job)) spreadCrew(db, job);
      }
      notes.push(`คนขับจากไฟล์: ${addIds.map(id => driverName(db.drivers.find(d => d.id === id))).join(' · ')}`);
    }
    if (day && x.serviceDate !== day){
      notes.push(`วันที่ออกเดินทาง: ${x.serviceDate || '—'} → ${day} (ตามไฟล์)`);
      x.serviceDate = day;
    }
    x.updatedAt = iso(Date.now());
    if (notes.length) x.events.push(editEvent(notes.join(' · '), by));
    if (ship) regroupStop(db, x, ship, u.trip || {}, by, out);
    const job = day && ownJob();
    if (job && job.serviceDate !== day){
      job.events.push(editEvent(`วันที่ออกเดินทาง: ${job.serviceDate || '—'} → ${day} (ตามไฟล์)`, by));
      job.serviceDate = day;
      job.updatedAt = iso(Date.now());
    }
    done.push({ stopId:x.id, from:old, to:x.code, shipmentNo: ship });
  }

  mergeDuplicateJobs(db, by, out.warns);
  pruneEmptyJobs(db);
  if (done.length) write();
  return { done, failed, ...out };
}

/* ---------- เลขบิลซ้ำ + คนขับแจ้งเลขบิล (28 ต.ค.) ----------
   ลูกค้าส่งไฟล์อัพเดตเลขที่บิลที่มีเลข Invoice เดียวกันสองแถว (คนละ Delivery) ในวันเดียวกัน
   → syncStopCodes ปฏิเสธจุดที่สอง จุดนั้นค้างเป็นเลข 5 คนขับถือใบเลข 8 อยู่ หาในแอปไม่เจอ
   ops (opsAuto.js) จับกลุ่มเลขซ้ำจากแถวในชีต → ไม่ใส่เลขซ้ำให้ใคร + ติดป้าย dupInv บนจุดส่งที่เกี่ยวข้อง
   ป้ายอยู่บนจุดส่ง (Firestore) ทุกเครื่องเห็น รวมเครื่องคนขับ · หายเองเมื่อแก้เลขจนไม่ซ้ำ หรือออฟฟิศกดเคลียร์ (dupCleared)
   คนขับหาบิลไม่เจอ → reportBillNo() ต่อ event ที่มี billNo (กฎ driverEdit ยอม — events มีแต่เพิ่ม)
   ออฟฟิศเคลียร์ด้วยการใช้เลขนั้น (เลขจุดส่งตรงกับที่แจ้ง) หรือกดรับทราบ (billNoAck = id ของ event) */
const baseNo = (c) => String(c || '').trim().toUpperCase().replace(/-\d+$/, '');
/** เลขนี้มีจุดส่งอื่นใช้อยู่ (เลขปัจจุบัน หรือเลขเก่าใน altCodes) */
function codeTaken(db, code, selfId = ''){
  const k = String(code || '').trim().toUpperCase();
  return !!k && db.shipments.some(v => v.id !== selfId &&
    [v.code, ...(v.altCodes || [])].some(c => String(c || '').toUpperCase() === k));
}
/** เลขที่ยังว่าง: เลขเปล่าก่อน แล้ว -2 -3 … */
function freeCode(db, base, selfId = ''){
  if (!codeTaken(db, base, selfId)) return base;
  let n = 2;
  while (codeTaken(db, `${base}-${n}`, selfId)) n++;
  return `${base}-${n}`;
}

/** บิลเลขซ้ำ (31 ต.ค. — ส่งไม่สำเร็จแล้วส่งใหม่ด้วยเลข Invoice เดิม · Delivery ใหม่หรือเดิมแต่คนละวันส่ง)
 *  = จุดส่งอื่นที่ยังไม่ยกเลิก มีเลขบิลฐานเดียวกัน แต่คนละ Delivery หรือคนละวันส่ง (บิลที่แยก -1 -2 จากไฟล์เดียวกันใช้ Delivery เดียวกัน ไม่นับ)
 *  @returns {{no:string, others:{id:string, code:string, status:string, at:string}[]}|null} */
export function reusedOf(x){
  if (!x || x.status === S.CANCELLED) return null;
  const db = read();
  if (reuseOf_ !== db.shipments){
    reuseOf_ = db.shipments;
    reuseIdx = new Map();
    for (const v of db.shipments){
      if (v.status === S.CANCELLED || v.source?.provisional) continue;
      const k = baseNo(v.invoice?.number || v.baseCode || v.code);
      if (!k) continue;
      if (!reuseIdx.has(k)) reuseIdx.set(k, []);
      reuseIdx.get(k).push(v);
    }
  }
  if (x.source?.provisional) return null;
  const no = baseNo(x.invoice?.number || x.baseCode || x.code);
  const del = (v) => String(v.delivery ?? '').trim();
  /* 2 พ.ย.: ส่งใหม่ด้วย Delivery เดิมก็นับ ถ้าคนละวันส่ง */
  const day = (v) => String(v.serviceDate ?? '').trim();
  const others = (reuseIdx.get(no) || []).filter(v => v.id !== x.id &&
    (del(v) && del(x) ? (del(v) !== del(x) || day(v) !== day(x)) : v.jobId !== x.jobId));
  return others.length ? { no, others: others.map(v => ({ id: v.id, code: v.code, status: v.status, at: v.updatedAt })) } : null;
}
/** ป้ายเลขซ้ำที่ยังไม่เคลียร์ของจุดนี้ · ไม่มี = null */
export const dupOf = (x) => (x?.dupInv?.no && x.dupCleared !== x.dupInv.no) ? x.dupInv : null;
/** คนขับแจ้งเลขบิลบนใบในมือที่ออฟฟิศยังไม่จัดการ (event ล่าสุดที่มี billNo) · ไม่มี = null */
export function billReportOf(x){
  const ev = (x?.events || []).filter(e => e.billNo).at(-1);
  if (!ev || x.billNoAck === ev.id) return null;
  const no = baseNo(ev.billNo);
  if (baseNo(x.code) === no || baseNo(x.invoice?.number) === no) return null;   /* ออฟฟิศใช้เลขที่แจ้งแล้ว */
  return ev;
}

/**
 * ติด / ถอดป้ายเลขซ้ำตามกลุ่มที่ ops หาเจอรอบนี้ — เรียกทุกรอบ sync (ทำซ้ำได้ ผลเหมือนเดิม)
 * กลุ่มที่แก้เสร็จแล้ว (ทุก Delivery มีจุดส่งที่ได้เลขจริง และเลขไม่ชนกัน) ไม่ติดป้าย แม้ไฟล์ยังซ้ำอยู่
 * @param {{day:string, invoice:string, deliveries:string[]}[]} groups
 * @returns {number} จำนวนจุดส่งที่ป้ายเปลี่ยน
 */
export function markDupInvoices(groups = [], by = {}){
  const db = read();
  const want = new Map();                            /* stopId → ป้าย */
  const delOf = (v) => String(v.delivery ?? '').trim();
  for (const g of groups){
    const byDel = g.deliveries.map(d => db.shipments.filter(v => delOf(v) === d && v.status !== S.CANCELLED));
    const found = byDel.filter(l => l.length);
    /* ใส่เลขจริงครบทุก Delivery แล้ว (บิลหลังได้เลขต่อท้าย -2 -3) = จบ ถอดป้าย — ป้ายบนบิลยังมาจาก reusedOf() */
    const fixed = found.length === byDel.length
      && found.every(l => l.every(v => !v.source?.provisional));
    if (fixed) continue;
    found.flat().forEach(v => { if (v.dupCleared !== g.invoice) want.set(v.id, { no: g.invoice, day: g.day, deliveries: g.deliveries }); });
  }
  const at = iso(Date.now());
  let changed = 0;
  for (const x of db.shipments){
    const w = want.get(x.id), cur = x.dupInv || null;
    if (w && (!cur || cur.no !== w.no || cur.deliveries.join() !== w.deliveries.join())){
      x.dupInv = { ...w, at };
      x.events.push(editEvent(`เลขบิล ${w.no} ซ้ำกับ Delivery อื่นในไฟล์ (${w.deliveries.join(', ')}) — ใส่เลขให้ทุกบิลแล้ว บิลหลังได้เลขต่อท้าย ตรวจกับใบจริง`, by));
      x.updatedAt = at;
      changed++;
    } else if (!w && cur){
      x.dupInv = null;                               /* แก้แล้ว / ไฟล์ใหม่ไม่ซ้ำแล้ว */
      x.events.push(editEvent(`เลขบิล ${cur.no} ไม่ซ้ำแล้ว`, by));
      x.updatedAt = at;
      changed++;
    }
  }
  if (changed) write();
  return changed;
}

/** ออฟฟิศกดเคลียร์เลขซ้ำโดยไม่แก้เลข (เช่น ตรวจแล้วถูกต้อง / อีก Delivery ไม่ได้มาส่งกับเรา) */
export function clearDupInvoice(stopIds = [], by = {}){
  const db = read();
  const at = iso(Date.now());
  let n = 0;
  for (const id of stopIds){
    const x = db.shipments.find(v => v.id === id);
    if (!x?.dupInv) continue;
    x.dupCleared = x.dupInv.no;
    x.dupInv = null;
    x.events.push(editEvent(`เคลียร์เลขบิลซ้ำ ${x.dupCleared} (ไม่แก้เลข)`, by));
    x.updatedAt = at;
    n++;
  }
  if (n) write();
  return n;
}

/** คนขับ: เลขบิลบนใบในมือหาในแอปไม่เจอ — แจ้งออฟฟิศ แล้วส่งของจุดนี้ต่อได้เลย */
export function reportBillNo(stopId, billNo, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  if (!x) throw new Error('ไม่พบจุดส่งนี้');
  const no = trim(billNo);
  if (!/^[0-9A-Za-z-]{4,}$/.test(no)) throw new Error('พิมพ์เลขบิลให้ครบ (ตัวเลขอย่างน้อย 4 หลัก)');
  const at = iso(Date.now());
  x.events.push({
    id: uid('ev'), status: EDITED, at, billNo: no,
    byRole: by.byRole || 'driver', byName: by.byName || '—', ...(by.byId ? { byId: by.byId } : {}),
    note: `แจ้งเลขบิลบนใบในมือ: ${no} (ในระบบเป็น ${x.code})`,
    photos: [], geo: null, signature: null, label: 'แจ้งเลขบิล',
  });
  x.updatedAt = at;
  write();
  return clone(x);
}

/** ออฟฟิศรับทราบที่คนขับแจ้ง โดยไม่เปลี่ยนเลข */
export function ackBillReport(stopId, by = {}){
  const db = read();
  const x = db.shipments.find(v => v.id === stopId);
  const ev = x && billReportOf(x);
  if (!ev) return false;
  x.billNoAck = ev.id;
  x.events.push(editEvent(`รับทราบเลขบิลที่คนขับแจ้ง (${ev.billNo}) — ไม่เปลี่ยนเลข`, by));
  x.updatedAt = iso(Date.now());
  write();
  return true;
}

/** ของที่ต้องเคลียร์ทั้งหมด — แถบแจ้งเตือนหน้า ops */
export function billWatch(){
  const db = read();
  const groups = new Map();
  const reports = [];
  for (const x of db.shipments){
    if (x.status === S.CANCELLED) continue;
    const d = dupOf(x);
    if (d){
      const k = `${d.day}|${d.no}`;
      if (!groups.has(k)) groups.set(k, { no: d.no, day: d.day, deliveries: d.deliveries, stops: [] });
      groups.get(k).stops.push(clone(x));
    }
    const ev = billReportOf(x);
    if (ev) reports.push({ stop: clone(x), ev: clone(ev) });
  }
  return { groups: [...groups.values()], reports };
}

/** งานเลข 5 จากการนำเข้าที่ไม่เหลือจุดส่งแล้ว (ถูกรวมเข้างาน Shipment No. ไปหมด) — ลบทิ้ง
 *  ไม่แตะงานที่มีค่ารอบ หรือเดินไปแล้ว หรือไม่ได้มาจากการนำเข้า
 *  @returns {number} จำนวนงานที่ลบ */
function pruneEmptyJobs(db){
  const used = new Set(db.shipments.map(v => v.jobId));
  const dead = db.jobs.filter(j =>
    !used.has(j.id) &&
    j.source?.salesNo &&                       /* งานที่หน้า customer สร้างตามเลข 5 เท่านั้น */
    j.status === S.NEW &&
    !(payTotal(j.pay) > 0));
  dead.forEach(j => db.jobs.splice(db.jobs.indexOf(j), 1));
  return dead.length;
}

/**
 * งานเลขเดียวกันซ้อนกันหลายงาน — เกิดได้ตอนเปิดหน้า ops หลายเครื่อง แล้ว sync ไฟล์ใหม่ในจังหวะเดียวกัน
 * (ต่างเครื่องต่างสร้างงาน Shipment No. เดียวกันก่อนจะเห็นของกันและกัน)
 * รวมเข้างานที่สร้างก่อนสุด — ทุกเครื่องเลือกงานเดียวกันเสมอ ผลจึงออกมาตรงกัน
 * ไม่แตะกลุ่มที่มีงานออกจากคลังไปแล้วหรือถูกยกเลิก ขึ้นเตือนให้แอดมินดูเอง
 */
function mergeDuplicateJobs(db, by = {}, warns = []){
  const groups = new Map();
  db.jobs.forEach(j => {
    const k = String(j.code || '').toUpperCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(j);
  });
  let merged = 0;
  for (const [, list] of groups){
    if (list.length < 2) continue;
    if (list.some(j => j.status === S.CANCELLED || stepIndex(j.status) >= stepIndex(S.DEPARTED))){
      warns.push(`งาน ${list[0].code} มีซ้ำ ${list.length} งาน แต่มีงานที่ออกจากคลังแล้ว — ไม่ได้รวมให้`);
      continue;
    }
    list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id));
    const keep = list[0];
    const at = iso(Date.now());
    for (const other of list.slice(1)){
      let seq = Math.max(0, ...db.shipments.filter(v => v.jobId === keep.id).map(v => v.seq || 0));
      db.shipments.filter(v => v.jobId === other.id).forEach(v => { v.jobId = keep.id; v.seq = ++seq; v.updatedAt = at; });
      keep.driverIds = [...new Set([...(keep.driverIds || []), ...(other.driverIds || [])])];
      keep.driverId = keep.driverId || keep.driverIds[0] || null;
      if (!isGroupJob(keep)) spreadCrew(db, keep);
      if (stepIndex(other.status) < stepIndex(keep.status)) keep.status = other.status;
      if (payTotal(other.pay) > 0){
        if (!(payTotal(keep.pay) > 0)) keep.pay = other.pay;
        else warns.push(`งาน ${keep.code} ซ้ำกันและมีค่ารอบทั้งสองงาน — ตรวจค่ารอบอีกที`);
      }
      keep.events.push(editEvent(`รวมงานซ้ำเลข ${keep.code} เข้าด้วยกัน`, by));
      keep.updatedAt = at;
      db.jobs.splice(db.jobs.indexOf(other), 1);
      merged++;
    }
  }
  return merged;
}

/** จัดงานให้เรียบร้อย — รวมงานเลขซ้ำ แล้วลบงานเลข 5 ที่ว่าง · หน้า ops เรียกตอนเปิดและก่อน sync ทุกรอบ */
export function tidyJobs(by = { byRole:'ops', byName:'ระบบ' }){
  const db = read();
  const warns = [];
  const merged = mergeDuplicateJobs(db, by, warns);
  const pruned = pruneEmptyJobs(db);
  /* คนขับเห็นจุดไม่ครบ — ซ่อมเฉพาะเครื่องพนักงานที่แก้งานได้ */
  const crews = isStaffSession() && canWrite() ? fixCrews(db, by) : 0;
  /* สถานะเที่ยวไม่ตรงบิล — บันทึกให้ตรง (เครื่องพนักงานเท่านั้น: กฎคนขับห้ามถอยสถานะ) */
  const settled = isStaffSession() && canWrite() ? settleJobs(db, by) : 0;
  if (merged || pruned || crews || settled){
    write();
    console.info(`[store] จัดงาน — รวมงานซ้ำ ${merged} · ลบงานเลข 5 ที่ว่าง ${pruned} · ซ่อมคนขับของงาน ${crews} · สถานะเที่ยวตามบิล ${settled}`);
  }
  return { merged, pruned, crews, settled, warns };
}

/** ของเดิม — เรียกต่อได้ */
export const cleanupEmptyJobs = () => { const r = tidyJobs(); return r.merged + r.pruned; };

/* ---------- คนในเที่ยวเห็นทุกจุดของเที่ยว (ผู้ใช้เลือก 27 ต.ค. 2026) ----------
   คนขับมือถืออ่านได้ทีละจุดส่ง (กฎ assignedTo ดู driverIds ของจุด) — ถ้าจุดไม่มีชื่อเขา งานในมือถือจะ "หาย" ทั้งที่หน้า ops เห็นครบ
   กติกา: งานปกติ/งานเลข 7 → ทุกจุดมี driverIds = คนขับของงาน · งานกลุ่ม (ชื่องาน = ชื่อกลุ่ม ยังไม่แยกเลข 7 · หลายคัน) ไม่แตะ
   คนขับของงานเลข 7 = เจ้าของจริงของจุดที่อยู่ในงาน ไม่ใช่คนขับทั้งกลุ่มเดิม (เดิม regroupStop รวมคนทั้งกลุ่ม → ทุกงานมีชื่อทุกคัน) */
const isGroupJob = (j) => !!j?.group && j.code === j.group;
/** เจ้าของจริงของจุดนี้ — แอดมินจ่ายงานเอง (ownDriverIds) › ชื่อในไฟล์ · จุดที่ไฟล์ไม่ระบุชื่อ (ได้คนขับทั้งกลุ่มมาตอนนำเข้า) = ไม่มีเจ้าของ */
function ownersOf(x){
  if (Array.isArray(x.ownDriverIds)) return x.ownDriverIds.slice();
  const ex = x.source?.excelDriverIds;
  if (Array.isArray(ex) && !ex.length) return [];
  return (x.driverIds || []).filter(Boolean);
}
const sameIds = (a, b) => (a || []).length === (b || []).length && (a || []).every(id => (b || []).includes(id));
/** ใส่คนขับของงานลงทุกจุดของงาน · คืนจำนวนจุดที่เปลี่ยน */
function spreadCrew(db, j){
  let n = 0;
  stopsOf(db, j.id).forEach(x => {
    if (x.status === S.CANCELLED || sameIds(x.driverIds, j.driverIds)) return;
    x.driverIds = (j.driverIds || []).slice();
    x.driverId = j.driverId || x.driverIds[0] || null;
    x.updatedAt = iso(Date.now());
    n++;
  });
  return n;
}

/** ซ่อมงานที่คนขับเห็นจุดไม่ครบ (หน้า ops เรียกผ่าน tidyJobs) — คนขับของงาน = เจ้าของจริงของทุกจุด แล้วใส่ลงทุกจุด
 *  ไม่ตัดคนที่มีค่ารอบในงานหรือเคยกดปิดจุดในงานแล้ว · ไม่มีจุดไหนมีเจ้าของ = ใช้คนขับของงานเดิม */
/** บันทึกสถานะเที่ยวให้ตรงบิลจริง (jobStatusOf) — ปิดเที่ยวที่ส่งครบ · เปิดเที่ยวที่มีบิลใหม่อีกครั้ง */
function settleJobs(db, by = {}){
  let n = 0;
  for (const j of db.jobs){
    const want = jobStatusOf(db, j);
    if (want === j.status) continue;
    const at = iso(Date.now());
    const note = want === S.DELIVERED ? 'ระบบปิดเที่ยว · ส่งครบทุกจุดแล้ว' : 'เปิดเที่ยวอีกครั้ง · มีบิลใหม่ที่ยังไม่ส่ง';
    j.status = want;
    j.updatedAt = at;
    j.events.push({
      id: uid('ev'), status: want, at, byRole: by.byRole || 'ops', byName: by.byName || 'ระบบ',
      note, photos: [], geo: null, signature: null, label: META[want].label,
    });
    n++;
  }
  return n;
}

function fixCrews(db, by = {}){
  let fixed = 0;
  for (const j of db.jobs){
    if (j.status === S.CANCELLED || isGroupJob(j)) continue;
    const stops = stopsOf(db, j.id).filter(x => x.status !== S.CANCELLED);
    if (!stops.length) continue;
    const own = [...new Set(stops.flatMap(ownersOf))];
    const keep = (j.driverIds || []).filter(id => !own.includes(id) && (
      Object.keys(j.pay?.drivers || {}).includes(id) ||
      stops.some(x => (x.events || []).some(e => e.status === S.DELIVERED && e.byId === id))));
    const crew = (own.length ? [...own, ...keep] : (j.driverIds || []).slice())
      .filter(id => db.drivers.some(d => d.id === id));
    const crewChanged = !sameIds(crew, j.driverIds);
    if (crewChanged){
      const nm = (ids) => ids.map(id => driverName(db.drivers.find(d => d.id === id))).filter(Boolean).join(' · ') || 'ยังไม่จ่ายงาน';
      j.events.push(editEvent(`คนขับของงาน: ${nm(j.driverIds || [])} → ${nm(crew)} (ตามคนขับของจุดส่งในงาน)`, by));
      j.driverIds = crew;
      j.driverId = crew.includes(j.driverId) ? j.driverId : (crew[0] || null);
      j.updatedAt = iso(Date.now());
    }
    const n = spreadCrew(db, j);
    if (crewChanged || n) fixed++;
  }
  return fixed;
}

/**
 * ย้ายจุดส่งไปอยู่ในงานของ Shipment No. (เลข 7) — งานที่ Shipment No. เดียวกันรวมเป็นงานเดียว
 * กติกา (ตกลงกับลูกค้าแล้ว)
 *   · ย้ายแม้งานออกจากคลังไปแล้ว (เปลี่ยน 24 ต.ค. 2569 — เดิมไม่ย้าย) · งานที่ยกเลิกแล้วไม่ย้าย ขึ้นเตือน
 *   · กลุ่มจัดส่งโดย (job.group) ตามจุดส่งไปที่งานเลข 7 — หน้า ops แสดงงานเลข 7 ใต้กลุ่มเดิม
 *   · สถานะไม่เท่ากัน → งานที่รวมใช้สถานะที่ช้ากว่า จุดส่งเก็บสถานะของตัวเอง (ไม่ดันขั้นให้เอง)
 *   · คนขับ: คนเดิมของงานปลายทาง + เจ้าของจริงของจุด แล้วใส่ลงทุกจุดของงาน (ทุกคนในเที่ยวเห็นทุกจุด)
 *   · ค่ารอบ: ไม่บวกให้เอง ถ้าสองฝั่งมีค่ารอบทั้งคู่ ขึ้นเตือน
 *   · งานต้นทางที่ไม่เหลือจุดส่งแล้ว ลบทิ้ง (ยกเว้นยังมีค่ารอบที่ย้ายไม่ได้ เก็บไว้ให้แอดมินดู)
 */
function regroupStop(db, x, ship, trip, by, out){
  const K = ship.toUpperCase();
  const from = db.jobs.find(j => j.id === x.jobId) || null;
  if (from && from.code.toUpperCase() === K) return;
  /* งานด่วนส่งไปก่อนแล้ว — กติกา "ออกจากคลังแล้วไม่ย้าย" ใช้ไม่ได้ เพราะงานด่วนออกไปก่อนเอกสารเสมอ */
  if (from && isRtCode(from.code)){ attachRtJob(db, from, ship, by); return; }
  let to = db.jobs.find(j => j.code.toUpperCase() === K) || null;

  const gone = (j) => j && j.status === S.CANCELLED;
  if (gone(from) || gone(to)){
    out.held.push({ stopId:x.id, code:x.code, ship,
      msg:`${gone(from) ? `งาน ${from.code}` : `งาน ${to.code}`} ถูกยกเลิกแล้ว — ไม่ได้ย้ายให้` });
    return;
  }
  const group = x.source?.tripGroup || from?.group || '';
  const at = iso(Date.now());
  /* สถานะไม่เท่ากัน (เช่น งานหนึ่งรับเข้าคลังแล้ว อีกงานยังไม่รับ) — งานที่รวมใช้สถานะที่ช้ากว่า
     ไม่ดันจุดส่งไหนให้ข้ามขั้นเอง จุดส่งแต่ละจุดเก็บสถานะของตัวเองไว้
     พอทีมคลังกดขั้นนั้นของงานอีกครั้ง ทุกจุดจะเดินไปพร้อมกัน */
  if (from && to && from.status !== to.status && stepIndex(from.status) < stepIndex(to.status)){
    const was = META[to.status].label, now = META[from.status].label;
    to.events.push(editEvent(`สถานะงานถอยเป็น "${now}" เพราะรวมจุดส่ง ${x.code} ที่ยังไม่ผ่านขั้น "${was}"`, by));
    to.status = from.status;
    out.warns.push(`งาน ${ship} กลับไปเป็น "${now}" — มีจุดส่งที่ยังไม่ผ่านขั้น "${was}" รวมเข้ามา กดขั้นนั้นใหม่อีกครั้ง`);
  }

  if (!to){
    to = {
      id: jobIdFor(db, ship), code: ship, group,
      vehicle: trip.vehicle || from?.vehicle || '', carrier: trip.carrier || from?.carrier || '',
      serviceDate: trip.serviceDate || from?.serviceDate || x.serviceDate,
      pickup: { name: from?.pickup?.name || db.settings.warehouse },
      driverId: null, driverIds: [],
      status: from?.status || S.NEW, createdAt: at, updatedAt: at,
      source: { kind:'sync', shipmentNo: ship },
      events: [{
        id: uid('ev'), status: S.NEW, at,
        byRole: by.byRole || 'ops', byName: by.byName || 'ทีมคลัง',
        note: `สร้างงานจาก Shipment No. ${ship} (ไฟล์อัพเดตเลขที่บิล)`,
        photos: [], geo: null, signature: null, label: META[S.NEW].label,
      }],
    };
    db.jobs.push(to);
  } else if (group && !to.group){
    to.group = group;
  } else if (group && to.group !== group){
    out.warns.push(`งาน ${ship} มีจุดส่งจากหลายกลุ่มจัดส่งโดย (${to.group} · ${group}) — แสดงใต้กลุ่ม ${to.group}`);
  }

  /* คนขับ: คนเดิมของงานปลายทาง + เจ้าของจริงของจุดนี้ — ไม่เอาคนขับทั้งงานต้นทาง (งานกลุ่มมีหลายคัน จะได้ชื่อทุกคันมาหมด)
     จุดที่ไฟล์ไม่ระบุชื่อ (ownersOf ว่าง) ใช้คนขับงานต้นทางเฉพาะตอนงานต้นทางไม่ใช่งานกลุ่ม */
  const own = ownersOf(x);
  const ids = [...new Set([...(to.driverIds || []), ...(own.length || isGroupJob(from) ? own : (from?.driverIds || []))])]
    .filter(id => db.drivers.some(d => d.id === id));
  to.driverIds = ids;
  to.driverId = to.driverId || ids[0] || null;

  const seq = Math.max(0, ...db.shipments.filter(v => v.jobId === to.id).map(v => v.seq || 0)) + 1;
  x.jobId = to.id;
  x.seq = seq;
  spreadCrew(db, to);                                   /* ทุกคนในงานเห็นทุกจุด */
  to.updatedAt = at;
  to.events.push(editEvent(`รวมจุดส่ง ${x.code} เข้างาน (มาจากงาน ${from?.code || '—'})`, by));
  out.moved.push({ stopId:x.id, code:x.code, from: from?.code || '', to: ship });

  if (!from) return;
  from.updatedAt = at;
  from.events.push(editEvent(`ย้ายจุดส่ง ${x.code} ไปงาน ${ship}`, by));
  const left = db.shipments.some(v => v.jobId === from.id);
  const fromPay = payTotal(from.pay) > 0;
  if (fromPay){
    if (!left && !(payTotal(to.pay) > 0)){
      to.pay = from.pay; from.pay = null;               /* งานเดิมหมดแล้ว ค่ารอบย้ายตามไปทั้งก้อน */
    } else {
      out.warns.push(`งาน ${from.code} มีค่ารอบใส่ไว้ — ตรวจค่ารอบของงาน ${ship} อีกที ระบบไม่ได้รวมให้`);
    }
  }
  if (!left && !(payTotal(from.pay) > 0)){
    db.jobs.splice(db.jobs.indexOf(from), 1);          /* งานว่างแล้ว ลบทิ้ง */
  }
}

/* ---------- บันทึกการแก้ไข -------------------------------- */
const trim = (v) => String(v ?? '').trim();

/** เหตุการณ์แก้ไขข้อมูล ใช้ทั้งตอนจ่ายงานใหม่และตอนแก้ใบงาน */
const editEvent = (note, by = {}) => ({
  id: uid('ev'), status: EDITED, at: iso(Date.now()),
  byRole: by.byRole || 'ops', byName: by.byName || 'ทีมคลัง',
  note, photos: [], geo: null, signature: null, label: META[EDITED].label,
});

/** "สมชาย พูลทรัพย์ · 70-8842 กทม." — ใช้ตอนเทียบว่าคนขับเปลี่ยนไปไหม */
const driverLabel = (db, id) => {
  const d = id ? db.drivers.find(x => x.id === id) : null;
  return d ? `${driverName(d)} · ${d.plate}` : 'ยังไม่จ่ายงาน';
};

/** ค่าที่ทีมคลังแก้ได้ทั้งหมด พร้อมชื่อไทย — เทียบก่อน/หลังเพื่อทำบันทึกการแก้ไข */
function snapshot(db, s){
  return {
    'ผู้ส่ง':            s.customer.name,
    'ผู้ติดต่อผู้ส่ง':    s.customer.contact,
    'เบอร์ผู้ส่ง':       s.customer.phone,
    'ปลายทาง':          s.dropoff.name,
    'ที่อยู่ปลายทาง':     s.dropoff.address,
    'ผู้รับปลายทาง':     s.dropoff.contact,
    'เบอร์ผู้รับ':       s.dropoff.phone,
    'สินค้า':            s.cargo.desc,
    'จำนวน':            qty(s.cargo),
    'น้ำหนัก':           `${fmtNum(s.cargo.weightKg)} กก.`,
    'หมายเหตุถึงคนขับ':  s.cargo.note,
    'วันที่ส่ง':          fmtDate(s.serviceDate),
    'เลขที่ใบแจ้งหนี้':   s.invoice.number,
    'มูลค่าสินค้า':       fmtBaht(s.invoice.amount),
    'ไฟล์ใบแจ้งหนี้':     s.invoice.fileName,
    'คนขับ':             driverLabel(db, s.driverId),
  };
}

/* ---------- จับคู่ชื่อคนขับจากไฟล์ Excel -------------------- */
/* ช่องคนขับแอดมินพิมพ์มาไม่แน่นอน บางทีเต็มยศ บางทีชื่อต้นอย่างเดียว
   จึงไล่เทียบจากเข้มไปหลวม แล้วหยุดทันทีที่เจอคนเดียว
   ถ้าเจอหลายคนคืน ambiguous ให้หน้าจอถามแทนที่จะเดาเอง */

/** ยุบช่องว่างซ้ำ — ชื่อไทยพิมพ์เว้นวรรคเกินได้ง่ายมาก */
export const normName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');

/** @returns {{status:'exact'|'first'|'prefix'|'partial'|'ambiguous'|'none'|'empty', driver?:object, matches:object[]}} */
export function matchDriverName(name){
  const q = normName(name).toLowerCase();
  if (!q) return { status:'empty', matches:[] };

  const pool = read().drivers.filter(isActiveDriver);
  const full = (d) => normName(d.name).toLowerCase();
  const first = (d) => full(d).split(' ')[0];

  const tries = [
    ['exact',   (d) => full(d) === q],
    ['first',   (d) => first(d) === q],
    ['prefix',  (d) => full(d).startsWith(q)],
    ['partial', (d) => full(d).includes(q)],
  ];
  for (const [status, test] of tries){
    const hit = pool.filter(test);
    if (hit.length === 1) return { status, driver: clone(hit[0]), matches: clone(hit) };
    if (hit.length > 1)   return { status:'ambiguous', matches: clone(hit) };
  }
  return { status:'none', matches:[] };
}

/* ---------- ค้นหาคนขับสำหรับช่องค้นหาในหน้าจอ ---------------
   ต่างจาก matchDriverName ตรงที่ตัวนั้นไว้เดาชื่อจากไฟล์ Excel แบบอัตโนมัติ
   ส่วนตัวนี้ไว้ให้คนพิมพ์หาเอง จึงต้องยืดหยุ่นกว่า
     · พิมพ์ชื่อ หรือนามสกุล อย่างเดียวก็เจอ
     · พิมพ์สลับลำดับก็เจอ ("แซ่ลิ้ม อนุชา")
     · หาได้จากทะเบียนรถ เบอร์โทร ชนิดรถ และหมายเหตุ เหมือนช่องค้นหาในหน้าข้อมูลคนขับ
     · เบอร์โทรพิมพ์ติดกันหรือมีขีดก็เจอเหมือนกัน
     · คนที่ปิดใช้งานอยู่ก็คืนมาด้วย ให้หน้าจอตัดสินใจเองว่าจะแสดงยังไง
                                    (ซ่อนเงียบ ๆ แล้วคนใช้หาไม่เจอ งงกว่า) */

const TITLE_RE = /^(นาย|นางสาว|นาง|น\.ส\.|คุณ|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?)\s*/i;
const stripTitle = (v) => normName(v).replace(TITLE_RE, '');
const digits = (v) => String(v ?? '').replace(/\D/g, '');

/**
 * ค้นหาคนขับจากคำที่พิมพ์ — เรียงคนที่ตรงที่สุดขึ้นก่อน
 * @param {string} query คำค้น เว้นวรรคได้หลายคำ ทุกคำต้องตรง
 * @param {{includeInactive?:boolean}} opts includeInactive:false = เอาเฉพาะคนที่ยังรับงานได้
 * @returns {object[]} คนขับที่ตรง (สำเนา ไม่ใช่ตัวจริงในคลัง)
 */
export function searchDrivers(query, { includeInactive = true } = {}){
  const terms = stripTitle(query).toLowerCase().split(' ').filter(Boolean);
  const pool = read().drivers.filter(d => includeInactive || isActiveDriver(d));

  const ranked = [];
  for (const d of pool){
    const nameWords = stripTitle(d.name).toLowerCase().split(' ').filter(Boolean);
    const others    = [d.plate, d.phone, d.truck, d.note].map(v => normName(v).toLowerCase());
    const numbers   = [digits(d.phone), digits(d.plate)].filter(Boolean);

    let score = isActiveDriver(d) ? 0.5 : 0;   /* คนที่ใช้งานอยู่ขึ้นก่อนเมื่อคะแนนเท่ากัน */
    let ok = true;

    for (const t of terms){
      const num = digits(t);
      if (nameWords.some(w => w === t))            score += 3;   /* ตรงทั้งคำ ชื่อหรือนามสกุล */
      else if (nameWords.some(w => w.startsWith(t))) score += 2; /* ขึ้นต้นคำ */
      else if (nameWords.join(' ').includes(t))      score += 1;  /* อยู่กลางชื่อ */
      else if (others.some(v => v.includes(t)))      score += 1;  /* ทะเบียน เบอร์ ชนิดรถ หมายเหตุ */
      else if (num && numbers.some(v => v.includes(num))) score += 1;
      else { ok = false; break; }
    }

    if (ok) ranked.push({ d, score });
  }

  ranked.sort((a, b) => b.score - a.score || String(a.d.name).localeCompare(String(b.d.name), 'th'));
  return clone(ranked.map(x => x.d));
}

/** เลขงานนี้มีในระบบแล้วหรือยัง — ใช้กันนำเข้าซ้ำตอนอัปไฟล์เดิมซ้ำรอบสอง */
export const codeExists = (code) => {
  const k = String(code ?? '').trim().toUpperCase();
  return !!k && read().shipments.some(s => s.code.toUpperCase() === k);
};

/* ---------- ทะเบียนคนขับและรถ ------------------------------ */
/** เทียบทะเบียนแบบไม่สนช่องว่างและตัวพิมพ์ ใช้กันคีย์ซ้ำ */
const normPlate = (v) => trim(v).replace(/\s+/g, ' ').toLowerCase();

/** ตรวจและทำความสะอาดข้อมูลคนขับก่อนเขียน */
function cleanDriver(db, p, selfId = null){
  const name = trim(p.name);
  const plate = trim(p.plate);
  const pin = trim(p.pin);
  if (!name)  throw new Error('กรอกชื่อคนขับ');
  /* ปกติทะเบียนรถบังคับกรอก ยกเว้นตอนดึงจาก Google Sheet ที่ช่องทะเบียนยังว่างได้
     (ส่ง plateRequired:false มา) — ไม่งั้นซิงก์ทีเดียวพังทั้งชีต */
  if (!plate && p.plateRequired !== false) throw new Error('กรอกทะเบียนรถ');
  if (pin && !/^\d{4,6}$/.test(pin)) throw new Error('PIN ต้องเป็นตัวเลข 4–6 หลัก');
  /* ทะเบียนว่างไม่นับว่าซ้ำกัน ไม่งั้นคนที่ยังไม่กรอกทะเบียนจะชนกันเองหมด */
  if (plate && db.drivers.some(d => d.id !== selfId && normPlate(d.plate) === normPlate(plate))){
    throw new Error(`ทะเบียน "${plate}" ถูกใช้กับคนขับคนอื่นแล้ว`);
  }
  return {
    name, plate,
    phone: trim(p.phone), truck: trim(p.truck),
    /* PIN อยู่ในเครื่องอย่างเดียว (ไม่ขึ้นฐานข้อมูล — cloud.js) ว่าง = ไม่เปลี่ยนรหัสในชีต
       ห้ามเติม 1234 ตรงนี้: เครื่องที่ไม่มี PIN แล้วกดแก้ข้อมูลอื่น จะรีเซ็ตรหัสจริงของคนขับในชีตเป็น 1234 */
    pin, note: trim(p.note),
    /* เลขที่บัญชี/ธนาคาร — อยู่ในเครื่องกับชีต (ช่อง F/G) เท่านั้น ไม่ขึ้นฐานข้อมูล (cloud.js) */
    bankAccount: trim(p.bankAccount), bankName: trim(p.bankName),
    /* ID ของแถวในชีต (ช่อง A) — ใช้จับคู่ว่าคนนี้คือแถวไหน ตอนซิงก์รอบถัดไป */
    sheetId: trim(p.sheetId),
    /* รถประจำ / รถนอก — ช่อง H ในชีต · ค่าอื่นหรือว่าง = รถประจำ */
    fleet: p.fleet === FLEET_OUT ? FLEET_OUT : FLEET_OWN,
    /* ประเภทน้ำมัน — ช่อง I ในชีต (พิมพ์อิสระ เช่น ดีเซล) เก็บไว้ดู (ค่ารอบอัตโนมัติเอาออกแล้ว) */
    fuelType: trim(p.fuelType),
  };
}

/** เพิ่มคนขับใหม่ */
export function createDriver(p = {}){
  const db = read();
  const d = { id: uid('drv'), ...cleanDriver(db, p), active: p.active !== false };
  if (!d.pin) d.pin = '1234';       /* คนใหม่ — รหัสตั้งต้นที่ส่งขึ้นชีต */
  db.drivers.push(d);
  write();
  return clone(d);
}

/** แก้ไขข้อมูลคนขับ — ฟิลด์ไหนไม่ส่งมา = ใช้ค่าเดิม */
export function updateDriver(id, p = {}){
  const db = read();
  const d = db.drivers.find(x => x.id === id);
  if (!d) throw new Error('ไม่พบคนขับคนนี้');
  Object.assign(d, cleanDriver(db, { ...d, ...p }, id));
  if (p.active !== undefined) d.active = !!p.active;
  write();
  return clone(d);
}

/**
 * เปิด/ปิดการใช้งานคนขับ — ปิดแล้วจะไม่ขึ้นในรายการจ่ายงานและหน้าล็อกอินคนขับ
 * แต่ประวัติงานเดิมยังอยู่ครบ
 */
export function setDriverActive(id, active){
  const db = read();
  const d = db.drivers.find(x => x.id === id);
  if (!d) throw new Error('ไม่พบคนขับคนนี้');
  if (!active){
    const open = db.shipments.filter(s => hasDriver(s, id) && isOpen(s.status)).length;
    if (open) throw new Error(`ปิดใช้งานไม่ได้ — ยังมีงานค้างอยู่ ${open} ใบ ย้ายงานให้คนขับคนอื่นก่อน`);
  }
  d.active = !!active;
  write();
  return clone(d);
}

/** ลบคนขับถาวร — ทำได้เฉพาะคนที่ไม่เคยมีงานผูกอยู่ ไม่งั้นประวัติจะขาด */
export function deleteDriver(id){
  const db = read();
  const i = db.drivers.findIndex(x => x.id === id);
  if (i < 0) throw new Error('ไม่พบคนขับคนนี้');
  const used = db.shipments.filter(s => hasDriver(s, id)).length;
  if (used) throw new Error(`ลบไม่ได้ — มีใบงานผูกอยู่ ${used} ใบ ใช้ "ปิดใช้งาน" แทนเพื่อเก็บประวัติไว้`);
  const [d] = db.drivers.splice(i, 1);
  write();
  return clone(d);
}

/* ---------- คนขับภายนอก (ลิงก์เฉพาะกิจ) ---------------------
   บางงานบริษัทต้องจ้างคนขับนอก ซึ่งไม่มีบัญชีและไม่มีประวัติในระบบ
   จึงออก "ลิงก์" ให้ 1 ลิงก์ต่อคนขับ 1 คน (ถืองานได้หลายใบ)
   ใครถือลิงก์จะเห็นเฉพาะงานที่ผูกกับลิงก์นั้น และทำได้แค่ขั้นของคนขับ
   ลิงก์ใช้ได้จนกว่าทีมคลังจะกดปิดเอง ---------------------------- */
export const isExternal = (d) => !!d && d.external === true;

/* ---------- ประเภทคนขับ: รถประจำ / รถนอก ----------------------
   ตั้งที่ฟอร์มหน้าข้อมูลคนขับ (ช่อง H ในชีต) · คนขับภายนอกแบบลิงก์นับเป็นรถนอกเสมอ */
export const FLEET_OWN = 'รถประจำ';
export const FLEET_OUT = 'รถนอก';
export const FLEETS = [FLEET_OWN, FLEET_OUT];
export const driverFleet = (d) => (isExternal(d) || d?.fleet === FLEET_OUT) ? FLEET_OUT : FLEET_OWN;
/** "สมชาย พูลทรัพย์ (รถประจำ)" — ใช้ทุกที่ที่แสดงชื่อคนขับ (ห้ามใช้ตอนจับคู่ชื่อ) */
export const driverName = (d) => d ? `${d.name} (${driverFleet(d)})` : '';

/** ลิงก์ยังเปิดให้ใช้อยู่หรือไม่ */
export const isLinkOpen = (d) => isExternal(d) && d.linkActive !== false;

function randToken(){
  const a = new Uint8Array(12);
  if (globalThis.crypto?.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  return [...a].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 18);
}

/** สร้างคนขับภายนอกพร้อมลิงก์เฉพาะของคนคนนั้น */
export function createExternalDriver(p = {}){
  const db = read();
  const name  = trim(p.name);
  const phone = trim(p.phone);
  const plate = trim(p.plate);
  if (!name)  throw new Error('กรอกชื่อคนขับ');
  if (!phone) throw new Error('กรอกเบอร์โทรคนขับ');
  if (!plate) throw new Error('กรอกทะเบียนรถ');
  const dup = db.drivers.find(d => normPlate(d.plate) === normPlate(plate));
  if (dup) throw new Error(`ทะเบียน "${plate}" ถูกใช้กับ ${dup.name} แล้ว — เลือกจากรายการแทนการสร้างใหม่`);

  let token;
  do { token = randToken(); } while (db.drivers.some(d => d.token === token));

  const d = {
    id: uid('ext'), name, phone, plate,
    truck: trim(p.truck) || 'รถภายนอก',
    pin: '', note: trim(p.note), active: true,
    external: true, token, linkActive: true, createdAt: iso(Date.now()),
  };
  db.drivers.push(d);
  write();
  return clone(d);
}

/** หาคนขับภายนอกจาก token ที่ติดมากับลิงก์ */
export function getDriverByToken(token){
  const t = trim(token);
  if (!t) return null;
  return clone(read().drivers.find(d => isExternal(d) && d.token === t) || null);
}

/** เปิด/ปิดลิงก์ — ปิดแล้วเปิดลิงก์ไม่ได้ และไม่ขึ้นในรายการจ่ายงาน แต่ประวัติยังอยู่ครบ
 *  ปิดได้ทันทีแม้ยังมีงานค้าง เพราะกรณีลิงก์หลุดต้องตัดสิทธิ์ให้ทัน
 *  (ทีมคลังค่อยย้ายงานที่ค้างให้คนขับคนอื่นทีหลัง) */
export function setLinkActive(id, active){
  const db = read();
  const d = db.drivers.find(x => x.id === id);
  if (!isExternal(d)) throw new Error('ไม่พบคนขับภายนอกคนนี้');
  d.linkActive = !!active;
  d.active = !!active;
  write();
  return clone(d);
}

/* ---------- จ่ายงาน ---------------------------------------- */
/** จ่ายงานให้คนขับ (ทีมคลัง) */
export function assignDriver(id, driverId, by = {}){
  const db = read();
  const s = db.shipments.find(x => x.id === id);
  if (!s) throw new Error('ไม่พบงานขนส่งนี้');
  if (driverId){
    const d = db.drivers.find(x => x.id === driverId);
    if (!d) throw new Error('ไม่พบคนขับคนนี้');
    if (!isActiveDriver(d) && d.id !== s.driverId) throw new Error(`${d.name} ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าข้อมูลคนขับก่อน`);
  }

  const from = driverLabel(db, s.driverId);
  const to   = driverLabel(db, driverId || null);
  s.driverId = driverId || null;
  s.updatedAt = iso(Date.now());
  if (from !== to) s.events.push(editEvent(`คนขับ: ${from} → ${to}`, by));
  write();
  return clone(s);
}

/**
 * แก้ไขข้อมูลใบงานหลังสร้างแล้ว (ทีมคลัง)
 * ใช้ตอนใบแจ้งหนี้ตามมาทีหลัง เปลี่ยนคนขับ หรือลูกค้าแจ้งแก้ปลายทาง
 * ทุกครั้งที่แก้จะบันทึกลงไทม์ไลน์ว่าใครแก้อะไรจากอะไรเป็นอะไร
 *
 * @param {string} id
 * @param {object} patch  ฟิลด์ไหนไม่ส่งมา = ไม่แตะ ({invoice:{number,amount,file}, cargo, dropoff, customer, serviceDate, driverId})
 * @param {{byRole?:string, byName?:string, note?:string}} by
 * @returns {{shipment:object, changes:string[]}} changes ว่าง = ไม่มีอะไรเปลี่ยน (ไม่เขียนข้อมูล)
 */
export function updateShipment(id, patch = {}, by = {}){
  const db = read();
  const s = db.shipments.find(x => x.id === id);
  if (!s) throw new Error('ไม่พบงานขนส่งนี้');
  if (s.status === S.CANCELLED) throw new Error('งานนี้ถูกยกเลิกแล้ว แก้ไขข้อมูลไม่ได้');

  /* ตรวจให้ครบก่อนแตะข้อมูลจริง — กันเคสแก้ไปครึ่งทางแล้วค่อย throw */
  const need = (next, cur, msg) => { if (!(next === undefined ? trim(cur) : trim(next))) throw new Error(msg); };
  need(patch.customer?.name,   s.customer.name,   'ชื่อผู้ส่งห้ามว่าง');
  need(patch.dropoff?.name,    s.dropoff.name,    'ชื่อปลายทางห้ามว่าง');
  need(patch.dropoff?.address, s.dropoff.address, 'ที่อยู่ปลายทางห้ามว่าง');
  need(patch.cargo?.desc,      s.cargo.desc,      'รายละเอียดสินค้าห้ามว่าง');
  /* งานด่วนยังไม่มีเลข Invoice ได้ — เลขกรอกผ่าน setRtNumbers */
  if (!s.realtime) need(patch.invoice?.number, s.invoice.number, 'เลขที่ใบแจ้งหนี้ห้ามว่าง');
  if (patch.driverId){
    const d = db.drivers.find(x => x.id === patch.driverId);
    if (!d) throw new Error('ไม่พบคนขับคนนี้');
    if (!isActiveDriver(d) && d.id !== s.driverId) throw new Error(`${d.name} ถูกปิดใช้งานอยู่ — เปิดใช้งานที่หน้าข้อมูลคนขับก่อน`);
  }

  const before = snapshot(db, s);
  const put = (obj, key, v, cast = trim) => { if (v !== undefined) obj[key] = cast(v); };
  const num = (v) => Number(v) || 0;

  if (patch.customer){
    put(s.customer, 'name',    patch.customer.name);
    put(s.customer, 'contact', patch.customer.contact);
    put(s.customer, 'phone',   patch.customer.phone);
  }
  if (patch.dropoff){
    put(s.dropoff, 'name',    patch.dropoff.name);
    put(s.dropoff, 'address', patch.dropoff.address);
    put(s.dropoff, 'contact', patch.dropoff.contact);
    put(s.dropoff, 'phone',   patch.dropoff.phone);
  }
  if (patch.cargo){
    put(s.cargo, 'desc',     patch.cargo.desc);
    put(s.cargo, 'pieces',   patch.cargo.pieces,   num);
    put(s.cargo, 'unit',     patch.cargo.unit,     v => trim(v).slice(0, 20) || DEFAULT_UNIT);
    put(s.cargo, 'weightKg', patch.cargo.weightKg, num);
    put(s.cargo, 'note',     patch.cargo.note);
  }
  if (patch.invoice){
    put(s.invoice, 'number', patch.invoice.number);
    put(s.invoice, 'amount', patch.invoice.amount, num);
    /* file: object = ไฟล์ใหม่ · null = เอาไฟล์ออก · undefined = ไม่แตะ */
    if (patch.invoice.file !== undefined){
      const f = patch.invoice.file;
      s.invoice.fileName = f?.fileName || '';
      s.invoice.kind     = f?.kind || '';
      s.invoice.dataUrl  = f?.dataUrl || null;
    }
  }
  if (trim(patch.serviceDate)) s.serviceDate = trim(patch.serviceDate);
  if (patch.driverId !== undefined) s.driverId = patch.driverId || null;

  const after = snapshot(db, s);
  const changes = Object.keys(after)
    .filter(k => after[k] !== before[k])
    .map(k => `${k}: ${before[k] || '—'} → ${after[k] || '—'}`);

  if (!changes.length) return { shipment: clone(s), changes };

  s.updatedAt = iso(Date.now());
  s.events.push(editEvent(
    [trim(by.note), changes.join(' · ')].filter(Boolean).join(' — '),
    by,
  ));
  write();
  return { shipment: clone(s), changes };
}

/**
 * เดินสถานะไปขั้นถัดไป — จุดควบคุมความถูกต้องของทั้งระบบ
 * @param {string} id
 * @param {string} to  สถานะปลายทาง (ต้องเป็นขั้นถัดไปเท่านั้น)
 * @param {{byRole?:string, byName?:string, note?:string, photos?:string[], geo?:object, signature?:string}} by
 */
/**
 * แอดมินแก้รูปหลักฐานของเหตุการณ์ที่คนขับลงไว้แล้ว (REQ-02)
 * ใช้ตอนรูปเบลอ ถ่ายผิดใบ หรือคนขับเน็ตหลุดแล้วส่งรูปตามมาทาง LINE
 *
 * ยังคงเพดานล่างของขั้นที่บังคับไว้ (MIN_PHOTOS_BY) — แอดมินสลับหรือเพิ่มรูปได้
 * แต่ลบจนต่ำกว่าขั้นต่ำไม่ได้ ไม่งั้นกฎหลักฐานที่บังคับคนขับไว้จะไร้ความหมาย
 *
 * ตัวตรวจกฎอยู่ใน applyPhotoEdit ตัวเดียว เพราะรูปหลักฐานอยู่ได้สองที่:
 *   · ขั้น "ขึ้นรถแล้ว" ถ่ายครั้งเดียวต่อเที่ยว → อยู่ในไทม์ไลน์ของ "เที่ยว"
 *   · ขั้น "ส่งมอบสำเร็จ" ถ่ายรายจุด           → อยู่ในไทม์ไลน์ของ "จุดส่ง"
 * ถ้าแยกโค้ดสองชุดเมื่อไหร่ กฎขั้นต่ำจะเพี้ยนคนละทางแน่นอน
 *
 * @returns {boolean} true = มีรูปเปลี่ยนจริง
 */
function applyPhotoEdit(holder, eventId, photos, by = {}, field = 'photos'){
  const ev = (holder.events || []).find(e => e.id === eventId);
  if (!ev) throw new Error('ไม่พบเหตุการณ์นี้ในไทม์ไลน์');

  const next = (photos || []).filter(Boolean);
  /* field = 'invoicePhotos' → รูปบิล/ใบ Invoice ของขั้นส่งมอบ (แยกช่องจากรูปสินค้า · ไม่มีขั้นต่ำ) */
  const inv = field === 'invoicePhotos';
  const label = inv ? 'รูปบิล/ใบ Invoice' : META[ev.status]?.label || ev.status;

  if (!inv && NEEDS_PHOTO.has(ev.status) && next.length < minPhotos(ev.status)){
    throw new Error(`ขั้น "${label}" ต้องมีรูปอย่างน้อย ${minPhotos(ev.status)} รูป — ตอนนี้เหลือ ${next.length} รูป`);
  }

  const prev = ev[field] || [];
  const before = prev.length;
  const same = before === next.length && prev.every((p, i) => p === next[i]);
  if (same) return false;

  const added   = next.filter(p => !prev.includes(p)).length;
  const removed = prev.filter(p => !next.includes(p)).length;

  ev[field] = next;
  ev.photoEditedAt = iso(Date.now());
  ev.photoEditedBy = by.byName || 'ทีมคลัง';
  holder.updatedAt = iso(Date.now());

  const bits = [];
  if (added) bits.push(`เพิ่ม ${added} รูป`);
  if (removed) bits.push(`ลบ ${removed} รูป`);
  holder.events.push(editEvent(
    `${inv ? label : `รูปหลักฐานขั้น "${label}"`}: ${bits.join(' · ')} (${before} → ${next.length} รูป)`, by));
  return true;
}

/** แก้รูปในไทม์ไลน์ของ "จุดส่ง" — ใช้กับรูปตอนส่งมอบ (field 'photos') และรูปบิล (field 'invoicePhotos') */
export function updateEventPhotos(id, eventId, photos, by = {}, field = 'photos'){
  const db = read();
  const s = db.shipments.find(x => x.id === id);
  if (!s) throw new Error('ไม่พบงานขนส่งนี้');
  const changed = applyPhotoEdit(s, eventId, photos, by, field);
  if (changed) write();
  return { shipment: clone(s), changed };
}

/** แก้รูปในไทม์ไลน์ของ "เที่ยว" — ใช้กับรูปตอนขึ้นรถ ซึ่งถ่ายครั้งเดียวทั้งเที่ยว
 *  จึงไม่ได้อยู่ในใบจุดส่งใบไหนเลย หน้าต่างแก้ใบงานเดิมจึงมองไม่เห็น */
export function updateJobEventPhotos(jobId, eventId, photos, by = {}){
  const db = read();
  const j = db.jobs.find(x => x.id === jobId);
  if (!j) throw new Error('ไม่พบเที่ยวนี้');
  const changed = applyPhotoEdit(j, eventId, photos, by);
  if (changed) write();
  return { job: withRollup(db, j), changed };
}

/** ทางเข้าเดิมของหน้าจอ — ส่งต่อให้ชั้นที่ถูกต้องแทนการเดินสถานะรายใบเอง
 *  ปิดจุด → deliverStop · ขั้นของทั้งเที่ยว → advanceJob */
export function advance(id, to, by = {}){
  const db0 = read();
  const sh = db0.shipments.find(x => x.id === id);
  if (sh?.jobId){
    if (to === S.DELIVERED) return deliverStop(id, by);
    const j = db0.jobs.find(v => v.id === sh.jobId);
    if (j) return advanceJob(j.id, to, by);
  }
  return advanceLegacy(id, to, by);
}

function advanceLegacy(id, to, by = {}){
  const db = read();
  const s = db.shipments.find(x => x.id === id);
  if (!s) throw new Error('ไม่พบงานขนส่งนี้');
  if (s.status === S.CANCELLED) throw new Error('งานนี้ถูกยกเลิกแล้ว');

  const want = nextOf(s.status);
  if (!want) throw new Error('งานนี้ปิดแล้ว ไม่มีขั้นตอนถัดไป');
  if (to && to !== want) throw new Error(`ข้ามขั้นไม่ได้ — ขั้นถัดไปคือ "${META[want].label}"`);

  const photos = (by.photos || []).filter(Boolean);
  const invoicePhotos = (by.invoicePhotos || []).filter(Boolean);
  const free = standInBy(by);   /* ทีมคลังยืนยันแทนคนขับ — หลักฐานหน้างานไม่บังคับ */
  if (!free && NEEDS_PHOTO.has(want) && photos.length < minPhotos(want)){
    throw new Error(`ขั้นตอนนี้ต้องแนบรูปอย่างน้อย ${minPhotos(want)} รูป (ตอนนี้มี ${photos.length} รูป)`);
  }
  if (!free && want === S.DELIVERED && invoicePhotos.length < MIN_INVOICE_PHOTOS){
    throw new Error(`ต้องแนบรูปเลขที่บิล อย่างน้อย ${MIN_INVOICE_PHOTOS} รูป (ตอนนี้มี ${invoicePhotos.length} รูป)`);
  }
  if (!free && NEEDS_GEO.has(want) && !validGeo(by.geo)) throw new Error('ขั้นตอนนี้ต้องแนบพิกัดจุดส่งจากเครื่องคนขับ');
  if (!free && NEEDS_SIGN.has(want) && !validSign(by.signature)) throw new Error('ขั้นตอนนี้ต้องให้ผู้รับเซ็นชื่อก่อน');
  if (want !== S.RECEIVED && want !== S.NEW && !s.driverId) throw new Error('ต้องจ่ายงานให้คนขับก่อน');

  const at = iso(Date.now());
  s.status = want;
  s.updatedAt = at;
  s.events.push({
    id: uid('ev'), status: want, at,
    byRole: by.byRole || 'ops', byName: by.byName || '—',
    note: by.note || '', photos, ...(invoicePhotos.length ? { invoicePhotos } : {}), geo: validGeo(by.geo) ? by.geo : null,
    signature: by.signature || null, label: META[want].label, ...(free ? { standIn: true } : {}),
  });
  write();
  return clone(s);
}

/* force: แอดมินลบเที่ยวในหน้าต่างเที่ยว (ops.js tripCancelDialog) — ยกเลิกบิลที่ส่งมอบแล้วได้ด้วย (ผู้ใช้ขอ 31 ต.ค.)
   และติด masterPurge → Apps Script ลบแถวของบิลนี้ในชีต Master (AppsScript-master.gs appDeletes_) */
export function cancelShipment(id, reason, by = {}, { force = false } = {}){
  const db = read();
  const s = db.shipments.find(x => x.id === id);
  if (!s) throw new Error('ไม่พบงานขนส่งนี้');
  if (s.status === S.CANCELLED) throw new Error('งานนี้ถูกยกเลิกไปแล้ว');
  if (s.status === S.DELIVERED && !force) throw new Error('งานที่ส่งมอบแล้ว ยกเลิกไม่ได้');
  const at = iso(Date.now());
  s.status = S.CANCELLED;
  if (force) s.masterPurge = true;
  s.updatedAt = at;
  s.events.push({
    id: uid('ev'), status:S.CANCELLED, at, byRole:by.byRole || 'ops', byName:by.byName || 'ทีมคลัง',
    note: reason || '', photos:[], geo:null, signature:null, label:META[S.CANCELLED].label,
  });
  write();
  return clone(s);
}

/* ---------- ลบงานออกจากแอปถาวร (31 ต.ค. — ผู้ใช้สั่ง "ไม่ต้องเหลือไว้") ----------
   ลำดับ: แอดมินกดลบ → cancelShipment(force) ติด masterPurge → ส่งขึ้นคลาวด์ → Apps Script ลบแถวในชีต Master
   (Apps Script อ่านป้ายจาก Firestore จึงต้องลบแถวก่อน) → สำเร็จแล้วค่อยเรียกตัวนี้ลบเอกสารจริง
   ลบเฉพาะจุดส่งที่ยกเลิกด้วยปุ่มลบงาน (masterPurge) · เที่ยวที่ไม่เหลือจุดส่งลบตาม
   ตามลบด้วย: สำเนาหน้าติดตาม (ซิงก์ลบให้เอง) · เลขค้นหาที่ไม่มีใบอื่นใช้ · รูปใน Storage ที่ไม่มีใบอื่นใช้ */
/** จุดส่งที่รอลบถาวร (ยกเลิกด้วยปุ่มลบงานแล้ว) — หน้า ops ใช้เก็บกวาดของค้าง */
export const purgePending = () => read().shipments.filter(x => x.status === S.CANCELLED && x.masterPurge).map(clone);

export function purgeStops(ids = []){
  if (!(isStaffSession() && canWrite())) throw new Error('ลบงานได้เฉพาะพนักงานที่มีสิทธิ์แก้ไข');
  const db = read();
  const want = new Set(ids);
  const gone = db.shipments.filter(x => want.has(x.id) && x.status === S.CANCELLED && x.masterPurge);
  if (!gone.length) return { stops: 0, jobs: 0 };
  const goneIds = new Set(gone.map(x => x.id));
  const jobIds = new Set(gone.map(x => x.jobId).filter(Boolean));
  const left = db.shipments.filter(x => !goneIds.has(x.id));
  const deadJobs = db.jobs.filter(j => jobIds.has(j.id) && !left.some(x => x.jobId === j.id));
  const deadJobIds = new Set(deadJobs.map(j => j.id));

  const urlsOf = (rows) => new Set((JSON.stringify(rows).match(/https:\/\/firebasestorage\.googleapis\.com[^"\\]+/g) || [])
    .filter(u => u.includes('/o/evidence%2F')));
  const keep = urlsOf([left, db.jobs.filter(j => !deadJobIds.has(j.id))]);
  const photos = [...urlsOf([gone, deadJobs])].filter(u => !keep.has(u));
  const keepKeys = new Set(left.flatMap(trackKeysOf));
  const keys = [...new Set(gone.flatMap(trackKeysOf))].filter(k => !keepKeys.has(k));

  db.shipments = left;
  db.jobs = db.jobs.filter(j => !deadJobIds.has(j.id));
  write();
  if (cloudReady()){
    if (photos.length) removePhotos(photos).then(n => console.info(`[store] ลบรูปของงานที่ลบแล้ว ${n}/${photos.length}`)).catch(() => {});
    if (keys.length) removeDocs('trackKeys', keys).catch(() => {});
  }
  return { stops: gone.length, jobs: deadJobs.length, photos: photos.length };
}

/* ============================================================
   ย้ายรูป base64 ขึ้น Storage (เครื่องมือครั้งเดียว)

   รูปที่ถ่ายตอน Storage ใช้ไม่ได้จะตกมาเก็บเป็น base64 ในฐานข้อมูลแทน
   (`cloud.js` ออกแบบให้ถอยแบบนั้นเพื่อไม่ให้หลักฐานหาย) พอคลาวด์กลับมา
   ระบบไม่ย้อนอัปให้เอง รูปชุดนั้นจึงค้างอยู่ในเครื่องตลอดไป —
   เครื่องแอดมินมองไม่เห็น และ localStorage มีเพดานไม่กี่ MB

   ตัวนี้ไล่หารูป base64 ทั้งฐาน อัปขึ้น Storage แล้วเขียน URL ทับ
   ============================================================ */

/** ที่อยู่ของรูปหนึ่งใบในฐานข้อมูล — ใช้ทั้งตอนสแกนและตอนย้าย */
function photoSlots(db){
  const out = [];
  const walk = (coll, row, kind) => {
    (row.events || []).forEach(ev => {
      for (const field of ['photos', 'invoicePhotos']){
        (ev[field] || []).forEach((p, i) => {
          if (isLocalPhoto(p)) out.push({ coll, docId:row.id, code:row.code, kind,
            eventId:ev.id, status:ev.status, field, index:i, bytes:p.length, src:p });
        });
      }
      if (isLocalPhoto(ev.signature)) out.push({ coll, docId:row.id, code:row.code, kind,
        eventId:ev.id, status:ev.status, field:'signature', index:-1, bytes:ev.signature.length, src:ev.signature });
    });
  };
  (db.jobs || []).forEach(j => walk('jobs', j, 'เที่ยว'));
  (db.shipments || []).forEach(x => {
    walk('shipments', x, 'จุดส่ง');
    /* รูปหลักฐานชำระเงิน + รูปเอกสาร Inv. ที่คืน (หน้าผู้ช่วยคนขับ) — อัปไม่ผ่านตอนบันทึกก็ค้างเป็น base64 แบบเดียวกัน */
    for (const [field, list] of Object.entries(REC_LISTS)){
      (x[list] || []).forEach(rec => {
        (rec.photos || []).forEach((p, i) => {
          if (isLocalPhoto(p)) out.push({ coll:'shipments', docId:x.id, code:x.code, kind:'จุดส่ง',
            recId:rec.id, round:rec.round, status:field, field, index:i, bytes:p.length, src:p });
        });
      });
    }
  });
  return out;
}

/** สแกนอย่างเดียว ไม่แก้อะไรเลย — ใช้ดูก่อนตัดสินใจย้าย
 *  @returns {{items:object[], total:number, bytes:number, invoices:number}} */
export function scanLocalPhotos(){
  const db = read();
  const items = photoSlots(db);
  /* ไฟล์ใบแจ้งหนี้ก็เป็น base64 เหมือนกัน แต่เป็น PDF ได้ด้วย
     ซึ่ง storage.rules ปฏิเสธ (อนุญาตเฉพาะ image/*) จึงแค่นับไว้ให้รู้ ไม่ย้าย */
  const invoices = (db.shipments || []).filter(x => isLocalPhoto(x.invoice?.dataUrl)).length;
  return {
    items,
    total: items.length,
    bytes: items.reduce((a, x) => a + x.bytes, 0),
    invoices,
  };
}

/** รายการบันทึกที่มีรูปของตัวเอง (ไม่ได้อยู่ใน events) — ชื่อช่อง slot.field → ชื่อรายการในจุดส่ง
 *  โฟลเดอร์ Storage ใช้ชื่อเดียวกับที่หน้าผู้ช่วยอัปตรง (js/helper.js) */
const REC_LISTS = { payment:'payments', invret:'invoiceReturns' };
const REC_STEP = { payment:'payment', invret:'return' };
const REC_KIND = { payment:'slip', invret:'invoice' };
const REC_LABEL = { payment:'ชำระเงิน', invret:'คืนเอกสารเลขที่บิล' };

/** อ่านรูปหนึ่งใบตามที่อยู่ */
const slotGet = (row, slot) => {
  if (REC_LISTS[slot.field]) return ((row[REC_LISTS[slot.field]] || []).find(p => p.id === slot.recId)?.photos || [])[slot.index];
  const ev = (row.events || []).find(e => e.id === slot.eventId);
  if (!ev) return null;
  return slot.field === 'signature' ? ev.signature : (ev[slot.field] || [])[slot.index];
};

/** เขียนรูปหนึ่งใบตามที่อยู่ */
const slotSet = (row, slot, url) => {
  if (REC_LISTS[slot.field]){
    const pm = (row[REC_LISTS[slot.field]] || []).find(p => p.id === slot.recId);
    if (!pm) return false;
    pm.photos[slot.index] = url;
    return true;
  }
  const ev = (row.events || []).find(e => e.id === slot.eventId);
  if (!ev) return false;
  if (slot.field === 'signature') ev.signature = url;
  else if (Array.isArray(ev[slot.field])) ev[slot.field][slot.index] = url;
  else return false;
  return true;
};

/**
 * ย้ายรูป base64 ขึ้น Storage แล้วเขียน URL ทับ
 *
 * กันพลาดไว้สามชั้น:
 *   · อัปไม่สำเร็จ `uploadPhoto` จะคืน base64 เดิมกลับมา — เช็กว่าขึ้นต้นด้วย http ก่อนเขียนทับเสมอ
 *   · เขียนกลับผ่านกล่องขาออก (เฉพาะเอกสารที่เปลี่ยน) ไม่ใช่ `pushAll` จะได้ไม่ดันทั้งฐานทุกใบ
 *   · หยุดกลางคันได้ ของที่ย้ายไปแล้วไม่เสีย เพราะบันทึกทุกครั้งที่จบเอกสาร
 *
 * @param {{limit?:number, onProgress?:(p:object)=>void, shouldStop?:()=>boolean, stopOnFail?:boolean}} opt
 *        stopOnFail = ใบแรกที่ไม่ผ่านให้หยุดทั้งรอบ (ส่งอัตโนมัติ — เน็ตแย่ ไม่ต้องไล่รอใบละ 30 วิ)
 * @returns {Promise<{moved:number, failed:number, freedBytes:number, errors:string[]}>}
 */
export async function migrateLocalPhotos({ limit = Infinity, onProgress, shouldStop, stopOnFail = false } = {}){
  if (!cloudReady()) throw new Error('ยังต่อคลาวด์ไม่ได้ — ต่ออินเทอร์เน็ตแล้วลองใหม่');

  const db = read();
  const all = photoSlots(db).slice(0, limit === Infinity ? undefined : limit);
  if (!all.length) return { moved:0, failed:0, freedBytes:0, errors:[] };

  /* จัดกลุ่มตามเอกสาร จะได้เขียนกลับครั้งเดียวต่อหนึ่งเที่ยว/จุดส่ง */
  const byDoc = new Map();
  all.forEach(sl => {
    const k = `${sl.coll}/${sl.docId}`;
    if (!byDoc.has(k)) byDoc.set(k, []);
    byDoc.get(k).push(sl);
  });

  let moved = 0, failed = 0, freedBytes = 0, done = 0;
  const errors = [];

  for (const [, slots] of byDoc){
    if (shouldStop?.() || (stopOnFail && failed)) break;

    const { coll, docId } = slots[0];
    const row = db[coll].find(r => r.id === docId);
    if (!row) continue;

    let touched = false;
    for (const sl of slots){
      if (shouldStop?.()) break;

      const dataUrl = slotGet(row, sl);
      done++;
      onProgress?.({ done, total: all.length, slot: sl });

      /* อาจถูกย้ายไปแล้วจากรอบก่อน หรือถูกลบทิ้งระหว่างนั้น */
      if (!isLocalPhoto(dataUrl)) continue;

      /* รูปชำระเงินไปโฟลเดอร์เดียวกับที่หน้าผู้ช่วยอัปตรง (js/helper.js) */
      /* ชื่อเดียวกับที่หน้าคนขับ/ผู้ช่วยอัปตรง (cloud.js stopPhotoDir / jobPhotoDir) */
      const kind = sl.field === 'signature' ? 'signature' : sl.field === 'invoicePhotos' ? 'invoice' : 'cargo';
      const folder = REC_LISTS[sl.field]
        ? stopPhotoDir(row, REC_STEP[sl.field], REC_KIND[sl.field])
        : coll === 'jobs' ? jobPhotoDir(row, sl.status, kind) : stopPhotoDir(row, sl.status, kind);
      let url = null;
      try{ url = await uploadPhoto(dataUrl, folder); }
      catch(err){ errors.push(`${sl.code} · ${REC_LISTS[sl.field] ? `${REC_LABEL[sl.field]} รอบ ${sl.round}` : sl.status}: ${err.message}`); }

      /* uploadPhoto กลืน error แล้วคืน base64 เดิม — ต้องเช็กเองว่าได้ URL จริง */
      if (!url || !/^https?:\/\//i.test(url)){
        failed++;
        errors.push(`${sl.code} · ${REC_LISTS[sl.field] ? `${REC_LABEL[sl.field]} รอบ ${sl.round}` : sl.status}: อัปไม่สำเร็จ ยังเป็น base64 เหมือนเดิม`);
        if (stopOnFail) break;
        continue;
      }

      slotSet(row, sl, url);
      moved++; touched = true; freedBytes += sl.bytes;
    }

    if (!touched) continue;
    row.updatedAt = iso(Date.now());
    /* ส่งเอกสารขึ้นผ่านกล่องขาออก (ไม่รอ putDoc ตรง ๆ แบบเดิม — ถ้าเน็ตหลุดอีกรอบ setDoc ค้างรอเซิร์ฟเวอร์ไม่จบ)
       กล่องขาออกส่งให้เองเบื้องหลัง เน็ตหลุดก็ค้างไว้แล้วส่งตอนเน็ตกลับ ลิงก์ใหม่ไม่หาย */
    markDirty(db);
    saveLocal(db);
  }

  cache = db;
  syncUp();
  emit();
  return { moved, failed, freedBytes, errors };
}

/* ---------- เดโม่ ------------------------------------------ */
/** ล้าง/รีเซ็ตข้อมูลทั้งฐาน — อนุญาตเฉพาะโหมดทดสอบ (js/firebase.js ตั้ง window.__FT_EMU ตอนเปิดพอร์ต 5600) */
const demoAllowed = () => typeof window !== 'undefined' && !!window.__FT_EMU;

export function resetDemo(){
  if (!demoAllowed()) throw new Error('ล้าง/รีเซ็ตข้อมูลทำได้เฉพาะโหมดทดสอบ (Emulator) เท่านั้น');
  /* เก็บทะเบียนคนขับจริงไว้ — เปลี่ยนแค่งานเป็นชุดตัวอย่าง
     งานเดโม่อ้างคนขับ drv_1..drv_4 จึงจับคู่กับคนขับจริงด้วยชื่อก่อน ไม่เจอค่อยไล่ตามลำดับ
     ยังไม่มีคนขับเลยสักคน = ใช้คนขับตัวอย่างเหมือนเดิม */
  const keep = (cache || read()).drivers || [];
  const demo = seed();
  if (keep.length){
    const idMap = new Map(demo.drivers.map((d, i) =>
      [d.id, (keep.find(k => k.name === d.name) || keep[i % keep.length]).id]));
    /* แทน id ทุกที่ที่อ้างถึง (driverId, driverIds, ค่ารอบรายคน, ลายนิ้วมือใน event) ทีเดียว */
    const remap = (rows) => JSON.parse(JSON.stringify(rows)
      .replace(/"drv_\d+"/g, (m) => JSON.stringify(idMap.get(JSON.parse(m)) || JSON.parse(m))));
    demo.jobs = remap(demo.jobs);
    demo.shipments = remap(demo.shipments);
    demo.drivers = keep;
  }
  cache = demo;
  saveLocal(cache);
  /* ล้างของเก่าบนคลาวด์ก่อนแล้วค่อยดันชุดใหม่ขึ้น ไม่งั้นงานเก่าจะค้างปนมา
     ลายนิ้วมือชุดเก่าใช้ไม่ได้แล้ว ต้องล้างทิ้งก่อน ไม่งั้นรอบส่งถัดไปจะนึกว่า
     ของที่เพิ่งล้างไปยังอยู่บนคลาวด์ แล้วสั่งลบซ้ำ / ข้ามการส่งของชุดใหม่ */
  forgetPushed();
  wipeCloud().then(() => pushAll(cache)).then(ok => { if (ok) markPushed(cache); }).catch(() => {});
  emit();
  return true;
}
/** ล้างข้อมูลทั้งหมดให้เหลือระบบเปล่า — ใช้ตอนเลิกเดโม่แล้วเริ่มใช้งานจริง
 *  ของเดิมเรียก read() ต่อท้ายซึ่งทำให้ seed() กลับมาใหม่ จึงล้างไม่ออก */
export function wipe(){
  if (!demoAllowed()) throw new Error('ล้าง/รีเซ็ตข้อมูลทำได้เฉพาะโหมดทดสอบ (Emulator) เท่านั้น');
  const keep = cache?.settings || seed().settings;
  cache = { schema: SCHEMA, settings: keep, drivers: [], jobs: [], shipments: [] };
  saveLocal(cache);
  /* ล้างบนคลาวด์ด้วย ไม่งั้น onSnapshot จะส่งของเก่ากลับมาทันที */
  forgetPushed();
  wipeCloud().catch(() => {});
  emit();
  return true;
}

/** ล้างเฉพาะงาน (เที่ยว + จุดส่ง) เก็บทะเบียนคนขับและการตั้งค่าไว้
 *  ใช้ตอนเลิกเดโม่ — งานเดโม่มีเลข Shipment ชนกับของจริง (7372007589 ฯลฯ)
 *  ถ้าไม่ล้าง จุดส่งจริงจะถูกรวมเข้างานเดโม่ตอน sync ไฟล์ขาว
 *  ลบผ่าน write() ปกติ ระบบซิงก์จะเห็นว่าเอกสารหายไปแล้วลบบนคลาวด์ให้เอง
 *  เรียกจาก console: FT.wipeJobs() */
export function wipeJobs(){
  /* เปิดใช้นอก Emulator ระหว่างช่วงทดสอบก่อนขึ้นระบบจริง (ผู้ใช้อนุญาต 20 ต.ค. 2026 — ปิด QA TC-132 ไว้ชั่วคราว)
     ปุ่มอยู่หน้า ops เฉพาะ admin (ui.js demoBar) · ต้องเป็นพนักงานที่แก้ข้อมูลได้ */
  if (!demoAllowed() && !(isStaffSession() && canWrite())) throw new Error('ล้างข้อมูลได้เฉพาะพนักงานที่มีสิทธิ์แก้ไข');
  const db = read();
  const gone = { jobs: db.jobs.length, shipments: db.shipments.length };
  /* เก็บของที่ต้องตามลบก่อนล้าง: รูปใน Storage (evidence/…) · เลขค้นของหน้าติดตามพัสดุ
     trackData ลบตามจุดส่งให้เองตอนซิงก์ (removeTracking) */
  const photos = [...new Set((JSON.stringify([db.jobs, db.shipments]).match(/https:\/\/firebasestorage\.googleapis\.com[^"\\]+/g) || [])
    .filter(u => u.includes('/o/evidence%2F')))];
  const keys = [...new Set(db.shipments.flatMap(trackKeysOf))];
  db.jobs.length = 0;
  db.shipments.length = 0;
  write();
  if (cloudReady()){
    markWiped(getSession().staff?.email || '').catch(() => {});
    removePhotos(photos).then(n => console.info(`[store] ลบรูปแล้ว ${n}/${photos.length}`)).catch(() => {});
    removeDocs('trackKeys', keys).catch(() => {});
  }
  console.info(`[store] ล้างงานแล้ว — เที่ยว ${gone.jobs} · จุดส่ง ${gone.shipments} · รูป ${photos.length} · เก็บคนขับไว้ ${db.drivers.length} คน`);
  return { ...gone, photos: photos.length, driversKept: db.drivers.length };
}

/* เผยไว้ให้เปิด console ตรวจได้ตอนพรีเซนต์ */
if (typeof window !== 'undefined') window.FT = { read, resetDemo, wipe, wipeJobs, S, FLOW, META };
