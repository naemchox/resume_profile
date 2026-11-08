-- ============================================================================
-- แอดมินแก้จำนวนที่ส่งมอบของใบส่งมอบใบไหนก็ได้ ถ้าใบนั้นยังไม่ถูกตรวจรับ
--
-- ทำไมต้องมีไฟล์นี้
--   db/18_delivery_lines.sql ให้สิทธิ์เขียนบรรทัดจำนวนเฉพาะ "เจ้าของใบส่งมอบ"
--   ซึ่งถูกสำหรับงานประจำวัน — คนบันทึกส่งมอบก็ควรเป็นคนแก้ของตัวเอง
--
--   แต่ระบบนี้เป็นแบบ 1 บริษัท 1 ชุด แอดมินคือเจ้าของระบบและเป็นคนแก้ข้อมูลที่คีย์ผิดให้ทุกคน
--   ของเดิมพอคนอื่นคีย์จำนวนผิดแล้วไม่อยู่ ไม่มีใครแก้ได้เลย ต้องรอเจ้าตัวล็อกอินอย่างเดียว
--
-- ขอบเขตที่ยังกันไว้เหมือนเดิม
--   แก้ได้เฉพาะใบที่ "ยังไม่มีผลตรวจรับ" — ตรวจรับแล้วถือว่าปิดเรื่อง ห้ามย้อนแก้ตัวเลข
--   ไม่ได้แตะกติกาแยกหน้าที่ (คนบันทึกส่งมอบยังตรวจรับใบตัวเองไม่ได้ตามเดิม)
--   ทุกการแก้ยังลง trg_audit ครบ ตามได้ว่าใครแก้อะไรเมื่อไหร่
--
--   ไม่มีนโยบาย update — หน้าเว็บแก้จำนวนด้วยการลบบรรทัดเดิมแล้วใส่ใหม่
--
-- รันซ้ำได้
-- ============================================================================

drop policy if exists admin_fix_insert on delivery_lines;
create policy admin_fix_insert on delivery_lines for insert to authenticated
  with check (has_any_role('admin')
              and not exists (select 1 from grs g
                              where g.delivery_id = delivery_lines.delivery_id));

drop policy if exists admin_fix_delete on delivery_lines;
create policy admin_fix_delete on delivery_lines for delete to authenticated
  using (has_any_role('admin')
         and not exists (select 1 from grs g
                         where g.delivery_id = delivery_lines.delivery_id));
