-- ============================================================================
-- ปลดล็อกขอบเขตงาน — กลับไปแก้แล้วล็อกใหม่ได้
--
-- ทำไมต้องมีไฟล์นี้
--   fn_lock_sow เป็นประตูทางเดียว พอกดล็อกแล้วใบขอซื้อขยับเป็น sow_locked ทันที
--   ช่องกรอกทั้งการ์ดขอบเขตงานกลายเป็นสีเทา แก้อะไรไม่ได้อีกเลย
--   แต่ความจริงตอนกดล็อกคือช่วงที่คนยังเห็นของครบหน้าจอครั้งแรก และมักเจอทันทีว่า
--   พิมพ์ % ผิด หรือลืมข้อ 6 — ของเดิมทางออกเดียวคือทิ้งใบนี้แล้วทำใบใหม่
--   ซึ่งเปลืองเลขที่ใบขอซื้อไปฟรีๆ หนึ่งเลข และประวัติก็ขาดตอน
--
-- กติกา
--   ปลดล็อกได้เฉพาะใบที่ยัง "ไม่มีกระดาษออกไปข้างนอก" เท่านั้น
--   คือ status = sow_locked และยังไม่เคยพิมพ์ใบขอราคาสักใบ (rfq_prints ว่าง)
--   พอออกใบขอราคาไปแล้ว ผู้ขายถือเงื่อนไขชุดนั้นอยู่ในมือ การย้อนกลับมาแก้เงียบๆ
--   เท่ากับเปลี่ยนโจทย์หลังส่งโจทย์ไปแล้ว — ห้ามเด็ดขาด ให้ยกเลิกใบแล้วทำใหม่แทน
--
--   เลขที่ใบขอซื้อ (pr_no) ไม่คืนและไม่ออกใหม่ ใบเดิมยังเป็นเลขเดิม
--   เพราะ fn_lock_sow ออกเลขให้เฉพาะตอน pr_no ยังว่าง กดล็อกซ้ำจึงไม่กินเลขเพิ่ม
--
--   ใครกดได้ = เจ้าของใบ หรือแอดมิน (ชุดเดียวกับที่กดล็อกได้)
--   ทุกครั้งที่ปลดล็อกมี audit_log บันทึกอยู่แล้วจากทริกเกอร์ z_audit บนตาราง prs
--
-- รันซ้ำได้
-- ============================================================================

create or replace function fn_unlock_sow(p_pr uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr prs;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(v_pr.requester_id = auth.uid() or has_role('admin'),
                     'เฉพาะผู้ขอซื้อเจ้าของเรื่องเท่านั้น');
  perform fn_require(v_pr.status = 'sow_locked',
                     'ปลดล็อกได้เฉพาะใบที่ล็อกขอบเขตงานแล้วแต่ยังไม่ได้ออกใบขอราคา');
  perform fn_require(not exists (select 1 from rfq_prints where pr_id = p_pr),
                     'ใบนี้ออกใบขอราคาไปแล้ว แก้ขอบเขตงานย้อนหลังไม่ได้');

  update prs set status = 'draft', sow_locked_at = null, updated_at = now()
  where id = p_pr;
end $$;

revoke all on function fn_unlock_sow(uuid) from public, anon;
grant execute on function fn_unlock_sow(uuid) to authenticated;

-- PostgREST จำรายชื่อฟังก์ชันไว้ใน cache ถ้าไม่บอกให้อ่านใหม่ หน้าเว็บจะยังขึ้นว่า
-- "Could not find the function ... in the schema cache" ทั้งที่ฟังก์ชันมีอยู่จริงแล้ว
notify pgrst, 'reload schema';
