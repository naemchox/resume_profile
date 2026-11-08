-- ============================================================================
-- แก้บันทึกการจ่ายเงินที่คีย์ผิด
--
-- ทำไมต้องมี: ตอนกด "บันทึกการจ่ายเงิน" ผู้ใช้เลือกวิธีจ่าย/เลขอ้างอิง/วันที่จ่ายเอง
-- คีย์ผิดได้เป็นเรื่องปกติ (เช่นเลือก "เงินสด" ทั้งที่โอน) แต่เดิมไม่มีทางแก้เลย
-- ตาราง payments ไม่มี policy insert/update ใดๆ ทุกอย่างต้องผ่าน RPC เท่านั้น
--
-- แก้ได้เฉพาะข้อมูลที่คนกรอกเอง 4 ช่อง: วันที่จ่าย · วิธีจ่าย · เลขอ้างอิง · หมายเหตุ
-- ห้ามแตะ: wht_cert_no (เลขรันเอกสารที่ออกไปแล้ว ซ้ำไม่ได้)
--          paid_by / paid_at (ร่องรอยว่าใครจ่ายตอนไหน)
--          ยอดเงินทั้งหมด (อยู่ที่ใบสำคัญจ่าย ตั้งเบิกแล้วแก้ไม่ได้ตามเดิม)
-- ทุกครั้งที่แก้ถูกบันทึกใน audit_log ให้เองโดย trigger z_audit ของตาราง payments
--
-- รันไฟล์นี้ใน SQL Editor ของ Supabase หลัง 04_functions.sql  (รันซ้ำได้ ไม่พัง)
-- ============================================================================

create or replace function fn_edit_payment(
  p_voucher uuid, p_paid_date date, p_method text, p_ref_no text, p_note text default null)
returns payments language plpgsql security definer set search_path = public as $$
declare
  v_p payments; v_v payment_vouchers; v_inv invoices; v_po pos; v_r retention_releases;
  v_old_date date;
begin
  select * into v_p from payments where voucher_id = p_voucher;
  perform fn_require(v_p.id is not null, 'ยังไม่มีบันทึกการจ่ายเงินของใบสำคัญจ่ายนี้');
  perform fn_require(has_any_role('accounting','admin'), 'เฉพาะฝ่ายบัญชีเท่านั้น');
  perform fn_require(p_paid_date is not null, 'ต้องระบุวันที่จ่าย');
  perform fn_require(coalesce(btrim(p_method), '') <> '', 'ต้องระบุวิธีจ่าย');
  perform fn_require(coalesce(btrim(p_ref_no), '') <> '', 'ต้องระบุเลขอ้างอิงการจ่าย');

  v_old_date := v_p.paid_date;

  select * into v_v   from payment_vouchers where id = p_voucher;
  select * into v_inv from invoices where id = v_v.invoice_id;
  select * into v_po  from pos where id = v_inv.po_id;
  select * into v_r   from retention_releases where po_id = v_po.id;

  -- วันครบระยะรับประกันนับจากวันที่จ่าย ถ้าผู้ตรวจรับยืนยันครบระยะไปแล้ว
  -- (หรือคืนเงินประกันไปแล้ว) การขยับวันจ่ายจะทำให้คำยืนยันนั้นกลายเป็นเท็จย้อนหลัง
  perform fn_require(
    p_paid_date = v_old_date or v_r.id is null or v_r.confirmed_at is null,
    'ผู้ตรวจรับยืนยันครบระยะรับประกันของ PO นี้แล้ว แก้วันที่จ่ายไม่ได้ — แก้ช่องอื่นได้ตามปกติ');

  update payments
     set paid_date = p_paid_date,
         method    = btrim(p_method),
         ref_no    = btrim(p_ref_no),
         note      = nullif(btrim(p_note), '')
   where id = v_p.id
  returning * into v_p;

  -- วันจ่ายขยับ วันครบระยะรับประกันต้องขยับตาม
  -- แต่ขยับเฉพาะแถวที่วันครบมาจากใบนี้จริงๆ — PO เดียวมีได้หลายใบแจ้งหนี้มารวมกันในแถวเดียว
  -- ถ้าวันครบไม่ตรงกับสูตรของใบนี้ แปลว่ามีใบอื่นเป็นคนตั้งไว้ อย่าไปทับของเขา
  if v_r.id is not null and v_r.released_at is null and p_paid_date <> v_old_date
     and v_r.due_date = v_old_date + coalesce(v_po.warranty_days, 0) then
    update retention_releases
       set due_date = p_paid_date + coalesce(v_po.warranty_days, 0)
     where id = v_r.id;
  end if;

  return v_p;
end $$;

revoke all on function fn_edit_payment(uuid, date, text, text, text) from public, anon;
grant execute on function fn_edit_payment(uuid, date, text, text, text) to authenticated;
