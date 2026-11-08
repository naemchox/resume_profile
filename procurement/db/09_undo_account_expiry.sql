-- ============================================================================
-- 09 — ยกเลิกฟีเจอร์ "วันหมดอายุของบัญชี"
--
-- ไฟล์นี้มีไว้สำหรับชุดที่เคยรัน 09_account_expiry.sql ไปแล้วเท่านั้น
-- ติดตั้งใหม่ตั้งแต่ต้น (01–08) ไม่ต้องรันไฟล์นี้ เพราะไม่เคยมีคอลัมน์นี้อยู่แล้ว
--
-- คืนด่านตรวจสิทธิ์ให้เหมือนเดิมเป๊ะตาม 03_rls.sql แล้วลบคอลัมน์กับ trigger ทิ้ง
-- รันซ้ำได้ ไม่พัง
-- ============================================================================

-- 1) ด่านตรวจสิทธิ์ — กลับไปเป็นต้นฉบับใน 03_rls.sql (ตัดเงื่อนไขวันหมดอายุออก)
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

-- 2) ลบ trigger ที่มากับฟีเจอร์นั้น
drop trigger if exists guard_access on user_profiles;
drop function if exists trg_guard_access();

-- 3) ลบคอลัมน์วันหมดอายุบัญชีทิ้ง
alter table user_profiles drop column if exists access_expires_at;

-- ----------------------------------------------------------------------------
-- ตรวจผล — ต้องขึ้น ✓ ทุกแถว
-- ----------------------------------------------------------------------------
select 'คอลัมน์ access_expires_at' as "สิ่งที่ตรวจ",
       case when exists (select 1 from pg_attribute
                          where attrelid='public.user_profiles'::regclass
                            and attname='access_expires_at' and not attisdropped)
            then 'ยังอยู่ ✗' else 'ลบแล้ว ✓' end as "ผล"
union all
select 'trigger guard_access',
       case when exists (select 1 from pg_trigger
                          where tgrelid='public.user_profiles'::regclass
                            and tgname='guard_access' and not tgisinternal)
            then 'ยังอยู่ ✗' else 'ลบแล้ว ✓' end
union all
select 'ด่าน ' || proname,
       case when prosrc like '%access_expires_at%' then 'ยังมีวันหมดอายุ ✗' else 'กลับเป็นเดิม ✓' end
  from pg_proc where proname in ('has_role','has_any_role','is_staff')
 order by 1;
