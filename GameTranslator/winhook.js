// ---------- Windows snip-only mouse hook (Windows only) ----------
// The macOS snip drag works over LIVE video because macOS composites the (mouse-capturing) overlay
// fine. Windows DWM does not — a mouse-capturing overlay freezes the video. So on Windows the snip
// overlay stays CLICK-THROUGH (never freezes the video, like the pill) and this uiohook-based hook
// supplies the left-button drag instead — exactly the role native/mousehook.swift plays on macOS.
//
// The hook is STARTED ONCE (on the first snip) and then left running for the rest of the session;
// arming/disarming only flips whether events are forwarded. Measured 2026-07-19: uIOhook.stop() blocks
// the Electron main thread for 300ms–5.6s (it joins libuiohook's thread), and stopping it after every
// snip was the "mouse warps and stutters after releasing the drag" bug. When disarmed the callbacks
// return on the first line, so an idle hook costs nothing. Only app quit really stops it.
//
// It feeds the SAME platform-agnostic engine as the mac mousehook: down(x,y)/move(x,y)/up(x,y) in DIP
// screen coords (uiohook reports physical px — screen.screenToDipPoint converts, matters at 125/150%).

const { screen } = require('electron');
const ll = require('./winhook-ll');

// Which engine armed the current snip: the koffi WH_MOUSE_LL hook (can swallow the drag so it never
// reaches the app underneath) or the uiohook fallback (listen-only — the drag leaks through).
let usingLL = false;

const LEFT_BUTTON = 1;         // libuiohook: 1=left, 2=right, 3=middle
const MOVE_THROTTLE_MS = 16;   // ~60fps

let uIOhook = null;
let running = false;
let dragging = false;
let handlers = null;
let lastMoveMs = 0;

function toDip(x, y) {
  try {
    const p = screen.screenToDipPoint({ x, y });
    return { x: Math.round(p.x), y: Math.round(p.y) };
  } catch {
    return { x, y };
  }
}

function onDown(e) {
  if (e.button !== LEFT_BUTTON || dragging || !handlers) return;
  dragging = true;
  const d = toDip(e.x, e.y);
  handlers.down(d.x, d.y);
}
function onMove(e) {
  if (!dragging || !handlers) return;
  const now = Date.now();
  if (now - lastMoveMs < MOVE_THROTTLE_MS) return;
  lastMoveMs = now;
  const d = toDip(e.x, e.y);
  handlers.move(d.x, d.y);
}
function onUp(e) {
  if (e.button !== LEFT_BUTTON || !dragging || !handlers) return;
  dragging = false;
  const d = toDip(e.x, e.y);
  handlers.up(d.x, d.y);
}

// Arm the hook for one snip. Returns false if uiohook can't load/start (caller falls back).
// The underlying hook is started once and stays up; this only starts forwarding events again.
function startSnipHook(h) {
  if (process.platform !== 'win32') return false;
  // Preferred: our own low-level hook, which swallows the left button, the right button and the wheel
  // so neither the drag nor a stray click reaches the window underneath. Installed per snip (install/uninstall are instant) — nothing is hooked while
  // the user is just playing. Falls through to uiohook if it can't be installed.
  if (ll.startLLHook(h)) { usingLL = true; return true; }
  usingLL = false;
  if (running) { handlers = h; dragging = false; return true; } // already up — just re-arm
  try {
    ({ uIOhook } = require('uiohook-napi'));
  } catch (err) {
    console.error('winhook: uiohook-napi failed to load — snip drag disabled:', err.message);
    return false;
  }
  handlers = h;
  dragging = false;
  uIOhook.on('mousedown', onDown);
  uIOhook.on('mousemove', onMove);
  uIOhook.on('mouseup', onUp);
  try {
    uIOhook.start();
    running = true;
    return true;
  } catch (err) {
    console.error('winhook: uIOhook.start() failed:', err.message);
    handlers = null;
    return false;
  }
}

// Disarm: just stop forwarding events. Deliberately does NOT call uIOhook.stop() — measured on
// 2026-07-19, that blocks the main thread 300ms–5.6s (it joins libuiohook's thread), which is exactly
// what made the cursor stutter/warp after every snip release.
function stopSnipHook() {
  if (usingLL) { usingLL = false; ll.stopLLHook(); return; } // instant — no reason to leave it installed
  handlers = null;
  dragging = false;
}

// Real teardown — only on app quit, where a blocking join hurts nobody (and a live hook can keep the
// process from exiting).
function shutdownSnipHook() {
  ll.shutdownLLHook();
  usingLL = false;
  if (!running || !uIOhook) return;
  handlers = null;
  dragging = false;
  running = false;
  try {
    uIOhook.removeListener('mousedown', onDown);
    uIOhook.removeListener('mousemove', onMove);
    uIOhook.removeListener('mouseup', onUp);
    uIOhook.stop();
  } catch { /* non-fatal */ }
}

module.exports = { startSnipHook, stopSnipHook, shutdownSnipHook, startShield: ll.startShield, stopShield: ll.stopShield, foregroundWindow: ll.foregroundWindow, foregroundPid: ll.foregroundPid, foregroundRect: ll.foregroundRect, restoreForeground: ll.restoreForeground, forceForeground: ll.forceForeground };
