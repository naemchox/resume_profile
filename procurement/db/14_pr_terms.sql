-- ============================================================================
-- เงื่อนไขสัญญาเป็นตัวเลขจริงในใบขอซื้อ — ไม่ให้ไปตั้งค่าเอาตอนออกใบสั่งซื้อ
--
-- ทำไมต้องมีไฟล์นี้
--   ขอบเขตงานข้อ 3 (ส่งมอบ) 4 (รับประกัน/หลักประกัน) 5 (ค่าปรับล่าช้า) เป็นเงื่อนไข
--   ที่ผู้ขอซื้อกำหนดตั้งแต่ตอนทำใบขอซื้อ และผู้ขายเซ็นรับไปตอนเสนอราคา แต่ของเดิม
--   pr_sow เก็บได้แค่ requirement_th ซึ่งเป็นข้อความอิสระ ไม่มีที่เก็บตัวเลข ผลคือ
--   ตอนออกใบสั่งซื้อระบบไม่มีค่าให้ดึง เลยต้องให้ฝ่ายจัดซื้อพิมพ์ % และวันที่ใหม่อีกรอบ
--   ทั้งที่ตกลงกันไปแล้ว — พิมพ์ซ้ำเมื่อไหร่ก็คลาดเคลื่อนกับภาคผนวกท้ายสัญญาเมื่อนั้น
--
-- กติกาใหม่
--   ผู้ขอซื้อกรอกตัวเลขในการ์ดขอบเขตงานตอนทำใบขอซื้อ -> ล็อกพร้อม SOW
--   ตอนออกใบสั่งซื้อระบบอ่านจากใบขอซื้อให้เอง ไม่มีช่องให้พิมพ์ใหม่
--
-- ที่เปลี่ยน 2 จุด
--   1. prs           เพิ่ม 4 คอลัมน์เก็บเงื่อนไขเป็นตัวเลข (ว่างได้ = ใช้ค่าตั้งต้นระบบ)
--   2. fn_issue_po   ลำดับที่มาของค่าใหม่ ใบขอซื้อมาก่อน p_opts เสมอ
--
-- ทำไม prs ชนะ p_opts
--   p_opts คือค่าที่ส่งมาจากหน้าจอ ส่วน prs คือเงื่อนไขที่ผ่านการอนุมัติมาแล้วทุกขั้น
--   ถ้าปล่อยให้หน้าจอทับได้ ก็เท่ากับเปิดทางให้แก้สัญญาเงียบๆ ตอนกดออกใบ
--   ใบขอซื้อที่ไม่ได้กรอก (ของเก่า) คอลัมน์เป็น null จึงตกไปใช้ p_opts แล้วค่อยตกไปใช้
--   ค่าตั้งต้นเดิมตามลำดับ — ของเก่าที่ออกค้างไว้จึงยังออกได้เหมือนเดิม
--
-- รันซ้ำได้
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ที่เก็บเงื่อนไขสัญญาในใบขอซื้อ
-- ----------------------------------------------------------------------------
alter table prs add column if not exists delivery_date    date;
alter table prs add column if not exists penalty_rate_bp  integer;
alter table prs add column if not exists penalty_cap_bp   integer;
alter table prs add column if not exists retention_bp     integer;

do $$ begin
  alter table prs add constraint prs_penalty_rate_bp_check
    check (penalty_rate_bp is null or penalty_rate_bp between 0 and 10000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table prs add constraint prs_penalty_cap_bp_check
    check (penalty_cap_bp is null or penalty_cap_bp between 0 and 10000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table prs add constraint prs_retention_bp_check
    check (retention_bp is null or retention_bp between 0 and 10000);
exception when duplicate_object then null; end $$;

comment on column prs.delivery_date   is 'ขอบเขตงานข้อ 3 — วันส่งมอบที่ตกลงไว้ ใช้เป็น promised_date ของใบสั่งซื้อ';
comment on column prs.penalty_rate_bp is 'ขอบเขตงานข้อ 5 — ค่าปรับล่าช้าต่อวัน (basis point, 10 = 0.1%)';
comment on column prs.penalty_cap_bp  is 'ขอบเขตงานข้อ 5 — เพดานค่าปรับ (basis point, 1000 = 10%)';
comment on column prs.retention_bp    is 'ขอบเขตงานข้อ 4 — เงินประกันผลงานที่หักไว้ (basis point)';

-- ----------------------------------------------------------------------------
-- 2. ออกใบสั่งซื้อ — ดึงเงื่อนไขจากใบขอซื้อก่อนเสมอ
--    เหมือน 04_functions.sql ทุกอย่าง ต่างแค่ 4 บรรทัดที่ทำเครื่องหมาย << ไว้
-- ----------------------------------------------------------------------------
create or replace function fn_issue_po(p_pr uuid, p_opts jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pr prs; v_budget uuid; q record; v_po uuid; v_po_no text;
  v_sub bigint; v_vat bigint; v_total bigint; v_seq smallint;
  v_promised date; v_result jsonb := '[]'::jsonb; l record; s record;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(has_any_role('purchasing','admin'), 'เฉพาะฝ่ายจัดซื้อเท่านั้น');
  perform fn_require(v_pr.status = 'approved', 'ใบขอซื้อยังไม่ผ่านการอนุมัติครบทุกขั้น');
  perform fn_require(not exists (select 1 from pos where pr_id = p_pr),
                     'ใบขอซื้อนี้ออก PO ไปแล้ว');

  v_budget := fn_budget_for_pr(p_pr);

  for q in
    select la.quote_id, qt.vendor_id, qt.freight, qt.vat_bp, qt.delivery_days,
           qt.warranty_days, sum(ql.amount)::bigint as sub
    from line_awards la
    join quote_lines ql on ql.id = la.quote_line_id
    join quotes qt on qt.id = la.quote_id
    where la.pr_id = p_pr
    group by la.quote_id, qt.vendor_id, qt.freight, qt.vat_bp, qt.delivery_days, qt.warranty_days
  loop
    v_sub   := q.sub;
    v_vat   := round((v_sub + q.freight) * q.vat_bp / 10000.0)::bigint;
    v_total := v_sub + q.freight + v_vat;

    v_promised := coalesce(
      v_pr.delivery_date,                                    -- << ขอบเขตงานข้อ 3 มาก่อน
      (p_opts->>'promised_date')::date,
      case when q.delivery_days is not null then current_date + q.delivery_days end,
      v_pr.needed_by,
      current_date + 30);

    v_po_no := fn_next_doc_no('po', v_pr.fiscal_year);

    insert into pos (po_no, fiscal_year, pr_id, vendor_id, budget_id,
                     subtotal, freight, vat_bp, vat_amount, grand_total,
                     penalty_rate_bp, penalty_cap_bp, retention_bp, warranty_days,
                     promised_date, wht_code, issued_by)
    values (v_po_no, v_pr.fiscal_year, p_pr, q.vendor_id, v_budget,
            v_sub, q.freight, q.vat_bp, v_vat, v_total,
            coalesce(v_pr.penalty_rate_bp, (p_opts->>'penalty_rate_bp')::integer, 10),   -- << ข้อ 5
            coalesce(v_pr.penalty_cap_bp,  (p_opts->>'penalty_cap_bp')::integer, 1000),  -- << ข้อ 5
            coalesce(v_pr.retention_bp,    (p_opts->>'retention_bp')::integer, 0),       -- << ข้อ 4
            coalesce(q.warranty_days, 0),
            v_promised,
            coalesce(p_opts->>'wht_code',
                     (select default_wht_code from vendors where id = q.vendor_id)),
            auth.uid())
    returning id into v_po;

    v_seq := 0;
    for l in
      select pl.id as pr_line_id, pl.description, pl.spec, pl.unit,
             ql.qty, ql.unit_price
      from line_awards la
      join pr_lines pl on pl.id = la.pr_line_id
      join quote_lines ql on ql.id = la.quote_line_id
      where la.pr_id = p_pr and la.quote_id = q.quote_id
      order by pl.seq
    loop
      v_seq := v_seq + 1;
      insert into po_lines (po_id, pr_line_id, seq, description, spec, qty, unit, unit_price)
      values (v_po, l.pr_line_id, v_seq, l.description, l.spec, l.qty, l.unit, l.unit_price);
    end loop;

    -- SOW แนบท้ายสัญญา = snapshot แก้ต้นฉบับทีหลังไม่กระทบสัญญานี้
    v_seq := 0;
    for s in
      select c.code, c.title_th, c.title_en, ps.requirement_th, ps.requirement_en,
             coalesce(qs.accepted, false) as accepted, qs.note
      from pr_sow ps
      join sow_clauses c on c.id = ps.sow_clause_id
      left join quote_sow qs on qs.quote_id = q.quote_id and qs.sow_clause_id = ps.sow_clause_id
      where ps.pr_id = p_pr
      order by c.seq
    loop
      v_seq := v_seq + 1;
      insert into po_sow_snapshot (po_id, seq, code, title_th, title_en,
                                   requirement_th, requirement_en, vendor_accepted, vendor_note)
      values (v_po, v_seq, s.code, s.title_th, s.title_en,
              s.requirement_th, s.requirement_en, s.accepted, s.note);
    end loop;

    -- กันงบ
    insert into budget_ledger (budget_id, kind, amount, ref_doc, ref_id, note, created_by)
    values (v_budget, 'commit', v_total, 'po', v_po, v_po_no, auth.uid());

    v_result := v_result || jsonb_build_object('po_id', v_po, 'po_no', v_po_no,
                                               'vendor_id', q.vendor_id, 'total', v_total);
  end loop;

  update prs set status = 'po_issued', updated_at = now() where id = p_pr;
  return v_result;
end $$;
