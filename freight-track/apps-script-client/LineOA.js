/* ============================================================
   AppsScript-lineIntake.gs — รับไฟล์ Excel ที่ลูกค้าส่งเข้า LINE OA
   แล้วตรวจว่าหัวตาราง A1–Q1 ตรงกับฟอร์แมทที่ระบบรับหรือไม่

   ทางเดินของไฟล์หนึ่งใบ
     ลูกค้าส่งไฟล์เข้า LINE OA
       → LINE ยิง webhook มาที่สคริปต์นี้ (ส่งมาแค่ messageId ไม่ได้ส่งไฟล์มาด้วย)
       → สคริปต์โหลดไฟล์จาก api-data.line.me เข้าหน่วยความจำ
       → แกะ .xlsx (zip) อ่านแถวที่ 1 ช่อง A ถึง Q ของทุกชีต
       → ตรงฟอร์แมท   : ส่งต่อให้ onValidFile_() ทำงาน แล้วตอบกลับลูกค้าว่ารับแล้ว
       → ไม่ตรงฟอร์แมท : ไม่เก็บอะไรเลย ไฟล์หายไปพร้อมกับการทำงานรอบนั้น
                        แล้วตอบกลับว่าหัวตารางช่องไหนไม่ตรง

   *** ตอนนี้ทำแค่ "ตรวจฟอร์แมท" ตามที่สั่ง ***
   จะให้ทำอะไรกับไฟล์ที่ผ่านต่อ (เข้าชีต / สร้างใบงาน / เก็บ Drive)
   ค่อยเติมในฟังก์ชัน onValidFile_() ตรงท้ายไฟล์ จุดเดียว

   ---------- วิธีติดตั้ง (อยู่โปรเจกต์เดียวกับ AppsScript-drivers.gs ได้) ----------
   1. ในโปรเจกต์ Apps Script เดิม สร้างไฟล์ใหม่ชื่อ LineOA.gs แล้ววางไฟล์นี้ลงไป
      ไฟล์นี้ตั้งใจไม่มี doPost ของตัวเอง เพราะโปรเจกต์หนึ่งมี doPost ได้ตัวเดียว
      ตัว doPost อยู่ที่ รหัส.gs (AppsScript-drivers.gs) แล้วมันจะแยกทางมาเรียก
      handleLineWebhook_() ให้เองเมื่อคำขอนั้นมาจาก LINE
   2. เมนู Project Settings → Script properties → เพิ่ม
        LINE_CHANNEL_ACCESS_TOKEN = โทเคนจาก LINE Developers (Messaging API)
        DRIVE_FOLDER_ID           = (ใส่หรือไม่ใส่ก็ได้) โฟลเดอร์เก็บไฟล์ที่ผ่านการตรวจ
      ห้ามพิมพ์โทเคนลงในโค้ดไฟล์นี้
   3. Deploy → Manage deployments → แก้ deployment เดิม → Version: New version → Deploy
        (ใช้ URL /exec เดิมได้เลย ทั้งเว็บ FreightTrack และ LINE ใช้ลิงก์เดียวกัน)
        ครั้งแรกจะขออนุญาตสิทธิ์เพิ่ม เพราะไฟล์นี้ต้องต่อเน็ตออกนอก (UrlFetch) และแตะ Drive
   4. เอาลิงก์ที่ลงท้าย /exec ไปใส่ที่ LINE Developers → Messaging API → Webhook URL
      แล้วกด Verify · เปิด "Use webhook" · ปิด "Auto-reply messages" ไม่งั้นบอทตอบซ้อน
   5. ทดสอบได้โดยส่งไฟล์เข้า LINE OA จริง หรือรัน testWithDriveFile() ในตัวแก้ไข

   ---------- ข้อจำกัดที่ต้องรู้ ----------
   · doPost ของ Apps Script อ่าน header ของคำขอไม่ได้ จึงตรวจลายเซ็น
     x-line-signature ไม่ได้ ความปลอดภัยจึงอยู่ที่ "ลิงก์ /exec เดาไม่ได้" เท่านั้น
     ถ้าต้องการตรวจลายเซ็นจริง ๆ ต้องย้าย webhook ไปเซิร์ฟเวอร์ที่อ่าน header ได้
   · ไฟล์ใน LINE มีอายุจำกัด ต้องโหลดตอนได้รับ ย้อนไปโหลดทีหลังไม่ได้
   · รองรับ .xlsx เท่านั้น — .xls แบบเก่าเป็นไบนารีคนละแบบ แกะด้วยวิธีนี้ไม่ได้
   ============================================================ */

/* หัวตาราง A1–Q1 ที่ถือว่า "ใช่" — ดึงจากไฟล์จริงของลูกค้า
   ต้องตรงกับ tools/excel_formats/shipment_cst.json ฝั่งเครื่อง
   และตรงกับ DEFAULT_MAP ใน js/xlsxImport.js ของเว็บ */
var EXPECTED_HEADERS = [
  'Shipment No.',          /* A */
  'วันที่ออกเดินทาง',        /* B */
  'ผู้จัดส่ง',               /* C */
  'ทะเบียนรถ',             /* D */
  'No.',                   /* E */
  'Invoice',               /* F */
  'Delivery',              /* G */
  'ชื่อลูกค้า',              /* H */
  'ชื่อสถานที่จัดส่ง',       /* I */
  'ที่อยู่สถานที่จัดส่ง',     /* J */
  'ที่อยู่สถานที่จัดส่ง 1',   /* K */
  'ที่อยู่สถานที่จัดส่ง 2',   /* L */
  'น้ำหนัก',                /* M */
  'จำนวนยา',               /* N */
  'จำนวนน้ำเกลือ/อื่น ๆ',    /* O */
  'Amount',                /* P */
  'Remark'                 /* Q */
];

var MIN_MATCH = 17;        /* ต้องตรงกี่ช่องจาก 17 ถึงจะรับ (17 = ต้องตรงหมด) */

/* ---------- ตู้ไปรษณีย์ระหว่าง LINE กับหน้าเว็บ ---------------
   หน้า ops.html เก็บข้อมูลไว้ใน localStorage ของเบราว์เซอร์ Apps Script
   ยัดเข้าไปตรง ๆ ไม่ได้ จึงพักแถวจากไฟล์ไว้ในแท็บนี้ แล้วให้หน้าเว็บมาดึงเอง
   (ชีตเดียวกับทะเบียนคนขับ แต่คนละแท็บ) */
var JOBS_TAB = 'แถวจากไฟล์ LINE';
var JOBS_KEEP = 5000;                    /* เก็บย้อนหลังกี่แถว เกินกว่านี้ตัดตัวเก่าทิ้ง */
var JOBS_HEADER = ['รับเมื่อ', 'ไฟล์', 'ชีต', 'Delivery', 'Invoice',
                   'ลูกค้า', 'ปลายทาง', 'น้ำหนัก', 'มูลค่า', 'คนขับ', 'Shipment No.', 'ที่มา',
                   'วันที่ออกเดินทาง'];
/* คอลัมน์ต่อท้ายทีหลัง (11 Shipment No. · 12 ที่มา LINE/ลากวาง · 13 วันที่ออกเดินทาง ช่อง B เป็น yyyy-MM-dd)
   — แท็บเดิมคอลัมน์ 1–10 ไม่เลื่อน */

/* ช่องที่ดึงจากไฟล์ — ตรงกับ DEFAULT_MAP ใน js/xlsxImport.js */
var COL = { shipment:'A', date:'B', invoice:'F', delivery:'G', customer:'H',
            destName:'I', weight:'M', amount:'P', drivers:'R' };

/** 'A'→0  'R'→17 */
function colIndex_(letter) {
  var n = 0, s = String(letter || '').toUpperCase();
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 65 || c > 90) return -1;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}
var MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
var PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
var DOC_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

/* ================= webhook ================================= */

/**
 * ตัวรับ webhook ของ LINE — doPost ใน รหัส.gs เป็นคนเรียกตัวนี้
 * ต้องตอบ 200 เสมอไม่ว่าจะเกิดอะไร ไม่งั้น LINE จะยิงซ้ำวนไม่หยุด
 * @param {Object} body เนื้อคำขอที่แกะ JSON แล้ว
 */
function handleLineWebhook_(body) {
  var events = (body && body.events) || [];
  for (var i = 0; i < events.length; i++) {
    try {
      handleEvent_(events[i]);
    } catch (err) {
      /* พังทีละ event ไม่ให้ลาก event อื่นตาย */
      console.error('event error: ' + err);
    }
  }
  return ContentService.createTextOutput('OK');
}

function handleEvent_(ev) {
  if (!ev || ev.type !== 'message' || !ev.message) return;

  /* ส่งมาไม่ใช่ไฟล์ — บอกให้รู้ว่าต้องส่งแบบไหน
     รูป/วิดีโอ/เสียง มักเกิดจากลูกค้าตั้งใจส่งเอกสารแต่เลือกผิดเมนู จึงตอบกลับ
     ส่วนข้อความ สติกเกอร์ ตำแหน่ง ปล่อยเงียบ ให้คนคุยกันเองตามปกติ */
  if (ev.message.type !== 'file') {
    var hint = nonFileMessage_(ev.message.type);
    if (hint) {
      console.log('ได้ข้อความชนิด ' + ev.message.type + ' — ตอบกลับให้ส่งเป็นไฟล์');
      reply_(ev.replyToken, hint);
    }
    return;
  }

  var fileName = ev.message.fileName || '';
  console.log('ได้ไฟล์: ' + fileName + ' (' + ev.message.fileSize + ' ไบต์)');

  if (!/\.xlsx$/i.test(fileName)) {
    reply_(ev.replyToken,
      'ไฟล์ "' + fileName + '" ไม่ใช่ .xlsx\n' +
      'ระบบรับเฉพาะไฟล์ Excel นามสกุล .xlsx — ถ้าเป็น .xls ให้เปิดใน Excel แล้ว Save As เป็น .xlsx ก่อน');
    return;
  }

  var blob = fetchLineContent_(ev.message.id);
  var res = checkFormat_(blob);

  if (!res.ok) {
    /* ไม่ตรงฟอร์แมท = ไม่เก็บ ไฟล์อยู่แค่ในหน่วยความจำรอบนี้แล้วหายไปเอง */
    reply_(ev.replyToken, mismatchMessage_(fileName, res));
    console.log('ทิ้งไฟล์ ' + fileName + ' — ตรง ' + res.matched + '/' + res.total);
    return;
  }

  console.log('ไฟล์ผ่าน: ' + fileName + ' ชีต "' + res.sheet + '"');
  var meta = {
    fileName: fileName,
    sheet: res.sheet,
    messageId: ev.message.id,
    userId: (ev.source && (ev.source.userId || ev.source.groupId)) || '',
    source: 'LINE',
    receivedAt: new Date()
  };
  var note = onValidFile_(blob, meta);

  reply_(ev.replyToken, [
    'รับไฟล์ "' + fileName + '" แล้ว\n' +
    'หัวตารางตรงฟอร์แมท (ชีต "' + res.sheet + '" ตรง ' + res.matched + '/' + res.total + ' ช่อง)' +
    (note ? '\n' + note : ''),
    meta.dupText || ''                                 /* เลขบิลซ้ำ — แยกเป็นข้อความของตัวเอง ให้เห็นชัด */
  ]);
}

/** ข้อความตอบกลับเมื่อลูกค้าส่งมาไม่ใช่ไฟล์ — คืน '' ถ้าไม่ต้องตอบ */
function nonFileMessage_(type) {
  var howTo = 'วิธีส่ง: ในแชทกดปุ่ม + แล้วเลือก "ไฟล์" จากนั้นเลือกไฟล์ .xlsx ครับ';
  if (type === 'image') {
    return 'ไม่รองรับรูปภาพครับ รบกวนส่งมาใหม่เป็นไฟล์ Excel (.xlsx)\n' + howTo;
  }
  if (type === 'video' || type === 'audio') {
    return 'ไม่รองรับไฟล์วิดีโอและเสียงครับ รบกวนส่งมาใหม่เป็นไฟล์ Excel (.xlsx)\n' + howTo;
  }
  return '';   /* ข้อความ สติกเกอร์ ตำแหน่ง ฯลฯ ไม่ต้องตอบ */
}

/* ================= โหลดไฟล์จาก LINE ========================= */

function fetchLineContent_(messageId) {
  var token = prop_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) throw new Error('ยังไม่ได้ตั้ง LINE_CHANNEL_ACCESS_TOKEN ใน Script properties');

  var res = UrlFetchApp.fetch(
    'https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content',
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });

  var code = res.getResponseCode();
  if (code !== 200) throw new Error('โหลดไฟล์จาก LINE ไม่สำเร็จ (HTTP ' + code + ')');
  return res.getBlob();
}

/* ================= ตรวจหัวตาราง A1–Q1 ====================== */

/**
 * @param {Blob} blob ไฟล์ .xlsx
 * @return {{ok:boolean, sheet:string, matched:number, total:number, mismatches:Array, sheets:Array}}
 */
function checkFormat_(blob) {
  var files = Utilities.unzip(blob.setContentType('application/zip'));
  var byName = {};
  for (var i = 0; i < files.length; i++) byName[files[i].getName()] = files[i];

  if (!byName['xl/workbook.xml']) {
    return { ok: false, sheet: '', matched: 0, total: EXPECTED_HEADERS.length,
             mismatches: [], sheets: [], unreadable: true };
  }

  var shared = readSharedStrings_(byName['xl/sharedStrings.xml']);
  var sheets = sheetTargets_(byName['xl/workbook.xml'], byName['xl/_rels/workbook.xml.rels']);

  var best = null;
  var checked = [];
  for (var s = 0; s < sheets.length; s++) {
    var part = byName[sheets[s].target];
    if (!part) continue;
    var headers = firstRow_(part, shared);
    var r = compareHeaders_(headers);
    r.sheet = sheets[s].name;
    checked.push(r.sheet);
    if (r.ok) { r.sheets = checked; return r; }            /* ชีตไหนผ่านก็พอ */
    if (!best || r.matched > best.matched) best = r;
  }

  if (!best) {
    return { ok: false, sheet: '', matched: 0, total: EXPECTED_HEADERS.length,
             mismatches: [], sheets: checked, unreadable: true };
  }
  best.sheets = checked;
  return best;
}

function readSharedStrings_(part) {
  if (!part) return [];
  var root = XmlService.parse(part.getDataAsString()).getRootElement();
  var ns = XmlService.getNamespace(MAIN_NS);
  var out = [];
  var items = root.getChildren('si', ns);
  for (var i = 0; i < items.length; i++) out.push(textOf_(items[i], ns));
  return out;
}

/* ข้อความในช่องอาจถูกซอยเป็นหลาย <t> (เช่นมีการจัดรูปแบบกลางคำ) ต้องต่อกลับ */
function textOf_(el, ns) {
  var s = '';
  var direct = el.getChildren('t', ns);
  for (var i = 0; i < direct.length; i++) s += direct[i].getText();
  var runs = el.getChildren('r', ns);
  for (var j = 0; j < runs.length; j++) {
    var ts = runs[j].getChildren('t', ns);
    for (var k = 0; k < ts.length; k++) s += ts[k].getText();
  }
  return s;
}

function sheetTargets_(workbookPart, relsPart) {
  var ns = XmlService.getNamespace(MAIN_NS);
  var rNs = XmlService.getNamespace(DOC_REL_NS);
  var relMap = {};
  if (relsPart) {
    var relRoot = XmlService.parse(relsPart.getDataAsString()).getRootElement();
    var rels = relRoot.getChildren('Relationship', XmlService.getNamespace(PKG_REL_NS));
    for (var i = 0; i < rels.length; i++) {
      relMap[rels[i].getAttribute('Id').getValue()] = rels[i].getAttribute('Target').getValue();
    }
  }
  var wbRoot = XmlService.parse(workbookPart.getDataAsString()).getRootElement();
  var holder = wbRoot.getChild('sheets', ns);
  var list = holder ? holder.getChildren('sheet', ns) : [];
  var out = [];
  for (var s = 0; s < list.length; s++) {
    var idAttr = list[s].getAttribute('id', rNs);
    var target = idAttr ? (relMap[idAttr.getValue()] || '') : '';
    target = target.replace(/^\//, '');
    if (target && target.indexOf('xl/') !== 0) target = 'xl/' + target;
    if (target) out.push({ name: list[s].getAttribute('name').getValue(), target: target });
  }
  return out;
}

/** อ่านแถวที่ 1 ช่อง A..Q ของชีตหนึ่ง คืนเป็น array 17 ช่อง */
function firstRow_(part, shared) {
  var ns = XmlService.getNamespace(MAIN_NS);
  var root = XmlService.parse(part.getDataAsString()).getRootElement();
  var data = root.getChild('sheetData', ns);
  var cells = {};
  if (data) {
    var rows = data.getChildren('row', ns);
    for (var i = 0; i < rows.length; i++) {
      var rAttr = rows[i].getAttribute('r');
      if (rAttr && rAttr.getValue() !== '1') continue;
      var cs = rows[i].getChildren('c', ns);
      for (var j = 0; j < cs.length; j++) {
        var ref = cs[j].getAttribute('r') ? cs[j].getAttribute('r').getValue() : '';
        var col = (ref.match(/^[A-Z]+/) || [''])[0];
        if (!col) continue;
        cells[col] = cellText_(cs[j], ns, shared);
      }
      break;
    }
  }
  var out = [];
  for (var k = 0; k < EXPECTED_HEADERS.length; k++) {
    out.push(cells[String.fromCharCode(65 + k)] || '');
  }
  return out;
}

/** อ่านทุกแถวของชีตเป็นตาราง 2 มิติ (ข้าม header ตามที่สั่ง) */
function sheetRows_(part, shared, skipRows) {
  var ns = XmlService.getNamespace(MAIN_NS);
  var root = XmlService.parse(part.getDataAsString()).getRootElement();
  var data = root.getChild('sheetData', ns);
  if (!data) return [];

  var out = [];
  var rows = data.getChildren('row', ns);
  for (var i = 0; i < rows.length; i++) {
    var rAttr = rows[i].getAttribute('r');
    var rowNo = rAttr ? parseInt(rAttr.getValue(), 10) : (i + 1);
    if (rowNo <= skipRows) continue;

    var cells = {};
    var cs = rows[i].getChildren('c', ns);
    for (var j = 0; j < cs.length; j++) {
      var ref = cs[j].getAttribute('r') ? cs[j].getAttribute('r').getValue() : '';
      var col = (ref.match(/^[A-Z]+/) || [''])[0];
      if (!col) continue;
      cells[colIndex_(col)] = cellText_(cs[j], ns, shared);
    }
    cells.__row = rowNo;                               /* เลขแถวจริงใน Excel — ใช้บอกลูกค้าว่าแถวไหนเลขบิลซ้ำ */
    out.push(cells);
  }
  return out;
}

/**
 * ดึงแถวที่ใช้งานได้จากไฟล์ทั้งเล่ม — ทุกชีต
 * @return {Array} [{sheet, delivery, invoice, customer, destName, weight, amount, drivers, shipmentNo}]
 */
function extractRows_(blob) {
  var files = Utilities.unzip(blob.setContentType('application/zip'));
  var byName = {};
  for (var i = 0; i < files.length; i++) byName[files[i].getName()] = files[i];
  if (!byName['xl/workbook.xml']) return [];

  var shared = readSharedStrings_(byName['xl/sharedStrings.xml']);
  var sheets = sheetTargets_(byName['xl/workbook.xml'], byName['xl/_rels/workbook.xml.rels']);
  var get = function (cells, key) {
    var i = colIndex_(COL[key]);
    return i < 0 ? '' : normHeader2_(cells[i]);
  };

  var out = [];
  for (var s = 0; s < sheets.length; s++) {
    var part = byName[sheets[s].target];
    if (!part) continue;
    var rows = sheetRows_(part, shared, 1);          /* แถว 1 เป็นหัวตาราง */
    for (var r = 0; r < rows.length; r++) {
      var delivery = get(rows[r], 'delivery');
      /* ไม่มีทั้งเลข Delivery และเลข Invoice = แถวว่างหรือแถวรวม
         แถวที่มีแค่ Invoice (บิลค้างที่ DC / งานซ่อม) เก็บด้วย — หน้า ops จับคู่ด้วยเลข Invoice (31 ต.ค.) */
      if (!delivery && !INV_RE.test(get(rows[r], 'invoice'))) continue;
      out.push({
        sheet: sheets[s].name,
        delivery: delivery,
        invoice: get(rows[r], 'invoice'),
        customer: get(rows[r], 'customer'),
        destName: get(rows[r], 'destName'),
        weight: get(rows[r], 'weight'),
        amount: get(rows[r], 'amount'),
        drivers: get(rows[r], 'drivers'),
        shipmentNo: get(rows[r], 'shipment'),
        serviceDate: intakeDate_(get(rows[r], 'date')),
        rowNo: rows[r].__row || 0
      });
    }
  }
  return out;
}

/** ช่อง B '14/09/2026' · '14.09.2026' · '2026-09-14' · serial ของ Excel · ปี พ.ศ. → '2026-09-14' (อ่านไม่ออกคืน '')
 *  คืนเป็นข้อความ ไม่ผ่าน Date — ไม่โดนเขตเวลาของชีต/สคริปต์เลื่อนวัน */
function intakeDate_(s) {
  if (!s) return '';
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  if (/^\d+(\.\d+)?$/.test(s) && Number(s) > 20000) {
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate());
  }
  var y, mo, dd, m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) { y = +m[1]; mo = +m[2]; dd = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/))) { y = +m[3]; mo = +m[2]; dd = +m[1]; }
  else return '';
  if (y > 2400) y -= 543;                              /* เผลอใส่ พ.ศ. มา */
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31) return '';
  return y + '-' + p(mo) + '-' + p(dd);
}

/* ยุบช่องว่างเฉย ๆ ไม่แปลงพิมพ์เล็ก (ต่างจาก normHeader_ ที่ใช้เทียบหัวตาราง) */
function normHeader2_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
}

/**
 * เขียนแถวลงแท็บพักข้อมูล ให้หน้าเว็บมาดึงต่อ
 * ต่อท้ายเสมอ ไม่ทับของเดิม เพราะลูกค้าส่งหลายไฟล์ต่อวันได้ (กลาง / ตะวันออก คนละไฟล์)
 * ฝั่งเว็บจะ dedupe เอง โดยยึดแถวล่าสุดของแต่ละเลข Delivery
 */
function pushRowsToSheet_(rows, meta) {
  if (!rows.length) return 0;

  var ssId = (typeof SHEET_ID !== 'undefined' && SHEET_ID)
    ? SHEET_ID
    : 'REPLACE_WITH_YOUR_SHEET_ID';
  var ss = SpreadsheetApp.openById(ssId);
  var sh = ss.getSheetByName(JOBS_TAB);
  if (!sh) {
    sh = ss.insertSheet(JOBS_TAB);
    sh.getRange(1, 1, 1, JOBS_HEADER.length).setValues([JOBS_HEADER]);
    sh.setFrozenRows(1);
  } else {
    /* แท็บเก่ายังไม่มีหัวคอลัมน์ที่เพิ่มทีหลัง — เติมให้ */
    for (var h = 11; h <= JOBS_HEADER.length; h++) {
      if (!sh.getRange(1, h).getValue()) sh.getRange(1, h).setValue(JOBS_HEADER[h - 1]);
    }
  }

  var stamp = Utilities.formatDate(meta.receivedAt || new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var values = [];
  for (var i = 0; i < rows.length; i++) {
    values.push([stamp, meta.fileName || '', rows[i].sheet, rows[i].delivery, rows[i].invoice,
                 rows[i].customer, rows[i].destName, rows[i].weight, rows[i].amount, rows[i].drivers,
                 rows[i].shipmentNo || '', meta.source || 'LINE', rows[i].serviceDate || '']);
  }
  var target = sh.getRange(sh.getLastRow() + 1, 1, values.length, JOBS_HEADER.length);
  /* ช่องวันที่เก็บเป็นข้อความ — ไม่งั้นชีตแปลง '2026-09-14' เป็น Date แล้วเลื่อนวันตามเขตเวลา */
  sh.getRange(target.getRow(), 13, values.length, 1).setNumberFormat('@');
  target.setValues(values);

  /* ตัดแถวเก่าทิ้ง ไม่ให้ชีตบวมจนช้า */
  var extra = (sh.getLastRow() - 1) - JOBS_KEEP;
  if (extra > 0) sh.deleteRows(2, extra);

  return values.length;
}

function cellText_(cell, ns, shared) {
  var tAttr = cell.getAttribute('t');
  var type = tAttr ? tAttr.getValue() : '';
  if (type === 's') {
    var v = cell.getChild('v', ns);
    var idx = v ? parseInt(v.getText(), 10) : -1;
    return (idx >= 0 && idx < shared.length) ? shared[idx] : '';
  }
  if (type === 'inlineStr') {
    var is = cell.getChild('is', ns);
    return is ? textOf_(is, ns) : '';
  }
  var val = cell.getChild('v', ns);
  return val ? val.getText() : '';
}

/* ยุบความต่างที่ไม่สำคัญก่อนเทียบ — เว้นวรรคเกิน ช่องว่างแปลก ๆ ตัวพิมพ์ใหญ่เล็ก
   ลูกค้าพิมพ์หัวตารางใหม่ทุกเดือน ถ้าจับผิดเรื่องพวกนี้ ไฟล์ที่ใช้ได้จริงจะถูกทิ้งฟรี

   ชื่อ normHeader_ ไม่ใช่ norm_ เพราะ รหัส.gs มี norm_ ของตัวเองอยู่แล้ว
   ชื่อซ้ำกันข้ามไฟล์ = ตัวหลังทับตัวแรกเงียบ ๆ (ของที่นี่แปลงเป็นพิมพ์เล็กด้วย
   ถ้าไปทับของ drivers ชื่อคนขับจะถูกเขียนลงชีตเป็นตัวพิมพ์เล็กหมด) */
function normHeader_(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/ /g, ' ')
    .replace(/​/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compareHeaders_(headers) {
  var mismatches = [];
  var matched = 0;
  for (var i = 0; i < EXPECTED_HEADERS.length; i++) {
    var got = headers[i] || '';
    if (normHeader_(EXPECTED_HEADERS[i]) === normHeader_(got)) matched++;
    else mismatches.push({
      column: String.fromCharCode(65 + i),
      expected: EXPECTED_HEADERS[i],
      actual: got
    });
  }
  return {
    ok: matched >= MIN_MATCH,
    matched: matched,
    total: EXPECTED_HEADERS.length,
    mismatches: mismatches,
    sheet: ''
  };
}

function mismatchMessage_(fileName, res) {
  if (res.unreadable) {
    return 'เปิดไฟล์ "' + fileName + '" ไม่ได้\nไฟล์อาจเสีย หรือไม่ใช่ไฟล์ Excel จริง ๆ';
  }
  var lines = [
    'ไฟล์ "' + fileName + '" หัวตารางไม่ตรงกับฟอร์แมทที่ระบบรับ',
    'ตรวจแถวที่ 1 ช่อง A ถึง Q แล้วตรง ' + res.matched + '/' + res.total + ' ช่อง',
    ''
  ];
  var show = res.mismatches.slice(0, 5);
  for (var i = 0; i < show.length; i++) {
    lines.push('· ช่อง ' + show[i].column + '1 ควรเป็น "' + show[i].expected +
               '" แต่เป็น "' + (show[i].actual || '(ว่าง)') + '"');
  }
  if (res.mismatches.length > show.length) {
    lines.push('· และอีก ' + (res.mismatches.length - show.length) + ' ช่อง');
  }
  lines.push('');
  lines.push('แก้หัวตารางให้ตรงแล้วส่งไฟล์มาใหม่ได้เลย');
  return lines.join('\n');
}

/* ================= รับไฟล์ที่ลากมาวางในหน้า ops ================
   ทางเดียวกับไฟล์จาก LINE ทุกอย่าง — ตรวจหัวตาราง → เก็บลง Drive → ส่งแถวเข้าแท็บ
   ทุกเครื่องที่เปิดหน้า ops จะเห็นไฟล์นี้ในรายการไฟล์ของวันนี้ เพราะดึงจากแท็บเดียวกัน
   body = { action:'upload', fileName, data:<base64 ของไฟล์ .xlsx>, by } */
function handleUpload_(body) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);                                /* สองคนวางไฟล์พร้อมกัน แถวไม่ชนกัน */
    var fileName = String(body.fileName || 'upload.xlsx');
    if (!/\.xlsx$/i.test(fileName)) return json_({ ok: false, error: 'รับเฉพาะไฟล์ .xlsx' });
    if (!body.data) return json_({ ok: false, error: 'ไม่มีข้อมูลไฟล์' });

    var blob = Utilities.newBlob(Utilities.base64Decode(body.data),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fileName);
    var res = checkFormat_(blob);
    if (!res.ok) return json_({ ok: false, error: mismatchMessage_(fileName, res) });

    var rows = extractRows_(blob);
    var meta = {
      fileName: fileName, sheet: res.sheet, source: 'ลากวาง',
      userId: String(body.by || ''), receivedAt: new Date(),
      locked: true                                     /* ถือ script lock อยู่แล้ว — appendToMaster_ ไม่ต้องขอซ้ำ */
    };
    var note = onValidFile_(blob, meta);
    return json_({ ok: true, rows: rows.length, sheet: res.sheet, note: note, dupText: meta.dupText || '' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/* ================= ตอบกลับใน LINE ========================== */

/** text = ข้อความเดียว หรือ array หลายข้อความ (LINE ตอบได้สูงสุด 5 ข้อความต่อครั้ง) */
function reply_(replyToken, text) {
  if (!replyToken) return;
  var token = prop_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return;
  var list = (Array.isArray(text) ? text : [text]).filter(function (t) { return t; }).slice(0, 5);
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: list.map(function (t) { return { type: 'text', text: String(t).slice(0, 4900) }; })
    }),
    muteHttpExceptions: true
  });
}

/* ================= จุดต่อยอด =============================== */

/**
 * ไฟล์ที่ผ่านการตรวจแล้วจะมาถึงตรงนี้ — ตอนนี้แค่เก็บลง Drive ถ้าตั้งโฟลเดอร์ไว้
 * ขั้นต่อไป (เข้าชีต / สร้างใบงาน / แจ้งทีมคลัง) เติมได้ที่ฟังก์ชันนี้จุดเดียว
 * @return {string} ข้อความสั้น ๆ ต่อท้ายคำตอบใน LINE (คืน '' ถ้าไม่ต้องบอกอะไร)
 */
function onValidFile_(blob, meta) {
  var notes = [];
  var inDrive = false;

  /* ทาง 1 — เก็บไฟล์ต้นฉบับไว้ย้อนดู */
  var folderId = prop_('DRIVE_FOLDER_ID');
  if (folderId) {
    try {
      var stamp = Utilities.formatDate(meta.receivedAt, 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
      var file = DriveApp.getFolderById(folderId)
        .createFile(blob.setName(stamp + '_' + meta.fileName));
      console.log('เก็บไฟล์ไว้ที่ Drive: ' + file.getId());
      notes.push('เก็บไฟล์ไว้แล้ว');
      inDrive = true;
    } catch (err) {
      console.error('เก็บลง Drive ไม่สำเร็จ: ' + err);
    }
  }

  /* ทาง 2 — ส่งแถวข้อมูลให้กระดานงานเอาไปอัปเดตเลข Invoice เอง
     ล้มที่ทางนี้ไม่ควรทำให้ทางแรกพัง จึงแยก try กัน */
  try {
    var rows = extractRows_(blob);
    /* เลขบิลซ้ำ — ตรวจก่อนต่อแถวลงแท็บ (เทียบกับแถวของวันเดียวกันที่ส่งมาก่อนหน้า) · ล้มไม่ขวางการรับไฟล์ */
    try {
      meta.dupText = dupInvoiceText_(rows, meta);
    } catch (err) {
      console.error('ตรวจเลขบิลซ้ำไม่สำเร็จ: ' + err);
    }
    var n = pushRowsToSheet_(rows, meta);
    var withInv = 0;
    for (var i = 0; i < rows.length; i++) if (rows[i].invoice) withInv++;
    console.log('ส่งเข้ากระดานงาน ' + n + ' แถว (มีเลข Invoice ' + withInv + ' แถว)');
    if (n) notes.push('ส่งให้กระดานงานแล้ว ' + n + ' แถว');
  } catch (err) {
    console.error('ส่งแถวเข้ากระดานงานไม่สำเร็จ: ' + err);
  }

  /* ทาง 3 — รวมเข้าชีต Master สำหรับ Report รายเดือน (AppsScript-master.gs)
     เฉพาะไฟล์ที่เก็บลง Drive สำเร็จ ชีต Master จะได้ตรงกับไฟล์ในโฟลเดอร์เสมอ */
  if (inDrive) {
    try {
      var m = appendToMaster_(blob, meta);
      if (m) notes.push(m);
    } catch (err) {
      console.error('รวมเข้า Master ไม่สำเร็จ: ' + err);
    }
  }

  return notes.length ? notes.join(' · ') : '';
}

/* ================= เลขบิลซ้ำ (28 ต.ค.) =======================
   ลูกค้าบางทีส่งไฟล์ที่เลข Invoice (ทุกแบบ ไม่ใช่แค่เลข 8) ซ้ำกันสองแถวในวันเดียวกัน แต่คนละ Delivery
   ระบบจะไม่ใส่เลขซ้ำนั้นให้จุดส่งไหนเลย (หน้า ops พักไว้ — js/opsAuto.js) แล้วตอบกลับให้ลูกค้าแก้
   "วันเดียวกัน" = วันที่ออกเดินทาง (ช่อง B) · ช่อง B ว่าง ใช้วันที่ได้รับไฟล์
   แต่ละ Delivery ใช้เลขล่าสุดที่ส่งมา — ลูกค้าส่งไฟล์ที่แก้แล้ว เลขซ้ำเดิมจะหายไปเอง
   กติกาเดียวกับ dupGroups() ใน js/opsAuto.js — แก้ที่หนึ่งต้องแก้อีกที่ด้วย */
var INV_RE = /^(?=.*\d{4})[A-Za-z0-9][A-Za-z0-9\-\/]{4,}$/;   /* เลข Invoice ทุกแบบ (8… · 3… · H…) — กติกาเดียวกับ isInvoiceNo() ใน js/xlsxImport.js · 31 ต.ค. */

function dupDay_(serviceDate, at) {
  if (serviceDate) return String(serviceDate);
  if (at instanceof Date) return Utilities.formatDate(at, 'Asia/Bangkok', 'yyyy-MM-dd');
  return String(at || '').slice(0, 10);
}

/**
 * ตรวจเลขบิลซ้ำของไฟล์ใหม่ เทียบกับแถวที่อยู่ในแท็บแล้ว (ยังไม่รวมไฟล์นี้)
 * @return {string} ข้อความตอบกลับใน LINE · '' = ไม่มีเลขซ้ำ
 */
function dupInvoiceText_(rows, meta) {
  var stampDay = Utilities.formatDate(meta.receivedAt || new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  var days = {};
  rows.forEach(function (r) { days[dupDay_(r.serviceDate, stampDay)] = 1; });

  /* เลขล่าสุดของแต่ละ Delivery ในวันที่ไฟล์นี้เกี่ยวข้อง — แถวเก่าในแท็บก่อน แล้วไฟล์นี้ทับ */
  var latest = {};                                      /* day|delivery → แถว */
  var ssId = (typeof SHEET_ID !== 'undefined' && SHEET_ID) ? SHEET_ID : 'REPLACE_WITH_YOUR_SHEET_ID';
  var sh = SpreadsheetApp.openById(ssId).getSheetByName(JOBS_TAB);
  if (sh && sh.getLastRow() > 1) {
    var v = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(13, sh.getMaxColumns())).getValues();
    for (var i = 0; i < v.length; i++) {
      var sd = v[i][12] instanceof Date ? Utilities.formatDate(v[i][12], 'Asia/Bangkok', 'yyyy-MM-dd') : normHeader2_(v[i][12]);
      var day = dupDay_(sd, v[i][0]);
      var del = normHeader2_(v[i][3]);
      if (!days[day] || !del) continue;
      var at = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], 'Asia/Bangkok', 'HH:mm') : String(v[i][0] || '').slice(11, 16);
      latest[day + '|' + del] = { day: day, delivery: del, invoice: normHeader2_(v[i][4]), customer: normHeader2_(v[i][5]),
        destName: normHeader2_(v[i][6]), weight: normHeader2_(v[i][7]), amount: normHeader2_(v[i][8]),
        shipmentNo: normHeader2_(v[i][10]), from: 'ไฟล์ "' + normHeader2_(v[i][1]) + '" ที่ส่งเมื่อ ' + at + ' น.' };
    }
  }
  rows.forEach(function (r) {
    if (!r.delivery) return;                            /* แถวที่มีแค่ Invoice ไม่นับ — กติกาเดียวกับ dupGroups() ใน js/opsAuto.js */
    var day = dupDay_(r.serviceDate, stampDay);
    latest[day + '|' + r.delivery] = { day: day, delivery: r.delivery, invoice: r.invoice, customer: r.customer,
      destName: r.destName, weight: r.weight, amount: r.amount, shipmentNo: r.shipmentNo,
      from: 'ไฟล์นี้ ชีต "' + r.sheet + '" แถว ' + r.rowNo, mine: true };
  });

  /* จับกลุ่มตามวัน + เลขบิล — เลขเดียวกันแต่คนละ Delivery = ซ้ำ */
  var groups = {};
  Object.keys(latest).forEach(function (k) {
    var r = latest[k];
    if (!INV_RE.test(r.invoice)) return;
    var g = r.day + '|' + r.invoice;
    (groups[g] = groups[g] || []).push(r);
  });
  var bad = Object.keys(groups).map(function (g) { return groups[g]; })
    .filter(function (list) { return list.length > 1 && list.some(function (r) { return r.mine; }); });
  if (!bad.length) return '';

  var lines = ['⚠️ พบเลขบิล (Invoice) ซ้ำ ' + bad.length + ' เลข',
               'ระบบรับทุกแถวแล้ว (บิลหลังได้เลขต่อท้าย -2) — ถ้าไม่ใช่งานส่งใหม่ กรุณาแก้เลขในไฟล์ แล้วส่งไฟล์มาใหม่', ''];
  bad.slice(0, 15).forEach(function (list) {
    lines.push('เลขบิล ' + list[0].invoice + ' (วันที่ ' + list[0].day + ') ซ้ำ ' + list.length + ' แถว:');
    list.forEach(function (r, i) {
      lines.push((i + 1) + ') ' + r.from);
      lines.push('   Delivery ' + r.delivery + (r.shipmentNo ? ' · Shipment ' + r.shipmentNo : ''));
      lines.push('   ' + [r.customer, r.destName].filter(function (t) { return t; }).join(' / '));
      lines.push('   น้ำหนัก ' + (r.weight || '-') + ' · Amount ' + (r.amount || '-'));
    });
    lines.push('');
  });
  if (bad.length > 15) lines.push('…และอีก ' + (bad.length - 15) + ' เลข');
  console.log('เลขบิลซ้ำ ' + bad.length + ' เลข ในไฟล์ ' + meta.fileName);
  return lines.join('\n').trim();
}

/* ================= ทดสอบโดยไม่ต้องใช้ LINE ================== */

/**
 * ลองตรวจฟอร์แมทโดยไม่ต้องยุ่งกับ LINE
 *   วิธีง่ายสุด: เอาไฟล์ .xlsx ใส่ในโฟลเดอร์ที่ตั้งไว้ใน DRIVE_FOLDER_ID
 *   แล้วรันฟังก์ชันนี้ — มันจะหยิบไฟล์ .xlsx ที่ใหม่ที่สุดในโฟลเดอร์นั้นมาตรวจให้
 *   ถ้าอยากเจาะจงไฟล์ ใส่ ID ลงในตัวแปร FILE_ID
 */
function testWithDriveFile() {
  var FILE_ID = '';                       /* เว้นว่างไว้ = หยิบไฟล์ล่าสุดในโฟลเดอร์ให้เอง */

  var file = null;
  if (FILE_ID) {
    try {
      file = DriveApp.getFileById(FILE_ID);
    } catch (err) {
      throw new Error('เปิดไฟล์ตาม FILE_ID ไม่ได้ — ตรวจว่าคัดลอก ID มาถูกไหม (' + err + ')');
    }
  } else {
    var folderId = prop_('DRIVE_FOLDER_ID');
    if (!folderId) {
      throw new Error('ยังไม่ได้ตั้ง DRIVE_FOLDER_ID และไม่ได้ใส่ FILE_ID — ' +
                      'ตั้งค่าอย่างใดอย่างหนึ่งก่อน แล้วค่อยรันใหม่');
    }
    var newest = null;
    var it = DriveApp.getFolderById(folderId).getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (!/\.xlsx$/i.test(f.getName())) continue;
      if (!newest || f.getDateCreated() > newest.getDateCreated()) newest = f;
    }
    if (!newest) {
      throw new Error('ไม่มีไฟล์ .xlsx ในโฟลเดอร์นั้นเลย — ' +
                      'เอาไฟล์ตัวอย่างใส่เข้าไปก่อนแล้วรันใหม่');
    }
    file = newest;
  }

  console.log('ตรวจไฟล์: ' + file.getName());
  var res = checkFormat_(file.getBlob());
  console.log('ชีตที่ไล่ดู: ' + (res.sheets || []).join(', '));
  if (res.ok) {
    console.log('✓ ผ่าน — ชีต "' + res.sheet + '" ตรง ' + res.matched + '/' + res.total + ' ช่อง');
  } else {
    console.log('✗ ไม่ผ่าน');
    console.log(mismatchMessage_(file.getName(), res));
  }
  return res;
}

/**
 * ทางสำรองสำหรับเก็บโทเคน ถ้าไม่อยากพิมพ์ในหน้า Project settings
 *   1. วางโทเคนแทนข้อความในบรรทัด TOKEN ข้างล่าง
 *   2. เลือกฟังก์ชันนี้แล้วกด "เรียกใช้" หนึ่งครั้ง
 *   3. *** ลบโทเคนออกจากบรรทัดนั้นทันที แล้วกดบันทึก ***
 *      ไม่งั้นโทเคนจะค้างอยู่ในโค้ด ใครเปิดโปรเจกต์ก็เห็น
 * ทางหลักคือหน้า การตั้งค่าโปรเจ็กต์ → คุณสมบัติสคริปต์ ซึ่งปลอดภัยกว่า
 */
function saveLineToken() {
  var TOKEN = 'วางโทเคนตรงนี้ชั่วคราว';
  if (!TOKEN || TOKEN.indexOf('วางโทเคน') === 0) {
    throw new Error('ยังไม่ได้วางโทเคนในตัวแปร TOKEN ของฟังก์ชันนี้');
  }
  PropertiesService.getScriptProperties().setProperty('LINE_CHANNEL_ACCESS_TOKEN', TOKEN);
  console.log('บันทึกโทเคนลง Script properties แล้ว — ลบโทเคนออกจากโค้ดได้เลย');
}

/** เช็กว่าตั้งค่าครบหรือยัง ก่อนไปต่อ (ไม่แสดงตัวโทเคน แสดงแค่ว่ามีหรือไม่) */
function checkSetup() {
  var token = prop_('LINE_CHANNEL_ACCESS_TOKEN');
  var folder = prop_('DRIVE_FOLDER_ID');
  console.log('LINE_CHANNEL_ACCESS_TOKEN: ' + (token ? 'ตั้งแล้ว (' + token.length + ' ตัวอักษร)' : 'ยังไม่ได้ตั้ง'));
  console.log('DRIVE_FOLDER_ID: ' + (folder || 'ยังไม่ได้ตั้ง — ไฟล์ที่ผ่านจะไม่ถูกเก็บลง Drive'));
  if (folder) {
    try {
      console.log('โฟลเดอร์ที่จะเก็บไฟล์: ' + DriveApp.getFolderById(folder).getName());
    } catch (err) {
      console.error('เปิดโฟลเดอร์นั้นไม่ได้ — ตรวจ ID อีกที: ' + err);
    }
  }
}
