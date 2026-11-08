-- ============================================================================
-- รับของ / ตรวจรับ — ให้แอดมินกับฝ่ายจัดซื้อกรอกจำนวนรับเองได้จบในคนเดียว
--
-- ทำไมต้องมีไฟล์นี้
--   ของเดิมการกรอก "รับ / ตีกลับ" เป็นงานของผู้ตรวจรับเท่านั้น (03_rls.sql)
--   และ trg_gr_segregation ยังบังคับอีกชั้นว่าคนบันทึกส่งมอบห้ามเป็นคนตรวจรับ
--   สองข้อนี้รวมกันแปลว่า ต้องมีคนสองคนสลับกันกดทุกครั้ง ถึงจะบันทึกรับของได้
--   หน้างานจริงของบริษัทนี้ ฝ่ายจัดซื้อเป็นคนรับของและคีย์จำนวนเอง
--   คนเดียวเลยเดินไปต่อไม่ได้เลย — ใบสั่งซื้อค้างที่ 0 ทั้งที่ของมาถึงแล้ว
--
-- กติกาใหม่
--   ใครกรอกจำนวนรับได้ = แอดมิน / ฝ่ายจัดซื้อ / ผู้ตรวจรับ (เดิมมีแค่สองอย่างหลัง)
--   ข้อห้าม "คนบันทึกส่งมอบ ≠ คนตรวจรับ" ยังอยู่ครบสำหรับผู้ตรวจรับ
--   แต่ยกเว้นให้แอดมินกับฝ่ายจัดซื้อ ทำสองขั้นเองได้
--
--   ผลข้างเคียงที่ต้องรู้ตัว: การแยกหน้าที่ตรงจุดนี้หายไปสำหรับสองตำแหน่งนั้น
--   คนคีย์รับของกับคนยืนยันกลายเป็นคนเดียวกันได้ ตัวคานที่เหลือคือ audit_log
--   และการที่จำนวนรับเกินจำนวนที่สั่งไม่ได้ (ตรวจในแอปและใน v_po_line_received)
--
--   ยังต้องมีใบส่งมอบก่อนเสมอ — grs ผูกกับ deliveries ไม่ได้ตัดขั้นนั้นทิ้ง
--
-- รันซ้ำได้
-- ============================================================================

-- ---- 1) ให้ฝ่ายจัดซื้อ insert ใบตรวจรับได้ -------------------------------
drop policy if exists inspector_insert on grs;
create policy inspector_insert on grs for insert to authenticated
  with check (has_any_role('inspector','purchasing','admin') and inspected_by = auth.uid());

-- gr_lines ใช้เงื่อนไข "เป็นเจ้าของใบตรวจรับใบนั้น" อยู่แล้ว จึงตามมาเองไม่ต้องแก้

-- ---- 2) ยกเว้นข้อห้ามแยกหน้าที่ให้แอดมิน/ฝ่ายจัดซื้อ ----------------------
create or replace function trg_gr_segregation()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_recorder uuid; v_po uuid; v_bypass boolean;
begin
  select d.recorded_by, d.po_id into v_recorder, v_po
  from deliveries d where d.id = new.delivery_id;

  if v_recorder is null then
    raise exception 'ไม่พบใบส่งมอบที่อ้างถึง' using errcode = 'P0001';
  end if;

  -- เช็คจาก new.inspected_by ตรงๆ ไม่ใช่ auth.uid() เผื่อถูกเรียกจาก RPC ฝั่งเซิร์ฟเวอร์
  select exists (
    select 1 from user_roles ur
    join user_profiles u on u.id = ur.user_id
    where ur.user_id = new.inspected_by
      and ur.role in ('purchasing','admin')
      and u.active
  ) into v_bypass;

  if v_recorder = new.inspected_by and not v_bypass then
    raise exception 'คนบันทึกส่งมอบกับคนตรวจรับ ต้องเป็นคนละคน'
      using errcode = 'P0001';
  end if;

  if not exists (select 1 from pos p where p.id = v_po
                 and p.status in ('issued','partially_received','received','invoiced')) then
    raise exception 'PO นี้ไม่อยู่ในสถานะที่ตรวจรับได้' using errcode = 'P0001';
  end if;

  return new;
end $$;
