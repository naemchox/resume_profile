-- ============================================================================
-- 07 — คำเชิญเข้าใช้งาน (Invites)
-- รันไฟล์นี้ต่อจาก 06_seed.sql
--
-- ปัญหาที่แก้: ระบบนี้ล็อกอินด้วย Google เท่านั้น ผู้ใช้จึง "ยังไม่มีตัวตน"
-- ในฐานข้อมูลจนกว่าจะล็อกอินครั้งแรก แอดมินเลยตั้งตำแหน่งให้ล่วงหน้าไม่ได้
-- ตารางนี้คือที่พักตำแหน่งไว้ก่อน แล้วไปผูกให้ตอนคนนั้นล็อกอินครั้งแรก
--
-- คำเชิญมี 2 แบบ
--   1) เจาะจงอีเมล  — email ไม่ว่าง ใช้ได้เฉพาะคนที่ล็อกอินด้วยอีเมลนั้น
--   2) ลิงก์เชิญ    — email ว่าง ใครถือลิงก์ก็ใช้ได้ จำกัดด้วยจำนวนครั้ง + วันหมดอายุ
--
-- กติกาเดิมที่ยังอยู่: ไม่มีใครตั้งตำแหน่งให้ตัวเองได้
--   * สร้างคำเชิญให้อีเมลตัวเองไม่ได้
--   * ใช้คำเชิญที่ตัวเองสร้างไม่ได้
-- ============================================================================

create table if not exists user_invites (
  id           uuid primary key default gen_random_uuid(),
  token        text not null unique,
  email        text,                       -- null = ลิงก์เชิญแบบเปิด
  full_name_th text,
  roles        app_role[] not null default '{}',
  note         text,
  max_uses     smallint not null default 1 check (max_uses between 1 and 200),
  used_count   smallint not null default 0 check (used_count >= 0),
  expires_at   timestamptz,                -- null = ไม่มีวันหมดอายุ
  revoked_at   timestamptz,
  last_used_at timestamptz,
  created_by   uuid references user_profiles(id),
  created_at   timestamptz not null default now(),
  constraint email_lowercase check (email is null or email = lower(email))
);

-- ชุดที่ติดตั้งไปก่อนหน้ามี not null ค้างอยู่ ปลดให้ตอนรันไฟล์นี้ซ้ำ
alter table user_invites alter column expires_at drop not null;

create index if not exists user_invites_email_idx on user_invites (email);

alter table user_invites enable row level security;

-- เห็นได้เฉพาะผู้ดูแลระบบ — คนนอกเดาโทเคนจากตารางไม่ได้
drop policy if exists read_admin on user_invites;
create policy read_admin on user_invites for select to authenticated using (has_role('admin'));

grant select on user_invites to authenticated;
revoke insert, update, delete on user_invites from authenticated;  -- ผ่าน RPC เท่านั้น
revoke all on user_invites from anon;

-- คำเชิญเปลี่ยนสิทธิ์คนได้ ต้องมีร่องรอยเหมือนตารางอื่น
drop trigger if exists z_audit on user_invites;
create trigger z_audit after insert or update or delete on public.user_invites
  for each row execute function trg_audit();

-- ----------------------------------------------------------------------------
-- สร้างคำเชิญ — เฉพาะผู้ดูแลระบบ
-- p_email = null แปลว่าเป็นลิงก์เชิญแบบเปิด
-- ----------------------------------------------------------------------------
create or replace function fn_create_invite(
  p_email    text default null,
  p_name     text default null,
  p_roles    app_role[] default '{}',
  p_max_uses integer default 1,
  p_days     integer default 14,
  p_note     text default null)
returns user_invites language plpgsql security definer set search_path = public as $$
declare v_email text; v_mine text; v_row user_invites;
begin
  perform fn_require(has_role('admin'), 'เฉพาะผู้ดูแลระบบเท่านั้นที่เชิญผู้ใช้ได้');

  v_email := nullif(lower(btrim(coalesce(p_email, ''))), '');
  perform fn_require(v_email is null or v_email like '%_@_%._%', 'รูปแบบอีเมลไม่ถูกต้อง');

  select lower(u.email) into v_mine from auth.users u where u.id = auth.uid();
  perform fn_require(v_email is null or v_email <> v_mine,
                     'สร้างคำเชิญให้อีเมลของตัวเองไม่ได้');

  -- คนที่มีบัญชีอยู่แล้ว ตั้งตำแหน่งให้ตรงๆ ในหน้าผู้ใช้ ไม่ต้องเชิญซ้ำ
  perform fn_require(
    v_email is null or not exists (select 1 from user_profiles where lower(email) = v_email),
    'อีเมลนี้มีบัญชีในระบบแล้ว — ตั้งตำแหน่งให้ได้เลยจากตารางผู้ใช้');

  -- p_days = null คือ "ไม่มีวันหมดอายุ" (ใช้ได้จนกว่าแอดมินจะยกเลิกหรือใช้ครบจำนวน)
  perform fn_require(p_days is null or p_days between 1 and 365,
                     'อายุคำเชิญต้องอยู่ระหว่าง 1–365 วัน หรือเว้นไว้เพื่อไม่ให้หมดอายุ');
  perform fn_require(coalesce(p_max_uses, 0) between 1 and 200, 'จำนวนครั้งที่ใช้ได้ต้องอยู่ระหว่าง 1–200');
  -- คำเชิญเจาะจงอีเมลใช้ได้ครั้งเดียวเสมอ ไม่งั้นความหมายของ "เจาะจง" หายไป
  perform fn_require(v_email is null or p_max_uses = 1,
                     'คำเชิญที่เจาะจงอีเมลใช้ได้ครั้งเดียวเท่านั้น');

  -- คำเชิญเดิมของอีเมลเดียวกันที่ยังไม่ถูกใช้ ให้ยกเลิกทิ้ง เหลือใบล่าสุดใบเดียว
  if v_email is not null then
    update user_invites set revoked_at = now()
     where email = v_email and revoked_at is null and used_count = 0;
  end if;

  insert into user_invites (token, email, full_name_th, roles, note,
                            max_uses, expires_at, created_by)
  values (
    substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 32),
    v_email,
    nullif(btrim(coalesce(p_name, '')), ''),
    coalesce(p_roles, '{}'),
    nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_max_uses, 1),
    case when p_days is null then null else now() + make_interval(days => p_days) end,
    auth.uid())
  returning * into v_row;

  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- แก้คำเชิญที่ยังไม่ถูกใช้ — เปลี่ยนวันหมดอายุ / ตำแหน่ง / ชื่อ / จำนวนครั้ง
-- อีเมลกับโทเคนแก้ไม่ได้ ลิงก์ที่ส่งออกไปแล้วจะได้ยังใช้ได้เหมือนเดิม
-- p_expires_at = null แปลว่าไม่มีวันหมดอายุ
-- ----------------------------------------------------------------------------
create or replace function fn_update_invite(
  p_id         uuid,
  p_roles      app_role[] default '{}',
  p_name       text default null,
  p_expires_at timestamptz default null,
  p_max_uses   integer default 1,
  p_note       text default null)
returns user_invites language plpgsql security definer set search_path = public as $$
declare v_inv user_invites; v_row user_invites; v_uses integer;
begin
  perform fn_require(has_role('admin'), 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้คำเชิญได้');

  select * into v_inv from user_invites where id = p_id;
  perform fn_require(v_inv.id is not null, 'ไม่พบคำเชิญนี้');
  perform fn_require(v_inv.revoked_at is null, 'คำเชิญนี้ถูกยกเลิกไปแล้ว แก้ไม่ได้');
  perform fn_require(v_inv.used_count < v_inv.max_uses, 'คำเชิญนี้ถูกใช้ครบแล้ว แก้ไม่ได้');

  v_uses := coalesce(p_max_uses, 1);
  perform fn_require(p_expires_at is null or p_expires_at > now(),
                     'วันหมดอายุต้องเป็นวันข้างหน้า');
  perform fn_require(v_uses between 1 and 200, 'จำนวนครั้งที่ใช้ได้ต้องอยู่ระหว่าง 1–200');
  perform fn_require(v_uses >= v_inv.used_count, 'จำนวนครั้งต้องไม่น้อยกว่าที่ใช้ไปแล้ว');
  perform fn_require(v_inv.email is null or v_uses = 1,
                     'คำเชิญที่เจาะจงอีเมลใช้ได้ครั้งเดียวเท่านั้น');

  update user_invites
     set roles        = coalesce(p_roles, '{}'),
         full_name_th = nullif(btrim(coalesce(p_name, '')), ''),
         expires_at   = p_expires_at,
         max_uses     = v_uses,
         note         = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_id
  returning * into v_row;

  return v_row;
end $$;

-- ----------------------------------------------------------------------------
-- ยกเลิกคำเชิญ — ลิงก์ที่ส่งออกไปแล้วใช้ไม่ได้ทันที
-- ----------------------------------------------------------------------------
create or replace function fn_revoke_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform fn_require(has_role('admin'), 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกคำเชิญได้');
  update user_invites set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

-- ----------------------------------------------------------------------------
-- ใช้คำเชิญ — เรียกจากหน้าเข้าสู่ระบบหลังล็อกอิน Google สำเร็จ
--   p_token ไม่ว่าง = มาจากลิงก์เชิญ
--   p_token ว่าง    = ลองจับคู่จากอีเมลที่ล็อกอินเข้ามา
-- คืน null เมื่อไม่มีคำเชิญที่ใช้ได้ (ไม่ถือเป็นข้อผิดพลาด)
-- ----------------------------------------------------------------------------
create or replace function fn_claim_invite(p_token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_email text; v_inv user_invites; v_profile user_profiles; v_token text;
begin
  v_uid := auth.uid();
  perform fn_require(v_uid is not null, 'ต้องเข้าสู่ระบบก่อน');
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  v_token := nullif(btrim(coalesce(p_token, '')), '');

  if v_token is not null then
    select * into v_inv from user_invites where token = v_token;
    if v_inv.id is null then
      raise exception 'ลิงก์เชิญนี้ใช้ไม่ได้' using errcode = 'P0001';
    end if;
    perform fn_require(v_inv.email is null or v_inv.email = v_email,
                       'ลิงก์เชิญนี้ออกให้อีเมลอื่น — ออกจากระบบแล้วเข้าใหม่ด้วยอีเมลที่ได้รับเชิญ');
  else
    select * into v_inv from user_invites i
     where i.email = v_email and i.revoked_at is null
       and (i.expires_at is null or i.expires_at > now())
       and i.used_count < i.max_uses
     order by i.created_at desc limit 1;
    if v_inv.id is null then return null; end if;
  end if;

  perform fn_require(v_inv.revoked_at is null, 'คำเชิญนี้ถูกยกเลิกไปแล้ว');
  perform fn_require(v_inv.expires_at is null or v_inv.expires_at > now(),
                     'คำเชิญนี้หมดอายุแล้ว');
  perform fn_require(v_inv.used_count < v_inv.max_uses, 'คำเชิญนี้ถูกใช้ครบจำนวนแล้ว');
  perform fn_require(v_inv.created_by is null or v_inv.created_by <> v_uid,
                     'ใช้คำเชิญที่ตัวเองสร้างไม่ได้');

  -- ปกติ trigger on_auth_user_created สร้างโปรไฟล์ให้แล้ว บรรทัดนี้กันกรณีตกหล่น
  insert into user_profiles (id, full_name_th, email)
  values (v_uid, coalesce(v_inv.full_name_th, split_part(v_email, '@', 1)), v_email)
  on conflict (id) do nothing;

  select * into v_profile from user_profiles where id = v_uid;
  perform fn_require(v_profile.active, 'บัญชีนี้ถูกปิดการใช้งาน — ติดต่อผู้ดูแลระบบ');

  -- ชื่อจากคำเชิญใช้แทนได้เฉพาะตอนที่โปรไฟล์ยังเป็นชื่อชั่วคราว (ส่วนหน้า @)
  if v_inv.full_name_th is not null
     and v_profile.full_name_th in (split_part(v_email, '@', 1), v_email) then
    update user_profiles set full_name_th = v_inv.full_name_th where id = v_uid;
  end if;

  insert into user_roles (user_id, role, granted_by)
  select v_uid, r, v_inv.created_by from unnest(v_inv.roles) r
  on conflict do nothing;

  update user_invites
     set used_count = used_count + 1, last_used_at = now()
   where id = v_inv.id;

  return 'รับคำเชิญเรียบร้อย';
end $$;

-- ----------------------------------------------------------------------------
-- สิทธิ์เรียก RPC (ไฟล์ 04 รันไปก่อนหน้านี้แล้ว ฟังก์ชันใหม่ต้อง grant เอง)
-- ----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('fn_create_invite', 'fn_update_invite',
                        'fn_revoke_invite', 'fn_claim_invite')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
