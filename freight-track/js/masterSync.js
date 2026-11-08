/* ============================================================
   masterSync.js — สั่งส่งเที่ยวขึ้นชีตรวม (Master) ทันทีหลังพนักงานกดบันทึก

   ปกติ Apps Script เช็คเองทุก 5 นาที (AppsScript-master.gs ส่วน "ซิงก์สองทาง")
   ตัวนี้แค่เร่งให้ขึ้นเลย — รอให้ Firestore ได้เอกสารที่เพิ่งแก้ก่อน เพราะ Apps Script อ่านจากที่นั่น
   เที่ยวที่ยังส่งไม่ครบทุกจุด สคริปต์ยังไม่เขียนลงชีต (ขึ้นเองเมื่อส่งครบ)
   ใช้ได้เฉพาะฝั่งพนักงาน (ต้องมีโทเคนพนักงาน) — หน้าผู้ช่วยคนขับรอรอบ 5 นาที
   ใบวางบิล (pushBill) ไม่ต้องรอส่งครบ — แท็บ Billing รับทุกครั้งที่ใบเปลี่ยน
   ============================================================ */

import { toast } from './ui.js';
import { flushNow } from './store.js';
import { apiPost, hasApi } from './api.js';

/**
 * @param {string|string[]} jobIds เที่ยวที่เพิ่งแก้
 * @param {string} coll   คอลเลกชันของเอกสารที่เพิ่งแก้ ('jobs' | 'shipments')
 * @param {string} docId  เอกสารนั้น — รอจนขึ้นคลาวด์ก่อนสั่ง
 * @param {{quiet?:boolean}} opts quiet = ไม่ต้องบอกเมื่อสำเร็จ/ยังไม่ครบ (หน้าที่บันทึกถี่ เช่น ช่องค่าขนส่ง)
 */
export async function pushMaster(jobIds, coll, docId, { quiet = false } = {}){
  const ids = (Array.isArray(jobIds) ? jobIds : [jobIds]).filter(Boolean);
  if (!hasApi() || !ids.length) return;
  if (!(await flushNow(coll, docId))){
    return toast('ยังส่งข้อมูลขึ้นคลาวด์ไม่ได้ — ชีตรวมจะอัปเดตให้เองเมื่อเน็ตกลับมา (ภายใน 5 นาที)', 'warn', 6000);
  }
  try{
    const r = await apiPost({ action:'syncMaster', jobIds: ids });
    if (quiet) return;
    if (!r.complete) toast('เที่ยวนี้ยังส่งไม่ครบทุกจุด — จะขึ้นชีตรวมเมื่อส่งครบ', 'info', 5000);
    else if (r.waiting?.length) toast(`ยังไม่มีเลข ${r.waiting.join(', ')} ในชีตรวม (รอไฟล์ขาว) — เข้าเมื่อไหร่จะเติมให้เอง`, 'warn', 7000);
    else toast(r.wrote ? 'อัปเดตชีตรวม (Master) แล้ว' : 'ชีตรวม (Master) ตรงกับแอปอยู่แล้ว', 'ok');
  }catch(err){
    console.error('[masterSync] ส่งขึ้นชีตรวมไม่สำเร็จ', err);
    toast(`ส่งขึ้นชีตรวมไม่สำเร็จ (${err.message}) — ตัวตั้งเวลาจะลองให้อีกครั้งภายใน 5 นาที`, 'warn', 7000);
  }
}

/**
 * ลบงาน (31 ต.ค.): ให้ Apps Script ลบแถวในชีต Master ของจุดส่งที่ติดป้าย masterPurge ให้เสร็จก่อน
 * แอปถึงจะลบเอกสารจริงได้ (สคริปต์อ่านป้ายจาก Firestore — ลบเอกสารก่อน = แถวในชีตค้างตลอดไป)
 * @returns {Promise<boolean>} true = ชีตลบเสร็จแล้ว ลบในแอปต่อได้
 */
export async function purgeMaster(jobIds, stopIds = []){
  const ids = (Array.isArray(jobIds) ? jobIds : [jobIds]).filter(Boolean);
  if (!hasApi() || !ids.length) return false;
  for (const id of stopIds) if (!(await flushNow('shipments', id))) return false;
  try{
    await apiPost({ action:'syncMaster', jobIds: ids });
    return true;
  }catch(err){
    console.error('[masterSync] ลบแถวในชีตรวมไม่สำเร็จ', err);
    return false;
  }
}

/**
 * ใบวางบิล → แท็บ Billing (+ เที่ยวในใบ ถ้าให้มา) — ใบเขียน Firestore ตรงอยู่แล้ว ไม่ต้องรอกล่องขาออก
 * เงียบเมื่อสำเร็จ (หน้า billing ขึ้นข้อความของตัวเองอยู่แล้ว) — บอกเฉพาะตอนส่งไม่ได้
 */
export async function pushBill(billId){
  if (!hasApi() || !billId) return;
  try{
    await apiPost({ action:'syncMaster', billIds: [billId] });
  }catch(err){
    console.error('[masterSync] ส่งใบวางบิลขึ้นชีตรวมไม่สำเร็จ', err);
    toast(`ส่งใบวางบิลขึ้นชีตรวมไม่สำเร็จ (${err.message}) — ตัวตั้งเวลาจะลองให้อีกครั้งภายใน 5 นาที`, 'warn', 7000);
  }
}
