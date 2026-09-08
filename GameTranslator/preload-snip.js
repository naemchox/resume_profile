const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  isMac: process.platform === 'darwin',
  complete: (rect) => ipcRenderer.invoke('snip:complete', rect),
  cancel: () => ipcRenderer.invoke('snip:cancel'),
  preview: (rect) => ipcRenderer.invoke('snip:preview', rect),
  // Typing during a snip = "forget the box, I'll type it" — closes the overlay and seeds the pill.
  typeChar: (ch) => ipcRenderer.invoke('snip:type', ch),
  onReset: (cb) => ipcRenderer.on('snip:reset', (_e, payload) => cb(payload || {})),
  onFreeze: (cb) => ipcRenderer.on('snip:freeze', (_e, dataUrl) => cb(dataUrl)),
  onFinish: (cb) => ipcRenderer.on('snip:finish', () => cb()),
  // The real OS cursor, polled by main while a snip is live — the ring's source of truth (see
  // feedSnipCursor in main.js).
  onCursor: (cb) => ipcRenderer.on('snip:cursor', (_e, payload) => cb(payload || {})),
  setInteractive: (on) => ipcRenderer.send('snip:interactive', on),
  // Driven entirely by main (mousehook: middle-button or ⌃⌥+move) — the overlay never reads its
  // own mouse here, it just draws whatever box main tells it to.
  onExternStart: (cb) => ipcRenderer.on('extern:start', (_e, payload) => cb(payload || {})),
  onExternUpdate: (cb) => ipcRenderer.on('extern:update', (_e, payload) => cb(payload || {})),
  onExternPreview: (cb) => ipcRenderer.on('extern:preview', (_e, payload) => cb(payload || {})),
  onExternFinish: (cb) => ipcRenderer.on('extern:finish', () => cb()),
});
