-- ============================================================================
-- ไฟล์บิลจริงต้องแนบได้โดยคนที่คีย์บิล
--
-- เจอตอนทำหน้าใบแจ้งหนี้ให้บังคับแนบไฟล์ (2 ก.ย. 2569):
-- ฝ่ายบัญชีคีย์ใบแจ้งหนี้ได้ (03_rls.sql keyer_insert = purchasing/accounting/admin)
-- แต่ policy อัปโหลดไฟล์ใน 10_storage.sql ให้แค่ purchasing/admin
-- ผลคือคนบัญชีคีย์บิลแล้วแนบไฟล์ไม่ได้ ติด row-level security ตอนกดบันทึก
--
-- แก้ที่ policy อัปโหลด ไม่ใช่ไปปลดเงื่อนไข "ต้องแนบไฟล์" ที่หน้าเว็บ
-- เพราะบิลที่ไม่มีกระดาษต้นทางแนบไว้ ตรวจย้อนหลังไม่ได้ว่าเลขที่คีย์มาจากไหน
--
-- รันไฟล์นี้ใน SQL Editor ของ Supabase หลัง 10_storage.sql  (รันซ้ำได้ ไม่พัง)
-- ============================================================================

drop policy if exists attachments_insert on storage.objects;

create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.has_any_role('purchasing', 'accounting', 'admin')
    and (storage.foldername(name))[1]
        in ('quotes', 'invoices', 'deliveries', 'misc')
  );

-- ============================================================================
-- แนบ/เปลี่ยนไฟล์บิลทีหลังได้ จนกว่าจะตั้งเบิก
--
-- ทำไมต้องเป็น RPC ไม่ใช่ปลด policy keyer_update:
-- keyer_update ล็อกไว้ที่สถานะ entered/mismatched เพื่อกันคนแก้ "ตัวเลข" หลังจับคู่ผ่านแล้ว
-- (แก้ได้เมื่อไหร่ ผลจับคู่ 3 ทางก็ไม่มีความหมายทันที)
-- แต่ "ไฟล์บิล" เป็นแค่หลักฐานประกอบ ไม่กระทบผลจับคู่ และของจริงมักสแกนมาทีหลัง
-- จึงเปิดทางเฉพาะคอลัมน์เดียวผ่านฟังก์ชันนี้ ที่แตะได้แค่ attachment_path
--
-- ตั้งเบิกแล้วห้ามเปลี่ยน — ใบสำคัญจ่ายอ้างหลักฐานชุดที่เห็นตอนอนุมัติไปแล้ว
-- (ตัวไฟล์เก่าไม่ถูกลบออกจากคลังอยู่แล้ว ตามที่เขียนไว้ใน 10_storage.sql)
-- ทุกครั้งที่เปลี่ยนถูกบันทึกใน audit_log ให้เองโดย trigger z_audit ของตาราง invoices
-- ============================================================================

create or replace function fn_attach_invoice_file(p_invoice uuid, p_path text)
returns invoices language plpgsql security definer set search_path = public as $$
declare v_inv invoices;
begin
  select * into v_inv from invoices where id = p_invoice;
  perform fn_require(v_inv.id is not null, 'ไม่พบใบแจ้งหนี้');
  perform fn_require(has_any_role('purchasing','accounting','admin'),
                     'เฉพาะฝ่ายจัดซื้อหรือบัญชีเท่านั้น');
  perform fn_require(p_path is not null and length(btrim(p_path)) > 0, 'ยังไม่ได้เลือกไฟล์');
  perform fn_require(v_inv.status not in ('voucher_created','paid'),
                     'ใบแจ้งหนี้นี้ตั้งเบิกไปแล้ว เปลี่ยนไฟล์แนบไม่ได้');

  update invoices set attachment_path = btrim(p_path)
   where id = p_invoice
  returning * into v_inv;
  return v_inv;
end $$;

revoke all on function fn_attach_invoice_file(uuid, text) from public, anon;
grant execute on function fn_attach_invoice_file(uuid, text) to authenticated;
