/* ============================================================
   AppsScript-backup.gs — สำรองข้อมูล Firestore ทั้งฐานลง Google Sheet ทุกคืน
   (วางคู่กับ AppsScript-auth.gs ในโปรเจกต์เดียวกัน — ใช้ saAccessToken_ / FS_BASE จากไฟล์นั้น)

   ทำอะไร
   - อ่านทุกคอลเลกชันชั้นบนสุดของ Firestore (หาเองจาก listCollectionIds — มีคอลเลกชันใหม่ก็ติดมาเอง)
   - 1 คอลเลกชัน = 1 แท็บ ชื่อ "<คอลเลกชัน> <วันที่>" เช่น "jobs 2026-10-30"
     แถวแรกเป็นหัวตาราง · ช่องแรก _id = รหัสเอกสาร · ค่าซ้อน (map/array) เก็บเป็น JSON
   - คอลัมน์ท้ายสุด _firestore (และ _firestore2, _firestore3 … ถ้ายาว) = ค่าดิบจาก Firestore ครบทุกชนิด
     (ตัวเลข · วันที่ · true/false · พิกัด) ไม่ถูกตัด — AppsScript-restore.gs ใช้คอลัมน์นี้กู้กลับแบบตรงทุกค่า
     คอลัมน์ข้างหน้ามีไว้ให้คนอ่าน (ยาวเกินถูกตัดได้ ไม่เป็นไร) · ห้ามแก้ค่าในคอลัมน์ _firestore เอง
   - รันซ้ำวันเดียวกัน = เขียนทับแท็บของวันนั้น
   - แท็บเก่ากว่า BACKUP_KEEP_DAYS วัน (ตั้งต้น 14) ถูกลบเอง — ชีตหนึ่งไฟล์รับได้ 10 ล้านช่อง
   - แท็บ "สรุปสำรอง" ต่อท้ายผลทุกรอบ: เวลา · คอลเลกชัน · จำนวนเอกสาร · ช่องที่ยาวเกินจนถูกตัด

   ⚠ ชีตนี้มีข้อมูลทุกอย่างรวมรหัสลับ (driverLinks · invites · trackKeys · bills) — อย่าเปิดลิงก์ให้คนนอกดู

   ---------- ตั้งค่า (ครั้งเดียว) ----------
   1. บัญชีที่ deploy สคริปต์นี้ต้องมีสิทธิ์ "แก้ไข" ชีตสำรอง
   2. (ถ้าจะเปลี่ยนชีตปลายทาง) Script properties → BACKUP_SHEET_ID = ID ของชีต
      (ถ้าจะเปลี่ยนจำนวนวันที่เก็บ) Script properties → BACKUP_KEEP_DAYS = ตัวเลข
   3. เลือกฟังก์ชัน setupBackupTrigger แล้วกด Run หนึ่งครั้ง → ตั้งรันเองทุกคืนราว 02:00
      อยากสำรองทันที → Run backupFirestoreNow
   ============================================================ */

var BACKUP_SHEET_ID_DEFAULT = 'REPLACE_WITH_YOUR_SHEET_ID';
var BACKUP_KEEP_DAYS_DEFAULT = 14;
var BACKUP_LOG_TAB = 'สรุปสำรอง';
var BACKUP_CELL_MAX = 49000;   // ช่องหนึ่งของชีตรับได้ 50,000 ตัวอักษร

function backupProp_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

/** ตั้งให้รันเองทุกคืน (รันซ้ำได้ — ลบตัวเดิมก่อน ไม่ซ้อน) */
function setupBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'backupFirestoreNow') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupFirestoreNow').timeBased().everyDays(1).atHour(2).create();
  console.log('ตั้งสำรองทุกคืนราว 02:00 แล้ว');
}

function backupFirestoreNow() {
  var t0 = Date.now();
  var ss = SpreadsheetApp.openById(backupProp_('BACKUP_SHEET_ID') || BACKUP_SHEET_ID_DEFAULT);
  var day = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  var log = [];

  backupCollectionIds_().forEach(function (coll) {
    var docs = backupList_(coll);
    var cut = backupWriteTab_(ss, coll + ' ' + day, docs);
    log.push([new Date(), coll, docs.length, cut, '']);
  });

  var removed = backupPrune_(ss);
  log.push([new Date(), '(จบรอบ)', '', '', 'ใช้เวลา ' + Math.round((Date.now() - t0) / 1000) +
    ' วินาที · ลบแท็บเก่า ' + removed + ' แท็บ']);
  backupLog_(ss, log);
}

/* ---------- อ่าน Firestore ---------- */

/** รายชื่อคอลเลกชันชั้นบนสุดทั้งหมด */
function backupCollectionIds_() {
  var out = [], token = '';
  do {
    var res = UrlFetchApp.fetch(FS_BASE + ':listCollectionIds', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + saAccessToken_() },
      payload: JSON.stringify(token ? { pageSize: 100, pageToken: token } : { pageSize: 100 })
    });
    if (res.getResponseCode() !== 200) throw new Error('อ่านรายชื่อคอลเลกชันไม่ได้: ' + res.getContentText());
    var j = JSON.parse(res.getContentText());
    out = out.concat(j.collectionIds || []);
    token = j.nextPageToken || '';
  } while (token);
  return out.sort();
}

/** ทั้งคอลเลกชัน · คืน [{ id, fields }] โดย fields = ค่าดิบตามรูปแบบ Firestore REST (มีชนิดข้อมูลครบ) */
function backupList_(coll) {
  var out = [], token = '';
  do {
    var url = FS_BASE + '/' + coll + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + saAccessToken_() }, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error('อ่าน ' + coll + ' ไม่ได้: ' + res.getContentText());
    var j = JSON.parse(res.getContentText());
    (j.documents || []).forEach(function (d) {
      out.push({ id: d.name.split('/').pop(), fields: d.fields || {} });
    });
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

/** เหมือน fsDecode_ แต่ไม่ทิ้งชนิดที่ fsDecode_ ไม่รู้จัก (พิกัด · reference · bytes) */
function backupDecode_(v) {
  if (!v) return null;
  if ('geoPointValue' in v) return { lat: v.geoPointValue.latitude, lng: v.geoPointValue.longitude };
  if ('referenceValue' in v) return v.referenceValue.replace(/^.*?\/documents\//, '');
  if ('bytesValue' in v) return v.bytesValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(backupDecode_);
  if ('mapValue' in v) {
    var o = {}, f = v.mapValue.fields || {};
    for (var k in f) o[k] = backupDecode_(f[k]);
    return o;
  }
  return fsDecode_(v);
}

/* ---------- เขียนชีต ---------- */

var BACKUP_RAW_COL = '_firestore';
var BACKUP_RAW_MARK = '~';   // ขึ้นต้นทุกชิ้นค่าดิบ — กันชีตตีความตัวแรกเป็น ' หรือ = เวลาแบ่งชิ้นตรงจุดนั้นพอดี

/** ค่าดิบทั้งเอกสาร → ชิ้น ๆ ละไม่เกินหนึ่งช่อง */
function backupRawChunks_(fields) {
  var s = JSON.stringify(fields), out = [];
  for (var i = 0; i < s.length; i += BACKUP_CELL_MAX) out.push(BACKUP_RAW_MARK + s.slice(i, i + BACKUP_CELL_MAX));
  return out.length ? out : [BACKUP_RAW_MARK + '{}'];
}

/** ชื่อคอลัมน์ค่าดิบชิ้นที่ i (เริ่ม 0): _firestore, _firestore2, _firestore3 … */
function backupRawColName_(i) { return i ? BACKUP_RAW_COL + (i + 1) : BACKUP_RAW_COL; }

/** เขียนแท็บเดียว (docs = [{ id, fields }] จาก backupList_) · คืนจำนวนช่องที่ยาวเกินจนถูกตัด (เฉพาะช่องที่คนอ่าน) */
function backupWriteTab_(ss, name, docs) {
  var old = ss.getSheetByName(name);
  if (old) ss.deleteSheet(old);
  var sh = ss.insertSheet(name, ss.getSheets().length);

  var keys = {}, nRaw = 1;
  var plain = docs.map(function (d) {
    var x = {};
    for (var k in d.fields) { x[k] = backupDecode_(d.fields[k]); keys[k] = 1; }
    return x;
  });
  var raws = docs.map(function (d) {
    var c = backupRawChunks_(d.fields);
    if (c.length > nRaw) nRaw = c.length;
    return c;
  });
  var fieldKeys = Object.keys(keys).sort();
  var rawHead = [];
  for (var r = 0; r < nRaw; r++) rawHead.push(backupRawColName_(r));
  var head = ['_id'].concat(fieldKeys, rawHead);

  var cut = 0;
  var rows = docs.map(function (d, i) {
    var row = [d.id].concat(fieldKeys.map(function (k) {
      var v = plain[i][k];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object') v = JSON.stringify(v);
      if (typeof v === 'string' && v.length > BACKUP_CELL_MAX) {
        cut++;
        v = v.slice(0, BACKUP_CELL_MAX) + '…[ตัด ' + (v.length - BACKUP_CELL_MAX) + ' ตัวอักษร]';
      }
      return v;
    }));
    for (var r = 0; r < nRaw; r++) row.push(raws[i][r] || '');
    return row;
  });

  var all = [head].concat(rows);
  var rng = sh.getRange(1, 1, all.length, head.length);
  rng.setNumberFormat('@');   // เก็บเป็นข้อความ — ค่าที่ขึ้นต้นด้วย = จะได้ไม่กลายเป็นสูตร
  rng.setValues(all);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  sh.getRange(1, fieldKeys.length + 2, 1, nRaw).setFontColor('#999999').setNote('ค่าดิบสำหรับกู้ข้อมูล — ห้ามแก้');
  return cut;
}

/** ลบแท็บสำรองที่เก่ากว่าจำนวนวันที่เก็บ · คืนจำนวนที่ลบ */
function backupPrune_(ss) {
  var keep = Number(backupProp_('BACKUP_KEEP_DAYS')) || BACKUP_KEEP_DAYS_DEFAULT;
  var limit = Utilities.formatDate(new Date(Date.now() - keep * 86400000), 'Asia/Bangkok', 'yyyy-MM-dd');
  var n = 0;
  ss.getSheets().forEach(function (sh) {
    var m = sh.getName().match(/ (\d{4}-\d{2}-\d{2})$/);
    if (m && m[1] < limit && ss.getSheets().length > 1) { ss.deleteSheet(sh); n++; }
  });
  return n;
}

function backupLog_(ss, rows) {
  var sh = ss.getSheetByName(BACKUP_LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(BACKUP_LOG_TAB, 0);
    sh.appendRow(['เวลา', 'คอลเลกชัน', 'จำนวนเอกสาร', 'ช่องที่ถูกตัด', 'หมายเหตุ']);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, 5).setFontWeight('bold');
  }
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}
