const pill = document.getElementById('pill');
const dot = document.getElementById('dot');
const pillLock = document.getElementById('pillLock');
const hintEl = document.getElementById('hint');
const hintTextEl = document.getElementById('hintText');
const panel = document.getElementById('panel');
const logEl = document.getElementById('log');
const emptyEl = document.getElementById('emptyState');
const permBanner = document.getElementById('permBanner');
const permBtn = document.getElementById('permBtn');
const permRestartBtn = document.getElementById('permRestartBtn');
const permStepsEl = document.getElementById('permSteps');   // the three numbered actions; hidden for banners with no Settings row
const permStep2El = document.getElementById('permStep2');
const permRevealBtn = document.getElementById('permRevealBtn');
const permMsgEl = document.getElementById('permMsg'); // the banner's reason — swapped per permission
const permStaleEl = document.getElementById('permStale'); // the stale-entry line — macOS permissions only
const permDetailEl = document.getElementById('permDetail'); // the steps line — only when the raiser sends one
const snipBtn = document.getElementById('snipBtn');
const logBtn = document.getElementById('logBtn');
const settingsBtn = document.getElementById('settingsBtn');
const lockBtn = document.getElementById('lockBtn');
const historyView = document.getElementById('historyView');
const settingsView = document.getElementById('settingsView');
const tabType = document.getElementById('tabType');
const tabHist = document.getElementById('tabHist');
const typePage = document.getElementById('typePage');
const dictPage = document.getElementById('dictPage');
const typebar = document.getElementById('typebar');
// Full SRS flashcard review lives in the Learn window (M4). The pill has no review UI and no "N due"
// link either — that banner was cut 2026-07-22; the 🎓 header button is the one way into Learn.
const proBox = document.getElementById('proBox');
const proStatus = document.getElementById('proStatus');
const upgradeBtn = document.getElementById('upgradeBtn');

// Plan gate (device-local mock for now — a real purchase/licence flow comes with the backend).
let plan = (() => { try { return localStorage.getItem('gt.plan') === 'pro' ? 'pro' : 'free'; } catch { return 'free'; } })();
// This is a personal tool, not sold — everything is unlocked for the owner. The whole Pro gate
// (requirePro, the star gates, the hidden proBox) is kept intact so a real sellable build can flip
// this back to `plan === 'pro'` later. Until then no feature is ever locked behind the fake paywall.
function isPro() { return true; }
function setPlan(p) { plan = (p === 'pro') ? 'pro' : 'free'; try { localStorage.setItem('gt.plan', plan); } catch {} renderPlan(); }
function renderPlan() {
  const pro = isPro();
  document.body.classList.toggle('is-pro', pro);
  if (proStatus) proStatus.textContent = pro ? 'Pro ✓' : 'Free';
  if (upgradeBtn) upgradeBtn.textContent = pro ? 'Pro active — tap to reset (dev)' : 'Upgrade to Pro';
}
// A free user tried a Pro feature: bounce them to the Pro box in Settings and flash it.
function requirePro() {
  if (isPro()) return true;
  panelMode = 'settings';
  updateUI();
  if (proBox) { proBox.classList.remove('flash'); void proBox.offsetWidth; proBox.classList.add('flash'); }
  return false;
}
const quitBtn = document.getElementById('quitBtn');
const showEnBtn = document.getElementById('showEnBtn');
const showPosBtn = document.getElementById('showPosBtn');
const showEnMeanBtn = document.getElementById('showEnMeanBtn');
const showReadingBtn = document.getElementById('showReadingBtn');
const showSensesBtn = document.getElementById('showSensesBtn');
const speakVolInput = document.getElementById('speakVolInput');
const speakVolLabel = document.getElementById('speakVolLabel');
const snipStyleSel = document.getElementById('snipStyleSel');
const uiLangSel = document.getElementById('uiLangSel');
const pillStyleSel = document.getElementById('pillStyleSel'); // declared here so the stepper pass below sees it
let curUiLangPref = null; // last-applied uiLang preference, so settings echoes don't re-run applyI18n
const hideCapBtn = document.getElementById('hideCapBtn');
const recSnipBtn = document.getElementById('recSnipBtn');
const recSnipRow = document.getElementById('recSnipRow');
const exportBtn = document.getElementById('exportBtn');
const keyInput = document.getElementById('keyInput');
const keySaveBtn = document.getElementById('keySaveBtn');
const licInput = document.getElementById('licInput');
const licBuyBtn = document.getElementById('licBuyBtn');
let buyUrl = '';   // filled from the settings snapshot; the renderer never invents a URL of its own
licBuyBtn.addEventListener('click', () => { if (buyUrl) window.api.openUrl(buyUrl); });
const licSaveBtn = document.getElementById('licSaveBtn');
const quotaNote = document.getElementById('quotaNote');
const licBox = document.getElementById('licBox');
const licTitle = document.getElementById('licTitle');
const licSub = document.getElementById('licSub');
const licMsg = document.getElementById('licMsg');
const sourceLangSel = document.getElementById('sourceLang');
const targetLangSel = document.getElementById('targetLang');

// Turn a native <select> into a custom dropdown that looks the same on Mac and Windows. Chromium draws a
// <select>'s OPEN popup itself, and on Windows that popup is a greyed, un-stylable list — so we keep the
// <select> as the state + change source (hidden), and render our own button + menu driven by it. Options
// that carry data-i18n are mirrored so applyI18n keeps re-translating them (App-language switch). Stores
// a sync() on the element (el._cddSync) so code that sets el.value externally can refresh the label.
function enhanceSelect(sel) {
  if (!sel || sel._cddSync) return;
  const cdd = document.createElement('div'); cdd.className = 'cdd';
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'cdd-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  const val = document.createElement('span'); val.className = 'cdd-val';
  const caret = document.createElement('span'); caret.className = 'cdd-caret'; caret.textContent = '▾'; caret.setAttribute('aria-hidden', 'true');
  btn.append(val, caret);
  const menu = document.createElement('div'); menu.className = 'cdd-menu'; menu.hidden = true; menu.setAttribute('role', 'listbox');
  const opts = [...sel.options].map((o) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cdd-opt'; b.setAttribute('role', 'option');
    b.dataset.value = o.value; b.textContent = o.textContent;
    if (o.dataset.i18n) b.dataset.i18n = o.dataset.i18n; // let applyI18n re-translate this row too
    menu.appendChild(b);
    return b;
  });
  cdd.append(btn, menu);
  if (sel.getAttribute('title')) cdd.title = sel.getAttribute('title');
  if (sel.dataset.i18nTitle) cdd.dataset.i18nTitle = sel.dataset.i18nTitle;
  sel.style.display = 'none';        // keep the <select> for value + change; just don't show it
  sel.setAttribute('aria-hidden', 'true');
  sel.after(cdd);
  const close = () => {
    if (menu.hidden) return;
    cdd.classList.remove('open'); menu.hidden = true; btn.setAttribute('aria-expanded', 'false');
    menu.style.position = menu.style.left = menu.style.top = menu.style.right = menu.style.width = menu.style.visibility = '';
    window.removeEventListener('scroll', close, true);
    window.removeEventListener('resize', close);
  };
  const openMenu = () => {
    // position:fixed so the menu escapes the settings panel's overflow clip (an absolute menu gets cut
    // off / adds a scrollbar), and flip ABOVE the button when there isn't room below — App language sits
    // low on the System page. Measured while laid-out-but-invisible so it never flashes at 0,0 first.
    menu.hidden = false;
    menu.style.position = 'fixed'; menu.style.visibility = 'hidden';
    menu.style.left = '0px'; menu.style.top = '0px'; menu.style.right = 'auto'; menu.style.width = '';
    const r = btn.getBoundingClientRect();
    const mh = menu.offsetHeight;
    // WHERE (0,0) ACTUALLY LANDS. position:fixed is only viewport-relative while no ancestor is
    // transformed — and .wrap always is (the drag/tuck translate, see styles.css .wrap), which makes
    // IT the containing block for every fixed descendant. So `left: r.left` was the button's viewport
    // x PLUS the pill's dock offset: at the right-hand docks that is ~+780px on a 1920 screen and the
    // menu opened off the edge of the display, which is what "the language buttons do nothing" was
    // (jek, 2026-08-19 — the settings.json dock was 'qr'). It has been true of every dropdown here
    // since they were built; it only shows at a dock that is far from the centre. #btnTip dodges the
    // same trap by living outside .wrap entirely. Measuring the offset instead of naming the ancestor
    // means this stays correct if the transform ever moves to another element — or goes away.
    const zero = menu.getBoundingClientRect();
    const roomBelow = window.innerHeight - r.bottom;
    const up = roomBelow < mh + 8 && r.top > roomBelow;
    menu.style.width = r.width + 'px';
    menu.style.left = (r.left - zero.left) + 'px';
    menu.style.top = ((up ? Math.max(4, r.top - mh - 4) : r.bottom + 4) - zero.top) + 'px';
    menu.style.visibility = '';
    cdd.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    window.addEventListener('scroll', close, true); // close on scroll rather than chase the button
    window.addEventListener('resize', close);
  };
  const sync = () => {
    const cur = opts.find((o) => o.dataset.value === sel.value) || opts[0];
    if (!cur) return;
    val.textContent = cur.textContent;
    if (cur.dataset.i18n) val.dataset.i18n = cur.dataset.i18n; else val.removeAttribute('data-i18n');
    opts.forEach((o) => o.setAttribute('aria-selected', String(o === cur)));
  };
  sel._cddSync = sync; sync();
  btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) openMenu(); else close(); });
  opts.forEach((o) => o.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sel.value !== o.dataset.value) { sel.value = o.dataset.value; sel.dispatchEvent(new Event('change')); }
    sync(); close();
  }));
  document.addEventListener('click', close);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); close(); } });
}
// Game-menu variant of the above: for a SHORT option list, a console settings screen doesn't open a
// popup — it shows `‹ value ›` and you step through it. Same contract as enhanceSelect (the <select>
// stays the state + change source, sync lives on el._cddSync), so renderSettings and the change
// listeners never learn which of the two is on screen. Opt in with class="gs-step" in the HTML.
function enhanceStepper(sel) {
  if (!sel || sel._cddSync) return;
  const wrap = document.createElement('div'); wrap.className = 'gs-stepper';
  const prev = document.createElement('button'); prev.type = 'button'; prev.className = 'gs-stepper__arrow'; prev.textContent = '‹';
  const next = document.createElement('button'); next.type = 'button'; next.className = 'gs-stepper__arrow'; next.textContent = '›';
  prev.setAttribute('aria-label', 'Previous'); next.setAttribute('aria-label', 'Next');
  const val = document.createElement('span'); val.className = 'gs-stepper__val';
  wrap.append(prev, val, next);
  if (sel.getAttribute('title')) wrap.title = sel.getAttribute('title');
  if (sel.dataset.i18nTitle) wrap.dataset.i18nTitle = sel.dataset.i18nTitle;
  sel.style.display = 'none';        // same as enhanceSelect: kept for value + change, just not shown
  sel.setAttribute('aria-hidden', 'true');
  sel.after(wrap);
  const sync = () => {
    const o = sel.options[sel.selectedIndex] || sel.options[0];
    if (!o) return;
    val.textContent = o.textContent;
    // Mirror the option's i18n key so applyI18n re-translates the visible value on a language switch.
    if (o.dataset.i18n) val.dataset.i18n = o.dataset.i18n; else val.removeAttribute('data-i18n');
  };
  const step = (dir) => {
    const n = sel.options.length;
    if (!n) return;
    sel.selectedIndex = (sel.selectedIndex + dir + n) % n; // wraps, like a game's option cycle
    sync();
    sel.dispatchEvent(new Event('change'));
  };
  prev.addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
  next.addEventListener('click', (e) => { e.stopPropagation(); step(1); });
  sel._cddSync = sync; sync();
}
// Every settings <select> currently carries gs-step, so this always takes the stepper branch today.
// enhanceSelect is kept deliberately, not by accident: a stepper is only right for a handful of
// options, and the first long list added here (say a voice or a font picker) needs the dropdown back
// — leave gs-step off and it gets one.
// snipStyleSel is deliberately NOT in this list: its widget is built by renderShortcuts, onto the
// snip key's own row, and it follows the same _cddSync contract from there.
// A picker must not offer what the machine cannot do. Same capability the Settings swap tests, read
// from the same place (capabilities.js, via the preload) rather than a second platform check here.
// BEFORE the enhance pass, not after: enhanceSelect() snapshots the <option> list into its own menu
// buttons, so an option removed later stays on screen while being gone from the <select> underneath
// — a Windows build would have offered ไทย as a source and then read nothing.
if (!(window.api && window.api.thaiSource)) {
  document.querySelectorAll('#sourceLang option[data-needs="thai"]').forEach((o) => o.remove());
}
// The English→Thai edition takes the whole language row off the surface — both pickers, the ⇄, and
// the coach's line. Not disabled: REMOVED. A dimmed picker still asks a question, and the answer it
// wants ("which of these 35 pairs?") is one this build cannot honour for 34 of them
// (LANGUAGE-MATRIX.md). What replaces it is a sentence, because people should still be able to see
// which way the app translates — they just have nothing to decide.
const PAIR_LOCKED = !!(window.api && window.api.pairLock);
if (PAIR_LOCKED) {
  const bar = document.querySelector('.gs-langbar');
  const sub = bar && bar.previousElementSibling;   // the "Languages" caption above it
  if (bar) {
    bar.innerHTML = '<span class="gs-langfixed">English <b>→</b> ไทย</span>';
    bar.classList.add('gs-langbar--fixed');
  }
  if (sub && sub.classList.contains('gs-sub')) sub.removeAttribute('data-i18n');
  const coachLine = document.querySelector('.coach-lang');
  if (coachLine) coachLine.hidden = true;
}
[sourceLangSel, targetLangSel, uiLangSel, pillStyleSel]
  .filter((s) => s && s.isConnected)   // the pair pickers are gone in the locked edition
  .forEach((s) => (s.classList.contains('gs-step') ? enhanceStepper(s) : enhanceSelect(s)));

const resetBtn = document.getElementById('resetBtn');
const autoHideBtn = document.getElementById('autoHideBtn');
const followMonitorBtn = document.getElementById('followMonitorBtn');
const openAtLoginBtn = document.getElementById('openAtLoginBtn');
const aiCardsBtn = document.getElementById('aiCardsBtn');
const aiMixedReadBtn = document.getElementById('aiMixedReadBtn');
const hoverDwellSaveBtn = document.getElementById('hoverDwellSaveBtn');
const pillPreview = document.getElementById('pillPreview');
// 'visible' | 'dim' | 'ghost'. Faded is pure CSS (.pill.style-dim). Tucked is not a new hiding
// mechanism — it is the tuck() the dot has always done, just made the pill's RESTING state. The
// reveal-then-retreat behaviour a tucked pill already has (untuck({auto:true}) on a translation /
// status / snip, retuckAfterCard once you're done reading) is exactly what this style wants, so
// there is deliberately no second timer here. Note this is opt-in only: an auto-hiding pill was
// removed by request once already, and the default stays 'visible'. (jek, 2026-07-31)
let pillStyle = 'visible';
let ghostSettleTimer = null;
// True until the saved settings have been applied once. Tucked has to behave differently on that
// first pass — see applyPillStyle.
let pillStyleFirstApply = true;
// Tucked's promise is the heading it sits under: WHAT DISAPPEARS ON ITS OWN. It used to keep that
// promise on exactly one route — pill hidden, you snip, the card fades, the pill slides back — via
// the retuckAfterCard intent. Anything else that brought the pill out CANCELLED that intent on
// purpose (opening Settings, clicking the pill, typing, voice: see clearRetuck), and nothing ever
// re-armed it, so the pill stayed on screen until the app was restarted. Opening Settings to LOOK at
// the Tucked option was itself enough to break it, which is how jek found it.
//
// So the rule is now the plain reading of the label: idle for IDLE_MS with nothing to interrupt →
// tuck, no matter what put the pill on screen. This deliberately reverses the "no second timer here"
// note from 2026-07-31, whose reasoning held only while the card route was the sole way back.
// Blocked (and retried, never dropped) while a panel is open, the cursor is on the pill, a card is
// up, or a translation is running. (jek asked for this, 2026-08-05.)
// Reaching for the pill counts as using it. Hovering already holds the tuck off — measured: eight
// seconds of cursor-on-pill and it never fires — but the moment that actually stings is the one just
// BEFORE the cursor lands, when the countdown ends under a hand that is already on its way. A pill
// that vanishes as you reach for it reads as the app dodging you. So the guard starts at arm's
// length instead of at the edge of the element. (jek, 2026-08-05)
const TUCK_GRACE_PX = 72;
// Every surface we put on screen, not just the pill. The first version of this measured the pill
// alone, which quietly meant the CARD did not count: `hovering`/`overPill` are set from `.pill` only
// (see setHover), so a cursor resting on the translation card was, to this check, a cursor resting on
// the desktop. The moment the card timed out and closed, the pill was free to slide away from under
// a hand that had not moved. jek hit exactly that. (2026-08-06)
function cursorNearSurface() {
  if (lastCursorX == null) return false;
  for (const el of [pill, result, panel, document.querySelector('.caption-box'), coachEl]) {
    if (!el || el.hidden) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    const dx = Math.max(b.left - lastCursorX, 0, lastCursorX - b.right);
    const dy = Math.max(b.top - lastCursorY, 0, lastCursorY - b.bottom);
    if (Math.hypot(dx, dy) <= TUCK_GRACE_PX) return true;
  }
  return false;
}

// The one question all three tuck paths have to answer the same way: is the person still here?
// They used to answer it differently — the settle timer checked five things, the two retuck timers
// checked `hovering` alone, and `hovering` is set from `.pill` only (see setHover). So a cursor
// resting on the translation card was, to the retuck path, a cursor resting on nothing, and the pill
// slid out from under it the moment the card timed out. (jek, 2026-08-06)
// How long after the cursor last touched one of our surfaces we still treat the person as present.
// Position alone is not enough: when a card times out, the surface the cursor was resting on stops
// existing in the same frame, and every position test goes false at once even though nobody moved.
// Attention does not leave that fast, so engagement is remembered for a moment after the thing being
// looked at is gone. Long enough to cover a card fading out; short enough that a cursor genuinely
// abandoned nearby still lets the pill go.
const ENGAGED_MEMORY_MS = 2500;
let lastEngagedAt = 0;
// WHERE the surface was, not just when. A card times out and stops existing in the same frame; the
// cursor is then over .wrap, our own full-screen transparent container, which cannot count as
// engagement (it covers the whole display — nothing would ever tuck). Measured at the moment of the
// bug: cardHidden true, element under the cursor "wrap", every position test false, hand not moved.
// So the rect a surface occupied is remembered and keeps counting while the cursor is still inside
// it: parked where you were reading IS still being here. Cleared once the cursor leaves it.
let lastSurfaceRect = null;

function inRememberedSurface() {
  if (!lastSurfaceRect || lastCursorX == null) return false;
  const r = lastSurfaceRect;
  const dx = Math.max(r.left - lastCursorX, 0, lastCursorX - r.right);
  const dy = Math.max(r.top - lastCursorY, 0, lastCursorY - r.bottom);
  if (Math.hypot(dx, dy) <= TUCK_GRACE_PX) return true;
  lastSurfaceRect = null; // genuinely walked away — stop remembering
  return false;
}

function userIsHere() {
  if (panelMode || overPill || hovering || interactive || translating) return true;
  if (cursorNearSurface() || inRememberedSurface()) return true;
  return Date.now() - lastEngagedAt < ENGAGED_MEMORY_MS;
}

// Two styles tuck ('ghost', 'ghostdim') and two fade ('dim', 'ghostdim'), so neither behaviour can be
// asked with `pillStyle === x` any more. Every test goes through these — a bare comparison added later
// would answer wrong for the combined style and only for the combined style, which is the kind of bug
// that gets found by a user rather than by us.
// 'behind' RETREATS like the tucked styles do — same triggers, same put-it-back intent — but what it
// does when it retreats is drop the overlay out of always-on-top so any window can cover it, instead
// of sliding to the edge. It is in tucksItself() precisely so it inherits every reveal already wired
// up (a translation landing, a status worth reading, a snip starting) rather than growing a second
// set of call sites that would drift out of step with the first. What differs is only the ACTION, and
// that branch lives inside tuck()/untuck() where there is exactly one of it.
const tucksItself = () => pillStyle === 'ghost' || pillStyle === 'ghostdim' || pillStyle === 'behind';
const fadesItself = () => pillStyle === 'dim' || pillStyle === 'ghostdim';
// The pill does not MOVE for this style, so nothing here may touch the glide, the 26px tab, or the
// card/panel teardown that goes with them: being coverable is not the same as being hidden.
const sinksItself = () => pillStyle === 'behind';
// `tucked` means "in its retreated state". For every style but 'behind' that also means physically
// gone from the screen, and three places read it for the second meaning rather than the first: the
// pill's width, the snip's panel restore, and the tuck-offset re-derive. A sunk pill is still sitting
// there in full, so those must keep treating it as present — ask this, not the raw flag.
const hiddenAway = () => tucked && !sinksItself();

function armGhostSettle() {
  clearTimeout(ghostSettleTimer);
  if (!tucksItself()) return;
  // LOCKED NEVER TUCKS ITSELF. Not because tucked+locked is forbidden — it is a real thing to want,
  // "out of my way AND not clickable", and it is now reachable on purpose (see lockRetuck) — but
  // because exactly one thing may decide when a locked pill goes back into hiding, and that thing is
  // the lock, which holds the pill out first for as long as the unlock key needs to be read.
  //
  // The original rule here was absolute: tucked+locked "has no way out", written when the only way
  // back was clicking a pill that had become click-through (jek, 2026-08-09). Two exits have been
  // built since, and both work no matter what the pill is doing: ⌘⇧L is a GLOBAL shortcut, and the
  // tray's "Show Gloss" unlocks and unhides in one go (onReveal). The trap the rule guarded against
  // is gone; the timing problem it also happened to solve is what this line is for now.
  if (locked) return;
  ghostSettleTimer = setTimeout(function settle() {
    if (!tucksItself() || tucked || locked) return; // locked while this was pending — see above
    // `interactive` is the one that covers the card, the panel, the caption box and the coach —
    // overPill/hovering are pill-only. Without it the guard had a hole the size of the card.
    if (userIsHere() || !result.hidden) {
      ghostSettleTimer = setTimeout(settle, IDLE_MS);
      return;
    }
    tuck();
  }, IDLE_MS);
}

function applyPillStyle() {
  pill.classList.toggle('style-dim', fadesItself());
  // Tucked + Faded needs to be tellable from plain Faded in CSS: it is the one style whose fade must
  // survive a translation arriving (see the wake list in styles.css). Faded on its own must NOT get
  // this — a pill that is always visible going quiet exactly when a card lands would hide the thing
  // that says the card is real.
  pill.classList.toggle('style-quiet', pillStyle === 'ghostdim');
  clearTimeout(ghostSettleTimer);
  if (tucksItself()) {
    // At LAUNCH, tucked means tucked: someone who chose this does not want to watch the pill sit
    // there for three seconds every single time the app starts before it gets out of the way. The
    // idle wait below exists to stop the pill vanishing from under your cursor the moment you pick
    // the option — at startup there is no cursor on it and nothing to protect, so skip it and hide
    // straight away. This is what makes "hidden" an actual default rather than something you press
    // every time (jek, 2026-08-02).
    if (pillStyleFirstApply) { tuck(); return; }
    armGhostSettle();
  } else if (tucked) {
    // Always raise the window first. untuck() decides what to undo from the style that is CURRENT,
    // and by the time this runs pillStyle is already the NEW one — so leaving 'behind' would take the
    // CSS path and never lift the overlay back out of the normal stack, stranding it under every
    // window for the rest of the session with no setting left that admits to having put it there.
    // Unconditional because raising a window that is already raised costs nothing and cannot be
    // wrong, while getting the condition wrong here is unrecoverable from the UI.
    window.api.sinkPill(false);
    untuck(); // leaving Tucked must always bring the pill back — never leave it hidden
  }
}
const advBtn = document.getElementById('advBtn');
const keyRow = document.getElementById('keyRow');
const brandEl = document.querySelector('.brand');
const brandSrcEl = document.getElementById('brandSrc');
const brandTgtEl = document.getElementById('brandTgt');
const brandArrowEl = document.getElementById('brandArrow');
// The PRO tag rides above the ARROW. Its x cannot be a constant: the arrow's position depends on how
// wide the two language tags are, and those change (EN→TH vs 中文→ไทย). Measured after every repaint
// of the pair, which is the only time it can move.
function positionProTag() {
  const tag = document.getElementById('proTag');
  if (!tag || !brandArrowEl) return;
  tag.style.left = `${brandArrowEl.offsetLeft + brandArrowEl.offsetWidth / 2}px`;
}
const proTag = document.getElementById('proTag');
const result = document.getElementById('result');
const coachEl = document.getElementById('coach');  // first-run card; tuck() and untuck() both touch it
const coachLangSel = document.getElementById('coachLang');
let coachPending = false;                          // tucked away before it was read — restore on untuck
const rTh = document.getElementById('rTh');
const rSenses = document.getElementById('rSenses'); // the other word classes — see index.html
const rEn = document.getElementById('rEn');
const rRead = document.getElementById('rRead'); // how the source line reads — Settings › showReading
const rFix = document.getElementById('rFix');   // how the source line is SPELLED, when it wasn't
const rMeta = document.getElementById('rMeta');
const rPos = document.getElementById('rPos');
const rMeaning = document.getElementById('rMeaning');
const rForms = document.getElementById('rForms');
const rEx = document.getElementById('rEx');
const rExEn = document.getElementById('rExEn');
const rExTh = document.getElementById('rExTh');

let HOLD_MS = 0; // how long the result stays before the pill collapses — adjustable in Settings (holdSec). 0 = stays until closed

let hovering = false;
let panelMode = null; // which panel view is open: 'history' | 'settings' | null
// A snip session is OPEN (armed/dragging) — from ⌘⇧S, the ⧉ button or the ⌃⌥ hold. Everything of
// ours except the bare pill goes away for it: the panel and the pill's wide button row sit UNDER the
// full-screen overlay (unreachable — that's why the inline type field exists), they compete with the
// overlay's own instruction, and anything of ours inside the dragged box gets OCR'd along with the
// game. Cleared on release, before the read finishes, so `translating` widens the pill straight back
// for the status. Declared up here (not with `translating` below) because refreshXlate reads it and
// runs during load, well before that block — a `let` down there would be in its TDZ.
let sniping = false;
let showEnglish = true;
// "What the answer carries", mirrored from settings (DEFAULT_SETTINGS in main.js). ONE question asked
// once in Settings, honoured by every surface that answers it: the card and the Type bar's quick look
// read these, and the Alt+G bubble gets the same four inside each word payload. Each surface honours
// the ones it HAS data for — see the note at each use site for which.
let showPos = true;        // the word-class chip (N. / V. / Adj.)
let showEnMeaning = true;  // keep the dictionary's English answer beside the reader's own language
let showReading = false;   // how the source text reads
let showSenses = true;     // the other meanings beside the first (silent when there is only one)
let autoHidePanel = false; // ON = the History/Settings panel auto-closes after the cursor leaves it
let slideSpeed = 38; // px/sec for EVERY marquee (vocab + status/hint), set in Settings (lower = slower)
let hintIsStatus = false; // a transient status (Reading…/error/low-quality) is up → hide the parked
                          // vocab so the pill never slides two different texts at once
let holdTimer = null;
// Auto-hide time scaled by how much there is to READ: a long sentence needs longer than a single word.
// HOLD_MS (the Settings holdSec) is the floor; add ~350ms per reading-unit past the first few, capped at
// 3× the base so it never lingers absurdly. Measures the source words (space-delimited) but also the raw
// character count so no-space scripts (JP/CN/TH) still scale. HOLD_MS 0 = auto-hide off → return 0 so the
// timer is never armed and the card stays until closed (jek 2026-07-26).
function holdMsFor() {
  if (!HOLD_MS) return 0;
  const src = (rEn.textContent || '').trim();
  const th = (rTh.textContent || '').trim();
  const spaceWords = src.split(/\s+/).filter(Boolean).length;
  const units = Math.max(spaceWords, Math.round(([...src].length + [...th].length) / 8));
  const extra = Math.max(0, units - 3) * 350;
  return Math.min(HOLD_MS + extra, HOLD_MS * 3);
}
// The SOURCE word of the last translation — what the pill parks after the card fades. Deliberately
// not the translation: by the time the card has gone you've already read the meaning, so repeating
// it says nothing. The original word is a free recall rep instead, and the slot is already tappable
// to bring the card (the answer) back — the flashcard loop existed, it was just pointing backwards.
let lastWord = '';
let lastPayload = null; // full last translation, to re-open the card on click
// What the card is CURRENTLY showing, which is not the same thing: tap a History row and the card is
// about that row while lastPayload is still the last live translation. Only renderSettings uses it, to
// redraw the card in place when a content switch changes what it may say.
let shownPayload = null;
let brandDir = 'EN → TH'; // the language-direction label (e.g. "JA → TH"), from settings
// Declared HERE, not beside the handler that uses it: renderSettings writes it, and renderSettings can
// run from the first settings fetch before a `let` further down the file has been initialised — which
// is a ReferenceError, not a stale value.
let srcLangNow = 'eng';
let tgtLangNow = 'th';
// The unlock key holds the slot for this long after you lock, then hands it back to the parked word.
// Locking is the moment you need to be told the key; ten seconds later you are playing, and the
// padlock badge beside the dot carries the state from there (jek, 2026-08-09 — asked why the word
// stopped showing, which it had, because the key had taken the slot for the whole session).
// If you do forget it: the tray menu unlocks without any key at all.
const LOCK_HINT_HOLD_MS = 10000;
let lockOwnsSlot = false;   // the key is currently sitting in the right-hand slot
let lockHintTimer = null;
// Was the pill hidden away when you locked it? Locking always brings it out for LOCK_HINT_HOLD_MS,
// because the key that gets you back out is the one thing a locked overlay must never hide — but
// "get out of my way" and "stop reacting to my mouse" are two wishes, not one, and honouring the
// second by cancelling the first was the app arguing with a choice you had already made. So the
// hint is a LOAN: it takes the pill out, teaches the key, and puts it back exactly where it was.
let lockRetuck = false;
let pillShowingXlate = false; // the right slot parks the last translation (post-card) once true
let pillKeyword = true;       // setting: may that parked word show at all (Settings > Display)
let rightShowingVocab = false; // true when the right slot currently holds that parked vocab, not the hint
// How long a translation that FITS the slot stays before the slot goes back to the shortcut hint.
// Not a number any more — the SAME clock the sliding case runs on (jek, 2026-08-12: "การโชว์คำที่ไม่
// สไลดิ้ง อยากให้มันขึ้นอยู่กับความยาวของสไลดิ้ง 2 รอบ ... มันจะได้ไม่ดูหมดเร็วเกินไป"). Overflowing text is
// timed by its two loops; text that fits is now held for what two loops of a FULL slot would cost:
//
//   hold = 2 · (cw + cw) / slideSpeed / 0.92  +  the one-off start delay
//
// tw = cw on purpose. A word that fits has no travel of its own, so the slot is the only width there
// is to measure, and measuring the word instead would put a 3-letter word back on a much shorter
// clock than a slider — the very gap this is here to close.
//
// Two things fall out of deriving it instead of hardcoding: the boundary is continuous (a word one
// pixel too wide to fit and one pixel too narrow leave at the same moment — the flat 12000 it
// replaces made the sliding case sit 5-7s LONGER, i.e. the short-vs-long inconsistency was still
// there, just smaller and pointing the other way), and Slide speed becomes the one knob for both:
// turning it down to read more comfortably no longer leaves static text on its old fast timer.
// `loops` is the caller's own maxLoops, NOT a constant 2: the slot's two tenants get different passes
// (see setHint — a translation slides 2×, a notification 1× and gets out of the way), and a hold
// derived from the sliding case has to inherit that split or a short status would sit there for a
// translation's worth of time purely because it happened to fit.
const MARQUEE_DELAY_MS = 450; // mirrors --marquee-delay in styles.css — change both together
function staticHoldMs(cw, loops) {
  const loopSec = Math.max(1, (cw + cw) / slideSpeed / 0.92); // same floor the slider's durSec has
  return Math.round(loopSec * Math.max(1, loops) * 1000) + MARQUEE_DELAY_MS;
}
// Small pause between the card fading out and the parked translation sliding into the slot — the word
// arriving the instant the bar vanished read as abrupt. Mirrors the off-screen breather the marquee
// takes before its second loop, so the first appearance has the same little beat (jek 2026-07-26).
const XLATE_PARK_DELAY_MS = 550;
let parkDelayTimer = null;
let keyLeaveTimer = null; // keyword's fade-out before a LONG word slides in (see hideResult)
// Would `text` overflow the hint slot (i.e. it will SLIDE) rather than fit (pop)? Measured by briefly
// swapping it into the slot and comparing widths, then restoring — same tick, so nothing repaints.
function slotOverflows(text) {
  const prev = hintTextEl.textContent;
  hintTextEl.textContent = String(text || '');
  const over = hintTextEl.scrollWidth - hintEl.clientWidth > 4;
  hintTextEl.textContent = prev;
  return over;
}
// Hand the right slot back to the hint. refreshXlate re-renders it as a fixed hint, which returns
// before touching the ticker, so this can't loop back into itself.
function clearParkedVocab() {
  if (!pillShowingXlate) return;
  pillShowingXlate = false;
  refreshXlate();
}
const spacerEl = document.getElementById('spacer');

// Slide `txt` inside `container` only if it overflows. Speed is CONSTANT (slideSpeed px/sec):
// duration scales with distance. Loop = enter right edge → exit left edge → next round enters
// immediately; both loop jumps happen off-screen. No holds, no pauses (jek's final spec).
// onDone (optional): called once this text has had its say — after two slides for text that
// overflows, or after staticHoldMs() — two loops' worth — for text that fits and just sits there. The parked translation
// passes it so the slot always ends up back on the shortcut hint; the hint and statuses don't.
// Tear the slot's ticker down to nothing: a deferred attempt, a running slide, the 2-loop watcher,
// the hand-off timers, the parked-freeze styles, and the one-frame visibility hide. Starting a new
// run needs this — and so does every path that replaces the slot's text WITHOUT starting one (the
// fixed ⌘⇧S hint returns early in refreshXlate). Skipping it there left a pending run to attach
// itself to text that had already been swapped out, and could leave visibility:hidden on, blanking
// the slot entirely.
function stopMarquee(txt) {
  if (txt._mqCancel) { txt._mqCancel(); txt._mqCancel = null; }
  if (txt._mqStopOff) { txt._mqStopOff(); txt._mqStopOff = null; } // drop the prior run's 2-loop watcher
  clearTimeout(txt._mqParkTimer);
  clearTimeout(txt._mqDoneTimer); // and the prior run's hand-off, or it lands on THIS ticker
  txt.classList.remove('marquee');
  txt.classList.remove('pop'); // drop the short-word pop-in too, so a switch to a slide/other text is clean
  txt._mqRunningText = null;
  txt.style.transition = '';
  txt.style.animation = '';   // cleared: the park below pins it with animation:none
  txt.style.transform = '';
  // Keep the text VISIBLE. Hiding it up front made SHORT text (which needs no ticker) invisible for
  // the whole resize wait, so it popped in late — the "lag" on short parked text. Only the marquee
  // path hides, and only for the single frame before the slide takes over.
  txt.style.visibility = '';
}
function marqueeIfOverflow(txt, container, onDone, maxLoops = 2) {
  // Cancel any in-flight attempt from a PRIOR call on this element. Overlapping calls (setHint +
  // refreshXlate + settle can all land in the same tick) each armed their own deferred attempt and
  // ALL fired — re-creating the marquee several times = a visible blink and a restarted, mis-counted
  // loop ("shows more than 2 times then blinks"). Only the latest call now proceeds.
  // This exact text already had its two loops — it's on its way out. Every width settle / repaint
  // re-enters here, and rebuilding the ticker would start it sliding again (and re-arm a 2-loop
  // watcher that fires later). Text that CHANGED doesn't match, so a new word still gets its own run
  // — refreshXlate clears the mark the moment the slot's text actually changes, so the SAME word
  // coming back later (translated twice in a session) is a fresh run and not a permanent freeze.
  if (txt.textContent && txt._mqParkedText === txt.textContent) return;
  // Already sliding THIS exact text — leave it alone. A restart is never harmless: it re-enters from
  // the right edge and zeroes the loop count, so every repaint bought the text another 2 passes.
  // Nothing about a repaint of unchanged text justifies interrupting a pass in flight. The mark is
  // set the moment a slide is COMMITTED (before the one-frame hide), not when the class lands, so
  // the frame in between — where settlePillWidth could see no .marquee and rebuild — is covered too.
  if (txt._mqRunningText && txt._mqRunningText === txt.textContent) return;
  stopMarquee(txt);
  txt._mqParkedText = null;
  let cancelled = false;
  txt._mqCancel = () => { cancelled = true; };
  const attempt = () => {
    if (cancelled) return;
    // Measure immediately — no waiting for the resize to settle. The hint slot barely changes width
    // between the pill's collapsed/open states (~5px: the buttons absorb the pill's growth), so a
    // mid-transition measurement is fine. Deferring made long parked text sit STATIC & FULL during the
    // collapse, then jump into a slide ("show full then lag"). Now the marquee attaches right away; the
    // CSS pauses it while .resizing so it just holds OFF-screen and slides in the instant width settles.
    let cw = container.clientWidth; // re-taken at each off-screen loop boundary — the slot resizes
    const tw = txt.scrollWidth;
    if (tw - cw <= 4) { // fits — visible, static, on the RIGHT
      txt._mqCancel = null;
      // Too short to slide, but still give it an entrance: pop it in with the keyword's scale+fade
      // instead of blinking in static. Guarded so it plays once per fresh word, not on every repaint
      // (a settings toggle / forced refresh must not re-pop a word that's just sitting there).
      if (txt._mqPoppedText !== txt.textContent) {
        txt._mqPoppedText = txt.textContent;
        txt.classList.remove('pop');
        void txt.offsetWidth; // restart the animation for a genuinely new word
        txt.classList.add('pop');
      }
      // Short words never slide, so there's no loop count to end them. Time them out instead, or a
      // one-word translation would sit in the slot for the rest of the session while a long one
      // cleared itself after two passes — the same slot behaving two different ways.
      // Same rule the sliding path follows: a TUCKED pill is off-screen, so the hold hasn't been
      // spent — hold the hand-off rather than clearing a word that was never actually shown.
      if (onDone) txt._mqDoneTimer = setTimeout(function hold() {
        if (cancelled) return;
        if (pill.classList.contains('tucked')) { txt._mqDoneTimer = setTimeout(hold, 1000); return; }
        onDone();
      }, staticHoldMs(cw, maxLoops));
      return;
    }
    // Head in at the slot's right edge, tail out the left. The visible travel is cw + tw at a CONSTANT
    // slideSpeed px/sec; /0.92 pays for the 8% off-screen breather in hintMarquee without slowing the
    // slide itself down. The 8%/0.92 pair must match the keyframes — change one, change the other.
    let durSec = Math.max(1, (cw + tw) / slideSpeed / 0.92);
    txt.style.setProperty('--tick-start', cw + 'px');
    txt.style.setProperty('--tick-end', -tw + 'px');
    txt.style.setProperty('--marquee-dur', durSec.toFixed(2) + 's');
    txt._mqRunningText = txt.textContent; // committed to sliding this text — repaints must not restart it
    // Start the slide while the text is still HIDDEN, then reveal it a frame later — once the animation
    // has already carried it OFF-SCREEN to --tick-start. The first VISIBLE frame is then an empty slot
    // with the head sliding IN, instead of the text flashing at its static natural position for a frame
    // and only THEN starting to slide (jek: "you warp the initial part, then start sliding", 2026-07-26).
    txt.style.visibility = 'hidden';
    txt.classList.add('marquee');
    requestAnimationFrame(() => {
      if (cancelled) return;
      txt.style.visibility = '';
      // Slide TWICE and then it's done — same rule the status text follows (see waitForLoopsThenRun).
      // An endlessly looping vocab was distracting mid-game.
      //
      // It used to glide back in and park in the slot for good. It now just goes: animationiteration
      // fires at the END of a cycle with the text already off-screen LEFT, so handing over there IS
      // the exit — no extra pass, nothing to animate out. onDone then hands the slot back to the
      // shortcut hint, which is where it sits at rest.
      let loops = 0;
      const finish = () => {
        txt.removeEventListener('animationiteration', onLoop);
        txt._mqStopOff = null;
        txt._mqRunningText = null; // not running any more — the spent mark below owns it from here
        clearTimeout(txt._mqParkTimer);
        txt._mqParkedText = txt.textContent; // this exact text is spent — don't re-run it on a resize
        // Leave it exactly where the slide left it: OFF-SCREEN past the left edge. The exit IS the
        // hand-off — the spec's "the loop jump is entirely off-screen, no visible warp" only holds if
        // spent text never reappears. Both previous versions broke that: dropping .marquee snapped it
        // back to text-align:right (the slot showed the TAIL, head cut off — jek's clipped chip), and
        // pinning translateX(0) popped the head back into view for as long as the slot went unclaimed.
        // Keep the class (its left-align is what the px math above assumes) and freeze the transform.
        txt.style.animation = 'none';
        txt.style.transform = 'translateX(' + (-tw) + 'px)';
        // Anyone waiting for this text to have its say (revertHintIfCurrent) listens for an
        // animationiteration that will never come again now that the animation is off. Tell them
        // directly instead — this is the single point where "it's had its say" becomes true.
        if (pendingLoopWait && pendingLoopWait.el === txt) {
          const w = pendingLoopWait;
          pendingLoopWait = null;
          w.fn();
        }
        if (onDone) onDone();
      };
      const onLoop = () => {
        if (++loops >= maxLoops) { finish(); return; }
        // The px math above is measured ONCE, but the slot resizes while the text is still running:
        // hovering opens the pill, a card lands, a panel opens. The ticker then keeps sliding to a
        // start/end that no longer match the slot — the head enters short of the edge and the pass
        // reads as drifting. Re-measure HERE, at the loop boundary, where the text is off-screen
        // left: correcting the geometry mid-pass would be the visible warp, correcting it here is
        // invisible — the spec's "the loop jump is entirely off-screen" rule, applied to resizes.
        const cw2 = container.clientWidth;
        if (Math.abs(cw2 - cw) > 1) {
          cw = cw2;
          durSec = Math.max(1, (cw2 + tw) / slideSpeed / 0.92); // same /0.92 breather as the first measure
          txt.style.setProperty('--tick-start', cw2 + 'px');
          txt.style.setProperty('--marquee-dur', durSec.toFixed(2) + 's');
          armLoopSafety(); // the run is longer/shorter now — re-size the backstop to match
        }
      };
      txt.addEventListener('animationiteration', onLoop);
      txt._mqStopOff = () => txt.removeEventListener('animationiteration', onLoop);
      txt._mqCancel = null;
      // animationiteration is the ONLY thing that ends a slide, and it can simply stop coming: a
      // tucked pill pauses the animation (CSS), and dropped animation events are a real browser
      // behaviour we already guard against elsewhere (see resizeSafety). Without this backstop the
      // parked word/status owned the slot for the rest of the session. While the pill is TUCKED the
      // ticker is legitimately frozen, not stalled, so re-arm instead of finishing — the text hasn't
      // been seen yet, and untucking resumes it from the same spot.
      const runMs = durSec * 1000 * maxLoops + 800;
      const armLoopSafety = () => {
        clearTimeout(txt._mqParkTimer);
        txt._mqParkTimer = setTimeout(() => {
          if (cancelled) return;
          if (pill.classList.contains('tucked')) { armLoopSafety(); return; }
          finish();
        }, runMs);
      };
      armLoopSafety();
    });
  };
  requestAnimationFrame(attempt);
}

// A width transition that gets interrupted mid-flight (rapid hover in/out) fires transitionCANCEL,
// not transitionend — without this the .resizing pause stuck on and froze every ticker until some
// later transition survived to completion. updateUI re-adds .resizing on the next real change.
pill.addEventListener('transitioncancel', (e) => {
  if (e.propertyName === 'width') settlePillWidth();
});



// ONE right-hand slot for everything sliding: a live status (set via setHint) wins first, then the
// parked translation (vocab, after the card fades), then the resting hint text in curHintRaw
// (⌘⇧S / the lock label) — never two of these at once. setHint always forces a repaint (it just
// changed what should show); everyone else lets this skip when nothing actually changed.
function refreshXlate(force) {
  // Never park the vocab while a status message occupies the slot — otherwise the two would fight
  // over the same spot (the "two things at once" bug this slot exists to prevent).
  // ...and never while LOCKED. The lock hint is a fixed hint, not a status, so it lost this test to a
  // parked word and the pill sat there in lock mode showing the last thing you translated — with the
  // key for getting out nowhere on screen, on a pill that cannot be clicked (jek, 2026-08-09: "ตอนนี้
  // มันอยู่ในโหมดล็อกอยู่ ทำไมมันไม่มีตัวล็อกไอคอนโชว์?"). Anything may outrank the parked word; the one
  // message that must outrank everything is the way out.
  // lockOwnsSlot is a TIMER — the key holds the slot for ten seconds after you lock and then hands it
  // back to the parked word, because ten seconds in you are playing and the word is what the slot is
  // for. Putting the cursor on a locked pill re-opens that question, so it re-opens the answer: while
  // the cursor is on it the key is back, whatever the timer decided. Leaving gives the word back.
  const showX = pillKeyword && pillShowingXlate && !!lastWord && !hintIsStatus
    && !lockOwnsSlot && !(locked && hovering);
  pill.classList.toggle('has-vocab', showX);
  const raw = showX ? lastWord : curHintRaw;
  const displayText = showX ? raw : KEYS(raw);
  if (!force && rightShowingVocab === showX && hintTextEl.textContent === displayText) return;
  rightShowingVocab = showX;
  // ONLY tear the ticker down when the text genuinely CHANGED. This used to drop .marquee on EVERY
  // repaint — and refreshXlate(true) repaints on things that have nothing to do with the slot's
  // content (a repeated status message, a settings toggle). Mid-slide that was the whole bug jek
  // hit: dropping the class killed the animation AND flipped :has(.marquee) left-align back to
  // right, so the text visibly WARPED sideways; marqueeIfOverflow then rebuilt it from the right
  // edge with the loop count reset to zero — so it ran a 3rd pass, and text that got repainted
  // often enough never reached its 2 loops at all, i.e. it never ended.
  // The "this exact text is spent" mark is void on a real change too, or the same word shown twice
  // in a session would hit the spent-guard and never slide again.
  if (hintTextEl.textContent !== displayText) {
    hintTextEl._mqParkedText = null;
    hintTextEl._mqPoppedText = null; // genuinely new text → let it pop/slide fresh (even the same word after a gap)
    stopMarquee(hintTextEl);
  }
  hintTextEl.textContent = displayText;
  // No native title here — it popped a SECOND label at the cursor (different spot from our chip).
  // A clipped vocab word still scrolls (marquee) so it stays readable.
  hintEl.style.cursor = showX ? 'pointer' : '';
  const fixed = !showX && isFixedHint(raw);
  hintEl.classList.toggle('fixed', fixed);
  // The slot just changed what it holds, and mid-snip that decides the pill's WIDTH (see `bare` in
  // updateUI). Nothing else re-runs updateUI on a slot change, so a status arriving during a snip
  // would otherwise land in a 220px pill and sit clipped.
  if (sniping) updateUI();
  // The right slot is shared (⌘⇧S / parked translation / status). Keep the hover label honest — the
  // "Shortcut to snip & translate" tip must only show when the slot is ACTUALLY the ⌘⇧S shortcut, not
  // when it's showing a parked word (jek: it was lying "shortcut" over the vocab) or a status.
  if (showX) hintEl.dataset.tip = 'Tap to see the translation again';
  else if (raw === SNIP_HINT) {
    // Follows the STYLE, not the shape of the key: a modifier-only trigger can be held, but if the
    // user picked "drag a box" it is still a tap, and telling them to hold it is telling them wrong.
    hintEl.dataset.tip = snipStyleNow() === 'hold'
      ? `Hold ${SNIP_HINT} and sweep over the text`
      : `Press ${SNIP_HINT}, then select the text`;
  }
  // The two words on the pill are the headline; the sentence lives here, where there is room for it
  // and where a player who wants to know more is already pointing.
  else if (blockedHint && raw === blockedHint) hintEl.dataset.tip = "Screen Recording is off — Gloss can't see the screen. Click the pill, then Open Settings.";
  else hintEl.removeAttribute('data-tip');
  refreshTip(); // the slot's tip just changed — re-render it even if the mouse is sitting still on it
  // ⌘⇧S never slides — but the text it just REPLACED may have been mid-slide, or one frame away from
  // starting one. This is the only exit that doesn't go through marqueeIfOverflow, so it has to do
  // that teardown itself or the old run keeps animating/hiding the new text.
  if (fixed) { stopMarquee(hintTextEl); return; }
  // The slot's two tenants get different passes, decided by jek 2026-07-24: a TRANSLATION (the parked
  // source word — something you may want to re-read, and the only content here) slides 2×; a
  // NOTIFICATION (status, suggestion, error — anything that isn't a translation) slides 1× and gets
  // out of the way. HEAD gave everything 2 passes; a notification repeating itself is noise mid-game.
  // Whoever owns the slot must take it BACK the moment its text is spent — the vocab hands over to
  // the hint, and a status now does the same instead of leaving the slot to the 5s revert timer. With
  // spent text frozen off-screen (see finish()), that gap read as an EMPTY slot; the timer in setHint
  // is now only the floor for a status short enough that it never slid at all.
  const onSpent = showX ? clearParkedVocab : (hintIsStatus ? () => revertHintIfCurrent(raw) : null);
  marqueeIfOverflow(hintTextEl, hintEl, onSpent, showX ? 2 : 1);
}

// The window is a fixed-size transparent canvas that never resizes — the pill,
// panel, and result just show/hide inside it via CSS. So "sizing" is only a
// matter of toggling classes; nothing talks to the OS about window bounds.
let pillWasWide = false;
let resizeSafety = null; // fallback timer: guarantees .resizing clears even if transitionend never fires
// The pill width settled (transition ended, was cancelled, OR the safety timer fired). Clear the
// resizing freeze and — crucially — start the ticker for text that was deferred while resizing.
// Without the safety net a stuck .resizing left long parked text statically CLIPPED (never marqueed).
function settlePillWidth() {
  clearTimeout(resizeSafety);
  pill.classList.remove('resizing');
  refreshTip();
  // Skip the re-measure only for the plain OPEN-at-rest slot (the fixed shortcut). A STATUS or a parked
  // vocab shown while open (e.g. toggling a setting with the panel up) still overflows the narrower
  // open slot and MUST re-measure here — otherwise the first mid-transition measurement wrongly decided
  // it "fit" and the text sat statically CLIPPED (jek: "Panel auto-hides" cut off).
  if (pill.classList.contains('open') && !pill.classList.contains('has-status') && !pill.classList.contains('has-vocab')) return;
  if (hintEl.classList.contains('fixed')) return;
  if (!hintTextEl.textContent || hintTextEl.classList.contains('marquee')) return;
  marqueeIfOverflow(hintTextEl, hintEl, rightShowingVocab ? clearParkedVocab : null, rightShowingVocab ? 2 : 1);
}
function updateUI() {
  // A card mid-fade STILL counts as open, so the pill stays wide until the bar has fully vanished and
  // only THEN หุบ — jek saw the pill collapse while the card was still fading (any updateUI during the
  // 160ms fade saw .closing and narrowed early). Pill waits for the bar to go, then narrows (2026-07-26).
  const cardOpen = !result.hidden;
  // Tucked pills never widen — only the 26px tab is on screen, so "open" (336px) would clip/misplace
  // against the --tuck-x math below, which assumes the collapsed (220px) width.
  // Stay wide while the MIC is listening: it streams live words through the hint slot and a collapsed
  // 220px pill would clip them into an unreadable marquee. A read in flight (translating, the "Reading…"
  // phase) does NOT widen anymore — the pill only กาง when the translation bar actually pops (cardOpen),
  // never for a transient status. "Reading…" is short and reads fine in the narrow pill (jek 2026-07-26).
  const busy = speaking;
  // Mid-snip the pill drops to its bare form: those buttons are click-through then anyway, and 336px
  // is 116px more of our own UI sitting over the box you're aiming.
  // ONLY when the slot has nothing to read, though. A status or a parked vocab is real text living
  // in that slot — squeezing it into 220px is how it ends up CLIPPED mid-sentence (jek's screenshot:
  // a tinted vocab chip cut off at both ends). The resting ⌘⇧S is .fixed/short and never clips, so
  // the common case still goes bare.
  const slotFull = pill.classList.contains('has-status') || pill.classList.contains('has-vocab');
  // ...but NOT while the cursor is still ON the pill (hovering). Going bare the instant you click snip
  // shrank the pill out from under the very cursor that clicked it, so elementFromPoint stopped hitting
  // the pill and it "unhovered itself". Keep it wide until the cursor genuinely leaves — then it goes
  // bare with nothing under it to yank (jek 2026-07-26).
  // ...and NOT while a translation card is up. A card means "here's a result to read", so the pill must
  // stay wide to match it — going bare mid-snip (sniping still true during live/⌃⌥ reads) collapsed the
  // pill even though the bar was showing (jek 2026-07-26).
  const bare = sniping && !slotFull && !hovering && !cardOpen;
  const wide = !hiddenAway() && !bare && (cardOpen || hovering || !!panelMode || busy);
  // While the width is ANIMATING, the ticker pauses so it rides the pill exactly like the static
  // EN→TH label does (two motions at once read as judder). It resumes from the SAME spot at
  // transitionend — never restarted. ~250ms, imperceptible as a freeze.
  if (pillWasWide !== wide) {
    pill.classList.add('resizing');
    // 320ms > the 250ms width transition — if transitionend/cancel never fires (it can get dropped
    // when updates land mid-transition), this still clears .resizing so the ticker isn't stuck.
    clearTimeout(resizeSafety);
    resizeSafety = setTimeout(settlePillWidth, 320);
  }
  pillWasWide = wide;
  pill.classList.toggle('open', wide);
  setPanelVisible(!!panelMode); // animated open/close instead of an instant display:none snap
  // Card + panel may coexist, but the panel SHRINKS (inner scroll) so the pair can't shove the
  // panel's top off-screen — see .panel.squeeze in the CSS.
  // Squeeze is decided in updateDropRoom (it's fit-aware: only squeeze when the full-size pair really
  // overflows the chosen side). updateUI must NOT set it too, or it would re-squeeze with room to
  // spare. Delegate so the two never disagree.
  updateDropRoom();
  // Only re-point the inner views while the panel is OPEN — during the close animation panelMode is
  // already null, and hiding them here would blank the panel a frame before it finishes fading out.
  if (panelMode) {
    // updateUI runs on every hover/resize too, so only act when the view GENUINELY changed —
    // re-running the swap on an unchanged view would restart its animation constantly.
    if (panelMode !== shownPanelView) {
      const from = shownPanelView ? panel.offsetHeight : 0; // pre-swap height (0 = panel is opening, not switching)
      const prevView = shownPanelView;
      shownPanelView = panelMode;
      historyView.hidden = panelMode !== 'history';
      settingsView.hidden = panelMode !== 'settings';
      if (prevView) swapPanelView(from, panelMode === 'history' ? historyView : settingsView);
    }
  } else {
    shownPanelView = null;
  }
  logBtn.classList.toggle('active', panelMode === 'history');
  settingsBtn.classList.toggle('active', panelMode === 'settings');
}

// History ↔ Settings hold different amounts of content, and the panel is content-sized — so swapping
// them resized it in ONE frame, which (bottom-docked, growing upward) threw the whole stack. Animate
// from the old height to the new one instead, and fade the incoming view in so the content change
// isn't a flash. The inline height is temporary: it's cleared the moment the slide ends, or the log
// growing by a row later would be stuck against a stale fixed height.
let shownPanelView = null; // which view the panel is CURRENTLY showing (null = panel closed)
let panelSwapTimer = null;
// The shrink slide holds an inline height on the panel and a fill:'both' transform on its view (see
// animatePanelHeight). Both have to come off in the SAME task — release the height first, then the
// transform, and the content is already where the transform was holding it. Kept module-level so a
// second tab switch mid-slide can end the first one instead of leaving the panel pinned at a height
// the list has since outgrown.
let panelShrink = null;
function endPanelShrink() {
  if (!panelShrink) return;
  const anims = panelShrink;
  panelShrink = null; // before cancel(): a cancel event must not re-enter this
  panel.style.height = '';
  anims.forEach((a) => { try { a.cancel(); } catch (e) { /* already gone */ } });
}
function swapPanelView(fromH, nextView) {
  nextView.classList.remove('enter');
  void nextView.offsetWidth; // restart the fade even on a fast back-and-forth between the two tabs
  nextView.classList.add('enter');
  animatePanelHeight(fromH, nextView);
}
// GT_DEBUG only. Watch the next 400ms of frames and report the worst gap, so "it lags" can be
// answered with a number instead of a guess: a clean 200ms slide is ~24 frames at ~16ms, and a
// blocking layout shows up as one long frame, not as many slightly-late ones. `sync` is the time the
// caller already spent before handing over — the work that happens BEFORE the first frame can paint
// is invisible to a frame counter and was the last cause of this exact complaint.
function probeFrames(label, syncStart) {
  const sync = performance.now() - syncStart;
  const start = performance.now();
  let last = start, worst = 0, frames = 0;
  const tick = () => {
    const now = performance.now();
    const gap = now - last;
    if (gap > worst) worst = gap;
    last = now;
    frames++;
    if (now - start < 400) requestAnimationFrame(tick);
    else console.log(`[perf] ${label}  sync=${sync.toFixed(1)}ms  frames=${frames}/400ms  worst=${worst.toFixed(1)}ms`);
  };
  requestAnimationFrame(tick);
}

// GT_DEBUG only. probeFrames says a frame took 152ms; this says WHERE it went. Chromium's
// long-animation-frame entries split a frame into script / style+layout / the rest (paint, raster,
// font work), and name the script that ran — the difference between "our JS is slow", "the layout is
// slow" and "the first raster of a page of Thai text is slow", which no amount of reading the code
// can settle. Anything under 50ms is a normal frame and stays quiet.
if (window.api.debug && window.PerformanceObserver) {
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration < 50) continue;
        const preRender = Math.round(e.renderStart ? e.renderStart - e.startTime : 0);
        const styleLayout = Math.round(e.styleAndLayoutStart ? (e.startTime + e.duration) - e.styleAndLayoutStart : 0);
        // blocking = how much of it was over the 50ms a frame is allowed; scripts= is printed even
        // when it is ZERO, because "no script ran" and "the printer had nothing to say" looked
        // identical in the old line — and that difference is the whole diagnosis when a 157ms frame
        // shows 5ms of style+layout. (2026-08-12: the Type→History switch janks on its FIRST run only,
        // 153.9ms worst frame vs 18ms on every run after, with no script attributed.)
        const bits = [`at=${Math.round(e.startTime)}`, `dur=${Math.round(e.duration)}ms`,
          `beforeRender=${preRender}ms`, `style+layout=${styleLayout}ms`,
          `blocking=${Math.round(e.blockingDuration || 0)}ms`, `scripts=${(e.scripts || []).length}`];
        if (e.firstUIEventTimestamp) bits.push(`sinceInput=${Math.round(e.startTime - e.firstUIEventTimestamp)}ms`);
        for (const s of e.scripts || []) {
          const src = String(s.sourceURL || '').split('/').pop();
          bits.push(`script[${s.invokerType || '?'} ${s.invoker || s.name || '?'}]=${Math.round(s.duration)}ms@${src}`);
        }
        console.log('[loaf] ' + bits.join('  '));
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (err) { console.log('[loaf] unavailable: ' + err.message); }
}

// Slide the panel from a height measured BEFORE the change to whatever it is now. Shared by the tab
// swap and the ⤢ expand — both resize the same box, and both looked like a jolt without it.
// Everything inside the panel that has to travel with the clip edge. The active view is the obvious
// half. The BANNER is the half that was missing: it is a SIBLING sitting above the views, so it kept
// its final position while the content under it glided — and being the topmost thing in the panel it
// is also exactly the strip the clip is uncovering (grow) or eating (shrink), so the one surface that
// most needed to move was the one standing still. (jek, 2026-08-20: "Animation ของตัวนี้ไม่ follow
// ... เวลาฉันเปิด history bar type bar มันกระตุกแปลกๆ".) Anything else that ever lands as a sibling of
// the views belongs in this list too — the views are not the panel, they are only most of it.
function panelRiders(fadeView) {
  const view = fadeView || (panelMode === 'settings' ? settingsView : historyView);
  return [view, permBanner].filter((el) => el && !el.hidden);
}

function animatePanelHeight(fromH, fadeView) {
  clearTimeout(panelSwapTimer);
  endPanelShrink(); // a shrink still running holds an inline height and a filled transform — drop both
  const t0 = performance.now();
  panel.style.height = ''; // measure the new natural height
  const toH = panel.offsetHeight;
  if (window.api.debug) { console.log(`[panel] switch at ${Math.round(t0)}`); probeFrames(`panel ${Math.round(fromH)}→${toH}px`, t0); }
  // Squeezed (a card is up) the panel is max-height capped, so both views land the same size and
  // there's nothing to animate. Sub-2px differences aren't worth a transition either.
  if (!fromH || !toH || Math.abs(toH - fromH) < 2) { if (fadeView) fadeView.classList.remove('enter'); return; }
  // The panel takes its new height in ONE frame and the growth is revealed with clip-path — the same
  // move the panel already makes when it opens (@keyframes panelMorph), which jek asked for by name:
  // "ขอ Animation แบบการยืดบาร์แบบตอน Setting ยืด" (2026-08-12).
  //
  // It replaces a 200ms `height` transition, and the swap is the fix, not a restyle. `height` is a
  // LAYOUT property: every frame of that slide relaid out the panel, the 269-row scroller inside it,
  // and .drop — a bottom-docked flex column that grows upward, so the whole stack repositioned each
  // time. clip-path touches paint only; nothing is measured or positioned again.
  //
  // Measured before the change (GT_DEBUG, Type→History, 170→329px): the first switch of a session hit
  // a 153.9ms frame and painted 15 frames per 400ms, against 18ms / 25 frames on the switches after
  // it — and the long-animation-frame records blamed neither our script (scripts=0) nor style+layout
  // (5ms), which is what a layout-thrash frame looks like from the outside.
  //
  // BOTH directions move. Grow reveals; shrink cannot (a clip only uncovers, and the taller view's
  // content is already out of the DOM by the time this runs) — so shrink pins the box back to the
  // height it just had and eats that strip instead. See the shrink branch. (jek, 2026-08-13: "การ
  // เปลี่ยนจากโหมด Type เป็นโหมด History มี Animation แต่พอกดโหมด Type เหมือนเดิมไม่มี".)
  const grew = Math.round(toH - fromH);
  // WHICH EDGE MOVES depends on the side the stack is on, and everything below was written for one
  // of them. Above the pill .drop is bottom-docked: growth pushes the TOP edge up, so the reveal
  // clips from the top and the content rides up into the strip. Hanging BELOW the pill (.wrap.flip)
  // the panel is top-anchored and grows DOWNWARD — the top edge does not move at all. Playing the
  // above-version there uncovers an edge that is not changing while the edge that IS changing snaps,
  // which is the "smooth on top, กระตุก underneath" jek reported (2026-09-08).
  const flipped = wrapEl.classList.contains('flip');
  if (grew > 1) {
    // Two animations, one motion. The clip alone was a CURTAIN: it uncovered rows that were already
    // sitting at their final position, so nothing on screen actually moved and jek read it as "ไม่
    // smooth เท่าเดิม" straight away — correctly, because the old height slide moved the panel's top
    // edge AND carried the tab row and the list up with it. This puts that travel back by starting the
    // content `grew` px low and letting it rise into the strip the clip is uncovering, which is the
    // same picture the height slide drew. transform and clip-path are both paint/composite work, so
    // the layout still happens exactly once.
    // Only when the top edge is the one travelling. Hanging below the pill nothing that is already
    // on screen moves — the box simply gets longer at the bottom — and lifting the content there
    // would invent a motion the layout is not making.
    if (!flipped) {
      for (const el of panelRiders(fadeView)) {
        el.animate([{ transform: `translateY(${grew}px)` }, { transform: 'none' }],
          { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }); // --t-base / --ease-mid, the slide's own timing
      }
    }
    // The from-state clips off exactly the strip that was just added, at the TOP: the panel is
    // bottom-docked, so growth pushes its top edge upward and that strip is the new part. The side and
    // bottom insets end at -28px for the same reason panelMorph's do — clip-path clips the border box
    // and the box-shadow is painted outside it, so stopping at 0 would hide the shadow for the whole
    // animation and hand it back in a single frame at the end.
    panel.animate(
      [{ clipPath: flipped
          ? `inset(-28px -28px ${grew}px -28px round 16px)`   // below the pill: the new strip is at the BOTTOM
          : `inset(${grew}px -28px -28px -28px round 16px)` },
       { clipPath: 'inset(-28px -28px -28px -28px round 16px)' }],
      // Web Animations, not a class: .panel already carries `animation: panelMorph`, and a class that
      // overrode animation-name would replay THAT entrance the moment the class came off again.
      //
      // IDENTICAL duration and easing to the content lift above, and that is a requirement rather than
      // tidiness: the two edges have to travel as one. Give them different curves and the reveal
      // separates from the content it is revealing, which is the seam the height slide never had.
      // (The clip runs on to -28px while the content stops at 0, so the reveal reaches the panel's real
      // top edge at ~85% and the last of the travel is the content settling into an already-open box —
      // negative insets clip outside the border box, so nothing empty is ever shown.)
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }); // --t-base / --ease-mid, as the slide had
  } else if (grew < -1) {
    // SHRINK — the same motion played the other way. It cannot be a reveal: the tall view's rows are
    // gone from the DOM before this runs, so there is nothing behind the strip to uncover. Instead the
    // box is PINNED at the height it already has (no new layout — that is the height it was laid out
    // at a moment ago), the incoming view starts where the old top edge was and rides DOWN, and the
    // clip eats the strip above it as it travels. The pin and the transform come off together in one
    // task at the end, so the content is released exactly where the animation left it — nothing snaps.
    //
    // The cost of holding a taller box for 200ms is one strip of the panel's own background below the
    // content, closing to zero — and that strip is under the Type page's tip line, i.e. plain --bg
    // against plain --bg. Every alternative was worse: a `height` transition is the layout thrash this
    // function was rewritten to escape, and a transform on .panel would fight the flip layout's
    // translateX(-50%) centring (the same trap .closing documents).
    const shrank = -grew;
    panel.style.height = fromH + 'px';
    panelShrink = [];
    // Same rule as the grow: the content only travels when the edge it is anchored to is the one
    // being taken away, which below the pill it is not.
    if (!flipped) {
      for (const el of panelRiders(fadeView)) {
        panelShrink.push(el.animate([{ transform: 'none' }, { transform: `translateY(${shrank}px)` }],
          { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' }));
      }
    }
    // Identical duration/easing to the lift above, for the reason spelled out there: the clip edge and
    // the content it carries have to travel as one. Sides and bottom stay at -28px so the shadow keeps
    // painting; the TOP starts at 0 because that edge is the one being taken away.
    const clip = panel.animate(
      flipped
        ? [{ clipPath: 'inset(-28px -28px 0px -28px round 16px)' },
           { clipPath: `inset(-28px -28px ${shrank}px -28px round 16px)` }]   // eat the strip at the BOTTOM
        : [{ clipPath: 'inset(0px -28px -28px -28px round 16px)' },
           { clipPath: `inset(${shrank}px -28px -28px -28px round 16px)` }],
      { duration: 200, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'both' });
    panelShrink.push(clip);
    clip.onfinish = endPanelShrink;
  }
  panelSwapTimer = setTimeout(() => {
    if (fadeView) fadeView.classList.remove('enter');
  }, 280);
}

// Show/hide the panel with a real exit animation. display:none can't be transitioned, so the close
// plays a fade-out (.closing) first and only sets [hidden] once it's done.
let panelCloseTimer = null;
// FLIP. .drop is a flex column that grows upward from the pill, so un-hiding the panel inserts a
// whole surface UNDER whatever is already in the stack and shoves it up by that height in a single
// frame — a reflow cannot be transitioned. jek saw the first-run card teleport above Settings.
// Measure where things were, let the layout change, then animate the difference away from the
// position they used to hold. Web Animations rather than inline styles on purpose: an inline
// `transition` would outrank the class rule that fades these surfaces out on a tuck, and would then
// have to be cleaned up afterwards.
function dropFlip(mutate) {
  // The card is excluded in SPLIT layout for two reasons, either of which is enough: there it is
  // position:absolute, so the panel never shoves it in the first place, and it carries a static
  // translateX(-50%) for centring — animating transform to `none` would fling it half its own width
  // to the right for the length of the animation.
  const split = wrapEl.classList.contains('split');
  const movers = [coachEl, split ? null : result].filter((el) => el && !el.hidden);
  const before = movers.map((el) => el.getBoundingClientRect().top);
  mutate();
  movers.forEach((el, i) => {
    const dy = before[i] - el.getBoundingClientRect().top;
    if (!dy) return;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }],
      { duration: 280, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  });
}

function setPanelVisible(show) {
  if (show) {
    clearTimeout(panelCloseTimer);
    panel.classList.remove('closing');
    dropFlip(() => { panel.hidden = false; }); // cardIn entrance plays via CSS
    // AFTER the entrance, not during it. A sample is ~300ms of screen-capture session setup in main
    // and lands as a fresh background image on a surface that is mid-transition — measured as a
    // single 62-140ms frame every time the panel opens, which is the stutter the animations were
    // being blamed for. Stubbing the sample out left nothing above 18ms. 360ms clears the 200ms
    // slide with room to spare; the scene behind a panel that just opened has not moved anyway, so
    // nothing is lost by looking a third of a second later.
    scheduleGlass(360); // a 344px panel just appeared — see the note in showResult
  } else {
    if (panel.hidden || panel.classList.contains('closing')) return; // already gone / already closing
    panel.classList.add('closing');
    clearTimeout(panelCloseTimer);
    panelCloseTimer = setTimeout(() => {
      // The stack only closes up once `hidden` lands — the fade leaves the panel IN the flow — so the
      // reverse shove happens here, not when .closing was added.
      dropFlip(() => { panel.hidden = true; });
      panel.classList.remove('closing');
    }, 220); // panelOut is --t-base (0.2s); the extra 20ms is slack so `hidden` never lands mid-fade
  }
}

// A running ticker is NEVER touched by hover/open/collapse — zero restarts, zero "lag" (jek).
// The only job here: text that was SET while the pill was wide measured against the wrong width
// and wrongly decided it "fits" — start its ticker once the pill is back at the resting width.
pill.addEventListener('transitionend', (e) => {
  if (e.propertyName === 'width') settlePillWidth();
});


// Long sentences: shrink the big Thai line (and the English under it, in proportion) until the card
// fits its own height cap WITHOUT a scrollbar — short cards stay big and punchy, long ones step down to
// stay readable in one glance mid-game. Only when even the floor (12px) still overflows does it scroll
// (overflow-y:auto already handles that). Reset to base each card so a short one after a long one grows
// back (jek 2026-07-26).
function fitCard() {
  const BASE = 17, FLOOR = 12;
  rTh.style.fontSize = ''; // back to the CSS base before measuring
  rEn.style.fontSize = '';
  if (result.scrollHeight <= result.clientHeight) return; // fits at full size — nothing to do
  let size = BASE;
  while (size > FLOOR && result.scrollHeight > result.clientHeight) {
    size -= 1;
    rTh.style.fontSize = size + 'px';
    rEn.style.fontSize = Math.max(10, Math.round(size * 12 / BASE)) + 'px';
  }
}

// Set when a translation un-hid the pill by itself; cleared the moment the user does anything with the
// pill, because then staying out is their call, not a leftover from the snip.
let retuckAfterCard = false, retuckTimer = null;
// A card ENTERING while a panel is open makes the stack grow upward, which moved the panel by the
// card's whole height in one frame — the jolt jek reported when opening the card from History. The
// close direction already glided (hideResult's collapse path); this is the same glide on the way in.
let dropGlideTimer = null;
function clearRetuck() { retuckAfterCard = false; clearTimeout(retuckTimer); }

// "…which is spelled like this." Absent unless main.js found a real correction, so there is no
// threshold here and nothing to switch off: a card that read the word right shows no extra line at
// all. Built as SPANS from plain tokens — Google's block arrives as markup and main.js strips it to
// text precisely so nothing from the network is ever handed to innerHTML on a window that sits over
// the game. `parts` marks the words that changed (a sentence usually has one or two); an empty parts
// list means "print the whole line", which is what the AI path and any future format change give.
// …and the line is a BUTTON: tapping it translates THAT spelling instead, and leaves a ↩ line offering
// the words that were actually read, so the swap goes both ways for as long as the card is up (jek,
// 2026-08-13: "กดที่คำแปลใหม่ … แต่ก็มีกฎที่เดิมสามารถย้อนกลับได้"). Both directions are the same
// journey — see card:respell in main.js, which swaps the history row in place rather than filing the
// read twice.
// The cards already built are kept so going back and forth costs nothing after the first crossing. It
// holds versions of ONE line, and a line has two spellings at most in practice — the cap is only here
// so a long session cannot grow it without bound.
const respellCache = new Map();
function rememberSpelling(payload) {
  if (!payload || !payload.en || !payload.th) return;
  respellCache.delete(payload.en); // re-insert so the freshest version is also the youngest entry
  respellCache.set(payload.en, payload);
  while (respellCache.size > 8) respellCache.delete(respellCache.keys().next().value);
}

// The inline field itself, shared by every line that can be corrected. It replaces the element's
// content, hands back what was typed, and puts the old content back on Escape / clicking away — the
// three surfaces differ only in what they DO with the new text, so that is all they pass in.
// `onRestore` REBUILDS the host — it is not optional dressing. Putting the old innerHTML back looks
// right and is dead: every word in that line was a span with a click listener on it, and a string
// carries markup, not listeners. So after an edit the words came back looking faded (the classes the
// live spans paint themselves with were never re-applied) and clicking one no longer kept it
// (jek, 2026-08-15). Each caller re-renders the way it built the line in the first place.
function startLineEdit(host, current, onCommit, onRestore) {
  if (host.querySelector('.line-edit')) return;
  clearTimeout(holdTimer); // nothing closes under a caret
  host.textContent = '';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.className = 'line-edit';
  inp.value = current;
  inp.spellcheck = false;
  host.appendChild(inp);
  inp.focus();
  inp.select();
  let done = false;
  // Put the content back, then let the countdown run again — but only from here, so it can never be
  // re-armed while the field is still open.
  const restore = () => { if (done) return; done = true; onRestore(); armHoldTimer(); };
  inp.addEventListener('blur', restore);
  inp.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { restore(); return; }
    if (e.key !== 'Enter') return;
    const next = inp.value.trim();
    restore();
    if (next && next !== current) onCommit(next);
  });
}

// The same job on the other surface: a word already in the collection. One implementation of "fix the
// spelling and translate it again" would be nicer, but the two are genuinely different shapes — the
// card re-runs a whole translation and produces a new card, while this rewrites one row in place and
// must key the update by the word it USED to be. What they do share is the lookup: both end at the
// same translateWord, so a corrected row is built exactly like a freshly collected one.
let vocabEditing = false;
function startVocabEdit(v, enEl, thEl, entry) {
  if (vocabEditing) return;
  vocabEditing = true;
  const oldWord = getWord(v);
  startLineEdit(enEl, oldWord, async (next) => {
    vocabEditing = false;
    entry.classList.add('busy');
    // Looked up exactly as a NEW word would be — meaning, part of speech, senses and the dictionary's
    // definitions all come back together, so the row stops being a record of the typo rather than
    // having its text patched over.
    const res = await window.api.translateWord(next).catch(() => null);
    entry.classList.remove('busy');
    if (!res || !res.th) { setHint(res && res.error === 'offline' ? 'No internet' : 'Could not translate that'); return; }
    const patch = { word: next, meaning: res.th, pos: res.pos || '' };
    patch.senses = (Array.isArray(res.senses) && res.senses.length > 1) ? res.senses : undefined;
    patch.defs = (Array.isArray(res.defs) && res.defs.length) ? res.defs : undefined;
    savedVocab = await window.api.vocabUpdate({ word: oldWord, patch });
    renderSaved();
  }, () => renderSaved());
  vocabEditing = false; // the shared field owns it now
}

// ---- Correcting the source line yourself --------------------------------------------------------
// The ✎ row below can only offer what a spell-checker FOUND. Two whole classes of wrong line get
// nothing from it: an OCR misread nobody flagged, and a typo that happens to be a real word — jek's
// "แบน", which no checker on earth will question (2026-08-15). This is the way in for those: turn the
// source line into a field, fix it, Enter.
//
// It reuses respellTo, which is the same path the ✎ row takes — so a hand-typed correction gets the
// card, the history row, the ↩ way back and the cache the offered one gets. Nothing new downstream.
//
// DOUBLE-click, and no button anywhere: a single click on this line already means "keep this word"
// (fillSourceWords makes every word its own target), and the card carries four icons already. The
// gesture is the one the OS uses for "select this word to change it", which is exactly the intent.
let srcEditing = false;
function startSourceEdit() {
  if (srcEditing || !lastPayload || !lastPayload.en) return;
  srcEditing = true;
  const from = String(lastPayload.en);
  // Same field, same cancel rules as the other two surfaces. Only the commit differs: this one goes
  // through respellTo, which re-translates the line the card is showing and brings the ↩ way back.
  startLineEdit(rEn, from, (to) => respellTo(to, from),
    // Rebuilt exactly as showResult builds it, so every word is a live target again.
    () => { if (lastPayload) fillSourceWords(rEn, lastPayload.en, () => { paintFav(); if (panelMode === 'history') { histMode === 'saved' ? renderSaved() : renderHistory(); } }, undefined, srcOf(lastPayload)); });
  srcEditing = false; // the helper owns the field from here; nothing else may open a second one
}
rEn.addEventListener('dblclick', (e) => { e.stopPropagation(); startSourceEdit(); });
// No button here either — the gesture is the same one the ★ list and History use, and a card that
// grows an icon for it would be the fourth place this app taught a different way to do one thing.
rEn.title = 'Double-click to correct this line';

// `busy` guards the trip to main; without it a double-tap fires two translations of the same line and
// the second lands on a card that has already moved on.
let respellBusy = false;
async function respellTo(to, from) {
  if (respellBusy || !to || to === from) return;
  respellBusy = true;
  rFix.classList.add('busy');
  const use = respellCache.get(to) || null;
  const res = await window.api.respellCard({ to, from, use }).catch(() => null);
  respellBusy = false;
  // On success the new card arrives on translation:new and re-renders through the normal path, which
  // redraws this row from scratch. Only the failure path has anything to clean up.
  if (!res || !res.ok) {
    rFix.classList.remove('busy');
    setHint(res && res.error === 'offline' ? 'No internet' : 'Could not translate that spelling');
  }
}

// WHICH WORDS CHANGED, given the corrected line split into runs and the line it corrects.
//
// The row used to reprint the whole corrected line under the whole source line. Two 12px muted
// lines, the same length, differing in one word — jek read it as the same sentence shown twice and
// he was right (2026-08-19). The information the row actually carries is "this word, not that one";
// everything else in it was just read, one line up.
//
// spell.parts marks the changes on the CORRECTED line only — it has no idea what the words used to
// be. But its fix:false runs are by definition identical in both lines, so they work as anchors:
// walk them through the source line in order and whatever sits BETWEEN two anchors is what the run
// between them replaced.
//
// Returns null rather than guessing whenever the walk is not certain, and the caller then prints the
// full line exactly as before. The certainty test is not "did every anchor match" — a one-character
// anchor can match in the wrong place and still let the walk finish. It is the stronger one: rebuild
// the source line out of the pieces the walk claims it is made of, and require it back CHARACTER FOR
// CHARACTER. A wrong alignment cannot survive that.
function spellDiff(from, parts) {
  if (typeof from !== 'string' || !from || !Array.isArray(parts) || !parts.length) return null;
  const pairs = [];
  let rebuilt = '';   // the source line as the walk believes it is assembled
  let cursor = 0;      // how far into `from` the walk has got
  let pending = null;  // corrected text seen since the last anchor
  for (const part of parts) {
    if (part.fix) { pending = (pending === null ? '' : pending) + part.t; continue; }
    if (!part.t) continue;
    const at = from.indexOf(part.t, cursor);
    if (at < 0) return null;
    if (pending !== null) { pairs.push({ was: from.slice(cursor, at), now: pending }); pending = null; }
    else if (at > cursor) return null; // text in the source that no run accounts for
    rebuilt += from.slice(cursor, at) + part.t;
    cursor = at + part.t.length;
  }
  // Whatever is left of the source line after the last anchor. If a correction was still open it
  // owns that text; if not, the corrected line simply stopped early and the tail was DELETED — which
  // rebuilt-equals-from would happily wave through, because adding the tail back makes the strings
  // match. Naming it as a pair is what stops that, and a deletion then fails the empty-`now` test
  // below and falls back to the full line, where a missing word is at least visible.
  const tail = from.slice(cursor);
  if (pending !== null) pairs.push({ was: tail, now: pending });
  else if (tail) pairs.push({ was: tail, now: '' });
  rebuilt += tail;
  if (rebuilt !== from) return null;
  if (pairs.some((pair) => !pair.now.trim())) return null; // a deletion — "word → nothing" reads worse than the line
  const usable = pairs.filter((pair) => pair.was.trim() || pair.now.trim());
  if (!usable.length) return null;
  // Past a handful of changes the row stops being "this word, not that one" and becomes a list, at
  // which point the sentence is the easier read of the two.
  if (usable.length > 3) return null;
  // AND the line has to have KEPT something. If every word changed there is no shared text to anchor
  // against, so "the whole line → the whole line" is the very duplication this replaced, now with an
  // arrow in it. Measured by what is left after the swaps are taken out, ignoring whitespace: a line
  // that kept only its spaces kept nothing. (A length comparison was tried first and was wrong — it
  // rejected "Th3 → The · kn1ght → knight" for being more CHARACTERS than "The knight s@id", when the
  // point of the row is that it costs no HUNTING. Characters are not the thing being spent here.)
  const kept = usable.reduce((rest, pair) => rest.replace(pair.was, ''), from);
  if (!kept.trim()) return null;
  return usable;
}

function fillSpell(payload) {
  const spell = payload && payload.spell;
  // The ↩ way-back row is gone (jek, 2026-08-15). It existed because a correction used to be
  // something the app DID to your line and you might not have wanted it; now you type the correction
  // yourself, so "put it back" is one more double-click on a line you are looking at, not a row that
  // has to sit on every corrected card forever. `respelled` still rides on the payload — main sets
  // it and the respell cache reads it — this simply stops drawing a control for it.
  const back = ''; // was: payload && payload.respelled
  rFix.textContent = '';
  rFix.classList.remove('busy', 'rf-back', 'rf-diff');
  // Either row corrects/undoes the SOURCE line, so both hide with it.
  const fix = spell && spell.text ? spell.text : '';
  const ok = showEnglish && !!(fix || back);
  rFix.hidden = !ok;
  if (!ok) return;
  // A correction outranks a way back, and after a return trip the card carries BOTH (`respelled`
  // points at the spelling it came from, which for the misread IS its correction). Reading `spell`
  // first is what makes the row say ✎ again on the way in and ↩ only where there is nothing left to
  // correct — otherwise a card that had been swapped once wore the back arrow for good.
  const to = fix || back;
  const isBack = !fix;
  const from = payload.en;
  rFix.classList.toggle('rf-back', isBack);
  const pen = document.createElement('span');
  pen.className = 'rf-pen';
  // ✎ "spelled like this" going out, ↩ "this is what was read" coming back — the glyph alone says
  // which direction the tap goes, in every language, which is the whole reason this row has no label.
  pen.textContent = isBack ? '↩' : '✎';
  rFix.appendChild(pen);
  // Preferred shape: just the swaps — "ヤって → やって". Falls back to the full corrected line
  // whenever spellDiff cannot prove the alignment, or when so much changed that the swaps would be
  // the longer read of the two.
  const pairs = isBack ? null : spellDiff(from, spell.parts);
  if (pairs) {
    rFix.classList.add('rf-diff');
    pairs.forEach((pair, i) => {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'rf-sep';
        sep.textContent = '·';
        rFix.appendChild(sep);
      }
      const was = document.createElement('span');
      was.className = 'rf-was';
      was.textContent = pair.was.trim();
      const arrow = document.createElement('span');
      arrow.className = 'rf-arrow';
      arrow.textContent = '→';
      const now = document.createElement('span');
      now.className = 'rf-w';
      now.textContent = pair.now.trim();
      rFix.appendChild(was);
      rFix.appendChild(arrow);
      rFix.appendChild(now);
    });
  } else {
    const parts = !isBack && Array.isArray(spell.parts) && spell.parts.length ? spell.parts : [{ t: to, fix: false }];
    for (const p of parts) {
      const s = document.createElement('span');
      if (p.fix) s.className = 'rf-w';
      s.textContent = p.t;
      rFix.appendChild(s);
    }
  }
  rFix.title = window.i18n.t(isBack ? 'tip.respellBack' : 'tip.respell');
  rFix.onclick = (e) => {
    e.stopPropagation();
    // The row stays selectable — the corrected spelling is the thing someone will want to copy. A
    // drag that ends inside it is that selection being made, not a tap asking for a translation.
    if (String(window.getSelection() || '').trim()) return;
    respellTo(to, from);
  };
}

// Past these lengths a card stops being a subtitle and starts being a page: shrink the type, lower the
// cap, and clamp the source line. Measured against the card's 332px width — ~220 chars of Thai is
// already 8+ lines at the normal size.
const LONG_TH = 180;
const LONG_EN = 160;

function showResult(payload) {
  hideWordBubble({ instant: true }); // a new reading — the previous card's bubble is not about this text
  translating = false; // the read finished; !result.hidden keeps the panel open from here
  // Swapping words on an OPEN card (tapping one history row after another) used to re-run the whole
  // entrance animation AND resize the box in a single frame — the jitter jek reported. Remember the
  // height we're coming from so the swap can be animated as a resize instead.
  const wasVisible = !result.hidden && !result.classList.contains('closing');
  const fromH = wasVisible ? result.offsetHeight : 0;
  // A new card cancels any in-flight collapse — and must undo the inline height/margin it left behind,
  // or the fresh card would open pinned at 0px.
  clearTimeout(resultCloseTimer); result.classList.remove('closing');
  clearTimeout(resultSwapTimer);
  clearTimeout(parkDelayTimer); // a card is showing — cancel any pending "park the word" from a prior close
  clearTimeout(keyLeaveTimer); hintTextEl.classList.remove('key-leave'); // and any in-flight keyword fade-out
  result.style.height = ''; result.style.marginBottom = ''; result.style.transition = '';
  untuck({ auto: true }); // sets the put-it-back-after intent itself when the pill was hidden // a translation just landed — bring the pill back on screen before showing it
  updateDropRoom(); // re-pick the side + height cap for the pill's CURRENT spot, so a tall card never clips
  bumpActivity(); // a translation just landed — wake the pill
  dismissCoach();  // they did it; the instruction has served its purpose
  // A card is a whole new surface appearing: the patch we photographed for the pill alone doesn't
  // cover it, so the new area sits on last sample's colours until this lands. No wait for the
  // entrance animation — cardIn only moves transform and opacity, so the card's LAYOUT is already
  // final on the frame it un-hides and there is nothing to settle. The 300ms this used to wait was
  // 300ms of the card wearing the wrong glass. (jek: the edges come up late, 2026-08-02.)
  scheduleGlass();
  const { en, th, pos, meaning, forms, example } = payload;
  shownPayload = payload; // what's on the card, for the in-place redraw in renderSettings
  rememberSpelling(payload); // so swapping back to this spelling later needs no second translation
  // ...but NOT one you opened out of your own ★ list (__vocab). "Seen" is the count of times a word
  // turned up in something you were reading, and it is what the ✓ known badge and graduation hang on
  // — browsing your collection would inflate it into meaning nothing.
  if (en && !payload.__vocab) bumpSeen(en);
  rTh.textContent = th;
  // Whose answer is this? A free read and a full card look identical once they are on screen, and
  // the ✦ button telling you it is 'done' is a control, not a label — jek asked for the reading
  // itself to carry the difference (2026-09-08). Same accent the ✦ wears when it is lit, so the two
  // are visibly one fact rather than two decorations.
  result.classList.toggle('ai-read', !!(payload.pronunciation || payload.meaning || payload.forms || payload.example));
  // Long reading → compact card, and the source line clamps to two lines behind a toggle.
  const long = String(th || '').length > LONG_TH || String(en || '').length > LONG_EN;
  result.classList.toggle('compact', long);
  rEn.classList.toggle('clamped', long);
  rEnMore.hidden = !long;
  rEnMore.textContent = long ? '⌄ show the whole line' : '';
  // The card's source line is a WORD PICKER too, exactly like a History row: every word is its own tap
  // target → tap to save it to Vocab (tap again to remove), no need to reopen it in History first (jek
  // 2026-07-26). Single-word / CJK lines fall back to plain text (fillSourceWords handles that).
  // paintFav: on a one-word card, tapping the word IS saving the card, and the header's ★ was the one
  // thing that didn't notice — it only ever repainted from its own click. With the word bubble gone
  // for that case (see soloWord in fillSourceWords), this star is the confirmation.
  fillSourceWords(rEn, en, () => { paintFav(); if (panelMode === 'history') { histMode === 'saved' ? renderSaved() : renderHistory(); } }, undefined, srcOf(payload));
  rEn.hidden = !showEnglish;
  fillSpell(payload);

  // How the source text READS, which the card has always fetched (CARD_SCHEMA.pronunciation — the ▶
  // button and the vocab row both use it) and never once put on screen. Settings › "Reading" is what
  // asks for it; off by default, because it is only ever noise to a reader who is not studying the
  // source language. Under the source line, in the target script, quieter than both.
  const reading = showReading ? String(payload.pronunciation || payload.reading || '').trim() : '';
  rRead.textContent = reading;
  rRead.hidden = !reading;

  // Only show a POS badge that actually LOOKS like a part-of-speech tag — short and lowercase, e.g.
  // "noun", "n.", "adj." (Google gives abbreviations, Claude full words). Blocks junk that could leak
  // into the field, e.g. an acronym capture like "JP." showing up as a POS (jek 2026-07-26).
  const rawPos = (pos || '').trim();
  // One leading capital is allowed (Claude writes "Noun", Google "noun"); a SECOND capital is what an
  // acronym capture looks like, so "JP." still fails and shows nothing.
  const posOk = /^[A-Za-z][a-z. ]{0,13}$/.test(rawPos);
  // Same chip as the hover bubble's, from shared/pos-badge.js — this used to be the raw tag in caps
  // inside a blue pill, so the word you snipped and the word you pointed at answered "what kind of
  // word is this" in two different visual languages (jek, 2026-08-12).
  rPos.textContent = '';
  // …and only when Settings asks for a word class at all (showPos, on by default) — the same switch
  // the Alt+G bubble and the Type bar's quick look read, so the chip is present or absent everywhere
  // together rather than per-surface.
  const posChip = posOk && showPos ? posBadgeEl(rawPos) : null;
  if (posChip) rPos.appendChild(posChip);
  rMeaning.textContent = meaning || '';
  rMeta.hidden = !(posChip || meaning);

  // The row that made snipping a word answer differently from typing it. Google's lookup returns up
  // to three word classes for a single word and this card has never drawn them, so "under" typed came
  // back Prep + Adj + Adv while "under" snipped came back Prep and nothing else. Same helper, same
  // switch, same chips as the Type bar. skipFirst because rPos directly above is the primary already.
  const senseExtra = showSenses && fillSenseChips(rSenses, payload.senses, undefined, !!posChip);
  if (!senseExtra) rSenses.textContent = '';
  rSenses.hidden = !senseExtra;

  // Only single words come back with forms, so this row simply stays hidden for phrases/sentences.
  rForms.textContent = forms || '';
  rForms.hidden = !forms;

  const hasEx = example && example.en && example.th;
  if (hasEx) { rExEn.textContent = example.en; rExTh.textContent = example.th; }
  rEx.hidden = !hasEx;

  // Entering from nothing: lay the card out invisibly, do every measurement, and
  // only then let the entrance animation play — see .result.premeasure.
  const entering = !wasVisible;
  const dropFromH = entering && panelMode ? dropEl.offsetHeight : 0;
  if (entering) {
    result.classList.add('premeasure');
    // Belt and braces, in the house style of resizeSafety/armLoopSafety: if
    // anything below throws before the class comes off, the card would stay
    // invisible for good rather than merely mis-styled. This guarantees it
    // becomes visible either way.
    clearTimeout(premeasureSafety);
    premeasureSafety = setTimeout(() => result.classList.remove('premeasure'), 250);
  }
  result.hidden = false;
  result.classList.remove('loading');
  paintFav(); // reflect whether this word is already saved (★ filled) or not (☆)
  fitCard(); // long sentence → shrink to fit the card height before we measure/animate it
  snipRestore = null; // a card is up — the snip gave a result to read, so don't bring the old panel back
  // While the card is up it already shows the translation — the slot stays empty until the card
  // fades (jek 2026-07-17: the instant-parking variant swapped the sliding text mid-slide on every
  // new snip, which read as "warp").
  pillShowingXlate = false;
  refreshXlate();
  if (wasVisible) {
    // Already on screen: glide from the old height to the new one and let the text cross over. No
    // entrance animation — replaying it on a card that never left is what made the swap flicker.
    const toH = result.offsetHeight;
    if (toH !== fromH) {
      result.style.height = fromH + 'px';
      void result.offsetWidth;
      result.style.transition = 'height var(--t-base) var(--ease-mid)'; // grows while you watch — see the panel note
      result.style.height = toH + 'px';
      resultSwapTimer = setTimeout(() => { result.style.height = ''; result.style.transition = ''; }, 240); // --t-base + slack
    }
  } else {
    // Coming from nothing — widen the pill and grow the card in the SAME frame (both 0.22s, no lead).
    // The pill only ever กาง because a card is arriving, never ahead of one, so there's never a wide-but-
    // empty pill open with nothing in it (jek 2026-07-26). .pill.arrive matches the card's 0.22s so the
    // widen and the grow finish together. Hand the width transition back once the glide lands.
    // Only widen if the pill is actually going to move. On a REOPEN (tap the
    // parked word / a history row) it is already wide, and .arrive there bought
    // nothing while costing a 320ms ticker pause and a relayout of the stack the
    // card is trying to animate inside (jek 2026-07-30).
    // .quiet-in: the pill is about to widen, so the card stays completely still and just fades — a
    // surface morphing inside a box that is itself still growing is two motions on one thing. Every
    // other path unrolls (cardRollIn), which reveals the card without moving its text. Set only inside
    // this `entering` branch: flipping animation-name on a card already on screen would restart the
    // entrance. See .result.quiet-in in styles.css.
    if (pill.classList.contains('open')) {
      result.classList.remove('quiet-in'); // pill is already wide: nothing else is moving, so the card unrolls
      updateUI();
    } else {
      result.classList.add('quiet-in');
      pill.classList.add('arrive');
      updateUI();
      void pill.offsetWidth;
      setTimeout(() => { pill.classList.remove('arrive'); settlePillWidth(); }, 240);
    }
    // The animation restart that used to sit here is gone: .premeasure now owns
    // the start, and restarting cardIn after fitCard/updateUI was exactly what
    // made the entrance begin a frame or two late.
  }
  updateUI();

  if (entering) {
    // Stack settled, fonts fitted, pill width decided — arm the entrance now,
    // against a box that will not move under it.
    //
    // A forced reflow, NOT requestAnimationFrame: this callback owns whether the card is VISIBLE, not
    // just whether it animates, so it must not be deferrable at all. (The window sets
    // backgroundThrottling:false now — main.js — but a frame callback is still the wrong tool for
    // something that must happen this turn.) Committing the layout synchronously is all the spec needs
    // for animation-name none→cardIn to count as a new animation.
    void result.offsetHeight;
    clearTimeout(premeasureSafety);
    result.classList.remove('premeasure');
    // Glide the stack from its card-less height to its new one, so the panel rides up with the card
    // instead of teleporting. Height, not transform: the drop is bottom-anchored, so animating height
    // moves only its top edge — and its own clip reveals the card as it grows.
    if (dropFromH) {
      const toH = dropEl.offsetHeight;
      if (toH !== dropFromH) {
        dropEl.style.height = dropFromH + 'px';
        void dropEl.offsetWidth;
        dropEl.style.transition = 'height var(--t-base) var(--ease-mid)'; // the whole stack resizing — same motion, same curve
        dropEl.style.height = toH + 'px';
        clearTimeout(dropGlideTimer);
        dropGlideTimer = setTimeout(() => { dropEl.style.height = ''; dropEl.style.transition = ''; }, 260);
      }
    }
  }

  clearTimeout(holdTimer);
  resultIsLive = !!payload.live;
  rCloseBtn.title = resultIsLive ? 'Mute live captions (CC button resumes)' : 'Close';
  // (Flipped docks used to close the panel here: card and panel were both absolutely anchored to the
  // same spot below the pill, so only one could exist. They now share the .drop stack and coexist —
  // closing the Type bar on every Enter was the "it vanishes and comes back" report.)
  // Only LIVE payloads skip the countdown (the next subtitle replaces them).
  if (HOLD_MS && !hovering && !resultIsLive && !editingLine()) holdTimer = setTimeout(hideResult, holdMsFor()); // HOLD_MS 0 = card stays until closed
}

// The card now auto-closes (holdSec), but it's also a SELECT/COPY surface (drag to highlight, tap a
// word to save vocab) — so freeze the countdown while the cursor is over it and only resume once the
// cursor leaves, or the card would fade mid-copy. `hovering` tracks the pill, not the card, so these
// are the card's own guard.
// Typing in the card is USING the card, and the countdown could not tell. The freeze below is keyed
// on the CURSOR being over the card — so correcting a line and then moving the mouse away (which is
// what a hand does while it types) restarted the clock and the card vanished mid-word, with the
// caret still in it (jek, 2026-08-15). An open field is a stronger "I am using this" than a hovering
// pointer, and it outranks it.
const editingLine = () => !!result.querySelector('.line-edit');
function armHoldTimer() {
  clearTimeout(holdTimer);
  if (HOLD_MS && !result.hidden && !resultIsLive && !editingLine()) holdTimer = setTimeout(hideResult, holdMsFor());
}
result.addEventListener('mouseenter', () => clearTimeout(holdTimer));
result.addEventListener('mouseleave', () => {
  if (HOLD_MS && !result.hidden && !resultIsLive && !editingLine()) holdTimer = setTimeout(hideResult, holdMsFor());
});

let premeasureSafety = null; // fallback that un-hides the card if the entrance hand-off is missed
let resultCloseTimer = null;
let resultSwapTimer = null; // height glide while one card's content is replaced by another's
function hideResult() {
  clearTimeout(holdTimer);
  // Restart the Tucked countdown from HERE. Every guard that protected the pill while a card was up
  // — the card itself, `interactive`, the cursor sitting within reach of the card — goes false in the
  // same frame the card disappears, and if the settle timer happened to be due right then, the pill
  // slid away from under a cursor that had not moved. Measured: cursor parked on the card, card timed
  // out at 8s, pill tucked in the same second (jek reported exactly this). Re-arming here gives the
  // full idle window from the moment the screen actually changed, which is the moment the user's
  // attention is freed — not from whenever the previous cycle happened to land.
  armGhostSettle();
  // The bubble belongs to this card's source line, so it goes with it — but it must go WITH it, not
  // half a second ahead of it. See hideWordBubble's note; resetWordBubble puts it back once the card
  // has actually finished closing.
  hideWordBubble({ withCard: true });
  // Snipping with the pill hidden un-hides it to show the card (see untuck() in showResult). Once the
  // card is gone the pill has no reason to stay out — hiding was "get out of my way", and the snip
  // was one errand, not a change of mind (jek, 2026-07-30). Skipped if a panel is open or the user
  // took the pill over in the meantime (see clearRetuck).
  if (retuckAfterCard && !panelMode) {
    retuckAfterCard = false;
    clearTimeout(retuckTimer);
    retuckTimer = setTimeout(() => { if (result.hidden && !userIsHere()) tuck(); }, 240); // after the fade
  }
  clearTimeout(premeasureSafety);
  result.classList.remove('premeasure'); // closing before the entrance hand-off landed
  bumpActivity(); // card gone — start counting toward the quiet idle state
  // Animated fade-out (mirrors the panel's .closing) instead of an instant snap, so closing/swapping
  // the bar is smooth. Skip if already hidden or already closing. tuck-out owns its own fade.
  if (!result.hidden && !result.classList.contains('closing') && !result.classList.contains('tuck-out')) {
    // Plain fade by default — the original close, and the one jek knows. The height-collapse only
    // earns its keep when a panel sits ABOVE the card: that's the stack that jolts when the card's
    // height disappears in one frame. With nothing above, there is nothing to pull down, and the
    // collapse just makes the card shrink for no reason — which is the change he felt.
    const collapse = !!panelMode;
    if (collapse) {
      // Pin the current height so the CSS transition has something to animate FROM (auto → 0 does
      // not animate), then run it to zero and let the panel glide down with it.
      result.style.height = result.offsetHeight + 'px';
      void result.offsetHeight; // commit that height before the class flips it
      result.classList.add('collapse');
    }
    result.classList.add('closing');
    if (collapse) {
      result.style.height = '0px';
      result.style.marginBottom = '-8px'; // absorbs the .drop gap as the card disappears
    }
    clearTimeout(resultCloseTimer);
    resultCloseTimer = setTimeout(() => {
      result.hidden = true;
      resetWordBubble(); // it rode the card's fade out; now it's off screen, put it back
      result.classList.remove('closing');
      result.classList.remove('collapse');
      result.style.height = '';
      result.style.marginBottom = '';
      // updateUI derives the pill's width from result.hidden, which only becomes true HERE — the call
      // at the end of hideResult still saw the card as open and left the pill stretched.
      updateUI();
      updateDropRoom(); // card gone → re-evaluate split/flip (a lingering .split would strand the panel)
      // Was 160/190 — exactly the fade length, so the pill's narrow began the SAME frame the card's last
      // fade frame painted, and jek saw the pill หุบ "before" the bar was gone. Add a ~75ms beat so the bar
      // is clearly gone FIRST, then the pill collapses — a clean sequence, not a tie (jek 2026-07-26).
    }, collapse ? 265 : 235);
  } else if (result.classList.contains('tuck-out')) {
    result.hidden = true; // tuck already faded it — hide immediately, no double animation
    resetWordBubble();
  }
  result.classList.remove('loading');
  setDot(''); // card gone → idle dot; a green pulse must never linger after a one-shot snip
  // Card gone → keep ⌘⇧S (hint, right) and EN→TH (brand, left), and park the last translation
  // in the middle slot, so the pill shows all three.
  setHint(restingHint());
  // Hold the parked translation back for a beat — the bar has only just gone. During the pause the slot
  // rests on ⌘⇧S, then the word slides in. A new/reopened card that arrives first owns the slot (guard).
  clearTimeout(parkDelayTimer);
  clearTimeout(keyLeaveTimer);
  parkDelayTimer = setTimeout(() => {
    if (!result.hidden) return; // a card came back during the pause — don't park over it
    const doSwap = () => {
      if (!result.hidden) return;
      pillShowingXlate = true;
      refreshXlate();
      updateUI();
    };
    // Only a LONG word that will SLIDE gets the keyword fade-out first; a short word that just pops in
    // takes the slot straight away, no keyword transition (jek 2026-07-26).
    if (pillKeyword && lastWord && slotOverflows(lastWord)) {
      hintTextEl.classList.add('key-leave');
      keyLeaveTimer = setTimeout(() => { hintTextEl.classList.remove('key-leave'); doSwap(); }, 150);
    } else {
      doSwap();
    }
  }, XLATE_PARK_DELAY_MS);
  updateUI();
}

// Internally every shortcut string stays in its ⌘⇧ form (all the === comparisons rely on it);
// KEYS() converts ONLY at display time, so Windows/Linux users see Ctrl⇧S etc.
const IS_MAC = window.api.isMac !== false;
// Windows gets words, not glyphs: '⇧' is a Mac convention and at pill size it reads as a smudge
// ("CtrlûS"). This one string is the only thing telling a new user what to press.
const KEYS = (s) => (IS_MAC ? s : String(s)
  .replaceAll('⌃⌥', 'Ctrl+Alt')   // before the ⇧ rules: these are the hold-to-snip modifiers, not a shortcut
  .replaceAll('⌘⇧', 'Ctrl+Shift+')
  .replaceAll('⇧', 'Shift+'));
// The resting hint = the PRIMARY snip shortcut (⌘⇧S / Ctrl+Shift+S), so the pill says what its own
// tooltip promises ("Shortcut to snip & translate") and matches the '⌘⇧S' main.js already sends via
// setHintState. Was '⌃⌥' (the hold GESTURE) — a bare modifier with no action key that read as
// incomplete, and it disagreed with main's resets (jek, 2026-07-31). The ⌃⌥ hold is still taught, as a
// "faster" second trigger, in the Snip-style note below and the empty state. Rendered as Ctrl+Shift+S
// off mac by KEYS, like every other shortcut here.
// The trigger comes from main (it owns the defaults AND the user's overrides), read synchronously at
// preload so this first paint is already correct. It used to start at a hard-coded '⌘⇧S' and wait for
// the async getShortcuts() — which stopped being the default when snip moved to Alt+S, so every boot
// showed the pill saying "Ctrl+Shift+S" for a frame or two before it corrected itself to "Alt+S"
// (jek, Win11 2026-08-07). renderShortcuts still rewrites both on any re-key; this only removes the
// window where we were guessing. The '⌘⇧S' fallback is for the impossible case of no snip row at all.
const bootSnip = (window.api.shortcutsAtBoot || []).find((sc) => sc.id === 'snip');
let SNIP_HINT = bootSnip ? accelToDisplay(bootSnip.accel) : '⌘⇧S';
let snipIsHold = !!(bootSnip && bootSnip.hold); // the trigger is modifier-only, so holding is possible at all

// The snip style actually in force — the renderer's half of main.js's effectiveSnipStyle(), and the
// one thing every "what do I tell the user to do" decision reads. 'hold' is only real when the
// trigger is modifier-only: a letter cannot be held down over a game without being typed into it, so
// the style quietly becomes a drag and the note under Settings says why.
function snipStyleNow() {
  const s = (snipStyleSel && snipStyleSel.value) || 'hold';
  return (s === 'hold' && !snipIsHold) ? 'drag' : s;
}
// Every ⌘⇧-spelled key inside a pill message, swapped for what that action is BOUND to right now.
//
// The pill was showing keys nobody had pressed: main.js hands the slot back with the literal '⌘⇧S'
// from four places (doClear, the snip disarms, the hook release), KEYS() turned that into
// "Ctrl+Shift+S" on Windows, and the snip trigger has defaulted to Ctrl+Alt since the single-trigger
// change — so the pill was confidently naming a key that does nothing (jek, 2026-08-09: "เห็นจะๆ เลย
// ว่ามันโชว์ Control Shift S ทั้งที่ตอนนี้ Snip เป็น Control Alternate"). The lock hint had the same
// defect one re-key away: 'Locked · ⌘⇧L' is written in three places and none of them asked what lock
// is bound to.
//
// Same idea as KEYCAP_TOKENS/setKeycaps, which already does this for i18n sentences: the ⌘⇧ spelling
// is a TOKEN, not a key, and this is where the slot resolves it. One map, filled by renderShortcuts
// from the live list, so a re-key updates the pill on the same pass that updates the Settings row.
const liveKeys = new Map(); // '⌘⇧S' → 'Ctrl+Alt'
// Seeded from the SYNCHRONOUS boot list, for the same reason SNIP_HINT is (see bootSnip above): the
// first hint can be painted before the async getShortcuts() lands, and a slot that shows the wrong
// key for two frames is the bug this whole map exists to fix. renderShortcuts overwrites it after.
//
// A function, called from beside KEYCAP_TOKENS rather than run here, because that table is declared
// much further down: reading a `const` above its declaration is a ReferenceError, and a renderer
// ReferenceError never reaches the terminal — it would have been a blank pill and no message.
function seedLiveKeysFromBoot() {
  for (const sc of (window.api.shortcutsAtBoot || [])) {
    const tok = KEYCAP_TOKENS[sc.id];
    if (tok) liveKeys.set(tok, accelToDisplay(sc.accel));
  }
}
function liveKeysIn(msg) {
  const s = String(msg == null ? '' : msg);
  if (!s.includes('⌘⇧')) return s; // the common case — statuses have no keycap in them at all
  let out = s;
  for (const [token, key] of liveKeys) if (key) out = out.split(token).join(key);
  return out;
}

// Commands, not statuses: they never scroll, never auto-revert, and never suppress the parked vocab.
// Compared against the RESOLVED lock label, because that is what setHint stores now — testing the
// ⌘⇧L token would never match again, and the lock hint would start scrolling and auto-reverting like
// a status, which is the one thing it must never do (you'd have no way to read your way out of lock).
// Just the key. The padlock moved out of this slot and onto its own badge beside the status dot, so
// keeping one here was two padlocks on one pill — and the pair cost the slot exactly the room it did
// not have: measured, the slot is 77px and '🔒 Ctrl+Shift+L' renders at 77px, which is why the key
// came out clipped at the pill's edge (jek, 2026-08-09: "Text มันล้นป่ะ?"). Without it: 59px.
//
// The key itself stays, and stays spelled as a TOKEN — liveKeysIn resolves it to whatever lock is
// really bound to. It is the one instruction on screen for getting back out.
const LOCK_HINT = '⌘⇧L';
const isFixedHint = (msg) => msg === SNIP_HINT || msg === liveKeysIn(LOCK_HINT);
let curHintRaw = SNIP_HINT; // the raw (un-KEYS'd) current hint, for comparisons — textContent may be converted

// A CONDITION, not an event. Everything else that lands in this slot is a moment that has already
// passed by the time you read it — a failed read, a notice, a suggestion — so it says its piece and
// hands the slot back after 5s. "Screen Recording is off" is not a moment: it stays true until the
// user goes and changes it. It was being told the same way as a moment, so the pill said it for five
// seconds and then went back to showing the snip key over a red dot, and the only way left to learn
// what the red meant was to open Settings and read the banner (jek, 2026-09-01: "คนมันไม่รู้ไง ไม่งั้น
// คนจะต้องกดเข้าไป Setting เพื่อจะเห็นเท่านั้น"). So a blocking condition OWNS the resting slot for as long
// as it lasts, and restingHint() — not SNIP_HINT — is what every "go back to rest" site now asks for.
//
// Only a condition that stops the WHOLE app belongs here. A refused microphone does not: the mic is
// one of four ways in and the other three still work, so a permanent "Mic off" would be a false
// alarm sitting on the pill of every player who never speaks. That one stays a status.
let blockedHint = null;
const restingHint = () => blockedHint || SNIP_HINT;
function setBlocked(msg) {
  if (blockedHint === msg) return;
  const wasShowing = curHintRaw === blockedHint;
  blockedHint = msg;
  if (msg) setHint(msg);
  else if (wasShowing) setHint(restingHint()); // cleared while its label was up — hand the slot back
}
let hintRevertTimer = null; // statuses auto-revert to the resting ⌘⇧S after a few seconds

// One-time pass over the static HTML (tooltips, shortcuts help, resting hint) on Windows/Linux.
const needsKeys = (s) => s.includes('⌘⇧') || s.includes('⌃⌥');
if (!IS_MAC) {
  document.querySelectorAll('[title]').forEach((el) => { if (needsKeys(el.title)) el.title = KEYS(el.title); });
  // ...and the hover tooltips, which render straight from dataset.tip (⧉ said "Snip · ⌘⇧S" on Windows).
  document.querySelectorAll('[data-tip]').forEach((el) => { if (needsKeys(el.dataset.tip)) el.dataset.tip = KEYS(el.dataset.tip); });
  const help = document.querySelector('.shortcuts-help');
  if (help) help.innerHTML = KEYS(help.innerHTML);
  const es = document.getElementById('emptyState');
  if (es) es.innerHTML = KEYS(es.innerHTML);
  const ti = document.getElementById('typeInput');
  if (ti && ti.placeholder.includes('⌘⇧')) ti.placeholder = KEYS(ti.placeholder);
  lockBtn.textContent = KEYS(lockBtn.textContent);
  // The mic used to be hidden here, because toggleSpeak could only answer "Voice input is macOS-only"
  // off darwin and a button that exists to apologise is worse than no button. That stopped being true
  // when native/winspeak.ps1 landed: SPEAK_HELPER picks it on Windows, and the 'speak' shortcut row is
  // registered on both platforms now (main.js). The hide outlived its reason and was the only thing
  // keeping the button off the Windows pill. (jek, 2026-08-07)
}
// The resting hint's DISPLAY text (static HTML says ⌘⇧S). Set it from SNIP_HINT so Mac shows ⌃⌥ and
// Windows shows Ctrl⇧S — the mac-only default never got updated before, so the pill still read ⌘⇧S.
hintTextEl.textContent = KEYS(SNIP_HINT);
// The scope note for "Snip style" — it governs the ⌘⇧S shortcut / ⧉ button only, the ⌃⌥ hold is
// always a drag — used to be written here through KEYS(), which only swaps the key glyphs for the
// platform. That is not translation: once the note became this row's description it went straight to
// #gsDescBar as-is, so the Thai UI showed an English sentence. It is a normal i18n key now
// (desc.snipStyle), and t() keyifies the glyphs on the way out for free. (jek, 2026-07-31)

let pendingLoopWait = null; // { el, fn } — a marquee-completion wait armed by revertHintIfCurrent

// Run `fn` right away if `el` isn't mid-marquee (static text can change instantly); otherwise wait
// for the CURRENT slide to finish >=2 full loops first — cutting a marquee off mid-slide read as
// broken. Only one such wait is ever pending (this pill has one right-hand slot); a new wait
// replaces the old one.
function waitForLoopsThenRun(el, fn) {
  if (pendingLoopWait) pendingLoopWait = null; // one slot, one wait — a newer one replaces it
  // Static text can change instantly — and so can text whose ticker is SPENT. A spent ticker keeps
  // .marquee (it carries the left-align that keeps the head readable) but its animation is off, so
  // the class alone no longer means "still sliding". Checking the park mark too is what stops this
  // from arming a listener for an iteration that will never come — which would strand the status in
  // the slot for good.
  const spent = el._mqParkedText === el.textContent;
  if (spent || !el.classList.contains('marquee')) { fn(); return; }
  // Do NOT count iterations here. This used to hard-code "wait for 2", which silently breaks the
  // moment a tenant of the slot has a different pass count — a notification slides ONCE, so a
  // 2-iteration wait would sit listening for a second pass that never comes and strand it. The
  // ticker knows when its own run is over: finish() flushes this wait (whatever the count was, and
  // even when its safety backstop ended the run without a final iteration event).
  pendingLoopWait = { el, fn };
}

// The 5s auto-revert from a status back to the resting ⌘⇧S. Gated by waitForLoopsThenRun so a long
// status doesn't get yanked mid-slide (jek: >=2 full loops before it's allowed to disappear). A
// NEWER hint/status/translation always wins immediately — this only fires if `forMsg` is still the
// live status when the wait (if any) finishes.
function revertHintIfCurrent(forMsg) {
  if (curHintRaw !== forMsg || !hintIsStatus) return;
  // Nothing to hand the slot back TO — this message IS the resting text now. Without this the
  // marquee's own "the text is spent" callback would re-set the same string and start it sliding
  // again, forever.
  if (restingHint() === forMsg) return;
  waitForLoopsThenRun(hintTextEl, () => {
    if (curHintRaw !== forMsg) return;
    setHint(restingHint());
    // A status can un-hide the pill with no card behind it — a failed read, a notice. Handing the slot
    // back ends that borrow too, or the intent would sit there and re-hide the pill at some unrelated
    // moment later (jek, 2026-07-30).
    if (retuckAfterCard && !panelMode && result.hidden) {
      clearRetuck();
      clearTimeout(retuckTimer);
      retuckTimer = setTimeout(() => { if (result.hidden && !userIsHere()) tuck(); }, 160);
    }
  });
}

function setHint(msg) {
  // While locked, the pill always shows the unlock shortcut so you can never get stuck — nothing
  // (translations, status) is allowed to overwrite it.
  if (locked) msg = LOCK_HINT;
  msg = liveKeysIn(msg);
  curHintRaw = msg;
  // Short command labels (⌘⇧S, the 🔒 ⌘⇧L lock hint) must never shrink/clip OR slide — they're
  // commands, not scrolling text. Long status messages may still marquee.
  const fixed = isFixedHint(msg);
  // A non-fixed message is a transient STATUS — suppress the parked vocab so only one thing slides.
  // The default ⌘⇧S / lock hint is not a status, so the vocab is free to come back.
  hintIsStatus = !fixed;
  // Every status is TRANSIENT: it hands the slot back (and un-suppresses the parked vocab) after a
  // few seconds — a lingering status made the vocab ticker look like it had vanished.
  clearTimeout(hintRevertTimer);
  // A condition does not expire on a timer; it expires when it stops being true (setBlocked).
  const sticky = !!blockedHint && msg === blockedHint;
  if (!fixed && !sticky && !locked) hintRevertTimer = setTimeout(() => revertHintIfCurrent(msg), 5000);
  if (!fixed) untuck({ auto: true }); // a real status (not the resting ⌘⇧S/lock hint) must be readable — bring it back
  bumpActivity(); // a status message is activity — wake the pill so it's readable
  pill.classList.toggle('has-status', !fixed);
  refreshXlate(true); // force: setHint just changed what the slot should show, always repaint
}

function setDot(state) {
  // .cc rides along whenever CC mode is on — steady GREEN ring = "watching", pulse (.live) = "reading
  // now". If the user ✕-muted live cards, show a steady AMBER ring (.cc-muted) instead so there's a
  // PERSISTENT signal that CC is on but paused (the toast notice vanishes in 5s and left them guessing
  // why subtitles stopped).
  const cc = liveMode ? (liveCardMuted ? ' cc cc-muted' : ' cc') : '';
  dot.className = 'dot' + (state ? ' ' + state : '') + cc;
}

// ---- Saved vocab: a personal collection of individual WORDS worth remembering (a Pro feature).
// Stored separately from history so it survives the history cap.
//
// Entry shape (new): { word, meaning, reading, ts, src } — word=source-language word, meaning=
// translation, reading=pronunciation ("" if none), src=the sentence it was pulled from.
// Backward compat: entries saved by the old build are { en, th, ts } (the whole sentence, back when
// ★ saved full payloads). getWord/getMeaning/getReading read either shape so old data never breaks.
// gt.vocab in localStorage is the OLD pre-main-process store. Nothing writes to it any more and it
// is NEVER deleted — it only serves as (a) a sync placeholder until vocab:get's IPC round-trip
// resolves, and (b) the seed for the one-time migration into main's vocab.json below.
function loadLegacyVocab() { try { return JSON.parse(localStorage.getItem('gt.vocab') || '[]'); } catch { return []; } }
let savedVocab = loadLegacyVocab(); // local mirror of main's vocab store; kept in sync via vocab:changed
// getWord/getMeaning/getReading/wordKey/getSeen/getGradSeen now live in shared/vocab-model.js (reused
// by the main window from M3 on) — aliased here so every existing callsite below stays unchanged.
const { getWord, getMeaning, getReading, wordKey, getSeen, getGradSeen, setGradSeen } = window.GTVocab;
const isWordSaved = (w) => savedVocab.some(v => wordKey(getWord(v)) === wordKey(w));

// Boot: pull the real list from main. If main's store is empty but the old localStorage copy has
// data, this is an upgrade from the pre-main-process build — seed main from it (one-time migration;
// localStorage itself is left untouched as a backup).
window.api.vocabGet().then((v) => {
  const fromMain = Array.isArray(v) ? v : [];
  if (fromMain.length === 0 && savedVocab.length > 0) {
    window.api.vocabSet(savedVocab); // main saves it and echoes back via vocab:changed below
  } else {
    savedVocab = fromMain;
  }
  if (histMode === 'saved') renderSaved();
  updateLearnBadge(); // the pill paints before this resolves — it would read "no words today" otherwise
});
// Every place a word is shown paints itself ONCE, when it is built — so a row drawn before you kept
// the word stayed unhighlighted while the row drawn after it glowed, and the same word looked kept in
// one line and not in the next (jek, 2026-08-15, two "happy" rows a minute apart). The highlight is a
// fact about the COLLECTION, not about the row, so it is repainted from the collection.
//
// In place, not by re-rendering: the save usually comes FROM one of these rows, and rebuilding the
// list under the cursor is the bug the ★-row delete already has a comment about. Toggling a class on
// spans that stay put touches nothing else.
function repaintSavedWords() {
  for (const el of document.querySelectorAll('.src-word[data-w]')) {
    const on = isWordSaved(el.dataset.w);
    el.classList.toggle('on', on);
    el.title = on ? 'Saved — tap to remove' : 'Tap to save to Vocab';
  }
}
window.api.onVocabChanged((v) => {
  savedVocab = Array.isArray(v) ? v : [];
  if (histMode === 'saved') renderSaved();
  repaintSavedWords();  // every other line showing that word, wherever it is
  updateLearnBadge(); // a word saved anywhere (card ★, Learn window) lands here
});

// Passive frequency: every translation re-encounters some words you've already saved. Bump their
// seen-count so the Saved list can show ×N and fade the words you now know. Purely observational —
// nothing shows mid-gameplay; the count only surfaces in the Saved tab.
let lastSeenSrc = ''; // CC mode re-reads the same subtitle repeatedly — don't count one line twice
function bumpSeen(sourceText) {
  const src = String(sourceText || '');
  if (!src.trim() || src === lastSeenSrc || !savedVocab.length) return;
  lastSeenSrc = src;
  const low = src.toLowerCase();
  const touched = []; // entries actually bumped this pass — persisted one-by-one below
  for (const v of savedVocab) {
    const wl = wordKey(getWord(v));
    if (!wl) continue;
    // Latin words: whole-word match so "cat" doesn't fire inside "category". CJK has no spaces → substring.
    const hit = /^[\x00-\x7f]+$/.test(wl)
      ? new RegExp(`\\b${wl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(low)
      : low.includes(wl);
    if (hit) { v.seen = getSeen(v) + 1; touched.push(v); }
  }
  // Per-entry vocab:update merges just that word's `seen` — unlike the old batched vocab:set (which
  // overwrote the WHOLE list), this can never clobber a write the Learn window made to a different
  // word (e.g. a review rating) while this pass was running. M4 fix for the sync risk called out in
  // the main-window plan.
  if (touched.length) {
    touched.forEach((v) => window.api.vocabUpdate({ word: getWord(v), patch: { seen: v.seen } }));
    if (histMode === 'saved') renderSaved();
  }
}

// Adds one word if it isn't already saved. Returns true if it was actually added (so callers can
// count "N words added" without double-counting dupes across repeated extractions). Mutates the
// local mirror immediately so the UI paints instantly, then fires the persist to main — main's own
// dedup makes this safe even if vocab:changed echoes back a split second later.
// pos/senses were being thrown away here: the card could show an "ADJ." badge, but collecting the word
// kept only its first translation, so the Vocab list and the flashcards had no idea what kind of word
// it was — and a word that is both a noun and a verb lost half its meaning (jek, 2026-07-30).
// `from` is the SOURCE KIND ('snip'|'cc'|'type'|'point') — how the word reached you, not what
// sentence it sat in (that is `src`). Added 2026-08-12 after jek could not account for a word in the
// collection: the entry knew its sentence but nothing knew whether it came off a snip, a subtitle, or
// the point-at-a-word key, and those are the three things you would ask. Left OFF when the caller
// genuinely doesn't know — an absent mark reads as "unknown", a guessed one reads as a fact.
// Words saved before this date have none, and there is nothing to backfill them from.
function addVocabWord({ word, meaning, reading, src, pos, senses, from, defs }) {
  const w = String(word || '').trim();
  if (!w || isWordSaved(w)) return false;
  const entry = { word: w, meaning: meaning || '', reading: reading || '', ts: Date.now(), src: src || '', seen: 1 };
  if (from) entry.from = from;
  if (pos) entry.pos = pos;
  if (Array.isArray(senses) && senses.length > 1) entry.senses = senses; // one sense adds nothing over pos+meaning
  // The dictionary's own definitions, handed over by main (wordStudyDetail) with the translation.
  // A word that has no Thai in the dictionary — `capability` — still has a real definition, and
  // until now the record kept nothing but a one-line gloss for it.
  if (Array.isArray(defs) && defs.length) entry.defs = defs;
  savedVocab = [entry, ...savedVocab];
  window.api.vocabAdd(entry);
  updateLearnBadge(); // instant, off the local mirror — vocab:changed echoes back a moment later
  return true;
}
function removeVocabWord(word) {
  const key = wordKey(word);
  savedVocab = savedVocab.filter(v => wordKey(getWord(v)) !== key);
  window.api.vocabRemove(word);
  updateLearnBadge();
}
function toggleVocabWord(word, meaning, reading, src, from) {
  if (isWordSaved(word)) removeVocabWord(word);
  else addVocabWord({ word, meaning, reading, src, from });
}
// Whether a HISTORY entry (a translation card, not a vocab word) should show its ★ filled in. A
// single-word entry checks itself; a sentence checks whether any word already collected from it.
// Is this already a single word (save it as-is) vs a sentence (split/extract)? Scripts that use
// spaces (Latin, Korean) → a lone token has no whitespace. Japanese/Chinese have NO spaces even in
// full sentences, so a whitespace test alone flags every CJK sentence as "one word" and the split
// paths never run — there a word is instead just SHORT (≤4 chars); longer runs are sentences.
const CJK_RE = /[぀-ヿ㐀-鿿]/; // JP kana + CJK unified (JP kanji / Chinese); NOT Hangul
const isSingleWord = (en) => {
  const t = String(en || '').trim();
  if (!t || /\s/.test(t)) return false;
  if (CJK_RE.test(t)) return [...t].length <= 4;
  return true;
};
function isEntrySaved(payload) {
  const en = String(payload.en || '').trim();
  if (isSingleWord(en)) return isWordSaved(en);
  // Sentence: saved if any word was collected FROM it (new entries carry .src), with a fallback that
  // also lights the ★ on legacy entries that were saved whole (old {en,th}, no .src).
  return savedVocab.some(v => v.src === en || wordKey(getWord(v)) === wordKey(en));
}

let hasKey = false; // set from settings:changed / settings:get — gates the Claude auto-extract path

// Split a sentence into whitespace-delimited chip buttons the user can tap one at a time (the
// offline path — no Claude key to auto-pick words). CJK text has no spaces so it collapses to one
// chip; that's a known limit, called out via the hint instead of a silent no-op.
function chipNote(container, text) {
  container.innerHTML = '';
  const hint = document.createElement('div');
  hint.className = 'vocab-hint';
  hint.textContent = text;
  container.appendChild(hint);
}

// The source line in a History row IS the word picker: every word is its own tap target, so
// collecting one is a single tap ON THE WORD — no ☆ → expand → tap detour for the common case. A tap
// on anything else in the row still reopens the card, and tapping a saved word again removes it.
// Lines with no spaces (Japanese/Chinese/Thai) stay plain text: only Claude's segmenter can find
// those boundaries, and doing that per row on every render would be a request per row. The ☆ chips
// path still covers them on demand.
// ---- Word bubble ----
// Tapping a word in the card's source line already translated it (the meaning had to exist to be
// saved) — that reading is shown here now instead of being dropped. The ★ keeps or drops the word, so
// one tap can mean "what is this?" and not only "keep it".
const rWordEl = document.getElementById('rWord');
const rwWord = document.getElementById('rwWord');
const rwMeaning = document.getElementById('rwMeaning');
const rwSenses = document.getElementById('rwSenses');
const rwSpeak = document.getElementById('rwSpeak');
const rwFav = document.getElementById('rwFav');
let bubble = null; // { word, meaning, src, paint } — paint repaints the tapped span's highlight
// Which tap the bubble currently belongs to. Bumped by every tap; a lookup that comes back holding an
// older number has been overtaken and must not paint (see fillSourceWords).
let wordTapSeq = 0;

let rwLeaveTimer = null;
// The bubble arrives on a 240ms rwIn and used to leave by having `hidden` flipped — display:none, one
// frame, gone. Asymmetric on its own, but the case that actually reads as broken is the card closing
// around it: hideResult called this BEFORE starting the card's 235ms fade, so the card lost the
// bubble's height in a single frame, jumped shorter, and only THEN began to fade. Two motions fighting
// where there should be one. (jek, 2026-08-07: "โคตรไม่ smooth".)
//
// Three ways out, because there are three reasons to close it:
//   withCard — the whole card is going. Do nothing visible: let the bubble fade out INSIDE the card's
//              own animation, and let the close timer reset the element once the card is really gone.
//   instant  — the card is staying but its content is being replaced wholesale (a new reading). The
//              new content lands this frame; animating the old bubble out over the top of it is noise.
//   default  — the bubble alone is going (a lookup that failed). Mirror the entrance.
function hideWordBubble({ withCard = false, instant = false } = {}) {
  bubble = null;
  if (withCard) return;
  clearTimeout(rwLeaveTimer);
  if (instant || rWordEl.hidden) {
    rWordEl.classList.remove('leaving');
    rWordEl.hidden = true;
    return;
  }
  if (rWordEl.classList.contains('leaving')) return; // already on its way out
  rWordEl.classList.add('leaving');
  rwLeaveTimer = setTimeout(() => {
    rWordEl.classList.remove('leaving');
    rWordEl.hidden = true;
  }, 150);
}
// Reset the element after the card has finished closing — hideResult({withCard}) deliberately leaves
// it on screen so it can fade out with the card, so someone has to put it back.
function resetWordBubble() {
  clearTimeout(rwLeaveTimer);
  rWordEl.classList.remove('leaving');
  rWordEl.hidden = true;
}

// The bubble can be living inside a History row (see makeEntry). Any full redraw of that list throws
// its rows away — and would take the ONE bubble element with them, out of the document, where every
// later show() would write into a node nobody can see. Called by both list renderers before they
// clear, so the element is always back in the markup's own slot before anything is destroyed.
function evictWordBubbleFromList(node) {
  const doomed = node || logEl;
  if (!doomed.contains(rWordEl)) return;
  rWordHome.insertBefore(rWordEl, rWordHomeNext);
  rWordEl.classList.remove('in-row');
  hideWordBubble({ instant: true }); // the row it explained is about to stop existing
}

function paintBubbleFav() {
  const on = bubble ? isWordSaved(bubble.word) : false;
  // The same SVG star the rows and the card use (IC_STAR), filled via CSS when lit — it used to be a
  // bare ★/☆ character, the only star in the app that wasn't a real button (designer review).
  rwFav.innerHTML = IC_STAR;
  rwFav.classList.toggle('on', on);
  rwFav.title = on ? 'Remove from Vocab' : 'Save to Vocab';
}

// One-shot flash on the word itself, restarted per lookup (removing the class and forcing a reflow is
// what lets the same animation play twice on the same element).
function flashWord(span) {
  if (!span) return;
  span.classList.remove('just');
  void span.offsetWidth;
  span.classList.add('just');
  setTimeout(() => span.classList.remove('just'), 600);
}

// "[V.] วิ่ง · [N.] การวิ่ง" — every part of speech the dictionary had, so a two-type word reads as
// two. The tags are chips (shared/pos-badge.js), not the raw "v." they used to be printed as: this
// row sits directly under a meaning that already wears one, and two spellings of the same fact in
// one bubble is exactly the mismatch this pass is fixing.

// Where the bubble lives when nobody has asked for it somewhere else: inside the card, right under
// the source line it belongs to. Captured once, with its neighbour, so it can always be put back
// exactly where the markup put it.
const rWordHome = rWordEl.parentNode;
const rWordHomeNext = rWordEl.nextSibling;

function showWordBubble(ctx, { loading = false } = {}) {
  // ONE bubble element, two homes. The caption box needed the same "what does this word mean" panel
  // the card has, and the honest choices were to duplicate the markup (two things to keep in step,
  // and the ★/▶ handlers bound to whichever copy) or to move the one that exists. It moves. The id,
  // the listeners and the animation all come with it.
  const host = ctx.host || rWordHome;
  if (rWordEl.parentNode !== host) {
    if (host === rWordHome) host.insertBefore(rWordEl, rWordHomeNext);
    else host.appendChild(rWordEl);
  }
  // A History row is not the card: it has no card padding around it and sits in a scrolling list, so
  // the bubble needs its own margins there. One class, set from the one place that knows which home
  // this is, rather than each caller remembering to style it.
  rWordEl.classList.toggle('in-row', host !== rWordHome);
  // Catch a bubble that is mid-exit — tapping a second word while the first is fading. Cancelling the
  // leave rather than letting it finish and re-enter is deliberate: the element never leaves the
  // render tree, so rwIn does not replay, and the swap reads as the text changing rather than as the
  // box blinking out and back.
  clearTimeout(rwLeaveTimer);
  rWordEl.classList.remove('leaving');
  bubble = ctx;
  // The word, then its kind as the same chip everywhere else uses. It used to read "run · verb" —
  // the tag as plain text after a middle dot, which at a glance is another word of the meaning.
  rwWord.textContent = ctx.word;
  const wordChip = ctx.pos && !loading && showPos ? posBadgeEl(ctx.pos) : null;
  if (wordChip) { rwWord.appendChild(document.createTextNode(' ')); rwWord.appendChild(wordChip); }
  rwMeaning.textContent = loading ? 'Translating…' : ctx.meaning;
  rwMeaning.classList.toggle('loading', loading);
  // The other senses now answer to Settings › "Other meanings" like every other second-meaning row in
  // the app. This row predates that switch and used to be unconditional, so turning the switch OFF is
  // the one place this pass takes something away that was there before — deliberately, because a
  // switch that means "other meanings" everywhere except here is not a switch, it's a coincidence.
  // skipFirst: rwWord above already wears the primary chip (see wordChip).
  const extra = !loading && showSenses && fillSenseChips(rwSenses, ctx.senses, undefined, !!wordChip);
  if (!extra) rwSenses.textContent = '';
  rwSenses.hidden = !extra;
  paintBubbleFav();
  rWordEl.hidden = false;
}

rwSpeak.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!bubble || !window.GTTts) return;
  window.GTTts.speakText(bubble.word, bubble.reading || '');
  rwSpeak.classList.add('speaking');
  setTimeout(() => rwSpeak.classList.remove('speaking'), 500);
});

rwFav.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!bubble || !bubble.meaning) return;
  if (isWordSaved(bubble.word)) removeVocabWord(bubble.word);
  else addVocabWord({ word: bubble.word, meaning: bubble.meaning, reading: '', src: bubble.src, pos: bubble.pos, senses: bubble.senses, from: bubble.from });
  paintBubbleFav();
  if (bubble.paint) bubble.paint(); // the word in the line above tracks the same state
});

function fillSourceWords(el, text, onChange, host, from) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  const tokens = line.split(' ').filter(Boolean);
  el.textContent = ''; // clear any prior content first — el may be REUSED (the card's rEn), or the spans stack up
  // One token can mean two very different things: a real single word ("FLIMSIEST"), which should be
  // tappable like any word in a sentence (jek, 2026-07-30) — or a CJK sentence, which has no spaces
  // and would otherwise become one giant "word" saved whole. isSingleWord already knows the
  // difference (≤4 chars for CJK), so it decides which of the two this is.
  if (tokens.length <= 1 && !isSingleWord(line)) { el.textContent = line; return; }
  // When the line IS one word, the bubble has nothing to add. The card above it already shows that
  // exact word and that exact translation, and its header already carries the same ▶ and ★ — so the
  // bubble was a second copy of the card, in a box, 40px lower. (jek sent a screenshot of "Chox → มาก"
  // with "CHOX / มาก" repeated underneath, 2026-08-07.) The bubble earns its place on a SENTENCE,
  // where the word you tapped is not what the card translated. Tapping still saves; the word going
  // amber, the flash, and the card's own ★ lighting up are the confirmation.
  const soloWord = tokens.length <= 1;
  tokens.forEach((token, i) => {
    if (i) el.appendChild(document.createTextNode(' '));
    // Strip surrounding punctuation for what gets SAVED, but keep the token as shown so the line
    // still reads exactly like the original text.
    const word = token.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '');
    if (!word) { el.appendChild(document.createTextNode(token)); return; }
    const w = document.createElement('span');
    w.className = 'src-word';
    w.textContent = token;
    // The SAVED word, not the token as printed — "happy," and "happy" are one word to the collection,
    // and this is what lets any surface repaint this span later without re-deriving it.
    w.dataset.w = word;
    const paintWord = () => { const on = isWordSaved(word); w.classList.toggle('on', on); w.title = on ? 'Saved — tap to remove' : 'Tap to save to Vocab'; };
    paintWord();
    w.addEventListener('click', async (e) => {
      e.stopPropagation(); // the row's own click reopens the card — one tap must not do both
      // Tapping a word you've already kept drops it, as before — but the bubble stays up with the
      // meaning still readable, so "I only wanted to look" costs one tap instead of a trip to Vocab.
      if (isWordSaved(word)) {
        ++wordTapSeq; // this answer is instant, but it still has to outrank a lookup already in flight
        const known = savedVocab.find((v) => wordKey(getWord(v)) === wordKey(word));
        removeVocabWord(word);
        paintWord();
        onChange();
        if (known && !soloWord) showWordBubble({ word, meaning: getMeaning(known), src: line, paint: paintWord, pos: known.pos, senses: known.senses, host, from });
        if (known) flashWord(w);
        return;
      }
      w.classList.add('busy');
      // Every tap takes a ticket. A lookup is a network call, and the tap that started it is often
      // not the last one the user made — tap a word, change your mind, tap one in another row, and
      // the FIRST reply would land afterwards and repaint the bubble with the earlier word, in the
      // earlier row. Only the newest ticket may paint. (The word it fetched is still saved: that part
      // was asked for and is not about what is on screen.)
      const ticket = ++wordTapSeq;
      if (!soloWord) showWordBubble({ word, meaning: '', src: line, paint: paintWord, host, from }, { loading: true });
      try {
        const res = await window.api.translateWord(word);
        if (res && res.th) {
          addVocabWord({ word, meaning: res.th, reading: '', src: line, pos: res.pos, senses: res.senses, defs: res.defs, from });
          paintWord();
          onChange();
          if (ticket !== wordTapSeq) return;   // a newer tap owns the bubble now — saving still stood
          if (!soloWord) showWordBubble({ word, meaning: res.th, src: line, paint: paintWord, pos: res.pos, senses: res.senses, host, from });
          flashWord(w);
        } else {
          if (ticket !== wordTapSeq) return;   // …and a stale failure must not close the newer bubble
          hideWordBubble();
          // Tapping a word is the cheapest thing in the app and the one people do most, so the moment
          // the network drops this is where they meet it first. "Translate failed" sends them looking
          // at the word; the truth sends them at the Wi-Fi. Main tags the offline case for us.
          setHint(res && res.error === 'offline' ? 'No internet' : 'Translate failed');
        }
      } catch {
        if (ticket === wordTapSeq) { hideWordBubble(); setHint('Translate failed'); }
      } finally {
        w.classList.remove('busy');
      }
    });
    el.appendChild(w);
  });
}

async function buildChips(container, sentence, onChange) {
  container.innerHTML = '';
  let raw = sentence.trim().split(/\s+/).filter(Boolean);
  // One "word" means the line has no spaces — Japanese, Chinese, Thai. No regex can find those word
  // boundaries, so a key buys the split (and only the split; picking is still yours).
  if (raw.length <= 1 && sentence.trim().length > 1) {
    if (!hasKey) {
      // Named languages here would be three the English→Thai build cannot read. The fact that
      // matters is the one on screen: this line has no spaces in it.
      chipNote(container, PAIR_LOCKED
        ? 'Add a Claude key to split a line with no spaces into words'
        : 'Add a Claude key to split Japanese/Chinese/Thai into words');
      container.dataset.built = '';
      return;
    }
    chipNote(container, 'Splitting into words…');
    let res = null;
    try { res = await window.api.segmentWords(sentence); } catch { /* handled below */ }
    const words = (res && res.words) || [];
    if (!words.length) {
      // "tap ★ again to retry" is the wrong advice with no network — the retry cannot work either.
      chipNote(container, res && res.error === 'offline'
        ? 'No internet — this split needs a connection'
        : "Couldn't split that line — tap ★ again to retry");
      container.dataset.built = ''; // let the next tap have another go
      return;
    }
    raw = words;
    container.innerHTML = '';
  }
  raw.forEach((token) => {
    const word = token.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '') || token;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'vocab-chip';
    chip.textContent = token;
    const paintChip = () => chip.classList.toggle('on', isWordSaved(word));
    paintChip();
    chip.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (isWordSaved(word)) {
        removeVocabWord(word);
        paintChip();
        onChange();
        return;
      }
      chip.disabled = true;
      chip.classList.add('busy');
      try {
        const res = await window.api.translateWord(word);
        if (res && res.th) {
          addVocabWord({ word, meaning: res.th, reading: '', src: sentence });
          paintChip();
          onChange();
        } else {
          setHint(res && res.error === 'offline' ? 'No internet' : 'Translate failed');
        }
      } catch {
        setHint('Translate failed');
      } finally {
        chip.disabled = false;
        chip.classList.remove('busy');
      }
    });
    container.appendChild(chip);
  });
}

// One matched SET of stroke icons for the row/card controls, so ⤢ / ★ / delete read as one design
// instead of three mismatched glyphs (jek 2026-07-28). The star has no fill here — CSS fills it (gold)
// only when .on, and hollows it on the un-star hover-preview.
const IC_EXPAND = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg>';
const IC_STAR   = '<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.6l2.6 5.2 5.8.9-4.2 4 1 5.7L12 16.7 6.9 19.4l1-5.7-4.2-4 5.8-.9z"/></svg>';
// ⚑ and ✦ were typed characters in a row of SVGs, and a character brings its own side bearings and
// baseline: measured on the card, the boxes lined up exactly (same top, same 20x20 for all five)
// while the ink inside them did not — the 'ทำไมมันเยื้อง' jek asked about twice, once per surface.
// Same viewBox, same render size, same currentColor as the two that were already drawn.
const IC_SPARK  = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2.6l1.9 6.1 6.1 1.9-6.1 1.9L12 18.6l-1.9-6.1L4 10.6l6.1-1.9z"/></svg>';
const IC_TRASH  = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 4h4M6 7l1 13h10l1-13"/></svg>';
const IC_SPEAK  = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.06A4.5 4.5 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06a9 9 0 0 0 0-17.54z"/></svg>';

// WHERE A ROW CAME FROM. Every line in History is a translation, but they arrive three different
// ways and the pile gave no sign which was which — snips, live subtitles and typed lookups all
// looked identical, so finding the word you read in a cutscene meant scrolling past everything you
// had snipped since (jek, 2026-08-09: "มันปนกันมั่วไปหมด ... หายากเวลาเปิด history").
//
// The flags were already on the payload, written where each one is created in main.js — `live` by
// livePoll, `typed` by the type bar, neither by a snip. Nothing new is stored; this only reads what
// was always there and gives it a face.
const SRC_MARKS = {
  star: { title: 'Words you collected', svg: '<path d="M12 3.6l2.6 5.2 5.8.9-4.2 4 1 5.7L12 16.7 6.9 19.4l1-5.7-4.2-4 5.8-.9z"/>' },
  snip: { title: 'From a snip', svg: '<rect x="3.5" y="3.5" width="12" height="12" rx="2.5"/><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/>' },
  cc:   { title: 'From live subtitles', svg: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><line x1="6" y1="14.5" x2="11" y2="14.5"/><line x1="13" y1="14.5" x2="17.5" y2="14.5"/>' },
  type: { title: 'Typed in', svg: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><line x1="8" y1="10" x2="8" y2="14"/>' },
  // A cursor, because that is literally what you did: put the pointer on a word and pressed the key.
  // Drawn as an arrow rather than a hand — the hand shape loses its fingers at 11px.
  point: { title: 'Pointed at', svg: '<path d="M5.5 3.2l12.4 8.1-5.4.6 2.9 6-2.6 1.2-2.9-6-3.6 4z"/>' },
  // A microphone. Spoken lines used to land here as `type` — they reach the card down the same
  // no-OCR path and so carry `typed` — which meant every dictated line claimed you had keyed it in.
  speak: { title: 'Spoken', svg: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="17.5" x2="12" y2="21"/>' },
};
// The modes with no button anywhere else. Declared HERE, beside the marks it borrows, rather than next
// to the functions that use it: syncModeSwitches() reaches syncModeStrip(), and a const declared
// further down the file would be in its temporal dead zone on any call that lands before that line.
// `mark` is the SRC_MARKS key, NOT the mode id — CC files its lines as 'cc' and point-at-a-word as
// 'point'. `toggle: true` = main broadcasts an on/off state for it.
//
// This list held all five input modes for one afternoon and lost three of them the same day, each to a
// control that was already on screen (jek, 2026-08-14): `type` to the tab beside it, `snip` to ⧉ on the
// pill, `speak` to the mic in the Type bar. Their SRC_MARKS entries stay — History rows still draw them
// to say where a line came from. What is left is the modes you could otherwise only reach by knowing a
// key: CC, and point-at-a-word on Windows.
const INPUT_MODES = [
  { id: 'live',  mark: 'cc',    label: 'mode.cc',    toggle: true },
  // `boxesOcr` is the same flag main.js filters the SHORTCUT list by (`!a.boxesOcr || HOVER_CAPABLE`):
  // point-at-a-word needs an OCR engine that reports per-character geometry. Without the filter the
  // strip would offer a chip whose only possible answer is "this machine can't" — a control that
  // cannot do the thing it names. It reads the SAME capability main.js does (capabilities.js, via
  // api.hoverCapable) and not a platform test of its own, so the chip and the shortcut can never
  // disagree about where the mode exists. macOS became capable on 2026-08-15.
  { id: 'hover', mark: 'point', label: 'mode.point', toggle: true, boxesOcr: true },
].filter((m) => !m.boxesOcr || window.api.hoverCapable);
const modeStripEl = document.getElementById('modeStrip');

// `spoken` is tested BEFORE `typed` for the reason written on the mark above: a spoken payload sets
// both, so the typed branch would swallow it. Order here must stay in step with bumpStats in main.js.
const srcOf = (p) => (p && p.live ? 'cc' : p && p.spoken ? 'speak' : p && p.typed ? 'type' : p && p.point ? 'point' : 'snip');
// Split from srcMark so a SAVED WORD can draw the same mark. A history row infers its kind from the
// payload's flags; a vocab entry carries the kind itself (`from`), because by then the payload is long
// gone — vocab.json outlives history.json. Returns null for a kind we don't know, which is what an
// entry saved before `from` existed has: no mark at all beats inventing one.
function srcMarkKind(kind) {
  const m = SRC_MARKS[kind];
  if (!m) return null;
  const el = document.createElement('span');
  el.className = 'entry-src';
  el.title = m.title;
  el.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + m.svg + '</svg>';
  return el;
}
function srcMark(payload) { return srcMarkKind(srcOf(payload)); }

// The lens over the pile. Session-only on purpose: a filter that survives a restart is a filter you
// forget you set, and then History looks like it lost half your words.
let histCap = 2000; // mirrors settings.maxHistory — see renderSettings
let histSrc = 'all';
// 'star' is not a source — it is the OTHER LIST, rendered by renderSaved. Treated as 'all' here so a
// stray renderHistory() under the ★ lens shows the history it has rather than nothing at all.
const bySrc = (list) => (histSrc === 'all' || histSrc === 'star' ? list
  : list.filter((p) => srcOf(p) === histSrc));
function buildSrcFilter() {
  if (!histSrcFilter) return;
  histSrcFilter.innerHTML = '';
  // The top row is NOT cleared wholesale — it owns the scope chip, which lives in the HTML and has its
  // own listener. Only the chips this function put there last time come out.
  if (histLensTop) histLensTop.querySelectorAll('.hist-src__opt').forEach((e) => e.remove());
  // Icon AND word. Icon-only made the row compact and the meaning a guessing game — the mark on a
  // history row is only readable once something has told you what it stands for, and this strip is
  // the only place that can (jek, 2026-08-09: "อยากให้มี Text หลังไอคอนด้วยจะได้[รู้ว่า]แต่ละไอคอนคืออะไร").
  // It is the legend for the list as much as it is the filter.
  // ★ stays part of THIS control — one lens group, not a tab of its own, which is what made the star
  // look like it filed your word somewhere else entirely (jek, 2026-08-09: "ทั้งที่จริงๆ มันคือ history
  // เหมือนกัน แต่เป็นเหมือน highlight"). It just no longer shares the sources' ROW: it is appended to the
  // top row beside "This session", because those two both change what the list IS, while
  // Snip/CC/Typed/Pointed only say which kind of line to keep (jek, 2026-08-12).
  const opts =[['all', 'btn.srcAll', null], ['snip', 'btn.srcSnip', 'snip'], ['cc', 'btn.srcCc', 'cc'],
    ['type', 'btn.srcType', 'type'], ['speak', 'btn.srcSpeak', 'speak'], ['point', 'btn.srcPoint', 'point'],
    ['star', 'btn.srcStar', 'star']];
  for (const [key, labelKey, mark] of opts) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hist-src__opt' + (histSrc === key ? ' on' : '');
    b.dataset.key = key;
    if (mark) {
      const m = SRC_MARKS[mark];
      b.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + m.svg + '</svg>';
      b.title = m.title;
    }
    // A CHILD carries the key, not the button: applyI18n replaces the whole textContent of whatever
    // holds it, which on the button would eat the icon on every language switch.
    const t = document.createElement('span');
    t.dataset.i18n = labelKey;
    t.textContent = window.i18n.t(labelKey);
    b.appendChild(t);
    b.addEventListener('click', () => {
      if (key === 'star') {
        if (!requirePro()) return; // same gate the Vocab tab had
        histSrc = 'star';
        dictSearch.placeholder = window.i18n.t('ph.searchVocab');
        buildSrcFilter();
        switchTab('saved');
        return;
      }
      histSrc = key;
      dictSearch.placeholder = window.i18n.t('ph.searchHistory');
      buildSrcFilter();
      if (histMode !== 'all') { switchTab('all'); return; } // coming back from ★ — switchTab renders
      renderHistory();
    });
    // ★ goes up with the scope chip; the four sources stay in the strip below it.
    ((key === 'star' && histLensTop) ? histLensTop : histSrcFilter).appendChild(b);
  }
}
// One History row. The ★ collects vocab out of it: a single-word entry saves directly; a sentence
// either auto-extracts (Claude key set) or expands into tap-to-pick word chips (offline).
// "2m" / "3h" / "2d" — the pill's list is glanced at mid-game to find what was just read, so it gets
// an age per row rather than the learn window's day headings (jek, 2026-07-30).
function agoLabel(ts) {
  const secs = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (secs < 45) return 'now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + 'm';
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs + 'h';
  return Math.round(hrs / 24) + 'd';
}

function makeEntry(payload) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  // The one thing that ties a row back to its entry. Nothing needed it until reading the same line
  // twice started REPLACING a row instead of adding one: the old row has to go, and with the panel
  // closed there is no re-render coming to take it away.
  if (payload && payload.ts) entry.dataset.ts = String(payload.ts);
  const top = document.createElement('div');
  top.className = 'entry-top';
  const body = document.createElement('div');
  body.className = 'entry-body';
  const thEl = document.createElement('div'); thEl.className = 'th'; thEl.textContent = payload.th;
  const enEl = document.createElement('div'); enEl.className = 'en';
  // The bubble belongs to the ROW you tapped, not to the card. Left as `undefined` it fell back to
  // rWordHome — inside <section class="result"> — so a word tapped in History rendered into the
  // translation card: invisible whenever the card was closed (measured 2026-08-15: bubble said
  // "agents / ตัวแทน", parent `result`, offsetParent null), and when the card WAS open it appeared
  // under a translation of something else entirely (the card still read "mountain"). One element with
  // two homes means handing it the right one; there is no second copy to go stale.
  fillSourceWords(enEl, payload.en, () => { paint(); if (histMode === 'saved') renderSaved(); }, entry, srcOf(payload));
  // Word class, same chip the ★ list and the card draw (jek, 2026-08-12: "ตรง History เหมือนจะไม่มีชนิด
  // ของคำ ... เพราะว่าในของที่ Mark Star มันมี"). The payload has carried `pos` all along — the row simply
  // never read it, so one word looked like two different records depending on which lens you met it
  // through, which is the exact thing makeVocabEntry's own comment says these lists must not do.
  // Nothing to gate against clutter: pos is an empty string for anything that isn't a single WORD
  // (main.js's card schema says so), so a subtitle or a sentence row never grows a chip.
  // Same rule as everywhere else: one click on a word keeps it, two open the LINE for typing. A
  // History row is a record of a lookup, so correcting it is a new lookup — Enter runs the fixed line
  // through the ordinary translate path and the corrected reading lands as its own row. The original
  // stays, because it is a log of what was actually on screen (jek, 2026-08-15).
  enEl.title = 'Double-click to correct this line';
  enEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (didDrag) return;
    startLineEdit(enEl, String(payload.en || ''), (next) => window.api.translateText(next),
      // A row carries its words, its chip, its source mark and its age — makeEntry assembles all of
      // that, so the list rebuilds rather than this trying to reassemble one row by hand.
      () => { histMode === 'saved' ? renderSaved() : renderHistory(); });
  });
  const posChip = payload.pos && showPos ? posBadgeEl(payload.pos) : null;
  if (posChip) { enEl.appendChild(document.createTextNode(' ')); enEl.appendChild(posChip); }
  if (payload.ts) {
    const ago = document.createElement('span');
    ago.className = 'entry-ago';
    ago.textContent = agoLabel(payload.ts);
    ago.title = new Date(payload.ts).toLocaleString();
    enEl.appendChild(document.createTextNode(' '));
    enEl.appendChild(srcMark(payload)); // source first, then when — the order you ask them in
    enEl.appendChild(ago);
  }
  body.appendChild(thEl); body.appendChild(enEl);
  // No tap-to-open-card on History rows (jek): the row already shows th+en inline, so re-opening the
  // translation card just repeated the same two lines on screen — pure redundancy. The row IS the readout.
  // Can the row's source line be tapped word by word? fillSourceWords only makes .src-word spans when
  // it can split the line, and tapping one IS the favourite gesture (it turns amber = starred). Where
  // that works, the row's ☆ was a second way to do the same thing, so the slot goes to ▶ instead —
  // pronunciation is the one thing the row cannot already show (jek, 2026-07-30). A CJK line with no
  // spaces has no tappable words, and there the ☆ (Claude word-splitter → chips) is the only way in,
  // so it stays.
  const tappable = !!enEl.querySelector('.src-word');
  const star = document.createElement('button');
  star.className = 'entry-star';
  star.innerHTML = IC_STAR;
  const paint = () => { star.classList.toggle('on', isEntrySaved(payload)); }; // CSS fills the star when .on
  paint();
  star.title = 'Collect word(s) from this into your vocab';
  const chipsEl = document.createElement('div');
  chipsEl.className = 'entry-chips';
  star.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!requirePro()) return; // gated behind Pro
    const en = String(payload.en || '').trim();
    if (isSingleWord(en)) {
      toggleVocabWord(en, payload.th, payload.pronunciation || '', en, srcOf(payload));
      paint();
      if (histMode === 'saved') renderSaved();
      return;
    }
    // Always tap-to-pick. Letting Claude choose the "useful" words sounds helpful but it can't know
    // which words YOU keep forgetting — and the ones you already know are noise in a review deck.
    // A key still helps where a regex genuinely can't: splitting languages that don't use spaces.
    const opening = !chipsEl.classList.contains('open');
    chipsEl.classList.toggle('open', opening);
    if (opening && !chipsEl.dataset.built) {
      buildChips(chipsEl, en, () => { paint(); if (histMode === 'saved') renderSaved(); });
      chipsEl.dataset.built = '1';
    }
  });
  // − deletes THIS lookup from History (main persists the removal). Clear-all was the only way to
  // drop anything before, which is too blunt for one bad OCR read in a list you want to keep.
  const del = document.createElement('button');
  del.className = 'entry-del';
  del.innerHTML = IC_TRASH;
  del.title = 'Delete this from History';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag) return;
    const ts = payload.ts;
    historyList = historyList.filter(h => h.ts !== ts);
    // Collapse the row instead of yanking it out from under the cursor. max-height has to start at a
    // REAL number — a transition from `auto` to 0 doesn't animate at all — so pin it first, flush, then
    // let .removing take it to zero. The node goes surgically (no re-render) so the log keeps its scroll.
    evictWordBubbleFromList(entry); // this row may be the bubble's current home
    entry.style.maxHeight = entry.scrollHeight + 'px';
    void entry.offsetHeight;
    entry.classList.add('removing');
    setTimeout(() => {
      entry.remove();
      if (!historyList.length) renderHistory(); // list just emptied — bring the empty-state blurb back
    }, 220);
    window.api.deleteHistory(ts);
  });
  // ⤢ re-opens the FULL translation card for this old entry (meaning, forms, example, speak) — but only
  // when the entry actually carries that extra detail (Claude-key reads store it; a th+en/pos-only entry
  // would just repeat the row, so no button). A dedicated icon, NOT a tap on the row/th line: that would
  // collide with the word-tap-to-save in the en line and cause accidental vocab saves (empath, jek 2026-07-27).
  // ⤢ re-opens the FULL card for EVERY entry, so the row controls stay consistent (jek 2026-07-28). Even a
  // plain th+en sentence gains the card's 🔊 speak (hear it) + the movable floating card; word entries also
  // get pos/meaning/example. A dedicated icon, NOT a tap on the row — that would collide with the word-tap-
  // to-save in the en line and cause accidental saves (empath).
  const openBtn = document.createElement('button');
  openBtn.className = 'entry-open';
  openBtn.innerHTML = IC_EXPAND;
  openBtn.title = 'Show the full card — hear it, and any meaning / example';
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag) return;
    // Toggle: if THIS entry's card is already up, ⤢ closes it; otherwise open it (jek 2026-07-28).
    if (!result.hidden && lastPayload && lastPayload.ts === payload.ts) hideResult();
    else reopenCard(payload);
  });
  const speak = document.createElement('button');
  speak.className = 'entry-speak';
  speak.innerHTML = IC_SPEAK;
  speak.title = 'Pronounce this';
  speak.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag || !window.GTTts) return;
    window.GTTts.speakText(payload.en || payload.th, payload.pronunciation || '');
    speak.classList.add('speaking');
    setTimeout(() => speak.classList.remove('speaking'), 500);
  });

  // ✦ on the row, for the same reason it is on the card: History is where you go BACK to something,
  // and wanting the full card is a thought people have while re-reading, not only in the second the
  // line first appeared (jek asked for this twice, 2026-09-08). Three states, same as the card: not
  // bought / working / bought — never disappearing, because a control that vanishes after a press
  // reads as one that broke.
  const rowAi = document.createElement('button');
  rowAi.className = 'entry-ai';
  rowAi.innerHTML = IC_SPARK;
  const rowHasAi = !!(payload.pronunciation || payload.meaning || payload.forms || payload.example);
  rowAi.classList.toggle('done', rowHasAi);
  // The lit ✦ says the row carries an AI read, but it is 24px of icon at the far RIGHT of a list you
  // scan down the left of. The line itself says it too, in the same accent the button lights up in —
  // colour on the text is the only version of this state you can see without going looking for it
  // (jek, 2026-09-08: "จะได้ดูเหมือนว่าคำนี้ใช้ AI แปลแล้ว").
  entry.classList.toggle('has-ai', rowHasAi);
  rowAi.title = rowHasAi ? 'Full card — already on this one' : 'Full card — pronunciation, word forms, example';
  rowAi.hidden = !payload.en;
  rowAi.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (didDrag || rowHasAi || rowAi.classList.contains('busy')) return;
    rowAi.classList.add('busy');
    const res = await window.api.upgradeCard(payload.en).catch(() => null);
    // On success the upgraded row arrives on translation:new and this row is replaced wholesale, so
    // only the failure path has anything left to clean up — the same split the card button makes.
    if (!res || !res.ok) {
      rowAi.classList.remove('busy');
      setHint(res && res.error === 'offline' ? 'No internet'
        : res && res.error === 'aidown' ? "Gloss's AI is unreachable — nothing wrong on your side"
        : res && res.error === 'quota' ? 'AI reads used up — translation still works'
      // Refused before the read was spent (main.js AI_CARD_MAX_CHARS), so this must name the fix
      // rather than the fault: nothing is wrong, the sweep was just wider than one card holds.
      : res && res.error === 'toolong' ? 'Too much text for one card — sweep a smaller part'
        : 'Full card unavailable');
    }
  });

  top.appendChild(body);
  top.appendChild(rowAi);
  top.appendChild(openBtn);
  top.appendChild(tappable ? speak : star);
  top.appendChild(del);
  entry.appendChild(top);
  entry.appendChild(chipsEl);
  return entry;
}

// One row in the ★ Saved (vocab) view — a collected word, not a full translation card. Tapping ★
// here just removes it.
function makeVocabEntry(v) {
  const entry = document.createElement('div');
  entry.className = 'entry';
  const top = document.createElement('div');
  top.className = 'entry-top';
  const body = document.createElement('div');
  body.className = 'entry-body';
  const word = getWord(v);
  const meaning = getMeaning(v);
  const reading = getReading(v);
  const seen = getSeen(v);
  const thEl = document.createElement('div'); thEl.className = 'th'; thEl.textContent = meaning;
  const enEl = document.createElement('div'); enEl.className = 'en';
  enEl.textContent = reading ? `${word} · ${reading}` : word;
  if (v.pos) {
    const pb = posBadgeEl(v.pos, (v.senses && v.senses.length > 1)
      ? v.senses.map((sn) => (sn.pos ? sn.pos + ' ' : '') + sn.terms.join(', ')).join(' · ')
      : '');
    if (pb) { enEl.appendChild(document.createTextNode(' ')); enEl.appendChild(pb); }
  }
  // The pill list stays minimal on purpose (jek, 2026-07-30): one badge, and only once it's earned.
  // The counter, the threshold and the wording that explains them live in the learn window's Words
  // tab — this list is glanced at mid-game, not studied.
  if (seen >= getGradSeen()) {
    const k = document.createElement('span');
    k.className = 'known-badge';
    k.textContent = window.i18n.t('badge.known');
    k.title = window.i18n.t('badge.known.tip').replace('{n}', seen);
    enEl.appendChild(document.createTextNode(' ')); enEl.appendChild(k);
  }
  // Same two marks a History row carries, in the same order and the same place — because this IS the
  // same reading seen through the ★ lens, and a word that looks different depending on which list you
  // met it in reads as a different record. `from` is absent on anything saved before 2026-08-12, and
  // those rows simply show the time with no source mark.
  const sm = srcMarkKind(v.from);
  if (v.ts || sm) {
    enEl.appendChild(document.createTextNode(' '));
    if (sm) enEl.appendChild(sm);
    if (v.ts) {
      const ago = document.createElement('span');
      ago.className = 'entry-ago';
      ago.textContent = agoLabel(v.ts);
      ago.title = new Date(v.ts).toLocaleString();
      enEl.appendChild(ago);
    }
  }
  body.appendChild(thEl); body.appendChild(enEl);
  // UN-STAR, not delete (jek, 2026-07-22): a − here reads as "destroy this word", but the word isn't
  // being thrown away — it's being un-collected, the exact inverse of the ★ that put it here from
  // History. So the control stays a lit star; hovering it hollows out to ☆ to PREVIEW the result,
  // which is what makes it readable as a toggle rather than a decoration. (− stays on History rows,
  // where the row really is deleted.)
  const star = document.createElement('button');
  star.className = 'entry-star on unstar';
  star.innerHTML = IC_STAR; // filled (gold) via CSS .on; hollows on hover-preview via CSS .unstar:hover
  star.title = 'Un-star — takes it out of your vocab';
  star.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag) return;
    removeVocabWord(word);
    // Same collapse as a History delete, then re-render once the space is gone — re-rendering straight
    // away rebuilt the list under the cursor and the row vanished mid-click.
    entry.style.maxHeight = entry.scrollHeight + 'px';
    void entry.offsetHeight;
    entry.classList.add('removing');
    setTimeout(renderSaved, 220);
  });
  // EDIT the collected word — on DOUBLE-CLICK, no button. One rule everywhere text can be changed:
  // one click keeps a word, two open it for typing (jek, 2026-08-15). A pencil per row was a control
  // on every row for something done to one row in fifty, and three surfaces each growing their own
  // button is exactly the drift this app keeps having to undo.
  enEl.title = 'Double-click to edit this word';
  enEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (didDrag) return;
    startVocabEdit(v, enEl, thEl, entry);
  });
  // 🔊 pronounce — the row already shows word+meaning, so a tap-to-card would just repeat it; audio is
  // the missing value for review. Same GTTts path the card's speak button uses (word + its reading).
  const speak = document.createElement('button');
  speak.className = 'entry-speak';
  // Same monochrome speaker glyph as the card's pronounce button (.r-speak) so the two match.
  speak.innerHTML = IC_SPEAK;
  speak.title = 'Pronounce this word';
  speak.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag || !word || !window.GTTts) return;
    window.GTTts.speakText(word, reading || '');
    speak.classList.add('speaking');
    setTimeout(() => speak.classList.remove('speaking'), 600);
  });
  // ⤢ — the same control a History row has, on the same words (jek, 2026-08-13: "อยากได้ปุ่มขยายแบบที่
  // History Bar มี ... ให้มันมีปุ่มขยายด้วยในคำที่ Mark ดาว"). It opens the CARD, which is the thing the row
  // cannot be: the big readable pair, the movable surface, 🔊 with the reading, and the pos/senses the
  // row only has room to badge.
  //
  // Built from what vocab.json keeps, NOT looked up in historyList: vocab outlives history (that is the
  // whole reason they are two stores), so a word saved from a line that has since aged out of the 2000
  // still opens. Everything the card draws for a word entry — th, en, reading, pos — is already here;
  // `forms`/`example` were never saved, and the card simply omits what it isn't given.
  const asPayload = () => {
    const p = { en: word, th: meaning, pronunciation: reading, pos: v.pos || '', ts: v.ts || 0, __vocab: wordKey(word) };
    if (v.senses) p.senses = v.senses;
    // The mark on the card's source line comes from the same flags a live payload carries, so a word
    // opened from ★ shows the origin its row shows (srcOf reads flags; vocab stores the kind by name).
    if (v.from === 'cc') p.live = true;
    else if (v.from === 'speak') { p.typed = true; p.spoken = true; } // both, exactly as the live payload carries them
    else if (v.from === 'type') p.typed = true;
    else if (v.from === 'point') p.point = true;
    return p;
  };
  const openBtn = document.createElement('button');
  openBtn.className = 'entry-open';
  openBtn.innerHTML = IC_EXPAND;
  openBtn.title = 'Show the full card — hear it, and any meaning / example';
  openBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (didDrag) return;
    // Same toggle as History's ⤢: a second tap on the row whose card is up closes it. Matched on the
    // WORD, not ts — reopening rebuilds the payload each time, so identity would never match.
    if (!result.hidden && lastPayload && lastPayload.__vocab === wordKey(word)) hideResult();
    else reopenCard(asPayload());
  });
  top.appendChild(body);
  top.appendChild(openBtn);
  top.appendChild(speak);
  top.appendChild(star);
  entry.appendChild(top);
  return entry;
}

// ---- Holding subtitles still while you pick a word out of them ---------------------------------
// CC files a row every ccIntervalMs, and addEntry used to prepend it and yank the scroller back to
// the top unconditionally — so the list you were reaching into moved out from under your finger
// about once a second. That is the whole reason picking a word out of a line that already went past
// was unpleasant: the row was there, tapping it was not (jek, 2026-08-12).
//
// Rows that arrive while the History list is OPEN are parked here instead, behind a chip that says
// how many are waiting. Nothing is lost — historyList already holds them (onTranslation unshifts
// before addEntry runs), so this only defers the DOM, and any full render shows them all.
// Only LIVE rows are held: a snip or a typed lookup made with the panel open is something you just
// did on purpose, and it belongs where you can see it land.
// A COUNT, not the payloads: onTranslation has already unshifted every one of them into historyList,
// so the rows exist — the only thing being deferred is drawing them, and a full render draws them
// from the list. Holding a second copy of each payload would have been a growing duplicate of a list
// that is already capped. Clamped to histCap for the same reason: past that, historyList has dropped
// the oldest and the number would promise rows that no render can produce.
let ccHoldN = 0;
let ccHoldChip = null; // the "N new lines" button pinned to the top of the scroller
function ccHolding(payload) {
  return !!(payload && payload.live) && panelMode === 'history' && histMode === 'all';
}
function clearCcHoldChip() {
  if (ccHoldChip) ccHoldChip.remove();
  ccHoldChip = null;
}
function updateCcHoldChip() {
  if (!ccHoldN) { clearCcHoldChip(); return; }
  if (!ccHoldChip) {
    ccHoldChip = document.createElement('button');
    ccHoldChip.type = 'button';
    ccHoldChip.className = 'hist-new';
    ccHoldChip.addEventListener('click', flushCcHold);
  }
  ccHoldChip.textContent = window.i18n.t('chip.ccNew').replace('{n}', ccHoldN);
  if (ccHoldChip.parentNode !== logEl || logEl.firstChild !== ccHoldChip) logEl.prepend(ccHoldChip);
}
// Let the parked rows down — through renderHistory, NOT a prepend loop of my own. Building the rows
// here in one go was the first version and it does not survive the real usage: CC files a line every
// ccIntervalMs, so a panel left open through a cutscene queues hundreds, and this file has already
// measured what that costs (see appendRows — 90 rows ≈ 30ms of blocked main thread, which is why the
// chunked painter exists at all). A full render pays the same 12-rows-now-30-per-frame budget no
// matter how many are waiting, and it cannot drift from historyList because it IS historyList.
// No .fresh entrance either way: a hundred rows animating at once reads as a glitch, and the chip
// disappearing already answers what the click did.
function flushCcHold() {
  if (!ccHoldN) { clearCcHoldChip(); return; }
  ccHoldN = 0;
  clearCcHoldChip();
  renderHistory(); // resets the hold state itself too — this stays for the paths that don't render
}

function addEntry(payload) {
  if (histMode !== 'all') return; // history rows only in the History tab
  // ...and only rows the current lens is showing. A subtitle appended into a list filtered to snips
  // would be a row that the same filter hides on the next full render — there and then not there.
  if (histSrc !== 'all' && srcOf(payload) !== histSrc) return;
  if (histQuery && !matchesQuery(payload)) return; // mid-search: never inject a row that doesn't match
  if (ccHolding(payload)) { ccHoldN = Math.min(ccHoldN + 1, histCap); updateCcHoldChip(); return; }
  // Fresh lookup: renderHistory() recreates the empty-state as a NEW node when the list is empty,
  // so a captured-at-boot reference goes stale and the blurb stayed behind on top of real entries.
  const es = document.getElementById('emptyState');
  if (es) es.remove();
  const row = makeEntry(payload);
  row.classList.add('fresh'); // entrance animation — only here, never on a full re-render (see .fresh in CSS)
  row.addEventListener('animationend', () => row.classList.remove('fresh'), { once: true });
  logEl.prepend(row); // newest at the top, right under the type box
  if (ccHoldChip) logEl.prepend(ccHoldChip); // a live row is still waiting — the chip stays the top line
  logEl.scrollTop = 0;
}

// History vs ★ Saved tab. History rows come from the running list (mirror of main's history file);
// Saved rows come from the vocab collection.
let histMode = 'all';
let sessionOnly = false; // History tab: show only the current session's lookups (a lens, see currentSessionTs)
let historyList = [];
// Remember each tab's scroll position so switching History↔Saved keeps your place instead of jumping.
// null = never viewed yet → use the tab's default (History bottom / newest, Saved top).
const scrollPos = { all: null, saved: null };
// What's currently typed in the type box, lowercased. Non-empty = the list below acts as SEARCH
// RESULTS over what you've already looked up (both sides: source text and translation), so typing a
// word you met before answers instantly with your own past card instead of a fresh lookup.
let histQuery = '';
function setQuery(q) {
  const next = String(q || '').trim().toLowerCase();
  if (next === histQuery) return;
  histQuery = next;
  if (histMode === 'saved') renderSaved(); else renderHistory();
}
function matchesQuery(p) {
  if (!histQuery) return true;
  return `${p.en || ''} ${p.th || ''} ${p.meaning || ''}`.toLowerCase().includes(histQuery);
}

// Build every row OFF the document and attach them in one go. Appending straight into the live
// scroller made the browser re-do layout for each row while a height transition was running on the
// same box — with a real history (90 rows ≈ 1200 nodes) that is ~30ms of blocked main thread landing
// exactly on the frame the panel starts moving, which is the hitch jek sees as the scrollbar appears.
// A fragment costs one layout instead of N.
let rowJob = 0; // bumped per render; a pump from an older render must not feed the new list
function appendRows(items, make) {
  const job = ++rowJob;
  logEl._wantScrollTop = null; // a fresh list invalidates any restore the previous one was chasing
  const put = (list) => {
    const frag = document.createDocumentFragment();
    for (const it of list) frag.appendChild(make(it));
    logEl.appendChild(frag);
  };
  // The scroller is 190px — about four rows. Everything past that is below the fold, so paint a
  // screenful NOW and let the rest arrive over the following frames. Building a row is not cheap
  // (a <span> and a click listener per WORD), so a 90-row history cost ~30ms in one blocking go,
  // spent BEFORE the panel was allowed to start its height slide — the panel just sat there, and
  // the scrollbar appeared at the end of it. That dead pause is the lag.
  const FIRST = 12;
  put(items.slice(0, FIRST));
  if (items.length <= FIRST) return;
  let i = FIRST;
  const pump = () => {
    if (job !== rowJob) return; // a newer render replaced this list — drop this one on the floor
    put(items.slice(i, i + 30));
    i += 30;
    // Rows landing after the fact change scrollHeight, so a restore aimed past the current end would
    // have been clamped. Re-apply it as the list grows into range.
    if (logEl._wantScrollTop != null) logEl.scrollTop = logEl._wantScrollTop;
    if (i < items.length) requestAnimationFrame(pump);
    else logEl._wantScrollTop = null;
  };
  requestAnimationFrame(pump);
}
function renderHistory() {
  evictWordBubbleFromList(); // it may be inside a row that is about to be thrown away
  logEl.innerHTML = '';
  // A full render draws from historyList, which already contains everything the chip was holding —
  // so the queue is answered, not dropped. Reset it here (and in renderSaved) or the chip node, wiped
  // with the innerHTML above, would be re-prepended as a stale orphan by the next live row.
  ccHoldN = 0; ccHoldChip = null;
  // Searching: show only the rows that match, with a plain "nothing here yet" when none do — the
  // normal how-to empty state would be wrong/confusing as a no-results message.
  if (histQuery) {
    // Search obeys the active scope: with "this session" on, you're searching within the session you
    // chose, not silently across all history (which left the chip claiming a scope it wasn't applying).
    let pool = bySrc(historyList);
    if (sessionOnly) { const ses = currentSessionTs(); pool = historyList.filter(p => ses.has(p.ts)); }
    const hits = pool.filter(matchesQuery);
    if (!hits.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = window.i18n.t(sessionOnly ? 'empty.searchSession' : 'empty.searchNone');
      logEl.appendChild(e);
      return;
    }
    appendRows(hits, makeEntry);
    logEl.scrollTop = 0; // best match context is at the top when searching, not the bottom
    return;
  }
  if (!bySrc(historyList).length) {
    const e = document.createElement('div');
    e.className = 'empty'; e.id = 'emptyState';
    // One trigger, so the split is by STYLE, not by platform: what the first-time user has to be told
    // is what to do with the key, and holding vs pressing is the whole of that difference.
    e.innerHTML = window.i18n.t(snipStyleNow() === 'hold' ? 'empty.state.hold' : 'empty.state.press')
      .replace('{sc}', SNIP_HINT); // live trigger, not the ⌘⇧S it shipped with
    logEl.appendChild(e);
    return;
  }
  // Session lens: same rows, just narrowed to the current burst of lookups.
  let rows = bySrc(historyList);
  if (sessionOnly) {
    const ses = currentSessionTs();
    rows = historyList.filter(p => ses.has(p.ts));
    if (!rows.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = window.i18n.t('empty.sessionNone');
      logEl.appendChild(e);
      return;
    }
  }
  appendRows(rows, makeEntry); // newest→oldest, newest at the top (historyList.unshift)
  // Newest lives at the TOP (index 0). Land on it — scrollHeight scrolled to the BOTTOM, i.e. the
  // OLDEST word, every time renderHistory ran directly (e.g. toggling the "this session" scope off).
  // Left over from when history was appended newest-at-bottom, chat-style; the unshift flipped it.
  logEl.scrollTop = 0;
}
function switchTab(mode) {
  // 'all' | 'saved' (★ filter inside History). Re-click = no-op.
  if (mode === histMode) return;
  scrollPos[histMode] = logEl.scrollTop; // remember where we were on the tab we're leaving
  // No height animation here on purpose: the only caller is setPanelPage, which already measured the
  // box before this ran and animates it after. Animating here too would start a second transition on
  // the same element mid-swap — a hitch on top of the one it was meant to remove.
  histMode = mode;
  if (mode === 'saved') renderSaved();
  else renderHistory();
  // Restore the entered tab's scroll (after layout settles). First-ever view falls back to the
  // default the render already applied — History at the bottom (newest), Saved at the top.
  const saved = scrollPos[mode];
  // _wantScrollTop keeps the target alive while appendRows is still pumping rows in — without it a
  // restore deep into a long list lands before the rows exist and gets clamped to the current end.
  if (saved != null) { logEl._wantScrollTop = saved; requestAnimationFrame(() => { logEl.scrollTop = saved; }); }
  syncScopeChip();
}

// The "this session" chip belongs to the History tab only — a session lens over a saved collection
// (Vocab) is meaningless. Hidden there; shown on History.
const scopeSessionBtn = document.getElementById('scopeSession');
const histSrcFilter = document.getElementById('histSrcFilter');
const histLensTop = document.getElementById('histLensTop'); // scope chip + ★, above the source strip
function syncScopeChip() {
  scopeSessionBtn.hidden = histMode !== 'all';
  // Same rule as the scope chip: this lens is about History rows, and the Vocab tab has none.
  // The strip is the lens itself now — ★ is one of its options — so it stays up in both modes.
  if (histSrcFilter) { histSrcFilter.hidden = false; buildSrcFilter(); }
  scopeSessionBtn.classList.toggle('active', sessionOnly);
}
scopeSessionBtn.addEventListener('click', () => {
  sessionOnly = !sessionOnly;
  syncScopeChip();
  renderHistory();
});

// ---- The ★ list as a TIMELINE ---------------------------------------------------------------------
// jek, 2026-08-12: "give timeline like history to star marking word". The list was already newest-first
// but read as one undifferentiated pile — you could see a word was 3d old only by reading its own row,
// so "what did I keep today" meant counting. Day headings turn the same rows into a record you can
// scan, and they are the list-shaped answer to the number now sitting on the pill.
const startOfDayMs = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
function dayHeadLabel(day) {
  const today = startOfToday();
  if (day === today) return window.i18n.t('day.today');
  if (day === today - 86400000) return window.i18n.t('day.yesterday');
  const d = new Date(day);
  // The year only when it isn't this one — a list of "12 Aug 2026" rows in 2026 spends width saying
  // nothing. Locale-formatted so a Thai UI gets Thai months.
  return d.toLocaleDateString(undefined, d.getFullYear() === new Date().getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}
// Interleaves heading markers into the row list. Done as ITEMS rather than by rendering groups so the
// chunked painter in appendRows is untouched — it walks a flat list and appends one node per item, and
// a heading is just another node.
function withDayHeads(list) {
  const out = [];
  // Separate declarations on purpose: check-invariants' declaration scan reads only the FIRST name in
  // a `let a = …, b = …`, so the second one reports as an undeclared global.
  let cur = null;
  let head = null;
  for (const v of list) {
    const ts = Number(v && v.ts) || 0;
    const day = ts ? startOfDayMs(ts) : 0;
    if (day !== cur || !head) { cur = day; head = { __day: day, n: 0 }; out.push(head); }
    head.n++;
    out.push(v);
  }
  return out;
}
function makeDayHead(h) {
  const el = document.createElement('div');
  el.className = 'day-head';
  const label = document.createElement('span');
  // A day with no timestamp at all is possible: the pre-main-process store saved words without one.
  label.textContent = h.__day ? dayHeadLabel(h.__day) : window.i18n.t('day.unknown');
  const n = document.createElement('span');
  n.className = 'day-head__n';
  n.textContent = window.i18n.t('day.words').replace('{n}', h.n);
  el.appendChild(label);
  el.appendChild(n);
  return el;
}
const makeSavedRow = (it) => (it && it.__day !== undefined ? makeDayHead(it) : makeVocabEntry(it));

// Render the ★ Saved view — the vocab collection, newest first.
function renderSaved() {
  evictWordBubbleFromList(); // see renderHistory — same scroller, same one bubble element
  logEl.innerHTML = '';
  ccHoldN = 0; ccHoldChip = null; // see renderHistory — the ★ list owns the scroller now
  // Same search behaviour as History — typing filters your saved words (word / reading / meaning).
  if (histQuery) {
    const hits = savedVocab.filter(v => `${v.word || ''} ${v.reading || ''} ${v.meaning || ''}`.toLowerCase().includes(histQuery));
    if (!hits.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = window.i18n.t('empty.savedMatch');
      logEl.appendChild(e);
    } else {
      appendRows(hits, makeVocabEntry);
      logEl.scrollTop = 0;
    }
    return;
  }
  if (!savedVocab.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = window.i18n.t('empty.savedNone');
    logEl.appendChild(empty);
  } else {
    const known = savedVocab.filter(v => getSeen(v) >= getGradSeen()).length;
    const hdr = document.createElement('div');
    hdr.className = 'saved-head';
    hdr.textContent = window.i18n.t('head.recognise').replace('{a}', known).replace('{b}', savedVocab.length);
    logEl.appendChild(hdr);
    // Sorted before grouping, not assumed sorted: the store is newest-first in normal use (every add
    // unshifts), but a heading list built off an out-of-order array repeats the same day further down,
    // which looks like data loss. A copy — savedVocab itself stays whatever main sent.
    const byNewest = savedVocab.slice().sort((a, b) => (Number(b && b.ts) || 0) - (Number(a && a.ts) || 0));
    appendRows(withDayHeads(byNewest), makeSavedRow);
  }
}

// Re-show a past translation's card.
function reopenCard(payload) {
  // Opening an OLD line while CC is running: the next subtitle would land on top of it about a second
  // later (onTranslation → showResult), so the card you asked for was gone before a word in it could
  // be tapped. Reopening from the list is an explicit "this line, not the live one" — hold the card
  // until the panel closes (setPanel), which is also when the list stops being held still.
  if (liveMode && panelMode === 'history' && !liveCardMuted) { liveCardMuted = true; liveMuteAuto = true; }
  lastPayload = payload;
  syncAiBtn(payload);
  lastWord = payload.en || payload.th;
  setHint(restingHint());
  showResult(payload);
}

function clearLog() {
  historyList = [];               // clear the History data too (Saved vocab is kept — it's separate)
  if (histMode === 'all') renderHistory();
  else renderSaved();
  // Also drop any parked translation from the pill, so a clear (button OR ⌘⇧X) resets the vocab.
  lastWord = ''; lastPayload = null; pillShowingXlate = false; refreshXlate();
}

// The window is a fixed transparent canvas that ignores the mouse by default, so
// element mouseenter/leave don't fire. Everything — click-through, hover, drag —
// is driven from the pointer position and what's under it. Forwarded mousemove
// events still arrive while the window is click-through, so we can detect the
// cursor entering the pill and flip the window interactive.
const DRAG_THRESHOLD = 4;
const PANEL_IDLE_MS = 6000; // base delay before an open Settings/History panel closes itself
// Every bar now gets out of the way on its own, on the same principle the card has always used: the
// clock only runs while you are not touching it, and it runs longer when there is more to read.
// Settings is a fixed set of controls, so a flat delay is the whole of it. History is a list, so it
// earns time per row — capped, because a 200-entry log should not mean a panel that never leaves.
const PANEL_IDLE_PER_ROW_MS = 250;
const PANEL_IDLE_MAX_MS = 15000;
function panelIdleMs() {
  if (panelMode !== 'history') return PANEL_IDLE_MS;
  const rows = logEl.querySelectorAll('.entry').length;
  return Math.min(PANEL_IDLE_MS + rows * PANEL_IDLE_PER_ROW_MS, PANEL_IDLE_MAX_MS);
}
const IDLE_MS = 3000;       // after this long resting, the pill shrinks to a quiet dot (Wispr-style)
let interactive = false, overPill = false, leaveTimer = null, panelIdleTimer = null, idleTimer = null;
// Whether the open panel is counting down is ONE question, so it gets ONE answer. It used to be
// decided only inside the mousemove handler, which meant the countdown could only ever START on a
// cursor move: open a panel and leave the mouse alone — the commonest way to use it, and the only
// way while a game holds the pointer — and nothing was ever armed, so the panel sat open forever.
// Measured 2026-08-06: cursor parked, `near:false`, panel still open after 24s with no timer set.
// Both callers (the panel opening, and the cursor moving) route through here now.
function armPanelIdle(el, { restart = true } = {}) {
  // A countdown that is already running is not restarted by a cursor that is somewhere ELSE. Moving
  // the mouse used to reset this from anywhere on screen, and over a game the mouse never stops —
  // so the panel sat open through everything, which is what "มันก็นานระดับหนึ่งแล้ว แต่ทำไม Setting bar
  // มันยังไม่ vanish" was (jek, 2026-08-09). Being near it is what counts as using it; the caller says
  // which of the two this is.
  if (!restart && panelIdleTimer) return;
  clearTimeout(panelIdleTimer);
  if (!panelMode || !autoHidePanel) return;
  const overMenu = !!(el && el.closest && el.closest('.pill, .panel'));
  const ae = document.activeElement;
  // TEXT-ENTRY fields only. `input, textarea` caught the checkboxes and the sliders too, and those
  // keep focus after you click them — so flipping one toggle in Settings left auto-hide switched off
  // for as long as that checkbox stayed focused, which reads as "auto-hide stopped working". Nothing
  // is lost by closing the panel while a checkbox is focused; that's only true of a field you type
  // into. A merely-focused BUTTON (the ⚙ you clicked to open the panel) must not block it either, or
  // the panel never closes at all. (jek, 2026-07-31)
  // ...and EMPTY doesn't count either. Opening the Type page focuses its field on purpose, so
  // History/Type opened normally always had a focused text input and could therefore NEVER auto-close.
  // The rule these carve-outs were reaching for is about losing WORK, and an empty field has none.
  // (jek, 2026-08-05)
  const typingInPanel = !!(ae && panel.contains(ae)
    && ae.matches('textarea, input:not([type]), input[type="text"], input[type="password"], input[type="search"], input[type="number"], input[type="email"], input[type="url"]')
    && String(ae.value || '').trim() !== '');
  // A snip/translation moving the cursor into the game must NOT count as "left the panel" — keep it
  // open while a read is in flight and while the card it produced is still on its way out. `!result
  // .hidden` alone was wrong and silently so: with Card stays = Never, a card sits there until you
  // dismiss it, so `busy` stayed true forever and auto-hide never fired again after your first
  // translation. A card that closes itself is a moment to read; a card that waits for you is just
  // something on screen. (jek, 2026-07-31)
  // A CARD ON SCREEN NO LONGER COUNTS. It used to: `!result.hidden && HOLD_MS > 0` kept the panel
  // alive for as long as a translation was showing, on the reasoning that a snip moves your cursor
  // into the game and that should not read as "left the panel". But the card and the panel are two
  // surfaces in one stack — the card does not cover the panel, and reading one is not using the
  // other. What it actually produced was a Settings page that would not close while any card was up,
  // which with a live CC card or Card stays = Never is forever (jek, 2026-08-09: "Setting bar ก็ควรจะ
  // vanish เองตามเวลาของมัน ถ้าไม่มีอะไรไป over ตัว Setting bar ... รวมถึงตัว History bar ด้วย").
  //
  // `translating` stays. That one is a read IN FLIGHT — a second or two, ending on its own, during
  // which the panel is the thing you are waiting in front of. Cursor-on-the-panel and typing-in-it
  // still veto, which is the whole of "something is over it".
  const busy = translating;
  if (!overMenu && !typingInPanel && !busy) { panelIdleTimer = setTimeout(() => setPanel(null), panelIdleMs()); return; }
  // BLOCKED — and being blocked has to expire on its own. This line used to be absent, so a call that
  // found a reason not to arm cleared the timer and left nothing behind, and the only things that
  // ever call back are a mouse move, opening the panel, and focusing the type field. None of them
  // happens when the reason simply STOPS being true: translate something with the panel open, let the
  // card time out, and the panel it was blocking sits there for good. Over a game that is the normal
  // case rather than the corner one — the game holds the pointer, so no move is coming to save it.
  // Re-asking beats notifying every place a blocker can clear: `busy` alone is two conditions across
  // three files, and a notifier that misses one puts the bug straight back.
  // Caught by the audit as "never auto-hid in 30s", which was then written off as flaky because it
  // passed on the next run — it passed because that run happened to get a mouse move. (2026-08-09)
  panelIdleTimer = setTimeout(() => armPanelIdle(elementUnderCursor()), 1000);
}
// What the mouse is actually on, for callers that have no event to read it from (a panel opened by
// click or shortcut). Uses the fed cursor, which keeps arriving while the app is inactive.
function elementUnderCursor() {
  if (lastCursorX == null) return null;
  return document.elementFromPoint(lastCursorX, lastCursorY);
}

let translating = false; // a snip/translation is mid-flight — don't let auto-hide close the open panel
// The panel a snip hid, remembered so it can be brought back if the snip produces nothing (cancelled or
// no text found). A real result clears this (showResult) so a successful snip leaves the panel closed —
// you got a translation to read in its place. { mode:'history'|'settings', page:'type'|'hist'|'vocab' }.
let snipRestore = null;
let snipRestoreTimer = null; // the pending "restore after an empty snip" timer — cancelled if a new snip starts
function restoreSnipPanel() {
  if (!snipRestore) return;
  // A pill that is tucked has been told to get out of the way, and putting its panel back on screen
  // over a hidden pill is the state jek photographed: a panel sitting open with nothing above it.
  // The intent belongs to a snip that is now over, so drop it rather than defer it — tuckRestore
  // already handles "bring back what was open" for the tuck itself, and running both would fight.
  // Guarded here rather than at the two call sites (2565, 3725) so a third caller cannot reopen it.
  if (hiddenAway()) { snipRestore = null; return; }
  const r = snipRestore; snipRestore = null;
  setPanel(r.mode);
  if (r.mode === 'history' && r.page) setPanelPage(r.page);
}
let speaking = false;    // the mic is live (⌘⇧M / pill mic button) — see the voice section near the bottom

// Auto-hide removed by request — the pill never tucks itself. It only hides when you click the dot
// (see below), and comes back when you click the tab / a translation / status / snip arrives.
function maybeIdle() { /* no-op: no auto-tuck */ }
function bumpActivity() { clearTimeout(idleTimer); }
let locked = false; // Lock mode (⌘⇧L): pill is fully click-through so it can't be hovered/clicked mid-game.
let dragArmed = false, dragging = false, dragX = 0, dragY = 0;
// The hovered button's label chip travels with the pill during a drag (see the mousemove handler).
// tipRideX/Y are the drag offsets at the moment the ride started, so the chip's shift is a plain delta.
let tipRiding = false, tipRideX = 0, tipRideY = 0;
// Where the stack is parked inside the full-screen canvas (0,0 = default bottom-centre).
// Persisted across drags so the pill stays where you leave it.
let dragOffX = 0, dragOffY = 0;
const wrapEl = document.getElementById('wrap');
const dropEl = document.getElementById('drop'); // card + panel stack (see updateDropRoom)
let wrapFlipped = false; // true = the stack hangs BELOW the pill (parked high); see updateDropRoom

// The pill vacuums to one of 45 snap spots — 5 columns × 9 rows — so it always lands somewhere
// sensible and can never be dropped off-screen. Anchors are (x,y) CSS drag-offsets from the default
// bottom-centre; recomputed each time so a display change stays correct.
// The card/panel stack only ever grows UP from the pill (see updateDropRoom), so the pill must never
// park higher than the stack's own minimum height — there'd be nowhere to draw it and the panel got
// sliced off by the top of the screen. Every place that clamps or anchors dragOffY goes through this.
const GAP = 16;      // breathing room kept between the stack and the screen edge it grows toward
// Hysteresis on the one test that can send the stack back above the pill: returning needs this many px
// more headroom than leaving did, so a stack sitting exactly on the boundary can't buzz between sides.
const FLIP_MARGIN = 24;
const DROP_MIN = 0;  // the stack flips to the roomier side (see updateDropRoom), so the pill itself
                     // no longer has to reserve height — it may park against either edge.
function maxUpTravel() { return Math.max(0, window.innerHeight - 80 - DROP_MIN); }
// NINE rows, every column (jek, 2026-07-31). Five stops (b/q/m/u/t) put the vertical anchors a
// quarter of the screen apart — ~340px on a 1440px display — so the height you actually wanted was
// almost never one of them and the pill sailed off to the nearest quarter. Nine halves that gap.
// Read bottom→top: b, 1, q, 2, m, 3, u, 4, t. The five original letters keep their exact old
// positions and the four new stops in between are digits, so they can't be mistaken for a column
// letter and a dock saved by an older build still resolves unchanged.
function dockRows() {
  const maxUp = maxUpTravel();
  const at = (eighths) => -Math.round(maxUp * eighths / 8);
  return { b: at(0), 1: at(1), q: at(2), 2: at(3), m: at(4), 3: at(5), u: at(6), 4: at(7), t: at(8) };
}
function dockAnchors() {
  const maxX = Math.max(0, window.innerWidth / 2 - 182); // 182 = half the EXPANDED pill/card (~168) + margin, so a side dock doesn't clip when it grows on hover
  // FIVE columns (jek, 2026-07-31). With only l/c/r the horizontal stops were half a screen apart —
  // on a 2560px display ~1100px between them. Column letters read left→right: l, w(est of centre),
  // c, e(ast of centre), r; l/c/r keep their old meaning.
  const halfX = Math.round(maxX / 2);
  const cols = { l: -maxX, w: -halfX, c: 0, e: halfX, r: maxX };
  const rows = dockRows();
  const out = {};
  for (const r in rows) for (const c in cols) out[r + c] = [cols[c], rows[r]];
  return out;
}
// Move the pill to a named dock spot. animate=true plays the magnetic "vacuum" glide.
let curDock = 'bc'; // which spot the pill currently occupies (for the CC auto-move)
function applyDock(key, animate) {
  const a = dockAnchors();
  const [x, y] = a[key] || a.bc;
  curDock = a[key] ? key : 'bc';
  dragOffX = x; dragOffY = y;
  if (animate) wrapEl.classList.add('snapping');
  applyDragOffset();
  // The dock just moved the pill, so a tuck measured against the old spot no longer reaches the
  // edge. Re-derive it here rather than at the call sites — this is the only place dragOffX changes
  // without the user dragging, and every one of those cases (launch, dock button, live mode,
  // display change) has to keep a tucked pill tucked.
  applyTuckOffset();
  // updateDropRoom() measures the pill's live rect, which during an animated snap is still the OLD
  // spot — measuring only here sized the stack for where the pill WAS. Snapping up from the bottom
  // therefore kept the bottom's huge allowance and the panel ran off the top of the screen. Measure
  // now (correct for animate=false) AND again once the glide has landed.
  updateDropRoom();
  if (animate) setTimeout(() => { wrapEl.classList.remove('snapping'); updateDropRoom(); }, 240);
}
// The canvas can get its real size AFTER the dock was first applied (launch timing, display
// changes) — re-derive the anchor so the remembered spot is honoured, not a stale-geometry one.
// A tucked pill used to be skipped here, back when applyDock would have shoved it back on screen.
// It re-derives the tuck now, so a display change while tucked keeps the tab at the new edge
// instead of stranding it at an offset measured for a screen that no longer exists.
window.addEventListener('resize', () => { if (!dragging) applyDock(curDock, false); });

// After a drag, vacuum to whichever of the 45 spots is nearest and remember it for next launch.
function snapToNearestDock() {
  const a = dockAnchors();
  let best = 'bc', bestD = Infinity;
  for (const k in a) {
    const dx = dragOffX - a[k][0], dy = dragOffY - a[k][1], d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = k; }
  }
  applyDock(best, true);
  window.api.setSettings({ dock: best });
  try { localStorage.setItem('gt.dock', best); } catch {} // renderer-side cache for warp-free launch
}
// Release of a TUCKED drag: the tab slid up/down the edge, so snap to the nearest of the five ROWS
// (b/q/m/u/t) and leave dragOffX exactly as tuck() found it — --tuck-x was derived from it, and
// shifting X here is the stale-offset bug the armDrag comment warns about. curDock keeps its column
// letter so the remembered dock (and the resize re-anchor, which only runs untucked) stays consistent
// with where the pill actually is.
function snapTuckedRow() {
  const rows = dockRows(); // the same nine stops the untucked docks use — one source, never two
  let bestRow = 'b';
  for (const r in rows) if (Math.abs(dragOffY - rows[r]) < Math.abs(dragOffY - rows[bestRow])) bestRow = r;
  dragOffY = rows[bestRow];
  wrapEl.classList.add('snapping');
  applyDragOffset();
  updateDropRoom(); // and again after the glide lands — the rect is stale mid-transition (see applyDock)
  setTimeout(() => { wrapEl.classList.remove('snapping'); updateDropRoom(); }, 240);
  // Persist only if the row+column pair is a REAL anchor. Every column now carries all five rows, so
  // this holds for any combination — the guard stays because an unknown key would make applyDock fall
  // back to 'bc' on the next launch and warp the pill to the bottom.
  const key = bestRow + curDock[1];
  if (!dockAnchors()[key]) return;
  curDock = key;
  window.api.setSettings({ dock: curDock });
  try { localStorage.setItem('gt.dock', curDock); } catch {}
}
function applyDragOffset() {
  // Clamp so the pill can't be dragged fully off-screen (keep a margin visible).
  const maxX = Math.max(0, window.innerWidth / 2 - 182); // 182 = half the EXPANDED pill/card (~168) + margin, so a side dock doesn't clip when it grows on hover
  const maxUp = maxUpTravel(); // travel up from the bottom, minus the room the stack needs above
  dragOffX = Math.max(-maxX, Math.min(maxX, dragOffX));
  // 0 (not +40) is the floor: the default resting spot already sits just above the bottom edge, so
  // any downward travel pushed the pill off the bottom and clipped it in half. Never go below 0.
  dragOffY = Math.max(-maxUp, Math.min(0, dragOffY));
  document.documentElement.style.setProperty('--drag-x', dragOffX + 'px');
  document.documentElement.style.setProperty('--drag-y', dragOffY + 'px');
  // Every frame of the drag, not just the release: the stack has to pick its side and its height
  // WHILE you move, or dragging a pill with the card/panel open pushes them off-screen until you let
  // go — which is what made it feel like everything had to be closed first.
  updateDropRoom();
  // The backdrop stays where it was photographed while the stack slides across it — the parallax
  // that makes it read as a window onto the desktop instead of a picture printed on the pill. Only
  // rects and style writes; the capture waits for the release (see mouseup).
  alignGlass();
}

// ---- Edge-tuck hide/show: the pill vacuums out toward whichever side it's parked on, leaving only
// a small TAB visible at the screen edge (bookmark-style). Replaces the old ghost-fade idle. Two ways
// in: the idle timer (maybeIdle → tuck, above) and the manual tuck button. Auto-untucks on a new
// translation / status hint / snip; manual untuck is a click on the tab.
const TUCK_TAB = 26; // px of the pill left on screen when tucked
let tucked = false, tuckSide = 'right', tuckOutTimer = null;
let tuckRestore = null; // what was open when the pill was hidden, so unhiding can put it back
function tuck() {
  if (tucked) return;
  // 'behind' retreats by LEVEL, not by position. Nothing slides, nothing hides, no card or panel is
  // torn down — the pill stays exactly where it is and simply stops being the top window, so whatever
  // you click next covers it the way one ordinary window covers another. Returning here rather than
  // guarding each step below is deliberate: every line after this describes a glide that must not
  // happen, and a style that only half-skips it would leave the pill parked at the edge with no tab.
  if (sinksItself()) {
    tucked = true;
    window.api.sinkPill(true);
    updateUI();
    return;
  }
  // A card/panel above the pill rides the pill's glide out and FADES with it, instead of snapping
  // away instantly (which read as "lag" against the smooth pill tuck). They're hidden for real once
  // the glide finishes; auto-untuck (new translation) cancels the pending hide and brings them back.
  const hadCard = !result.hidden, hadPanel = !!panelMode, hadCoach = !coachEl.hidden;
  // Hiding the pill is "get out of my way for a moment", not "close what I had open" — so remember it
  // and put it back on unhide (jek). Without this, tucking silently threw away an open Settings page
  // and the card you were reading, which also contradicts every other bar now staying until closed.
  tuckRestore = { card: hadCard, panel: panelMode };
  if (hadCard) result.classList.add('tuck-out');
  if (hadCoach) coachEl.classList.add('tuck-out');
  if (hadPanel) panel.classList.add('tuck-out');
  clearTimeout(tuckOutTimer);
  if (hadCard || hadPanel || hadCoach) tuckOutTimer = setTimeout(() => {
    if (!tucked) return; // untuck() already cancelled + un-faded them
    // Hide FIRST (while still faded to opacity 0), THEN drop tuck-out — removing the class first would
    // flash the element back to opacity 1 for a frame before it hid ("blinks"). Skip the panel's own
    // 170ms close animation (hidden=true makes setPanelVisible early-return) — the fade already exited.
    if (hadCard) { hideResult(); result.classList.remove('tuck-out'); }
    if (hadPanel) { panel.hidden = true; setPanel(null); panel.classList.remove('tuck-out'); }
    // The coach is HIDDEN, not dismissed: someone who tucks the pill before reading it has not been
    // told the gesture yet, so it comes back when the pill does.
    if (hadCoach) { coachEl.hidden = true; coachEl.classList.remove('tuck-out'); coachPending = true; }
    tuckRestore = null; // they're gone for real now — a later unhide has nothing to put back
  }, 280);
  tucked = true;
  tuckSide = dragOffX >= 0 ? 'right' : 'left';
  pill.classList.add('tucked');
  wrapEl.classList.add('tuck-' + tuckSide); // enables the hover "peek" nudge (CSS --peek-x)
  updateUI(); // forces .open off (guarded by `tucked` in updateUI) so half-width below is really 110
  wrapEl.classList.add('tucking');
  applyTuckOffset();
  setTimeout(() => wrapEl.classList.remove('tucking'), 300);
}

// How far to slide so only TUCK_TAB is left showing. Split out of tuck() because the answer depends
// on where the pill currently sits, and that can change AFTER it is already tucked — at launch the
// saved dock is applied a moment later, and a display change moves it too. When it was computed once
// inside tuck(), the startup order (applyPillStyle tucks, then applyDock repositions) left a stale
// offset behind and the pill came to rest mid-screen as a 220px capsule with its contents faded out:
// hidden and in the way at the same time, which is the one outcome this style exists to avoid.
function applyTuckOffset() {
  // hiddenAway, not tucked: this pushes the pill to the screen edge and leaves a 26px tab. A sunk
  // pill never moved, so running this on it would shove a fully visible pill off the side.
  if (!hiddenAway()) return;
  const side = dragOffX >= 0 ? 'right' : 'left';
  if (side !== tuckSide) {
    wrapEl.classList.remove('tuck-' + tuckSide);
    wrapEl.classList.add('tuck-' + side);
    tuckSide = side;
  }
  // MEASURED, not derived. The arithmetic here used to model where the pill sits — screen centre,
  // plus the drag offset, minus half a collapsed pill — and that model was 177px out on this
  // layout: measured 2026-09-08, the tuck left 203px of pill on screen instead of the 26px tab,
  // which on a bright background is a grey slab sitting in the corner (jek sent a photo of it).
  // Reading the real position cannot drift when the wrap, the dock or the pill width changes.
  //
  // ...and MEASURED MEANS SETTLED, which a getBoundingClientRect() cannot promise: that rect is the
  // box as it looks RIGHT NOW, and every caller here arrives while something about it is still moving.
  //   • tuck() drops .open one line earlier (updateUI, guarded by `tucked`), so the pill is mid-collapse
  //     from 336px to 220px on .pill's --t-slow width spring. The pill is centred, so half of that
  //     116px is straight error: measured 2026-09-08 the tab landed at x=1952 on a 1920 screen — the
  //     pill left the screen entirely instead of leaving something to click, and every tuck goes
  //     through this state (the cursor is on the pill when you click the dot; a card or panel open is
  //     the other half).
  //   • applyDock(key, true) changes --drag-x and calls us with .snapping's transform transition in
  //     flight, so the rect is still at the OLD dock.
  // So read LAYOUT, not paint. offsetLeft/offsetWidth are pre-transform by definition — no glide can
  // contaminate them — and --drag-x is a number we already hold, so it is added rather than measured.
  // Only the width still needs pinning: suppressing the transition for the read cancels the running
  // spring, so offsetWidth answers with the 220px the pill is about to be. Clearing it afterwards
  // starts nothing, because by then the value it would animate from is the value it already has.
  // (A CSS class was tried for that and lost the cascade to .pill.style-dim's own transition, which
  // is declared later with the same specificity — the fix has to be inline to be unconditional.)
  const prevTransition = pill.style.transition;
  pill.style.transition = 'none';
  let layoutLeft = 0;
  for (let n = pill; n; n = n.offsetParent) layoutLeft += n.offsetLeft;
  const width = pill.offsetWidth; // forces the layout the line above needs anyway
  pill.style.transition = prevTransition;
  const left = layoutLeft + dragOffX;
  const tuckX = side === 'right'
    ? (window.innerWidth - TUCK_TAB - left)   // leave a TAB of the left edge showing
    : (TUCK_TAB - (left + width));            // …or of the right edge, on the other side
  document.documentElement.style.setProperty('--tuck-x', tuckX + 'px');
  scheduleTuckVerify();
}

// --tuck-x is a SNAPSHOT of three things: where the pill sits, how wide it is, and how wide the
// canvas is. It is re-derived at the moments we knew about — tuck(), applyDock(), window resize —
// and nothing notices when one of those inputs moves any other way. Every version of this bug has
// been that: 2026-09-08 the snapshot was taken from a formula that was 177px out and left a 203px
// slab; jek photographed another slab on 2026-09-08 evening, and 45 docks, an arriving card, a
// resize and a cold boot all measured a correct 26px afterwards — so the trigger is still unnamed.
//
// Naming it is not what makes this safe. Observing the inputs is: if the pill's box or the canvas
// ever changes while the pill is hidden away, the offset that hides it is recomputed from what is
// true now. That covers the triggers nobody has found yet, which is the only kind still capable of
// producing the photo. It cannot loop — applyTuckOffset writes a custom property that feeds a
// transform, and transforms do not change layout size, so observing size cannot be re-entered by
// its own write.
if (typeof ResizeObserver === 'function') {
  const reTuck = () => { if (hiddenAway()) applyTuckOffset(); };
  const ro = new ResizeObserver(reTuck);
  ro.observe(pill);
  // The canvas, for the display changes and window-bounds moves that arrive without a resize event.
  ro.observe(document.documentElement);
}

// And then check the answer. applyTuckOffset reads LAYOUT to dodge the transitions in flight, which
// is right, but it means the number is never compared against what actually got painted — and what
// got painted is the only thing jek can see. Once the glide has landed, measure the strip that is
// really on screen and nudge the offset by the difference.
//
// This is a correction, not a second derivation: it adds the drift to the value already there, so it
// converges even if the cause is something none of the inputs describe. It cannot fight the hover
// peek, which rides a different custom property (--peek-x, +/-16px in styles.css) and is subtracted
// out here rather than waited for. Idle cost is one rect read ~350ms after a tuck.
// A one-shot check 360ms after we set the value was tried first and MEASURED USELESS: forcing a
// stale --tuck-x of -20px left a 220px slab sitting there indefinitely, because nothing had called
// applyTuckOffset and so nothing had scheduled the check. That is the whole bug — the value goes
// wrong LATER, from something we did not do. So the check repeats for as long as the pill is
// hidden, and stops itself the moment it is not. One rect read per second against a cursor poll
// that already runs eight times a second (FOLLOW_POLL_MS) is not a cost worth optimising.
const TUCK_VERIFY_MS = 1000;
let tuckVerifyTimer = null;
function verifyTuck() {
  if (!hiddenAway()) { clearInterval(tuckVerifyTimer); tuckVerifyTimer = null; return; }
  const peek = parseFloat(getComputedStyle(wrapEl).getPropertyValue('--peek-x')) || 0;
  const b = pill.getBoundingClientRect();
  // How much of the pill a person can see, with the hover nudge taken back out.
  const shown = tuckSide === 'right'
    ? (window.innerWidth - b.left) + peek
    : b.right - peek;
  const drift = shown - TUCK_TAB;
  if (!Number.isFinite(drift) || Math.abs(drift) < 2) return;
  const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tuck-x')) || 0;
  document.documentElement.style.setProperty('--tuck-x',
    (cur + (tuckSide === 'right' ? drift : -drift)) + 'px');
  // Kept so the trigger can be named the next time it happens, instead of measured from a photo.
  (window.__tuckDrift = window.__tuckDrift || []).push({
    at: Date.now(), drift: Math.round(drift), was: cur, side: tuckSide,
    pillW: Math.round(b.width), vw: window.innerWidth, dock: curDock,
  });
}
function scheduleTuckVerify() {
  if (tuckVerifyTimer) return;               // already watching — one timer, not one per call
  tuckVerifyTimer = setInterval(verifyTuck, TUCK_VERIFY_MS);
}

function untuck({ auto = false } = {}) {
  if (!tucked) return;
  // Mirror of the branch in tuck(): come back to the top, keep the same put-it-back-after intent the
  // tucked styles use, and let armGhostSettle() sink it again once you have finished reading. That
  // shared intent is the whole reason this style lives inside tucksItself() — the pop-up-when-a-
  // translation-lands behaviour is not new code, it is the behaviour Tucked already had.
  if (sinksItself()) {
    if (auto) retuckAfterCard = true;
    tucked = false;
    window.api.sinkPill(false);
    armGhostSettle();
    bumpActivity();
    updateUI();
    return;
  }
  // Remember that the pill was hidden when the app un-hid it by itself, so the card's teardown can put
  // it back. showResult ran too late for this: by then "Reading…" (a status, and every status calls
  // untuck to be readable) had already un-hidden the pill, so `tucked` was false and the intent was
  // lost — which is why snipping from a hidden pill left it out (jek, 2026-07-30).
  if (auto) retuckAfterCard = true;
  tucked = false;
  armGhostSettle(); // whatever brought it out, Tucked takes it back once you're done
  const restore = tuckRestore;
  tuckRestore = null;
  // Cancel a pending tuck-out hide and un-fade the card/panel so they ride back in with the pill.
  clearTimeout(tuckOutTimer);
  result.classList.remove('tuck-out');
  panel.classList.remove('tuck-out');
  coachEl.classList.remove('tuck-out');
  if (coachPending && !localStorage.getItem('gt.coached')) { coachPending = false; coachEl.hidden = false; }
  pill.classList.remove('tucked');
  wrapEl.classList.remove('tuck-right', 'tuck-left'); // kill the hover peek so it can't fight the glide back in
  wrapEl.classList.add('tucking');
  document.documentElement.style.setProperty('--tuck-x', '0px');
  setTimeout(() => wrapEl.classList.remove('tucking'), 300);
  bumpActivity(); // back on screen — mark activity (auto-tuck was removed; tuck is manual only now)
  updateUI();
  // Sampling was skipped for the whole tuck (nothing to see through in a 26px tab), so whatever we
  // last photographed is from before it hid. Re-shoot once it has glided back in (300ms, above).
  scheduleGlass(340);
  // Bring back whatever the tuck took away. A quick unhide (inside the 280ms fade) never actually
  // closed them, so each half only acts when it really went — otherwise this would re-animate a
  // panel that never left.
  if (restore && !auto) {
    if (restore.panel && !panelMode) setPanel(restore.panel);
    if (restore.card && result.hidden && lastPayload) reopenCard(lastPayload);
  }
}
// stopPropagation: without it this click bubbles to the pill's own click listener below, which would
// see `tucked` already true (just set by tuck()) and immediately untuck again in the same event.
// The status dot (leftmost) IS the hide/show toggle: click it to tuck the pill to the edge, click it
// again (it stays visible as the tab when tucked to the right) to bring it back. stopPropagation so
// the click doesn't also bubble to the pill's untuck handler below.
dot.addEventListener('click', (e) => { e.stopPropagation(); if (didDrag) return; clearRetuck(); if (tucked) untuck(); else tuck(); });
// The whole left cap is the hide zone — the EN→TH brand toggles tuck like the dot (no hover label on
// either; the hint would just pop up twice across the same zone).
brandEl.addEventListener('click', (e) => { e.stopPropagation(); if (didDrag) return; clearRetuck(); if (tucked) untuck(); else tuck(); });
// The pill's arrow used to swap the pair from here. It doesn't any more (jek, 2026-08-19): it sat
// inside .brand, whose own job is hide/show, so one small target carried two outcomes and the quieter
// one — reversing the languages — gave no warning and no label. Swapping lives in Settings › Gameplay
// now, next to the two pickers it changes, where the button can spell out the pair it leaves you on.
// The tab is the only bit of a tucked pill left on screen — tap it to bring the pill back.
// Clicking a retreated pill brings it back, and clearRetuck() means it STAYS back — you asked for it,
// so it is not taken away the moment the card you opened it for goes. Style 'behind' rides this
// unchanged and gets the thing that makes it read as a window rather than an overlay: click it and it
// comes to the front, exactly as clicking any window does. Nothing here is style-specific on purpose —
// untuck() already knows whether "come back" means glide in from the edge or rise up the stack.
// (When it is covered COMPLETELY there is nothing left to click, and the way back is the shortcut or
// the next translation. That is what being an ordinary window costs, and it is the point of the mode.)
pill.addEventListener('click', () => { if (!didDrag && tucked) { clearRetuck(); untuck(); } });

// The stack grows UP from the pill by default and hangs BELOW it when the pill is parked high.
//
// (The paragraph that used to sit here said the stack grows up "always, never down" and that flip had
// been deleted. That was never true of the code underneath it — 216601e rewrote the flip rule on
// 2026-07-25, it did not remove flip — and the comment sent two separate debugging sessions looking
// for a bug in a mode that was supposed to be gone. Corrected 2026-07-31.)
//
// What flip DID cost, and what the seam between the two layouts still costs, is real: a card and a
// panel hanging below used to overlap, so entering flip closed the panel outright. That is handled
// properly now — .wrap.flip stacks them in one column-reverse container, and split (below) gives each
// a side of its own when they won't share one.
const GAP2 = 8; // the stack's own inter-element gap (matches .drop gap in CSS)

// scrollHeight is only the natural height when the element that scrolls IS the element you measured.
// #settingsView and #log both carry overflow-y:auto, so when the stack is squeezed the PANEL's own
// scrollHeight stops at the cap and reports the squeezed height back as if that were all the content
// wanted. Measured on a Mac 2026-09-01 with the pill near the top: settings had 373px of content,
// #panel.scrollHeight said 182, the rule below concluded "182 fits in the 192 above me, stay put" —
// and Settings was pinned to a 184px letterbox with 548px of empty screen underneath it, forever.
// This adds back what the inner scrollers are hiding, for every element in the stack rather than for
// the one page the bug was found on: any view that scrolls inside the panel gets the same answer.
const SCROLLS = /^(auto|scroll)$/;
function hiddenOverflow(root) {
  // Only the OUTERMOST scrolling descendants — a scroller inside a scroller is already counted by
  // the one above it, and adding both asks for the same pixels twice.
  let total = 0;
  const walk = (node) => {
    for (const c of node.children) {
      if (c.hidden) continue;
      const delta = c.scrollHeight - c.clientHeight;
      if (delta > 0 && SCROLLS.test(getComputedStyle(c).overflowY)) { total += delta; continue; }
      walk(c);
    }
  };
  walk(root);
  return total;
}
const naturalH = (el) => el.scrollHeight + hiddenOverflow(el);

function updateDropRoom() {
  const r = pill.getBoundingClientRect();
  // Room inside the overlay canvas, which is the whole display on Windows and the work area on macOS
  // (main.js overlayArea) — so the menu bar is already outside innerHeight on a Mac, while on Windows
  // the taskbar strip is inside it and reachable. Used for sizing only — never to pick a side.
  const above = r.top - GAP;
  const below = window.innerHeight - r.bottom - GAP;

  const panelOpen = !!panelMode;
  const cardOpen = !result.hidden && !result.classList.contains('closing');
  // NATURAL heights (naturalH), not rendered — a squeezed panel's offsetHeight lies about how much
  // room it wants, so the Type page's tip was "fitting" numerically while actually clipped with no
  // scroll. scrollHeight alone lies too the moment an inner element is the one that scrolls; see
  // hiddenOverflow above for the 184px-Settings bug that cost.
  const panelH = panelOpen ? naturalH(panel) : 0;
  const cardH = cardOpen ? naturalH(result) : 0;
  // The first-run coach is the THIRD thing that can sit in this stack (see `movers` in the tuck path,
  // which has always known that) and it was the only one left out of the measurement — so with just
  // the coach open `need` came to 0, the flip rule read that as "nothing is open, stay put", and the
  // coach was capped to the room above the pill and clipped instead of moving below it. It is the
  // first thing a new user ever sees, which is the worst place to keep a clipping bug.
  // Ported from the `lean` branch (17ed1dd, 2026-08-06) — same file, same function, same bug.
  const coachOpen = !coachEl.hidden && !coachEl.classList.contains('closing');
  const coachH = coachOpen ? naturalH(coachEl) : 0;
  const parts = [coachH, panelH, cardH].filter(Boolean);
  const combined = parts.reduce((a, b) => a + b, 0) + Math.max(0, parts.length - 1) * GAP2;
  // Split needs: both open, they don't fit either side at full size, the panel fits above and the card
  // fits below.
  const wantSplit = panelOpen && cardOpen &&
    combined > Math.max(above, below) &&
    above >= panelH + (coachH ? coachH + GAP2 : 0) && below >= cardH + GAP2;

  if (wantSplit) {
    wrapEl.classList.remove('flip');
    wrapFlipped = false;
    wrapEl.classList.add('split'); // CSS floats the card below the pill; the panel keeps the .drop (above)
    // Each bar now has its own side, so the panel must NOT be squeezed (that's only for a shared side).
    panel.classList.remove('squeeze');
    result.classList.remove('squeeze');
    dropEl.style.maxHeight = Math.max(120, Math.round(above)) + 'px';
    return;
  }
  const wasSplit = wrapEl.classList.contains('split');
  wrapEl.classList.remove('split');

  // STAY WHERE YOU ARE WHILE IT STILL FITS. The stack changes sides only when the side it is on can
  // no longer hold what is open — never because the other side happens to look roomier.
  //
  // The previous rule asked "does it fit above?" first, so it pulled the stack up the moment there
  // was room, whether or not anything was wrong where it was. Dragging down from the top with the
  // panel hanging below, it jumped up at above=404 while below was still 598 — more room on the side
  // it abandoned — and then nothing moved for the rest of the drag, because it had already switched.
  // That is the behaviour reported as "I nudge it down and the bar shoots to the top" (jek).
  //
  // Two things must stay true and are easy to break:
  //   • `need` is measured on #panel and #result, never on dropEl. .flip turns .drop into
  //     position:absolute with a shrink-to-fit width, so its text re-wraps and its scrollHeight
  //     CHANGES with the side — feed that back in and the side oscillates, which is the flicker.
  //   • Switching costs FLIP_MARGIN: the side you are moving TO must beat what you need by that much,
  //     so a stack sitting exactly on the boundary cannot buzz between the two.
  const need = combined;
  const room = wrapFlipped ? below : above;   // the side it is on right now
  const other = wrapFlipped ? above : below;
  let flip;
  if (!need) flip = wrapFlipped;                          // nothing open / mid-close — leave it
  else if (room >= need) flip = wrapFlipped;              // still fits where it is: do not move
  else if (other >= need + FLIP_MARGIN) flip = !wrapFlipped; // it does not, and the other side does
  else flip = below > above;                              // neither side holds it — roomier one, capped

  const switched = flip !== wrapFlipped;
  wrapEl.classList.toggle('flip', flip);
  wrapFlipped = flip;
  const sideRoom = flip ? below : above;
  dropEl.style.maxHeight = Math.max(120, Math.round(sideRoom)) + 'px';
  // Squeeze ONLY when the full-size pair genuinely overflows the chosen side. Squeezing whenever both
  // were open (the old rule) shrank the card even with room to spare, clipping its English line with
  // no scroll (jek's screenshot). With room, both show at full size.
  const sq = panelOpen && cardOpen && need > sideRoom;
  panel.classList.toggle('squeeze', sq);
  result.classList.toggle('squeeze', sq);
  if (switched && !wasSplit) animateSideSwitch(); // leaving split isn't a side-switch, don't animate it
}

// Changing sides moves the stack from one edge of the pill to the other — hundreds of pixels in one
// frame, which reads as a glitch rather than a move. Sliding it across the screen would be worse (a
// long journey through the game every time you cross the middle), so it re-enters from the pill's new
// side instead: a short fade + 12px nudge, the same language as the card's own entrance.
function animateSideSwitch() {
  // Removed then re-added a frame later, so a second switch mid-drag replays instead of being ignored
  // as "the same class is already there" — and so the class never lands in the same style recalc as
  // the position change that flipping brings with it.
  dropEl.classList.remove('swap');
  requestAnimationFrame(() => dropEl.classList.add('swap'));
}
dropEl.addEventListener('animationend', () => dropEl.classList.remove('swap'));

// Restore where the pill was last parked across launches. Position only — NOT the flip mode: a
// stale flip could leave the pill off-screen because the clamp is written for the un-flipped anchor
// (this is what made the pill "vanish"). Start un-flipped; updateDropRoom() re-derives it on next drag.
// Pill position is NOT persisted anymore — it kept restoring stale off-screen positions after the
// window size changed. It always starts at the default bottom-centre; drag it within the session.
try { localStorage.removeItem('gt.pillPos'); } catch (_) {}

// Windows only: wait for the cursor to SETTLE on a surface before capturing the mouse.
//
// A window that captures the mouse sits over a video as a real composited layer, and DWM answers by
// turning off the video's hardware plane — the clip goes black or freezes. main.js:2030 has said so
// since the snip overlay was written, and the snip overlay was fixed by never capturing at all; the
// pill was left as the one place that still does. So merely SWEEPING the cursor across the pill on
// the way somewhere else killed the video jek was watching, for an interaction he never started.
//
// Turning on late costs nothing anyone can feel: reaching for a control means slowing down on it, and
// the cursor feed already samples at 60ms (main.js), so this is three samples. Turning OFF stays
// instant — the moment you leave, the game gets its plane back with no delay to notice.
//
// The honest cost: a click landing inside the first 180ms of arriving passes through to whatever is
// underneath instead of hitting the pill. macOS is untouched — it composites a capturing overlay fine
// and has never had this problem.
const INTERACT_DWELL_MS = 180;
let interactDwellTimer = null;
let interactPending = false; // a dwell is counting down toward interactive=true
function setInteractive(on) {
  if (on && !IS_MAC) {
    // Already on, or already counting — do NOT restart the clock. The cursor feed re-asserts this on
    // every sample, so a timer that re-armed each time would be reset forever and never fire, and the
    // pill would simply stop being clickable. The rule is "over our surfaces for 180ms CONTINUOUSLY",
    // not "held still for 180ms": a stillness test would be reset by the hand tremor on any decent
    // mouse and strand the same way.
    if (interactive || interactPending) return;
    interactPending = true;
    interactDwellTimer = setTimeout(() => {
      interactPending = false;
      interactive = true;
      window.api.setInteractive(true);
    }, INTERACT_DWELL_MS);
    return;
  }
  clearTimeout(interactDwellTimer); // leaving cancels a dwell that hadn't landed yet
  interactPending = false;
  if (on === interactive) return;
  interactive = on;
  window.api.setInteractive(on);
  // Panel auto-hide lives in the document mousemove handler (guarded by autoHidePanel, default OFF):
  // it closes an open Settings/History panel a few seconds after the cursor leaves it.
}

function setHover(on) {
  if (on === overPill) return;
  overPill = on;
  bumpActivity(); // touching the pill wakes it and restarts the idle countdown
  if (on) {
    clearTimeout(leaveTimer);
    hovering = true;
    clearTimeout(holdTimer);
    updateUI();
    // NO glass sample here. It used to fire on every hover, on the theory that reaching for the pill
    // is when its backdrop matters. Measured (2026-08-02): desktopCapturer.getSources costs ~285ms
    // whatever thumbnail size you ask for — the cost is the capture SESSION, not the pixels, so it
    // cannot be optimised away. And hovering the pill is precisely what you do immediately before
    // clicking one of its buttons, so every snip was starting into a capture that was already in
    // flight. jek: the ring lags when I click the snip button. It did.
    // What hover bought was freshness the eye cannot use anyway: the scene behind a stationary pill
    // does not change because your cursor arrived. Everything that ACTUALLY changes what is behind
    // the stack still samples — launch, drag end, a card, the panel, untuck.
  } else {
    // Debounced so a momentary gap doesn't collapse the pill mid-interaction.
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      hovering = false;
      if (HOLD_MS && !result.hidden && !resultIsLive) holdTimer = setTimeout(hideResult, holdMsFor());
      updateUI();
      bumpActivity(); // start counting toward idle now that the cursor has left
    }, 140);
  }
}

// EVERY bar is a drag handle — pill, mascot, card, panel — so the overlay can be moved from wherever
// the hand already is (jek, 2026-08-10). Interactive bits (buttons, inputs, dropdowns) still work,
// and the words you might want to copy still select.
//
// What counts as "words" is not listed here: the stylesheet says so, and this asks it. Anything whose
// computed user-select is `text` is content — the translation, the source line, a word bubble, a
// History/Vocab row — and a drag there selects instead of moving. Everything else is chrome. Keeping
// the list in one place (styles.css, next to .result .r-th) is the point: a second copy in JS is a
// copy that goes stale the first time a new field is added to the card.
function isSelectableText(el) {
  return !!(el && el.nodeType === 1 && getComputedStyle(el).userSelect === 'text');
}
let didDrag = false;
function armDrag(e) {
  if (isSelectableText(e.target)) return;
  // Buttons are drag handles too: a press that MOVES past the threshold drags the window,
  // a press that doesn't move fires the button's click (swallowed below when it was a drag).
  // Inputs/selects/textareas/labels stay excluded so text/dropdown interaction still works.
  // .src-word too, and for a different reason: a word in an 11px history line is a PRECISION target,
  // and DRAG_THRESHOLD is only 4px of total drift. Any normal click wobbles that far, which armed a
  // drag and made the capture-phase handler below swallow the click — the word tap worked only when
  // the hand happened to be perfectly still. Buttons stay drag handles (they're big enough to hit).
  if (e.button !== 0 || e.target.closest('input, select, textarea, label, .src-word')) return;
  // While tucked the tab CAN be dragged, but only along the edge (vertical). Horizontal is frozen
  // because --tuck-x was computed from dragOffX at tuck() time — changing X mid-tuck leaves that
  // value stale and the pill lands in a wrong (possibly off-screen) spot on release. To move it to
  // the other side, click the tab to bring the pill back, drag it across, then tuck again.
  dragArmed = true;
  dragging = false;
  window.api.setDragging(false);
  didDrag = false;
  dragX = e.screenX;
  dragY = e.screenY;
}
// One listener on the wrap instead of one per bar: mousedown bubbles, so the pill, the mascot, the
// card and the panel are all handles, and any bar added later is one for free. This reverses the
// earlier "content surfaces never drag" rule — the false-affordance it avoided turned out to cost
// more than it saved, because the card is often the only bar under the hand.
wrapEl.addEventListener('mousedown', armDrag);
window.addEventListener('mouseup', () => {
  const wasDrag = dragging;
  dragArmed = false; dragging = false;
  window.api.setDragging(false);
  wrapEl.classList.remove('dragging');
  // Release ends the ride: the pill now VACUUMS to the nearest dock, and a chip chasing that
  // animation (or frozen at the pre-snap spot) looks broken. Drop it; the next mousemove re-labels.
  if (tipRiding) { tipRiding = false; btnTip.style.transform = ''; btnTip.hidden = true; hoverTipEl = null; }
  if (wasDrag) {
    if (tucked) { snapTuckedRow(); setHover(false); setInteractive(false); return; } // edge-locked: rows only, X must stay put
    snapToNearestDock(); // vacuum to the nearest of the 6 spots on release
    // The pill just snapped to a new spot, so the (stationary) cursor may no longer be over it, but
    // no mousemove fires to update hover — it would otherwise stay stuck expanded. Re-settle it; the
    // next real mousemove re-hovers if the cursor genuinely ends up on the pill.
    setHover(false);
    setInteractive(false);
    // Re-photograph where it LANDED, not where it was released — after the snap has finished
    // travelling, or the glass shows the scene from halfway through the vacuum.
    scheduleGlass(320);
  }
});

// If the press turned into a window-drag, swallow the trailing click (capture phase, before any
// button handler) so ending a drag over a button doesn't also trigger that button.
window.addEventListener('click', (e) => {
  if (didDrag) { e.stopPropagation(); e.preventDefault(); didDrag = false; }
}, true);

document.addEventListener('mousemove', (e) => {
  // Locked: stay fully click-through, but still answer the cursor — see lockHover.
  if (locked) { lockHover(e.clientX, e.clientY); return; }
  // Dragging the stack inside the full-screen canvas: shift its CSS offset, not the OS window.
  // A tucked pill is a 26px tab — a PRECISION target, like .src-word above. The normal 4px threshold
  // turned any wobble on the tap into a drag, which the capture-phase click handler then swallowed,
  // so the tab refused to untuck. Ask for a deliberate 10px pull before the tucked tab starts moving.
  const thr = tucked ? 10 : DRAG_THRESHOLD;
  if (dragging || (dragArmed && Math.abs(e.screenX - dragX) + Math.abs(e.screenY - dragY) >= thr)) {
    if (!dragging) { // first frame of this drag — decide what happens to the hovered label
      // A label already on screen RIDES ALONG instead of vanishing: yanking it away the instant the
      // pill starts moving reads as a flicker. One that hasn't appeared yet is cancelled, so a label
      // never pops up mid-drag.
      tipRiding = !btnTip.hidden && !!hoverTipEl;
      if (tipRiding) { tipRideX = dragOffX; tipRideY = dragOffY; }
      else { clearTimeout(tipShowTimer); hoverTipEl = null; btnTip.hidden = true; }
    }
    dragging = true;
    window.api.setDragging(true);
    didDrag = true;
    wrapEl.classList.add('dragging'); // cursor: grabbing while actually dragging
    bumpActivity(); // dragging the pill wakes it

    if (!tucked) dragOffX += e.screenX - dragX; // tucked: edge-locked, see armDrag
    dragOffY += e.screenY - dragY;
    applyDragOffset();
    if (panelMode || !result.hidden) updateDropRoom(); // stack open: keep it inside the screen mid-drag too
    // Same delta the wrap just took, as a transform — so the chip tracks the button pixel-for-pixel
    // without re-measuring rects every frame.
    if (tipRiding) btnTip.style.transform = `translate(${dragOffX - tipRideX}px, ${dragOffY - tipRideY}px)`;
    // (No flip — it caused a "warp" jump mid-drag. The card just grows upward from the pill.)
    dragX = e.screenX;
    dragY = e.screenY;
    return;
  }
  updateHover(e.clientX, e.clientY);
});

// Everything that depends only on WHERE the cursor is. Split out of the mousemove handler because
// main also feeds us positions (window.api.onCursor) while the window holds the mouse and our app is
// inactive — the state where the OS sends no mousemove at all and this used to freeze.
// Where the cursor was the last time the auto-hide countdown looked at it, so a repeated position
// (a feed sample, not a movement) can be told apart from a real move.
let lastIdleX = null, lastIdleY = null;
// The cursor's last known position, wherever it is — the tuck grace radius reads this. Separate from
// lastIdle*, which is only about telling a real move apart from a repeated feed sample.
let lastCursorX = null, lastCursorY = null;
let wasOverCard = false; // so leaving the card can restart its countdown exactly once
function updateHover(clientX, clientY) {
  lastCursorX = clientX;
  lastCursorY = clientY;
  const el = document.elementFromPoint(clientX, clientY);
  // Stamped while a surface is genuinely under or beside the cursor, and read for a couple of
  // seconds afterwards by userIsHere — see ENGAGED_MEMORY_MS.
  // The card's auto-close has to answer to the SAME cursor the pill does. It had its own
  // mouseenter/mouseleave pair, which is a real DOM event and therefore does not fire while the app
  // is inactive — i.e. exactly while someone is playing a game, which is every situation this app is
  // for. Measured: cursor parked on the card through the fed-cursor path, card closed anyway at 8s.
  // Same class of bug as the pill tucking under a resting hand: two surfaces of the same kind
  // answering the same question through different mechanisms. (jek's rule, 2026-08-06)
  const overCard = !!(el && el.closest('.result'));
  if (overCard && !result.hidden) {
    clearTimeout(holdTimer);
  } else if (!overCard && !result.hidden && wasOverCard && HOLD_MS && !resultIsLive) {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(hideResult, holdMsFor()); // left the card — restart its countdown
  }
  wasOverCard = overCard;

  const ours = el && el.closest('.pill, .panel, .result, .mascot, .caption-box, .coach');
  if (ours) {
    lastEngagedAt = Date.now();
    const b = ours.getBoundingClientRect();
    if (b.width && b.height) lastSurfaceRect = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  } else if (cursorNearSurface()) {
    lastEngagedAt = Date.now();
  }
  // Mascot is clickable (interactive) but hovering it does NOT open the menu —
  // only the pill does that.
  setInteractive(!!(el && el.closest('.pill, .panel, .result, .mascot, .caption-box, .coach')));
  setHover(!!(el && el.closest('.pill')));
  moveSheen(clientX, clientY); // the glass catches the light wherever the cursor is
  // Button label follows the ACTUAL cursor position (this mousemove), not mouseover/mouseout
  // delegation — fast moves dropped/reordered those events and left the label stuck at the previous
  // element's spot. The last mousemove always knows what's really under the cursor.
  const tipEl = (el && el.closest('[data-tip]')) || null;
  // Moving onto anything else clears the post-click suppression, so the label works again next time
  // the cursor comes back to that button.
  if (tipEl !== tipSuppressedEl) tipSuppressedEl = null;
  if (tipEl !== hoverTipEl) { hoverTipEl = tipEl; scheduleTip(); }
  // Auto-hide: while a panel is open, start a countdown once the cursor is off the pill+panel; being
  // back over them cancels it. Off (autoHidePanel=false) → the panel stays until tapped shut.
  // NEVER arm it while a panel TEXT FIELD has keyboard focus (typing in line-to-translate / API key
  // with the cursor parked outside): hiding the panel blurs the input and swallows the rest of the
  // typing. Only inputs/textareas count — a merely-focused button (e.g. the ⚙ you clicked to open the
  // panel) must NOT block auto-hide, or the panel never closes at all.
  if (panelMode && autoHidePanel) {
    // Only a cursor that MOVED may reset the countdown. main feeds us positions continuously while
    // the window holds the mouse and our app is inactive (see onCursor) — the same coordinates, over
    // and over — and this block cleared and re-armed the timer on every one of them. Traced live: the
    // 15s History countdown was being restarted every ~30ms, so it could never reach the end and the
    // panel stayed open forever no matter how long you left it. Standing still is exactly the state
    // auto-hide is FOR. (jek, 2026-08-05)
    // Only a cursor that MOVED may RESTART the countdown. main feeds us positions continuously while
    // the window holds the mouse and our app is inactive (see onCursor) — the same coordinates over
    // and over — and this cleared and re-armed the timer on every one of them, so the 15s History
    // countdown was restarted every ~30ms and could never reach the end. Standing still is exactly
    // the state auto-hide is FOR. (jek, 2026-08-05)
    if (clientX === lastIdleX && clientY === lastIdleY) return;
    lastIdleX = clientX;
    lastIdleY = clientY;
    // Over the pill or the panel = you are using it, so the clock goes back to the start. Anywhere
    // else = you are playing, and the panel should be counting down while you do.
    armPanelIdle(el, { restart: !!(el && el.closest && el.closest('.pill, .panel')) });
  }
}

// Fed cursor (see above). Ignored mid-drag — a drag only happens while we're the active app, where
// real mousemove is already flowing and is the more accurate source.
// LOCKED HOVER. Lock means the pill cannot be CLICKED — it never meant the pill cannot answer a
// question. The question a locked overlay gets asked is always the same one ("why is this ignoring
// me?"), it is asked by putting the cursor on it, and the answer is the key that ends the lock. So
// while locked the cursor still moves the pill's hover state; it just never buys interactivity.
//
// setInteractive is the whole difference and it is deliberate: updateHover() calls it, this does
// not. The window stays WS_EX_TRANSPARENT, so every click still lands on the game — exactly the
// same trick the snip path uses two lines down, and for the same reason.
//
// Tucked, hover also slides the pill back out (lock-reveal), because the answer is written IN the
// pill and a 26px tab has nowhere to put it. It slides away again the moment the cursor leaves, so
// this costs a brush past the screen edge and nothing more.
let lockHovering = false; // edge-trigger: the feed repeats a resting position ~16x a second
function lockHover(x, y) {
  const el = document.elementFromPoint(x, y);
  const over = !!(el && el.closest('.pill'));
  if (over === lockHovering) return;
  lockHovering = over;
  setHover(over);
  if (tucked) wrapEl.classList.toggle('lock-reveal', over);
  refreshXlate(true); // the slot answers to `hovering` now — repaint it on the crossing, not per sample
}

window.api.onCursor((p) => {
  if (dragging || dragArmed || !p) return;
  if (locked) { lockHover(p.x, p.y); return; }
  // During a snip main feeds the cursor with snip:true. The window MUST stay click-through then, so
  // only the HOVER is updated (collapse the pill when the cursor genuinely leaves it, expand when it's
  // back) — never setInteractive, which updateHover does and which would yank us out of click-through
  // mid-snip. This is what makes the pill หุบ on real un-hover instead of the instant you press ⧉.
  if (p.snip) { const el = document.elementFromPoint(p.x, p.y); setHover(!!(el && el.closest('.pill'))); return; }
  updateHover(p.x, p.y);
});

function startSnip() {
  untuck({ auto: true }); // about to hand off to the snip overlay — make sure the pill is visible first
  // Close the panel HERE as well as on snip:state, so the ⧉/mascot path (the one where the panel is
  // most likely open — you just clicked a button on it) loses it in the same frame the overlay opens,
  // instead of an IPC round-trip later.
  if (panelMode) { snipRestore = { mode: panelMode, page: panelPage }; setPanel(null); }
  // No hint here on purpose. The full-screen overlay states the instruction (see snip.js), so writing
  // it into the pill's slot too only bought a marquee that started, got killed by the next status, and
  // restarted — the judder through a snip. The slot keeps resting on ⌘⇧S until a real status lands.
  // Clear the previous card now so the old translation doesn't linger (dimmed)
  // through the next read and flash before the new one lands.
  result.hidden = true;
  result.classList.remove('loading');
  clearTimeout(holdTimer);
  // Hand clicks through to the snip overlay — but do NOT fake a mouse-leave. Collapsing here yanked
  // the pill shut under a cursor that was still sitting on it (pressing ⧉ is exactly that case).
  // The window keeps getting mousemove while click-through (forward:true), so the real cursor
  // position collapses it the moment it actually leaves — which is when it should.
  setInteractive(false);
  window.api.startSnip();
}

// Tap the mascot to start a snip — but not if that "tap" was actually a drag.
document.getElementById('mascot').addEventListener('click', () => { if (!didDrag) startSnip(); });

// Inline type field in the pill. Its ONLY entry point is mid-snip: on DRM content (Netflix) the
// capture reads black, so typing a character or Space during the drag opens this instead (see
// onTypeFocus below). ⌘⇧T and the panel's Type page cover typing everywhere else — this exists
// because mid-snip you're stuck under the overlay and can't reach the panel.
snipBtn.addEventListener('click', () => startSnip());
// A snip session is a MODE you're in until you finish or cancel it — the same shape of state as the
// mic listening — so the ⧉ button lights up for it. Blue (.active), not the mic's red: red is
// "recording you right now", this is just "armed". Driven by main, which owns the session, so the
// hold-⌃⌥ path lights it too even though the renderer never hears about that drag.
// Main owns the session, so this is also where the pill strips down to its bare form for the snip
// (see `sniping`) — driving it from here and not from startSnip() means the ⌃⌥ hold path, which the
// renderer never hears about otherwise, gets the same treatment.
window.api.onSnipState((on) => {
  snipBtn.classList.toggle('active', on);
  if (sniping === on) return;
  sniping = on;
  if (on) {
    clearTimeout(snipRestoreTimer); // a NEW snip started — cancel any restore still pending from the last one,
                                    // or it could fire mid-drag and pop the panel over an active snip (jek's gesture: hold-release-hold)
    // Covers the ⌃⌥-hold path, which never calls startSnip() — remember the panel here too before it goes.
    if (panelMode) { snipRestore = { mode: panelMode, page: panelPage }; setPanel(null); } // setPanel runs updateUI
    else updateUI();
  } else {
    updateUI();
    // Snip ended. If nothing came of it (cancelled, or no text) the panel we hid should return — you got
    // no translation to read in its place. A result in flight (translating) or already shown (result up),
    // and onTranslationError, all clear/handle snipRestore, so this fires only on a truly empty snip. The
    // !sniping guard is a backstop: if another snip has already begun by the time this fires, stay out of it.
    snipRestoreTimer = setTimeout(() => {
      if (snipRestore && result.hidden && !translating && !sniping) restoreSnipPanel();
    }, 600);
  }
});

// Instant labels for the pill buttons — appear the moment a button is hovered, above the pill
// (below it near the top docks). Native title tooltips (~1s delay) stay as backup.
const btnTip = document.getElementById('btnTip');
let hoverTipEl = null; // the [data-tip] element the cursor is currently over (null = none)
// The [data-tip] element that was just CLICKED. Its label stays hidden while the cursor sits on it.
let tipSuppressedEl = null;
// Capture phase: several of these buttons stopPropagation, so a bubbling listener would miss them.
document.addEventListener('click', (e) => {
  const el = e.target && e.target.closest ? e.target.closest('[data-tip]') : null;
  if (!el) return;
  tipSuppressedEl = el;
  clearTimeout(tipShowTimer); // a pending 350ms reveal must not fire straight after the click either
  btnTip.hidden = true;
}, true);
function showBtnTip(el) {
  btnTip.textContent = el.dataset.tip;
  btnTip.hidden = false;
  // The hide zone is the whole left cap (circle + EN→TH). Hovering EITHER shows one label centred over
  // the COMBINED area, so it never jumps between the two pieces. Other buttons centre on themselves.
  let r;
  if (el === dot || el === brandEl) {
    const a = dot.getBoundingClientRect(), b = brandEl.getBoundingClientRect();
    const left = Math.min(a.left, b.left), right = Math.max(a.right, b.right);
    const top = Math.min(a.top, b.top), bottom = Math.max(a.bottom, b.bottom);
    r = { left, right, top, bottom, width: right - left, height: bottom - top };
  } else {
    r = el.getBoundingClientRect();
  }
  // Keep the chip off the card/panel. Whichever side those grow toward is occupied — .wrap.flip means
  // they hang BELOW the pill, otherwise they grow above — and the chip used to ignore that entirely:
  // docked at the top with Settings open, the label landed across the tab row and you couldn't tell
  // which of the two you were meant to be reading. Go to the free side; if that side has no room
  // (pill pinned against an edge) drop the label instead. A tooltip is worth less than what it covers.
  const anyOpen = !panel.hidden || !result.hidden;
  const growsBelow = wrapFlipped;
  const tipH = btnTip.offsetHeight;
  const roomAbove = r.top > tipH + 8;
  const roomBelow = window.innerHeight - r.bottom > tipH + 8;
  let above;
  if (anyOpen) above = growsBelow;   // occupied side decides; the chip takes the other one
  else above = r.top > 60;           // nothing open — the original rule
  if (above ? !roomAbove : !roomBelow) { btnTip.hidden = true; return; }
  // Clamp inside the viewport (8px margin) so an edge/side dock never pushes the chip off-screen.
  const x = r.left + r.width / 2 - btnTip.offsetWidth / 2;
  btnTip.style.left = Math.round(Math.max(8, Math.min(x, window.innerWidth - btnTip.offsetWidth - 8))) + 'px';
  btnTip.style.top = Math.round(above ? r.top - btnTip.offsetHeight - 8 : r.bottom + 8) + 'px';
}
// Only label once the pill has finished stretching OPEN. Showing it mid-expand made the chip blink —
// the brand reflowed under the cursor as the width animated — and it must never show on the compressed
// pill. So: shown only when open AND not still resizing; re-checked when the stretch settles (below).
function refreshTip() {
  // Mid-drag the chip is riding along on a transform — re-measuring here would stack a fresh
  // left/top ON TOP of that transform and fling it away. Leave it exactly where it is.
  if (tipRiding) return;
  // Guard on dataset.tip: the hovered slot may have had its data-tip REMOVED (e.g. a status took over
  // the shared right slot) while the cursor sat still on it — without this the chip would read "undefined".
  // Just clicked this button — you know what it does, and the label popping up as the pill reopens
  // under a cursor that never moved is the app answering a question nobody asked. Stays suppressed
  // until the cursor visits something else (see the mousemove handler).
  if (hoverTipEl && hoverTipEl === tipSuppressedEl) { btnTip.hidden = true; return; }
  if (hoverTipEl && hoverTipEl.dataset.tip && !dragging && pill.classList.contains('open') && !pill.classList.contains('resizing')) showBtnTip(hoverTipEl);
  else btnTip.hidden = true;
}
// Small hover delay before the label appears (like a normal tooltip) — moving onto a new element hides
// the chip immediately and re-shows it after a beat; leaving (hoverTipEl null) just hides. Called from
// the mousemove handler when the hovered element changes.
let tipShowTimer = null;
function scheduleTip() {
  clearTimeout(tipShowTimer);
  btnTip.hidden = true;
  if (hoverTipEl) tipShowTimer = setTimeout(refreshTip, 350);
}
// hoverTipEl is now driven by the document mousemove handler above (cursor-position based), which is
// reliable on fast moves — the old mouseover/mouseout delegation dropped events and left the label
// stuck at the previous element's position.

// The pill window may have been forced click-through for a snip session (main.js) while our local
// `interactive` said true — resync so the next mousemove over the pill re-arms interactivity.
// Main forced the window back to click-through, so drop a dwell that was still counting toward the
// opposite — otherwise it lands a moment later and re-captures the mouse main just gave up.
window.api.onInteractiveReset(() => {
  clearTimeout(interactDwellTimer);
  interactPending = false;
  interactive = false;
});

// Main handed the whole foreground back (releaseAllForeground). Both of the flags below are EDGE
// GUARDS — they exist so a cursor feed repeating one position does not send the same message sixteen
// times a second — and an edge guard that disagrees with the other side is a control that has quietly
// stopped working. That is exactly what stranded the Type bar: `focusableNow` stayed true across an
// Enter (blurring the WINDOW does not fire focusout on the element, so nothing ever set it back), so
// the 'field' hold was never released, fgHolders never emptied, and no later hold could take the
// foreground — the field was clickable and unfocusable for the rest of the session (jek, 2026-08-30).
//
// Also blur the field for real. Leaving DOM focus on an input whose window is no longer foreground is
// what made the two sides disagree in the first place; the caret has already stopped being usable.
window.api.onForegroundReset(() => {
  focusableNow = false;
  clearTimeout(focusableTick);
  focusableTick = null;
  const el = document.activeElement;
  if (isEditableEl(el)) el.blur();
});

window.api.onHint((msg) => setHint(msg));

// Two-step quit so an accidental click never closes the app: first click arms it (button goes red
// "click again to quit"), a second click within 2.5s actually quits, otherwise it disarms.
let quitArm = null;
quitBtn.addEventListener('click', () => {
  if (didDrag) return;
  if (quitArm) { clearTimeout(quitArm); quitArm = null; window.api.quit(); return; }
  quitBtn.classList.add('confirm');
  quitBtn.dataset.tip = 'Click again to quit'; refreshTip(); // update the chip, not a native tooltip
  quitArm = setTimeout(() => { quitArm = null; quitBtn.classList.remove('confirm'); quitBtn.dataset.tip = 'Quit'; refreshTip(); }, 2500);
});

// WINDOWS: the overlay window is created non-activating (focusable:false / WS_EX_NOACTIVATE), so a
// click on the pill never takes the foreground off the game — a game that mutes itself while it is
// not the active app used to go silent the moment History or Settings opened (jek 2026-08-29). The
// one thing that genuinely needs activation is TYPING, so focusability is lifted for exactly as long
// as a real editable field holds focus, and never for a panel merely being open — which is what this
// used to do, and what handed our window the foreground on every panel click. No-op on macOS: main
// ignores ui:focusable there (focusable:false hid the window and didn't stop the steal anyway).
function isEditableEl(el) {
  if (!el || el === document.body) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true;
}
let focusableNow = false;
let focusableTick = null;
// focusout fires BEFORE the next focusin, so tabbing between two fields would drop the foreground and
// take it straight back — a visible bounce, and a needless activation storm for the game underneath.
// Settle on the next tick and ask what actually ended up focused.
function syncFocusable() {
  clearTimeout(focusableTick);
  focusableTick = setTimeout(() => {
    focusableTick = null;
    const want = isEditableEl(document.activeElement);
    if (want === focusableNow) return;
    focusableNow = want;
    window.api.setFocusable(want);
  }, 0);
}
// A panel can be torn down with a field still focused and fire no focusout at all, so closing one
// forces the drop rather than waiting for an event that isn't coming.
function dropFocusable() {
  clearTimeout(focusableTick);
  focusableTick = null;
  if (!focusableNow) return;
  focusableNow = false;
  window.api.setFocusable(false);
}
document.addEventListener('focusin', syncFocusable);
document.addEventListener('focusout', syncFocusable);
// The other way the two sides drift apart, and it needs no Enter to happen: our WINDOW loses focus
// (you clicked the game) while the input keeps DOM focus, because blurring a window does not fire
// focusout on its focused element. `focusableNow` then stays true forever, the 'field' hold is never
// released, and main's fgHolders can never empty — which is the state where nothing can take the
// foreground again. A field in an unfocused window cannot receive a keystroke anyway, so say so.
window.addEventListener('blur', () => {
  const el = document.activeElement;
  if (isEditableEl(el)) el.blur();
  dropFocusable();
});

// WINDOWS. A click cannot focus a text field while the window is not the foreground one, and the
// window only becomes foreground because a field has focus — so nothing ever happened when the Type
// bar was clicked. This is the way in: on the mousedown that is ABOUT to focus a field, ask main for
// the foreground, WAIT for it, then focus by hand.
//
// Capture phase, so it runs before anything that might stop the event; not preventDefault, because
// the browser's own caret placement is worth keeping and focusing twice costs nothing.
//
// This is the only place in the app that takes the foreground away from the game. Hovering the panel,
// scrolling History, tapping a word, pressing ☆ — none of them do ("จริงๆ อยากให้มันทะลุมากกว่า", jek).
document.addEventListener('mousedown', (e) => {
  const el = e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]');
  if (!el || el.disabled || el.readOnly) return;
  if (focusableNow) return; // already ours — the browser will focus it by itself
  window.api.takeFieldFocus().then(() => {
    focusableNow = true; // main added the hold; syncFocusable must agree or it will fight the release
    el.focus();
    // Put the caret where the click was, which the default handling could not do while the window
    // was still in the background. Harmless when the browser already placed it.
    if (typeof el.selectionStart === 'number' && el.selectionStart === el.selectionEnd && !el.value) el.setSelectionRange(el.value.length, el.value.length);
  }).catch(() => { /* main is gone or the window closed mid-click */ });
}, true);

let panelJustOpened = false; // set when the history panel unhides, so the setPanelPage that follows an OPEN
                             // skips its height slide (the panel is entering via cardIn — a slide on top = double motion)
function setPanel(mode) {
  if (mode) clearRetuck(); // Settings/History open = the pill is wanted on screen
  if (mode === 'history' && panel.hidden) panelJustOpened = true; // read panel.hidden BEFORE updateUI unhides it
  panelMode = mode;
  // Closing the panel ends both halves of the hold: the parked subtitles go into the list (the DOM
  // has to match historyList again, and nobody is looking at it right now, so no chip and no
  // animation), and a card held by reopenCard hands the screen back to CC. A ✕-mute is NOT touched —
  // liveMuteAuto is the only one this owns.
  if (!mode) {
    flushCcHold();
    if (liveMuteAuto) { liveMuteAuto = false; liveCardMuted = false; }
  }
  // Closing the panel stops any flashcard-review TTS still talking to a vanishing UI.
  if (!mode) { try { speechSynthesis.cancel(); } catch {} }
  bumpActivity(); // opening/closing a panel is activity
  clearTimeout(panelIdleTimer); // any pending auto-dismiss is moot once the panel state changes
  // ...and so is the remembered cursor position. A panel opened by SHORTCUT with the cursor parked
  // would otherwise match the last position the countdown saw, be read as "hasn't moved", and never
  // start counting until the mouse was touched.
  lastIdleX = lastIdleY = null;
  // Closing the panel can take a focused field down with it without ever firing focusout, so make
  // sure the window drops back to non-activating. Opening one is NOT a reason to become focusable —
  // that is what handed the foreground (and the game's audio) to us on every History/Settings click.
  if (!mode) dropFocusable();
  updateUI();
  if (mode) updateDropRoom(); // size the stack for where the pill is NOW, before the panel paints
  if (mode) armPanelIdle(elementUnderCursor()); // start counting NOW — don't wait for a mouse move
  // The chip picks its side from what's open, so re-place it NOW rather than waiting for the width
  // settle 320ms later — with the cursor resting on the button that opened the panel, that delay is
  // long enough to watch the label sit on top of the panel before it jumps.
  refreshTip();
}
// ☰ opens the panel on the TYPE page — the whole point of the rename: clicking it is the no-shortcut
// way to reach type-to-translate. Dictionary/Learn are one tab away.
logBtn.addEventListener('click', () => {
  const opening = panelMode !== 'history';
  setPanel(opening ? 'history' : null);
  if (opening) setPanelPage('type');
});
settingsBtn.addEventListener('click', () => setPanel(panelMode === 'settings' ? null : 'settings'));

// ---- Learn Mode on the pill (took the mic's slot, 2026-08-12) ------------------------------------
// Same destination as the panel's 🎓, one click closer: the Learn window opens on its Today card, and
// its calendar is how you reach any OTHER day's session — so this one button covers both halves of
// "practise what I collected". didDrag guards it like every other pill control: the pill is draggable,
// and a drag that ends over a button must not also press it.
const learnPillBtn = document.getElementById('learnPillBtn');
const learnBadge = document.getElementById('learnBadge');
learnPillBtn.addEventListener('click', () => { if (!didDrag) window.api.openLearn(); });

// The count IS the reason the button is worth looking at, so it must never be stale: it is recomputed
// on every vocab change (★ from the pill, ★ from the card, a word saved in the Learn window — all of
// them come back through vocab:changed) and re-checked on a timer, because "today" expires on its own
// at midnight and nothing else would notice a day that rolled over mid-session.
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
function updateLearnBadge() {
  if (!learnBadge) return;
  const from = startOfToday();
  const n = savedVocab.reduce((acc, v) => acc + (Number(v && v.ts) >= from ? 1 : 0), 0);
  // Nothing kept yet is not a "0" worth drawing — an empty chip on a 26px icon is noise, and the
  // button still works. It appears the moment the first word of the day lands.
  learnBadge.hidden = n === 0;
  // 3 digits is the widest the chip can take before it starts eating the icon behind it.
  learnBadge.textContent = n > 99 ? '99+' : String(n);
  const T = (k) => (window.i18n ? window.i18n.t(k) : k);
  learnPillBtn.dataset.tip = n
    ? T('tip.learnPill.n').replace('{n}', String(n))
    : T('tip.learnPill');
}
setInterval(updateLearnBadge, 60000);
updateLearnBadge(); // paint from the local mirror now; vocabGet's round-trip corrects it a tick later

// ⤢ — the list is capped at ~3 rows so the panel stays small over a game. That cap is wrong when you
// sat down to READ your saved words, so this lifts it (and remembers the choice across restarts).
const tallBtn = document.getElementById('tallBtn');
let panelTall = false;
try { panelTall = localStorage.getItem('gt.panelTall') === '1'; } catch {}
function applyPanelTall(animate) {
  const from = animate ? panel.offsetHeight : 0;
  panel.classList.toggle('tall', panelTall);
  tallBtn.classList.toggle('on', panelTall);
  tallBtn.title = panelTall ? 'Back to the compact list' : 'Taller list';
  if (animate) animatePanelHeight(from);
}
applyPanelTall(false);
tallBtn.addEventListener('click', () => {
  panelTall = !panelTall;
  try { localStorage.setItem('gt.panelTall', panelTall ? '1' : '0'); } catch {}
  applyPanelTall(true);
});

// Close the translation card immediately instead of waiting for it to fade.
const rEnMore = document.getElementById('rEnMore');
// Expanding is per card and resets with the next one (showResult re-derives it) — a long line you
// opened once shouldn't force every later card open.
rEnMore.addEventListener('click', (e) => {
  e.stopPropagation();
  const clamped = rEn.classList.toggle('clamped');
  rEnMore.textContent = clamped ? '⌄ show the whole line' : '⌃ show less';
});

const rCloseBtn = document.getElementById('rClose');
rCloseBtn.addEventListener('click', () => {
  // ✕ during live = "stop showing me subtitles" — mute live cards until CC toggles or a manual snip.
  const mute = liveMode && resultIsLive;
  if (mute) liveCardMuted = true;
  hideResult(); // resets the hint — the mute notice must come AFTER
  if (mute) setHint('CC muted — CC button resumes');
});

// ---- "This session" scope for the History tab --------------------------------------------------
// A session is a burst of lookups; it ends after a gap. Walk historyList (newest-first) from the top
// until two consecutive entries are more than SESSION_GAP_MS apart — everything above that gap is
// "this session". Returns a Set of ts values so the History renderer can filter by membership.
const SESSION_GAP_MS = 4 * 60 * 1000;
function currentSessionTs() {
  const set = new Set();
  for (let k = 0; k < historyList.length; k++) {
    if (k > 0 && (historyList[k - 1].ts - historyList[k].ts) > SESSION_GAP_MS) break;
    set.add(historyList[k].ts);
  }
  return set;
}

// Pronounce the source word/phrase currently on the card. lastPayload holds it (same source the
// re-open-on-click path uses); GTTts guesses the voice/language from the script.
const rSpeakBtn = document.getElementById('rSpeak');
rSpeakBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // the card body re-opens on click — don't let this bubble into that
  // Read what's ACTUALLY on the card (rEn), not lastPayload — showResult() doesn't set lastPayload
  // itself (its callers do), so tying speech to the visible text can never pronounce a stale word.
  const text = rEn.textContent.trim();
  if (!text || !window.GTTts) return;
  // The reading (furigana) is only right if lastPayload is still this same word.
  const reading = (lastPayload && lastPayload.en === text && lastPayload.reading) || '';
  window.GTTts.speakText(text, reading);
  // Brief accent flash so the tap registers even when the audio is silent (no voice installed).
  rSpeakBtn.classList.add('speaking');
  setTimeout(() => rSpeakBtn.classList.remove('speaking'), 600);
});

// ★ favorite: save the card's current word/translation to Vocab straight from the bar (toggle). Reads the
// VISIBLE card text (like rSpeak) so it can never save a stale word (jek 2026-07-27).
// The full AI card, on demand. A snip is a free Google translation by default (see buildCard's note
// in main.js), so this is where the paid part becomes something the reader can point at and choose,
// rather than something that quietly billed them on every line they ever read.
const rAiBtn = document.getElementById('rAi');
// Hidden when the card already carries the AI fields — at that point the button can only re-buy
// something you already have.
function syncAiBtn(payload) {
  if (!rAiBtn) return;
  const already = !!(payload && (payload.pronunciation || payload.meaning || payload.forms || payload.example));
  // A card that already carries the AI fields cannot be upgraded again, but REMOVING the button
  // there answers the wrong question: after a press the control simply vanished, which reads the
  // same as a control that broke. It stays and goes lit, the way the ⚑ button already reports a
  // report that was sent — the state is the receipt.
  rAiBtn.hidden = !(payload && payload.en);
  rAiBtn.classList.toggle('done', already);
  // Same mark the History row carries (.entry.has-ai): the card's top line goes accent once the read
  // is an AI one, so the answer itself says where it came from and not only the button in the corner.
  if (result) result.classList.toggle('has-ai', already);
  rAiBtn.classList.remove('busy');
  rAiBtn.title = already ? 'Full card — pronunciation, word forms, example (already on this card)'
                         : 'Full card — pronunciation, word forms, example';
}
rAiBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!lastPayload || !lastPayload.en || rAiBtn.classList.contains('busy')) return;
  rAiBtn.classList.add('busy');
  const res = await window.api.upgradeCard(lastPayload.en).catch(() => null);
  // On success the upgraded card comes back on translation:new and re-renders through the normal
  // path, which calls syncAiBtn and hides the button. Only the failure path cleans up after itself.
  if (!res || !res.ok) {
    rAiBtn.classList.remove('busy');
    // "check your connection or AI allowance" is 60 characters into a 109px slot, so the one time it
    // was most likely to appear it appeared as a marquee — text that warps out and slides back in
    // while you are trying to read it. When main can name the cause, name it in two words instead.
    // Three causes, three sentences. "check your AI allowance" was printed for all of them, including
    // the one where our own service is down — telling a user to check something that is not theirs
    // and is not wrong. The Learn window has told the truth about this for weeks; the card is the
    // screen people actually see. (review, 2026-08-15)
    setHint(res && res.error === 'offline' ? 'No internet'
      : res && res.error === 'aidown' ? "Gloss's AI is unreachable — nothing wrong on your side"
      : res && res.error === 'quota' ? 'AI reads used up — translation still works'
      // Refused before the read was spent (main.js AI_CARD_MAX_CHARS), so this must name the fix
      // rather than the fault: nothing is wrong, the sweep was just wider than one card holds.
      : res && res.error === 'toolong' ? 'Too much text for one card — sweep a smaller part'
      : 'Full card unavailable');
  }
});

const rFavBtn = document.getElementById('rFav');
rFavBtn.innerHTML = IC_STAR; // same star icon as the History rows — one consistent set
function paintFav() {
  const en = rEn.textContent.trim();
  const on = !!en && isWordSaved(en);
  rFavBtn.classList.toggle('on', on); // CSS fills the star when .on
  rFavBtn.title = on ? 'Saved — tap to remove from Vocab' : 'Save to Vocab';
}
rFavBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const en = rEn.textContent.trim();
  const th = rTh.textContent.trim();
  if (!en) return;
  const reading = (lastPayload && lastPayload.en === en && (lastPayload.pronunciation || lastPayload.reading)) || '';
  toggleVocabWord(en, th, reading, en, lastPayload && lastPayload.en === en ? srcOf(lastPayload) : undefined);
  paintFav();
  if (panelMode === 'history') { histMode === 'saved' ? renderSaved() : renderHistory(); } // keep the open list in sync
});

// ---- Live subtitle mode (CC, in Settings): main owns the loop; renderer toggles + reflects. ----
let liveMode = false;
let hoverMode = false; // point-at-a-word is running (main broadcasts it — see hover:state)
let resultIsLive = false;  // the card currently showing came from the live loop
let liveCardMuted = false; // user ✕-closed mid-live → stay closed until CC toggles/manual snip
// The same mute, but claimed by opening a card OUT OF the history list rather than by ✕. It has to be
// told apart from the ✕ one: ✕ means "stop showing me subtitles" and must outlive anything, while this
// one means "hold still, I'm reading this old line" and has to end by itself when the panel closes —
// otherwise picking one word out of the scrollback would silently switch CC off for the rest of the
// session, and the only way back would be a mute the user never knowingly set.
let liveMuteAuto = false;
const liveBtn = document.getElementById('liveBtn');
const liveAreaBtn = document.getElementById('liveAreaBtn');
liveAreaBtn.addEventListener('click', () => {
  if (didDrag) return;
  setPanel(null); // the picker is about to take the screen
  window.api.pickLiveArea();
});
liveBtn.addEventListener('click', () => {
  if (didDrag) return;
  setPanel(null); // the CC overlay is about to take the screen — the panel is done
  window.api.toggleLive();
});
// Bottom docks collide with both the CC edit box and the live card — step aside (mr) for the
// whole CC session (picking + live), come back after. The saved dock setting is never touched.
let prevLiveDock = null;
let livePickingUi = false;
function updateCcAside() {
  const want = livePickingUi || liveMode;
  if (want && !prevLiveDock && curDock[0] === 'b') { // any bottom-row column, not just the old three
    prevLiveDock = curDock;
    applyDock('mr', true);
    setHint('Pill moved aside for subtitles');
  }
  if (!want && prevLiveDock) {
    applyDock(prevLiveDock, true);
    prevLiveDock = null;
  }
}
window.api.onHoverState((on) => { hoverMode = on; syncModeSwitches(); });
window.api.onLivePicking((on) => {
  livePickingUi = on;
  updateCcAside();
  syncModeStrip(); // the CC chip is armed for exactly this window — without it the click showed nothing
});
window.api.onLiveState((on) => {
  liveMode = on;
  syncModeSwitches();
  livePickingUi = false; // live started (or stopped) — picking phase is over either way
  liveCardMuted = false; // any CC toggle resets the ✕-mute
  liveMuteAuto = false;  // ...and the scrollback hold, which cannot outlive the mode it was holding
  liveBtn.classList.toggle('active', on);
  liveBtn.textContent = on ? '◉ Stop live subtitles' : 'CC · Live subtitles';
  setDot(''); // recompute — setDot appends the .cc ring by itself while liveMode is on
  updateCcAside();
  if (!on && resultIsLive && !hovering) hideResult(); // CC stopped → the subtitle card goes with it
  if (!on && !result.hidden && !hovering) {
    // Mode just ended with a card still up — give it the normal countdown instead of forever.
    clearTimeout(holdTimer);
    if (HOLD_MS) holdTimer = setTimeout(hideResult, holdMsFor());
  }
});

// ---------- CC caption box (free-floating live-subtitle bar) ----------
// How often CC re-reads its strip. The box that used to sit at the bottom of the screen is gone —
// live lines land on the pill's own card now — so its font size, background opacity, position and
// show-original toggle went with it. This is the one CC setting that was never about the box.
const ccIntervalInput = document.getElementById('ccIntervalInput');
const ccIntervalLabel = document.getElementById('ccIntervalLabel');

ccIntervalInput.addEventListener('input', () => { ccIntervalLabel.textContent = (+ccIntervalInput.value / 1000).toFixed(1) + 's'; });
ccIntervalInput.addEventListener('change', () => window.api.setSettings({ ccIntervalMs: +ccIntervalInput.value }));
// Click the parked translation (the sliding vocab in the right slot) to re-open its full card. The
// spacer is clickable too (it's the old middle slot's empty real estate) regardless of what the
// right slot currently shows; the slot itself only reopens while it's actually showing that vocab
// (clicking ⌘⇧S/a status must not reopen a stale card).
spacerEl.addEventListener('click', () => {
  if (!didDrag && lastPayload && result.hidden) reopenCard(lastPayload);
});
hintEl.addEventListener('click', () => {
  if (!didDrag && rightShowingVocab && lastPayload && result.hidden) reopenCard(lastPayload);
});

// The banner is no longer only about Screen Recording, so the button has to remember which pane it is
// currently offering. Defaults to 'screen' — the case it was built for and the only one that raises it
// on macOS at boot.
let permPane = 'screen';
permBtn.addEventListener('click', () => window.api.openScreenSettings(permPane));
permRestartBtn.addEventListener('click', () => window.api.relaunch());
// Same banner, second exit: the Settings button gets you to the list, this one tells you WHICH file
// to put in it. Both are needed — the pane is useless if you then pick the wrong copy of the app.
permRevealBtn.addEventListener('click', () => window.api.revealApp());

// The Claude key is a power-user extra — keep it out of the default view so the
// free (Google) experience stays clean.
const keyHelp = document.getElementById('keyHelp');
advBtn.addEventListener('click', () => {
  keyRow.hidden = !keyRow.hidden;
  keyHelp.hidden = keyRow.hidden; // "where do I get a key" travels with the field
  advBtn.textContent = keyRow.hidden ? 'Advanced ▾' : 'Advanced ▴';
});

// Same disclosure for the Shortcuts block — six key rows you set once were making the System page
// scroll. "↺ Defaults" only makes sense next to the keys, so it travels with the body.
const shortcutsToggle = document.getElementById('shortcutsToggle');
const shortcutsBody = document.getElementById('shortcutsBody');
const shortcutsDefaultsBtn = document.getElementById('shortcutsResetBtn');
shortcutsToggle.addEventListener('click', () => {
  const open = shortcutsBody.hidden;
  shortcutsBody.hidden = !open;
  if (shortcutsDefaultsBtn) shortcutsDefaultsBtn.hidden = !open;
  // Move the i18n KEY, not just the text. Writing textContent alone left the element still claiming
  // the closed-state key, so the next language switch put the ▾ back on an open block.
  shortcutsToggle.dataset.i18n = open ? 'btn.shortcutsOpen' : 'btn.shortcuts';
  shortcutsToggle.textContent = window.i18n.t(shortcutsToggle.dataset.i18n);
  shortcutsToggle.setAttribute('aria-expanded', String(open));
});
// Third disclosure, same contract as the two above: the Display page's set-once rows. The panel is
// content-sized, so opening this makes it taller — updateDropRoom() re-measures the room the stack has
// above/below the pill, which is what stops a grown panel from running off the top of the screen.
const dispMoreBtn = document.getElementById('dispMoreBtn');
const dispMoreBody = document.getElementById('dispMoreBody');
if (dispMoreBtn && dispMoreBody) dispMoreBtn.addEventListener('click', () => {
  const open = dispMoreBody.hidden;
  dispMoreBody.hidden = !open;
  // Move the i18n KEY, not just the text — see shortcutsToggle above for what writing textContent
  // alone costs at the next language switch.
  dispMoreBtn.dataset.i18n = open ? 'btn.moreDisplayOpen' : 'btn.moreDisplay';
  dispMoreBtn.textContent = window.i18n.t(dispMoreBtn.dataset.i18n);
  dispMoreBtn.setAttribute('aria-expanded', String(open));
  updateDropRoom();
});
document.getElementById('keyLink').addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openUrl('https://console.anthropic.com/settings/keys');
});

// Type-to-translate: skips OCR, so no misreads. Enter or ↵ button fires it.
const typeInput = document.getElementById('typeInput');
const typeBtn = document.getElementById('typeBtn');
function submitTyped() {
  const text = typeInput.value.trim();
  if (!text) return;
  window.api.translateText(text);
  // The line STAYS, selected. Clearing it meant a typo cost the whole word again — jek typed "แบน",
  // meant something else, and had nothing left to fix (2026-08-15). Neither a spell-checker nor the ✎
  // row can rescue that one: "แบน" is a real word, so nothing flags it. Selected rather than merely
  // kept, so the common case is unchanged — the next thing you type still replaces it in one
  // keystroke, exactly as an empty field would, while an arrow key or a click now lands you inside
  // the word to fix one letter.
  typeInput.select();
  clearPeek(); // the full card is on its way — the rough preview has done its job
}
typeBtn.addEventListener('click', submitTyped);

// ---- Type page: live meaning while you type ------------------------------------------------------
// The meaning appears as you type, from the FREE Google endpoint (debounced) — Enter is still what
// runs the real Claude card. The preview is deliberately labelled "quick look" so it never gets
// mistaken for the full card. Searching your OWN past words is the Dictionary page's job (dictSearch).
const typeTip = document.getElementById('typeTip');
const typePeek = document.getElementById('typePeek');
const peekTh = document.getElementById('peekTh');
const peekSub = document.getElementById('peekSub');
const peekSenses = document.getElementById('peekSenses'); // the other word classes, behind Settings › showSenses
let peekTimer = null;
let peekGen = 0; // a slower older lookup must never overwrite a newer one's answer

function clearPeek() {
  clearTimeout(peekTimer);
  peekGen++;            // invalidate anything in flight
  typePeek.hidden = true;
  peekTh.textContent = '';
  peekSub.textContent = '';
  peekSenses.textContent = '';
  peekSenses.hidden = true;
  typeTip.hidden = false; // the "what this page is" blurb comes back when the field empties
}

function runPeek(text) {
  const gen = ++peekGen;
  typePeek.hidden = false;
  // Keep the last answer visible while the new one loads (a blank flash on every keystroke read as
  // flicker); just dim it so it's obviously not settled yet.
  typePeek.classList.add('loading');
  if (!peekTh.textContent) peekTh.textContent = '…';
  window.api.peekText(text).then((r) => {
    if (gen !== peekGen) return; // a newer keystroke already won
    typePeek.classList.remove('loading');
    if (!r || !r.text) {
      peekTh.textContent = '—'; peekSub.textContent = 'No quick match · Enter for the full card';
      peekSenses.textContent = ''; peekSenses.hidden = true; // the senses of the word BEFORE this one are not an answer
      return;
    }
    peekTh.textContent = r.text;
    // THE case jek pointed at (2026-08-12): typing a word answered "verb" in grey body text with a
    // middle dot, while pointing at the same word on screen answered with a coloured chip. Same chip
    // here now — the sub-line keeps only what it is actually for, which is what to press next.
    peekSub.textContent = '';
    const peekChip = r.pos && showPos ? posBadgeEl(r.pos) : null;
    if (peekChip) { peekSub.appendChild(peekChip); peekSub.appendChild(document.createTextNode(' ')); }
    peekSub.appendChild(document.createTextNode('quick look · Enter for the full card'));
    // "[V.] วิ่ง · [N.] การวิ่ง" — the other word classes this word has, when Settings asks for them
    // (showSenses, off by default). The lookup has ALWAYS returned them (translate() keeps up to three
    // groups, main.js) and this bar has always thrown them away, which is why typing a word that is
    // both a noun and a verb answered with only one of the two. Its own row under the sub-line, and
    // silent for a word with a single sense — fillSenseChips reports that as false.
    // skipFirst: peekSub above already wears the primary chip (see peekChip).
    const peekExtra = showSenses && fillSenseChips(peekSenses, r.senses, undefined, !!peekChip);
    if (!peekExtra) peekSenses.textContent = '';
    peekSenses.hidden = !peekExtra;
  }).catch(() => {
    // An IPC teardown (reload mid-lookup) would otherwise leave the quick-look dimmed at "…" forever —
    // nothing else clears .loading until the user happens to type again.
    if (gen !== peekGen) return;
    typePeek.classList.remove('loading');
    peekSub.textContent = 'Quick look unavailable · Enter for the full card';
    peekSenses.textContent = ''; peekSenses.hidden = true;
  });
}

// Auto-hide arms from the mousemove handler when the cursor leaves the panel — which can happen just
// BEFORE the field is focused (cursor parked off to the side, then ⌘⇧T). That already-pending timer
// would then close the panel out from under someone mid-word, so focusing the field cancels it; the
// handler's own typingInPanel guard keeps it from re-arming while the caret is here.
// Focus alone must not cancel the countdown — it may only re-ask the question. This cleared the
// timer outright, and because opening History/Type focuses this field a moment AFTER the panel
// opens, it wiped the countdown that opening had just started and nothing ever set it again: the
// panel stayed open forever, about one time in three. armPanelIdle keeps the field's real veto (a
// field with something typed in it), which is what this line was reaching for. (2026-08-06)
typeInput.addEventListener('focus', () => armPanelIdle(elementUnderCursor()));
typeInput.addEventListener('input', () => {
  const text = typeInput.value.trim();
  typeTip.hidden = !!text;  // the blurb yields to the answer the moment there's something to answer
  clearTimeout(peekTimer);
  if (!text) { clearPeek(); return; }
  peekGen++;                // drop any in-flight lookup for the previous text
  // 120ms after the LAST keystroke. It was 300, chosen to keep the request count down — but the
  // lookup itself measures 50-145ms, so the wait was two thirds of the delay you could feel (jek:
  // "why does the instant bar read so slow"). 120ms still lands between letters at any normal typing
  // speed, so a whole word is one request, and the answer now shows ~200ms after you stop.
  peekTimer = setTimeout(() => runPeek(text), 120);
});
typeInput.addEventListener('keydown', (e) => {
  // Japanese/Chinese/Korean input: Enter is how you CONFIRM the conversion candidate, and that keydown
  // reaches us too (isComposing / keyCode 229). Acting on it translated a half-picked candidate, blurred
  // the field and threw focus back at the game mid-word — the whole IME path was unusable. Let the IME
  // have that Enter; the next one (composition already committed) is the real submit.
  if (e.isComposing || e.keyCode === 229) return;
  // Enter TRANSLATES AND STAYS. It used to blur the field and hand focus back to the game, which let
  // the panel's auto-hide close the whole Type bar a moment later — the card and pill appeared to
  // vanish and re-open on every word (jek). Typing here means you're looking words up, not playing,
  // so the bar stays put and keeps the caret: the next word is one keystroke away, and each one is
  // already saved to History by main. Escape is the way out (it closes AND returns focus to the game).
  if (e.key === 'Enter') { e.preventDefault(); submitTyped(); typeInput.focus(); }
  else if (e.key === 'Escape') { typeInput.value = ''; clearPeek(); typeInput.blur(); setPanel(null); window.api.typeDone(); }
});

// ---- Type / Dictionary pages --------------------------------------------------------------------
// The panel's ☰ button now lands on TYPE, not the word list: typing is what people open this for, and
// the ⌘⇧T shortcut is not discoverable on its own (jek). Dictionary is one tab away and keeps
// everything the old History view had (list, ★ filter, review link).
// 'type' | 'hist' | 'vocab'. History and Vocab share ONE list element and one search box — they're
// the same kind of list, just fed from different collections (historyList vs vocab), which switchTab
// already handles. So the page swap is: same DOM, different source.
let panelPage = 'type';
function setPanelPage(page) {
  // Measure the height BEFORE the page swap so the box can slide to its new size instead of snapping —
  // the same treatment History↔Settings already gets via swapPanelView. Tab switches were jumping (jek).
  // But when this call is part of an OPEN (panelJustOpened), the panel is entering via cardIn — sliding
  // its height at the same time reads as two motions, so skip the slide and let the entrance carry it.
  const justOpened = panelJustOpened; panelJustOpened = false;
  const fromH = panel.hidden ? 0 : panel.offsetHeight;
  panelPage = page;
  tabType.classList.toggle('active', page === 'type');
  tabHist.classList.toggle('active', page === 'hist');
  typePage.hidden = page === 'type' ? false : true;
  dictPage.hidden = page === 'type';
  if (page === 'hist') {
    // Coming back to the list keeps whichever lens was on — leaving for Type and returning should
    // not quietly move you off your ★ words.
    dictSearch.placeholder = window.i18n.t(histMode === 'saved' ? 'ph.searchVocab' : 'ph.searchHistory');
    switchTab(histMode);
    syncScopeChip(); // switchTab no-ops when the mode is unchanged, so sync the chip here regardless
  }
  if (page === 'type') { typeInput.focus(); typeInput.select(); }
  if (!justOpened) animatePanelHeight(fromH); // slide only on a real tab switch; an open uses cardIn instead
}
tabType.addEventListener('click', () => setPanelPage('type'));
tabHist.addEventListener('click', () => setPanelPage('hist'));

// Dictionary search: local only (no network) — it filters what you've ALREADY looked up, on both
// sides of every card, plus your ★ saved words when that filter is on.
const dictSearch = document.getElementById('dictSearch');
dictSearch.addEventListener('input', () => setQuery(dictSearch.value));
dictSearch.addEventListener('keydown', (e) => {
  // Enter on a search that found nothing = "then go look it up": hand the text to the Type page.
  if (e.key === 'Enter') {
    e.preventDefault();
    const q = dictSearch.value.trim();
    if (!q) return;
    setPanelPage('type');
    typeInput.value = q;
    typeInput.dispatchEvent(new Event('input'));
  } else if (e.key === 'Escape') {
    dictSearch.value = ''; setQuery('');
  }
});

// Escape closes what is in front of you — for every surface, not just the two text fields that
// happened to implement it. The app's own Type blurb promises "Esc closes it", and that promise was
// true only while the caret sat in that one box: a card you were reading, or the History list, both
// ignored the key. Same shape as the hover bug — one behaviour, implemented per-instance, so it
// existed on the instances someone happened to think about. (jek's rule, 2026-08-06)
//
// Deliberately NOT a global shortcut: this is a document listener, so it only fires when the overlay
// actually has focus. Registering Escape globally would take it away from the game underneath, which
// is the one key a game is most likely to want.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  // A text field owns Escape while the caret is in it — clear/cancel the box, don't close the window
  // behind it. This used to say `panel.contains(ae)`, which was true of every field that existed when
  // it was written and false of the correction field on the CARD: this listener is capture-phase, so
  // it ran BEFORE the field's own handler and closed the card out from under the caret (jek,
  // 2026-08-15, mid-edit). The rule was never about the panel — it is about there being a caret.
  const ae = document.activeElement;
  if (ae && ae.matches('input, textarea')) return;
  // Front-most first: the card sits above the panel in the stack, so it is what "this" means.
  if (!result.hidden) { hideResult(); e.preventDefault(); return; }
  if (panelMode) { setPanel(null); e.preventDefault(); }
}, true);

// Open the type field ready to type (word → translation, no OCR). Used by ⌘⇧T (main.js doTypeFocus)
// AND the pill's ⌨ button — the click path is the easy way to translate a word on DRM content like
// Netflix where screen-capture OCR can't read the frame.
function openTypeBox(seed = '') {
  clearRetuck();         // typing is a session, not a glance — the pill stays out afterwards
  untuck();              // if tucked to the edge, bring the pill back first
  setPanel('history');  // the panel; its Type page holds #typeInput
  setPanelPage('type'); // focuses + selects the field
  if (seed) {
    // A macOS-typed character out of a snip seeds the field so the keystroke isn't lost. Caret after it,
    // and fire `input` so the live meaning-peek updates as if it had been typed normally.
    typeInput.value = seed;
    const n = seed.length; typeInput.setSelectionRange(n, n);
    typeInput.dispatchEvent(new Event('input'));
  }
}
// ⌘⇧T opens the panel's type box as it always has. Coming out of a snip (Space, or a typed character
// on macOS) it opens in the PILL instead — that's where the translation lands anyway. Either way it's
// a real focused input, so IME languages (Japanese/Chinese/Korean) type normally.
window.api.onTypeFocus(({ seed = '' } = {}) => { openTypeBox(seed); });

// ---------- subtitle appearance ----------

const SRC_TAG = { eng: 'EN', jpn: 'JA', chi_sim: 'ZH', kor: 'KO', tha: 'TH' };
const TGT_TAG = { th: 'TH', en: 'EN', ja: 'JA', 'zh-CN': 'ZH', ko: 'KO', es: 'ES', fr: 'FR', de: 'DE', vi: 'VI' };

function renderSettings(s) {
  if (!s) return;
  showEnBtn.checked = !!s.showEnglish;
  showEnglish = !!s.showEnglish;
  rEn.hidden = !showEnglish || !rEn.textContent;
  // The four content switches. Guarded on `typeof` like the booleans below it: a partial settings blob
  // (an older main, a patch echo) must leave them where they were rather than silently turn them off.
  const contentWas = `${showPos}|${showEnMeaning}|${showReading}|${showSenses}`;
  if (typeof s.showPos === 'boolean') { showPos = s.showPos; showPosBtn.checked = s.showPos; }
  if (typeof s.showEnMeaning === 'boolean') { showEnMeaning = s.showEnMeaning; showEnMeanBtn.checked = s.showEnMeaning; }
  if (typeof s.showReading === 'boolean') { showReading = s.showReading; showReadingBtn.checked = s.showReading; }
  if (typeof s.showSenses === 'boolean') { showSenses = s.showSenses; showSensesBtn.checked = s.showSenses; }
  // A card already on screen must not go on saying what it is no longer allowed to: the row you just
  // ticked is the one you are looking at, and a switch whose effect you only see on the NEXT snip
  // reads as a switch that did nothing. Re-rendered from the payload the card was BUILT from —
  // `shownPayload`, not lastPayload, which is the last TRANSLATION and is a different card whenever
  // this one came from a History row. Nothing is refetched, and the redraw only runs when one of the
  // four actually moved (renderSettings runs on every settings change, ours or not).
  if (contentWas !== `${showPos}|${showEnMeaning}|${showReading}|${showSenses}`) {
    if (shownPayload && !result.hidden) showResult(shownPayload);
    // The open LIST is looking at you too, and it draws the same chips — leaving it on the old answer
    // is the same "switch that did nothing" the card was fixed for. (The ★ list has drawn a word class
    // since it existed and went stale here just the same; History only joins it now.)
    if (panelMode === 'history') {
      // Keep the reader's place. Both renderers land the list on row 0 by design (that's where a
      // FRESH list belongs), but this render was triggered by a switch in Settings, not by new
      // content — scrolling someone back to the top for ticking a checkbox is losing their place to
      // answer a question they didn't ask. Restored the way switchTab does it, _wantScrollTop and
      // all, because appendRows is still pumping rows in when this returns.
      const keep = logEl.scrollTop;
      histMode === 'saved' ? renderSaved() : renderHistory();
      logEl._wantScrollTop = keep;
      requestAnimationFrame(() => { logEl.scrollTop = keep; });
    }
  }
  hideCapBtn.checked = !!s.hideFromCapture;
  // Windows only — see the note in index.html. Revealed from the settings snapshot rather than from a
  // platform guess in the renderer, so main stays the one place the rule is written.
  if (recSnipRow) recSnipRow.hidden = !s.isWin;
  if (recSnipBtn) recSnipBtn.checked = !!s.recordableSnip;
  if (typeof s.autoHidePanel === 'boolean') { autoHidePanel = s.autoHidePanel; autoHideBtn.checked = s.autoHidePanel; }
  // No control for this one any more (Settings stopped asking, 2026-08-19) — the stored value is still
  // read so an install that had it off stays off, and DEFAULT_SETTINGS keeps it on for everyone else.
  if (typeof s.pillKeyword === 'boolean') { pillKeyword = s.pillKeyword; refreshXlate(true); }
  if (typeof s.followMonitor === 'boolean') followMonitorBtn.checked = s.followMonitor;
  // Only a packaged build can own a login item (main won't register Electron itself), so in a dev run
  // the row is disabled and says so rather than accepting a tick that does nothing.
  if (typeof s.openAtLogin === 'boolean') openAtLoginBtn.checked = s.openAtLogin;
  if (typeof s.aiCards === 'boolean' && aiCardsBtn) aiCardsBtn.checked = s.aiCards;
  if (typeof s.aiMixedRead === 'boolean' && aiMixedReadBtn) aiMixedReadBtn.checked = s.aiMixedRead;
  if (typeof s.hoverDwellSave === 'boolean' && hoverDwellSaveBtn) hoverDwellSaveBtn.checked = s.hoverDwellSave;
  if (typeof s.canOpenAtLogin === 'boolean') {
    openAtLoginBtn.disabled = !s.canOpenAtLogin;
    openAtLoginBtn.closest('.gs-row').classList.toggle('gs-row--off', !s.canOpenAtLogin);
  }
  if (s.pillStyle && s.pillStyle !== pillStyle) {
    pillStyle = s.pillStyle;
    pillStyleSel.value = pillStyle; pillStyleSel._cddSync?.();
    pillPreview.dataset.style = pillStyle;
    applyPillStyle();
  }
  pillStyleFirstApply = false; // whatever came next is a CHANGE, not the startup state
  if (ccIntervalInput) {
    ccIntervalInput.value = s.ccIntervalMs || 1200;
    ccIntervalLabel.textContent = ((s.ccIntervalMs || 1200) / 1000).toFixed(1) + 's';
  }
  // Put the pill on its remembered dock spot (no animation — it's already there on launch). Skipped
  // mid-drag so a settings echo can't yank it out from under the cursor.
  if (s.dock && !dragging) { applyDock(s.dock, false); try { localStorage.setItem('gt.dock', s.dock); } catch {} }
  // Reveal (see body:not(.ready) in the CSS). Normally the pill was already placed + revealed
  // synchronously at boot from the localStorage cache, so this is a no-op safety net.
  document.body.classList.add('ready');
  if (typeof s.slideSpeed === 'number' && s.slideSpeed !== slideSpeed) {
    // Guarded on an ACTUAL change: renderSettings echoes after every settings save (dock, …) and
    // unconditionally re-running the tickers here restarted a healthy slide.
    slideSpeed = s.slideSpeed;
    // Re-run whatever is currently sliding (vocab or hint/status — refreshXlate now covers both
    // since the merge into one slot) so the new speed applies immediately.
    refreshXlate(true);
  }
  // Unguarded, unlike the slider above: setting it costs one clamp and touches no timers, and the
  // value has to reach GTTts before the next 🔊 — that module keeps its own copy, so a skipped echo
  // means a word read at the old volume.
  if (typeof s.maxHistory === 'number' && s.maxHistory > 0) histCap = s.maxHistory;
  if (typeof s.speakVolume === 'number') {
    speakVolInput.value = s.speakVolume;
    speakVolLabel.textContent = `${s.speakVolume}%`;
    window.GTTts.setVolume(s.speakVolume / 100);
  }
  // 'click' style was removed (dead on Windows' click-through overlay, and just a coarse 'point' on mac).
  // A config saved before the cut — or synced from an old install — would leave the <select> blank, so
  // fold it back to the default 'drag' (jek, 2026-07-31).
  if (s.snipStyle) {
    // Three stored values, two modes on screen. 'drag' (and the older 'click' alias for it) collapse
    // into Casually: the only thing that ever separated 'hold' from 'drag' was whether the bound
    // trigger could physically be held, and effectiveSnipStyle() in main already decides that from
    // the key — it was never a choice worth putting in front of a player. Displaying it as Casually
    // does NOT rewrite the setting; a stored 'drag' keeps behaving as 'drag' until the toggle is
    // actually pressed, at which point 'hold' is saved and main degrades it right back where it must.
    // Anything that is not the hold shows as Drag a box. 'point' is no longer offered, and an
    // install still carrying it must land on a real option rather than on nothing — a select whose
    // value matches no option renders blank and then writes that blank back on the next change.
    // 'spot' joins the two above as a real stored value with an option of its own; everything else
    // still folds to 'drag' for the reason in the paragraph above (a value with no matching option
    // renders the select blank and then writes the blank back).
    // 'hold' is now the only option in the list, so every stored value lands on it — a select whose
    // value matches no option renders blank and writes that blank back on the next change, which is
    // the trap the paragraph above is about. What main.js actually RUNS is still its own decision:
    // effectiveSnipStyle degrades to 'drag' when the bound trigger cannot be held, and updateHoldNote
    // below is what says so.
    snipStyleSel.value = 'hold';
    snipStyleSel._cddSync?.();
    updateHoldNote(); // the saved style may be one this trigger can't do — say so, don't just ignore it
  }
  // App-chrome language. Only re-apply when the preference actually changed (renderSettings echoes on
  // every save) so applyI18n doesn't run on unrelated setting writes.
  if (window.i18n) {
    const pref = s.uiLang || 'auto';
    if (pref !== curUiLangPref) {
      curUiLangPref = pref;
      if (uiLangSel) { uiLangSel.value = pref; uiLangSel._cddSync?.(); }
      window.i18n.setUiLang(pref);
      // applyI18n only walks data-i18n elements; the description bar's text is copied in by JS, so
      // it would keep the old language until the next hover without this.
      if (typeof setDescDefault === 'function') setDescDefault();
      // applyI18n rewrites dataset.tip from the STATIC key, which drops the live count the Learn
      // button writes there — same reason setDescDefault has to re-run.
      updateLearnBadge();
    }
  }
  if (typeof s.holdSec === 'number') {
    HOLD_MS = s.holdSec * 1000;
  }
  if (s.sourceLang) { sourceLangSel.value = s.sourceLang; sourceLangSel._cddSync?.(); }
  if (s.targetLang) {
    targetLangSel.value = s.targetLang; targetLangSel._cddSync?.();
    if (coachLangSel) coachLangSel.value = s.targetLang;
  }
  // Brand label always reflects the current direction, e.g. "JA → TH". The vocab lives in the
  // separate middle slot now, so the direction never gets overwritten.
  if (s.sourceLang && s.targetLang) {
    brandDir = `${SRC_TAG[s.sourceLang] || '?'} → ${TGT_TAG[s.targetLang] || '?'}`;
    // The two tags only — writing brandEl.textContent here would delete the arrow element that lives
    // between them, and with it the anchor the PRO tag is centred on.
    brandSrcEl.textContent = SRC_TAG[s.sourceLang] || '?';
    brandTgtEl.textContent = TGT_TAG[s.targetLang] || '?';
    srcLangNow = s.sourceLang;
    tgtLangNow = s.targetLang;
    renderLangPair(s.sourceLang, s.targetLang); // Settings shows the same pair, plus where Swap leads
    positionProTag(); // the arrow just moved — the tag sits above it, so it moves too
  }
  // The key never leaves the main process — all we get back is whether one is set. Also gates the
  // ★ vocab-collect path: with a key it auto-extracts via Claude, without it falls back to chips.
  // The known-threshold lives in settings now; the shared model holds it for every badge/count here.
  if (s.gradSeen) setGradSeen(s.gradSeen);
  // hasKey now means "an AI call can be attempted", which is true for everyone — the free trial
  // covers a new install and a licence covers it after that. It no longer means a key is set.
  hasKey = !!s.hasKey;
  // The tag marks a paid or self-funded install: a licence, or your own key. Not the free trial —
  // saying Pro to someone on a trial is the kind of thing they notice when the trial runs out.
  // The pill wears the plan as a SHAPE now (see .pill.pro .dot::before), so the floating word is gone.
  // A label on a tool is read every session for a fact that is true once; the diamond is noticed by
  // the person who paid for it and by nobody else (jek, 2026-08-15).
  //
  // isPro() — the SAME question the ★ gates and the Pro box already ask. Written as
  // `hasLicence || hasOwnKey` at first, which was a second definition of one fact: on this personal
  // build isPro() is true and that pair is false, so the pill showed Free while every other Pro
  // surface in the app was unlocked. One fact, one function.
  pill.classList.toggle('pro', isPro());
  proTag.hidden = true;
  keyInput.placeholder = s.hasOwnKey ? 'Claude key saved ✓' : 'Claude API key (sk-ant-…) — optional';
  renderCardPreview();
  renderQuota(s);
}

sourceLangSel.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ sourceLang: sourceLangSel.value }));
});
// The coach's copy of the To list. Writes through the same setSettings call as Settings' <select>
// rather than keeping its own state — two controls for one setting is two truths, and this one is on
// screen for about fifteen seconds.
coachLangSel.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ targetLang: coachLangSel.value }));
});

targetLangSel.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ targetLang: targetLangSel.value }));
});

// ---- Swapping the pair, in the place that owns the pair -------------------------------------------
// The two lists are NOT mirrors of each other: the source is what an OCR engine can READ (four
// languages, plus Thai on macOS via Vision) and the target is what the translator can WRITE (seven).
// So a swap exists only when the current target names something readable — es → ? has no answer.
// A button that quietly does nothing teaches nothing, so the row dims, the label says what is missing,
// and the description bar underneath explains it. This is what the pill's arrow could never do.
const SRC_OF_TGT = { en: 'eng', ja: 'jpn', 'zh-CN': 'chi_sim', ko: 'kor', th: 'tha' };
const TGT_OF_SRC = { eng: 'en', jpn: 'ja', chi_sim: 'zh-CN', kor: 'ko', tha: 'th' };
const langSwapBtn = document.getElementById('langSwapBtn');
// The pair a swap WOULD leave you on, or null when there isn't one.
function swapPairOf(src, tgt) {
  const sourceLang = SRC_OF_TGT[tgt];
  const targetLang = TGT_OF_SRC[src];
  if (!sourceLang || !targetLang) return null;
  if (sourceLang === 'tha' && !(window.api && window.api.thaiSource)) return null;
  return { sourceLang, targetLang };
}
// The ⇄ between the two pickers: live or dim, and when it is dim its tooltip says which of the two
// reasons it is. Called from renderSettings — the pair can change from either picker, from this
// button, or from a settings load, and all three land there.
function renderLangPair(src, tgt) {
  if (!langSwapBtn) return;
  const next = swapPairOf(src, tgt);
  langSwapBtn.classList.toggle('gs-langswap--off', !next);
  langSwapBtn.setAttribute('aria-disabled', next ? 'false' : 'true');
  // Written straight onto title, not via data-i18n-title: applyI18n() would put the plain "Swap the
  // two languages" back over the reason. Re-read here on every render, so a language change repaints.
  langSwapBtn.title = next
    ? window.i18n.t('tip.langSwap')
    : window.i18n.t(SRC_OF_TGT[tgt] === 'tha' ? 'swap.mac' : 'swap.none');
}
// aria-disabled and a class, not the `disabled` attribute — see .gs-langswap--off in styles.css: a
// disabled button drops its own hover in Chromium, and the tooltip is where the reason lives.
if (langSwapBtn) langSwapBtn.addEventListener('click', async () => {
  const next = swapPairOf(srcLangNow, tgtLangNow);
  if (!next) return;
  renderSettings(await window.api.setSettings(next));
});

keySaveBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  renderSettings(await window.api.setSettings({ apiKey: key }));
  keyInput.value = '';
  setHint(key ? 'Claude key saved' : 'Claude key cleared');
});

// Show the count only once there is a real one to show. It arrives from the headers of a proxied
// call, so a fresh install has none yet — and "0 of 10 used" before you have even tried anything
// is a number about nothing. Your own key means no ceiling at all, so there is nothing to say.
// A quota line is only worth screen space when it is about to matter. Showing "12 of 500 used" on
// every visit turns a bundle you bought outright into a taxi meter — the exact feeling that makes a
// one-time buyer think they are paying per use (PRICING-AI.md §11). So: silent until the last tenth.
// The same rule and the same threshold live in renderer/learn/index.js — one kind of thing, one
// mechanism. Change both or neither.
// The floor matters as much as the fraction: a 10-read trial's last tenth is ONE read, which is a
// warning that arrives too late to act on. Whichever is larger wins, so a 500-read purchase stays
// silent until 50 left and a 10-read trial says something at 3.
const QUOTA_LOW_AT = 0.1;
const QUOTA_LOW_FLOOR = 3;
function quotaLow(q) {
  if (!(q.limit > 0)) return false;
  return (q.limit - q.used) <= Math.max(QUOTA_LOW_FLOOR, Math.ceil(q.limit * QUOTA_LOW_AT));
}
function renderQuota(s) {
  const q = s && s.quota;
  paintLicence(s); // the box above it answers the same question at a coarser grain — one call site
  if (!quotaNote) return;
  if (s.hasOwnKey || !q || !q.limit) { quotaNote.hidden = true; return; }
  const out = q.used >= q.limit;
  const low = quotaLow(q);
  // The count used to appear only once it was nearly gone, so "how many do I have?" — asked when
  // nothing is wrong — had no answer anywhere in the app (jek, 2026-09-08). It is stated plainly
  // here now and stays out of the pill: a meter in the corner of every read is what makes a
  // one-time purchase feel like paying by the card, which is the thing PRICING-AI §11 settled.
  const key = out ? 'quota.out'
    : low ? (q.plan === 'pro' ? 'quota.pro' : 'quota.free')
    : (q.plan === 'pro' ? 'quota.havePro' : 'quota.have');
  quotaNote.classList.toggle('warn', out || low);
  const text = window.i18n.t(key)
    .replace('{used}', String(q.used))
    .replace('{left}', String(Math.max(0, q.limit - q.used)))
    .replace('{limit}', String(q.limit));
  quotaNote.textContent = text;
  quotaNote.hidden = false;
}

// What the box says about right now. Called from renderSettings, so it answers from the same
// settings object every other control paints from — never from what was typed a moment ago.
function paintLicence(s) {
  if (!licBox) return;
  const own = !!s.hasOwnKey, pro = !!s.hasLicence;
  licBox.classList.toggle('pro', pro || own);
  licBox.classList.remove('unknown');
  licTitle.textContent = own ? 'Your own Claude key' : (pro ? 'Gloss Pro' : 'Free');
  // "A bundle of AI cards" is a promise, and right now it is not one the app can keep:
  // the proxy that would serve it is not deployed, so a new user reads it, presses ✦ and meets a
  // failure. Say what is true today, and let the sentence change when the server exists.
  licSub.textContent = own ? 'AI cards run on your key — no limit'
    : (pro ? 'Licence saved on this machine' : 'Free — 10 AI cards to try');
  licInput.placeholder = pro ? 'Replace the licence key' : 'Gloss Pro licence key';
  // buyUrl rides in on the settings snapshot rather than being written here, so the pill and Learn
  // point at the same place and there is one line to change the day a real checkout exists
  // (main.js BUY_URL).
  //
  // This used to be `own || pro || !buyUrl` — hidden from anyone who had already paid. That closed
  // the only door a customer has: a licence buys a fixed bundle that never refills, so the person
  // most likely to want another one was the single group the button refused to appear for, and
  // quota.out sent them to fetch their own Anthropic key instead — the one outcome that earns
  // nothing. Top-ups have existed on the seller's side since 2026-09-07 (mint-key --topup adds to
  // the SAME key, nothing for them to paste) and the product never said so. It stays hidden for
  // 'own', where a bundle would be pointless: their own key has no ceiling to raise.
  buyUrl = s.buyUrl || buyUrl;
  licBuyBtn.hidden = own || !buyUrl;
  // Set here rather than left to data-i18n: the label depends on who is reading it, which the markup
  // cannot know. applyI18n re-runs this function on a language switch, so both stay translated.
  licBuyBtn.textContent = window.i18n.t(pro ? 'btn.topup' : 'btn.buy');
}

function licSay(text, kind) {
  if (!licMsg) return;
  licMsg.textContent = text || '';
  licMsg.classList.toggle('bad', kind === 'bad');
  licMsg.classList.toggle('good', kind === 'good');
  licMsg.hidden = !text;
}

licSaveBtn.addEventListener('click', async () => {
  const key = licInput.value.trim();
  // Clearing is not an activation and has nothing to check.
  if (!key) {
    renderSettings(await window.api.setSettings({ licenceKey: '' }));
    licSay('Licence cleared — back to the free allowance.');
    return;
  }
  licSaveBtn.disabled = true;
  licSay('Checking…');
  const res = await window.api.verifyLicence(key).catch(() => ({ state: 'unreachable' }));
  licSaveBtn.disabled = false;
  if (res.state === 'invalid') {
    // NOT saved. Storing a key the server has already refused would leave the box claiming Pro on a
    // machine that has none, and the next AI call would be the one to break the news.
    licSay('That key was not recognised. Check it and try again.', 'bad');
    return;
  }
  renderSettings(await window.api.setSettings({ licenceKey: key }));
  licInput.value = '';
  if (res.state === 'ok') {
    licSay(res.plan === 'pro' ? 'Pro is on — thank you.' : 'Key accepted, on the free plan.', 'good');
  } else {
    // Saved, and honest about what we do not know. The Worker is not deployed yet, so this is the
    // answer most builds will give today; calling it "wrong key" would accuse an honest buyer.
    licBox.classList.add('unknown');
    licSay('Saved — could not reach the licence server, so it will be checked the next time you are online.');
  }
});


// The four content switches. Each saves ONE key and lets the round trip through main paint every
// surface (renderSettings redraws an open card; the Alt+G bubble and the peek read the new value on
// the next word) — the same shape every other toggle on this page uses.
showPosBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ showPos: showPosBtn.checked }));
});
showEnMeanBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ showEnMeaning: showEnMeanBtn.checked }));
});
showReadingBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ showReading: showReadingBtn.checked }));
});
showSensesBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ showSenses: showSensesBtn.checked }));
});

showEnBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ showEnglish: showEnBtn.checked }));
});

if (recSnipBtn) recSnipBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ recordableSnip: recSnipBtn.checked }));
});

hideCapBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ hideFromCapture: hideCapBtn.checked }));
  setHint(hideCapBtn.checked ? 'Hidden from screen capture' : 'Visible in screen capture');
});
followMonitorBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ followMonitor: followMonitorBtn.checked }));
  setHint(followMonitorBtn.checked ? 'Overlay follows the snipped monitor' : 'Overlay stays on this monitor');
});
if (hoverDwellSaveBtn) hoverDwellSaveBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ hoverDwellSave: hoverDwellSaveBtn.checked }));
});
if (aiMixedReadBtn) aiMixedReadBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ aiMixedRead: aiMixedReadBtn.checked }));
});
if (aiCardsBtn) aiCardsBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ aiCards: aiCardsBtn.checked }));
});
openAtLoginBtn.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ openAtLogin: openAtLoginBtn.checked }));
  setHint(openAtLoginBtn.checked ? 'Gloss starts with your computer' : 'Gloss starts when you open it');
});

// ---- The card preview on the Display page -------------------------------------------------------
// Four switches decide what a card carries beyond the translation, and their labels cannot say what
// they add — "Reading" and "Other meanings" only mean something once you have seen the line appear.
// So the group draws one fixed example and takes the lines away as you switch them off (jek,
// 2026-08-19, asking for the same treatment Pill style already had). Reads the SAME module-level
// flags the real card reads, set by renderSettings from stored settings, so the picture cannot drift
// from what a real card would do.
const cardPrevEl = document.getElementById('cardPrev');
const cpSrcEl = document.getElementById('cpSrc');
const cpReadEl = document.getElementById('cpRead');
const cpPosEl = document.getElementById('cpPos');
const cpEnEl = document.getElementById('cpEn');
const cpSensesEl = document.getElementById('cpSenses');
function renderCardPreview() {
  if (!cardPrevEl) return;
  cpSrcEl.hidden = !showEnglish;      // Show source text — the row that lives up on the visible page
  cpReadEl.hidden = !showReading;
  cpPosEl.hidden = !showPos;
  cpEnEl.hidden = !showEnMeaning;
  cpSensesEl.hidden = !showSenses;
  // The meta line holds two independent chips; with neither of them on it would be an empty gap.
  cpPosEl.parentElement.hidden = !showPos && !showEnMeaning;
}
pillStyleSel.addEventListener('change', async () => {
  pillStyle = pillStyleSel.value;
  pillPreview.dataset.style = pillStyle; // the picture changes in the same frame as the setting
  applyPillStyle();
  await window.api.setSettings({ pillStyle }); // no renderSettings() — it would re-apply what we just did
});
autoHideBtn.addEventListener('change', async () => {
  autoHidePanel = autoHideBtn.checked; // apply immediately so the current open panel obeys it
  if (!autoHidePanel) clearTimeout(panelIdleTimer); // turning it off cancels any pending close
  renderSettings(await window.api.setSettings({ autoHidePanel: autoHideBtn.checked }));
  setHint(autoHideBtn.checked ? 'Panel auto-hides' : 'Panel stays open');
});

// Same two-event split, for the same reason: the number applies as you drag (so the next 🔊 is at the
// volume you are looking at) and only the release is written to disk. `|| 100` is deliberately NOT
// used — 0 is a real choice here, and it is the one the fallback would silently overwrite with full.
speakVolInput.addEventListener('input', () => {
  const v = parseInt(speakVolInput.value, 10);
  const pct = Number.isFinite(v) ? v : 100;
  speakVolLabel.textContent = `${pct}%`;
  window.GTTts.setVolume(pct / 100);
});
speakVolInput.addEventListener('change', async () => {
  const v = parseInt(speakVolInput.value, 10);
  await window.api.setSettings({ speakVolume: Number.isFinite(v) ? v : 100 });
});
// Settings pages: Gameplay / Display / Controls / System — one visible at a time, same look as the
// History tabs.
document.querySelectorAll('.set-tabs .hist-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    if (tab.classList.contains('active')) return; // already on this page — no reflow
    const fromH = panel.offsetHeight; // measure BEFORE the page swaps (same as the view/tab swap)
    document.querySelectorAll('.set-tabs .hist-tab').forEach((t) => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.set-page').forEach((p) => { p.hidden = p.id !== tab.dataset.page; });
    // The four pages hold different amounts, so switching resized the bottom-docked panel in ONE
    // frame and the whole tab bar jumped (and could flip above↔below the pill). Animate from the old
    // height and re-anchor the stack — exactly what the History/Settings swap already does.
    animatePanelHeight(fromH, null);
    updateDropRoom();
    setDescDefault();
  });
});

// ---- Settings description bar -------------------------------------------------------------------
// One strip at the bottom of the panel showing what the row under the cursor actually does. A row
// opts in with data-desc="<i18n key>", or data-desc-el="<id>" when index.js writes the text itself
// (the snip-style hint interpolates real shortcut keys). With nothing hovered the bar falls back to
// the visible page's data-desc-default, so the page's most useful tip is on screen by default rather
// than hidden behind a hover.
const descBar = document.getElementById('gsDescBar');
function setDescDefault() {
  if (!descBar) return;
  const page = document.querySelector('#settingsView .set-page:not([hidden])');
  const key = page && page.dataset.descDefault;
  descBar.textContent = key ? window.i18n.t(key) : '';
}
function setDescFor(row) {
  if (!descBar) return;
  const el = row.dataset.descEl && document.getElementById(row.dataset.descEl);
  const text = el ? el.textContent : (row.dataset.desc ? window.i18n.t(row.dataset.desc) : '');
  if (text) descBar.textContent = text;
}
document.querySelectorAll('#settingsView .gs-row').forEach((row) => {
  if (!row.dataset.desc && !row.dataset.descEl) return;
  row.addEventListener('mouseenter', () => setDescFor(row));
  row.addEventListener('focusin', () => setDescFor(row));
  row.addEventListener('mouseleave', setDescDefault);
  row.addEventListener('focusout', setDescDefault);
});
setDescDefault();

// snipStyle is a native <select> upgraded by enhanceStepper (like the language pickers); its change
// event fires when the user steps to another option — persist it, same as before.
// The style is now what the single snip trigger DOES, so changing it changes what the pill's tooltip
// and the empty state tell you to press — both of which read snipStyleNow() and neither of which
// re-renders on its own.
snipStyleSel.addEventListener('change', () => {
  window.api.setSettings({ snipStyle: snipStyleSel.value });
  updateHoldNote();
  setHint(restingHint()); // repaints the resting hint's tooltip through the style-aware branch
  renderHistory();
});

if (uiLangSel) uiLangSel.addEventListener('change', async () => {
  renderSettings(await window.api.setSettings({ uiLang: uiLangSel.value }));
});

resetBtn.addEventListener('click', async () => {
  renderSettings(await window.api.resetSettings());
  setHint('Settings reset to defaults');
});

exportBtn.addEventListener('click', async () => {
  const res = await window.api.exportHistory().catch(() => ({ ok: false, reason: 'write' }));
  if (res.ok) setHint('Saved CSV');
  else if (res.reason === 'empty') setHint('Nothing to export yet');
  else if (res.reason !== 'canceled') setHint("Couldn't save the CSV"); // write failed — say so, never silent
});

// Place the pill on its remembered dock SYNCHRONOUSLY from a renderer-side cache, before the first
// paint — so it never flashes at the default centre while the async getSettings() IPC is in flight
// (that gap was the "appears middle-bottom then warps to last position" bug). getSettings below still
// corrects it if the cache is ever stale, but normally it already matches so nothing moves.
try {
  const cachedDock = localStorage.getItem('gt.dock');
  if (cachedDock) applyDock(cachedDock, false);
} catch {}
document.body.classList.add('ready'); // reveal now that the pill is on its final spot

window.api.onSettings(renderSettings);
window.api.getSettings().then(renderSettings);

// ---------- rebindable shortcuts UI ----------
const shortcutsListEl = document.getElementById('shortcutsList');
const shortcutsResetBtn = document.getElementById('shortcutsResetBtn');
const shortcutsHintEl = document.getElementById('shortcutsHint');
const holdDragInfoEl = document.getElementById('holdDragInfo');

// Electron accelerator ("CommandOrControl+Shift+Up") → what the user reads. Mac uses glyphs with no
// separators (⌘⇧↑); Windows/Linux use words joined by +.
function accelToDisplay(accel) {
  const map = IS_MAC
    ? { CommandOrControl: '⌘', CmdOrCtrl: '⌘', Command: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: '␣' }
    : { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Command: 'Win', Super: 'Win', Meta: 'Win', Control: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Option: 'Alt', Shift: 'Shift', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Space' };
  // Mouse4/Mouse5 are not accelerator syntax and never get split or glyphed: on mac the parts join
  // with no separator at all, so "Mouse4" would come out as itself and read like a typo. Spelled the
  // way the mouse's own box spells it — a space and a number.
  const btn = String(accel).match(/^Mouse([45])$/);
  if (btn) return `Mouse ${btn[1]}`;
  const parts = String(accel).split('+').map((p) => map[p] || p);
  return IS_MAC ? parts.join('') : parts.join('+');
}

// A browser keydown → Electron accelerator, or null to keep waiting.
//
// Two things get through without a modifier, and everything else still needs one. An F-key alone is
// allowed because it is the whole point of re-keying: ⌘⇧S is three fingers in the bottom-left corner,
// which is where the left hand already is on WASD, and F9 is one finger you never have to look for.
// A bare LETTER stays banned — bind snip to "S" and it fires every time you type an s anywhere.
// Modifier-only combos are recorded on keyUP instead (see onRecordKeyUp): they are the hold-style
// trigger, and there is no keystroke to catch on the way down.
function keyName(e) {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3);
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (c === 'ArrowUp') return 'Up';
  if (c === 'ArrowDown') return 'Down';
  if (c === 'ArrowLeft') return 'Left';
  if (c === 'ArrowRight') return 'Right';
  if (/^F[0-9]{1,2}$/.test(c)) return c;
  if (c === 'Space') return 'Space';
  if (e.key && e.key.length === 1) return e.key.toUpperCase();
  return null;
}
function eventToAccel(e) {
  const mods = [];
  // On Windows the Meta key is the WINDOWS key, not a Command key. Folding it in with Ctrl recorded
  // Win+Shift+K as Ctrl+Shift+K — a different combo from the one the finger pressed, saved without a
  // word. Electron spells that key Super, and accelToDisplay has had a label waiting for it. macOS
  // keeps exactly the old behaviour, where Meta really is Command.
  if (IS_MAC) {
    if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  } else {
    if (e.ctrlKey) mods.push('CommandOrControl');
    if (e.metaKey) mods.push('Super');
  }
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const key = keyName(e);
  if (!key) return null;
  if (!mods.length && !/^F[0-9]{1,2}$/.test(key)) return null;
  return [...mods, key].join('+');
}

// The physical modifiers currently down, in Electron's spelling. Deliberately NOT the
// CommandOrControl fudge eventToAccel uses: a hold trigger is about which keys the hand is actually
// holding, and the event tap that reads them has to be told exactly which ones.
const RECORD_MOD_KEYS = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph']);
function heldModsOf(e) {
  const m = [];
  if (e.ctrlKey) m.push('Control');
  if (e.altKey) m.push('Alt');
  if (e.shiftKey) m.push('Shift');
  if (e.metaKey) m.push(IS_MAC ? 'Command' : 'Super');
  return m;
}

let recording = null; // { id } while capturing a new combo for one row
// One drawn mark per shortcut row, so the list reads as "which control is this?" before you get to
// the words. Same 24-viewBox / 13px system as the pill's controls, and snip and speak are the SAME
// paths as the ⧉ and mic buttons on purpose — the row and the button you already click should not
// look like two different features. Stroked unless `fill`, matching how each of those buttons is drawn.
//
// Nothing here is user data, so these go in with innerHTML; keep it that way, and keep them simple.
// A 13px mark has room for two or three strokes and no more — the ones that failed the size test were
// a gear-like "next monitor" (two overlapping screens, indistinguishable from snip's two rects) and a
// card-with-an-X for clear, which turned to mud.
const SC_ICONS = {
  snip: '<rect x="3.5" y="3.5" width="12" height="12" rx="2.5"/><rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/>',
  type: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><line x1="8" y1="10" x2="8" y2="14"/>',
  speak: { fill: true, d: '<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/>' },
  clear: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><line x1="7" y1="15" x2="17" y2="9"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3"/>',
  cardUp: '<line x1="12" y1="19" x2="12" y2="6"/><path d="M6.5 11.5 12 6l5.5 5.5"/>',
  cardDown: '<line x1="12" y1="5" x2="12" y2="18"/><path d="M6.5 12.5 12 18l5.5-5.5"/>',
  nextDisplay: '<rect x="2.5" y="6" width="13" height="10" rx="2"/><path d="M18 11h3.5m-2-2 2 2-2 2"/>',
  // A subtitle in its frame: the picture of the thing, not the letters "CC" — two characters of text
  // at 13px is a smudge, which is what killed the earlier icons named in the note above.
  live: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><line x1="6" y1="14.5" x2="11" y2="14.5"/><line x1="13" y1="14.5" x2="17.5" y2="14.5"/>',
  // The cursor itself, filled — the only mark that says "this one is about where you are POINTING"
  // without needing a second shape to explain it. Filled rather than stroked for the same reason the
  // mic is: an outline arrow at 13px reads as a stray chevron. (jek noticed the row had no mark.)
  hover: { fill: true, d: '<path d="M6 3.2 18.6 12l-5.7 1.05 2.6 5.45-2.35 1.1-2.6-5.5-4.55 3.9z"/>' },
  // The same star the collection is marked with everywhere else, filled for the same reason the
  // cursor above is: an outlined star at 13px turns into a scribble.
  hoverSave: { fill: true, d: '<path d="M12 3.4l2.7 5.5 6 .87-4.35 4.24 1.03 5.99L12 17.2l-5.38 2.8 1.03-5.99L3.3 9.77l6-.87z"/>' },
};
// The <svg> wrapper for one of the above, or '' for an action with no mark (the row still renders —
// a missing icon must never cost you the row that re-keys it).
function scIconSvg(id) {
  const ico = SC_ICONS[id];
  if (!ico) return '';
  const filled = typeof ico === 'object' && ico.fill;
  const body = filled ? ico.d : ico;
  return `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" ${filled
    ? 'fill="currentColor"'
    : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;
}

// How each rebindable action is SPELLED in the i18n dictionary. The dictionary keeps the original
// ⌘⇧ wording (it reads naturally, and it is what a mac user sees when nothing is rebound); this map
// says which action each of those literals stands for, so renderShortcuts can swap in the live key.
// An action missing from here simply never appears in any UI string.
const KEYCAP_TOKENS = {
  snip: '⌘⇧S', type: '⌘⇧T', speak: '⌘⇧M', clear: '⌘⇧X', lock: '⌘⇧L',
  cardUp: '⌘⇧↑', cardDown: '⌘⇧↓', nextDisplay: '⌘⇧D',
};
seedLiveKeysFromBoot(); // the pill's slot needs these before its first paint — see liveKeysIn

// The snip mode, as a two-way toggle sitting ON the snip key's row. It answers "what does this key
// do" in the place you already look to find out what the key IS, which a separate settings row three
// inches away never could. Same contract as the other settings widgets (enhanceSelect/enhanceStepper):
// the hidden <select> stays the state, this only draws it and dispatches change — so renderSettings
// keeps working through _cddSync without knowing the widget was rebuilt.
function buildSnipModeToggle() {
  const wrap = document.createElement('div');
  wrap.className = 'sc-mode';
  const btns = [...snipStyleSel.options].map((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sc-mode__opt';
    b.dataset.value = o.value;
    b.textContent = o.textContent;
    if (o.dataset.i18n) b.dataset.i18n = o.dataset.i18n;
    // The gesture lives here rather than in a label: two words fit the row, a sentence does not.
    // Keyed off the option's own value rather than a two-way ternary — the third style arrived and the
    // ternary would have silently labelled it "Hold and sweep".
    const tipKey = `tip.snip.${o.value}`;
    b.title = window.i18n.t(tipKey);
    b.dataset.i18nTitle = tipKey;
    wrap.appendChild(b);
    return b;
  });
  const sync = () => btns.forEach((b) => {
    const on = b.dataset.value === snipStyleSel.value;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  btns.forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); // the row's own handlers must not read this as "re-key the chip"
    if (snipStyleSel.value === b.dataset.value) return;
    snipStyleSel.value = b.dataset.value;
    sync();
    snipStyleSel.dispatchEvent(new Event('change'));
  }));
  snipStyleSel._cddSync = sync; sync();
  return wrap;
}

// Modes, drawn as what they are. CC and point-at-a-word are not keys you press to make one thing
// happen — they are switches, and a row that shows only a key chip says otherwise. The switch is the
// live state of the mode, not a preference: flipping it is the same call the key makes, and the key
// (or Escape, or CC's own button) moves the switch back, because both read from the same broadcast.
const scSwitches = new Map(); // action id -> the button drawn for it, so state changes can find it
function modeIsOn(id) {
  if (id === 'live') return liveMode;
  if (id === 'hover') return hoverMode;
  if (id === 'lock') return locked;
  return false;
}
// "The app is waiting for a gesture from you" — for CC, the drag that picks the subtitle strip. It is
// NOT the same as running (see the .armed/.on split in styles.css), and it is the state that was
// missing entirely: clicking CC only ever showed the picker box, never the chip (jek).
function modeIsArmed(id) {
  if (id === 'live') return livePickingUi;
  return false;
}
function syncModeSwitches() {
  for (const [id, el] of scSwitches) {
    const on = modeIsOn(id);
    el.classList.toggle('on', on);
    el.setAttribute('aria-checked', String(on));
    el.title = on ? 'On — click to turn off' : 'Off — click to turn on';
  }
  syncModeStrip(); // one call site for "a mode changed", so the strip can never lag the switches
}
// ---------- the mode chips ----------

// `mark` is the SRC_MARKS key, NOT the mode id, because two of them differ by history: the CC mode
// files its lines as 'cc' and point-at-a-word files as 'point'. Reusing the marks rather than drawing
// new icons is the whole idea — the glyph that labels a history row is the button that produces one.
// Same chip class as the History source strip: this row must not introduce a second visual language
// for "a small labelled icon you can press" when the panel already has one directly below it.
//
// CC carries two jobs, so it is drawn as ONE control with two segments (jek): the wide half turns live
// subtitles on and off, the narrow half re-draws the square it watches. They are genuinely different
// calls — toggleLive() reuses the saved square and only asks for a new one the first time
// (main.js:doLiveToggle), while pickLiveArea() always asks — and before this the second one existed
// only in Settings, so changing games meant leaving the game to find it.
const CC_AREA_SVG = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5V5.5A1.5 1.5 0 0 1 5.5 4h3M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3M20 15.5v3a1.5 1.5 0 0 1-1.5 1.5h-3M8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3"/></svg>';
function buildModeStrip() {
  if (!modeStripEl) return;
  modeStripEl.innerHTML = '';
  for (const m of INPUT_MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hist-src__opt mode-strip__opt';
    b.dataset.mode = m.id;
    const mark = SRC_MARKS[m.mark];
    b.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + mark.svg + '</svg>';
    if (m.id === 'live') {
      b.dataset.i18nTitle = 'tip.ccToggle';
      b.title = window.i18n ? window.i18n.t('tip.ccToggle') : 'Live subtitles on / off';
    }
    const t = document.createElement('span');
    t.dataset.i18n = m.label;
    t.textContent = window.i18n ? window.i18n.t(m.label) : m.id;
    b.appendChild(t);
    // Every branch goes through the SAME call the accelerator and the Shortcuts switch use. A button
    // that reimplements what a key does is two behaviours to keep in step, which is how the two ways
    // into CC came to disagree about whether "on" meant "pick an area first" (see doLiveToggle).
    b.addEventListener('click', () => {
      if (m.id === 'live') window.api.toggleLive();
      else if (m.id === 'hover') window.api.toggleHover();
    });
    // Point has one job, so it stays one button. CC gets the second segment described above — a sibling
    // button rather than a nested one (a <button> inside a <button> is invalid and Chromium unnests it),
    // welded to the chip by CSS so the two read as one control.
    if (m.id !== 'live') { modeStripEl.appendChild(b); continue; }
    const split = document.createElement('div');
    split.className = 'mode-split';
    const area = document.createElement('button');
    area.type = 'button';
    area.className = 'mode-area';
    area.dataset.i18nTitle = 'tip.ccArea';
    area.title = window.i18n ? window.i18n.t('tip.ccArea') : 'Choose the subtitle area';
    area.innerHTML = CC_AREA_SVG;
    // Always the picker, never the toggle: this half means "the subtitles moved / I changed game".
    // Turning CC off first would throw away the reading session you are trying to re-aim.
    area.addEventListener('click', () => window.api.pickLiveArea());
    split.appendChild(b);
    split.appendChild(area);
    modeStripEl.appendChild(split);
  }
  syncModeStrip();
}
// Everything left in the strip is a toggle, so `on` is the whole story — the one-shot flash went with
// the one-shot chips. `armed` still matters: CC spends the whole area-picking drag waiting for you.
function syncModeStrip() {
  if (!modeStripEl) return;
  // querySelectorAll, not .children: CC's chip is one level down inside its .mode-split wrapper.
  for (const b of modeStripEl.querySelectorAll('[data-mode]')) {
    const m = INPUT_MODES.find((x) => x.id === b.dataset.mode);
    if (!m) continue;
    const armed = modeIsArmed(m.id);
    // armed wins: CC between the click and the end of the drag is not yet reading anything.
    const on = !armed && m.toggle ? modeIsOn(m.id) : false;
    b.classList.toggle('armed', armed);
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on || armed));
  }
}

// Built ONCE at load, not when a page opens: the row is part of the panel's frame, not a consequence
// of visiting History. Hanging it off the history path meant it existed only after you had gone
// looking for the list — measured empty over CDP, 2026-08-14.
buildModeStrip();

function buildModeSwitch(id) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sc-switch';
  b.setAttribute('role', 'switch');
  b.innerHTML = '<span class="sc-switch__dot"></span>';
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // the row's own click must not read this as "re-key the chip"
    if (id === 'live') window.api.toggleLive();
    else if (id === 'hover') window.api.toggleHover();
    else if (id === 'lock') toggleLock();
    // Deliberately NOT flipped here. The mode may refuse to start — no dictionary for this source
    // language, no screen permission, a strip that needs picking first — and a switch that moves
    // anyway is a switch that lies. It moves when the mode says it moved. (Lock is the exception
    // that proves it: toggleLock IS the state, so it repaints these itself on the way out.)
    //
    // Lock only ever goes ON from here, and that is not a gap. Locking makes the whole overlay
    // click-through and closes the panel, so this switch is gone from under the cursor the instant it
    // works — the key is the way back, which is exactly what the button's own label teaches. A
    // control that could unlock would have to survive being unclickable, and that is the one thing
    // lock exists to make impossible.
  });
  scSwitches.set(id, b);
  return b;
}

// The "pick the strip again" button that rides on the CC row. Same shape as the snip row's mode
// segments so the two read as the same kind of thing: a control that belongs to THIS key, sitting
// where the key is. It is the same call the Gameplay button makes — one action, two doors.
function buildCcAreaButton() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sc-area';
  // Four corner brackets — the mark every screenshot tool uses for "choose a region". A word had to
  // be read; this is recognised, and it stops the row from having two different kinds of label on it.
  b.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/></svg>';
  b.setAttribute('aria-label', window.i18n.t('btn.ccAreaShort'));
  b.dataset.i18nTitle = 'tip.ccArea';
  b.title = window.i18n.t('tip.ccArea');
  b.addEventListener('click', (e) => {
    e.stopPropagation(); // not a re-key, and not the switch either
    setPanel(null);      // the picker is about to take the screen
    window.api.pickLiveArea();
  });
  return b;
}

// How many rows are worth showing before you asked to see the rest. The first three ARE the app —
// snip, type, speak; the other five are chrome you bind once. Read from the list order, not
// hard-coded ids, so adding an action can't silently push one of the three out of sight.
const SC_PRIMARY = 3;
let scShowAll = false;

function renderShortcuts(list) {
  if (!shortcutsListEl || !list) return;
  shortcutsListEl.innerHTML = '';
  scSwitches.clear(); // the rows are about to be replaced — keep no handles on detached ones
  const shown = scShowAll ? list : list.slice(0, SC_PRIMARY);
  for (const sc of shown) {
    const row = document.createElement('div');
    row.className = 'sc-row';
    const icon = document.createElement('span');
    icon.className = 'sc-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = scIconSvg(sc.id);
    const label = document.createElement('span');
    label.className = 'sc-label';
    label.textContent = sc.label;
    const chip = document.createElement('button');
    chip.className = 'sc-chip';
    chip.textContent = accelToDisplay(sc.accel);
    // The snip row's key does whatever the mode toggle next to it says, so reciting one gesture here
    // would contradict the control sitting 40px away half the time.
    chip.title = sc.id === 'snip'
      ? 'Click to re-key. What it does is the toggle beside it.'
      : (sc.hold ? 'Hold these and drag over the text. Click to re-key.'
                 : 'Press it, then drag over the text. Click to re-key.');
    // A mode row says two different things and must not blur them into one: the SWITCH is whether it
    // is running, the CHIP is which key does that. Reciting "press it, then drag" on a mode would be
    // describing an action it doesn't have.
    if (sc.mode) chip.title = 'Click to re-key. The switch beside it turns it on and off.';
    chip.addEventListener('click', () => startRecord(sc.id, chip));
    row.append(icon, label);
    // Before the switch, always: anything BETWEEN the switch and the key shoves the switch off the
    // column every other row keeps it in, which is what made the list look crooked.
    if (sc.id === 'live') row.append(buildCcAreaButton());
    if (sc.mode) row.append(buildModeSwitch(sc.id));

    // CC's second question, on the row where you are already looking at CC. Where the subtitles are
    // is not the same question as whether you want them, and Settings > Gameplay was a page away from
    // the switch that raises it (jek: "มีวิธีกดเปลี่ยน[พื้นที่]ใหม่ที่ตรง Control ... จะได้เข้าใจง่าย").

    row.append(chip);
    // Per-row reset only when this row differs from its default.
    if (sc.accel !== sc.def) {
      const reset = document.createElement('button');
      reset.className = 'sc-rowreset';
      reset.textContent = '↺';
      reset.title = 'Reset to default';
      reset.addEventListener('click', async () => { applyShortcutResult(await window.api.setShortcut(sc.id, '')); });
      row.append(reset);
    }
    shortcutsListEl.append(row);
    // The snip row's mode toggle goes on a line of ITS OWN, under the row. In the row it was a third
    // control competing for the same width, and the label lost: measured, "Snip & translate" was
    // squeezed to 42px and wrapped onto two lines, making that row 34px tall against everyone else's
    // 24 and pushing its key 7px out of the column (jek, 2026-08-09: "มันเลื่อนไม่สมมาตรกับชาวบ้าน").
    // Every row's top line is now the same shape — mark, name, key — and the one row with an extra
    // question answers it underneath.
    // ...and only while there is still a question to answer. With one style left the "toggle" was a
    // single lit button that could not be turned off — a control that looks broken (jek, 2026-08-29).
    if (sc.id === 'snip' && snipStyleSel && snipStyleSel.options.length > 1) {
      const sub = document.createElement('div');
      sub.className = 'sc-subrow';
      sub.append(buildSnipModeToggle());
      shortcutsListEl.append(sub);
    }
  }
  // The way to the other five. A count on the label so it reads as "there are more, here is how
  // many" rather than as a mystery — the reason a truncated list feels like something is missing.
  syncModeSwitches(); // the rows are in the DOM now — show which modes are actually running
  if (list.length > SC_PRIMARY) {
    const more = document.createElement('button');
    more.className = 'sc-more';
    // The label is a CHILD with data-i18n, not the button itself: applyI18n replaces the whole
    // textContent of whatever carries the key, which would eat the count on a language switch.
    const moreLabel = document.createElement('span');
    moreLabel.dataset.i18n = scShowAll ? 'btn.scShowLess' : 'btn.scShowAll';
    moreLabel.textContent = window.i18n.t(moreLabel.dataset.i18n);
    more.appendChild(moreLabel);
    if (!scShowAll) more.append(` (${list.length})`);
    more.addEventListener('click', () => { scShowAll = !scShowAll; renderShortcuts(list); });
    shortcutsListEl.append(more);
  }
  // Every shortcut this app teaches is rebindable, so nothing may hard-code one. The i18n dictionary
  // still SPELLS them in their original ⌘⇧ form; that literal is a token, and this is where it gets
  // resolved to what the action is actually bound to right now — the ⧉ tooltip, the empty state, the
  // Type blurb, the "Select by" note, the lock button, all of it, in both languages, from one map.
  //
  // Replaces the old per-element patching (find the <b> whose text looks like a keycap and rewrite
  // it), which only ever covered the Type blurb and had to keep a `typeTipKey` around to find its own
  // handiwork again after a language switch. setKeycaps re-applies i18n itself, so the whole set
  // refreshes in place.
  if (window.i18n && window.i18n.setKeycaps) {
    const caps = {};
    for (const sc of list) {
      const tok = KEYCAP_TOKENS[sc.id];
      if (tok) caps[tok] = accelToDisplay(sc.accel);
    }
    window.i18n.setKeycaps(caps);
    updateLearnBadge(); // setKeycaps re-runs applyI18n, which overwrites the Learn tip's live count
  }
  // The pill's own slot reads from the same list — see liveKeysIn. Filled outside the i18n block
  // above on purpose: that one is skipped when i18n isn't up, and the pill still has to name its keys
  // correctly when it does.
  for (const sc of list) {
    const tok = KEYCAP_TOKENS[sc.id];
    if (tok) liveKeys.set(tok, accelToDisplay(sc.accel));
  }
  // Not an i18n string (it is a key, not a sentence) so it needs saying separately: the little
  // shortcut chip in the Settings snip-style preview.
  const snip = list.find((sc) => sc.id === 'snip');
  const previewHintEl = document.querySelector('.gs-preview__hint');
  if (snip && previewHintEl) previewHintEl.textContent = accelToDisplay(snip.accel);

  if (snip) {
    const next = accelToDisplay(snip.accel);
    snipIsHold = !!snip.hold;
    if (next && next !== SNIP_HINT) {
      const wasResting = curHintRaw === SNIP_HINT;
      SNIP_HINT = next;
      if (wasResting) setHint(restingHint()); // at rest → swap it now; mid-status it lands on the revert
    }
    // Re-keying can make holding possible or impossible, which changes both the note and what the
    // empty state tells a new user to do. Neither re-derives it on its own, so say it here.
    updateHoldNote();
    renderHistory();
  }
}

// A mouse button is bindable only where main.js can watch for one (Windows — winmousehook.js), and
// only the two side buttons: left/right/middle belong to the game you are playing over.
// DOM MouseEvent.button numbers them 3 and 4; the rest of the app calls them 4 and 5, the way the
// mouse's own driver and every game's key-bind screen do.
const MOUSE_BINDABLE = !!(window.api && window.api.isWin);
const RECORD_MOUSE_ACCEL = { 3: 'Mouse4', 4: 'Mouse5' };

function stopRecording() {
  if (!recording) return;
  window.removeEventListener('keydown', onRecordKey, true);
  window.removeEventListener('keyup', onRecordKeyUp, true);
  window.removeEventListener('mousedown', onRecordMouse, true);
  window.removeEventListener('auxclick', swallowAux, true);
  recording = null;
  window.api.resumeShortcuts(); // re-arm the OS bindings we dropped while capturing
}
async function onRecordKey(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') { stopRecording(); loadShortcuts(); setShortcutsHint(''); return; }
  // Modifiers on their own are not "nothing yet" any more — they might be the whole trigger. Keep the
  // largest set seen while the hand is down (⌃ then ⌃⌥ arrives as two events) and let keyup decide.
  if (RECORD_MOD_KEYS.has(e.key)) {
    const held = heldModsOf(e);
    if (held.length > recording.heldMods.length) recording.heldMods = held;
    return;
  }
  recording.heldMods = []; // a real key landed → this is a press, not a hold
  const accel = eventToAccel(e);
  if (!accel) return; // a bare letter, or a key we have no name for
  const id = recording.id;
  stopRecording();
  applyShortcutResult(await window.api.setShortcut(id, accel));
}
// Let go of the modifiers without ever pressing a key → that IS the trigger, hold-style.
// Two minimum: a single modifier held alone is something games and every other app do constantly,
// and arming a screen-wide gesture on it would fire all day.
async function onRecordKeyUp(e) {
  if (!recording || !RECORD_MOD_KEYS.has(e.key)) return;
  // Was refused off macOS, and the comment here said exactly why: winkeyhook.js had Ctrl+Alt compiled
  // into it, so saving any other hold would have stored a trigger that does nothing while the old one
  // kept firing. That was the honest state right up until the hook started taking its modifier set as
  // an argument (startComboHook(h, mods)) — which is now, so the refusal goes. Leaving it in would have
  // been worse than before: with the trigger merged into one row, refusing to record a modifier-only
  // combo on Windows means the only re-key you can make is one that takes 'hold' style away.
  e.preventDefault();
  e.stopPropagation();
  const held = recording.heldMods;
  recording.heldMods = [];
  if (held.length < 2) return;
  const id = recording.id;
  stopRecording();
  applyShortcutResult(await window.api.setShortcut(id, held.join('+')));
}
// The side buttons, recorded on the way DOWN like any other press. Nothing is captured on the way up:
// a mouse button has no hold style to offer — winmousehook never swallows the button, so "hold Mouse4"
// would be a gesture the game underneath is also receiving for its whole duration.
async function onRecordMouse(e) {
  if (!recording) return;
  const accel = RECORD_MOUSE_ACCEL[e.button];
  if (!accel) {
    // Middle and right land here. Say why rather than ignoring the click: pressing a button and
    // getting nothing reads as "the recorder is broken", which is the report this whole feature came
    // from. Left is left alone — it is how you click the next row, or anything else on the panel.
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      setShortcutsHint('Only the side buttons (Mouse 4 / Mouse 5) can be used');
    }
    return;
  }
  e.preventDefault();
  e.stopPropagation();
  const id = recording.id;
  stopRecording();
  applyShortcutResult(await window.api.setShortcut(id, accel));
}
// The side buttons are Back and Forward in a browser engine, and this window is one. Without this the
// press records the shortcut AND navigates the renderer off its own page.
function swallowAux(e) {
  if (e.button === 3 || e.button === 4) { e.preventDefault(); e.stopPropagation(); }
}
function startRecord(id, chipEl) {
  stopRecording();
  recording = { id, heldMods: [] };
  chipEl.classList.add('recording');
  chipEl.textContent = 'Press keys…';
  // One line on both platforms now — the "hold modifiers and let go" half was mac-only for exactly as
  // long as winkeyhook.js could only watch Ctrl+Alt, and it is the way you get 'hold' style at all.
  setShortcutsHint(MOUSE_BINDABLE
    ? 'Press a combo, an F-key, a mouse side button, or hold modifiers and let go. Esc cancels.'
    : 'Press a combo, an F-key on its own, or hold modifiers and let go. Esc cancels.');
  window.api.suspendShortcuts(); // don't let the current combo fire its action while we're capturing
  window.addEventListener('keydown', onRecordKey, true);
  window.addEventListener('keyup', onRecordKeyUp, true);
  if (MOUSE_BINDABLE) {
    window.addEventListener('mousedown', onRecordMouse, true);
    window.addEventListener('auxclick', swallowAux, true);
  }
}
function applyShortcutResult(res) {
  if (!res) return;
  if (res.ok) setShortcutsHint('');
  else if (res.error === 'conflict') setShortcutsHint(`Already used by "${res.conflict}"`);
  else if (res.error === 'invalid') setShortcutsHint("That combo can't be used — try another");
  renderShortcuts(res.list);
}
function setShortcutsHint(msg) {
  if (shortcutsHintEl) shortcutsHintEl.textContent = msg || 'Click a key, then press the new combo. Esc cancels.';
}
async function loadShortcuts() { renderShortcuts(await window.api.getShortcuts()); }

if (shortcutsResetBtn) {
  shortcutsResetBtn.addEventListener('click', async () => {
    const res = await window.api.resetShortcuts();
    applyShortcutResult(res);
    setShortcutsHint('Shortcuts reset to defaults');
  });
}
// This slot used to announce a SECOND trigger ("Hold-drag: Ctrl+Alt — always drag, not rebindable"),
// which is exactly the duplicate that has now been folded into the style setting. What is worth
// saying here instead is the one case where the style you picked is not the style you get: 'hold'
// with a trigger that has a letter in it. Silent in every other case — a note that is always on
// screen stops being read.
function updateHoldNote() {
  if (!holdDragInfoEl) return;
  const degraded = !!snipStyleSel && snipStyleSel.value === 'hold' && !snipIsHold;
  holdDragInfoEl.textContent = degraded ? window.i18n.t('note.holdNeedsMods') : '';
  holdDragInfoEl.hidden = !degraded;
}
updateHoldNote();
loadShortcuts();

// Mock unlock for now (device-local) so Pro can be used/tested; swaps for a real purchase flow later.
upgradeBtn.addEventListener('click', () => setPlan(isPro() ? 'free' : 'pro'));
renderPlan();

let lastTransGen = 0; // newest translation generation shown — see transGen in main.js
window.api.onTranslation((payload) => {
  // Some cards REPLACE a history row in main rather than filing a new one — the ✎ respell (which
  // swaps the row for `respelled`, the spelling it came from) and the ✦ AI upgrade (same line, fuller
  // card). Both arrive on this channel like any translation, and unshifting them files one read
  // twice: main's list has one row, the panel shows two. Replace here, exactly as main did there.
  const swapEn = payload.respelled || (payload.upgraded ? payload.en : '');
  // Reading the same line again is the same row, moved back to the top — main collapses its own
  // list this way (rememberHistory) and the panel has to agree, or main holds one row while the
  // screen shows four. Same key as main: the text AND the kind, so a word you pointed at and the
  // sentence you snipped around it stay two entries.
  const kind = (h) => (h.live ? 1 : 0) + (h.typed ? 2 : 0) + (h.point ? 4 : 0);
  const repeat = !swapEn && payload.en
    ? historyList.findIndex((h) => h && h.en === payload.en && kind(h) === kind(payload))
    : -1;
  if (repeat >= 0) {
    const old = historyList[repeat];
    historyList.splice(repeat, 1);
    // Take the row out whether or not anyone is looking. Re-rendering only when the History tab
    // happens to be open left the old row in the DOM for every repeat that arrived while the panel
    // was closed — which is nearly all of them — and opening the panel afterwards does not rebuild
    // the list (switchTab returns early when the tab has not changed). Measured: three lookups of
    // one word, list of 1, three rows on screen.
    if (old && old.ts) {
      const row = logEl.querySelector(`.entry[data-ts="${old.ts}"]`);
      if (row) row.remove();
    }
  }
  const at = swapEn ? historyList.findIndex((h) => h && h.en === swapEn) : -1;
  if (at >= 0) {
    historyList[at] = payload;
    if (panelMode === 'history') { histMode === 'saved' ? renderSaved() : renderHistory(); }
  } else {
    historyList.unshift(payload); // newest-first — keep it at the front so re-renders stay ordered
    // The SAME cap main keeps, not a second opinion: a hardcoded 300 here quietly re-capped a list
    // main was willing to hold 2000 of, so raising the setting would have moved nothing on screen.
    if (historyList.length > histCap) historyList.pop(); // drop the oldest (now at the end)
    addEntry(payload);
  }
  // A word kept with the point-at-a-word key files itself here and stops. It is not a translation you
  // asked to read, so raising a card over the game for it would be the app interrupting you for
  // something you already know the meaning of — you were looking straight at it.
  if (payload.point) return;
  // A slow OLD snip landing after a newer one already showed: keep it in history (above) but
  // don't clobber the card the user is reading with an unrelated stale translation.
  if (payload.gen && payload.gen < lastTransGen) return;
  if (payload.gen) lastTransGen = payload.gen;
  // User ✕-closed the card mid-live: live lines stay muted (history still records them above).
  // A manual snip is an explicit ask — it unmutes.
  if (payload.live && liveCardMuted) return;
  // A subtitle from a mode that is already OFF. livePoll takes ~a second in translate(), so a read
  // that started before you stopped CC still lands afterwards — and it would raise a card the
  // live:state edge has already finished clearing away. History above still keeps the line; it was
  // read while the mode was on, and it is only the SCREEN that has to respect being switched off.
  if (payload.live && !liveMode) return;
  if (!payload.live) { liveCardMuted = false; liveMuteAuto = false; }
  setDot('live');
  // Fall back to the translation if a read somehow has no source text — an empty slot would just
  // look like the parked word had been dropped.
  lastWord = payload.en || payload.th;
  lastPayload = payload;
  syncAiBtn(payload);
  setHint(restingHint());
  // ONE surface for everything a read produces. Subtitles used to be routed away from here into a
  // free-floating box at the bottom of the screen; that was never what was asked for, and it cost the
  // subtitle every affordance the card already has — the source line with tappable words, the meaning
  // bubble, ★ into Vocab, ▶ to hear it (jek, 2026-08-09: "ตัว CC subtitle function, คำทั้งหมด,
  // คำแปลทั้งหมดจะโชว์ที่ pill"). A live line is a translation like any other; the only thing still
  // special about it is that it does not count itself down — the next subtitle replaces it instead
  // (see resultIsLive in showResult).
  showResult(payload);
});

// A read is in flight: pulse the dot and dim the current result until it swaps.
// Lock mode toggle (⌘⇧L, or the button in Settings): make the pill fully click-through so it can't
// be hovered/clicked while gaming. Snip (⌘⇧S) still works — it's a global shortcut. A dimmed pill
// + hint shows the state. Unlock with ⌘⇧L (the pill is click-through, so the button can't be used
// to unlock — that's why the button label teaches the shortcut).
function toggleLock() {
  locked = !locked;
  clearTimeout(lockHintTimer);
  lockOwnsSlot = locked; // the key gets the slot at the moment of locking, and only then
  // A snip taken from a hidden pill leaves a "put me back when the card goes" intent behind it. That
  // intent was written before the lock and knows nothing about the hint that is about to be shown —
  // left standing it re-hides the pill a couple of seconds in, taking the unlock key with it. Locking
  // takes ownership of when the pill goes back: cancel the old intent, record the state, restore it
  // below when the hint has been up long enough to read.
  lockRetuck = locked && tucked && tucksItself();
  if (locked) clearRetuck();
  if (pillLock) pillLock.hidden = !locked;
  if (locked) lockHintTimer = setTimeout(() => {
    lockOwnsSlot = false;
    refreshXlate(true);
    // Back to where it was. Guarded on `locked` because the key may have been used in the meantime,
    // and on lockRetuck because a pill that was out when you locked it should stay out.
    if (locked && lockRetuck) tuck();
  }, LOCK_HINT_HOLD_MS);
  // Out of hiding FIRST, before anything else paints: the hint about to be written is the only
  // instruction on screen for getting back out, and a tucked pill is where that instruction goes to
  // die. This is a loan, not a decision — lockRetuck above remembered that the pill was away, and
  // the hint timer puts it back. Unlocking hands it to whatever style it was on (armGhostSettle).
  if (locked) untuck();
  document.body.classList.toggle('locked', locked);
  lockBtn.textContent = liveKeysIn(locked ? 'Locked — ⌘⇧L to unlock' : 'Lock overlay · ⌘⇧L');
  if (locked) {
    panelMode = null; // close any open panel so the overlay is truly out of the way
    hovering = false;
    setHover(false);
    setInteractive(false); // force click-through now
    updateUI();
    setHint(LOCK_HINT);
  } else {
    setHint(restingHint());
  }
  window.api.reportLock(locked); // the tray menu shows a tick, and it must be the real state
  lockHovering = false;
  wrapEl.classList.remove('lock-reveal'); // never outlive the lock that set it
  if (!locked) { lockRetuck = false; armGhostSettle(); } // Tucked gets its pill back the moment the lock is off
  syncModeSwitches(); // the Shortcuts row shows lock as a switch — keep it honest either way
}
window.api.onLockToggle(toggleLock);
// "Show Gloss" from the tray: end every way the pill can be un-gettable, in one go. Unlock first —
// untucking a locked pill would put a click-through capsule back on screen and call that a rescue.
window.api.onReveal(() => {
  if (locked) toggleLock();
  untuck();
  bumpActivity();
});
// ⌘, — the menu bar sends reveal first, so by the time this runs the pill is unlocked and untucked.
window.api.onOpenSettings(() => { setPanel('settings'); bumpActivity(); });
lockBtn.addEventListener('click', toggleLock);
// The same action from the panel bar. toggleLock already closes the panel (panelMode = null), which
// is what you want here — the last thing a lock should leave behind is a surface you cannot dismiss.
const lockTab = document.getElementById('lockTab');
if (lockTab) lockTab.addEventListener('click', (e) => { e.stopPropagation(); if (!locked) toggleLock(); });

window.api.onResultLoading((on) => {
  if (on) { setDot('live'); translating = true; clearTimeout(panelIdleTimer); } // keep the panel through the read
  else translating = false;
  updateUI();              // translating no longer widens the pill (it กาง only when the card pops); this
                           // still runs so the loading dot / panel-keep state repaint
  if (on && !result.hidden) result.classList.add('loading');
  else result.classList.remove('loading');
});

window.api.onResultHide(() => hideResult());

// ---- Voice input (⌘⇧V): the pill IS the feedback. A red dot means the mic is live, and the words
// stream into the hint slot as you say them, so you can see it heard you before the card arrives.
// The button moved OFF the pill and into the Type bar (2026-08-12): recording and typing are one
// feature now — same field, same quick-look, same full card on finish — so the control belongs beside
// ↵ rather than in a row of window controls. ⌘⇧M is untouched and still works from anywhere.
// It briefly had a rival in the mode strip (a Speak chip); the chip is the one that went, because this
// button is beside the field the words land in and the strip is not.
const micBtn = document.getElementById('typeMicBtn');
const micBars = document.getElementById('micBars'); // the listening equaliser in the pill's hint slot

// ---- Live mic level for that equaliser --------------------------------------------------------
// The bars started life on a canned CSS loop, which is a PICTURE of listening rather than listening:
// it looked exactly the same whether the mic was hearing you, hearing the room, or hearing nothing at
// all because Windows had handed the app the wrong input device. Reading the real signal makes the
// pill answer the only question anyone has while it is open — "is it getting me?"
//
// Our own getUserMedia stream, not the recogniser's: winspeak.ps1 and speak.swift each own theirs and
// neither exposes a level. Both platforms share a capture device between clients, so the two streams
// coexist. If the stream is refused we simply never add .live and the CSS keyframes keep the bars
// moving — a fallback that looks like the old behaviour beats three dead sticks.
const MIC_BAR_MIN = 3, MIC_BAR_MAX = 9; // px, matching the .mic-bars height in styles.css
let micRaf = null, micStream = null, micCtx = null;

async function micLevelStart() {
  if (micCtx || !micBars) return;
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    console.warn('mic level: no stream, falling back to the canned bars —', err && err.name);
    return;
  }
  // Raced: speak:state can flip back to off while getUserMedia is still resolving (a helper that dies
  // on startup does exactly that), and without this the stream would be left open with nothing to
  // stop it — a mic that stays lit after the app says it stopped listening.
  if (!speaking) { stream.getTracks().forEach((t) => t.stop()); return; }
  micStream = stream;
  micCtx = new AudioContext();
  const analyser = micCtx.createAnalyser();
  analyser.fftSize = 256;              // 128 bins over ~0-24kHz — plenty for three coarse bands
  analyser.smoothingTimeConstant = 0.6; // the browser's own smoothing; anything less strobes
  micCtx.createMediaStreamSource(micStream).connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  const bars = [...micBars.querySelectorAll('i')];
  // Three BANDS, not three copies of one number: one level drawn three times reads as decoration,
  // whereas bands moving against each other is what a voice actually looks like. Voice energy lives
  // below ~5kHz, so all three sit inside the first 48 bins rather than spanning the whole spectrum
  // (the top half is near-silent and would leave the third bar flat).
  const BANDS = [[1, 8], [8, 24], [24, 48]];
  micBars.classList.add('live'); // hands height control to us and stops the keyframe loop
  const tick = () => {
    analyser.getByteFrequencyData(data);
    for (let b = 0; b < bars.length; b++) {
      const [from, to] = BANDS[b];
      let sum = 0;
      for (let i = from; i < to; i++) sum += data[i];
      const avg = sum / (to - from) / 255;
      // Square-rootish curve: raw FFT averages sit low for ordinary speech, and a linear map left the
      // bars barely twitching until you shouted.
      const level = Math.min(1, Math.sqrt(avg) * 1.35);
      bars[b].style.height = (MIC_BAR_MIN + level * (MIC_BAR_MAX - MIC_BAR_MIN)).toFixed(1) + 'px';
    }
    micRaf = requestAnimationFrame(tick);
  };
  tick();
}

function micLevelStop() {
  if (micRaf) { cancelAnimationFrame(micRaf); micRaf = null; }
  if (micStream) { micStream.getTracks().forEach((t) => t.stop()); micStream = null; }
  if (micCtx) { micCtx.close().catch(() => {}); micCtx = null; }
  if (!micBars) return;
  micBars.classList.remove('live');
  // Clear the inline heights or the bars stay frozen at whatever the last frame drew, and the CSS
  // fallback — which is all that is left if the next session gets no stream — would have nothing to
  // animate.
  micBars.querySelectorAll('i').forEach((i) => { i.style.height = ''; });
}
// The button is the primary way in — the shortcut is the shortcut, not the interface.
micBtn.addEventListener('click', () => window.api.toggleSpeak());
// Speaking writes into the SAME field typing writes into, so the two are one feature rather than two
// paths to the same translator. Only while the field is actually on screen: dispatching 'input' at a
// hidden bar would fire a quick-look request per partial for a preview nobody can see.
let micFilledType = false; // did this session put text in the field? then this session clears it
function micToType(text) {
  if (!typeInput) return;
  // checkVisibility catches an ancestor with display:none / [hidden] (how the panel and its tab pages
  // hide); offsetParent is the fallback for anything that predates it.
  const shown = typeInput.checkVisibility ? typeInput.checkVisibility() : typeInput.offsetParent !== null;
  if (!shown) return;
  typeInput.value = text;
  micFilledType = true;
  typeInput.dispatchEvent(new Event('input')); // same debounced quick-look a keystroke would get
}
window.api.onSpeakState(({ on }) => {
  speaking = on;
  setDot(on ? 'live' : '');
  micBtn.classList.toggle('listening', on);
  micBars.hidden = !on; // the one cue that survives a collapsed pill and a helper with no partials
  // Finishing already ran the full card in main (handleSpeakLine → translateText), so the field has
  // done its job — leaving the transcript sitting there would look like something still unsent, and
  // the next word you typed would land after it.
  if (!on && micFilledType) { micFilledType = false; typeInput.value = ''; clearPeek(); }
  if (on) micLevelStart(); else micLevelStop();
  updateUI();              // widen/narrow the pill for the live text (see `busy` in updateUI)
  bumpActivity();          // talking counts as using it — don't let the pill go quiet mid-sentence
  if (on) { clearRetuck(); untuck(); } // tucked at the edge, you'd never see that it's listening
});
window.api.onSpeakPartial((text) => {
  if (!speaking || !text) return;
  setHint(text);           // same slot the status/⌘⇧S hint uses — no new UI to learn
  micToType(text);         // …and into the Type field, which is where the mic now lives
});

window.api.onTranslationError((msg) => {
  setDot('error');
  translating = false;
  result.classList.remove('loading');
  // Show it IN the pill — kept SHORT so it reads in one glance mid-game (a long marquee you have
  // to track while playing defeats the point). Full message stays in the tooltip via setHint.
  msg = String(msg || '');
  // Main sends the one failure the player can fix as a code rather than a sentence, because the
  // sentence undici hands over is "fetch failed" — the HTTP library's problem, not theirs. Two words,
  // short enough to POP in the 109px slot instead of starting a marquee mid-game.
  if (msg === 'offline') setHint('No internet');
  else setHint('Error: ' + (msg.length > 48 ? msg.slice(0, 45) + '…' : msg));
  restoreSnipPanel(); // no usable result (no text / failure) — bring back the panel the snip hid
});

// The overlay window just jumped to another monitor, so the canvas is a different size and every dock
// anchor derived from the old one is wrong. The window `resize` event alone isn't enough: the two
// screens can share a resolution, in which case no resize fires and the pill keeps a dragged offset
// that made sense on the old display. Re-park it on the remembered dock, untucked, and re-measure.
window.api.onDisplayMoved(() => {
  // Arrive the way you left. A pill that was hidden away at the edge used to come back out on the
  // new screen — you moved something out of your way and it followed you into view, holding the
  // translation up again. applyDock re-derives the tuck for the new canvas (see applyTuckOffset),
  // so there is nothing to undo here: keeping the state is the whole job.
  applyDock(curDock, false);
  updateDropRoom();
});

window.api.onHistoryClear(() => clearLog());

// Saved history replayed on startup — main sends it newest-first; keep that order so the newest
// lookup sits at the TOP of the list (right under the type box), like any Recent/History list.
window.api.onHistoryLoad((list) => {
  historyList = Array.isArray(list) ? list.slice() : []; // newest→oldest
  if (histMode === 'all') renderHistory();
});

// The read was too poor to trust, so nothing was translated — say so instead of
// leaving the user wondering why nothing happened.
window.api.onLowQuality(() => {
  setDot('paused');
  result.classList.remove('loading');
  // Short enough to read in one glance mid-game — no marquee, no OCR-% jargon.
  setHint('Blurry — try a bigger box');
});

// One banner, two kinds of reason. A macOS permission lives as an entry in a Settings list that the OS
// binds to the build that asked for it — that is the one the stale line and “Show me the app” are for.
// A missing Windows OCR pack is not an entry anywhere, so both would be instructions for a row the
// reader cannot find (jek, 2026-08-19: the ja-pack banner shipped telling Windows users to toggle a
// macOS Accessibility entry off and on again). Everything that raises the banner goes through here.
//
// `step2` is the numbered-steps path: pass the middle step and the reader gets the three actions
// macOS actually requires, including the reopen it insists on. Pass none and the banner falls back to
// the one-line stale note, which is all a raiser without a Settings row can honestly offer.
function showBanner(pane, msg, detail, step2) {
  const stale = !!(window.api && window.api.isMac) && pane !== 'ocr';
  // The same growth a tab switch makes, so it gets the same glide. Only when the panel is ALREADY
  // open: an opening panel plays cardIn for the whole surface, banner included, and a second
  // animation on top of that entrance is the double-move the tab-switch path guards against too.
  const fromH = panel.hidden ? 0 : panel.offsetHeight;
  permPane = pane;
  permMsgEl.textContent = msg;
  // Cleared as well as hidden: a banner raised later with no detail must not keep the last one's
  // steps sitting in the DOM to flash on the next raise that does carry one.
  if (permDetailEl) {
    permDetailEl.textContent = detail || '';
    permDetailEl.hidden = !detail;
  }
  if (permStepsEl) {
    if (step2) permStep2El.innerHTML = step2;
    permStepsEl.hidden = !step2;
  }
  // Never both: the steps carry the stale advice in step 2, and saying it twice is the thing the
  // steps were written to stop.
  if (permStaleEl) permStaleEl.hidden = !stale || !!step2;
  permRevealBtn.hidden = !stale;
  permRestartBtn.hidden = !step2;
  permBanner.hidden = false;
  setPanel('history');
  if (fromH) animatePanelHeight(fromH);
}

window.api.onPermissionNeeded((status) => {
  // Two different situations wear the same red dot, and the app has always known which one it is in
  // — main.js sends the status and this handler used to drop it on the floor, so the banner had to
  // describe both at once and ended up describing neither. 'not-determined' means macOS has never
  // asked on this machine, so the row may not even be in the list yet; anything else means the row IS
  // there and is off, or is a stale entry from an older build wearing a green switch (which is the
  // trap: it LOOKS granted). Flipping it off and on is what re-keys it to the build now running.
  //
  // Both readings now come from the dictionary rather than from string literals here: the person who
  // most needs this sentence is the one whose app just stopped working, and until 2026-09-04 they got
  // it in English no matter what language the rest of the app was in.
  showBanner('screen', window.i18n.t('perm.screenOff'), null,
    window.i18n.t(status === 'not-determined' ? 'perm.step1' : 'perm.step1.stale'));
  setDot('error');
  // Two words, because it now sits on the pill for as long as the permission does and the pill is
  // 220px wide. The sentence it replaces is still in the banner above and in this slot's tooltip,
  // where there is room for it. The red dot says something is wrong; this says what.
  setBlocked('Screen off');
});

// The other half of the same fact. main.js only ever reported the failure, so a label that outlives
// its own condition was guaranteed: grant the permission and the pill would go on saying "Screen
// off" until something unrelated happened to overwrite it.
window.api.onPermissionOk(() => {
  setBlocked(null);
  if (permPane === 'screen') permBanner.hidden = true;
  if (dot.classList.contains('error')) setDot('');
});

// Voice input refused by the OS, not by us. Same banner, same button, different pane — the pill hint
// alone could only ever recite a Settings path from memory, which is the thing a button exists to
// avoid. Does NOT touch the dot or the hint: toggleSpeak's own close handler already owns those, and
// the hint is showing this exact reason at the moment this arrives.
window.api.onPermissionSetting(({ pane, msg, detail }) => {
  showBanner(pane, msg, detail);
});

// ---- Real glass ------------------------------------------------------------------------------
//
// See the .glass-on block in styles.css for what the CSS does with all this. Here we only decide
// WHEN to photograph the desktop and WHERE each surface sits inside that photo.
//
// Two jobs, deliberately split, because they cost wildly different amounts:
//   sampleGlass() talks to main and costs a full-display capture (~300ms on macOS, ~15ms on
//                 Windows where it's a BitBlt of just the region) — so it runs on EVENTS only.
//   alignGlass()  is three getBoundingClientRects and a few style writes — so it can run on every
//                 drag frame, and does.
// The split is what lets the backdrop stay anchored to the SCREEN while the stack slides over it:
// drag the pill and the scene behind the glass holds still, which is the whole tell that it's real.
const rootEl = document.documentElement;
const GLASS_SURFACES = [pill];  // glass is the pill only — see the note in styles.css
let glassPatch = null;   // the photographed rect, in window coords, frozen at capture time
let glassTimer = 0;

function alignGlass() {
  if (!glassPatch) return;
  rootEl.style.setProperty('--glass-w', glassPatch.w + 'px');
  rootEl.style.setProperty('--glass-h', glassPatch.h + 'px');
  const pr = { l: glassPatch.left, t: glassPatch.top, r: glassPatch.left + glassPatch.w, b: glassPatch.top + glassPatch.h };
  for (const el of GLASS_SURFACES) {
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    // A surface that reaches outside the photographed patch would show the photo across part of
    // itself and nothing across the rest — a hard vertical seam down the middle, which is what jek
    // caught on the tucked tab and on a just-opened panel (2026-08-03). Both are moments the patch
    // legitimately does not cover: tucking skips sampling entirely (a 26px tab is not worth 285ms),
    // and a panel appears ~285ms before the sample that includes it lands. Show the scrim alone
    // until a covering photo arrives — no photo reads as a plain surface, half a photo reads as
    // broken.
    el.classList.toggle('glass-partial',
      r.left < pr.l - 0.5 || r.top < pr.t - 0.5 || r.right > pr.r + 0.5 || r.bottom > pr.b + 0.5);
    // Negative offsets: the photo's origin is pushed left/up by however far this surface sits into
    // the patch, so all three surfaces reveal their own part of ONE image.
    el.style.setProperty('--gx', (glassPatch.left - r.left) + 'px');
    el.style.setProperty('--gy', (glassPatch.top - r.top) + 'px');
  }
}

// The union of everything currently on screen, so one capture serves the whole stack. Padding is
// added on main's side (the blur needs pixels past the edge to reach into).
//
// GROW_X is the horizontal slack: the pill is 220px at rest and 336px open, and it opens under the
// cursor without a new sample (see setHover). A patch measured at the resting width would leave the
// 116px it grows into with no photo behind it — a visible seam down the pill the moment you hover
// it. Padded on BOTH sides because which way it grows depends on which of the six docks it is
// parked at, and 120 > 116 with a little to spare.
const GROW_X = 120;
function stackRect() {
  let box = null;
  for (const el of GLASS_SURFACES) {
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    box = box
      ? { left: Math.min(box.left, r.left), top: Math.min(box.top, r.top),
          right: Math.max(box.right, r.right), bottom: Math.max(box.bottom, r.bottom) }
      : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }
  if (box) { box.left -= GROW_X; box.right += GROW_X; }
  return box;
}

// How much of the photo the scrim holds back, floor and ceiling. Raised from 0.58/0.90 on
// 2026-08-03: jek said the glass read as too see-through and remembered a denser version — there
// wasn't one, the formula had never changed since the first glass commit. What he was remembering
// is the pill over a DARK scene, where the photo is dark to begin with and the same alpha looks
// twice as solid. So the floor moved instead, which makes it denser everywhere rather than only
// where the desktop happens to be light.
//
// These are the two numbers to touch. Lower the floor to see more scene; raise it toward the
// ceiling to make the pill a tinted slab that merely hints at what is behind it.
const SCRIM_MIN = 0.86;   // over a dark scene
const SCRIM_MAX = 0.96;   // over a white one, where the label needs the most help

async function sampleGlass() {
  // Tucked, the pill is a 26px tab at the screen edge — there is nothing to see through, and a
  // capture would be pure cost. Locked/hidden likewise.
  if (tucked || locked || wrapEl.hidden) return;
  const box = stackRect();
  if (!box) return;
  const shot = await window.api.sampleGlass({
    x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top,
  });
  if (!shot || !shot.url) return; // throttled, mid-snip, or no Screen Recording permission — stay opaque

  // DECODE FIRST, then hand it to CSS. Assigning a fresh data: URL to a background makes the very
  // next paint decode the PNG on the main thread, and that paint is usually the FIRST frame of the
  // panel's open animation — measured 62-140ms in a single frame, which is the stutter jek reported
  // as "the animations aren't smooth". Stubbing sampleGlass out removed every dropped frame and left
  // nothing over 18ms, so the decode was the whole of it. img.decode() does the same work off the
  // critical path and resolves when the bitmap is ready, so the paint that follows is a plain blit.
  // A failure here is not worth a missing pill: fall through and let CSS decode it the old way.
  try {
    const img = new Image();
    img.src = shot.url;
    await img.decode();
  } catch { /* unsupported or aborted — CSS will decode it itself */ }
  // The world may have moved while we were decoding (tucked, snipped, style changed off ghost).
  if (tucked || locked || wrapEl.hidden) return;

  glassPatch = { left: box.left - shot.pad.x, top: box.top - shot.pad.y, w: shot.pad.w, h: shot.pad.h };
  rootEl.style.setProperty('--glass-img', `url("${shot.url}")`);
  // GT_DEBUG: stamped so a long frame in the [loaf] log can be matched against a glass swap by time.
  // The decode above was ALREADY the cause of this shape of stutter once; proving whether it is again
  // is a matter of whether the two timestamps line up, not of how plausible it sounds.
  if (window.api.debug) console.log(`[glass] applied at ${Math.round(performance.now())} (${shot.pad.w}x${shot.pad.h})`);

  const [r, g, b] = shot.tint || [18, 20, 26];
  // How hard the scrim has to work is a property of the SCENE, not a constant: over a white webpage
  // the same wash that looks right over a dark game leaves the label unreadable. Bright patch →
  // heavier dim. Range picked so the text keeps roughly the contrast the opaque slab always had.
  const dim = Math.min(SCRIM_MAX, Math.max(SCRIM_MIN, SCRIM_MIN + (shot.luma || 0) * (SCRIM_MAX - SCRIM_MIN)));
  // ...and it takes 22% of the scene's own colour, so the glass belongs to what it's lying on
  // instead of being a grey rectangle that happens to be see-through. 22% is small on purpose: any
  // more and a red boss room turns the pill into a red pill.
  // Take the scene's HUE, not its lightness. Mixing 22% of the raw average into the base does both,
  // and the lightness half is the damaging one: a terminal full of white text averages bright, so the
  // scrim's luma went 19.6 → 40, and a white page took it to 68 — three and a half times the app's
  // own dark. At 0.86+ alpha that is not a tinted glass, it is a light grey slab, which is what jek
  // saw and called white. Exactly the mistake already fixed for --accent, left behind here.
  // So: mix for hue, then rescale the result back to the base's luminance.
  const mix = (base, c) => base * 0.78 + c * 0.22;
  const lumaOf = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const mixed = [mix(18, r), mix(20, g), mix(26, b)];
  const k = lumaOf([18, 20, 26]) / Math.max(1, lumaOf(mixed));
  const scrim = mixed.map((v) => Math.round(Math.min(255, v * k)));
  rootEl.style.setProperty('--glass-scrim', `rgba(${scrim.join(', ')}, ${dim.toFixed(3)})`);
  // The rim, OPAQUE — see the long note on .glass-on in styles.css for why a translucent edge can't
  // stay consistent. It is the scrim lifted toward white, so it reads as the lit edge of this
  // surface rather than a white line drawn on top of it, and it lifts further over a bright scene
  // where the scrim itself is lighter.
  const lift = 0.30 + (shot.luma || 0) * 0.16;
  rootEl.style.setProperty('--glass-edge',
    `rgb(${scrim.map(c => Math.round(c + (255 - c) * lift)).join(', ')})`);
  applyAmbientAccent(r, g, b);

  rootEl.classList.add('glass-on');
  alignGlass();
}


// The status dot and the focus rings are the only coloured things on the pill, so leaning them
// toward the scene is where "this is sitting in your game" actually reads. But it has to be the
// scene's HUE only, never its colour: the average of a screenful of pixels is almost always
// desaturated, and blending --accent straight toward it turned the dot from Gloss blue into dead
// grey the first time this ran (measured on a khaki desktop: #7dd3fc → #9aa89e). So we keep the
// accent's own saturation and lightness and rotate only its hue, part of the way, and only when the
// scene HAS a hue worth borrowing.
const ACCENT_H = 199, ACCENT_S = 95, ACCENT_L = 74; // = #7dd3fc, the --accent token in styles.css
function applyAmbientAccent(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  // A grey desktop, a black loading screen, a snow level: no hue to speak of, and whatever the
  // rounding says it is would be noise. Leave the accent exactly as the stylesheet set it.
  if (s < 0.12) { rootEl.style.removeProperty('--accent'); rootEl.style.removeProperty('--accent-rgb'); return; }
  let h = 0;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60; if (h < 0) h += 360;
  // Rotate the SHORT way round the wheel, 30% of it. Going the long way lets a hue two degrees
  // away travel 358° through every wrong colour on the way.
  let delta = ((h - ACCENT_H + 540) % 360) - 180;
  const hue = (ACCENT_H + delta * 0.3 + 360) % 360;
  rootEl.style.setProperty('--accent', `hsl(${hue.toFixed(1)}, ${ACCENT_S}%, ${ACCENT_L}%)`);
  // --accent-rgb exists because half the file writes rgba(var(--accent-rgb), a) tints, and those
  // need three numbers, not a colour. Same hue, converted back.
  const c = (1 - Math.abs(2 * (ACCENT_L / 100) - 1)) * (ACCENT_S / 100);
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = ACCENT_L / 100 - c / 2;
  const seg = Math.floor(hue / 60) % 6;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg]
    .map(v => Math.round((v + m) * 255));
  rootEl.style.setProperty('--accent-rgb', rgb.join(', '));
}

// Every trigger routes through here, so none of them has to know about the others. main throttles
// the actual capture on its own side too (GLASS_MIN_GAP_MS) — this just avoids the round trip.
function scheduleGlass(delay = 90) {
  clearTimeout(glassTimer);
  glassTimer = setTimeout(sampleGlass, delay);
}

// PRIME. The FIRST capture of a session is the expensive one — measured: with the glass stubbed out
// the first panel open costs a 50ms frame (Chromium rastering these layers for the first time), and
// with it live that same frame was 249ms. Every open after it is 18ms either way, so the difference
// is a one-time setup being paid by whatever the user happens to do first.
//
// So pay it up front, on a screen where nothing is moving and nobody is waiting. The result is
// deliberately thrown away: this is not a sample, it is the capture session and the image-decode
// path being walked once. Tucked or not makes no difference — nothing is applied either way.
// 1200ms so it lands after the window has settled rather than competing with startup.
setTimeout(() => {
  const b = pill.getBoundingClientRect();
  if (!b.width) return;
  window.api.sampleGlass({ x: b.left, y: b.top, width: b.width, height: b.height })
    .then((shot) => {
      if (!shot || !shot.url) return;
      const img = new Image();
      img.src = shot.url;
      return img.decode().catch(() => {});
    })
    .catch(() => { /* no permission, or declined — the real sample will report it properly */ });
}, 1200);

// Anything that changes a surface's SIZE (the pill widening under the cursor, the panel swapping
// tabs, a card arriving) only needs a re-align — the scene behind it hasn't moved.
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => alignGlass());
  for (const el of GLASS_SURFACES) if (el) ro.observe(el);
}

// The sheen belongs to the surface actually under the cursor. Coordinates are element-relative
// because that's what a background gradient's `at` position wants.
let sheenEl = null;
function moveSheen(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  const surf = el && el.closest('.pill');
  if (sheenEl && sheenEl !== surf) {
    sheenEl.style.removeProperty('--mx');
    sheenEl.style.removeProperty('--my');
  }
  sheenEl = surf || null;
  if (!sheenEl) return;
  const r = sheenEl.getBoundingClientRect();
  sheenEl.style.setProperty('--mx', (clientX - r.left) + 'px');
  sheenEl.style.setProperty('--my', (clientY - r.top) + 'px');
}

// ---- First run ---------------------------------------------------------------------------------
// Shown once, ever. localStorage rather than settings.json because this is view state — the same
// place the Gloss window keeps its rail width — and nothing outside this window needs to know.
let coachCloseTimer = null;
function dismissCoach() {
  if (coachEl.hidden || coachEl.classList.contains('closing')) return;
  // Write the flag NOW, not when the fade finishes: a quit during those 160ms must not resurrect a
  // card the user has already dismissed.
  localStorage.setItem('gt.coached', '1');
  coachPending = false;
  coachEl.classList.add('closing');
  clearTimeout(coachCloseTimer);
  coachCloseTimer = setTimeout(() => {
    coachEl.hidden = true;
    coachEl.classList.remove('closing');
    updateDropRoom(); // the stack lost a surface — re-pick its height cap
  }, 180); // cardOut is 0.16s; the slack keeps `hidden` from landing mid-fade
}
document.getElementById('coachOk').addEventListener('click', (e) => { e.stopPropagation(); dismissCoach(); });
if (!localStorage.getItem('gt.coached')) {
  coachEl.hidden = false;
  updateDropRoom(); // the stack just got taller — re-pick its height cap before it paints
}

updateUI();
bumpActivity(); // mark activity on launch (auto-tuck/ghost-fade idle was removed; the pill just stays)
// First look at the desktop, once the pill has actually been laid out.
requestAnimationFrame(() => scheduleGlass(120));

// GT_SELFTEST: drive the tab switch from code so a perf question can be asked and answered without a
// human clicking between every attempt. Clicks the REAL buttons, so it exercises the same path a hand
// does — the point is to make the measurement repeatable, not to bypass anything. Off unless the env
// var is set; it opens the panel on its own, which no ordinary run should ever do.
if (window.api.debug && window.api.selfTest) {
  // GT_SELFTEST=empty filters the list down to nothing BEFORE the first History switch. That splits
  // the question in half: if the long frame survives with zero rows on screen, it belongs to the view
  // itself; if it goes away, it belongs to what the rows are made of.
  const variant = String(window.api.selfTest);

  // GT_SELFTEST=report / report2 — the two screens the reporting path added, driven from code so
  // they can be LOOKED AT without a game running and a hand on the trackpad. Same rule as the
  // variants below: it clicks the real controls, it does not fake their result.
  if (variant === 'report' || variant === 'report2') {
    const at = [];
    if (variant === 'report') {
      at.push([700, 'show a card with a misread line', () => {
        const en = document.getElementById('rEn');
        const th = document.getElementById('rTh');
        if (en) en.textContent = 'PIS&UISE YOURSELF BEFORE THE GATE';
        if (th) th.textContent = 'ปลอมตัวก่อนถึงประตู';
        const card = document.getElementById('result');
        if (card) card.hidden = false;
      }]);
      at.push([2600, 'press the flag', () => {
        const f = document.getElementById('rReport');
        console.log('[selftest] flag present =', !!f);
        if (f) f.click();
      }]);
      at.push([2000, 'flag state after send', () => {
        const f = document.getElementById('rReport');
        console.log('[selftest] flag now =', f && f.textContent, 'sent =', !!(f && f.classList.contains('sent')));
      }]);
    } else {
      at.push([1400, 'open panel', () => logBtn.click()]);
      at.push([1200, 'to Settings', () => settingsBtn.click()]);
      at.push([1200, 'to System page', () => { const b = document.getElementById('setTabSystem'); if (b) b.click(); }]);
      at.push([1200, 'open the report row', () => { const b = document.getElementById('reportOpen'); console.log('[selftest] report row present =', !!b); if (b) b.click(); }]);
    }
    let t = 0;
    for (const [d, name, run] of at) { t += d; setTimeout(() => { console.log(`[selftest] ${name}`); run(); }, t); }
  } else {
  const variant = String(window.api.selfTest);
  const steps = [
    [800, 'variant setup', () => {
      // Checking my OWN change: content-visibility cut the layout cost, but it could be paying that
      // back at paint time. Turning it off is the only way to know rather than assume.
      if (variant === 'nocv') document.documentElement.classList.add('no-cv');
    }],
    [1700, 'open panel', () => logBtn.click()],
    [1600, 'to Type', () => tabType.click()],
  ];
  if (variant === 'norows') steps.push([600, 'strip every row', () => { logEl.innerHTML = ''; }]);
  if (variant.startsWith('cap')) {
    const keep = parseInt(variant.slice(3), 10) || 40;
    steps.push([600, `keep only ${keep} rows`, () => {
      while (logEl.children.length > keep) logEl.lastElementChild.remove();
    }]);
  }
  if (variant === 'noscroll') steps.push([600, 'freeze the scroller', () => { logEl.style.overflow = 'hidden'; }]);
  // Thai out, Latin in — same rows, same boxes, same count. If the long frame goes with the Thai it
  // is glyph work (shaping + rasterising a script the process has not drawn yet), which no amount of
  // trimming rows would ever have fixed.
  if (variant === 'ascii') steps.push([600, 'latinise every row', () => {
    const walk = document.createTreeWalker(logEl, NodeFilter.SHOW_TEXT);
    let node, hit = 0;
    while ((node = walk.nextNode())) {
      if (/[^\x00-\x7F]/.test(node.nodeValue)) { node.nodeValue = 'abcdefg'; hit++; }
    }
    console.log(`[selftest] latinised ${hit} text nodes`);
  }]);
  // The star is the one row icon with VISUAL STATES (hollow / gold when saved / hollowed on
  // hover-preview), so it is the one a flat mask image cannot replace without rebuilding those states.
  // This variant leaves it alone and drops only the three stateless icons, to find out whether the
  // cheap, low-risk three-quarters of the refactor is worth doing on its own.
  if (variant === 'nosvg3') steps.push([600, 'strip the stateless row icons', () => {
    let n = 0;
    for (const svg of logEl.querySelectorAll('svg')) {
      const owner = svg.parentElement;
      if (owner && /star|fav/i.test(owner.className)) continue;
      svg.remove(); n++;
    }
    console.log(`[selftest] removed ${n} stateless svgs`);
  }]);
  if (variant === 'nosvg') steps.push([600, 'strip row icons', () => {
    const svgs = logEl.querySelectorAll('svg');
    svgs.forEach((s) => s.remove());
    console.log(`[selftest] removed ${svgs.length} svgs`);
  }]);
  steps.push(
    [1600, 'to History (the slow one)', () => { console.log(`[selftest] rows=${logEl.children.length}`); tabHist.click(); }],
    [1600, 'to Type', () => tabType.click()],
    [1600, 'to History again', () => tabHist.click()],
  );
  let at = 0;
  for (const [delay, name, run] of steps) {
    at += delay;
    setTimeout(() => { console.log(`[selftest] ${name}`); run(); }, at);
  }
  }
}


// ---------- reporting ----------
// The app's only outbound path, wired at the two places a problem is actually noticed. Both call the
// same api.sendReport — see the handler in main.js for what gets attached (version, OS, language
// pair, and the app that was in front, which during a snip is the game).
(() => {
  const flag = document.getElementById('rReport');
  const openBtn = document.getElementById('reportOpen');
  const row = document.getElementById('reportRow');
  const input = document.getElementById('reportInput');
  const sendBtn = document.getElementById('reportSend');
  const okNote = document.getElementById('reportOk');
  const errNote = document.getElementById('reportErr');

  // The card's ⚑ sends with NO typing: one press, the misread line goes as-is. Asking for a
  // sentence here would trade the report for the effort of writing it, over a game, mid-fight.
  if (flag) {
    flag.addEventListener('click', async () => {
      if (flag.classList.contains('sent')) return;
      const en = document.getElementById('rEn');
      const line = (en && en.textContent ? en.textContent : '').trim();
      flag.classList.add('sent');
      flag.textContent = '✓';
      const res = await window.api.sendReport({ kind: 'ocr', text: line });
      if (!res || !res.ok) {
        // Put the flag back rather than leave a ✓ standing for something that never arrived.
        flag.classList.remove('sent');
        flag.textContent = '⚑';
      }
    });
  }

  // Every new card is a new read: the ✓ from the last one must not carry over and make the next
  // misread look already-reported. Cheap enough to just watch the card for changes.
  const card = document.getElementById('result');
  if (card && flag && window.MutationObserver) {
    new MutationObserver(() => {
      if (!flag.classList.contains('sent')) return;
      flag.classList.remove('sent');
      flag.textContent = '⚑';
    }).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  }

  if (!openBtn || !row || !input || !sendBtn) return;

  openBtn.addEventListener('click', () => {
    row.hidden = !row.hidden;
    if (okNote) okNote.hidden = true;
    if (errNote) errNote.hidden = true;
    if (!row.hidden) input.focus();
  });

  const send = async () => {
    const note = input.value.trim();
    if (!note) return;
    sendBtn.disabled = true;
    const res = await window.api.sendReport({ kind: 'general', note });
    sendBtn.disabled = false;
    const ok = !!(res && res.ok);
    if (okNote) okNote.hidden = !ok;
    if (errNote) errNote.hidden = ok;
    // Clear only on success — a failed send that wipes what someone typed is a second bug on top of
    // the one they were reporting.
    if (ok) { input.value = ''; row.hidden = true; }
  };

  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
})();
