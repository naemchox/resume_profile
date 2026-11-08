-- ============================================================================
-- ยืนยันผู้ชนะไม่ต้องผ่านด่านงบประมาณ + งบประมาณเป็นของ "ถ้ามี" ทั้งระบบ
--
-- ทำไมต้องมีไฟล์นี้
--   ของเดิม fn_award_pr เรียก fn_check_budget ซึ่งเรียก fn_budget_for_pr ต่อ
--   และ fn_budget_for_pr โยน error 'ยังไม่ได้ตั้งงบประมาณของศูนย์ต้นทุน/โครงการนี้
--   ในปีงบนี้' ทุกครั้งที่หาแถวใน budgets ไม่เจอ ผลคือใบขอซื้อของศูนย์ต้นทุนที่ยังไม่ได้
--   ตั้งงบ กด "ยืนยันผลการคัดเลือก" ไม่ผ่าน และต่อให้ผ่านมาได้ก็ไปตายซ้ำตอนออกใบสั่งซื้อ
--   ซึ่งไม่ตรงกับวิธีทำงานจริง — หลายบริษัทไม่ได้ตั้งงบรายศูนย์ต้นทุนไว้ล่วงหน้า
--
-- กติกาใหม่
--   ขั้นเลือกผู้ชนะ  -> ไม่ยุ่งกับงบเลย ไม่ว่าจะตั้งงบไว้หรือไม่ก็ตาม
--   ขั้นออกใบสั่งซื้อ -> ตั้งงบไว้ก็กันยอดตามเดิม ไม่ได้ตั้งก็ออก PO ได้ ไม่มีงบให้กัน
--
-- ที่เปลี่ยน 5 จุด
--   1. fn_award_pr       ตัดด่านงบออกทั้งก้อน (ของเดิมบังคับ CEO อนุมัติเมื่อเกินงบ
--                        และบังคับให้ระบุเหตุผลเมื่อใช้เกิน 90%) ที่เหลือเหมือน 12 ทุกอย่าง
--   2. fn_budget_for_pr  คืน null แทนการโยน error
--   3. fn_check_budget   คืน verdict = 'none' เมื่อไม่มีงบ — เหลือไว้ให้หน้าจอเรียกดูยอด
--   4. pos.budget_id     ยอมให้ว่างได้ — ใบสั่งซื้อที่ออกโดยไม่มีงบผูกอยู่
--   5. budget_ledger     ข้ามการบันทึกแถวที่ budget_id ว่าง (ทำที่ trigger ที่เดียว)
--
-- ทำไมข้อ 5 ทำเป็น trigger แทนที่จะไปใส่ if ในฟังก์ชัน
--   จุดที่เขียน budget_ledger มี 4 แห่ง กระจายอยู่ใน fn_issue_po กับ fn_record_payment
--   ซึ่งเป็นฟังก์ชันยาวรวมกันเกือบ 200 บรรทัด การก๊อปมาแก้ทั้งดุ้นในไฟล์นี้แปลว่าต้องคอย
--   ไล่ sync กับ 04_functions.sql ตลอดไป เงื่อนไขที่ต้องการมีข้อเดียวและตรงไปตรงมา
--   (budget_id ว่าง = ใบนี้ไม่ได้ผูกงบ ไม่มีอะไรให้ตัด) จึงคุมที่ทางเข้าตารางที่เดียวจบ
--
-- รันซ้ำได้ และรันไฟล์นี้ไฟล์เดียวจบ ไม่ต้องรัน 12 ก่อน
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ขั้น 5 — เลือกผู้ชนะรายบรรทัด (ไม่ยุ่งกับงบประมาณ)
-- ----------------------------------------------------------------------------
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

alter table pos alter column budget_id drop not null;

-- ----------------------------------------------------------------------------
-- โครงการมาก่อน ถ้าไม่มีโครงการค่อยใช้งบของ Cost Center — ไม่เจอ = null ไม่ใช่ error
-- ----------------------------------------------------------------------------
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

  return v_budget;
end $$;

-- ----------------------------------------------------------------------------
-- ตรวจงบ คืนผลเป็น jsonb ให้หน้าจอเอาไปแสดง (none / ok / warn / over)
-- 'none' = ศูนย์ต้นทุน/โครงการนี้ยังไม่ได้ตั้งงบในปีงบนี้ — หน้าจอซ่อนการ์ดงบไปเลย
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- ใบสั่งซื้อที่ไม่ได้ผูกงบ ก็ไม่มีอะไรให้กัน/ปลด/ลงจ่ายจริงในบัญชีงบ
-- ----------------------------------------------------------------------------
create or replace function trg_skip_unbudgeted_ledger()
returns trigger language plpgsql as $$
begin
  if new.budget_id is null then return null; end if;   -- null = ยกเลิกการ insert แถวนี้
  return new;
end $$;

drop trigger if exists skip_unbudgeted_ledger on budget_ledger;
create trigger skip_unbudgeted_ledger before insert on budget_ledger
  for each row execute function trg_skip_unbudgeted_ledger();

grant execute on function fn_award_pr(uuid, jsonb, text) to authenticated;
grant execute on function fn_budget_for_pr(uuid) to authenticated;
grant execute on function fn_check_budget(uuid, bigint) to authenticated;
