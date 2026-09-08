// Renders the Gloss MARK into the icons the app ships: build/icon.png, build/icon.ico, build/tray.png.
//
//   npx electron scripts/gen-icons.js
//
// WHY THIS REPLACED THE HAND-DRAWN ONE. _gen_icon.js drew a bare → with its own tiny raster
// primitives, because that is all you can do without a font or an SVG rasteriser. But the → was never
// the product's mark: the website and its favicon have always shown the real one — a snip frame
// (four corner brackets) around 文 above A, the whole thing saying "this reads the writing on your
// screen". So every window and the tray were wearing a placeholder while the site wore the logo
// (jek, 2026-08-09: "มันควรจะเป็นไอคอนของ Gloss เว้ย ไม่ใช่ลูกศร").
//
// The mark is not re-drawn here, it is READ from website/index.html — the favicon data URI is the one
// definition of it, and a second copy in a second language is how two Glosses end up existing. Change
// the site's favicon and re-run this; nothing else needs touching.
//
// Rendered by Electron rather than by a raster library on purpose: this repo already depends on
// Chromium and on nothing else that can rasterise an SVG, and Chromium is also what will draw the
// mark everywhere else it appears. One renderer, one result.
const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SIZE = 512; // captured big, downscaled by nativeImage — the tray takes 16px off this

function markSvg() {
  const html = fs.readFileSync(path.join(ROOT, 'website', 'index.html'), 'utf8');
  const m = html.match(/<link rel="icon" href="data:image\/svg\+xml,([^"]+)"/);
  if (!m) throw new Error('no favicon data URI in website/index.html — that is where the mark lives');
  return decodeURIComponent(m[1]);
}

// --- PNG re-encode. nativeImage.toPNG() is already a PNG; this only exists for the .ico wrapper,
// which needs the exact bytes it will embed. ---
function ico(png) {
  const dir = Buffer.alloc(6 + 16);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4); // reserved, type=icon, count
  dir[6] = 0; dir[7] = 0;              // 0 = 256px or larger
  dir.writeUInt16LE(1, 10); dir.writeUInt16LE(32, 12); // planes, bpp
  dir.writeUInt32LE(png.length, 14);
  dir.writeUInt32LE(22, 18);           // offset of the image data
  return Buffer.concat([dir, png]);
}

app.disableHardwareAcceleration(); // a GPU-less capture is identical here and starts faster
app.whenReady().then(async () => {
  const svg = markSvg();
  const win = new BrowserWindow({
    width: SIZE, height: SIZE, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  });
  // The SVG is drawn edge to edge on a transparent page: the mark carries its own rounded tile, so any
  // page background would show up as square corners behind it.
  const page = `<!doctype html><meta charset="utf-8">`
    + `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${SIZE}px;height:${SIZE}px}</style>`
    + svg;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
  await new Promise((r) => setTimeout(r, 400)); // let the gradients paint before the shutter
  const shot = await win.webContents.capturePage();
  win.destroy();

  const dest = path.join(ROOT, 'build');
  fs.mkdirSync(dest, { recursive: true });
  const full = shot.toPNG();
  fs.writeFileSync(path.join(dest, 'icon.png'), full);
  fs.writeFileSync(path.join(dest, 'icon.ico'), ico(full));
  // The tray takes the same mark. It does not need the contrast swap the → needed: this one fills its
  // tile with bright cyan and a white glyph, so it is legible on a dark shelf and on a light one.
  fs.writeFileSync(path.join(dest, 'tray.png'), shot.resize({ width: 64, height: 64 }).toPNG());
  console.log(`wrote build/icon.png (${full.length} bytes), build/icon.ico, build/tray.png`);
  app.quit();
});
