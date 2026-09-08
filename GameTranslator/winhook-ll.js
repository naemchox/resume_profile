// ---------- Windows low-level mouse hook, WITH suppression (Windows only) ----------
// uiohook-napi can only listen, so the snip drag always leaked through the click-through overlay to
// whatever was underneath — selecting its text, clicking into the game. A WH_MOUSE_LL hook we own can
// return 1 for a button and swallow the event outright, which is the only way to stop that
// without a mouse-capturing overlay (that freezes the video underneath — see main.js).
//
// Installed through koffi (FFI): no C++ addon to build, nothing to rebuild per Electron version.
//
// Two rules keep this from becoming the input-lag bug we already fixed once:
//   1. Installed only for the duration of a snip. SetWindowsHookEx/UnhookWindowsHookEx return
//      immediately (unlike uIOhook.stop(), which blocks 300ms-5.6s), so per-snip is genuinely free
//      and nothing is hooked while the user is just playing.
//   2. The callback NEVER does real work. It decides suppress-or-not, queues the app-side handler via
//      setImmediate, and returns. Windows drops a low-level hook that takes too long to answer.
//
// Every mouse event that can DO something underneath is swallowed — left (which also drives the box),
// right, and the wheel. Mouse MOVES pass through untouched, or the cursor would freeze mid-drag, and
// the side buttons pass through because they are how a snip is triggered and cancelled.

const { screen } = require('electron');

const WH_MOUSE_LL = 14;
const WM_MOUSEMOVE = 0x0200;
const WM_LBUTTONDOWN = 0x0201;
const WM_LBUTTONUP = 0x0202;
const WM_LBUTTONDBLCLK = 0x0203;
// The right button and the wheel are swallowed too, but they drive NOTHING here — they are eaten and
// dropped. A visual novel advances its dialogue on a right-click as readily as a left one, and its
// backlog scrolls on the wheel, so a snip drawn over a text box was still skipping the very line it
// was drawn to read (jek, 2026-08-28). Side buttons (XBUTTON1/2) are deliberately NOT here: they are
// snip TRIGGERS (winmousehook.js), and eating them would swallow the re-press that cancels.
const WM_RBUTTONDOWN = 0x0204;
const WM_RBUTTONUP = 0x0205;
const WM_RBUTTONDBLCLK = 0x0206;
const WM_MOUSEWHEEL = 0x020a;
const WM_MOUSEHWHEEL = 0x020e;
const MOVE_THROTTLE_MS = 16; // ~60fps

let koffi = null;
let api = null;          // bound win32 functions + types
let hookHandle = null;   // HHOOK while installed
let callbackPtr = null;  // registered koffi callback
let handlers = null;     // { down, move, up } — null when disarmed
// The PILL's click shield — a second, much smaller owner of the same hook. The overlay window is
// non-activating on Windows (main.js: focusable:false), which is what stops a click on the pill from
// taking the foreground off the game and muting it. The price is that the game STAYS foreground and
// keeps reading the mouse through Raw Input, so a click meant for the pill also fires in the game
// ("มันทะลุ", jek 2026-08-29) — Raw Input does not care which window the cursor is over. Swallowing
// the event here is the only place that reaches it, and main re-injects the click into the overlay
// with webContents.sendInputEvent so our own UI still gets it. Armed only while the cursor is over
// real overlay content (main's interactiveState), which is the same gate that already decides whether
// the window captures the mouse at all.
let shield = null;       // { down, up, wheel } — null when the cursor is not on our UI
let shieldLeft = false;  // a shielded press still physically down (so its release stays shielded)
let shieldRight = false;
let shieldSink = null;   // kept past the disarm until every shielded press has been released
let shieldOwedTimer = null;
let dragging = false;
let lastMoveMs = 0;
let loadFailed = false;
let rightDown = false;   // a right press we swallowed and still owe a swallowed release
// Disarmed while a button we swallowed is still physically down: stay installed just to eat its
// release. A SET, not a flag, because left and right can both be down at the moment of the cancel.
const pendingUps = new Set();
let pendingUpTimer = null;

function ensureLoaded() {
  if (api) return true;
  if (loadFailed || process.platform !== 'win32') return false;
  try {
    koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const POINT = koffi.struct('POINT', { x: 'int32', y: 'int32' });
    // Read straight out of the lParam pointer; the pointer itself is passed on to CallNextHookEx
    // untouched, so nothing is re-encoded behind Windows' back.
    const MSLLHOOKSTRUCT = koffi.struct('MSLLHOOKSTRUCT', {
      pt: POINT,
      mouseData: 'uint32',
      flags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });
    const HOOKPROC = koffi.proto('intptr_t HOOKPROC(int code, uintptr_t wParam, void *lParam)');
    const RECT = koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    api = {
      MSLLHOOKSTRUCT,
      HOOKPROC,
      SetWindowsHookExW: user32.func('void* SetWindowsHookExW(int, HOOKPROC*, void*, uint32)'),
      UnhookWindowsHookEx: user32.func('int UnhookWindowsHookEx(void*)'),
      CallNextHookEx: user32.func('intptr_t CallNextHookEx(void*, int, uintptr_t, void*)'),
      // HWNDs are carried as uintptr_t, not void*, so a handle can cross the JS boundary as a plain
      // number — forceForeground gets its window from Electron's getNativeWindowHandle() Buffer, and
      // there is no way to turn those bytes into a koffi pointer.
      GetForegroundWindow: user32.func('uintptr_t GetForegroundWindow()'),
      GetWindowThreadProcessId: user32.func('uint32 GetWindowThreadProcessId(uintptr_t, _Out_ uint32 *)'),
      GetWindowRect: user32.func('int GetWindowRect(uintptr_t, _Out_ RECT *)'),
      IsIconic: user32.func('int IsIconic(uintptr_t)'),
      SetForegroundWindow: user32.func('int SetForegroundWindow(uintptr_t)'),
      BringWindowToTop: user32.func('int BringWindowToTop(uintptr_t)'),
      AttachThreadInput: user32.func('int AttachThreadInput(uint32, uint32, int)'),
      GetCurrentThreadId: kernel32.func('uint32 GetCurrentThreadId()'),
    };
    return true;
  } catch (err) {
    console.error('winhook-ll: koffi/user32 unavailable:', err.message);
    loadFailed = true;
    api = null;
    return false;
  }
}

function toDip(x, y) {
  try {
    const p = screen.screenToDipPoint({ x, y });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  } catch {
    return { x, y };
  }
}

// The hook procedure. Runs on the Electron main thread while it pumps Win32 messages, so it must
// return fast — everything real is deferred with setImmediate.
function hookProc(code, wParam, lParam) {
  if (code < 0) return api.CallNextHookEx(null, code, wParam, lParam);

  // Cancelled mid-drag (Esc / shortcut again) while the button is still physically down. The press
  // was swallowed, so letting its release through would hand the app below a button-up with no
  // button-down — some games read that as a real "fire"/"drop". Eat exactly that one event, then go.
  if (pendingUps.size) {
    const msg = Number(wParam);
    if (pendingUps.has(msg)) {
      pendingUps.delete(msg);
      // Only leave once EVERY owed release has been eaten — with two buttons down at the cancel,
      // uninstalling on the first one hands the second's release straight to the app below, which is
      // the exact orphan this block exists to prevent.
      if (!pendingUps.size) {
        clearTimeout(pendingUpTimer);
        setImmediate(releaseIfIdle); // not from inside our own callback — and the shield may still want it
      }
      return 1;
    }
    return api.CallNextHookEx(null, code, wParam, lParam);
  }

  // No snip in progress: the pill's shield gets the event instead. Snip always wins — it owns the
  // whole screen while it is up, and its own branch already swallows everything this one would.
  // The shield stays in play while it still owes a release, even after being disarmed — see shieldProc.
  if (!handlers) {
    if (!shield && !shieldLeft && !shieldRight) return api.CallNextHookEx(null, code, wParam, lParam);
    return shieldProc(code, wParam, lParam);
  }

  let swallow = false;
  try {
    const msg = Number(wParam);
    if (msg === WM_LBUTTONDOWN || msg === WM_LBUTTONDBLCLK) {
      const info = koffi.decode(lParam, api.MSLLHOOKSTRUCT);
      const d = toDip(info.pt.x, info.pt.y);
      if (!dragging) {
        dragging = true;
        const h = handlers;
        setImmediate(() => {
          try { const o=[0]; api.GetWindowThreadProcessId(api.GetForegroundWindow(), o); console.log('[DBG] foreground pid at drag-down = ' + o[0]); } catch (e) { console.log('[DBG] fg probe failed: ' + e.message); }
          if (h) h.down(d.x, d.y);
        });
      }
      swallow = true; // the app underneath must never see this press
    } else if (msg === WM_LBUTTONUP) {
      const info = koffi.decode(lParam, api.MSLLHOOKSTRUCT);
      const d = toDip(info.pt.x, info.pt.y);
      if (dragging) {
        dragging = false;
        const h = handlers;
        setImmediate(() => { if (h) h.up(d.x, d.y); });
      }
      swallow = true; // ...nor the matching release
    } else if (msg === WM_RBUTTONDOWN || msg === WM_RBUTTONDBLCLK) {
      rightDown = true;
      swallow = true; // nothing listens for it — this is purely 'the game must not see it'
    } else if (msg === WM_RBUTTONUP) {
      rightDown = false;
      swallow = true;
    } else if (msg === WM_MOUSEWHEEL || msg === WM_MOUSEHWHEEL) {
      swallow = true; // a wheel over a text box scrolls the backlog / skips lines underneath
    } else if (msg === WM_MOUSEMOVE && dragging) {
      const now = Date.now();
      if (now - lastMoveMs >= MOVE_THROTTLE_MS) {
        lastMoveMs = now;
        const info = koffi.decode(lParam, api.MSLLHOOKSTRUCT);
        const d = toDip(info.pt.x, info.pt.y);
        const h = handlers;
        setImmediate(() => { if (h) h.move(d.x, d.y); });
      }
      // moves are NEVER swallowed — the cursor has to keep moving normally
    }
  } catch (err) {
    console.error('winhook-ll: hook proc error (passing the event through):', err.message);
    swallow = false;
  }

  const _m = Number(wParam);
  if (_m !== WM_MOUSEMOVE) { const _s = swallow; setImmediate(() => console.log('[DBG] msg 0x' + _m.toString(16) + (_s ? ' SWALLOWED' : ' PASSED THROUGH'))); }
  if (swallow) return 1;
  return api.CallNextHookEx(null, code, wParam, lParam);
}

// The pill's shield. Swallows the buttons and the wheel so the game underneath never sees them, and
// hands main the same event to re-inject into the overlay with sendInputEvent. Moves are left alone:
// the cursor has to keep moving, the overlay is capturing the mouse whenever the shield is armed so
// it gets the real WM_MOUSEMOVE anyway, and a swallowed move freezes the pointer over our own UI.
function shieldProc(code, wParam, lParam) {
  let swallow = false;
  let kind = null, button = null, clicks = 1;
  try {
    const msg = Number(wParam);
    if (msg === WM_LBUTTONDOWN || msg === WM_LBUTTONDBLCLK) {
      if (shield) { shieldLeft = true; swallow = true; kind = 'down'; button = 'left'; clicks = msg === WM_LBUTTONDBLCLK ? 2 : 1; }
    } else if (msg === WM_LBUTTONUP) {
      // A release is shielded when its PRESS was, even if the cursor has since left our UI and the
      // shield was disarmed mid-click. Letting it through on its own hands the game a button-up with
      // no button-down — the same orphan pendingUps exists to prevent on the snip side.
      if (shieldLeft) { shieldLeft = false; swallow = true; kind = 'up'; button = 'left'; }
    } else if (msg === WM_RBUTTONDOWN || msg === WM_RBUTTONDBLCLK) {
      if (shield) { shieldRight = true; swallow = true; kind = 'down'; button = 'right'; }
    } else if (msg === WM_RBUTTONUP) {
      if (shieldRight) { shieldRight = false; swallow = true; kind = 'up'; button = 'right'; }
    } else if (msg === WM_MOUSEWHEEL || msg === WM_MOUSEHWHEEL) {
      // The panel's lists scroll on the wheel and so does a visual novel's backlog underneath — the
      // exact leak the snip branch already documents, one window up.
      if (shield) { swallow = true; kind = 'wheel'; button = msg === WM_MOUSEWHEEL ? 'v' : 'h'; }
    }
    if (kind) {
      const info = koffi.decode(lParam, api.MSLLHOOKSTRUCT);
      const d = toDip(info.pt.x, info.pt.y);
      // Wheel delta rides in the HIGH word of mouseData, SIGNED, in WHEEL_DELTA (120) units.
      let delta = 0;
      if (kind === 'wheel') {
        const hi = (info.mouseData >>> 16) & 0xffff;
        delta = (hi > 0x7fff ? hi - 0x10000 : hi) / 120;
      }
      // shieldSink, not shield: a release owed after the disarm must still reach the UI, or the pill
      // is left holding a press that never came up (stuck drag, button stuck in its :active state).
      const s = shieldSink;
      const k = kind, b = button, c = clicks;
      if (s) setImmediate(() => { try { s(k, d.x, d.y, b, c, delta); } catch { /* non-fatal */ } });
    }
  } catch (err) {
    console.error('winhook-ll: shield error (passing the event through):', err.message);
    swallow = false;
  }
  if (swallow) return 1;
  return api.CallNextHookEx(null, code, wParam, lParam);
}

// Arm the shield: sink(kind, x, y, button, clickCount, delta) with DIP screen coordinates.
function startShield(sink) {
  if (!ensureLoaded()) return false;
  clearTimeout(shieldOwedTimer);
  shield = sink;
  shieldSink = sink;
  if (!ensureInstalled()) { shield = null; shieldSink = null; return false; }
  return true;
}

// Disarm. The hook lingers only while a shielded button is still physically down, with the same hard
// timeout as the snip side so a press that never comes back up can't keep it installed for good.
function stopShield() {
  shield = null;
  if (shieldLeft || shieldRight) {
    clearTimeout(shieldOwedTimer);
    shieldOwedTimer = setTimeout(() => {
      shieldLeft = false; shieldRight = false; shieldSink = null; releaseIfIdle();
    }, 5000);
    return;
  }
  shieldSink = null;
  releaseIfIdle();
}

// One hook, two owners (snip and the shield), so installing and releasing are shared. Uninstalling
// the moment one owner leaves would pull the hook out from under the other.
function ensureInstalled() {
  if (hookHandle) return true;
  try {
    if (!callbackPtr) callbackPtr = koffi.register(hookProc, koffi.pointer(api.HOOKPROC));
    hookHandle = api.SetWindowsHookExW(WH_MOUSE_LL, callbackPtr, null, 0);
  } catch (err) {
    console.error('winhook-ll: SetWindowsHookEx threw:', err.message);
    hookHandle = null;
  }
  return !!hookHandle;
}
function releaseIfIdle() {
  if (handlers || shield || pendingUps.size || shieldLeft || shieldRight) return;
  uninstall();
}

// Install the hook and start forwarding to h. Returns false if it can't be installed at all, so the
// caller can fall back to the listen-only uiohook path.
function startLLHook(h) {
  if (!ensureLoaded()) return false;
  // Re-armed while still waiting to eat a stale release — the new session owns the hook now.
  pendingUps.clear();
  clearTimeout(pendingUpTimer);
  handlers = h;
  dragging = false;
  rightDown = false;
  if (hookHandle) return true; // already installed (re-arm, or the shield already has it up)
  if (!ensureInstalled()) {
    handlers = null;
    return false;
  }
  return true;
}

function uninstall() {
  if (!hookHandle) return;
  try { api.UnhookWindowsHookEx(hookHandle); } catch { /* non-fatal */ }
  hookHandle = null;
}

// Uninstall. Cheap and immediate — no thread join, nothing to wait for. The one exception is being
// disarmed mid-drag: the hook lingers until it has eaten the pending release (see hookProc), with a
// hard timeout so a button that never comes back up can't leave it installed for the session.
function stopLLHook() {
  handlers = null;
  pendingUps.clear();
  if (dragging) pendingUps.add(WM_LBUTTONUP);
  if (rightDown) pendingUps.add(WM_RBUTTONUP);
  dragging = false;
  rightDown = false;
  if (pendingUps.size && hookHandle) {
    clearTimeout(pendingUpTimer);
    pendingUpTimer = setTimeout(() => { pendingUps.clear(); releaseIfIdle(); }, 5000);
    return;
  }
  pendingUps.clear();
  releaseIfIdle();
}

function shutdownLLHook() {
  handlers = null;
  dragging = false;
  rightDown = false;
  shield = null;
  shieldSink = null;
  shieldLeft = false;
  shieldRight = false;
  clearTimeout(shieldOwedTimer);
  pendingUps.clear();
  clearTimeout(pendingUpTimer);
  uninstall();
  if (callbackPtr) {
    try { koffi.unregister(callbackPtr); } catch { /* non-fatal */ }
    callbackPtr = null;
  }
}

// Who owns the foreground right now — remembered at arm so the game can be handed it back afterwards.
// A raw HWND, opaque on purpose: it is only ever passed straight back to SetForegroundWindow.
function foregroundWindow() {
  if (!ensureLoaded()) return null;
  try { return api.GetForegroundWindow(); } catch { return null; }
}
// The pid behind the foreground window — the Windows half of macOS's "name of first application
// process whose frontmost is true". Only the number: turning a pid into a name is a process lookup,
// which belongs next to the osascript path it mirrors in main.js, not inside a koffi module.
function foregroundPid() {
  if (!ensureLoaded()) return 0;
  try {
    const fg = api.GetForegroundWindow();
    if (!fg) return 0;
    const out = [0];
    api.GetWindowThreadProcessId(fg, out);
    return Number(out[0] || 0);
  } catch { return 0; }
}

// Where the foreground window is, in screen pixels — enough to say which monitor a person is
// actually working on. The cursor cannot answer that: it sits wherever it was last let go, which
// is often a screen nobody is looking at. Returns null for a minimised window (its rect is off in
// the negative thousands and would name a monitor at random) and for our own process, so the pill
// showing a card never counts as the user moving somewhere.
function foregroundRect() {
  if (!ensureLoaded()) return null;
  try {
    const fg = api.GetForegroundWindow();
    if (!fg) return null;
    if (api.IsIconic(fg)) return null;
    const out = [0];
    api.GetWindowThreadProcessId(fg, out);
    const pid = Number(out[0] || 0);
    if (!pid || pid === process.pid) return null;
    const r = {};
    if (!api.GetWindowRect(fg, r)) return null;
    const w = r.right - r.left, h = r.bottom - r.top;
    if (w <= 0 || h <= 0) return null;
    return { x: r.left, y: r.top, width: w, height: h, pid };
  } catch { return null; }
}

// Give the foreground back. Only works while WE are the foreground process (Windows' foreground lock),
// which is exactly when this is called — right as the snip overlay stands down.
function restoreForeground(hwnd) {
  if (!hwnd || !ensureLoaded()) return;
  try { api.SetForegroundWindow(hwnd); } catch { /* non-fatal */ }
}

// Make the snip overlay the foreground window, for real. `win.focus()` alone is not enough and was
// measured failing on Restory.exe (Unity, 2026-08-29): Windows refuses SetForegroundWindow to a
// process that is not already the foreground one, and during a snip the GAME is. The refusal is
// silent — focus() returns, the DBG line prints, and the game is still foreground at drag-down.
// That matters because a Unity game reads the mouse through Raw Input, which the LL hook cannot
// filter (see takeForegroundForSnip); Raw Input only reaches the FOREGROUND window, so stealing the
// foreground is the only thing that actually stops the click landing in the game.
// The documented way past the foreground lock is to borrow the current owner's input queue:
// AttachThreadInput to its thread, ask while attached, detach. Returns whether we really got it —
// never trust SetForegroundWindow's own return, it reports success on a window that never activated.
function forceForeground(hwndBuf) {
  if (!ensureLoaded()) return false;
  let me = 0, fgTid = 0, attached = false;
  try {
    const hwnd = Buffer.isBuffer(hwndBuf)
      ? Number(hwndBuf.length >= 8 ? hwndBuf.readBigUInt64LE(0) : BigInt(hwndBuf.readUInt32LE(0)))
      : Number(hwndBuf);
    if (!hwnd) return false;
    const fg = Number(api.GetForegroundWindow() || 0);
    me = api.GetCurrentThreadId();
    if (fg) {
      const out = [0];
      fgTid = api.GetWindowThreadProcessId(fg, out);
      if (fgTid && fgTid !== me) attached = !!api.AttachThreadInput(me, fgTid, 1);
    }
    api.BringWindowToTop(hwnd);
    api.SetForegroundWindow(hwnd);
    return Number(api.GetForegroundWindow() || 0) === hwnd;
  } catch (err) {
    console.error('winhook-ll: forceForeground failed:', err.message);
    return false;
  } finally {
    // Detaching is not optional: leave the queues attached and this process shares the game's input
    // state for the rest of the session.
    if (attached) { try { api.AttachThreadInput(me, fgTid, 0); } catch { /* non-fatal */ } }
  }
}

function isAvailable() {
  return process.platform === 'win32' && ensureLoaded();
}

module.exports = { isAvailable, startLLHook, stopLLHook, shutdownLLHook, startShield, stopShield, foregroundWindow, foregroundPid, foregroundRect, restoreForeground, forceForeground };
