/* ============================================================
   deliverDraft.js — งานส่งมอบที่คนขับ "บันทึกไว้ก่อน" (เก็บในมือถือเครื่องนั้นเท่านั้น)

   หน้าต่างส่งมอบมีหลายขั้น (รูปสินค้า → เซ็น → ใบ Invoice ทีละบิล) คนขับกดบันทึกกลางทาง
   ออกไปทำอย่างอื่น แล้วกลับมาทำต่อที่ขั้นเดิมได้ — ไม่ขึ้นคลาวด์ จนกว่าจะกดยืนยันส่งจริง
     รูป / ลายเซ็น → IndexedDB (ใหญ่ เกินเพดาน localStorage)
     ป้ายสรุป (ขั้นที่ทำถึง) → localStorage ให้หน้าเที่ยวอ่านได้ทันทีตอนวาดแถว
   หนึ่งงานค้าง = คนขับหนึ่งคน × ชุดบิลของร้านนั้น · รูปใบ Invoice เก็บตามรหัสบิล
   ชุดบิลเปลี่ยน (บางบิลส่งไปแล้ว) ก็ยังกู้ได้ เพราะจับคู่ด้วยบิลที่ซ้อนกัน
   ============================================================ */

const DB_NAME = 'ft.drafts';
const STORE = 'deliver';
const IDX_KEY = 'ft.deliverDrafts';

let dbp = null;
function db(){
  if (!dbp) dbp = new Promise((res, rej) => {
    if (!globalThis.indexedDB) return rej(new Error('เครื่องนี้บันทึกงานค้างไม่ได้'));
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(new Error('เครื่องนี้บันทึกงานค้างไม่ได้ (โหมดส่วนตัว?)'));
  });
  return dbp;
}
async function tx(mode, fn){
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => res(out?.result);
    t.onerror = () => rej(t.error || new Error('บันทึกงานค้างไม่สำเร็จ'));
  });
}

/* ---------- ป้ายสรุป (localStorage) ---------------------------- */
function readIdx(){
  try{ return JSON.parse(localStorage.getItem(IDX_KEY) || '{}') || {}; }catch{ return {}; }
}
function writeIdx(idx){
  try{ localStorage.setItem(IDX_KEY, JSON.stringify(idx)); }catch(e){ console.warn('[deliverDraft]', e); }
}

const keyOf = (driverId, stopIds) => `${driverId}|${[...stopIds].sort().join(',')}`;
const overlaps = (a, b) => a.some(x => b.includes(x));

/** งานค้างที่มีบิลนี้อยู่ (ของคนขับคนนี้) — ใช้วาดป้ายในหน้าเที่ยว · ไม่มี = null
 *  @returns {{stage:number, of:number, at:number}|null} */
export function draftFor(stopId, driverId){
  const idx = readIdx();
  const hit = Object.values(idx).filter(v => v.driverId === driverId && v.stopIds.includes(stopId))
    .sort((a, b) => b.at - a.at)[0];
  return hit ? { stage: hit.stage, of: hit.of, at: hit.at } : null;
}

/** ป้ายสั้น ๆ ต่อท้ายแถวจุดส่ง — ไม่มีงานค้าง = '' */
export function draftBadge(stopId, driverId){
  const d = draftFor(stopId, driverId);
  return d ? `<span class="tiny strong" style="display:block;color:var(--amber-ink)">💾 บันทึกค้างไว้ · ขั้น ${d.stage}/${d.of}</span>` : '';
}

/**
 * บันทึกงานค้าง — ทับของเดิมที่บิลซ้อนกัน
 * @param {{driverId:string, stopIds:string[], stage:number, of:number,
 *          cargo:string[], inv:Object<string,string[]>, sig:string|null, receiver:string, note:string}} d
 */
export async function saveDraft(d){
  await dropDrafts(d.driverId, d.stopIds);
  const key = keyOf(d.driverId, d.stopIds);
  const rec = { ...d, key, at: Date.now() };
  await tx('readwrite', s => s.put(rec, key));
  const idx = readIdx();
  idx[key] = { driverId: d.driverId, stopIds: [...d.stopIds], stage: d.stage, of: d.of, at: rec.at };
  writeIdx(idx);
}

/** งานค้างล่าสุดที่บิลซ้อนกับชุดนี้ · ไม่มี = null */
export async function loadDraft(driverId, stopIds){
  const idx = readIdx();
  const key = Object.keys(idx).filter(k => idx[k].driverId === driverId && overlaps(idx[k].stopIds, stopIds))
    .sort((a, b) => idx[b].at - idx[a].at)[0];
  if (!key) return null;
  try{
    const rec = await tx('readonly', s => s.get(key));
    if (rec) return rec;
  }catch(e){ console.warn('[deliverDraft]', e); }
  /* ป้ายมีแต่รูปหาย (ล้างข้อมูลเว็บไปบางส่วน) — เก็บป้ายทิ้ง */
  delete idx[key]; writeIdx(idx);
  return null;
}

/** ลบงานค้างทุกชุดที่บิลซ้อนกัน — เรียกหลังยืนยันส่งสำเร็จ หรือคนขับกดทิ้ง */
export async function dropDrafts(driverId, stopIds){
  const idx = readIdx();
  const keys = Object.keys(idx).filter(k => idx[k].driverId === driverId && overlaps(idx[k].stopIds, stopIds));
  if (!keys.length) return;
  keys.forEach(k => delete idx[k]);
  writeIdx(idx);
  try{ await tx('readwrite', s => { keys.forEach(k => s.delete(k)); }); }
  catch(e){ console.warn('[deliverDraft]', e); }
}

/** หลังส่งบางบิลของร้าน (6 พ.ย. · แนบรูปไว้ก่อน) — เอาบิลที่ส่งแล้วออกจากงานค้าง
 *  บิลที่ยังไม่ส่งแต่มีรูปเลขที่บิลแนบไว้ เก็บต่อ (รูปสินค้า/ลายเซ็นใช้ไปแล้ว ทิ้ง) · ไม่เหลือรูปเลย = ลบทิ้ง */
export async function trimDrafts(driverId, doneIds){
  const idx = readIdx();
  const keys = Object.keys(idx).filter(k => idx[k].driverId === driverId && overlaps(idx[k].stopIds, doneIds));
  for (const k of keys){
    let rec = null;
    try{ rec = await tx('readonly', s => s.get(k)); }catch{}
    const rest = (rec?.stopIds || []).filter(id => !doneIds.includes(id));
    const inv = Object.fromEntries(rest.map(id => [id, rec?.inv?.[id] || []]).filter(([, v]) => v.length));
    await dropDrafts(driverId, [...(rec?.stopIds || idx[k].stopIds)]);
    if (Object.keys(inv).length){
      await saveDraft({ driverId, stopIds: rest, stage: 1, of: 2 + rest.length,
        cargo: [], inv, sig: null, receiver: rec?.receiver || '', note: '', outcome: '' });
    }
  }
}
