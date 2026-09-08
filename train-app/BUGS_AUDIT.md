# Ijek — multi-agent bug audit (2026-06-11)

6 finders × adversarial 2-skeptic verify. 10 raised → **9 confirmed**, 1 rejected.
Severity: 1 critical · 3 high · 1 medium · 4 low. All confirmed = 2/2 verifiers unless noted.

---

## 🔴 CRITICAL

### B1. Pro+ purchase charges real money but grants NOTHING  ✅ RESOLVED 2026-06-12 by HIDING Pro+ this launch (SW v663; ⚠ promptpay-charge needs redeploy)
> Decision: ship **Free + Pro only** this launch. Pro+ kept in PLANS/i18n/AI-cap plumbing but (1) filtered out of PlanBillingScreen cards, (2) hard-rejected (`plan==='pro'` only) in promptpay-charge as server backstop. So no one can reach a proplus charge → the money-for-nothing path is closed without wiring proplus. The "rejected finding" (fetchEntitlement maps proplus→free) is now MOOT — nothing ever writes proplus. To revive Pro+ later: unhide card + re-allow proplus in promptpay-charge + wire grant in charge-status/opn-webhook + fetchEntitlement/reconcile. See memory: Pro+ repositioning plan (AI weekly-plan flagship + unlimited chat, ~฿179/mo).
- **Files:** `promptpay-charge/index.ts:48` + `PRICES:15-18`; `charge-status/index.ts:48`; `opn-webhook/index.ts:46`; `train.html:13247` (PlanBillingScreen `PLANS.map`).
- Pro+ card (฿199/mo · ฿1,690/yr) is purchasable end-to-end and creates a real Opn charge, but both grant paths hard-gate on `plan==='pro'`. A Pro+ buyer is billed and gets nothing (not even Pro); modal never reaches 'paid'.
- **Contradicts intent:** memory says Pro+ should be `.filter`ed out of PlanBillingScreen — the filter is MISSING at train.html:13247.
- **Fix (fast):** restore `PLANS.filter(p=>p.id!=='proplus')` in PlanBillingScreen **and** reject `proplus` in promptpay-charge. (Full fix: make charge-status + opn-webhook write `plan: m.plan` and accept proplus, update fetchEntitlement at 4826.)

## 🟠 HIGH

### B2. Percent-mode goals earn 0 credit in scoring/race/streak  ✅ FIXED 2026-06-11 (SW v656)
> Added `scoreTarget(act,dow)` (returns 100 for percent) right after actAmtTarget; switched blockEarnedMin / dayCredit / daySuccess to use it. weekByActivity left untouched (already percent-aware). Verify in browser before considering closed.
- **File:** `train.html` — `actAmtTarget` (8266-8274), used by `blockEarnedMin` (8308), `dayCredit` (8353), `daySuccess` (8374).
- `goalMode==='percent'` → actAmtTarget returns 0 → block scored as time-only → a 60% rating banks 0%. Affects race bar, daily % kept, dayTier, keptStreak/streakStats, weekSummary, friend's-day 'kept' (5517). Progress tab (weekByActivity 11351) DOES count it → surfaces contradict.
- **Fix:** add `scoreTarget(act,dow)` returning 100 for percent else actAmtTarget; use in 8308/8353/8374. (toggleDoneOn:10103 already does `goalMode==='percent' ? 100 : ...`.)

### B3. Entitlement grant not idempotent on charge_id → replay = Pro forever  ✅ FIXED 2026-06-11 (⚠ needs `supabase functions deploy charge-status opn-webhook`)
> Both grant paths now read the prior `payments` row for the charge_id (PK) and only extend the entitlement when there's no prior 'successful' row — so a charge credits exactly once. charge-status now reports the entitlement's current state on replay (no second extension). NOT Pro+-related (guards the existing Pro flow), so done despite the Pro+ defer. Residual: a webhook+poll firing 'successful' within the same instant could still double-credit once (benign, not the unlimited-replay exploit) — the malicious sequential-replay vector is fully closed.
- **Files:** `charge-status/index.ts:48-56`, `opn-webhook/index.ts:46-55`.
- charge-status is buyer-callable with their own charge id; each call adds 31/366 days, no charge_id-already-credited check. Pay once → call N times → free forever. (billing.sql idempotency only covers the payments audit log, not the entitlement extension.)
- **Fix:** before extending expires_at, check charge_id not already credited; add days only on first transition to 'successful'.

### B4. (= B1 from security angle) Pro+ money taken, no entitlement
- Duplicate root cause of B1, reported by the security finder. Same fix.

## 🟡 MEDIUM

### B5. "Reset all data" / sign-out never clears IndexedDB  ✅ FIXED (reset path) 2026-06-11 (SW v657)
> Added `_idbWipe()` (clears in-memory `_histCache`/`_imgBlobCache` then the `hist`+`img` IDB stores); reset() is now async and awaits it before reload. **Sign-out path intentionally NOT wiped** — the sign-out confirm promises "your data stays safe on this device." The cross-account leak on a SHARED device (account B sees A's saved photos after sign-out→sign-in) is a separate, bigger fix = per-account namespacing of the photo history; deferred. B6 (img GC) still open.
- **File:** `train.html` — reset() 13444-13458 (sweep 13452-13456); signOut 5132; loadAvatar 7098; hydrateImgStore 3335-3348.
- avatarPhotos, recentEmoji, content-addressed `img` bytes live in IDB `train-imgstore`; reset only sweeps `tm_*` localStorage (no `indexedDB.deleteDatabase`/`.clear()` anywhere). After RESET, photos reappear on reload; on a shared device account B sees account A's saved face photos (privacy).
- **Fix:** in reset() (and sign-out/account switch) clear IDB stores `hist`+`img` (await before reload); reset `_histCache`/`_imgBlobCache`.

## 🟢 LOW

### B6. `img` IDB store never garbage-collected → unbounded growth  ✅ FIXED 2026-06-11 (SW v661)
> Added `collectLiveImgIds()` (walks ALL tm_ localStorage values — superset, so no live blob is wrongly deleted) + `sweepImgStore()` (deletes img keys not in the live set, also drops them from `_imgBlobCache`). Called once on boot 6s after render (deferred past first paint + cloud reconcile).
- `idbImgPut` (3236-3243) only put/getAll; no delete on activity/photo removal. Orphan blobs (≤RAW_GIF_MAX each) accumulate forever; reset doesn't clear them either (see B5).
- **Fix:** periodic mark-and-sweep of live `idbimg:` tokens vs `img` keys (on boot after hydrate / after deletion).

### B7. AI quota: client local-midnight vs server UTC-midnight  ✅ FIXED 2026-06-11 (SW v662)
> Added `aiDayKey()` (UTC `toISOString().slice(0,10)`); `aiQuotaLeft`/`bumpAiUsage` now key the counter on UTC (dropped the local `day` param) to match server bump_ai_usage. Cache keys still use local `ctx.day` (correct — follows the user's wall clock). No SQL/redeploy needed.
- **File:** `train.html` dayKey (4943-4946) → aiQuotaLeft/bumpAiUsage (5047-5059); server `bump_ai_usage` uses UTC date.
- For UTC+7 (Thailand) the client thinks a new day started at 00:00 but server cap doesn't roll until 07:00 → 429 'cap', silent template fallback while UI shows full quota. Bounded, no cost blowout.
- **Fix:** make both sides agree on the day boundary (UTC date for the counter, or pass client local day to bump_ai_usage).

### B8. Weekly AI letter doesn't decrement client quota counter  ✅ FIXED 2026-06-11 (SW v662)
> `aiWeeklyLetter` now calls `bumpAiUsage()` after a successful fetch (after saveJSON K.aiRecap), matching aiCheckInLine/aiChatSend. No quota gate added on purpose — the once-a-week letter shouldn't be blocked by daily check-in usage; the server stays the hard ceiling.
- **File:** `train.html` aiWeeklyLetter (4751-4777) — checks `AI_DAILY_CAP[plan]>0` but never calls bumpAiUsage (unlike aiCheckInLine 4743 / aiChatSend 4798). Client counter off by one on week-rollover day.
- **Fix:** call bumpAiUsage(ctx.day) after successful weekly fetch (gate with aiQuotaLeft).

### B9. opn-webhook accepts unauthenticated POSTs, no signature check `1/2 verifiers`  ✅ HARDENED 2026-06-11 (opt-in; ⚠ needs redeploy)
> Added an OPT-IN shared-secret gate: if env `OPN_WEBHOOK_SECRET` is set, the webhook requires `?key=<it>` (add the same to the Opn dashboard webhook URL). OFF by default → can't break the current deploy. Did NOT add HMAC signature verification (Omise's classic flow relies on the secret-key re-fetch, which already blocks forged grants; a wrong-secret HMAC check would silently reject all real webhooks). To enable: set the env var + append the key to the webhook URL.
- **File:** `opn-webhook/index.ts:12-25` (`--no-verify-jwt`, no HMAC). Can't forge a grant (function re-fetches charge from Opn with secret key), but endpoint is open: arbitrary `chrg_` POSTs trigger outbound Opn calls (DoS/rate-limit) and, with B3, replaying a real charge id inflates entitlement.
- **Fix:** verify Opn webhook signature before any work.

---

## ⚪ REJECTED (1)
- **"client fetchEntitlement downgrades Pro+ to free"** — code read accurate (4831 maps proplus→free, reconcile 5486 would downgrade) BUT unreachable: no writer ever stores `proplus` (start_trial billing.sql:74 + both grant paths hardcode 'pro'). Latent gap, becomes real only if proplus fulfillment is wired (B1). jek-ai:82 reads plan server-side independently, so AI cap differentiation is unaffected.

---

## Suggested order
1. **B1** (hide Pro+ cards) — stops real-money loss, 1-line filter. Do first.
2. **B3** (idempotency) — stops revenue leak via replay.
3. **B2** (percent scoring) — core-loop correctness, contradicts Progress tab.
4. **B5** (reset clears IDB) — privacy/data-handling.
5. B6–B9 — cleanup before/after launch.
