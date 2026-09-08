> ⚠️ **PAYMENTS SECTION STALE.** ไฟล์นี้บอกว่าใช้ PromptPay/Opn และ "Lemon Squeezy is dead" — **ตรงข้ามกับ reality (6/21): ใช้ Lemon Squeezy แล้ว, PromptPay ทิ้ง.** payment/launch ทั้งหมดดู **`GO_LIVE_RUNBOOK.md`**. ✅ ส่วนที่ยังใช้ได้ของไฟล์นี้ = **build/host how-to + pre-launch QA checklist** (อ้างถึงใน runbook)

# Ijek — Hosting / go-live runbook

Updated 2026-06-07. This covers **building + hosting the static PWA**. For the full launch list see `LAUNCH_TODO.md`; for **payments** see `PROMPTPAY.md`; for **backend SQL/auth** see `MULTIPLAYER.md`.

Architecture: static PWA (`train.html`) + **Supabase** backend (auth, DB, edge functions) + **PromptPay via Opn/Omise** for Pro. Core user data is local-first (localStorage); accounts/friends/scores/cloud-sync live on Supabase. **The old Lemon Squeezy / license-key plan is dead — ignore it.**

---

## 0) QA before deploy  ⏱️ ~30 min
Test in a real browser (`node _serve.js` → http://localhost:8000/train.html, hard-reload):
- [ ] **Billing**: Plan screen shows 2 cards, monthly/yearly toggle, copy reads correctly (no "prototype/no charge"). With `?dev` you can mock-unlock; **without `?dev` the "Just unlock" button must NOT appear.**
- [ ] **PromptPay** (after `PROMPTPAY.md` is done): upgrade → QR shows → ฿1 test pays → app flips to Pro.
- [ ] **Pro expiry**: with an expired/absent server entitlement, a signed-in account drops back to Free on reload.
- [ ] **Reminders** (Pro), **Achievements**, **ME-drag**, **Multiplayer** (sign-in → friend code → push score → leaderboard → 1v1).
- [ ] **Manifest/icons**: DevTools → Application → Manifest has no warnings; install prompt works.
- [ ] **Landing**: `landing.html` layout on mobile + desktop, price toggle, privacy/terms links.
- [ ] **Lighthouse → PWA**: installable passes.

---

## 1) Build the deployable bundle  ⏱️ ~1 min
```
node build-deploy.js
```
Produces a clean `dist/` containing ONLY what should be public:
`index.html` (= landing), `train.html` (the app), `sw.js`, `manifest.webmanifest`, the 3 PNG icons + `train-icon.svg`, `privacy.html`, `terms.html`, `landing.html`.
It will NOT include `.sql`, `supabase/`, `.md`, `_serve.js`, helper scripts, `cloudflared.exe`, or the backup — none of those belong on public hosting.

> **Bump `sw.js` `CACHE` (vNN→vNN+1) before each build** so returning users get fresh code. (Currently v410.)

---

## 2) Deploy `dist/` to a static host (HTTPS required for SW + PWA)  ⏱️ ~20 min
Pick one — all equivalent:
- **Cloudflare Pages (CLI):** `node build-deploy.js --deploy` (first time: `npx wrangler login`)
- **Cloudflare Pages (web):** dash → Workers & Pages → Create → Pages → Upload assets → drag `dist/`
- **Netlify:** `npx netlify deploy --prod --dir=dist`
- **Vercel:** `npx vercel deploy --prod dist`

`/` serves the landing; the app is at `/train.html`; the installed PWA opens the app. No `_redirects` needed (index.html is the landing).

---

## 3) Domain + SSL  ⏱️ ~20 min
- Buy a domain (e.g. ijek.app at Namecheap/Cloudflare).
- Connect it in your host's Domain settings (they issue SSL free).
- ✅ Check: open the domain → landing loads, "start" → app, Service Worker active (HTTPS only).
- Set the same domain in **Supabase Auth → URL Configuration** (Site URL + Redirect URLs).

---

## 4) Payments  → see `PROMPTPAY.md`
Opn account + KYC, `supabase secrets set`, deploy the 3 edge functions, register the webhook, ฿1 end-to-end test. Also run `supabase_billing.sql` and `supabase_daily_scores_rls.sql` (see `LAUNCH_TODO.md` §1) — **the RLS one is a security must-run.**

---

## 5) Legal  → fill placeholders
`privacy.html` + `terms.html` are production-accurate except the legal-entity name/address and refund-policy confirmation (`LAUNCH_TODO.md` §5). Add your real support email and entity before going public.

---

## 6) Optional (post-launch)
- **Analytics**: paste a PostHog key into `ANALYTICS_KEY` in `train.html` (empty = off).
- **Error monitoring**: Sentry.
- **Email**: domain inbox (Cloudflare Email Routing, free → hello@ijek.app).

---

### Critical path to "start selling"
**QA → run RLS+billing SQL → Supabase auth URLs → PromptPay (฿1 test) → build+host+domain → fill legal.**
≈ half a day. Then you're live.
