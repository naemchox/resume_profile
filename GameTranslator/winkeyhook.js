// ---------- Windows low-level keyboard hook: modifier-only snip trigger (Windows only) ----------
// The macOS half of this is a CGEventTap watching .flagsChanged (native/mousehook.swift). Windows has
// no equivalent, so the same trigger needs WH_KEYBOARD_LL. Installed through koffi like winhook-ll.js
// — no C++ addon, nothing to rebuild per Electron version.
//
// Why a hook at all: globalShortcut cannot register a modifier-only accelerator (there is no keystroke
// to fire on) and never reports a release, and the snip trigger is both — ⌃⌥ by default, and in 'hold'
// style the release is the shutter. Which modifiers to watch comes from the caller, not from here.
//
// This hook breaks winhook-ll's "only installed during a snip" rule ON PURPOSE: the trigger has to work
// while you're just playing, so there is no snip to scope it to. Three things keep that from becoming the
// input-lag bug we already fixed once:
//   1. It NEVER swallows. Every event goes straight to CallNextHookEx — Ctrl and Alt keep working in
//      the game exactly as before. Suppression is what makes a hook dangerous; this one has none.
//   2. The callback does no real work. It decodes one small struct, updates a bitmask, and returns.
//      The app-side handler is deferred with setImmediate. Windows drops a hook that answers slowly.
//   3. Only modifier vkCodes are looked at at all — one table lookup, and every other key exits right
//      there, which is the common case by a wide margin while someone is playing.
//
// Cursor position is NOT tracked here. While the combo is held there is no button to swallow, so
// main.js just polls screen.getCursorScreenPoint() — one less low-level hook in the input path.

const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const WM_SYSKEYDOWN = 0x0104; // Alt-modified keys arrive as SYS* — miss these and Alt never registers
const WM_SYSKEYUP = 0x0105;

// Both the generic and the side-specific codes: a keyboard can report either, and which one you get
// varies by device/driver. Tracking every one of them and folding both sides onto one name is what
// makes left OR right work.
//
// The set is no longer just ⌃⌥. The snip trigger is rebindable and a modifier-only binding is the
// hook's to run (see main.js), so whichever modifiers the user picked have to be watchable — hard-
// coding Ctrl+Alt here would have meant a Settings row that quietly ignored three of its own answers.
// Names match holdModsFor() in main.js so the two sides cannot drift.
const VK_MOD = {
  0x11: 'control', 0xa2: 'control', 0xa3: 'control',
  0x12: 'alternate', 0xa4: 'alternate', 0xa5: 'alternate', // "MENU" is Win32's name for Alt
  0x10: 'shift', 0xa0: 'shift', 0xa1: 'shift',
  0x5b: 'command', 0x5c: 'command',                         // the Windows keys
};

let koffi = null;
let api = null;
let hookHandle = null;
let callbackPtr = null;
let onCombo = null; // { down(), up() } — null when not armed
const modDown = { control: false, alternate: false, shift: false, command: false };
let need = [];      // which of those must be held for this trigger, e.g. ['control','alternate']
let comboActive = false;
let loadFailed = false;

// LLKHF_INJECTED: set in KBDLLHOOKSTRUCT.flags when an event was synthesised, not physically typed.
// AltGr (right Alt on Thai/EU/most non-US layouts) makes Windows INJECT a fake left-Ctrl right before the
// Alt, so typing @ € ฿ momentarily reads as Ctrl+Alt and used to flash the snip overlay. A real key press
// is never injected — so we simply ignore injected modifier events, and the fake Ctrl never sets
// ctrlDown. This kills the AltGr false-trigger with ZERO delay (an earlier 130ms dwell fixed AltGr but
// made the real ⌃⌥ hold feel laggy — jek, Win11 2026-07-31). mac's CGEventTap has no AltGr to fight.
const LLKHF_INJECTED = 0x10;

function ensureLoaded() {
  if (api) return true;
  if (loadFailed || process.platform !== 'win32') return false;
  try {
    koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
      vkCode: 'uint32',
      scanCode: 'uint32',
      flags: 'uint32',
      time: 'uint32',
      dwExtraInfo: 'uintptr_t',
    });
    const KBHOOKPROC = koffi.proto('intptr_t KBHOOKPROC(int code, uintptr_t wParam, void *lParam)');
    api = {
      KBDLLHOOKSTRUCT,
      KBHOOKPROC,
      SetWindowsHookExW: user32.func('void* SetWindowsHookExW(int, KBHOOKPROC*, void*, uint32)'),
      UnhookWindowsHookEx: user32.func('int UnhookWindowsHookEx(void*)'),
      CallNextHookEx: user32.func('intptr_t CallNextHookEx(void*, int, uintptr_t, void*)'),
    };
    return true;
  } catch (err) {
    console.error('winkeyhook: koffi/user32 unavailable:', err.message);
    loadFailed = true;
    api = null;
    return false;
  }
}

// Re-derive the combo state after any modifier moved, and fire only on the EDGE. Holding ⌃⌥ still
// repeats key-downs at the OS repeat rate, so without the edge check this would restart the drag
// dozens of times a second.
function refreshCombo() {
  // Extra modifiers on top are not disqualifying — holding ⌃⌥ and brushing Shift should not drop the
  // drag you are in the middle of. Only "everything the trigger asks for is down" is checked.
  const active = need.length > 0 && need.every((m) => modDown[m]);
  if (active === comboActive) return;
  comboActive = active;
  const h = onCombo;
  if (!h) return;
  setImmediate(() => {
    if (!onCombo) return; // disarmed between the edge and the callback
    if (active) onCombo.down();
    else onCombo.up();
  });
}

function hookProc(code, wParam, lParam) {
  if (code < 0) return api.CallNextHookEx(null, code, wParam, lParam);
  try {
    const rec = koffi.decode(lParam, api.KBDLLHOOKSTRUCT);
    const mod = VK_MOD[rec.vkCode]; // undefined for every ordinary key — the common case, and it exits here
    // Ignore injected modifier events — that's AltGr's fake left-Ctrl (see LLKHF_INJECTED above). Real
    // holds are physical, so they pass; AltGr's synthetic Ctrl never sets control, no false trigger.
    if (mod && !(rec.flags & LLKHF_INJECTED)) {
      const msg = Number(wParam);
      if (msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN) {
        modDown[mod] = true;
        refreshCombo();
      } else if (msg === WM_KEYUP || msg === WM_SYSKEYUP) {
        modDown[mod] = false;
        refreshCombo();
      }
    }
  } catch (err) {
    console.error('winkeyhook: hook proc error (passing the event through):', err.message);
  }
  // ALWAYS pass through — see the header. Never return 1 from here.
  return api.CallNextHookEx(null, code, wParam, lParam);
}

// Install and start reporting press/release of `mods` (a 'control,alternate'-style list, the same
// spelling holdModsFor() produces) to h. Returns false if it can't be installed — or if the caller
// asked for no modifiers at all, which would otherwise arm a combo that is always satisfied and fire
// a snip on the first key of the game. Re-arming with a different set is just another call.
function startComboHook(h, mods) {
  const want = String(mods || '').split(',').map((m) => m.trim()).filter((m) => m in modDown);
  if (!want.length) return false;
  if (!ensureLoaded()) return false;
  onCombo = h;
  need = want;
  for (const k in modDown) modDown[k] = false;
  comboActive = false;
  if (hookHandle) return true; // already installed (re-arm)
  try {
    if (!callbackPtr) callbackPtr = koffi.register(hookProc, koffi.pointer(api.KBHOOKPROC));
    hookHandle = api.SetWindowsHookExW(WH_KEYBOARD_LL, callbackPtr, null, 0);
  } catch (err) {
    console.error('winkeyhook: SetWindowsHookEx threw:', err.message);
    hookHandle = null;
  }
  if (!hookHandle) {
    onCombo = null;
    return false;
  }
  return true;
}

function stopComboHook() {
  onCombo = null;
  need = [];
  for (const k in modDown) modDown[k] = false;
  comboActive = false;
  if (!hookHandle) return;
  try { api.UnhookWindowsHookEx(hookHandle); } catch { /* non-fatal */ }
  hookHandle = null;
}

function shutdownComboHook() {
  stopComboHook();
  if (callbackPtr) {
    try { koffi.unregister(callbackPtr); } catch { /* non-fatal */ }
    callbackPtr = null;
  }
}

function isAvailable() {
  return process.platform === 'win32' && ensureLoaded();
}

module.exports = { isAvailable, startComboHook, stopComboHook, shutdownComboHook };
