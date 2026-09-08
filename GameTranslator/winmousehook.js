// ---------- Windows low-level mouse hook: side-button shortcuts (Windows only) ----------
// The sibling of winkeyhook.js, for the other half of the same problem. globalShortcut only speaks
// accelerators, and an accelerator is a KEY — there is no spelling for a mouse button in it, at any
// OS. So a shortcut bound to Mouse4/Mouse5 cannot be registered; something has to watch the device.
// WH_MOUSE_LL is that something, installed through koffi like the other two hooks — no C++ addon,
// nothing to rebuild per Electron version.
//
// ONLY the two side buttons (XBUTTON1/XBUTTON2). Left, right and middle are deliberately not on
// offer: they are the buttons the game is using, and a global binding on one fires every time you
// shoot. The side buttons are the only ones a player can spare, which is also why they are the ones
// people ask for.
//
// Like winkeyhook, this one is installed while you are just playing, so it lives by the same three
// rules that keep a hook from becoming input lag:
//   1. It NEVER swallows — every event goes to CallNextHookEx. Your side buttons keep doing whatever
//      the game and the browser have them doing; Gloss listens in, it does not take the button. (An
//      earlier hook that DID swallow is winhook-ll.js, and it only dares because it is installed for
//      the seconds a snip lasts.)
//   2. The callback does no real work: one integer compare rejects mouse MOVES, which are ~everything
//      that comes through here, before anything is decoded. The app-side handler is deferred with
//      setImmediate. Windows drops a low-level hook that answers slowly.
//   3. Nothing is installed at all unless some action is actually bound to a side button — the empty
//      binding map uninstalls (see setMouseButtons).
//
// Cursor position is not reported. A button-shortcut fires the same action a key-shortcut would, and
// those read the cursor themselves when they need it (screen.getCursorScreenPoint), exactly as the
// keyboard path does.

const WH_MOUSE_LL = 14;
const WM_XBUTTONDOWN = 0x020b;
const WM_XBUTTONUP = 0x020c;
// XBUTTON1/2 arrive in the HIGH word of mouseData — the low word is unrelated (it carries wheel
// delta on wheel messages). Both buttons come in on the same message id, so this is the only thing
// that says which one was pressed.
const XBUTTON1 = 1;
const XBUTTON2 = 2;

let koffi = null;
let api = null;
let hookHandle = null;
let callbackPtr = null;
let loadFailed = false;
// button number (4 | 5) -> handler. Empty means "nothing bound", which is also "not installed".
let bindings = new Map();
// Which buttons are physically down, so a held button can't repeat-fire. Windows does not auto-repeat
// mouse buttons the way it repeats keys, but a chattering switch (a real failure mode on worn mice)
// sends a burst of downs, and a shortcut that fires eight times is worse than one that misses.
const down = { 4: false, 5: false };

function ensureLoaded() {
  if (api) return true;
  if (loadFailed || process.platform !== 'win32') return false;
  try {
    koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const POINT = koffi.struct('MMPOINT', { x: 'int32', y: 'int32' });
    const MSLLHOOKSTRUCT = koffi.struct('MMSLLHOOKSTRUCT', {
      pt: POINT,
      mouseData: 'uint32',
      flags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });
    const MMHOOKPROC = koffi.proto('intptr_t MMHOOKPROC(int code, uintptr_t wParam, void *lParam)');
    api = {
      MSLLHOOKSTRUCT,
      MMHOOKPROC,
      SetWindowsHookExW: user32.func('void* SetWindowsHookExW(int, MMHOOKPROC*, void*, uint32)'),
      UnhookWindowsHookEx: user32.func('int UnhookWindowsHookEx(void*)'),
      CallNextHookEx: user32.func('intptr_t CallNextHookEx(void*, int, uintptr_t, void*)'),
    };
    return true;
  } catch (err) {
    console.error('winmousehook: koffi/user32 unavailable:', err.message);
    loadFailed = true;
    api = null;
    return false;
  }
}

function hookProc(code, wParam, lParam) {
  if (code < 0) return api.CallNextHookEx(null, code, wParam, lParam);
  try {
    const msg = Number(wParam);
    // The fast exit, and the reason this hook is affordable: moves, clicks and wheel all leave here.
    if (msg === WM_XBUTTONDOWN || msg === WM_XBUTTONUP) {
      const info = koffi.decode(lParam, api.MSLLHOOKSTRUCT);
      const which = (info.mouseData >>> 16) & 0xffff;
      const btn = which === XBUTTON1 ? 4 : which === XBUTTON2 ? 5 : 0;
      if (btn) {
        if (msg === WM_XBUTTONUP) {
          down[btn] = false;
        } else if (!down[btn]) {
          down[btn] = true;
          const run = bindings.get(btn);
          if (run) setImmediate(() => { try { run(); } catch (err) { console.error('winmousehook: handler threw:', err.message); } });
        }
      }
    }
  } catch (err) {
    console.error('winmousehook: hook proc error (passing the event through):', err.message);
  }
  // ALWAYS pass through — see the header. Never return 1 from here.
  return api.CallNextHookEx(null, code, wParam, lParam);
}

// Declare the whole binding set at once: { 4: fn, 5: fn }. Passing an empty object is how you turn
// the feature off, and it uninstalls rather than idling — a hook nobody is using is pure risk.
// Re-declaring while installed just swaps the map; the hook itself is left alone.
function setMouseButtons(map) {
  const next = new Map();
  for (const btn of [4, 5]) {
    const fn = map && map[btn];
    if (typeof fn === 'function') next.set(btn, fn);
  }
  bindings = next;
  down[4] = false;
  down[5] = false;
  if (!next.size) { stopMouseButtons(); return true; }
  if (!ensureLoaded()) return false;
  if (hookHandle) return true; // already installed — the new map is live as of the line above
  try {
    if (!callbackPtr) callbackPtr = koffi.register(hookProc, koffi.pointer(api.MMHOOKPROC));
    hookHandle = api.SetWindowsHookExW(WH_MOUSE_LL, callbackPtr, null, 0);
  } catch (err) {
    console.error('winmousehook: SetWindowsHookEx threw:', err.message);
    hookHandle = null;
  }
  if (!hookHandle) {
    bindings = new Map();
    return false;
  }
  return true;
}

function stopMouseButtons() {
  bindings = new Map();
  down[4] = false;
  down[5] = false;
  if (!hookHandle) return;
  try { api.UnhookWindowsHookEx(hookHandle); } catch { /* non-fatal */ }
  hookHandle = null;
}

function shutdownMouseButtons() {
  stopMouseButtons();
  if (callbackPtr) {
    try { koffi.unregister(callbackPtr); } catch { /* non-fatal */ }
    callbackPtr = null;
  }
}

function isAvailable() {
  return process.platform === 'win32' && ensureLoaded();
}

module.exports = { isAvailable, setMouseButtons, stopMouseButtons, shutdownMouseButtons };
