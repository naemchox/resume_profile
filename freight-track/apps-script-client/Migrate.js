/* ============================================================
   AppsScript-migrate.gs — ย้ายจากชุดเดโม่ไปชุดของผู้ว่าจ้าง (รันครั้งเดียว แล้วลบไฟล์นี้ทิ้งได้)

   ลำดับ (กด Run ทีละฟังก์ชันในตัวแก้ไข)
   1. setupClientProps()   ตั้ง ID ชีต/โฟลเดอร์ของผู้ว่าจ้างใน Script properties (ไม่มีค่าลับ)
   2. migrateMasterFromDemo()
        ลอกทุกแท็บจากชีต Master เดโม่ → ชีต Master ใหม่ (หัวตาราง สี รูปแบบ dropdown สูตร Report)
        แล้วล้างข้อมูลตัวอย่างแถว 2 ลงไป — กติกาเดียวกับ tools/build_master_template.py
   3. checkClientSetup()   ตรวจว่าเปิดชีต/โฟลเดอร์ได้ครบ

   ค่าลับ (FIREBASE_SA_JSON · LINE_CHANNEL_ACCESS_TOKEN) ไม่อยู่ที่นี่ — วางเองใน Project Settings
   ============================================================ */

var MIGRATE_DEMO_MASTER_ID = 'REPLACE_WITH_YOUR_SHEET_ID';
var MIGRATE_CLIENT = {
  DRIVE_FOLDER_ID: 'REPLACE_WITH_YOUR_DRIVE_FOLDER_ID',
  MASTER_SHEET_ID: 'REPLACE_WITH_YOUR_SHEET_ID',
  DRIVER_SHEET_ID: 'REPLACE_WITH_YOUR_SHEET_ID'
};

/* แท็บข้อมูล → คอลัมน์สุดท้ายที่ล้าง (0 = ทุกคอลัมน์)
   ช่องทางชำระเงิน: I:K เป็นตารางสรุป (สูตร) ห้ามลบ เลยล้างแค่ A:G */
var MIGRATE_DATA_TABS = {
  'Shipments': 0, 'Bills': 0, 'ช่องทางชำระเงิน': 7, 'Items': 0, 'Billing': 0,
  'Drivers': 0, 'ไฟล์ที่นำเข้า': 0, 'ประวัติซิงก์': 0, '_ซิงก์ (ระบบ)': 0
};

function setupClientProps() {
  PropertiesService.getScriptProperties().setProperties(MIGRATE_CLIENT, false);
  console.log('ตั้งแล้ว: ' + Object.keys(MIGRATE_CLIENT).join(' · '));
}

function migrateMasterFromDemo() {
  var dstId = prop_('MASTER_SHEET_ID');
  if (dstId !== MIGRATE_CLIENT.MASTER_SHEET_ID) throw new Error('รัน setupClientProps() ก่อน');
  if (dstId === MIGRATE_DEMO_MASTER_ID) throw new Error('ปลายทางเป็นชีตเดโม่ — หยุด');

  var src = SpreadsheetApp.openById(MIGRATE_DEMO_MASTER_ID);
  var dst = SpreadsheetApp.openById(dstId);
  var srcSheets = src.getSheets();
  var names = srcSheets.map(function (s) { return s.getName(); });

  /* ชีตใหม่ต้องยังว่าง — กันรันซ้ำทับของจริง */
  dst.getSheets().forEach(function (s) {
    if (names.indexOf(s.getName()) >= 0) throw new Error('ชีตปลายทางมีแท็บ "' + s.getName() + '" อยู่แล้ว — เคยย้ายไปแล้ว หยุด');
    if (s.getLastRow() > 0) throw new Error('แท็บ "' + s.getName() + '" ในชีตปลายทางมีข้อมูลอยู่ — หยุด');
  });
  var placeholders = dst.getSheets();

  /* 1. ลอกทีละแท็บ ตามลำดับเดิม */
  srcSheets.forEach(function (s, i) {
    var c = s.copyTo(dst).setName(s.getName());
    dst.setActiveSheet(c);
    dst.moveActiveSheet(i + 1);
    if (s.isSheetHidden()) c.hideSheet();
    var fr = s.getFrozenRows(), fc = s.getFrozenColumns();
    if (fr) c.setFrozenRows(fr);
    if (fc) c.setFrozenColumns(fc);
  });
  placeholders.forEach(function (p) { dst.deleteSheet(p); });

  /* 2. สูตรที่อ้างแท็บอื่นกลายเป็น #REF! ตอนลอก (แท็บปลายทางยังไม่มี) — เขียนสูตรเดิมกลับ */
  var nf = 0;
  srcSheets.forEach(function (s) {
    var r = s.getDataRange();
    var f = r.getFormulas();
    var d = dst.getSheetByName(s.getName());
    for (var i = 0; i < f.length; i++) {
      var j = 0;
      while (j < f[i].length) {
        if (!f[i][j]) { j++; continue; }
        var k = j;
        while (k < f[i].length && f[i][k]) k++;
        d.getRange(i + 1, j + 1, 1, k - j).setFormulas([f[i].slice(j, k)]);
        nf += k - j;
        j = k;
      }
    }
  });

  /* 3. Named range */
  src.getNamedRanges().forEach(function (n) {
    var r = n.getRange();
    dst.setNamedRange(n.getName(), dst.getSheetByName(r.getSheet().getName()).getRange(r.getA1Notation()));
  });

  /* 4. ล้างข้อมูลตัวอย่าง (ค่าอย่างเดียว รูปแบบ/dropdown ยังอยู่) */
  var report = [];
  Object.keys(MIGRATE_DATA_TABS).forEach(function (name) {
    var sh = dst.getSheetByName(name);
    if (!sh) { report.push(name + ': ไม่มีแท็บนี้'); return; }
    var last = sh.getLastRow();
    if (last < 2) { report.push(name + ': ว่างอยู่แล้ว'); return; }
    var cols = MIGRATE_DATA_TABS[name] || sh.getMaxColumns();
    sh.getRange(2, 1, last - 1, cols).clearContent();
    report.push(name + ': ล้าง ' + (last - 1) + ' แถว');
  });

  SpreadsheetApp.flush();
  console.log('ลอก ' + names.length + ' แท็บ · เขียนสูตรกลับ ' + nf + ' ช่อง · named range ' + src.getNamedRanges().length);
  console.log(report.join('\n'));
}

function checkClientSetup() {
  var ok = function (label, fn) {
    try { console.log('✓ ' + label + ': ' + fn()); } catch (e) { console.error('✗ ' + label + ': ' + e); }
  };
  ok('ชีตคนขับ', function () { return SpreadsheetApp.openById(SHEET_ID).getName() + ' (' + SHEET_ID + ')'; });
  ok('ชีต Master', function () { return masterSheet_().getName() + ' · ' + masterSheet_().getSheets().length + ' แท็บ'; });
  ok('โฟลเดอร์ Drive', function () { return DriveApp.getFolderById(prop_('DRIVE_FOLDER_ID')).getName(); });
  ok('FIREBASE_SA_JSON', function () { return authReady_() ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง'; });
  ok('LINE_CHANNEL_ACCESS_TOKEN', function () { return prop_('LINE_CHANNEL_ACCESS_TOKEN') ? 'ตั้งแล้ว' : 'ยังไม่ได้ตั้ง'; });
}

/* ลองเขียนไฟล์ลงโฟลเดอร์ Drive จริง (สร้างไฟล์ข้อความเล็ก ๆ แล้วย้ายลงถังขยะ) — บอกสาเหตุถ้าเก็บไฟล์ไม่ได้ */
function diagDriveWrite() {
  var id = prop_('DRIVE_FOLDER_ID');
  console.log('บัญชีที่รัน: ' + Session.getEffectiveUser().getEmail() + ' · โฟลเดอร์: ' + id);
  var folder = DriveApp.getFolderById(id);
  console.log('ชื่อ: ' + folder.getName() + ' · เจ้าของ: ' + folder.getOwner().getEmail() +
              ' · สิทธิ์ของฉัน: ' + folder.getAccess(Session.getEffectiveUser().getEmail()));
  try {
    var f = folder.createFile('ทดสอบ-ลบได้.txt', 'diagDriveWrite ' + new Date());
    console.log('✓ สร้างไฟล์ได้: ' + f.getId());
    f.setTrashed(true);
    console.log('✓ ย้ายไฟล์ทดสอบลงถังขยะแล้ว');
  } catch (err) {
    console.error('✗ สร้างไฟล์ไม่ได้: ' + err);
  }
}
