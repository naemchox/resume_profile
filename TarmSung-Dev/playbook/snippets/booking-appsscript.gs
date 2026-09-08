/* =============================================================================
   booking-appsscript.gs — หลังบ้านของฟอร์มจอง (ชั้น 2)
   วิธีใช้ (ทำครั้งเดียวต่อลูกค้า 1 ราย · ต้องล็อกอิน Google ของ "เจ้าของร้าน" ไม่ใช่ของเรา)

   1. สร้าง Google Sheet ใหม่ → เมนู Extensions → Apps Script
   2. ลบโค้ดเดิม วางไฟล์นี้ทั้งไฟล์ → แก้ NOTIFY_EMAIL เป็นอีเมลร้าน
   3. Deploy → New deployment → ประเภท "Web app"
      · Execute as: Me   · Who has access: **Anyone**  (ต้องเป็น Anyone ไม่งั้นฟอร์มส่งไม่ได้)
   4. ก๊อป URL ที่ลงท้าย /exec ไปใส่ data-endpoint="" ในฟอร์มของหน้านั้น
   5. ทดสอบจองจริง 1 ครั้ง ต้องเห็นแถวใหม่ในชีต + อีเมลเด้ง

   หมายเหตุที่ต้องรู้ ไม่ใช่ข้อเสียที่ซ่อนไว้
   - หน้าเว็บส่งแบบ no-cors จึงอ่านคำตอบจากสคริปต์นี้ไม่ได้ = หน้าเว็บรู้แค่ "ส่งออกไปแล้ว"
     ตัวยืนยันจริงคือแถวในชีตกับอีเมล ไม่ใช่ข้อความบนหน้าจอ
   - สคริปต์นี้ไม่เช็คโต๊ะว่าง ไม่กันจองชนเวลา = คนรับจองยังต้องดูเองเหมือนเดิม (ชั้น 3 คนละงาน)
   - เก็บชื่อ/เบอร์ = ข้อมูลส่วนบุคคล ต้องมีข้อความ PDPA บนหน้าและลบข้อมูลเก่าตามรอบที่ตกลงกับร้าน
   ========================================================================== */

var NOTIFY_EMAIL = "owner@example.com";   // อีเมลที่ให้เด้งเตือน
var SHEET_NAME   = "bookings";

function doPost(e) {
  var p = (e && e.parameter) || {};
  var sheet = _sheet_();
  var stamp = new Date();

  sheet.appendRow([
    stamp,
    p.name  || "", p.phone || "", p.people || "",
    p.date  || "", p.time  || "", p.zone || "", p.note || "",
    p.page  || ""
  ]);

  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      subject: "จองโต๊ะใหม่ " + (p.date || "") + " " + (p.time || "") + " · " + (p.people || "?") + " ท่าน",
      body: [
        "ชื่อ: "    + (p.name   || "-"),
        "เบอร์: "   + (p.phone  || "-"),
        "จำนวน: "   + (p.people || "-") + " ท่าน",
        "วันเวลา: " + (p.date   || "-") + " " + (p.time || "-"),
        "โซน: "     + (p.zone   || "ไม่เกี่ยง"),
        "โน้ต: "    + (p.note   || "-"),
        "",
        "ส่งจากหน้า: " + (p.page || "-"),
        "เวลาส่ง: "    + stamp
      ].join("\n")
    });
  } catch (err) {
    /* อีเมลพังต้องไม่ทำให้การจองหาย — แถวลงชีตไปแล้วก่อนถึงบรรทัดนี้ */
    _sheet_().getRange(_sheet_().getLastRow(), 10).setValue("mail-failed: " + err);
  }

  return ContentService.createTextOutput("ok");
}

function doGet() { return ContentService.createTextOutput("booking endpoint ok"); }

function _sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["เวลาที่ส่ง", "ชื่อ", "เบอร์", "จำนวน", "วันที่", "เวลา", "โซน", "โน้ต", "หน้า", "หมายเหตุระบบ"]);
    sh.setFrozenRows(1);
  }
  return sh;
}
