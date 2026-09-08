-- Cloud sync: one row per account holds the whole-app state blob (BACKUP_KEYS).
-- Run this ONCE in the Supabase SQL editor before reloading the app.
-- Last-write-wins by `rev`; the client only adopts the cloud when cloud.rev > local rev.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- Each user can read/write ONLY their own row.
alter table public.user_state enable row level security;

drop policy if exists "user_state owner read"   on public.user_state;
drop policy if exists "user_state owner write"  on public.user_state;
drop policy if exists "user_state owner update" on public.user_state;
drop policy if exists "user_state owner delete" on public.user_state;

create policy "user_state owner read" on public.user_state
  for select using (auth.uid() = user_id);

create policy "user_state owner write" on public.user_state
  for insert with check (auth.uid() = user_id);

create policy "user_state owner update" on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- DELETE policy: without this, RLS silently denies the client's "Reset all data" delete and the
-- old row survives, so reconcile re-adopts the stale state on reload. (The client also clears the
-- row via push_user_state as a belt-and-braces fallback, but a real delete is cleaner.)
create policy "user_state owner delete" on public.user_state
  for delete using (auth.uid() = user_id);

-- Conditional push (optimistic concurrency) — prevents two devices clobbering each other.
-- The client sends its data + the rev it last saw (p_base_rev). The server writes ONLY if
-- the caller is up to date (no newer rev landed meanwhile) and bumps rev atomically. If a
-- newer rev exists, it REJECTS the write and hands back the authoritative row so the client
-- can adopt it instead of overwriting it. Returns applied=true when the write went through.
create or replace function public.push_user_state(p_data jsonb, p_base_rev bigint)
returns table(rev bigint, data jsonb, applied boolean)
language plpgsql security definer set search_path = public as $$
declare cur bigint;
begin
  select us.rev into cur from public.user_state us where us.user_id = auth.uid();
  -- Size ceiling (abuse guard). Cloud sync is free for everyone, so cap the blob server-side —
  -- the client cap is bypassable. A normal account's state is a few KB of text (photos live in
  -- device-local IndexedDB, not here); 2 MB is far above any real user but stops someone scripting
  -- giant pushes to bloat storage. Over → DON'T write, and report applied=true at the CURRENT rev
  -- so the client treats it as a harmless no-op: it never enters the applied=false "adopt" branch
  -- (which writes+reloads), so the device's local data is never touched/lost. The oversize edit
  -- simply doesn't persist to the cloud.
  if pg_column_size(p_data) > 2097152 then
    return query select coalesce(cur, 0::bigint), p_data, true;
    return;
  end if;
  if cur is null then
    insert into public.user_state(user_id, data, rev, updated_at)
      values (auth.uid(), p_data, 1, now());
    return query select 1::bigint, p_data, true;
  elsif p_base_rev >= cur then
    update public.user_state set data = p_data, rev = cur + 1, updated_at = now()
      where user_id = auth.uid();
    return query select cur + 1, p_data, true;
  else
    return query select us.rev, us.data, false from public.user_state us where us.user_id = auth.uid();
  end if;
end $$;
