-- ============================================================================
-- ซ่อมสถานะใบสั่งซื้อหลังตรวจรับ — ให้ขึ้น "รับของแล้ว" ได้จริง
--
-- อาการ
--   รับของครบทุกบรรทัดแล้ว แต่สถานะใบสั่งซื้อค้างที่ "รับของบางส่วน" ตลอดไป
--   ไม่มีทางขยับเป็น "รับของแล้ว" ได้เลย ต่อให้รับครบ 100%
--
-- ต้นเหตุ
--   trg_gr_after ผูกไว้กับตาราง grs อย่างเดียว (05_triggers.sql)
--   แต่ใบตรวจรับหนึ่งใบต้องเขียนสองจังหวะเสมอ — grs ก่อน แล้วค่อย gr_lines
--   เพราะ gr_lines ต้องอ้าง gr_id ที่เพิ่งเกิด ตอนทริกเกอร์ทำงานจึงยังไม่มี
--   บรรทัดจำนวนสักบรรทัด v_po_line_received อ่านได้ 0 ทุกบรรทัด
--   มันเลยสรุปว่า "ยังไม่ครบ" ทุกครั้ง แล้วไม่มีใครมาคำนวณซ้ำหลัง gr_lines ลง
--
--   ผลพลอยได้อีกข้อ fn_rate_vendor ก็ถูกเรียกตอนยังไม่มีจำนวน คะแนนผู้ขายจึงเพี้ยน
--
-- วิธีแก้
--   ย้ายตรรกะไปไว้ใน fn_sync_po_receipt_status แล้วเรียกจากสองที่
--   ทั้งตอน grs ลง (ของเดิม) และตอน gr_lines ลง (ของใหม่ ซึ่งเป็นจังหวะที่ถูก)
--   ตอนท้ายมีรอบซ่อมใบเก่าที่สถานะค้างอยู่ให้ด้วย
--
--   ซ่อมเฉพาะใบที่มีใบตรวจรับแล้วเท่านั้น ใบที่ยังไม่มีใครส่งของมาไม่ถูกแตะ
--   เพราะ v_po_line_received เป็น left join จาก po_lines ใบที่ยังไม่รับอะไรเลย
--   จะอ่านได้ 0 ทุกบรรทัดเหมือนกัน ถ้าเหวี่ยงแหซ่อมทั้งหมดจะดัน issued
--   กลายเป็น partially_received ทั้งกระดาน
--
-- รันซ้ำได้
-- ============================================================================

-- ---- 1) ตรรกะกลาง ---------------------------------------------------------
create or replace function fn_sync_po_receipt_status(p_po uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_complete boolean;
begin
  if p_po is null then return; end if;

  select not exists (
    select 1 from v_po_line_received r
    join po_lines pl on pl.id = r.po_line_id
    where pl.po_id = p_po and r.qty_accepted < pl.qty
  ) into v_complete;

  update pos
  set status = (case when v_complete then 'received' else 'partially_received' end)::po_status
  where id = p_po and status in ('issued','partially_received');

  perform fn_rate_vendor(p_po);
end $$;

-- ---- 2) ของเดิมบน grs เรียกตรรกะกลางแทน ----------------------------------
create or replace function trg_gr_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_po uuid;
begin
  select d.po_id into v_po from deliveries d where d.id = new.delivery_id;
  perform fn_sync_po_receipt_status(v_po);
  return new;
end $$;

-- ---- 3) ตัวใหม่บน gr_lines — จังหวะที่จำนวนลงครบแล้วจริง -------------------
create or replace function trg_gr_lines_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_gr uuid; v_po uuid;
begin
  -- NEW ใช้ไม่ได้ใน DELETE ต้องแยกด้วย TG_OP
  if tg_op = 'DELETE' then v_gr := old.gr_id; else v_gr := new.gr_id; end if;

  select d.po_id into v_po
  from grs g join deliveries d on d.id = g.delivery_id
  where g.id = v_gr;

  perform fn_sync_po_receipt_status(v_po);
  return null;
end $$;

drop trigger if exists gr_lines_after on gr_lines;
create trigger gr_lines_after after insert or update or delete on gr_lines
  for each row execute function trg_gr_lines_after();

-- ---- 4) ซ่อมใบเก่าที่สถานะค้าง -------------------------------------------
do $$
declare r record;
begin
  for r in
    select distinct d.po_id as id
    from grs g
    join deliveries d on d.id = g.delivery_id
    join pos p on p.id = d.po_id
    where p.status in ('issued','partially_received')
  loop
    perform fn_sync_po_receipt_status(r.id);
  end loop;
end $$;
