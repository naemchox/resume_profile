-- ============================================================================
-- SEED + สิทธิ์ระดับตาราง
-- รันไฟล์นี้เป็นไฟล์สุดท้าย
-- ============================================================================

-- ----------------------------------------------------------------------------
-- สิทธิ์พื้นฐาน — RLS เป็นด่านจริง ส่วนนี้เป็นด่านแรก
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ตารางที่ห้ามเขียนตรง
revoke insert, update, delete on audit_log     from authenticated;
revoke insert, update, delete on budget_ledger from authenticated;
revoke all                    on doc_sequences from authenticated;
revoke insert, update, delete on user_roles    from authenticated;  -- ผ่าน fn_grant_role เท่านั้น
revoke insert, update, delete on vendor_ratings from authenticated; -- ระบบให้คะแนนเอง
revoke insert, update, delete on rfq_prints    from authenticated;  -- ผ่าน fn_issue_rfq
revoke insert, update, delete on pr_awards     from authenticated;  -- ผ่าน fn_award_pr
revoke insert, update, delete on line_awards   from authenticated;
revoke insert, update, delete on approvals     from authenticated;  -- ผ่าน fn_decide_approval
revoke insert, update, delete on pos           from authenticated;  -- ผ่าน fn_issue_po
revoke insert, update, delete on po_lines      from authenticated;
revoke insert, update, delete on po_sow_snapshot from authenticated;
revoke insert, update, delete on match_results from authenticated;  -- ผ่าน fn_match_invoice
revoke insert, update, delete on payment_vouchers from authenticated;
revoke insert, update, delete on payments      from authenticated;
revoke insert, update, delete on retention_releases from authenticated;
revoke update, delete         on budget_exceptions from authenticated; -- อนุมัติผ่าน RPC

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;

-- ----------------------------------------------------------------------------
-- ประตูตั้ง Admin คนแรก — ใช้ได้ครั้งเดียวตอนระบบยังไม่มี admin เลย
-- พอมี admin แล้วฟังก์ชันนี้จะปฏิเสธทุกครั้ง
-- ----------------------------------------------------------------------------
create or replace function fn_bootstrap_admin()
returns text language plpgsql security definer set search_path = public as $$
begin
  perform fn_require(auth.uid() is not null, 'ต้องเข้าสู่ระบบก่อน');
  perform fn_require(
    (select count(*) from user_roles where role = 'admin') = 0,
    'ระบบมีผู้ดูแลอยู่แล้ว — ให้ผู้ดูแลคนเดิมเป็นคนตั้งตำแหน่งให้');

  insert into user_profiles (id, full_name_th, email)
  select u.id, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)), u.email
  from auth.users u where u.id = auth.uid()
  on conflict (id) do nothing;

  insert into user_roles (user_id, role, granted_by)
  values (auth.uid(), 'admin', auth.uid());

  return 'ตั้งเป็นผู้ดูแลระบบเรียบร้อย';
end $$;

revoke all on function fn_bootstrap_admin() from public, anon;
grant execute on function fn_bootstrap_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- ข้อมูลบริษัท — Admin เข้าไปแก้ในหน้า admin.html
-- ----------------------------------------------------------------------------
insert into company_profile (id, name_th, name_en, tax_id, fiscal_year_start_month, default_vat_bp)
values (1, 'บริษัทตัวอย่าง จำกัด', 'Sample Company Limited', '0000000000000', 10, 700)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- สายอนุมัติตามวงเงิน (หน่วย: สตางค์)
--   Eng ≤ 50,000 · PM ≤ 300,000 · PD ≤ 1,000,000 · CEO ไม่จำกัด
-- ลูกค้าแต่ละรายปรับเองได้ในหน้า admin
-- ----------------------------------------------------------------------------
insert into approval_limits (role, step_order, max_amount, active) values
  ('inspector', 1,    5000000, true),
  ('pm',        2,   30000000, true),
  ('pd',        3,  100000000, true),
  ('ceo',       4,       null, true)
on conflict (role) do nothing;

-- ----------------------------------------------------------------------------
-- Scope of Work 6 ข้อ (ค่าตั้งต้น — ลูกค้าเพิ่ม/แก้/ปิดได้)
-- ----------------------------------------------------------------------------
insert into sow_clauses (code, seq, title_th, title_en, hint_th, hint_en) values
  ('BOQ', 1,
   'BOQ / Unit rate',
   'BOQ / Unit rate',
   'แจกแจงราคาต่อหน่วยทุกบรรทัด ห้ามเสนอเป็นยอดรวมก้อนเดียว',
   'Itemised unit rates for every line; lump-sum totals are not accepted'),
  ('SPEC', 2,
   'แบบ และ Spec. เอกสารแนบ',
   'Drawings and specifications (attachments)',
   'ยืนยันว่าทำตามแบบและสเปกที่แนบมาทุกข้อ',
   'Confirm compliance with the attached drawings and specifications'),
  ('DELIV', 3,
   'การส่งมอบงาน',
   'Delivery of work',
   'ระบุจำนวนวัน/งวดงาน และวันที่ส่งมอบแล้วเสร็จ',
   'State the delivery period, milestones, and completion date'),
  ('WARR', 4,
   'การรับประกัน / หลักประกัน / ระยะเวลา',
   'Warranty / performance bond / period',
   'ระบุระยะเวลารับประกัน และหลักประกันผลงานที่วางให้',
   'State the warranty period and the performance security provided'),
  ('PEN', 5,
   'ค่าปรับในกรณีล่าช้า 0.1%/วัน สูงสุด 10%',
   'Late-delivery penalty 0.1%/day, capped at 10%',
   'ยอมรับการหักค่าปรับตามอัตรานี้จากมูลค่าสัญญา',
   'Accept penalty deduction at this rate against the contract value'),
  ('DIVW', 6,
   'Division of work — ค่าน้ำค่าไฟ / การเบิกของจากสโตร์ / การดูแลพื้นที่ก่อสร้าง',
   'Division of work — utilities, store withdrawals, site care',
   'ระบุชัดว่าผู้รับเหมาต้องรับผิดชอบส่วนใดบ้าง',
   'State clearly which of these the contractor is responsible for')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- อัตราภาษีหัก ณ ที่จ่าย  (rate_bp: 300 = 3%)
-- PND53 = นิติบุคคล · PND3 = บุคคลธรรมดา
-- ----------------------------------------------------------------------------
insert into wht_rates (code, form, description_th, description_en, rate_bp) values
  ('S3',  'PND53', 'ค่าบริการ / ค่าจ้างทำของ',        'Services / hire of work',            300),
  ('C3',  'PND53', 'ค่าจ้างเหมาก่อสร้าง',             'Construction contracting',           300),
  ('R5',  'PND53', 'ค่าเช่าทรัพย์สิน',                 'Rental of property',                 500),
  ('T1',  'PND53', 'ค่าขนส่ง',                        'Transportation',                     100),
  ('A2',  'PND53', 'ค่าโฆษณา',                        'Advertising',                        200),
  ('P3',  'PND53', 'ค่าวิชาชีพอิสระ',                  'Professional fees',                  300),
  ('S3P', 'PND3',  'ค่าบริการ / ค่าจ้างทำของ (บุคคลธรรมดา)', 'Services (individual payee)',  300),
  ('R5P', 'PND3',  'ค่าเช่าทรัพย์สิน (บุคคลธรรมดา)',    'Rental (individual payee)',          500),
  ('NONE','PND53', 'ไม่หักภาษี ณ ที่จ่าย',              'No withholding tax',                   0)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- ตัวอย่างศูนย์ต้นทุน (ลบทิ้งได้เมื่อขึ้นระบบจริง)
-- ----------------------------------------------------------------------------
insert into cost_centers (code, name_th, name_en) values
  ('CC-ADMIN', 'สำนักงาน',      'Administration'),
  ('CC-ENG',   'วิศวกรรม',      'Engineering'),
  ('CC-CONS',  'งานก่อสร้าง',   'Construction'),
  ('CC-IT',    'เทคโนโลยีสารสนเทศ', 'Information Technology')
on conflict (code) do nothing;
