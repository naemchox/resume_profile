// Ijek desktop shell — a thin Electron window that loads the LIVE PWA. Because it loads the deployed
// URL (not a bundled copy), the desktop app auto-updates whenever the web app is redeployed: the
// page's own service worker + controllerchange-reload pull fresh code, no new installer needed.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const APP_URL = 'https://withered-block-4669.monmon7735.workers.dev/train.html';

function createWindow() {
  const win = new BrowserWindow({
    width: 460,
    height: 880,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: '#0b1220',
    autoHideMenuBar: true,
    title: 'Ijek',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(APP_URL);
  // External links (e.g. PromptPay, legal) open in the system browser, not a child Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !url.startsWith(APP_URL)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
