// Gloss — full-function audit over CDP.
//
// Runs against the INSTALLED app (~/Applications/Gloss.app) launched with both debug ports, and
// exercises each user-facing function the way a person would, then reports pass/fail per function.
// Written for the post-merge check: after main and lean are combined, one command has to be able to
// say which functions still work rather than "it built".
//
//   node audit.js <pageWs> <mainWs>
//
// Every check states what it OBSERVED, not what it assumed. A check that cannot run (no AI
// configured, no second display) reports SKIP with the reason — a skip is not a pass.

const [pageUrl, mainUrl] = process.argv.slice(2);
const results = [];

// Four checks used to FAIL on Windows for the same reason: they were written against macOS and there
// was nothing telling them so. A failure means "this app is broken"; "swiftc: ENOENT" means the
// harness is on the wrong OS. Conflating the two is worse than not running at all, because the
// platform that most needs testing is the one nobody has tested (see NEXT.md item 3), and a red
// suite is exactly what makes someone stop reading. Per this file's own rule — a check that cannot
// run reports SKIP with the reason, and a skip is not a pass.
const IS_WIN = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';

// The one thing with no cross-platform API. macOS compiles the little Swift helper next door;
// Windows moves the Forms cursor, which takes the same screen coordinates.
function moveCursor(x, y) {
  const { execFileSync } = require('child_process');
  if (IS_WIN) {
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`],
      { timeout: 8000 });
    return;
  }
  const bin = '/tmp/gloss-parkcursor';
  if (!require('fs').existsSync(bin)) execFileSync('swiftc', ['-O', `${__dirname}/parkcursor.swift`, '-o', bin]);
  execFileSync(bin, [String(x), String(y)]);
}

function ev(url, expression, ms = 20000) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
      params: { expression, awaitPromise: true, includeCommandLineAPI: true, returnByValue: true } }));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id !== 1) return;
      ws.close();
      const r = d.result?.result;
      if (d.result?.exceptionDetails) return rej(new Error(JSON.stringify(d.result.exceptionDetails.exception?.description || d.result.exceptionDetails)));
      res(r?.value ?? r?.description ?? null);
    };
    ws.onerror = (e) => rej(new Error(e.message));
    setTimeout(() => rej(new Error('timeout')), ms);
  });
}
const page = (e, ms) => ev(pageUrl, e, ms);
const main = (e, ms) => ev(mainUrl, e, ms);

// Each check starts from the same place. Without this the harness measured leftovers: a card left
// open by one check blocks the next one's auto-hide (by design), focus left in a text field makes
// Escape a no-op (by design), and a cursor left on a surface keeps the pill awake (by design). All
// three are correct product behaviour and all three made the audit report a failure that was really
// the previous check still standing there.
let resetCursor = 40;
async function reset() {
  resetCursor += 17; // a spot no other check has used — an identical coordinate reads as "not moved"
  await page(`(async () => {
    const close = document.getElementById('rClose');
    if (close && !document.getElementById('result').hidden) { close.click(); await new Promise(r => setTimeout(r, 500)); }
    if (!document.getElementById('panel').hidden) { document.getElementById('logBtn').click(); await new Promise(r => setTimeout(r, 500)); }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (window.__away) window.__away(); else document.dispatchEvent(new MouseEvent('mousemove', { clientX: ${resetCursor}, clientY: ${resetCursor + 3}, bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    return 1;
  })()`).catch(() => {});
}

async function check(name, fn) {
  try {
    await reset();
    const r = await fn();
    if (r && r.skip) results.push({ name, status: 'SKIP', detail: r.skip });
    else if (r && r.ok === false) results.push({ name, status: 'FAIL', detail: r.detail });
    else results.push({ name, status: 'PASS', detail: (r && r.detail) || '' });
  } catch (err) {
    results.push({ name, status: 'ERROR', detail: String(err.message).slice(0, 90) });
  }
}

const J = (o) => `JSON.stringify(${o})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ---- control the one variable the checks cannot see: where the real mouse is ------------------
  // Half of these checks ask "does this get out of the way when nobody is there". The app answers
  // that from the FED cursor — the real pointer, fed in by main even while we are inactive — so a
  // mouse left resting on the pill makes "it never hid" the correct answer, and the suite went red
  // on a different check every run depending on where the pointer happened to be. So: park it in
  // the display corner furthest from the pill first, put it back at the end.
  let parkedFrom = null;
  try {
    // Reading and writing the pointer is the one thing here that has no cross-platform API, so it is
    // the only platform branch: macOS compiles parkcursor.swift, Windows uses the Forms cursor. The
    // READ goes through main's own screen.getCursorScreenPoint() on both, which is DIP on both and
    // therefore matches the window coordinates the corners below are computed in.
    parkedFrom = await main(`(() => { const p = require('electron').screen.getCursorScreenPoint(); return p.x + ' ' + p.y; })()`);
    const win = JSON.parse(await main(`(() => { const { BrowserWindow } = require('electron');
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() === 'Gloss');
      return JSON.stringify(w.getBounds()); })()`));
    const pill = JSON.parse(await page(`JSON.stringify(document.querySelector('.pill').getBoundingClientRect())`));
    const cx = win.x + pill.left + pill.width / 2;
    const cy = win.y + pill.top + pill.height / 2;
    const corners = [[win.x + 6, win.y + 6], [win.x + win.width - 6, win.y + 6],
                     [win.x + 6, win.y + win.height - 6], [win.x + win.width - 6, win.y + win.height - 6]];
    const far = corners.sort((a, b) => Math.hypot(b[0] - cx, b[1] - cy) - Math.hypot(a[0] - cx, a[1] - cy))[0];
    moveCursor(Math.round(far[0]), Math.round(far[1]));
    await sleep(600);
  } catch (err) {
    results.push({ name: 'real cursor parked away from the pill', status: 'FAIL',
      detail: `could not move the pointer (${String(err.message).slice(0, 60)}) — results below are only as good as where the mouse was left` });
  }

  // A place to put the cursor that is guaranteed to be OFF every surface. The checks used to move it
  // to a hardcoded corner (7,9 / 21,33), which silently assumed the pill was never docked there — and
  // when it was, "the panel did not auto-hide" was the correct answer to a question the check thought
  // it was asking differently. Recomputed per call from what is actually on screen, and never twice at
  // the same spot (an identical coordinate reads as "the cursor has not moved", by design).
  await page(`(() => { let n = 0; window.__away = () => {
    const rs = [...document.querySelectorAll('.pill, .panel, .result, .caption-box, .mascot, .coach')]
      .filter((e) => !e.hidden).map((e) => e.getBoundingClientRect()).filter((b) => b.width && b.height);
    const W = innerWidth, H = innerHeight;
    const cands = [[10, 10], [W - 10, 10], [10, H - 10], [W - 10, H - 10], [W / 2, H - 10], [W / 2, 10], [10, H / 2], [W - 10, H / 2]];
    const dist = (p) => Math.min(...rs.map((b) => Math.hypot(Math.max(b.left - p[0], 0, p[0] - b.right),
                                                              Math.max(b.top - p[1], 0, p[1] - b.bottom))), 1e9);
    const best = cands.sort((a, b) => dist(b) - dist(a))[0];
    const p = [Math.round(best[0]) + (n % 5), Math.round(best[1]) + (n % 3)]; n += 1;
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: p[0], clientY: p[1], bubbles: true }));
    return p;
  }; return 1; })()`);

  // ---- process-level: the helpers that were sealed in the asar for a month --------------------
  await check('native input hook is available', async () => {
    // Same question on both platforms — "can this build actually receive the hold gesture" — but the
    // thing that answers it is different. macOS spawns the mousehook process; Windows installs
    // WH_KEYBOARD_LL / WH_MOUSE_LL through koffi in-process, so there is nothing in the process list
    // to grep for and the honest test is whether the modules report themselves available.
    if (IS_WIN) {
      const r = await main(`(() => { const p = require('path');
        const root = require('electron').app.getAppPath().replace('app.asar','app.asar.unpacked');
        try {
          const kh = require(p.join(root, 'winkeyhook.js'));
          const ll = require(p.join(root, 'winhook-ll.js'));
          return JSON.stringify({ key: !!kh.isAvailable(), mouse: !!ll.isAvailable() });
        } catch (e) { return JSON.stringify({ err: String(e.message).slice(0, 80) }); }
      })()`);
      const v = JSON.parse(r);
      if (v.err) return { ok: false, detail: 'hook modules failed to load: ' + v.err };
      return (v.key && v.mouse) ? { detail: 'WH_KEYBOARD_LL + WH_MOUSE_LL both available' }
                                : { ok: false, detail: `key=${v.key} mouse=${v.mouse}` };
    }
    const out = await main(`require('child_process').execSync('ps -o args= -ax | grep "[m]ousehook" || echo NONE').toString().trim()`);
    const mine = String(out).split('\n').filter((l) => l.includes('Gloss.app'));
    return mine.length ? { detail: mine[0].replace(/.*Resources\//, '') }
                       : { ok: false, detail: 'no mousehook from the installed app' };
  });
  await check('native OCR engine answers', async () => {
    // Windows has no visionocr binary and never will — its engine is Windows.Media.Ocr, reached
    // through winocr.ps1. Checking for the Swift binary there reported the app broken for shipping
    // exactly what it is supposed to ship. Ask each platform for its own engine.
    if (IS_WIN) {
      const r = await main(`(() => { const p = require('path'), fs = require('fs');
        const root = require('electron').app.getAppPath().replace('app.asar','app.asar.unpacked');
        const ps1 = p.join(root, 'native', 'winocr.ps1');
        if (!fs.existsSync(ps1)) return ${J('{ok:false, detail:"winocr.ps1 missing from the build"}')};
        try {
          const out = require('child_process').execFileSync('powershell.exe',
            ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File', ps1],
            { input: '', timeout: 15000, encoding: 'utf8', windowsHide: true });
          const first = String(out).split('\\n').find((l) => l.trim());
          const j = JSON.parse(first);
          return JSON.stringify(j.ready
            ? { detail: 'Windows.Media.Ocr ready, packs: ' + (j.langs || []).join(', ') }
            : { ok: false, detail: 'no ready line: ' + first.slice(0, 60) });
        } catch (e) { return JSON.stringify({ ok: false, detail: 'winocr.ps1 failed: ' + String(e.message).slice(0, 60) }); }
      })()`, 25000);
      return JSON.parse(r);
    }
    const r = await main(`(() => { const p = require('path'), fs = require('fs');
      const bin = p.join(require('electron').app.getAppPath().replace('app.asar','app.asar.unpacked'), 'native', 'visionocr');
      if (!fs.existsSync(bin)) return ${J('{ok:false, detail:"missing"}')};
      try { require('child_process').execFileSync(bin, ['--help'], { timeout: 4000 }); } catch (e) {
        if (e.code === 'ENOTDIR' || e.code === 'ENOENT') return ${J('{ok:false, detail:"not executable: "+e.code}')};
      }
      return ${J('{detail:"runs"}')}; })()`);
    return JSON.parse(r);
  });

  // ---- permissions ---------------------------------------------------------------------------
  await check('screen recording granted', async () => {
    // Windows grants nothing to ask for on this path: capture is GDI BitBlt (wincapture.js), which
    // needs no consent, and getMediaAccessStatus('screen') is meaningless there. See SETTINGS_PANE in
    // main.js for why there is no 'screen' pane on win32 either.
    if (!IS_MAC) return { skip: 'macOS-only permission — Windows captures via BitBlt, nothing to grant' };
    const s = await main(`String(require('electron').systemPreferences.getMediaAccessStatus('screen'))`);
    return s === 'granted' ? { detail: s } : { ok: false, detail: s };
  });
  await check('accessibility granted (hold gesture)', async () => {
    // isTrustedAccessibilityClient does not exist off macOS — calling it threw and the suite reported
    // a crash where the honest answer is "this permission has no Windows equivalent". The hold gesture
    // is delivered by the low-level hook there, which the input-hook check above already covers.
    if (!IS_MAC) return { skip: 'macOS-only permission — the hold gesture arrives via WH_KEYBOARD_LL on Windows' };
    const s = await main(`String(require('electron').systemPreferences.isTrustedAccessibilityClient(false))`);
    return s === 'true' ? { detail: 'trusted' } : { skip: 'not trusted — hold trigger cannot arm' };
  });

  // ---- shortcuts ------------------------------------------------------------------------------
  await check('every shortcut registers with the OS', async () => {
    const r = await main(`(async () => {
      const { ipcMain, globalShortcut } = require('electron');
      const list = await ipcMain._invokeHandlers.get('shortcuts:get')();
      // modeOnly keys (hoverSave) are registered only while their mode runs — unbound at rest is the
      // designed state, not a failure. hold keys have no accelerator to register at all.
      const bad = list.filter(x => !x.hold && !x.modeOnly && !globalShortcut.isRegistered(x.accel));
      return JSON.stringify({ total: list.length, unbound: bad.map(b => b.id + ':' + b.accel) });
    })()`);
    const { total, unbound } = JSON.parse(r);
    return unbound.length ? { ok: false, detail: `unbound → ${unbound.join(', ')}` }
                          : { detail: `${total} actions, all bound or hold-style` };
  });

  // ---- translation: the free path -------------------------------------------------------------
  await check('translate uses the free path by default', async () => {
    await page(`(() => { window.__seen = null; window.api.onTranslation(p => { window.__seen = p; }); return 1; })()`);
    await main(`require('electron').ipcMain._invokeHandlers.get('translate:text')(null, 'cat')`, 30000);
    await sleep(2500);
    const r = await page(`JSON.stringify({ th: (window.__seen||{}).th || null,
      ai: !!((window.__seen||{}).pronunciation || (window.__seen||{}).meaning) })`);
    const { th, ai } = JSON.parse(r);
    if (!th) return { ok: false, detail: 'no translation came back' };
    return ai ? { ok: false, detail: `got AI fields by default (th=${th})` } : { detail: `"cat" → "${th}", no AI fields` };
  });
  await check('full-card button appears on a free card', async () => {
    const r = await page(`(() => { const b = document.getElementById('rAi');
      return JSON.stringify({ exists: !!b, shown: b ? !b.hidden : false }); })()`);
    const { exists, shown } = JSON.parse(r);
    if (!exists) return { ok: false, detail: 'no #rAi button in the DOM' };
    return shown ? { detail: 'visible' } : { ok: false, detail: 'hidden on a card with no AI fields' };
  });
  await check('full-card button reports failure instead of silence', async () => {
    const hasAi = JSON.parse(await main(`(async () => { const s = await require('electron').ipcMain._invokeHandlers.get('settings:get')();
      return JSON.stringify({ key: s.hasOwnKey, lic: s.hasLicence }); })()`));
    // "No key and no licence" stopped meaning "no AI" on 2026-09-07, when the Worker got its own
    // Anthropic key and the free trial (FREE_LIMIT, ten reads for the life of the install) started
    // answering for people who have bought nothing. This check kept the older world and began
    // failing a card that had upgraded exactly as designed. Ask what the trial actually has left
    // rather than inferring it from two settings flags.
    const trial = await main(`require('electron').ipcMain._invokeHandlers.get('licence:verify')(null, '').then(x => JSON.stringify(x)).catch(() => 'null')`, 30000);
    const q = JSON.parse(trial);
    const freeLeft = q && q.state === 'ok' && q.plan === 'free' && (q.limit - q.used) > 0;
    const r = await main(`require('electron').ipcMain._invokeHandlers.get('card:ai')(null, 'cat').then(x => JSON.stringify(x))`, 30000);
    const res = JSON.parse(r);
    if (!hasAi.key && !hasAi.lic && !freeLeft) {
      return res.ok === false ? { detail: `no AI configured → reported ${res.error}` }
                              : { ok: false, detail: 'claimed success with no AI available' };
    }
    const via = hasAi.key ? 'own key' : hasAi.lic ? 'licence' : `free trial, ${q.limit - q.used} left`;
    return res.ok ? { detail: `upgraded (${via})` } : { ok: false, detail: `upgrade failed: ${res.error}` };
  });

  // ---- tucking: every dock, not four corners ---------------------------------------------------
  // "Hidden but not hidden": the pill tucks and leaves a wide grey slab sitting on screen instead of
  // the 26px tab. Fixed twice (2026-09-08, twice in one day) and photographed again both times,
  // because each fix was verified at the four corners while dockAnchors() builds 9 rows x 5 columns.
  // This walks all 45. It is the check that should have existed the first time.
  await check('every dock tucks to a 26px tab, not a slab', async () => {
    const before = JSON.parse(await main(`(async () => { const s = await require('electron').ipcMain._invokeHandlers.get('settings:get')();
      return JSON.stringify({ style: s.pillStyle, dock: s.dock }); })()`));
    await page(`window.api.setSettings({ pillStyle: 'ghost' }).then(() => 'ok')`);
    // Wait for the tuck rather than guessing at it: the idle timer restarts on the settings echo, so
    // a fixed sleep here reported "untucked" for the first dock and blamed the dock.
    const measure = () => page(`(() => { const p = document.querySelector('.pill');
      const b = p.getBoundingClientRect();
      const visW = Math.max(0, Math.min(b.right, window.innerWidth) - Math.max(b.left, 0));
      const visH = Math.max(0, Math.min(b.bottom, window.innerHeight) - Math.max(b.top, 0));
      return JSON.stringify({ tucked: p.classList.contains('tucked'),
        visW: Math.round(visW), visH: Math.round(visH), h: Math.round(b.height) }); })()`);
    for (let i = 0; i < 20 && !JSON.parse(await measure()).tucked; i++) await sleep(700);
    const rows = ['t', '4', 'u', '3', 'm', '2', 'q', '1', 'b'];
    const cols = ['l', 'w', 'c', 'e', 'r'];
    const bad = [];
    for (const r of rows) for (const c of cols) {
      const key = r + c;
      await page(`window.api.setSettings({ dock: ${JSON.stringify(key)} }).then(() => 'ok')`);
      await sleep(700);
      // What matters is where it COMES TO REST. Docking animates, and a pill in the middle of that
      // glide is legitimately anywhere — including right off the screen. So a bad first read is
      // re-read once it has certainly landed, and only a value that is still wrong is a failure.
      let got = JSON.parse(await measure());
      const wrong = (g) => !g.tucked || Math.abs(g.visW - 26) > 2 || g.visH < g.h - 2;
      if (wrong(got)) { await sleep(900); got = JSON.parse(await measure()); }
      if (!got.tucked) { bad.push(`${key}:untucked`); continue; }
      if (Math.abs(got.visW - 26) > 2) bad.push(`${key}:${got.visW}px`);
      if (got.visH < got.h - 2) bad.push(`${key}:clipped-v`);
    }
    // And that a tab which goes stale AFTER the tuck repairs itself — the failure mode both earlier
    // fixes left open, since each only made the value right at the moment it was written.
    await page(`document.documentElement.style.setProperty('--tuck-x', '-20px')`);
    await sleep(1600);
    const healed = JSON.parse(await page(`(() => { const b = document.querySelector('.pill').getBoundingClientRect();
      return JSON.stringify({ visW: Math.round(Math.max(0, Math.min(b.right, window.innerWidth) - Math.max(b.left, 0))) }); })()`));
    if (Math.abs(healed.visW - 26) > 2) bad.push(`stale-offset-not-repaired:${healed.visW}px`);
    await page(`window.api.setSettings({ pillStyle: ${JSON.stringify(before.style || 'normal')}, dock: ${JSON.stringify(before.dock || 'bc')} }).then(() => 'ok')`);
    await sleep(1200);
    return bad.length ? { ok: false, detail: `${bad.length} wrong → ${bad.slice(0, 6).join(' ')}${bad.length > 6 ? ' …' : ''}` }
                      : { detail: '45 docks at 26px, and a stale offset repaired itself' };
  });

  // ---- card controls --------------------------------------------------------------------------
  await check('card controls present (close / star / speak)', async () => {
    const r = await page(`JSON.stringify(['rClose','rFav','rSpeak'].map(id => !!document.getElementById(id)))`);
    const got = JSON.parse(r);
    return got.every(Boolean) ? { detail: 'all three' } : { ok: false, detail: `missing → ${got}` };
  });

  // ---- panels ---------------------------------------------------------------------------------
  await check('panel opens and auto-hides', async () => {
    const r = await page(`(async () => {
      // Dismiss any card first. A visible card is a deliberate block on auto-hide (index.js:2522
      // — "a card that waits for you is just something on screen"), so leaving the previous test's
      // card up makes this check fail for a reason that has nothing to do with the panel.
      const close = document.getElementById('rClose');
      if (close && !document.getElementById('result').hidden) { close.click(); await new Promise(r=>setTimeout(r,700)); }
      if (!document.getElementById('panel').hidden) { document.getElementById('logBtn').click(); await new Promise(r=>setTimeout(r,600)); }
      document.getElementById('logBtn').click();
      await new Promise(r => setTimeout(r, 700));
      const opened = !document.getElementById('panel').hidden;
      window.__away(); // off every surface, and never the same pixel twice
      // History's delay grows with row count and caps at 15s (panelIdleMs), so 22s left only a few
      // seconds of slack and this check failed about one run in four on a busy machine. A flaky
      // audit is worse than none — it teaches you to ignore it. 30s is comfortably past the cap.
      let closedAt = null;
      for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 1000));
        if (document.getElementById('panel').hidden) { closedAt = i + 1; break; } }
      // A red check that only says "it didn't happen" sends someone hunting by hand. Every input the
      // countdown reads is captured here instead, so the failure names its own cause.
      let why = null;
      if (closedAt === null) {
        const ae = document.activeElement;
        why = { mode: panelMode, autoHide: autoHidePanel, cursor: [lastCursorX, lastCursorY],
          lastIdle: [lastIdleX, lastIdleY],
          onSurface: !!(lastCursorX != null && (document.elementFromPoint(lastCursorX, lastCursorY) || {}).closest
            && document.elementFromPoint(lastCursorX, lastCursorY).closest('.pill, .panel')),
          focused: ae && (ae.id || ae.tagName), focusedValue: ae && String(ae.value || '').slice(0, 12),
          cardUp: !document.getElementById('result').hidden, translating, holdMs: HOLD_MS };
      }
      return JSON.stringify({ opened, closedAt, why });
    })()`, 40000);
    const { opened, closedAt, why } = JSON.parse(r);
    if (!opened) return { ok: false, detail: 'panel did not open' };
    return closedAt ? { detail: `auto-hid after ${closedAt}s` }
                    : { ok: false, detail: `never auto-hid in 30s — ${JSON.stringify(why)}` };
  });

  // ---- tucked pill ----------------------------------------------------------------------------
  await check('Tucked mode hides the pill when idle', async () => {
    const r = await page(`(async () => {
      const sel = document.getElementById('pillStyleSel'), pill = document.querySelector('.pill');
      if (!sel) return JSON.stringify({ skip: 'no pill style control' });
      const before = sel.value;
      sel.value = 'visible'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 600));
      sel.value = 'ghost'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      if (!document.getElementById('panel').hidden) document.getElementById('settingsBtn').click();
      window.__away(); // off every surface, and never the same pixel twice
      let tuckedAt = null;
      for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 1000));
        if (pill.classList.contains('tucked')) { tuckedAt = i + 1; break; } }
      sel.value = before; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ tuckedAt });
    })()`, 40000);
    const { skip, tuckedAt } = JSON.parse(r);
    if (skip) return { skip };
    return tuckedAt ? { detail: `tucked after ${tuckedAt}s` } : { ok: false, detail: 'never tucked (>12s)' };
  });

  // Tucked + Faded is the same CLASS of thing as Tucked, so it gets the same gate rather than being
  // trusted because its sibling passes. What it must do that neither parent does: tuck AND stay
  // faded, and hand both back when you leave it — a tucked style that forgot to untuck leaves the
  // pill unfindable, which is the one failure this option can cause.
  await check('Tucked + Faded both tucks and fades, and undoes both on exit', async () => {
    const r = await page(`(async () => {
      const sel = document.getElementById('pillStyleSel'), pill = document.querySelector('.pill');
      if (!sel) return JSON.stringify({ skip: 'no pill style control' });
      if (![...sel.options].some(o => o.value === 'ghostdim')) return JSON.stringify({ skip: 'style not offered' });
      const before = sel.value;
      sel.value = 'visible'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 600));
      sel.value = 'ghostdim'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const faded = pill.classList.contains('style-dim');
      if (!document.getElementById('panel').hidden) document.getElementById('settingsBtn').click();
      window.__away();
      let tuckedAt = null;
      for (let i = 0; i < 12; i++) { await new Promise(r => setTimeout(r, 1000));
        if (pill.classList.contains('tucked')) { tuckedAt = i + 1; break; } }
      sel.value = 'visible'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 800));
      const left = { tucked: pill.classList.contains('tucked'), dim: pill.classList.contains('style-dim') };
      sel.value = before; sel.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ faded, tuckedAt, left });
    })()`, 40000);
    const { skip, faded, tuckedAt, left } = JSON.parse(r);
    if (skip) return { skip };
    if (!faded) return { ok: false, detail: 'never faded — style-dim was not applied' };
    if (!tuckedAt) return { ok: false, detail: 'never tucked (>12s)' };
    if (left.tucked || left.dim) return { ok: false, detail: `left behind on exit: ${JSON.stringify(left)}` };
    return { detail: `faded at once, tucked after ${tuckedAt}s, both released on exit` };
  });

  // ---- glass ----------------------------------------------------------------------------------
  await check('glass samples the screen', async () => {
    const r = await page(`(() => JSON.stringify({ on: document.documentElement.classList.contains('glass-on'),
      img: !!getComputedStyle(document.documentElement).getPropertyValue('--glass-img').trim() }))()`);
    const { on, img } = JSON.parse(r);
    return on && img ? { detail: 'glass-on with a sampled patch' }
                     : { ok: false, detail: `glass-on=${on} img=${img} (screen recording?)` };
  });

  // ---- settings round-trip --------------------------------------------------------------------
  await check('settings persist a round trip', async () => {
    const r = await main(`(async () => {
      const { ipcMain } = require('electron');
      const before = (await ipcMain._invokeHandlers.get('settings:get')()).aiCards;
      await ipcMain._invokeHandlers.get('settings:set')(null, { aiCards: !before });
      const mid = (await ipcMain._invokeHandlers.get('settings:get')()).aiCards;
      await ipcMain._invokeHandlers.get('settings:set')(null, { aiCards: before });
      const after = (await ipcMain._invokeHandlers.get('settings:get')()).aiCards;
      return JSON.stringify({ before, mid, after });
    })()`);
    const { before, mid, after } = JSON.parse(r);
    return (mid === !before && after === before) ? { detail: 'write + restore ok' }
                                                 : { ok: false, detail: `before=${before} mid=${mid} after=${after}` };
  });

  // ---- history / vocab ------------------------------------------------------------------------
  await check('history records translations', async () => {
    // Read the file main actually writes rather than an IPC getter — there isn't one, and the file
    // is the thing that has to survive a restart anyway.
    const r = await main(`(() => { const p = require('path'), fs = require('fs');
      const f = p.join(require('electron').app.getPath('userData'), 'history.json');
      try { const rows = JSON.parse(fs.readFileSync(f, 'utf8'));
        return JSON.stringify({ n: rows.length, newest: rows[0] && rows[0].en }); }
      catch (e) { return JSON.stringify({ err: e.code || e.message }); } })()`);
    const { n, newest, err } = JSON.parse(r);
    if (err) return { ok: false, detail: `history.json unreadable: ${err}` };
    return n > 0 ? { detail: `${n} rows, newest "${newest}"` } : { ok: false, detail: 'empty after translating' };
  });

  // ---- rendering ------------------------------------------------------------------------------
  await check('no content is clipped without a way to scroll', async () => {
    const r = await page(`(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.panel *, .pill *, #result *')) {
        const b = el.getBoundingClientRect(); if (!b.width || !b.height) continue;
        const cs = getComputedStyle(el);
        if (/auto|scroll/.test(cs.overflowY + cs.overflowX)) continue;
        if (!/hidden|clip/.test(cs.overflow + cs.overflowY + cs.overflowX)) continue;
        if (cs.textOverflow === 'ellipsis') continue;
        if (el.scrollHeight - el.clientHeight > 1) bad.push((el.id || el.className) + ' +' + (el.scrollHeight - el.clientHeight) + 'px');
      }
      return JSON.stringify(bad.slice(0, 5));
    })()`);
    const bad = JSON.parse(r);
    return bad.length ? { ok: false, detail: bad.join(' · ') } : { detail: 'nothing clipped' };
  });

  // ---- animation smoothness --------------------------------------------------------------------
  await check('panel animation holds 60fps', async () => {
    const r = await page(`(async () => {
      const marks = []; let last = 0, stop = false;
      const tick = (t) => { if (last) marks.push(t - last); last = t; if (!stop) requestAnimationFrame(tick); };
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
      for (let i = 0; i < 3; i++) {
        document.getElementById('logBtn').click(); await new Promise(r => setTimeout(r, 700));
        document.getElementById('logBtn').click(); await new Promise(r => setTimeout(r, 700));
      }
      stop = true;
      const worst = Math.round(Math.max(...marks));
      return JSON.stringify({ worst, dropped: marks.filter(d => d > 20).length, frames: marks.length });
    })()`, 30000);
    const { worst, dropped, frames } = JSON.parse(r);
    // Zero dropped frames was too strict to mean anything: on a machine that is also building and
    // running this audit, one skipped vsync (33ms = exactly one missed frame at 60Hz) showed up in
    // roughly one run in four, and a check that cries wolf is a check people stop reading. What this
    // is really guarding against is the stutter that made the panel feel broken — many dropped frames
    // or a long stall — so that is what it fails on. (2026-08-06)
    const bad = dropped > 2 || worst > 50;
    return bad ? { ok: false, detail: `${dropped} frames over 20ms, worst ${worst}ms` }
               : { detail: `${frames} frames, worst ${worst}ms${dropped ? ` (${dropped} dropped — tolerated)` : ''}` };
  });

  // ---- CONSISTENCY: surfaces of the same kind must behave the same way ------------------------
  // Added at jek's instruction, 2026-08-06. Checking each function alone is what let two bugs of the
  // same shape ship on the same day: the pill tucked out from under a resting cursor, and the card
  // closed under one too — because "hovering" was wired to the pill through the fed cursor and to the
  // card through a DOM event that never fires while the app is inactive. Both passed a per-function
  // audit. Neither passed this one.
  //
  // The rule: anything that hides itself on a timer must be held open by a cursor resting on it. A
  // surface may opt out only by naming itself here WITH a reason — an undocumented exception is a bug.
  const VANISH_EXCEPTIONS = {
    // 'caption-box': 'live captions replace themselves; a held caption would freeze the subtitle',
  };
  const SURFACES = [
    // `open` runs BEFORE the hover, in main, for surfaces a click cannot summon. A card only exists
    // after a translation, and skipping the check because the harness could not produce one would
    // hide the exact bug this section was written for.
    { key: 'card',  el: '#result', main: `require('electron').ipcMain._invokeHandlers.get('translate:text')(null, 'window')`, click: null },
    { key: 'panel', el: '#panel',  main: null, click: `document.getElementById('logBtn')` },
  ];
  for (const surf of SURFACES) {
    await check(`hover holds "${surf.key}" open (same rule as the pill)`, async () => {
      if (VANISH_EXCEPTIONS[surf.key]) return { skip: `documented exception: ${VANISH_EXCEPTIONS[surf.key]}` };
      if (surf.main) { await main(surf.main, 30000); await sleep(2500); }
      const r = await page(`(async () => {
        const el = document.querySelector('${surf.el}');
        if (!el) return JSON.stringify({ missing: true });
        const opener = ${surf.click || 'null'};
        if (el.hidden && opener) { opener.click(); await new Promise(r => setTimeout(r, 900)); }
        if (el.hidden) return JSON.stringify({ couldNotOpen: true });
        const b = el.getBoundingClientRect();
        const cx = Math.round(b.left + b.width / 2), cy = Math.round(b.top + 10);
        // Park the cursor on it, through the fed-cursor path the app really uses.
        for (let i = 0; i < 130; i++) {
          document.dispatchEvent(new MouseEvent('mousemove', { clientX: cx + (i % 2), clientY: cy, bubbles: true }));
          await new Promise(r => setTimeout(r, 100));
          if (el.hidden) return JSON.stringify({ vanishedWhileHovered: (i + 1) / 10 });
        }
        return JSON.stringify({ heldOpen: true });
      })()`, 40000);
      const v = JSON.parse(r);
      if (v.missing) return { skip: 'surface not in this build' };
      if (v.couldNotOpen) return { skip: 'could not open it to test' };
      return v.heldOpen ? { detail: 'held open for 13s of hovering' }
                        : { ok: false, detail: `vanished after ${v.vanishedWhileHovered}s WHILE hovered` };
    });
  }

  // Escape is the other behaviour that has to be the same everywhere. It was implemented per text
  // field, so a card you were reading and the History list both ignored it — while the app's own
  // Type blurb told the user "Esc closes it".
  await check('Escape closes the front-most surface (card, then panel)', async () => {
    await main(`require('electron').ipcMain._invokeHandlers.get('translate:text')(null, 'garden')`, 30000);
    await sleep(2500);
    const r = await page(`(async () => {
      const card = document.getElementById('result'), panel = document.getElementById('panel');
      const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const cardWasOpen = !card.hidden;
      esc(); await new Promise(r => setTimeout(r, 700));
      const cardClosed = card.hidden;
      if (panel.hidden) { document.getElementById('logBtn').click(); await new Promise(r => setTimeout(r, 800)); }
      const panelWasOpen = !panel.hidden;
      document.activeElement && document.activeElement.blur();
      esc(); await new Promise(r => setTimeout(r, 700));
      return JSON.stringify({ cardWasOpen, cardClosed, panelWasOpen, panelClosed: panel.hidden });
    })()`, 40000);
    const v = JSON.parse(r);
    const bad = [];
    if (v.cardWasOpen && !v.cardClosed) bad.push('card ignored Esc');
    if (v.panelWasOpen && !v.panelClosed) bad.push('panel ignored Esc');
    if (!v.cardWasOpen && !v.panelWasOpen) return { skip: 'neither surface could be opened' };
    return bad.length ? { ok: false, detail: bad.join(' · ') } : { detail: 'card then panel both closed' };
  });

  // Same class of rule as hover and Escape: a dragged surface must follow the pointer with no easing.
  // The tucked pill carried a 0.2s transform transition from its hover-peek classes, so dragging it
  // trailed the cursor and snapped — reported twice by jek before it was found.
  await check('dragging never animates position', async () => {
    const r = await page(`(() => {
      const wrap = document.getElementById('wrap');
      const had = wrap.classList.contains('dragging');
      wrap.classList.add('dragging');
      const t = getComputedStyle(wrap).transitionProperty + ' / ' + getComputedStyle(wrap).transitionDuration;
      const animatesTransform = /transform|all/.test(getComputedStyle(wrap).transitionProperty)
        && !/^0s(,\s*0s)*$/.test(getComputedStyle(wrap).transitionDuration);
      if (!had) wrap.classList.remove('dragging');
      return JSON.stringify({ t, animatesTransform });
    })()`);
    const v = JSON.parse(r);
    return v.animatesTransform ? { ok: false, detail: `transform is animated while dragging (${v.t})` }
                               : { detail: `no positional easing while dragging (${v.t})` };
  });

  // ---- CC / live captions: the one path a click alone cannot reach ----------------------------
  // Driven through the real snip overlay (window.api.complete with a synthetic rect) rather than a
  // test-only shortcut, so what runs here is the path a person takes: toggle, draw the strip, watch.
  await check('CC starts, runs, and stops', async () => {
    // What the audit is allowed to believe: main.js keeps liveOn/liveTimer in module scope, which the
    // debugger cannot read — asking for them yields a ReferenceError, and a try/catch around it hands
    // back a *truthy* placeholder, i.e. a green light for a dead feature. So this check reads only what
    // the app actually shows: the panel button, and the hint line that startLive() writes. The `.live`
    // dot class and the caption box are deliberately NOT asserted — the first is a busy blink between
    // polls, the second only appears once a poll reads real text, so both depend on what is on screen.
    const st = () => page(`JSON.stringify({
      btn: document.getElementById('liveBtn').classList.contains('active'),
      hint: document.getElementById('hintText').textContent })`);

    await main(`(() => { require('electron').ipcMain._invokeHandlers.get('live:toggle')(); return 1; })()`);
    await sleep(1500);
    // Read the announcement HERE, not after the strip is drawn. The toggle is what starts the watch
    // loop and writes "Live · watching subtitles"; the strip draw below is a snip like any other, and
    // a snip finishing resets the pill's hint to the resting one. Measured 2026-08-10, sampled every
    // 500ms for 6s: after the strip lands the hint is back to the resting shortcut while the button
    // still reads "◉ Stop live subtitles" and CC keeps polling. Asserting the hint after the strip
    // therefore failed a running CC for a hint the app had legitimately moved on from.
    // (That the live status never comes BACK after the snip is a real, separate gap — the pill stops
    // telling you CC is on. Left unasserted on purpose: it is jek's call whether the hint should be
    // restored, and encoding either answer here would decide it silently.)
    const started = JSON.parse(await st());
    // Port comes from the page URL we were handed, not a constant. It was 9222 hard-coded, so running
    // the app on any other port failed this check with "fetch failed" — which reads exactly like CC is
    // broken, when the only thing wrong is where the audit went looking. A harness that can report a
    // product failure it did not observe is worse than a missing check.
    const targets = await (await fetch(`http://127.0.0.1:${new URL(pageUrl).port}/json`)).json();
    const snip = targets.find((t) => /snip/i.test(t.title) || /snip/i.test(t.url));
    if (!snip) return { ok: false, detail: 'no snip overlay to draw the caption strip in' };
    // Draw the strip the way a person does — through the overlay, not a test-only back door.
    await ev(snip.webSocketDebuggerUrl, `window.api.complete({ x: 300, y: 700, width: 700, height: 90 })`, 20000)
      .catch(() => {});
    await sleep(2500);
    const on = JSON.parse(await st());
    // Documented exception, enforced: Escape must NOT stop CC. Getting back in costs a drag to re-pick
    // the strip, unlike a card or panel that reopen with one click — so a stray Escape killing it is a
    // worse failure than Escape doing nothing here. Wire Escape to CC later and this check turns red,
    // which is the point: the exception has to be changed on purpose, not drifted into.
    await page(`(() => { document.activeElement && document.activeElement.blur();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return 1; })()`);
    await sleep(800);
    const afterEsc = JSON.parse(await st());
    await main(`(() => { require('electron').ipcMain._invokeHandlers.get('live:toggle')(); return 1; })()`);
    await sleep(1500);
    const off = JSON.parse(await st());
    // This used to read `getElementById('captionBox').hidden`. The caption box is GONE — live lines
    // land on the pill's own card now (renderer/main/index.js: "The box that used to sit at the
    // bottom of the screen is gone") — so that call returned null and threw, and the throw took the
    // WHOLE check down with it. Net effect measured 2026-08-10: CC was the one feature the audit
    // never actually checked, on every run, while the suite still printed a total that looked full.
    // The equivalent observation on today's UI is the surface that replaced the box: stopLive() hides
    // a live card ("CC stopped → the subtitle card goes with it"), and #rClose's title is the only
    // DOM-visible tell of `resultIsLive`, which is module scope the debugger cannot read.
    const liveCardLeft = await page(`(() => {
      const el = document.getElementById('result');
      if (el.hidden) return false;
      return /live/i.test(document.getElementById('rClose').title);
    })()`);

    const bad = [];
    if (!started.btn) bad.push('the toggle never put the app into live mode');
    if (!/live/i.test(started.hint)) bad.push(`watch loop never announced itself (hint stayed "${started.hint}")`);
    if (!on.btn) bad.push('live mode dropped while the strip was being drawn');
    if (!afterEsc.btn) bad.push('Escape stopped CC (the documented exception says it must not)');
    if (off.btn) bad.push('toggle did not leave live mode');
    if (/live/i.test(off.hint)) bad.push(`hint still says "${off.hint}" after stopping`);
    if (liveCardLeft === true) bad.push('a live caption card stayed on screen after stopping');
    return bad.length ? { ok: false, detail: bad.join(' \u00b7 ') }
                      : { detail: 'toggled \u2192 watching, held through a strip draw, survived Escape by design, stopped clean' };
  });

  if (parkedFrom) { // give the pointer back to whoever was using it
    const [bx, by] = String(parkedFrom).trim().split(/\s+/).map(Number);
    if (Number.isFinite(bx) && Number.isFinite(by)) { try { moveCursor(bx, by); } catch {} }
  }

  // ---- report ----------------------------------------------------------------------------------
  const w = Math.max(...results.map((r) => r.name.length));
  console.log('');
  for (const r of results) {
    const mark = { PASS: '✅', FAIL: '❌', ERROR: '💥', SKIP: '⏭️ ' }[r.status];
    console.log(`${mark} ${r.name.padEnd(w)}  ${r.detail}`);
  }
  const bad = results.filter((r) => r.status === 'FAIL' || r.status === 'ERROR').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  console.log(`\n${results.length - bad - skipped}/${results.length} pass · ${bad} fail · ${skipped} skipped`);
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.log('AUDIT CRASHED', e.message); process.exit(2); });
