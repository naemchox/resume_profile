-- ============================================================================
-- RPC — ทุกการ "เปลี่ยนสถานะ" ต้องผ่านที่นี่
-- ทุกฟังก์ชันเป็น SECURITY DEFINER (ข้าม RLS ได้) จึงตรวจสิทธิ์เองทุกตัว
-- หน้าเว็บเรียกผ่าน supabase.rpc() เท่านั้น
-- ============================================================================

create or replace function fn_require(p_cond boolean, p_msg text)
returns void language plpgsql immutable as $$
begin
  if not p_cond then raise exception '%', p_msg using errcode = 'P0001'; end if;
end $$;

-- ----------------------------------------------------------------------------
-- ปีงบประมาณ — ไทยเริ่ม ต.ค. และเรียกชื่อตามปีที่สิ้นสุด (ต.ค.68–ก.ย.69 = ปีงบ 2569)
-- ----------------------------------------------------------------------------
create or replace function fn_fiscal_year(p_date date default current_date)
returns integer language plpgsql stable security definer set search_path = public as $$
declare v_start smallint; v_y integer;
begin
  select fiscal_year_start_month into v_start from company_profile where id = 1;
  v_start := coalesce(v_start, 1);
  v_y := extract(year from p_date)::integer;
  if v_start > 1 and extract(month from p_date)::integer >= v_start then
    v_y := v_y + 1;
  end if;
  return v_y;
end $$;

-- ----------------------------------------------------------------------------
-- เลขที่เอกสาร — ออกจากตรงนี้ที่เดียว ห้ามออกจากฝั่งเบราว์เซอร์
-- ----------------------------------------------------------------------------
create or replace function fn_next_doc_no(p_kind doc_kind, p_fy integer)
returns text language plpgsql security definer set search_path = public as $$
declare v_no integer; v_prefix text;
begin
  insert into doc_sequences (kind, fiscal_year, last_no, prefix)
  values (p_kind, p_fy, 1,
          case p_kind when 'pr' then 'PR' when 'po' then 'PO' when 'gr' then 'GR'
                      when 'invoice' then 'IV' when 'voucher' then 'PV' else 'WT' end)
  on conflict (kind, fiscal_year)
    do update set last_no = doc_sequences.last_no + 1
  returning last_no, prefix into v_no, v_prefix;
  return v_prefix || '-' || p_fy::text || '-' || lpad(v_no::text, 5, '0');
end $$;

-- ============================================================================
-- ตำแหน่ง — ไม่มีใครตั้งตำแหน่งให้ตัวเองได้
-- ============================================================================

create or replace function fn_grant_role(p_user uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_require(has_role('admin'), 'เฉพาะผู้ดูแลระบบเท่านั้นที่ตั้งตำแหน่งได้');
  perform fn_require(p_user <> auth.uid(), 'ตั้งตำแหน่งให้ตัวเองไม่ได้');
  insert into user_roles (user_id, role, granted_by)
  values (p_user, p_role, auth.uid())
  on conflict do nothing;
end $$;

create or replace function fn_revoke_role(p_user uuid, p_role app_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_require(has_role('admin'), 'เฉพาะผู้ดูแลระบบเท่านั้นที่ถอนตำแหน่งได้');
  perform fn_require(p_user <> auth.uid(), 'ถอนตำแหน่งของตัวเองไม่ได้');
  perform fn_require(
    p_role <> 'admin'
    or (select count(*) from user_roles where role = 'admin') > 1,
    'ถอนผู้ดูแลระบบคนสุดท้ายไม่ได้');
  delete from user_roles where user_id = p_user and role = p_role;
end $$;

-- ============================================================================
-- ขั้น 1.1 — ล็อก Scope of Work
-- ============================================================================

create or replace function fn_lock_sow(p_pr uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr prs; v_missing integer;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(v_pr.requester_id = auth.uid() or has_role('admin'),
                     'เฉพาะผู้ขอซื้อเจ้าของเรื่องเท่านั้น');
  perform fn_require(v_pr.status in ('draft','rejected'), 'ใบขอซื้อนี้ล็อก SOW ไปแล้ว');
  perform fn_require(exists (select 1 from pr_lines where pr_id = p_pr),
                     'ต้องมีรายการขอซื้ออย่างน้อย 1 บรรทัด');

  select count(*) into v_missing
  from sow_clauses c
  where c.active and not exists (
    select 1 from pr_sow s where s.pr_id = p_pr and s.sow_clause_id = c.id
                             and coalesce(btrim(s.requirement_th), '') <> ''
  );
  perform fn_require(v_missing = 0,
    format('ยังกรอก Scope of Work ไม่ครบ ขาดอีก %s ข้อ', v_missing));

  update prs set status = 'sow_locked', sow_locked_at = now(), updated_at = now()
  where id = p_pr;

  if v_pr.pr_no is null then
    update prs set pr_no = fn_next_doc_no('pr', v_pr.fiscal_year) where id = p_pr;
  end if;
end $$;

-- ============================================================================
-- ขั้น 2 — บันทึกว่าพิมพ์ใบรายละเอียดขอซื้อส่งผู้ขายแล้ว
-- ============================================================================

create or replace function fn_issue_rfq(p_pr uuid, p_vendor uuid, p_hash text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pr prs; v_id uuid;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(has_any_role('purchasing','admin'), 'เฉพาะฝ่ายจัดซื้อเท่านั้น');
  perform fn_require(v_pr.status in ('sow_locked','rfq_issued','quoting'),
                     'ต้องล็อก Scope of Work ก่อนออกใบขอราคา');

  insert into rfq_prints (pr_id, vendor_id, content_hash, printed_by)
  values (p_pr, p_vendor, p_hash, auth.uid())
  returning id into v_id;

  if v_pr.status = 'sow_locked' then
    update prs set status = 'rfq_issued', updated_at = now() where id = p_pr;
  end if;
  return v_id;
end $$;

-- ============================================================================
-- ขั้น 4 — งบประมาณ
-- ============================================================================

-- โครงการมาก่อน ถ้าไม่มีโครงการค่อยใช้งบของ Cost Center
create or replace function fn_budget_for_pr(p_pr uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_pr prs; v_budget uuid;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');

  if v_pr.project_id is not null then
    select id into v_budget from budgets
    where cost_center_id = v_pr.cost_center_id
      and project_id = v_pr.project_id
      and fiscal_year = v_pr.fiscal_year;
  end if;

  if v_budget is null then
    select id into v_budget from budgets
    where cost_center_id = v_pr.cost_center_id
      and project_id is null
      and fiscal_year = v_pr.fiscal_year;
  end if;

  -- ไม่ได้ตั้งงบไว้ = คืน null ไม่ใช่ error — ด่านงบเป็นของ "ถ้ามี" ไม่ใช่ของบังคับ (ดู 13_budget_optional.sql)
  return v_budget;
end $$;

-- ตรวจงบ คืนผลเป็น jsonb ให้หน้าจอเอาไปแสดง (none / ok / warn / over)
-- 'none' = ศูนย์ต้นทุน/โครงการนี้ยังไม่ได้ตั้งงบในปีงบนี้ — ข้ามด่านงบไปทั้งใบ
create or replace function fn_check_budget(p_pr uuid, p_amount bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_budget uuid; b record; v_used_bp integer; v_verdict text;
begin
  v_budget := fn_budget_for_pr(p_pr);

  if v_budget is null then
    return jsonb_build_object(
      'budget_id', null, 'budget_amount', null, 'available', null,
      'request_amount', p_amount, 'over_amount', 0, 'used_bp_after', null,
      'verdict', 'none');
  end if;

  select * into b from v_budget_balance where budget_id = v_budget;

  if b.amount = 0 then
    v_used_bp := 10001;
  else
    v_used_bp := round(((b.amount - b.available + p_amount) * 10000.0) / b.amount)::integer;
  end if;

  v_verdict := case
    when p_amount > b.available then 'over'
    when v_used_bp >= 9000      then 'warn'
    else 'ok' end;

  return jsonb_build_object(
    'budget_id', v_budget,
    'budget_amount', b.amount,
    'available', b.available,
    'request_amount', p_amount,
    'over_amount', greatest(0, p_amount - b.available),
    'used_bp_after', v_used_bp,
    'verdict', v_verdict
  );
end $$;

create or replace function fn_decide_budget_exception(p_id uuid, p_approve boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare v_ex budget_exceptions;
begin
  select * into v_ex from budget_exceptions where id = p_id;
  perform fn_require(v_ex.id is not null, 'ไม่พบคำขอยกเว้นงบ');
  perform fn_require(has_role('ceo'), 'การขอยกเว้นงบประมาณ อนุมัติได้เฉพาะ CEO');
  perform fn_require(v_ex.decision = 'pending', 'คำขอนี้ตัดสินไปแล้ว');
  perform fn_require(v_ex.requested_by <> auth.uid(), 'ผู้ขอยกเว้นงบ อนุมัติให้ตัวเองไม่ได้');
  perform fn_require(p_approve or coalesce(btrim(p_reason), '') <> '',
                     'การไม่อนุมัติต้องระบุเหตุผล');

  update budget_exceptions
  set decision = (case when p_approve then 'approved' else 'rejected' end)::approval_decision,
      decided_by = auth.uid(), decided_at = now(), decision_reason = p_reason
  where id = p_id;
end $$;

-- ============================================================================
-- ขั้น 5 — เลือกผู้ชนะรายบรรทัด
-- p_awards = [{"pr_line_id":"...","quote_line_id":"...","reason":"..."}]
--
-- ไม่ยุ่งกับงบประมาณเลย — ด่านงบเคยอยู่ตรงนี้ ถอดออกแล้ว (ดู 13_budget_optional.sql)
-- ============================================================================

create or replace function fn_award_pr(p_pr uuid, p_awards jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pr prs; a jsonb; v_line pr_lines; v_ql quote_lines; v_rank record;
  v_cheapest bigint; v_escalate boolean := false; v_total bigint := 0;
  v_line_count integer; v_award_count integer;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(has_any_role('purchasing','admin'), 'เฉพาะฝ่ายจัดซื้อเท่านั้น');
  perform fn_require(v_pr.status in ('rfq_issued','quoting','evaluated'),
                     'สถานะใบขอซื้อไม่อยู่ในขั้นเลือกผู้ชนะ');

  -- ต้องมีอย่างน้อย 1 เจ้าที่ยังอยู่ในการพิจารณา ไม่งั้นตีกลับไปทำขั้น 2 ใหม่
  perform fn_require(
    exists (select 1 from v_quote_ranking r
            where r.pr_id = p_pr
              and (r.qualified or r.exclude_reason = 'sow_incomplete')),
    'ไม่มีใบเสนอราคาที่ยังอยู่ในการพิจารณา — ต้องตีกลับไปขอราคารอบใหม่');

  delete from line_awards where pr_id = p_pr;

  for a in select * from jsonb_array_elements(p_awards) loop
    select * into v_line from pr_lines
      where id = (a->>'pr_line_id')::uuid and pr_id = p_pr;
    perform fn_require(v_line.id is not null, 'รายการที่เลือกไม่อยู่ในใบขอซื้อนี้');

    select * into v_ql from quote_lines where id = (a->>'quote_line_id')::uuid;
    perform fn_require(v_ql.id is not null, 'ไม่พบบรรทัดในใบเสนอราคา');
    perform fn_require(v_ql.pr_line_id = v_line.id,
                       'บรรทัดใบเสนอราคาไม่ตรงกับรายการที่ขอซื้อ');

    select * into v_rank from v_quote_ranking where quote_id = v_ql.quote_id;
    -- เลือกได้ทุกเจ้าที่ยังอยู่ในการพิจารณา ไม่ได้บังคับว่าต้องเป็นเจ้าที่ถูกที่สุด
    -- รับขอบเขตงานไม่ครบก็ยังเลือกได้ เพราะข้อที่ไม่รับยังคุยกับผู้ขายได้ก่อนออกใบสั่งซื้อ
    -- ที่ปิดประตูจริงเหลือสองกรณีที่คนตั้งใจปิดเอง — ตัดออกด้วยมือ / ผู้ขายติดบัญชีดำ
    perform fn_require(v_rank.qualified or v_rank.exclude_reason = 'sow_incomplete',
      format('ใบเสนอราคาที่เลือกถูกตัดออกจากการพิจารณา (%s)', v_rank.exclude_reason));

    -- ราคาต่อหน่วยที่ถูกที่สุดของรายการนี้ ในกลุ่มที่ยังอยู่ในการพิจารณา
    select min(ql2.unit_price) into v_cheapest
    from quote_lines ql2
    join v_quote_ranking r2 on r2.quote_id = ql2.quote_id
    where ql2.pr_line_id = v_line.id
      and (r2.qualified or r2.exclude_reason = 'sow_incomplete');

    if v_ql.unit_price > v_cheapest then
      perform fn_require(coalesce(btrim(a->>'reason'), '') <> '',
        format('รายการ "%s" ไม่ได้เลือกเจ้าที่ถูกที่สุด ต้องระบุเหตุผล', v_line.description));
      v_escalate := true;
    end if;

    insert into line_awards (pr_line_id, pr_id, quote_id, quote_line_id,
                             reason_if_not_cheapest, awarded_by)
    values (v_line.id, p_pr, v_ql.quote_id, v_ql.id, nullif(btrim(a->>'reason'), ''), auth.uid());
  end loop;

  select count(*) into v_line_count  from pr_lines    where pr_id = p_pr;
  select count(*) into v_award_count from line_awards where pr_id = p_pr;
  perform fn_require(v_line_count = v_award_count,
    'ต้องเลือกผู้ชนะให้ครบทุกบรรทัดก่อน');

  -- ยอดรวมที่จะสั่งซื้อจริง (แยกตามใบเสนอราคา แล้วบวกค่าส่ง+VAT ของแต่ละเจ้า)
  select coalesce(sum(x.total), 0)::bigint into v_total from (
    select (s.sub + q.freight
            + round((s.sub + q.freight) * q.vat_bp / 10000.0)::bigint) as total
    from (select la.quote_id, sum(ql.amount)::bigint as sub
          from line_awards la join quote_lines ql on ql.id = la.quote_line_id
          where la.pr_id = p_pr group by la.quote_id) s
    join quotes q on q.id = s.quote_id
  ) x;

  insert into pr_awards (pr_id, escalated, note, awarded_by)
  values (p_pr, v_escalate, p_note, auth.uid())
  on conflict (pr_id) do update
    set escalated = excluded.escalated, note = excluded.note,
        awarded_by = excluded.awarded_by, awarded_at = now();

  update prs set status = 'evaluated', updated_at = now() where id = p_pr;

  return jsonb_build_object('awarded_total', v_total, 'escalated', v_escalate);
end $$;

-- ============================================================================
-- ขั้น 6 — สร้างสายอนุมัติจากวงเงิน "ตอนที่ยื่น" แล้วล็อกไว้
-- ============================================================================

create or replace function fn_submit_for_approval(p_pr uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pr prs; v_total bigint; v_escalate boolean; r record;
  v_step smallint := 0; v_covered boolean := false; v_extra integer := 0;
  v_chain jsonb := '[]'::jsonb;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(has_any_role('purchasing','admin'), 'เฉพาะฝ่ายจัดซื้อเท่านั้น');
  perform fn_require(v_pr.status = 'evaluated', 'ต้องเลือกผู้ชนะให้เรียบร้อยก่อน');

  select escalated into v_escalate from pr_awards where pr_id = p_pr;
  v_escalate := coalesce(v_escalate, false);

  select coalesce(sum(x.total), 0)::bigint into v_total from (
    select (s.sub + q.freight
            + round((s.sub + q.freight) * q.vat_bp / 10000.0)::bigint) as total
    from (select la.quote_id, sum(ql.amount)::bigint as sub
          from line_awards la join quote_lines ql on ql.id = la.quote_line_id
          where la.pr_id = p_pr group by la.quote_id) s
    join quotes q on q.id = s.quote_id
  ) x;

  delete from approvals where doc_type = 'pr' and doc_id = p_pr;

  if v_escalate then v_extra := 1; end if;

  for r in select * from approval_limits where active order by step_order loop
    exit when v_covered and v_extra = 0;
    if v_covered then v_extra := v_extra - 1; end if;

    v_step := v_step + 1;
    insert into approvals (doc_type, doc_id, step_no, role)
    values ('pr', p_pr, v_step, r.role);
    v_chain := v_chain || jsonb_build_object('step', v_step, 'role', r.role);

    if not v_covered and (r.max_amount is null or r.max_amount >= v_total) then
      v_covered := true;
    end if;
  end loop;

  perform fn_require(v_covered,
    'ยอดเงินเกินวงเงินสูงสุดที่ตั้งไว้ทุกขั้น — ให้ผู้ดูแลระบบตรวจตารางวงเงินอนุมัติ');

  update prs set status = 'pending_approval', submitted_at = now(), updated_at = now()
  where id = p_pr;

  return jsonb_build_object('amount', v_total, 'escalated', v_escalate, 'chain', v_chain);
end $$;

create or replace function fn_decide_approval(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_a approvals; v_pr prs; v_blocked integer; v_remaining integer;
begin
  select * into v_a from approvals where id = p_id;
  perform fn_require(v_a.id is not null, 'ไม่พบรายการอนุมัติ');
  perform fn_require(v_a.decision = 'pending', 'รายการนี้ตัดสินไปแล้ว');
  perform fn_require(has_role(v_a.role),
    'คุณไม่ได้อยู่ในตำแหน่งที่อนุมัติขั้นนี้');

  select count(*) into v_blocked from approvals prev
  where prev.doc_type = v_a.doc_type and prev.doc_id = v_a.doc_id
    and prev.step_no < v_a.step_no and prev.decision <> 'approved';
  perform fn_require(v_blocked = 0, 'ขั้นก่อนหน้ายังไม่อนุมัติ');

  perform fn_require(p_approve or coalesce(btrim(p_reason), '') <> '',
                     'การตีกลับต้องระบุเหตุผล');

  if v_a.doc_type = 'pr' then
    select * into v_pr from prs where id = v_a.doc_id;
    perform fn_require(v_pr.requester_id <> auth.uid(),
                       'ผู้ขอซื้ออนุมัติเรื่องของตัวเองไม่ได้');
    perform fn_require(
      not exists (select 1 from quotes q where q.pr_id = v_pr.id and q.entered_by = auth.uid()),
      'คนคีย์ใบเสนอราคาของเรื่องนี้ อนุมัติเรื่องนี้ไม่ได้');
  end if;

  update approvals
  set decision = (case when p_approve then 'approved' else 'rejected' end)::approval_decision,
      approver_id = auth.uid(), reason = p_reason, decided_at = now()
  where id = p_id;

  if v_a.doc_type = 'pr' then
    if not p_approve then
      delete from approvals
      where doc_type = 'pr' and doc_id = v_a.doc_id and decision = 'pending';
      update prs set status = 'rejected', reject_reason = p_reason, updated_at = now()
      where id = v_a.doc_id;
    else
      select count(*) into v_remaining from approvals
      where doc_type = 'pr' and doc_id = v_a.doc_id and decision = 'pending';
      if v_remaining = 0 then
        update prs set status = 'approved', approved_at = now(), updated_at = now()
        where id = v_a.doc_id;
      end if;
    end if;
  end if;
end $$;

-- ============================================================================
-- ขั้น 7 — ออก PO (แยกตามผู้ขาย) + กันงบ + snapshot SOW
-- p_opts: {"retention_bp":500,"penalty_rate_bp":10,"penalty_cap_bp":1000,
--          "wht_code":"S3","promised_date":"2026-09-30"}
-- ============================================================================

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
      v_pr.delivery_date,
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
            coalesce(v_pr.penalty_rate_bp, (p_opts->>'penalty_rate_bp')::integer, 10),
            coalesce(v_pr.penalty_cap_bp,  (p_opts->>'penalty_cap_bp')::integer, 1000),
            coalesce(v_pr.retention_bp,    (p_opts->>'retention_bp')::integer, 0),
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

-- ============================================================================
-- ขั้น 9 — 3-Way Match : PO ↔ ใบรับของ ↔ ใบแจ้งหนี้
-- ============================================================================

-- แปลงสตางค์เป็นข้อความบาทให้คนอ่านออก — ข้อความ mismatch ไปโผล่บนหน้าจอผู้ใช้ตรงๆ
create or replace function fn_baht(p_satang bigint)
returns text language sql immutable as $$
  select to_char(coalesce(p_satang,0) / 100.0, 'FM999,999,999.00');
$$;

create or replace function fn_match_invoice(p_invoice uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices; v_po pos; v_mis jsonb := '[]'::jsonb; r record;
  v_calc_sub bigint; v_calc_vat bigint;
begin
  select * into v_inv from invoices where id = p_invoice;
  perform fn_require(v_inv.id is not null, 'ไม่พบใบแจ้งหนี้');
  perform fn_require(has_any_role('purchasing','accounting','admin'),
                     'เฉพาะฝ่ายจัดซื้อหรือบัญชีเท่านั้น');
  select * into v_po from pos where id = v_inv.po_id;

  -- ต้องมีการตรวจรับก่อน
  if not exists (select 1 from grs g join deliveries d on d.id = g.delivery_id
                 where d.po_id = v_po.id and g.result <> 'rejected') then
    v_mis := v_mis || jsonb_build_object('code','no_gr',
      'message_th','ยังไม่มีการตรวจรับงานของ PO นี้',
      'message_en','No accepted goods receipt for this PO');
  end if;

  -- เทียบรายบรรทัด: จำนวนที่วางบิล ต้องไม่เกินจำนวนที่ตรวจรับ และราคาต้องตรง PO
  for r in
    select pl.seq, pl.description, pl.qty as qty_po, pl.unit_price as price_po,
           coalesce(rc.qty_accepted, 0) as qty_accepted,
           il.qty as qty_invoiced, il.unit_price as price_invoiced
    from invoice_lines il
    join po_lines pl on pl.id = il.po_line_id
    left join v_po_line_received rc on rc.po_line_id = pl.id
    where il.invoice_id = p_invoice
  loop
    if r.price_invoiced <> r.price_po then
      v_mis := v_mis || jsonb_build_object('code','price_mismatch','line', r.seq,
        'message_th', format('บรรทัด %s ราคาต่อหน่วยไม่ตรง PO (PO %s / บิล %s บาท)',
                             r.seq, fn_baht(r.price_po), fn_baht(r.price_invoiced)),
        'message_en', format('Line %s unit price differs from PO', r.seq));
    end if;
    if r.qty_invoiced > r.qty_accepted then
      v_mis := v_mis || jsonb_build_object('code','qty_over_received','line', r.seq,
        'message_th', format('บรรทัด %s วางบิล %s แต่ตรวจรับแล้วแค่ %s',
                             r.seq, r.qty_invoiced, r.qty_accepted),
        'message_en', format('Line %s invoiced qty exceeds accepted qty', r.seq));
    end if;
    if r.qty_invoiced > r.qty_po then
      v_mis := v_mis || jsonb_build_object('code','qty_over_po','line', r.seq,
        'message_th', format('บรรทัด %s วางบิลเกินจำนวนใน PO', r.seq),
        'message_en', format('Line %s invoiced qty exceeds PO qty', r.seq));
    end if;
  end loop;

  -- ค่าขนส่ง: ต้องตรงกับที่ตกลงไว้ใน PO ไม่งั้นเป็นช่องให้บวกเงินเข้ามาเงียบๆ
  if v_inv.freight <> v_po.freight then
    v_mis := v_mis || jsonb_build_object('code','freight_mismatch',
      'message_th', format('ค่าขนส่งไม่ตรง PO (PO %s / บิล %s บาท)',
                           fn_baht(v_po.freight), fn_baht(v_inv.freight)),
      'message_en','Freight charge differs from the PO');
  end if;

  -- บรรทัดที่ไม่มีใน PO
  if exists (select 1 from invoice_lines il
             where il.invoice_id = p_invoice
               and not exists (select 1 from po_lines pl
                               where pl.id = il.po_line_id and pl.po_id = v_po.id)) then
    v_mis := v_mis || jsonb_build_object('code','line_not_in_po',
      'message_th','มีบรรทัดในใบแจ้งหนี้ที่ไม่มีใน PO',
      'message_en','Invoice contains lines not present in the PO');
  end if;

  -- ยอดรวม
  select coalesce(sum(amount), 0)::bigint into v_calc_sub
  from invoice_lines where invoice_id = p_invoice;
  v_calc_sub := v_calc_sub + v_inv.freight;
  v_calc_vat := round(v_calc_sub * v_po.vat_bp / 10000.0)::bigint;

  if v_inv.subtotal <> v_calc_sub then
    v_mis := v_mis || jsonb_build_object('code','subtotal_mismatch',
      'message_th','ยอดก่อนภาษีในหัวบิล ไม่เท่ากับผลรวมรายบรรทัดบวกค่าขนส่ง',
      'message_en','Invoice subtotal does not equal sum of lines plus freight');
  end if;
  if v_inv.vat_amount <> v_calc_vat then
    v_mis := v_mis || jsonb_build_object('code','vat_mismatch',
      'message_th', format('ภาษีมูลค่าเพิ่มไม่ตรงกับที่คำนวณได้ (ควรเป็น %s บาท)', fn_baht(v_calc_vat)),
      'message_en','VAT amount does not match the computed value');
  end if;
  if v_inv.grand_total <> v_inv.subtotal + v_inv.vat_amount then
    v_mis := v_mis || jsonb_build_object('code','total_mismatch',
      'message_th','ยอดรวมสุทธิไม่เท่ากับยอดก่อนภาษีบวกภาษี',
      'message_en','Grand total does not equal subtotal plus VAT');
  end if;

  insert into match_results (invoice_id, status, mismatches, matched_by)
  values (p_invoice,
          (case when jsonb_array_length(v_mis) = 0 then 'matched' else 'mismatched' end)::match_status,
          v_mis, auth.uid())
  on conflict (invoice_id) do update
    set status = excluded.status, mismatches = excluded.mismatches,
        matched_at = now(), matched_by = excluded.matched_by;

  update invoices
  set status = (case when jsonb_array_length(v_mis) = 0 then 'matched' else 'mismatched' end)::invoice_status
  where id = p_invoice;

  return jsonb_build_object(
    'status', case when jsonb_array_length(v_mis) = 0 then 'matched' else 'mismatched' end,
    'mismatches', v_mis);
end $$;

-- ============================================================================
-- ขั้น 10 — ตั้งเบิก : หักค่าปรับล่าช้า + เงินประกันผลงาน + ภาษีหัก ณ ที่จ่าย
-- ============================================================================

create or replace function fn_create_voucher(
  p_invoice uuid, p_wht_code text default null,
  p_other bigint default 0, p_other_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv invoices; v_po pos; v_id uuid; v_no text;
  v_last_delivery date; v_late integer; v_penalty bigint; v_cap bigint;
  v_penalty_before bigint; v_retention bigint; v_wht_code text;
  v_rate integer; v_wht bigint; v_net bigint;
begin
  select * into v_inv from invoices where id = p_invoice;
  perform fn_require(v_inv.id is not null, 'ไม่พบใบแจ้งหนี้');
  perform fn_require(has_any_role('purchasing','accounting','admin'),
                     'เฉพาะฝ่ายจัดซื้อหรือบัญชีเท่านั้น');
  perform fn_require(v_inv.status = 'matched',
                     'ใบแจ้งหนี้ยังจับคู่ไม่ผ่าน 3-Way Match — ตั้งเบิกไม่ได้');
  perform fn_require(not exists (select 1 from payment_vouchers where invoice_id = p_invoice),
                     'ใบแจ้งหนี้นี้ตั้งเบิกไปแล้ว');

  select * into v_po from pos where id = v_inv.po_id;

  -- ค่าปรับล่าช้า คิดจากวันส่งจริงล่าสุดที่ผ่านการตรวจรับ
  select max(d.delivered_date) into v_last_delivery
  from deliveries d join grs g on g.delivery_id = d.id
  where d.po_id = v_po.id and g.result <> 'rejected';

  v_late := greatest(0, coalesce(v_last_delivery - v_po.promised_date, 0));
  v_cap  := round(v_po.grand_total * v_po.penalty_cap_bp / 10000.0)::bigint;
  v_penalty := least(
    round(v_po.grand_total * v_po.penalty_rate_bp / 10000.0 * v_late)::bigint,
    v_cap);

  -- ค่าปรับหักครั้งเดียวต่อ PO — หักไปแล้วเท่าไหร่ในบิลก่อนหน้า ให้ลบออก
  select coalesce(sum(pv.penalty_amount), 0)::bigint into v_penalty_before
  from payment_vouchers pv join invoices i2 on i2.id = pv.invoice_id
  where i2.po_id = v_po.id;
  v_penalty := greatest(0, v_penalty - v_penalty_before);

  -- เงินประกันผลงาน หักจากมูลค่างานก่อน VAT
  v_retention := round(v_inv.subtotal * v_po.retention_bp / 10000.0)::bigint;

  -- ภาษีหัก ณ ที่จ่าย คิดจากฐานก่อน VAT
  v_wht_code := coalesce(p_wht_code, v_po.wht_code);
  if v_wht_code is not null then
    select rate_bp into v_rate from wht_rates where code = v_wht_code and active;
    perform fn_require(v_rate is not null, 'ไม่พบอัตราภาษีหัก ณ ที่จ่ายที่เลือก');
    v_wht := round(v_inv.subtotal * v_rate / 10000.0)::bigint;
  else
    v_wht := 0;
  end if;

  v_net := v_inv.grand_total - v_penalty - v_retention - v_wht - coalesce(p_other, 0);
  perform fn_require(v_net >= 0, 'ยอดจ่ายสุทธิติดลบ — ตรวจรายการหักอีกครั้ง');

  v_no := fn_next_doc_no('voucher', v_inv.fiscal_year);

  insert into payment_vouchers (voucher_no, fiscal_year, invoice_id, gross, late_days,
                                penalty_amount, retention_amount, wht_code, wht_base,
                                wht_amount, other_deduction, other_deduction_note,
                                net_amount, prepared_by)
  values (v_no, v_inv.fiscal_year, p_invoice, v_inv.grand_total, v_late,
          v_penalty, v_retention, v_wht_code, v_inv.subtotal,
          v_wht, coalesce(p_other, 0), p_other_note, v_net, auth.uid())
  returning id into v_id;

  update invoices set status = 'voucher_created' where id = p_invoice;

  return jsonb_build_object('voucher_id', v_id, 'voucher_no', v_no,
    'gross', v_inv.grand_total, 'late_days', v_late, 'penalty', v_penalty,
    'retention', v_retention, 'wht', v_wht, 'net', v_net);
end $$;

-- คนคีย์ใบแจ้งหนี้ กดอนุมัติจ่ายเองไม่ได้
create or replace function fn_decide_voucher(p_id uuid, p_approve boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_v payment_vouchers; v_inv invoices;
begin
  select * into v_v from payment_vouchers where id = p_id;
  perform fn_require(v_v.id is not null, 'ไม่พบใบสำคัญจ่าย');
  perform fn_require(v_v.decision = 'pending', 'ใบสำคัญจ่ายนี้ตัดสินไปแล้ว');
  perform fn_require(has_any_role('accounting','pd','ceo','admin'),
                     'คุณไม่มีสิทธิ์อนุมัติจ่าย');

  select * into v_inv from invoices where id = v_v.invoice_id;
  perform fn_require(v_inv.entered_by <> auth.uid(),
    'คนคีย์ใบแจ้งหนี้ กดอนุมัติจ่ายเองไม่ได้ — ต้องเป็นอีกคน');
  perform fn_require(v_v.prepared_by <> auth.uid(),
    'คนตั้งเบิก กดอนุมัติจ่ายเองไม่ได้ — ต้องเป็นอีกคน');
  perform fn_require(p_approve or coalesce(btrim(p_reason), '') <> '',
                     'การไม่อนุมัติต้องระบุเหตุผล');

  update payment_vouchers
  set decision = (case when p_approve then 'approved' else 'rejected' end)::approval_decision,
      approved_by = auth.uid(), approved_at = now(),
      reject_reason = case when p_approve then null else p_reason end
  where id = p_id;

  if not p_approve then
    update invoices set status = 'matched' where id = v_v.invoice_id;
  end if;
end $$;

-- ============================================================================
-- ขั้น 11 — จ่ายเงินจริง + ออกเลขหนังสือรับรองหักภาษี ณ ที่จ่าย + ตัดงบจริง
-- ============================================================================

create or replace function fn_record_payment(
  p_voucher uuid, p_paid_date date, p_method text, p_ref_no text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_v payment_vouchers; v_inv invoices; v_po pos; v_id uuid; v_cert text;
  v_all_paid boolean;
begin
  select * into v_v from payment_vouchers where id = p_voucher;
  perform fn_require(v_v.id is not null, 'ไม่พบใบสำคัญจ่าย');
  perform fn_require(has_any_role('accounting','admin'), 'เฉพาะฝ่ายบัญชีเท่านั้น');
  perform fn_require(v_v.decision = 'approved', 'ใบสำคัญจ่ายยังไม่ได้รับอนุมัติ');
  perform fn_require(not exists (select 1 from payments where voucher_id = p_voucher),
                     'ใบสำคัญจ่ายนี้จ่ายไปแล้ว');
  perform fn_require(coalesce(btrim(p_ref_no), '') <> '', 'ต้องระบุเลขอ้างอิงการจ่าย');

  select * into v_inv from invoices where id = v_v.invoice_id;
  select * into v_po  from pos where id = v_inv.po_id;

  if v_v.wht_amount > 0 then
    v_cert := fn_next_doc_no('wht_cert', v_v.fiscal_year);
  end if;

  insert into payments (voucher_id, paid_date, method, ref_no, wht_cert_no, note, paid_by)
  values (p_voucher, p_paid_date, p_method, p_ref_no, v_cert, p_note, auth.uid())
  returning id into v_id;

  update invoices set status = 'paid' where id = v_inv.id;

  -- งบ: ปลดยอดที่กันไว้เท่ากับมูลค่าบิล แล้วลงเป็นค่าใช้จ่ายจริง
  insert into budget_ledger (budget_id, kind, amount, ref_doc, ref_id, note, created_by)
  values (v_po.budget_id, 'release', v_inv.grand_total, 'invoice', v_inv.id,
          'ปลดยอดกันงบตามใบแจ้งหนี้ ' || v_inv.vendor_invoice_no, auth.uid());
  insert into budget_ledger (budget_id, kind, amount, ref_doc, ref_id, note, created_by)
  values (v_po.budget_id, 'actual', v_inv.grand_total, 'invoice', v_inv.id,
          'จ่ายจริง ' || v_v.voucher_no, auth.uid());

  -- ตั้งรายการคืนเงินประกันผลงาน (ถ้ามีการหักไว้)
  if v_v.retention_amount > 0 then
    insert into retention_releases (po_id, amount, due_date)
    values (v_po.id, v_v.retention_amount,
            p_paid_date + coalesce(v_po.warranty_days, 0))
    on conflict (po_id) do update
      set amount = retention_releases.amount + excluded.amount;
  end if;

  -- ปิด PO เมื่อจ่ายครบทุกใบแจ้งหนี้ และวางบิลครบตามจำนวนใน PO
  select not exists (
    select 1 from invoices i where i.po_id = v_po.id and i.status <> 'paid'
  ) and not exists (
    select 1 from v_po_line_invoiced pi
    join po_lines pl on pl.id = pi.po_line_id
    where pl.po_id = v_po.id and pi.qty_invoiced < pl.qty
  ) into v_all_paid;

  if v_all_paid then
    update pos set status = 'paid' where id = v_po.id;
    perform fn_rate_vendor(v_po.id);
    -- คืนงบส่วนที่กันไว้แต่ไม่ได้ใช้
    insert into budget_ledger (budget_id, kind, amount, ref_doc, ref_id, note, created_by)
    select v_po.budget_id, 'release',
           v_po.grand_total - coalesce(sum(i.grand_total), 0)::bigint,
           'po', v_po.id, 'คืนงบส่วนที่ไม่ได้ใช้ของ ' || v_po.po_no, auth.uid()
    from invoices i where i.po_id = v_po.id
    having v_po.grand_total - coalesce(sum(i.grand_total), 0)::bigint > 0;
  else
    update pos set status = 'invoiced' where id = v_po.id;
  end if;

  return jsonb_build_object('payment_id', v_id, 'wht_cert_no', v_cert,
                            'net_paid', v_v.net_amount);
end $$;

-- ============================================================================
-- ขั้น 12 — คืนเงินประกันผลงาน (สองมือ: ผู้ตรวจรับยืนยัน → บัญชีคืนเงิน)
-- ============================================================================

create or replace function fn_confirm_retention(p_po uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_r retention_releases;
begin
  select * into v_r from retention_releases where po_id = p_po;
  perform fn_require(v_r.id is not null, 'ไม่มีรายการเงินประกันผลงานของ PO นี้');
  perform fn_require(has_any_role('inspector','admin'),
                     'เฉพาะผู้ตรวจรับเท่านั้นที่ยืนยันครบระยะรับประกันได้');
  perform fn_require(v_r.confirmed_at is null, 'ยืนยันไปแล้ว');
  perform fn_require(current_date >= v_r.due_date,
    format('ยังไม่ครบระยะรับประกัน — ครบวันที่ %s', to_char(v_r.due_date, 'DD/MM/YYYY')));

  update retention_releases
  set confirmed_by = auth.uid(), confirmed_at = now()
  where po_id = p_po;
end $$;

create or replace function fn_release_retention(p_po uuid, p_ref text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_r retention_releases;
begin
  select * into v_r from retention_releases where po_id = p_po;
  perform fn_require(v_r.id is not null, 'ไม่มีรายการเงินประกันผลงานของ PO นี้');
  perform fn_require(has_any_role('accounting','admin'), 'เฉพาะฝ่ายบัญชีเท่านั้น');
  perform fn_require(v_r.confirmed_at is not null,
    'ผู้ตรวจรับยังไม่ยืนยันว่าครบระยะรับประกัน — คืนเงินไม่ได้');
  perform fn_require(v_r.confirmed_by <> auth.uid(),
    'คนยืนยันกับคนคืนเงินต้องเป็นคนละคน');
  perform fn_require(v_r.released_at is null, 'คืนเงินประกันไปแล้ว');
  perform fn_require(coalesce(btrim(p_ref), '') <> '', 'ต้องระบุเลขอ้างอิงการจ่าย');

  update retention_releases
  set released_by = auth.uid(), released_at = now(), payment_ref = p_ref, note = p_note
  where po_id = p_po;

  update pos set status = 'closed', closed_at = now() where id = p_po;
end $$;

-- ============================================================================
-- ขั้น 13 — บันทึกผลงานผู้ขายของใบสั่งซื้อนี้ (ไว้ดูประวัติย้อนหลัง)
-- เต็ม 20 : ตรงเวลา 10 · ผ่านตรวจรับรอบแรก 7 · ไม่มีของถูกตีกลับ 3
-- ============================================================================

create or replace function fn_rate_vendor(p_po uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_po pos; v_last date; v_late integer; v_first_pass boolean;
  v_rejects integer; v_score smallint;
begin
  select * into v_po from pos where id = p_po;
  if v_po.id is null then return; end if;

  select max(d.delivered_date) into v_last
  from deliveries d join grs g on g.delivery_id = d.id
  where d.po_id = p_po and g.result <> 'rejected';

  v_late := greatest(0, coalesce(v_last - v_po.promised_date, 0));

  select coalesce((select g.result = 'accepted'
                   from grs g join deliveries d on d.id = g.delivery_id
                   where d.po_id = p_po order by g.inspected_at limit 1), false)
    into v_first_pass;

  select count(*)::integer into v_rejects
  from grs g join deliveries d on d.id = g.delivery_id
  where d.po_id = p_po and g.result = 'rejected';

  v_score := (case when v_late = 0 then 10
                   when v_late <= 3 then 7
                   when v_late <= 7 then 4
                   when v_late <= 15 then 2
                   else 0 end)
           + (case when v_first_pass then 7 else 2 end)
           + (case when v_rejects = 0 then 3 when v_rejects = 1 then 1 else 0 end);

  insert into vendor_ratings (vendor_id, po_id, on_time, late_days,
                              passed_first_inspection, reject_count, score)
  values (v_po.vendor_id, p_po, v_late = 0, v_late, v_first_pass, v_rejects, v_score)
  on conflict (po_id) do update
    set on_time = excluded.on_time, late_days = excluded.late_days,
        passed_first_inspection = excluded.passed_first_inspection,
        reject_count = excluded.reject_count, score = excluded.score;
end $$;

-- ============================================================================
-- ออกเลข PR ตอนล็อก SOW (ก่อนหน้านั้นยังเป็นแค่ร่าง ไม่กินเลข)
-- ============================================================================

create or replace function fn_assign_pr_no(p_pr uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_pr prs; v_no text;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  if v_pr.pr_no is not null then return v_pr.pr_no; end if;
  v_no := fn_next_doc_no('pr', v_pr.fiscal_year);
  update prs set pr_no = v_no where id = p_pr;
  return v_no;
end $$;

-- ============================================================================
-- ค่าเริ่มต้นที่ต้องรอให้ fn_fiscal_year มีตัวตนก่อน
-- ============================================================================

alter table prs      alter column fiscal_year set default fn_fiscal_year(current_date);
alter table grs      alter column fiscal_year set default fn_fiscal_year(current_date);
alter table invoices alter column fiscal_year set default fn_fiscal_year(current_date);

-- ============================================================================
-- สิทธิ์เรียก RPC
-- ============================================================================

revoke all on function fn_require(boolean, text) from public;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'fn\_%'
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
