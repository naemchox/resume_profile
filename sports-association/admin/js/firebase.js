// เริ่ม Firebase ครั้งเดียว ถ้า FIREBASE_READY === false ทุกตัวเป็น null (โหมดดูหน้าตา)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { firebaseConfig, FIREBASE_READY } from './firebase-config.js';

export const ready = FIREBASE_READY === true;
export const app = ready ? initializeApp(firebaseConfig) : null;
export const db = ready ? getFirestore(app) : null;
export const storage = ready ? getStorage(app) : null;
export const auth = ready ? getAuth(app) : null;
