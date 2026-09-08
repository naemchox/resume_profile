-- ===== Prune old daily_scores — keep the free-tier DB small =====
-- daily_scores stores ONE row per user per day (PK: user_id, day) and was never pruned, so every
-- daily user adds ~500 bytes/day FOREVER. That silent growth is what shrinks the Supabase free-tier
-- ceiling from ~10-15k users toward ~2-3k over a year. The leaderboard, Friend League, and Progress
-- views only ever read the last ~30-90 days — anything older is dead weight. We keep 90 days.
--
-- Run this whole file once in the Supabase SQL editor. Safe to re-run (idempotent).

-- 1) One-time cleanup: drop everything already older than 90 days.
delete from public.daily_scores where day < (current_date - interval '90 days');

-- 2) The prune function the daily schedule calls going forward.
create or replace function public.prune_daily_scores()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.daily_scores where day < (current_date - interval '90 days');
$$;

-- 3) Schedule it daily via pg_cron (03:15 UTC).
--    Enable pg_cron ONCE first: Supabase dashboard → Database → Extensions → enable "pg_cron"
--    (or the create-extension below will do it if your role is allowed). Re-running is safe: the
--    DO block unschedules the old job first so there's never a duplicate.
--    Prefer not to use pg_cron? Skip step 3 and instead call public.prune_daily_scores() from a
--    scheduled Edge Function — same effect.
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('prune-daily-scores');
exception when others then
  null; -- job didn't exist yet
end $$;

select cron.schedule('prune-daily-scores', '15 3 * * *', $$ select public.prune_daily_scores(); $$);
