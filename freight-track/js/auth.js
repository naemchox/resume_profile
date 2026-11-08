/* ============================================================
   auth.js — ใครเข้าหน้าไหนได้

   เว็บมี 2 ฝั่ง เลือกที่หน้าแรก (index.html)
     Back office — ล็อกอินด้วยบัญชี Google ที่ admin เชิญไว้ (คอลเลกชัน staff ใน Firestore)
     คนขับ       — ล็อกอินด้วย ID/รหัสจาก Google Sheet เหมือนเดิม (js/driver.js)

   กติกา
     ยังไม่ล็อกอิน เปิดหน้าไหนก็ตาม → เด้งไปหน้าเลือกฝั่ง
     ล็อกอินค้างไว้ → เปิดเว็บแล้วเข้าฝั่งของตัวเองเลย
     ล็อกอินค้างไว้ตลอด แม้ปิดเบราว์เซอร์/ปิดเครื่อง (27 ต.ค. — คนขับสูงอายุล็อกอินซ้ำบ่อยลำบาก)
     ออกจากระบบเมื่อกดปุ่ม "ออกจากระบบ" / "กลับไปหน้าเลือกผู้ใช้" เท่านั้น
     ยกเว้น: หน้าติดตามพัสดุเปิดสาธารณะ · ลิงก์คนขับภายนอก (driver.html?k=…)

   ทุกหน้าเรียก gate('<ชื่อหน้า>') ก่อนวาดอะไร — ไม่มีสิทธิ์ก็ถูกพาออกไปก่อนเห็นข้อมูล
   ============================================================ */

import { BOOTSTRAP_ADMINS, DRIVER_URL, HELPER_URL, STAFF_URL } from './config.js';
import { isActiveStaff, levelOf, homeOf } from './access.js';

const DRIVER_KEY = 'ft.driver.session';   /* ตั้งโดย driver.js ตอนคนขับล็อกอิน */
const SIDE_KEY   = 'ft.side';             /* sessionStorage — 'driver' = เลือกฝั่งคนขับจากหน้าแรกแล้ว */
const MODE_KEY   = 'ft.driver.mode';      /* localStorage — 'assistant' = เข้าทางหน้าผู้ช่วยคนขับ (ใช้บัญชีเดียวกับคนขับ) · จำข้ามการปิดเบราว์เซอร์ */

/** หน้านี้คือหน้าผู้ช่วยคนขับ (helper.html) ไหม */
export const isHelperPage = () => (location.pathname.split('/').pop() || '') === HELPER_URL.split('/').pop();
/** หน้าแรกของคนที่ล็อกอินด้วยบัญชีคนขับ — ผู้ช่วยกลับ helper.html · คนขับกลับ driver.html */
export function driverHome(){
  let helper = false;
  try{ helper = localStorage.getItem(MODE_KEY) === 'assistant'; }catch{}
  return helper ? HELPER_URL : DRIVER_URL;
}

/** สถานะของหน้าปัจจุบัน — kind: 'staff' | 'driver' | 'external' | null */
let session = { kind:null, staff:null, page:null, level:null };
export const getSession = () => session;

/* store.js รอด่านนี้ก่อนเริ่มดึงข้อมูล — จะได้ดึงเฉพาะส่วนที่คนนี้มีสิทธิ์ (ดู whenGated) */
let gatedResolve;
const gated = new Promise((r) => { gatedResolve = r; });
/** รอจนหน้านี้ผ่านด่านสิทธิ์ — คืน session */
export const whenGated = () => gated;

/** แก้ข้อมูลได้ไหมในหน้านี้ — คนขับแก้งานของตัวเองได้เสมอ, ออฟฟิศต้องมีสิทธิ์ 'edit' ของหน้านั้น */
export function canWrite(){
  if (session.kind === 'staff') return session.level === 'edit';
  return true;
}

/* ---------- Firebase ---------- */
function fb(){
  return new Promise((resolve) => {
    if (window.firebase) return resolve(window.firebase);
    addEventListener('firebase-ready', () => resolve(window.firebase), { once:true });
  });
}

let firstUser = null;
/** ผู้ใช้ Firebase ที่ล็อกอินอยู่ (รอให้ Auth โหลดสถานะเดิมเสร็จก่อน) */
export function authUser(){
  if (!firstUser){
    firstUser = fb().then((f) => {
      if (!f?.ok || !f.auth) return null;
      return new Promise((resolve) => {
        const off = f.onAuthStateChanged(f.auth, (u) => { off(); resolve(u || null); });
      });
    });
  }
  return firstUser;
}
const isGoogle = (u) => !!u?.email && (u.providerData || []).some(p => p.providerId === 'google.com');
const emailKey = (email) => String(email || '').trim().toLowerCase();

/* ---------- ล็อกอินค้างไว้ ----------
   เดิม (ก่อน 27 ต.ค.) ปิดเบราว์เซอร์ = ออกจากระบบอัตโนมัติ (ถามแท็บอื่นผ่าน BroadcastChannel ไม่มีใครตอบ = ล้างล็อกอิน)
   มือถือปิด/ล้างแท็บเบราว์เซอร์บ่อย คนขับต้องล็อกอินใหม่แทบทุกครั้ง → เลิกแล้ว ทุกฝั่งล็อกอินค้างจนกดออกเอง
   Firebase เก็บสถานะล็อกอินใน IndexedDB ของเครื่องอยู่แล้ว (ค่าเริ่มต้น) · ตัวนี้คงไว้ให้ที่เรียกเดิมไม่ต้องแก้ */
function browserSession(){ return Promise.resolve(); }

const driverSession = () => {
  try{ return JSON.parse(localStorage.getItem(DRIVER_KEY)) || null; }catch{ return null; }
};

/* ---------- ข้อมูลพนักงาน ---------- */
/** อ่านข้อมูลสิทธิ์ของอีเมลนี้ — admin ชุดแรกจาก config.js ถูกสร้างให้อัตโนมัติตอนล็อกอินครั้งแรก */
async function loadStaff(user){
  const f = await fb();
  const id = emailKey(user.email);
  const ref = f.doc(f.db, 'staff', id);
  let snap = await f.getDoc(ref);
  const now = new Date().toISOString();

  if (!snap.exists() && BOOTSTRAP_ADMINS.map(emailKey).includes(id)){
    await f.setDoc(ref, {
      email:id, name:user.displayName || '', role:'admin', pages:{}, active:true,
      bootstrap:true, invitedBy:'config.js', invitedAt:now,
    });
    snap = await f.getDoc(ref);
  }
  if (!snap.exists()) return null;
  const staff = { id, ...snap.data() };
  if (isActiveStaff(staff)){
    /* จดเวลาเข้าใช้ล่าสุด + ชื่อ/รูปจากบัญชี Google — ไม่สำคัญพอจะให้ล้มทั้งหน้า */
    f.updateDoc(ref, {
      lastLoginAt:now, uid:user.uid,
      ...(staff.name ? {} : { name:user.displayName || '' }),
      photoURL:user.photoURL || '',
    }).catch(() => {});
  }
  return staff;
}

/** หยุดสคริปต์ของหน้านี้ไว้ระหว่างที่กำลังพาไปหน้าอื่น */
const halt = () => new Promise(() => {});
const here = () => (location.pathname.split('/').pop() || 'index.html') + location.search;
function goLanding(extra = ''){
  location.replace(STAFF_URL + (extra ? `?${extra}` : ''));
  return halt();
}

/**
 * ด่านหน้าของทุกหน้า
 * @param {string} pageKey  ชื่อหน้าใน access.js · 'driver' = หน้าคนขับ · 'track' = หน้าติดตามพัสดุ (สาธารณะ)
 *                          'bill' = ใบวางบิลของลูกค้า (สาธารณะ — เปิดด้วยลิงก์)
 */
const gates = {};
export function gate(pageKey){
  /* หลายสคริปต์ในหน้าเดียวเรียกซ้ำได้ (เช่น ops.js กับ opsAuto.js) — ตรวจจริงครั้งเดียว */
  return (gates[pageKey] ||= runGate(pageKey).then((s) => { gatedResolve(s); return s; }));
}

async function runGate(pageKey){
  await browserSession();
  const params = new URLSearchParams(location.search);

  /* ---- หน้าคนขับ / หน้าผู้ช่วยคนขับ (ใช้ด่านเดียวกัน บัญชีเดียวกัน) ---- */
  if (pageKey === 'driver'){
    /* จำว่าเครื่องนี้เข้าทางหน้าไหน — หน้าแรก/หน้าหลังบ้านจะพากลับหน้าเดิมถูก */
    try{
      if (isHelperPage()) localStorage.setItem(MODE_KEY, 'assistant');
      else if (!params.get('k')) localStorage.removeItem(MODE_KEY);
    }catch{}
    if (params.get('side') === 'driver'){
      try{ sessionStorage.setItem(SIDE_KEY, 'driver'); }catch{}
      params.delete('side');
      history.replaceState(null, '', location.pathname + ([...params].length ? `?${params}` : '') + location.hash);
    }
    /* ลิงก์คนขับภายนอก — เข้าได้ตรง ไม่ผ่านหน้าเลือกฝั่ง */
    if (params.get('k')){ session = { kind:'external' }; return session; }
    /* พนักงานที่ล็อกอิน Google อยู่ = มุมมองพนักงาน (เลือกดูงานของคนขับคนไหนก็ได้ ไปเมนูอื่นต่อได้)
       ตรวจก่อน session คนขับที่อาจค้างในเครื่อง — คนขับล็อกอินจริงจะได้บัตรผ่านคนขับแทน Google อยู่แล้ว
       จึงไม่มีทางหลุดมาเป็นพนักงาน */
    const u = await authUser();
    if (isGoogle(u)){
      const st = await loadStaff(u).catch(() => null);
      if (isActiveStaff(st)){ session = { kind:'staff', staff:st, page:'driver', level:'edit' }; return session; }
    }
    if (driverSession()){ session = { kind:'driver' }; return session; }
    let chose = false;
    try{ chose = sessionStorage.getItem(SIDE_KEY) === 'driver'; }catch{}
    if (chose){ session = { kind:'driver' }; return session; }
    return goLanding();
  }

  /* ---- ฝั่ง Back office + หน้าสาธารณะ ---- */
  /* หน้าสาธารณะ: ติดตามพัสดุ · ใบวางบิลที่ส่งลิงก์ให้ลูกค้า (bill.html) */
  const isPublic = pageKey === 'track' || pageKey === 'bill';
  const u = await authUser();
  if (isGoogle(u)){
    let st = null;
    try{ st = await loadStaff(u); }
    catch(err){
      console.error('[auth] อ่านสิทธิ์ไม่ได้', err);
      if (!isPublic) return goLanding('error=' + encodeURIComponent('อ่านข้อมูลสิทธิ์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่'));
    }
    if (isActiveStaff(st)){
      if (isPublic){ session = { kind:'staff', staff:st, page:pageKey, level:'view' }; return session; }
      const level = levelOf(st, pageKey);
      if (level === 'none'){
        const home = homeOf(st);
        if (!home) return goLanding('noaccess=1');
        location.replace(home);
        return halt();
      }
      session = { kind:'staff', staff:st, page:pageKey, level };
      return session;
    }
    /* ล็อกอิน Google ได้ แต่อีเมลนี้ไม่ได้รับเชิญ / ถูกปิดใช้งาน */
    const f = await fb();
    try{ await f.signOut(f.auth); }catch{}
    if (!isPublic) return goLanding('denied=' + encodeURIComponent(u.email));
  }
  if (isPublic){ session = { kind: driverSession() ? 'driver' : null }; return session; }
  /* คนขับ/ผู้ช่วยที่ล็อกอินอยู่ พยายามเปิดหน้าหลังบ้าน → กลับหน้าของตัวเอง */
  if (driverSession()){ location.replace(driverHome()); return halt(); }
  return goLanding('next=' + encodeURIComponent(here()));
}

/* ---------- บัตรผ่าน Firebase ----------
   ฝั่ง Back office = บัญชี Google · ฝั่งคนขับ = custom token ที่ Apps Script ออกให้หลังตรวจรหัสผ่าน
   (claims: role='driver', driverId) — กฎฐานข้อมูลใช้ตัวนี้ตัดสินว่าใครเห็นอะไร */

/** ผู้ใช้ Firebase ตอนนี้ (null = ยังไม่ล็อกอิน) — ไม่รอ */
export async function currentUser(){
  const f = await fb();
  return f?.auth?.currentUser || null;
}

/** โทเคนยืนยันตัวสำหรับแนบไปกับคำขอที่ Apps Script — Apps Script เอาไปถาม Google ว่าเป็นใคร */
export async function idToken(){
  const u = await currentUser();
  try{ return u ? await u.getIdToken() : ''; }catch{ return ''; }
}

/** รหัสคนขับในบัตรผ่าน (custom token) — ไม่ใช่คนขับ = '' */
export async function driverIdOf(user){
  if (!user || isGoogle(user)) return '';
  try{
    const r = await user.getIdTokenResult();
    return r.claims?.role === 'driver' ? String(r.claims.driverId || '') : '';
  }catch{ return ''; }
}

/** ฟังทุกครั้งที่สถานะล็อกอินเปลี่ยน (ล็อกอิน/ออก/สลับบัญชี) */
export async function onAuthUser(fn){
  const f = await fb();
  if (!f?.ok || !f.auth) return () => {};
  return f.onAuthStateChanged(f.auth, (u) => fn(u || null));
}

/** คนขับ: เข้า Firebase ด้วยบัตรผ่านจาก Apps Script */
export async function signInDriverToken(customToken){
  const f = await fb();
  if (!f?.ok || !f.auth) throw new Error('เชื่อมต่อระบบไม่ได้');
  const cred = await f.signInWithCustomToken(f.auth, customToken);
  firstUser = Promise.resolve(cred.user);
  return cred.user;
}

/** ออกจาก Firebase อย่างเดียว (ไม่พาไปหน้าไหน) — ใช้ตอนคนขับกดออกจากระบบในหน้าคนขับ */
export async function signOutFirebase(){
  const f = await fb();
  if (f?.ok && f.auth){ try{ await f.signOut(f.auth); }catch{} }
  firstUser = Promise.resolve(null);
}

/* ---------- ลิงก์เชิญ ----------
   admin สร้างลิงก์ครั้งเดียวในหน้าผู้ใช้และสิทธิ์ → index.html?invite=<รหัส>
   คนที่เปิดลิงก์แล้วล็อกอิน Google ถูกเพิ่มเข้ารายชื่อพนักงานเองด้วยบทบาทตั้งต้นของลิงก์
   (ปกติ "รอกำหนดสิทธิ์" = ยังไม่เห็นหน้าไหน) · ใช้ได้เฉพาะอีเมลที่ยังไม่อยู่ในรายชื่อ
   คนที่เคยถูกถอด/ปิดใช้งาน ใช้ลิงก์กลับเข้ามาเองไม่ได้ */
const INVITE_KEY = 'ft.invite';
export function inviteToken(){
  const q = new URLSearchParams(location.search).get('invite');
  if (q){ try{ sessionStorage.setItem(INVITE_KEY, q); }catch{} return q; }
  try{ return sessionStorage.getItem(INVITE_KEY) || ''; }catch{ return ''; }
}

/** ตรวจลิงก์เชิญ — คืนข้อมูลลิงก์ถ้ายังใช้ได้ ไม่งั้นคืนเหตุผลที่ใช้ไม่ได้ */
export async function checkInvite(token){
  if (!token) return { ok:false, why:'' };
  const f = await fb();
  try{
    const snap = await f.getDoc(f.doc(f.db, 'invites', token));
    if (!snap.exists()) return { ok:false, why:'ลิงก์เชิญนี้ไม่มีอยู่ในระบบ — ขอลิงก์ใหม่จาก admin' };
    const inv = snap.data();
    if (inv.active === false) return { ok:false, why:'ลิงก์เชิญนี้ถูกปิดแล้ว — ขอลิงก์ใหม่จาก admin' };
    if (inv.expiresAt && Date.parse(inv.expiresAt) < Date.now()) return { ok:false, why:'ลิงก์เชิญนี้หมดอายุแล้ว — ขอลิงก์ใหม่จาก admin' };
    return { ok:true, invite:{ id:token, ...inv } };
  }catch(err){
    console.error('[auth] อ่านลิงก์เชิญไม่ได้', err);
    return { ok:false, why:'ตรวจลิงก์เชิญไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่' };
  }
}

/** เพิ่มผู้ใช้ Google คนนี้เข้ารายชื่อพนักงานด้วยลิงก์เชิญ — คืน staff หรือ { why } */
async function joinWithInvite(user, token){
  const chk = await checkInvite(token);
  if (!chk.ok) return { why:chk.why };
  const f = await fb();
  const id = emailKey(user.email);
  const ref = f.doc(f.db, 'staff', id);
  const snap = await f.getDoc(ref);
  if (snap.exists()) return { why:'' };   /* มีชื่ออยู่แล้ว (รวมคนที่ถูกถอด/ปิด) — ไม่แตะ */
  const now = new Date().toISOString();
  await f.setDoc(ref, {
    email:id, name:user.displayName || '', role:chk.invite.role || 'pending', pages:{}, active:true, removed:false,
    invitedBy:chk.invite.createdBy || '', invitedAt:now, joinedVia:token,
  });
  f.updateDoc(f.doc(f.db, 'invites', token), { uses:(chk.invite.uses || 0) + 1, lastUsedAt:now }).catch(() => {});
  try{ sessionStorage.removeItem(INVITE_KEY); }catch{}
  return loadStaff(user);
}

/**
 * หน้าเลือกฝั่ง — ถ้าล็อกอินค้างไว้ พาไปฝั่งของตัวเองเลย
 * @returns {Promise<{denied?:string, noaccess?:boolean, error?:string}>} ถ้าต้องแสดงหน้าเลือกฝั่ง
 */
export async function landing(){
  await browserSession();
  const params = new URLSearchParams(location.search);
  const u = await authUser();
  if (isGoogle(u)){
    const st = await loadStaff(u).catch(() => null);
    if (isActiveStaff(st)){
      const home = homeOf(st);
      if (home){ location.replace(safeNext(params.get('next')) || home); return halt(); }
      return { noaccess:true, email:u.email };
    }
  }
  if (driverSession()){ location.replace(driverHome()); return halt(); }
  const token = inviteToken();
  const inv = token ? await checkInvite(token) : null;
  return {
    denied: params.get('denied') || '',
    noaccess: params.has('noaccess'),
    error: params.get('error') || (inv && !inv.ok ? inv.why : ''),
    invite: inv?.ok ? inv.invite : null,
  };
}
/** กันลิงก์ ?next= พาออกนอกเว็บ — รับเฉพาะชื่อไฟล์ในเว็บนี้ */
const safeNext = (v) => (v && /^[\w.-]+\.html(\?[^#]*)?$/.test(v) ? v : '');

/** ปุ่ม "เข้าสู่ระบบด้วย Google" บนหน้าเลือกฝั่ง */
export async function signInGoogle(){
  const f = await fb();
  if (!f?.ok) throw new Error('เชื่อมต่อระบบไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่');
  const provider = new f.GoogleAuthProvider();
  provider.setCustomParameters({ prompt:'select_account' });
  let cred;
  try{ cred = await f.signInWithPopup(f.auth, provider); }
  catch(err){
    if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') return null;
    if (err?.code === 'auth/popup-blocked') throw new Error('เบราว์เซอร์บล็อกหน้าต่างล็อกอิน — อนุญาตป๊อปอัปของเว็บนี้แล้วกดใหม่');
    if (err?.code === 'auth/operation-not-allowed') throw new Error('ยังไม่ได้เปิดการล็อกอินด้วย Google ใน Firebase Console');
    if (err?.code === 'auth/unauthorized-domain') throw new Error('โดเมนนี้ยังไม่ได้อยู่ในรายการที่อนุญาตของ Firebase Auth');
    throw err;
  }
  firstUser = Promise.resolve(cred.user);
  let st = await loadStaff(cred.user);
  const token = inviteToken();
  if (!st && token){
    const r = await joinWithInvite(cred.user, token);
    if (r?.why){
      try{ await f.signOut(f.auth); }catch{}
      firstUser = Promise.resolve(null);
      return { error:r.why };
    }
    st = r;
  }
  if (!isActiveStaff(st)){
    try{ await f.signOut(f.auth); }catch{}
    firstUser = Promise.resolve(null);
    return { denied:cred.user.email };
  }
  const home = homeOf(st);
  if (!home) return { noaccess:true, email:cred.user.email, joined:!!st.joinedVia };
  const next = safeNext(new URLSearchParams(location.search).get('next'));
  location.replace(next || home);
  return halt();
}

/** เลือกฝั่งคนขับ */
export function chooseDriver(){
  try{ sessionStorage.setItem(SIDE_KEY, 'driver'); localStorage.removeItem(MODE_KEY); }catch{}
  location.href = DRIVER_URL + (DRIVER_URL.includes('?') ? '&' : '?') + 'side=driver';
}

/** เลือกฝั่งผู้ช่วยคนขับ (helper.html) — ล็อกอินด้วย ID/รหัสของคนขับที่ไปด้วยกัน แล้วเห็นหน้าบันทึกการชำระเงิน */
export function chooseAssistant(){
  try{ sessionStorage.setItem(SIDE_KEY, 'driver'); localStorage.setItem(MODE_KEY, 'assistant'); }catch{}
  location.href = HELPER_URL + (HELPER_URL.includes('?') ? '&' : '?') + 'side=driver';
}

/** ปุ่ม "กลับไปหน้าเลือกผู้ใช้" (ทั้งสองฝั่ง) — ออกจากระบบฝั่งปัจจุบันแล้วกลับหน้าเลือกฝั่ง
 *  ต้องออกจากระบบด้วย ไม่งั้นหน้าเลือกฝั่งจะเห็นว่ายังล็อกอินอยู่แล้วพากลับฝั่งเดิมทันที */
export async function backToPicker(){
  const f = await fb();
  if (f?.ok && f.auth){ try{ await f.signOut(f.auth); }catch{} }
  try{
    localStorage.removeItem(DRIVER_KEY);
    localStorage.removeItem('ft.driver.creds.v1');   /* รหัสที่จำไว้ใช้ออฟไลน์ (sheetAuth.js) — คนถือเครื่องต่อจะได้เข้าแทนไม่ได้ */
    sessionStorage.removeItem(SIDE_KEY);
    localStorage.removeItem(MODE_KEY);
  }catch{}
  location.replace(STAFF_URL);
}
export const signOutStaff = backToPicker;
