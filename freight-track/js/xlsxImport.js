/* ============================================================
   xlsxImport.js — อ่านไฟล์ Excel ของลูกค้าแล้วแปลงเป็นใบงาน

   ไฟล์จริงที่ใช้ออกแบบ: "ขาว_อัพเดตเลขที่บิล ตัวอย่าง กลาง+ตะวันออก14.09.2026.xlsx"
   หัวคอลัมน์ที่เจอ (แถว 1) — A ถึง Q และช่อง X ที่แอดมินจะเติมชื่อคนขับเอง

     A Shipment No.      B วันที่ออกเดินทาง   C ผู้จัดส่ง        D ทะเบียนรถ
     E No.               F Invoice           G Delivery        H ชื่อลูกค้า
     I ชื่อสถานที่จัดส่ง   J ที่อยู่ฯ           K ที่อยู่ฯ 1        L ที่อยู่ฯ 2
     M น้ำหนัก           N จำนวนยา          O จำนวนน้ำเกลือ/อื่น ๆ
     P Amount            Q Remark           X คนขับ (คั่นด้วย ,)

   หนึ่งแถว = หนึ่งใบงาน · ช่อง A ใช้จัดกลุ่มว่าใบไหนไปด้วยรถเที่ยวเดียวกัน

   *** คอลัมน์กุญแจเปลี่ยนได้ ***
   ไฟล์ชุดนี้เลขอ้างอิงอยู่ที่ G แต่ไฟล์ชุดอื่นอยู่ที่ K
   จึงไม่ฝังตายในโค้ด ให้เลือกจากหน้าจอได้ทุกช่อง

   *** ไฟล์ "เหลือง" (หน้าลูกค้า) — หนึ่งแถว = หนึ่งรายการสินค้า ***
   ไฟล์ที่ลูกค้าอัปโหลดจริงคือ "เหลือง_SM ..." เลขกุญแจคือ Sales Number (ขึ้นต้นด้วย 5)
   ซึ่งไฟล์ "ขาว" เรียกช่องเดียวกันว่า Delivery
     · แถวที่มีเลข 5 = หัวของกลุ่ม แถวถัดไปที่ช่องว่างใช้เลข 5 ล่าสุดข้างบน
     · ใต้เลข 5 เดียวกันมีได้หลายปลายทาง → แยกเป็นจุดส่งตามปลายทาง (เลข 5 เดียวกัน)
     · เลขจุดส่ง = Invoice ถ้ามี ไม่มีก็ใช้เลข 5 ไปก่อน (เลขชั่วคราว)
       แล้วไฟล์ขาวที่หน้า ops จะ sync เลข Invoice + Shipment No. มาทับทีหลัง
     · หนึ่งชีต = หนึ่งเที่ยว
   ============================================================ */

/* ---------- โหลดตัวอ่าน xlsx จาก CDN แบบ lazy -------------- */
let libPromise = null;
export function loadXLSX(){
  if (libPromise) return libPromise;
  libPromise = (async () => {
    const urls = [
      'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm',
    ];
    let last = null;
    for (const u of urls){
      try { return await import(u); } catch (e){ last = e; }
    }
    libPromise = null;   /* ให้ลองใหม่ได้ ไม่ค้างสถานะพัง */
    throw new Error('โหลดตัวอ่านไฟล์ Excel ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง');
  })();
  return libPromise;
}

/* ---------- ตัวช่วยเรื่องคอลัมน์ ---------------------------- */
/** 'A'→0  'R'→17 */
export function colIndex(letter){
  let n = 0;
  for (const ch of String(letter || '').toUpperCase()){
    if (ch < 'A' || ch > 'Z') return -1;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}
/** 0→'A' */
export function colLetter(i){
  let n = i + 1, s = '';
  while (n > 0){ const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = (n - r - 1) / 26; }
  return s;
}

/** ผังคอลัมน์ตั้งต้น ตรงกับไฟล์ที่ลูกค้าส่งมา */
export const DEFAULT_MAP = {
  shipment:  'A',   // Shipment No. — จัดกลุ่มเป็น "เที่ยว" หนึ่งเที่ยวหนึ่งงาน
  date:      'B',
  carrier:   'C',
  vehicle:   'D',
  seq:       'E',
  invoice:   'F',
  delivery:  'G',
  customer:  'H',
  destName:  'I',
  addr1:     'J',
  addr2:     'K',
  addr3:     'L',
  weight:    'M',
  qtyMed:    'N',
  qtyOther:  'O',
  amount:    'P',
  remark:    'Q',
  drivers:   'X',   // ชื่อคนขับ — แอดมินเติมเอง คั่นหลายชื่อด้วย ,
  item:      '',    // รายการสินค้า (ไฟล์เหลือง) — ไม่มีตัวอักษรตั้งต้น ต้องเจอจากหัวตาราง
  qty:       '',
  unit:      '',
};

/** ชื่อไทยของแต่ละช่อง ใช้โชว์ในหน้าตั้งค่าผัง */
export const FIELD_LABELS = {
  shipment: 'Shipment No. (ไฟล์ขาวจะ sync ทับทีหลัง)',
  date:     'วันที่ออกเดินทาง',
  carrier:  'ผู้จัดส่ง',
  vehicle:  'ทะเบียนรถ',
  seq:      'ลำดับในเที่ยว (ใช้ต่อท้ายเลขชั่วคราว)',
  invoice:  'Invoice — เลขจุดส่ง (ถ้ามี)',
  delivery: 'Sales Number / Delivery (เลข 5…) — หัวกลุ่ม และเลขจับคู่ตอน sync',
  customer: 'ชื่อลูกค้า',
  destName: 'ชื่อสถานที่จัดส่ง',
  addr1:    'ที่อยู่ บรรทัด 1',
  addr2:    'ที่อยู่ บรรทัด 2',
  addr3:    'ที่อยู่ บรรทัด 3',
  weight:   'น้ำหนัก (กก.)',
  qtyMed:   'จำนวนยา',
  qtyOther: 'จำนวนน้ำเกลือ/อื่น ๆ',
  amount:   'Amount (มูลค่า)',
  remark:   'Remark',
  drivers:  'คนขับ (คั่นด้วย ,)',
  item:     'รายการสินค้า (Material Description)',
  qty:      'จำนวนสินค้า (Sales Qty)',
  unit:     'หน่วย (Sales Unit)',
};

/* ---------- อ่านไฟล์ --------------------------------------- */
/** @returns {Promise<{wb:object, sheets:string[]}>} */
export async function readWorkbook(file){
  return readWorkbookBuffer(await file.arrayBuffer());
}

/** อ่านจาก ArrayBuffer ตรง ๆ — ใช้ตอนกู้ไฟล์ที่เก็บไว้กลับมาหลังหน้าเว็บรีโหลด */
export async function readWorkbookBuffer(buf){
  const XLSX = await loadXLSX();
  const wb = XLSX.read(buf, { type:'array', cellDates:false, raw:true });
  if (!wb.SheetNames?.length) throw new Error('ไฟล์นี้ไม่มีชีตข้อมูล');
  return { wb, sheets: wb.SheetNames.slice() };
}

/** แปลงชีตเป็นตาราง 2 มิติ ช่องว่างเป็น '' ไม่ใช่ undefined */
export async function sheetGrid(wb, sheetName){
  const XLSX = await loadXLSX();
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('ไม่พบชีต ' + sheetName);
  /* blankrows:true — ต้องเก็บแถวว่างไว้ ไม่งั้นเลขแถวเลื่อน โชว์ "แถวที่ ..." ผิด
     และเขียนช่องคนขับกลับลงไฟล์ผิดแถว ตัวอ่านข้ามแถวว่างเองอยู่แล้ว */
  return XLSX.utils.sheet_to_json(ws, { header:1, blankrows:true, defval:'', raw:true });
}

/* ---------- แปลงค่า ---------------------------------------- */
const txt = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function num(v){
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** รับได้ทั้ง "15/09/2026", "2026-09-15" และเลข serial ของ Excel — คืน yyyy-mm-dd */
export function toISODate(v){
  if (v == null || v === '') return '';

  if (typeof v === 'number' && v > 0){          /* serial ของ Excel นับจาก 30 ธ.ค. 1899 */
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  const s = txt(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return fix(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);   /* dd/mm/yyyy */
  if (m) return fix(+m[3], +m[2], +m[1]);

  return '';

  function fix(y, mo, d){
    if (y > 2400) y -= 543;                     /* เผลอใส่ พ.ศ. มา */
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
  }
}

/** "สมชาย พูลทรัพย์, วิเชียร ,อนุชา" → ['สมชาย พูลทรัพย์','วิเชียร','อนุชา'] */
export function splitDrivers(v){
  return txt(v)
    .split(/[,،;|/]+/)          /* เผื่อแอดมินใช้ตัวคั่นอื่นปนมา */
    .map(x => x.trim())
    .filter(Boolean);
}

/* ---------- แปลงตารางเป็นใบงาน ------------------------------ */
/** 5370147525 → true · เลขกุญแจของไฟล์ทั้งสองแบบขึ้นต้นด้วย 5 เสมอ */
export const isSalesNo = (v) => /^5\d{5,}$/.test(txt(v));

/** เลข Invoice จริงต้องเป็นรหัส เช่น 8371064538 / H0000260901355
 *  ไฟล์จริงมีคนพิมพ์ข้อความลงช่องนี้ด้วย ("เป็นบิลแล้ว") ซึ่งห้ามเอาไปเป็นเลขจุดส่ง */
export const isInvoiceNo = (v) => /^[A-Za-z0-9][A-Za-z0-9\-\/]{4,}$/.test(txt(v)) && /\d{4,}/.test(txt(v));

/* ---------- ช่วงงานในชีต: แถวที่มี "เริ่ม" … แถวที่มี "จบ" ----------
   หาทั้งแถว คอลัมน์ไหนก็ได้ (พนักงานไม่ได้ใส่ไว้คอลัมน์ A เสมอ) · ต้องเป็นคำนี้คำเดียวในช่อง
   อ่านเฉพาะแถวระหว่างสองคำนี้ (ไม่รวมแถวที่มีคำ) เช่น เริ่ม C87 · จบ A251 = อ่านแถว 88–250
   มีหลายช่วงในชีตเดียว = อ่านทุกช่วงรวมกัน
   ไม่เจอ เริ่ม · เริ่มแล้วไม่มี จบ · จบโดยไม่มี เริ่ม · เริ่มซ้ำก่อน จบ · สองคำอยู่แถวเดียวกัน = ไม่อ่านเลย แจ้งให้แก้ไฟล์ */
export const START_MARK = 'เริ่ม';
export const END_MARK = 'จบ';
/* "เริ่ม" พิมพ์วรรณยุกต์ก่อนสระ (เร่ิม) หน้าตาเหมือนกันแต่เป็นคนละตัวอักษร — จัดลำดับให้ตรงกันก่อนเทียบ */
const mark = (v) => txt(v).replace(/\u0E48\u0E34/g, '\u0E34\u0E48');

/**
 * @param {any[][]} grid      ตารางดิบจาก sheetGrid
 * @param {number}  headerRow แถวหัวตาราง (1 = แถวแรก) — หาคำต่อจากแถวนี้
 * @returns {{rows:number[], ranges:{from:number,to:number}[], error:string}}
 *          rows = ดัชนีแถวที่จะอ่าน (0 = แถวแรก) · ranges = เลขแถว Excel ที่อ่าน (ไว้แสดงผล)
 */
export function markedRanges(grid, headerRow){
  const ranges = [];
  let open = -1;                     /* ดัชนีแถว "เริ่ม" ที่ยังไม่เจอ "จบ" */
  const fail = (error) => ({ rows: [], ranges: [], error });
  let openCell = '';                 /* ช่องของ "เริ่ม" นั้น เช่น C87 — ไว้บอกในข้อความ */
  /** ช่องแรกในแถวที่เป็นคำนี้พอดี → 'C87' · ไม่มี → '' */
  const find = (row, r, word) => {
    const c = (row || []).findIndex(v => mark(v) === word);
    return c < 0 ? '' : `${colLetter(c)}${r + 1}`;
  };
  for (let r = headerRow; r < grid.length; r++){
    const s = find(grid[r], r, START_MARK);
    const e = find(grid[r], r, END_MARK);
    if (s && e) return fail(`เจอทั้ง "เริ่ม" (${s}) และ "จบ" (${e}) ในแถวเดียวกัน — แยกไว้คนละแถว`);
    if (s){
      if (open >= 0) return fail(`เจอ "เริ่ม" ซ้ำที่ ${s} ก่อนเจอ "จบ" ของ "เริ่ม" ที่ ${openCell}`);
      open = r; openCell = s;
    } else if (e){
      if (open < 0) return fail(`เจอ "จบ" ที่ ${e} โดยไม่มี "เริ่ม" อยู่ข้างบน`);
      ranges.push({ start: open, end: r });
      open = -1;
    }
  }
  if (open >= 0) return fail(`เจอ "เริ่ม" ที่ ${openCell} แต่ไม่เจอ "จบ" ข้างล่าง`);
  if (!ranges.length) return fail('ไม่เจอคำว่า "เริ่ม" ในชีตนี้ — ใส่ "เริ่ม" ไว้แถวเหนืองานแรก และ "จบ" ไว้แถวใต้งานสุดท้าย (คอลัมน์ไหนก็ได้)');
  const rows = [];
  for (const { start, end } of ranges) for (let r = start + 1; r < end; r++) rows.push(r);
  return { rows, ranges: ranges.map(({ start, end }) => ({ from: start + 2, to: end })), error: '' };
}

/* ---------- เที่ยวจากคอลัมน์ "จัดส่งโดย" ----------
   ในช่วง เริ่ม–จบ ลูกค้าเขียนชื่อรถ + วันส่งในวงเล็บ แทนการไฮไลต์สี เช่น "กลาง1 4ล้อ11คัน (17/10/69)"
   หนึ่งค่า = หนึ่งเที่ยว — ตรงกับ Shipment No. ในไฟล์ขาว 1:1 (เทียบไฟล์ 17–19 ต.ค. 2569)
   วันในวงเล็บ = วันส่ง ปีเป็น พ.ศ. (69 = 2569) · ปี 4 หลักรับทั้ง พ.ศ. และ ค.ศ. */
const TRIP_RE = /^(.*?)\s*\(\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*\)$/;
const pad2 = (n) => String(n).padStart(2, '0');
/** @returns {{name:string, date:string, code:string}} date = yyyy-mm-dd · ว่างถ้าไม่มีวงเล็บวันที่ หรือวันที่ไม่มีจริง */
export function parseTrip(v){
  const s = txt(v);
  const m = s.match(TRIP_RE);
  if (!m) return { name: s, date: '', code: '' };
  const name = m[1].trim();
  const d = Number(m[2]), mo = Number(m[3]);
  let y = Number(m[4]);
  if (y < 100) y += 2500;
  if (y > 2400) y -= 543;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return { name, date: '', code: '' };
  return { name, date: `${y}-${pad2(mo)}-${pad2(d)}`, code: `${name} (${m[2]}/${m[3]}/${m[4]})` };
}

/**
 * @param {any[][]} grid       ตารางดิบจาก sheetGrid
 * @param {object}  map        ผังคอลัมน์ (DEFAULT_MAP หรือที่ผู้ใช้ปรับ)
 * @param {number}  headerRow  แถวหัวตาราง (1 = แถวแรก) ใช้อ่านชื่อหัวตาราง
 *                             ข้อมูลอ่านเฉพาะช่วงแถว "เริ่ม" … "จบ" (markedRanges)
 * @param {object}  deps       { matchDriverName, codeExists, findShipments, sheet }
 *                             sheet = ชื่อชีต ใช้เป็นเลขเที่ยว (หนึ่งชีต = หนึ่งเที่ยว)
 * @returns {{drafts:object[], headers:string[], span:ReturnType<typeof markedRanges>}}
 */
export function buildDrafts(grid, map, headerRow, deps){
  const { matchDriverName, codeExists, findShipments = () => [], sheet = '' } = deps;
  const headers = (grid[headerRow - 1] || []).map(txt);
  const span = markedRanges(grid, headerRow);
  const at = (row, field) => {
    const i = colIndex(map[field]);
    return i < 0 ? '' : row[i];
  };

  /* ---- รอบแรก: ไล่แถว รวบเป็นจุดส่ง ----
     เลข 5 คือหัวกลุ่ม แถวที่ช่องเลข 5 ว่างใช้เลขล่าสุดข้างบน
     ใต้เลขเดียวกันถ้าปลายทางเปลี่ยน = อีกจุดส่ง (เลข 5 เดียวกัน) */
  const groups = [];
  const byKey = new Map();
  let curSales = '';
  let last = null;

  for (const r of span.rows){
    const row = grid[r] || [];
    if (!row.some(c => txt(c) !== '')) continue;        /* แถวว่างล้วน ข้าม */

    const own      = txt(at(row, 'delivery'));
    const invoice  = isInvoiceNo(at(row, 'invoice')) ? txt(at(row, 'invoice')) : '';
    const destName = txt(at(row, 'destName'));
    const customer = txt(at(row, 'customer'));
    const item     = txt(at(row, 'item'));
    /* แถวที่ไม่มีทั้งเลข ปลายทาง และสินค้า — แถวโน้ต/แถวรวมที่แทรกมา ข้าม */
    if (!own && !invoice && !destName && !customer && !item) continue;

    if (own) curSales = own;
    const place = destName || customer;
    /* แถวที่มี Invoice ของตัวเอง + ปลายทาง แต่ไม่มีเลข 5 = อีกบิล (เช่น บิลค้างที่ DC / งานซ่อม)
       แม้ร้านเดียวกับบิลข้างบนก็แยกจุด และไม่ยืมเลข 5 ของบิลข้างบน
       (31 ต.ค.: เคยรวมเป็นจุดเดียว → จุดได้ Invoice ของแถวนี้คู่กับเลข 5 ของอีกใบ ไฟล์อัพเดตเลขที่บิลเลยขึ้นว่าเลขไม่ตรง) */
    const loose = !own && !!invoice && !!place && invoice !== last?.inv;
    const sales = loose ? '' : (own || curSales);

    /* แถวที่ไม่มีปลายทางเลย หรือ Invoice เดียวกับจุดก่อนหน้า (บางไฟล์ใส่ Invoice ซ้ำทุกแถวสินค้า) เป็นรายการต่อของจุดก่อนหน้า */
    let g = null;
    if (!own && last && (!place || (invoice && invoice === last.inv))) g = last;
    else {
      const key = `${sales}|${place}|${sales ? '' : invoice}`;
      g = byKey.get(key);
      if (!g){
        g = { key, sales, rows: [], firstRow: r };
        byKey.set(key, g);
        groups.push(g);
      }
    }
    g.rows.push(row);
    if (invoice && !g.inv) g.inv = invoice;
    last = g;
  }

  const drafts = [];
  const first = (rows, field) => {
    for (const row of rows){ const v = txt(at(row, field)); if (v) return v; }
    return '';
  };
  const firstInvoice = (rows) => {
    for (const row of rows){ if (isInvoiceNo(at(row, 'invoice'))) return txt(at(row, 'invoice')); }
    return '';
  };

  const sum = (rows, field) => rows.reduce((a, row) => a + num(at(row, field)), 0);

  groups.forEach((g, gi) => {
    const rows = g.rows;
    const r = g.firstRow;
    const delivery = g.sales;
    const invoice  = firstInvoice(rows);
    const invNote  = invoice ? '' : first(rows, 'invoice');   /* ข้อความที่พิมพ์ไว้ในช่อง Invoice */
    const shipNo   = first(rows, 'shipment');
    /* เที่ยว + วันส่ง จากคอลัมน์ "จัดส่งโดย" (parseTrip) — ไม่ใช้วันที่ในคอลัมน์ "ประจำวันที่" แล้ว
       เพราะนั่นคือวันของบิล (ย้อนไปได้หลายสัปดาห์) ไม่ใช่วันส่ง */
    const tripRaw  = first(rows, 'carrier');
    const trip     = parseTrip(tripRaw);
    const serviceDate = trip.date;
    const jobCode  = trip.code;
    const seq      = String(gi + 1);

    /* กฎเลขจุดส่ง — Invoice มาก่อนเสมอ ยังไม่มีก็ใช้เลข 5 ไปก่อน
       ไฟล์ขาวที่หน้า ops จะเปลี่ยนเป็นเลข Invoice ให้เอง (จับคู่ด้วยเลข 5) */
    const code = invoice || delivery;
    const provisional = !invoice && !!code;
    const destName = first(rows, 'destName');
    const customer = first(rows, 'customer') || destName;   /* บางแถวกรอกแค่สถานที่ส่ง */
    const address  = ['addr1', 'addr2', 'addr3'].map(f => first(rows, f)).filter(Boolean).join(' ');

    /* น้ำหนักรวมอยู่แถวหัวกลุ่ม บางไฟล์อยู่รายแถว — รวมทุกแถวได้ถูกทั้งสองแบบ */
    const weight  = sum(rows, 'weight');
    const amount  = sum(rows, 'amount');
    const qtyMed  = sum(rows, 'qtyMed');
    const qtyOth  = sum(rows, 'qtyOther');
    const remark  = [first(rows, 'remark'), invNote].filter(Boolean).join(' · ');

    const items = rows.map(row => ({
      desc: txt(at(row, 'item')),
      qty:  num(at(row, 'qty')),
      unit: txt(at(row, 'unit')),
    })).filter(x => x.desc);

    const parts = [];
    if (items.length) parts.push(items.map(x => `${x.desc}${x.qty ? ` ×${x.qty}${x.unit ? ' ' + x.unit : ''}` : ''}`).join(' · '));
    if (qtyMed) parts.push(`ยา ${qtyMed} รายการ`);
    if (qtyOth) parts.push(`น้ำเกลือ/อื่น ๆ ${qtyOth} รายการ`);
    if (remark) parts.push(remark);
    const cargoDesc = parts.join(' · ') || `สินค้าตามบิล ${invoice || delivery || '—'}`;

    /* ---- จับคู่ชื่อคนขับจากช่องคนขับ ---- */
    const rawDriverText = first(rows, 'drivers');
    const names = splitDrivers(rawDriverText);
    const drivers = names.map(name => {
      const m = matchDriverName(name);
      return { raw: name, status: m.status, driver: m.driver || null, matches: m.matches || [] };
    });

    /* ---- ตรวจความพร้อม ---- */
    const errors = [];
    const warns  = [];
    if (!code) errors.push(`ไม่มีทั้งเลข Sales Number/Delivery (${map.delivery || '—'}) และ Invoice (${map.invoice || '—'})`);
    if (!tripRaw) errors.push(`ช่องจัดส่งโดย (${map.carrier || '—'}) ว่าง — ไม่รู้ว่าอยู่เที่ยวไหน`);
    else if (!jobCode) errors.push(`ช่องจัดส่งโดย "${tripRaw}" ไม่มีวันส่งในวงเล็บ (หรือวันที่ไม่มีจริง) — ต้องเป็นแบบ "กลาง1 4ล้อ11คัน (17/10/69)"`);
    if (!customer) errors.push('ไม่มีชื่อลูกค้า');
    if (!destName && !address) errors.push('ไม่มีทั้งชื่อและที่อยู่ปลายทาง');

    if (delivery && !isSalesNo(delivery)) warns.push(`เลข ${delivery} ไม่ได้ขึ้นต้นด้วย 5 — ตรวจผังคอลัมน์ Sales Number อีกที`);
    if (!delivery && invoice) warns.push('ไม่มีเลข 5 — sync กับไฟล์ขาวไม่ได้ ใช้เลข Invoice เลย');
    if (!weight) warns.push('ไม่มีน้ำหนัก');
    if (!address) warns.push('ไม่มีที่อยู่ปลายทาง');
    drivers.forEach(d => {
      if (d.status === 'none')      warns.push(`ไม่พบคนขับชื่อ "${d.raw}" ในระบบ`);
      if (d.status === 'ambiguous') warns.push(`ชื่อ "${d.raw}" ตรงกับคนขับหลายคน ต้องเลือกเอง`);
      if (d.status === 'partial')   warns.push(`"${d.raw}" เดาว่าเป็น ${d.driver.name} — ตรวจอีกที`);
    });

    drafts.push({
      rowNo: r + 1,
      rowCount: rows.length,
      code, baseCode: code, invoice, delivery, jobCode, provisional,
      /* ข้อความดิบในช่องคนขับตอนอัปโหลด + ลายเซ็นว่าใครเป็นใคร
         ใช้เทียบตอนกดนำเข้าว่าแอดมินเพิ่ม/เปลี่ยนคนขับในเว็บไปจากไฟล์หรือยัง */
      rawDriverText,
      baseline: drivers.map(x => x.driver ? x.driver.id : '?' + x.raw),
      shipmentNo: shipNo,
      sheet,
      vehicle:    first(rows, 'vehicle') || trip.name,   /* ไม่มีช่องทะเบียน — ใช้ชื่อรถหน้าวงเล็บ เช่น "กลาง1 4ล้อ11คัน" */
      carrier:    first(rows, 'carrier'),
      seq,
      serviceDate,
      customer, destName, address,
      weight, amount, cargoDesc, remark, items,
      drivers,
      errors, warns,
      ok: errors.length === 0,
      include: errors.length === 0,     /* ติ๊กไว้ให้เลย แถวที่พังจะติ๊กไม่ได้ */
    });
  });

  /* ---- เลขซ้ำในไฟล์เดียวกัน: ต่อท้าย -1 -2 -3 ตามลำดับแถว ----
     ทุกใบที่ซ้ำได้เลขต่อท้ายหมด รวมใบแรก จะได้ดูเป็นชุดเดียวกัน
     ไม่ใช่ใบแรกเลขเปล่าแล้วใบหลังมีหาง ซึ่งอ่านแล้วงงว่าคนละบิลกัน */
  const tally = new Map();
  drafts.forEach(d => {
    if (!d.baseCode) return;
    const k = d.baseCode.toUpperCase();
    tally.set(k, (tally.get(k) || 0) + 1);
  });

  const running = new Map();
  const used = new Set();          /* เลขที่แถวก่อนหน้าในไฟล์นี้จองไปแล้ว */
  drafts.forEach(d => {
    if (!d.baseCode) return;
    const k = d.baseCode.toUpperCase();
    if (tally.get(k) > 1){
      const n = (running.get(k) || 0) + 1;
      running.set(k, n);
      d.code = `${d.baseCode}-${n}`;
      d.splitOf = d.baseCode;
      d.splitNo = n;
      d.splitTotal = tally.get(k);
      d.warns.push(`เลข ${d.baseCode} มี ${tally.get(k)} ใบในไฟล์นี้ — ใบนี้เป็นใบที่ ${n} จึงใช้เลข ${d.code}`);
    }
    /* เช็คชนกับของที่มีในระบบ
       31 ต.ค.: เลขบิลซ้ำนำเข้าได้ (ส่งไม่สำเร็จแล้วส่งใหม่ด้วย Invoice เดิม · Delivery ใหม่) → เลขต่อท้ายที่ยังว่าง + เตือน
       ห้ามเฉพาะอัปไฟล์เดิมซ้ำ = Delivery นี้ (ไม่มีเลข 5 ใช้เลขบิล) มีในระบบแล้ว "วันส่งเดียวกัน"
       2 พ.ย.: ส่งใหม่บางทีใช้ทั้ง Invoice และ Delivery เดิม ต่างแค่วันในวงเล็บช่องจัดส่งโดย → วันต่าง = งานส่งใหม่ นำเข้าได้
       บิลเก่าที่ไม่มีวันส่ง ถือว่าวันเดียวกัน (ห้ามไว้ก่อน) */
    const base = d.splitOf || d.baseCode;
    const del = txt(d.delivery);
    const sameDay = (v) => !d.serviceDate || !v.serviceDate || v.serviceDate === d.serviceDate;
    const prev = del ? findShipments(del).filter(v => txt(v.delivery) === del)
      : findShipments(base).filter(v => !txt(v.delivery));
    const mine = prev.filter(sameDay);
    if (mine.length) d.errors.push(del ? `Delivery ${del} นำเข้าแล้ว (บิล ${mine[0].code})` : `เลข ${mine[0].code} มีอยู่ในระบบแล้ว`);
    else {
      const was = d.code;
      if (codeExists(d.code) || used.has(d.code.toUpperCase())){
        let n = 2;
        while (codeExists(`${base}-${n}`) || used.has(`${base}-${n}`.toUpperCase())) n++;
        d.code = `${base}-${n}`;
        d.splitOf = base;
      }
      const twins = [...new Map([...findShipments(base), ...prev].map(v => [v.id, v])).values()]
        .filter(v => txt(v.delivery) !== del || !del || !sameDay(v));
      if (twins.length){
        d.reused = base;
        d.warns.push(`เลขบิล ${base} ซ้ำกับบิลในระบบ (${twins.slice(0, 3).map(v => v.code).join(', ')}) — งานส่งใหม่? นำเข้าได้ และติดป้ายเลขบิลซ้ำ${d.code !== was ? ` · ใช้เลข ${d.code}` : ''}`);
      }
    }
    used.add(d.code.toUpperCase());
    d.ok = d.errors.length === 0;
    d.include = d.ok;
  });

  return { drafts, headers, span };
}

/** รวม draft เป็น "เที่ยว" ตามเลข Shipment No. — หนึ่งเที่ยวคือหนึ่งงาน
 *  @returns {{code:string, vehicle:string, carrier:string, serviceDate:string,
 *             drivers:object[], stops:object[], weightKg:number, amount:number, dests:number}[]} */
/** ป้ายกลุ่มของแถวที่ไม่มีเลขเที่ยวในไฟล์ */
export const NO_TRIP = '(ไม่มีเลขเที่ยวในไฟล์)';

export function groupJobs(drafts){
  const map = new Map();
  for (const d of drafts){
    /* แถวที่ช่องเลขเที่ยวว่างจริง ๆ (เช่น แถวโน้ตที่แทรกมาในไฟล์) รวบไว้กลุ่มเดียว
       ไม่งั้นจะแตกเป็นเที่ยวละแถวเต็มตาราง ซึ่งอ่านยากและไม่มีประโยชน์
       แถวพวกนี้ถูกกันไม่ให้นำเข้าอยู่แล้วตั้งแต่ตอนตรวจ */
    const k = d.jobCode || NO_TRIP;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(d);
  }
  return [...map.entries()].map(([code, stops]) => {
    stops.sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0));
    const head = stops[0];
    /* คนขับเป็นของทั้งเที่ยว — เอาชุดแรกที่กรอกมาในกลุ่มนี้ */
    const withDrv = stops.find(x => x.drivers.length) || head;
    return {
      code,
      vehicle: head.vehicle, carrier: head.carrier,
      serviceDate: head.serviceDate,
      drivers: withDrv.drivers,
      stops,
      weightKg: stops.reduce((a, x) => a + x.weight, 0),
      amount:   stops.reduce((a, x) => a + x.amount, 0),
      dests: new Set(stops.map(x => x.destName).filter(Boolean)).size,
    };
  });
}

/** รวมจุดส่งเป็นงานตามเลข 5 — ใช้ตอนกดนำเข้า (หนึ่งเลข 5 = หนึ่งงานในหน้า ops)
 *  ตารางตรวจทานยังจัดตามชีตด้วย groupJobs เพราะอ่านง่ายกว่า
 *  พอไฟล์ขาวเข้ามา งานพวกนี้จะถูกรวมใหม่ตาม Shipment No. */
export function groupBySales(drafts){
  const map = new Map();
  for (const d of drafts){
    const k = d.delivery || d.code;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(d);
  }
  return [...map.entries()].map(([code, stops]) => {
    const head = stops[0];
    return {
      code, stops,
      vehicle: head.vehicle || head.carrier, carrier: head.carrier,
      serviceDate: head.serviceDate,
    };
  });
}

/** แปลง draft หนึ่งแถวเป็น payload ของ createShipment (หนึ่งจุดส่ง) */
export function draftToPayload(d, warehouse, jobId){
  return {
    jobId,
    seq: Number(d.seq) || 0,
    delivery: d.delivery,
    code: d.code,
    baseCode: d.splitOf || '',
    customer: { name: d.customer, contact:'', phone:'' },
    pickup:   { name: warehouse },
    dropoff:  { name: d.destName || d.address, address: d.address || d.destName, contact:'', phone:'' },
    cargo:    { desc: d.cargoDesc, pieces: d.items?.length || 0, unit: d.items?.length ? 'รายการ' : '',
                weightKg: d.weight, note: d.remark },
    invoice:  { number: d.invoice || d.code, amount: d.amount, fileName:'', kind:'', dataUrl:null },
    serviceDate: d.serviceDate,
    driverIds: d.drivers.map(x => x.driver?.id).filter(Boolean),
    byRole: 'ops',
    byName: 'นำเข้าจาก Excel',
    note: `จุดส่งที่ ${d.seq || '—'} ของเที่ยว ${d.jobCode || '—'}${d.provisional ? ' · ใช้เลข Sales Number ไปก่อน รอ Invoice' : ''}`,
    source: {
      kind: 'excel',
      rowNo: d.rowNo,
      sheet: d.sheet || '',
      /* เลข Shipment ในไฟล์เหลืองไม่ตรงกับไฟล์ขาว (ทั้งชีตมักใช้เลขเดียว) เก็บไว้ดูเฉย ๆ
         source.shipmentNo ว่างไว้ ให้ไฟล์ขาวที่หน้า ops ใส่ Shipment No. จริง แล้วค่อยรวมงานตามเลขนั้น */
      fileShipmentNo: d.shipmentNo,
      shipmentNo: '',
      vehicle: d.vehicle,
      carrier: d.carrier,
      seq: d.seq,
      /* กลุ่มจากช่องจัดส่งโดย เช่น "กลาง1 4ล้อ11คัน (17/10/69)" — ย้ายไปงานเลข 7 แล้วงานนั้นยังอยู่ใต้กลุ่มนี้ (store.js regroupStop) */
      tripGroup: d.jobCode || '',
      invoice: d.invoice,
      delivery: d.delivery,
      driverNames: d.drivers.map(x => x.raw),
      /* คนขับที่ระบุในไฟล์ของจุดนี้จริง ๆ (ก่อนเติมคนขับทั้งเที่ยวให้จุดที่ว่าง) — จดไว้เฉย ๆ เผื่อใช้ทีหลัง */
      excelDriverIds: d.drivers.map(x => x.driver?.id).filter(Boolean),
      provisional: d.provisional,
      items: d.items || [],
    },
  };
}


/* ---------- เทียบกับไฟล์ต้นฉบับ แล้วเขียนกลับ ---------------- */

/** ลายเซ็นคนขับปัจจุบันของแถว — id ถ้าจับคู่ได้ ไม่ได้ก็ '?ชื่อดิบ' */
const sigOf = (d) => d.drivers.map(x => x.driver ? x.driver.id : '?' + x.raw);

/** แถวนี้คนขับต่างไปจากตอนอ่านไฟล์ไหม (เพิ่ม ลบ หรือเพิ่งจับคู่ได้) */
export function driversChanged(d){
  const now = sigOf(d), was = d.baseline || [];
  return now.length !== was.length || now.some((v, i) => v !== was[i]);
}

/** ข้อความที่ควรอยู่ในช่องคนขับ — ใช้ชื่อเต็มเสมอ รอบหน้าจะได้จับคู่ตรงเป๊ะ */
export function driverTextOf(d){
  return d.drivers.map(x => x.driver ? x.driver.name : x.raw).filter(Boolean).join(', ');
}

/**
 * สร้างไฟล์ Excel ชุดใหม่จากไฟล์เดิม โดยอัปเดตเฉพาะช่องคนขับ
 * ชีตอื่นและคอลัมน์อื่นคงเดิมทั้งหมด
 * @returns {Promise<Blob>}
 */
export async function buildUpdatedFile(wb, sheetName, drafts, map, headerRow){
  const XLSX = await loadXLSX();
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('ไม่พบชีต ' + sheetName);

  /* ไม่ได้ระบุช่องคนขับ (ไฟล์ยังไม่มีหัว "คนขับ") = เปิดคอลัมน์ใหม่ต่อท้ายคอลัมน์สุดท้ายของชีต
     ห้ามถอยไปใช้ตัวอักษรตายตัว — เคยถอยไป R ซึ่งในไฟล์ SM คือ Sales Qty แล้วชื่อคนขับไปทับจำนวนสินค้า */
  const c = map.drivers
    ? colIndex(map.drivers)
    : (ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.c + 1 : 0);
  if (c < 0) throw new Error('ยังไม่ได้ระบุคอลัมน์คนขับในผังคอลัมน์');

  /* เติมหัวคอลัมน์ให้ด้วย เผื่อชีตนั้นยังไม่มีช่องคนขับมาก่อน */
  XLSX.utils.sheet_add_aoa(ws, [['คนขับ']], { origin: { r: headerRow - 1, c } });
  drafts.forEach(d => {
    XLSX.utils.sheet_add_aoa(ws, [[driverTextOf(d)]], { origin: { r: d.rowNo - 1, c } });
  });

  const out = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  return new Blob([out], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- เดาผังคอลัมน์จากหัวตาราง ------------------------ */
/* ยึดตัวอักษรคอลัมน์ตายตัวไม่ได้ เพราะไฟล์แต่ละชุดคอลัมน์ไม่ตรงกัน
   (ลูกค้าบอกเองว่าไฟล์อื่นเลขอ้างอิงไปอยู่ช่อง K)
   จึงอ่านจากชื่อหัวตารางเป็นหลัก แล้วค่อยให้ผู้ใช้แก้ทีหลังถ้าเดาพลาด */
const HEADER_HINTS = {
  shipment: [/^shipment\s*(no|number)/i, /เลขที่?เที่ยว/, /^shipment$/i],
  date:     [/วันที่ออกเดินทาง/, /ประจำวันที่/, /^date$/i],
  carrier:  [/ผู้จัดส่ง/, /จัดส่งโดย/],
  vehicle:  [/ทะเบียนรถ/, /^truck/i, /^car/i],
  seq:      [/^no\.?$/i, /^item\s*no/i, /^ลำดับ/],
  invoice:  [/^invoice/i, /ใบแจ้งหนี้/],   /* "Invoice" (ขาว) · "Invoice No." (เหลือง) */
  delivery: [/^delivery/i, /^sales\s*number/i, /^do\b/i],   /* เลข 5 — ขาวเรียก Delivery เหลืองเรียก Sales Number */
  customer: [/ชื่อลูกค้า/, /ผู้สั่งสินค้า/],
  destName: [/ชื่อสถานที่จัดส่ง/, /^สถานที่จัดส่ง/],
  addr1:    [/^ที่อยู่สถานที่จัดส่ง$/],
  addr2:    [/^ที่อยู่สถานที่จัดส่ง\s*1$/],
  addr3:    [/^ที่อยู่สถานที่จัดส่ง\s*2$/, /อำเภอ\/จังหวัด/],
  weight:   [/น้ำหนัก/, /^weight/i],
  qtyMed:   [/จำนวนยา/],
  qtyOther: [/จำนวนน้ำเกลือ/],
  amount:   [/^amount$/i, /มูลค่า/],
  remark:   [/^remark/i, /หมายเหตุ/, /^sales\s*note/i],
  drivers:  [/^คนขับ/, /^driver/i],
  item:     [/material\s*desc/i, /รายการสินค้า/, /^description$/i],
  qty:      [/^sales\s*qty/i, /^qty$/i],
  unit:     [/^sales\s*unit/i, /^unit$/i],
};

/**
 * เดาผังจากแถวหัวตาราง — ช่องไหนเดาไม่ได้ปล่อยว่าง ให้ผู้ใช้เลือกเอง
 * @param {any[]} headerRowCells แถวหัวตาราง (array ของค่าในเซลล์)
 * @returns {{map:object, matched:string[], missing:string[]}}
 */
export function autoMap(headerRowCells){
  const cells = (headerRowCells || []).map(v => String(v ?? '').replace(/\s+/g, ' ').trim());
  const map = {};
  const used = new Set();

  for (const [field, pats] of Object.entries(HEADER_HINTS)){
    for (const pat of pats){
      const i = cells.findIndex((h, idx) => h && !used.has(idx) && pat.test(h));
      if (i >= 0){ map[field] = colLetter(i); used.add(i); break; }
    }
  }

  const missing = Object.keys(FIELD_LABELS).filter(k => !map[k]);
  return { map, matched: Object.keys(map), missing };
}
