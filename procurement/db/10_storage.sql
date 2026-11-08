-- ============================================================================
-- คลังไฟล์แนบ (Supabase Storage)
--
-- ใช้ bucket เดียวชื่อ attachments แล้วแยกด้วยโฟลเดอร์ชั้นแรก:
--   quotes/    ใบเสนอราคาที่ผู้ขายส่งมา
--   invoices/  ใบแจ้งหนี้
--   deliveries/ ใบส่งของ / ใบตรวจรับ
--   misc/      อื่นๆ
--
-- ทำไม bucket เดียว: สิทธิ์ของทุกโฟลเดอร์ตรงกันหมด (พนักงานที่ยัง active เห็นได้
-- เฉพาะฝ่ายจัดซื้อ/แอดมินอัปได้) ถ้าแยกหลาย bucket ต้องมาไล่แก้ policy หลายที่
-- ทุกครั้งที่เพิ่มเอกสารชนิดใหม่
--
-- ตั้งเป็น private เสมอ — ใบเสนอราคามีราคาของคู่แข่งอยู่ ถ้า public
-- ใครเดาที่อยู่ไฟล์ถูกก็เปิดดูได้โดยไม่ต้องล็อกอิน
-- ฝั่งเว็บจึงขอลิงก์ชั่วคราวผ่าน createSignedUrl ทุกครั้งที่จะเปิด (js/storage.js)
--
-- รันไฟล์นี้ใน SQL Editor ของ Supabase หลัง 03_rls.sql
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false,
  10485760,                                  -- 10 MB — ต้องตรงกับ MAX_BYTES ใน js/storage.js
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- รันซ้ำได้ ไม่พัง
drop policy if exists attachments_read   on storage.objects;
drop policy if exists attachments_insert on storage.objects;
drop policy if exists attachments_update on storage.objects;
drop policy if exists attachments_delete on storage.objects;

-- อ่าน: พนักงานที่ยัง active ทุกคน
-- ไม่ผูกสิทธิ์รายใบขอซื้อ เพราะที่อยู่ไฟล์ไม่ได้บอกว่าเป็นของ PR ไหน
-- ถ้าจะทำให้ละเอียดกว่านี้ ต้องมีตารางจับคู่ path -> pr_id ก่อน
create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_staff());

-- อัปโหลด: ฝ่ายจัดซื้อและแอดมินเท่านั้น
create policy attachments_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and public.has_any_role('purchasing', 'admin')
    and (storage.foldername(name))[1]
        in ('quotes', 'invoices', 'deliveries', 'misc')
  );

-- ทับไฟล์เดิม: เจ้าของไฟล์เท่านั้น (ฝั่งเว็บตั้ง upsert:false อยู่แล้ว เผื่อไว้เฉยๆ)
create policy attachments_update on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and public.has_any_role('purchasing', 'admin')
         and owner = auth.uid());

-- ลบไฟล์จริงในคลัง: แอดมินเท่านั้น
-- คนทั่วไปกด "เอาออก" ได้แค่ตัดที่อยู่ออกจากใบ ตัวไฟล์ยังอยู่
-- ตั้งใจให้เป็นแบบนี้ เพราะหลักฐานที่เคยแนบไว้ในใบที่อนุมัติไปแล้วต้องตามกลับได้
create policy attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.has_role('admin'));
