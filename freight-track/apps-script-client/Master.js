/* ============================================================
   AppsScript-master.gs — รวมไฟล์ขาวทุกไฟล์ที่ผ่านการตรวจและเก็บลง Drive แล้ว
   เข้า Google Sheet รวม (Master) ไฟล์เดียว เพื่อทำ Report รายเดือน

   ทางเดิน
     onValidFile_() (AppsScript-lineIntake.gs) เก็บไฟล์ลง Drive สำเร็จ
       → appendToMaster_() อ่านทุกชีตในไฟล์ที่หัวตารางตรงฟอร์แมท
       → Bills             : 1 แถวต่อ 1 บิล (กันซ้ำด้วยเลข Delivery — ไฟล์ใหม่ทับข้อมูลจากไฟล์ = อัปเดต)
       → Shipments         : 1 แถวต่อ 1 Shipment No. (ค่าใช้จ่าย/รายได้/รูป ไม่แตะ ให้แอปหรือคนกรอก)
       → ช่องทางชำระเงิน     : เพิ่มเลข Invoice ที่ยังไม่มี (ช่องทางชำระเงินปล่อยว่างให้กรอก)
                             ช่อง B ซิงก์สองทางกับแอป — ดู "ซิงก์สองทาง" ท้ายไฟล์
       → Drivers           : เพิ่มชื่อคนขับที่ยังไม่มี
       → ไฟล์ที่นำเข้า        : ประวัติไฟล์
       → Report-รายรอบ / Report-รายบิล : ต่อแถวสูตรให้เองเมื่อข้อมูลเกินที่ template เตรียมไว้

   ช่องที่มาจากแอป (วันที่ส่งของ สถานะการจัดส่ง วันที่รับสินค้า วันที่คืน Inv. ค่าใช้จ่าย รูป)
   สคริปต์นี้ไม่เขียนทับเลย แม้ไฟล์เดิมจะถูกส่งมาซ้ำ

   ---------- วิธีติดตั้ง ----------
   1. สร้างไฟล์ใหม่ชื่อ Master.gs ในโปรเจกต์ Apps Script เดิม แล้ววางไฟล์นี้ลงไป
      (อาศัยฟังก์ชันอ่าน .xlsx จาก AppsScript-lineIntake.gs — ต้องอยู่โปรเจกต์เดียวกัน)
   2. Google Sheet รวมต้องนำเข้า template ก่อน: "master template (เปล่า).xlsx"
      → เปิดชีต → File → Import → Upload → Replace spreadsheet
   3. บัญชีที่ deploy สคริปต์ต้องมีสิทธิ์ "แก้ไข" ชีตรวม
   4. (ถ้าจะเปลี่ยนชีตปลายทาง) Script properties → MASTER_SHEET_ID = ID ของชีต
   5. Deploy → Manage deployments → แก้ deployment เดิม → New version → Deploy
   6. ไฟล์ที่เข้า Drive ไปก่อนหน้านี้ รัน backfillMaster() หนึ่งครั้งเพื่อดึงย้อนหลัง
   7. ซิงก์สองทางกับแอป (ช่องทางชำระเงิน · คนขับ · ค่าใช้จ่าย): ดูวิธีติดตั้งท้ายไฟล์ (installMasterSync)
   ============================================================ */

var MASTER_SHEET_ID_DEFAULT = 'REPLACE_WITH_YOUR_SHEET_ID';
var MASTER_FILE_TYPE = 'เลขที่บิล (ขาว) — บิล / Invoice';
var MASTER_REPORT_HEAD = 5;             /* ชีท Report-ราย… ข้อมูลเริ่มแถว 6 */

function masterSheet_() {
  return SpreadsheetApp.openById(prop_('MASTER_SHEET_ID') || MASTER_SHEET_ID_DEFAULT);
}

/**
 * @param {Blob} blob ไฟล์ .xlsx ที่ผ่านการตรวจแล้ว
 * @param {{fileName:string, receivedAt:Date, locked?:boolean}} meta
 *        locked = ผู้เรียกถือ script lock อยู่แล้ว (handleUpload_) ไม่ต้องขอซ้ำ
 * @return {string} ข้อความสั้น ๆ ต่อท้ายคำตอบ
 */
function appendToMaster_(blob, meta) {
  var bills = masterReadBills_(blob);
  if (!bills.length) return '';

  var lock = null;
  if (!meta.locked) {                    /* LINE สองไฟล์เข้าพร้อมกัน แถวไม่ชนกัน */
    lock = LockService.getScriptLock();
    lock.waitLock(30000);
  }
  try {
    var ss = masterSheet_();
    var b = masterUpsertBills_(ss.getSheetByName('Bills'), bills, meta.fileName);
    var s = masterUpsertShipments_(ss.getSheetByName('Shipments'), bills, meta.fileName);
    masterAddInvoices_(ss.getSheetByName('ช่องทางชำระเงิน'), bills);
    masterAddDrivers_(ss.getSheetByName('Drivers'), bills);
    masterLogFile_(ss.getSheetByName('ไฟล์ที่นำเข้า'), bills, meta);
    masterEnsureReportRows_(ss.getSheetByName('Report-รายบิล'), b.total);
    masterEnsureReportRows_(ss.getSheetByName('Report-รายรอบ'), s.total);
    SpreadsheetApp.flush();
    console.log('Master: บิลใหม่ ' + b.added + ' · อัปเดต ' + b.updated +
                ' · Shipment ใหม่ ' + s.added);
    return 'รวมเข้าไฟล์ Master แล้ว ' + b.added + ' บิลใหม่' +
           (b.updated ? ' · อัปเดต ' + b.updated + ' บิล' : '');
  } finally {
    if (lock) lock.releaseLock();
  }
}

/* ================= อ่านไฟล์ ================================= */

/** ทุกแถวบิลจากทุกชีตที่หัวตารางตรงฟอร์แมท (ชีตที่ไม่ตรงข้ามทั้งชีต) */
function masterReadBills_(blob) {
  var files = Utilities.unzip(blob.setContentType('application/zip'));
  var byName = {};
  for (var i = 0; i < files.length; i++) byName[files[i].getName()] = files[i];
  if (!byName['xl/workbook.xml']) return [];

  var shared = readSharedStrings_(byName['xl/sharedStrings.xml']);
  var sheets = sheetTargets_(byName['xl/workbook.xml'], byName['xl/_rels/workbook.xml.rels']);
  var out = [];
  for (var s = 0; s < sheets.length; s++) {
    var part = byName[sheets[s].target];
    if (!part || !compareHeaders_(firstRow_(part, shared)).ok) continue;

    var rows = sheetRows_(part, shared, 1);
    for (var r = 0; r < rows.length; r++) {
      var c = rows[r];
      var get = function (i) { return normHeader2_(c[i]); };
      var delivery = get(6), invoice = get(5);
      if (!delivery && !invoice) continue;            /* แถวว่าง / แถวรวม */
      out.push({
        shipment: get(0),
        date: masterDate_(get(1)),
        carrier: masterCarrier_(get(2)),
        plate: get(3),
        no: masterNum_(get(4)),
        invoice: invoice,
        delivery: delivery,
        customer: get(7),
        dest: get(8),
        province: masterProvince_(get(11), [get(10), get(9)].join(' ')),
        weight: masterNum_(get(12)),
        amount: masterNum_(get(15)),
        driver: get(17)                               /* R — บางชีตไม่มี / ใส่แค่แถวแรกของรอบ */
      });
    }
  }

  /* ชื่อคนขับมักใส่แค่แถวแรกของ Shipment — เติมให้แถวอื่นในรอบเดียวกัน */
  var drv = {};
  out.forEach(function (x) { if (x.driver && !drv[x.shipment]) drv[x.shipment] = x.driver; });
  out.forEach(function (x) { if (!x.driver) x.driver = drv[x.shipment] || ''; });
  return out;
}

/** '14/09/2026' · '14.09.2026' · serial ของ Excel · ปี พ.ศ. → Date (อ่านไม่ออกคืนข้อความเดิม) */
function masterDate_(s) {
  if (!s) return '';
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) {
    return new Date(1899, 11, 30 + Math.floor(Number(s)));
  }
  var m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/);
  if (!m) return s;
  var y = Number(m[3]);
  if (y > 2400) y -= 543;
  return new Date(y, Number(m[2]) - 1, Number(m[1]));
}

/** ชื่อเต็มในไฟล์ → ชื่อสั้นที่ Report ใช้กรอง (ทั้งหมด / ขนส่งตัวอย่าง / พันธมิตร) */
function masterCarrier_(s) {
  if (/ตัวอย่าง/.test(s)) return 'ขนส่งตัวอย่าง';
  if (/พันธมิตร/.test(s)) return 'พันธมิตร';
  return s.replace(/^บ\.ขนส่ง\s*/, '').replace(/^บริษัท\s*/, '').trim();
}

/** L มักเป็น "อ.วังน้อย จ.พระนครศรีอยุธยา" แต่บางแถวเป็น "สองพี่น้อง สุพรรณบุรี" (ไม่มี จ.) — ใช้คำท้าย */
function masterProvince_(lastLine, rest) {
  var all = lastLine + ' ' + rest;
  if (/กรุงเทพ|กทม/.test(all)) return 'กรุงเทพมหานคร';
  var m = all.match(/(?:จ\.|จังหวัด)\s*([^\s\d]+)/);
  var p = m ? m[1] : (lastLine.split(/\s+/).pop() || '');
  if (p === 'อยุธยา') p = 'พระนครศรีอยุธยา';
  return /^[\u0E00-\u0E7F]+$/.test(p) ? p : '';
}

function masterRegion_(plate) {
  if (/ตวอ|ตะวันออก/.test(plate)) return 'ตะวันออก';
  if (/กลาง/.test(plate)) return 'กลาง';
  return '';
}

function masterNum_(s) {
  if (s === '' || s === null || s === undefined) return '';
  var n = Number(String(s).replace(/,/g, ''));
  return isNaN(n) ? s : n;
}

/* ================= เขียนลงชีต ================================ */

/** แถวสุดท้ายที่คอลัมน์ A มีค่า (ชีต template มีแถวจัดรูปแบบว่าง ๆ รออยู่ ใช้ getLastRow ไม่ได้) */
function masterLastRow_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return 1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) if (col[i][0] !== '') return i + 2;
  return 1;
}

/** ต่อแถวใหม่ท้ายชีต — ลอกรูปแบบ + dropdown จากแถว 2 และขยายตัวกรองให้คลุม */
function masterAppend_(sh, rows, width) {
  if (!rows.length) return;
  var start = masterLastRow_(sh) + 1;
  var end = start + rows.length - 1;
  if (sh.getMaxRows() < end) sh.insertRowsAfter(sh.getMaxRows(), end - sh.getMaxRows());
  var target = sh.getRange(start, 1, rows.length, width);
  var tpl = sh.getRange(2, 1, 1, width);
  tpl.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  tpl.copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);

  /* สูตรเขียนด้วย {r} แทนเลขแถว แล้วแทนค่าตรงนี้ */
  var out = rows.map(function (row, i) {
    var r = start + i;
    return row.map(function (v) {
      return (typeof v === 'string' && v.charAt(0) === '=')
        ? v.replace(/\{r\}/g, r).replace(/\{p\}/g, r - 1) : v;
    });
  });
  target.setValues(out);

  var f = sh.getFilter();
  if (f && f.getRange().getLastRow() < end) {
    var fr = f.getRange();
    f.remove();
    sh.getRange(1, fr.getColumn(), end, fr.getNumColumns()).createFilter();
  }
}

/** Shipment No. → ชื่อคนขับที่แอปซิงก์ลงช่อง E ไว้ (จดในคอลัมน์ W ของ Shipments) */
function masterAppDrivers_() {
  var sh = masterSheet_().getSheetByName('Shipments');
  var last = masterLastRow_(sh), out = {};
  if (last < 2 || sh.getMaxColumns() < SHIP.stamp) return out;
  var a = sh.getRange(2, 1, last - 1, 1).getValues();
  var w = sh.getRange(2, SHIP.stamp, last - 1, 1).getValues();
  for (var i = 0; i < a.length; i++) {
    var e = rowStamp_(w[i][0]).E;
    if (e) out[syncKey_(a[i][0])] = String(e);
  }
  return out;
}

/** ไฟล์ใหม่เพิ่งเขียน G/I/J/L/M ทับ — ลบออกจากที่จดซิงก์ไว้ ไม่งั้นตัวเก็บตกจะนึกว่าคนแก้แล้วดันเข้าแอป
 *  (รอบหน้าแอปเขียนค่าของแอปกลับลงไป · แอปเองก็รับเลข/ยอดจากไฟล์ขาวอยู่แล้ว — opsAuto.js) */
function masterForgetFileCols_(sh, row) {
  if (sh.getMaxColumns() < BILL.stamp) return;
  var c = sh.getRange(row, BILL.stamp), st = rowStamp_(c.getValue());
  if (!Object.keys(st).length) return;
  ['G', 'I', 'J', 'L', 'M'].forEach(function (k) { delete st[k]; });
  c.setValue(JSON.stringify(st));
}

/* 2 พ.ย.: เลข Delivery เดียวกันส่งใหม่ได้ (ส่งไม่สำเร็จ/ไม่หมด) — แต่ละรอบเป็นคนละแถว แยกด้วยวันที่ออกเดินทาง (B)
   วันเดียวกัน = แถวเดิม (ไฟล์ส่งซ้ำ / ไฟล์ที่แก้เลข 7) · ไม่มีเลข Delivery ใช้ Shipment + Invoice เหมือนเดิม */
function masterBillKey_(delivery, shipment, invoice, date) {
  return delivery ? 'D' + String(delivery) + '|' + masterDay_(date) : 'S' + String(shipment) + '|' + String(invoice);
}

/** ช่องวันที่ของแถว Bills → 'yyyy-MM-dd' ('' = ไม่มี/อ่านไม่ออก) */
function masterDay_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return ymdLocal_(v);
  var s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function masterUpsertBills_(sh, bills, fileName) {
  var last = masterLastRow_(sh);
  var old = last > 1 ? sh.getRange(2, 1, last - 1, 20).getValues() : [];
  var at = {}, undated = {};
  old.forEach(function (r, i) {
    at[masterBillKey_(r[7], r[0], r[6], r[1])] = i + 2;
    /* แถวเก่าที่ช่อง B ว่าง/อ่านไม่ออก — ไฟล์ของเลข Delivery นี้ยังอัปเดตแถวนี้ได้ (ไม่เพิ่มแถวซ้ำ) */
    if (syncKey_(r[7]) && !masterDay_(r[1]) && !undated[syncKey_(r[7])]) undated[syncKey_(r[7])] = i + 2;
  });

  var appDriver = masterAppDrivers_();
  var updated = 0, fresh = {}, order = [];
  bills.forEach(function (x) {
    var key = masterBillKey_(x.delivery, x.shipment, x.invoice, x.date);
    var row = at[key] || (x.delivery && undated[syncKey_(x.delivery)]);
    if (row) {
      /* คนขับที่แอปซิงก์ลงมาแล้วชนะชื่อในไฟล์ — ไฟล์ส่งซ้ำไม่ทับ */
      var keepDriver = appDriver[syncKey_(x.shipment)] || x.driver || old[row - 2][4];
      sh.getRange(row, 1, 1, 13).setValues([[x.shipment, x.date, x.carrier, x.plate, keepDriver,
        x.no, x.invoice, x.delivery, x.customer, x.dest, x.province, x.weight, x.amount]]);
      sh.getRange(row, 20).setValue(fileName);
      masterForgetFileCols_(sh, row);
      updated++;
      return;
    }
    if (!fresh[key]) order.push(key);                 /* บิลซ้ำในไฟล์เดียวกัน — ใช้แถวหลังสุด */
    fresh[key] = [x.shipment, x.date, x.carrier, x.plate, appDriver[syncKey_(x.shipment)] || x.driver, x.no, x.invoice, x.delivery,
      x.customer, x.dest, x.province, x.weight, x.amount,
      '', '', '', '',                                 /* N–Q มาจากแอป */
      '=IF(Q{r}<>"","คืนแล้ว",IF(Report!$C$5-B{r}>7,"ค้างเกิน 7 วัน","ค้าง"))',
      '=IF(Q{r}<>"",Q{r}-B{r},Report!$C$5-B{r})',
      fileName,
      '=IF(AND(B{r}>=Report!$C$4,B{r}<=Report!$C$5,OR(Report!$C$6="ทั้งหมด",C{r}=Report!$C$6)),MAX(U$1:U{p})+1,0)'];
  });
  var add = order.map(function (k) { return fresh[k]; });
  masterAppend_(sh, add, 21);
  return { added: add.length, updated: updated, total: (last - 1) + add.length };
}

function masterUpsertShipments_(sh, bills, fileName) {
  var groups = {}, order = [];
  bills.forEach(function (x) {
    if (!x.shipment) return;
    var g = groups[x.shipment];
    if (!g) { g = groups[x.shipment] = { x: x, driver: '' }; order.push(x.shipment); }
    if (!g.driver && x.driver) g.driver = x.driver;
  });

  var last = masterLastRow_(sh);
  var old = last > 1 ? sh.getRange(2, 1, last - 1, 6).getValues() : [];
  var at = {};
  old.forEach(function (r, i) { at[String(r[0])] = i + 2; });
  var appDriver = masterAppDrivers_();

  var add = [];
  order.forEach(function (id) {
    var g = groups[id], x = g.x;
    var vals = [id, x.date, x.carrier, x.plate, g.driver, masterRegion_(x.plate)];
    var row = at[String(id)];
    if (row) {                                         /* ค่าใช้จ่าย รายได้ รูป (J–R) ไม่แตะ */
      vals[4] = appDriver[syncKey_(id)] || vals[4] || old[row - 2][4];   /* คนขับจากแอปชนะไฟล์ */
      vals[5] = vals[5] || old[row - 2][5];
      sh.getRange(row, 1, 1, 6).setValues([vals]);
      sh.getRange(row, 20).setValue(fileName);
      return;
    }
    add.push(vals.concat([
      '=COUNTIF(Bills!$A:$A,A{r})',
      '=SUMIF(Bills!$A:$A,A{r},Bills!$L:$L)',
      '=SUMIF(Bills!$A:$A,A{r},Bills!$M:$M)',
      '', '', '', '',                                  /* J–M ค่าใช้จ่ายจากแอป */
      '=SUM(J{r}:M{r})',
      '',                                              /* O รายได้ค่าขนส่ง */
      '=O{r}-N{r}',
      '', '',                                          /* Q–R จำนวนรูป */
      '=IF(AND(Q{r}>=4,R{r}>=4),"ครบ","ไม่ครบ")',
      fileName,
      '=IF(AND(B{r}>=Report!$C$4,B{r}<=Report!$C$5,OR(Report!$C$6="ทั้งหมด",C{r}=Report!$C$6)),MAX(U$1:U{p})+1,0)'
    ]));
  });
  masterAppend_(sh, add, 21);
  return { added: add.length, total: (last - 1) + add.length };
}

/* ชีตนี้มีตารางสรุปอยู่ที่ I:K — แตะเฉพาะ A:G */
function masterAddInvoices_(sh, bills) {
  var last = masterLastRow_(sh);
  var have = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[String(r[0])] = 1; });
  var add = [];
  bills.forEach(function (x) {
    if (!x.invoice || have[String(x.invoice)]) return;
    have[String(x.invoice)] = 1;
    add.push([x.invoice, '',
      '=INDEX(Bills!$A:$A,MATCH($A{r},Bills!$G:$G,0))',
      '=INDEX(Bills!$B:$B,MATCH($A{r},Bills!$G:$G,0))',
      '=INDEX(Bills!$C:$C,MATCH($A{r},Bills!$G:$G,0))',
      '=INDEX(Bills!$I:$I,MATCH($A{r},Bills!$G:$G,0))',
      '=INDEX(Bills!$M:$M,MATCH($A{r},Bills!$G:$G,0))']);
  });
  masterAppend_(sh, add, 7);
}

function masterAddDrivers_(sh, bills) {
  var last = masterLastRow_(sh);
  var have = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[String(r[0]).trim()] = 1; });
  var add = [];
  bills.forEach(function (x) {
    String(x.driver || '').split(/\s*[,،\/]\s*|\s+และ\s+/).forEach(function (name) {
      name = name.trim();
      if (!name || have[name]) return;
      have[name] = 1;
      add.push([name, x.carrier, x.plate]);
    });
  });
  masterAppend_(sh, add, 3);
}

function masterLogFile_(sh, bills, meta) {
  var dates = bills.map(function (x) { return x.date; })
    .filter(function (d) { return d instanceof Date; })
    .sort(function (a, b) { return a - b; });
  var vals = [meta.fileName, MASTER_FILE_TYPE, meta.receivedAt || new Date(),
              dates[0] || '', dates[dates.length - 1] || ''];

  var last = masterLastRow_(sh);
  if (last > 1) {
    var names = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]) === meta.fileName) {     /* ไฟล์เดิมส่งซ้ำ — อัปเดตวันที่ */
        sh.getRange(i + 2, 1, 1, 5).setValues([vals]);
        return;
      }
    }
  }
  masterAppend_(sh, [vals.concat(['=COUNTIF(Bills!$T:$T,A{r})'])], 6);
}

/**
 * template เตรียมแถวสูตรไว้จำกัด (รายบิล 757 · รายรอบ 102) — ถ้าข้อมูลเกิน ลอกแถวสุดท้ายต่อลงไป
 * สูตรคอลัมน์ A มีเลขลำดับฝังอยู่ในตัว (=IF(757>MAX(…),"",757)) จึงเขียนใหม่ทีละแถว
 */
function masterEnsureReportRows_(sh, needed) {
  var last = sh.getLastRow();
  var cap = last - MASTER_REPORT_HEAD;
  if (needed <= cap) return;

  var add = needed - cap + 100;                        /* เผื่อไว้ ไม่ต้องขยายทุกไฟล์ */
  var cols = sh.getLastColumn();
  if (sh.getMaxRows() < last + add) sh.insertRowsAfter(sh.getMaxRows(), last + add - sh.getMaxRows());
  sh.getRange(last, 1, 1, cols).copyTo(sh.getRange(last + 1, 1, add, cols));

  var src = sh.getRange(last, 1).getFormula();
  var f = [];
  for (var i = 1; i <= add; i++) {
    var n = cap + i;
    f.push([src.replace(/^=IF\(\d+>/, '=IF(' + n + '>').replace(/,\d+\)$/, ',' + n + ')')]);
  }
  sh.getRange(last + 1, 1, add, 1).setFormulas(f);
}

/* ================= รันเองในตัวแก้ไข =========================== */

/**
 * ดึงไฟล์ .xlsx ทุกไฟล์ในโฟลเดอร์ DRIVE_FOLDER_ID เข้า Master (เก่า → ใหม่)
 * รันซ้ำได้ ไม่เกิดแถวซ้ำ เพราะกันซ้ำด้วยเลข Delivery
 */
function backfillMaster() {
  var folderId = prop_('DRIVE_FOLDER_ID');
  if (!folderId) throw new Error('ยังไม่ได้ตั้ง DRIVE_FOLDER_ID');
  var list = [];
  var it = DriveApp.getFolderById(folderId).getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/\.xlsx$/i.test(f.getName())) list.push(f);
  }
  list.sort(function (a, b) { return a.getDateCreated() - b.getDateCreated(); });

  list.forEach(function (f) {
    var blob = f.getBlob();
    if (!checkFormat_(blob).ok) { console.log('ข้าม (หัวตารางไม่ตรง): ' + f.getName()); return; }
    var note = appendToMaster_(f.getBlob(), {
      fileName: f.getName().replace(/^\d{8}-\d{6}_/, ''),   /* ตัดเวลาที่ onValidFile_ เติมหน้าชื่อ */
      receivedAt: f.getDateCreated()
    });
    console.log(f.getName() + ' → ' + (note || 'ไม่มีแถวบิล'));
  });
}

/** เช็กว่าสคริปต์เปิดชีตรวมได้ และ template ถูกนำเข้าแล้ว */
function checkMasterSetup() {
  var ss = masterSheet_();
  console.log('ชีตรวม: ' + ss.getName());
  ['Bills', 'Shipments', 'ช่องทางชำระเงิน', 'Drivers', 'ไฟล์ที่นำเข้า', 'Report-รายบิล', 'Report-รายรอบ']
    .forEach(function (n) {
      var sh = ss.getSheetByName(n);
      console.log((sh ? '✓ ' : '✗ ไม่มีชีต ') + n + (sh ? ' — ข้อมูล ' + (masterLastRow_(sh) - 1) + ' แถว' : ''));
    });
}

/* ================= ซิงก์สองทาง: แอป ↔ ชีตรวม =====================
   ช่องที่ซิงก์ (⇄ สองทาง · → แอปลงชีตอย่างเดียว · ชีตแก้แล้วไม่เข้าแอป)

   แท็บ "ช่องทางชำระเงิน" (จับคู่ด้วยเลข Invoice ช่อง A)
     B  ช่องทางชำระเงิน          ⇄  stop.payment.method
   แท็บ Shipments (จับคู่ด้วย Shipment No. ช่อง A)
     E  คนขับ                   ⇄  job.driverIds (ชื่อคั่นด้วย ", ")
     J  ค่ารอบ · K น้ำมัน · L ทางด่วน · M อื่น ๆ (ตัวเลขรวม) · V รายละเอียดอื่น ๆ  →  job.pay
     O  รายได้ค่าขนส่ง            →  ผลรวมค่าขนส่งรายบิลของเที่ยว (stop.revenue ที่แก้มือ ไม่มีใช้ Amount) — แก้รายบิลที่ billing.html
                                    (26 ต.ค. 2026 เปลี่ยนจาก ⇄ job.revenue — ยอดรวมแบ่งกลับให้แต่ละบิลไม่ได้ ชีตแก้แล้วจึงไม่เข้าแอป)
     Q  รูปขึ้นรถ                →  จำนวนรูปขั้นขึ้นรถของเที่ยว
     R  รูปปิดงาน                →  จำนวนรูปปิดงาน (จุดส่งที่น้อยที่สุด — ≥4 = ครบทุกจุด)
     W  (ระบบ · ซ่อน) ค่าที่ซิงก์กันล่าสุด
   แท็บ Bills (จับคู่ด้วยเลข Delivery ช่อง H · ไม่มีค่อยใช้ Invoice)
     E  คนขับ                   →  ตามเที่ยว
     G  Invoice                 →  stop.invoice.number (เปลี่ยนแล้วแก้เลขในแท็บช่องทางชำระเงินให้ด้วย)
     I  ชื่อลูกค้า                ⇄  stop.customer.name (ช่อง "ชื่อบริษัท / ผู้ส่ง" ในหน้าแก้ไขใบงาน)
     J  ชื่อสถานที่จัดส่ง          ⇄  stop.dropoff.name
     L  น้ำหนัก                  ⇄  stop.cargo.weightKg
     M  Amount                  ⇄  stop.invoice.amount
     N  วันที่ส่งของ · P วันที่รับสินค้า  →  วันที่คนขับปิดจุดส่ง (ลูกค้ารับของวันเดียวกัน)
     O  สถานะการจัดส่ง           →  ส่งสำเร็จ / ยกเลิก
     Q  วันที่คืน Inv.            ⇄  stop.invoiceReturn (แก้ในแอปที่ helper.html)
     V  (ระบบ · ซ่อน) ค่าที่ซิงก์กันล่าสุด
   แท็บ Drivers                 →  คนขับใหม่ในแอปเพิ่มเป็นแถวใหม่ (ไม่ลบ ไม่แก้ชื่อเดิม)
   แท็บ Billing (จับคู่ด้วยเลขที่ใบวางบิล ช่อง A · เฉพาะแถว "ฝั่งเรา")  →  ใบวางบิลในแอป (billing.html · คอลเลกชัน bills)
     A เลขที่ · B ฝั่งเรา · C ชื่อลูกค้าที่ออกบิลให้ (billTo.name) · D รายการ (เดือน/ช่วงวันที่) · E งวดงานถึงวันที่ (เที่ยวล่าสุดในใบ)
     F วันที่วางบิล · G ครบกำหนด · H ยอด · I ช่องทางชำระเงิน · J วันที่ชำระ (ตอนยืนยันรับเงิน)
     K สถานะ = สูตรเดิม · ใบที่ยกเลิก → K เป็น "ยกเลิก" (ไม่ถูกรวมใน Report) · L (ระบบ · ซ่อน) ค่าที่ซิงก์ล่าสุด
     แถว "ฝั่งลูกค้า" ไม่มีในแอป — ไม่แตะ · ไม่ต้องรอเที่ยวส่งครบ (ใบวางบิลออกหลังส่งครบอยู่แล้ว)

   แอป → ชีต   เฉพาะเที่ยวที่ส่งครบทุกจุดแล้ว (ไม่นับจุดยกเลิก) — ครบเมื่อไหร่ส่งทุกช่องของเที่ยวพร้อมกัน
               ตัวตั้งเวลาเช็คทุก 5 นาที · หน้า ops กดบันทึก → action:'syncMaster' ส่งเที่ยวนั้นทันที
   ชีต → แอป   เฉพาะช่อง ⇄ · คนแก้ในชีตเมื่อไหร่เข้าแอปทันที (onMasterEdit) ไม่ต้องรอเที่ยวส่งครบ
               ตัวตั้งเวลาเก็บตกทุก 5 นาที (ค่าในช่องไม่ตรงกับที่จดไว้ = มีคนแก้)
               ล้างค่าจนว่าง = ล้างในแอปด้วย: ช่องทางชำระเงิน → รอบใหม่ "ยกเลิก" · คนขับ → ยกเลิกการจ่ายงาน
                 วันที่คืน Inv. → ยกเลิกการคืน · รายได้/น้ำหนัก/Amount → 0 · ชื่อลูกค้า/ปลายทาง → ว่าง
               ค่าใช้ไม่ได้ (ชื่อคนขับไม่รู้จัก วันที่เกินวันนี้ ฯลฯ) = ไม่ซิงก์ ขึ้น note
   ลบทั้งแถว   Bills → จุดส่งในแอป "ยกเลิก" · Shipments → ทั้งเที่ยว "ยกเลิก" · Billing → ใบวางบิล "ยกเลิก"
               (ข้อมูล รูป ลายเซ็นยังอยู่ครบ) · กด Undo ในชีตจนแถวกลับมา → กู้สถานะเดิมให้เอง
               รู้ได้จากรหัสในคอลัมน์ระบบ (ซ่อน) ที่หายไป — ทะเบียนอยู่แท็บ "_ซิงก์ (ระบบ)" (ซ่อน)
               แถวหายพร้อมกันเยอะผิดปกติ (> 10 แถว และ > 20% ของแท็บ) → ไม่ยกเลิกให้ จดเตือนในประวัติ
                 ตรวจแล้วตั้งใจลบจริง → รัน confirmSheetDeletes()
   ประวัติ     ทุกช่องที่ระบบเปลี่ยน (ทั้งสองทาง) + การยกเลิก/กู้คืน ต่อท้ายแท็บ "ประวัติซิงก์" — ไว้ดูค่าเดิมเผื่อย้อนกลับ
               ย้อนกลับ: พิมพ์ค่าเดิมกลับทีละช่อง (ห้าม Restore ทั้ง version — คอลัมน์ระบบย้อนตาม แอปจะเขียนทับกลับ)
   ช่อง →      คนแก้ในชีต → ไม่เข้าแอป · แถวที่เคยซิงก์แล้วคืนเป็นค่าจากแอป + note บอก
               (ค่าใช้จ่าย: ชีตมีแค่ยอดรวมของเที่ยว แบ่งกลับรายคนขับไม่ได้ · วันที่ส่ง/สถานะ/รูป: มาจากคนขับหน้างาน)

   แบ่งค่ารอบในแอป (รายคนขับ หลายบรรทัด) ลงช่อง J–M ตามโน้ต
     "น้ำมัน" → K · "ทางด่วน" → L · "ค่ารอบ" หรือบรรทัดแรกของคนขับแต่ละคน → J · ที่เหลือ → M

   ---------- ติดตั้ง (ครั้งเดียว) ----------
   ต้องตั้ง FIREBASE_SA_JSON แล้ว (AppsScript-auth.gs)
   1. วางโค้ดนี้ + AppsScript-drivers.gs ตัวใหม่ (มีทาง syncMaster ใน doPost) แล้วกดบันทึก
   2. เลือกฟังก์ชัน installMasterSync → Run (อนุญาตสิทธิ์) — ตั้งเวลา 5 นาที + ตัวดักการแก้/ลบแถว + คอลัมน์ระบบ + แท็บประวัติ
   3. รัน fixReportDriverFormulas หนึ่งครั้ง — Report นับคนขับแบบ "มีชื่อในช่อง" (เที่ยวหลายคนขับ)
   4. Deploy → Manage deployments → แก้ deployment เดิม → New version → Deploy (สำหรับปุ่มบันทึกในหน้า ops)
   5. (ถ้าต้องการ) รัน syncMasterAll หนึ่งครั้ง — ส่งทุกเที่ยวที่ส่งครบแล้วขึ้นชีต ไม่จำกัดวัน
   ============================================================ */

var SYNC_DAYS = 7;
var TZ = 'Asia/Bangkok';                 /* วันทำงานไทย (วันที่ส่งของ เวลาในประวัติ) */
/* ช่องวันที่: สร้างด้วย new Date(ปี, เดือน, วัน) และอ่านกลับด้วย getFullYear/getMonth/getDate
   แบบเดียวกับโค้ดนำเข้าไฟล์ (masterDate_) — ทดสอบกับชีตจริงแล้วแสดงวันถูก
   (parseDate + ระบุเขตเวลา ทำให้ชีตนี้แสดงวันก่อนหน้า แม้ชีตและสคริปต์ตั้งกรุงเทพฯ ทั้งคู่) */
function ymdLocal_(d) {
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
var PAY_SYNC_METHODS = ['เงินโอน', 'เงินสด', 'เครดิต'];   /* ตรงกับ dropdown ช่อง B และ PAY_METHODS ใน store.js */

/* แต่ละแท็บ: คอลัมน์ · ช่องที่ชีตแก้แล้วเข้าแอป · ช่องที่ล็อก · ช่องวันที่ · คอลัมน์จด (ซ่อน) */
var SHIP = {
  name: 'Shipments', stamp: 23,
  col: { E: 5, J: 10, K: 11, L: 12, M: 13, O: 15, Q: 17, R: 18, V: 22 },
  toApp: ['E'], locked: ['J', 'K', 'L', 'M', 'O', 'V', 'Q', 'R'], dates: [],
  key: function (r) { return syncKey_(r[0]); }, idKey: '_job',
  label: { E: 'E คนขับ', J: 'J ค่ารอบคนขับ', K: 'K ค่าน้ำมัน', L: 'L ค่าทางด่วน', M: 'M ค่าใช้จ่ายอื่น ๆ',
           O: 'O รายได้ค่าขนส่ง', Q: 'Q รูปขึ้นรถ', R: 'R รูปปิดงาน', V: 'V รายละเอียดค่าใช้จ่ายอื่น ๆ' },
  why: { J: 'ค่าใช้จ่ายแก้ในหน้า ops (ชีตไม่รู้ว่าแบ่งให้คนขับคนไหนเท่าไร)', O: 'ค่าขนส่งแก้รายบิลในหน้า billing (ช่องนี้ = รวมทุกบิลของเที่ยว)', Q: 'นับจากรูปที่ถ่ายในแอป', R: 'นับจากรูปที่ถ่ายในแอป' }
};
var BILL = {
  name: 'Bills', stamp: 22,
  col: { G: 7, I: 9, J: 10, L: 12, M: 13, N: 14, O: 15, P: 16, Q: 17 },
  toApp: ['I', 'J', 'L', 'M', 'Q'], locked: ['G', 'N', 'O', 'P'], dates: ['N', 'P', 'Q'],
  key: function (r) { return syncKey_(r[7]) || syncKey_(r[6]); }, idKey: '_stops',
  label: { G: 'G Invoice', I: 'I ชื่อลูกค้า', J: 'J ชื่อสถานที่จัดส่ง', L: 'L น้ำหนัก', M: 'M Amount',
           N: 'N วันที่ส่งของ', O: 'O สถานะการจัดส่ง', P: 'P วันที่รับสินค้า', Q: 'Q วันที่คืน Inv.' },
  why: { G: 'แก้เลข Invoice ในหน้า ops', N: 'มาจากตอนคนขับปิดจุดส่ง', O: 'มาจากสถานะในแอป', P: 'มาจากตอนคนขับปิดจุดส่ง' }
};
var BILLING = {
  name: 'Billing', stamp: 12,
  col: { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, J: 10 },
  toApp: [], locked: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], dates: ['E', 'F', 'G', 'J'],
  key: function (r) { return syncKey_(r[0]); }, idKey: '_bill',
  label: { A: 'A เลขที่ใบวางบิล', B: 'B ฝั่ง', C: 'C ลูกค้า', D: 'D รายการ', E: 'E งวดงานถึงวันที่', F: 'F วันที่วางบิล',
           G: 'G ครบกำหนดชำระ', H: 'H ยอดวางบิล', I: 'I ช่องทางชำระเงิน', J: 'J วันที่ชำระ' },
  why: { A: 'ใบวางบิลแก้ในหน้า billing', J: 'กดยืนยันรับเงินในหน้า billing', I: 'กดยืนยันรับเงินในหน้า billing' }
};
var BILLING_STATUS = '=IF(J{r}<>"","ชำระแล้ว",IF(F{r}="","ยังไม่วางบิล","รอชำระ"))';   /* ตรงกับสูตรเดิมของ template */
var STAMP_HEAD = 'ซิงก์กับแอป (ระบบ)';
var LOG_TAB = 'ประวัติซิงก์';
var LOG_HEAD = ['เวลา (ไทย)', 'ทิศทาง', 'แท็บ', 'เลขอ้างอิง', 'ช่อง', 'ค่าเดิม', 'ค่าใหม่', 'โดย'];
var REG_TAB = '_ซิงก์ (ระบบ)';
var REG_HEAD = ['แท็บ', 'รหัสในแอป', 'เลขอ้างอิง', 'สถานะ', 'ก่อนยกเลิก', 'เวลา'];
var DEL_GUARD_MIN = 10, DEL_GUARD_RATIO = 0.2;     /* แถวหายเกินนี้พร้อมกัน = ผิดปกติ ไม่ยกเลิกให้ */
var DIR = { TO_SHEET: 'แอป → ชีต', TO_APP: 'ชีต → แอป', REVERT: 'คืนค่า (แก้ได้ในแอปเท่านั้น)',
            CANCEL: 'ลบแถว → ยกเลิกในแอป', RESTORE: 'แถวกลับมา → กู้คืนในแอป', GUARD: 'ข้าม (แถวหายเยอะผิดปกติ)',
            APP_DELETE: 'แอดมินลบงานในแอป → ลบแถว' };
var LOG_BUF = [];
var NOTE_LOCKED = 'ช่องนี้แก้ได้ในเว็บแอปเท่านั้น — คืนเป็นค่าจากแอปแล้ว';
var NOTE_LOCKED_NEW = 'ช่องนี้แก้ได้ในเว็บแอปเท่านั้น — ที่พิมพ์ในชีตไม่เข้าแอป และจะถูกแทนด้วยค่าจากแอปเมื่อเที่ยวส่งครบ';
var STOP_FIELDS = ['status', 'jobId', 'delivery', 'invoice.number', 'invoice.amount', 'payment', 'updatedAt', 'source.shipmentNo',
                   'customer.name', 'dropoff.name', 'cargo.weightKg', 'invoiceReturn', 'events', 'revenue', 'masterPurge', 'serviceDate'];
var JOB_FIELDS = ['code', 'driverIds', 'pay', 'revenue', 'events', 'updatedAt'];

/* ================= ติดตั้ง ================= */

function installMasterSync() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var h = t.getHandlerFunction();
    if (h === 'syncMaster' || h === 'onMasterEdit' || h === 'onMasterChange') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncMaster').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('onMasterEdit').forSpreadsheet(masterSheet_()).onEdit().create();
  ScriptApp.newTrigger('onMasterChange').forSpreadsheet(masterSheet_()).onChange().create();
  var ss = masterSheet_();
  syncEnsureCols_(ss.getSheetByName(SHIP.name), SHIP);
  syncEnsureCols_(ss.getSheetByName(BILL.name), BILL);
  syncEnsureCols_(ss.getSheetByName(BILLING.name), BILLING);
  logSheet_(ss);
  regSheet_(ss);
  console.log('ตั้งแล้ว: syncMaster ทุก 5 นาที + onMasterEdit + onMasterChange');
  syncMaster();
}

/** คอลัมน์ระบบ (ซ่อน) + หัวคอลัมน์ V ของ Shipments */
function syncEnsureCols_(sh, T) {
  if (sh.getMaxColumns() < T.stamp) sh.insertColumnsAfter(sh.getMaxColumns(), T.stamp - sh.getMaxColumns());
  if (T === SHIP && !sh.getRange(1, SHIP.col.V).getValue()) sh.getRange(1, SHIP.col.V).setValue('รายละเอียดค่าใช้จ่ายอื่น ๆ');
  if (!sh.getRange(1, T.stamp).getValue()) sh.getRange(1, T.stamp).setValue(STAMP_HEAD);
  sh.hideColumns(T.stamp);
}

/** Report นับ/รวมรายคนขับแบบ "มีชื่อนี้อยู่ในช่อง E" — เที่ยวหลายคนขับนับให้ทุกคน (รันครั้งเดียว) */
function fixReportDriverFormulas() {
  var sh = masterSheet_().getSheetByName('Report');
  var f = sh.getDataRange().getFormulas(), n = 0;
  for (var r = 0; r < f.length; r++) for (var c = 0; c < f[r].length; c++) {
    var v = f[r][c];
    if (!v || v.indexOf('Shipments!$E:$E,') < 0 || v.indexOf('"*"&') >= 0) continue;
    var nv = v.replace(/Shipments!\$E:\$E,(\$?[A-Z]{1,3}\$?\d+)/g, 'Shipments!$E:$E,"*"&$1&"*"');
    if (nv !== v) { sh.getRange(r + 1, c + 1).setFormula(nv); n++; }
  }
  console.log('แก้สูตร Report ' + n + ' ช่อง');
}

/* ================= ทางเข้า ================= */

/** ตัวตั้งเวลา: ชีต → แอป (เก็บตก) แล้ว แอป → ชีต (เที่ยวที่ขยับใน SYNC_DAYS วัน) */
function syncMaster() {
  if (!authReady_()) { console.warn('ยังไม่ได้ตั้ง FIREBASE_SA_JSON — ข้าม'); return; }
  syncLocked_(function () {
    var ss = masterSheet_();
    var gone = rowDeletes_(ss, false);
    var back = sheetScanToApp_(ss);
    var since = new Date(Date.now() - SYNC_DAYS * 86400000).toISOString();
    var ge = function (f) { return { fieldFilter: { field: { fieldPath: f }, op: 'GREATER_THAN_OR_EQUAL', value: { stringValue: since } } }; };
    var ids = {};
    fsQuery_('shipments', ge('updatedAt'), ['jobId']).forEach(function (x) { if (x.jobId) ids[x.jobId] = 1; });
    fsQuery_('jobs', ge('updatedAt'), ['code']).forEach(function (x) { ids[x._id] = 1; });
    var r = appToSheet_(ss, Object.keys(ids));
    var d = driversTabWrite_(ss.getSheetByName('Drivers'), driverNames_());
    var b = billingWrite_(ss, fsQuery_('bills', ge('updatedAt'), null));
    rowDeletes_(ss, false, true);
    console.log((gone ? 'ลบแถว/กู้คืน ' + gone + ' รายการ · ' : '') + 'ชีต → แอป ' + back + ' แถว · ' + syncLog_(r) + (d ? ' · คนขับใหม่ในแท็บ Drivers ' + d : '') +
                (b ? ' · Billing ' + b + ' ช่อง' : ''));
  });
}

/** ดึงทั้งหมด ไม่จำกัดวัน — รันมือครั้งเดียวตอนเริ่มใช้ */
function syncMasterAll() {
  if (!authReady_()) { console.warn('ยังไม่ได้ตั้ง FIREBASE_SA_JSON — ข้าม'); return; }
  syncLocked_(function () {
    var ss = masterSheet_();
    var ids = fsQuery_('jobs', null, ['code']).map(function (x) { return x._id; });
    console.log(syncLog_(appToSheet_(ss, ids)));
    driversTabWrite_(ss.getSheetByName('Drivers'), driverNames_());
    billingWrite_(ss, fsQuery_('bills', null, null));
    rowDeletes_(ss, false, true);
  });
}

/** หน้า ops / billing กดบันทึก → ส่งเที่ยวนั้นทันที (doPost action:'syncMaster' · พนักงานเท่านั้น) */
function syncMasterForJob_(body) {
  if (!authReady_()) return json_({ ok: false, error: 'ยังไม่ได้ตั้ง FIREBASE_SA_JSON ใน Apps Script' });
  var jobIds = (Array.isArray(body.jobIds) ? body.jobIds : [body.jobId]).map(norm_).filter(Boolean);
  var billIds = (Array.isArray(body.billIds) ? body.billIds : []).map(norm_).filter(Boolean);
  if (!jobIds.length && !billIds.length) return json_({ ok: false, error: 'ไม่มีรหัสเที่ยวหรือใบวางบิล' });
  try {
    var r = syncLocked_(function () {
      var ss = masterSheet_();
      var out = appToSheet_(ss, jobIds);
      if (billIds.length) out.wrote += billingWrite_(ss, fsIn_('bills', '__name__', billIds, null));
      if (out.wrote) rowDeletes_(ss, false, true);
      return out;
    });
    return json_({ ok: true, complete: r.complete > 0 || !jobIds.length, open: r.open, wrote: r.wrote, waiting: r.waiting, deleted: r.deleted || 0 });
  } catch (err) {
    console.error('syncMaster', err);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/** ตัวดักการแก้ชีต (installable onEdit — สคริปต์เขียนเองไม่ปลุกตัวนี้) */
function onMasterEdit(e) {
  if (!e || !e.range || !authReady_()) return;
  var sh = e.range.getSheet(), name = sh.getName();
  var r0 = Math.max(e.range.getRow(), 2), r1 = e.range.getLastRow();
  var c0 = e.range.getColumn(), c1 = e.range.getLastColumn();
  if (r1 < r0) return;
  var who = (e.user && e.user.getEmail && e.user.getEmail()) || '';
  var hit = function (T) { return Object.keys(T.col).filter(function (k) { return T.col[k] >= c0 && T.col[k] <= c1; }); };
  try {
    if (name === 'ช่องทางชำระเงิน' && c0 <= 2 && c1 >= 2) {
      syncLocked_(function () { payRowsToApp_(sh, r0, r1, who, true); });
    } else if (name === SHIP.name || name === BILL.name || name === BILLING.name) {
      var T = name === SHIP.name ? SHIP : name === BILL.name ? BILL : BILLING;
      var cols = hit(T);
      var stampHit = T.stamp >= c0 && T.stamp <= c1;            /* ล้างทั้งแถว (รวมคอลัมน์ระบบ) = เหมือนลบแถว */
      if (!cols.length && !stampHit) return;
      syncLocked_(function () {
        var n = cols.length ? tabRowsSync_(T, sh, r0, r1, who, cols, true) : 0;
        if (stampHit) rowDeletes_(masterSheet_(), false);
        else if (n) rowDeletes_(masterSheet_(), false, true);
      });
    }
  } catch (err) {
    console.error('onMasterEdit', err);
  }
}

/** ลบ/แทรกแถว (onEdit ไม่ปลุกตอนลบแถว) — เช็คว่าแถวที่ซิงก์ไว้หายไปหรือกลับมา */
function onMasterChange(e) {
  if (!e || !authReady_()) return;
  if (['REMOVE_ROW', 'INSERT_ROW', 'OTHER'].indexOf(e.changeType) < 0) return;
  try { syncLocked_(function () { rowDeletes_(masterSheet_(), false); }); }
  catch (err) { console.error('onMasterChange', err); }
}

/** ตรวจแล้วว่าตั้งใจลบแถวเยอะจริง — ยกเลิกในแอปให้ครบ (รันมือ) */
function confirmSheetDeletes() {
  syncLocked_(function () { console.log('ยกเลิก/กู้คืน ' + rowDeletes_(masterSheet_(), true) + ' รายการ'); });
}

function syncLocked_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ชีตรวมกำลังถูกเขียนอยู่ ลองใหม่อีกครั้ง');
  try { return fn(); } finally {
    try { flushLog_(); } catch (err) { console.error('จดประวัติซิงก์ไม่สำเร็จ', err); }
    lock.releaseLock();
  }
}

/* ================= ประวัติซิงก์ ================= */

/** จดหนึ่งช่องที่เปลี่ยน — เก็บไว้ในหน่วยความจำ เขียนลงแท็บทีเดียวตอนจบงาน (flushLog_) */
function logSync_(dir, tab, ref, col, oldV, newV, by) {
  LOG_BUF.push([Utilities.formatDate(new Date(), TZ, 'd/M/yyyy HH:mm:ss'), dir, tab, String(ref || ''), col || '', logText_(oldV), logText_(newV), by || '']);
}
function logText_(v) {
  var t = syncText_(v);
  return t === '' ? '(ว่าง)' : t;
}
function flushLog_() {
  if (!LOG_BUF.length) return;
  var rows = LOG_BUF;
  LOG_BUF = [];
  var sh = logSheet_(masterSheet_());
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, LOG_HEAD.length).setValues(rows);
}
function logSheet_(ss) {
  var sh = ss.getSheetByName(LOG_TAB);
  if (sh) return sh;
  sh = ss.insertSheet(LOG_TAB);
  sh.getRange(1, 1, 1, LOG_HEAD.length).setValues([LOG_HEAD]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('A:A').setNumberFormat('@');    /* เวลาไทยเป็นข้อความ — ไม่ขึ้นกับเขตเวลาของชีต */
  return sh;
}

function syncLog_(r) {
  return 'แอป → ชีต: เที่ยวส่งครบ ' + r.complete + ' · ยังไม่ครบ ' + r.open + ' · เขียน ' + r.wrote + ' ช่อง' +
    (r.waiting.length ? ' · ยังไม่มีในชีต (รอไฟล์ขาว): ' + r.waiting.slice(0, 10).join(', ') : '');
}

/* ================= แอป → ชีต ================= */

function appToSheet_(ss, jobIds) {
  var r = { complete: 0, open: 0, wrote: 0, waiting: [] };
  if (!jobIds.length) return r;
  var stops = fsIn_('shipments', 'jobId', jobIds, STOP_FIELDS);
  var byJob = {};
  stops.forEach(function (x) { (byJob[x.jobId] = byJob[x.jobId] || []).push(x); });

  r.deleted = appDeletes_(ss, byJob);

  var done = [];
  jobIds.forEach(function (id) {
    var live = (byJob[id] || []).filter(function (x) { return x.status !== 'cancelled'; });
    if (!live.length) return;
    if (live.every(function (x) { return x.status === 'delivered'; })) { r.complete++; done.push(id); }
    else r.open++;
  });
  if (!done.length) return r;

  var paySh = ss.getSheetByName('ช่องทางชำระเงิน');
  var jobs = fsIn_('jobs', '__name__', done, JOB_FIELDS);
  var drivers = driverNames_();
  var byShip = {}, byBill = [], names = {};
  jobs.forEach(function (j) {
    var list = byJob[j._id] || [];
    var ship = shipNoOf_(j, list);
    var dn = (j.driverIds || []).map(function (id) { return drivers[id] && drivers[id].name; }).filter(Boolean).join(', ');
    if (ship) {
      byShip[ship] = { want: shipValuesFromJob_(j, list, drivers), id: j._id };
      if (dn) names[ship] = dn;
    }
    list.forEach(function (x) { byBill.push({ stop: x, want: billValuesFromStop_(x) }); });
  });

  /* Bills ก่อน — ถ้าเลข Invoice เปลี่ยน แท็บช่องทางชำระเงินต้องเปลี่ยนตามก่อนเขียนช่อง B */
  var w0 = billsWrite_(ss.getSheetByName(BILL.name), byBill, paySh);
  billsDriverWrite_(ss.getSheetByName(BILL.name), names);

  var byInv = {};
  done.forEach(function (id) {
    (byJob[id] || []).forEach(function (x) {
      var inv = syncKey_(x.invoice && x.invoice.number), p = x.payment;
      if (x.status === 'cancelled' || !inv || !p || PAY_SYNC_METHODS.indexOf(p.method) < 0) return;
      if (!byInv[inv] || String(p.at) > String(byInv[inv].at)) byInv[inv] = p;
    });
  });
  var w1 = payWriteSheet_(paySh, byInv);
  var w2 = shipWriteSheet_(ss.getSheetByName(SHIP.name), byShip);

  r.wrote = w0.wrote + w1.wrote + w2.wrote;
  r.waiting = w1.waiting.concat(w2.waiting).concat(w0.waiting);
  SpreadsheetApp.flush();
  return r;
}

/* ================= แอดมินลบงานในแอป → ลบแถวในชีต (31 ต.ค.) =================
   ops.js tripCancelDialog ยกเลิกบิลพร้อมติด masterPurge (store.js cancelShipment force)
   ลบแถว Bills ของบิลนั้น · ยกเลิกครบทั้งเที่ยว → ลบแถว Shipments ด้วย
   ช่องทางชำระเงิน → ลบแถวของ Invoice ที่ไม่เหลือแถวใน Bills ใช้เลขนั้นแล้ว (เลขบิลซ้ำมีจริง)
   ลงทะเบียนว่า "gone" ก่อน — rowDeletes_ จะได้ไม่เข้าใจว่าคนลบแถวในชีต
   บิลที่ยกเลิกทางอื่น (ปุ่มยกเลิกรายจุด · ลบแถวในชีต) ไม่มี masterPurge — ไม่แตะ คงขึ้น "ยกเลิก" แบบเดิม */
function appDeletes_(ss, byJob) {
  var purge = {}, purgeJobs = [];
  Object.keys(byJob).forEach(function (jid) {
    var list = byJob[jid];
    var mine = list.filter(function (x) { return x.status === 'cancelled' && x.masterPurge; });
    if (!mine.length) return;
    mine.forEach(function (x) { purge[x._id] = x; });
    if (list.every(function (x) { return x.status === 'cancelled'; })) purgeJobs.push(jid);
  });
  if (!Object.keys(purge).length) return 0;

  var reg = regLoad_(ss), now = new Date().toISOString(), n = 0;
  var gone = function (tab, id, ref) {
    var e = reg.map[tab + '|' + id];
    if (!e) { regAdd_(reg, tab, id, ref, now); e = reg.map[tab + '|' + id]; }
    regSet_(reg, e, 'gone', '', now);
  };
  var by = 'แอดมินลบงานในแอป';

  /* Bills — แถวที่จดรหัสไว้: ลบเมื่อทุกรหัสในแถวถูกลบ · แถวที่ยังไม่เคยจด (มาจากไฟล์ ยังไม่ส่งครบ): จับด้วยเลข Delivery */
  var live = {};
  Object.keys(byJob).forEach(function (jid) {
    byJob[jid].forEach(function (x) { if (!purge[x._id] && x.status !== 'cancelled') live[syncKey_(x.delivery)] = 1; });
  });
  var byDel = {};
  Object.keys(purge).forEach(function (id) { var d = syncKey_(purge[id].delivery); if (d && !live[d]) byDel[d] = id; });
  var bSh = ss.getSheetByName(BILL.name), invs = {};
  var bLast = masterLastRow_(bSh), bDel = [];
  if (bLast >= 2 && bSh.getMaxColumns() >= BILL.stamp) {
    var rows = bSh.getRange(2, 1, bLast - 1, BILL.stamp).getValues();
    rows.forEach(function (r, i) {
      var ids = stampIds_(BILL, rowStamp_(r[BILL.stamp - 1]));
      var hit = ids.length ? ids.every(function (id) { return purge[id]; }) : !!byDel[syncKey_(r[7])];
      if (!hit) return;
      var ref = BILL.key(r);
      (ids.length ? ids : [byDel[syncKey_(r[7])]]).forEach(function (id) { gone(BILL.name, id, ref); });
      if (syncKey_(r[6])) invs[syncKey_(r[6])] = 1;
      logSync_(DIR.APP_DELETE, BILL.name, ref, '', 'Invoice ' + (r[6] || '—'), 'ลบแถว', by);
      bDel.push(i + 2);
    });
  }
  bDel.reverse().forEach(function (row) { bSh.deleteRow(row); n++; });

  /* Shipments — เฉพาะเที่ยวที่ยกเลิกครบทุกบิล */
  if (purgeJobs.length) {
    var ships = {};
    fsIn_('jobs', '__name__', purgeJobs, ['code']).forEach(function (j) {
      var k = shipNoOf_(j, byJob[j._id] || []);
      if (k) ships[k] = j._id;
    });
    var want = {};
    purgeJobs.forEach(function (id) { want[id] = 1; });
    var sSh = ss.getSheetByName(SHIP.name), sLast = masterLastRow_(sSh), sDel = [];
    if (sLast >= 2) {
      var sRows = sSh.getRange(2, 1, sLast - 1, Math.min(sSh.getMaxColumns(), SHIP.stamp)).getValues();
      sRows.forEach(function (r, i) {
        var st = r.length >= SHIP.stamp ? rowStamp_(r[SHIP.stamp - 1]) : {};
        var jid = st._job ? (want[st._job] ? st._job : '') : ships[syncKey_(r[0])];
        if (!jid) return;
        gone(SHIP.name, jid, syncKey_(r[0]));
        logSync_(DIR.APP_DELETE, SHIP.name, syncKey_(r[0]), '', '', 'ลบแถว (ยกเลิกทั้งเที่ยว)', by);
        sDel.push(i + 2);
      });
    }
    sDel.reverse().forEach(function (row) { sSh.deleteRow(row); n++; });
  }

  /* ช่องทางชำระเงิน — Invoice ที่ไม่เหลือแถวใน Bills แล้ว */
  if (Object.keys(invs).length) {
    var left = {}, bl = masterLastRow_(bSh);
    if (bl >= 2) bSh.getRange(2, 7, bl - 1, 1).getValues().forEach(function (r) { left[syncKey_(r[0])] = 1; });
    var pSh = ss.getSheetByName('ช่องทางชำระเงิน'), pl = masterLastRow_(pSh), pDel = [];
    if (pl >= 2) pSh.getRange(2, 1, pl - 1, 1).getValues().forEach(function (r, i) {
      var k = syncKey_(r[0]);
      if (!invs[k] || left[k]) return;
      logSync_(DIR.APP_DELETE, 'ช่องทางชำระเงิน', k, '', '', 'ลบแถว', by);
      pDel.push(i + 2);
    });
    pDel.reverse().forEach(function (row) { pSh.deleteRow(row); n++; });
  }
  regSave_(reg);
  return n;
}

/** Shipment No. ของเที่ยว — จากจุดส่งก่อน (งานด่วนได้เลขจริงตอนปิดงาน) ไม่มีค่อยใช้รหัสเที่ยว */
function shipNoOf_(j, stops) {
  for (var i = 0; i < stops.length; i++) {
    var s = syncKey_(stops[i].source && stops[i].source.shipmentNo);
    if (s) return s;
  }
  return /^RT-/i.test(String(j.code || '')) ? '' : syncKey_(j.code);
}

function driverNames_() {
  var m = {};
  fsList_('drivers').forEach(function (d) { if (d.id) m[d.id] = d; });
  return m;
}

/** ค่าที่แอปจะเขียนลงแถว Shipments — ช่องที่แอปยังไม่มีข้อมูลไม่ใส่ (ไม่ทับของจากไฟล์) */
function shipValuesFromJob_(j, stops, drivers) {
  var out = {};
  var names = (j.driverIds || []).map(function (id) { return drivers[id] && drivers[id].name; }).filter(Boolean);
  if (names.length) out.E = names.join(', ');
  var pay = j.pay || {};
  if (pay.updatedAt) {
    var c = payCats_(pay, j.driverIds || []);
    out.J = c.J || ''; out.K = c.K || ''; out.L = c.L || ''; out.M = c.M || '';
    out.V = c.other.map(function (x) { return detailLabel_(x.note) + '(' + numText_(x.amount) + ')'; }).join(', ');
  }
  /* ค่าขนส่งรายบิล: แก้มือ (stop.revenue) ไม่มีใช้ Amount — ตรงกับ stopRevenue ใน store.js */
  var rev = stops.filter(function (x) { return x.status !== 'cancelled'; }).reduce(function (a, x) {
    var manual = x.revenue !== undefined && x.revenue !== null && x.revenue !== '';
    return a + (Number(manual ? x.revenue : (x.invoice && x.invoice.amount)) || 0);
  }, 0);
  if (rev > 0) out.O = round2_(rev);
  else if (Number(j.revenue) > 0) out.O = round2_(j.revenue);
  var load = lastEvent_(j.events, 'loaded');
  if (load) out.Q = (load.photos || []).length;
  var live = stops.filter(function (x) { return x.status === 'delivered'; });
  if (live.length) {
    out.R = Math.min.apply(null, live.map(function (x) {
      var e = lastEvent_(x.events, 'delivered');
      return e ? (e.photos || []).length : 0;
    }));
  }
  return out;
}

/** ค่าที่แอปจะเขียนลงแถว Bills ของจุดส่งนี้ */
function billValuesFromStop_(x) {
  var out = {};
  var inv = x.invoice || {};
  if (inv.number) out.G = String(inv.number);
  if (x.customer && x.customer.name) out.I = x.customer.name;
  if (x.dropoff && x.dropoff.name) out.J = x.dropoff.name;
  if (x.cargo && Number(x.cargo.weightKg) > 0) out.L = round2_(x.cargo.weightKg);
  if (Number(inv.amount) > 0) out.M = round2_(inv.amount);
  if (x.status === 'cancelled') {
    out.O = 'ยกเลิก';
  } else if (x.status === 'delivered') {
    out.O = 'ส่งสำเร็จ';
    var e = lastEvent_(x.events, 'delivered');
    if (e && e.at) out.N = out.P = ymdBkk_(e.at);
  }
  out.Q = (x.invoiceReturn && x.invoiceReturn.date) || '';
  return out;
}

function lastEvent_(events, status) {
  var list = (events || []).filter(function (e) { return e && e.status === status; });
  return list[list.length - 1] || null;
}

/** แบ่งค่ารอบในแอปลงหมวด J/K/L/M (ตามโน้ต — ดูหัวส่วนนี้) — คืน {J,K,L,M, other:[{note,amount}]} */
function payCats_(pay, order) {
  var c = { J: 0, K: 0, L: 0, M: 0, other: [] };
  var add = function (cat, x) {
    var a = Number(x.amount) || 0;
    if (!(a > 0)) return;
    c[cat] = round2_(c[cat] + a);
    if (cat === 'M') c.other.push({ note: x.note || '', amount: a });
  };
  if (Number(pay.base) > 0) add('J', { amount: pay.base });
  (pay.items || []).forEach(function (x) { add(rowCat_(x, false), x); });
  var ids = (order || []).slice();
  Object.keys(pay.drivers || {}).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
  ids.forEach(function (id) {
    (pay.drivers && pay.drivers[id] || []).forEach(function (x, i) { add(rowCat_(x, i === 0), x); });
  });
  return c;
}

function rowCat_(x, first) {
  var n = String(x.note || '');
  if (/น้ำมัน/.test(n)) return 'K';
  if (/ทางด่วน/.test(n)) return 'L';
  if (/ค่ารอบ/.test(n)) return 'J';
  return first ? 'J' : 'M';
}

/** ชื่อรายการในช่อง V — ตัดจุลภาค/วงเล็บออก ไม่งั้นอ่านแยกไม่ออก */
function detailLabel_(s) {
  return String(s || '').replace(/[,()（）]/g, ' ').replace(/\s+/g, ' ').trim() || 'อื่น ๆ';
}
function numText_(n) { return String(round2_(n)); }
function round2_(n) { return Math.round(Number(n) * 100) / 100; }

/** เขียนช่อง B — ข้ามแถวที่จดไว้แล้วว่าเขียนรอบนี้ (note บรรทัดสุดท้าย #เวลา|ช่องทาง) */
function payWriteSheet_(sh, byInv) {
  var out = { wrote: 0, waiting: [] };
  if (!Object.keys(byInv).length) return out;
  var last = masterLastRow_(sh);
  var vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getValues();
  var notes = last < 2 ? [] : sh.getRange(2, 2, last - 1, 1).getNotes();
  var seen = {};
  for (var i = 0; i < vals.length; i++) {
    var inv = syncKey_(vals[i][0]), p = byInv[inv];
    if (!p) continue;
    seen[inv] = 1;
    if (payStamp_(notes[i][0]).at === String(p.at)) continue;
    var cell = sh.getRange(i + 2, 2), old = cell.getValue();
    if (syncText_(old) !== p.method) logSync_(DIR.TO_SHEET, 'ช่องทางชำระเงิน', inv, 'B ช่องทางชำระเงิน', old, p.method, p.byName || 'เว็บแอป');
    cell.setValue(p.method);
    cell.setNote(payNote_(p));
    out.wrote++;
  }
  out.waiting = Object.keys(byInv).filter(function (k) { return !seen[k]; });
  return out;
}

function payNote_(p) {
  return 'ซิงก์กับแอป: ' + p.method + (p.amount ? ' · ' + Number(p.amount).toLocaleString() + ' บาท' : '') +
    '\n' + Utilities.formatDate(new Date(p.at), TZ, 'd/M/yyyy HH:mm') +
    ' · ' + (p.byName || '—') + (p.round > 1 ? ' (รอบ ' + p.round + ')' : '') +
    '\n#' + p.at + '|' + p.method;
}
function payClearNote_(at, by) {
  return 'ซิงก์กับแอป: ล้างแล้ว (ยกเลิกในแอป)\n' + Utilities.formatDate(new Date(at), TZ, 'd/M/yyyy HH:mm') + ' · ' + by + '\n#' + at + '|';
}
function payStamp_(note) {
  var m = /#([^|\n]+)\|?([^\n]*)$/.exec(String(note || ''));
  return m ? { at: m[1], method: m[2] } : { at: '', method: '' };
}

/**
 * เขียนหนึ่งแถว — เฉพาะช่องที่ค่าของแอปเปลี่ยนจากที่จดไว้ แล้วจดใหม่ · คืนจำนวนช่องที่เขียน
 * @param {string|string[]} id รหัสในแอปของแถวนี้ (เที่ยว / จุดส่ง / ใบวางบิล) — จดไว้ใช้รู้ว่าแถวถูกลบ
 * @param {string} ref เลขอ้างอิงสำหรับประวัติ
 */
function rowWrite_(T, sh, row, want, stamp, id, ref) {
  var next = {}, n = 0;
  Object.keys(stamp).forEach(function (k) { next[k] = stamp[k]; });
  stampId_(T, next, id);
  Object.keys(want).forEach(function (k) {
    if (!T.col[k]) return;
    var t = syncText_(want[k]);
    next[k] = t;
    if (k in stamp && syncText_(stamp[k]) === t) return;
    var c = sh.getRange(row, T.col[k]), old = c.getValue();
    if (syncText_(old) !== t) logSync_(DIR.TO_SHEET, T.name, ref, T.label[k], old, t, 'เว็บแอป');
    c.setValue(T.dates.indexOf(k) >= 0 ? dateCell_(t) : want[k]).clearNote();
    n++;
  });
  if (n || JSON.stringify(next) !== JSON.stringify(stamp)) {
    next._t = new Date().toISOString();
    sh.getRange(row, T.stamp).setValue(JSON.stringify(next));
  }
  return n;
}

/** ใส่รหัสในแอปลงที่จด — จุดส่งหลายจุดใช้แถว Bills เดียวกันได้ จึงเก็บเป็นรายการ */
function stampId_(T, st, id) {
  if (!id) return;
  if (T === BILL) {
    var list = st._stops || [];
    [].concat(id).forEach(function (x) { if (list.indexOf(x) < 0) list.push(x); });
    st._stops = list;
  } else {
    st[T.idKey] = id;
  }
}
/** รหัสในแอปทั้งหมดที่แถวนี้ผูกไว้ */
function stampIds_(T, st) {
  var v = st[T.idKey];
  return v ? [].concat(v) : [];
}

/** แถว Shipments — จับคู่ด้วย Shipment No. */
function shipWriteSheet_(sh, byShip) {
  var out = { wrote: 0, waiting: [] };
  var keys = Object.keys(byShip);
  if (!keys.length) return out;
  syncEnsureCols_(sh, SHIP);
  var last = masterLastRow_(sh);
  var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, SHIP.stamp).getValues();
  var seen = {};
  for (var i = 0; i < rows.length; i++) {
    var ship = syncKey_(rows[i][0]), it = byShip[ship];
    if (!it) continue;
    seen[ship] = 1;
    out.wrote += rowWrite_(SHIP, sh, i + 2, it.want, rowStamp_(rows[i][SHIP.stamp - 1]), it.id, ship);
  }
  out.waiting = keys.filter(function (k) { return !seen[k]; });
  return out;
}

/** แถว Bills — จับคู่ด้วยเลข Delivery (ช่อง H) ไม่มีค่อยใช้ Invoice · เลข Invoice เปลี่ยน → แก้แท็บช่องทางชำระเงินด้วย */
function billsWrite_(sh, list, paySh) {
  var out = { wrote: 0, waiting: [] };
  if (!list.length) return out;
  syncEnsureCols_(sh, BILL);
  var last = masterLastRow_(sh);
  var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, BILL.stamp).getValues();
  var byDel = {}, byInv = {};
  rows.forEach(function (r, i) {
    var d = syncKey_(r[7]), g = syncKey_(r[6]);
    if (d) (byDel[d] = byDel[d] || []).push(i);
    if (g && !(g in byInv)) byInv[g] = i;
  });
  /* เลข Delivery เดียวกันมีหลายแถวได้ (ส่งใหม่คนละวัน — 2 พ.ย.) เลือกแถวของรอบนี้:
     แถวที่จดรหัสจุดนี้ไว้แล้ว → แถวที่วันที่ออกเดินทาง (B) ตรงกับวันส่งของจุด → แถวที่เลข 7 ตรง → แถวล่าสุด */
  var rowOf = function (x) {
    var c = byDel[syncKey_(x.delivery)];
    if (!c) return byInv[syncKey_(x.invoice && x.invoice.number)];
    if (c.length === 1) return c[0];
    var pick = function (f) { var h = c.filter(f); return h.length ? h[h.length - 1] : undefined; };
    var ship = syncKey_(x.source && x.source.shipmentNo);
    var i = pick(function (k) { return stampIds_(BILL, rowStamp_(rows[k][BILL.stamp - 1])).indexOf(x._id) >= 0; });
    if (i === undefined && x.serviceDate) i = pick(function (k) { return masterDay_(rows[k][1]) === String(x.serviceDate); });
    if (i === undefined && ship) i = pick(function (k) { return syncKey_(rows[k][0]) === ship; });
    return i === undefined ? c[c.length - 1] : i;
  };
  var renamed = {};
  list.forEach(function (it) {
    var x = it.stop;
    var i = rowOf(x);
    if (i === undefined) {
      if (x.status !== 'cancelled') out.waiting.push(syncKey_(x.delivery) || syncKey_(x.invoice && x.invoice.number));
      return;
    }
    var oldInv = syncKey_(rows[i][6]);
    if (it.want.G && oldInv && oldInv !== syncKey_(it.want.G)) renamed[oldInv] = it.want.G;
    var st = rowStamp_(rows[i][BILL.stamp - 1]);
    out.wrote += rowWrite_(BILL, sh, i + 2, it.want, st, x._id, BILL.key(rows[i]));
    rows[i][BILL.stamp - 1] = sh.getRange(i + 2, BILL.stamp).getValue();   /* จุดถัดไปที่ใช้แถวเดียวกันต้องเห็นรหัสที่เพิ่งจด */
  });
  if (Object.keys(renamed).length) {
    var pl = masterLastRow_(paySh);
    var a = pl < 2 ? [] : paySh.getRange(2, 1, pl - 1, 1).getValues();
    for (var k = 0; k < a.length; k++) {
      var nv = renamed[syncKey_(a[k][0])];
      if (!nv) continue;
      logSync_(DIR.TO_SHEET, 'ช่องทางชำระเงิน', a[k][0], 'A Invoice', a[k][0], nv, 'เว็บแอป');
      paySh.getRange(k + 2, 1).setValue(nv);
    }
  }
  return out;
}

function billsDriverWrite_(sh, names) {
  if (!Object.keys(names).length) return;
  var last = masterLastRow_(sh);
  if (last < 2) return;
  var vals = sh.getRange(2, 1, last - 1, 5).getValues();
  for (var i = 0; i < vals.length; i++) {
    var want = names[syncKey_(vals[i][0])];
    if (!want || String(vals[i][4]) === want) continue;
    logSync_(DIR.TO_SHEET, BILL.name, syncKey_(vals[i][7]) || syncKey_(vals[i][6]), 'E คนขับ', vals[i][4], want, 'เว็บแอป');
    sh.getRange(i + 2, 5).setValue(want);
  }
}

/** แท็บ Billing — ใบวางบิลในแอปเป็นแถว "ฝั่งเรา" (จับคู่ด้วยเลขที่ใบ) · คืนจำนวนช่องที่เขียน */
function billingWrite_(ss, bills) {
  var sh = ss.getSheetByName(BILLING.name);
  bills = (bills || []).filter(function (b) { return b && b.docNo; });
  if (!sh || !bills.length) return 0;
  syncEnsureCols_(sh, BILLING);
  var last = masterLastRow_(sh);
  var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, BILLING.stamp).getValues();
  var at = {};
  rows.forEach(function (r, i) { if (syncKey_(r[0])) at[syncKey_(r[0])] = i + 2; });
  var n = 0;
  bills.forEach(function (b) {
    var want = billingValues_(b);
    var row = at[syncKey_(b.docNo)];
    if (!row && b.status === 'cancelled') return;               /* ใบยกเลิกที่ไม่มีแถว (เช่น ลบแถวในชีตแล้ว) — ไม่ต้องเพิ่มกลับ */
    if (!row) {
      masterAppend_(sh, [[want.A, want.B, want.C, want.D, dateCell_(want.E), dateCell_(want.F), dateCell_(want.G),
                          want.H, want.I, dateCell_(want.J), BILLING_STATUS]], 11);
      row = masterLastRow_(sh);
      at[syncKey_(b.docNo)] = row;
      var st = { _bill: b._id || b.id, _t: new Date().toISOString() };
      Object.keys(want).forEach(function (k) { st[k] = syncText_(want[k]); });
      sh.getRange(row, BILLING.stamp).setValue(JSON.stringify(st));
      logSync_(DIR.TO_SHEET, BILLING.name, b.docNo, 'เพิ่มแถว', '', want.C + ' · ' + want.H + ' บาท', 'เว็บแอป');
      n += Object.keys(want).length;
    } else {
      n += rowWrite_(BILLING, sh, row, want, rowStamp_(rows[row - 2] ? rows[row - 2][BILLING.stamp - 1] : ''), b._id || b.id, b.docNo);
    }
    /* สถานะ: ยกเลิก = ใส่คำตรง ๆ (Report ไม่นับ) · ไม่ยกเลิก = สูตรเดิมของ template */
    var k = sh.getRange(row, 11);
    if (b.status === 'cancelled') {
      if (k.getValue() !== 'ยกเลิก') { logSync_(DIR.TO_SHEET, BILLING.name, b.docNo, 'K สถานะ', k.getValue(), 'ยกเลิก', 'เว็บแอป'); k.setValue('ยกเลิก'); }
    }
    else if (!k.getFormula()) k.setFormula(BILLING_STATUS.replace(/\{r\}/g, row));
  });
  return n;
}

/** ค่าของแถว Billing จากใบวางบิลในแอป */
function billingValues_(b) {
  var items = b.items || [];
  var dates = items.map(function (it) { return String(it.date || '').slice(0, 10); }).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); }).sort();
  var paid = b.status === 'paid' && b.paid ? b.paid : null;
  return {
    A: b.docNo, B: 'ฝั่งเรา',
    C: (b.billTo && b.billTo.name) || '',
    D: billingLabel_(dates, items.length, items.some(function (it) { return it.stopId; }) ? 'บิล' : 'เที่ยว'),
    E: dates.length ? dates[dates.length - 1] : '',
    F: String(b.issueDate || '').slice(0, 10), G: String(b.dueDate || '').slice(0, 10),
    H: round2_(b.total || 0),
    I: paid ? (paid.method || '') : '', J: paid ? String(paid.date || '').slice(0, 10) : ''
  };
}

/** "ค่าขนส่ง 10/2569 ช่วง 1–15" · ข้ามเดือน "ค่าขนส่ง 28/9–5/10/2569" · ต่อท้ายจำนวนรายการ (ใบรายบิล = บิล · ใบเก่า = เที่ยว) */
function billingLabel_(dates, trips, unit) {
  var tail = trips ? ' (' + trips + ' ' + (unit || 'เที่ยว') + ')' : '';
  if (!dates.length) return 'ค่าขนส่ง' + tail;
  var a = dates[0].split('-').map(Number), z = dates[dates.length - 1].split('-').map(Number);
  if (a[0] === z[0] && a[1] === z[1]) return 'ค่าขนส่ง ' + a[1] + '/' + (a[0] + 543) + ' ช่วง ' + a[2] + '–' + z[2] + tail;
  return 'ค่าขนส่ง ' + a[2] + '/' + a[1] + (a[0] !== z[0] ? '/' + (a[0] + 543) : '') + '–' + z[2] + '/' + z[1] + '/' + (z[0] + 543) + tail;
}

/** แท็บ Drivers — เพิ่มคนขับที่มีในแอปแต่ยังไม่มีในแท็บ (ไม่ลบ ไม่แก้ชื่อเดิม) */
function driversTabWrite_(sh, drivers) {
  if (!sh) return 0;
  var last = masterLastRow_(sh);
  var have = {};
  if (last > 1) sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) { have[lowerNorm_(r[0])] = 1; });
  var add = [];
  Object.keys(drivers).forEach(function (id) {
    var d = drivers[id];
    if (!d.name || d.active === false || d.removed || have[lowerNorm_(d.name)]) return;
    have[lowerNorm_(d.name)] = 1;
    add.push([d.name, d.external ? 'คนขับภายนอก' : '', d.plate || '']);
    logSync_(DIR.TO_SHEET, 'Drivers', d.name, 'เพิ่มแถว', '', d.name + (d.plate ? ' · ' + d.plate : ''), 'เว็บแอป');
  });
  masterAppend_(sh, add, 3);
  return add.length;
}

function rowStamp_(v) {
  if (!v) return {};
  try { var o = JSON.parse(v); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
}
/** เทียบค่าในช่อง — ตัวเลขกับข้อความตัวเลขถือว่าเท่ากัน
 *  (ห้ามตั้งชื่อ cellText_ — LineOA.gs ใช้ชื่อนั้นอ่านไฟล์ Excel ชื่อซ้ำจะทับกันเงียบ ๆ) · วันที่เป็น yyyy-MM-dd · ช่องว่าง = '' */
function syncText_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : ymdLocal_(v);
  if (typeof v === 'number') return String(round2_(v));
  var s = String(v).trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? String(round2_(Number(s))) : s;
}
function ymdBkk_(iso) { return Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM-dd'); }
function dateCell_(ymd) {
  if (!ymd) return '';
  var a = String(ymd).split('-').map(Number);
  return new Date(a[0], a[1] - 1, a[2]);
}

/* ================= ชีต → แอป ================= */

/** เก็บตก: ช่องที่ค่าไม่ตรงกับที่ซิงก์ไว้ = มีคนแก้ (แถวที่ยังไม่เคยซิงก์ข้าม — ไม่รู้ว่าใครแก้) */
function sheetScanToApp_(ss) {
  var n = 0;
  var pay = ss.getSheetByName('ช่องทางชำระเงิน');
  var last = masterLastRow_(pay);
  if (last >= 2) n += payRowsToApp_(pay, 2, last, '', false);
  [SHIP, BILL, BILLING].forEach(function (T) {
    var sh = ss.getSheetByName(T.name);
    if (!sh) return;
    var l = masterLastRow_(sh);
    if (l < 2 || sh.getMaxColumns() < T.stamp) return;
    var rows = sh.getRange(2, 1, l - 1, T.stamp).getValues();
    for (var i = 0; i < rows.length; i++) {
      var stamp = rowStamp_(rows[i][T.stamp - 1]);
      var cols = Object.keys(T.col).filter(function (k) {
        return k in stamp && syncText_(rows[i][T.col[k] - 1]) !== syncText_(stamp[k]);
      });
      if (cols.length) n += tabRowsSync_(T, sh, i + 2, i + 2, '', cols, false);
    }
  });
  return n;
}

/**
 * แถว r0..r1 ของ Shipments/Bills ที่ช่อง cols ถูกแก้ในชีต
 *   ช่อง toApp → แก้ในแอป (ช่องว่าง = ล้างในแอป · ค่าใช้ไม่ได้ = ไม่ทำอะไร + note)
 *   ช่อง locked → เคยซิงก์แล้วคืนค่าจากแอป · ยังไม่เคย ขึ้น note (เฉพาะตอนคนแก้จริง)
 */
function tabRowsSync_(T, sh, r0, r1, who, cols, edited) {
  if (sh.getMaxColumns() < T.stamp) syncEnsureCols_(sh, T);
  var rows = sh.getRange(r0, 1, r1 - r0 + 1, T.stamp).getValues();
  var toApp = cols.filter(function (k) { return T.toApp.indexOf(k) >= 0; });
  var locked = cols.filter(function (k) { return T.locked.indexOf(k) >= 0; });
  var n = 0, ctx = { drivers: null };
  for (var i = 0; i < rows.length; i++) {
    var row = r0 + i, key = T.key(rows[i]);
    if (!key) continue;
    var stamp = rowStamp_(rows[i][T.stamp - 1]);
    var val = function (k) { return rows[i][T.col[k] - 1]; };

    locked.forEach(function (k) {
      var c = sh.getRange(row, T.col[k]);
      var why = T.why[k] ? ' (' + T.why[k] + ')' : '';
      if (k in stamp) {
        if (syncText_(val(k)) !== syncText_(stamp[k])) {
          logSync_(DIR.REVERT, T.name, key, T.label[k], val(k), stamp[k], who || 'ชีต Master');
          c.setValue(T.dates.indexOf(k) >= 0 ? dateCell_(stamp[k]) : stamp[k]);
        }
        c.setNote(NOTE_LOCKED + why);
      } else if (edited) {
        c.setNote(NOTE_LOCKED_NEW + why);
      }
    });

    /* ช่องว่างนับเป็น "ล้าง" เมื่อคนแก้จริง หรือเคยซิงก์ค่าไว้ (เก็บตก) — ช่องที่ว่างมาแต่แรกไม่แตะ */
    var use = toApp.filter(function (k) {
      return syncText_(val(k)) !== '' || edited || syncText_(stamp[k]) !== '';
    });
    if (!use.length) continue;
    var done = T === SHIP ? shipRowToApp_(sh, row, key, use, val, who, ctx) : billRowToApp_(sh, row, rows[i], use, val, who, key);
    if (!done || !done.ok.length) continue;
    use.forEach(function (k) { if (done.ok.indexOf(k) >= 0) stamp[k] = syncText_(val(k)); });
    stampId_(T, stamp, done.ids);
    stamp._t = new Date().toISOString();
    sh.getRange(row, T.stamp).setValue(JSON.stringify(stamp));
    n++;
  }
  return n;
}

/** Shipments: E คนขับ · O รายได้ค่าขนส่ง → เที่ยวในแอป · คืน {ok: ช่องที่ซิงก์ได้, ids} (null = ไม่เจอเที่ยว)
 *  E ว่าง = ยกเลิกการจ่ายงาน · O ว่าง = รายได้ 0 */
function shipRowToApp_(sh, row, ship, use, val, who, ctx) {
  var jobId = jobIdOfShip_(ship);
  if (!jobId) return null;                                      /* เที่ยวนี้ไม่มีในแอป */
  var j = fsGet_('jobs', jobId);
  if (!j) return null;
  var at = new Date().toISOString(), by = who || 'ชีต Master';
  var patch = {}, events = (j.events || []).slice(), ok = [];

  if (use.indexOf('E') >= 0) {
    ctx.drivers = ctx.drivers || fsList_('drivers');
    var drivers = ctx.drivers;
    var got = matchDrivers_(String(val('E')), drivers);
    var eCell = sh.getRange(row, SHIP.col.E);
    if (got.missing.length) {                                   /* ไม่จด — รอบหน้าลองใหม่ เผื่อเพิ่มคนขับในแอปแล้ว */
      eCell.setNote('ไม่ได้ซิงก์เข้าแอป: ไม่พบคนขับ ' + got.missing.join(', ') + ' ในแอป (หรือถูกปิดใช้งาน)');
    } else {
      eCell.clearNote();
      ok.push('E');
      if (got.ids.join() !== (j.driverIds || []).join()) {
        var byId = {};
        drivers.forEach(function (d) { byId[d.id] = d; });
        var name = function (id) { return byId[id] ? byId[id].name : ''; };
        var from = (j.driverIds || []).map(name).filter(Boolean).join(' · ') || 'ยังไม่จ่ายงาน';
        var to = got.ids.map(name).join(' · ') || 'ยังไม่จ่ายงาน';
        patch.driverIds = got.ids;
        patch.driverId = got.ids[0] || null;
        events.push(editEvent_('คนขับ: ' + from + ' → ' + to + ' (แก้จากชีต Master)', by, at));
        logSync_(DIR.TO_APP, SHIP.name, ship, SHIP.label.E, from, to, by);
        var d0 = byId[got.ids[0]];
        var pub = d0 ? { name: d0.name || '', truck: d0.truck || '', plate: d0.plate || '', phone: d0.phone || '' } : null;
        fsQuery_('shipments', fsEq_('jobId', jobId), ['status']).forEach(function (s) {
          fsPatch_('shipments', s._id, { driverIds: got.ids, driverId: got.ids[0] || null, updatedAt: at });
          fsPatchQuiet_('trackData', s._id, { driver: pub, updatedAt: at });
        });
      }
    }
  }

  if (use.indexOf('O') >= 0) {
    var rev = syncText_(val('O')) === '' ? 0 : numOf_(val('O'));
    var oCell = sh.getRange(row, SHIP.col.O);
    if (rev === null) {
      oCell.setNote('ไม่ได้ซิงก์เข้าแอป: รายได้ต้องเป็นตัวเลข');
    } else {
      oCell.clearNote();
      ok.push('O');
      if (rev !== round2_(j.revenue || 0)) {
        patch.revenue = rev;
        logSync_(DIR.TO_APP, SHIP.name, ship, SHIP.label.O, Number(j.revenue || 0), rev, by);
        var ev = editEvent_('ค่าขนส่ง: ' + Number(j.revenue || 0).toLocaleString() + ' → ' + rev.toLocaleString() + ' บาท (แก้จากชีต Master)', by, at);
        ev.scope = 'ops';
        events.push(ev);
      }
    }
  }

  if (Object.keys(patch).length) {
    patch.events = events;
    patch.updatedAt = at;
    fsPatch_('jobs', jobId, patch);
  }
  return { ok: ok, ids: jobId };
}

/** Bills: I ลูกค้า · J ปลายทาง · L น้ำหนัก · M Amount · Q วันที่คืน Inv. → จุดส่งในแอป · คืน {ok, ids}
 *  ว่าง = ล้าง: ชื่อ → ว่าง · น้ำหนัก/Amount → 0 · วันที่คืน → ยกเลิกการคืน */
function billRowToApp_(sh, row, raw, use, val, who, ref) {
  var ok = [], bad = {};
  var want = {};
  use.forEach(function (k) {
    var v = val(k);
    if (k === 'I' || k === 'J') { want[k] = String(v).trim(); return; }
    if (k === 'L' || k === 'M') {
      var n = syncText_(v) === '' ? 0 : numOf_(v);
      if (n === null) bad[k] = 'ต้องเป็นตัวเลข'; else want[k] = n;
      return;
    }
    if (k === 'Q') {
      var d = syncText_(v);
      if (d === '') want.Q = '';
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) bad.Q = 'ต้องเป็นวันที่';
      else if (d > Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd')) bad.Q = 'วันที่คืนต้องไม่เกินวันนี้';
      else want.Q = d;
    }
  });
  Object.keys(bad).forEach(function (k) { sh.getRange(row, BILL.col[k]).setNote('ไม่ได้ซิงก์เข้าแอป: ' + bad[k]); });
  if (!Object.keys(want).length) return { ok: [], ids: [] };

  var del = syncKey_(raw[7]), inv = syncKey_(raw[6]);
  var hits = del ? fsIn_('shipments', 'delivery', [del], ['status', 'serviceDate', 'source.shipmentNo']) : [];
  if (!hits.length && inv) hits = fsIn_('shipments', 'invoice.number', [inv], ['status']);
  if (!hits.length) return null;                                /* ไม่มีในแอป */
  /* เลข Delivery เดียวกันหลายรอบ (ส่งใหม่ — 2 พ.ย.) — แก้เฉพาะจุดของแถวนี้:
     รหัสที่จดไว้ในแถว → วันส่งตรงช่อง B → เลข 7 ตรงช่อง A · ไม่เจอเลยไม่แตะ (กันแก้ผิดรอบ) */
  if (del && hits.length > 1) {
    var mineIds = stampIds_(BILL, rowStamp_(raw[BILL.stamp - 1]));
    var day = masterDay_(raw[1]), ship = syncKey_(raw[0]);
    var days = {};
    hits.forEach(function (h) { days[String(h.serviceDate || '')] = 1; });
    if (Object.keys(days).length > 1) {
      var narrow = function (f) { var h = hits.filter(f); return h.length ? h : null; };
      hits = narrow(function (h) { return mineIds.indexOf(h._id) >= 0; })
          || (day && narrow(function (h) { return String(h.serviceDate || '') === day; }))
          || (ship && narrow(function (h) { return syncKey_(h.source && h.source.shipmentNo) === ship; }))
          || [];
      if (!hits.length) return null;
    }
  }

  var at = new Date().toISOString(), by = who || 'ชีต Master';
  var field = function (x, patch, log, k, path, label, unit) {
    var obj = x[path] || {}, sub = path === 'cargo' ? 'weightKg' : path === 'invoice' ? 'amount' : 'name';
    var cur = unit !== undefined ? round2_(obj[sub] || 0) : (obj[sub] || '');
    if (!(k in want) || want[k] === cur) return;
    var o = {}; o[sub] = want[k];
    patch[path] = merge_(patch[path] || obj, o);
    log.push(label + ': ' + (cur === '' ? '—' : cur) + ' → ' + (want[k] === '' ? '(ว่าง)' : want[k]) + (unit || ''));
    logSync_(DIR.TO_APP, BILL.name, ref, BILL.label[k], cur, want[k], by);
  };
  hits.forEach(function (h) {
    var x = fsGet_('shipments', h._id);
    if (!x) return;
    var patch = {}, log = [];
    field(x, patch, log, 'I', 'customer', 'ลูกค้า');
    field(x, patch, log, 'J', 'dropoff', 'ปลายทาง');
    field(x, patch, log, 'L', 'cargo', 'น้ำหนัก', ' กก.');
    field(x, patch, log, 'M', 'invoice', 'มูลค่าสินค้า', ' บาท');
    if ('Q' in want) {
      var cur = (x.invoiceReturn && x.invoiceReturn.date) || '';
      var prev = x.invoiceReturns || [];
      if (want.Q && x.status !== 'delivered') {
        sh.getRange(row, BILL.col.Q).setNote('ไม่ได้ซิงก์เข้าแอป: จุดส่งนี้ยังไม่ได้ส่งของ');
      } else if (cur !== want.Q) {
        var r = { id: 'ir_' + Utilities.getUuid().slice(0, 7), round: prev.length + 1, action: want.Q ? 'return' : 'cancel',
                  date: want.Q, receivedBy: '', note: want.Q ? 'แก้จากชีต Master' : 'ล้างวันที่คืนในชีต Master',
                  photos: [], at: at, byRole: 'sheet', byName: by };
        patch.invoiceReturns = prev.concat([r]);
        patch.invoiceReturn = want.Q ? { at: want.Q, date: want.Q, receivedBy: '', round: r.round, byName: by } : null;
        logSync_(DIR.TO_APP, BILL.name, ref, BILL.label.Q, cur, want.Q || 'ยกเลิกการคืน', by);
      }
    }
    if (!Object.keys(patch).length) return;
    if (log.length) patch.events = (x.events || []).concat([editEvent_('แก้จากชีต Master: ' + log.join(' · '), by, at)]);
    patch.updatedAt = at;
    fsPatch_('shipments', h._id, patch);
    var pub = {};                                               /* สำเนาหน้าติดตาม — ไม่มีข้อมูลคืน Inv. */
    ['customer', 'dropoff', 'cargo', 'invoice'].forEach(function (k) { if (patch[k]) pub[k] = patch[k]; });
    if (Object.keys(pub).length) { pub.updatedAt = at; fsPatchQuiet_('trackData', h._id, pub); }
  });
  Object.keys(want).forEach(function (k) { ok.push(k); });
  return { ok: ok, ids: hits.map(function (h) { return h._id; }) };
}

function merge_(a, b) {
  var o = {};
  Object.keys(a || {}).forEach(function (k) { o[k] = a[k]; });
  Object.keys(b).forEach(function (k) { o[k] = b[k]; });
  return o;
}
function numOf_(v) {
  if (typeof v === 'number') return round2_(v);
  var s = String(v === null || v === undefined ? '' : v).replace(/[, ]/g, '');
  return /^\d+(\.\d+)?$/.test(s) ? round2_(Number(s)) : null;
}

/**
 * แถว r0..r1 ของแท็บช่องทางชำระเงิน → บันทึกรอบใหม่ในจุดส่งที่ Invoice ตรงกัน
 * @param {boolean} edited มาจากคนแก้ช่องจริง (onEdit) — ไม่ต้องเทียบกับที่จดไว้
 */
function payRowsToApp_(sh, r0, r1, who, edited) {
  var vals = sh.getRange(r0, 1, r1 - r0 + 1, 2).getValues();
  var notes = sh.getRange(r0, 2, r1 - r0 + 1, 1).getNotes();
  var want = {};
  for (var i = 0; i < vals.length; i++) {
    var inv = syncKey_(vals[i][0]), m = String(vals[i][1] || '').trim();
    if (!inv || (m && PAY_SYNC_METHODS.indexOf(m) < 0)) continue;   /* ค่าแปลก = ไม่ทำอะไร */
    var st = payStamp_(notes[i][0]);
    if (!edited && (!st.at || st.method === m)) continue;       /* เก็บตก: เฉพาะแถวที่เคยซิงก์แล้วค่าเปลี่ยน */
    want[inv] = { method: m, row: r0 + i };                      /* m ว่าง = ล้าง → ยกเลิกในแอป */
  }
  var invs = Object.keys(want);
  if (!invs.length) return 0;

  var n = 0, at = new Date().toISOString();
  fsIn_('shipments', 'invoice.number', invs, null).forEach(function (x) {
    var w = want[syncKey_(x.invoice && x.invoice.number)];
    if (!w || x.status === 'cancelled') return;
    var cur = x.payment, by = who || 'ชีต Master';
    if ((cur ? cur.method : '') === w.method) {                 /* ตรงอยู่แล้ว — จดให้ตรงกันพอ */
      sh.getRange(w.row, 2).setNote(cur ? payNote_(cur) : payClearNote_(at, by));
      return;
    }
    var prev = x.payments || [];
    var row = {
      id: 'pay_' + Utilities.getUuid().slice(0, 7), round: prev.length + 1, method: w.method,
      amount: w.method ? ((cur && cur.amount) || (x.invoice && Number(x.invoice.amount)) || 0) : 0, photos: [],
      note: w.method ? 'แก้จากชีต Master' : 'ยกเลิก — ล้างช่องในชีต Master', at: at, byRole: 'sheet', byName: by
    };
    if (!w.method) row.action = 'cancel';
    var latest = w.method ? { method: row.method, amount: row.amount, at: at, round: row.round, byName: row.byName } : null;
    fsPatch_('shipments', x._id, { payments: prev.concat([row]), payment: latest, updatedAt: at });
    sh.getRange(w.row, 2).setNote(latest ? payNote_(latest) : payClearNote_(at, by));
    logSync_(DIR.TO_APP, 'ช่องทางชำระเงิน', syncKey_(x.invoice && x.invoice.number), 'B ช่องทางชำระเงิน',
             cur ? cur.method : '', w.method || 'ยกเลิก', by);
    n++;
  });
  return n;
}

/** ชื่อในช่อง E → รหัสคนขับ (ต้องเจอครบทุกชื่อ และยังใช้งานอยู่) */
function matchDrivers_(text, drivers) {
  var ids = [], missing = [];
  text.split(/\s*[,،\/·]\s*|\s+และ\s+/).forEach(function (nm) {
    nm = nm.trim();
    if (!nm) return;
    var d = drivers.filter(function (x) { return x.active !== false && lowerNorm_(x.name) === lowerNorm_(nm); })[0];
    if (d) { if (ids.indexOf(d.id) < 0) ids.push(d.id); } else missing.push(nm);
  });
  return { ids: ids, missing: missing };
}

function editEvent_(note, byName, at) {
  return { id: 'ev_' + Utilities.getUuid().slice(0, 7), status: 'edited', at: at, byRole: 'sheet', byName: byName,
           note: note, photos: [], geo: null, signature: null, label: 'แก้ไขข้อมูลใบงาน' };
}

/** เที่ยวในแอปของ Shipment No. นี้ — ดูจากจุดส่ง (งานด่วนที่ปิดแล้วก็เจอ) ไม่เจอค่อยดูรหัสเที่ยว */
function jobIdOfShip_(ship) {
  var s = fsIn_('shipments', 'source.shipmentNo', [ship], ['jobId']).filter(function (x) { return x.jobId; })[0];
  if (s) return s.jobId;
  var j = fsIn_('jobs', 'code', [ship], ['code'])[0];
  return j ? j._id : '';
}

/** เลข Invoice / Shipment No. / Delivery เทียบกันได้ — ตัดช่องว่าง และ .0 ที่ติดมาจากตัวเลขในชีต */
function syncKey_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, '').replace(/\.0+$/, '');
}

/* ================= ข้อมูลชีตรวมให้หน้า Dashboard =================
   doGet ?action=master (พนักงานเท่านั้น — ตรวจที่ doGet) → แถวดิบของแท็บที่ Dashboard ใช้
   วันที่ส่งเป็น yyyy-MM-dd · ตัวเลขเป็นตัวเลข · แถวที่ช่อง A ว่างตัดทิ้ง
   หน้า dashboard.html แปลงเป็นโครงเดียวกับข้อมูลในแอปแล้ววาดด้วยโค้ดเดิม */
var MASTER_JSON_TABS = { shipments: ['Shipments', 22], bills: ['Bills', 21], pay: ['ช่องทางชำระเงิน', 7],
                         billing: ['Billing', 11], drivers: ['Drivers', 3] };

function masterJson_() {
  try {
    var ss = masterSheet_(), out = { ok: true, at: new Date().toISOString() };
    Object.keys(MASTER_JSON_TABS).forEach(function (k) {
      var sh = ss.getSheetByName(MASTER_JSON_TABS[k][0]);
      var last = sh ? masterLastRow_(sh) : 1;
      var rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, MASTER_JSON_TABS[k][1]).getValues();
      out[k] = rows.filter(function (r) { return String(r[0]).trim() !== ''; }).map(function (r) {
        return r.map(function (v) {
          return Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v) ? '' : ymdLocal_(v)) : v;
        });
      });
    });
    return json_(out);
  } catch (err) {
    console.error('masterJson_', err);
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/* ================= Excel ทั้งไฟล์ตามช่วงวันที่ (2 พ.ย.) =================
   doGet ?action=masterExport&from=yyyy-MM-dd&to=yyyy-MM-dd (พนักงานเท่านั้น — ตรวจที่ doGet)
   ลูกค้าขอให้ปุ่ม Excel ในรายงานสรุปได้แท็บเหมือนชีต Master ทุกแท็บ — จึงทำสำเนาทั้งไฟล์ (ชีตจริงไม่ถูกแตะ)
     1) ตั้งช่วงวันที่ในแท็บ Report (ผู้ขนส่ง = ทั้งหมด) → Report / Report-รายรอบ / Report-รายบิล คำนวณตามช่วงเอง
     2) แท็บที่มีคอลัมน์วันที่ → ลบแถวนอกช่วง (เฉพาะคอลัมน์ข้อมูลที่หัวตารางติดกันจาก A — ตารางสรุปข้าง ๆ ไม่โดน)
     3) ลบแท็บระบบ (ประวัติซิงก์ · _ซิงก์) → ส่งออก .xlsx (base64) แล้วทิ้งสำเนา */
var EXPORT_DATE_HEADS = ['วันที่ออกเดินทาง', 'ประจำวันที่', 'งวดงานถึงวันที่'];
var EXPORT_SPAN_HEADS = ['ข้อมูลตั้งแต่', 'ข้อมูลถึง'];     /* ไฟล์ที่นำเข้า — เก็บไฟล์ที่ช่วงข้อมูลทับช่วงที่เลือก */

function masterExport_(from, to) {
  var okDay = /^\d{4}-\d{2}-\d{2}$/;
  if (!okDay.test(from || '') || !okDay.test(to || '') || from > to) return json_({ ok: false, error: 'ช่วงวันที่ไม่ถูกต้อง' });
  var src = masterSheet_(), copy = null;
  try {
    copy = DriveApp.getFileById(src.getId()).makeCopy('ส่งออกชั่วคราว ' + src.getName() + ' ' + from + '_' + to);
    var ss = SpreadsheetApp.openById(copy.getId());
    [LOG_TAB, REG_TAB].forEach(function (n) { var sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh); });

    /* อ่านวันที่ของทุกแท็บก่อนลบอะไร — บางแท็บ (ช่องทางชำระเงิน) ดึงวันที่ด้วยสูตรจาก Bills */
    var day = function (v) {
      if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v) ? '' : ymdLocal_(v);
      var m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      return m ? m[0] : '';
    };
    var plans = [];
    ss.getSheets().forEach(function (sh) {
      var lastCol = sh.getLastColumn(), last = masterLastRow_(sh);
      if (lastCol < 1 || last < 2) return;
      var head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
      var width = head.indexOf('');
      if (width < 0) width = lastCol;
      var dc = -1, sc = [-1, -1];
      for (var c = 0; c < width; c++) {
        if (dc < 0 && EXPORT_DATE_HEADS.indexOf(head[c]) >= 0) dc = c;
        var k = EXPORT_SPAN_HEADS.indexOf(head[c]);
        if (k >= 0) sc[k] = c;
      }
      var span = sc[0] >= 0 && sc[1] >= 0;
      if (dc < 0 && !span) return;                              /* Report · Drivers · วิธีใช้ → ทั้งแท็บ */
      var rows = sh.getRange(2, 1, last - 1, width).getValues();
      var drop = rows.map(function (r) {
        if (span) { var a = day(r[sc[0]]), b = day(r[sc[1]]) || a; return !a || a > to || b < from; }
        var d = day(r[dc]);
        return !d || d < from || d > to;
      });
      plans.push({ sh: sh, width: width, drop: drop });
    });

    /* ลบเป็นช่วงต่อเนื่องจากล่างขึ้นบน — แถวเรียงตามวันที่อยู่แล้วส่วนใหญ่ จึงลบไม่กี่ครั้ง */
    plans.forEach(function (p) {
      for (var i = p.drop.length - 1; i >= 0; i--) {
        if (!p.drop[i]) continue;
        var j = i;
        while (j > 0 && p.drop[j - 1]) j--;
        p.sh.getRange(j + 2, 1, i - j + 1, p.width).deleteCells(SpreadsheetApp.Dimension.ROWS);
        i = j;
      }
    });

    /* ช่วงวันที่ของแท็บ Report — หาจากป้ายในคอลัมน์ B (template: B4 วันเริ่มต้น · B5 วันสุดท้าย · B6 ผู้ขนส่ง) */
    var rep = ss.getSheetByName('Report');
    if (rep) {
      var lab = rep.getRange(1, 2, Math.min(rep.getLastRow() || 1, 20), 1).getValues();
      var ymd = function (s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); };
      lab.forEach(function (r, i) {
        var t = String(r[0]).trim(), cell = rep.getRange(i + 1, 3);
        if (t === 'วันเริ่มต้น') cell.setValue(ymd(from));
        else if (t === 'วันสุดท้าย') cell.setValue(ymd(to));
        else if (t === 'ผู้ขนส่ง') cell.setValue('ทั้งหมด');
      });
    }
    SpreadsheetApp.flush();

    var res = UrlFetchApp.fetch('https://docs.google.com/spreadsheets/d/' + copy.getId() + '/export?format=xlsx', {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error('ส่งออก Excel ไม่สำเร็จ (HTTP ' + res.getResponseCode() + ')');
    return json_({ ok: true, name: src.getName() + ' ' + from + (from === to ? '' : ' ถึง ' + to),
                   xlsx: Utilities.base64Encode(res.getBlob().getBytes()) });
  } catch (err) {
    console.error('masterExport_', err);
    return json_({ ok: false, error: String(err.message || err) });
  } finally {
    if (copy) try { copy.setTrashed(true); } catch (e) { console.error('masterExport_ ทิ้งสำเนาไม่ได้', e); }
  }
}

/* ================= ลบแถวในชีต → ยกเลิกในแอป ================= */

/**
 * เทียบรหัสในคอลัมน์ระบบของทุกแถวกับทะเบียน
 *   รหัสที่เคยมีแต่หายไป (ลบแถว / ล้างทั้งแถว) → ยกเลิกในแอป จดสถานะเดิมไว้
 *   รหัสที่ยกเลิกไปแล้วกลับมา พร้อมที่จดเก่ากว่าตอนยกเลิก (กด Undo ในชีต) → กู้สถานะเดิม
 *   แถวหายพร้อมกันเยอะผิดปกติ → ไม่ทำ จดเตือน (force = ยืนยันแล้ว ทำเลย)
 * @param {boolean} registerOnly แค่ลงทะเบียนแถวที่เพิ่งเขียน (เรียกตอนจบงานเขียน — ลบทันทีหลังสร้างก็ยังรู้)
 * @return {number} จำนวนรายการที่ยกเลิก/กู้คืน
 */
function rowDeletes_(ss, force, registerOnly) {
  var reg = regLoad_(ss), n = 0, now = new Date().toISOString();
  [SHIP, BILL, BILLING].forEach(function (T) {
    var sh = ss.getSheetByName(T.name);
    if (!sh || sh.getMaxColumns() < T.stamp) return;
    var last = masterLastRow_(sh);
    var cur = {};                                               /* รหัส → {ref, t} */
    if (last >= 2) {
      var keys = sh.getRange(2, 1, last - 1, 8).getValues();
      var st = sh.getRange(2, T.stamp, last - 1, 1).getValues();
      for (var i = 0; i < st.length; i++) {
        var o = rowStamp_(st[i][0]);
        stampIds_(T, o).forEach(function (id) { cur[id] = { ref: T.key(keys[i]), t: o._t || '' }; });
      }
    }
    var mine = reg.list.filter(function (e) { return e.tab === T.name; });
    var live = mine.filter(function (e) { return e.state === 'live'; });
    var vanished = live.filter(function (e) { return !cur[e.id]; });
    var back = mine.filter(function (e) { return e.state === 'gone' && cur[e.id] && cur[e.id].t && cur[e.id].t < e.at; });
    var revived = mine.filter(function (e) { return e.state === 'gone' && cur[e.id] && !(cur[e.id].t && cur[e.id].t < e.at); });

    /* รหัสใหม่ → ลงทะเบียน */
    Object.keys(cur).forEach(function (id) {
      if (!reg.map[T.name + '|' + id]) regAdd_(reg, T.name, id, cur[id].ref, now);
    });
    if (registerOnly) return;
    /* แอปเขียนแถวใหม่ให้รหัสที่เคยยกเลิก (เช่น ไฟล์ขาวเพิ่มแถวกลับ) — ไม่กู้ แค่กลับมาเฝ้าต่อ */
    revived.forEach(function (e) { regSet_(reg, e, 'live', '', now); });

    if (vanished.length) {
      var many = vanished.length > DEL_GUARD_MIN && vanished.length > live.length * DEL_GUARD_RATIO;
      if (many && !force) {
        var ck = 'delguard_' + T.name, cache = CacheService.getScriptCache();
        if (cache.get(ck) !== String(vanished.length)) {           /* เตือนครั้งเดียวต่อจำนวนเดิม ไม่จดซ้ำทุก 5 นาที */
          logSync_(DIR.GUARD, T.name, vanished.length + ' แถว', '', '', 'ยังไม่ยกเลิกในแอป — ตรวจแล้วรัน confirmSheetDeletes()', 'ระบบ');
          cache.put(ck, String(vanished.length), 21600);
        }
      } else {
        vanished.forEach(function (e) {
          var prev = cancelInApp_(T, e.id, now);
          regSet_(reg, e, 'gone', prev === null ? '' : JSON.stringify(prev), now);
          logSync_(DIR.CANCEL, T.name, e.ref, '', prev ? prevText_(T, prev) : '(ไม่พบในแอป)', 'ยกเลิก', 'ชีต Master');
          n++;
        });
      }
    }
    back.forEach(function (e) {
      var prev = e.prev ? JSON.parse(e.prev) : null;
      if (prev) restoreInApp_(T, e.id, prev, now);
      regSet_(reg, e, 'live', '', now);
      logSync_(DIR.RESTORE, T.name, e.ref, '', 'ยกเลิก', prev ? prevText_(T, prev) : '(ไม่มีสถานะเดิม)', 'ชีต Master');
      n++;
    });
  });
  regSave_(reg);
  return n;
}

function prevText_(T, prev) {
  return T === BILLING ? 'ใบวางบิล: ' + (prev.status || '') : 'สถานะ: ' + (prev.status || '');
}

/** ยกเลิกในแอป — คืนสถานะเดิม (ไว้กู้คืน) · null = ไม่พบในแอป */
function cancelInApp_(T, id, at) {
  var reason = 'ลบแถวในชีต Master (' + T.name + ')';
  if (T === BILLING) {
    var b = fsGet_('bills', id);
    if (!b) return null;
    var prev = { status: b.status, linkActive: b.linkActive !== false, cancel: b.cancel || null, jobs: {} };
    if (b.status !== 'cancelled') {
      (b.items || []).forEach(function (it) {
        if (!it.jobId) return;
        var j = fsGet_('jobs', it.jobId);
        if (!j || !j.billing || j.billing.billId !== id) return;  /* เที่ยวย้ายไปใบอื่นแล้ว — ไม่แตะ */
        prev.jobs[it.jobId] = j.billing;
        /* แบบเดียวกับกดยกเลิกใบในหน้า billing (store.js setJobBilling ช่องว่างทั้งหมด) */
        fsPatch_('jobs', it.jobId, { billing: { docNo: '', billedAt: '', paidAt: '', status: 'ยังไม่วางบิล', updatedAt: at, updatedBy: 'ชีต Master' }, updatedAt: at });
      });
      fsPatch_('bills', id, { status: 'cancelled', linkActive: false, cancel: { reason: reason, at: at, by: 'ชีต Master' }, updatedAt: at, updatedBy: 'ชีต Master' });
    }
    return prev;
  }
  var stopIds = [], prevAll = { status: '', stops: {} };
  if (T === SHIP) {
    var j2 = fsGet_('jobs', id);
    if (!j2) return null;
    prevAll.status = j2.status;
    if (j2.status !== 'cancelled') {
      fsPatch_('jobs', id, { status: 'cancelled', events: (j2.events || []).concat([cancelEvent_(reason, at)]), updatedAt: at });
    }
    stopIds = fsQuery_('shipments', fsEq_('jobId', id), ['status']).map(function (x) { return x._id; });
  } else {
    stopIds = [id];
  }
  var found = false;
  stopIds.forEach(function (sid) {
    var x = fsGet_('shipments', sid);
    if (!x) return;
    found = true;
    prevAll.stops[sid] = x.status;
    if (T === BILL) prevAll.status = x.status;
    if (x.status === 'cancelled') return;
    var ev = cancelEvent_(reason, at);
    fsPatch_('shipments', sid, { status: 'cancelled', events: (x.events || []).concat([ev]), updatedAt: at });
    fsPatchQuiet_('trackData', sid, { status: 'cancelled', updatedAt: at });
  });
  return (T === SHIP || found) ? prevAll : null;
}

/** กู้สถานะเดิม (แถวกลับมาในชีต) */
function restoreInApp_(T, id, prev, at) {
  var note = 'กู้คืน — แถวกลับมาในชีต Master (' + T.name + ')';
  if (T === BILLING) {
    var b = fsGet_('bills', id);
    if (!b) return;
    fsPatch_('bills', id, { status: prev.status || 'open', linkActive: prev.linkActive !== false, cancel: prev.cancel || null, updatedAt: at, updatedBy: 'ชีต Master' });
    Object.keys(prev.jobs || {}).forEach(function (jid) {
      if (fsGet_('jobs', jid)) fsPatch_('jobs', jid, { billing: prev.jobs[jid], updatedAt: at });
    });
    return;
  }
  if (T === SHIP && prev.status) {
    var j = fsGet_('jobs', id);
    if (j) fsPatch_('jobs', id, { status: prev.status, events: (j.events || []).concat([editEvent_(note + ' → ' + prev.status, 'ชีต Master', at)]), updatedAt: at });
  }
  Object.keys(prev.stops || {}).forEach(function (sid) {
    var x = fsGet_('shipments', sid);
    if (!x || x.status !== 'cancelled' || prev.stops[sid] === 'cancelled') return;
    fsPatch_('shipments', sid, { status: prev.stops[sid], events: (x.events || []).concat([editEvent_(note + ' → ' + prev.stops[sid], 'ชีต Master', at)]), updatedAt: at });
    fsPatchQuiet_('trackData', sid, { status: prev.stops[sid], updatedAt: at });
  });
}

function cancelEvent_(note, at) {
  return { id: 'ev_' + Utilities.getUuid().slice(0, 7), status: 'cancelled', at: at, byRole: 'sheet', byName: 'ชีต Master',
           note: note, photos: [], geo: null, signature: null, label: 'ยกเลิก' };
}

/* ---------- ทะเบียน (แท็บซ่อน) ---------- */
function regSheet_(ss) {
  var sh = ss.getSheetByName(REG_TAB);
  if (sh) return sh;
  sh = ss.insertSheet(REG_TAB);
  sh.getRange(1, 1, 1, REG_HEAD.length).setValues([REG_HEAD]);
  sh.setFrozenRows(1);
  sh.hideSheet();
  return sh;
}
function regLoad_(ss) {
  var sh = regSheet_(ss), last = sh.getLastRow();
  var vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, REG_HEAD.length).getValues();
  var reg = { sh: sh, list: [], map: {}, dirty: {}, add: [] };
  vals.forEach(function (r, i) {
    var e = { tab: String(r[0]), id: String(r[1]), ref: String(r[2]), state: String(r[3]), prev: String(r[4] || ''), at: String(r[5] || ''), row: i + 2 };
    reg.list.push(e);
    reg.map[e.tab + '|' + e.id] = e;
  });
  return reg;
}
function regAdd_(reg, tab, id, ref, at) {
  var e = { tab: tab, id: id, ref: ref, state: 'live', prev: '', at: at, row: 0 };
  reg.list.push(e);
  reg.map[tab + '|' + id] = e;
  reg.add.push(e);
}
function regSet_(reg, e, state, prev, at) {
  e.state = state; e.prev = prev; e.at = at;
  if (e.row) reg.dirty[e.row] = e;
}
function regSave_(reg) {
  Object.keys(reg.dirty).forEach(function (row) {
    var e = reg.dirty[row];
    reg.sh.getRange(e.row, 4, 1, 3).setValues([[e.state, e.prev, e.at]]);
  });
  if (reg.add.length) {
    var start = reg.sh.getLastRow() + 1;
    reg.sh.getRange(start, 1, reg.add.length, REG_HEAD.length)
      .setValues(reg.add.map(function (e) { return [e.tab, e.id, e.ref, e.state, e.prev, e.at]; }));
  }
}

/* ================= Firestore (REST ผ่าน service account) ================= */

function fsEq_(path, v) {
  return { fieldFilter: { field: { fieldPath: path }, op: 'EQUAL', value: fsEncode_(v) } };
}

/** ถามคอลเลกชัน (where = null คือทั้งหมด) · fields = null คือทุกช่อง · _id = รหัสเอกสาร */
function fsQuery_(coll, where, fields) {
  var q = { from: [{ collectionId: coll }] };
  if (fields) q.select = { fields: fields.map(function (f) { return { fieldPath: f }; }) };
  if (where) q.where = where;
  var res = UrlFetchApp.fetch(FS_BASE + ':runQuery', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + saAccessToken_() },
    payload: JSON.stringify({ structuredQuery: q })
  });
  if (res.getResponseCode() !== 200) throw new Error('อ่าน ' + coll + ' ไม่ได้: ' + res.getContentText());
  return JSON.parse(res.getContentText())
    .filter(function (r) { return r.document; })
    .map(function (r) {
      var x = fsFields_(r.document.fields || {});
      x._id = r.document.name.split('/').pop();
      return x;
    });
}

/** path IN values — ถามทีละก้อน (IN รับได้ 30 ค่า) · path '__name__' = ตามรหัสเอกสาร
 *  เลขล้วนถามทั้งแบบข้อความและตัวเลข — เลขจากไฟล์ Excel บางทีเก็บเป็นตัวเลข */
function fsIn_(coll, path, values, fields) {
  var out = [];
  var base = FS_BASE.replace('https://firestore.googleapis.com/v1/', '');
  for (var i = 0; i < values.length; i += 15) {
    var vals = [];
    values.slice(i, i + 15).forEach(function (v) {
      v = String(v);
      if (path === '__name__') return vals.push({ referenceValue: base + '/' + coll + '/' + v });
      vals.push({ stringValue: v });
      if (/^\d+$/.test(v) && v.length < 16) vals.push({ integerValue: v });
    });
    out = out.concat(fsQuery_(coll, { fieldFilter: { field: { fieldPath: path }, op: 'IN',
      value: { arrayValue: { values: vals } } } }, fields));
  }
  return out;
}

/** เขียนทับเฉพาะช่องที่ให้มา (ช่องอื่นของเอกสารไม่แตะ) */
function fsPatch_(coll, id, obj) {
  var mask = Object.keys(obj).map(function (k) { return 'updateMask.fieldPaths=' + encodeURIComponent(k); }).join('&');
  var fields = {};
  Object.keys(obj).forEach(function (k) { fields[k] = fsEncode_(obj[k]); });
  var res = UrlFetchApp.fetch(FS_BASE + '/' + coll + '/' + encodeURIComponent(id) + '?' + mask +
    '&currentDocument.exists=true', {
    method: 'patch', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + saAccessToken_() },
    payload: JSON.stringify({ fields: fields })
  });
  if (res.getResponseCode() !== 200) throw new Error('เขียน ' + coll + '/' + id + ' ไม่ได้: ' + res.getContentText());
}
/** สำเนาหน้าติดตาม — ไม่มีเอกสารก็ไม่เป็นไร (แอปเขียนให้รอบหน้า) */
function fsPatchQuiet_(coll, id, obj) {
  try { fsPatch_(coll, id, obj); } catch (e) { console.warn(String(e.message || e)); }
}

function fsEncode_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsEncode_) } };
  var f = {};
  Object.keys(v).forEach(function (k) { f[k] = fsEncode_(v[k]); });
  return { mapValue: { fields: f } };
}
