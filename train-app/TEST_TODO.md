# Ijek — Test checklist (pre-launch QA)

Created 2026-06-11. Companion to `LAUNCH_TODO.md` (that = deploy/ops steps; this = behaviour testing).
Tick as you verify in a real browser. Hard-reload (Ctrl+Shift+R) after each SW bump.

> ⚠️ `train.html` compiles JSX in the browser — no compiler. A syntax slip = white screen on splash.
> If the page goes blank after a change, that's the first suspect.

---

## 🔴 1. Today's changes (2026-06-11, brand new — zero testing)
Self-reviewed in code: all intact, no balance/paren errors found. Still verify behaviour:

- [ ] **Face free-move + size** (Avatar → "แต่งเติม" tab): drag the face from the big preview → it moves, can drift OUTSIDE the circle (±0.9). Size slider grows it past the circle (no longer clipped/zoom-cropped). "รีเซ็ต" clears it.
- [ ] **faceAdjust no longer leaks to pickers**: set a big offset/size on your face glyph, then check the SAME glyph in the face picker, sticker quick-pick row, and sticker slot thumbnails are **normal size** — but the avatar face is still adjusted on dashboard / race / poke / timeline / leaderboard.
- [ ] **Slider moved**: face-size slider is on the "แต่งเติม" tab now, **gone** from "หน้า" tab.
- [ ] **Lively never overlaps a task block**: Day view AND Week view, especially a day with short / overlapping avatar task blocks (the cluster case). Fillers should only appear in real visible gaps.
- [ ] **Photo face path** (Pro): uploading/cropping a photo face still works (uses cropper, not the slider — `isPhoto` guard).

## 🔴 2. Money path (launch-critical)
- [ ] **PromptPay end-to-end** (TEST mode): register webhook in Opn (LAUNCH_TODO §2) → upgrade Pro → pay QR → app flips to Pro.
- [ ] **Trial 7 days + REAL expiry**: start trial → grants Pro → after expiry the reconcile drops back to Free (fake the clock / check `expires_at`).
- [ ] **Downgrade clamp** Pro→Free: persona reverts to `coach`, photo face → emoji fallback, Insights/personalities/photo locked again — but **data not erased** (re-upgrade restores).
- [ ] **Entitlement reconcile**: offline / error (`null`) read must NEVER downgrade; only a confirmed server `'free'` drops the plan.
- [ ] **Plan gating matrix**: Free vs Pro vs Pro+ — each gated feature locked/unlocked correctly. Pro+ cards hidden where intended.
- [ ] **DEV_UNLOCK gated**: the free "unlock" button only shows with `?dev` / `localStorage.tm_dev='1'`, not for real users.

## 🟡 3. AI (Pro / Pro+) — IS built (jek-ai edge fn + AI_DAILY_CAP)
- [ ] **jek-ai edge fn deployed + reachable** (Supabase). Without it, code should fall back to template lines (not crash).
- [ ] **Daily cap**: Free = 0 (template only, no LLM call), Pro = 8/day, Pro+ = 30/day. Hitting the cap → falls back to template.
- [ ] **Cache**: ≤1 Anthropic call per (day, moment, persona, lang); reopening the app same day does NOT re-call (`tm_ai_checkin`).
- [ ] **Weekly AI** (if surfaced): ≤1 call/week, cached per (week, persona, lang).
- [ ] **aiLively (Pro+)**: tier exists (`aiLively:'proplus'`) — confirm whether free-time fillers are actually AI-driven yet or still the deterministic `LIVELY_BY_BEHAVIOR` pool (may be gated-but-not-wired). Note result.
- [ ] **Cost guard**: empty/missing Anthropic key → no error, template fallback.

## 🟡 4. Auth / Multiplayer (networked)
- [ ] **Confirm email = ON** (newly changed): a brand-new signup goes through the confirmed magic-link; the silent bridge only LINKS an existing account (no silent signup).
- [ ] **Login** existing account (magic-link from Friends tab).
- [ ] **Friend-request consent** (pending→accept): add by code → "Request sent"; target sees inbox → Accept/Decline; a not-yet-accepted requester can't read your schedule/scores. (Run updated `supabase_schema.sql` first — `friendships.status`.)
- [ ] **Invite link** add-flow.
- [ ] **Live leaderboard** + **Today / 🏆 League** toggle (weekly standings, 👑 leader).
- [ ] **1v1 versus race**.
- [ ] **Friend's-day calendar** (FriendDay) shows their blocks.
- [ ] **Realtime updates** push without manual refresh.
- [ ] **daily_scores new columns** (e.g. `blocks jsonb`) ALTER-added in Supabase before this build loads — else leaderboard errors.

## 🟡 5. Cloud sync (Pro)
- [ ] Two devices/browsers: edit on A → appears on B (whole-app state ↔ `user_state`, last-write-wins by `rev`).
- [ ] **Reconcile on login**: signing in merges, doesn't clobber.
- [ ] Offline edits → reconnect → push (debounced).
- [ ] Requires `supabase_user_state.sql` run.

## 🟢 6. Core loop (regression — easy to break)
- [ ] Schedule: create / drag-move / resize / split / delete a block (Day + Week view).
- [ ] ✓ Done per block; amount logging + percent-mode logging; weekly-amount goal progress.
- [ ] Race "you vs committed-self" (You/Me bars, timeline markers, gap band).
- [ ] Grading / `dayScore`; gentle 4-tier circles (never harsh ✕); 0% = quiet grey.
- [ ] History "This week" rollup (X/Y kept + 🔥 streak + Mon–Sun strip).
- [ ] Streaks / achievement badges; rest tickets (streak-freeze).

## 🟢 7. Notifications / reminders (Pro)
- [ ] Web Notification fires at block start; chime plays; test ping on enabling.
- [ ] Mobile: SW `showNotification` + vibrate + emoji icon; tapping it focuses the app (`notificationclick`).

## 🟢 8. Insights/Coach + Weekly Recap (Pro)
- [ ] Insights switch on dashboard hero; insight quote + 🧐 + Move/Drop actions + Undo.
- [ ] Weekly Recap modal pops on first open of a new week.

## 🟢 9. Data safety
- [ ] Backup export → import (guarded, confirm + reload); round-trips intact.
- [ ] Schema migration from older data (don't destroy on upgrade).
- [ ] IndexedDB images hydrate on boot (faces/photos); load many photos → quota eviction sheds oldest (verify-before-delete), no crash.

## 🟢 10. PWA / deploy / i18n
- [ ] Install PWA; offline load; SW network-first picks up a new version on reload.
- [ ] `node build-deploy.js` → `dist/`: `/` = landing, "start" → app, icons/manifest/OG present.
- [ ] EN ⇄ Thai switch across every screen; new strings translated.
- [ ] ErrorBoundary: force an error → recovery screen, not a white screen.

---

### Notes
- Highest risk = **§1 (today, untested)** + **§2 (real money)**. Do those first.
- `LAUNCH_TODO.md` still has user-only ops steps (Opn webhook, ฿1 test, real-domain auth URLs, hosting, KYC→LIVE keys).
