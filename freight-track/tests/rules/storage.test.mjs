import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { ref, uploadString, deleteObject, getBytes, updateMetadata } from 'firebase/storage';
import { doc, setDoc, setLogLevel } from 'firebase/firestore';
setLogLevel('error');
const env = await initializeTestEnvironment({
  projectId: 'demo-ft',
  storage: { rules: readFileSync('storage.rules', 'utf8'), host:'127.0.0.1', port:9199 },
  firestore: { rules: 'rules_version = "2"; service cloud.firestore { match /{d=**} { allow read: if true; } }', host:'127.0.0.1', port:8085 },
});
await env.withSecurityRulesDisabled(async (c) => {
  const f = c.firestore();
  await setDoc(doc(f, 'staff/admin@x.co'), { role:'admin', active:true });
  await uploadString(ref(c.storage(), 'evidence/s1/a.jpg'), 'data:image/jpeg;base64,/9j/4AAQ', 'data_url');
  await setDoc(doc(f, 'bills/b1'), { id:'b1', status:'open', linkActive:true });
  await setDoc(doc(f, 'bills/b2'), { id:'b2', status:'open', linkActive:false });
  await setDoc(doc(f, 'bills/b3'), { id:'b3', status:'paid', linkActive:true });
  await uploadString(ref(c.storage(), 'bills/b1/old.jpg'), 'data:image/jpeg;base64,/9j/4AAQ', 'data_url');
});
const google = (email) => env.authenticatedContext('u_' + email, { email, firebase:{ sign_in_provider:'google.com' } }).storage();
const driver = env.authenticatedContext('drvA', { role:'driver', driverId:'drvA', firebase:{ sign_in_provider:'custom' } }).storage();
const anon = env.unauthenticatedContext().storage();
let pass = 0, fail = 0;
async function t(name, expect, fn){ try{ await (expect ? assertSucceeds(fn()) : assertFails(fn())); pass++; } catch(e){ fail++; console.log(`✗ ${name}: ${e.message.split('\n')[0]}`); } }
const img = 'data:image/jpeg;base64,/9j/4AAQ';
await t('driver upload image', true, () => uploadString(ref(driver, 'evidence/s1/b.jpg'), img, 'data_url'));
await t('anon upload image', false, () => uploadString(ref(anon, 'evidence/s1/c.jpg'), img, 'data_url'));
await t('driver upload non-image', false, () => uploadString(ref(driver, 'evidence/s1/x.txt'), 'hello', 'raw', { contentType:'text/plain' }));
await t('driver upload outside evidence', false, () => uploadString(ref(driver, 'other/x.jpg'), img, 'data_url'));
await t('anon read', false, () => getBytes(ref(anon, 'evidence/s1/a.jpg')));
await t('driver read', true, () => getBytes(ref(driver, 'evidence/s1/a.jpg')));
await t('driver delete', false, () => deleteObject(ref(driver, 'evidence/s1/a.jpg')));
await t('stranger google delete', false, () => deleteObject(ref(google('who@x.co'), 'evidence/s1/a.jpg')));
await t('staff delete', true, () => deleteObject(ref(google('admin@x.co'), 'evidence/s1/a.jpg')));
// สลิปจากหน้าใบวางบิล (ลูกค้าไม่ล็อกอิน)
const pdf = 'data:application/pdf;base64,JVBERi0xLjQK';
await t('anon slip image on open bill', true, () => uploadString(ref(anon, 'bills/b1/slip-1.jpg'), img, 'data_url'));
await t('anon slip pdf on open bill', true, () => uploadString(ref(anon, 'bills/b1/slip-2.pdf'), pdf, 'data_url'));
await t('anon slip text file', false, () => uploadString(ref(anon, 'bills/b1/x.txt'), 'hello', 'raw', { contentType:'text/plain' }));
await t('anon slip on closed link', false, () => uploadString(ref(anon, 'bills/b2/slip.jpg'), img, 'data_url'));
await t('anon slip on paid bill', false, () => uploadString(ref(anon, 'bills/b3/slip.jpg'), img, 'data_url'));
await t('anon slip on missing bill', false, () => uploadString(ref(anon, 'bills/nope/slip.jpg'), img, 'data_url'));
await t('anon read slip', true, () => getBytes(ref(anon, 'bills/b1/old.jpg')));
await t('anon set slip download header', false, () => updateMetadata(ref(anon, 'bills/b1/old.jpg'), { contentDisposition:'attachment' }));
await t('driver set slip download header', false, () => updateMetadata(ref(driver, 'bills/b1/old.jpg'), { contentDisposition:'attachment' }));
await t('staff set slip download header', true, () => updateMetadata(ref(google('admin@x.co'), 'bills/b1/old.jpg'), { contentDisposition:'attachment; filename="s.jpg"' }));
await t('anon delete slip', false, () => deleteObject(ref(anon, 'bills/b1/old.jpg')));
await t('staff delete slip', true, () => deleteObject(ref(google('admin@x.co'), 'bills/b1/old.jpg')));
console.log(`\n${pass} passed · ${fail} failed`);
await env.cleanup(); process.exit(fail ? 1 : 0);
