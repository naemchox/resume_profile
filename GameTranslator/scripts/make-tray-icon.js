// Generates build/tray.png and build/tray@2x.png — the macOS menu bar / Windows tray icon.
//
// WHY A GENERATOR AND NOT A CHECKED-IN ASSET. build/tray.png was listed in package.json's `files`
// and loaded by main.js as TRAY_ICON, but the file had never existed. nativeImage.createFromPath
// returned an empty image, the `img.isEmpty()` guard swapped in createEmpty(), and Tray was handed
// nothing to draw — so the menu bar item that exists specifically as "the way back when the overlay
// cannot answer" was an invisible slot on every Mac build we ever shipped. Found 2026-09-01.
//
// WHY A TEMPLATE IMAGE. macOS does not want a coloured icon in the menu bar: it wants a black shape
// plus alpha, and the system inverts it for a dark menu bar, dims it when the app is hidden, and
// highlights it on click. A coloured PNG gets none of that and reads as a foreign object. So this
// writes greyscale+alpha with every pixel black — main.js calls setTemplateImage(true) on darwin.
//
// THE MARK. The app icon is a snip box around 文 → A. At 16px the glyphs are mud; the four corner
// brackets survive and are the half people recognise. Same mark, reduced — not a different one.
//
// Run: node scripts/make-tray-icon.js   (regenerate after any change to the bracket geometry)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SS = 8; // supersample factor — the brackets are diagonal-free but the round caps need it

// One bracket arm set, in a 16x16 design grid. Inset 2px so macOS's own padding does not clip it.
const BOX = { x0: 2.5, y0: 2.5, x1: 13.5, y1: 13.5 };
const ARM = 3.6;   // how far each corner runs along its two edges
const STROKE = 1.6;

// Distance from a point to a line SEGMENT — the whole mark is eight of these, capped round.
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

function segments() {
  const { x0, y0, x1, y1 } = BOX;
  return [
    [x0, y0 + ARM, x0, y0], [x0, y0, x0 + ARM, y0],           // top-left
    [x1 - ARM, y0, x1, y0], [x1, y0, x1, y0 + ARM],           // top-right
    [x1, y1 - ARM, x1, y1], [x1, y1, x1 - ARM, y1],           // bottom-right
    [x0 + ARM, y1, x0, y1], [x0, y1, x0, y1 - ARM],           // bottom-left
  ];
}

function render(size) {
  const scale = size / 16;
  const segs = segments();
  const r = (STROKE / 2) * scale;
  const alpha = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          for (const s of segs) {
            if (segDist(px, py, s[0] * scale, s[1] * scale, s[2] * scale, s[3] * scale) <= r) { hit++; break; }
          }
        }
      }
      alpha[y * size + x] = Math.round((hit / (SS * SS)) * 255);
    }
  }
  return alpha;
}

// Minimal PNG writer, colour type 4 (greyscale + alpha). Black shape, alpha carries the mark.
function png(size, alpha) {
  const raw = Buffer.alloc(size * (size * 2 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < size; x++) { raw[o++] = 0; raw[o++] = alpha[y * size + x]; }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 4; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

let TABLE = null;
function crc32(buf) {
  if (!TABLE) {
    TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

const out = path.join(__dirname, '..', 'build');
for (const [size, name] of [[16, 'tray.png'], [32, 'tray@2x.png']]) {
  const file = path.join(out, name);
  fs.writeFileSync(file, png(size, render(size)));
  console.log('wrote', file, size + 'x' + size);
}
