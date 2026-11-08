// ===========================================================================
// แปล audit_log ให้เป็นภาษาคน
// ---------------------------------------------------------------------------
// ฐานข้อมูลเก็บ before/after เป็น jsonb ดิบ (ชื่อคอลัมน์ + รหัส uuid + สตางค์)
// ไฟล์นี้คือชั้นแปลชั้นเดียวของระบบ — หน้าไหนจะโชว์ประวัติก็เรียกจากที่นี่
//
// เพิ่มตาราง/คอลัมน์ใหม่ในฐานข้อมูลเมื่อไหร่ ให้เติมคำแปลที่ i18n/th.js + en.js
// คีย์ aud.tbl.<ชื่อตาราง> และ aud.fld.<ชื่อคอลัมน์>
// ไม่เติมก็ไม่พัง — จะตกกลับเป็นชื่อคอลัมน์ดิบเหมือนเดิม
// ===========================================================================

import { sb } from './supabase.js';
import { t, pick, lang, fmtDate, fmtDateTime } from './i18n.js';
import { fmt, fmtQty, pct } from './money.js';

const isUuid = (v) => typeof v === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ---- ชนิดของค่าในแต่ละคอลัมน์ (ชื่อคอลัมน์ทั้งระบบไม่ชนกัน จึงใช้ชุดเดียวได้) ----
const MONEY = new Set(['amount', 'amount_over', 'max_amount', 'estimated_amount',
  'est_unit_price', 'unit_price', 'subtotal', 'freight', 'vat_amount', 'grand_total',
  'gross', 'penalty_amount', 'retention_amount', 'wht_base', 'wht_amount',
  'other_deduction', 'net_amount']);

const BP = new Set(['vat_bp', 'default_vat_bp', 'penalty_rate_bp', 'penalty_cap_bp',
  'retention_bp', 'rate_bp', 'used_bp']);

const QTY = new Set(['qty', 'qty_accepted', 'qty_rejected']);

const DATE = new Set(['needed_by', 'delivery_date', 'quote_date', 'valid_until',
  'start_date', 'end_date', 'promised_date', 'delivered_date', 'invoice_date',
  'received_date', 'paid_date', 'due_date']);

const PATH = new Set(['logo_path', 'signature_path', 'attachment_path']);

// ค่าที่เป็นชุดตายตัว — ผูกกับคำแปลที่มีอยู่แล้วในระบบ (prStatus.* / role.* ฯลฯ)
const ENUM = {
  'prs.status': 'prStatus',
  'pos.status': 'poStatus',
  'invoices.status': 'invStatus',
  'match_results.status': 'invStatus',
  'grs.result': 'grResult',
  'user_roles.role': 'role',
  'approval_limits.role': 'role',
  'approvals.role': 'role',
  'approvals.decision': 'decision',
  'approvals.doc_type': 'approvalDoc',
  'budget_exceptions.decision': 'decision',
  'payment_vouchers.decision': 'decision',
  'budget_ledger.kind': 'ledgerKind',
  'budget_ledger.ref_doc': 'docKind',
  'doc_sequences.kind': 'docKind',
};

// ---- รหัส uuid ในคอลัมน์ไหน ชี้ไปตารางไหน ----
const PEOPLE = ['actor_id', 'user_id', 'created_by', 'granted_by', 'requester_id',
  'entered_by', 'printed_by', 'requested_by', 'decided_by', 'ack_by', 'awarded_by',
  'approver_id', 'issued_by', 'recorded_by', 'inspected_by', 'matched_by',
  'prepared_by', 'approved_by', 'paid_by', 'confirmed_by', 'released_by'];

const REF_TABLE = {
  ...Object.fromEntries(PEOPLE.map((c) => [c, 'user_profiles'])),
  vendor_id: 'vendors',
  cost_center_id: 'cost_centers',
  project_id: 'projects',
  budget_id: 'budgets',
  pr_id: 'prs',
  po_id: 'pos',
  gr_id: 'grs',
  quote_id: 'quotes',
  invoice_id: 'invoices',
  voucher_id: 'payment_vouchers',
  delivery_id: 'deliveries',
  sow_clause_id: 'sow_clauses',
  pr_line_id: 'pr_lines',
  po_line_id: 'po_lines',
};

const SOURCES = {
  user_profiles: { cols: 'id,full_name_th,full_name_en,employee_code',
                   label: (r) => pick(r, 'full_name') || r.employee_code || '' },
  vendors:       { cols: 'id,code,name_th,name_en',
                   label: (r) => `${r.code} — ${pick(r, 'name')}` },
  cost_centers:  { cols: 'id,code,name_th,name_en',
                   label: (r) => `${r.code} — ${pick(r, 'name')}` },
  projects:      { cols: 'id,code,name_th,name_en',
                   label: (r) => `${r.code} — ${pick(r, 'name')}` },
  budgets:       { cols: 'id,fiscal_year', label: (r) => `${t('aud.fld.fiscal_year')} ${r.fiscal_year}` },
  prs:           { cols: 'id,pr_no', label: (r) => r.pr_no || '' },
  pos:           { cols: 'id,po_no', label: (r) => r.po_no || '' },
  grs:           { cols: 'id,gr_no', label: (r) => r.gr_no || '' },
  quotes:        { cols: 'id,quote_no', label: (r) => r.quote_no || '' },
  invoices:      { cols: 'id,invoice_ref,vendor_invoice_no',
                   label: (r) => r.invoice_ref || r.vendor_invoice_no || '' },
  payment_vouchers: { cols: 'id,voucher_no', label: (r) => r.voucher_no || '' },
  deliveries:    { cols: 'id,delivery_no,delivered_date',
                   label: (r) => r.delivery_no || fmtDate(r.delivered_date) },
  sow_clauses:   { cols: 'id,code,title_th,title_en', label: (r) => pick(r, 'title') || r.code },
  pr_lines:      { cols: 'id,seq,description', label: (r) => `${r.seq}. ${r.description}` },
  po_lines:      { cols: 'id,seq,description', label: (r) => `${r.seq}. ${r.description}` },
};

// สองตารางนี้ชี้เอกสารแบบไม่ตายตัว — ต้องอ่าน "ชนิดเอกสาร" ในแถวนั้นก่อนถึงรู้ว่าไปตารางไหน
// approvals: doc_type + doc_id   |   budget_ledger: ref_doc + ref_id
const BY_DOC_KIND = { pr: 'prs', po: 'pos', gr: 'grs', invoice: 'invoices',
                      voucher: 'payment_vouchers' };

// รหัส -> ชื่อที่คนอ่านออก  (ชื่อขึ้นกับภาษา จึงต้องล้างทิ้งตอนสลับภาษา)
const CACHE = new Map();
let cacheLang = lang;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

// ดึงชื่อจริงของทุกรหัสที่โผล่ในชุดประวัติที่กำลังจะแสดง — ยิงทีเดียวต่อตาราง
// ต้อง await ให้จบก่อนวาด ไม่งั้นจะได้รหัสย่อแทนชื่อคน
export async function loadRefs(rows) {
  if (cacheLang !== lang) { CACHE.clear(); cacheLang = lang; }

  const want = new Map();
  const add = (tbl, id) => {
    if (!tbl || !SOURCES[tbl] || !isUuid(id) || CACHE.has(id)) return;
    if (!want.has(tbl)) want.set(tbl, new Set());
    want.get(tbl).add(id);
  };
  const scan = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) if (REF_TABLE[k]) add(REF_TABLE[k], v);
    if (obj.doc_type) add(BY_DOC_KIND[obj.doc_type], obj.doc_id);
    if (obj.ref_doc)  add(BY_DOC_KIND[obj.ref_doc],  obj.ref_id);
  };
  for (const r of rows) { scan(r.before); scan(r.after); scan({ actor_id: r.actor_id }); }

  await Promise.all([...want].map(async ([tbl, ids]) => {
    const src = SOURCES[tbl];
    // ตัดเป็นก้อนละ 100 — ยัดรหัสเป็นพันใส่ query string เดียวแล้ว URL ยาวเกินจนโดนตีกลับ
    for (const part of chunk([...ids], 100)) {
      try {
        const { data } = await sb.from(tbl).select(src.cols).in('id', part);
        (data ?? []).forEach((r) => CACHE.set(r.id, src.label(r) || ''));
      } catch { /* ไม่มีสิทธิ์อ่านตารางนั้นก็ปล่อยให้ตกกลับเป็นรหัสย่อ */ }
    }
  }));
}

// t() คืนคีย์กลับมาเมื่อไม่มีคำแปล — เอามาเช็คว่าต้องตกกลับเป็นชื่อดิบไหม
const tr = (key, raw) => { const s = t(key); return s === key ? raw : s; };

export const tableLabel = (name) => tr(`aud.tbl.${name}`, name);
export const fieldLabel = (col) => tr(`aud.fld.${col}`, col);
export const actionLabel = (action) => tr(`aud.act.${action}`, action);

export function fmtValue(table, col, v) {
  if (v == null || v === '') return t('aud.empty');
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');

  const en = ENUM[`${table}.${col}`];
  if (en) return tr(`${en}.${v}`, String(v));

  if (MONEY.has(col)) return `${fmt(v)} ${t('common.baht')}`;
  if (BP.has(col)) return `${pct(v)}%`;
  if (QTY.has(col)) return fmtQty(v);
  if (DATE.has(col)) return fmtDate(v);
  if (col.endsWith('_at')) return fmtDateTime(v);
  if (isUuid(v)) return CACHE.get(v) || `#${v.slice(0, 8)}`;
  if (PATH.has(col)) return String(v).split('/').pop();
  if (col === 'content_hash') return `#${String(v).slice(0, 12)}`;

  if (Array.isArray(v)) {
    return v.length
      ? v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' · ')
      : t('aud.empty');
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// เอกสารไหน — เอาเลขที่เอกสารก่อน ไม่มีค่อยไล่ลงมาเป็นชื่อ แล้วค่อยอ้างเอกสารแม่
const DOC_NO = ['pr_no', 'po_no', 'gr_no', 'invoice_ref', 'voucher_no', 'quote_no',
  'delivery_no', 'wht_cert_no', 'vendor_invoice_no'];
const PARENT = ['doc_id', 'ref_id', 'pr_id', 'po_id', 'invoice_id', 'gr_id', 'quote_id',
  'voucher_id', 'delivery_id', 'vendor_id', 'user_id', 'budget_id',
  'project_id', 'cost_center_id'];

export function subject(r) {
  const o = r.after ?? r.before ?? {};
  for (const c of DOC_NO) if (o[c]) return String(o[c]);

  const name = pick(o, 'name') || pick(o, 'full_name') || pick(o, 'title') || pick(o, 'purpose');
  if (o.code && name) return `${o.code} — ${name}`;
  if (name) return name;
  if (o.code) return String(o.code);
  if (o.employee_code) return String(o.employee_code);

  for (const c of PARENT) {
    const label = isUuid(o[c]) ? CACHE.get(o[c]) : null;
    if (label) return t('aud.of', { ref: label });
  }
  return '';
}

// ประโยคเดียวจบว่าใครทำอะไรกับเอกสารไหน
export function sentence(r) {
  return t('aud.sentence', {
    verb: actionLabel(r.action),
    obj: tableLabel(r.table_name),
    ref: subject(r),
  }).replace(/\s+/g, ' ').trim();
}

// เรียงให้เรื่องที่คนอยากเห็นอยู่บน — สถานะ > เงิน > ข้อความ > เวลา > รหัสอ้างอิง
function rank(col, v) {
  if (['status', 'result', 'decision', 'active', 'blacklisted'].includes(col)) return 0;
  if (MONEY.has(col) || BP.has(col) || QTY.has(col)) return 1;
  if (col.endsWith('_at')) return 3;
  if (isUuid(v) || col === 'content_hash') return 4;
  return 2;
}

// รายการค่าที่เปลี่ยน (UPDATE) หรือค่าที่บันทึก/ถูกลบ (INSERT/DELETE)
export function changes(r) {
  const b = r.before ?? {};
  const a = r.after ?? {};
  const upd = r.action === 'UPDATE';
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => k !== 'id');

  const out = [];
  for (const k of keys) {
    const bv = b[k], av = a[k];
    if (upd && JSON.stringify(bv ?? null) === JSON.stringify(av ?? null)) continue;
    // ตอนสร้าง/ลบ ช่องที่ไม่ได้กรอกไม่ต้องเอามารกตา
    if (!upd && (av ?? bv) == null) continue;
    out.push({
      col: k,
      label: fieldLabel(k),
      before: fmtValue(r.table_name, k, bv),
      after: fmtValue(r.table_name, k, av),
      _rank: rank(k, av ?? bv),
    });
  }
  return out.sort((x, y) => x._rank - y._rank);
}
