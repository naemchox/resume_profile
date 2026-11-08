-- ============================================================================
-- อนุมัติตาม "ช่วงราคา" — ยอดตกช่วงไหน คนที่ดูแลช่วงนั้นอนุมัติคนเดียวจบ
--
-- ของเดิม (04_functions.sql) เป็นสายอนุมัติแบบ "ไล่ขึ้นสะสม"
--   ยอด 200,000 -> ENG อนุมัติก่อน แล้ว PM อนุมัติต่อ  (2 ขั้น)
--   ยอด 5,000,000 -> ENG -> PM -> PD -> CEO            (4 ขั้น)
--   ทุกขั้นที่ต่ำกว่าต้องเซ็นผ่านหมดก่อน ขั้นถัดไปถึงจะเห็นเรื่อง
--
-- ของใหม่ (ไฟล์นี้) เป็น "ช่วงราคา -> ผู้อนุมัติคนเดียว"
--   ยอด 40,000     -> ENG อนุมัติคนเดียว จบ
--   ยอด 200,000    -> PM  อนุมัติคนเดียว จบ (ไม่ต้องผ่าน ENG)
--   ยอด 5,000,000  -> CEO อนุมัติคนเดียว จบ
--
-- ช่วงราคาไม่ต้องกรอกสองช่อง — ยังใช้ตาราง approval_limits เดิม (role, step_order,
-- max_amount) แล้ว "ต้นช่วง" คำนวณจากปลายช่วงของขั้นก่อนหน้า + 1 สตางค์
--   ENG max 50,000  -> ช่วง 0.01 - 50,000
--   PM  max 300,000 -> ช่วง 50,000.01 - 300,000
--   PD  max 1,000,000 -> ช่วง 300,000.01 - 1,000,000
--   CEO max ว่าง    -> ช่วง 1,000,000.01 ขึ้นไป
-- วิธีนี้ทำให้ "ช่วงว่าง" หรือ "ช่วงซ้อนกัน" เกิดขึ้นไม่ได้เลยโดยธรรมชาติ
-- ปรับช่วงไหนก็แก้ max_amount ของขั้นนั้นในหน้า admin -> วงเงินอนุมัติ
--
-- ยกระดับ 1 ขั้น (pr_awards.escalated = ไม่ได้เลือกเจ้าที่ถูกที่สุด)
--   ของเดิม = เพิ่มผู้อนุมัติต่อท้ายอีก 1 คน
--   ของใหม่ = เลื่อนผู้อนุมัติขึ้นไปอีก 1 ขั้น (ยังอนุมัติคนเดียวเหมือนเดิม)
--   ถ้าอยู่ขั้นบนสุดอยู่แล้ว (CEO) ก็คงเดิม เพราะไม่มีใครสูงกว่านั้น
--
-- ที่เปลี่ยน 2 จุด
--   1. fn_submit_for_approval  เลือกขั้นเดียวแทนการวนใส่ทุกขั้น
--   2. trigger ใหม่บน approval_limits  กันตารางวงเงินพัง (ดูเหตุผลข้อ 1 ข้างล่าง)
--
-- ที่ไม่ต้องแก้เลย
--   v_pending_approvals / approval_step_reached / fn_decide_approval / หน้าเว็บ
--   ทั้งหมดทำงานกับ step_no แบบทั่วไปอยู่แล้ว สายที่มีขั้นเดียวจึงวิ่งผ่านได้ทันที
--   (fn_decide_approval นับ "ขั้นก่อนหน้าที่ยังไม่อนุมัติ" ได้ 0 เสมอ แล้วปิดเรื่อง
--    เป็น approved ทันทีที่คนเดียวนั้นกดอนุมัติ)
--
-- รันไฟล์นี้ใน SQL Editor ของ Supabase หลัง 04_functions.sql  (รันซ้ำได้ ไม่พัง)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) กันตารางวงเงินพัง
--
-- พอ "ต้นช่วง" มาจากปลายช่วงของขั้นก่อนหน้า ตารางที่วงเงินไม่ไล่จากน้อยไปมาก
-- จะสร้างช่วงที่ไม่มีวันเกิดขึ้นได้ เช่น ENG 500,000 / PM 300,000 -> ช่วงของ PM
-- กลายเป็น 500,000.01-300,000 ซึ่งไม่มียอดไหนตกลงไปได้เลย PM จะไม่ได้อนุมัติอะไร
-- เลยตลอดกาลโดยไม่มีใครรู้ตัว trigger นี้เลยดักไว้ตั้งแต่ตอนกดบันทึกในหน้า admin
-- แทนที่จะไปเงียบ ๆ แล้วโผล่ตอนยื่นอนุมัติจริง
--
-- เป็น statement-level (ตรวจทั้งตารางหลังแก้เสร็จ) ไม่ใช่ row-level เพราะเงื่อนไข
-- เป็นเรื่องความสัมพันธ์ระหว่างแถว ไม่ใช่ความถูกต้องของแถวเดียว
-- ----------------------------------------------------------------------------
create or replace function trg_check_approval_limits()
returns trigger language plpgsql as $$
declare
  r record;
  v_prev_role text := null;
  v_prev bigint := null;    -- ปลายช่วงของขั้นก่อนหน้า (null = ยังไม่มีขั้นก่อนหน้า)
  v_open text := null;      -- ชื่อขั้นที่ตั้ง "ไม่จำกัด" ไว้แล้ว
begin
  for r in select role::text as role, step_order, max_amount
           from approval_limits where active order by step_order loop

    if v_open is not null then
      raise exception
        'ขั้น "%" อยู่ต่อจากขั้น "%" ที่ตั้งวงเงินเป็นไม่จำกัดไว้แล้ว — ขั้นไม่จำกัดต้องเป็นขั้นสุดท้ายเท่านั้น',
        r.role, v_open using errcode = 'P0001';
    end if;

    if r.max_amount is null then
      v_open := r.role;
    else
      if v_prev is not null and r.max_amount <= v_prev then
        raise exception
          'วงเงินของขั้น "%" (% บาท) ต้องมากกว่าขั้นก่อนหน้า "%" (% บาท) ไม่งั้นช่วงราคาของขั้นนี้จะไม่มีทางเกิดขึ้นได้',
          r.role, to_char(r.max_amount / 100.0, 'FM999,999,999.00'),
          v_prev_role, to_char(v_prev / 100.0, 'FM999,999,999.00')
          using errcode = 'P0001';
      end if;
      v_prev := r.max_amount;
      v_prev_role := r.role;
    end if;
  end loop;

  -- ต้องมีขั้นบนสุดที่รับยอดเท่าไหร่ก็ได้ ไม่งั้นยอดใหญ่ ๆ จะยื่นอนุมัติไม่ได้
  if v_open is null and exists (select 1 from approval_limits where active) then
    raise exception
      'ต้องมีอย่างน้อย 1 ขั้นที่ตั้งวงเงินเป็น "ไม่จำกัด" (เว้นช่องวงเงินว่างไว้) เพื่อรับยอดที่เกินทุกช่วง'
      using errcode = 'P0001';
  end if;

  return null;
end $$;

drop trigger if exists z_check_limits on approval_limits;
create trigger z_check_limits
  after insert or update or delete on approval_limits
  for each statement execute function trg_check_approval_limits();

-- ----------------------------------------------------------------------------
-- 2) ยื่นอนุมัติ — เลือกผู้อนุมัติขั้นเดียวจากช่วงราคา
-- ยอดที่ใช้ตัดสิน = ยอดรวมของบรรทัดที่ชนะ + ค่าส่ง + VAT ของแต่ละใบเสนอราคา
-- คิด ณ ตอนยื่น แล้วล็อกไว้ ไม่คำนวณสดตอนแสดงผล (เหมือนเดิมทุกอย่าง)
-- ----------------------------------------------------------------------------
create or replace function fn_submit_for_approval(p_pr uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_pr prs; v_total bigint; v_escalate boolean;
  v_role app_role; v_order smallint; v_max bigint;
  v_up_role app_role; v_up_order smallint; v_up_max bigint;
  v_min bigint;
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

  -- ขั้นแรก (ไล่ตาม step_order) ที่วงเงินรับยอดนี้ไหว = เจ้าของช่วงราคานี้
  select l.role, l.step_order, l.max_amount into v_role, v_order, v_max
  from approval_limits l
  where l.active and (l.max_amount is null or l.max_amount >= v_total)
  order by l.step_order
  limit 1;

  perform fn_require(v_role is not null,
    'ยอดเงินเกินวงเงินสูงสุดที่ตั้งไว้ทุกขั้น — ให้ผู้ดูแลระบบตรวจตารางวงเงินอนุมัติ');

  -- ไม่ได้เลือกเจ้าที่ถูกที่สุด = เลื่อนขึ้นอีก 1 ขั้น (ถ้ามีขั้นที่สูงกว่า)
  if v_escalate then
    select l.role, l.step_order, l.max_amount into v_up_role, v_up_order, v_up_max
    from approval_limits l
    where l.active and l.step_order > v_order
    order by l.step_order
    limit 1;

    if v_up_role is not null then
      v_role := v_up_role; v_order := v_up_order; v_max := v_up_max;
    end if;
  end if;

  -- ต้นช่วงของขั้นที่เลือก = ปลายช่วงของขั้นก่อนหน้า + 1 สตางค์ (ไว้บอกผู้ใช้เฉย ๆ)
  select coalesce(max(l.max_amount), 0) + 1 into v_min
  from approval_limits l
  where l.active and l.step_order < v_order and l.max_amount is not null;

  insert into approvals (doc_type, doc_id, step_no, role)
  values ('pr', p_pr, 1, v_role);

  update prs set status = 'pending_approval', submitted_at = now(), updated_at = now()
  where id = p_pr;

  return jsonb_build_object(
    'amount', v_total,
    'escalated', v_escalate,
    'approver_role', v_role,
    'range_min', v_min,
    'range_max', v_max,
    'chain', jsonb_build_array(jsonb_build_object('step', 1, 'role', v_role)));
end $$;

-- ----------------------------------------------------------------------------
-- 3) สิทธิ์เรียก RPC — เหมือนบล็อกท้าย 04_functions.sql
-- ----------------------------------------------------------------------------
revoke all on function fn_submit_for_approval(uuid) from public, anon;
grant execute on function fn_submit_for_approval(uuid) to authenticated;
