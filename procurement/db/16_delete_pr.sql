-- ============================================================================
-- ลบใบขอซื้อที่ยังไม่ได้ออกใบสั่งซื้อ
--
-- ทำไมต้องมีไฟล์นี้
--   ของเดิมมี policy `requester_delete_draft` ให้เจ้าของลบได้เฉพาะใบที่ status = 'draft'
--   พอกดล็อกขอบเขตงานไปแล้ว ใบนั้นค้างอยู่ในรายการตลอดกาล ลบไม่ได้ ยกเลิกก็ยังโชว์
--   ใบทดสอบ/ใบที่ตั้งผิดเรื่องจึงกองสะสมปนกับของจริง จนหารายการที่ใช้งานอยู่ไม่เจอ
--
-- เส้นแบ่ง: "ออกใบสั่งซื้อหรือยัง" ไม่ใช่ "สถานะไหน"
--   ก่อนออก PO ทุกอย่างยังเป็นเรื่องภายใน ไม่มีภาระผูกพันกับผู้ขาย ลบทิ้งได้
--   พอออก PO แล้วมีสัญญา มีการกันงบใน budget_ledger มีของรอตรวจรับ — ลบไม่ได้เด็ดขาด
--   ต้องไปยกเลิกที่ใบสั่งซื้อแทน เพื่อให้ยอดกันงบถูกคืนตามทางของมัน
--   เช็คสองชั้น: ไม่มีแถวใน pos (ของจริง) + status ไม่ใช่ po_issued/closed (กันพลาด)
--
-- อะไรหายตามไปบ้าง
--   pr_lines · pr_sow · rfq_prints · quotes (+quote_lines +quote_sow)
--   budget_exceptions · budget_warnings · pr_awards · line_awards  → FK cascade อยู่แล้ว
--   approvals ผูกแบบ doc_type/doc_id ไม่มี FK จึงไม่หายเอง ต้องลบเองในฟังก์ชันนี้
--     ทั้งของใบขอซื้อ และของใบขอยกเว้นงบที่กำลังจะถูก cascade ไปพร้อมกัน
--   budget_ledger ไม่ต้องแตะ เพราะมีแต่ ref_doc = 'po'/'invoice' ใบขอซื้อไม่เคยลงบัญชีงบ
--
-- ประวัติไม่หาย
--   ทริกเกอร์ z_audit ยิงทุกแถวที่ถูกลบ (รวมแถวที่หายจาก cascade) และเก็บ before ไว้เต็มแถว
--   audit_log แก้ไม่ได้ลบไม่ได้ ของที่ลบไปจึงยังตามรอยได้ว่าใครลบเมื่อไหร่ เนื้อในคืออะไร
--
-- ข้อจำกัดที่รู้อยู่
--   ถ้าใบนั้นมีใบเสนอราคาที่แนบไฟล์ไว้ (quotes.attachment_path) แถวในฐานหายจริง
--   แต่ไฟล์ใน storage bucket `attachments` ยังค้างอยู่ ต้องให้แอดมินไปลบเอง
--   ไม่ลบให้จาก SQL เพราะลบแถว storage.objects ตรงๆ ไฟล์จริงจะค้างใน S3 อยู่ดี
--
-- รันซ้ำได้
-- ============================================================================

create or replace function fn_delete_pr(p_pr uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pr prs;
begin
  select * into v_pr from prs where id = p_pr;
  perform fn_require(v_pr.id is not null, 'ไม่พบใบขอซื้อ');
  perform fn_require(v_pr.requester_id = auth.uid() or has_role('admin'),
                     'ลบได้เฉพาะผู้ขอซื้อเจ้าของเรื่อง หรือผู้ดูแลระบบ');
  perform fn_require(not exists (select 1 from pos where pr_id = p_pr),
                     'ใบนี้ออกใบสั่งซื้อไปแล้ว ลบไม่ได้ — ต้องไปยกเลิกที่ใบสั่งซื้อแทน');
  perform fn_require(v_pr.status not in ('po_issued', 'closed'),
                     'ใบนี้ออกใบสั่งซื้อไปแล้ว ลบไม่ได้ — ต้องไปยกเลิกที่ใบสั่งซื้อแทน');

  -- approvals ไม่มี FK ไปที่เอกสารต้นเรื่อง ถ้าไม่ลบเองจะเหลือแถวลอยที่ชี้ไปยัง id ที่ไม่มีแล้ว
  delete from approvals a using budget_exceptions be
   where be.pr_id = p_pr and a.doc_type = 'budget_exception' and a.doc_id = be.id;
  delete from approvals where doc_type = 'pr' and doc_id = p_pr;

  delete from prs where id = p_pr;
end $$;

revoke all on function fn_delete_pr(uuid) from public, anon;
grant execute on function fn_delete_pr(uuid) to authenticated;

-- PostgREST จำรายชื่อฟังก์ชันไว้ใน cache ถ้าไม่บอกให้อ่านใหม่ หน้าเว็บจะยังขึ้นว่า
-- "Could not find the function ... in the schema cache" ทั้งที่ฟังก์ชันมีอยู่จริงแล้ว
notify pgrst, 'reload schema';
