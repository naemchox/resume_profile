/* ============================================================
   cloud.js — ซิงก์ข้อมูลกับ Firebase และอัปโหลดรูปขึ้น Storage

   หลักการ
     อ่าน  — Firestore ส่งข้อมูลมาเองผ่าน onSnapshot แล้วเรายัดเข้าแคชของ store.js
             หน้าจอทุกหน้าจึงยังอ่านแบบ synchronous ได้เหมือนเดิม ไม่ต้องแก้สักบรรทัด
     เขียน — เขียนลงเครื่องก่อนให้จอขยับทันที แล้วค่อยดันขึ้นคลาวด์เบื้องหลัง
             เน็ตหลุดก็ยังใช้งานต่อได้ กลับมาแล้วค่อยส่ง

   รูปถ่าย — ไม่เก็บลง Firestore เด็ดขาด (เอกสารละไม่เกิน 1 MB)
             อัปขึ้น Storage แล้วเก็บแค่ URL ในฐานข้อมูล
   ============================================================ */

import { fitDataUrl } from './imageFit.js';
import { countPhotos } from './photoQuota.js';

const COLLECTIONS = ['jobs', 'shipments', 'drivers'];

let fb = null;
let ready = false;
const waiters = [];

function whenReady(){
  return new Promise((resolve) => {
    if (window.firebase) return resolve(window.firebase);
    addEventListener('firebase-ready', () => resolve(window.firebase), { once: true });
  });
}

/** เชื่อมต่อครั้งเดียวตอนเริ่ม — คืน false ถ้าใช้คลาวด์ไม่ได้ */
export async function initCloud(){
  fb = await whenReady();
  ready = !!fb?.ok;
  waiters.splice(0).forEach(fn => fn(ready));
  return ready;
}

export const cloudReady = () => ready;
export const onCloud = (fn) => (ready ? fn(true) : waiters.push(fn));

/* ---------- อ่าน: ฟังทุกคอลเลกชันแล้วส่งต่อให้ store ---------- */
/**
 * @param {(name:string, rows:object[]) => void} apply เรียกทุกครั้งที่ข้อมูลเปลี่ยน
 * @param {{driverId?:string}} scope  มี driverId = คนขับ → ดึงเฉพาะเที่ยว/จุดส่งของคนนั้น
 *        (กฎฐานข้อมูลไม่ยอมให้คนขับดึงทั้งคอลเลกชัน การถามแบบกรองจึงจำเป็น ไม่ใช่แค่ประหยัด)
 * @returns {() => void} ฟังก์ชันเลิกฟัง
 */
export function watchAll(apply, scope = {}){
  if (!ready) return () => {};
  const onErr = (name) => (err) => console.error(`[cloud] ฟัง ${name} ไม่ได้`, err);
  const rowsOf = (snap) => { const rows = []; snap.forEach(d => rows.push(d.data())); return rows; };

  if (!scope.driverId){
    const offs = ['jobs', 'shipments'].map(name =>
      fb.onSnapshot(fb.collection(fb.db, name), (snap) => apply(name, rowsOf(snap)), onErr(name)));
    /* รายชื่อคนขับ + token ลิงก์คนขับภายนอก (driverLinks — อ่านได้เฉพาะพนักงานที่แก้คนขับได้)
       เอา token มาแปะกลับเข้าแถวคนขับในเครื่อง หน้าข้อมูลคนขับจะคัดลอกลิงก์ได้เหมือนเดิม */
    let drivers = null, links = new Map(), migrated = false;
    const pushDrivers = () => {
      if (!drivers) return;
      apply('drivers', drivers.map(d => (links.has(d.id) ? { ...d, token: links.get(d.id) } : d)));
    };
    offs.push(fb.onSnapshot(fb.collection(fb.db, 'drivers'), (snap) => {
      drivers = rowsOf(snap);
      /* ข้อมูลเก่ายังมี token อยู่ในเอกสารคนขับ (คนขับทุกคนอ่านได้) — ย้ายไป driverLinks ครั้งเดียว */
      const old = drivers.filter(d => d.token);
      if (old.length && !migrated){ migrated = true; putDocs('drivers', old).catch(() => {}); }
      old.forEach(d => { if (!links.has(d.id)) links.set(d.id, d.token); });
      pushDrivers();
    }, onErr('drivers')));
    offs.push(fb.onSnapshot(fb.collection(fb.db, 'driverLinks'), (snap) => {
      links = new Map();
      snap.forEach(d => { const v = d.data(); if (v?.token) links.set(d.id, v.token); });
      pushDrivers();
    }, (err) => { if (err?.code !== 'permission-denied') onErr('driverLinks')(err); }));
    return () => offs.forEach(off => { try{ off(); }catch(e){} });
  }

  /* คนขับ: เที่ยว/จุดส่งที่มีชื่ออยู่ใน driverIds หรือเป็น driverId (ข้อมูลเก่าบางใบมีแค่ช่องนี้)
     สองคำถามต่อคอลเลกชัน แล้วรวมกันก่อนส่งให้ store — ส่งเมื่อได้คำตอบครบทั้งสองแล้วเท่านั้น
     ไม่งั้น store จะเห็นข้อมูลครึ่งเดียวแล้วนึกว่าอีกครึ่งถูกลบ */
  const id = scope.driverId;
  const offs = [];
  for (const name of ['jobs', 'shipments']){
    const qs = [
      fb.query(fb.collection(fb.db, name), fb.where('driverIds', 'array-contains', id)),
      fb.query(fb.collection(fb.db, name), fb.where('driverId', '==', id)),
    ];
    /* ผู้รวบรวมบิลคืน (store.js isBillCollector) — งานของทุกคนตั้งแต่วันที่ since (กฎ isCollector ยอมให้อ่าน) */
    if (scope.since) qs.push(fb.query(fb.collection(fb.db, name), fb.where('serviceDate', '>=', scope.since)));
    const parts = qs.map(() => null);
    const push = () => {
      if (parts.some(p => !p)) return;
      const byId = new Map();
      parts.flat().forEach(r => r?.id && byId.set(r.id, r));
      apply(name, [...byId.values()]);
    };
    qs.forEach((q, i) => offs.push(fb.onSnapshot(q, (snap) => { parts[i] = rowsOf(snap); push(); }, onErr(name))));
  }
  /* รายชื่อคนขับ — คนขับอ่านได้ทั้งหมด (เห็นชื่อเพื่อนร่วมเที่ยว) · ไม่มี PIN อยู่ในนี้แล้ว */
  offs.push(fb.onSnapshot(fb.collection(fb.db, 'drivers'), (snap) => apply('drivers', rowsOf(snap)), onErr('drivers')));
  return () => offs.forEach(off => { try{ off(); }catch(e){} });
}

/* ---------- เขียน ---------------------------------------- */
/** ดันข้อมูลทั้งชุดขึ้นคลาวด์ — ใช้ตอนนำเข้าครั้งใหญ่หรือรีเซ็ต */
export async function pushAll(db){
  if (!ready) return false;
  try{
    for (const name of COLLECTIONS){
      const rows = db[name] || [];
      /* Firestore จำกัด batch ละ 500 คำสั่ง แบ่งเป็นก้อน ๆ */
      const step = name === 'drivers' ? 200 : 400;   /* คนขับ 1 แถว = 2 คำสั่ง (drivers + driverLinks) */
      for (let i = 0; i < rows.length; i += step){
        const batch = fb.writeBatch(fb.db);
        rows.slice(i, i + step).forEach(row => setRow(batch, name, row));
        await batch.commit();
      }
    }
    await fb.setDoc(fb.doc(fb.db, 'meta', 'settings'), strip(db.settings || {}));
    return true;
  }catch(err){
    console.error('[cloud] ดันข้อมูลขึ้นไม่สำเร็จ', err);
    return false;
  }
}

/**
 * เขียนหลายเอกสารในคอลเลกชันเดียว — ใช้ตอนซิงก์เฉพาะใบที่เปลี่ยน
 *
 * ค่าใช้จ่ายเท่ากับ putDoc ทีละใบ (Firebase คิดต่อ "เอกสาร" ไม่ใช่ต่อคำสั่ง)
 * แต่ยิงรอบเดียวต่อ 400 ใบ ตอนนำเข้า Excel ร้อยกว่าแถวจะไม่ต้องรอทีละรอบ
 *
 * @returns {Promise<number>} จำนวนใบที่เขียนสำเร็จ
 */
export async function putDocs(name, rows){
  const list = (rows || []).filter(r => r?.id);
  if (!ready || !list.length) return 0;
  let done = 0;
  const step = name === 'drivers' ? 200 : 400;     /* คนขับ 1 แถว = 2 คำสั่ง (drivers + driverLinks) */
  for (let i = 0; i < list.length; i += step){
    const chunk = list.slice(i, i + step);
    try{
      const batch = fb.writeBatch(fb.db);
      chunk.forEach(row => setRow(batch, name, row));
      await batch.commit();
      done += chunk.length;
    }catch(err){
      console.error(`[cloud] เขียน ${name} ${chunk.length} ใบไม่สำเร็จ`, err);
    }
  }
  return done;
}

/** ลบหลายเอกสารในคอลเลกชันเดียว — คู่กับ putDocs */
export async function removeDocs(name, ids){
  const list = (ids || []).filter(Boolean);
  if (!ready || !list.length) return 0;
  let done = 0;
  for (let i = 0; i < list.length; i += 200){
    const chunk = list.slice(i, i + 200);
    try{
      const batch = fb.writeBatch(fb.db);
      chunk.forEach(id => {
        batch.delete(fb.doc(fb.db, name, id));
        if (name === 'drivers') batch.delete(fb.doc(fb.db, 'driverLinks', id));
      });
      await batch.commit();
      done += chunk.length;
    }catch(err){
      console.error(`[cloud] ลบ ${name} ${chunk.length} ใบไม่สำเร็จ`, err);
    }
  }
  return done;
}

/** เขียนเอกสารเดียว — ใช้ตอนแก้งานทีละใบ */
export async function putDoc(name, row){
  if (!ready || !row?.id) return false;
  try{
    const batch = fb.writeBatch(fb.db);
    setRow(batch, name, row);
    await batch.commit();
    return true;
  }catch(err){
    console.error(`[cloud] เขียน ${name}/${row.id} ไม่สำเร็จ`, err);
    return false;
  }
}

export async function removeDoc(name, id){
  if (!ready || !id) return false;
  try{ await fb.deleteDoc(fb.doc(fb.db, name, id)); return true; }
  catch(err){ console.error(`[cloud] ลบ ${name}/${id} ไม่สำเร็จ`, err); return false; }
}

/** ล้างทุกคอลเลกชัน — ใช้คู่กับปุ่ม "ล้างข้อมูลทั้งหมด" */
/* ---------- ล้างงานทั้งหมด (ปุ่ม "ล้างข้อมูลทั้งหมด" หน้า ops) ----------
   จดเวลาที่ล้างไว้ที่ meta/wipe — เครื่องอื่นที่ยังจำงานเก่าไว้ในเบราว์เซอร์
   จะได้ไม่ดันงานเก่ากลับขึ้นคลาวด์ตอนเปิดหน้าแล้วเจอคลาวด์ว่าง (store.js applyFromCloud) */
export async function markWiped(by = ''){
  if (!ready) return false;
  try{ await fb.setDoc(fb.doc(fb.db, 'meta', 'wipe'), { at: Date.now(), by }); return true; }
  catch(err){ console.error('[cloud] จดเวลาล้างข้อมูลไม่สำเร็จ', err); return false; }
}
/** เวลาที่ล้างงานครั้งล่าสุด (ms) — ไม่เคยล้าง/อ่านไม่ได้ = 0 */
export async function wipedAt(){
  if (!ready) return 0;
  try{ const d = await fb.getDoc(fb.doc(fb.db, 'meta', 'wipe')); return (d.exists() && Number(d.data().at)) || 0; }
  catch(err){ return 0; }
}
/** ลบรูปใน Storage จากลิงก์ที่เก็บในงาน — คืนจำนวนที่ลบได้ (รูปที่หายไปแล้วนับว่าลบได้) */
export async function removePhotos(urls){
  if (!ready) return 0;
  const res = await Promise.allSettled([...new Set(urls || [])].map(u =>
    fb.deleteObject(fb.storageRef(fb.storage, u)).catch(err => {
      if (err?.code !== 'storage/object-not-found') throw err;
    })));
  const bad = res.filter(r => r.status === 'rejected');
  if (bad.length) console.warn(`[cloud] ลบรูปไม่ได้ ${bad.length} รูป`, bad[0].reason);
  return res.length - bad.length;
}

export async function wipeCloud(){
  if (!ready) return false;
  try{
    for (const name of COLLECTIONS){
      const snap = await fb.getDocs(fb.collection(fb.db, name));
      const ids = []; snap.forEach(d => ids.push(d.id));
      for (let i = 0; i < ids.length; i += 400){
        const batch = fb.writeBatch(fb.db);
        ids.slice(i, i + 400).forEach(id => batch.delete(fb.doc(fb.db, name, id)));
        await batch.commit();
      }
    }
    return true;
  }catch(err){ console.error('[cloud] ล้างข้อมูลไม่สำเร็จ', err); return false; }
}

/* Firestore ไม่รับ undefined และไม่รับ Map/Set — ล้างให้สะอาดก่อนส่ง
   PIN คนขับไม่ขึ้นฐานข้อมูลเด็ดขาด (คนขับทุกคนอ่านรายชื่อคนขับได้) — รหัสจริงอยู่ใน Google Sheet
   ที่เดียว และตรวจที่ Apps Script · PIN ในเครื่องใช้แค่ส่งขึ้นชีตตอนเพิ่ม/แก้คนขับ
   เลขที่บัญชี/ธนาคารของคนขับก็เหมือนกัน — อยู่ในชีต (ช่อง F/G) กับในเครื่องเท่านั้น */
const PRIVATE = ['pin', 'bankAccount', 'bankName'];
const strip = (o) => {
  const out = JSON.parse(JSON.stringify(o ?? {}));
  if (out && typeof out === 'object') PRIVATE.forEach(k => { delete out[k]; });
  return out;
};

/** เขียนหนึ่งแถวลง batch — คนขับ: token ลิงก์คนขับภายนอกแยกไปเก็บที่ driverLinks/{id}
 *  (คนขับทุกคนอ่าน drivers ได้ ถ้า token อยู่ในนั้นจะเอาไปสวมเป็นคนขับภายนอกได้ — QA TC-058) */
function setRow(batch, name, row){
  const data = strip(row);
  if (name === 'drivers'){
    const token = data.token;
    delete data.token;
    if (data.external && token) batch.set(fb.doc(fb.db, 'driverLinks', row.id), { id: row.id, token });
  }
  batch.set(fb.doc(fb.db, name, row.id), data);
}

/* ---------- ข้อมูลหน้าติดตามพัสดุ (สาธารณะ) ----------------
   หน้า track.html เปิดได้โดยไม่ล็อกอิน แต่กฎฐานข้อมูลไม่ให้คนนอกอ่าน shipments
   จึงเก็บสำเนาไว้อีกที่ อ่านได้เฉพาะเมื่อรู้เลข (ดึงรายการทั้งหมดไม่ได้)
     trackKeys/{เลขที่ลูกค้าค้น}  → { sids:[รหัสจุดส่ง] }    เลข Invoice · เลขฐาน · เลขเก่า · เลข Delivery
     trackData/{รหัสจุดส่ง}        → ข้อมูลที่หน้าติดตามแสดง + คนขับ (ชื่อ · รถ · ทะเบียน) — ไม่มีข้อมูลส่วนบุคคล
   คนขับเขียนได้เฉพาะ trackData ของจุดส่งตัวเอง · trackKeys เขียนได้เฉพาะพนักงาน */

/** เลขที่ลูกค้าใช้ค้นจุดส่งนี้ได้ — ตรงกับ findShipments() ใน store.js */
export const trackKeysOf = (s) => [...new Set([s.code, s.baseCode, s.delivery, ...(s.altCodes || [])]
  .map(k => String(k ?? '').trim().toUpperCase())
  .filter(k => k && !k.includes('/') && k.length <= 120))];

/** ตัดของภายในออกก่อนเปิดสาธารณะ — เหลือเท่าที่หน้าติดตามใช้
 *  หน้า track เปิดให้ทุกคนที่รู้เลข และเลข Invoice/Delivery เรียงต่อกันเดาได้ (QA TC-173/239)
 *  จึงไม่เปิดข้อมูลส่วนบุคคล: เบอร์คนขับ/ผู้รับ · มูลค่าบิลและไฟล์ใบแจ้งหนี้ · ลายเซ็น · พิกัด GPS
 *  · ข้อความภายในของไทม์ไลน์ · เหตุการณ์แก้ไขข้อมูล — เหลือสถานะ เวลา รูปส่งมอบ ชื่อคนขับ ทะเบียนรถ
 *  ยกเว้น pod = ลายเซ็นผู้รับ + รูปใบ Invoice ของการส่งมอบล่าสุด — ผู้ใช้ตัดสินใจ (19 ต.ค. 2026) ให้ลูกค้าพิมพ์ PDF
 *  จากหน้าติดตามได้ครบเหมือน POD ทั้งที่รู้ว่าคนเดาเลขถูกจะเห็นด้วย · track.js วาดช่องนี้เฉพาะตอนพิมพ์ */
function publicStop(s, drivers){
  const out = strip(s);
  ['source', 'driverIds', 'ownDriverIds', 'payments', 'payment', 'collected', 'invoiceReturns', 'invoiceReturn', 'realtime', 'pay', 'billing', 'revenue']
    .forEach(k => { delete out[k]; });
  out.customer = { name: s.customer?.name || '' };
  out.pickup = { name: s.pickup?.name || '', address: s.pickup?.address || '' };
  out.dropoff = { name: s.dropoff?.name || '', address: s.dropoff?.address || '' };
  out.invoice = { number: s.invoice?.number || '', public: true };
  /* เลข Shipment (เลข 7) — หน้าติดตามใช้แยกบิลเลขซ้ำ (ส่งใหม่ด้วย Invoice เดิม) ให้ลูกค้าติ๊กเลือก · ไม่ใช่ข้อมูลส่วนบุคคล */
  out.shipmentNo = s.source?.shipmentNo || '';
  /* รีพอร์ต JOBLIST หน้าติดตาม (6 พ.ย. — ลูกค้าขอ · js/jobReport.js): เขต = กลุ่มจัดส่งโดย · qty = จำนวนสินค้ารวมทุกรายการ */
  const items = Array.isArray(s.source?.items) ? s.source.items : [];
  out.report = { zone: s.source?.tripGroup || '', qty: items.reduce((n, x) => n + (Number(x?.qty) || 0), 0) };
  const c = s.cargo || {};
  out.cargo = { desc: c.desc || '', pieces: c.pieces || 0, unit: c.unit || '', weightKg: c.weightKg || 0 };
  /* รูปที่คนขับเพิ่มทีหลัง (event edited · addTo = id ของ event ปิดจุด — store.js addDeliveryPhotos)
     event แก้ไขไม่เปิดสาธารณะ จึงรวมรูปเข้า event ปิดจุดแทน */
  const adds = (id, k) => (s.events || []).filter(e => e?.addTo && e.addTo === id).flatMap(e => e[k] || []);
  out.events = (out.events || [])
    .filter(e => e && e.status !== 'edited' && e.scope !== 'ops' && !/^ค่ารอบ:/.test(e.note || ''))
    .map(e => ({ id: e.id || '', status: e.status, at: e.at, byRole: e.byRole || '', byName: e.byName || '',
                 /* ผลการส่งตอนปิดจุด (6 พ.ย. — ลูกค้าขอ: ส่งไม่สำเร็จต้องขึ้นว่า "ส่งไม่สมบูรณ์" ที่หน้าติดตาม ไม่ใช่ "ส่งมอบสำเร็จ") */
                 ...(e.status === 'delivered' && e.outcome && e.outcome !== 'ok' ? { outcome: e.outcome } : {}),
                 label: e.label || '', photos: [...(e.photos || []), ...(e.status === 'delivered' ? adds(e.id, 'photos') : [])]
                   .filter(p => /^https?:\/\//i.test(p)) }));
  const url = (p) => typeof p === 'string' && /^https?:\/\//i.test(p);
  const dev = s.status === 'delivered' ? [...(s.events || [])].reverse().find(e => e?.status === 'delivered') : null;
  /* geo = พิกัดตอนปิดจุดส่งเท่านั้น (ผู้ใช้ขอ 31 ต.ค.: ใส่ใน POD หน้าติดตาม เป็นตัวเลข) · พิกัดขั้นอื่นไม่เปิดสาธารณะ */
  const g = dev?.geo;
  const geo = g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng))
    ? { lat: Number(g.lat), lng: Number(g.lng), acc: Number(g.acc) || 0 } : null;
  out.pod = dev ? { at: dev.at || '', signature: url(dev.signature) ? dev.signature : '',
                    invoicePhotos: [...(dev.invoicePhotos || []), ...adds(dev.id, 'invoicePhotos')].filter(url), geo } : null;
  const d = s.driverId ? drivers.find(x => x.id === s.driverId) : null;
  /* ชื่อพร้อมประเภทคนขับ — ตรงกับ driverName ใน store.js (ไฟล์นี้ไม่ import store) */
  const fleet = (d && (d.external === true || d.fleet === 'รถนอก')) ? 'รถนอก' : 'รถประจำ';
  out.driver = d ? { name:d.name ? `${d.name} (${fleet})` : '', truck:d.truck || '', plate:d.plate || '' } : null;
  return out;
}

/**
 * เขียนสำเนาสำหรับหน้าติดตาม
 * @param {object[]} stops   จุดส่งที่เปลี่ยน
 * @param {object[]} drivers รายชื่อคนขับ (เอาชื่อ/ทะเบียนมาแนบ)
 * @param {{keys?:boolean}} opts keys=false = เขียนแค่ trackData (คนขับไม่มีสิทธิ์เขียน trackKeys)
 * @returns {Promise<number>} จำนวนใบที่เขียนสำเร็จ
 */
export async function putTracking(stops, drivers, { keys = true } = {}){
  const list = (stops || []).filter(s => s?.id);
  if (!ready || !list.length) return 0;
  let done = 0;
  for (let i = 0; i < list.length; i += 80){
    const chunk = list.slice(i, i + 80);
    /* ใบละ 1 + เลขค้นหา ~4 = ~5 คำสั่ง · batch รับได้ 500 → ก้อนละ 80 ใบ */
    try{
      const batch = fb.writeBatch(fb.db);
      chunk.forEach(s => {
        batch.set(fb.doc(fb.db, 'trackData', s.id), publicStop(s, drivers || []));
        if (keys) trackKeysOf(s).forEach(k =>
          batch.set(fb.doc(fb.db, 'trackKeys', k), { sids: fb.arrayUnion(s.id) }, { merge:true }));
      });
      await batch.commit();
      done += chunk.length;
    }catch(err){
      console.error(`[cloud] เขียนข้อมูลหน้าติดตาม ${chunk.length} ใบไม่สำเร็จ`, err);
    }
  }
  return done;
}

/** ลบสำเนาหน้าติดตามของจุดส่งที่ถูกลบ (เลขค้นหาค้างไว้ได้ — ชี้ไปหาใบที่ไม่มีแล้วก็แค่ "ไม่พบ") */
export async function removeTracking(ids){
  return removeDocs('trackData', ids);
}

/* ---------- รูปถ่าย: อัปขึ้น Storage ---------------------- */
/* ชื่อรูปหลักฐานใน Storage (ผู้ใช้สั่ง 26 ต.ค. 2026 — ชื่อเดิมเป็นรหัสภายใน + เวลาสุ่ม อ่านไม่ออก)
     จุดส่ง: evidence/SN/<เลข 5>/<เลข 5>_<ขั้น>_<ชนิด>_<ปีเดือนวัน-เวลา>_<ลำดับ>-<สุ่ม 4>.jpg
     เที่ยว: evidence/TRIP/<เลขเที่ยว>/<เลขเที่ยว>_<ขั้น>_<ชนิด>_…  (รูปที่ไม่ได้เป็นของบิลใดบิลหนึ่ง)
   เลข 5 = Sales Number (stop.delivery) — ใช้ทุกจุดให้เป็นแบบเดียวกัน แม้มี Invoice แล้ว · ไม่มีเลข 5 (งานด่วน/สร้างเอง) ใช้เลขบิล
   ชนิด: cargo รูปสินค้า · invoice ใบ Invoice · signature ลายเซ็น · slip หลักฐานชำระ
   สุ่ม 4 ตัวท้าย — บิลแยก -1 -2 ใช้เลข 5 เดียวกันและอัปพร้อมกันได้ กันชื่อชนแล้วรูปทับกัน
   รูปที่อัปก่อนหน้านี้ยังอยู่ที่เดิม (evidence/<รหัสภายใน>/…) ไม่ได้ย้าย */
const seg = (v) => String(v ?? '').trim()
  .replace(/[^0-9A-Za-z\u0E00-\u0E7F._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
const dirOf = (top, key, step, kind) => {
  const k = key || 'unknown';
  return { folder: `evidence/${top}/${k}`, base: `${k}_${seg(step) || 'photo'}_${seg(kind) || 'photo'}` };
};
/** ที่เก็บรูปของจุดส่ง — ตามเลข 5 */
export const stopPhotoDir = (x, step, kind) => dirOf('SN', seg(x?.delivery) || seg(x?.code) || seg(x?.id), step, kind);
/** ที่เก็บรูปของเที่ยว — ตามเลขเที่ยว */
export const jobPhotoDir = (j, step, kind = 'cargo') => dirOf('TRIP', seg(j?.code) || seg(j?.id), step, kind);

const stamp = () => {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * อัปรูปหนึ่งใบ คืน URL สำหรับเก็บในฐานข้อมูล
 * รับได้ทั้ง data URL (จากกล้อง) และ URL เดิม (ส่งคืนเลยไม่อัปซ้ำ)
 * @param {string} dataUrl
 * @param {{folder:string, base:string}|string} dir stopPhotoDir / jobPhotoDir · ข้อความ = โฟลเดอร์แบบเก่า ชื่อไฟล์สุ่ม
 * @param {number} n ลำดับรูปในชุด (ต่อท้ายชื่อไฟล์)
 */
/* ไม่ปล่อยให้คนขับรอนาน — Firebase Storage ตั้งต้นพยายามอัปซ้ำได้ถึง 10 นาทีตอนเน็ตหลุด
   ปุ่มจะค้าง "กำลังส่งรูป…" จนคนขับนึกว่าแอปค้างแล้วปิดทิ้ง จึงตัดที่ 30 วินาที
   หรือทันทีที่เครื่องแจ้งว่าเน็ตหลุด แล้วเก็บรูปไว้ในเครื่อง (base64) ให้อัปใหม่ทีหลัง
   (หน้าคนขับ/ผู้ช่วยขึ้นหน้าต่างถามให้อัปใหม่เมื่อเน็ตกลับมา — js/driver.js retryPhotos) */
const UPLOAD_GIVE_UP_MS = 30000;

/** รอจนเน็ตหลุดหรือหมดเวลา — คืน cancel() ไว้เลิกรอเมื่ออัปเสร็จก่อน */
function giveUp(ms){
  let done, timer;
  const p = new Promise((resolve) => {
    done = () => resolve('gave-up');
    timer = setTimeout(done, ms);
    addEventListener('offline', done, { once:true });
  });
  return { p, cancel(){ clearTimeout(timer); removeEventListener('offline', done); } };
}

export async function uploadPhoto(dataUrl, dir, n = 1){
  if (typeof dataUrl !== 'string') return null;
  if (/^https?:\/\//i.test(dataUrl)) return dataUrl;      /* อัปไปแล้ว */
  /* ทุกรูปไม่เกิน 300 KB ก่อนขึ้นคลาวด์ — รวมลายเซ็นและรูป base64 เก่าที่รออัปใหม่ */
  try{ dataUrl = await fitDataUrl(dataUrl); }catch(err){ console.warn('[cloud] ย่อรูปไม่สำเร็จ — อัปตัวเดิม', err); }
  if (!ready) return dataUrl;                              /* ต่อคลาวด์ไม่ได้ — เก็บ base64 ไปก่อน */
  if (navigator.onLine === false) return dataUrl;          /* ไม่มีเน็ต — ไม่ต้องลองให้เสียเวลา */

  const rnd = Math.random().toString(36).slice(2, 6);
  const path = typeof dir === 'string'
    ? `${dir}/${Date.now()}-${rnd}.jpg`
    : `${dir.folder}/${dir.base}_${stamp()}_${n}-${rnd}.jpg`;
  if (fb.storage && fb.storage.maxUploadRetryTime > UPLOAD_GIVE_UP_MS) fb.storage.maxUploadRetryTime = UPLOAD_GIVE_UP_MS;
  const stop = giveUp(UPLOAD_GIVE_UP_MS);
  try{
    const r = fb.storageRef(fb.storage, path);
    const up = fb.uploadString(r, dataUrl, 'data_url').then(() => fb.getDownloadURL(r));
    up.catch(() => {});   /* ถ้าเลิกรอไปแล้วแล้วมันค่อยล้มทีหลัง ไม่ต้องขึ้น error ซ้ำ */
    const url = await Promise.race([up, stop.p]);
    if (url === 'gave-up'){
      console.warn('[cloud] เน็ตหลุด/อัปนานเกิน — เก็บรูปไว้ในเครื่องรออัปใหม่', path);
      return dataUrl;
    }
    countPhotos(1);   /* โควตารูปรายเดือน (photoQuota.js) */
    return url;
  }catch(err){
    console.error('[cloud] อัปรูปไม่สำเร็จ — เก็บไว้ในเครื่องแทน', err);
    return dataUrl;
  }finally{
    stop.cancel();
  }
}

/** อัปหลายใบพร้อมกัน — ใบไหนพลาดจะคืน base64 เดิมไม่ให้หลักฐานหาย */
export async function uploadPhotos(list, dir){
  const arr = (list || []).filter(Boolean);
  if (!arr.length) return [];
  return Promise.all(arr.map((p, i) => uploadPhoto(p, dir, i + 1)));
}

/** ขนาดรวมของรูปที่ยังเป็น base64 — ใช้เตือนตอนพื้นที่ในเครื่องใกล้เต็ม */
export const isLocalPhoto = (p) => typeof p === 'string' && p.startsWith('data:');
