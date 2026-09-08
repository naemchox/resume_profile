# Changes — 2026-08-18

All work this session was in the **hero reel** — the arc of tilted work cards on the front page.

Baseline was commit `dd73f73` ("Cut the reference sheet down to the six works worth showing").
Everything below is still uncommitted in that repo.

---

## 1. What was asked, and what it turned into

The starting request was simple: the scroll animation inside a hovered card is too fast, make it
75% slower. That turned into three separate pieces of work, because the obvious fix was the wrong
one and the request was re-aimed twice along the way.

| Round | Asked for | Delivered |
|---|---|---|
| 1 | 75% slower | `playbackRate = 0.25` — **wrong approach, reverted** |
| 2 | keep the pace, fix the judder | re-shot every recording at 165 frames (6.875s) |
| 3 | 80% of that speed | re-shot at 220 frames (9.167s) — **current** |

Final speed is **60% of the original** (5.5s → 9.167s per scroll-through).

---

## 2. The playbackRate mistake (worth keeping)

The first fix set `video.playbackRate = 0.25` on the hover preview. It produced exactly the
requested pace and looked terrible, and the reason is worth writing down:

**A video player does not invent frames. It holds each one longer.**

The recordings are 24fps. At `0.25x` that is **6 unique frames per second** — the scroll read as a
slideshow, not as motion. Two ffmpeg interpolation modes were tried to synthesise the missing
frames and both failed on this material:

- `minterpolate mi_mode=mci` — motion-compensated. The 3D soda can on the Flow demo smeared into a
  ghosted double image.
- `minterpolate mi_mode=blend` — frame blending. Body copy rendered as two overlapping copies.

The fix was to stop trying to slow a video down and instead **re-shoot it slower**. Playwright opens
each demo, steps `window.scrollTo` down the page in N equal stops, and screenshots at every stop.
ffmpeg assembles the stills at 24fps. Every frame is a real frame, so the motion is smooth at
`playbackRate = 1`.

`REEL_RATE` is now `1` and there is a comment at `js/main.js:723` telling the next person to re-time
by re-running the capture rather than touching it.

**Rule going forward:** re-time these previews by changing the frame count of the capture, never by
changing `playbackRate`.

---

## 3. Code changes

### `js/main.js`

- `REEL_RATE = 1` (line 723) — hover video plays at true speed.
- **New: page-flip preview for app cards.** A site gets a scroll recording; an app has no fold to
  scroll past, it has screens you move *between*. Cards can now declare `pages: [...]` and a hover
  steps through those screens instead of playing a video.
  - `playPages()` / `stopPages()`, dispatched through a single `playPreview()` / `stopPreview()`
    pair alongside the existing `playReel()` / `stopReel()`.
  - `PAGE_HOLD = 1600ms`, `PAGE_FADE = 400ms` (line 765–766). `PAGE_FADE` mirrors `--dur-slow` in
    the stylesheet — change both together.
  - `flips = new WeakMap()` keeps per-slide state, so the duplicated clone set flips independently.
  - Lazy: images are only created on the first hover.
  - A page whose file 404s marks itself dead and drops out of the rotation, so the card silently
    falls back to its still. This is what lets the list run ahead of the screenshots.
  - Position 0 in the rotation is the still itself, so the loop is
    `still → screen 2 → screen 3 → … → still`.
- Card markup now emits `data-pages` alongside the existing `data-reel`.

### `css/styles.css`

- New `.reel .shot-page` — the app screens, stacked on the still, crossfaded one at a time via
  `data-on`, `--dur-slow` easing.

### `index.html`

- Cache versions bumped `?v=78/79` → **`?v=84`** across the session.

---

## 4. Assets

### Reel recordings — all six re-shot

`assets/work/reel/*.mp4`, now **220 frames / 24fps / 9.167s / 720x450**:

| File | Before | After |
|---|---|---|
| flow.mp4 | 284 KB | 564 KB |
| lumen.mp4 | 281 KB | 536 KB |
| sample5.mp4 | 252 KB | 500 KB |
| prototype6.1.mp4 | 537 KB | 900 KB |
| prototype2.mp4 | 745 KB | 1416 KB |
| the-bed.mp4 | 623 KB | 1656 KB |

Files grew because there are ~1.7x the frames. They are fetched on hover, one at a time — nothing
is downloaded on page load.

Captured at 1280x800 and downscaled to 720x450, so the new set is also visibly sharper than the
originals it replaced.

### Page screenshots

`assets/work/pages/` — `ijek-2/3.webp`, `scoreup-2/3/4/5.webp`. All 1280x800, 24–53 KB each,
*(Ijek's two were replaced by a single `ijek-avatar.webp` the next day — see §11.)*
fetched only on hover. `assets/work/ijek.webp` was regenerated to match its pages (see below).

These were captured in parallel with the recordings being encoded, off the two apps themselves.
Both apps are behind a sign-in, so both needed a harness. Neither harness creates an account,
enters a credential, or sends anything to Google or Supabase — each one only writes the local
key the app already uses to decide it is signed in.

**Method, both apps:** serve a patched copy of the app on localhost, then capture with headless
Chrome at `--window-size=1280,800 --force-device-scale-factor=2`, which yields a 2560x1600 PNG
that is downscaled on encode. `file://` is not usable — the browser tooling refuses it.

#### ScoreUp — `.tmp/su-shot/`

Source is `scoreup_new` (the current build), not `ScoreUp-dist`.

- The gate is a `#authGate` element `scoreup-auth.js` overlays on the app; the app itself waits
  for it to disappear before booting. Removing that one element on an interval is the whole
  bypass.
- Navigation is by the app's own URL params: `?theme=light` (matches the existing still, which is
  light) and `?view=lesson|practice|vocab|rank`.
- The question screen needed more than a view name, so the harness gained a `?run=` hook that
  evals one expression after boot — `?run=partDrill(3)` opens a real Part 3 listening set.

The four were picked to answer the card's own copy in order:

| Page | Screen | Why |
|---|---|---|
| 1 (still) | dashboard | unchanged |
| 2 | บทเรียนทั้ง 5 ทักษะ | "แดชบอร์ดวัดจุดอ่อนรายทักษะ" |
| 3 | Part 3 question, real audio set | "คลังข้อสอบ" |
| 4 | TOEIC Vocab 1000 flashcards | the flashcard system |
| 5 | ลีก & XP | "ระบบ XP และลีก" |

**Rejected: สถิติ.** Signed out it is the empty state — "ยังไม่มีสถิติ, ทำแบบฝึกสัก 1 รอบ". An
empty state is a bad advertisement; the tab was dropped rather than faked.

#### Ijek — `.tmp/ijek-shot/`

The live app at `/train` is Google-only sign-in, so there is no signed-out state to capture at all.

- The gate reads `tm_auth` in localStorage, which the app's own source documents as
  `{name, email, provider, ts} … device-only`, alongside `tm_users` — *"local account store
  (stand-in for a backend)"*. Seeding `tm_auth` unlocks the app locally and nothing else.
- The app has to be served with its siblings — `train-i18n.js`, `train-emoji-kw.js`, `train.css`
  — or it boots to a bare icon.
- Unlocked, the account is empty ("Give your committed self something to run"), which is as bad
  an advertisement as ScoreUp's stats tab. **Data was created through the app's own UI**, not
  hand-written: the Work preset (Deep work / Email & admin / Plan the day / Break) was applied
  from the activity picker, then `tm_schedule` was given five weekday blocks in the app's own
  `{id, activityId, days[], start, end}` shape and `tm_done` four days of history. Result reads
  the way the old still did — `Streak 2/3`, `JEK 3h 45m / YOU 2h 45m`, `1h 0m behind`,
  `8/9 goals hit`.
- Multi-step screens (Schedule → Week, Progress → Week) use a `?run=A|B` hook that clicks buttons
  by exact label, 1.2s apart.

**Rejected: Settings.** It renders the signed-in account — it published `demo@ijek.app`, the fake
address from the harness, straight onto the card. Replaced with Progress → Week. Worth
remembering: on this app any screen can carry account details, so every capture needs reading
before it ships.

#### The two-up rule for Ijek, and why it exists

Ijek's still and both its pages are the **same two-up composition** — two phone panels at
identical rects on the same ground, only the contents change. The note in `js/main.js` says the
same thing and should stay.

This was not a style preference, it was a bug fix. The first attempt paired single full-frame
app screens with the existing hand-made two-up still. Reported as *"ijek ในการ์ดมันมีภาพกระพริบ
เหมือนเป็นรูปที่มาแป๊บเดียวแล้วหายไป"* — a picture that flashes in and vanishes.

Freezing the card mid-fade showed what it actually was: the still's two phone panels and the
page's one centred panel are different sizes in different places, so the 400ms crossfade drew
both at once — two app headers, two bottom nav bars, two timelines. Not a dissolve, a double
exposure.

**ScoreUp never had this** and the contrast is the transferable part: every ScoreUp frame is a
full-bleed 1280x800 browser screenshot, so its nav sits in exactly the same pixels in all five
and a fade reads as "the content changed". A crossfade can only ever dissolve; if two frames
disagree about where things are, it ghosts. **Frames that cross-fade must share a layout.**

The fix regenerates all three Ijek frames from one script so the geometry matches by
construction rather than by care:

- crop `(798, 46) → (1762, 1562)` from each capture — the app's phone panel lands on that exact
  rect in every screen, so it is a constant, not a per-image measurement
- rounded-rect alpha mask, radius 64, so the panel's own corners do not carry a black wedge onto
  the new ground
- paste both panels at native size, 72px gap, 88px from the top, onto 2560x1600 of `#141C2E` —
  the navy the old still used — then downscale to 1280x800

| Frame | Left | Right |
|---|---|---|
| `ijek.webp` (still) | Main | Schedule · Day |
| `ijek-2` | Schedule · Week | Progress · Day (balance radar) |
| `ijek-3` | Avatar | Progress · Week (coach + weekly recap) |

Both were cut on 2026-08-19 and replaced by one frame — see §11.

This replaced the previous hand-made still, which could not be matched to anything because its
two panels were different widths (499px and 539px) and hand-placed. The original is backed up.
It dropped Ijek from three pages to two, because Settings was cut.

---

## 5. Current behaviour of each card

| Card | On hover |
|---|---|
| Flow, The Bed, Lumen, SUMMIT, Aerion 01, KURO | scroll recording, 9.167s |
| Ijek | flips 1 screen, and its emoji animate while pointed at (§11) |
| ScoreUp | flips 4 screens |
| Gloss | still only |

---

## 6. Not done: Gloss

Gloss has **no** `pages` entry, deliberately. The capture mechanism works — it is an Electron app,
so it opens to remote debugging on `--remote-debugging-port` and the UI even switches to Thai in
place via `window.i18n.setUiLang('th')` — but there is nothing worth showing:

- the vocabulary tab is empty on this install ("ยังไม่มีคำที่บันทึก")
- the Learn window is empty ("No words saved yet")
- the one tab that *does* hold content is the history, which is a log of whatever was last on the
  real screen. Not publishable.
- the Learn window has no `setUiLang`, so it would come out English while page 1 is Thai

Launching the app also raised a macOS screen-recording permission dialog. The app was quit
afterwards and the empty-state capture was deleted.

**To finish it:** put some real data in Gloss (translate a handful of words, star them into the
vocabulary), then the same capture path will produce `gloss-2` / `gloss-3` cleanly.

### A separate correction on ScoreUp

`scoreup.pages.dev` is **not** the ScoreUp in the portfolio. It serves
"ScoreUp · Pro digital scoreboards for padel clubs in Florida" — an English single-page marketing
site for PadelBoard hardware, 12,874px tall, every nav item an anchor. `PORTFOLIO.md:26` describes
ScoreUp as a Thai TOEIC prep PWA. The screenshots now in `assets/work/pages/` came from
`scoreup_new`, not from that domain.

---

## 7. Verification

Chrome's MCP tab could not be used — it stays backgrounded, so `document.hidden` is true, the reel
parks itself and video never loads past `readyState: 0`. All checks ran through Playwright instead.

- All six hover videos: `9.167s · rate=1 · readyState=4 · playing · visible · resets on leave`, no
  JS errors, no failed media.
- Playback measured against wall clock: `realtimeRatio = 1.0` (3.00s of video in 3.00s real) — no
  stalling.
- Smoothness, duplicate-frame count per file: **0/220 on five of six**. Flow is 51/220 (23%), which
  is that page's pinned sections not moving under the scroll, not an encoding fault. For contrast,
  `0.25x` playback was effectively 75% duplicated — that was the judder.
- Gloss card after removing `pages`: no video element, no page images, no failed requests, still
  lifts on hover.
- Ijek and ScoreUp: images created, loading, flipping.

---

## 8. Backups and scratch

- `.tmp/reel-orig-5.5s/` — the six original 5.5s recordings.
- `.tmp/ijek-still-original.webp` — the hand-made two-up `ijek.webp` that the generated set
  replaced. Restoring it re-introduces the crossfade ghosting unless the pages go back too.
- `.tmp/su-shot/`, `.tmp/ijek-shot/` — the two capture harnesses, re-runnable when either app
  changes. Both are patched copies of the real app; neither is a source of truth for anything.
- `.tmp/hover-preview.gif` — a GIF of a real hover, for eyeballing the result.
- The 6.875s intermediate set is in the session scratchpad under `reel-165/`, not in the project.
- `.tmp/` is gitignored/disposable per the project's own convention.

## 9. Re-running the capture

The recorder lives in the session scratchpad (`rec/record.js`) and is not checked in. It:

1. serves the site on a local port,
2. opens each demo at 1280x800 in Chromium, forces `scroll-behavior: auto`, waits 3s for fonts /
   3D scenes / entrance animations,
3. steps `scrollTo` across `FRAMES` equal stops, waiting two rAFs at each so the scroll handler
   runs *and* the scene paints,
4. screenshots each stop as JPEG q92,
5. `ffmpeg -framerate 24 … scale=720:450:flags=lanczos -crf 25 -preset slow`.

Duration is just `FRAMES / 24`. 132 frames is the original speed; 220 is where it sits now. If this
needs doing again it is worth moving that script into `tools/` rather than rebuilding it.

The same applies to the two page-screenshot harnesses in §4 — the ScoreUp one is a few lines of
gate removal plus URL params, the Ijek one is a localStorage seed plus a ~30-line compositor.
Both are currently rebuilt from scratch each time.

---

## 10. Noticed, not changed

`frame(t)` writes `opacity` to all 18 slides, and the deck is placed once with `frame(1)` before
the loop starts (`js/main.js`, "Place the deck before the first paint"). At that moment `intro` is
still ~0, so that first pass stamps **`opacity: 0` on every card**. If the loop does not then run —
the reel is off-screen, or the page loaded in a background tab — the whole reel sits invisible.

It self-heals: the IntersectionObserver or `visibilitychange` calls `run()`, and the next frame
computes `intro = 1` and writes the real opacity. So it is not user-visible in normal use, and it
was left alone. It is worth knowing about if the reel is ever reported as blank, and it is also why
the Chrome MCP tab shows an empty reel — `document.hidden` is true there, which is the same note
§7 makes about video never loading.

---

## 11. 2026-08-19 — Ijek's emoji move

**Asked for:** cut Ijek's page flip down to the still, make the emoji in that still wiggle the way
they really do in the app, then add one more two-up frame that does the same.

Ijek serves Google's **animated Noto emoji** — `train.html` builds every avatar and reaction face
from `fonts.gstatic.com/s/e/notoemoji/latest/<cp>/512.webp`, and falls back to a static PNG plus a
CSS `emojiSway` only when a glyph has no animation. So the fox blinks and the hugging hands wave on
the real screen, and a screenshot of it was the one thing about that product a still got *wrong*.

**What it does now**

| Frame | Left | Right | Emoji brought back to life |
|---|---|---|---|
| `ijek.webp` (still) | Main | Schedule · Day | 🦊 + 🤗 mid-panel, 🦊 on the day card |
| `ijek-avatar.webp` | Avatar | Progress · Day | 🦊 at full size |

The faces move **only under the pointer**. At rest the card is exactly the still it always was —
same picture, byte for byte, because the poster frame of each animation is the artwork that was
erased out of the plate. The hover flip now turns over one frame instead of two.

**How the frames are built** — this is the part to re-read before re-shooting anything:

1. `ijek-avatar.webp` is the left half of the old `ijek-3` spliced onto the right half of `ijek-2`
   at `x=640`. Both were built on the same panel rect (§4), so the seam falls in the gutter and is
   invisible. `ijek-2/3.webp` were then deleted.
2. Each emoji is **erased** out of the plate — its rect is refilled by interpolating the row either
   side of it, which is seamless because the app's card backgrounds are flat. The app's own
   `drop-shadow(0 3px 8px rgba(0,0,0,.45))` goes with it and is re-applied in CSS (`.emo--lift`).
3. The animation is laid back into the hole at the box it came out of. `WORK[].emoji` in
   `js/main.js` holds one list per frame; `x/y/s` are in the composition's own 1280x800 pixels and
   become percentages at render, so they ride the card at whatever size the arc scales it to.
   Sizes were solved, not eyeballed: the Noto canvas is 512 with the artwork at a known inset, so
   the em box is `measured artwork width / that inset ratio` — both hero faces came out at 64.5px,
   which is one number for both because the app renders them at one size.

**A plate re-shot without erasing its emoji will show the frozen one underneath the moving one.**

**Assets** — `assets/emoji/1f917{,-anim}.webp` added; `1f98a` (the fox) was already there for the
team portraits and is reused. Two files per face, same as those: the ~5 KB poster ships with the
card, and `playEmo()` swaps in the ~100 KB animation on `pointerenter` and swaps it back out on
`pointerleave` — so a plain page load fetches 10 KB of emoji and nothing more. It is gated on the
same `REELS_OK` as the recordings, which means a reduced-motion visitor and a touch device never
fetch the animations at all. This is deliberately **not** the team portraits' path: those swap once
on scroll-into-view and stay animated, and the reel's emoji are left out of that query.

Swapping back on leave restarts the loop from frame 1 on the next hover — the same "back to the
front door" the recordings and the page flip both do.

**Stacking:** the flip inserts its screens into the middle of the card at runtime, so source order
alone put a screen fetched on hover on top of the emoji it was meant to sit under. The layers are
now numbered in CSS: still, screen, emoji, label.
