const { contextBridge, ipcRenderer } = require('electron');

// NOT `require('./capabilities')`: this preload is sandboxed, where require() answers for Electron's
// own modules and nothing else — pulling in a file of ours throws before exposeInMainWorld runs and
// the page loses window.api entirely. main.js reads capabilities.js and hands the answer over as a
// switch on the command line (see additionalArguments where mainWindow is created), so the rule is
// still written in exactly one place.
const HOVER_CAPABLE = process.argv.includes('--gloss-hover-capable=1');

contextBridge.exposeInMainWorld('api', {
  isMac: process.platform === 'darwin', // renderer swaps ⌘⇧ key labels for Ctrl⇧ on Windows/Linux
  // NOT `!isMac`: a mouse-button shortcut needs winmousehook's WH_MOUSE_LL, which Linux does not have
  // either. The shortcut recorder offers side buttons only where something can actually run one.
  isWin: process.platform === 'win32',
  // Can this machine run point-at-a-word at all (per-character OCR geometry)? A CAPABILITY, not a
  // platform: the mode strip must show its chip on exactly the machines main.js will accept the
  // shortcut on, so both read capabilities.js rather than each testing process.platform.
  hoverCapable: HOVER_CAPABLE,
  // Same rule, same door: the source picker and the swap arrow must both agree with the engine.
  thaiSource: process.argv.includes('--gloss-thai-source=1'),
  // The English→Thai edition (capabilities.js › PAIR_LOCK). The renderer uses it to take the language
  // pickers off the surface entirely rather than to disable them: a control you cannot use is still a
  // question you have to answer.
  pairLock: process.argv.includes('--gloss-pair-lock=1'),
  // GT_DEBUG is a main-process env var; the renderer cannot read process.env at all under
  // contextIsolation. Handed over so in-page probes (frame timing, and anything measured later) stay
  // silent in a normal run and only speak when the app was started for debugging.
  debug: !!process.env.GT_DEBUG,
  // GT_SELFTEST drives the panel from code so a perf measurement can be repeated without a human in
  // the loop. Separate from GT_DEBUG on purpose: reading the log should never move the UI by itself.
  selfTest: process.env.GT_SELFTEST || '', // the VALUE, not a flag — it names which variant to run
  sendReport: (arg) => ipcRenderer.invoke('report:send', arg), // card ⚑ and Settings › Report a problem
  startSnip: () => ipcRenderer.invoke('snip:start'),
  toggleLive: () => ipcRenderer.invoke('live:toggle'),
  pickLiveArea: () => ipcRenderer.invoke('live:pick'),
  toggleHover: () => ipcRenderer.invoke('hover:toggle'),
  onHoverState: (cb) => ipcRenderer.on('hover:state', (_e, on) => cb(on)),
  onLiveState: (cb) => ipcRenderer.on('live:state', (_e, on) => cb(on)),
  onLivePicking: (cb) => ipcRenderer.on('live:picking', (_e, on) => cb(on)),
  onInteractiveReset: (cb) => ipcRenderer.on('ui:interactive-reset', () => cb()),
  // Main dropped every foreground hold at once (releaseAllForeground). The renderer's own
  // edge-guarded copies of that state have to forget too, or they never send `true` again.
  onForegroundReset: (cb) => ipcRenderer.on('ui:foreground-reset', () => cb()),
  // Voice input (⌘⇧M or the pill's mic button): state flips the listening cue, partial streams words.
  toggleSpeak: () => ipcRenderer.invoke('speak:toggle'), // pill mic button — same action as the shortcut
  onSpeakState: (cb) => ipcRenderer.on('speak:state', (_e, s) => cb(s)),
  onSpeakPartial: (cb) => ipcRenderer.on('speak:partial', (_e, t) => cb(t)),
  // Cursor position pushed from main while the window captures the mouse but the app is inactive —
  // the one state where no real mousemove reaches the page. See updateCursorFeed() in main.js.
  onCursor: (cb) => ipcRenderer.on('ui:cursor', (_e, p) => cb(p)),
  translateText: (text) => ipcRenderer.invoke('translate:text', text),
  peekText: (text) => ipcRenderer.invoke('translate:peek', text), // live dictionary preview while typing

  onHint: (cb) => ipcRenderer.on('hint', (_e, msg) => cb(msg)),
  clear: () => ipcRenderer.invoke('app:clear'),
  setInteractive: (on) => ipcRenderer.send('ui:interactive', on),
  // Dragging the pill is renderer-only (CSS transform), so main had no way to know it was happening
  // — and the monitor-follow poll reads the real cursor, which crosses screens mid-drag while the
  // pill cannot. Without this the window re-homes out from under the hand holding it.
  setDragging: (on) => ipcRenderer.send('ui:dragging', on),
  // What is behind the stack right now, for the glass backdrop. rect is window-relative (a
  // getBoundingClientRect of the whole stack); main offsets it by the window and returns a tiny
  // blurred-ready bitmap. Resolves null when it declines (throttled, mid-snip, no permission).
  sampleGlass: (rect) => ipcRenderer.invoke('glass:sample', rect),
  setFocusable: (on) => ipcRenderer.send('ui:focusable', on),
  // "I am about to focus a text field — take the foreground first." An invoke, not a send, because
  // the ORDER is the whole point: .focus() before the window is foreground does nothing at all, so
  // the renderer has to wait for the answer. See ui:focus-field in main.js.
  takeFieldFocus: () => ipcRenderer.invoke('ui:focus-field'),
  // Pill style 'behind': drop the overlay out of always-on-top so ordinary windows can cover it,
  // and raise it again when something has arrived worth seeing. Send, not invoke — the renderer has
  // no answer to wait for and a round-trip here would sit in front of the card being shown.
  sinkPill: (on) => ipcRenderer.send('ui:sink', on),
  // pane: 'screen' | 'speech' | 'mic' — main maps it to the right deep link per platform.
  openScreenSettings: (pane) => ipcRenderer.invoke('permission:open-settings', pane),
  // Quit and come back. The screen-recording grant is only read at launch, so this is a real step in
  // the permission flow rather than a convenience.
  relaunch: () => ipcRenderer.invoke('app:relaunch'),
  revealApp: () => ipcRenderer.invoke('app:reveal'),
  // A permission the user can actually go and grant → raise the banner with its Open Settings button.
  onPermissionSetting: (cb) => ipcRenderer.on('permission:setting', (_e, p) => cb(p)),
  // Ask Claude for the full card for text Google already translated. Resolves { ok } — the card
  // itself arrives on the normal translation:new channel, so there is one render path, not two.
  upgradeCard: (text) => ipcRenderer.invoke('card:ai', text),
  // Translate the card's line again as a DIFFERENT spelling — the ✎ correction, or the misread it is
  // offering to put back. `use` hands main a card the renderer already has so the way back is free.
  // Resolves { ok }; the card itself arrives on translation:new, like upgradeCard's.
  respellCard: (arg) => ipcRenderer.invoke('card:respell', arg),
  quit: () => ipcRenderer.invoke('app:quit'),
  openLearn: () => ipcRenderer.invoke('learn:open'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  // Ask the server what a licence key is worth, without spending any of it.
  verifyLicence: (key) => ipcRenderer.invoke('licence:verify', key),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),
  // Read once, here, so the renderer can paint the resting hint with the REAL snip trigger on its
  // first pass instead of a hard-coded guess that gets corrected a frame later. Cheap (one sync IPC
  // at window creation) and never used again — every later read goes through getShortcuts().
  shortcutsAtBoot: (() => { try { return ipcRenderer.sendSync('shortcuts:get-sync'); } catch { return null; } })(),
  setShortcut: (id, accel) => ipcRenderer.invoke('shortcuts:set', { id, accel }),
  resetShortcuts: () => ipcRenderer.invoke('shortcuts:reset'),
  suspendShortcuts: () => ipcRenderer.invoke('shortcuts:suspend'),
  resumeShortcuts: () => ipcRenderer.invoke('shortcuts:resume'),
  exportHistory: () => ipcRenderer.invoke('history:export'),
  deleteHistory: (ts) => ipcRenderer.invoke('history:delete', ts), // one row, by its timestamp
  segmentWords: (text) => ipcRenderer.invoke('vocab:segment', text),
  translateWord: (word) => ipcRenderer.invoke('vocab:translate-word', word),
  vocabGet: () => ipcRenderer.invoke('vocab:get'),
  vocabSet: (list) => ipcRenderer.invoke('vocab:set', list),
  vocabAdd: (entry) => ipcRenderer.invoke('vocab:add', entry),
  vocabRemove: (word) => ipcRenderer.invoke('vocab:remove', word),
  vocabUpdate: (payload) => ipcRenderer.invoke('vocab:update', payload),
  onVocabChanged: (cb) => ipcRenderer.on('vocab:changed', (_e, v) => cb(v)),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  onTranslation: (cb) => ipcRenderer.on('translation:new', (_e, payload) => cb(payload)),
  onTranslationError: (cb) => ipcRenderer.on('translation:error', (_e, msg) => cb(msg)),
  onDisplayMoved: (cb) => ipcRenderer.on('display:moved', () => cb()), // overlay re-homed to another monitor
  onSnipState: (cb) => ipcRenderer.on('snip:state', (_e, on) => cb(on)), // a snip session is live → light the ⧉ button
  onHistoryClear: (cb) => ipcRenderer.on('history:clear', () => cb()),
  onHistoryLoad: (cb) => ipcRenderer.on('history:load', (_e, list) => cb(list)),
  onPermissionNeeded: (cb) => ipcRenderer.on('permission:needed', (_e, status) => cb(status)),
  // …and the moment it is granted. Paired with the line above on purpose: the pill carries a label
  // that lasts as long as the condition, so it has to hear both edges, not just the bad one.
  onPermissionOk: (cb) => ipcRenderer.on('permission:ok', (_e, what) => cb(what)),
  onLowQuality: (cb) => ipcRenderer.on('ocr:lowquality', (_e, payload) => cb(payload)),
  onLockToggle: (cb) => ipcRenderer.on('lock:toggle', () => cb()),
  reportLock: (on) => ipcRenderer.send('ui:lock-state', on), // keeps the tray menu's tick honest
  onReveal: (cb) => ipcRenderer.on('ui:reveal', () => cb()),
  // ⌘, from the macOS app menu. Separate from onReveal because the two are separate promises:
  // reveal makes the pill reachable, this opens the page you asked for once it is.
  onOpenSettings: (cb) => ipcRenderer.on('ui:settings', () => cb()),
  onTypeFocus: (cb) => ipcRenderer.on('type:focus', (_e, payload) => cb(payload || {})),
  typeDone: () => ipcRenderer.send('type:done'),
  onResultLoading: (cb) => ipcRenderer.on('result:loading', (_e, on) => cb(on)),
  onResultHide: (cb) => ipcRenderer.on('result:hide', () => cb()),
});
