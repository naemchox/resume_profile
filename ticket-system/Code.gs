/**
 * Ticket System by New-Gen — Google Apps Script backend
 *
 * วิธีใช้ (ละเอียดใน SETUP.md):
 *   1. เปิดชีต → Extensions → Apps Script → วางไฟล์นี้ทับ Code.gs
 *   2. เลือกฟังก์ชัน setup แล้วกด Run (ครั้งแรกจะขอสิทธิ์) → ดู Execution log จะเห็นรหัสทีม
 *   3. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone
 *   4. คัดลอก URL ที่ลงท้าย /exec ไปใส่ใน index.html
 *
 * ค่าที่เก็บใน Project Settings → Script Properties:
 *   TEAM_PASSCODE    รหัสทีม (setup() สุ่มให้ครั้งแรก เปลี่ยนเองได้)
 *   LAST_TASK_NUM    เลข TIK ล่าสุด (ระบบจัดการเอง กันเลขซ้ำหลังลบงาน)
 */

const SHEET_ID = 'REPLACE_WITH_YOUR_SHEET_ID';

const SCHEMA = {
  Tasks: ['Task ID', 'Title', 'Description', 'Category', 'Priority', 'Status', 'Assignee',
          'Reporter', 'DueDate', 'CreatedAt', 'UpdatedAt', 'LastUpdatedBy'],
  Users: ['User ID', 'Name', 'Role', 'Email'],
  Comments: ['Comment ID', 'Task ID', 'Author', 'Message', 'Type', 'CreatedAt'],
};

const STATUSES = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const CATEGORIES = ['Bug', 'Feature', 'Support', 'Internal'];
const EDITABLE = ['Title', 'Description', 'Category', 'Priority', 'Status', 'Assignee', 'DueDate'];

/* ───────────────────────── setup (รันครั้งเดียว) ───────────────────────── */

function setup() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SCHEMA[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#C6FF3D').setFontColor('#111111');
    sh.setFrozenRows(1);
    // เก็บทุกช่องเป็นข้อความ กัน Sheets แปลงวันที่/ตัวเลขเอง
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@');
  });
  // ลบชีตเปล่าตั้งต้น (Sheet1 / ชีต1) ถ้ายังว่าง
  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TEAM_PASSCODE')) {
    props.setProperty('TEAM_PASSCODE', 'NG-' + Math.random().toString(36).slice(2, 8).toUpperCase());
  }
  Logger.log('เสร็จแล้ว ✅  รหัสทีมคือ: ' + props.getProperty('TEAM_PASSCODE'));
  Logger.log('ทีมลงทะเบียนชื่อเองได้จากหน้าเว็บ หรือจะพิมพ์ใส่ชีต Users เองก็ได้');
}

/* ───────────────────────── HTTP entry points ───────────────────────── */

function doGet() {
  return json_({ ok: true, service: 'Ticket System by New-Gen', time: new Date().toISOString() });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST' });
  }
  try {
    const passcode = PropertiesService.getScriptProperties().getProperty('TEAM_PASSCODE');
    if (!passcode || req.passcode !== passcode) return json_({ ok: false, error: 'UNAUTHORIZED' });

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const users = readAll_(ss, 'Users').filter(function (u) { return u.Name; });
    if (req.action === 'login') return json_({ ok: true, users: users });
    if (req.action === 'register') return json_(withLock_(function () { return register_(ss, req.payload || {}); }));

    const me = String(req.user || '');
    if (!users.some(function (u) { return u.Name === me; })) return json_({ ok: false, error: 'UNKNOWN_USER' });

    const p = req.payload || {};
    switch (req.action) {
      case 'list':        return json_({ ok: true, tasks: readAll_(ss, 'Tasks'), users: users, serverTime: new Date().toISOString() });
      case 'comments':    return json_({ ok: true, comments: commentsFor_(ss, p.taskId) });
      case 'createTask':  return json_(withLock_(function () { return createTask_(ss, me, p); }));
      case 'updateTask':  return json_(withLock_(function () { return updateTask_(ss, me, p); }));
      case 'deleteTask':  return json_(withLock_(function () { return deleteTask_(ss, p); }));
      case 'addComment':  return json_(withLock_(function () { return addComment_(ss, me, p); }));
      default:            return json_({ ok: false, error: 'UNKNOWN_ACTION' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'SERVER_ERROR', message: String(err && err.message || err) });
  }
}

/* ───────────────────────── actions ───────────────────────── */

function createTask_(ss, me, p) {
  const title = clean_(p.Title).slice(0, 200);
  if (!title) return { ok: false, error: 'TITLE_REQUIRED' };
  const sh = ss.getSheetByName('Tasks');
  const now = new Date().toISOString();
  const task = {
    'Task ID': nextTaskId_(sh),
    'Title': title,
    'Description': clean_(p.Description).slice(0, 20000),
    'Category': pick_(p.Category, CATEGORIES, 'Feature'),
    'Priority': pick_(p.Priority, PRIORITIES, 'Medium'),
    'Status': pick_(p.Status, STATUSES, 'To Do'),
    'Assignee': clean_(p.Assignee),
    'Reporter': me,
    'DueDate': cleanDate_(p.DueDate),
    'CreatedAt': now,
    'UpdatedAt': now,
    'LastUpdatedBy': me,
  };
  appendRow_(sh, 'Tasks', task);
  logActivity_(ss, task['Task ID'], me, 'สร้าง Ticket', now);
  return { ok: true, task: task };
}

function updateTask_(ss, me, p) {
  const sh = ss.getSheetByName('Tasks');
  const found = findRow_(sh, 'Tasks', p.taskId);
  if (!found) return { ok: false, error: 'NOT_FOUND' };
  const cur = found.obj;

  // กันแก้ทับกัน: ถ้ามีคนแก้ไปก่อนหลังจากเราโหลด ให้แจ้งกลับ
  if (p.expectedUpdatedAt && String(p.expectedUpdatedAt) !== String(cur.UpdatedAt)) {
    return { ok: false, error: 'CONFLICT', task: cur };
  }

  const changes = p.changes || {};
  const next = Object.assign({}, cur);
  const log = [];
  EDITABLE.forEach(function (f) {
    if (!(f in changes)) return;
    let v;
    if (f === 'Status') v = pick_(changes[f], STATUSES, cur[f]);
    else if (f === 'Priority') v = pick_(changes[f], PRIORITIES, cur[f]);
    else if (f === 'Category') v = pick_(changes[f], CATEGORIES, cur[f]);
    else if (f === 'DueDate') v = cleanDate_(changes[f]);
    else if (f === 'Title') v = clean_(changes[f]).slice(0, 200) || cur[f];
    else v = clean_(changes[f]);
    if (String(v) !== String(cur[f])) {
      next[f] = v;
      if (f === 'Description') log.push('แก้รายละเอียด');
      else log.push(f + ': ' + (cur[f] || '—') + ' → ' + (v || '—'));
    }
  });
  if (!log.length) return { ok: true, task: cur, unchanged: true };

  const now = new Date().toISOString();
  next.UpdatedAt = now;
  next.LastUpdatedBy = me;
  writeRow_(sh, 'Tasks', found.row, next);
  log.forEach(function (l) { logActivity_(ss, next['Task ID'], me, l, now); });
  return { ok: true, task: next };
}

/** คนใหม่ลงทะเบียนชื่อตัวเอง (ต้องมีรหัสทีมแล้ว) */
function register_(ss, p) {
  const name = clean_(p.Name).replace(/\s+/g, ' ').slice(0, 50);
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };
  const sh = ss.getSheetByName('Users');
  const users = readAll_(ss, 'Users');
  if (users.some(function (u) { return String(u.Name).trim().toLowerCase() === name.toLowerCase(); })) {
    return { ok: false, error: 'NAME_TAKEN' };
  }
  let max = 0;
  users.forEach(function (u) { const m = String(u['User ID']).match(/(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
  const user = {
    'User ID': 'U' + String(max + 1).padStart(2, '0'),
    'Name': name,
    'Role': clean_(p.Role).slice(0, 50),
    'Email': clean_(p.Email).slice(0, 100),
  };
  appendRow_(sh, 'Users', user);
  return { ok: true, user: user };
}

/** ลบงานถาวร พร้อมคอมเมนต์/ประวัติของงานนั้น (ทุกคนลบได้) */
function deleteTask_(ss, p) {
  const sh = ss.getSheetByName('Tasks');
  const found = findRow_(sh, 'Tasks', p.taskId);
  if (!found) return { ok: false, error: 'NOT_FOUND' };
  sh.deleteRow(found.row);

  const csh = ss.getSheetByName('Comments');
  const values = csh.getDataRange().getValues();
  const col = values[0].map(String).indexOf('Task ID');
  for (let i = values.length - 1; i >= 1; i--) {
    if (String(values[i][col]) === String(p.taskId)) csh.deleteRow(i + 1);
  }
  return { ok: true, taskId: String(p.taskId) };
}

function addComment_(ss, me, p) {
  const msg = clean_(p.message).slice(0, 5000);
  if (!msg) return { ok: false, error: 'EMPTY' };
  if (!findRow_(ss.getSheetByName('Tasks'), 'Tasks', p.taskId)) return { ok: false, error: 'NOT_FOUND' };
  const c = {
    'Comment ID': Utilities.getUuid().slice(0, 8),
    'Task ID': String(p.taskId),
    'Author': me,
    'Message': msg,
    'Type': 'comment',
    'CreatedAt': new Date().toISOString(),
  };
  appendRow_(ss.getSheetByName('Comments'), 'Comments', c);
  return { ok: true, comment: c };
}

/* ───────────────────────── sheet helpers ───────────────────────── */

function readAll_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต ' + name + ' — รัน setup() ก่อน');
  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  const tz = ss.getSpreadsheetTimeZone();
  return values.slice(1)
    .filter(function (r) { return r.some(function (c) { return c !== ''; }); })
    .map(function (r) {
      const o = {};
      headers.forEach(function (h, i) { if (h) o[h] = norm_(r[i], h, tz); });
      return o;
    });
}

function commentsFor_(ss, taskId) {
  return readAll_(ss, 'Comments').filter(function (c) { return c['Task ID'] === String(taskId); });
}

function findRow_(sh, name, taskId) {
  const values = sh.getDataRange().getValues();
  const headers = values[0].map(String);
  const idCol = headers.indexOf('Task ID');
  const tz = sh.getParent().getSpreadsheetTimeZone();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(taskId)) {
      const o = {};
      headers.forEach(function (h, j) { if (h) o[h] = norm_(values[i][j], h, tz); });
      return { row: i + 1, obj: o };
    }
  }
  return null;
}

function nextTaskId_(sh) {
  const values = sh.getDataRange().getValues();
  const idCol = values[0].map(String).indexOf('Task ID');
  const props = PropertiesService.getScriptProperties();
  let max = Number(props.getProperty('LAST_TASK_NUM') || 0);
  for (let i = 1; i < values.length; i++) {
    const m = String(values[i][idCol]).match(/^TIK-(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  }
  props.setProperty('LAST_TASK_NUM', String(max + 1));
  return 'TIK-' + String(max + 1).padStart(3, '0');
}

function appendRow_(sh, name, obj) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = sh.getLastRow() + 1;
  const range = sh.getRange(row, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([headers.map(function (h) { return safe_(obj[h]); })]);
}

function writeRow_(sh, name, row, obj) {
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const range = sh.getRange(row, 1, 1, headers.length);
  range.setNumberFormat('@');
  range.setValues([headers.map(function (h) { return safe_(obj[h]); })]);
}

function logActivity_(ss, taskId, me, text, when) {
  appendRow_(ss.getSheetByName('Comments'), 'Comments', {
    'Comment ID': Utilities.getUuid().slice(0, 8),
    'Task ID': taskId,
    'Author': me,
    'Message': text,
    'Type': 'activity',
    'CreatedAt': when,
  });
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'BUSY' };
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ───────────────────────── value helpers ───────────────────────── */

function norm_(v, header, tz) {
  if (v instanceof Date) {
    return header === 'DueDate' ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v.toISOString();
  }
  const s = v === null || v === undefined ? '' : String(v);
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s; // คู่กับ safe_()
}

function clean_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

function cleanDate_(v) {
  const s = clean_(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

function pick_(v, list, fallback) { return list.indexOf(v) >= 0 ? v : fallback; }

/** กันข้อความที่ขึ้นต้นด้วย = + - @ ถูกตีความเป็นสูตรใน Sheets */
function safe_(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

