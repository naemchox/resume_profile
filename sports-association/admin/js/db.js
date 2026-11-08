// ตัวช่วย Firestore: ใส่ createdAt / updatedAt ให้อัตโนมัติ
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  serverTimestamp, Timestamp, query, where, orderBy, increment, writeBatch,
  getCountFromServer
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, ready } from './firebase.js';

export { Timestamp, serverTimestamp, where, orderBy, increment, writeBatch, doc, collection };
export { db };

const snapToObj = snap => ({ id: snap.id, ...snap.data() });

// path = 'news' หรือ 'albums/abc/photos'
export async function listDocs(path, ...constraints) {
  if (!ready) return [];
  const ref = collection(db, ...path.split('/'));
  const snap = await getDocs(constraints.length ? query(ref, ...constraints) : ref);
  return snap.docs.map(snapToObj);
}

export async function getById(path, id) {
  if (!ready) return null;
  const snap = await getDoc(doc(db, ...path.split('/'), id));
  return snap.exists() ? snapToObj(snap) : null;
}

export async function countDocs(path, ...constraints) {
  if (!ready) return 0;
  const ref = collection(db, ...path.split('/'));
  const snap = await getCountFromServer(constraints.length ? query(ref, ...constraints) : ref);
  return snap.data().count;
}

// สร้าง id ล่วงหน้า (ใช้ตั้งชื่อโฟลเดอร์ใน Storage ก่อนบันทึก doc)
export function newId(path) {
  return doc(collection(db, ...path.split('/'))).id;
}

export async function createDoc(path, id, data) {
  const now = serverTimestamp();
  await setDoc(doc(db, ...path.split('/'), id), { ...data, createdAt: now, updatedAt: now });
  return id;
}

export async function updateById(path, id, data) {
  await updateDoc(doc(db, ...path.split('/'), id), { ...data, updatedAt: serverTimestamp() });
}

// setDoc แบบ merge ใช้กับ siteImages ที่ key ตายตัว
export async function upsertDoc(path, id, data, isNew) {
  const now = serverTimestamp();
  const payload = isNew ? { ...data, createdAt: now, updatedAt: now } : { ...data, updatedAt: now };
  await setDoc(doc(db, ...path.split('/'), id), payload, { merge: true });
}

export async function deleteById(path, id) {
  await deleteDoc(doc(db, ...path.split('/'), id));
}

export function docRef(path, id) {
  return doc(db, ...path.split('/'), id);
}

export function newBatch() {
  return writeBatch(db);
}

// แปลงค่าจาก <input type="date"> ↔ Timestamp (เวลาท้องถิ่น)
export function dateInputToTs(value, endOfDay = false) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = endOfDay ? new Date(y, m - 1, d, 23, 59, 59) : new Date(y, m - 1, d);
  return Timestamp.fromDate(date);
}

export function tsToDateInput(ts) {
  const d = toDate(ts);
  if (!d) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toDate(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts.toDate === 'function') return ts.toDate();
  return null;
}

export function todayInput() {
  return tsToDateInput(new Date());
}
