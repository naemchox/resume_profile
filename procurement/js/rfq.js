// ใบขอราคา (RFQ) — ใช้ร่วมกันระหว่าง pr.html (ตอนออกเลข) กับ print/rfq.html (ตอนพิมพ์)
//
// ทำไมต้องแยกไฟล์: ค่า hash ที่เก็บใน rfq_prints ต้องมาจาก "เนื้อเดียวกัน" กับที่พิมพ์ออกไป
// ถ้าปล่อยให้สองหน้าประกอบข้อความกันเอง วันหนึ่งจะเพี้ยนกัน แล้ว hash พิสูจน์อะไรไม่ได้เลย
import { sb } from './supabase.js';
import { el } from './ui.js';
import { fmtQty } from './money.js';
import { fmtDate } from './i18n.js';

const un = ({ data, error }) => { if (error) throw error; return data; };

// ดึงทุกอย่างที่ใบขอราคาต้องใช้ ในรูปแบบเดียวกันเสมอ
export async function loadRfqData(prId, vendorId) {
  const [company, pr, lines, sow, clauses, vendor] = await Promise.all([
    sb.from('company_profile').select('*').eq('id', 1).maybeSingle().then(un),
    sb.from('prs').select('*').eq('id', prId).maybeSingle().then(un),
    sb.from('pr_lines').select('*').eq('pr_id', prId).order('seq').then(un),
    sb.from('pr_sow').select('*').eq('pr_id', prId).then(un),
    sb.from('sow_clauses').select('*').eq('active', true).order('seq').then(un),
    vendorId ? sb.from('vendors').select('*').eq('id', vendorId).maybeSingle().then(un) : null,
  ]);

  const byClause = new Map(sow.map((s) => [s.sow_clause_id, s]));
  return {
    company, pr, lines, vendor,
    sow: clauses.map((c) => ({ ...c, requirement_th: byClause.get(c.id)?.requirement_th ?? '' })),
  };
}

// ข้อความมาตรฐานที่เอาไปทำ hash — ห้ามเปลี่ยนรูปแบบนี้หลังส่งมอบ
// เพราะใบเก่าที่ออกไปแล้วจะตรวจสอบย้อนหลังไม่ได้
export function rfqCanonicalText(d) {
  const rows = d.lines.map((l) =>
    ['L', l.seq, l.description ?? '', l.spec ?? '', l.qty ?? '', l.unit ?? ''].join('|'));
  const sow = d.sow.map((c) => ['S', c.code, c.requirement_th ?? ''].join('|'));
  return [
    ['RFQ', d.pr.pr_no ?? '', d.vendor?.id ?? ''].join('|'),
    ...rows, ...sow,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// ชิ้นส่วนเล็กๆ ของหน้ากระดาษ
// ---------------------------------------------------------------------------

// จำนวนแถวว่างขั้นต่ำในตารางรายการ — ให้ใบดูเป็นแบบฟอร์ม ไม่ใช่ตารางลอยกลางหน้า
const MIN_ITEM_ROWS = 8;

// เส้นประให้ผู้ขายเขียนด้วยมือ
const fill = (w) => el('span', { class: 'fill', style: w ? `min-width:${w}` : null });

// ช่องติ๊ก
const chk = (label) => el('span', {}, el('span', { class: 'chk' }), label ? ' ' + label : null);

// หัวตารางสองภาษา
const th2 = (thai, eng, w) =>
  el('th', { style: w ? `width:${w}` : null }, thai, eng ? el('i', {}, eng) : null);

// แถวข้อมูลในกล่องขวาบน — ไม่มีค่าก็เว้นเส้นประไว้ให้เขียนมือ ดีกว่าขีด —
const idRow = (label, val) => el('tr', {},
  el('td', {}, label),
  el('td', {}, val ? el('b', {}, val) : el('span', { style: 'display:flex' }, fill('20mm'))));

// แถวข้อมูลในกล่องคู่
const kv = (label, val) => el('tr', {}, el('td', {}, label), el('td', {}, val || '—'));

// แถวที่เว้นไว้ให้เขียนด้วยมือ
const kvBlank = (label) => el('tr', {},
  el('td', {}, label),
  el('td', {}, el('span', { style: 'display:flex' }, fill())));

// ---------------------------------------------------------------------------
// หน้ากระดาษ A4 — ใช้คลาสจาก css/print.css ทั้งหมด ไม่ประดิษฐ์สไตล์ใหม่
// meta: { hash, printedAt, issuerName, dueDate }  (ส่งสตริงมาเฉยๆ = ถือว่าเป็น hash)
// ---------------------------------------------------------------------------
export function rfqSheet(d, meta = {}) {
  if (typeof meta === 'string') meta = { hash: meta };
  const c = d.company ?? {};
  const v = d.vendor ?? {};
  const pr = d.pr ?? {};

  // เลขที่ใบขอราคาไม่ได้เก็บในฐานข้อมูล — อิงเลขใบขอซื้อ (เติมรหัสผู้ขายเฉพาะใบที่เจาะจงเจ้า)
  const docNo = [pr.pr_no, v.code].filter(Boolean).join(' / ') || '—';
  const issued = meta.printedAt ?? new Date();

  // ---- หัวกระดาษ: บริษัทเรา + กล่องชื่อเอกสาร ----
  const head = el('div', { class: 'doc-head' },
    el('div', { class: 'org' },
      c.logo_path ? el('img', { class: 'logo', src: c.logo_path, alt: '' }) : null,
      el('div', {},
        el('div', { class: 'nm' }, c.name_th ?? ''),
        c.name_en ? el('div', { class: 'en' }, c.name_en) : null,
        el('small', {}, c.address_th ?? ''),
        el('small', {}, [c.phone && ('โทร. ' + c.phone), c.email].filter(Boolean).join('   ')),
        el('small', {}, c.tax_id
          ? `เลขประจำตัวผู้เสียภาษี ${c.tax_id}   สาขา ${c.branch ?? '00000'}` : ''))),
    el('div', { class: 'idbox' },
      el('div', { class: 'band' },
        el('b', {}, 'ใบขอเสนอราคา'),
        el('i', {}, 'REQUEST FOR QUOTATION')),
      el('table', {}, el('tbody', {},
        idRow('เลขที่ / No.', docNo),
        idRow('วันที่ / Date', fmtDate(issued)),
        idRow('ยื่นภายใน / Due', meta.dueDate ? fmtDate(meta.dueDate) : null)))));

  // ---- ผู้ขาย + ข้อมูลใบขอซื้อ ----
  // ใบที่ไม่เจาะจงผู้ขาย (v ว่าง) เว้นช่องเป็นเส้นประให้เขียนชื่อเอง
  // ใบเดียวจึงถ่ายสำเนาส่งได้ทุกเจ้า โดยยังมีที่ให้ระบุว่าใบนี้ส่งใคร
  const supplier = v.name_th
    ? el('div', { class: 'bd' },
        el('div', { class: 'nm' }, v.name_th),
        v.address_th ? el('div', {}, v.address_th) : null,
        el('table', {}, el('tbody', {},
          v.contact_name ? kv('ผู้ติดต่อ / Contact', v.contact_name) : null,
          v.phone ? kv('โทรศัพท์ / Tel.', v.phone) : null,
          v.email ? kv('อีเมล / Email', v.email) : null,
          v.tax_id ? kv('เลขผู้เสียภาษี / Tax ID', v.tax_id) : null)))
    : el('div', { class: 'bd' },
        el('table', {}, el('tbody', {},
          kvBlank('ชื่อผู้ขาย / Supplier'),
          kvBlank('ที่อยู่ / Address'),
          kvBlank('ผู้ติดต่อ / Contact'),
          kvBlank('โทรศัพท์ / Tel.'))));

  const info = el('div', { class: 'info' },
    el('div', {},
      el('h4', {}, 'เรียน ผู้ขาย ', el('span', {}, '/ TO SUPPLIER')),
      supplier),
    el('div', {},
      el('h4', {}, 'รายละเอียดการขอซื้อ ', el('span', {}, '/ REQUISITION DETAIL')),
      el('div', { class: 'bd' },
        el('table', {}, el('tbody', {},
          kv('เลขที่ใบขอซื้อ / PR No.', pr.pr_no ?? '—'),
          kv('วันที่ออก / Date', fmtDate(issued)),
          kv('ต้องการใช้ / Required', fmtDate(pr.needed_by) || '—'),
          kv('ผู้ออกเอกสาร / Issued by', meta.issuerName || '—'),
          kv('ฝ่าย / Department', 'ฝ่ายจัดซื้อ  Purchasing'))))));

  const subject = el('div', { class: 'subject' },
    el('b', {}, 'เรื่อง / Subject :'), el('span', {}, pr.purpose_th ?? '—'));

  // ---- ตารางรายการ: ช่องราคาเว้นว่างให้ผู้ขายกรอก เราไม่ส่งราคาประเมินของเราออกไป ----
  const blanks = Math.max(0, MIN_ITEM_ROWS - d.lines.length);
  const items = el('table', { class: 'doc' },
    el('thead', {}, el('tr', {},
      th2('ลำดับ', 'No.', '11mm'),
      th2('รายละเอียด', 'Description'),
      th2('จำนวน', 'Quantity', '20mm'),
      th2('หน่วย', 'Unit', '16mm'),
      th2('ราคา/หน่วย', 'Unit Price', '26mm'),
      th2('จำนวนเงิน', 'Amount', '30mm'))),
    el('tbody', {},
      ...d.lines.map((l) => el('tr', {},
        el('td', { class: 'c' }, String(l.seq)),
        el('td', {}, el('b', {}, l.description ?? ''),
          l.spec ? el('div', { class: 'spec' }, l.spec) : null),
        el('td', { class: 'n' }, fmtQty(l.qty)),
        el('td', { class: 'c' }, l.unit ?? ''),
        el('td', { class: 'n' }, ''),
        el('td', { class: 'n' }, ''))),
      ...Array.from({ length: blanks }, (_, i) => el('tr', { class: 'blank' },
        el('td', { class: 'c' }, String(d.lines.length + i + 1)),
        el('td', {}), el('td', {}), el('td', {}), el('td', {}), el('td', {})))));

  // ---- สรุปยอด: เว้นว่างทั้งหมด ผู้ขายเป็นคนกรอก ----
  const totRow = (thai, eng, cls) => el('tr', { class: cls || null },
    el('td', {}, thai, el('i', {}, eng)), el('td', {}, ''));

  const sum = el('div', { class: 'sum' },
    el('div', { class: 'left' },
      el('div', { class: 'cap' }, 'จำนวนเงิน (ตัวอักษร) / Amount in words'),
      el('div', { style: 'display:flex' }, fill()),
      el('div', { style: 'display:flex;margin-top:2.5mm' }, fill()),
      el('div', { class: 'opts' },
        chk('ราคารวม VAT แล้ว / VAT included'),
        chk('ราคายังไม่รวม VAT / VAT excluded'))),
    el('table', { class: 'tot' }, el('tbody', {},
      totRow('รวมเป็นเงิน', 'Subtotal'),
      totRow('ส่วนลด', 'Discount'),
      totRow('ยอดหลังหักส่วนลด', 'After discount'),
      totRow('ภาษีมูลค่าเพิ่ม 7%', 'VAT 7%'),
      totRow('ยอดรวมทั้งสิ้น', 'Grand total (THB)', 'grand'))));

  // ---- เงื่อนไขที่ผู้ขายต้องระบุ ----
  const termBox = (thai, eng) => el('div', {},
    el('label', {}, thai, ' ', el('i', {}, '/ ' + eng)), fill());

  const terms = el('div', { class: 'terms' },
    termBox('ราคานี้ใช้ได้ถึงวันที่', 'Price valid until'),
    termBox('กำหนดส่งมอบ', 'Delivery period'),
    termBox('เงื่อนไขการชำระเงิน', 'Payment terms'),
    termBox('ระยะเวลารับประกัน', 'Warranty'));

  // ---- Scope of Work: ติ๊กรับ/ไม่รับรายข้อ ----
  const sowTable = el('table', { class: 'doc' },
    el('thead', {}, el('tr', {},
      th2('ข้อ', 'No.', '11mm'),
      th2('เงื่อนไขที่บริษัทฯ กำหนด', 'Required condition'),
      th2('รับ', 'Accept', '15mm'),
      th2('ไม่รับ', 'Reject', '15mm'))),
    el('tbody', {}, ...d.sow.map((s) => el('tr', { class: 'keep' },
      el('td', { class: 'c' }, String(s.seq)),
      el('td', {}, el('b', {}, s.title_th ?? ''),
        el('div', { class: 'spec' }, s.requirement_th || '—')),
      el('td', { class: 'tick' }, chk()),
      el('td', { class: 'tick' }, chk())))));

  const notes = el('ol', { class: 'notes keep' },
    el('li', {}, 'กรุณากรอกราคาต่อหน่วยและจำนวนเงินให้ครบทุกรายการ พร้อมลงนามและประทับตราบริษัท'),
    el('li', {}, 'ระบุให้ชัดเจนว่าราคาที่เสนอรวมหรือไม่รวมภาษีมูลค่าเพิ่ม'),
    el('li', {}, 'เงื่อนไขข้อใดที่ติ๊ก “ไม่รับ” กรุณาระบุเหตุผลและข้อเสนอทดแทน — ข้อที่ไม่รับถือว่าไม่ผ่านเกณฑ์พิจารณา'),
    el('li', {}, 'เอกสารนี้เป็นการขอเสนอราคาเท่านั้น ยังไม่ถือเป็นการสั่งซื้อ จนกว่าผู้ขายจะได้รับใบสั่งซื้อ (PO) จากบริษัทฯ'),
    el('li', {}, 'ส่งใบเสนอราคากลับมาที่ฝ่ายจัดซื้อ'
      + (c.email ? ` อีเมล ${c.email}` : '')
      + (c.phone ? ` โทร. ${c.phone}` : '')));

  const signs = el('div', { class: 'signs keep' },
    el('div', {},
      el('h4', {}, 'ผู้เสนอราคา ', el('span', {}, '/ QUOTED BY')),
      el('div', { class: 'bd' },
        el('div', { class: 'line' }),
        el('small', {}, '( ........................................................ )'),
        el('small', {}, 'ตำแหน่ง ................................................'),
        el('small', {}, 'วันที่ ......... / ......... / .........'),
        el('div', { class: 'stamp' }, 'ประทับตราบริษัท (ถ้ามี)'))),
    el('div', {},
      el('h4', {}, 'ผู้ออกใบขอราคา ', el('span', {}, '/ ISSUED BY')),
      el('div', { class: 'bd' },
        el('div', { class: 'line' }),
        el('small', {}, `( ${meta.issuerName || '........................................................'} )`),
        el('small', {}, 'ฝ่ายจัดซื้อ  Purchasing'),
        el('small', {}, 'วันที่ ' + fmtDate(issued)))));

  return el('div', { class: 'sheet' },
    head,
    el('div', { class: 'rule' }),
    info,
    subject,
    el('div', { class: 'sec' }, 'รายการที่ขอเสนอราคา ', el('i', {}, 'ITEMS'),
      el('span', { class: 'hint' }, 'ช่องราคาเว้นไว้ให้ผู้ขายกรอก')),
    items,
    sum,
    el('div', { class: 'sec' }, 'เงื่อนไขที่ผู้ขายเสนอ ', el('i', {}, "SUPPLIER'S TERMS")),
    terms,
    el('div', { class: 'page2' },
      el('div', { class: 'cont' },
        el('b', {}, 'ใบขอเสนอราคา เลขที่ ', docNo),
        v.name_th ? el('span', {}, v.name_th) : null,
        el('span', { class: 'r' }, '(ต่อ)')),
      el('div', { class: 'sec', style: 'margin-top:0' }, 'ขอบเขตงานและเงื่อนไข ',
        el('i', {}, 'SCOPE OF WORK'),
        el('span', { class: 'hint' }, 'กรุณาติ๊กให้ครบทุกข้อ')),
      sowTable,
      notes,
      signs),
    el('div', { class: 'footnote' },
      el('div', { class: 'vh' }, 'รหัสตรวจสอบเอกสาร ', el('code', {}, meta.hash ?? '—')),
      el('div', { class: 'why' },
        'ใบนี้ออกจากระบบจัดซื้อ หากรหัสตรวจสอบไม่ตรงกับที่ระบบบันทึกไว้ ถือว่าเอกสารถูกแก้ไข')));
}
