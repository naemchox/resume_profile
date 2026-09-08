-- ===== Train With Myself — redeem codes (manual PromptPay path) =====
-- For a seller with NO business registration: buyer pays your PERSONAL PromptPay,
-- you hand them a code from redeem_codes, they enter it in the app → Pro is granted
-- server-side (same entitlements table the Opn path writes). Run ONCE in SQL editor.
--
-- Security model: the table has RLS ON and NO client policies, so the browser can
-- never read codes or grant itself Pro. Only redeem_code() (SECURITY DEFINER) touches
-- it, and it takes the code + uses auth.uid(), marking the code used atomically.

create table if not exists public.redeem_codes (
  code       text primary key,
  period     text not null,                 -- 'mo' | 'yr'
  used_by    uuid references auth.users (id) on delete set null,
  used_at    timestamptz,
  note       text,                          -- optional: who you sold it to
  created_at timestamptz not null default now()
);
alter table public.redeem_codes enable row level security;
-- (no policies on purpose — only the SECURITY DEFINER function below may touch this)

-- Redeem one code for the signed-in user. Idempotent-ish: a used code returns 'used'.
-- Extends Pro from max(now, current expiry) so stacking codes adds time, never shortens.
create or replace function public.redeem_code(p_code text)
returns table(ok boolean, reason text, plan text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  rc      public.redeem_codes;
  uid     uuid := auth.uid();
  base    timestamptz;
  new_exp timestamptz;
begin
  if uid is null then
    return query select false, 'not_signed_in', null::text, null::timestamptz; return;
  end if;
  p_code := upper(btrim(p_code));
  -- lock the row so two taps can't both consume the same code
  select * into rc from public.redeem_codes where code = p_code for update;
  if rc.code is null then
    return query select false, 'invalid', null::text, null::timestamptz; return;
  end if;
  if rc.used_by is not null then
    return query select false, 'used', null::text, null::timestamptz; return;
  end if;
  -- new expiry = (later of now / existing pass) + the code's term
  select greatest(now(), coalesce(e.expires_at, now()))
    into base from public.entitlements e where e.user_id = uid;
  if base is null then base := now(); end if;
  new_exp := base + (case rc.period when 'yr' then interval '1 year' else interval '1 month' end);

  update public.redeem_codes set used_by = uid, used_at = now() where code = p_code;

  insert into public.entitlements (user_id, plan, period, expires_at, charge_id, updated_at)
    values (uid, 'pro', rc.period, new_exp, 'redeem:' || p_code, now())
  on conflict (user_id) do update
    set plan = 'pro', period = rc.period, expires_at = new_exp,
        charge_id = 'redeem:' || p_code, updated_at = now();

  return query select true, 'granted', 'pro'::text, new_exp;
end $$;

revoke all on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;

-- ============================================================================
-- MINT CODES TO SELL  — run this block whenever you need more codes.
-- Change 'mo' → 'yr' for yearly codes, and 10 → however many you want.
-- Copy the codes it prints; each is one-time use.
-- ============================================================================
-- insert into public.redeem_codes (code, period)
-- select 'IJEK-' || upper(substring(md5(random()::text) for 4))
--               || '-' || upper(substring(md5(random()::text) for 4)), 'mo'
-- from generate_series(1, 10)
-- on conflict (code) do nothing
-- returning code, period;
