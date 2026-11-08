-- ============================================================================
-- 08 — ลบผู้ใช้ออกจากระบบ (เฉพาะผู้ดูแลระบบ)
-- รันไฟล์นี้ต่อจาก 07_invites.sql
--
-- ระบบจัดซื้อต้องตรวจสอบย้อนหลังได้ ใบขอซื้อ/ใบสั่งซื้อ/ใบตรวจรับ ผูกกับคนทำไว้
-- ด้วย foreign key ทั้งหมด 24 จุด ลบคนที่เคยทำเอกสารทิ้ง = ประวัติขาด
-- ฟังก์ชันนี้จึงทำ 2 ระดับตามความเป็นจริงของข้อมูล
--
--   1) ไม่เคยมีเอกสารในระบบ (เชิญผิดคน / อีเมลผิด) → ลบทิ้งจริง คืนค่า 'deleted'
--   2) เคยมีเอกสารแล้ว                              → ถอนตำแหน่งทั้งหมด + ปิดบัญชี
--                                                      คืนค่า 'disabled'
--
-- ทั้งสองกรณีผู้ใช้เข้าระบบไม่ได้อีก และมีร่องรอยใน audit_log
-- (audit_log.actor_id ตั้งใจไม่ผูก foreign key ประวัติจึงอยู่ครบแม้ลบคนทิ้ง)
--
-- หมายเหตุ: บัญชีใน Supabase Auth ยังอยู่ ลบจากเบราว์เซอร์ไม่ได้ (ต้องใช้ service key)
-- ถ้าต้องการลบให้หมดจริง ไปลบที่ Dashboard → Authentication → Users อีกที
-- แต่ไม่ลบก็เข้าระบบไม่ได้อยู่ดี เพราะไม่มีโปรไฟล์และไม่มีตำแหน่ง
-- ============================================================================

create or replace function fn_remove_user(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
begin
  perform fn_require(has_role('admin'), 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบผู้ใช้ได้');
  perform fn_require(p_user <> auth.uid(), 'ลบบัญชีของตัวเองไม่ได้');
  perform fn_require(exists (select 1 from user_profiles where id = p_user),
                     'ไม่พบผู้ใช้รายนี้');

  -- กันระบบไร้ผู้ดูแล — กติกาเดียวกับ fn_revoke_role
  perform fn_require(
    not exists (select 1 from user_roles where user_id = p_user and role = 'admin')
    or (select count(*) from user_roles where role = 'admin') > 1,
    'ลบผู้ดูแลระบบคนสุดท้ายไม่ได้');

  -- ถอนตำแหน่งกับปิดบัญชีก่อนเสมอ ส่วนนี้สำเร็จแน่นอนไม่ว่าจะลบแถวได้หรือไม่
  delete from user_roles where user_id = p_user;
  update user_profiles set active = false where id = p_user;

  -- คำเชิญที่ยังค้างของอีเมลนี้ ต้องตายไปพร้อมกัน ไม่งั้นเชิญตัวเองกลับเข้ามาได้
  update user_invites set revoked_at = now()
   where revoked_at is null
     and email = (select lower(email) from user_profiles where id = p_user);

  -- คำเชิญที่ "คนนี้เป็นคนออก" ก็ต้องตายด้วย คนค้ำประกันไม่อยู่แล้ว
  -- แล้วตัด created_by ทิ้ง ไม่งั้น FK ของ user_invites ค้างจนลบโปรไฟล์ไม่ได้
  -- (ใครออกคำเชิญใบไหนยังดูย้อนหลังได้จาก audit_log ที่ลบไม่ได้)
  update user_invites set revoked_at = coalesce(revoked_at, now()), created_by = null
   where created_by = p_user;

  -- ลบแถวโปรไฟล์ทิ้งได้เฉพาะคนที่ไม่เคยแตะเอกสารเลย
  -- ถ้ามี FK ค้างอยู่ Postgres จะโยน foreign_key_violation ออกมา
  -- ตรงนี้ rollback แค่ใน block นี้ การถอนตำแหน่ง/ปิดบัญชีข้างบนยังอยู่
  begin
    delete from user_profiles where id = p_user;
    return 'deleted';
  exception when foreign_key_violation then
    return 'disabled';
  end;
end $$;

revoke all on function fn_remove_user(uuid) from public, anon;
grant execute on function fn_remove_user(uuid) to authenticated;
