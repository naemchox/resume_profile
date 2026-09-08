const { contextBridge, ipcRenderer } = require('electron');

// The hover overlay is output-only: main drives everything from the OS cursor (the window is
// click-through, so it never sees a mouse event of its own).
contextBridge.exposeInMainWorld('api', {
  onShow: (cb) => ipcRenderer.on('hover:show', (_e, payload) => cb(payload || {})),
  onHide: (cb) => ipcRenderer.on('hover:hide', () => cb()),
  // The save key fired on the word already on screen — nothing about the bubble changes except that
  // it is now yours, so this is its own tiny event rather than a whole hover:show round trip.
  onSaved: (cb) => ipcRenderer.on('hover:saved', (_e, payload) => cb(payload || {})),
  // The reader's own language, arriving a few hundred ms after the word it belongs to — the
  // dictionary had only an English definition and the translator was asked. Its own channel because
  // it lands LATE: re-sending the whole word would repaint a bubble that is already correct.
  onExtra: (cb) => ipcRenderer.on('hover:extra', (_e, payload) => cb(payload || {})),
});
