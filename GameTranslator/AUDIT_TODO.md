# GameTranslator — pending bugs (audit 2026-07-15)

Found after the full-screen click-through drag refactor. Not yet fixed — user will do later.

## ✅ FIXED

1. ~~Translation card renders off-screen when the pill is dragged into the upper half.~~
   **REALLY FIXED 2026-07-16 (3rd attempt):** history — the column-reverse + dragOffY-compensation
   approach was wired then REVERTED same day (it warped the pill off the top, lost behind the menu
   bar). New safe approach: `.wrap.flip` now absolutely anchors `.result`/`.panel` BELOW the pill
   (`top: calc(100% - 6px)`) — the pill itself NEVER moves, no dragOffY math. `updateFlip()`
   (no-compensation version) is called from `applyDock()`, covering drag-release snaps and the
   remembered-dock restore on launch.

6. ~~Snip release ran a full duplicate capture+OCR even when the live preview just OCR'd the same box.~~
   **FIXED 2026-07-16:** `lastPreviewOcr` (was an un-declared implicit global, written but never read)
   is now a real `let`, cleared on snip start, and reused by `snip:complete` when the released box
   matches the last previewed box within 4px → passed as `cachedText` to `translateOnce` (skips OCR).

## 🟡 Open (accepted / low priority)

2. **[WON'T FIX for now]** Full-screen window captures all clicks while hovering the pill.
   `interactive=true` → `setIgnoreMouseEvents(false)` covers the whole window. BUT a mousemove
   flips it back off the instant the cursor leaves the pill, and you must move the mouse to click
   elsewhere — so it self-corrects in all normal use. Only a click with ZERO cursor movement after
   hovering the pill would be eaten (not reachable with a mouse). Revisit only if it bites in practice.
   Files: `renderer/main/index.js` (setInteractive), `main.js` (ui:interactive handler).

## ✅ FIXED (2026-07-15)

3. ~~Dead code `ui:move` handler + `preload.move`.~~ Removed from `main.js` + `preload-main.js`.
4. ~~Vocab marquee mis-measures during the pill width animation.~~ Now re-measured on the pill's
   `transitionend` (width) in `index.js` when a vocab is parked.
5. ~~Pill drag position isn't persisted.~~ **Superseded:** raw-position persistence was removed
   (stale off-screen coords after a display change made the pill vanish). Persistence is now the
   named DOCK spot via settings (`{ dock }` in `snapToNearestDock()` → `applyDock()` on launch).
   `localStorage['gt.pillPos']` is actively deleted.

## ✅ FIXED (audit 2026-07-16)

7. ~~Stale translation clobbers a newer one~~ — no sequence guard: a slow snip A landing after a
   fast snip B overwrote B's card with unrelated older text. **FIXED:** `transGen` counter in
   main.js (`translateOnce`/`translateText` share it); stale errors/lowquality/loading are dropped
   in main, stale translations still saved to history but renderer (`lastTransGen`) skips showing.

8. UX: onboarding copy said "English text" but the app OCRs EN/JP/CN/KR. **FIXED:** now "the game
   text" (index.html empty state + renderHistory() duplicate).

9. NEW: tucked pill hover-peek — hovering the tab nudges the pill ~16px back toward the screen
   ("ready to slide out" affordance). `.wrap.tuck-left/right` classes + `--peek-x` in styles.css.

10. ~~Export CSV fails silently~~ **FIXED 2026-07-16:** try/catch in main.js (`reason:'write'`) +
    renderer catch → "Couldn't save the CSV" hint.
11. ~~Dead code `preload-snip.js` onReading~~ **FIXED 2026-07-16:** removed.
12. ~~UX backlog~~ **ALL FIXED 2026-07-16:**
    - error/low-quality now short one-glance hints ("Blurry — try a bigger box"; errors truncated ~48ch)
    - hide toggle = whole left cap of the pill (`.dot::after` hit-area) + hover halo works tucked too
      + tucked hover "peek" nudge (16px) + tucked tab shows no text
    - result card max-height 60vh → 38vh
    - crisp dark 1px outer ring on pill + card (readable over dark game scenes)
    - card hold time adjustable in Settings ("Card stays" 3–30s, `holdSec` setting)
    - snip hint shrinks to a corner chip mid-drag ("Esc to cancel") instead of vanishing
