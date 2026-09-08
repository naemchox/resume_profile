# Ijek — feature ideas backlog (brainstorm 2026-06-12)

Ideas/design from a working session. NONE built yet (separate from the 9 audit bugs, which are fixed — see BUGS_AUDIT.md). Ordered by recommended sequence at the bottom.

## A. AI features (Pro+ flagship material — need jek-ai deployed + Pro+ enabled)

### A1. "✨ ให้ JEK จัดให้ / Plan with JEK" — natural-language → task setup
- Type a sentence ("เขียนโค้ดวันละ 1 ชม. จันทร์–ศุกร์") → AI fills the activity form (name, emoji, race/just-me, scoring mode, target, days, per-day times).
- Two scopes: **A)** autofill ONE activity from a sentence; **B)** whole-week: describe goals → AI creates multiple activities + schedule (= the "AI weekly game-plan" Pro+ flagship).
- TODO: spec — button placement (on New/Edit activity), prompt to jek-ai, response JSON schema to populate the form, Pro+ gate. Reuses jek-ai edge fn (`kind:'plan'` new branch).
- Naming candidates: **✨ ให้ JEK จัดให้ / Plan with JEK** (recommended, on-brand, covers A+B) · Smart Add · Magic Add.

### A2. 📸 Photo → AI design from image
- Take a photo (handwritten plan / class timetable / book TOC) → AI extracts activities + schedule. Multimodal (Haiku accepts images).
- TODO: extend A1 to accept an image input; same Pro+ gate.

## B. UX / structure (benefit ALL users, no AI cost — ship these first)

### B3. One Task, multiple sessions per day  ✅ VERIFIED + UX FIX 2026-06-12 (SW v664)
> **Verify result: YES, already works.** BlockSheet's activity chip row (train.html:10862) lets you pick ANY existing activity (task or hobby) and Save creates a new block with that activityId — including a 2nd block same day (overlap is warn-only, `valid` ignores conflict at 10835). Data model (1 activity → many blocks) + per-block scoring/race already aggregate. So NO new "＋ เพิ่มรอบ" UI needed.
> **Bug found while verifying + fixed:** `defaultDay` was passed into BlockSheet by both call sites (Day view 10652, ScheduleEditor 10763) but NEVER used — so tapping ＋ on a specific day defaulted the new block to ALL 7 days (recurring) instead of that day. Fixed at 10781: new blocks default `days` to `[defaultDay]` when given, fall back to ALL_DAYS otherwise. User widens to recurring by tapping more weekday chips. **Verify in browser before closing.**
- Problem (original): doing the same thing twice a day forces a duplicate-named activity. Model already separates Activity ↔ Block (1 activity → many blocks, incl. same day), so it's a UX gap, not a data-model one.

### B4. Make task design easier — DECISION: Schedule-first (hybrid), not just a simpler form
> **2026-06-12 decision:** the better fix isn't only simplifying the Edit-activity form — it's changing the SURFACE. Designing a task **directly in the Schedule** (tap/drag a time slot → name it → smart defaults fill the rest) matches how people think ("when") and is the most intuitive PRIMARY create surface (like Google Calendar/Fantastical). The simplified accordion form becomes the **slim detail sheet** that opens when you tap a block to set the non-time attributes (scoring mode, race, weekly goal, emoji). They are LAYERS, not either/or: Schedule = front door (create+place); detail sheet = deeper config (progressive disclosure).
> **Must resolve first:** a block created in the Schedule must link to / create an **Activity** (reusable identity, weekly-goal + race rollup), not a one-off — else rollups break.
> **Next step (no code yet):** inspect the current Schedule block-sheet (`bs.*` keys) — what can you already set when adding a block + picking/creating an activity, what's missing? Then decide "tweak vs rework" and the first slice.

> **Edit-form REORG SHIPPED 2026-06-12 (SW v668):** ActivitySheet split into 2 labeled groups — **"งานนี้คืออะไร / The task"** (emoji → who-races → scoring/goal → double-habit) and **"ทำเมื่อไหร่ / When"** (days+sub-names → time-of-day). Who+Scoring were PULLED BACK OUT of the v665/v666 "⚙ More options" disclosure and are now VISIBLE in the What group (user: "ทุกข้อมูลสำคัญหมด" → organize, don't hide). `advOpen`/disclosure removed; new `.act-group-label` CSS + i18n `as.groupWhat`/`as.groupWhen`. Data model untouched.

### B4-MULTI. ⭐ Task with MULTIPLE time-slots PER DAY  ✅ SHIPPED 2026-06-12 (SW v669)
> ActivitySheet "When" group rebuilt from days-grid+perDay/dayTimes into a **slot list**: each slot = weekday chips + from/to time + duration; "＋ เพิ่มช่วงเวลา / Add a time"; remove✕ when >1. Morning+afternoon = 2 slots. Load = `myBlocks.map(→slot)` (every block its own slot, no `.find` collapse). Save = `when={specs:[{days,start,end}]}`. New module helper **`scheduleFromWhen(prev,activityId,when)`** (one block per spec, id-reuse by start/end) used by BOTH hosts — Activities-tab `commit` AND the day-view ✎ (which now ALSO rebuilds schedule, fixing the old metadata-only inconsistency). `days` is now a derived union (useMemo) driving per-day sub-names/amounts; per-day sub-names relocated to a compact "ชื่อเฉพาะแต่ละวัน" row. Removed perDay/dayTimes/dayOk machinery + the inline grouping in commit. New CSS `.act-slot*`/`.act-add-slot`/`.day-sub-input`, i18n `as.timeSlots/slotN/addSlot/removeSlot/slotNoDay/daySubnames(+Hint)`. Downstream verified safe (scoring/timeline/reminders/done all key by blockId). Backup at `train.backup-2026-06-12-reorg-v668.html`. **Verify in browser** (esp. round-trip: add 2nd slot → save → reopen → both slots present).

(historical note — the gap that motivated this:)
- User wants one Task to run **more than once a day** (e.g. Coding morning AND afternoon, same activity). This is about the SOLID **plan/blocks** (not B3's dashed diary sessions).
- **Data model already supports it**: schedule = Block[], many blocks can share one activityId incl. same day (overlap = warn-only). Adding a 2nd same-day block via the **Schedule ＋** already works (= B3 verify).
- **GAP + latent data-loss in ActivitySheet's "When":** the form maps an activity to AT MOST ONE block per day. `perDay` seeds `dayTimes[d]` from `myBlocks.find(b=>b.days.includes(d))` (FIRST block only) and on save writes one {start,end} per day → **editing an activity that has 2 same-day slots COLLAPSES it to one (the other slot is lost).** (train.html ActivitySheet ~9582 dayTimes seed, ~9631 save `when` build.)
- **Design direction:** evolve the "When" group from shared/per-day-single-time into a **list of time-slots** (each slot = one or more days + start/end), i.e. surface the activity's blocks as an editable list (＋ add slot / remove). Pairs naturally with Schedule-first (add a 2nd slot by tapping another time on the calendar). NEEDS its own plan/slice — do BEFORE any change that re-saves blocks, to avoid the collapse bug.

(Original form-only idea kept below for reference.)

### B4-orig. Simplify the manual task-setup form (the "Edit activity" screen)
> **emoji-grid→sheet SHIPPED 2026-06-12 (SW v667):** working-emoji 3-row inline grid replaced with a picked-emoji preview + "เลือกอิโมจิ ▾ / Choose emoji" button that opens the existing full EmojiGifPicker (search+saved+library); 📷 stays inline. New CSS `.act-emoji-pick/.act-emoji-preview/.act-emoji-choose`, i18n `as.chooseEmoji`. Double-habit's 2nd-emoji grid left as-is (already toggle-gated, hidden by default).
> **disclosure moved to BOTTOM 2026-06-12 (SW v666):** the "⚙ More options" fold now sits last (after days+time, before delete) so order reads name→emoji→when→[advanced].
> **Slice 1 SHIPPED 2026-06-12 (SW v665):** collapsed the two set-once advanced sections — **Who (race / just-for-me)** + **Scoring mode (time/amount/percent + amount sub-fields + per-day amount)** — behind a "⚙ More options / ตัวเลือกเพิ่มเติม ▾" disclosure in ActivitySheet (train.html ~9695). New task now opens to **name → [⚙ collapsed] → emoji → double-habit → days+time**. State `advOpen` (ActivitySheet) auto-expands when EDITING a task that already uses a non-default (type==='hobby' OR goalMode!=='time') so existing configs are never hidden. New CSS `.act-adv-toggle`/`.act-adv-caret` (~train.html:463); i18n `as.moreOptions` EN+TH. **Verify in browser.** Next slices (not done): emoji grid → sheet, trim helper text → tooltips, smart defaults, optional bottom-placement of the disclosure.

- Problem: ~6 sections shown at once = overwhelm upfront. Users only need name + when; the rest have good defaults.
- Approach (accordion + progressive disclosure + smart defaults):
  - **Layer 1 (always visible):** name+color, days, time.
  - **Layer 2 (compact chips, tap to change):** scoring mode (default เวลา), who (default แข่ง), emoji (default/guessed). Move the big emoji GRID into a tap-to-open sheet.
  - **Layer 3 (collapsed under "ตัวเลือกเพิ่มเติม ▾"):** lively/2nd emoji, different-time-per-day, per-day subtask names, (future) multiple sessions/day.
- 4 highest-impact moves: (1) collapse Layer 3; (2) emoji grid → sheet; (3) trim long helper text → "?" tooltips; (4) smart defaults so the form opens "ready to save".
- TODO: build in slices; slice 1 = collapse the advanced section (most impact, least risk). UX rules: progressive-disclosure, content-priority, field-grouping, whitespace-balance.

## C. Decisions made (not build tasks)
- **Pro+ hidden this launch** (Free+Pro only). Reposition later as "AI Coach": AI weekly-plan flagship + truly unlimited chat, ~฿179/mo · ฿1,490/yr. See memory project_train_ai_tiers.
- **"Living JEK" stays a FREE random pool** — do NOT make ambient avatar filler AI-driven (cost trap; users can't tell vs a good pool). AI spend only on CONTEXTUAL output (check-in, chat, insights, plan).

## Recommended order
> ⚠️ 2026-06-12: the user's REAL priority is **B4 Schedule-first INPUT** (the DECISION block above), NOT the B4-orig form polish. B4-orig slices (collapse advanced ✅v665, move disclosure ✅v666, emoji→sheet pending) are secondary detail-sheet cleanup — do NOT let them eclipse the Schedule-first work. See memory `project_train_schedule_first`.
1. **B4 Schedule-first** — make tap/drag a Schedule slot the primary create surface (BlockSheet/drag-create already exist; likely tweak not rework). THIS is the headline.
2. (done/optional) B3 ✅ · B4-orig form polish (detail-sheet only).
3. **A1 → A2** — after jek-ai is deployed and Pro+ is (re)enabled.
