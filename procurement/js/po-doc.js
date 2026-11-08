// ใบสั่งซื้อ / สัญญาจ้าง — หน้ากระดาษ A4
//
// แยกเป็นโมดูลด้วยเหตุผลเดียวกับ rfq.js: เอกสารที่ส่งออกไปข้างนอกบริษัท
// ต้องประกอบจากที่เดียว ไม่งั้นวันหนึ่งฉบับบนจอกับฉบับที่พิมพ์จะเพี้ยนกัน
//
// ทุกอย่างอ่านจาก pos / po_lines / po_sow_snapshot ซึ่งเป็นภาพนิ่งตอนออกใบ
// แก้ใบขอซื้อหรือ SOW ต้นฉบับทีหลัง สัญญาฉบับนี้ต้องไม่ขยับตาม
import { sb } from './supabase.js';
import { el } from './ui.js';
import { fmt, fmtQty, pct, bahtText, applyBp } from './money.js';
import { fmtDate, pick } from './i18n.js';

const un = ({ data, error }) => { if (error) throw error; return data; };

export async function loadPoData(poId) {
  const po = await sb.from('pos').select('*').eq('id', poId).maybeSingle().then(un);
  if (!po) return null;
  const [company, vendor, lines, sow, pr, issuer] = await Promise.all([
    sb.from('company_profile').select('*').eq('id', 1).maybeSingle().then(un),
    sb.from('vendors').select('*').eq('id', po.vendor_id).maybeSingle().then(un),
    sb.from('po_lines').select('*').eq('po_id', poId).order('seq').then(un),
    sb.from('po_sow_snapshot').select('*').eq('po_id', poId).order('seq').then(un),
    sb.from('prs').select('pr_no, purpose_th, purpose_en, needed_by').eq('id', po.pr_id)
      .maybeSingle().then(un),
    po.issued_by
      ? sb.from('user_profiles').select('full_name_th, full_name_en')
          .eq('id', po.issued_by).maybeSingle().then(un)
      : null,
  ]);
  return { po, company, vendor, lines, sow, pr, issuer };
}

// จำนวนแถวว่างขั้นต่ำ ให้ใบดูเป็นแบบฟอร์มไม่ใช่ตารางลอยกลางหน้า
const MIN_ROWS = 8;

const kv = (label, val) => el('tr', {}, el('td', {}, label), el('td', {}, val || '—'));
const idRow = (label, val) => el('tr', {}, el('td', {}, label), el('td', {}, el('b', {}, val || '—')));
const th2 = (thai, eng, w) =>
  el('th', { style: w ? `width:${w}` : null }, thai, eng ? el('i', {}, eng) : null);
const totRow = (thai, eng, val, cls) => el('tr', { class: cls || null },
  el('td', {}, thai, el('i', {}, eng)), el('td', {}, val));
const term = (label, eng, val) => el('div', {},
  el('label', {}, label, el('i', {}, ' / ' + eng)), el('span', {}, val));

export function poSheet(d) {
  const { po, lines, sow } = d;
  const c = d.company ?? {};
  const v = d.vendor ?? {};
  const pr = d.pr ?? {};
  const retention = applyBp(po.subtotal, po.retention_bp);

  // ---- หัวกระดาษ ----
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
        el('b', {}, 'ใบสั่งซื้อ / สัญญาจ้าง'),
        el('i', {}, 'PURCHASE ORDER')),
      el('table', {}, el('tbody', {},
        idRow('เลขที่ / No.', po.po_no),
        idRow('วันที่ / Date', fmtDate(po.issued_at)),
        idRow('กำหนดส่งมอบ / Due', fmtDate(po.promised_date))))));

  // ---- คู่สัญญา ----
  const info = el('div', { class: 'info' },
    el('div', {},
      el('h4', {}, 'ผู้ซื้อ ', el('span', {}, '/ BUYER')),
      el('div', { class: 'bd' },
        el('div', { class: 'nm' }, c.name_th ?? '—'),
        c.address_th ? el('div', {}, c.address_th) : null,
        el('table', {}, el('tbody', {},
          c.tax_id ? kv('เลขผู้เสียภาษี / Tax ID', c.tax_id) : null,
          c.phone ? kv('โทรศัพท์ / Tel.', c.phone) : null)))),
    el('div', {},
      el('h4', {}, 'ผู้ขาย ', el('span', {}, '/ SELLER')),
      el('div', { class: 'bd' },
        el('div', { class: 'nm' }, v.name_th ?? '—'),
        v.address_th ? el('div', {}, v.address_th) : null,
        el('table', {}, el('tbody', {},
          v.tax_id ? kv('เลขผู้เสียภาษี / Tax ID', `${v.tax_id}   สาขา ${v.branch ?? '00000'}`) : null,
          v.contact_name ? kv('ผู้ติดต่อ / Contact', v.contact_name) : null,
          v.phone ? kv('โทรศัพท์ / Tel.', v.phone) : null)))));

  const subject = el('div', { class: 'subject' },
    el('b', {}, 'เรื่อง / Subject :'),
    el('span', {}, [pr.purpose_th, pr.pr_no && `(อ้างถึงใบขอซื้อเลขที่ ${pr.pr_no})`]
      .filter(Boolean).join('  ')));

  // ---- รายการ ----
  const blanks = Math.max(0, MIN_ROWS - lines.length);
  const items = el('table', { class: 'doc' },
    el('thead', {}, el('tr', {},
      th2('ลำดับ', 'No.', '11mm'),
      th2('รายละเอียด', 'Description'),
      th2('จำนวน', 'Quantity', '20mm'),
      th2('หน่วย', 'Unit', '16mm'),
      th2('ราคา/หน่วย', 'Unit Price', '26mm'),
      th2('จำนวนเงิน', 'Amount', '30mm'))),
    el('tbody', {},
      ...lines.map((l) => el('tr', {},
        el('td', { class: 'c' }, String(l.seq)),
        el('td', {}, el('b', {}, l.description ?? ''),
          l.spec ? el('div', { class: 'spec' }, l.spec) : null),
        el('td', { class: 'n' }, fmtQty(l.qty)),
        el('td', { class: 'c' }, l.unit ?? ''),
        el('td', { class: 'n' }, fmt(l.unit_price)),
        el('td', { class: 'n' }, fmt(l.amount)))),
      ...Array.from({ length: blanks }, (_, i) => el('tr', { class: 'blank' },
        el('td', { class: 'c' }, String(lines.length + i + 1)),
        el('td', {}), el('td', {}), el('td', {}), el('td', {}), el('td', {})))));

  // ---- สรุปยอด ----
  const sum = el('div', { class: 'sum' },
    el('div', { class: 'left' },
      el('div', { class: 'cap' }, 'จำนวนเงิน (ตัวอักษร) / Amount in words'),
      el('div', { style: 'font-weight:600;margin-top:1.5mm' }, bahtText(po.grand_total)),
      retention
        ? el('div', { class: 'opts' },
            el('span', {}, `หักเงินประกันผลงาน ${pct(po.retention_bp)}% = ${fmt(retention)} บาท`))
        : null),
    el('table', { class: 'tot' }, el('tbody', {},
      totRow('รวมเป็นเงิน', 'Subtotal', fmt(po.subtotal)),
      po.freight ? totRow('ค่าขนส่ง', 'Freight', fmt(po.freight)) : null,
      totRow(`ภาษีมูลค่าเพิ่ม ${pct(po.vat_bp)}%`, 'VAT', fmt(po.vat_amount)),
      totRow('จำนวนเงินรวมทั้งสิ้น', 'Grand Total', fmt(po.grand_total), 'grand'))));

  // ---- เงื่อนไขสัญญา ----
  const terms = el('div', { class: 'terms' },
    term('กำหนดส่งมอบ', 'Delivery due', fmtDate(po.promised_date)),
    term('ค่าปรับล่าช้า', 'Late penalty',
      `${pct(po.penalty_rate_bp)}% ต่อวัน  (เพดาน ${pct(po.penalty_cap_bp)}%)`),
    term('ระยะรับประกัน', 'Warranty', `${po.warranty_days ?? 0} วัน`),
    term('เงินประกันผลงาน', 'Retention',
      po.retention_bp ? `${pct(po.retention_bp)}%  (${fmt(retention)} บาท)` : 'ไม่มี'),
    term('ภาษีหัก ณ ที่จ่าย', 'WHT', po.wht_code ?? '—'),
    term('ผู้ออกเอกสาร', 'Issued by', d.issuer ? pick(d.issuer, 'full_name') : '—'));

  const notes = el('ul', { class: 'notes' },
    el('li', {}, 'ผู้ขายต้องส่งมอบตามรายละเอียดและขอบเขตงานแนบท้ายฉบับนี้ทุกข้อ'),
    el('li', {}, 'ส่งมอบล่าช้ากว่ากำหนด บริษัทมีสิทธิ์ปรับตามอัตราข้างต้น หักจากยอดที่ต้องชำระได้ทันที'),
    el('li', {}, 'วางบิลได้เมื่อผ่านการตรวจรับเรียบร้อยแล้ว โดยแนบสำเนาใบสั่งซื้อฉบับนี้และใบตรวจรับ'),
    el('li', {}, 'กรุณาลงนามและประทับตรา แล้วส่งกลับมา 1 ฉบับเพื่อยืนยันการรับใบสั่งซื้อ'));

  const signs = el('div', { class: 'signs' },
    el('div', {}, el('h4', {}, 'ผู้สั่งซื้อ ', el('span', {}, '/ BUYER')),
      el('div', { class: 'bd' }, el('div', { class: 'line' }),
        el('small', {}, c.name_th ?? ''),
        el('small', {}, 'วันที่ ......../......../........'))),
    el('div', {}, el('h4', {}, 'ผู้รับใบสั่งซื้อ ', el('span', {}, '/ SELLER')),
      el('div', { class: 'bd' }, el('div', { class: 'line' }),
        el('small', {}, v.name_th ?? ''),
        el('small', {}, 'วันที่ ......../......../........'),
        el('div', { class: 'stamp' }, 'ลงชื่อพร้อมประทับตราบริษัท'))));

  const footnote = el('div', { class: 'footnote' },
    el('div', { class: 'vh' }, 'เลขที่ ', el('code', {}, po.po_no)),
    el('div', { class: 'why' },
      'เอกสารฉบับนี้ออกจากระบบจัดซื้อ ขอบเขตงานแนบท้ายเป็นภาพนิ่ง ณ วันที่ออกใบสั่งซื้อ'));

  // ---- หน้า 2: ขอบเขตงานแนบท้าย ----
  const annex = sow.length ? el('div', { class: 'page2' },
    el('div', { class: 'cont' },
      el('b', {}, 'ภาคผนวก — ขอบเขตงานแนบท้ายสัญญา'),
      el('span', {}, 'ANNEX — SCOPE OF WORK'),
      el('span', { class: 'r' }, `ใบสั่งซื้อเลขที่ ${po.po_no}`)),
    el('table', { class: 'doc' },
      el('thead', {}, el('tr', {},
        th2('ข้อ', 'No.', '11mm'),
        th2('เงื่อนไขที่ตกลงกัน', 'Agreed condition'),
        th2('ผู้ขายรับ', 'Accepted', '20mm'))),
      el('tbody', {}, ...sow.map((s) => el('tr', { class: 'keep' },
        el('td', { class: 'c' }, String(s.seq)),
        el('td', {}, el('b', {}, s.title_th),
          el('div', { class: 'spec' }, s.requirement_th || '—')),
        el('td', { class: 'tick' }, s.vendor_accepted ? '✓' : el('span', { class: 'chk' })))))),
    notes, signs, footnote) : null;

  return el('div', { class: 'sheet' },
    head, el('div', { class: 'rule' }), info, subject,
    el('div', { class: 'sec' }, 'รายการสั่งซื้อ', el('i', {}, 'ORDERED ITEMS')),
    items, sum,
    el('div', { class: 'sec' }, 'เงื่อนไขสัญญา', el('i', {}, 'TERMS')),
    terms,
    annex ? null : notes,
    annex ? null : signs,
    annex ? null : footnote,
    annex);
}
