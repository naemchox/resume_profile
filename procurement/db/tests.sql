-- ============================================================================
-- ชุดทดสอบกติกา — ตัวนี้คือหลักฐานว่าระบบ "จับทุจริต" ได้จริง ไม่ใช่แค่หน้าจอสวย
--
-- วิธีรัน (ต่อฐานข้อมูลเปล่าที่รัน 01–06 ครบแล้ว):
--   psql "$DATABASE_URL" -f tests.sql
--
-- ทุกเคสที่ขึ้นต้นด้วย [ห้าม] คือกรณีที่ระบบ "ต้อง error"
-- ถ้าเคสไหนขึ้น FAIL แปลว่ามีรูให้โกง ห้ามเอาขึ้นใช้งานจริง
-- ============================================================================

\set ON_ERROR_STOP off
set client_min_messages = warning;

-- ----------------------------------------------------------------------------
-- โครงสำหรับเก็บผล
-- ----------------------------------------------------------------------------
drop table if exists _t;
create table _t (n serial, label text, pass boolean, detail text);
grant all on _t to public;
grant all on sequence _t_n_seq to public;

create or replace function t_err(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into _t (label, pass, detail) values (p_label, false, 'ผ่านได้ทั้งที่ควรถูกบล็อก');
  exception when others then
    insert into _t (label, pass, detail) values (p_label, true, left(sqlerrm, 110));
  end;
end $$;

create or replace function t_ok(p_sql text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into _t (label, pass, detail) values (p_label, true, 'ok');
  exception when others then
    insert into _t (label, pass, detail) values (p_label, false, left(sqlerrm, 160));
  end;
end $$;

create or replace function t_is(p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  insert into _t (label, pass, detail)
  values (p_label, coalesce(v,'∅') = p_expect, format('ได้ %s (คาด %s)', coalesce(v,'∅'), p_expect));
exception when others then
  insert into _t (label, pass, detail) values (p_label, false, left(sqlerrm, 160));
end $$;

grant execute on function t_err(text,text), t_ok(text,text), t_is(text,text,text) to public;

-- ============================================================================
-- ตั้งฉาก
-- ============================================================================
reset role;

delete from auth.users where email like '%@t.local';

insert into auth.users (id, email, raw_user_meta_data) values
 ('11111111-1111-1111-1111-111111111111','alice@t.local','{"full_name":"อลิส (จัดซื้อ)"}'),
 ('22222222-2222-2222-2222-222222222222','bob@t.local'  ,'{"full_name":"บ๊อบ (ผู้ขอซื้อ)"}'),
 ('33333333-3333-3333-3333-333333333333','carol@t.local','{"full_name":"แครอล (ผู้ตรวจรับ)"}'),
 ('44444444-4444-4444-4444-444444444444','dan@t.local'  ,'{"full_name":"แดน (PM)"}'),
 ('55555555-5555-5555-5555-555555555555','eve@t.local'  ,'{"full_name":"อีฟ (PD)"}'),
 ('66666666-6666-6666-6666-666666666666','frank@t.local','{"full_name":"แฟรงก์ (CEO)"}'),
 ('77777777-7777-7777-7777-777777777777','gina@t.local' ,'{"full_name":"จีน่า (บัญชี)"}'),
 ('88888888-8888-8888-8888-888888888888','adm@t.local'  ,'{"full_name":"แอดมิน"}');

insert into user_roles (user_id, role) values
 ('11111111-1111-1111-1111-111111111111','purchasing'),
 ('11111111-1111-1111-1111-111111111111','pm'),          -- ตั้งใจให้ทับซ้อน เพื่อทดสอบว่าคนคีย์ราคาอนุมัติไม่ได้
 ('11111111-1111-1111-1111-111111111111','pd'),          -- ให้มีสิทธิ์อนุมัติจ่าย เพื่อพิสูจน์ว่ากติกา SoD คือตัวที่บล็อก
 ('22222222-2222-2222-2222-222222222222','requester'),
 ('22222222-2222-2222-2222-222222222222','inspector'),   -- ตั้งใจให้ทับซ้อน เพื่อทดสอบว่าอนุมัติเรื่องตัวเองไม่ได้
 ('22222222-2222-2222-2222-222222222222','pm'),          -- ทับซ้อนอีกชั้น: อยู่ในตำแหน่งที่อนุมัติช่วงราคานี้พอดี แต่เป็นเจ้าของเรื่องเอง
 ('33333333-3333-3333-3333-333333333333','inspector'),
 ('44444444-4444-4444-4444-444444444444','pm'),
 ('55555555-5555-5555-5555-555555555555','pd'),
 ('66666666-6666-6666-6666-666666666666','ceo'),
 ('77777777-7777-7777-7777-777777777777','accounting'),
 ('77777777-7777-7777-7777-777777777777','purchasing'),
 ('88888888-8888-8888-8888-888888888888','admin');

insert into cost_centers (id, code, name_th, name_en)
values ('aaaaaaaa-0000-0000-0000-000000000001','CC-TEST','ศูนย์ทดสอบ','Test CC');

-- ตั้งงบไว้ 80,000 บาท เพื่อให้ยอดซื้อจริงตกในโซนเตือน 90-100%
insert into budgets (id, cost_center_id, fiscal_year, amount)
values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
        fn_fiscal_year(current_date), 8000000);

insert into vendors (id, code, name_th, tax_id, default_wht_code) values
 ('cccccccc-0000-0000-0000-00000000000a','V001','ผู้ขาย เอ','0105500000001','S3'),
 ('cccccccc-0000-0000-0000-00000000000b','V002','ผู้ขาย บี','0105500000002','S3'),
 ('cccccccc-0000-0000-0000-00000000000c','V003','ผู้ขาย ซี','0105500000003','S3');

-- ============================================================================
-- ขั้น 1 — บ๊อบตั้งเรื่องขอซื้อ
-- ============================================================================
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

insert into prs (id, requester_id, cost_center_id, purpose_th, needed_by, estimated_amount)
values ('dddddddd-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001','ซื้อวัสดุงานระบบไฟฟ้าอาคาร A',
        current_date + 45, 7500000);

insert into pr_lines (id, pr_id, seq, description, spec, qty, unit, est_unit_price) values
 ('eeeeeeee-0000-0000-0000-000000000001','dddddddd-0000-0000-0000-000000000001',1,
  'สายไฟ THW 2.5 sq.mm.','มอก. 11-2553 ทองแดงแท้',10,'ม้วน',500000),
 ('eeeeeeee-0000-0000-0000-000000000002','dddddddd-0000-0000-0000-000000000001',2,
  'ตู้ควบคุมไฟฟ้า MDB','IP54 พร้อมเบรกเกอร์',5,'ตู้',400000);

select t_err(
  $q$ select fn_lock_sow('dddddddd-0000-0000-0000-000000000001') $q$,
  '[ห้าม] ล็อก SOW ทั้งที่ยังกรอกไม่ครบ 6 ข้อ');

insert into pr_sow (pr_id, sow_clause_id, requirement_th)
select 'dddddddd-0000-0000-0000-000000000001', c.id,
       'ข้อกำหนดสำหรับ ' || c.title_th
from sow_clauses c where c.active;

select t_ok(
  $q$ select fn_lock_sow('dddddddd-0000-0000-0000-000000000001') $q$,
  'ล็อก SOW ครบ 6 ข้อ แล้วออกเลขใบขอซื้อให้อัตโนมัติ');

select t_is(
  $q$ select case when pr_no is not null then 'มีเลข' else 'ไม่มีเลข' end
      from prs where id='dddddddd-0000-0000-0000-000000000001' $q$,
  'มีเลข', 'ระบบออกเลขใบขอซื้อให้เอง ไม่ได้ออกจากเบราว์เซอร์');

update pr_lines set qty = 999 where id='eeeeeeee-0000-0000-0000-000000000001';
select t_is(
  $q$ select qty::text from pr_lines where id='eeeeeeee-0000-0000-0000-000000000001' $q$,
  '10.000', '[ห้าม] แก้จำนวนหลังล็อก SOW — RLS กรองแถวทิ้ง ข้อมูลไม่ขยับ');

-- ============================================================================
-- ขั้น 2-3 — อลิสออกใบขอราคา แล้วคีย์ใบเสนอราคา 3 เจ้า
-- ============================================================================
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select t_err(
  $q$ insert into prs (id, requester_id, cost_center_id, purpose_th)
      values (gen_random_uuid(),'11111111-1111-1111-1111-111111111111',
              'aaaaaaaa-0000-0000-0000-000000000001','อลิสไม่ใช่ผู้ขอซื้อ') $q$,
  '[ห้าม] คนที่ไม่มีตำแหน่งผู้ขอซื้อ ตั้งเรื่องขอซื้อ');

select t_ok(
  $q$ select fn_issue_rfq('dddddddd-0000-0000-0000-000000000001',
                          'cccccccc-0000-0000-0000-00000000000a','hash-a') $q$,
  'ออกใบรายละเอียดขอซื้อส่งผู้ขาย + บันทึกว่าใครพิมพ์');

insert into quotes (id, pr_id, vendor_id, quote_no, quote_date, freight, vat_bp,
                    delivery_days, warranty_days, entered_by) values
 ('ffffffff-0000-0000-0000-00000000000a','dddddddd-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-00000000000a','QT-A-001',current_date,100000,700,30,365,
  '11111111-1111-1111-1111-111111111111'),
 ('ffffffff-0000-0000-0000-00000000000b','dddddddd-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-00000000000b','QT-B-001',current_date,0,700,45,365,
  '11111111-1111-1111-1111-111111111111'),
 ('ffffffff-0000-0000-0000-00000000000c','dddddddd-0000-0000-0000-000000000001',
  'cccccccc-0000-0000-0000-00000000000c','QT-C-001',current_date,0,700,20,180,
  '11111111-1111-1111-1111-111111111111');

select t_err(
  $q$ insert into quotes (pr_id, vendor_id, quote_no, quote_date, entered_by)
      values ('dddddddd-0000-0000-0000-000000000001',
              'cccccccc-0000-0000-0000-00000000000a','QT-FAKE',current_date,
              '77777777-7777-7777-7777-777777777777') $q$,
  '[ห้าม] คีย์ใบเสนอราคาแล้วใส่ชื่อคนอื่นเป็นคนคีย์');

insert into quote_lines (quote_id, pr_line_id, qty, unit_price) values
 ('ffffffff-0000-0000-0000-00000000000a','eeeeeeee-0000-0000-0000-000000000001',10,500000),
 ('ffffffff-0000-0000-0000-00000000000a','eeeeeeee-0000-0000-0000-000000000002', 5,400000),
 ('ffffffff-0000-0000-0000-00000000000b','eeeeeeee-0000-0000-0000-000000000001',10,520000),
 ('ffffffff-0000-0000-0000-00000000000b','eeeeeeee-0000-0000-0000-000000000002', 5,420000),
 ('ffffffff-0000-0000-0000-00000000000c','eeeeeeee-0000-0000-0000-000000000001',10,450000),
 ('ffffffff-0000-0000-0000-00000000000c','eeeeeeee-0000-0000-0000-000000000002', 5,380000);

-- เอกับบี รับเงื่อนไข SOW ครบ · ซีเสนอถูกสุดแต่ไม่รับข้อค่าปรับ
insert into quote_sow (quote_id, sow_clause_id, accepted)
select q.id, c.id, case when q.id='ffffffff-0000-0000-0000-00000000000c'
                             and c.code='PEN' then false else true end
from quotes q cross join sow_clauses c
where q.pr_id='dddddddd-0000-0000-0000-000000000001' and c.active;

select t_is(
  $q$ select grand_total::text from v_quote_totals
      where quote_id='ffffffff-0000-0000-0000-00000000000a' $q$,
  '7597000', 'ยอดเทียบฐานเดียวกันของเจ้า A คำนวณถูก (7,000,000 + ค่าส่ง 100,000 + VAT 7%)');

select t_is(
  $q$ select sow_complete::text from v_quote_totals
      where quote_id='ffffffff-0000-0000-0000-00000000000c' $q$,
  'false', 'เจ้า C รับ SOW ไม่ครบ ระบบจับได้เอง');

select t_is(
  $q$ select exclude_reason from v_quote_ranking
      where quote_id='ffffffff-0000-0000-0000-00000000000c' $q$,
  'sow_incomplete', 'เจ้า C ถูกตัดออกอัตโนมัติเพราะรับ SOW ไม่ครบ (ทั้งที่ราคาถูกสุด)');

select t_err(
  $q$ select fn_award_pr('dddddddd-0000-0000-0000-000000000001',
      (select jsonb_agg(jsonb_build_object('pr_line_id', ql.pr_line_id,
                                           'quote_line_id', ql.id))
       from quote_lines ql where ql.quote_id='ffffffff-0000-0000-0000-00000000000c')) $q$,
  '[ห้าม] เลือกเจ้าที่รับ SOW ไม่ครบเป็นผู้ชนะ');

-- ============================================================================
-- ขั้น 4 — เช็คงบ : ยอดนี้ใช้งบ 94.96% ต้องบังคับให้ระบุเหตุผลก่อน
-- ============================================================================
select t_is(
  $q$ select fn_check_budget('dddddddd-0000-0000-0000-000000000001', 7597000)->>'verdict' $q$,
  'warn', 'ใช้งบ 90-100% ระบบขึ้นเตือน');

select t_err(
  $q$ select fn_award_pr('dddddddd-0000-0000-0000-000000000001',
      (select jsonb_agg(jsonb_build_object('pr_line_id', ql.pr_line_id,
                                           'quote_line_id', ql.id))
       from quote_lines ql where ql.quote_id='ffffffff-0000-0000-0000-00000000000a')) $q$,
  '[ห้าม] ไปต่อทั้งที่งบเหลือไม่ถึง 10% โดยไม่ระบุเหตุผล');

insert into budget_warnings (pr_id, budget_id, used_bp, reason, ack_by)
values ('dddddddd-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
        9496,'งานเร่งด่วน ต้องส่งมอบอาคารตามสัญญาหลัก',
        '11111111-1111-1111-1111-111111111111');

select t_ok(
  $q$ select fn_award_pr('dddddddd-0000-0000-0000-000000000001',
      (select jsonb_agg(jsonb_build_object('pr_line_id', ql.pr_line_id,
                                           'quote_line_id', ql.id))
       from quote_lines ql where ql.quote_id='ffffffff-0000-0000-0000-00000000000a')) $q$,
  'เลือกเจ้า A (ถูกสุดในกลุ่มที่ผ่านเกณฑ์) พร้อมเหตุผลเรื่องงบแล้วผ่าน');

select t_is(
  $q$ select escalated::text from pr_awards where pr_id='dddddddd-0000-0000-0000-000000000001' $q$,
  'false', 'เลือกเจ้าถูกสุดในกลุ่มที่ผ่านเกณฑ์ จึงไม่ต้องยกระดับอนุมัติ');

select t_ok(
  $q$ select fn_submit_for_approval('dddddddd-0000-0000-0000-000000000001') $q$,
  'สร้างสายอนุมัติจากยอดที่ชนะจริง 68,480 บาท');

select t_is(
  $q$ select string_agg(role::text, '>' order by step_no) from approvals
      where doc_type='pr' and doc_id='dddddddd-0000-0000-0000-000000000001' $q$,
  'pm', 'ยอด 68,480 บาท ตกช่วงของ PM (50,000.01-300,000) จึงมีผู้อนุมัติคนเดียว');

select t_is(
  $q$ select count(*)::text from approvals
      where doc_type='pr' and doc_id='dddddddd-0000-0000-0000-000000000001'
        and role='inspector' $q$,
  '0', 'ยอดเกินช่วงของ ENG แล้ว จึงไม่ต้องผ่าน ENG อีก (ไม่ใช่สายอนุมัติแบบไล่ขึ้นสะสม)');

-- ============================================================================
-- ขั้น 6 — อนุมัติ
-- ============================================================================

-- บ๊อบมีตำแหน่ง PM ตรงกับขั้นที่ต้องอนุมัติพอดี แต่เป็นเจ้าของเรื่องเอง
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select t_err(
  $q$ select fn_decide_approval(
        (select id from approvals where doc_type='pr'
         and doc_id='dddddddd-0000-0000-0000-000000000001' and step_no=1), true) $q$,
  '[ห้าม] ผู้ขอซื้ออนุมัติเรื่องของตัวเอง');

-- แครอล (ผู้ตรวจรับ) ดูแลช่วง 0.01-50,000 เท่านั้น ยอดนี้ไม่ใช่ช่วงของเธอ
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select t_err(
  $q$ select fn_decide_approval(
        (select id from approvals where doc_type='pr'
         and doc_id='dddddddd-0000-0000-0000-000000000001' and step_no=1), true) $q$,
  '[ห้าม] ผู้อนุมัติช่วงราคาต่ำกว่า มาอนุมัติยอดที่เกินช่วงตัวเอง');

select t_is(
  $q$ select count(*)::text from prs where id='dddddddd-0000-0000-0000-000000000001' $q$,
  '0', 'ผู้ตรวจรับมองไม่เห็นเรื่องที่ยอดเกินช่วงราคาของตัวเอง');

-- แดน (PM) เจ้าของช่วงราคานี้
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select t_err(
  $q$ select fn_decide_approval(
        (select id from approvals where doc_type='pr'
         and doc_id='dddddddd-0000-0000-0000-000000000001' and step_no=1), false) $q$,
  '[ห้าม] ตีกลับโดยไม่ระบุเหตุผล');

-- อลิสมีตำแหน่ง PM ด้วย แต่เป็นคนคีย์ใบเสนอราคาเรื่องนี้
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select t_err(
  $q$ select fn_decide_approval(
        (select id from approvals where doc_type='pr'
         and doc_id='dddddddd-0000-0000-0000-000000000001' and step_no=1), true) $q$,
  '[ห้าม] คนคีย์ใบเสนอราคา กดอนุมัติเรื่องเดียวกัน');

set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select t_ok(
  $q$ select fn_decide_approval(
        (select id from approvals where doc_type='pr'
         and doc_id='dddddddd-0000-0000-0000-000000000001' and step_no=1), true) $q$,
  'PM อนุมัติคนเดียว จบสาย');

select t_is(
  $q$ select status::text from prs where id='dddddddd-0000-0000-0000-000000000001' $q$,
  'approved', 'เจ้าของช่วงราคาอนุมัติแล้ว สถานะเปลี่ยนเป็นอนุมัติทันที');

-- ============================================================================
-- ขั้น 7 — ออก PO + กันงบ
-- ============================================================================
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select t_ok(
  $q$ select fn_issue_po('dddddddd-0000-0000-0000-000000000001',
      '{"retention_bp":500,"wht_code":"S3"}'::jsonb) $q$,
  'ออกใบสั่งซื้อ + หักงบ + snapshot SOW แนบท้ายสัญญา');

select t_is(
  $q$ select count(*)::text from po_sow_snapshot ps join pos p on p.id=ps.po_id
      where p.pr_id='dddddddd-0000-0000-0000-000000000001' $q$,
  '6', 'SOW ถูก snapshot แนบท้ายสัญญาครบ 6 ข้อ');

select t_is(
  $q$ select available::text from v_budget_balance
      where budget_id='bbbbbbbb-0000-0000-0000-000000000001' $q$,
  '403000', 'งบถูกกันไว้อัตโนมัติ เหลือ 4,030 บาท');

select t_err(
  $q$ select fn_issue_po('dddddddd-0000-0000-0000-000000000001') $q$,
  '[ห้าม] ออก PO ซ้ำจากใบขอซื้อใบเดิม');

-- ============================================================================
-- ขั้น 8 — ส่งมอบ / ตรวจรับ  (ส่งช้า 5 วัน เพื่อทดสอบค่าปรับ)
-- ============================================================================
insert into deliveries (id, po_id, delivered_date, recorded_by, delivery_no)
select 'dddddddd-0000-0000-0000-0000000000d1', p.id, p.promised_date + 5,
       '11111111-1111-1111-1111-111111111111', 'DN-001'
from pos p where p.pr_id='dddddddd-0000-0000-0000-000000000001';

select t_err(
  $q$ insert into grs (delivery_id, result, inspected_by)
      values ('dddddddd-0000-0000-0000-0000000000d1','accepted',
              '11111111-1111-1111-1111-111111111111') $q$,
  '[ห้าม] คนบันทึกส่งมอบ เป็นคนตรวจรับเอง');

set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select t_ok(
  $q$ insert into grs (id, delivery_id, result, inspected_by)
      values ('dddddddd-0000-0000-0000-0000000000a1',
              'dddddddd-0000-0000-0000-0000000000d1','accepted',
              '33333333-3333-3333-3333-333333333333') $q$,
  'ผู้ตรวจรับคนละคนกับคนบันทึก จึงตรวจรับได้');

insert into gr_lines (gr_id, po_line_id, qty_accepted)
select 'dddddddd-0000-0000-0000-0000000000a1', pl.id, pl.qty
from po_lines pl join pos p on p.id = pl.po_id
where p.pr_id='dddddddd-0000-0000-0000-000000000001';

-- ============================================================================
-- ขั้น 9 — ใบแจ้งหนี้ + 3-Way Match
-- ============================================================================
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- บิลผิดก่อน: ราคาต่อหน่วยไม่ตรง PO
insert into invoices (id, po_id, vendor_invoice_no, invoice_date,
                      freight, subtotal, vat_amount, grand_total, entered_by)
select 'dddddddd-0000-0000-0000-0000000000e9', p.id, 'INV-BAD', current_date,
       100000, 7250000, 507500, 7757500, '11111111-1111-1111-1111-111111111111'
from pos p where p.pr_id='dddddddd-0000-0000-0000-000000000001';

insert into invoice_lines (invoice_id, po_line_id, qty, unit_price)
select 'dddddddd-0000-0000-0000-0000000000e9', pl.id, pl.qty, pl.unit_price + 10000
from po_lines pl join pos p on p.id=pl.po_id
where p.pr_id='dddddddd-0000-0000-0000-000000000001';

select t_is(
  $q$ select fn_match_invoice('dddddddd-0000-0000-0000-0000000000e9')->>'status' $q$,
  'mismatched', 'บิลที่ราคาไม่ตรง PO ระบบจับได้ = จับคู่ไม่ผ่าน');

select t_err(
  $q$ select fn_create_voucher('dddddddd-0000-0000-0000-0000000000e9') $q$,
  '[ห้าม] ตั้งเบิกทั้งที่ 3-Way Match ไม่ผ่าน');

-- บิลที่ถูกต้อง
insert into invoices (id, po_id, vendor_invoice_no, invoice_date,
                      freight, subtotal, vat_amount, grand_total, entered_by)
select 'dddddddd-0000-0000-0000-0000000000e1', p.id, 'INV-2026-001', current_date,
       100000, 7100000, 497000, 7597000, '11111111-1111-1111-1111-111111111111'
from pos p where p.pr_id='dddddddd-0000-0000-0000-000000000001';

insert into invoice_lines (invoice_id, po_line_id, qty, unit_price)
select 'dddddddd-0000-0000-0000-0000000000e1', pl.id, pl.qty, pl.unit_price
from po_lines pl join pos p on p.id=pl.po_id
where p.pr_id='dddddddd-0000-0000-0000-000000000001';

select t_is(
  $q$ select fn_match_invoice('dddddddd-0000-0000-0000-0000000000e1')->>'status' $q$,
  'matched', 'PO ↔ ใบรับของ ↔ ใบแจ้งหนี้ ตรงกันทุกช่อง');

-- ============================================================================
-- ขั้น 10 — ตั้งเบิก + หักค่าปรับ/เงินประกัน/ภาษี
-- ============================================================================
select t_ok(
  $q$ select fn_create_voucher('dddddddd-0000-0000-0000-0000000000e1') $q$,
  'ตั้งเบิก พร้อมคำนวณรายการหักอัตโนมัติ');

select t_is(
  $q$ select late_days::text from payment_vouchers pv
      join invoices i on i.id=pv.invoice_id
      where i.id='dddddddd-0000-0000-0000-0000000000e1' $q$,
  '5', 'ระบบนับวันส่งช้าได้ 5 วันจากวันส่งจริง');

-- ค่าปรับ 0.1%/วัน x 5 วัน ของ 7,597,000 = 37,985 · เงินประกัน 5% ของ 7,100,000 = 355,000
-- ภาษีหัก ณ ที่จ่าย 3% ของ 7,100,000 = 213,000
-- สุทธิ = 7,597,000 − 37,985 − 355,000 − 213,000 = 6,991,015
select t_is(
  $q$ select net_amount::text from payment_vouchers pv
      join invoices i on i.id=pv.invoice_id
      where i.id='dddddddd-0000-0000-0000-0000000000e1' $q$,
  '6991015', 'ยอดจ่ายสุทธิหลังหักค่าปรับ + เงินประกัน + ภาษี ณ ที่จ่าย ถูกต้อง');

select t_err(
  $q$ select fn_decide_voucher(
        (select pv.id from payment_vouchers pv
         where pv.invoice_id='dddddddd-0000-0000-0000-0000000000e1'), true) $q$,
  '[ห้าม] คนคีย์ใบแจ้งหนี้ กดอนุมัติจ่ายเอง');

set request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
select t_ok(
  $q$ select fn_decide_voucher(
        (select pv.id from payment_vouchers pv
         where pv.invoice_id='dddddddd-0000-0000-0000-0000000000e1'), true) $q$,
  'บัญชี (คนละคนกับคนคีย์บิล) อนุมัติจ่ายได้');

-- ============================================================================
-- ขั้น 11-12 — จ่ายจริง + คืนเงินประกัน
-- ============================================================================
select t_ok(
  $q$ select fn_record_payment(
        (select pv.id from payment_vouchers pv
         where pv.invoice_id='dddddddd-0000-0000-0000-0000000000e1'),
        current_date, 'โอนเงิน', 'TRF-0001') $q$,
  'บันทึกการจ่ายเงินจริง + ออกเลขหนังสือรับรองหักภาษี ณ ที่จ่าย');

select t_is(
  $q$ select case when wht_cert_no is not null then 'มี' else 'ไม่มี' end
      from payments order by paid_at desc limit 1 $q$,
  'มี', 'ระบบออกเลขหนังสือรับรองหักภาษี ณ ที่จ่ายให้อัตโนมัติ');

select t_is(
  $q$ select (actual)::text from v_budget_balance
      where budget_id='bbbbbbbb-0000-0000-0000-000000000001' $q$,
  '7597000', 'ตัดงบจริงเมื่อจ่ายเงินแล้ว');

set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select t_err(
  $q$ select fn_confirm_retention((select id from pos
        where pr_id='dddddddd-0000-0000-0000-000000000001')) $q$,
  '[ห้าม] ยืนยันคืนเงินประกันก่อนครบระยะรับประกัน');

-- เร่งเวลาให้ครบระยะรับประกัน เพื่อทดสอบขั้นตอนคืนเงินจริง
reset role;
update retention_releases set due_date = current_date - 1
where po_id = (select id from pos where pr_id='dddddddd-0000-0000-0000-000000000001');
set role authenticated;

set request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
select t_err(
  $q$ select fn_release_retention((select id from pos
        where pr_id='dddddddd-0000-0000-0000-000000000001'), 'TRF-RET-01') $q$,
  '[ห้าม] คืนเงินประกันก่อนผู้ตรวจรับยืนยัน');

set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select t_ok(
  $q$ select fn_confirm_retention((select id from pos
        where pr_id='dddddddd-0000-0000-0000-000000000001')) $q$,
  'ครบระยะแล้ว ผู้ตรวจรับยืนยันได้');

select t_err(
  $q$ select fn_release_retention((select id from pos
        where pr_id='dddddddd-0000-0000-0000-000000000001'), 'TRF-RET-01') $q$,
  '[ห้าม] คนยืนยันครบระยะ เป็นคนคืนเงินเอง');

set request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
select t_ok(
  $q$ select fn_release_retention((select id from pos
        where pr_id='dddddddd-0000-0000-0000-000000000001'), 'TRF-RET-01') $q$,
  'บัญชี (คนละคนกับผู้ยืนยัน) คืนเงินประกันผลงานได้');

select t_is(
  $q$ select status::text from pos where pr_id='dddddddd-0000-0000-0000-000000000001' $q$,
  'closed', 'คืนเงินประกันแล้ว สัญญาปิดสมบูรณ์');

-- ============================================================================
-- กติกาที่ต้องกันไว้ตลอดเวลา
-- ============================================================================
set request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';

select t_err($q$ update audit_log set action='แก้แล้ว' where id=(select min(id) from audit_log) $q$,
  '[ห้าม] แอดมินแก้ประวัติการใช้งานระบบ');
select t_err($q$ delete from audit_log where id=(select min(id) from audit_log) $q$,
  '[ห้าม] แอดมินลบประวัติการใช้งานระบบ');
select t_err($q$ update budget_ledger set amount=1 where id=(select min(id) from budget_ledger) $q$,
  '[ห้าม] แก้รายการตัดงบย้อนหลัง');
select t_err($q$ delete from budget_ledger where id=(select min(id) from budget_ledger) $q$,
  '[ห้าม] ลบรายการตัดงบ');
select t_err($q$ select fn_grant_role('88888888-8888-8888-8888-888888888888','ceo') $q$,
  '[ห้าม] แอดมินตั้งตำแหน่งเพิ่มให้ตัวเอง');
select t_err($q$ insert into user_roles (user_id, role)
                 values ('88888888-8888-8888-8888-888888888888','ceo') $q$,
  '[ห้าม] เขียนตารางตำแหน่งตรงๆ เลี่ยงฟังก์ชัน');

set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select t_err($q$ select fn_grant_role('22222222-2222-2222-2222-222222222222','admin') $q$,
  '[ห้าม] พนักงานทั่วไปตั้งตัวเองเป็นแอดมิน');
update approval_limits set max_amount = 999999999 where role='inspector';
select t_is($q$ select max_amount::text from approval_limits where role='inspector' $q$,
  '5000000', '[ห้าม] คนที่ไม่ใช่แอดมิน แก้วงเงินอนุมัติ — วงเงินไม่ขยับ');
select t_err($q$ insert into audit_log (action, table_name, actor_name)
                 values ('INSERT','prs','ประวัติปลอม') $q$,
  '[ห้าม] แทรกประวัติการใช้งานปลอมเข้าไปเอง');

select t_is($q$ select count(*)::text from audit_log
                where table_name='approvals' and action='UPDATE' $q$,
  '0', 'พนักงานทั่วไปอ่านประวัติของคนอื่นไม่ได้ (เห็นแค่ของตัวเอง)');

set request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';
select t_is($q$ select count(*)::text from audit_log
                where table_name='approvals' and action='UPDATE' $q$,
  '1', 'การอนุมัติถูกบันทึกลงประวัติการใช้งาน (แอดมินตรวจย้อนหลังได้)');

-- ช่วงราคาคำนวณจากปลายช่วงของขั้นก่อนหน้า ตารางที่วงเงินไม่ไล่จากน้อยไปมาก
-- จะสร้างช่วงที่ไม่มียอดไหนตกลงไปได้เลย ต้องโดนบล็อกตั้งแต่ตอนบันทึก
set request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';
select t_err($q$ update approval_limits set max_amount = 50000000 where role='inspector' $q$,
  '[ห้าม] ตั้งวงเงินขั้นล่างสูงกว่าขั้นบน จนช่วงราคาซ้อนกัน');
select t_err($q$ update approval_limits set max_amount = 500000000 where role='ceo' $q$,
  '[ห้าม] ปิดขั้นไม่จำกัดทิ้ง จนยอดใหญ่ไม่มีใครอนุมัติได้');
select t_is($q$ select max_amount::text from approval_limits where role='inspector' $q$,
  '5000000', 'ตารางวงเงินไม่ขยับ หลังโดนบล็อกทั้งสองเคส');

-- ============================================================================
-- เกินงบ — ต้องบล็อกจนกว่า CEO อนุมัติยกเว้น
-- ============================================================================
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
insert into prs (id, requester_id, cost_center_id, purpose_th, needed_by)
values ('dddddddd-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',
        'aaaaaaaa-0000-0000-0000-000000000001','งานเพิ่มเติมที่งบไม่พอ', current_date + 60);
insert into pr_lines (id, pr_id, seq, description, qty, unit, est_unit_price)
values ('eeeeeeee-0000-0000-0000-000000000009','dddddddd-0000-0000-0000-000000000002',
        1,'งานติดตั้งเพิ่มเติม',1,'งาน',5000000);
insert into pr_sow (pr_id, sow_clause_id, requirement_th)
select 'dddddddd-0000-0000-0000-000000000002', c.id, 'ตามมาตรฐาน' from sow_clauses c where c.active;
select fn_lock_sow('dddddddd-0000-0000-0000-000000000002');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select fn_issue_rfq('dddddddd-0000-0000-0000-000000000002',
                    'cccccccc-0000-0000-0000-00000000000a','hash-2');
insert into quotes (id, pr_id, vendor_id, quote_no, quote_date, vat_bp, entered_by)
values ('ffffffff-0000-0000-0000-000000000021','dddddddd-0000-0000-0000-000000000002',
        'cccccccc-0000-0000-0000-00000000000a','QT-A-002',current_date,700,
        '11111111-1111-1111-1111-111111111111');
insert into quote_lines (id, quote_id, pr_line_id, qty, unit_price)
values ('ffffffff-0000-0000-0000-000000000022','ffffffff-0000-0000-0000-000000000021',
        'eeeeeeee-0000-0000-0000-000000000009',1,5000000);
insert into quote_sow (quote_id, sow_clause_id, accepted)
select 'ffffffff-0000-0000-0000-000000000021', c.id, true from sow_clauses c where c.active;
select t_is(
  $q$ select fn_check_budget('dddddddd-0000-0000-0000-000000000002', 5350000)->>'verdict' $q$,
  'over', 'ยอดที่เกินงบคงเหลือ ระบบตัดสินว่า "เกินงบ"');

select t_err(
  $q$ select fn_award_pr('dddddddd-0000-0000-0000-000000000002',
      $j$[{"pr_line_id":"eeeeeeee-0000-0000-0000-000000000009",
           "quote_line_id":"ffffffff-0000-0000-0000-000000000022"}]$j$::jsonb) $q$,
  '[ห้าม] สั่งซื้อเกินงบโดยไม่มี Budget Exception');

insert into budget_exceptions (id, pr_id, budget_id, amount_over, reason, requested_by)
values ('dddddddd-0000-0000-0000-0000000000b1','dddddddd-0000-0000-0000-000000000002',
        'bbbbbbbb-0000-0000-0000-000000000001', 4947000,
        'งานจำเป็นตามสัญญาหลัก ขอใช้งบกลาง','11111111-1111-1111-1111-111111111111');

set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select t_err(
  $q$ select fn_decide_budget_exception('dddddddd-0000-0000-0000-0000000000b1', true, null) $q$,
  '[ห้าม] PD อนุมัติการขอยกเว้นงบ (สงวนไว้ให้ CEO เท่านั้น)');

set request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666"}';
select t_ok(
  $q$ select fn_decide_budget_exception('dddddddd-0000-0000-0000-0000000000b1', true, 'อนุมัติตามความจำเป็น') $q$,
  'CEO อนุมัติการขอยกเว้นงบได้');

set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select t_ok(
  $q$ select fn_award_pr('dddddddd-0000-0000-0000-000000000002',
      $j$[{"pr_line_id":"eeeeeeee-0000-0000-0000-000000000009",
           "quote_line_id":"ffffffff-0000-0000-0000-000000000022"}]$j$::jsonb) $q$,
  'พอ CEO อนุมัติยกเว้นงบแล้ว จึงเดินต่อได้');

-- ============================================================================
-- สรุปผล
-- ============================================================================
reset role;
\echo ''
\echo '=============================== ผลการทดสอบ ==============================='
select lpad(n::text,3) as "ข้อ",
       case when pass then '  ผ่าน  ' else '  ตก    ' end as "ผล",
       label as "รายการ", detail as "รายละเอียด"
from _t order by n;

\echo ''
select count(*) filter (where pass) || ' / ' || count(*) || ' ผ่าน'   as "สรุป",
       count(*) filter (where not pass) || ' ตก'                      as "ที่ต้องแก้"
from _t;
