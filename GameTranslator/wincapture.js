// ---------- Windows region screen-capture (Windows only) ----------
// Electron's desktopCapturer.getSources() grabs EVERY screen at full resolution even when we only
// want the small box the user dragged — measured 260-430ms per snip on a 2-monitor setup, which is
// the visible hitch the moment you release the drag. GDI BitBlt copies just the region instead
// (~5-15ms), and the smaller bitmap also makes the Tesseract pass quicker.
//
// Called through koffi (FFI), so there's no C++ addon to build and nothing to rebuild when Electron's
// version changes — koffi is Node-API based.
//
// Coordinates in: DIP screen coords (what Electron hands out everywhere else). GDI wants physical
// pixels, so they're converted with screen.dipToScreenRect() — matters at 125/150% scaling.

const { screen, nativeImage } = require('electron');

const SRCCOPY = 0x00CC0020;
// NO CAPTUREBLT. That flag folds layered windows into the copy, and our own snip overlay is a
// full-screen layered window — every mid-drag preview came back blank (Tesseract: confidence 0, empty
// string). Plain SRCCOPY skips layered windows, which is exactly right here: the overlay and the pill
// must never end up in the frame we OCR.
const BI_RGB = 0;
const DIB_RGB_COLORS = 0;

let koffi = null;
let user32 = null;
let gdi32 = null;
let fns = null;
let loadFailed = false;

// Lazily bind the Win32 entry points. Returns false if koffi can't load — callers fall back to the
// desktopCapturer path, so a broken FFI degrades to "slower", never to "broken".
function ensureLoaded() {
  if (fns) return true;
  if (loadFailed || process.platform !== 'win32') return false;
  try {
    koffi = require('koffi');
    user32 = koffi.load('user32.dll');
    gdi32 = koffi.load('gdi32.dll');

    // BITMAPINFOHEADER + the colour-table slot GetDIBits expects (BITMAPINFO).
    const BITMAPINFOHEADER = koffi.struct('BITMAPINFOHEADER', {
      biSize: 'uint32',
      biWidth: 'int32',
      biHeight: 'int32',
      biPlanes: 'uint16',
      biBitCount: 'uint16',
      biCompression: 'uint32',
      biSizeImage: 'uint32',
      biXPelsPerMeter: 'int32',
      biYPelsPerMeter: 'int32',
      biClrUsed: 'uint32',
      biClrImportant: 'uint32',
    });
    const BITMAPINFO = koffi.struct('BITMAPINFO', {
      bmiHeader: BITMAPINFOHEADER,
      bmiColors: koffi.array('uint32', 3),
    });

    fns = {
      GetDC: user32.func('void* GetDC(void*)'),
      ReleaseDC: user32.func('int ReleaseDC(void*, void*)'),
      CreateCompatibleDC: gdi32.func('void* CreateCompatibleDC(void*)'),
      CreateCompatibleBitmap: gdi32.func('void* CreateCompatibleBitmap(void*, int, int)'),
      SelectObject: gdi32.func('void* SelectObject(void*, void*)'),
      BitBlt: gdi32.func('int BitBlt(void*, int, int, int, int, void*, int, int, uint32)'),
      DeleteObject: gdi32.func('int DeleteObject(void*)'),
      DeleteDC: gdi32.func('int DeleteDC(void*)'),
      GetDIBits: gdi32.func('int GetDIBits(void*, void*, uint32, uint32, _Out_ void*, _Inout_ BITMAPINFO*, uint32)'),
    };
    return true;
  } catch (err) {
    console.error('wincapture: koffi/GDI unavailable — falling back to desktopCapturer:', err.message);
    loadFailed = true;
    fns = null;
    return false;
  }
}

function isAvailable() {
  return process.platform === 'win32' && ensureLoaded();
}

// Grab `bounds` ({x,y,width,height} in DIP screen coords) straight off the screen.
// Returns the same shape cropRegion() does — { image, ratioX, ratioY, origin } — so callers don't
// care which path produced it. Returns null on any failure (caller falls back).
function captureRegionNative(bounds) {
  if (!ensureLoaded()) return null;

  // DIP → physical pixels. ratioX/Y tell the caller how OCR word boxes map back to screen points.
  let phys;
  try {
    phys = screen.dipToScreenRect(null, {
      x: Math.round(bounds.x), y: Math.round(bounds.y),
      width: Math.round(bounds.width), height: Math.round(bounds.height),
    });
  } catch {
    phys = { x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) };
  }
  const w = phys.width, h = phys.height;
  if (w < 4 || h < 4) return null;

  let screenDC = null, memDC = null, bmp = null, oldBmp = null;
  try {
    screenDC = fns.GetDC(null); // the whole virtual desktop, origin at the primary monitor
    if (!screenDC) return null;
    memDC = fns.CreateCompatibleDC(screenDC);
    bmp = fns.CreateCompatibleBitmap(screenDC, w, h);
    if (!memDC || !bmp) return null;
    oldBmp = fns.SelectObject(memDC, bmp);

    if (!fns.BitBlt(memDC, 0, 0, w, h, screenDC, phys.x, phys.y, SRCCOPY)) return null;

    // Negative biHeight = top-down rows, which is the order nativeImage wants.
    const info = {
      bmiHeader: {
        biSize: 40, biWidth: w, biHeight: -h, biPlanes: 1, biBitCount: 32,
        biCompression: BI_RGB, biSizeImage: 0,
        biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0,
      },
      bmiColors: [0, 0, 0],
    };
    const pixels = Buffer.alloc(w * h * 4);
    const rows = fns.GetDIBits(memDC, bmp, 0, h, pixels, info, DIB_RGB_COLORS);
    if (!rows) return null;

    // GDI leaves the alpha byte at 0 on a BI_RGB copy — every pixel would be fully transparent.
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;

    // createFromBitmap takes BGRA, which is exactly GDI's byte order.
    const image = nativeImage.createFromBitmap(pixels, { width: w, height: h });
    if (image.isEmpty()) return null;

    return {
      image,
      ratioX: w / Math.max(1, Math.round(bounds.width)),
      ratioY: h / Math.max(1, Math.round(bounds.height)),
      origin: { x: bounds.x, y: bounds.y },
    };
  } catch (err) {
    console.error('wincapture: BitBlt capture failed — falling back:', err.message);
    return null;
  } finally {
    try {
      if (memDC && oldBmp) fns.SelectObject(memDC, oldBmp);
      if (bmp) fns.DeleteObject(bmp);
      if (memDC) fns.DeleteDC(memDC);
      if (screenDC) fns.ReleaseDC(null, screenDC);
    } catch { /* nothing sensible to do while cleaning up */ }
  }
}

module.exports = { isAvailable, captureRegionNative };
