/* ============================================================
   jobReport.js — รีพอร์ต JOBLIST จากหน้าติดตาม (6 พ.ย. 2026 — ลูกค้าขอ)

   ลูกค้าเลือกช่วงวันที่ → ไฟล์หน้าตาเดียวกับ JOBLISTCREATEDATE-yyyymmddhhmmss.xls ของระบบเดิม (Skyfrog) ทุกจุด:
     ชื่อไฟล์ .xls (ข้างในเป็น xlsx เหมือนต้นฉบับ) · ชีตเดียวชื่อ = ชื่อไฟล์ตัดเหลือ 31 ตัว · 63 คอลัมน์เรียงเดิม
     หัวตารางพื้น 2F4F4F ตัวขาวหนา · Calibri 11 · ทุกช่องเป็นข้อความ · ลิงก์รูป/POD = สูตร HYPERLINK ตัวสีน้ำเงิน
   ต่างจากต้นฉบับแค่หัวคอลัมน์ที่สะกดผิด (ผู้ใช้สั่งแก้: LatlLng · Lattitude · พนังงาน)

   ข้อมูล: trackData (สำเนาสาธารณะ · cloud.js publicStop) ทุกใบที่ createdAt อยู่ในช่วง — ช่วงนับตามวันที่สร้างงาน (CREATEDATE)
   ช่องที่ระบบนี้ไม่เก็บ (CustomerID · HHID · QR · พิกัดตอนรับของ · ลายเซ็นตอนรับ · ชื่อไฟล์ ฯลฯ) ปล่อยว่าง
   เวลานัด (DueTime) ระบบนี้ไม่มี — ใช้ค่าที่ต้นฉบับใช้ทั้งไฟล์: ส่ง 23:00:00 · รับ 08:00:00 แล้วคิดความล่าช้าจากนั้น
   ============================================================ */

import { loadExcelJS } from './xlsxExport.js';
import { OUTCOMES } from './store.js';

const HEAD = [
  'JobNo', 'JobStatus', 'CreateBy', 'CreateDate', 'CreateTime', 'CustomerAddress', 'CustomerID', 'CustomerName',
  'DeliveryAddress', 'DeliveryCheckIn', 'DeliveryCheckInLatLng', 'DeliveryCheckOut', 'DeliveryCheckOutLatLng',
  'DeliveryDate', 'DeliveryDelayDay', 'DeliveryDelayTime', 'DeliveryDueDate', 'DeliveryDueTime', 'DeliveryID',
  'DeliveryLatitude', 'DeliveryLongitude', 'DeliveryName', 'DeliveryQR', 'DeliveryTime', 'Document', 'FullName',
  'HHID', 'MilestoneCheckIn', 'MilestonePODCompleted', 'MilestoneTruckArrival', 'MilestoneTruckOut',
  'MilestoneUnloadComplete', 'ReceiveAddress', 'ReceiveCheckIn', 'ReceiveCheckInLatLng', 'ReceiveCheckOut',
  'ReceiveCheckOutLatLng', 'ReceiveDate', 'ReceiveDueDate', 'ReceiveDueTime', 'ReceiveID', 'ReceiveLatitude',
  'ReceiveLongitude', 'ReceiveName', 'ReceiveQR', 'ReceiveTime', 'เขต', 'Shipment No.', 'Invoice No.', 'ชื่อไฟล์',
  'RejectReasonName', 'rsignimg', 'dsignimg', 'rmanimg', 'dmanimg', 'ชื่อพนักงานขับรถ', 'Sum (Delivery QTY)',
  'Sum (Item)', 'Sum (Expect QTY)', 'Sum (Receive QTY)', 'Sum (Weight)', 'UserName', 'Job 5 Picture',
];
/* คอลัมน์ที่เป็นลิงก์ (ตัวสีน้ำเงินแบบต้นฉบับ) · คอลัมน์กว้าง 50 (ที่อยู่) */
const LINK_COLS = new Set(['rsignimg', 'dsignimg', 'rmanimg', 'dmanimg', 'Job 5 Picture']);
const WIDE_COLS = new Set(['CustomerAddress', 'DeliveryAddress', 'ReceiveAddress']);
const DUE_TIME = '23:00:00', RECEIVE_DUE_TIME = '08:00:00';

/* ---------- เวลาไทย (ไม่ขึ้นกับโซนเวลาของเครื่องลูกค้า) ---------- */
const BKK = 7 * 3600e3;
const pad = (n) => String(n).padStart(2, '0');
const bkk = (at) => { const t = Date.parse(at); return Number.isFinite(t) ? new Date(t + BKK) : null; };
const dmy = (d) => (d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '');
const hms = (d) => (d ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}` : '');
const fDate = (at) => dmy(bkk(at));
const fTime = (at) => hms(bkk(at));
const fStamp = (at) => { const d = bkk(at); return d ? `${dmy(d)} ${hms(d)}` : ''; };
/** yyyy-mm-dd → dd/mm/yyyy */
const ymd2dmy = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
/** เวลาเริ่มวัน (ไทย) ของ yyyy-mm-dd เป็น ISO */
const dayStart = (ymd, add = 0) => new Date(Date.parse(`${ymd}T00:00:00+07:00`) + add * 864e5).toISOString();

/* ---------- ดึงข้อมูล ---------- */
async function fetchRange(from, to){
  const fb = window.firebase;
  if (!fb?.ok) throw new Error('ต่อฐานข้อมูลไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  const q = fb.query(fb.collection(fb.db, 'trackData'),
    fb.where('createdAt', '>=', dayStart(from)), fb.where('createdAt', '<', dayStart(to, 1)));
  const snap = await fb.getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.code).localeCompare(String(b.code), 'th', { numeric:true }));
}

/* ---------- แถวละหนึ่งจุดส่ง ---------- */
const lastEv = (s, st) => [...(s.events || [])].reverse().find(e => e?.status === st) || null;
const fileOf = (u) => { try{ return decodeURIComponent(new URL(u).pathname.split('/').pop()).split('/').pop(); }catch{ return 'รูป'; } };
/* สูตร HYPERLINK แบบต้นฉบับ + ค่าที่คำนวณแล้ว (แอปดูไฟล์ในมือถือที่ไม่คำนวณสูตรก็ยังเห็นชื่อไฟล์) */
const link = (url, label) => (url ? { formula: `HYPERLINK("${String(url).replace(/"/g, '""')}","${String(label).replace(/"/g, '""')}")`, result: String(label) } : '');
const n8 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(8) : '');

function jobStatus(s, dev){
  if (s.status === 'cancelled') return 'CANCEL';
  if (s.status === 'new') return 'OPEN';
  if (s.status !== 'delivered') return 'RECEIVED';
  if (dev?.outcome && dev.outcome !== 'ok') return 'REJECT';
  return dev?.byRole === 'ops' ? 'Completed (By Admin)' : 'COMPLETED';
}

/** ส่งช้ากว่ากำหนด (วันส่ง + 23:00:00) → [วัน, hh:mm:ss] แบบต้นฉบับ */
function delay(serviceDate, at){
  const due = Date.parse(`${String(serviceDate || '').slice(0, 10)}T${DUE_TIME}+07:00`);
  const t = Date.parse(at);
  if (!Number.isFinite(due) || !Number.isFinite(t) || t <= due) return ['0', '00:00:00'];
  const sec = Math.floor((t - due) / 1000);
  const d = Math.floor(sec / 86400), r = sec % 86400;
  return [String(d), `${pad(Math.floor(r / 3600))}:${pad(Math.floor(r / 60) % 60)}:${pad(r % 60)}`];
}

function rowOf(s, podUrl){
  const created = s.events?.[0] || null;
  const createdAt = s.createdAt || created?.at || '';
  const arrived = lastEv(s, 'arrived');
  const loaded = lastEv(s, 'loaded');
  const departed = lastEv(s, 'departed');
  const dev = s.status === 'delivered' ? lastEv(s, 'delivered') : null;
  const pod = s.pod || null;
  const doneAt = pod?.at || dev?.at || '';
  const geo = pod?.geo || null;
  const ll = geo ? `${geo.lat},${geo.lng}` : '';
  const [lateDay, lateTime] = dev ? delay(s.serviceDate, doneAt) : ['0', '00:00:00'];
  const sig = pod?.signature || '';
  const rPhoto = (loaded?.photos || [])[0] || '';
  const dPhoto = (dev?.photos || [])[0] || '';
  const fail = dev?.outcome && dev.outcome !== 'ok' ? (OUTCOMES[dev.outcome] || dev.outcome) : '';
  const items = Number(s.cargo?.pieces) || 0;
  const qty = Number(s.report?.qty) || items;
  const due = ymd2dmy(s.serviceDate);
  const v = {
    JobNo: s.code || '',
    JobStatus: jobStatus(s, dev),
    CreateBy: created?.byName || '',
    CreateDate: fDate(createdAt), CreateTime: fTime(createdAt),
    CustomerAddress: s.dropoff?.address || '',
    CustomerName: s.customer?.name || s.dropoff?.name || '',
    DeliveryAddress: s.dropoff?.address || '',
    DeliveryCheckIn: fStamp(arrived?.at),
    DeliveryCheckOut: fStamp(doneAt), DeliveryCheckOutLatLng: ll,
    DeliveryDate: fDate(doneAt), DeliveryDelayDay: lateDay, DeliveryDelayTime: lateTime,
    DeliveryDueDate: due, DeliveryDueTime: due ? DUE_TIME : '',
    DeliveryID: s.delivery || '',
    DeliveryLatitude: geo ? n8(geo.lat) : '', DeliveryLongitude: geo ? n8(geo.lng) : '',
    DeliveryName: s.dropoff?.name || '',
    DeliveryTime: fTime(doneAt),
    Document: 'Deliver Container',
    MilestonePODCompleted: fStamp(doneAt),
    ReceiveAddress: s.pickup?.address || '',
    ReceiveCheckIn: fStamp(loaded?.at), ReceiveCheckOut: fStamp(departed?.at),
    ReceiveDate: fDate(loaded?.at), ReceiveDueDate: due, ReceiveDueTime: due ? RECEIVE_DUE_TIME : '',
    ReceiveName: s.pickup?.name || '',
    ReceiveTime: fTime(loaded?.at),
    'เขต': s.report?.zone || '',
    'Shipment No.': s.shipmentNo || '',
    'Invoice No.': s.invoice?.number || '',
    RejectReasonName: fail,
    dsignimg: link(sig, sig ? fileOf(sig) : ''),
    rmanimg: link(rPhoto, rPhoto ? fileOf(rPhoto) : ''),
    dmanimg: link(dPhoto, dPhoto ? fileOf(dPhoto) : ''),
    'ชื่อพนักงานขับรถ': String(s.driver?.name || '').replace(/\s*\((รถประจำ|รถนอก)\)\s*$/, ''),
    'Sum (Delivery QTY)': String(dev && !fail ? qty : 0),
    'Sum (Item)': String(items),
    'Sum (Expect QTY)': String(qty),
    'Sum (Receive QTY)': String(s.status === 'new' ? 0 : qty),
    'Sum (Weight)': String(Number(s.cargo?.weightKg) || 0),
    'Job 5 Picture': dev ? link(podUrl(s), `${s.code}.pdf`) : '',
  };
  return HEAD.map(h => (h in v ? v[h] : ''));
}

/* ---------- เขียนไฟล์ ---------- */
const stamp = (d = new Date()) => {
  const b = new Date(d.getTime() + BKK);
  return `${b.getUTCFullYear()}${pad(b.getUTCMonth() + 1)}${pad(b.getUTCDate())}${pad(b.getUTCHours())}${pad(b.getUTCMinutes())}${pad(b.getUTCSeconds())}`;
};

/**
 * ดึงทุกใบที่สร้างในช่วง from–to (yyyy-mm-dd · นับวันไทย) แล้วดาวน์โหลดเป็น JOBLISTCREATEDATE-….xls
 * @param {{from:string, to:string, podUrl:(s:object)=>string}} o
 * @returns {Promise<number>} จำนวนแถว
 */
export async function downloadJobList({ from, to, podUrl }){
  const [ExcelJS, list] = await Promise.all([loadExcelJS(), fetchRange(from, to)]);
  if (!list.length) return 0;
  const base = `JOBLISTCREATEDATE-${stamp()}`;
  const wb = new ExcelJS.Workbook();
  wb.calcProperties = { fullCalcOnLoad: true };   /* ต้นฉบับตั้งไว้ — Excel คำนวณสูตรลิงก์ใหม่ตอนเปิด */
  const ws = wb.addWorksheet(base.slice(0, 31));
  ws.columns = HEAD.map(h => ({ width: WIDE_COLS.has(h) ? 50 : 9.140625 }));
  const font = { name:'Calibri', size:11 };
  const head = ws.addRow(HEAD);
  head.eachCell(c => {
    c.font = { ...font, bold:true, color:{ argb:'FFFFFFFF' } };
    c.fill = { type:'pattern', pattern:'solid', fgColor:{ argb:'FF2F4F4F' } };
  });
  const linkIdx = new Set(HEAD.map((h, i) => (LINK_COLS.has(h) ? i + 1 : 0)).filter(Boolean));
  for (const s of list){
    const r = ws.addRow(rowOf(s, podUrl));
    r.eachCell({ includeEmpty:true }, (c, col) => {
      c.font = linkIdx.has(col) && c.value ? { ...font, color:{ argb:'FF0000FF' } } : font;
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type:'application/vnd.ms-excel' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${base}.xls`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  return list.length;
}
