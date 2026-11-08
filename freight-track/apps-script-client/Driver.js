/* ============================================================
   AppsScript-drivers.gs — ตัวกลางให้เว็บ FreightTrack เขียนข้อมูลคนขับลงชีต

   หน้าเว็บเป็นไฟล์นิ่ง ๆ เขียน Google Sheet ตรง ๆ ไม่ได้ ต้องมีตัวกลางเสมอ
   สคริปต์นี้คือตัวกลางนั้น — วางไว้ในชีตเอง ไม่ต้องมีเซิร์ฟเวอร์แยก

   โครงชีต   A = ID (ล็อกอิน) · B = PASSWORD · C = ชื่อ–นามสกุล
             D = ทะเบียนรถ     · E = เบอร์โทร  · F = เลขที่บัญชี · G = ธนาคาร
             H = ประเภทคนขับ (รถประจำ / รถนอก — ว่าง = รถประจำ · ตั้ง dropdown ด้วย setupFleetColumn)
             I = ประเภทน้ำมัน (พิมพ์อิสระ ตามชื่อของ ปตท. เช่น ดีเซล B7 — ใช้คิดค่ารอบอัตโนมัติ · แก้จากหน้าข้อมูลคนขับได้ ว่าง = ไม่ทับ)

   ---------- วิธีติดตั้ง (ทำครั้งเดียว ~2 นาที) ----------
   1. เปิดชีต → เมนู Extensions → Apps Script
   2. ลบโค้ดเดิมในไฟล์ Code.gs ทิ้ง แล้ววางไฟล์นี้ลงไปทั้งหมด → กดบันทึก
   3. กด Deploy → New deployment → เลือกชนิด Web app
   4. ตั้งค่า  Execute as       : Me (บัญชีเจ้าของชีต)
             Who has access  : Anyone
   5. กด Deploy → อนุญาตสิทธิ์ (ครั้งแรกจะมีหน้าเตือน กด Advanced → Go to …)
   6. คัดลอกลิงก์ Web app URL (ขึ้นต้น https://script.google.com/macros/s/…/exec)
   7. เอาลิงก์ไปวางที่หน้า "ข้อมูลคนขับ" ของเว็บ → ปุ่ม "เชื่อม Google Sheet"

   *** แก้โค้ดนี้ทีหลังต้อง Deploy ใหม่ทุกครั้ง (Manage deployments → แก้ → Deploy)
       ไม่งั้นเว็บจะยังเรียกโค้ดตัวเก่าอยู่ ***

   ---------- ไฟล์นี้เป็นประตูหน้าของทั้งโปรเจกต์ ----------
   ไฟล์ .gs ทุกไฟล์ในโปรเจกต์เดียวกันใช้ชื่อฟังก์ชันร่วมกันหมด (global เดียว)
   จะมี doPost ได้แค่ตัวเดียวเท่านั้น ตัวที่ประกาศทีหลังจะทับตัวแรกแบบเงียบ ๆ
   doPost ข้างล่างจึงทำหน้าที่แยกทางให้ทั้งสองงาน โดยดูจากเนื้อคำขอ
     มี events  → คำขอจาก LINE  → ส่งต่อให้ handleLineWebhook_() ในไฟล์ LineOA.gs
     มี action  → คำขอจากเว็บ   → จัดการเองที่ handleDriverApi_()

   ด่านสิทธิ์ (AppsScript-auth.gs — ต้องวางไฟล์นั้นในโปรเจกต์เดียวกัน)
     เปิดให้ทุกคน   driverLogin · extLogin · webhook จาก LINE
     พนักงานเท่านั้น  รายชื่อคนขับ (roster / doGet) · แถวจากไฟล์ (jobs) · รับไฟล์ (upload) · แก้ชีต (upsert)
                     · ส่งเที่ยวขึ้นชีตรวม (syncMaster)
                     — หน้าเว็บแนบ idToken มาให้เอง (js/api.js)
   ============================================================ */

/* ชีตคนขับ — ตั้งใน Script properties ชื่อ DRIVER_SHEET_ID ได้ (ไม่ตั้ง = ชีตเดโม่เดิม) */
var SHEET_ID = PropertiesService.getScriptProperties().getProperty('DRIVER_SHEET_ID')
  || 'REPLACE_WITH_YOUR_SHEET_ID';
var SHEET_NAME = '';           /* เว้นว่าง = ใช้ชีตแรก */
var HEADER_ROWS = 1;           /* มีหัวตาราง 1 แถว */

function sheet_() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  return SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
}

/* ช่อง H — ค่าอื่นหรือว่าง = รถประจำ (ตรงกับ driverFleet ใน js/store.js) */
var FLEET_OWN = 'รถประจำ', FLEET_OUT = 'รถนอก';
function fleet_(v) { return norm_(v) === FLEET_OUT ? FLEET_OUT : FLEET_OWN; }

/* รันครั้งเดียว: หัวคอลัมน์ H + dropdown + เติม "รถประจำ" ให้แถวที่ยังว่าง
   ช่อง H มีหัวอย่างอื่นอยู่แล้ว = หยุด ไม่ทับ */
function setupFleetColumn() {
  var sh = sheet_();
  if (sh.getMaxColumns() < 8) sh.insertColumnsAfter(sh.getMaxColumns(), 8 - sh.getMaxColumns());
  var head = norm_(sh.getRange(1, 8).getValue());
  if (head && head !== 'ประเภทคนขับ') throw new Error('ช่อง H มีหัว "' + head + '" อยู่แล้ว — ไม่ทับ');
  sh.getRange(1, 8).setValue('ประเภทคนขับ');
  var last = Math.max(sh.getMaxRows(), HEADER_ROWS + 1);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList([FLEET_OWN, FLEET_OUT], true).setAllowInvalid(false).build();
  sh.getRange(HEADER_ROWS + 1, 8, last - HEADER_ROWS, 1).setDataValidation(rule);
  var n = sh.getLastRow() - HEADER_ROWS, filled = 0;
  if (n > 0) {
    var rng = sh.getRange(HEADER_ROWS + 1, 3, n, 6);              /* C..H */
    var v = rng.getValues();
    var h = v.map(function (r) {
      if (norm_(r[0]) && !norm_(r[5])) { filled++; return [FLEET_OWN]; }
      return [r[5]];
    });
    sh.getRange(HEADER_ROWS + 1, 8, n, 1).setValues(h);
  }
  console.log('ตั้งคอลัมน์ H แล้ว · เติมรถประจำ ' + filled + ' แถว');
}

/* ---------- ช่อง I = ประเภทน้ำมัน (dropdown บังคับเลือก) ----------
   รายการ = ชื่อน้ำมัน ปตท. จาก API เดียวกับหน้า billing (js/fuelPrice.js) — ชื่อต้องตรงเพื่อจับคู่ราคาตอนคิดค่ารอบ
   ดึงไม่ได้ = ใช้ FUEL_FALLBACK · ปตท. เพิ่ม/เปลี่ยนชื่อน้ำมันเมื่อไหร่ รันซ้ำได้ */
var FUEL_FALLBACK = ['เบนซิน 95', 'แก๊สโซฮอล์ 95', 'แก๊สโซฮอล์ 91', 'แก๊สโซฮอล์ E20', 'แก๊สโซฮอล์ E85',
                     'ดีเซล B7', 'ดีเซล B20', 'ดีเซลพรีเมียม', 'แก๊สโซฮอล์ 99 พรีเมียม', 'แก๊ส NGV'];

function fuelNames_() {
  try {
    var res = UrlFetchApp.fetch('https://api.chnwt.dev/thai-oil-api/latest', { muteHttpExceptions: true });
    var ptt = JSON.parse(res.getContentText()).response.stations.ptt;
    var names = Object.keys(ptt).map(function (k) { return norm_(ptt[k] && ptt[k].name); })
      .filter(function (n) { return n; });
    if (names.length) return names;
  } catch (err) { console.warn('ดึงชื่อน้ำมัน ปตท. ไม่ได้ — ใช้รายการสำรอง', err); }
  return FUEL_FALLBACK;
}

/* ค่าที่พิมพ์ไว้ → ชื่อในรายการ · ตรงก่อน ไม่ตรงหาแบบมีคำนั้น (B7 → ดีเซล B7) — กติกาเดียวกับ fuelPriceOf ใน store.js */
function fuelMatch_(v, names) {
  var key = function (x) { return norm_(x).replace(/\s+/g, '').toLowerCase(); };
  var k = key(v);
  if (!k) return '';
  for (var i = 0; i < names.length; i++) if (key(names[i]) === k) return names[i];
  for (var j = 0; j < names.length; j++) {
    var n = key(names[j]);
    if (n.indexOf(k) >= 0 || k.indexOf(n) >= 0) return names[j];
  }
  return null;
}

/* รันครั้งเดียว: dropdown ช่อง I + แปลงค่าย่อเป็นชื่อเต็ม + ส่งเข้าแอป
   หัว H/I ไม่ตรง = หยุด ไม่แตะอะไร (กันชีตที่คอลัมน์ยังสลับกันอยู่)
   รูปแบบปุ่ม (ชิป) ตั้งจาก Apps Script ไม่ได้ — รันซ้ำแล้วกลับเป็นลูกศร ต้องตั้งใหม่ที่ ข้อมูล → การตรวจสอบข้อมูล → ตัวเลือกขั้นสูง → ชิป */
function setupFuelColumn() {
  var sh = sheet_();
  var h = norm_(sh.getRange(1, 8).getValue()), i = norm_(sh.getRange(1, 9).getValue());
  if (h !== 'ประเภทคนขับ' || i !== 'ประเภทน้ำมัน') {
    throw new Error('หัวคอลัมน์ไม่ตรง — ต้องเป็น H1 "ประเภทคนขับ" · I1 "ประเภทน้ำมัน" (ตอนนี้ H1 "' + h + '" · I1 "' + i + '")');
  }
  var names = fuelNames_();
  var last = Math.max(sh.getMaxRows(), HEADER_ROWS + 1);
  var col = sh.getRange(HEADER_ROWS + 1, 9, last - HEADER_ROWS, 1);
  col.clearDataValidations();

  var n = sh.getLastRow() - HEADER_ROWS, fixed = 0, bad = [];
  if (n > 0) {
    var rng = sh.getRange(HEADER_ROWS + 1, 9, n, 1);
    var v = rng.getValues();
    var notes = rng.getNotes();
    for (var r = 0; r < n; r++) {
      var was = norm_(v[r][0]);
      if (!was) continue;
      var m = fuelMatch_(was, names);
      if (m === null) { bad.push(was); notes[r][0] = 'ไม่มีในรายการน้ำมัน ปตท. — เลือกใหม่จาก dropdown'; continue; }
      if (m !== was) { v[r][0] = m; fixed++; }
      notes[r][0] = '';
    }
    rng.setValues(v);
    rng.setNotes(notes);
  }
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(false).build();
  col.setDataValidation(rule);
  console.log('ตั้ง dropdown ช่อง I แล้ว (' + names.length + ' ชนิด) · แปลงเป็นชื่อเต็ม ' + fixed + ' แถว'
    + (bad.length ? ' · จับคู่ไม่ได้ ' + bad.length + ' แถว: ' + bad.join(', ') + ' (ดูโน้ตในช่อง)' : ''));

  /* สคริปต์แก้ชีตเองไม่ปลุก onDriverSheetEdit — ส่งเข้าแอปตรงนี้ */
  if (n > 0 && authReady_()) console.log(driverRowsToApp_(sh, HEADER_ROWS + 1, sh.getLastRow()));
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function norm_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
}

/* อ่านข้อมูลออก — เปิดในเบราว์เซอร์ได้เลย
     (ไม่ใส่อะไร)        → รายชื่อคนขับ
     ?action=jobs        → แถวจากไฟล์ที่ลูกค้าส่งเข้า LINE ให้กระดานงานเอาไปอัปเดตเลข Invoice
     ?action=master      → แถวของชีตรวม (Master) ให้หน้า Dashboard
     ?action=masterExport&from&to → ชีตรวมทั้งไฟล์เป็น .xlsx (base64) เฉพาะช่วงวันที่ */
function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = p.action || '';
  /* ทุกอย่างใน doGet เป็นข้อมูลภายใน (รายชื่อ/เบอร์คนขับ · แถวจากไฟล์ลูกค้า) — พนักงานเท่านั้น */
  var deny = requireStaff_(p.idToken);
  if (deny) return deny;
  if (action === 'jobs') return jobsJson_(e);
  /* หน้า Dashboard อ่านตัวเลขจากชีตรวม (AppsScript-master.gs masterJson_) */
  if (action === 'master') {
    if (typeof masterJson_ !== 'function') return json_({ ok: false, error: 'ยังไม่ได้วางโค้ดชีตรวม (Master.gs) ในโปรเจกต์นี้' });
    return masterJson_();
  }
  /* ปุ่ม Excel ในรายงานสรุป — สำเนาชีตรวมทั้งไฟล์ ตัดตามช่วงวันที่ (AppsScript-master.gs masterExport_) */
  if (action === 'masterExport') return masterExport_(p.from, p.to);

  try {
    var rows = sheet_().getDataRange().getValues().slice(HEADER_ROWS);
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      if (!norm_(rows[i][2])) continue;                  /* ไม่มีชื่อ = แถวว่าง */
      out.push({
        id: norm_(rows[i][0]), name: norm_(rows[i][2]),
        plate: norm_(rows[i][3]), phone: norm_(rows[i][4]), fleet: fleet_(rows[i][7]),
        fuelType: norm_(rows[i][8])
      });
    }
    return json_({ ok: true, count: out.length, drivers: out });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- ประตูหน้า: แยกว่าคำขอนี้มาจากใคร ---------------- */
function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'อ่านเนื้อคำขอไม่ได้: ' + err });
  }

  /* LINE ส่ง {"destination":..., "events":[...]} มาเสมอ */
  if (body.events) {
    if (typeof handleLineWebhook_ !== 'function') {
      /* ยังไม่ได้วางไฟล์ LineOA.gs — ตอบ 200 ไว้ก่อน ไม่งั้น LINE จะยิงซ้ำไม่หยุด */
      console.error('ได้ webhook จาก LINE แต่ยังไม่มี handleLineWebhook_ ในโปรเจกต์นี้');
      return ContentService.createTextOutput('OK');
    }
    return handleLineWebhook_(body);
  }

  /* หน้าล็อกอินคนขับยิงมาปลุกสคริปต์ไว้ก่อน (ครั้งแรกหลังว่างนานใช้ 10–20 วินาที) — ไม่ต้องทำอะไร */
  if (body.action === 'ping') return json_({ ok: true });

  /* คนขับล็อกอิน / ลิงก์คนขับภายนอก — ยังไม่ได้ล็อกอิน จึงไม่ต้องมีโทเคน (AppsScript-auth.gs) */
  if (body.action === 'driverLogin') return driverLogin_(body);
  if (body.action === 'extLogin') return extLogin_(body);

  /* ที่เหลือทั้งหมดเป็นงานของพนักงาน */
  var deny = requireStaff_(body.idToken);
  if (deny) return deny;
  if (body.action === 'roster') return roster_();

  /* หน้า ops บันทึกคนขับ / ค่ารอบ / ช่องทางชำระเงิน — ส่งเที่ยวนั้นขึ้นชีตรวมทันที (AppsScript-master.gs) */
  if (body.action === 'syncMaster') {
    if (typeof syncMasterForJob_ !== 'function') return json_({ ok: false, error: 'ยังไม่ได้วางโค้ดชีตรวม (Master.gs) ในโปรเจกต์นี้' });
    return syncMasterForJob_(body);
  }

  /* หน้า ops ลากไฟล์มาวาง — ส่งไฟล์มาให้เก็บที่เดียวกับไฟล์จาก LINE */
  if (body.action === 'upload') {
    if (typeof handleUpload_ !== 'function') return json_({ ok: false, error: 'ยังไม่ได้วางโค้ดรับไฟล์ (LineOA.gs) ในโปรเจกต์นี้' });
    return handleUpload_(body);
  }

  return handleDriverApi_(body);
}

/* เพิ่ม/แก้คนขับหนึ่งคน — เว็บ FreightTrack เรียกตัวนี้ */
function handleDriverApi_(body) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);                                /* กันสองคนกดพร้อมกันแล้วแถวชนกัน */

    if (body.action !== 'upsert') return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง ' + body.action });

    var d = body.driver || {};
    var name = norm_(d.name);
    if (!name) return json_({ ok: false, error: 'ไม่มีชื่อคนขับ' });

    var sh = sheet_();
    var values = sh.getDataRange().getValues();
    var wantId = norm_(d.sheetId);
    var rowIndex = -1;                                   /* แถวจริงในชีต (1-based) */

    /* หาแถวเดิม — ยึด ID ก่อน ถ้าไม่มีค่อยเทียบชื่อ กันเพิ่มซ้ำคนเดิม */
    for (var i = HEADER_ROWS; i < values.length; i++) {
      var rowId = norm_(values[i][0]);
      var rowName = norm_(values[i][2]);
      if (wantId && rowId === wantId) { rowIndex = i + 1; break; }
      if (!wantId && rowName && rowName === name) { rowIndex = i + 1; break; }
    }

    /* F = เลขที่บัญชี · G = ธนาคาร — ว่าง = ใช้ค่าเดิม (เว็บไม่เก็บค่านี้ในฐานข้อมูล บางเครื่องจึงไม่มี) */
    var old = rowIndex > 0 ? values[rowIndex - 1] : [];
    var bankAccount = norm_(d.bankAccount) || norm_(old[5]);
    var bankName = norm_(d.bankName) || norm_(old[6]);
    var fuelType = norm_(d.fuelType) || norm_(old[8]);          /* I = ประเภทน้ำมัน — ว่าง = ใช้ค่าเดิม */

    if (rowIndex > 0) {
      var id = norm_(old[0]) || nextId_(values);
      var pass = norm_(d.pass) || norm_(old[1]) || '1234';
      writeDriverRow_(sh, rowIndex, [id, pass, name, norm_(d.plate), norm_(d.phone), bankAccount, bankName, fleet_(d.fleet), fuelType]);
      return json_({ ok: true, id: id, row: rowIndex, mode: 'updated' });
    }

    var newId = wantId || nextId_(values);
    var newRow = Math.max(sh.getLastRow(), HEADER_ROWS) + 1;
    writeDriverRow_(sh, newRow, [newId, norm_(d.pass) || '1234', name, norm_(d.plate), norm_(d.phone), bankAccount, bankName, fleet_(d.fleet), fuelType]);
    return json_({ ok: true, id: newId, row: newRow, mode: 'added' });

  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

/* เขียนหนึ่งแถว A–I · ID / รหัส / เลขที่บัญชี เป็นข้อความ ไม่งั้นชีตตัด 0 นำหน้าทิ้ง */
function writeDriverRow_(sh, row, cells) {
  if (sh.getMaxColumns() < cells.length) sh.insertColumnsAfter(sh.getMaxColumns(), cells.length - sh.getMaxColumns());
  sh.getRange(row, 1, 1, 2).setNumberFormat('@');
  sh.getRange(row, 6).setNumberFormat('@');
  sh.getRange(row, 1, 1, cells.length).setValues([cells]);
}

/* ID ถัดไป — ไล่จากเลขมากสุดที่มีอยู่ +1 ถ้าชีตยังว่างเริ่มที่ 1001 */
function nextId_(values) {
  var max = 1000;
  for (var i = HEADER_ROWS; i < values.length; i++) {
    var n = parseInt(norm_(values[i][0]), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return String(max + 1);
}

/* ---------- แถวจากไฟล์ LINE ให้หน้า ops.html ดึงไปใช้ --------
   แท็บนี้ถูกเขียนโดย LineOA.gs ทุกครั้งที่มีไฟล์ผ่านการตรวจ
   ยังไม่มีแท็บ = ยังไม่เคยมีไฟล์เข้ามา ไม่ใช่ข้อผิดพลาด */
function jobsJson_(e) {
  try {
    var tab = (typeof JOBS_TAB !== 'undefined') ? JOBS_TAB : 'แถวจากไฟล์ LINE';
    var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab);
    if (!sh || sh.getLastRow() < 2) return json_({ ok: true, count: 0, rows: [] });

    /* เอาเฉพาะช่วงท้าย ๆ พอ — กระดานงานสนใจของใหม่ */
    var limit = parseInt((e && e.parameter && e.parameter.limit) || '2000', 10);
    if (isNaN(limit) || limit < 1) limit = 2000;
    var total = sh.getLastRow() - 1;
    var take = Math.min(total, limit);
    var start = sh.getLastRow() - take + 1;

    var values = sh.getRange(start, 1, take, Math.min(13, sh.getMaxColumns())).getValues();   /* 11 = Shipment No. · 12 = ที่มา · 13 = วันที่ออกเดินทาง */
    var rows = [];
    for (var i = 0; i < values.length; i++) {
      var v = values[i];
      var delivery = norm_(v[3]);
      if (!delivery && !norm_(v[4])) continue;       /* แถวที่มีแค่ Invoice ส่งด้วย — หน้า ops จับคู่ด้วยเลข Invoice (31 ต.ค.) */
      /* ชีตแปลงข้อความวันเวลาเป็น Date เอง — ส่งกลับเป็นเวลาไทยแบบ ISO ให้หน้าเว็บแยกวันได้แม่น */
      var at = (v[0] instanceof Date)
        ? Utilities.formatDate(v[0], 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss'+07:00'")
        : String(v[0] || '');
      rows.push({
        at: at, source: norm_(v[11]) || 'LINE', file: norm_(v[1]), sheet: norm_(v[2]),
        delivery: delivery, invoice: norm_(v[4]),
        customer: norm_(v[5]), destName: norm_(v[6]),
        weight: norm_(v[7]), amount: norm_(v[8]), drivers: norm_(v[9]),
        shipmentNo: norm_(v[10]),
        /* ช่อง B ของไฟล์ — เขียนเป็นข้อความ yyyy-MM-dd · แถวเก่าก่อนมีคอลัมน์นี้ = '' */
        serviceDate: (v[12] instanceof Date)
          ? Utilities.formatDate(v[12], 'Asia/Bangkok', 'yyyy-MM-dd')
          : (/^\d{4}-\d{2}-\d{2}$/.test(norm_(v[12])) ? norm_(v[12]) : '')
      });
    }
    return json_({ ok: true, count: rows.length, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- ชีต → แอป ทันทีที่คนแก้ชีต (installable onEdit) ----------
   ติดตั้ง: Run installDriverSync() ครั้งเดียว
   คนเพิ่ม/แก้แถวในชีต → เขียนคนขับคนนั้นเข้า Firestore (drivers) → หน้า drivers.html เห็นเองแบบ realtime
   จับคู่แบบเดียวกับปุ่ม "รีเฟรชจากชีต" (js/driverSheet.js) — ID ช่อง A ก่อน ไม่มีค่อยเทียบชื่อ
   ส่งเข้าแอปแค่ ชื่อ · ทะเบียน · เบอร์ · ID · ประเภทคนขับ · ประเภทน้ำมัน — รหัสผ่าน / เลขบัญชี / ธนาคาร อยู่ในชีตที่เดียว
   แถวที่ยังไม่มี ID หรือรหัสผ่าน เติมให้ (ID ถัดไป · 1234) เหมือนตอนเพิ่มจากหน้าเว็บ
   ลบแถวในชีตไม่ลบคนขับในแอป (ประวัติงานยังผูกอยู่) — ปิดใช้งานที่หน้าเว็บแทน
   สคริปต์เขียนชีตเอง (upsert จากเว็บ) ไม่ปลุกตัวนี้ จึงไม่วนกลับ */
function installDriverSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onDriverSheetEdit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onDriverSheetEdit').forSpreadsheet(SpreadsheetApp.openById(SHEET_ID)).onEdit().create();
  console.log('ตั้งแล้ว: onDriverSheetEdit บนชีต ' + SpreadsheetApp.openById(SHEET_ID).getName());
}

function onDriverSheetEdit(e) {
  if (!e || !e.range || !authReady_()) return;
  var sh = e.range.getSheet();
  if (sh.getSheetId() !== sheet_().getSheetId()) return;          /* แก้แท็บอื่น (เช่น แถวจากไฟล์ LINE) ไม่เกี่ยว */
  var r0 = Math.max(e.range.getRow(), HEADER_ROWS + 1), r1 = e.range.getLastRow();
  if (r1 < r0) return;
  if (e.range.getColumn() > 5 && e.range.getLastColumn() < 8) return;   /* แก้แค่ F/G (บัญชี) ไม่ต้องส่งเข้าแอป · H (ประเภทคนขับ) · I (ประเภทน้ำมัน) ส่ง */
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.error('onDriverSheetEdit: รอคิวไม่ได้ — กด "รีเฟรชจากชีต" ที่หน้าเว็บแทน'); return; }
  try {
    console.log(driverRowsToApp_(sh, r0, r1));
  } catch (err) {
    console.error('onDriverSheetEdit', err);
  } finally {
    lock.releaseLock();
  }
}

/** แถว r0..r1 ของชีตคนขับ → Firestore · คืนข้อความสรุป */
function driverRowsToApp_(sh, r0, r1) {
  var all = sh.getDataRange().getValues();
  var drivers = fsList_('drivers').filter(function (d) { return !d.external; });
  var added = 0, updated = 0, skipped = 0;
  for (var r = r0; r <= Math.min(r1, all.length); r++) {
    var row = all[r - 1];
    var name = norm_(row[2]);
    if (!name) continue;                                          /* ไม่มีชื่อ = แถวว่าง / ยังกรอกไม่ครบ */

    /* เติม ID / รหัสผ่านที่ยังว่าง — ไม่มี ID คนขับล็อกอินไม่ได้ */
    var id = norm_(row[0]), pass = norm_(row[1]);
    if (!id || !pass) {
      if (!id) { id = nextId_(all); row[0] = id; }
      if (!pass) { pass = '1234'; row[1] = pass; }
      sh.getRange(r, 1, 1, 2).setNumberFormat('@').setValues([[id, pass]]);
    }
    var plate = norm_(row[3]), phone = norm_(row[4]), fleet = fleet_(row[7]), fuelType = norm_(row[8]);
    var cell = sh.getRange(r, 3);

    var hit = null;
    for (var i = 0; i < drivers.length && !hit; i++) if (norm_(drivers[i].sheetId) === id) hit = drivers[i];
    for (var j = 0; j < drivers.length && !hit; j++) if (lowerNorm_(drivers[j].name) === name.toLowerCase()) hit = drivers[j];

    /* ทะเบียนห้ามซ้ำกับคนอื่น (กติกาเดียวกับหน้าเว็บ) */
    var dup = plate && drivers.filter(function (d) {
      return d !== hit && lowerNorm_(d.plate) === plate.toLowerCase();
    })[0];
    if (dup) {
      cell.setNote('ยังไม่เข้าแอป — ทะเบียน "' + plate + '" ซ้ำกับ ' + dup.name);
      skipped++;
      continue;
    }

    if (hit) {
      var patch = {};
      if (norm_(hit.name) !== name) patch.name = name;
      if (norm_(hit.plate) !== plate) patch.plate = plate;
      if (norm_(hit.phone) !== phone) patch.phone = phone;
      if (norm_(hit.sheetId) !== id) patch.sheetId = id;
      if (fleet_(hit.fleet) !== fleet) patch.fleet = fleet;
      if (norm_(hit.fuelType) !== fuelType) patch.fuelType = fuelType;
      if (Object.keys(patch).length) { fsPatch_('drivers', hit.id, patch); updated++; }
    } else {
      var doc = { id: 'drv_' + Utilities.getUuid().replace(/-/g, '').slice(0, 7), name: name, plate: plate, phone: phone,
                  truck: '', note: '', sheetId: id, fleet: fleet, fuelType: fuelType, active: true };
      fsCreate_('drivers', doc.id, doc);
      drivers.push(doc);
      added++;
    }
    if (cell.getNote()) cell.clearNote();
  }
  return 'ชีตคนขับ → แอป: เพิ่ม ' + added + ' · อัปเดต ' + updated + (skipped ? ' · ข้าม ' + skipped + ' (ดูโน้ตในช่องชื่อ)' : '');
}

/** สร้างเอกสารใหม่ — มีอยู่แล้ว = ผิดพลาด (กันทับคนขับเดิม) */
function fsCreate_(coll, id, obj) {
  var fields = {};
  Object.keys(obj).forEach(function (k) { fields[k] = fsEncode_(obj[k]); });
  var res = UrlFetchApp.fetch(FS_BASE + '/' + coll + '?documentId=' + encodeURIComponent(id), {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + saAccessToken_() },
    payload: JSON.stringify({ fields: fields })
  });
  if (res.getResponseCode() !== 200) throw new Error('สร้าง ' + coll + '/' + id + ' ไม่ได้: ' + res.getContentText());
}
