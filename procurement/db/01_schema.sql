-- ============================================================================
-- ระบบจัดซื้อจัดจ้าง — Schema
-- ติดตั้ง 1 ชุดต่อ 1 บริษัทลูกค้า (1 Supabase project = 1 company)
--
-- กติกาเงิน: จำนวนเงินทุกคอลัมน์เก็บเป็น "สตางค์" (bigint) ห้ามใช้ float
--            อัตราร้อยละเก็บเป็น basis point (bp) : 700 bp = 7.00%
-- รันไฟล์นี้เป็นไฟล์แรก แล้วตามด้วย 02_rls.sql, 03_functions.sql,
-- 04_triggers.sql, 05_seed.sql
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUM
-- ============================================================================

create type app_role as enum (
  'requester',   -- ผู้ขอซื้อ
  'purchasing',  -- ฝ่ายจัดซื้อ
  'inspector',   -- ผู้ตรวจรับ (ENG)
  'pm',
  'pd',
  'ceo',
  'accounting',  -- บัญชี
  'admin'
);

create type doc_kind as enum ('pr','po','gr','invoice','voucher','wht_cert');

create type approval_doc as enum ('pr','budget_exception','voucher');

create type approval_decision as enum ('pending','approved','rejected');

create type pr_status as enum (
  'draft',             -- 1. ตั้งเรื่อง
  'sow_locked',        -- 1.1 ล็อก SOW แล้ว
  'rfq_issued',        -- 2. พิมพ์ใบขอราคาส่งผู้ขายแล้ว
  'quoting',           -- 3. กำลังคีย์ใบเสนอราคา
  'evaluated',         -- 4-5. เช็คงบ + เลือกผู้ชนะแล้ว
  'pending_approval',  -- 6. อยู่ในสายอนุมัติ
  'approved',          -- 6. อนุมัติครบทุกขั้น
  'rejected',          -- ตีกลับผู้ขอซื้อ
  'po_issued',         -- 7. ออก PO แล้ว
  'closed',
  'cancelled'
);

create type po_status as enum (
  'issued','partially_received','received','invoiced','paid','closed','cancelled'
);

create type gr_result as enum ('accepted','partially_accepted','rejected');

create type match_status as enum ('matched','mismatched');

create type invoice_status as enum ('entered','matched','mismatched','voucher_created','paid');

-- commit  = กันงบไว้ตอนออก PO
-- actual  = ตัดงบจริงตอนจ่ายเงิน
-- release = คืนงบ (ยกเลิก PO / จ่ายจริงน้อยกว่าที่กันไว้)
create type ledger_kind as enum ('commit','actual','release');

-- ============================================================================
-- MASTER — ข้อมูลบริษัทและผู้ใช้
-- ============================================================================

-- แถวเดียวเท่านั้น (1 project = 1 บริษัท)
create table company_profile (
  id            smallint primary key default 1 check (id = 1),
  name_th       text not null,
  name_en       text,
  tax_id        text not null,
  branch        text default '00000',
  address_th    text,
  address_en    text,
  phone         text,
  email         text,
  logo_path     text,
  fiscal_year_start_month smallint not null default 1
                  check (fiscal_year_start_month between 1 and 12),
  default_vat_bp integer not null default 700,
  updated_at    timestamptz not null default now()
);

create table user_profiles (
  id            uuid primary key references auth.users(id) on delete restrict,
  full_name_th  text not null,
  full_name_en  text,
  employee_code text unique,
  email         text not null,
  position_th   text,
  position_en   text,
  department    text,
  signature_path text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table user_roles (
  user_id     uuid not null references user_profiles(id) on delete cascade,
  role        app_role not null,
  granted_by  uuid references user_profiles(id),
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);
create index on user_roles (role);

-- วงเงินอนุมัติแต่ละขั้น — ลูกค้าแต่ละรายปรับเองได้
-- max_amount = null แปลว่าไม่จำกัด (CEO)
create table approval_limits (
  role        app_role primary key,
  step_order  smallint not null unique,
  max_amount  bigint check (max_amount is null or max_amount > 0),
  active      boolean not null default true
);

-- ============================================================================
-- MASTER — งบประมาณ
-- ============================================================================

create table cost_centers (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,
  name_th  text not null,
  name_en  text,
  active   boolean not null default true
);

create table projects (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  name_th        text not null,
  name_en        text,
  cost_center_id uuid not null references cost_centers(id),
  start_date     date,
  end_date       date,
  active         boolean not null default true
);
create index on projects (cost_center_id);

-- ตัดงบ 2 แกน:  cost_center x ปีงบ  (project_id is null)
--               cost_center x โครงการ x ปีงบ
create table budgets (
  id             uuid primary key default gen_random_uuid(),
  cost_center_id uuid not null references cost_centers(id),
  project_id     uuid references projects(id),
  fiscal_year    integer not null,
  amount         bigint not null check (amount >= 0),
  note           text,
  created_by     uuid references user_profiles(id),
  created_at     timestamptz not null default now()
);
create unique index budgets_cc_year_uq on budgets (cost_center_id, fiscal_year)
  where project_id is null;
create unique index budgets_cc_proj_year_uq on budgets (cost_center_id, project_id, fiscal_year)
  where project_id is not null;

-- APPEND-ONLY : ยอดคงเหลือคำนวณจากผลรวม ไม่มีคอลัมน์ยอดคงเหลือให้ใครแก้
create table budget_ledger (
  id           bigserial primary key,
  budget_id    uuid not null references budgets(id),
  kind         ledger_kind not null,
  amount       bigint not null check (amount > 0),
  ref_doc      doc_kind not null,
  ref_id       uuid not null,
  note         text,
  created_by   uuid references user_profiles(id),
  created_at   timestamptz not null default now()
);
create index on budget_ledger (budget_id);
create index on budget_ledger (ref_doc, ref_id);

-- ============================================================================
-- MASTER — ผู้ขาย
-- ============================================================================

create table vendors (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name_th           text not null,
  name_en           text,
  tax_id            text,
  branch            text default '00000',
  address_th        text,
  contact_name      text,
  phone             text,
  email             text,
  bank_name         text,
  bank_account_no   text,
  bank_account_name text,
  default_wht_code  text,
  blacklisted       boolean not null default false,
  blacklist_reason  text,
  note              text,
  created_by        uuid references user_profiles(id),
  created_at        timestamptz not null default now()
);

-- คะแนนผลงานของผู้ขายรายใบสั่งซื้อ — ระบบให้เอง (มาจากขั้น 8 ตรวจรับ + ขั้น 9 ส่งช้า)
-- ใช้ดูประวัติว่าเจ้าไหนส่งตรงเวลา/ตรวจผ่านรอบแรก ไม่ได้ถูกเอาไปคิดต่อในขั้นเลือกผู้ชนะ
create table vendor_ratings (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors(id),
  po_id         uuid not null,
  on_time       boolean not null,
  late_days     integer not null default 0,
  passed_first_inspection boolean not null,
  reject_count  integer not null default 0,
  score         smallint not null check (score between 0 and 20),
  note          text,
  created_at    timestamptz not null default now(),
  unique (po_id)
);
create index on vendor_ratings (vendor_id);

-- ============================================================================
-- MASTER — Scope of Work และอัตราภาษี
-- ============================================================================

-- 6 ข้อตั้งต้นอยู่ใน 05_seed.sql — ลูกค้าเพิ่ม/แก้เองได้ใน admin
create table sow_clauses (
  id        uuid primary key default gen_random_uuid(),
  code      text not null unique,
  seq       smallint not null,
  title_th  text not null,
  title_en  text not null,
  hint_th   text,
  hint_en   text,
  active    boolean not null default true
);

-- ภาษีหัก ณ ที่จ่าย — rate_bp 300 = 3%
create table wht_rates (
  code           text primary key,
  form           text not null default 'PND53',
  description_th text not null,
  description_en text not null,
  rate_bp        integer not null check (rate_bp between 0 and 10000),
  active         boolean not null default true
);

-- ============================================================================
-- เลขที่เอกสาร — ออกจาก Postgres เท่านั้น ไม่ออกจากฝั่งเบราว์เซอร์
-- ============================================================================

create table doc_sequences (
  kind        doc_kind not null,
  fiscal_year integer not null,
  last_no     integer not null default 0,
  prefix      text not null,
  primary key (kind, fiscal_year)
);

-- ============================================================================
-- ขั้น 1 — ใบขอซื้อ (PR)
-- ============================================================================

create table prs (
  id               uuid primary key default gen_random_uuid(),
  pr_no            text unique,
  fiscal_year      integer not null,
  requester_id     uuid not null references user_profiles(id),
  cost_center_id   uuid not null references cost_centers(id),
  project_id       uuid references projects(id),
  purpose_th       text not null,
  purpose_en       text,
  needed_by        date,
  estimated_amount bigint not null default 0 check (estimated_amount >= 0),
  -- เงื่อนไขสัญญาที่ผู้ขอซื้อกำหนดในขอบเขตงาน (ว่างได้ = ใช้ค่าตั้งต้นระบบตอนออก PO)
  delivery_date    date,                                                       -- SOW ข้อ 3
  penalty_rate_bp  integer check (penalty_rate_bp is null or penalty_rate_bp between 0 and 10000),
  penalty_cap_bp   integer check (penalty_cap_bp  is null or penalty_cap_bp  between 0 and 10000),
  retention_bp     integer check (retention_bp    is null or retention_bp    between 0 and 10000),
  status           pr_status not null default 'draft',
  sow_locked_at    timestamptz,
  submitted_at     timestamptz,
  approved_at      timestamptz,
  reject_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on prs (status);
create index on prs (requester_id);
create index on prs (cost_center_id, fiscal_year);

create table pr_lines (
  id            uuid primary key default gen_random_uuid(),
  pr_id         uuid not null references prs(id) on delete cascade,
  seq           smallint not null,
  description   text not null,
  spec          text,
  qty           numeric(18,3) not null check (qty > 0),
  unit          text not null,
  est_unit_price bigint not null default 0 check (est_unit_price >= 0),
  unique (pr_id, seq)
);
create index on pr_lines (pr_id);

-- ขั้น 1.1 — ล็อก Scope of Work
create table pr_sow (
  pr_id          uuid not null references prs(id) on delete cascade,
  sow_clause_id  uuid not null references sow_clauses(id),
  requirement_th text not null,
  requirement_en text,
  primary key (pr_id, sow_clause_id)
);

-- ขั้น 2 — พิมพ์ใบรายละเอียดขอซื้อส่งผู้ขาย (มีช่องให้ผู้ขายติ๊ก SOW)
create table rfq_prints (
  id           uuid primary key default gen_random_uuid(),
  pr_id        uuid not null references prs(id) on delete cascade,
  vendor_id    uuid references vendors(id),
  content_hash text not null,
  printed_by   uuid not null references user_profiles(id),
  printed_at   timestamptz not null default now()
);
create index on rfq_prints (pr_id);

-- ============================================================================
-- ขั้น 3 — ใบเสนอราคาที่ผู้ขายส่งกลับมา
-- ============================================================================

create table quotes (
  id             uuid primary key default gen_random_uuid(),
  pr_id          uuid not null references prs(id) on delete cascade,
  vendor_id      uuid not null references vendors(id),
  quote_no       text not null,
  quote_date     date not null,
  valid_until    date,
  freight        bigint not null default 0 check (freight >= 0),
  vat_bp         integer not null default 700 check (vat_bp between 0 and 10000),
  currency       char(3) not null default 'THB',
  delivery_days  integer,
  warranty_days  integer,
  attachment_path text,
  entered_by     uuid not null references user_profiles(id),
  entered_at     timestamptz not null default now(),
  disqualified   boolean not null default false,
  disqualified_reason text,
  unique (pr_id, vendor_id, quote_no)
);
create index on quotes (pr_id);
create index on quotes (vendor_id);

-- แยกราคาตาม BOQ ทุกบรรทัด — ผูกกับบรรทัดใน PR เสมอ
create table quote_lines (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid not null references quotes(id) on delete cascade,
  pr_line_id  uuid not null references pr_lines(id),
  qty         numeric(18,3) not null check (qty > 0),
  unit_price  bigint not null check (unit_price >= 0),
  amount      bigint generated always as (round(qty * unit_price)::bigint) stored,
  note        text,
  unique (quote_id, pr_line_id)
);
create index on quote_lines (quote_id);

-- ผู้ขายติ๊กว่ารับเงื่อนไข SOW ข้อไหนได้บ้าง
create table quote_sow (
  quote_id      uuid not null references quotes(id) on delete cascade,
  sow_clause_id uuid not null references sow_clauses(id),
  accepted      boolean not null,
  note          text,
  primary key (quote_id, sow_clause_id)
);

-- ขั้น 4 — ขอยกเว้นงบ (CEO เท่านั้นที่อนุมัติได้)
create table budget_exceptions (
  id            uuid primary key default gen_random_uuid(),
  pr_id         uuid not null references prs(id) on delete cascade,
  budget_id     uuid not null references budgets(id),
  amount_over   bigint not null check (amount_over > 0),
  reason        text not null,
  requested_by  uuid not null references user_profiles(id),
  requested_at  timestamptz not null default now(),
  decision      approval_decision not null default 'pending',
  decided_by    uuid references user_profiles(id),
  decided_at    timestamptz,
  decision_reason text
);
create index on budget_exceptions (pr_id);

-- ขั้น 4 — กรณีใช้งบ 90-100% ต้องระบุเหตุผล
create table budget_warnings (
  pr_id       uuid primary key references prs(id) on delete cascade,
  budget_id   uuid not null references budgets(id),
  used_bp     integer not null,
  reason      text not null,
  ack_by      uuid not null references user_profiles(id),
  ack_at      timestamptz not null default now()
);

-- ============================================================================
-- ขั้น 5 — เลือกผู้ชนะ (รายบรรทัด เพราะ 1 PR ออกได้หลาย PO)
-- ============================================================================

create table pr_awards (
  pr_id       uuid primary key references prs(id) on delete cascade,
  escalated   boolean not null default false,  -- ไม่เลือกเจ้าถูกสุด = ยกระดับ 1 ขั้น
  note        text,
  awarded_by  uuid not null references user_profiles(id),
  awarded_at  timestamptz not null default now()
);

create table line_awards (
  pr_line_id            uuid primary key references pr_lines(id) on delete cascade,
  pr_id                 uuid not null references prs(id) on delete cascade,
  quote_id              uuid not null references quotes(id),
  quote_line_id         uuid not null references quote_lines(id),
  reason_if_not_cheapest text,
  awarded_by            uuid not null references user_profiles(id),
  awarded_at            timestamptz not null default now()
);
create index on line_awards (pr_id);
create index on line_awards (quote_id);

-- ============================================================================
-- ขั้น 6 — สายอนุมัติ
-- คำนวณจากวงเงิน "ตอนที่ยื่น" แล้วเก็บสายไว้ ไม่คำนวณสดตอนแสดงผล
-- ขั้นถัดไปเห็นเรื่องต่อเมื่อขั้นก่อนหน้า approve แล้วเท่านั้น
-- ============================================================================

create table approvals (
  id          uuid primary key default gen_random_uuid(),
  doc_type    approval_doc not null,
  doc_id      uuid not null,
  step_no     smallint not null,
  role        app_role not null,
  decision    approval_decision not null default 'pending',
  approver_id uuid references user_profiles(id),
  reason      text,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (doc_type, doc_id, step_no)
);
create index on approvals (doc_type, doc_id);
create index on approvals (role, decision);

-- ============================================================================
-- ขั้น 7 — ใบสั่งซื้อ / สัญญาจ้าง
-- ============================================================================

create table pos (
  id              uuid primary key default gen_random_uuid(),
  po_no           text unique,
  fiscal_year     integer not null,
  pr_id           uuid not null references prs(id),
  vendor_id       uuid not null references vendors(id),
  budget_id       uuid references budgets(id),   -- ว่างได้ = ศูนย์ต้นทุนนี้ไม่ได้ตั้งงบไว้
  subtotal        bigint not null check (subtotal >= 0),
  freight         bigint not null default 0 check (freight >= 0),
  vat_bp          integer not null default 700,
  vat_amount      bigint not null default 0 check (vat_amount >= 0),
  grand_total     bigint not null check (grand_total >= 0),
  penalty_rate_bp integer not null default 10   check (penalty_rate_bp >= 0),   -- 0.1%/วัน
  penalty_cap_bp  integer not null default 1000 check (penalty_cap_bp >= 0),    -- max 10%
  retention_bp    integer not null default 0    check (retention_bp between 0 and 10000),
  warranty_days   integer not null default 0,
  promised_date   date not null,
  wht_code        text references wht_rates(code),
  status          po_status not null default 'issued',
  issued_by       uuid not null references user_profiles(id),
  issued_at       timestamptz not null default now(),
  closed_at       timestamptz
);
create index on pos (pr_id);
create index on pos (vendor_id);
create index on pos (status);

create table po_lines (
  id          uuid primary key default gen_random_uuid(),
  po_id       uuid not null references pos(id) on delete cascade,
  pr_line_id  uuid not null references pr_lines(id),
  seq         smallint not null,
  description text not null,
  spec        text,
  qty         numeric(18,3) not null check (qty > 0),
  unit        text not null,
  unit_price  bigint not null check (unit_price >= 0),
  amount      bigint generated always as (round(qty * unit_price)::bigint) stored,
  unique (po_id, seq)
);
create index on po_lines (po_id);

-- SOW แนบท้ายสัญญาเป็น SNAPSHOT — แก้ต้นฉบับทีหลังไม่กระทบสัญญาที่ออกไปแล้ว
create table po_sow_snapshot (
  id              uuid primary key default gen_random_uuid(),
  po_id           uuid not null references pos(id) on delete cascade,
  seq             smallint not null,
  code            text not null,
  title_th        text not null,
  title_en        text not null,
  requirement_th  text not null,
  requirement_en  text,
  vendor_accepted boolean not null,
  vendor_note     text,
  unique (po_id, seq)
);

-- ============================================================================
-- ขั้น 8 — ส่งมอบ / ตรวจรับ  (คนบันทึก ≠ คนตรวจรับ เสมอ)
-- ============================================================================

create table deliveries (
  id              uuid primary key default gen_random_uuid(),
  po_id           uuid not null references pos(id),
  delivery_no     text,
  delivered_date  date not null,          -- วันที่ส่งจริง (ใช้คิดค่าปรับล่าช้า)
  vendor_doc_no   text,
  note            text,
  attachment_path text,
  recorded_by     uuid not null references user_profiles(id),
  recorded_at     timestamptz not null default now()
);
create index on deliveries (po_id);

create table grs (
  id            uuid primary key default gen_random_uuid(),
  gr_no         text unique,
  fiscal_year   integer not null,
  delivery_id   uuid not null unique references deliveries(id) on delete cascade,
  result        gr_result not null,
  reason        text,
  inspected_by  uuid not null references user_profiles(id),
  inspected_at  timestamptz not null default now()
);

create table gr_lines (
  id           uuid primary key default gen_random_uuid(),
  gr_id        uuid not null references grs(id) on delete cascade,
  po_line_id   uuid not null references po_lines(id),
  qty_accepted numeric(18,3) not null default 0 check (qty_accepted >= 0),
  qty_rejected numeric(18,3) not null default 0 check (qty_rejected >= 0),
  reason       text,
  unique (gr_id, po_line_id)
);
create index on gr_lines (gr_id);

-- ============================================================================
-- ขั้น 9 — ใบแจ้งหนี้ + 3-Way Match
-- ============================================================================

create table invoices (
  id              uuid primary key default gen_random_uuid(),
  invoice_ref     text unique,             -- เลขอ้างอิงภายใน
  fiscal_year     integer not null,
  po_id           uuid not null references pos(id),
  vendor_invoice_no text not null,         -- เลขที่ใบแจ้งหนี้ของผู้ขาย
  invoice_date    date not null,
  received_date   date not null default current_date,
  freight         bigint not null default 0 check (freight >= 0),
  subtotal        bigint not null check (subtotal >= 0),   -- ยอดก่อน VAT ทั้งใบ (รวมค่าขนส่ง)
  vat_amount      bigint not null default 0 check (vat_amount >= 0),
  grand_total     bigint not null check (grand_total >= 0),
  attachment_path text,
  status          invoice_status not null default 'entered',
  entered_by      uuid not null references user_profiles(id),
  entered_at      timestamptz not null default now(),
  unique (po_id, vendor_invoice_no)
);
create index on invoices (po_id);
create index on invoices (status);

create table invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  po_line_id  uuid not null references po_lines(id),
  qty         numeric(18,3) not null check (qty > 0),
  unit_price  bigint not null check (unit_price >= 0),
  amount      bigint generated always as (round(qty * unit_price)::bigint) stored,
  unique (invoice_id, po_line_id)
);
create index on invoice_lines (invoice_id);

-- ผลจับคู่ PO ↔ ใบรับของ ↔ ใบแจ้งหนี้ — ต้อง matched เท่านั้นถึงตั้งเบิกได้
create table match_results (
  invoice_id  uuid primary key references invoices(id) on delete cascade,
  status      match_status not null,
  mismatches  jsonb not null default '[]'::jsonb,
  matched_at  timestamptz not null default now(),
  matched_by  uuid references user_profiles(id)
);

-- ============================================================================
-- ขั้น 10-11 — ใบสำคัญจ่าย + จ่ายเงินจริง
-- คนคีย์ใบแจ้งหนี้ กดอนุมัติจ่ายเองไม่ได้ (บังคับใน 04_triggers.sql)
-- ============================================================================

create table payment_vouchers (
  id               uuid primary key default gen_random_uuid(),
  voucher_no       text unique,
  fiscal_year      integer not null,
  invoice_id       uuid not null unique references invoices(id),
  gross            bigint not null check (gross >= 0),
  late_days        integer not null default 0 check (late_days >= 0),
  penalty_amount   bigint not null default 0 check (penalty_amount >= 0),
  retention_amount bigint not null default 0 check (retention_amount >= 0),
  wht_code         text references wht_rates(code),
  wht_base         bigint not null default 0 check (wht_base >= 0),
  wht_amount       bigint not null default 0 check (wht_amount >= 0),
  other_deduction  bigint not null default 0 check (other_deduction >= 0),
  other_deduction_note text,
  net_amount       bigint not null check (net_amount >= 0),
  prepared_by      uuid not null references user_profiles(id),
  prepared_at      timestamptz not null default now(),
  decision         approval_decision not null default 'pending',
  approved_by      uuid references user_profiles(id),
  approved_at      timestamptz,
  reject_reason    text
);
create index on payment_vouchers (decision);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null unique references payment_vouchers(id),
  paid_date    date not null,
  method       text not null,             -- โอน / เช็ค / เงินสด
  ref_no       text not null,             -- เลขอ้างอิงการโอน / เลขเช็ค
  wht_cert_no  text unique,               -- เลขหนังสือรับรองหักภาษี ณ ที่จ่าย
  note         text,
  paid_by      uuid not null references user_profiles(id),
  paid_at      timestamptz not null default now()
);

-- ============================================================================
-- ขั้น 12 — คืนเงินประกันผลงาน
-- คืนไม่ได้จนกว่าครบระยะรับประกัน + ผู้ตรวจรับยืนยัน
-- ============================================================================

create table retention_releases (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null unique references pos(id),
  amount       bigint not null check (amount > 0),
  due_date     date not null,             -- วันครบระยะรับประกัน
  confirmed_by uuid references user_profiles(id),   -- ต้องเป็น inspector
  confirmed_at timestamptz,
  released_by  uuid references user_profiles(id),
  released_at  timestamptz,
  payment_ref  text,
  note         text
);

-- ============================================================================
-- AUDIT LOG — APPEND ONLY
-- ไม่มี role ไหนได้สิทธิ์ UPDATE/DELETE รวมถึง admin (ดู 02_rls.sql)
-- ============================================================================

create table audit_log (
  id         bigserial primary key,
  actor_id   uuid,
  actor_name text,
  action     text not null,
  table_name text not null,
  row_id     text,
  before     jsonb,
  after      jsonb,
  at         timestamptz not null default now()
);
create index on audit_log (table_name, row_id);
create index on audit_log (actor_id);
create index on audit_log (at desc);
