// PROBE — can a low-level keyboard hook actually STOP a key from reaching a foreground game?
//
// This is the one question that decides whether Gloss can ever let you type while the game keeps the
// foreground. The mouse answer is already known and it is NO: a foreground game reads the mouse
// through Raw Input, which is delivered per-device and cannot be filtered by any hook (measured on
// Restory.exe, 2026-08-29 — see holdForeground in main.js). Keyboard is a DIFFERENT mechanism and is
// widely believed to be suppressible (it is how AutoHotkey remaps keys inside games), but "widely
// believed" is not measured, and winkeyhook.js has never swallowed anything on purpose.
//
// So: install WH_KEYBOARD_LL, return 1 for every physical key, and see whether the game still moves.
//
// HOW TO RUN
//   1. Start the game and leave it in the foreground (the game must be the ACTIVE window — that is
//      the whole point; a background game proves nothing).
//   2. From another machine/window, or with a delay, run:
//        npx electron scripts/probe-keyswallow.js
//      It runs for SWALLOW_MS and then removes the hook and exits by itself.
//   3. While it runs, press W A S D in the game.
//   4. Read %TEMP%\gloss-keyswallow.log.
//
// READING THE RESULT
//   Keys appear in the log  +  the character does NOT move  → suppression works. Typing into Gloss
//                                                              without taking the foreground is possible.
//   Keys appear in the log  +  the character DOES move      → the game reads keys past the hook
//                                                              (Raw Input / anti-cheat). This door is shut.
//   Nothing in the log at all                                → the hook never installed; see the log's
//                                                              first lines for why.
//
// WHY ELECTRON AND NOT PLAIN NODE: a WH_KEYBOARD_LL callback is delivered to the thread that installed
// it, and only while that thread pumps a Windows message loop. Plain `node` has no message loop, so
// the hook installs and never fires — a silent false negative, which is the worst result a probe can
// produce. Electron's main process pumps one.
//
// WHY A FILE AND NOT STDOUT: whoever launches the app owns the console, and a probe run beside a
// running Gloss can end up writing where nobody is looking (the lesson from the video-black hunt,
// 2026-08-12). The log is the result; the console is a convenience.

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Hard stop. Every key on the machine is being eaten while this runs, so the timer is the way out and
// it is not optional. GLOSS_SWALLOW_MS shortens it for a smoke test ("does the hook install at all"),
// which is worth having separately: a probe that silently never fires reads exactly like a negative.
const SWALLOW_MS = Number(process.env.GLOSS_SWALLOW_MS) || 15000;
const LOG = path.join(os.tmpdir(), 'gloss-keyswallow.log');

const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const WM_SYSKEYDOWN = 0x0104;
const WM_SYSKEYUP = 0x0105;
const LLKHF_INJECTED = 0x10;
const VK_ESCAPE = 0x1b;

// Never swallowed, so the machine is never unusable: Escape ends the probe early, and the modifiers
// stay live so Alt+Tab and Ctrl+Alt+Del behave. Swallowing a modifier is also not what is being
// tested — the question is about ordinary keys.
const PASS_THROUGH = new Set([
  VK_ESCAPE,
  0x11, 0xa2, 0xa3, // Ctrl
  0x12, 0xa4, 0xa5, // Alt
  0x10, 0xa0, 0xa1, // Shift
  0x5b, 0x5c,       // Win
]);

const started = Date.now();
function log(line) {
  const stamp = String(Date.now() - started).padStart(6, ' ');
  const text = `[${stamp}ms] ${line}\n`;
  try { fs.appendFileSync(LOG, text); } catch { /* the console line below is the fallback */ }
  process.stdout.write(text);
}

let koffi = null, api = null, hookHandle = null, callbackPtr = null;
let swallowed = 0, passed = 0;

function hookProc(code, wParam, lParam) {
  if (code < 0) return api.CallNextHookEx(null, code, wParam, lParam);
  try {
    const rec = koffi.decode(lParam, api.KBDLLHOOKSTRUCT);
    const msg = Number(wParam);
    const isKey = msg === WM_KEYDOWN || msg === WM_KEYUP || msg === WM_SYSKEYDOWN || msg === WM_SYSKEYUP;
    const injected = !!(rec.flags & LLKHF_INJECTED);
    // Injected events are something else's synthetic input (AltGr's fake Ctrl, a macro, our own
    // sendInputEvent). Swallowing them would measure the wrong thing.
    if (isKey && !injected && !PASS_THROUGH.has(rec.vkCode)) {
      if (msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN) {
        swallowed++;
        log(`SWALLOW vk=0x${rec.vkCode.toString(16)} (${vkName(rec.vkCode)})  — did the game react?`);
      }
      return 1; // <- the whole experiment: tell Windows this key never happened
    }
    if (isKey && rec.vkCode === VK_ESCAPE && (msg === WM_KEYDOWN || msg === WM_SYSKEYDOWN)) {
      log('ESC pressed — ending early');
      setImmediate(finish);
    }
    if (isKey && !injected) passed++;
  } catch (err) {
    log('hook proc error (passing the key through): ' + err.message);
  }
  return api.CallNextHookEx(null, code, wParam, lParam);
}

function vkName(vk) {
  if (vk >= 0x30 && vk <= 0x5a) return String.fromCharCode(vk);
  const named = { 0x20: 'Space', 0x0d: 'Enter', 0x08: 'Backspace', 0x09: 'Tab',
    0x25: 'Left', 0x26: 'Up', 0x27: 'Right', 0x28: 'Down' };
  return named[vk] || '?';
}

function install() {
  koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const KBDLLHOOKSTRUCT = koffi.struct('KBDLLHOOKSTRUCT', {
    vkCode: 'uint32', scanCode: 'uint32', flags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr_t',
  });
  const KBHOOKPROC = koffi.proto('intptr_t KBHOOKPROC(int code, uintptr_t wParam, void *lParam)');
  api = {
    KBDLLHOOKSTRUCT, KBHOOKPROC,
    SetWindowsHookExW: user32.func('void* SetWindowsHookExW(int, KBHOOKPROC*, void*, uint32)'),
    UnhookWindowsHookEx: user32.func('int UnhookWindowsHookEx(void*)'),
    CallNextHookEx: user32.func('intptr_t CallNextHookEx(void*, int, uintptr_t, void*)'),
  };
  callbackPtr = koffi.register(hookProc, koffi.pointer(KBHOOKPROC));
  hookHandle = api.SetWindowsHookExW(WH_KEYBOARD_LL, callbackPtr, null, 0);
  return !!hookHandle;
}

let finished = false;
function finish() {
  if (finished) return;
  finished = true;
  try { if (hookHandle) api.UnhookWindowsHookEx(hookHandle); } catch { /* non-fatal */ }
  hookHandle = null;
  try { if (callbackPtr) koffi.unregister(callbackPtr); } catch { /* non-fatal */ }
  callbackPtr = null;
  log(`DONE. swallowed=${swallowed} passed-through=${passed}`);
  log('If those SWALLOW lines are there and the character never moved, suppression works.');
  log('If the character moved anyway, the game reads keys past the hook and this door is shut.');
  app.quit();
}

app.on('window-all-closed', () => { /* there is no window; do not quit here */ });

app.whenReady().then(() => {
  try { fs.writeFileSync(LOG, ''); } catch { /* first append will make it */ }
  log('probe-keyswallow starting');
  if (process.platform !== 'win32') { log('not Windows — nothing to measure'); return finish(); }
  let ok = false;
  try { ok = install(); } catch (err) { log('install threw: ' + err.message); }
  if (!ok) { log('SetWindowsHookExW failed — no hook, no measurement'); return finish(); }
  log(`hook installed. Swallowing every physical key for ${SWALLOW_MS / 1000}s (Esc ends it early).`);
  log('>>> Go to the game NOW and press W A S D. <<<');
  setTimeout(finish, SWALLOW_MS);
});
