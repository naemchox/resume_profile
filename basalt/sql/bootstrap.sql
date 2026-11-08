-- Basalt bootstrap schema.
-- Establishes the three roles, the auth schema, the realtime changelog,
-- and the storage metadata tables.
--
-- Runs once, as superuser, at server start. Idempotent.

--------------------------------------------------------------------------------
-- Roles
--------------------------------------------------------------------------------
-- anon           : unauthenticated callers. RLS applies.
-- authenticated  : callers holding a valid JWT. RLS applies.
-- service_role   : trusted server-side code. BYPASSRLS - never expose to clients.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;

--------------------------------------------------------------------------------
-- control plane: projects
--------------------------------------------------------------------------------
-- Each project is an isolated tenant: its own data schema, its own publishable
-- and service keys, its own users. A request is routed to a project by the key
-- it presents; nothing crosses the boundary.
create schema if not exists basalt;

create table if not exists basalt.projects (
  id              text primary key,
  name            text not null,
  schema_name     text not null unique,
  publishable_key text not null unique,
  service_key     text not null unique,
  created_at      timestamptz not null default now()
);

-- Stand up a project's data schema and let the API roles reach it. Table-level
-- grants and policies are the project owner's job (their setup SQL), exactly as
-- for the default project's `public` schema.
create or replace function basalt.provision(p_schema text) returns void
  language plpgsql as $$
begin
  execute format('create schema if not exists %I', p_schema);
  execute format('grant usage on schema %I to anon, authenticated, service_role', p_schema);
  -- service_role is the trusted admin role for this project — full access to
  -- every table created here, now and later (the Studio reads/writes as this role).
  execute format('alter default privileges in schema %I grant all on tables to service_role', p_schema);
  execute format('alter default privileges in schema %I grant all on sequences to service_role', p_schema);
end $$;

--------------------------------------------------------------------------------
-- auth schema
--------------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  password_hash      text,
  role               text not null default 'authenticated',
  -- app_metadata is server-controlled. Put roles/permissions here.
  app_metadata       jsonb not null default '{}'::jsonb,
  -- user_metadata is client-writable. NEVER trust it for authorization.
  user_metadata      jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  banned_until       timestamptz,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz
);

-- A user belongs to exactly one project. Same email in two projects = two
-- distinct users, so a token minted for one can never act in another.
-- Idempotent migration: existing single-project installs collapse into 'default'.
alter table auth.users add column if not exists project_id text not null default 'default';
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'users_email_key') then
    alter table auth.users drop constraint users_email_key;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'users_project_email_key') then
    alter table auth.users add constraint users_project_email_key unique (project_id, email);
  end if;
end $$;

-- Refresh tokens are grouped into families. Presenting an already-used token
-- means it was stolen, so the entire family is revoked. See auth.mjs.
create table if not exists auth.refresh_tokens (
  id         bigserial primary key,
  token      text unique not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  family_id  uuid not null,
  used       boolean not null default false,
  revoked    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists refresh_tokens_family_idx on auth.refresh_tokens(family_id);
create index if not exists refresh_tokens_user_idx   on auth.refresh_tokens(user_id);

-- Claim accessors. These read the GUC that the request layer sets inside the
-- transaction, so they are the bridge between the JWT and every RLS policy.
create or replace function auth.jwt() returns jsonb
  language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(auth.jwt() ->> 'sub', '')::uuid
  $$;

create or replace function auth.role() returns text
  language sql stable as $$
    select auth.jwt() ->> 'role'
  $$;

create or replace function auth.email() returns text
  language sql stable as $$
    select auth.jwt() ->> 'email'
  $$;

-- Clients must be able to CALL the accessors, but must never read auth.users.
grant usage on schema auth to anon, authenticated;
grant execute on function auth.jwt(), auth.uid(), auth.role(), auth.email()
  to anon, authenticated, service_role;
grant all on all tables in schema auth to service_role;

--------------------------------------------------------------------------------
-- realtime schema
--------------------------------------------------------------------------------
create schema if not exists realtime;

-- The durable, ordered change stream.
--
-- fundamental.md warns against building realtime on LISTEN/NOTIFY: the payload
-- cap is 8000 bytes and notifications do not survive a restart. It is right.
-- So the full change is written HERE (durable, ordered by a monotonic id,
-- resumable by watermark), and pg_notify carries only the id as a wakeup nudge.
-- If a notification is dropped, the reader still catches up from `id`.
create table if not exists realtime.changelog (
  id           bigserial primary key,
  committed_at timestamptz not null default now(),
  schema_name  text not null,
  table_name   text not null,
  op           text not null check (op in ('INSERT','UPDATE','DELETE')),
  record       jsonb,
  old_record   jsonb
);
create index if not exists changelog_table_idx on realtime.changelog(schema_name, table_name, id);

-- SECURITY DEFINER: the trigger fires as the writing user (`authenticated`),
-- who has no INSERT on realtime.changelog. Without this, every write fails.
create or replace function realtime.emit_change() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare
  new_id bigint;
begin
  insert into realtime.changelog (schema_name, table_name, op, record, old_record)
  values (
    tg_table_schema,
    tg_table_name,
    tg_op,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end
  )
  returning id into new_id;

  -- Wakeup only. The payload is deliberately just the id, so we can never hit
  -- the 8000-byte NOTIFY cap regardless of how wide the row is.
  perform pg_notify('basalt_changes', new_id::text);
  return null;
end $$;

-- Opt a table into the change stream.
create or replace function realtime.enable(tbl regclass) returns void
  language plpgsql as $$
begin
  execute format('drop trigger if exists basalt_emit_change on %s', tbl);
  execute format(
    'create trigger basalt_emit_change after insert or update or delete on %s
       for each row execute function realtime.emit_change()', tbl);
end $$;

create or replace function realtime.disable(tbl regclass) returns void
  language plpgsql as $$
begin
  execute format('drop trigger if exists basalt_emit_change on %s', tbl);
end $$;

-- A subscriber must read the changelog's high-water mark inside its own
-- snapshot transaction, but must never read the changelog itself — that table
-- holds every table's changes, unfiltered by any policy.
--
-- SECURITY DEFINER threads the needle: the function runs as the owner, so it can
-- see the table, while the caller only ever receives a single bigint.
create or replace function realtime.watermark() returns bigint
  language sql security definer set search_path = '' stable as $$
    select coalesce(max(id), 0) from realtime.changelog
  $$;

grant usage on schema realtime to anon, authenticated, service_role;
grant execute on function realtime.watermark() to anon, authenticated, service_role;
grant all on all tables in schema realtime to service_role;

--------------------------------------------------------------------------------
-- storage schema
--------------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets(id) on delete cascade,
  name       text not null,
  owner      uuid references auth.users(id) on delete set null,
  size       bigint not null default 0,
  mime_type  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

-- File permissions are RLS policies on the metadata table - the same mental
-- model as application data. This is the Supabase insight and it is a good one.
alter table storage.objects enable row level security;

-- Split 'avatars/alice/pic.png' -> {'alice','pic.png'} so policies can key on
-- the first path segment.
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
    select string_to_array(name, '/')
  $$;

grant usage on schema storage to anon, authenticated;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon;
grant execute on function storage.foldername(text) to anon, authenticated;
grant all on all tables in schema storage to service_role;

-- Anyone may read objects in a bucket flagged public.
drop policy if exists "public buckets are readable" on storage.objects;
create policy "public buckets are readable" on storage.objects
  for select to anon, authenticated
  using (exists (select 1 from storage.buckets b where b.id = bucket_id and b.public));

-- Owners have full control of their own objects.
drop policy if exists "owners manage their objects" on storage.objects;
create policy "owners manage their objects" on storage.objects
  for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

--------------------------------------------------------------------------------
-- service_role grants on the default project (public schema)
--------------------------------------------------------------------------------
-- service_role is the trusted admin role: full access to every table, existing
-- and future. Supabase grants its service_role the same. RLS is bypassed
-- (BYPASSRLS), but table-level GRANTs are still required — this supplies them.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
