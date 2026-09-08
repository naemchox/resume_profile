// Renders build/icon.svg to build/icon.png at 1024x1024 — captured from a 512pt page on a 2x display,
// which is the size electron-builder wants and the one macOS downsamples every other size from. Run with: npx electron scripts/make-icon.js
//
// Electron rather than a converter dependency for the same reason scripts/make-og.js uses it: the
// icon contains a Thai glyph, and only a real browser engine with the web font loaded renders ก the
// way the site and the app do. A converter without that font silently draws a box.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SVG = path.join(__dirname, '..', 'build', 'icon.svg');
const OUT = path.join(__dirname, '..', 'build', 'icon.png');

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SVG, 'utf8');
  const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sarabun:wght@700;800&display=swap">
<style>html,body{margin:0;width:512px;height:512px;background:transparent;overflow:hidden}
svg{display:block;width:512px;height:512px}</style>${svg}`;

  const win = new BrowserWindow({
    width: 512, height: 512, show: false, useContentSize: true, frame: false,
    // The icon has rounded corners of its own; anything behind them must stay empty, not black.
    transparent: true, backgroundColor: '#00000000',
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise((r) => setTimeout(r, 800));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  fs.writeFileSync(OUT, image.toPNG());
  console.log('wrote', OUT, image.getSize());

  // icon.png is NOT what macOS ships. electron-builder packages build/icon.icns, and a stale .icns is
  // invisible until you look at the built app — this repo shipped 文 over A for a day after the mark
  // had already changed everywhere else, because only the PNG was regenerated. Build the .icns here,
  // from the same pixels, so the two cannot drift again.
  const { execFileSync } = require('node:child_process');
  const set = path.join(__dirname, '..', 'build', 'icon.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set);
  // The names are fixed by iconutil; @2x entries are the same pixels at double density.
  for (const [size, name] of [[16, 'icon_16x16'], [32, 'icon_16x16@2x'], [32, 'icon_32x32'],
    [64, 'icon_32x32@2x'], [128, 'icon_128x128'], [256, 'icon_128x128@2x'], [256, 'icon_256x256'],
    [512, 'icon_256x256@2x'], [512, 'icon_512x512'], [1024, 'icon_512x512@2x']]) {
    execFileSync('sips', ['-z', String(size), String(size), OUT, '--out', path.join(set, name + '.png')],
      { stdio: 'ignore' });
  }
  const icns = path.join(__dirname, '..', 'build', 'icon.icns');
  execFileSync('iconutil', ['-c', 'icns', set, '-o', icns]);
  fs.rmSync(set, { recursive: true, force: true });
  console.log('wrote', icns);

  app.quit();
});
