/* ============================================================
   AppsScript-restore.gs — กู้ข้อมูล Firestore กลับจากชีตสำรอง (คู่กับ AppsScript-backup.gs)
   ใช้ saAccessToken_ / FS_BASE จาก AppsScript-auth.gs · ใช้ backupList_ / backupWriteTab_ จาก AppsScript-backup.gs

   ---------- วิธีกู้ (3 ขั้น) ----------
   1. แก้ค่า 3 บรรทัดข้างล่าง (RESTORE_DAY · RESTORE_COLLECTIONS · RESTORE_MODE) แล้วกด Save
   2. เลือกฟังก์ชัน restorePreview → Run
      → ได้แท็บ "แผนกู้" ในชีตสำรอง บอกว่าแต่ละคอลเลกชันจะ เพิ่ม / ทับ / ลบ กี่เอกสาร — ยังไม่แตะ Firestore
   3. ดูแล้วโอเค → เลือก restoreRun → Run (ต้องรันภายใน 30 นาทีหลังดูแผน และค่าทั้ง 3 ต้องไม่เปลี่ยน)
      ก่อนเขียน สคริปต์สำรองสภาพตอนนั้นไว้ก่อนในแท็บ "<คอลเลกชัน> ก่อนกู้ HHmm <วันที่>"
      กู้ผิด อยากย้อน → ตั้ง RESTORE_DAY = 'ก่อนกู้ HHmm yyyy-MM-dd' ตามชื่อแท็บนั้น + RESTORE_MODE = 'replace' แล้วทำขั้น 2-3 ซ้ำ
      ผลแต่ละรอบต่อท้ายในแท็บ "สรุปสำรอง"

   ---------- โหมด ----------
   'missing'  กู้เฉพาะเอกสารที่หายไป · เอกสารที่ยังอยู่ไม่ถูกแตะเลย (ปลอดภัยสุด — ใช้อันนี้ก่อน)
   'replace'  ให้คอลเลกชันกลับไปเหมือนวันนั้นทุกตัว: เขียนทับเอกสารที่ยังอยู่ + ลบเอกสารที่เกิดหลังวันนั้น
              (งานที่ทำหลังวันสำรองในคอลเลกชันนั้นหายหมด — ดูตัวเลข "จะลบ" ในแผนให้ดีก่อน)

   ---------- ข้อจำกัด ----------
   - แท็บที่มีคอลัมน์ _firestore = กู้ตรงทุกชนิดข้อมูล
   - แท็บเก่าก่อนมีคอลัมน์นี้ = "กู้แบบเดา" ชนิดข้อมูลจากข้อความ (ตัวเลข · true/false · วันที่ · JSON)
     อาจผิดได้ เช่นรหัสที่เป็นตัวเลขล้วนจะกลายเป็นตัวเลข · เอกสารที่มีช่องถูกตัดจะข้าม ไม่กู้
     ต้องตั้ง RESTORE_ALLOW_GUESS = true ถึงจะยอมกู้แท็บแบบนี้
   - สำรองแค่คอลเลกชันชั้นบนสุด (ไม่มี subcollection) และไม่มีบัญชีผู้ใช้ Firebase Auth
   ============================================================ */

var RESTORE_DAY = '';            // วันที่ของแท็บสำรองที่จะกู้ เช่น '2026-11-06' (ย้อนการกู้: 'ก่อนกู้ 1430 2026-11-07')
var RESTORE_COLLECTIONS = [];    // [] = ทุกคอลเลกชันที่มีในวันนั้น · หรือระบุ เช่น ['jobs', 'bills']
var RESTORE_MODE = 'missing';    // 'missing' หรือ 'replace' (ดูคำอธิบายข้างบน)
var RESTORE_ALLOW_GUESS = false; // true = ยอมกู้แท็บรุ่นเก่าที่ไม่มีคอลัมน์ _firestore

var RESTORE_PLAN_TAB = 'แผนกู้';
var RESTORE_BATCH = 400;               // Firestore batchWrite รับได้ 500 ต่อครั้ง
var RESTORE_BATCH_BYTES = 8000000;     // คำขอหนึ่งครั้งไม่เกิน 10 MB
var RESTORE_DOC_ROOT = 'projects/' + FIREBASE_PROJECT + '/databases/(default)/documents/';

/* ---------- ฟังก์ชันที่กด Run ---------- */

function restorePreview() {
  var ss = restoreSheet_();
  var plan = restorePlan_(ss);
  restoreWritePlan_(ss, plan);
  CacheService.getScriptCache().put('restore_plan', restoreSignature_(), 1800);
  plan.forEach(function (p) { console.log(restorePlanLine_(p)); });
  console.log('ดูแท็บ "' + RESTORE_PLAN_TAB + '" ในชีตสำรอง · โอเคแล้วรัน restoreRun ภายใน 30 นาที');
}

function restoreRun() {
  var cache = CacheService.getScriptCache();
  if (cache.get('restore_plan') !== restoreSignature_()) {
    throw new Error('ยังไม่ได้ดูแผน หรือแก้ค่าหลังดูแผน หรือเกิน 30 นาทีแล้ว → รัน restorePreview ก่อน');
  }
  var t0 = Date.now();
  var ss = restoreSheet_();
  var plan = restorePlan_(ss);   // คิดใหม่จากของจริงตอนนี้ — ระหว่างรอ ข้อมูลอาจเปลี่ยน
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'HHmm yyyy-MM-dd');
  var log = [];

  plan.forEach(function (p) {
    if (p.blocked) { log.push([new Date(), p.coll, '', '', 'กู้ไม่ได้: ' + p.blocked]); return; }

    if (!p.toCreate.length && !p.toOverwrite.length && !p.toDelete.length) {
      log.push([new Date(), p.coll, 0, '', 'กู้จาก ' + RESTORE_DAY + ': ไม่มีอะไรต้องเปลี่ยน']);
      return;
    }
    // สำรองสภาพตอนนี้ไว้ก่อน (ใช้เครื่องมือสำรองตัวเดียวกัน)
    backupWriteTab_(ss, p.coll + ' ก่อนกู้ ' + stamp, p.currentDocs);

    var writes = [];
    p.toCreate.forEach(function (d) {
      writes.push({ update: { name: RESTORE_DOC_ROOT + p.coll + '/' + d.id, fields: d.fields },
                    currentDocument: { exists: false } });
    });
    p.toOverwrite.forEach(function (d) {
      writes.push({ update: { name: RESTORE_DOC_ROOT + p.coll + '/' + d.id, fields: d.fields } });
    });
    p.toDelete.forEach(function (id) {
      writes.push({ 'delete': RESTORE_DOC_ROOT + p.coll + '/' + id });
    });

    var r = restoreCommit_(writes);
    log.push([new Date(), p.coll, r.ok, '', 'กู้จาก ' + RESTORE_DAY + ' (' + RESTORE_MODE + (p.guess ? ' · แบบเดา' : '') +
      ') เพิ่ม ' + p.toCreate.length + ' · ทับ ' + p.toOverwrite.length + ' · ลบ ' + p.toDelete.length +
      ' · สำเร็จ ' + r.ok + ' · ข้ามเพราะมีอยู่แล้ว ' + r.exists + ' · ผิดพลาด ' + r.failed +
      (r.firstError ? ' (' + r.firstError + ')' : '') + ' · สำรองก่อนกู้: "' + p.coll + ' ก่อนกู้ ' + stamp + '"']);
  });

  log.push([new Date(), '(จบกู้)', '', '', 'ใช้เวลา ' + Math.round((Date.now() - t0) / 1000) + ' วินาที']);
  backupLog_(ss, log);
  cache.remove('restore_plan');
  log.forEach(function (l) { console.log(l[1] + ': ' + l[4]); });
}

/* ---------- วางแผน ---------- */

function restoreSheet_() {
  return SpreadsheetApp.openById(backupProp_('BACKUP_SHEET_ID') || BACKUP_SHEET_ID_DEFAULT);
}

function restoreSignature_() {
  return JSON.stringify([RESTORE_DAY, RESTORE_COLLECTIONS, RESTORE_MODE, RESTORE_ALLOW_GUESS]);
}

/** คอลเลกชันที่มีแท็บสำรองของวันนั้น (ไม่นับแท็บ "ก่อนกู้") */
function restoreTabsOfDay_(ss, day) {
  var out = {};
  ss.getSheets().forEach(function (sh) {
    var coll = restoreCollOfTab_(sh.getName(), day);
    if (coll) out[coll] = sh;
  });
  return out;
}

/** ชื่อแท็บ "<คอลเลกชัน> <วันที่>" → ชื่อคอลเลกชัน · ไม่ใช่แท็บของวันนั้น = '' */
function restoreCollOfTab_(name, day) {
  var tail = ' ' + day;
  if (name.length <= tail.length || name.slice(-tail.length) !== tail) return '';
  var coll = name.slice(0, -tail.length);
  if (/ ก่อนกู้ \d{4}$/.test(coll)) return '';
  return coll;
}

function restorePlan_(ss) {
  if (!/^(ก่อนกู้ \d{4} )?\d{4}-\d{2}-\d{2}$/.test(RESTORE_DAY)) throw new Error('ตั้ง RESTORE_DAY เป็นวันที่แบบ yyyy-MM-dd ก่อน เช่น 2026-11-06');
  if (RESTORE_MODE !== 'missing' && RESTORE_MODE !== 'replace') throw new Error("RESTORE_MODE ต้องเป็น 'missing' หรือ 'replace'");

  var tabs = restoreTabsOfDay_(ss, RESTORE_DAY);
  var names = RESTORE_COLLECTIONS.length ? RESTORE_COLLECTIONS : Object.keys(tabs).sort();
  if (!names.length) throw new Error('ไม่มีแท็บสำรองของวันที่ ' + RESTORE_DAY + ' (ดูชื่อแท็บในชีต — เก็บย้อนหลังแค่ ' +
    (Number(backupProp_('BACKUP_KEEP_DAYS')) || BACKUP_KEEP_DAYS_DEFAULT) + ' วัน)');

  return names.map(function (coll) {
    var p = { coll: coll, backupCount: 0, currentCount: 0, guess: false, skippedCut: 0,
              toCreate: [], toOverwrite: [], toDelete: [], same: 0, currentDocs: [], blocked: '' };
    if (!tabs[coll]) { p.blocked = 'ไม่มีแท็บ "' + coll + ' ' + RESTORE_DAY + '"'; return p; }

    var read = restoreReadTab_(tabs[coll]);
    p.guess = read.guess;
    p.skippedCut = read.skippedCut;
    p.backupCount = read.docs.length + read.skippedCut;
    if (read.guess && !RESTORE_ALLOW_GUESS) {
      p.blocked = 'แท็บรุ่นเก่า ไม่มีคอลัมน์ _firestore — ตั้ง RESTORE_ALLOW_GUESS = true ถ้ายอมกู้แบบเดาชนิดข้อมูล';
    }

    p.currentDocs = backupList_(coll);
    p.currentCount = p.currentDocs.length;
    var now = {};
    p.currentDocs.forEach(function (d) { now[d.id] = d.fields; });
    var inBackup = {};

    read.docs.forEach(function (d) {
      inBackup[d.id] = 1;
      if (!(d.id in now)) p.toCreate.push(d);
      else if (restoreCanon_(now[d.id]) === restoreCanon_(d.fields)) p.same++;
      else if (RESTORE_MODE === 'replace') p.toOverwrite.push(d);
      else p.same++;   // missing: ของที่ยังอยู่ไม่แตะ
    });
    if (RESTORE_MODE === 'replace') {
      p.currentDocs.forEach(function (d) { if (!inBackup[d.id]) p.toDelete.push(d.id); });
      if (p.skippedCut) p.blocked = p.blocked || ('มี ' + p.skippedCut + ' เอกสารที่ช่องถูกตัด กู้แบบทับทั้งหมดไม่ได้ — ใช้ missing แทน');
    }
    return p;
  });
}

/** อ่านแท็บสำรอง → { docs: [{ id, fields }], guess, skippedCut } */
function restoreReadTab_(sh) {
  var values = sh.getDataRange().getValues();
  var head = values[0].map(String);
  var idCol = head.indexOf('_id');
  if (idCol < 0) throw new Error('แท็บ "' + sh.getName() + '" ไม่มีคอลัมน์ _id');
  var rawCols = [];
  for (var i = 0; ; i++) {
    var c = head.indexOf(backupRawColName_(i));
    if (c < 0) break;
    rawCols.push(c);
  }
  var guess = rawCols.length === 0;
  var docs = [], skippedCut = 0;

  values.slice(1).forEach(function (row) {
    var id = String(row[idCol]);
    if (!id) return;
    if (!guess) {
      var s = rawCols.map(function (c) { return String(row[c] || '').slice(BACKUP_RAW_MARK.length); }).join('');
      docs.push({ id: id, fields: JSON.parse(s) });
      return;
    }
    var fields = {}, cut = false;
    head.forEach(function (k, c) {
      if (c === idCol || k === '') return;
      var v = row[c];
      if (v === '' || v === null) return;
      v = String(v);
      if (/…\[ตัด \d+ ตัวอักษร\]$/.test(v)) cut = true;
      fields[k] = restoreGuess_(v);
    });
    if (cut) skippedCut++;
    else docs.push({ id: id, fields: fields });
  });
  return { docs: docs, guess: guess, skippedCut: skippedCut };
}

/* ---------- กู้แบบเดา (แท็บรุ่นเก่า) ---------- */

var RESTORE_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** ข้อความหนึ่งช่องของแท็บรุ่นเก่า → ค่า Firestore (เดาชนิด) */
function restoreGuess_(s) {
  if (s === 'true') return { booleanValue: true };
  if (s === 'false') return { booleanValue: false };
  if (/^-?(0|[1-9]\d{0,14})$/.test(s)) return { integerValue: s };
  if (/^-?(0|[1-9]\d*)\.\d+$/.test(s)) return { doubleValue: Number(s) };
  if (RESTORE_TS.test(s)) return { timestampValue: s };
  if (/^[\[{]/.test(s)) {
    try { return restoreEncode_(JSON.parse(s)); } catch (e) { /* ไม่ใช่ JSON = ข้อความ */ }
  }
  return { stringValue: s };
}

/** ค่า JS (จาก JSON ในชีต) → ค่า Firestore · ข้างในถูกเก็บด้วย JSON ชนิดตัวเลข/true/false จึงตรงอยู่แล้ว */
function restoreEncode_(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return RESTORE_TS.test(v) ? { timestampValue: v } : { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(restoreEncode_) } };
  var keys = Object.keys(v);
  if (keys.length === 2 && typeof v.lat === 'number' && typeof v.lng === 'number') {
    return { geoPointValue: { latitude: v.lat, longitude: v.lng } };
  }
  var f = {};
  keys.forEach(function (k) { f[k] = restoreEncode_(v[k]); });
  return { mapValue: { fields: f } };
}

/* ---------- เขียน Firestore ---------- */

/** JSON ที่เรียงคีย์ — ใช้เทียบว่าเอกสารเหมือนเดิมไหม */
function restoreCanon_(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(restoreCanon_).join(',') + ']';
  return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + restoreCanon_(v[k]); }).join(',') + '}';
}

/** batchWrite ทีละก้อน · คืน { ok, exists, failed, firstError } */
function restoreCommit_(writes) {
  var r = { ok: 0, exists: 0, failed: 0, firstError: '' };
  var i = 0;
  while (i < writes.length) {
    var chunk = [], bytes = 0;
    while (i < writes.length && chunk.length < RESTORE_BATCH) {
      var size = JSON.stringify(writes[i]).length * 3;   // เผื่อตัวอักษรไทย 3 ไบต์
      if (chunk.length && bytes + size > RESTORE_BATCH_BYTES) break;
      chunk.push(writes[i]); bytes += size; i++;
    }
    var res = UrlFetchApp.fetch(FS_BASE + ':batchWrite', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + saAccessToken_() },
      payload: JSON.stringify({ writes: chunk })
    });
    if (res.getResponseCode() !== 200) {
      r.failed += chunk.length;
      r.firstError = r.firstError || ('HTTP ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
      continue;
    }
    var status = JSON.parse(res.getContentText()).status || [];
    chunk.forEach(function (w, k) {
      var code = (status[k] && status[k].code) || 0;
      if (code === 0) r.ok++;
      else if (code === 6 || code === 9) r.exists++;   // ALREADY_EXISTS / FAILED_PRECONDITION: มีคนสร้างกลับมาแล้ว
      else { r.failed++; r.firstError = r.firstError || (status[k].message || ('code ' + code)); }
    });
  }
  return r;
}

/* ---------- รายงานแผน ---------- */

function restorePlanLine_(p) {
  if (p.blocked && !p.toCreate.length && !p.toOverwrite.length && !p.toDelete.length) return p.coll + ': ' + p.blocked;
  return p.coll + ': สำรองมี ' + p.backupCount + ' · ตอนนี้มี ' + p.currentCount + ' · จะเพิ่ม ' + p.toCreate.length +
    ' · จะทับ ' + p.toOverwrite.length + ' · จะลบ ' + p.toDelete.length + (p.blocked ? ' · ⚠ ' + p.blocked : '');
}

function restoreWritePlan_(ss, plan) {
  var sh = ss.getSheetByName(RESTORE_PLAN_TAB);
  if (sh) sh.clear(); else sh = ss.insertSheet(RESTORE_PLAN_TAB, 1);
  var rows = [
    ['แผนกู้ข้อมูล (ยังไม่ได้แตะ Firestore)', '', '', '', '', '', '', '', ''],
    ['จากวันที่ ' + RESTORE_DAY, 'โหมด ' + RESTORE_MODE, 'ทำเมื่อ ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm'),
     '', '', '', '', '', ''],
    ['คอลเลกชัน', 'ในสำรอง', 'ตอนนี้', 'จะเพิ่ม (หายไป)', 'จะทับ', 'จะลบ', 'เหมือนเดิม/ไม่แตะ', 'ชนิดข้อมูล', 'หมายเหตุ']
  ];
  plan.forEach(function (p) {
    rows.push([p.coll, p.backupCount, p.currentCount, p.toCreate.length, p.toOverwrite.length, p.toDelete.length, p.same,
      p.guess ? 'เดา (แท็บเก่า)' : 'ตรงทุกค่า',
      [p.blocked ? '⚠ จะข้าม: ' + p.blocked : '', p.skippedCut ? 'ข้าม ' + p.skippedCut + ' เอกสารที่ช่องถูกตัด' : '']
        .filter(String).join(' · ')]);
  });
  sh.getRange(1, 1, rows.length, 9).setValues(rows);
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sh.getRange(3, 1, 1, 9).setFontWeight('bold');
  sh.setFrozenRows(3);
  sh.autoResizeColumns(1, 9);
}
