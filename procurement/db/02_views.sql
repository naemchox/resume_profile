-- ============================================================================
-- VIEWS — ตัวเลขที่ "คำนวณเอา" ห้ามเก็บเป็นคอลัมน์ให้คนแก้
--
-- ทุก view ตั้ง security_invoker = true เพื่อให้ RLS ของตารางต้นทางมีผล
-- (ถ้าไม่ตั้ง view จะวิ่งด้วยสิทธิ์เจ้าของ = ทะลุ RLS)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ยอดใบเสนอราคาบนฐานเดียวกัน (รวมค่าส่ง + VAT) + สถานะการรับ SOW
-- นี่คือตัวเลขเดียวที่ใช้เทียบระหว่างผู้ขาย ห้ามคีย์มือ
-- ----------------------------------------------------------------------------
create view v_quote_totals with (security_invoker = true) as
select
  q.id                as quote_id,
  q.pr_id,
  q.vendor_id,
  q.quote_no,
  q.quote_date,
  q.disqualified,
  q.entered_by,
  coalesce(l.subtotal, 0)                                    as subtotal,
  q.freight,
  coalesce(l.subtotal, 0) + q.freight                        as before_vat,
  round((coalesce(l.subtotal, 0) + q.freight) * q.vat_bp / 10000.0)::bigint as vat_amount,
  coalesce(l.subtotal, 0) + q.freight
    + round((coalesce(l.subtotal, 0) + q.freight) * q.vat_bp / 10000.0)::bigint as grand_total,
  coalesce(l.line_count, 0)                                  as line_count,
  coalesce(s.accepted_count, 0)                              as sow_accepted,
  coalesce(r.required_count, 0)                              as sow_required,
  (coalesce(s.accepted_count, 0) >= coalesce(r.required_count, 0)
     and coalesce(r.required_count, 0) > 0)                  as sow_complete
from quotes q
left join lateral (
  select sum(ql.amount)::bigint as subtotal, count(*) as line_count
  from quote_lines ql where ql.quote_id = q.id
) l on true
left join lateral (
  select count(*) as accepted_count
  from quote_sow qs where qs.quote_id = q.id and qs.accepted
) s on true
left join lateral (
  select count(*) as required_count
  from pr_sow ps where ps.pr_id = q.pr_id
) r on true;

-- ----------------------------------------------------------------------------
-- ขั้น 5 — จัดอันดับผู้เสนอราคา
-- ตัดออกอัตโนมัติถ้า: ถูก disqualify / รับ SOW ไม่ครบ / ผู้ขายอยู่ในบัญชีดำ
-- อันดับเรียงตามยอดสุทธิจากถูกไปแพง
-- ----------------------------------------------------------------------------
create view v_quote_ranking with (security_invoker = true) as
with base as (
  select
    t.*,
    v.name_th   as vendor_name_th,
    v.name_en   as vendor_name_en,
    v.blacklisted,
    (not t.disqualified
     and t.sow_complete
     and not v.blacklisted)  as qualified
  from v_quote_totals t
  join vendors v on v.id = t.vendor_id
)
select
  b.*,
  case when b.qualified then
    rank() over (partition by b.pr_id, b.qualified order by b.grand_total asc)
  end as rank_no,
  b.grand_total = min(b.grand_total) filter (where b.qualified)
                    over (partition by b.pr_id) as is_cheapest,
  case
    when not b.qualified and b.disqualified     then 'disqualified'
    when not b.qualified and b.blacklisted      then 'blacklisted'
    when not b.qualified and not b.sow_complete then 'sow_incomplete'
    else 'ok'
  end as exclude_reason
from base b;

-- ----------------------------------------------------------------------------
-- ยอดคงเหลืองบประมาณ
--   available = งบ − (กันไว้ − คืนแล้ว) − จ่ายจริง
-- ----------------------------------------------------------------------------
create view v_budget_balance with (security_invoker = true) as
select
  b.id            as budget_id,
  b.cost_center_id,
  cc.code         as cost_center_code,
  cc.name_th      as cost_center_name_th,
  cc.name_en      as cost_center_name_en,
  b.project_id,
  p.code          as project_code,
  p.name_th       as project_name_th,
  p.name_en       as project_name_en,
  b.fiscal_year,
  b.amount,
  coalesce(l.committed, 0) as committed,
  coalesce(l.released, 0)  as released,
  coalesce(l.actual, 0)    as actual,
  b.amount
    - (coalesce(l.committed, 0) - coalesce(l.released, 0))
    - coalesce(l.actual, 0)  as available,
  case when b.amount = 0 then 0 else
    round(
      ((coalesce(l.committed,0) - coalesce(l.released,0) + coalesce(l.actual,0))
       * 10000.0) / b.amount
    )::integer
  end as used_bp
from budgets b
join cost_centers cc on cc.id = b.cost_center_id
left join projects p on p.id = b.project_id
left join lateral (
  select
    sum(amount) filter (where kind = 'commit')::bigint  as committed,
    sum(amount) filter (where kind = 'release')::bigint as released,
    sum(amount) filter (where kind = 'actual')::bigint  as actual
  from budget_ledger bl where bl.budget_id = b.id
) l on true;

-- ----------------------------------------------------------------------------
-- ประวัติผู้ขาย — สรุปผลงานจริงจากที่ผู้ตรวจรับให้ไว้ (ส่งตรงเวลาไหม ตรวจผ่านรอบแรกไหม)
-- suggested_history_score ยังคืนค่าไว้ให้ใช้อ้างอิง แต่ตอนนี้ไม่มีอะไรในระบบเอาไปคิดต่อ
-- ผู้ขายรายใหม่ที่ยังไม่เคยมีผลงาน ให้ 12/20 (กลางๆ ไม่ได้เปรียบไม่เสียเปรียบ)
-- ----------------------------------------------------------------------------
create view v_vendor_history with (security_invoker = true) as
select
  v.id                                as vendor_id,
  v.code,
  v.name_th,
  v.name_en,
  v.blacklisted,
  count(r.id)                         as rating_count,
  count(r.id) filter (where r.on_time)             as on_time_count,
  count(r.id) filter (where r.passed_first_inspection) as first_pass_count,
  coalesce(sum(r.late_days), 0)       as total_late_days,
  coalesce(sum(r.reject_count), 0)    as total_rejects,
  case when count(r.id) = 0 then 12
       else round(avg(r.score))::smallint end as suggested_history_score
from vendors v
left join vendor_ratings r on r.vendor_id = v.id
group by v.id, v.code, v.name_th, v.name_en, v.blacklisted;

-- ----------------------------------------------------------------------------
-- ยอดรับของสะสมรายบรรทัด (ใช้ใน 3-way match)
-- ----------------------------------------------------------------------------
create view v_po_line_received with (security_invoker = true) as
select
  pl.id            as po_line_id,
  pl.po_id,
  pl.qty           as qty_ordered,
  pl.unit_price,
  coalesce(sum(gl.qty_accepted), 0) as qty_accepted,
  coalesce(sum(gl.qty_rejected), 0) as qty_rejected
from po_lines pl
left join gr_lines gl on gl.po_line_id = pl.id
left join grs g on g.id = gl.gr_id
group by pl.id, pl.po_id, pl.qty, pl.unit_price;

-- ----------------------------------------------------------------------------
-- ยอดวางบิลสะสมรายบรรทัด (ใช้ใน 3-way match)
-- ----------------------------------------------------------------------------
create view v_po_line_invoiced with (security_invoker = true) as
select
  pl.id  as po_line_id,
  pl.po_id,
  coalesce(sum(il.qty), 0)    as qty_invoiced,
  coalesce(sum(il.amount), 0)::bigint as amount_invoiced
from po_lines pl
left join invoice_lines il on il.po_line_id = pl.id
group by pl.id, pl.po_id;

-- ----------------------------------------------------------------------------
-- กล่อง "รออนุมัติของฉัน" — เห็นเฉพาะขั้นที่ถึงคิวจริงเท่านั้น
-- ขั้นถัดไปมองไม่เห็นเรื่องจนกว่าขั้นก่อนหน้าจะ approve
-- ----------------------------------------------------------------------------
create view v_pending_approvals with (security_invoker = true) as
select a.*
from approvals a
where a.decision = 'pending'
  and not exists (
    select 1 from approvals prev
    where prev.doc_type = a.doc_type
      and prev.doc_id   = a.doc_id
      and prev.step_no  < a.step_no
      and prev.decision <> 'approved'
  );

-- ----------------------------------------------------------------------------
-- สรุปสถานะ PR สำหรับหน้ารายการ
-- ----------------------------------------------------------------------------
create view v_pr_summary with (security_invoker = true) as
select
  pr.id, pr.pr_no, pr.fiscal_year, pr.status, pr.created_at, pr.needed_by,
  pr.purpose_th, pr.purpose_en, pr.estimated_amount,
  up.full_name_th as requester_name_th,
  up.full_name_en as requester_name_en,
  cc.code as cost_center_code,
  p.code  as project_code,
  (select count(*) from pr_lines l where l.pr_id = pr.id)  as line_count,
  (select count(*) from quotes q where q.pr_id = pr.id)    as quote_count,
  -- ยอดที่ชนะจริง = รวมเฉพาะ "บรรทัดที่ชนะ" ของแต่ละใบเสนอราคา แล้วบวกค่าส่ง + VAT ของใบนั้น
  -- ห้ามใช้ grand_total ของทั้งใบ เพราะ (1) รวมบรรทัดที่ไม่ได้ชนะเข้ามาด้วย
  -- และ (2) join กับ line_awards ตรงๆ จะนับซ้ำเท่าจำนวนบรรทัดที่ชนะจากใบเดียวกัน
  -- ต้องคิดให้ตรงกับ fn_submit_for_approval เป๊ะ ไม่งั้นเลขบนจอกับเลขที่อนุมัติจริงจะคนละตัว
  (select coalesce(sum(x.total), 0)::bigint from (
     select (s.sub + q.freight
             + round((s.sub + q.freight) * q.vat_bp / 10000.0)::bigint) as total
     from (select la.quote_id, sum(ql.amount)::bigint as sub
             from line_awards la
             join quote_lines ql on ql.id = la.quote_line_id
            where la.pr_id = pr.id
            group by la.quote_id) s
     join quotes q on q.id = s.quote_id
   ) x)                                                    as awarded_total,
  (select count(*) from pos po where po.pr_id = pr.id)     as po_count
from prs pr
join user_profiles up on up.id = pr.requester_id
join cost_centers cc on cc.id = pr.cost_center_id
left join projects p on p.id = pr.project_id;
