// Renders website/_og.html to website/og.png at exactly 1200x630 (the size every link preview crops
// to). Run with: npx electron scripts/make-og.js
// Electron rather than a headless-Chrome dependency because this repo already ships Electron, and the
// image has to match what the site's own CSS produces.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, '..', 'website', 'og.png');
const SRC = path.join(__dirname, '..', 'website', '_og.html');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200, height: 630, show: false,
    // useContentSize, or the window frame eats into the page and the capture comes back 1200x602 —
    // the right pixels at the wrong aspect ratio, which every preview then crops badly.
    useContentSize: true, frame: false,
    webPreferences: { offscreen: false },
  });
  await win.loadFile(SRC);
  // Web fonts land after load; capturing too early ships a fallback face.
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise((r) => setTimeout(r, 600));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1200, height: 630 });
  fs.writeFileSync(OUT, image.toPNG());
  console.log('wrote', OUT, image.getSize());
  app.quit();
});
