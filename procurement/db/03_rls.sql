-- ============================================================================
-- RLS — คุมฝั่ง "อ่าน" ว่าใครเห็นอะไรได้
-- ฝั่ง "เขียน" ที่เป็นการเปลี่ยนสถานะ คุมด้วย RPC ใน 04_functions.sql
--
-- หลักการ:
--   * ทุกตารางเปิด RLS ไม่มีข้อยกเว้น
--   * ไม่ grant อะไรให้ anon เลย
--   * ตารางธุรกรรมที่ยอมให้เขียนตรงได้ มีแค่การ "คีย์ข้อมูล" (draft PR,
--     ใบเสนอราคา, ส่งมอบ, ตรวจรับ, ใบแจ้งหนี้) และบังคับให้คอลัมน์
--     entered_by / recorded_by / inspected_by = auth.uid() เสมอผ่าน WITH CHECK
--   * audit_log ไม่มี policy สำหรับ UPDATE/DELETE เลย = ลบ/แก้ไม่ได้ทุก role
-- ============================================================================

-- ----------------------------------------------------------------------------
-- HELPER — ต้องเป็น SECURITY DEFINER ไม่งั้น policy จะเรียกตัวเองวนไม่รู้จบ
-- ----------------------------------------------------------------------------

create or replace function has_role(r app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join user_profiles u on u.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = r and u.active
  );
$$;

create or replace function has_any_role(variadic rs app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_roles ur
    join user_profiles u on u.id = ur.user_id
    where ur.user_id = auth.uid() and ur.role = any(rs) and u.active
  );
$$;

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from user_profiles u where u.id = auth.uid() and u.active
  );
$$;

create or replace function my_roles()
returns app_role[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(ur.role), '{}'::app_role[])
  from user_roles ur where ur.user_id = auth.uid();
$$;

-- ผู้อนุมัติเห็นเรื่องได้เมื่อ "ถึงคิวของตัวเอง" หรือ "เคยตัดสินไปแล้ว" เท่านั้น
create or replace function approval_step_reached(p_doc approval_doc, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from approvals a
    where a.doc_type = p_doc and a.doc_id = p_id
      and a.role = any (my_roles())
      and (
        a.decision <> 'pending'
        or not exists (
          select 1 from approvals prev
          where prev.doc_type = p_doc and prev.doc_id = p_id
            and prev.step_no < a.step_no and prev.decision <> 'approved'
        )
      )
  );
$$;

create or replace function can_see_pr(p_pr uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from prs p
    where p.id = p_pr and (
         p.requester_id = auth.uid()
      or has_any_role('admin','purchasing','accounting')
      or approval_step_reached('pr', p.id)
      or (has_role('inspector') and p.status in ('approved','po_issued','closed'))
    )
  );
$$;

create or replace function can_see_po(p_po uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from pos po
    where po.id = p_po and (
         has_any_role('admin','purchasing','accounting','inspector')
      or can_see_pr(po.pr_id)
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- เปิด RLS ทุกตาราง + ถอนสิทธิ์ anon
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ============================================================================
-- MASTER — พนักงานที่ active อ่านได้หมด, แก้ได้เฉพาะ admin
-- ============================================================================

create policy read_all on company_profile for select to authenticated using (is_staff());
create policy admin_write on company_profile for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy read_all on user_profiles for select to authenticated using (is_staff());
create policy self_update on user_profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and active = true);
create policy admin_write on user_profiles for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

-- user_roles: อ่านได้ แต่ "เขียน" ทำผ่าน RPC เท่านั้น (fn_grant_role / fn_revoke_role)
-- ไม่มี policy insert/update/delete = ตั้งตำแหน่งให้ตัวเองไม่ได้เด็ดขาด
create policy read_all on user_roles for select to authenticated using (is_staff());

create policy read_all on approval_limits for select to authenticated using (is_staff());
create policy admin_write on approval_limits for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy read_all on cost_centers for select to authenticated using (is_staff());
create policy admin_write on cost_centers for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy read_all on projects for select to authenticated using (is_staff());
create policy admin_write on projects for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy read_all on budgets for select to authenticated using (is_staff());
create policy budget_write on budgets for all to authenticated
  using (has_any_role('admin','accounting')) with check (has_any_role('admin','accounting'));

-- budget_ledger: อ่านได้ เขียนผ่าน RPC เท่านั้น (append-only โดยพฤตินัย)
create policy read_all on budget_ledger for select to authenticated using (is_staff());

create policy read_all on vendors for select to authenticated using (is_staff());
create policy purchasing_write on vendors for all to authenticated
  using (has_any_role('admin','purchasing')) with check (has_any_role('admin','purchasing'));

create policy read_all on vendor_ratings for select to authenticated using (is_staff());
-- vendor_ratings เขียนโดยระบบตอนตรวจรับ/จ่ายเงิน (RPC) เท่านั้น

create policy read_all on sow_clauses for select to authenticated using (is_staff());
create policy admin_write on sow_clauses for all to authenticated
  using (has_role('admin')) with check (has_role('admin'));

create policy read_all on wht_rates for select to authenticated using (is_staff());
create policy admin_write on wht_rates for all to authenticated
  using (has_any_role('admin','accounting')) with check (has_any_role('admin','accounting'));

-- doc_sequences: ไม่มี policy เลย — แตะได้เฉพาะผ่าน RPC (security definer)

-- ============================================================================
-- ขั้น 1 — PR : เจ้าของแก้ได้เฉพาะตอนยัง draft
-- ============================================================================

-- เขียนเงื่อนไขลงตรงนี้แทนการเรียก can_see_pr(id)
-- เพราะ can_see_pr เป็นฟังก์ชัน STABLE ที่ย้อนกลับไป query ตาราง prs เอง
-- ตอน INSERT ... RETURNING มันจึงมองไม่เห็นแถวที่เพิ่งแทรกในคำสั่งเดียวกัน แล้วตีกลับทั้งคำสั่ง
-- (ตารางอื่นเรียก can_see_pr(pr_id) ได้ตามปกติ เพราะใบขอซื้อแม่มีอยู่ก่อนแล้ว)
create policy read_visible on prs for select to authenticated using (
       requester_id = auth.uid()
    or has_any_role('admin','purchasing','accounting')
    or approval_step_reached('pr', id)
    or (has_role('inspector') and status in ('approved','po_issued','closed'))
);

create policy requester_insert on prs for insert to authenticated
  with check (
    has_role('requester') and requester_id = auth.uid() and status = 'draft'
  );

create policy requester_update_draft on prs for update to authenticated
  using (requester_id = auth.uid() and status in ('draft','rejected'))
  with check (requester_id = auth.uid() and status in ('draft','rejected'));

create policy requester_delete_draft on prs for delete to authenticated
  using (requester_id = auth.uid() and status = 'draft');

create policy read_visible on pr_lines for select to authenticated using (can_see_pr(pr_id));
create policy owner_write on pr_lines for all to authenticated
  using (exists (select 1 from prs p where p.id = pr_id
                 and p.requester_id = auth.uid() and p.status in ('draft','rejected')))
  with check (exists (select 1 from prs p where p.id = pr_id
                 and p.requester_id = auth.uid() and p.status in ('draft','rejected')));

create policy read_visible on pr_sow for select to authenticated using (can_see_pr(pr_id));
create policy owner_write on pr_sow for all to authenticated
  using (exists (select 1 from prs p where p.id = pr_id
                 and p.requester_id = auth.uid() and p.status in ('draft','rejected')))
  with check (exists (select 1 from prs p where p.id = pr_id
                 and p.requester_id = auth.uid() and p.status in ('draft','rejected')));

create policy read_visible on rfq_prints for select to authenticated using (can_see_pr(pr_id));
-- rfq_prints เขียนผ่าน RPC fn_issue_rfq เท่านั้น

-- ============================================================================
-- ขั้น 3 — ใบเสนอราคา : ฝ่ายจัดซื้อคีย์ได้ และถูกบังคับให้ entered_by = ตัวเอง
-- ============================================================================

create policy read_visible on quotes for select to authenticated using (can_see_pr(pr_id));

create policy purchasing_insert on quotes for insert to authenticated
  with check (
    has_any_role('purchasing','admin')
    and entered_by = auth.uid()                                  -- จดคนคีย์เสมอ
    and exists (select 1 from prs p where p.id = pr_id
                and p.status in ('rfq_issued','quoting'))
  );

create policy purchasing_update on quotes for update to authenticated
  using (
    has_any_role('purchasing','admin')
    and exists (select 1 from prs p where p.id = pr_id
                and p.status in ('rfq_issued','quoting'))
  )
  with check (entered_by = auth.uid());

create policy purchasing_delete on quotes for delete to authenticated
  using (
    has_any_role('purchasing','admin')
    and exists (select 1 from prs p where p.id = pr_id
                and p.status in ('rfq_issued','quoting'))
  );

create policy read_visible on quote_lines for select to authenticated
  using (exists (select 1 from quotes q where q.id = quote_id and can_see_pr(q.pr_id)));
create policy purchasing_write on quote_lines for all to authenticated
  using (exists (select 1 from quotes q join prs p on p.id = q.pr_id
                 where q.id = quote_id and has_any_role('purchasing','admin')
                   and p.status in ('rfq_issued','quoting')))
  with check (exists (select 1 from quotes q join prs p on p.id = q.pr_id
                 where q.id = quote_id and has_any_role('purchasing','admin')
                   and p.status in ('rfq_issued','quoting')));

create policy read_visible on quote_sow for select to authenticated
  using (exists (select 1 from quotes q where q.id = quote_id and can_see_pr(q.pr_id)));
create policy purchasing_write on quote_sow for all to authenticated
  using (exists (select 1 from quotes q join prs p on p.id = q.pr_id
                 where q.id = quote_id and has_any_role('purchasing','admin')
                   and p.status in ('rfq_issued','quoting')))
  with check (exists (select 1 from quotes q join prs p on p.id = q.pr_id
                 where q.id = quote_id and has_any_role('purchasing','admin')
                   and p.status in ('rfq_issued','quoting')));

-- ============================================================================
-- ขั้น 4-5 — งบ / เลือกผู้ชนะ
-- ============================================================================

create policy read_visible on budget_exceptions for select to authenticated using (can_see_pr(pr_id));
create policy request_exception on budget_exceptions for insert to authenticated
  with check (has_any_role('purchasing','admin') and requested_by = auth.uid()
              and decision = 'pending');
-- การอนุมัติ exception ทำผ่าน RPC fn_decide_budget_exception (CEO เท่านั้น)

create policy read_visible on budget_warnings for select to authenticated using (can_see_pr(pr_id));
create policy ack_warning on budget_warnings for insert to authenticated
  with check (has_any_role('purchasing','admin') and ack_by = auth.uid());
create policy ack_warning_update on budget_warnings for update to authenticated
  using (has_any_role('purchasing','admin'))
  with check (ack_by = auth.uid());

create policy read_visible on pr_awards for select to authenticated using (can_see_pr(pr_id));
create policy read_visible on line_awards for select to authenticated using (can_see_pr(pr_id));
-- award เขียนผ่าน RPC fn_award_pr เท่านั้น

-- ============================================================================
-- ขั้น 6 — สายอนุมัติ
-- ============================================================================

create policy read_visible on approvals for select to authenticated
  using (
    has_any_role('admin','purchasing','accounting')
    or role = any (my_roles())
    or (doc_type = 'pr' and exists (select 1 from prs p
                                    where p.id = doc_id and p.requester_id = auth.uid()))
  );
-- การตัดสินทำผ่าน RPC fn_decide_approval เท่านั้น

-- ============================================================================
-- ขั้น 7 — PO
-- ============================================================================

create policy read_visible on pos for select to authenticated using (can_see_po(id));
create policy read_visible on po_lines for select to authenticated using (can_see_po(po_id));
create policy read_visible on po_sow_snapshot for select to authenticated using (can_see_po(po_id));
-- PO เขียนผ่าน RPC fn_issue_po เท่านั้น

-- ============================================================================
-- ขั้น 8 — ส่งมอบ / ตรวจรับ  (คนบันทึก ≠ คนตรวจรับ บังคับใน 05_triggers.sql)
-- ============================================================================

create policy read_visible on deliveries for select to authenticated using (can_see_po(po_id));
create policy purchasing_write on deliveries for insert to authenticated
  with check (has_any_role('purchasing','admin') and recorded_by = auth.uid());
create policy purchasing_update on deliveries for update to authenticated
  using (has_any_role('purchasing','admin') and recorded_by = auth.uid()
         and not exists (select 1 from grs g where g.delivery_id = id))
  with check (recorded_by = auth.uid());

create policy read_visible on grs for select to authenticated
  using (exists (select 1 from deliveries d where d.id = delivery_id and can_see_po(d.po_id)));
create policy inspector_insert on grs for insert to authenticated
  with check (has_any_role('inspector','admin') and inspected_by = auth.uid());

create policy read_visible on gr_lines for select to authenticated
  using (exists (select 1 from grs g join deliveries d on d.id = g.delivery_id
                 where g.id = gr_id and can_see_po(d.po_id)));
create policy inspector_write on gr_lines for all to authenticated
  using (exists (select 1 from grs g where g.id = gr_id and g.inspected_by = auth.uid()))
  with check (exists (select 1 from grs g where g.id = gr_id and g.inspected_by = auth.uid()));

-- ============================================================================
-- ขั้น 9 — ใบแจ้งหนี้  (คนคีย์ ≠ คนอนุมัติจ่าย บังคับใน RPC + trigger)
-- ============================================================================

create policy read_visible on invoices for select to authenticated using (can_see_po(po_id));
create policy keyer_insert on invoices for insert to authenticated
  with check (has_any_role('purchasing','accounting','admin') and entered_by = auth.uid());
create policy keyer_update on invoices for update to authenticated
  using (entered_by = auth.uid() and status in ('entered','mismatched'))
  with check (entered_by = auth.uid());

create policy read_visible on invoice_lines for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and can_see_po(i.po_id)));
create policy keyer_write on invoice_lines for all to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id
                 and i.entered_by = auth.uid() and i.status in ('entered','mismatched')))
  with check (exists (select 1 from invoices i where i.id = invoice_id
                 and i.entered_by = auth.uid() and i.status in ('entered','mismatched')));

create policy read_visible on match_results for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and can_see_po(i.po_id)));
-- match เขียนผ่าน RPC fn_match_invoice เท่านั้น

-- ============================================================================
-- ขั้น 10-12 — ใบสำคัญจ่าย / จ่ายเงิน / คืนเงินประกัน  (RPC ล้วน)
-- ============================================================================

create policy read_visible on payment_vouchers for select to authenticated
  using (has_any_role('admin','accounting','purchasing','ceo','pd')
         or exists (select 1 from invoices i where i.id = invoice_id and can_see_po(i.po_id)));

create policy read_visible on payments for select to authenticated
  using (has_any_role('admin','accounting','purchasing','ceo','pd'));

create policy read_visible on retention_releases for select to authenticated
  using (can_see_po(po_id));

-- ============================================================================
-- AUDIT LOG — อ่านได้ (โปร่งใส) แต่ไม่มี policy insert/update/delete
-- แปลว่าไม่มีใครแก้หรือลบได้เลย รวมถึง admin
-- ============================================================================

create policy read_all on audit_log for select to authenticated
  using (has_any_role('admin','ceo','accounting') or actor_id = auth.uid());

revoke insert, update, delete on audit_log from authenticated;
revoke update, delete on budget_ledger from authenticated;
