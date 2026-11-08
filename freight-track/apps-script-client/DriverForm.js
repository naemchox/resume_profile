/* ============================================================
   AppsScript-driverform.gs — Google Form ให้คนขับกรอกข้อมูลตัวเอง (ผู้ใช้สั่ง 27 ต.ค. 2026)

   คำตอบ → แท็บ "การตอบกลับแบบฟอร์ม" (Google สร้างเอง) และคัดลงแท็บแรกของชีตคนขับ (gid=0) ให้อัตโนมัติ
     A = ID = เบอร์โทร · B = PASSWORD = เบอร์โทร · C ชื่อ–นามสกุล · D ทะเบียน · E เบอร์โทร
     F เลขที่บัญชี · G ธนาคาร (dropdown) · H ประเภทคนขับ (dropdown) · I ประเภทน้ำมัน (dropdown ชื่อตาม ปตท.)
   เบอร์โทรซ้ำกับคนที่มีอยู่ (ช่อง A หรือ E) = อัปเดตแถวเดิม C–I · ไม่แตะ ID / รหัสผ่านเดิม
   เขียนแถวแล้วส่งเข้าแอปทันที (driverRowsToApp_ ใน AppsScript-drivers.gs) — ไม่ต้องกด "รีเฟรชจากชีต"

   ---------- วิธีติดตั้ง (ครั้งเดียว) ----------
   1. เปิดชีตคนขับ → Extensions → Apps Script
   2. กด ＋ ข้าง Files → Script → ตั้งชื่อ DriverForm → วางไฟล์นี้ทั้งหมด → บันทึก
      (ต้องอยู่โปรเจกต์เดียวกับ AppsScript-drivers.gs — ใช้ฟังก์ชันร่วมกัน)
   3. เลือกฟังก์ชัน createDriverForm → Run → อนุญาตสิทธิ์ (Forms · Sheets · trigger)
   4. ดูลิงก์ฟอร์มใน Execution log → ส่งลิงก์ "สำหรับกรอก" ให้คนขับ
   รันซ้ำ = สร้างฟอร์มใหม่อีกอัน (ฟอร์มเก่ายังอยู่ ลบเองใน Google Drive) — ปกติไม่ต้องรันซ้ำ
   อยากอัปเดตรายการน้ำมันในฟอร์มตาม ปตท. ล่าสุด → รัน refreshDriverFormFuel
   ============================================================ */

var FORM_SHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';
var FORM_PROP = 'DRIVER_FORM_ID';
var FORM_TITLES = {
  name:  'ชื่อ–นามสกุล',
  plate: 'ทะเบียนรถ',
  phone: 'เบอร์โทรศัพท์',
  acct:  'เลขที่บัญชีธนาคาร',
  bank:  'ธนาคาร',
  fleet: 'ประเภทคนขับ',
  fuel:  'ประเภทน้ำมันที่รถใช้',
};
var BANKS = ['กสิกรไทย', 'กรุงเทพ', 'กรุงไทย', 'ไทยพาณิชย์', 'กรุงศรีอยุธยา', 'ทหารไทยธนชาต (ttb)', 'ออมสิน',
             'ธ.ก.ส.', 'อาคารสงเคราะห์ (ธอส.)', 'ยูโอบี', 'ซีไอเอ็มบี ไทย', 'เกียรตินาคินภัทร', 'แลนด์ แอนด์ เฮ้าส์',
             'ไอซีบีซี (ไทย)', 'อิสลามแห่งประเทศไทย'];

/* แท็บแรกของชีต (gid=0) — ไม่ใช้ชื่อแท็บ เผื่อมีคนเปลี่ยนชื่อ */
function driverTab_() {
  var ss = SpreadsheetApp.openById(FORM_SHEET_ID);
  var hit = ss.getSheets().filter(function (s) { return s.getSheetId() === 0; })[0];
  return hit || ss.getSheets()[0];
}
var digits_ = function (v) { return String(v == null ? '' : v).replace(/\D/g, ''); };

/** รันครั้งเดียว: สร้างฟอร์ม + ผูกคำตอบเข้าชีต + ตั้ง trigger ตอนส่งฟอร์ม */
function createDriverForm() {
  var form = FormApp.create('ข้อมูลคนขับ · FreightTrack');
  form.setDescription('กรอกข้อมูลให้ครบ ใช้เวลาประมาณ 2 นาที\n' +
    'เบอร์โทรที่กรอก จะใช้เป็นทั้ง ID และรหัสผ่านสำหรับเข้าแอปคนขับ');
  form.setConfirmationMessage('ส่งข้อมูลเรียบร้อย ขอบคุณครับ\nเข้าแอปคนขับได้ด้วย ID และรหัสผ่าน = เบอร์โทรที่กรอก');
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);

  form.addTextItem().setTitle(FORM_TITLES.name).setRequired(true);
  form.addTextItem().setTitle(FORM_TITLES.plate).setHelpText('เช่น 70-8842 กทม.').setRequired(true);
  form.addTextItem().setTitle(FORM_TITLES.phone).setHelpText('ตัวเลข 10 หลัก เช่น 0812345678 — ใช้เป็น ID และรหัสผ่านเข้าแอป')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^0[0-9]{9}$')
      .setHelpText('กรอกเบอร์มือถือ 10 หลัก ตัวเลขล้วน ขึ้นต้นด้วย 0').build());
  form.addTextItem().setTitle(FORM_TITLES.acct).setHelpText('ตัวเลขล้วน ไม่ต้องใส่ขีด').setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextMatchesPattern('^[0-9]{10,15}$')
      .setHelpText('กรอกเลขบัญชีเป็นตัวเลขล้วน 10–15 หลัก').build());
  form.addListItem().setTitle(FORM_TITLES.bank).setChoiceValues(BANKS).setRequired(true);
  form.addListItem().setTitle(FORM_TITLES.fleet).setChoiceValues([FLEET_OWN, FLEET_OUT]).setRequired(true);
  form.addListItem().setTitle(FORM_TITLES.fuel).setChoiceValues(fuelNames_()).setRequired(true);

  form.setDestination(FormApp.DestinationType.SPREADSHEET, FORM_SHEET_ID);
  /* Google มักแทรกแท็บคำตอบไว้หน้าสุด — สคริปต์อื่นอ่าน "แท็บแรก" (sheet_() ใน AppsScript-drivers.gs)
     ต้องย้ายแท็บคำตอบไปท้ายสุด ไม่งั้นการล็อกอินคนขับ/รายชื่อคนขับจะไปอ่านแท็บคำตอบแทน */
  SpreadsheetApp.flush();
  var ss = SpreadsheetApp.openById(FORM_SHEET_ID);
  var resp = ss.getSheets().filter(function (s) {
    var u = s.getFormUrl();
    return u && u.indexOf(form.getId()) >= 0;
  })[0];
  if (resp) { ss.setActiveSheet(resp); ss.moveActiveSheet(ss.getNumSheets()); resp.setName('คำตอบฟอร์มคนขับ'); }
  ss.setActiveSheet(driverTab_());
  ss.moveActiveSheet(1);
  PropertiesService.getScriptProperties().setProperty(FORM_PROP, form.getId());

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onDriverFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onDriverFormSubmit').forForm(form).onFormSubmit().create();

  console.log('สร้างฟอร์มแล้ว\nลิงก์สำหรับกรอก (ส่งให้คนขับ): ' + form.getPublishedUrl() +
              '\nลิงก์แก้ฟอร์ม: ' + form.getEditUrl());
}

/** อัปเดตรายการน้ำมันในฟอร์มตามชื่อ ปตท. ล่าสุด */
function refreshDriverFormFuel() {
  var id = PropertiesService.getScriptProperties().getProperty(FORM_PROP);
  if (!id) throw new Error('ยังไม่ได้สร้างฟอร์ม — รัน createDriverForm ก่อน');
  var form = FormApp.openById(id);
  var item = form.getItems(FormApp.ItemType.LIST).filter(function (i) { return i.getTitle() === FORM_TITLES.fuel; })[0];
  if (!item) throw new Error('ไม่เจอคำถาม "' + FORM_TITLES.fuel + '" ในฟอร์ม');
  var names = fuelNames_();
  item.asListItem().setChoiceValues(names);
  console.log('อัปเดตรายการน้ำมันแล้ว ' + names.length + ' ชนิด');
}

/** ทุกครั้งที่คนขับส่งฟอร์ม — คัดลงแท็บแรก (เพิ่มแถวใหม่ หรืออัปเดตแถวเดิมของเบอร์นี้) แล้วส่งเข้าแอป */
function onDriverFormSubmit(e) {
  var ans = {};
  e.response.getItemResponses().forEach(function (r) { ans[r.getItem().getTitle()] = norm_(r.getResponse()); });
  var phone = digits_(ans[FORM_TITLES.phone]);
  if (phone.length !== 10) { console.error('เบอร์ไม่ครบ 10 หลัก — ข้าม', ans); return; }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.error('onDriverFormSubmit: รอคิวไม่ได้ — คัดจากแท็บคำตอบเอง', ans); return; }
  try {
    var sh = driverTab_();
    var values = sh.getDataRange().getValues();
    var row = 0;
    for (var i = HEADER_ROWS; i < values.length && !row; i++) {
      if (digits_(values[i][0]) === phone || digits_(values[i][4]) === phone) row = i + 1;
    }
    var info = [ans[FORM_TITLES.name], ans[FORM_TITLES.plate], phone, digits_(ans[FORM_TITLES.acct]),
                ans[FORM_TITLES.bank], fleet_(ans[FORM_TITLES.fleet]), ans[FORM_TITLES.fuel]];   /* C..I */
    if (row) sh.getRange(row, 5).setNumberFormat('@');
    if (row) {
      /* คนเดิม — อัปเดต C–I · ID / รหัสผ่านเดิมไม่แตะ (คนขับอาจใช้อยู่) */
      var a = values[row - 1];
      writeDriverRow_(sh, row, [norm_(a[0]) || phone, norm_(a[1]) || phone].concat(info));
      sh.getRange(row, 3).setNote('อัปเดตจากฟอร์ม ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm'));
    } else {
      row = Math.max(sh.getLastRow(), HEADER_ROWS) + 1;
      sh.getRange(row, 5).setNumberFormat('@');                    /* เบอร์เป็นข้อความ ไม่งั้นชีตตัด 0 นำหน้า */
      writeDriverRow_(sh, row, [phone, phone].concat(info));
      sh.getRange(row, 3).setNote('มาจากฟอร์ม ' + Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm'));
    }
    if (typeof authReady_ === 'function' && authReady_()) console.log(driverRowsToApp_(sh, row, row));
    else console.warn('ยังไม่ได้ตั้งบัญชีบริการ — คนขับใหม่ยังไม่เข้าแอป · กด "รีเฟรชจากชีต" ที่หน้าข้อมูลคนขับ');
  } catch (err) {
    console.error('onDriverFormSubmit', err, ans);
  } finally {
    lock.releaseLock();
  }
}
