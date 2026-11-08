-- ============================================================================
-- TRIGGERS
--   1) audit_log  — บันทึกทุกการเปลี่ยนแปลง ลบไม่ได้ แก้ไม่ได้
--   2) แยกหน้าที่ข้ามตาราง (คนบันทึกส่งมอบ ≠ คนตรวจรับ) ที่ CHECK ทำไม่ได้
--   3) ล็อกคอลัมน์ที่ห้ามแก้ย้อนหลัง (entered_by / recorded_by / ยอดเงินใน PO)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) AUDIT LOG
-- ----------------------------------------------------------------------------
create or replace function trg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_row jsonb; v_id text;
begin
  select full_name_th into v_name from user_profiles where id = auth.uid();
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_id  := v_row->>'id';

  insert into audit_log (actor_id, actor_name, action, table_name, row_id, before, after)
  values (
    auth.uid(), v_name, tg_op, tg_table_name, v_id,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end
  );

  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'prs','pr_lines','pr_sow','rfq_prints',
    'quotes','quote_lines','quote_sow',
    'budget_exceptions','budget_warnings','pr_awards','line_awards',
    'approvals','pos','po_lines','po_sow_snapshot',
    'deliveries','grs','gr_lines',
    'invoices','invoice_lines','match_results',
    'payment_vouchers','payments','retention_releases',
    'budgets','budget_ledger','vendors','vendor_ratings',
    'user_roles','user_profiles','approval_limits','sow_clauses','wht_rates',
    'cost_centers','projects','company_profile'
  ]
  loop
    execute format(
      'create trigger z_audit after insert or update or delete on public.%I
         for each row execute function trg_audit()', t);
  end loop;
end $$;

-- audit_log แก้/ลบไม่ได้ แม้แต่ผ่านฟังก์ชัน SECURITY DEFINER
create or replace function trg_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'ตาราง % เป็นแบบบันทึกอย่างเดียว แก้หรือลบไม่ได้', tg_table_name
    using errcode = 'P0001';
end $$;

create trigger no_update before update on audit_log
  for each row execute function trg_append_only();
create trigger no_delete before delete on audit_log
  for each row execute function trg_append_only();

create trigger no_update before update on budget_ledger
  for each row execute function trg_append_only();
create trigger no_delete before delete on budget_ledger
  for each row execute function trg_append_only();

create trigger no_update before update on rfq_prints
  for each row execute function trg_append_only();

-- ----------------------------------------------------------------------------
-- 2) แยกหน้าที่ — คนบันทึกส่งมอบ ≠ คนตรวจรับ
--    ข้อนี้ CHECK constraint ทำไม่ได้เพราะข้อมูลอยู่คนละตาราง
-- ----------------------------------------------------------------------------
create or replace function trg_gr_segregation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recorder uuid; v_po uuid;
begin
  select d.recorded_by, d.po_id into v_recorder, v_po
  from deliveries d where d.id = new.delivery_id;

  if v_recorder is null then
    raise exception 'ไม่พบใบส่งมอบที่อ้างถึง' using errcode = 'P0001';
  end if;

  if v_recorder = new.inspected_by then
    raise exception 'คนบันทึกส่งมอบกับคนตรวจรับ ต้องเป็นคนละคน'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from pos p where p.id = v_po
                 and p.status in ('issued','partially_received','received','invoiced')) then
    raise exception 'PO นี้ไม่อยู่ในสถานะที่ตรวจรับได้' using errcode = 'P0001';
  end if;

  return new;
end $$;

create trigger gr_segregation before insert or update on grs
  for each row execute function trg_gr_segregation();

-- อัปเดตสถานะ PO หลังตรวจรับ + ให้คะแนนผู้ขายทันที
create or replace function trg_gr_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_po uuid; v_complete boolean;
begin
  select d.po_id into v_po from deliveries d where d.id = new.delivery_id;

  select not exists (
    select 1 from v_po_line_received r
    join po_lines pl on pl.id = r.po_line_id
    where pl.po_id = v_po and r.qty_accepted < pl.qty
  ) into v_complete;

  update pos
  set status = (case when v_complete then 'received' else 'partially_received' end)::po_status
  where id = v_po and status in ('issued','partially_received');

  perform fn_rate_vendor(v_po);
  return new;
end $$;

create trigger gr_after after insert or update on grs
  for each row execute function trg_gr_after();

-- ----------------------------------------------------------------------------
-- 3) ล็อกคอลัมน์ที่ห้ามแก้ย้อนหลัง
-- ----------------------------------------------------------------------------
create or replace function trg_lock_entered_by()
returns trigger language plpgsql as $$
begin
  if new.entered_by <> old.entered_by then
    raise exception 'แก้ชื่อคนคีย์ข้อมูลย้อนหลังไม่ได้' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger lock_enterer before update on quotes
  for each row execute function trg_lock_entered_by();
create trigger lock_enterer before update on invoices
  for each row execute function trg_lock_entered_by();

create or replace function trg_lock_recorded_by()
returns trigger language plpgsql as $$
begin
  if new.recorded_by <> old.recorded_by then
    raise exception 'แก้ชื่อคนบันทึกส่งมอบย้อนหลังไม่ได้' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger lock_recorder before update on deliveries
  for each row execute function trg_lock_recorded_by();

-- updated_at ให้ระบบเติมเอง
create or replace function trg_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch before update on prs
  for each row execute function trg_touch();
create trigger touch before update on company_profile
  for each row execute function trg_touch();

-- ----------------------------------------------------------------------------
-- 4) ผูก auth.users -> user_profiles อัตโนมัติเมื่อ Admin เชิญผู้ใช้เข้าระบบ
--    ผู้ใช้ใหม่ "ไม่มีตำแหน่งใดเลย" จนกว่า Admin จะตั้งให้ผ่าน fn_grant_role
-- ----------------------------------------------------------------------------
create or replace function trg_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, full_name_th, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function trg_new_auth_user();

-- ----------------------------------------------------------------------------
-- 5) พอเริ่มคีย์ใบเสนอราคาใบแรก ให้ขยับสถานะ PR เป็น "กำลังคีย์ใบเสนอราคา"
-- ----------------------------------------------------------------------------
create or replace function trg_quote_starts_quoting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update prs set status = 'quoting', updated_at = now()
  where id = new.pr_id and status = 'rfq_issued';
  return new;
end $$;

create trigger quote_starts_quoting after insert on quotes
  for each row execute function trg_quote_starts_quoting();

-- ----------------------------------------------------------------------------
-- 6) เลขที่เอกสารของตารางที่ยอมให้เขียนตรง (ใบตรวจรับ / ใบแจ้งหนี้)
--    ต้องออกจากฝั่งฐานข้อมูลเสมอ ไม่รับเลขที่ส่งมาจากเบราว์เซอร์
-- ----------------------------------------------------------------------------
create or replace function trg_assign_gr_no()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.fiscal_year := coalesce(new.fiscal_year, fn_fiscal_year(current_date));
  new.gr_no := fn_next_doc_no('gr', new.fiscal_year);
  return new;
end $$;

create trigger assign_gr_no before insert on grs
  for each row execute function trg_assign_gr_no();

create or replace function trg_assign_invoice_ref()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.fiscal_year := coalesce(new.fiscal_year, fn_fiscal_year(current_date));
  if new.invoice_ref is null then
    new.invoice_ref := fn_next_doc_no('invoice', new.fiscal_year);
  end if;
  return new;
end $$;

create trigger assign_invoice_ref before insert on invoices
  for each row execute function trg_assign_invoice_ref();

-- ---------------------------------------------------------------------------
-- ใบสั่งซื้อที่ไม่ได้ผูกงบ (budget_id ว่าง) ไม่มีอะไรให้กัน/ปลด/ลงจ่ายจริงในบัญชีงบ
-- คุมที่ทางเข้าตารางที่เดียว แทนที่จะไปใส่ if ทุกจุดที่เขียน ledger (มี 4 จุด)
-- ---------------------------------------------------------------------------
create or replace function trg_skip_unbudgeted_ledger()
returns trigger language plpgsql as $$
begin
  if new.budget_id is null then return null; end if;   -- null = ยกเลิกการ insert แถวนี้
  return new;
end $$;

create trigger skip_unbudgeted_ledger before insert on budget_ledger
  for each row execute function trg_skip_unbudgeted_ledger();
