/* ============================================================
   AURUM — store.js
   PHASE 1 · THE CORE — the single source of truth.

   Every read/write in the product goes through this module.
   It is deliberately shaped like a remote API (async, id-based,
   returns plain JSON) so the persistence driver can be swapped
   for Supabase/REST later without touching a single caller.

   Swap point: `driver` at the bottom of this file.
   ============================================================ */

const KEY = 'aurum.db.v1';
const LATENCY = 90;               // ms — keeps loading states honest during development

/* ---------- helpers ---------- */
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (ms) => new Promise(r => setTimeout(r, ms));

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const toHHMM = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
export const addDays = (iso, n) => { const d = fromISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const todayISO = () => toISO(new Date());

export const TH_DOW = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const TH_DOW_S = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const fmtDateTH = (iso, opt = {}) => {
  const d = fromISO(iso);
  const dow = opt.short ? TH_DOW_S[d.getDay()] : TH_DOW[d.getDay()];
  return `${opt.dow === false ? '' : dow + ' '}${d.getDate()} ${TH_MON[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`.trim();
};
export const fmtTHB = (n) => new Intl.NumberFormat('th-TH').format(Math.round(n));

/* human-readable confirmation code, e.g. AU-7K2F */
const bookingCode = () => 'AU-' + Math.random().toString(36).slice(2, 6).toUpperCase();

/* ============================================================
   SEED — a plausible high-end salon/clinic, ready on first run
   ============================================================ */
const W = (start, end) => ({ start, end });
const STD = { 0: [W('11:00', '19:00')], 1: [], 2: [W('10:00', '20:00')], 3: [W('10:00', '20:00')],
              4: [W('10:00', '20:00')], 5: [W('10:00', '21:00')], 6: [W('10:00', '21:00')] };

function seed() {
  const staff = [
    { id: 'st_ari',  name: 'อริสา วรกิจ',      title: 'Master Stylist · Founder', initial: 'อ',
      bio: 'ผ่านการฝึกที่ลอนดอนและโตเกียว 14 ปี เชี่ยวชาญการตัดทรงตามโครงหน้า', active: true,
      hours: clone(STD), breaks: [{ dow: 'all', start: '14:00', end: '15:00', label: 'พักกลางวัน' }], timeOff: [] },
    { id: 'st_kan',  name: 'กันตพงศ์ ศรีสุข',  title: 'Senior Colourist', initial: 'ก',
      bio: 'นักทำสีผมที่เน้นสูตรเฉพาะบุคคล ไม่ใช้สูตรสำเร็จ', active: true,
      hours: { ...clone(STD), 0: [], 1: [W('12:00', '20:00')] },
      breaks: [{ dow: 'all', start: '15:00', end: '16:00', label: 'พักกลางวัน' }], timeOff: [] },
    { id: 'st_pim',  name: 'พิมพ์ชนก อัศวิน',  title: 'Aesthetic Nurse', initial: 'พ',
      bio: 'พยาบาลวิชาชีพ ดูแลหัตถการผิวหน้าและเลเซอร์ภายใต้แพทย์ผู้ควบคุม', active: true,
      hours: { 0: [], 1: [W('11:00', '19:00')], 2: [W('11:00', '19:00')], 3: [W('11:00', '19:00')],
               4: [W('11:00', '19:00')], 5: [W('11:00', '19:00')], 6: [W('11:00', '18:00')] },
      breaks: [{ dow: 'all', start: '14:30', end: '15:30', label: 'พักกลางวัน' }], timeOff: [] },
    { id: 'st_nch',  name: 'ณิชา บุญมั่น',      title: 'Spa Therapist', initial: 'ณ',
      bio: 'นวดบำบัดและทรีตเมนต์ผิวกาย จบหลักสูตรสปาไทยระดับสูง', active: true,
      hours: clone(STD), breaks: [{ dow: 'all', start: '13:30', end: '14:30', label: 'พักกลางวัน' }], timeOff: [] },
  ];

  const services = [
    { id: 'sv_cut',  cat: 'Hair',   name: 'Signature Cut & Style',     nameTh: 'ตัด–จัดทรงซิกเนเจอร์', dur: 60,  price: 1800, vip: false,
      desc: 'ปรึกษาโครงหน้า 10 นาที ก่อนลงกรรไกรทุกครั้ง', staff: ['st_ari', 'st_kan'], active: true },
    { id: 'sv_col',  cat: 'Hair',   name: 'Bespoke Colour',            nameTh: 'ทำสีเฉพาะบุคคล',       dur: 150, price: 5200, vip: true,
      desc: 'ผสมสูตรสีเฉพาะคุณ พร้อมทรีตเมนต์ปิดท้าย', staff: ['st_kan'], active: true },
    { id: 'sv_trt',  cat: 'Hair',   name: 'Restorative Hair Ritual',   nameTh: 'ทรีตเมนต์ฟื้นบำรุงผม',  dur: 90,  price: 3200, vip: false,
      desc: 'ทรีตเมนต์โปรตีน 3 ขั้น พร้อมนวดศีรษะ 15 นาที', staff: ['st_ari', 'st_nch'], active: true },
    { id: 'sv_fac',  cat: 'Clinic', name: 'Radiance Facial',           nameTh: 'ทรีตเมนต์ผิวหน้าเรเดียนซ์', dur: 75, price: 4500, vip: false,
      desc: 'วิเคราะห์ผิวด้วยเครื่อง ก่อนเลือกเซรั่มให้ตรงสภาพผิว', staff: ['st_pim'], active: true },
    { id: 'sv_las',  cat: 'Clinic', name: 'Laser Rejuvenation',        nameTh: 'เลเซอร์ฟื้นฟูผิว',      dur: 45,  price: 7900, vip: true,
      desc: 'ต้องพบแพทย์ประเมินก่อน 1 ครั้ง (ฟรี)', staff: ['st_pim'], active: true },
    { id: 'sv_spa',  cat: 'Spa',    name: 'Aurum Body Ritual',         nameTh: 'ทรีตเมนต์ผิวกายออรัม',  dur: 120, price: 4800, vip: true,
      desc: 'สครับ–ห่อตัว–นวดน้ำมันหอมระเหย ในห้องส่วนตัว', staff: ['st_nch'], active: true },
  ];

  const settings = {
    salonName: 'AURUM',
    wordmark: 'AURUM',
    tagline: 'Atelier of Hair & Skin',
    tagTh: 'ห้องเสริมความงามส่วนตัว · สุขุมวิท 31',
    hue: 78, chroma: 0.105, field: 'dark',
    phone: '02-115-0088', line: '@aurum.atelier',
    address: '31/9 ซอยสุขุมวิท 31 คลองเตยเหนือ วัฒนา กรุงเทพฯ 10110',
    slotStep: 15,          // grid granularity in minutes
    buffer: 10,            // clean-down between appointments
    leadMinutes: 120,      // no booking closer than this to now
    horizonDays: 30,       // how far ahead guests may book
    cancelHours: 12,
    reminderHours: 24,
    webhookUrl: '',
    webhookEnabled: false,
    depositPct: 0,
  };

  /* a few appointments across the next few days so the board is never empty */
  const t = todayISO();
  const mk = (svId, stId, date, start, name, phone, status = 'booked') => {
    const sv = services.find(s => s.id === svId);
    return { id: uid('ap'), code: bookingCode(), serviceId: svId, staffId: stId, date,
      start, end: toHHMM(toMin(start) + sv.dur), price: sv.price, status,
      customer: { name, phone, email: '', note: '' },
      createdAt: new Date().toISOString(), source: 'seed', reminders: [] };
  };
  const appointments = [
    mk('sv_cut', 'st_ari', t, '11:00', 'คุณมนัสวี ตั้งจิต', '081-234-5678', 'done'),
    mk('sv_col', 'st_kan', t, '13:00', 'คุณพัชรา วงศ์ไทย', '089-556-1200'),
    mk('sv_fac', 'st_pim', t, '15:00', 'คุณชญานิศ ดำรงค์', '086-778-4412'),
    mk('sv_spa', 'st_nch', t, '16:00', 'คุณอรวรรณ สุขใจ',  '092-114-8890'),
    mk('sv_cut', 'st_ari', addDays(t, 1), '10:30', 'คุณธนกฤต ชูเกียรติ', '084-990-2231'),
    mk('sv_trt', 'st_ari', addDays(t, 1), '14:00', 'คุณศิริพร ทองดี',   '081-445-9087'),
    mk('sv_las', 'st_pim', addDays(t, 2), '12:00', 'คุณเบญจวรรณ ภูผา',  '095-332-1177'),
    mk('sv_col', 'st_kan', addDays(t, 2), '16:30', 'คุณกิตติมา แสงทอง', '090-887-3321'),
    mk('sv_cut', 'st_ari', addDays(t, -2), '11:00', 'คุณวรินทร์ ปิยะ',   '081-000-1122', 'done'),
    mk('sv_fac', 'st_pim', addDays(t, -3), '13:00', 'คุณณัฐธิดา รุ่งเรือง', '083-221-9900', 'noshow'),
    mk('sv_spa', 'st_nch', addDays(t, -5), '15:00', 'คุณอรวรรณ สุขใจ',  '092-114-8890', 'done'),
    mk('sv_trt', 'st_nch', addDays(t, -8), '11:30', 'คุณพัชรา วงศ์ไทย', '089-556-1200', 'done'),
  ];

  return { settings, staff, services, appointments, closures: [], reminders: [], v: 1 };
}

/* ============================================================
   DRIVER — localStorage today, a network call tomorrow.
   ============================================================ */
let db = null;

function load() {
  if (db) return db;
  try {
    const raw = localStorage.getItem(KEY);
    db = raw ? JSON.parse(raw) : seed();
  } catch { db = seed(); }
  if (!db.v) db = seed();
  return db;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { console.warn('[aurum] persist failed', e); }
  window.dispatchEvent(new CustomEvent('aurum:changed'));
}

export async function resetDB() { db = seed(); save(); return true; }
export function exportDB() { return JSON.stringify(load(), null, 2); }
export async function importDB(json) {
  const next = typeof json === 'string' ? JSON.parse(json) : json;
  if (!next || !next.settings || !Array.isArray(next.staff)) throw new Error('ไฟล์ไม่ใช่ข้อมูลของ AURUM');
  db = next; save(); return true;
}

/* ---------- settings ---------- */
export async function getSettings() { await wait(LATENCY / 3); return clone(load().settings); }
export function getSettingsSync() { return clone(load().settings); }
export async function saveSettings(patch) {
  const d = load(); d.settings = { ...d.settings, ...patch }; save();
  window.dispatchEvent(new CustomEvent('aurum:brand'));
  return clone(d.settings);
}

/* ---------- services ---------- */
export async function listServices({ includeInactive = false } = {}) {
  await wait(LATENCY);
  return clone(load().services.filter(s => includeInactive || s.active));
}
export async function upsertService(sv) {
  const d = load();
  if (sv.id) {
    const i = d.services.findIndex(s => s.id === sv.id);
    if (i > -1) d.services[i] = { ...d.services[i], ...sv }; else d.services.push(sv);
  } else { sv.id = uid('sv'); d.services.push(sv); }
  save(); return clone(sv);
}
export async function removeService(id) {
  const d = load(); d.services = d.services.filter(s => s.id !== id); save(); return true;
}

/* ---------- staff ---------- */
export async function listStaff({ includeInactive = false } = {}) {
  await wait(LATENCY);
  return clone(load().staff.filter(s => includeInactive || s.active));
}
export async function upsertStaff(st) {
  const d = load();
  if (st.id) {
    const i = d.staff.findIndex(s => s.id === st.id);
    if (i > -1) d.staff[i] = { ...d.staff[i], ...st }; else d.staff.push(st);
  } else { st.id = uid('st'); d.staff.push(st); }
  save(); return clone(st);
}
export async function setStaffDay(staffId, dow, windows) {
  const d = load(); const st = d.staff.find(s => s.id === staffId);
  if (!st) throw new Error('ไม่พบพนักงาน');
  st.hours[dow] = windows; save(); return clone(st);
}
export async function addTimeOff(staffId, entry) {
  const d = load(); const st = d.staff.find(s => s.id === staffId);
  if (!st) throw new Error('ไม่พบพนักงาน');
  st.timeOff.push({ id: uid('to'), ...entry }); save(); return clone(st);
}
export async function removeTimeOff(staffId, id) {
  const d = load(); const st = d.staff.find(s => s.id === staffId);
  st.timeOff = st.timeOff.filter(t => t.id !== id); save(); return clone(st);
}

/* ---------- salon-wide closures ---------- */
export async function listClosures() { return clone(load().closures); }
export async function addClosure(date, reason) {
  const d = load();
  if (!d.closures.some(c => c.date === date)) d.closures.push({ id: uid('cl'), date, reason });
  save(); return clone(d.closures);
}
export async function removeClosure(id) {
  const d = load(); d.closures = d.closures.filter(c => c.id !== id); save(); return clone(d.closures);
}

/* ---------- appointments ---------- */
export async function listAppointments(filter = {}) {
  await wait(LATENCY);
  let out = load().appointments.slice();
  if (filter.date) out = out.filter(a => a.date === filter.date);
  if (filter.from) out = out.filter(a => a.date >= filter.from);
  if (filter.to) out = out.filter(a => a.date <= filter.to);
  if (filter.staffId) out = out.filter(a => a.staffId === filter.staffId);
  if (filter.phone) out = out.filter(a => a.customer.phone.replace(/\D/g, '').includes(filter.phone.replace(/\D/g, '')));
  if (filter.code) out = out.filter(a => a.code.toLowerCase() === String(filter.code).toLowerCase());
  if (!filter.includeCancelled) out = out.filter(a => a.status !== 'cancelled');
  return clone(out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)));
}
export function listAppointmentsSync() { return clone(load().appointments); }

export async function getAppointment(idOrCode) {
  const d = load();
  return clone(d.appointments.find(a => a.id === idOrCode || a.code.toLowerCase() === String(idOrCode).toLowerCase()) || null);
}

export async function setAppointmentStatus(id, status) {
  const d = load(); const a = d.appointments.find(x => x.id === id);
  if (!a) throw new Error('ไม่พบคิวนี้');
  a.status = status; save(); return clone(a);
}

export async function removeAppointment(id) {
  const d = load(); d.appointments = d.appointments.filter(a => a.id !== id);
  d.reminders = d.reminders.filter(r => r.apptId !== id); save(); return true;
}

/* ---------- reminders queue (Phase 4 writes, admin reads) ---------- */
export function _rawDB() { return load(); }
export function _save() { save(); }
