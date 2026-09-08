-- ===== Web Push subscriptions for block reminders =====
-- One row per device endpoint. The scheduled `push-reminders` edge function (service role) reads
-- these to send a Web Push at each block's start; the client (subscribePush in train.html) inserts
-- its own row and deletes it when reminders are turned off. Run this once in the Supabase SQL editor.

create table if not exists push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  tz         text not null default 'Asia/Bangkok', -- IANA tz captured at subscribe time; the sender
                                                    -- uses it to know when each block's start is "now"
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

-- Users may read/write ONLY their own device subscriptions. The sender uses the service-role key,
-- which bypasses RLS, so it can read every subscription to deliver reminders.
drop policy if exists push_own_select on push_subscriptions;
drop policy if exists push_own_insert on push_subscriptions;
drop policy if exists push_own_update on push_subscriptions;
drop policy if exists push_own_delete on push_subscriptions;
create policy push_own_select on push_subscriptions for select using (auth.uid() = user_id);
create policy push_own_insert on push_subscriptions for insert with check (auth.uid() = user_id);
create policy push_own_update on push_subscriptions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy push_own_delete on push_subscriptions for delete using (auth.uid() = user_id);

-- ===== Schedule the sender (run AFTER deploying the push-reminders edge fn + setting its secrets) =====
-- 1) Dashboard → Database → Extensions: enable `pg_cron` and `pg_net`.
-- 2) Set a random CRON_KEY on the function: supabase secrets set CRON_KEY=<random-string>
-- 3) Run the block below with the SAME <CRON_KEY>. It fires the function every minute; the function
--    rejects any call whose x-cron-key header doesn't match, so the endpoint can't be triggered by randos.
--
-- select cron.schedule('push-reminders-every-min', '* * * * *', $$
--   select net.http_post(
--     url     := 'https://lkwrzbuyyqgkibpeixmw.functions.supabase.co/push-reminders',
--     headers := jsonb_build_object('Content-Type','application/json','x-cron-key','<CRON_KEY>'),
--     body    := '{}'::jsonb
--   );
-- $$);
-- Stop it later with:  select cron.unschedule('push-reminders-every-min');
