-- ============================================================
--  Ijek — Multiplayer schema (run once in Supabase → SQL Editor)
--  Project: https://lkwrzbuyyqgkibpeixmw.supabase.co
-- ============================================================
create extension if not exists pgcrypto;

-- ---- tables -------------------------------------------------
create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Player',
  avatar_emoji text default '🦊',
  friend_code  text unique not null,
  created_at   timestamptz default now()
);

create table if not exists friendships (
  user_id    uuid references profiles(id) on delete cascade,
  friend_id  uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
);
-- Consent step (2026-06-11): a friendship edge is either a 'pending' request or an
-- 'accepted' friendship. Existing rows (created before this column) default to 'accepted'
-- so current friends keep working untouched. Only NEW requests are gated.
alter table friendships add column if not exists status text not null default 'accepted';

create table if not exists daily_scores (
  user_id    uuid references profiles(id) on delete cascade,
  day        date not null,
  pct        int not null default 0,   -- % kept today (dayCredit.pct)
  streak     int not null default 0,   -- streakStats.current
  done_min   int not null default 0,
  plan_min   int not null default 0,
  blocks     jsonb not null default '[]'::jsonb,  -- today's plan [{s,e,n,em,d}] so a friend can render your day (FriendDay)
  updated_at timestamptz default now(),
  primary key (user_id, day)
);
-- If daily_scores was created by an EARLIER version of this file (no blocks column),
-- add it now — the client upserts `blocks`, so without this every score push fails.
alter table daily_scores add column if not exists blocks jsonb not null default '[]'::jsonb;

-- SECURITY (2026-06-11): scores are client-written, so clamp pct to a sane 0..100 — otherwise a
-- tampered client can upsert pct:999 and dominate the Today board / Friend League. (streak & done_min
-- stay client-trusted; a fuller fix computes standings server-side.) Clamp existing rows first so the
-- constraint adds cleanly.
update daily_scores set pct = 100 where pct > 100;
update daily_scores set pct = 0   where pct < 0;
alter table daily_scores drop constraint if exists daily_scores_pct_chk;
alter table daily_scores add  constraint daily_scores_pct_chk check (pct between 0 and 100);

-- Avatar cosmetics published so friends render your real look (added incrementally as the
-- aura / accessory features shipped). Idempotent so re-running this file is safe.
alter table profiles add column if not exists avatar_aura      text;
alter table profiles add column if not exists avatar_accessory text;
alter table profiles add column if not exists avatar_acc_pos   jsonb;  -- {x,y,scale} badge placement (2026-06-10)

-- ---- helpers ------------------------------------------------
-- unique-ish friend code like IJEK-3F7AB
create or replace function gen_friend_code() returns text language plpgsql as $$
declare c text;
begin
  loop
    c := 'IJEK-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    exit when not exists (select 1 from profiles where friend_code = c);
  end loop;
  return c;
end $$;

-- auto-create a profile row whenever an auth user signs up
create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, friend_code)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Player'),
          gen_friend_code());
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- my ACCEPTED friends' ids (security definer so RLS policies can call it). Pending requests
-- are excluded → a requester can't read your schedule/scores until you accept.
create or replace function my_friend_ids() returns setof uuid
  language sql security definer stable set search_path = public as
$$ select friend_id from friendships where user_id = auth.uid() and status = 'accepted' $$;

-- add a friend by code. Creates a ONE-WAY 'pending' request (requester -> target); the
-- target must accept_friend() before either side can see the other. If the target already
-- sent ME a pending request, this accepts it (mutual) immediately. Idempotent.
-- returns { ok, status: 'pending' | 'accepted', error? }
create or replace function add_friend(code text) returns json language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select id into fid from profiles where friend_code = upper(trim(code));
  if fid is null      then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if fid = auth.uid() then return json_build_object('ok', false, 'error', 'self'); end if;
  -- anti-spam: cap how many outgoing pending requests one account can have open at once, so a
  -- single user can't flood many victims' inboxes (or pad past the client friend cap with pendings).
  if (select count(*) from friendships where user_id = auth.uid() and status = 'pending') >= 50 then
    return json_build_object('ok', false, 'error', 'too_many_pending');
  end if;
  -- already accepted friends?
  if exists (select 1 from friendships where user_id = auth.uid() and friend_id = fid and status = 'accepted') then
    return json_build_object('ok', true, 'status', 'accepted');
  end if;
  -- they already requested me → accept mutually (both edges become accepted).
  if exists (select 1 from friendships where user_id = fid and friend_id = auth.uid() and status = 'pending') then
    update friendships set status = 'accepted' where user_id = fid and friend_id = auth.uid();
    insert into friendships(user_id, friend_id, status) values (auth.uid(), fid, 'accepted')
      on conflict (user_id, friend_id) do update set status = 'accepted';
    return json_build_object('ok', true, 'status', 'accepted');
  end if;
  -- otherwise create / keep a pending outgoing request (no reverse edge yet).
  insert into friendships(user_id, friend_id, status) values (auth.uid(), fid, 'pending')
    on conflict (user_id, friend_id) do nothing;
  return json_build_object('ok', true, 'status', 'pending');
end $$;

-- requests waiting for MY approval (incoming pending). security definer so I can read the
-- requester's profile even though they're not an accepted friend yet (RLS would hide it).
create or replace function incoming_requests()
  returns table (user_id uuid, display_name text, avatar_emoji text, friend_code text, created_at timestamptz)
  language sql security definer stable set search_path = public as
$$ select f.user_id, p.display_name, p.avatar_emoji, p.friend_code, f.created_at
     from friendships f join profiles p on p.id = f.user_id
    where f.friend_id = auth.uid() and f.status = 'pending'
    order by f.created_at desc $$;

-- accept a pending request FROM rid -> me. Verifies it exists, then makes both edges
-- accepted. returns { ok, error? }
create or replace function accept_friend(rid uuid) returns json language plpgsql security definer
  set search_path = public as $$
begin
  if not exists (select 1 from friendships where user_id = rid and friend_id = auth.uid() and status = 'pending') then
    return json_build_object('ok', false, 'error', 'no_request');
  end if;
  update friendships set status = 'accepted' where user_id = rid and friend_id = auth.uid();
  insert into friendships(user_id, friend_id, status) values (auth.uid(), rid, 'accepted')
    on conflict (user_id, friend_id) do update set status = 'accepted';
  return json_build_object('ok', true);
end $$;

-- decline (or cancel) a request between rid and me — deletes both edges in any status.
create or replace function decline_friend(rid uuid) returns void
  language sql security definer set search_path = public as
$$ delete from friendships
     where (user_id = rid and friend_id = auth.uid())
        or (user_id = auth.uid() and friend_id = rid) $$;

-- remove a friend — delete BOTH edges so read access is revoked in both directions.
-- (The client calls sb.rpc('remove_friend', { fid }); without this the button errors.)
create or replace function remove_friend(fid uuid) returns void
  language sql security definer set search_path = public as
$$ delete from friendships
     where (user_id = auth.uid() and friend_id = fid)
        or (user_id = fid and friend_id = auth.uid()) $$;

-- ---- row level security -------------------------------------
alter table profiles     enable row level security;
alter table friendships  enable row level security;
alter table daily_scores enable row level security;

drop policy if exists p_sel on profiles;
drop policy if exists p_ins on profiles;
drop policy if exists p_upd on profiles;
create policy p_sel on profiles for select using (id = auth.uid() or id in (select my_friend_ids()));
create policy p_ins on profiles for insert with check (id = auth.uid());
create policy p_upd on profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- SECURITY (2026-06-11): friendships is SELECT-only to the client. A `for all` policy let the
-- client directly `insert {status:'accepted'}` an edge to ANY user — bypassing the whole pending→
-- accept consent flow and reading the victim's profile/schedule/scores without consent (and making
-- remove_friend pointless: re-insert and keep reading). All WRITES now go exclusively through the
-- SECURITY DEFINER RPCs above (add_friend / accept_friend / decline_friend / remove_friend), which
-- bypass RLS. The client only ever reads its own edges.
drop policy if exists f_all on friendships;
drop policy if exists f_sel on friendships;
create policy f_sel on friendships for select using (user_id = auth.uid());

drop policy if exists s_sel on daily_scores;
drop policy if exists s_ups on daily_scores;
create policy s_sel on daily_scores for select using (user_id = auth.uid() or user_id in (select my_friend_ids()));
create policy s_ups on daily_scores for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- cloud sync (whole app state, one row per user) -------
-- The client stores its BACKUP_KEYS blob here and reconciles by `rev` (last-write-wins,
-- pull-before-push). Only the owner can read/write their row (RLS).
create table if not exists user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  rev        bigint not null default 1,
  updated_at timestamptz default now()
);
alter table user_state enable row level security;
drop policy if exists us_all on user_state;
create policy us_all on user_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- realtime for live leaderboard + cross-device sync (idempotent: re-running won't abort on "already member")
do $$ begin
  alter publication supabase_realtime add table daily_scores;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table user_state;
exception when duplicate_object then null; end $$;
-- ============================================================
-- done. next: Settings → API → copy the ANON PUBLIC key → send it.
-- ============================================================
