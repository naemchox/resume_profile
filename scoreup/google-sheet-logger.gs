/**
 * TOEIC Prep Test → Google Sheet logger
 * ---------------------------------------------------------------
 * Appends one row per completed prep test to the results sheet.
 *
 * Sheet columns (row 1 headers, must be in this order):
 *   A Firstname | B Lastname | C Student ID |
 *   D Part 1 | E Part 2 | F Part 3 | G Part 4 | H Part 5 | I Part 6 | J Part 7 |
 *   K Listening | L Reading
 *
 * DEPLOY STEPS
 *  1. Open the target spreadsheet:
 *     https://docs.google.com/spreadsheets/d/1uRkKdnv8vz4CGAXjlP2MIdGIGUDIg8UOsPVj09CRtAA/edit
 *  2. Extensions ▸ Apps Script. Delete any sample code, paste this whole file, Save.
 *  3. Deploy ▸ New deployment ▸ (gear) Web app.
 *       - Description: TOEIC prep logger
 *       - Execute as: Me
 *       - Who has access: Anyone
 *     Click Deploy, authorize when prompted, and COPY the Web app URL (ends in /exec).
 *  4. Paste that URL into scoreup.html →  const PREP_SHEET_URL = "...";
 *
 * After changing this script later, use Deploy ▸ Manage deployments ▸ (edit) ▸
 * Version: New version, so the same /exec URL keeps working.
 */

var SHEET_ID = '1uRkKdnv8vz4CGAXjlP2MIdGIGUDIg8UOsPVj09CRtAA';

// Shared secret — must match PREP_SECRET in scoreup.html. Anyone who finds the /exec
// URL can POST to it ("Who has access: Anyone"), so we reject rows without the token
// to stop strangers from spamming junk into the results sheet. Change both to rotate.
var SECRET = 'REPLACE_WITH_YOUR_SECRET';

var LB_SHEET = 'Leaderboard';   // separate tab; headers: group | id | name | xp | best | league | updated

function jsonOut(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.secret !== SECRET) return jsonOut({ ok: false, error: 'unauthorized' });

    // ---- Group leaderboard: upsert this player's row (one row per group+id) ----
    if (d.type === 'leaderboard') {
      var ss = SpreadsheetApp.openById(SHEET_ID);
      var sh = ss.getSheetByName(LB_SHEET);
      if (!sh) { sh = ss.insertSheet(LB_SHEET); sh.appendRow(['group','id','name','xp','best','league','updated']); }
      var vals = sh.getDataRange().getValues();
      var row = -1;
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][0]) === String(d.group) && String(vals[i][1]) === String(d.id)) { row = i + 1; break; }
      }
      var rec = [ String(d.group||''), String(d.id||''), String(d.name||'').substring(0,24),
                  Number(d.xp)||0, Number(d.best)||0, String(d.league||''), new Date() ];
      if (row > 0) sh.getRange(row, 1, 1, rec.length).setValues([rec]);
      else sh.appendRow(rec);
      return jsonOut({ ok: true });
    }

    // ---- Default: prep-test result row ----
    var sheet = SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
    sheet.appendRow([
      d.firstname || '', d.lastname || '', d.studentId || '',
      d.part1, d.part2, d.part3, d.part4, d.part5, d.part6, d.part7,
      d.listening, d.reading
    ]);
    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  // ---- Group leaderboard read (JSONP, since Apps Script sends no CORS headers) ----
  if (p.type === 'leaderboard') {
    var payload;
    try {
      if (p.secret !== SECRET) { payload = { ok: false, error: 'unauthorized' }; }
      else {
        var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(LB_SHEET);
        var out = [];
        if (sh) {
          var vals = sh.getDataRange().getValues();
          for (var i = 1; i < vals.length; i++) {
            if (String(vals[i][0]) === String(p.group)) {
              out.push({ id: vals[i][1], name: vals[i][2], xp: Number(vals[i][3])||0, best: Number(vals[i][4])||0, league: vals[i][5] });
            }
          }
          out.sort(function (a, b) { return (b.xp||0) - (a.xp||0) || (b.best||0) - (a.best||0); });   // rank by XP (effort), best Mock breaks ties — newcomers can climb before their first mock
        }
        payload = { ok: true, rows: out.slice(0, 100) };
      }
    } catch (err) { payload = { ok: false, error: String(err) }; }
    var body = JSON.stringify(payload);
    if (p.callback) return ContentService.createTextOutput(p.callback + '(' + body + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('TOEIC logger is running.').setMimeType(ContentService.MimeType.TEXT);
}
