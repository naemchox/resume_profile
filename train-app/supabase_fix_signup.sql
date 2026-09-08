-- ============================================================
--  FIX: "Database error saving new user" on signup
--  Root cause: handle_new_user() ran without an explicit search_path,
--  so it could not resolve public.profiles / public.gen_friend_code()
--  when fired by the auth system → the whole auth.users INSERT failed.
--  Run ONCE in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

-- 1) friend-code generator — pin schema + search_path
create or replace function public.gen_friend_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare c text;
begin
  loop
    c := 'IJEK-' || upper(substr(md5(gen_random_uuid()::text), 1, 5));
    exit when not exists (select 1 from public.profiles where friend_code = c);
  end loop;
  return c;
end $$;

-- 2) profile auto-creation — pin search_path + never block signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, friend_code)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Player'),
          public.gen_friend_code())
  on conflict (id) do nothing;
  return new;
exception when others then
  -- A profile hiccup must NOT kill the signup. Log + let the user in;
  -- the client can self-heal the profile row on next load.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end $$;

-- 3) re-bind the trigger
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
