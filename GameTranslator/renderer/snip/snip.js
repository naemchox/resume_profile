const overlayEl = document.getElementById('overlay');
const freezeEl = document.getElementById('freeze');
const selectionEl = document.getElementById('selection');
const hintEl = document.getElementById('hint');
const ringEl = document.getElementById('ring');

// The armed cue follows the cursor by transform (no layout, no reflow) and only exists while there is
// no box yet — see the note in snip.html.
//
// ringIdle is the fix for the ring appearing at the LAST snip's cursor position, blinking out, and
// re-appearing under the cursor a moment later (jek, 2026-08-07: "วาร์ฟไปวาร์ฟมา", pressing the snip
// key repeatedly). The overlay window is REUSED, not recreated, so it carries the previous session's
// DOM into the next one. closeSnipWindows parks it with a reset — but the window stays alive for a
// beat after that, and a single mousemove landing in that beat called showRing again and re-lit the
// ring at wherever the cursor happened to be. The next snip then showed the window with that stale
// ring already painted, before its own reset could land: old spot, gone, new spot.
//
// Same class of bug, same cause, as the hint text flashing the previous session's instruction — see
// the parking note in onReset. That one was fixed by parking the CONTENT; a position can't be parked,
// so this one is fixed by refusing to light the ring at all while parked.
let ringIdle = false;
// The ring is kept in SCREEN coordinates, not page ones, and re-solved every painted frame. Measured
// (2026-08-14, first snip after launch): main's window bounds say y=0 when the reset is sent, macOS
// then shifts the shown overlay down to the work area (y=30) — so a page coordinate that was right at
// the moment it was computed paints 30px off a frame later, and only the next cursor poll dragged it
// back. That IS the "pops out in the wrong place, then jumps onto the cursor". A screen point plus the
// window's own live origin can't go stale: whatever frame paints next uses that frame's origin.
let ringScreen = null; // {sx, sy} or null when the ring is down
let ringRaf = 0;
let ringPainted = '';  // what is actually on screen, so a still cursor costs no DOM writes at all
function paintRing() {
  ringRaf = 0;
  if (!ringScreen) return;
  const x = ringScreen.sx - window.screenX;
  const y = ringScreen.sy - window.screenY;
  // Off this overlay's page (another display, or the menu-bar strip the window doesn't cover) = no
  // ring here. Drawing it clamped to the edge would be a lie about where the cursor is.
  const t = (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight)
    ? '' : `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  if (t !== ringPainted) {
    ringPainted = t;
    if (t) { ringEl.style.transform = t; ringEl.hidden = false; } else ringEl.hidden = true;
  }
  ringRaf = requestAnimationFrame(paintRing); // stay glued: the window can still be re-positioned
}
function showRingScreen(sx, sy) {
  if (ringIdle) return;
  ringScreen = { sx, sy };
  paintRing(); // this frame, then every frame after it
}
function showRing(x, y) { // page coords (our own mousemove / main's window-relative extern points)
  showRingScreen(x + window.screenX, y + window.screenY);
}
function hideRing() {
  ringScreen = null;
  ringPainted = '';
  if (ringRaf) { cancelAnimationFrame(ringRaf); ringRaf = 0; }
  ringEl.hidden = true;
}
// The OS cursor as main last reported it — the arbiter for the one bad mousemove below.
let cursorTruth = null;
// The overlay window is REUSED, and showing it again REPLAYS the mousemove it last saw: one event, at
// the position the cursor had in the PREVIOUS session, delivered a few ms after the reset. Recorded
// from a real ⌃⌥ session (2026-08-14, cursor never moved): reset said 454,209 · one mousemove said
// 444,199 · the next poll said 454,209 again — the ring blinking away and warping back. So a mousemove
// is not trusted until one of them agrees with the OS cursor; after that the session's real moves run
// the ring at full frame rate, since only the re-show can replay.
let mouseVerified = false;
function mousemoveIsReal(e) {
  if (mouseVerified || !cursorTruth) return true;
  const dx = e.clientX + window.screenX - cursorTruth.sx;
  const dy = e.clientY + window.screenY - cursorTruth.sy;
  if (dx * dx + dy * dy > 64) return false; // >8px from where the OS says the cursor is = the replay
  mouseVerified = true;
  return true;
}
// Where the ring goes is decided in ONE place. main sends the real OS cursor (screen coords) with
// snip:reset for frame 1 and keeps feeding it for the rest of the session (feedSnipCursor); our own
// mousemove is the smooth path in between.
function trackRing(c) {
  if (!c || c.sx === undefined) { hideRing(); return; }
  cursorTruth = { sx: c.sx, sy: c.sy };
  if (dragging || editMode) { hideRing(); return; } // the box/strip is the feedback now
  if (externalMode && !externArmed) return;         // live hook session → main drives the ring
  showRingScreen(c.sx, c.sy);
}
const previewEl = document.getElementById('preview');
const pvThEl = document.getElementById('pvTh');
const pvEnEl = document.getElementById('pvEn');

// Drag a box, translate what's in it, done — the only mode there is.
document.body.classList.add('once');
hintEl.textContent = 'Drag a box — translates once · Esc to cancel';
// ...but keep it hidden until a session says which trigger opened it (see the idle branch in
// onReset). Without this the very first snip after launch flashes this line before its real one.
hintEl.classList.add('pending');

// A preview costs a full OCR pass (~0.5s), so don't fire one per mouse move.
// Wait for the drag to settle, then read what's currently boxed.
const PREVIEW_IDLE_MS = 120; // was 250 — the bar felt late; OCR is the real floor, not the debounce

let startX = 0;
let startY = 0;
let dragging = false;
let previewTimer = null;
let previewSeq = 0;
// "Point" snip style: the box is already anchored (at the cursor) when the overlay appears —
// no mousedown needed. Any click, or the shortcut again (snip:finish), captures it.
let pointMode = false;
// "Click" snip style: a single click captures a fixed-size box centred on the click — no drag,
// no preview, just grab and go.
const CLICK_W = 420, CLICK_H = 84;
let clickMode = false;
let lastMove = null; // last mousemove, so a shortcut-finish knows where the box currently ends
// Live-strip edit mode: a pre-placed box (default subtitle spot / remembered) the user adjusts.
const editBar = document.getElementById('editBar');
const goBtn = document.getElementById('goBtn');
const defBtn = document.getElementById('defBtn');
const cancelBtn = document.getElementById('cancelBtn');
// The standard subtitle spot — must match the main process default (main.js showSnipWindows).
function defaultStrip() {
  return {
    x: Math.round(window.innerWidth * 0.15),
    y: Math.round(window.innerHeight * 0.76),
    width: Math.round(window.innerWidth * 0.70),
    height: Math.round(window.innerHeight * 0.14),
  };
}
let editMode = false;
let editRect = null; // {x,y,width,height} — the box being adjusted
let editOp = null;   // null | {type:'move'|'nw'|'ne'|'sw'|'se', grabX, grabY, start:{...editRect}}

// External mode: main.js drives the box (⌃⌥ / Ctrl+Alt held + cursor move) via
// mousehook + a CGEventTap — this overlay is click-through the whole time (set on the main-process
// window itself), so it never sees real mouse events here. It only draws whatever extern:* IPC
// tells it to. The own mousedown/mousemove/mouseup/keydown handlers below must stay out of the way.
let externalMode = false;
// A ⌘⇧S / Snip-button drag is ARMED (overlay up, click-through) but the left button isn't down yet, so
// main hasn't started a hook session (no extern:start). In this window we still want the pulsing ring to
// follow the cursor — the same "snip is live, act here" cue the ⌃⌥ hold gives from the first frame.
// forward:true delivers mousemove to us even though the overlay is click-through, so the ring can follow
// natively; it hands off to main the instant the drag/hold actually begins (onExternStart clears this).
let externArmed = false;

function setRect(x, y, w, h) {
  selectionEl.style.display = 'block';
  selectionEl.style.left = x + 'px';
  selectionEl.style.top = y + 'px';
  selectionEl.style.width = w + 'px';
  selectionEl.style.height = h + 'px';
}

function currentRect(e) {
  return {
    x: Math.min(startX, e.clientX),
    y: Math.min(startY, e.clientY),
    width: Math.abs(e.clientX - startX),
    height: Math.abs(e.clientY - startY),
  };
}

let previewShowingResult = false; // true = a real translation is on the card (vs empty / a status)
function hidePreview() {
  previewEl.hidden = true;
  previewShowingResult = false;
  previewEl.classList.remove('status'); // don't let a status's styling greet the next reading
}

// Park the preview centred under the box (flipping above it when there's no room), positioned by
// transform so it can follow the drag box live on every mousemove.
function placePreview(rect) {
  previewEl.hidden = false;
  const h = previewEl.offsetHeight;
  const w = previewEl.offsetWidth;
  let top = rect.y + rect.height + 8;
  if (top + h + 8 > window.innerHeight) top = Math.max(8, rect.y - h - 8);
  const left = Math.min(
    Math.max(8, rect.x + rect.width / 2 - w / 2),
    Math.max(8, window.innerWidth - w - 8),
  );
  previewEl.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

let lastRect = null;

async function runPreview(rect) {
  const seq = ++previewSeq;
  lastRect = rect;
  previewEl.classList.add('loading');
  // Say something WHILE the read runs. The .loading class alone is invisible here: it only sets
  // opacity, and the card is still [hidden] until placePreview un-hides it — which a failed first
  // read never reaches. So this path used to sit in total silence, indistinguishable from a broken
  // app. main.js's external path has sent these statuses since the Windows port; this is the same
  // feedback for the local drag, which is what ⌘⇧S uses on macOS.
  if (!previewShowingResult) showPreviewStatus('Reading…', rect);

  const result = await window.api.preview({ ...rect, seq });

  // The box moved on while this was in flight — that reading is already stale.
  if (seq !== previewSeq || (!dragging && !editMode)) return;

  // Dropped because a prior read was still running — RETRY shortly instead of waiting for the next
  // mousemove (with a still cursor the preview simply never appeared: "so delayed").
  if (result && result.busy) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => runPreview(rect), 180);
    return;
  }

  // Nothing usable here. Only say so when no real reading is up — mid-drag OCR fails briefly all the
  // time (box settling, a game frame caught mid-render), and blanking a good card for those would be
  // the "blinks sometimes" flicker again. Same guard the external handler uses.
  if (!result || !result.en) {
    if (!previewShowingResult) showPreviewStatus('Can’t read here — try a bigger box', rect);
    return;
  }

  showPreviewResult(result, rect);
}

// Paint a preview reading into the floating card. Shared by the renderer-driven ⌘⇧S preview and the
// main-driven ⌃⌥ external preview (extern:preview), so both look identical.
function showPreviewResult(result, rect) {
  previewEl.classList.remove('loading');
  if (!result || !result.en) {
    // Keep the last good reading on screen instead of hiding — hiding then reopening replays the
    // previewIn fade, which is the "blinks sometimes" the user saw (OCR briefly fails mid-drag while
    // the box settles / a game frame is mid-render). The card is hidden explicitly on drag end and
    // when the box shrinks below threshold.
    return;
  }
  previewShowingResult = true;
  previewEl.classList.remove('status'); // a real reading — back to full translation weight
  // Live translation (Google) up top, the captured source below. Falls back to the old
  // "release to translate" hint if the quick translate came back empty.
  pvThEl.textContent = result.th || 'release to translate';
  // What kind of word it is, as the same chip every other window uses (shared/pos-badge.js) — it was
  // quiet italic blue text here, which is a fourth spelling of the same fact in a flow that ends with
  // the card showing it a fifth way.
  const posChip = result.pos ? posBadgeEl(result.pos) : null;
  if (posChip) {
    pvThEl.appendChild(document.createTextNode(' '));
    pvThEl.appendChild(posChip);
  }
  pvEnEl.textContent = result.en.replace(/\s+/g, ' ');
  placePreview(rect);
}

// A transient status in the preview card, used by BOTH preview paths: "Reading…" while OCR runs,
// "Can't read here" when nothing usable was found — so the box gives feedback instead of sitting
// silent (felt "so delayed"). Callers guard on previewShowingResult so a re-read can't blank a good card.
function showPreviewStatus(text, rect) {
  previewEl.classList.remove('loading');
  previewShowingResult = false;
  // .status dresses this down — it reuses the translation's element, and at the translation's own
  // weight "Reading…" read as a result, as if the app had translated the word "Reading".
  previewEl.classList.add('status');
  pvThEl.textContent = text;
  pvEnEl.textContent = '';
  placePreview(rect);
}

function schedulePreview(rect) {
  clearTimeout(previewTimer);
  if (rect.width < 20 || rect.height < 12) {
    previewSeq++; // cancel anything in flight
    hidePreview();
    return;
  }
  previewTimer = setTimeout(() => runPreview(rect), PREVIEW_IDLE_MS);
}

// ---- Live-strip edit mode ----
function applyEditRect() {
  setRect(editRect.x, editRect.y, editRect.width, editRect.height);
  // Park the button bar under the box (above it when there's no room below).
  editBar.hidden = false;
  const bh = 40;
  const top = editRect.y + editRect.height + 12 + bh > window.innerHeight
    ? editRect.y - 12 - bh
    : editRect.y + editRect.height + 12;
  editBar.style.left = Math.round(editRect.x + editRect.width / 2 - editBar.offsetWidth / 2) + 'px';
  editBar.style.top = Math.round(top) + 'px';
}

// Edit mode is click-through EXCEPT over the box/handles/buttons — the game stays playable while
// the strip is adjusted. Forwarded mousemove drives the hit-test (same trick as the main pill).
function overEditUI(e) {
  if (!editRect) return false;
  const pad = 14; // covers the grab zones, which reach 9px outside the box at the corners
  if (e.clientX >= editRect.x - pad && e.clientX <= editRect.x + editRect.width + pad
    && e.clientY >= editRect.y - pad && e.clientY <= editRect.y + editRect.height + pad) return true;
  const b = editBar.getBoundingClientRect();
  return e.clientX >= b.left - 6 && e.clientX <= b.right + 6 && e.clientY >= b.top - 6 && e.clientY <= b.bottom + 6;
}

function startEdit(rect) {
  editMode = true;
  document.body.classList.add('edit');
  editRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  applyEditRect();
  window.api.setInteractive(false); // click-through until the cursor is over the box/buttons
  hidePreview(); // no instant-translation bar in CC edit mode (jek) — the box speaks for itself
  // The grips are gone (see .h in snip.css), so the hint has to say what to grab instead — "resize"
  // meant "find the blue squares" when there were blue squares to find.
  hintEl.textContent = 'Box the subtitles — drag inside to move, pull an edge to resize · ✓ starts · ✕ or Esc cancels · the game stays clickable';
}

function editMouseDown(e) {
  if (e.target.closest && e.target.closest('#editBar')) return; // let the bar's buttons click
  const h = e.target.dataset && e.target.dataset.h;
  if (h) editOp = { type: h, grabX: e.clientX, grabY: e.clientY, start: { ...editRect } };
  else if (e.target === selectionEl) editOp = { type: 'move', grabX: e.clientX - editRect.x, grabY: e.clientY - editRect.y, start: { ...editRect } };
  // Clicking the empty wash does NOTHING — it used to start a brand-new box, and one stray click
  // threw away the adjusted one (jek 2026-07-16). Move the box itself, or pull its corners.
}

function editMouseMove(e) {
  if (!editOp) return;
  const s = editOp.start;
  const dx = e.clientX - editOp.grabX;
  const dy = e.clientY - editOp.grabY;
  if (editOp.type === 'move') {
    editRect.x = Math.min(Math.max(0, e.clientX - editOp.grabX), window.innerWidth - editRect.width);
    editRect.y = Math.min(Math.max(0, e.clientY - editOp.grabY), window.innerHeight - editRect.height);
  } else {
    // Corner/edge drags: move the grabbed side(s), keep the opposite pinned (normalized so w/h
    // stay positive). Corners carry two letters (nw…), edges one (n/s/e/w) — same rule covers both.
    const t = editOp.type;
    let x1 = s.x, y1 = s.y, x2 = s.x + s.width, y2 = s.y + s.height;
    if (t.includes('w')) x1 += dx;
    if (t.includes('e')) x2 += dx;
    if (t.includes('n')) y1 += dy;
    if (t.includes('s')) y2 += dy;
    editRect = {
      x: Math.min(x1, x2), y: Math.min(y1, y2),
      width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
    };
  }
  applyEditRect();
}

goBtn.addEventListener('click', async () => {
  if (!editRect || editRect.width < 20 || editRect.height < 12) return;
  await window.api.complete(editRect);
});
// ↺ Default: snap the box back to the standard subtitle spot (the remembered position kept
// "drifting" for the user — this gives an always-reachable clean slate).
defBtn.addEventListener('click', () => {
  if (!editMode) return;
  editRect = defaultStrip();
  applyEditRect();
});
// ✕: close the picker without starting CC — same as Esc, but clickable/discoverable.
cancelBtn.addEventListener('click', () => window.api.cancel());

async function finishPoint(e) {
  if (!pointMode) return;
  if (!e) {
    // Shortcut re-pressed before the mouse ever moved — zero-size box, nothing to capture.
    // Cancel cleanly instead of leaving the overlay stuck open with no way out but Esc.
    pointMode = false;
    dragging = false;
    await window.api.cancel();
    return;
  }
  pointMode = false;
  dragging = false;
  clearTimeout(previewTimer);
  previewSeq++;
  const r = currentRect(e);
  if (r.width < 10 || r.height < 10) { await window.api.cancel(); return; }
  await window.api.complete(r);
}
window.api.onFinish(() => finishPoint(lastMove));

// Click style: grab a fixed CLICK_W×CLICK_H box centred on the click, clamped to stay on-screen.
async function fixedCapture(e) {
  clickMode = false;
  const x = Math.max(0, Math.min(e.clientX - CLICK_W / 2, innerWidth - CLICK_W));
  const y = Math.max(0, Math.min(e.clientY - CLICK_H / 2, innerHeight - CLICK_H));
  await window.api.complete({ x, y, width: CLICK_W, height: CLICK_H });
}

window.addEventListener('mousedown', async (e) => {
  if (externalMode) return; // main drives the box in this mode, not our own mouse events
  if (e.button !== 0) return;
  if (clickMode) { fixedCapture(e); return; } // click style: the click IS the capture
  if (editMode) { editMouseDown(e); return; }
  if (pointMode) { finishPoint(e); return; } // point style: the click IS the shutter
  // Press-and-hold: anchor the start corner, box grows while the button is held, release to capture.
  dragging = true;
  hideRing(); // the box takes over as the feedback
  startX = e.clientX;
  startY = e.clientY;
  setRect(startX, startY, 0, 0);
  hintEl.classList.add('mini');
  // Once the button is down you are already doing the thing the instruction described — repeating it
  // is noise. The only fact still worth screen space is the way out.
  hintEl.textContent = 'Esc to cancel';
  hidePreview();
});

window.addEventListener('mousemove', (e) => {
  if (externalMode && !externArmed) return; // active hook session → main drives the ring/box, not us
  if (!mousemoveIsReal(e)) return;          // the re-shown window replaying the last session's move
  lastMove = e;
  if (!dragging && !editMode) showRing(e.clientX, e.clientY);
  else hideRing();
  if (editMode) {
    // Mid-drag stays interactive no matter where the cursor is; otherwise interactive only over the UI.
    window.api.setInteractive(!!editOp || overEditUI(e));
    editMouseMove(e);
    return;
  }
  if (!dragging) return;
  const r = currentRect(e);
  setRect(r.x, r.y, r.width, r.height);
  // Keep the preview glued to the bottom-centre of the box in real time (not only when a read
  // finishes), so it follows the drag smoothly instead of jumping.
  if (!previewEl.hidden) placePreview(r);
  schedulePreview(r);
});

window.addEventListener('mouseup', async (e) => {
  if (externalMode) return;
  if (editMode) { editOp = null; return; }
  if (!dragging) return;
  dragging = false;
  clearTimeout(previewTimer);
  previewSeq++;
  const r = currentRect(e);
  if (r.width < 10 || r.height < 10) { await window.api.cancel(); return; } // too small = a stray click — stay silent
  await window.api.complete(r); // release IS the capture
});

window.addEventListener('keydown', async (e) => {
  if (e.key === 'Escape') {
    await window.api.cancel();
    return;
  }
  // ONE trigger for both ways in: the snip is up, so drag a box — but if you'd rather just TYPE the
  // word (DRM/blurry text, or you already know it), the overlay hands off to the pill's type field.
  // Space is the switch (it's what Windows uses too, where a click-through overlay can't see typing
  // at all); any other single character switches AND lands in the field, so typing never stutters.
  // Modifier combos and named keys (arrows/F-keys/Shift) are not text.
  if (e.key === ' ' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) {
    e.preventDefault();
    await window.api.typeChar(e.key === ' ' ? '' : e.key);
  }
});

// The overlay used to cancel itself the moment ⌘/⇧ came back up, which meant
// letting go of the hotkey before starting the drag killed the snip. It stays
// open now — Esc, or a click that drags less than 10px, is how you back out.

// The overlay is reused (shown/hidden) rather than recreated, so clear any state
// left from the previous snip each time it's shown.
// Windows freeze-frame: main sends a screenshot to show behind the box (still image = no video lag).
window.api.onFreeze((dataUrl) => {
  if (!dataUrl) return;
  freezeEl.src = dataUrl;
  freezeEl.hidden = false;
});

window.api.onReset((opts) => {
  dragging = false;
  pointMode = false;
  clickMode = false;
  lastMove = null;
  freezeEl.hidden = true;          // drop the previous session's frozen shot
  freezeEl.removeAttribute('src');
  editMode = false;
  editOp = null;
  editRect = null;
  editBar.hidden = true;
  externalMode = false;
  externArmed = false;
  // Parked (idle) resets come from closeSnipWindows; a real session's reset does not carry it. Set it
  // HERE, above the external early-return below — the Windows park sends external:true too, and a
  // flag set after that return would never be applied on the one platform that needs it most.
  ringIdle = !!(opts && opts.idle);
  // A new session is exactly when the replay lands, so the mousemove has to earn trust again.
  mouseVerified = false;
  cursorTruth = (opts && opts.cursor && opts.cursor.sx !== undefined) ? opts.cursor : null;
  hideRing(); // each session/armed state starts ringless until the cursor moves — no stale ring flashes
  document.body.classList.remove('edit');
  document.body.classList.remove('ct');
  clearTimeout(previewTimer);
  previewSeq++;
  lastRect = null;
  selectionEl.style.display = 'none';
  hideRing();
  hidePreview();
  hintEl.classList.remove('mini');
  // Parked between sessions: hide the chip instead of leaving the last session's instruction sitting
  // in it. main shows the overlay immediately and the next snip:reset only lands a frame or two
  // later, so whatever text is here WILL be on screen first — and since ⌃⌥ and ⌘⇧S want different
  // lines, that frame read as two hints flashing past each other. closeSnipWindows already parks the
  // BOX in its next state for the same reason; this does it for the text without having to guess
  // which trigger comes next.
  // Hide the chip, but DON'T return — Windows parks the overlay in the external state it will next
  // be shown in (closeSnipWindows sends external:true with this), and bailing here skipped that setup
  // entirely, undoing the very flash-on-next-snip fix that parking exists for. The branches below
  // still run and still set the text; it just isn't visible until a real session unhides it.
  hintEl.classList.toggle('pending', !!(opts && opts.idle));
  // External mode (main drives the box): main already set this window fully click-through — no
  // setInteractive(true) here, and no drag/point/click setup below, since main drives the box
  // directly via extern:start/update/finish instead.
  if (opts && opts.external) {
    externalMode = true;
    // ⌘⇧S left-drag: armed but not yet dragging → let the ring follow the cursor natively until the
    // drag begins. The ⌃⌥ hold (opts.combo) is already a live main-driven session, so it stays false.
    externArmed = !opts.combo;
    document.body.classList.add('ct'); // click-through — no crosshair, see snip.css
    // macOS only ever gets here via the hold-drag. Windows reaches the same engine two ways, so
    // opts.combo says whether this is the Ctrl+Alt hold or the ⌘⇧S left-drag.
    const held = window.api.isMac || opts.combo;
    hintEl.textContent = held
      ? `Hold ${window.api.isMac ? '⌃⌥' : 'Ctrl+Alt'} and move over the text — release to translate · Space to type it instead`
      : 'Left-click and drag over the text — release to translate · Space to type it instead';
    trackRing(opts.cursor); // armed cue on the real cursor from frame 1
    return;
  }
  // Windows click-through point: the overlay stays click-through (video keeps playing behind it), the
  // box is drawn from FORWARDED mousemove, and a second shortcut press (onFinish) is the shutter. No
  // setInteractive(true) — capturing the mouse is exactly what freezes the video on Windows.
  if (opts && opts.ct) {
    if (opts.point) {
      pointMode = true;
      dragging = true;
      startX = opts.point.x;
      startY = opts.point.y;
      setRect(startX, startY, 0, 0);
    }
    hintEl.textContent = 'Move to size the box — press the shortcut again to capture · Esc to cancel';
    trackRing(opts.cursor);
    return;
  }
  window.api.setInteractive(true); // normal snip drag captures the whole screen again
  // live: this drag defines the strip that live subtitle mode will keep watching.
  hintEl.textContent = opts && opts.live
    ? 'Drag a box over the SUBTITLE area — auto-translates as it changes · Esc to cancel'
    : 'Drag a box — translates once · Space to type it instead · Esc to cancel';
  // Click style: one click on the text grabs a fixed box around it — no drag, no preview.
  if (opts && opts.click) {
    clickMode = true;
    hintEl.textContent = 'Click on the text to translate · Esc to cancel';
  }
  // Live picking: a pre-placed editable box (remembered strip, or the default subtitle spot) —
  // no drawing needed, just adjust and ✓. Takes precedence over point style.
  if (opts && opts.liveRect) { startEdit(opts.liveRect); return; }
  // Point style: the box is live immediately, growing from the cursor's position at trigger time.
  if (opts && opts.point) {
    pointMode = true;
    dragging = true;
    startX = opts.point.x;
    startY = opts.point.y;
    setRect(startX, startY, 0, 0);
    hintEl.textContent = 'Move to stretch — click or press the shortcut again · Esc to cancel';
  }
  trackRing(opts && opts.cursor); // hides itself in point/edit mode, where the box is the cue
});

// Truth from the OS cursor (~16/s) for as long as the session is live: fixes a ring left behind by a
// replayed mousemove, and keeps it following even where no mousemove reaches this window.
window.api.onCursor((c) => trackRing(c));

// ---- External mode: main drives the box (⌃⌥ / Ctrl+Alt + move) ----
window.api.onExternStart(({ x, y }) => {
  if (!externalMode) return;
  externArmed = false; // the drag/hold is live now — main drives the ring/box from here, not our mousemove
  setRect(x, y, 0, 0);
  showRing(x, y); // ⌃⌥ registered — the cursor is the anchor until you move
});
window.api.onExternUpdate(({ x, y, width, height }) => {
  if (!externalMode) return;
  setRect(x, y, width, height);
  if (width >= 10 || height >= 10) hideRing(); // dragging now: the box says where you are
  // Carry the reading bar along with the box. Without this it only moved when a NEW reading landed
  // (every ~260ms settle + the OCR pass), so it sat at the old spot and then warped. This is a
  // transform on an element that's already being repainted at 60fps — no capture, no OCR, no cost.
  // Only when it's already on screen: placePreview would otherwise un-hide an empty bar mid-drag.
  if (!previewEl.hidden) placePreview({ x, y, width, height });
});
window.api.onExternPreview(({ result, rect, status }) => {
  if (!externalMode) return;
  if (status === 'hide') { hidePreview(); return; }
  // A status ("Reading…" / "Can't read here") only shows when NO translation is up yet — once a real
  // reading is on the card, keep it while re-reading (like ⌘⇧S's loading), so re-reads don't blank it.
  if (status === 'reading') { if (!previewShowingResult) showPreviewStatus('Reading…', rect); return; }
  if (status === 'unreadable') { if (!previewShowingResult) showPreviewStatus('Can’t read here — try a bigger box', rect); return; }
  showPreviewResult(result, rect);
});
window.api.onExternFinish(() => {
  if (!externalMode) return;
  hideRing();
  selectionEl.style.display = 'none';
  hidePreview();
});
