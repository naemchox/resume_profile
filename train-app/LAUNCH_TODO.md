> ⛔ **STALE — อย่าเชื่อบรรทัดล่างนี้.** ข้อมูล payment ในไฟล์นี้ตรงข้ามกับ reality ปัจจุบัน: **เลิกใช้ PromptPay/Opn แล้ว (6/21) → ใช้ Lemon Squeezy.** source of truth เดียว = **`GO_LIVE_RUNBOOK.md`**. ส่วน "Code fixes done" + RLS/auth ในไฟล์นี้ยังเป็นประวัติที่ถูกต้อง แต่ payment ทั้งหมดให้ดู runbook แทน

# Ijek — Launch checklist (single source of truth)

Updated 2026-06-07. Architecture is now **static PWA + Supabase backend + PromptPay (Opn/Omise) payments** — NOT the old "Lemon Squeezy / no backend" plan (that was abandoned; ignore any doc that mentions Lemon Squeezy / license keys).

Runbooks this file points to:
- **Payments** → `PROMPTPAY.md` (Opn account, secrets, deploy the 3 edge functions, webhook)
- **Hosting** → `DEPLOY.md` (build `dist/`, push to a static host, domain)
- **Multiplayer/auth** → `MULTIPLAYER.md`

---

## ✅ Code fixes already done (2026-06-07, SW v410)
These were the code-side launch blockers — all applied to `train.html` / `build-deploy.js` / legal pages:
1. **Free "Just unlock (no charge)" button is now gated** behind a dev flag (`DEV_UNLOCK` — only shows with `?dev` in the URL or `localStorage.tm_dev='1'`). Real users can no longer tap their way to free Pro.
2. **Billing "prototype / no real charge" copy replaced** with accurate PromptPay wording (`billing.proto`, `billing.introUnlock`, `billing.introTrial`, `billing.modalTrial`, EN + TH).
3. **Pro now expires.** The entitlement reconcile honors a confirmed server `'free'` (expired/never-paid) → drops local plan to Free; still never downgrades on an offline/error (`null`) read. Closes the "pass never ends / DevTools-faked Pro forever" leak.
4. **`build-deploy.js` fixed** to ship all icons + landing + legal pages; `dist/` index = landing, app = `/train.html`, installed PWA opens the app.
5. **Legal pages rewritten** to match reality (Supabase backend + Opn/PromptPay prepaid passes; Thailand jurisdiction; age 13). Only owner-specific placeholders remain (see §5 below).

---

## 🔴 What still needs YOUR hands (I can't do these)

### 1. Run the Supabase SQL  ⏱️ ~5 min  🔴 SECURITY — do first  ✅ DONE 2026-06-08
In Supabase → SQL Editor, run (if not already):
- [x] `supabase_daily_scores_rls.sql` — ran 2026-06-08, "Success".
- [x] `supabase_billing.sql` — `entitlements` + `payments` exist with RLS.
- [x] `supabase_schema.sql` / `supabase_user_state.sql` — already run.
- [x] Verified RLS = `true` on all 6: `daily_scores`, `profiles`, `friendships`, `user_state`, `entitlements`, `payments`.

### 3. Supabase Auth config — URL part ✅ DONE 2026-06-08
- [x] Site URL = `http://localhost:8000`; Redirect URLs = `localhost:8000` + `/**` (TEMP — must switch to real domain at STEP 4).
- [ ] **Confirm email** decision still open (see §A).

### 2. Stand up PromptPay payments  ⏱️ ~40 min  🟡 mostly done 2026-06-08 (TEST keys)  (follow `PROMPTPAY.md`)
- [x] Opn (Omise) account created; **TEST** key in use (`skey_test_…`); PromptPay enabled. (KYC for LIVE keys still pending.)
- [x] Auth via `SUPABASE_ACCESS_TOKEN` env (PAT) — `supabase login` can't do browser flow in non-TTY; no `link` needed, used `--project-ref` per command.
- [x] Secrets set: `OPN_SECRET_KEY`. **NOTE: `SERVICE_ROLE_KEY` is NOT needed** — the functions read `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL`, which Supabase auto-injects. (Runbook's manual SERVICE_ROLE_KEY step is obsolete.)
- [x] All 3 functions deployed (`--no-verify-jwt`); health-checked: charge fns → 401 "auth required", webhook → 200 "ignored". Docker not needed (CLI v2 bundles via API).
- [ ] **Register the webhook in Opn** → `https://lkwrzbuyyqgkibpeixmw.functions.supabase.co/opn-webhook`  ← user, in Omise dashboard
- [ ] **End-to-end test** (TEST mode = fake money, no need to drop to ฿1): sign into Supabase in-app (Friends tab magic-link) → upgrade Pro → Pay with PromptPay → QR auto-completes → app flips to Pro.
- [ ] Before real launch: finish Opn KYC, swap to **LIVE** keys (`skey_live_…`, set via own terminal — NOT chat), redo a real ฿1 test. Then revoke the dev PAT `sbp_…` + consider rolling the test Opn key (both were exposed in chat).

### 3. Supabase Auth config  ⏱️ ~3 min  🔴
- [ ] Authentication → URL Configuration: set Site URL + Redirect URLs to your **real domain** (and `http://localhost:8000` for local testing).
- [ ] Decide on "Confirm email" (see Open decisions §A).

### 4. Hosting + domain  ⏱️ ~20 min  🔴  (follow `DEPLOY.md`)
- [ ] `node build-deploy.js` → upload `dist/` to Netlify/Vercel/Cloudflare Pages (HTTPS required).
- [ ] Buy + connect a domain. Confirm `/` = landing, "start" → app, SW installs.

### 5. Legal — fill the 2 owner-only placeholders  ⏱️ ~10 min  ✅ DONE 2026-06-08 (SW v455)
In `privacy.html` + `terms.html` (+ `landing.html` footer):
- [x] **Legal entity / operator name** → "Ijek by Patipan (ประเทศไทย)" in privacy + terms.
- [x] **Contact email** → swapped `hello@ijek.app` → `monmon7735@gmail.com` everywhere (privacy, terms, landing footer). No more placeholder inbox.
- [x] **Refund policy** wording confirmed (kept the 7-day case-by-case wording; removed the self-note placeholder).
- [x] Jurisdiction = Thailand (already in terms §8).
- [ ] (Recommended, optional) have someone double-check PDPA compliance — real PII (email, scores) now on a server.
- [x] **Deployed live 2026-06-08** via `npx wrangler deploy` (wrangler.toml → assets ./dist, worker `withered-block-4669`). Live `/privacy` + `/terms` now show "Ijek by Patipan" + monmon7735@gmail.com. Future redeploys = one command: `npx wrangler deploy` (wrangler is now logged in).

---

## 🟢 Product decisions — RESOLVED + built 2026-06-11 (SW v619)
**A. Confirm email → ON.** User chose ON for production. **Code change applied:** `sbBridge()` no longer silently `signUp`s — it only links an EXISTING Supabase account via `signInWithPassword` (real signups go through the confirmed magic-link). Kills the unconfirmed/email-squatting leak. **🔴 YOUR STEP:** in Supabase → Authentication → Providers → Email, turn **Confirm email = ON.**

**B. 7-day free trial → REAL + enforced.** Turns out it was already built and server-enforced (the TODO note was stale): `start_trial()` SQL fn grants a `pro` entitlement with `expires_at = now()+7 days` + `trial_used=true`; client `ppStartTrial()` calls it; the entitlement reconcile honors expiry → trial actually ENDS. **🔴 YOUR STEP:** make sure the CURRENT `supabase_billing.sql` (the part with `trial_used` column + `start_trial()` function, §50+) has been run — if you only ran an earlier copy, re-run it (idempotent).

**C. Friend-request consent → BUILT (pending→accept).**
- **SQL (`supabase_schema.sql`):** added `friendships.status` (existing rows default `'accepted'` → current friends untouched). `add_friend` now creates a one-way **pending** request (auto-accepts if the target already requested you). New fns: `incoming_requests()`, `accept_friend(rid)`, `decline_friend(rid)`. `my_friend_ids()` returns **accepted-only** → a requester can't read your schedule/scores until you accept.
- **Client (`train.html`):** add-by-code shows "Request sent" vs "Friend added"; new **Friend requests** inbox (Accept/Decline) on the Friends tab; board/league/versus all read accepted-only.
- **🔴 YOUR STEP — run SQL BEFORE deploying this build:** the client now sends `.eq('status','accepted')`, so if the `status` column doesn't exist yet the leaderboard errors. Re-run `supabase_schema.sql` (idempotent) first, then deploy.

**D. Single login.** Resolved by A: with confirm-email ON the silent forward bridge is intentionally limited to linking existing accounts (no silent signup). Multiplayer signup = the Friends magic-link. No further action.

---

## Recommended order
**1 (RLS SQL) → run updated `supabase_schema.sql` + `supabase_billing.sql` (for B/C) → set Confirm email ON (A) → 3 (Auth config) → 2 (PromptPay webhook + ฿1 test) → 4 (hosting + domain) → 5 (legal).**
Do these = **you can take real money.** 🚀

### Still YOUR hands only (unchanged from above):
- Register the Opn webhook (§2) · end-to-end TEST payment (§2) · Auth URL → real domain (§3) · build + host + domain (§4) · finish Opn KYC → LIVE keys + revoke exposed dev keys (§2).
