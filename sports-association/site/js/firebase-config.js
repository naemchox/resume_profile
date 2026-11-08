// ต้องตรงกับ site/js/firebase-config.js และ admin/js/firebase-config.js เสมอ (ดู CONTRACT.md)
// ใส่ค่าจาก Firebase Console > Project settings > Your apps > Web app แล้วเปลี่ยน FIREBASE_READY เป็น true
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_FIREBASE_APP_ID"
};

export const FIREBASE_READY = true;
