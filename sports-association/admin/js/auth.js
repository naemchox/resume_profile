// ล็อกอินด้วย Google + เช็กสิทธิ์จาก admins/{uid}
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { auth, db, ready } from './firebase.js';

const DENIED = 'บัญชีนี้ไม่มีสิทธิ์';

async function getAdminDoc(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    // ไม่มีสิทธิ์อ่าน = ไม่ใช่แอดมิน
    if (err.code === 'permission-denied') return null;
    throw err;
  }
}

function waitForUser() {
  return new Promise(resolve => {
    const stop = onAuthStateChanged(auth, user => { stop(); resolve(user); });
  });
}

// error ที่มี uid/email ติดไปด้วย ให้หน้า login แสดง UID ไว้ส่งให้ผู้ดูแลเพิ่มสิทธิ์
export class DeniedError extends Error {
  constructor(user) {
    super(DENIED);
    this.uid = user.uid;
    this.email = user.email;
  }
}

export async function loginWithGoogle() {
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' }); // ให้เลือกบัญชีทุกครั้ง
  const { user } = await signInWithPopup(auth, provider);
  const admin = await getAdminDoc(user.uid);
  if (!admin) {
    await signOut(auth);
    throw new DeniedError(user);
  }
  return { user, admin };
}

export async function logout() {
  if (ready) await signOut(auth);
  location.href = 'login.html';
}

// ใช้ทุกหน้าในแอดมิน: ไม่ล็อกอินหรือไม่มีสิทธิ์ → กลับไปหน้า login
// คืน null ถ้ายังไม่ได้ตั้งค่า Firebase (ให้เปิดดูหน้าตาได้)
export async function requireAdmin() {
  if (!ready) return null;
  const user = await waitForUser();
  if (!user) {
    location.replace('login.html');
    return new Promise(() => {});
  }
  const admin = await getAdminDoc(user.uid);
  if (!admin) {
    await signOut(auth);
    location.replace(`login.html?denied=${encodeURIComponent(user.uid)}`);
    return new Promise(() => {});
  }
  return { user, admin };
}

// ถ้าล็อกอินเป็นแอดมินอยู่แล้ว ใช้ในหน้า login เพื่อข้ามไปหน้าแรก
export async function currentAdmin() {
  if (!ready) return null;
  const user = await waitForUser();
  if (!user) return null;
  const admin = await getAdminDoc(user.uid);
  if (!admin) { await signOut(auth); return null; }
  return { user, admin };
}

export function authErrorMessage(err) {
  const map = {
    'auth/popup-closed-by-user': 'ปิดหน้าต่างเลือกบัญชีก่อนเข้าสู่ระบบเสร็จ',
    'auth/cancelled-popup-request': 'ปิดหน้าต่างเลือกบัญชีก่อนเข้าสู่ระบบเสร็จ',
    'auth/popup-blocked': 'browser บล็อกหน้าต่างป๊อปอัป กรุณาอนุญาตป๊อปอัปของเว็บนี้แล้วลองใหม่',
    'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาต (เพิ่มใน Firebase Console › Authentication › Settings › Authorized domains)',
    'auth/operation-not-allowed': 'ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google ใน Firebase Console',
    'auth/user-disabled': 'บัญชีนี้ถูกปิดการใช้งาน',
    'auth/too-many-requests': 'ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้'
  };
  return map[err.code] || err.message || 'เกิดข้อผิดพลาด';
}
