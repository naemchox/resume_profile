const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onRecognize: (cb) => ipcRenderer.on('ocr:recognize', (_e, payload) => cb(payload)),
  sendResult: (payload) => ipcRenderer.send('ocr:result', payload),
  sendReady: () => ipcRenderer.send('ocr:ready'),
});
