-- ============================================================================
-- ถอดระบบคะแนนออกทั้งหมด + คงป้าย "เกินงบ" ไว้
--
-- ทำไมต้องมีไฟล์นี้ ทั้งที่แก้ 01–05 ไปแล้ว
--   ไฟล์ 01–05 คือหน้าตาของฐานข้อมูล "ตอนติดตั้งใหม่"
--   ฐานที่รันอยู่แล้วยังมีตาราง quote_scores และ view เดิมค้างอยู่ ต้องมีตัวไล่เก็บให้
--   ไฟล์นี้รันซ้ำได้ ไม่พังถ้ารันสองรอบ
--
-- ตัดออกจากระบบ
--   * ตาราง quote_scores (คะแนน 100 เต็ม 5 หมวด)
--   * เกณฑ์ผ่าน 70 คะแนน — ไม่มีใบไหนถูกตัดออกเพราะคะแนนอีกแล้ว
--   * v_quote_auto_score / fn_autoscore_pr (ตัวคิดคะแนนอัตโนมัติ)
--
-- ที่เหลืออยู่
--   * ตัดออกอัตโนมัติเฉพาะเหตุที่ชัดเจน: ถูกตัดออกด้วยมือ / รับ SOW ไม่ครบ / อยู่ในบัญชีดำ
--   * อันดับเรียงตามยอดสุทธิ ถูกไปแพง
--   * ป้าย "เกินงบ" — เตือนเฉยๆ ไม่ตัดสิทธิ์ เพราะราคายังต่อรองลงมาได้
--   * กติกา "ไม่เลือกเจ้าถูกสุดต้องระบุเหตุผล + ยกระดับผู้อนุมัติ" ยังอยู่เหมือนเดิม
-- ============================================================================

drop view if exists v_quote_auto_score;
drop function if exists fn_autoscore_pr(uuid, boolean);

-- ----------------------------------------------------------------------------
-- งบที่ผูกกับใบขอซื้อแต่ละใบ — ลำดับเดียวกับ fn_budget_for_pr
-- (งบของโครงการมาก่อน ถ้าไม่มีค่อยใช้งบของศูนย์ต้นทุน)
-- ทำเป็น view เพื่อให้ตารางเปรียบเทียบดึงยอดคงเหลือมาแสดงได้ในคิวรี่เดียว
-- ----------------------------------------------------------------------------
create or replace view v_pr_budget with (security_invoker = true) as
select
  pr.id       as pr_id,
  b.budget_id,
  b.amount    as budget_amount,
  b.available as budget_available
from prs pr
left join lateral (
  select bb.budget_id, bb.amount, bb.available
  from v_budget_balance bb
  join budgets bu on bu.id = bb.budget_id
  where bu.cost_center_id = pr.cost_center_id
    and bu.fiscal_year    = pr.fiscal_year
    and (bu.project_id = pr.project_id or bu.project_id is null)
  order by (bu.project_id is not null) desc
  limit 1
) b on true;

-- ----------------------------------------------------------------------------
-- จัดอันดับผู้เสนอราคา — ไม่มีคะแนนแล้ว
--
-- ต้อง drop ก่อน เพราะ base ใช้ b.* การเปลี่ยนชุดคอลัมน์ทำให้ create or replace ไม่ผ่าน
--
-- over_budget ไม่อยู่ในเงื่อนไข qualified โดยตั้งใจ — เกินงบยังเข้าเปรียบเทียบและเลือกได้
-- ถ้าตัดทิ้งตั้งแต่ตรงนี้ ก็ไม่เหลืออะไรให้ต่อรอง
-- ----------------------------------------------------------------------------
drop view if exists v_quote_ranking;

create view v_quote_ranking with (security_invoker = true) as
with base as (
  select
    t.*,
    v.name_th   as vendor_name_th,
    v.name_en   as vendor_name_en,
    v.blacklisted,
    pb.budget_id,
    pb.budget_amount,
    pb.budget_available,
    (pb.budget_available is not null
       and t.grand_total > pb.budget_available)                as over_budget,
    greatest(0, t.grand_total - coalesce(pb.budget_available, t.grand_total)) as over_amount,
    (not t.disqualified
     and t.sow_complete
     and not v.blacklisted)  as qualified
  from v_quote_totals t
  join vendors v on v.id = t.vendor_id
  left join v_pr_budget pb on pb.pr_id = t.pr_id
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
-- เลือกผู้ชนะ — เหมือนเดิมทุกอย่าง เปลี่ยนแค่ข้อความที่เคยอ้างเกณฑ์ 70 คะแนน
-- ----------------------------------------------------------------------------
create or replace function fn_award_pr(p_pr uuid, p_awards jsonb, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pr prs; a jsonb; v_line pr_lines; v_ql quote_lines; v_rank record;
  v_cheapest bigint; v_escalate boolean := false; v_total bigint := 0;
  v_budget jsonb; v_line_count integer; v_award_count integer;
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

  -- ขั้น 4 — เช็คงบ
  v_budget := fn_check_budget(p_pr, v_total);

  if v_budget->>'verdict' = 'over' then
    perform fn_require(
      exists (select 1 from budget_exceptions e
              where e.pr_id = p_pr and e.decision = 'approved'
                and e.amount_over >= (v_budget->>'over_amount')::bigint),
      format('เกินงบประมาณ %s บาท — ต้องได้รับอนุมัติ Budget Exception จาก CEO ก่อน',
             to_char((v_budget->>'over_amount')::bigint / 100.0, 'FM999,999,999.00')));
  elsif v_budget->>'verdict' = 'warn' then
    perform fn_require(
      exists (select 1 from budget_warnings w where w.pr_id = p_pr
              and coalesce(btrim(w.reason), '') <> ''),
      'ใช้งบเกิน 90% ของวงเงิน — ต้องระบุเหตุผลก่อนไปต่อ');
  end if;

  insert into pr_awards (pr_id, escalated, note, awarded_by)
  values (p_pr, v_escalate, p_note, auth.uid())
  on conflict (pr_id) do update
    set escalated = excluded.escalated, note = excluded.note,
        awarded_by = excluded.awarded_by, awarded_at = now();

  update prs set status = 'evaluated', updated_at = now() where id = p_pr;

  return jsonb_build_object('awarded_total', v_total, 'escalated', v_escalate,
                            'budget', v_budget);
end $$;

-- ทิ้งตารางคะแนนเป็นขั้นสุดท้าย หลังไม่มี view/ฟังก์ชันไหนอ้างถึงแล้ว
drop table if exists quote_scores;

grant select on v_pr_budget, v_quote_ranking to authenticated;
revoke all on v_pr_budget, v_quote_ranking from anon;
