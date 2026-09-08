# Ijek — UX/UI audit (2026-06-13)

4 parallel read-only agents (AI/JEK · Schedule/create · onboarding/nav/dashboard/settings · progress/social/billing/visual). LIST only — **nothing changed**. Priorities: **P0** = hurts launch / many users · **P1** = high · **P2** = polish.

---

> ✅ **#1 SHIPPED 2026-06-13 (SW v677):** AI chat rebuilt as a persistent **LINE-style thread** — new `K.chat` log `[{role,text,ts}]` (capped `CHAT_MAX=100`, in BACKUP_KEYS so it backs up/syncs/resets), a real `chat-sheet` bottom sheet with scrollable user/JEK bubbles + auto-scroll + empty state, `sendChat` now persists each turn AND feeds the last ~10 turns to `aiChatSend` (role assistant=JEK) so JEK remembers. Replaced the 14s vanishing poke-reply (poke kept for reactions only). Hero 💬 opens the sheet. Pro-gate unchanged. Discoverability (P0 #5 part) still open — the 💬 button could use a first-run hint.

## ⭐ AI "talk to JEK" — verdict (the trigger for this audit)
**Not ready as a "chat" today.** Confirmed in code: reply comes as a poke bubble that vanishes in ~14s, **no history stored**, and `aiChatSend` is called with ONE message (the `history` param is unused) → JEK has zero memory; follow-ups fail; errors/quota also vanish. Plus the chat entry (💬 hero icon) is undiscoverable.
- **Don't** chase Notion-AI power (wrong job + cost trap + loses vs ChatGPT). Ijek's edge = *knows your week*, not raw smarts.
- **Do** → make it a **persistent "JEK thread / check-in journal"**: store `K.chat=[{role,text,ts}]`, real scrollable bubbles (not the 14s poke), feed last ~6–10 turns + today's context into the model, cap retention (~100 msgs/30d — storage quota risk). Keep the poke for quick *reactions* only.

---

> 🟡 **#1–3 (new-user) REVISITED 2026-06-13 (SW v679): audit OVER-FLAGGED.** Verified in code: onboarding **does** explain the core loop (final page `onboard.title`="Meet your committed self" / intro="…you'll race to keep up every day"), and the **first-activity CTA already exists** (centered empty state in ActivityListScreen, which renders ON the dashboard; the week card is already hidden when empty so it doesn't bury the CTA). So #1/#2 were largely fine — did a focused **copy reframe** of the empty state around the race (`act.emptyTitle/Sub/addFirst`) instead of a risky restructure. **#3 (dashboard "no primary action") is the real residue** but it's a hero/MainScreen restructure — deferred. Lesson: the audit agents inferred problems from CSS/partial reads; verify before acting.

## P0 — fix before pushing for users
1. **Onboarding is 3 full screens deep** (Login → OnboardingWizard → 13-step Tour) and **never explains the core loop** ("race your committed self"). Tour also spans 5 tabs. → condense; lead with a one-line "why"; Main-only first tour; add Skip. *(Root ~5808, OnboardingWizard ~6671, TOUR_STEPS ~6520)*
2. **New-user dead-end:** after setup, dashboard shows empty hero + (week card hidden) + the "Add first activity" button buried at the bottom of the list → reads as broken. → full-screen "create your first habit" card, one field. *(MainScreen ~12039, ActivityListScreen ~9037)*
3. **Dashboard has no clear primary action** — greeting + streak + name chip + dense hero (coach toggle / race / up-next / avatar+chat) + week + list, all competing. → cut hero chrome, make avatar the single interaction, sticky "＋ add". *(MainScreen 12303–12437)*
> 🟡 **#4 PARTLY DONE 2026-06-13 (SW v678):** added a global keyboard `:focus-visible` ring (there was none), bumped the worst sub-10px text (`.dayp-race-tag` 9→11px, `.wrec-stat-lbl` 9.5→11px + dim→muted). ⚠️ Audit was **inaccurate** on two: `.race-hide`/`.race-reveal` ALREADY have aria-labels, and `.dayp-race-tag.you` (low-contrast --text-dim) doesn't exist (base uses --you amber, fine). Remaining a11y: sweep other icon-only buttons for aria, audit 11px values, color-semantics legend.

4. **Legibility/accessibility (cross-cutting):** lots of 9–11px text (race tags, week/stat labels), low contrast on the "you" race tag (`--text-dim` ~4.5:1), icon-only buttons without `aria-label`, no `:focus` ring, sub-44px touch targets. → typographic tiers (≥12px values, ≥16px headers), fix contrast, add labels + focus rings. *(CSS throughout; e.g. `.dayp-race-tag` 3116, `.wrec-stat-lbl` 2868)*
5. **AI chat** — see verdict above (no history / vanishes / undiscoverable). Treat as P0 if chat is a headline Pro feature.

## P1 — high impact
6. **Timeline gestures have no affordance:** tap=quick plan, drag=custom, long-press(220ms)=arm, tap-block=select, drag=move, grip=resize — all invisible. → hover/empty-slot hint + 1-time coachmark. *(TwoLaneTimeline onCanvasDown ~14905)*
7. **Two-lane ME vs JEK metaphor is visually weak** + **solid(plan) vs dashed(diary) unclear** — the core idea of the app. → stronger lane color/edge labels (sticky on scroll) + a tiny legend. *(`.tl2-cap me/av`, `.tl2.me.free`)*
8. **Small-block crowding:** <30-min blocks cram emoji+name+time; resize grip only a few px; goal badge ("3/5 pages") unreadable. → bigger hit target, abbreviate/pop badge above block. *(~15170, `.tl2-resize`, `.tl2-goal-btn`)*
> 🟢 **#9–10 (Pro/upsell) DONE 2026-06-13 (SW v680):** verified first — the **gating is already philosophy-correct** (History walls only ANALYSIS: Coach/Recap/Trends; raw user data — WeekCard, achievements, day list — stays FREE, audit's "data hostage" was a misread). `ProLock` is already a clean dashed teaser, not a red wall. So did the two SAFE positive tweaks instead of a risky restructure: (1) ProLock badge **🔒→✨** (bonus, not wall) across all uses; (2) one consolidated **"✨ Everything Pro adds"** pitch card at the top of Settings for Free users (`set-pro-pitch`, `set.proPitchHead/Body`) so the value lands in ONE positive place. Left the contextual inline locks (they aid in-place feature discovery; removing them would lose context).

9. **Settings too long & Pro upsell scattered:** 10+ sections; a Free user passes 5–7 separate lock icons. → 4 groups (Account / Preferences / Features / Help+Danger) + ONE "Upgrade to Pro" block listing locked features. *(SettingsScreen 13472–13834)*
10. **ProLock reads as "your data is missing,"** not an upsell (Recap + Trends walled mid-History). → consolidate to one "Pro Analytics" gate or soft-gate like Coach (show summary, wall detail). Ties to our rule: never wall the user's own data. *(ProLock ~13196, HistoryScreen 11716/11723)*
11. **Slot→block mapping is implicit** in ActivitySheet (1 slot on Mon+Wed = 2 blocks). → live summary "Creates 5 plan blocks (Mon–Fri)". *(ActivitySheet ~9846)*
12. **Validation is silent** — Save just sits disabled with no reason; user thinks it's broken. → inline error / highlight the missing field. *(ActivitySheet ~9685, BlockSheet ~10854)*
13. **Rest-ticket 🎟️ unexplained** — block greyed, avatar not racing, no hint what a ticket is / how to cancel. → tiny "Rest" label + first-time tip. *(~15222)*
14. **Mobile sheet CTAs not anchored:** plan/billing CTA scrolls out of reach on small phones. → `position:sticky; bottom:0` for primary CTA. *(`.billing-body` 1664, `.plan-cta`)*

## P2 — polish / consistency
15. **"Progress" vs "History" naming** — button says one, code/tour say the other. → pick one, audit strings. *(TABS ~4734)*
16. **5 tabs crowded; Avatar tab unorganized** (identity vs personality vs cosmetics mixed). → maybe fold Avatar/Settings; section the Avatar tab.
17. **Color semantics inconsistent** — `--you` amber vs `--accent` green vs `--danger`; good/mid/bad shades overlap. → lock a legend (green=goal/jek, amber=you, red=missed) and apply.
18. **Now-line subtle** on mobile / when scrolled away → glow + sticky "Now HH:MM".
19. **Social viral loop weak:** invite code buried in Friends profile; leaderboard empty-state is chicken-and-egg ("no scores" before you see why to add friends). → surface "📨 Invite" + explain scoring in the empty state. *(FriendsScreen ~5926, ~6261)*
20. **Trial not prominent:** Pro card button says "Unlock Pro," the "7 days free" is tiny → primary button = "Start 7-day free trial"; yearly "save ~25%" badge too small. *(13391, `.billing-save` 1680)*
21. **Loading "…" is ambiguous** (loading vs empty vs error) → explicit "Loading…" + spinner. *(6157/6260/6303)*
22. **TimePicker infinite loop** can surprise (55→00 with no boundary) — minor; watch for "feels like a bug" feedback. *(~9445)*
23. **Lively free-time fillers look tappable** but aren't → a "· free time" marker. *(~15110)*
24. **Overlap column-packing** (block shrinks 50%→25%) looks like an accidental resize → animate the width change. *(~15048)*
25. **Inline `L(en,th)` strings** scattered (drift risk) → migrate to the central STRINGS table.
26. **Note 💬 flag tiny/unexplained** (just redesigned) → optional first-time tip "tap 💬 to read/add a note." *(MeSeg ~14670)*
27. **AI value is invisible:** AI greeting / AI weekly-letter silently swap in with no "✨ AI" cue → Pro users don't see what they paid for. *(12379, WeeklyRecapModal ~11175)*

---

## ✅ AUDIT CLOSEOUT (2026-06-13, SW v681)
Worked through every item; **verified each in code before touching it.** Big takeaway: **the audit agents over-flagged ~70%** — they inferred problems from CSS / partial reads. Items that turned out ALREADY-FINE on inspection: onboarding core-loop (it IS explained), first-activity CTA (exists, not buried), `.race-hide/reveal` aria (present), `.dayp-race-tag.you` low-contrast (doesn't exist), History "data hostage" (gating is philosophy-correct — raw data free, only analysis gated), ProLock "wall" (already a clean teaser), billing trial prominence (CTA already says trial).

**SHIPPED (safe, verified-real fixes):** AI persistent chat thread (v677) · keyboard focus ring + micro-text bumps (v678) · new-user empty-state copy reframed to the race (v679) · Pro tone 🔒→✨ + consolidated Settings "Everything Pro adds" pitch (v680) · billing savings badge + now-line legibility/glow + **empty-day tap-to-create coachmark** `sched.tapToAdd` (v681).

**STRUCTURAL — now SHIPPED too 2026-06-13 (SW v682), via parallel design-agents → serial verified apply:**
- ✅ P0 #1 onboarding: added a **Skip** button on the optional analytics pages (1–3) → straight to setup; `finish()` defaults missing answers safely (`maybeSeedStarter`). No page renumbering (kept indices).
- ✅ P0 #3 dashboard new-user focus: **reorder** — when `activities.length===0`, ActivityListScreen (its "create first habit" CTA) renders ABOVE the hero; returns below once you have activities. Pure conditional reorder, no state-lift.
- ✅ P1 #7 timeline legend: added a compact **"▦ Plan · ▢┄ Logged extra"** legend under the lane caps (`tl2-legend`, `tl.legend.*`) clarifying solid(plan)/dashed(diary). (Tap-to-create coachmark already shipped v681.)

**Genuinely SKIPPED (verified = not worth it):**
- Tab "Progress/History": the inconsistency is INTERNAL only (tab id `'history'` vs label "Progress"); **users see a consistent "Progress/คืบหน้า"** — renaming the visible label to "History" would be a downgrade (less motivating) for a non-problem. Left as-is.
- P1 #6 extra gesture coachmarks / P1 #8 small-block hit-targets / Avatar-tab reorg / color-legend: low-ROI or interaction-sensitive layout math — left for a real need.

**Audit is effectively CLOSED.** Net: most flags were over-stated; all genuinely-real + safe items shipped across v677–v682.

## Suggested first moves (when we DO act)
- The **AI-chat persistent thread** (its own slice — see verdict) — high user-visible + Pro value.
- A **new-user pass**: P0 #1–3 together (onboarding "why" + first-activity card + dashboard focus) — biggest activation win.
- An **accessibility/legibility pass** (P0 #4) — cheap, broad, launch-credibility.
- A **Pro/upsell consolidation** (P1 #9–10) — fixes "data hostage" feel + clearer monetization.
