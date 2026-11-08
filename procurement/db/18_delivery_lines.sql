-- ============================================================================
-- ใบส่งมอบเก็บ "จำนวนที่ผู้ขายส่งมา" ได้แล้ว
--
-- ทำไมต้องมีไฟล์นี้
--   ของเดิม deliveries เก็บแค่หัวเรื่อง — วันที่ส่ง เลขที่ใบส่งของ ไฟล์แนบ
--   ไม่มีที่เก็บจำนวนสักช่อง แปลว่าประโยค "ผู้ขายส่งมา 10 อัน" ไม่ถูกบันทึกที่ไหนเลย
--   ตอนตรวจรับจึงต้องเอาจำนวนไปเทียบกับยอดค้างของใบสั่งซื้อแทน ซึ่งคนละความหมาย
--
--   ผลคือแยกไม่ออกระหว่างสองเรื่องนี้
--     ก) ผู้ขายส่งมาไม่ครบ  (ส่ง 6 จาก 10)
--     ข) ผู้ขายส่งครบแต่ของเสีย (ส่ง 10 รับ 5 ตีกลับ 5)
--   ทั้งที่สองอย่างนี้ตามงานคนละแบบ — ข้อแรกตามของ ข้อสองตามเคลม
--
-- กติกา
--   หนึ่งใบส่งมอบมีได้หลายบรรทัด บรรทัดละหนึ่งรายการในใบสั่งซื้อ ห้ามซ้ำรายการ
--   จำนวนต้องมากกว่า 0 — ใบส่งมอบที่ไม่มีของอยู่ในนั้นไม่ควรมีตั้งแต่แรก
--
--   ใครบันทึกได้ = ฝ่ายจัดซื้อ / แอดมิน และต้องเป็นเจ้าของใบส่งมอบใบนั้นเอง
--   ลบได้เฉพาะตอนที่ใบนั้นยังไม่ถูกตรวจรับ — ตรวจรับแล้วถือว่าปิดเรื่อง
--
--   ใบส่งมอบเก่าที่บันทึกไว้ก่อนมีไฟล์นี้จะไม่มีบรรทัดจำนวน
--   หน้าเว็บจึงถอยไปใช้ยอดค้างของใบสั่งซื้อแทนเหมือนเดิม ของเก่าไม่พัง
--
-- รันซ้ำได้
-- ============================================================================

create table if not exists delivery_lines (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references deliveries(id) on delete cascade,
  po_line_id  uuid not null references po_lines(id),
  qty         numeric(18,3) not null check (qty > 0),
  unique (delivery_id, po_line_id)
);
create index if not exists delivery_lines_delivery_idx on delivery_lines (delivery_id);

alter table delivery_lines enable row level security;

-- ---- ใครเห็นได้ ------------------------------------------------------------
drop policy if exists read_visible on delivery_lines;
create policy read_visible on delivery_lines for select to authenticated
  using (exists (select 1 from deliveries d
                 where d.id = delivery_lines.delivery_id and can_see_po(d.po_id)));

-- ---- ใครบันทึกได้ ----------------------------------------------------------
drop policy if exists purchasing_write on delivery_lines;
create policy purchasing_write on delivery_lines for insert to authenticated
  with check (has_any_role('purchasing','admin')
              and exists (select 1 from deliveries d
                          where d.id = delivery_lines.delivery_id
                            and d.recorded_by = auth.uid()));

-- ---- ลบได้เฉพาะใบที่ยังไม่ตรวจรับ ------------------------------------------
drop policy if exists purchasing_undo on delivery_lines;
create policy purchasing_undo on delivery_lines for delete to authenticated
  using (has_any_role('purchasing','admin')
         and exists (select 1 from deliveries d
                     where d.id = delivery_lines.delivery_id
                       and d.recorded_by = auth.uid())
         and not exists (select 1 from grs g
                         where g.delivery_id = delivery_lines.delivery_id));

-- ---- ประวัติการใช้งาน ------------------------------------------------------
drop trigger if exists z_audit on delivery_lines;
create trigger z_audit after insert or update or delete on delivery_lines
  for each row execute function trg_audit();

-- ---- สิทธิ์ระดับตาราง ------------------------------------------------------
-- ตารางนี้เกิดหลัง db/06_seed.sql ซึ่ง grant ให้ "ทุกตารางที่มีอยู่ ณ ตอนนั้น" รอบเดียว
-- ไม่ grant ตรงนี้ = ผู้ใช้ที่ล็อกอินโดน "permission denied for table delivery_lines"
-- ทั้งที่นโยบาย RLS ข้างบนถูกแล้ว หน้าเว็บจะถอยไปโหมดไม่มีบรรทัดจำนวนเงียบๆ
grant select, insert, delete on delivery_lines to authenticated;
