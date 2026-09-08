# Train With Myself — i18n audit & migration plan

Goal: make the whole app language-switchable (English ⇄ ไทย). Single file `train.html`,
JSX compiled in-browser (no build step / type-check), so migrate in **verifiable chunks**.

---

## 1. Foundation (DONE — SW v217)

- `K.lang = 'tm_lang'` — device-local language pref (`'en'` | `'th'`).
- `STRINGS = { en:{…}, th:{…} }` dictionary + `let _lang` + `function tr(key, vars)` + `getLang()`
  (near line ~2192). Missing `th` key → English fallback → the key itself. Never blank.
- Function is **`tr`** not `t` (≈20 local `t` loop vars would shadow it).
- Interpolation: `tr('greet', { name })` replaces `{name}` in the string.
- Language state lives in `Root` (`const [lang,setLang]`, `changeLang(l)`): sets module `_lang`,
  persists, then re-renders the whole tree so every `tr()` re-reads. No prop-threading needed.
- **Settings → Language** picker (English / ไทย) wired (`SettingsScreen` gets `lang`/`onSetLang`).

### Already migrated this turn (~60 keys, 41 `tr()` calls)
- Bottom nav (`nav.*`) — `BottomNav` renders `tr('nav.'+tab.id)`.
- All of `SettingsScreen` (`set.*`, `common.cancel`) + the new Language section.

### How to migrate a string
1. Add the key to **both** `en` and `th` in `STRINGS`.
2. Replace the literal with `tr('key')` (or `tr('key',{var})` for interpolated).
3. For a region that uses `t` as a loop var, rename that local to `tab`/`row`/etc first.
4. Bump `sw.js` cache, NUL-scan, reload, verify in browser (one chunk at a time).

---

## 2. Scale

| Region (lines) | Components | ~strings |
|---|---|---|
| 2150–3340 | data tables (TABS, PLANS, BEHAVIORS, LIVELY, all POKE/copy tables), Root, BottomNav, Login, Tutorial, **behaviorCopy** | **~215** |
| 3340–4665 | ActivityListScreen, EmojiGifPicker, TimePicker, **ActivitySheet**, RestTaskMenu, DatePopover | ~70 |
| 4665–5910 | ScheduleScreen, ScheduleEditor, **BlockSheet**, WeekCard, TrendCard, DayProgress, HistoryScreen, AvatarSetupModal | ~95 |
| 5910–6660 | DashUpNext, AvatarHero, **MainScreen**, PhotoCropper, **AvatarScreen**, ProLock, **PlanBillingScreen**, raceStatusCopy | ~95 |
| 6660–8100 | RaceHeader, **WeekGrid**, WeekView, MeSeg, MeMergedSeg, **TwoLaneTimeline** | ~58 |

**Total ≈ 530+** distinct strings. Biggest single bucket: the **personality copy** (behaviorCopy +
POKE/WORK_POKE/REST_POKE/HABIT_POKE lines + raceStatusCopy) ≈ **180 strings** of voiced microcopy.

---

## 3. Suggested migration order (most-visible first)

1. ✅ Nav + Settings (done).
2. **Login + Tutorial** (`login.*`, `tut.*`, `onboard.*`) — first thing a new user sees. ~45.
3. **MainScreen / dashboard** (`dash.*`, greetings, mini-stats, `race.me`) + **AvatarHero**. ~35.
4. **ScheduleScreen + Day timeline (TwoLaneTimeline)** tooltips/labels + RaceHeader. ~70.
5. **WeekGrid** (tools "Hobbies/Me/JEK", day-header titles, block tooltips). ~30.
6. **ActivitySheet + BlockSheet** (the two big editors — many labels/placeholders/explainers). ~110.
7. **HistoryScreen / DayProgress / WeekCard / TrendCard** (verdict words, week summaries). ~60.
8. **AvatarScreen + PlanBillingScreen + ProLock** (settings-adjacent, billing copy). ~70.
9. **Personality copy** (`copy.*`, `poke.*`, `workpoke.*`, `restpoke.*`, `habitpoke.*`,
   `behavior.*`, `lively.*`, `action.*`) — large, self-contained; do last as one pass. ~180.
10. **Shared fallbacks/labels**: `common.*` (Save/Cancel/Add/Delete/Close/Done/Back/Next/Confirm/
    Upgrade), `race.you/me`, `verdict.*`, `fallback.deleted/task/session`, weekday names.

---

## 4. Special concerns (NOT plain `tr()`)

- **Locale dates** — `toLocaleDateString('en-US', …)` at ~5005, 5655, 5773, 4624 (month/weekday
  text). Switch the locale arg to `getLang()==='th'?'th-TH':'en-US'` (or a small formatter).
- **Weekday/day arrays** — `WEEKDAYS`, `DAY_FULL`, DatePopover `Mo/Tu/…`, perday `Mon/Tue/…`:
  provide localized arrays keyed off `getLang()`.
- **Clock AM/PM** — `fmtClock`/`fmtRangeShort`/`fmtHourLabel`/`fmt12` emit `a`/`p`/`AM`/`PM`.
  Thai usually wants 24h; needs locale-aware formatter variants, not `tr()`.
- **EMOJI_KEYWORDS** (~600 English search terms, ~3985–4093) — emoji search only works in English.
  Separate, optional translation pass (large). Flag, don't block.
- **Billing strings already hardcoded in Thai** (lines ~6398, 6403, 6421, 6441, 6445, 6452 — trial
  copy "ลองฟรี … วัน"): these need an **English** counterpart via `tr()` so EN mode reads correctly.
- **Default names** — `JEK` (avatar), `Athlete`, `Player N`: user-facing defaults; product call
  whether to localize. Recommend leaving `JEK` as-is; localize `Athlete`/`Player`.

---

## 5. Full inventory

Captured by 5 parallel audit agents. Tables (line · English · context · suggested key) are
recorded per region. Key prefixes proposed:

- `nav.*` ✅ · `set.*` ✅ · `common.*` (shared buttons)
- `login.*`, `tut.*`, `onboard.*`
- `dash.*` (Main), `hero.*`, `race.*` (you/me/ahead/behind/in-step + status), `cropper.*`
- `sched.*`, `cal.*`, `ticket.*`, `agenda.*`, `editor.*`, `blockSheet.*`, `timeline.*`, `goal.*`,
  `block.*` (tooltips), `aria.*` (aria-labels), `day.*` (week-grid headers), `tools.*` (week tools)
- `activities.*`, `activity_sheet.*`, `emoji_picker.*`, `emoji_group.*`, `time_picker.*`,
  `rest_menu.*`, `date_popover.*`, `weekday_short.* / weekday_min.* / weekday.full.*`
- `week.*`, `trend.*`, `dayp.*`, `hist.*`, `verdict.*`, `task.*` (progress)
- `av.*` (AvatarScreen), `billing.*`, `prolock.*`
- `copy.*` (behaviorCopy: per-behavior ready/behind/working/done/ontrack/rest/resttask × head/sub),
  `behavior.*`, `lively.*`, `action.*`, `poke.* / workpoke.* / restpoke.* / habitpoke.*`

> The exhaustive per-line tables from the audit run are large (~530 rows). They live in the audit
> agents' output for this session; ping me to paste any region's table inline, or just say
> "migrate <region>" and I'll add the keys + wrap the strings for that chunk and you verify it.

---

## 6. Status

- [x] `tr()` engine + `K.lang` + Root state + Settings Language picker
- [x] Nav migrated · Settings migrated
- [ ] Login/Tutorial → … → Personality copy (chunks 2–10 above)
- [ ] Locale date/clock/weekday formatters
- [ ] (optional) EMOJI_KEYWORDS Thai search
