/**
 * ตามสั่ง (TarmSung) — contact form endpoint
 * Receives POSTs from the website and appends each lead as a row
 * in the Google Sheet, then returns JSON.
 *
 * DEPLOY (one time):
 *   1. Open your sheet → Extensions → Apps Script.
 *   2. Delete any starter code, paste THIS whole file, Save.
 *   3. Deploy → New deployment → type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4. Authorize when prompted (allow access to your spreadsheet).
 *   5. Copy the "Web app URL" (…/exec) and paste it into js/main.js -> ENDPOINT.
 *
 * The sheet id below is taken from the URL you shared.
 */

var SHEET_ID = '1O5V4dxEyeRcMFCx5phv1SzEljXSouu4VuRz3tEf9krg';
var SHEET_NAME = 'Leads'; // a tab named "Leads" is created automatically if missing
var HEADERS = ['เวลา', 'ชื่อ', 'อีเมล', 'เบอร์ / LINE', 'แพ็กเกจ', 'รายละเอียด', 'หน้าที่ส่ง'];
// Leave blank to mail whoever owns this script. Set an address to send elsewhere.
var NOTIFY_TO = '';

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000); // avoid two submits writing the same row

    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }

    // Honeypot: real users never fill this, bots fill everything. Silently drop
    // them — a bot told it failed just retries.
    // The field is ts_note, NOT company. The site deliberately avoided "company"
    // because browser autofill recognises that name and would fill it in for a
    // real person, who would then be dropped as a bot. This check was still
    // reading data.company, a key the form has never sent, so it matched nothing
    // and every bot submission would have landed in the sheet.
    if (data.ts_note) return json({ result: 'success' });

    // Nothing to act on and no way to reply: a direct POST, a half-finished
    // script, a probe. The sheet is a list of people to call back, so a row with
    // nobody in it is noise that makes the whole list look broken.
    if (!data.name && !data.email && !data.phone) return json({ result: 'success' });

    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    // Write a header row the first time.
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    sheet.appendRow([
      new Date(),
      data.name || '',
      data.email || '',
      data.phone || '',
      data.type || '',
      data.message || '',
      data.page || ''
    ]);

    // Mail after the row is written, and never let a mail failure lose a lead:
    // the sheet is the record, the mail is only the tap on the shoulder.
    notify(data);

    return json({ result: 'success' });
  } catch (err) {
    return json({ result: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * A lead sitting in a spreadsheet is a lead nobody has read. Someone who fills in
 * a form at 2am expects an answer before they have shopped elsewhere, so the row
 * gets a mail attached to it: everything needed to reply is in the body, and
 * replyTo is the customer, so hitting Reply on a phone goes straight to them.
 */
function notify(d) {
  try {
    var to = NOTIFY_TO || Session.getEffectiveUser().getEmail();
    if (!to) return;

    var name = d.name || '(ไม่ระบุชื่อ)';
    var rows = [
      ['ชื่อ', d.name],
      ['อีเมล', d.email],
      ['เบอร์ / LINE', d.phone],
      ['แพ็กเกจที่สนใจ', d.type],
      ['หน้าที่ส่งมา', d.page]
    ];

    var html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6">' +
      '<h2 style="margin:0 0 4px">ใบสั่งงานใหม่จากเว็บ</h2>' +
      '<p style="margin:0 0 16px;color:#666">' + esc(now()) + '</p>' +
      '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px">';
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i][1]) continue;
      html += '<tr>' +
        '<td style="padding:4px 16px 4px 0;color:#666;white-space:nowrap;vertical-align:top">' + esc(rows[i][0]) + '</td>' +
        '<td style="padding:4px 0"><b>' + esc(rows[i][1]) + '</b></td></tr>';
    }
    html += '</table>';
    if (d.message) {
      html += '<div style="padding:12px 16px;background:#f6f6f6;border-left:3px solid #f97316;white-space:pre-wrap">' +
        esc(d.message) + '</div>';
    }
    if (d.phone) {
      html += '<p style="margin:16px 0 0"><a href="tel:' + esc(d.phone) + '">โทรกลับ ' + esc(d.phone) + '</a></p>';
    }
    html += '</div>';

    var opts = { to: to, subject: 'ใบสั่งงานใหม่: ' + name, htmlBody: html, name: 'เว็บตามสั่ง' };
    // Reply goes to the customer, not into the void — but only if what they typed
    // actually looks like an address, or Gmail rejects the whole send.
    if (d.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) opts.replyTo = d.email;
    MailApp.sendEmail(opts);
  } catch (err) {
    // Out of daily mail quota, bad address, whatever: the row is already safe.
  }
}

function now() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'd/M/yyyy HH:mm');
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Lets you open the /exec URL in a browser to confirm the deployment is live.
function doGet() {
  return ContentService
    .createTextOutput('TarmSung form endpoint is live.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
