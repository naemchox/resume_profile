/* ============================================================
   AppsScript-auth.gs — ยืนยันตัวตนให้ FreightTrack (วางคู่กับ AppsScript-drivers.gs ในโปรเจกต์เดียวกัน)

   ทำ 3 อย่าง
   1. คนขับล็อกอิน (action:'driverLogin')
        ตรวจ ID/รหัสกับชีตที่นี่ (เบราว์เซอร์ไม่เห็นรหัสของใคร ชีตจึงเลิกเปิดสาธารณะได้)
        แล้วออก "บัตรผ่าน Firebase" (custom token) ระบุว่าเป็นคนขับคนไหน
        กฎฐานข้อมูล (firestore.rules) ใช้บัตรนี้ให้เห็น/แก้ได้เฉพาะงานของคนนั้น
   2. ลิงก์คนขับภายนอก (action:'extLogin') — ตรวจลิงก์กับฐานข้อมูล แล้วออกบัตรผ่านเฉพาะงานของลิงก์นั้น
   3. ด่านพนักงาน — คำขอที่ให้ข้อมูลภายใน (รายชื่อคนขับ แถวจากไฟล์ลูกค้า รับไฟล์ แก้ชีต)
        ต้องแนบ idToken ของพนักงานที่ล็อกอิน Google มา · ถาม Google ว่าโทเคนเป็นของใคร
        แล้วเช็คกับรายชื่อพนักงาน (คอลเลกชัน staff) ก่อนทำงาน

   ---------- ตั้งค่า (ครั้งเดียว) ----------
   Firebase Console → ⚙ Project settings → Service accounts → Generate new private key
   → ได้ไฟล์ .json → เปิดแล้วคัดลอก "ทั้งไฟล์"
   Apps Script → ⚙ Project Settings → Script properties → Add
        ชื่อ  FIREBASE_SA_JSON   ค่า = เนื้อไฟล์ .json ทั้งหมด
   แล้ว Deploy → Manage deployments → แก้ deployment เดิม → New version → Deploy

   ยังไม่ได้ใส่ FIREBASE_SA_JSON = ทำงานแบบเดิม (ไม่ออกบัตรผ่าน ไม่ตรวจพนักงาน) — ใช้ได้เฉพาะตอนกฎฐานข้อมูลยังเปิด
   คีย์นี้เท่ากับกุญแจผู้ดูแลของฐานข้อมูล — ห้ามวางในโค้ด ห้ามส่งในแชท เก็บใน Script properties ที่เดียว
   ============================================================ */

var FIREBASE_PROJECT = 'REPLACE_WITH_YOUR_FIREBASE_PROJECT_ID';
/* Web API key ของ Firebase (ตัวเดียวกับใน js/firebase.js — เป็นค่าสาธารณะอยู่แล้ว) ใช้ถาม Google ว่าโทเคนเป็นของใคร */
var FIREBASE_WEB_API_KEY = 'REPLACE_WITH_YOUR_FIREBASE_API_KEY';
var FS_BASE = 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT + '/databases/(default)/documents';

/* ---------- Service account ---------- */
function sa_() {
  var raw = PropertiesService.getScriptProperties().getProperty('FIREBASE_SA_JSON');
  if (!raw) return null;
  try { var j = JSON.parse(raw); return (j.client_email && j.private_key) ? j : null; }
  catch (e) { console.error('FIREBASE_SA_JSON อ่านไม่ได้ — วางเนื้อไฟล์ .json ทั้งไฟล์', e); return null; }
}
/** ตั้ง Service account แล้วหรือยัง — ยังไม่ตั้ง = โหมดเดิม */
function authReady_() { return !!sa_(); }

function b64url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function b64urlJson_(obj) { return b64url_(Utilities.newBlob(JSON.stringify(obj)).getBytes()); }

function signJwt_(sa, payload) {
  var input = b64urlJson_({ alg: 'RS256', typ: 'JWT' }) + '.' + b64urlJson_(payload);
  var sig = Utilities.computeRsaSha256Signature(input, sa.private_key);
  return input + '.' + b64url_(sig);
}

/** บัตรผ่าน Firebase (custom token) — อายุ 1 ชม. แต่ Firebase แลกเป็นการล็อกอินถาวรให้เอง */
function mintCustomToken_(uid, claims) {
  var sa = sa_();
  if (!sa) return '';
  var now = Math.floor(Date.now() / 1000);
  return signJwt_(sa, {
    iss: sa.client_email, sub: sa.client_email,
    aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    iat: now, exp: now + 3600, uid: String(uid).slice(0, 128), claims: claims
  });
}

/** โทเคนให้ Apps Script อ่าน Firestore ได้ (ข้ามกฎฐานข้อมูล — ใช้เฉพาะในสคริปต์นี้) */
function saAccessToken_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('sa_access');
  if (hit) return hit;
  var sa = sa_();
  if (!sa) throw new Error('ยังไม่ได้ตั้ง FIREBASE_SA_JSON');
  var now = Math.floor(Date.now() / 1000);
  var jwt = signJwt_(sa, {
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
  });
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
  });
  var j = JSON.parse(res.getContentText() || '{}');
  if (!j.access_token) throw new Error('ขอสิทธิ์อ่าน Firestore ไม่ได้: ' + res.getContentText());
  cache.put('sa_access', j.access_token, 3000);
  return j.access_token;
}

/* ---------- Firestore REST ---------- */
function fsDecode_(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsDecode_);
  if ('mapValue' in v) return fsFields_(v.mapValue.fields || {});
  return null;
}
function fsFields_(fields) {
  var out = {};
  for (var k in fields) out[k] = fsDecode_(fields[k]);
  return out;
}
/** อ่านเอกสารเดียว — ไม่มี = null */
function fsGet_(coll, id) {
  var res = UrlFetchApp.fetch(FS_BASE + '/' + coll + '/' + encodeURIComponent(id), {
    headers: { Authorization: 'Bearer ' + saAccessToken_() }, muteHttpExceptions: true
  });
  if (res.getResponseCode() === 404) return null;
  if (res.getResponseCode() !== 200) throw new Error('อ่าน ' + coll + ' ไม่ได้: ' + res.getContentText());
  var j = JSON.parse(res.getContentText());
  return fsFields_(j.fields || {});
}
/** อ่านทั้งคอลเลกชัน (ใช้กับรายชื่อคนขับ — ไม่กี่ร้อยแถว) */
function fsList_(coll) {
  var out = [], token = '';
  do {
    var url = FS_BASE + '/' + coll + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + saAccessToken_() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('อ่าน ' + coll + ' ไม่ได้: ' + res.getContentText());
    var j = JSON.parse(res.getContentText());
    (j.documents || []).forEach(function (d) { out.push(fsFields_(d.fields || {})); });
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

/* ---------- ด่านพนักงาน ---------- */
/** โทเคนนี้เป็นของพนักงานที่ใช้งานได้ไหม — คืนข้อมูลพนักงาน หรือ null
 *  (ยังไม่ได้ตั้ง Service account = เปิดผ่านแบบเดิม คืน {legacy:true}) */
function staffOf_(idToken) {
  if (!authReady_()) return { legacy: true };
  idToken = String(idToken || '');
  if (!idToken) return null;
  var cache = CacheService.getScriptCache();
  var key = 'st_' + b64url_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  var hit = cache.get(key);
  if (hit) return hit === '-' ? null : JSON.parse(hit);

  /* ให้ Google ตรวจโทเคน (ลายเซ็น + หมดอายุ) แล้วบอกว่าเป็นอีเมลอะไร */
  var res = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_WEB_API_KEY, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify({ idToken: idToken })
  });
  var j = JSON.parse(res.getContentText() || '{}');
  var u = j.users && j.users[0];
  var google = u && (u.providerUserInfo || []).some(function (p) { return p.providerId === 'google.com'; });
  var st = null;
  if (u && u.email && google) {
    var doc = fsGet_('staff', String(u.email).toLowerCase());
    var hasPages = doc && doc.pages && Object.keys(doc.pages).some(function (k) { return doc.pages[k] && doc.pages[k] !== 'none'; });
    if (doc && doc.active !== false && doc.removed !== true && (doc.role !== 'pending' || hasPages)) st = doc;
  }
  cache.put(key, st ? JSON.stringify(st) : '-', 300);   /* จำไว้ 5 นาที — กระดานงานเรียกทุกนาที */
  return st;
}

/** คำขอที่ต้องเป็นพนักงาน — ไม่ผ่านคืนคำตอบปฏิเสธ ผ่านคืน null */
function requireStaff_(idToken) {
  try {
    if (staffOf_(idToken)) return null;
  } catch (err) {
    console.error('ตรวจพนักงานไม่สำเร็จ', err);
    return json_({ ok: false, code: 'auth-error', error: 'ตรวจสิทธิ์ไม่สำเร็จ — ลองใหม่อีกครั้ง' });
  }
  return json_({ ok: false, code: 'not-staff', error: 'ต้องล็อกอินฝั่ง Back office ด้วยบัญชีที่ได้รับเชิญก่อน' });
}

/* ---------- คนขับล็อกอิน ---------- */
var LOGIN_MAX_FAILS = 8;          /* ผิดเกินนี้ภายใน 15 นาที → ล็อก ID นั้นไว้ก่อน (กันเดารหัสรัว ๆ) */

function lowerNorm_(v) { return norm_(v).toLowerCase(); }

function driverLogin_(body) {
  var id = norm_(body.id), pass = norm_(body.pass);
  if (!id || !pass) return json_({ ok: false, code: 'bad-login', error: 'ใส่ ID และรหัสผ่านให้ครบก่อน' });

  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + lowerNorm_(id).slice(0, 60);
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    return json_({ ok: false, code: 'locked', error: 'ใส่รหัสผิดหลายครั้งเกินไป — รอ 15 นาทีแล้วลองใหม่ หรือติดต่อทีมคลัง' });
  }

  var rows = sheet_().getDataRange().getValues().slice(HEADER_ROWS);
  var row = null;
  for (var i = 0; i < rows.length; i++) {
    if (lowerNorm_(rows[i][0]) === lowerNorm_(id) && norm_(rows[i][1]) === pass && norm_(rows[i][2])) { row = rows[i]; break; }
  }
  if (!row) {
    cache.put(failKey, String(fails + 1), 900);
    return json_({ ok: false, code: 'bad-login', error: 'ID หรือรหัสผ่านไม่ถูกต้อง' });
  }
  cache.remove(failKey);

  var account = { id: norm_(row[0]), name: norm_(row[2]), plate: norm_(row[3]), phone: norm_(row[4]) };
  if (!authReady_()) return json_({ ok: true, account: account, driverId: '', token: '' });

  /* หาคนขับคนนี้ในระบบ — ID ชีตก่อน ไม่มีค่อยเทียบชื่อ (คนที่เพิ่มในเว็บก่อนมีชีต) */
  var drivers = fsList_('drivers').filter(function (d) { return !d.external; });
  var d = null;
  for (var k = 0; k < drivers.length && !d; k++) if (norm_(drivers[k].sheetId) && norm_(drivers[k].sheetId) === account.id) d = drivers[k];
  for (var n = 0; n < drivers.length && !d; n++) if (lowerNorm_(drivers[n].name) === lowerNorm_(account.name)) d = drivers[n];
  if (!d) {
    return json_({ ok: false, code: 'unknown-driver',
      error: 'ยังไม่มีคนขับชื่อ “' + account.name + '” ในระบบ แจ้งทีมคลังให้เพิ่มชื่อในหน้าข้อมูลคนขับก่อน' });
  }
  if (d.active === false) {
    return json_({ ok: false, code: 'inactive', error: 'บัญชีคนขับนี้ถูกปิดใช้งาน — ติดต่อทีมคลัง' });
  }
  var token = mintCustomToken_(d.id, { role: 'driver', driverId: d.id });
  return json_({ ok: true, account: account, driverId: d.id, token: token });
}

/* ---------- ลิงก์คนขับภายนอก ---------- */
function extLogin_(body) {
  var t = norm_(body.token);
  /* ยังไม่ได้ตั้ง Service account — ให้หน้าเว็บใช้แบบเดิม (ข้อความนี้หน้าเว็บจับคำว่า "ไม่รู้จักคำสั่ง") */
  if (!authReady_()) return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง extLogin (ยังไม่ได้ตั้ง FIREBASE_SA_JSON)' });
  if (!t) return json_({ ok: false, code: 'bad-link', error: 'ลิงก์อาจคัดลอกมาไม่ครบ หรือถูกยกเลิกไปแล้ว ขอลิงก์ใหม่จากทีมคลังได้เลย' });
  /* token อยู่ที่ driverLinks/{รหัสคนขับ} (คนขับอ่านไม่ได้ — QA TC-058) · ข้อมูลเก่าอาจยังอยู่ใน drivers */
  var drivers = fsList_('drivers');
  var linkId = '';
  fsList_('driverLinks').forEach(function (x) { if (x.token && x.token === t) linkId = x.id; });
  var d = null;
  drivers.forEach(function (x) {
    if (x.external && ((linkId && x.id === linkId) || (!linkId && x.token === t))) d = x;
  });
  if (!d) return json_({ ok: false, code: 'bad-link', error: 'ลิงก์อาจคัดลอกมาไม่ครบ หรือถูกยกเลิกไปแล้ว ขอลิงก์ใหม่จากทีมคลังได้เลย' });
  if (d.linkActive === false || d.active === false) {
    return json_({ ok: false, code: 'link-closed', error: 'ทีมคลังปิดลิงก์งานของ ' + (d.name || 'คนขับคนนี้') + ' แล้ว ถ้ายังต้องรับงานอยู่ ติดต่อทีมคลังเพื่อขอลิงก์ใหม่' });
  }
  var token = mintCustomToken_(d.id, { role: 'driver', driverId: d.id, ext: true });
  return json_({ ok: true, driverId: d.id, token: token });
}

/* ---------- รายชื่อคนขับ (รวมรหัส) ให้หน้าข้อมูลคนขับ — พนักงานเท่านั้น ---------- */
function roster_() {
  var rows = sheet_().getDataRange().getValues().slice(HEADER_ROWS);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    if (!norm_(rows[i][2])) continue;
    out.push({ id: norm_(rows[i][0]), pass: norm_(rows[i][1]), name: norm_(rows[i][2]),
               plate: norm_(rows[i][3]), phone: norm_(rows[i][4]),
               bankAccount: norm_(rows[i][5]), bankName: norm_(rows[i][6]), fleet: fleet_(rows[i][7]),
               fuelType: norm_(rows[i][8]) });
  }
  return json_({ ok: true, count: out.length, drivers: out });
}

/* ---------- ทดสอบการตั้งค่า (กด Run ฟังก์ชันนี้ในหน้า Apps Script) ---------- */
function testAuthSetup() {
  var sa = sa_();
  if (!sa) { console.log('ยังไม่ได้ตั้ง FIREBASE_SA_JSON ใน Script properties'); return; }
  console.log('Service account: ' + sa.client_email);
  console.log('อ่านรายชื่อคนขับจาก Firestore ได้ ' + fsList_('drivers').length + ' คน');
  console.log('ออกบัตรผ่านทดสอบได้: ' + (mintCustomToken_('test', { role: 'test' }).length > 100 ? 'ใช่' : 'ไม่'));
}
