-- ============================================================================
-- เลือกผู้ชนะได้ทุกเจ้าที่ยื่นราคามา ไม่ใช่เฉพาะเจ้าที่ "ผ่านเกณฑ์"
--
-- ทำไมต้องมีไฟล์นี้
--   ของเดิม fn_award_pr รับเฉพาะใบที่ qualified (รับขอบเขตงานครบ + ไม่ถูกตัดออก
--   + ผู้ขายไม่ติดบัญชีดำ) ทำให้กล่องเลือกผู้ชนะบางใบเหลือให้เลือกเจ้าเดียว
--   ทั้งที่ของจริงบางทีไม่ได้อยากได้เจ้าที่ถูกที่สุด หรืออยากได้เจ้าที่ยังติดขอบเขตงานอยู่ 1-2 ข้อ
--   ไฟล์ 04/11 คือหน้าตาตอนติดตั้งใหม่ (แก้ไปแล้ว) ไฟล์นี้ไว้ไล่เก็บฐานที่รันอยู่ — รันซ้ำได้
--
-- ที่เปลี่ยน 3 จุด
--   1. เงื่อนไข "ต้องมีอย่างน้อย 1 เจ้าในการพิจารณา" นับใบที่รับขอบเขตงานไม่ครบด้วย
--   2. ใบที่เลือกเป็นผู้ชนะ รับได้ถึงระดับ sow_incomplete — เหลือกันแค่
--      ตัดออกด้วยมือ (disqualified) กับผู้ขายติดบัญชีดำ (blacklisted)
--   3. ราคาต่ำสุดที่ใช้เทียบ (ตัวที่บังคับให้ระบุเหตุผล + ยกระดับผู้อนุมัติ)
--      นับจากกลุ่มเดียวกับที่เลือกได้ ไม่งั้นราคาอ้างอิงกับสิทธิ์เลือกจะคนละกลุ่ม
--
-- กติกาที่ยังอยู่เหมือนเดิม
--   ไม่เลือกเจ้าที่ถูกที่สุด = ต้องระบุเหตุผล + ยกระดับผู้อนุมัติอีก 1 ขั้น
--   ต้องเลือกให้ครบทุกบรรทัด และด่านงบประมาณยังเช็คเหมือนเดิม
-- ============================================================================

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
