-- ============================================================================
-- daily_scores Row Level Security — CLOSES THE PRIVACY HOLE
-- ----------------------------------------------------------------------------
-- The leaderboard / Friend League code reads other users' rows and even admits
-- in a comment that `.in(ids)` "is just a narrowing, not a trust boundary."
-- Without RLS, ANY signed-in user could read EVERY user's schedule/rest days.
-- These policies make the database itself the trust boundary:
--   * you can SELECT your own row OR a row whose owner is your friend
--   * you can only INSERT / UPDATE / DELETE your OWN row
-- Run ONCE in the Supabase SQL editor. Safe to re-run (drops first).
-- ============================================================================

alter table public.daily_scores enable row level security;

drop policy if exists "daily_scores read self or friends" on public.daily_scores;
drop policy if exists "daily_scores insert own"           on public.daily_scores;
drop policy if exists "daily_scores update own"           on public.daily_scores;
drop policy if exists "daily_scores delete own"           on public.daily_scores;
-- Also drop the duplicate SELECT policy from supabase_schema.sql (s_sel). Postgres OR's permissive
-- policies, so leaving two SELECT policies where one was accepted-only and the other any-status meant
-- the LOOSER one won — a not-yet-accepted (pending) requester could read your scores. We consolidate
-- to ONE accepted-only read policy here.
drop policy if exists s_sel on public.daily_scores;

-- READ: my own scores, plus the scores of people who are ACCEPTED friends (my_friend_ids() is
-- accepted-only). A pending outgoing request grants NO read until the other side accepts.
create policy "daily_scores read self or friends" on public.daily_scores
  for select using (
    user_id = auth.uid()
    or user_id in (select my_friend_ids())
  );

-- WRITE: only ever my own row.
create policy "daily_scores insert own" on public.daily_scores
  for insert with check (user_id = auth.uid());

create policy "daily_scores update own" on public.daily_scores
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "daily_scores delete own" on public.daily_scores
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- SANITY CHECK (optional): profiles must also be readable for friends, or names
-- /emojis on the leaderboard go blank. If your `profiles` table has no RLS yet,
-- uncomment and run this too:
-- ----------------------------------------------------------------------------
-- alter table public.profiles enable row level security;
-- drop policy if exists "profiles read self or friends" on public.profiles;
-- create policy "profiles read self or friends" on public.profiles
--   for select using (
--     id = auth.uid()
--     or id in (select friend_id from public.friendships where user_id = auth.uid())
--   );
-- drop policy if exists "profiles update own" on public.profiles;
-- create policy "profiles update own" on public.profiles
--   for update using (id = auth.uid()) with check (id = auth.uid());
