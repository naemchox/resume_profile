import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, arrayUnion, setLogLevel } from 'firebase/firestore';
setLogLevel('error');

const env = await initializeTestEnvironment({
  projectId: 'demo-ft',
  firestore: { rules: readFileSync(process.argv[2], 'utf8'), host: '127.0.0.1', port: 8085 },
});

const NOW = Date.now();
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  const put = (p, d) => setDoc(doc(db, p), d);
  await put('staff/admin@x.co',  { email:'admin@x.co', role:'admin', pages:{}, active:true });
  await put('staff/wh@x.co',     { email:'wh@x.co', role:'warehouse', pages:{}, active:true });
  await put('staff/ex@x.co',     { email:'ex@x.co', role:'exec', pages:{}, active:true });
  await put('staff/acc@x.co',    { email:'acc@x.co', role:'accounting', pages:{ ops:'view', billing:'view' }, active:true });
  await put('staff/pend@x.co',   { email:'pend@x.co', role:'pending', pages:{}, active:true });
  await put('staff/pendv@x.co',  { email:'pendv@x.co', role:'pending', pages:{ dashboard:'view' }, active:true });
  await put('staff/off@x.co',    { email:'off@x.co', role:'warehouse', pages:{}, active:false });
  await put('staff/rm@x.co',     { email:'rm@x.co', role:'admin', pages:{}, active:false, removed:true });
  await put('jobs/j1', { id:'j1', driverId:'drvA', driverIds:['drvA'], status:'new', events:[{ id:'e1' }], pay:{ base:100 } });
  await put('jobs/j2', { id:'j2', driverId:'drvB', driverIds:['drvB'], status:'new' });
  await put('jobs/j3', { id:'j3', driverId:'drvA', status:'new' });
  await put('shipments/s1', { id:'s1', driverId:'drvA', driverIds:['drvA'], status:'departed', code:'INV1' });
  await put('shipments/s2', { id:'s2', driverId:'drvB', driverIds:['drvB'] });
  await put('drivers/drvA', { id:'drvA', name:'A', active:true });
  await put('drivers/drvOff', { id:'drvOff', name:'Off', active:false });
  await put('drivers/drvX', { id:'drvX', name:'Ext', external:true, active:true, linkActive:false });
  await put('jobs/j4', { id:'j4', driverId:'drvOff', driverIds:['drvOff'], status:'loaded' });
  await put('jobs/j5', { id:'j5', driverId:'drvX', driverIds:['drvX'], status:'loaded' });
  await put('driverLinks/drvX', { id:'drvX', token:'tok_secret' });
  await put('staff/admin2@x.co', { email:'admin2@x.co', role:'admin', pages:{}, active:true });
  await put('meta/settings', { x:1 });
  await put('trackData/s1', { id:'s1' });
  await put('trackKeys/INV1', { sids:['s1'] });
  await put('invites/inv1', { role:'pending', active:true, expiresMs:0, uses:0 });
  await put('invites/inv2', { role:'pending', active:false, expiresMs:0 });
  await put('invites/inv3', { role:'pending', active:true, expiresMs: NOW - 1000 });
  await put('invites/inv4', { role:'admin', active:true, expiresMs:0 });
  await put('invites/inv5', { role:'warehouse', active:true, expiresMs: NOW + 86400000 });
  await put('staff/bill@x.co',   { email:'bill@x.co', role:'accounting', pages:{}, active:true });
  const bill = { docNo:'BL6910-001', total:1000, items:[{ jobId:'j1', amount:1000 }], reply:{}, paid:null };
  await put('bills/b1', { id:'b1', ...bill, status:'open', linkActive:true });
  await put('bills/b2', { id:'b2', ...bill, status:'open', linkActive:false });
  await put('bills/b3', { id:'b3', ...bill, status:'paid', linkActive:true });
});

const google = (email) => env.authenticatedContext('u_' + email, { email, firebase:{ sign_in_provider:'google.com' } }).firestore();
const driver = (id) => env.authenticatedContext(id, { role:'driver', driverId:id, firebase:{ sign_in_provider:'custom' } }).firestore();
const anon = env.unauthenticatedContext().firestore();

let pass = 0, fail = 0;
async function t(name, expect, fn){
  try{ await (expect ? assertSucceeds(fn()) : assertFails(fn())); pass++; }
  catch(e){ fail++; console.log(`✗ ${name} — expected ${expect ? 'ALLOW' : 'DENY'}: ${e.message.split('\n')[0]}`); }
}
const A = true, D = false;

// 1 คนนอก
await t('anon read job', D, () => getDoc(doc(anon, 'jobs/j1')));
await t('anon list jobs', D, () => getDocs(collection(anon, 'jobs')));
await t('anon get trackData', A, () => getDoc(doc(anon, 'trackData/s1')));
await t('anon get trackKeys', A, () => getDoc(doc(anon, 'trackKeys/INV1')));
await t('anon list trackData', D, () => getDocs(collection(anon, 'trackData')));
await t('anon write trackData', D, () => setDoc(doc(anon, 'trackData/s1'), { x:1 }));
await t('anon get invite', A, () => getDoc(doc(anon, 'invites/inv1')));
await t('anon list invites', D, () => getDocs(collection(anon, 'invites')));
await t('anon read staff', D, () => getDoc(doc(anon, 'staff/admin@x.co')));
await t('anon unknown collection', D, () => getDoc(doc(anon, 'other/x')));

// 2 admin
const ad = google('admin@x.co');
await t('admin list jobs', A, () => getDocs(collection(ad, 'jobs')));
await t('admin update job', A, () => updateDoc(doc(ad, 'jobs/j1'), { status:'received' }));
await t('admin list staff', A, () => getDocs(collection(ad, 'staff')));
await t('admin set staff', A, () => setDoc(doc(ad, 'staff/new@x.co'), { email:'new@x.co', role:'exec', pages:{}, active:true }));
await t('admin create invite', A, () => setDoc(doc(ad, 'invites/invX'), { role:'pending', active:true, expiresMs:0 }));
await t('admin write trackKeys', A, () => setDoc(doc(ad, 'trackKeys/K2'), { sids: arrayUnion('s2') }, { merge:true }));
await t('admin write meta', A, () => setDoc(doc(ad, 'meta/settings'), { x:2 }));
await t('admin write drivers', A, () => setDoc(doc(ad, 'drivers/drvC'), { id:'drvC', name:'C' }));

// 3 ทีมคลัง
const wh = google('wh@x.co');
await t('wh list jobs', A, () => getDocs(collection(wh, 'jobs')));
await t('wh update job', A, () => updateDoc(doc(wh, 'jobs/j2'), { status:'received' }));
await t('wh create shipment', A, () => setDoc(doc(wh, 'shipments/s9'), { id:'s9', driverIds:[] }));
await t('wh write drivers', A, () => setDoc(doc(wh, 'drivers/drvD'), { id:'drvD' }));
await t('wh get own staff', A, () => getDoc(doc(wh, 'staff/wh@x.co')));
await t('wh get other staff', D, () => getDoc(doc(wh, 'staff/admin@x.co')));
await t('wh list staff', D, () => getDocs(collection(wh, 'staff')));
await t('wh write staff', D, () => setDoc(doc(wh, 'staff/z@x.co'), { role:'admin' }));
await t('wh promote self', D, () => updateDoc(doc(wh, 'staff/wh@x.co'), { role:'admin' }));
await t('wh touch lastLogin', A, () => updateDoc(doc(wh, 'staff/wh@x.co'), { lastLoginAt:'2026', uid:'u', photoURL:'' }));

// 7b admin ลด/ปิด/ถอดตัวเองไม่ได้ (QA TC-031) — admin คนอื่นทำให้ได้
await t('admin demote self', D, () => updateDoc(doc(google('admin@x.co'), 'staff/admin@x.co'), { role:'warehouse' }));
await t('admin deactivate self', D, () => updateDoc(doc(google('admin@x.co'), 'staff/admin@x.co'), { active:false }));
await t('admin remove self', D, () => updateDoc(doc(google('admin@x.co'), 'staff/admin@x.co'), { removed:true }));
await t('admin delete self', D, () => deleteDoc(doc(google('admin@x.co'), 'staff/admin@x.co')));
await t('admin rename self', A, () => updateDoc(doc(google('admin@x.co'), 'staff/admin@x.co'), { name:'Boss', lastLoginAt:'2026' }));
await t('admin demote other admin', A, () => updateDoc(doc(google('admin@x.co'), 'staff/admin2@x.co'), { role:'warehouse' }));
await t('wh list invites', D, () => getDocs(collection(wh, 'invites')));
await t('wh create invite', D, () => setDoc(doc(wh, 'invites/hack'), { role:'admin', active:true }));

// 4 ผู้บริหาร (ดูอย่างเดียว)
const ex = google('ex@x.co');
await t('exec read jobs', A, () => getDocs(collection(ex, 'jobs')));
await t('exec update job', D, () => updateDoc(doc(ex, 'jobs/j1'), { status:'x' }));
await t('exec write drivers', D, () => setDoc(doc(ex, 'drivers/drvE'), { id:'drvE' }));
await t('exec write meta', D, () => setDoc(doc(ex, 'meta/settings'), { x:3 }));

// 5 บัญชี: ตั้งรายคน billing=view ops=view → ดูอย่างเดียวทั้งหมด
const acc = google('acc@x.co');
await t('acc(view-only) read jobs', A, () => getDocs(collection(acc, 'jobs')));
await t('acc(view-only) update job', D, () => updateDoc(doc(acc, 'jobs/j1'), { status:'x' }));

// 6 รอกำหนดสิทธิ์
await t('pending read jobs', D, () => getDocs(collection(google('pend@x.co'), 'jobs')));
await t('pending+view read jobs', A, () => getDocs(collection(google('pendv@x.co'), 'jobs')));
await t('pending get own staff', A, () => getDoc(doc(google('pend@x.co'), 'staff/pend@x.co')));

// 7 ปิดใช้งาน / ถอด / ไม่ได้รับเชิญ
await t('disabled read jobs', D, () => getDocs(collection(google('off@x.co'), 'jobs')));
await t('removed admin list staff', D, () => getDocs(collection(google('rm@x.co'), 'staff')));
await t('stranger read jobs', D, () => getDocs(collection(google('who@x.co'), 'jobs')));
await t('custom-token with email cannot pose as staff', D, () => getDocs(collection(
  env.authenticatedContext('x', { email:'admin@x.co', firebase:{ sign_in_provider:'custom' } }).firestore(), 'jobs')));

// 8 คนขับ
const dA = driver('drvA');
await t('driver query own jobs (driverIds)', A, () => getDocs(query(collection(dA, 'jobs'), where('driverIds', 'array-contains', 'drvA'))));
await t('driver query own jobs (driverId)', A, () => getDocs(query(collection(dA, 'jobs'), where('driverId', '==', 'drvA'))));
await t('driver query own shipments', A, () => getDocs(query(collection(dA, 'shipments'), where('driverIds', 'array-contains', 'drvA'))));
await t('driver query other driver jobs', D, () => getDocs(query(collection(dA, 'jobs'), where('driverIds', 'array-contains', 'drvB'))));
await t('driver list all jobs', D, () => getDocs(collection(dA, 'jobs')));
await t('driver get own job', A, () => getDoc(doc(dA, 'jobs/j1')));
await t('driver get old job (driverId only)', A, () => getDoc(doc(dA, 'jobs/j3')));
await t('driver get other job', D, () => getDoc(doc(dA, 'jobs/j2')));
await t('driver update own job', A, () => updateDoc(doc(dA, 'jobs/j1'), { status:'loaded' }));
await t('driver update own job via set', A, () => setDoc(doc(dA, 'shipments/s1'), { id:'s1', driverId:'drvA', driverIds:['drvA'], status:'delivered', code:'INV1' }));
await t('driver reassign job', D, () => updateDoc(doc(dA, 'jobs/j1'), { driverIds:['drvA','drvB'] }));
await t('driver update other job', D, () => updateDoc(doc(dA, 'jobs/j2'), { status:'x' }));
await t('driver create job', D, () => setDoc(doc(dA, 'jobs/j9'), { id:'j9', driverIds:['drvA'], driverId:'drvA' }));
await t('driver delete own job', D, () => deleteDoc(doc(dA, 'jobs/j1')));
await t('driver read drivers', A, () => getDocs(collection(dA, 'drivers')));
await t('driver write drivers', D, () => setDoc(doc(dA, 'drivers/drvA'), { id:'drvA', name:'hack' }));
await t('driver read meta', A, () => getDoc(doc(dA, 'meta/settings')));
await t('driver write meta', D, () => setDoc(doc(dA, 'meta/settings'), { x:9 }));
await t('driver write own trackData', A, () => setDoc(doc(dA, 'trackData/s1'), { id:'s1', status:'delivered' }));
await t('driver write other trackData', D, () => setDoc(doc(dA, 'trackData/s2'), { id:'s2' }));
await t('driver write trackKeys', D, () => setDoc(doc(dA, 'trackKeys/X'), { sids:['s1'] }));
await t('driver read staff', D, () => getDoc(doc(dA, 'staff/admin@x.co')));

// 8b คนขับแก้ได้เฉพาะช่องของหน้าคนขับ (QA TC-114) · บัตรผ่านของคนที่ถูกปิด (TC-234) · ลิงก์คนขับภายนอก (TC-058)
await t('driver set own pay', D, () => updateDoc(doc(dA, 'jobs/j1'), { pay:{ base:999999 } }));
await t('driver wipe events', D, () => updateDoc(doc(dA, 'jobs/j1'), { events:[] }));
await t('driver append event', A, () => updateDoc(doc(dA, 'jobs/j1'), { events:[{ id:'e1' }, { id:'e2' }], updatedAt:'x' }));
await t('driver status backwards', D, () => updateDoc(doc(dA, 'jobs/j1'), { status:'new' }));
await t('driver cancel own job', D, () => updateDoc(doc(dA, 'jobs/j1'), { status:'cancelled' }));
await t('driver record payment', A, () => updateDoc(doc(dA, 'shipments/s1'), { payments:[{ id:'p1', amount:10 }], payment:{ amount:10 } }));
await t('driver change stop code', D, () => updateDoc(doc(dA, 'shipments/s1'), { code:'HACK' }));
await t('inactive driver read own job', D, () => getDoc(doc(driver('drvOff'), 'jobs/j4')));
await t('inactive driver update own job', D, () => updateDoc(doc(driver('drvOff'), 'jobs/j4'), { status:'departed' }));
await t('closed-link driver read own job', D, () => getDoc(doc(driver('drvX'), 'jobs/j5')));
await t('driver read driverLinks', D, () => getDoc(doc(dA, 'driverLinks/drvX')));
await t('driver list driverLinks', D, () => getDocs(collection(dA, 'driverLinks')));
await t('anon read driverLinks', D, () => getDoc(doc(anon, 'driverLinks/drvX')));
await t('wh read driverLinks', A, () => getDoc(doc(google('wh@x.co'), 'driverLinks/drvX')));
await t('wh write driverLinks', A, () => setDoc(doc(google('wh@x.co'), 'driverLinks/drvY'), { id:'drvY', token:'t2' }));
await t('exec read driverLinks', D, () => getDoc(doc(google('ex@x.co'), 'driverLinks/drvX')));

// 10 admin ชุดแรก
const boot = google('admin@example.com');
await t('bootstrap create self admin', A, () => setDoc(doc(boot, 'staff/admin@example.com'), { email:'admin@example.com', role:'admin', pages:{}, active:true }));
await t('non-bootstrap create self admin', D, () => setDoc(doc(google('evil@x.co'), 'staff/evil@x.co'), { email:'evil@x.co', role:'admin', pages:{}, active:true }));
await t('create staff for someone else', D, () => setDoc(doc(google('evil2@x.co'), 'staff/victim@x.co'), { role:'pending', joinedVia:'inv1', pages:{}, active:true, removed:false }));

// 11 ลิงก์เชิญ
const j = (email, d) => setDoc(doc(google(email), 'staff/' + email), { email, pages:{}, active:true, removed:false, ...d });
await t('join with open invite', A, () => j('n1@x.co', { role:'pending', joinedVia:'inv1' }));
await t('join with closed invite', D, () => j('n2@x.co', { role:'pending', joinedVia:'inv2' }));
await t('join with expired invite', D, () => j('n3@x.co', { role:'pending', joinedVia:'inv3' }));
await t('join with role mismatch', D, () => j('n4@x.co', { role:'warehouse', joinedVia:'inv1' }));
await t('join admin invite', D, () => j('n5@x.co', { role:'admin', joinedVia:'inv4' }));
await t('join with pages', D, () => setDoc(doc(google('n6@x.co'), 'staff/n6@x.co'), { email:'n6@x.co', role:'pending', joinedVia:'inv1', pages:{ ops:'edit' }, active:true, removed:false }));
await t('join with valid role invite', A, () => j('n7@x.co', { role:'warehouse', joinedVia:'inv5' }));
await t('join with missing invite', D, () => j('n8@x.co', { role:'pending', joinedVia:'nope' }));
await t('join without invite field', D, () => j('n9@x.co', { role:'pending' }));

// 12 นับการใช้ลิงก์
await t('google user bumps invite uses', A, () => updateDoc(doc(google('n1@x.co'), 'invites/inv1'), { uses:1, lastUsedAt:'now' }));
await t('google user reactivates invite', D, () => updateDoc(doc(google('n1@x.co'), 'invites/inv2'), { active:true }));
await t('anon bumps invite', D, () => updateDoc(doc(anon, 'invites/inv1'), { uses:5 }));

// 13 ใบวางบิล — ลูกค้าเปิดลิงก์ (ไม่ล็อกอิน)
const now = new Date().toISOString();
const notice = { date:'2026-10-02', method:'เงินโอน', amount:1000, slipUrl:'https://x/y', slipName:'slip.jpg', at:now };
await t('anon get open bill', A, () => getDoc(doc(anon, 'bills/b1')));
await t('anon get closed-link bill', D, () => getDoc(doc(anon, 'bills/b2')));
await t('anon get paid bill (link open)', A, () => getDoc(doc(anon, 'bills/b3')));
await t('anon get missing bill', D, () => getDoc(doc(anon, 'bills/nope')));
await t('anon list bills', D, () => getDocs(collection(anon, 'bills')));
await t('anon mark viewed', A, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.viewedAt':now, 'reply.updatedAt':now }));
await t('anon receive bill', A, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.receivedAt':now, 'reply.receivedBy':'คุณสมศรี', 'reply.updatedAt':now }));
await t('anon promise date', A, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.promiseDate':'2026-10-31', 'reply.note':'จ่ายรอบสิ้นเดือน' }));
await t('anon payment notice', A, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.notice':notice }));
await t('anon notice bad method', D, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.notice':{ ...notice, method:'บิทคอยน์' } }));
await t('anon notice extra key', D, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.notice':{ ...notice, ok:true } }));
await t('anon notice amount as text', D, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.notice':{ ...notice, amount:'1000' } }));
await t('anon reply unknown key', D, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.paid':true }));
await t('anon reply long name', D, () => updateDoc(doc(anon, 'bills/b1'), { 'reply.receivedBy':'x'.repeat(101) }));
await t('anon change total', D, () => updateDoc(doc(anon, 'bills/b1'), { total:1 }));
await t('anon mark paid', D, () => updateDoc(doc(anon, 'bills/b1'), { status:'paid' }));
await t('anon reopen link', D, () => updateDoc(doc(anon, 'bills/b2'), { linkActive:true }));
await t('anon reply on closed link', D, () => updateDoc(doc(anon, 'bills/b2'), { 'reply.receivedAt':now }));
await t('anon reply on paid bill', D, () => updateDoc(doc(anon, 'bills/b3'), { 'reply.receivedAt':now }));
await t('anon create bill', D, () => setDoc(doc(anon, 'bills/b9'), { id:'b9', status:'open', linkActive:true }));
await t('anon delete bill', D, () => deleteDoc(doc(anon, 'bills/b1')));

// 14 ใบวางบิล — พนักงาน / คนขับ
const nb = (id) => ({ id, docNo:'X', total:1, items:[], reply:{}, status:'open', linkActive:true });
await t('accounting create bill', A, () => setDoc(doc(google('bill@x.co'), 'bills/b10'), nb('b10')));
await t('accounting confirm paid', A, () => updateDoc(doc(google('bill@x.co'), 'bills/b10'), { status:'paid', paid:{ date:'2026-10-02', method:'เงินโอน', amount:1 } }));
await t('accounting close link', A, () => updateDoc(doc(google('bill@x.co'), 'bills/b10'), { linkActive:false }));
await t('accounting delete bill', A, () => deleteDoc(doc(google('bill@x.co'), 'bills/b10')));
await t('admin create bill', A, () => setDoc(doc(google('admin@x.co'), 'bills/b11'), nb('b11')));
await t('admin list bills', A, () => getDocs(collection(google('admin@x.co'), 'bills')));
await t('billing view-only create', D, () => setDoc(doc(google('acc@x.co'), 'bills/b12'), nb('b12')));
await t('billing view-only read closed', A, () => getDoc(doc(google('acc@x.co'), 'bills/b2')));
await t('warehouse create bill', D, () => setDoc(doc(google('wh@x.co'), 'bills/b13'), nb('b13')));
await t('exec list bills', A, () => getDocs(collection(google('ex@x.co'), 'bills')));
await t('exec update bill', D, () => updateDoc(doc(google('ex@x.co'), 'bills/b1'), { status:'paid' }));
await t('pending read closed bill', D, () => getDoc(doc(google('pend@x.co'), 'bills/b2')));
await t('removed admin list bills', D, () => getDocs(collection(google('rm@x.co'), 'bills')));
await t('driver list bills', D, () => getDocs(collection(dA, 'bills')));
await t('driver read closed bill', D, () => getDoc(doc(dA, 'bills/b2')));

/* ---------- ตัวนับรูปรายเดือน (photoUsage) ---------- */
{
  const { increment } = await import('firebase/firestore');
  const inc = (n) => ({ count: increment(n) });
  await t('driver create photoUsage', A, () => setDoc(doc(dA, 'photoUsage/2026-11'), { count: 3 }));
  await t('driver increment photoUsage', A, () => setDoc(doc(dA, 'photoUsage/2026-11'), inc(5), { merge:true }));
  await t('warehouse increment photoUsage', A, () => setDoc(doc(google('wh@x.co'), 'photoUsage/2026-11'), inc(1), { merge:true }));
  await t('increment > 50', D, () => setDoc(doc(dA, 'photoUsage/2026-11'), inc(51), { merge:true }));
  await t('decrement photoUsage', D, () => setDoc(doc(dA, 'photoUsage/2026-11'), inc(-1), { merge:true }));
  await t('reset photoUsage', D, () => setDoc(doc(google('admin@x.co'), 'photoUsage/2026-11'), { count: 1 }));
  await t('extra field photoUsage', D, () => setDoc(doc(dA, 'photoUsage/2026-11'), { count: increment(1), x: 1 }, { merge:true }));
  await t('bad month id', D, () => setDoc(doc(dA, 'photoUsage/abc'), { count: 1 }));
  await t('anon increment photoUsage', D, () => setDoc(doc(anon, 'photoUsage/2026-11'), inc(1), { merge:true }));
  await t('off driver increment', D, () => setDoc(doc(driver('drvOff'), 'photoUsage/2026-11'), inc(1), { merge:true }));
  await t('staff read photoUsage', A, () => getDoc(doc(google('ex@x.co'), 'photoUsage/2026-11')));
  await t('driver read photoUsage', D, () => getDoc(doc(dA, 'photoUsage/2026-11')));
  await t('pending read photoUsage', D, () => getDoc(doc(google('pend@x.co'), 'photoUsage/2026-11')));
}

console.log(`\n${pass} passed · ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
