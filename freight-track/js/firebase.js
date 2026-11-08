/* ============================================================
   firebase.js — ตัวเชื่อม Firebase ของ FreightTrack
   โปรเจกต์: REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID

   โหลด SDK v10 จาก CDN ไม่ต้องมี build step ตามแนวทางเดิมของโปรเจกต์
   เปิดให้โค้ดอื่นใช้ผ่าน window.firebase แล้วยิง event 'firebase-ready'

   Firestore · Storage · Auth
   Auth ใช้กับฝั่ง Back office (ล็อกอินด้วย Google) — ดู js/auth.js
   คนขับยังล็อกอินด้วย ID/รหัสจาก Google Sheet เหมือนเดิม
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, writeBatch, serverTimestamp,
  query, where, arrayUnion, increment,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';
import {
  getStorage, connectStorageEmulator, ref as storageRef, uploadString, uploadBytes,
  getDownloadURL, deleteObject, getMetadata, updateMetadata,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js';
import {
  getAuth, connectAuthEmulator, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  signInWithCustomToken,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

/* โหมดทดสอบ (Firebase Emulator) — เปิดเฉพาะเมื่อเปิดหน้าที่พอร์ต 5600 บนเครื่องนี้
   พอร์ตต่างกัน = origin ต่างกัน → localStorage แยกจากของจริง (5502) ข้อมูลทดสอบจึงไม่ปนขึ้นระบบจริง
   ใช้โปรเจกต์ demo-ft (ขึ้นต้น demo- = Firebase ไม่ยอมให้ต่อของจริงเลย) · Apps Script ถูกปิดในโหมดนี้ (js/api.js) */
const EMU = ['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '5600';
window.__FT_EMU = EMU;

const firebaseConfig = EMU ? {
  apiKey: 'demo-key', authDomain: 'demo-ft.firebaseapp.com', projectId: 'demo-ft',
  storageBucket: 'demo-ft.appspot.com', messagingSenderId: '0', appId: 'demo',
} : {
  apiKey: 'REPLACE_WITH_YOUR_FIREBASE_API_KEY',
  authDomain: 'REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID.firebaseapp.com',
  projectId: 'REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID',
  storageBucket: 'REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'REPLACE_WITH_YOUR_SENDER_ID',
  appId: 'REPLACE_WITH_YOUR_FIREBASE_APP_ID',
};

let app = null, db = null, storage = null, auth = null, failed = null;

try{
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
  auth.languageCode = 'th';
  if (EMU){
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const tag = () => document.body?.insertAdjacentHTML('afterbegin',
      '<div style="position:fixed;z-index:99999;left:0;right:0;bottom:0;background:#c62828;color:#fff;font:600 12px/1.6 sans-serif;text-align:center;pointer-events:none">EMULATOR · ฐานข้อมูลทดสอบ demo-ft — ไม่ใช่ข้อมูลจริง</div>');
    document.body ? tag() : addEventListener('DOMContentLoaded', tag);
  }
}catch(err){
  /* ต่อไม่ได้ก็ยังต้องใช้งานออฟไลน์ได้ — store.js จะถอยไปใช้ข้อมูลในเครื่อง */
  failed = err;
  console.error('[firebase] เริ่มต้นไม่สำเร็จ — ระบบจะทำงานแบบออฟไลน์', err);
}

window.firebase = {
  ok: !failed, error: failed, config: firebaseConfig,
  app, db, storage, auth,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, onSnapshot, writeBatch, serverTimestamp,
  query, where, arrayUnion, increment,
  storageRef, uploadString, uploadBytes, getDownloadURL, deleteObject, getMetadata, updateMetadata,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInWithCustomToken,
};

console.log(`[firebase] ${failed ? 'ล้มเหลว' : 'พร้อมใช้งาน'} — โปรเจกต์ ${firebaseConfig.projectId}`);
window.dispatchEvent(new Event('firebase-ready'));
