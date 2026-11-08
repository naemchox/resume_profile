/* ============================================================
   api.js — เรียก Apps Script Web App (ตัวกลางของ Google Sheet / Drive / บัตรผ่านคนขับ)

   ทุกคำขอจากฝั่ง Back office แนบโทเคนยืนยันตัว (idToken) ไปด้วยเสมอ
   Apps Script ถาม Google ว่าโทเคนเป็นของใคร แล้วเช็ครายชื่อพนักงานก่อนทำงาน
   ส่วนคำขอล็อกอินคนขับไม่ต้องมีโทเคน (ยังไม่ได้ล็อกอิน)

   หมายเหตุ CORS: Apps Script ไม่ตอบ preflight จึงต้องเป็น simple request เท่านั้น
     GET  — ส่งค่าทาง query string
     POST — Content-Type: text/plain (ห้ามใส่ header อื่น)
   ============================================================ */

import { APPS_SCRIPT_URL } from './config.js';
import { idToken } from './auth.js';

const LOCAL_KEY = 'ft.sheetApi';      /* ลิงก์ที่ตั้งจากหน้าข้อมูลคนขับ (แบบเดิม) */
const TIMEOUT = 20000;

/** ลิงก์ Apps Script ที่ใช้อยู่ — config.js ก่อน ไม่มีค่อยใช้ที่ตั้งไว้ในเครื่อง */
export function apiUrl(){
  if (window.__FT_EMU) return '';        /* โหมดทดสอบ (js/firebase.js) — ห้ามยิง Apps Script ของจริง */
  if (APPS_SCRIPT_URL) return APPS_SCRIPT_URL;
  try{ return localStorage.getItem(LOCAL_KEY) || ''; }catch{ return ''; }
}
export const hasApi = () => /^https:\/\/script\.google\.com\//.test(apiUrl());
/** ลิงก์มาจาก config.js (ทุกเครื่องได้เหมือนกัน) — หน้าข้อมูลคนขับจะไม่ให้แก้ลิงก์ในเครื่อง */
export const apiFromConfig = () => !!APPS_SCRIPT_URL;

export function setLocalApiUrl(url){
  const v = String(url || '').trim();
  if (v && !/^https:\/\/script\.google\.com\/.+/.test(v)){
    throw new Error('ลิงก์ต้องขึ้นต้นด้วย https://script.google.com/ (ลิงก์ที่ได้ตอนกด Deploy)');
  }
  try{ v ? localStorage.setItem(LOCAL_KEY, v) : localStorage.removeItem(LOCAL_KEY); }
  catch{ throw new Error('บันทึกลิงก์ไม่ได้ — เบราว์เซอร์ปิดการเก็บข้อมูลอยู่'); }
  return v;
}

async function parse(res){
  const text = await res.text();
  let data;
  try{ data = JSON.parse(text); }
  catch{ throw new Error('Apps Script ไม่ได้ตอบกลับเป็นข้อมูล — ตรวจว่า deploy เป็น Web app (Who has access: Anyone) และเป็นเวอร์ชันล่าสุด'); }
  if (!data.ok){
    const e = new Error(data.error || 'Apps Script ปฏิเสธคำขอ');
    e.code = data.code || '';
    throw e;
  }
  return data;
}

/**
 * POST ไปที่ Apps Script
 * @param {object} payload ต้องมี action
 * @param {{auth?:boolean, timeout?:number}} opts auth=true (ค่าตั้งต้น) แนบโทเคนพนักงาน
 */
export async function apiPost(payload, { auth = true, timeout = TIMEOUT } = {}){
  const url = apiUrl();
  if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์ Apps Script (APPS_SCRIPT_URL ใน js/config.js)');
  const body = { ...payload };
  if (auth) body.idToken = await idToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try{
    const res = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(body),
      redirect:'follow',
      signal:ctrl.signal,
    });
    return await parse(res);
  }catch(err){
    if (err.name === 'AbortError') throw new Error('Apps Script ตอบไม่ทัน ลองใหม่อีกครั้ง');
    if (err instanceof TypeError) throw new Error('ต่อ Apps Script ไม่ได้ — ตรวจอินเทอร์เน็ต');
    throw err;
  }finally{ clearTimeout(timer); }
}

/** GET จาก Apps Script — แนบโทเคนพนักงานทาง query string */
export async function apiGet(params = {}, { auth = true, timeout = TIMEOUT } = {}){
  const url = apiUrl();
  if (!url) throw new Error('ยังไม่ได้ตั้งลิงก์ Apps Script (APPS_SCRIPT_URL ใน js/config.js)');
  const q = new URLSearchParams({ ...params, _:String(Date.now()) });
  if (auth){ const t = await idToken(); if (t) q.set('idToken', t); }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try{
    const res = await fetch(`${url}?${q}`, { cache:'no-store', redirect:'follow', signal:ctrl.signal });
    if (!res.ok) throw new Error(`ต่อไม่ได้ (HTTP ${res.status})`);
    return await parse(res);
  }catch(err){
    if (err.name === 'AbortError') throw new Error('Apps Script ตอบไม่ทัน ลองใหม่อีกครั้ง');
    throw err;
  }finally{ clearTimeout(timer); }
}
