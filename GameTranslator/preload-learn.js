const { contextBridge, ipcRenderer } = require('electron');

// Bridge for the learn/dashboard window (M3: shell only; M4 wires up the actual tabs). Named
// `learnApi` (not `api`) so it never collides with the pill's preload-main.js — they're separate
// renderers so it wouldn't actually clash, but the distinct name keeps intent obvious in shared code.
contextBridge.exposeInMainWorld('learnApi', {
  isMac: process.platform === 'darwin',

  vocabGet: () => ipcRenderer.invoke('vocab:get'),
  vocabSet: (list) => ipcRenderer.invoke('vocab:set', list),
  vocabAdd: (entry) => ipcRenderer.invoke('vocab:add', entry),
  vocabRemove: (word) => ipcRenderer.invoke('vocab:remove', word),
  vocabUpdate: (payload) => ipcRenderer.invoke('vocab:update', payload),
  // One call per word, cached on the entry afterwards — see the note in main.js.
  lexicon: (payload) => ipcRenderer.invoke('vocab:lexicon', payload),
  // Anki-importable TSV of the collected words — the backup story, in place of an account.
  exportVocab: () => ipcRenderer.invoke('vocab:export-anki'),
  checkSentence: (payload) => ipcRenderer.invoke('vocab:check-sentence', payload),
  // ONE call for a whole sitting's Recall sentences, cached per entry afterwards — see main.js.
  recallSet: (payload) => ipcRenderer.invoke('vocab:recall-set', payload),
  onVocabChanged: (cb) => ipcRenderer.on('vocab:changed', (_e, v) => cb(v)),

  translateWord: (word) => ipcRenderer.invoke('vocab:translate-word', word),

  // Insights tab: lifetime per-day tally kept in stats.json (history.json is capped, this isn't).
  statsGet: () => ipcRenderer.invoke('stats:get'),

  // Plan tab. settingsGet/Set is the same channel the pill's Settings page uses, so the key field
  // here and the one there are the same field; onSettings keeps both in sync live. openUrl is
  // allow-listed in main — the renderer cannot launch an arbitrary URL.
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (cb) => ipcRenderer.on('settings:changed', (_e, s) => cb(s)),
  openUrl: (url) => ipcRenderer.invoke('open:url', url),

  // History tab (M4) — channel exposed now so main.js's existing sendAll('history:load'/
  // 'translation:new') already reaches this window once M4 wires the UI up to it.
  onHistoryLoad: (cb) => ipcRenderer.on('history:load', (_e, list) => cb(list)),
  onTranslation: (cb) => ipcRenderer.on('translation:new', (_e, payload) => cb(payload)),
  onHistoryClear: (cb) => ipcRenderer.on('history:clear', () => cb()),
});
