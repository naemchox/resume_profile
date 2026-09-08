// Hidden window whose only job is OCR. tesseract.js hangs forever under
// Electron's Node (main process and utilityProcess alike), but runs fine here
// in Chromium. Everything it loads — worker, wasm core, eng.traineddata —
// is served from the local gt:// protocol, so this never touches the network.
let worker = null;
let ready = null;
let workerLang = null;

// (Re)build the worker for a given language. Switching source language recreates
// it — infrequent, so the cost is fine. Each language's traineddata is served
// locally over gt://, so this never hits the network.
function init(lang) {
  lang = lang || 'eng';
  if (ready && workerLang === lang) return ready;

  workerLang = lang;
  // Japanese is written BOTH ways and tesseract needs a different model for each — the horizontal
  // one reads 縦書き (manga bubbles, novel columns) as gibberish at every page-seg mode. Both are
  // loaded into ONE worker so the vertical retry below is a parameter change, not a worker rebuild
  // (rebuilding costs seconds; setParameters costs nothing). Measured on a real bubble: horizontal
  // alone 59% 「っるよ」, both + PSM 5 80% 「やってやるよ」 — the correct read.
  const loadLang = VERT_MODEL[lang] || lang;
  const prev = worker;
  ready = (async () => {
    if (prev) { try { await prev.terminate(); } catch {} worker = null; }
    const w = await Tesseract.createWorker(loadLang, 1, {
      workerPath: 'gt://ocr/worker.min.js',
      corePath: 'gt://ocr/core',
      langPath: 'gt://ocr',
      gzip: false,
      cacheMethod: 'none',
    });
    // The crop is always a single boxed block, never a page. PSM 6 skips the
    // layout analysis AUTO does and is markedly faster on a small region.
    await w.setParameters({ tessedit_pageseg_mode: String(PSM_HORIZONTAL) });
    worker = w;
    window.api.sendReady();
    return w;
  })();
  return ready;
}

// Source languages that also ship a vertical model, and what to load for them. Only Japanese for
// now: it is the language where vertical text is everyday (manga, novels, signage) rather than
// decorative. Chinese has chi_*_vert upstream and can join here the same way if it comes up.
const VERT_MODEL = { jpn: 'jpn+jpn_vert' };
const PSM_HORIZONTAL = 6; // one uniform block of horizontal text — the overwhelmingly common crop
const PSM_VERTICAL = 5;   // one uniform block of VERTICALLY aligned text
// Below this the first read is doubtful enough to be worth spending more reads on. Above it, a
// confident read is left alone and the crop costs exactly one pass, which is what the live caption
// poll needs.
const RETRY_CONF = 70;

const UPSCALE = 3;      // tesseract wants ~30px-tall glyphs; a Windows label is ~11px, so 2x wasn't enough
const LOCAL_BIAS = 0.88; // a pixel is ink when it's this much darker than its own neighbourhood

// The raw crop reads as gibberish: game text is antialiased, small, and often light-on-dark over a
// busy background. Upscale, desaturate, then binarise EACH PIXEL AGAINST ITS OWN NEIGHBOURHOOD.
//
// The old version compared every pixel to one average taken across the whole crop, which fails the
// moment a crop isn't uniform — a bright game cover behind white label text meant half the box sat
// above the average and half below, so the same words came out readable or destroyed depending on how
// much artwork the box happened to include. (That's why nudging the box changed the result.) A local
// threshold has no such global state: bright text on a bright patch and the same text on a dark patch
// both resolve, because each is judged against what's actually around it.
async function preprocess(png) {
  const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  const w = bitmap.width * UPSCALE;
  const h = bitmap.height * UPSCALE;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  let total = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = (d[i] * 77 + d[i + 1] * 151 + d[i + 2] * 28) >> 8;
    total += gray[p];
  }
  // Polarity FIRST, locality second. A local threshold can only find ink DARKER than its
  // surroundings, so light-on-dark text has to be flipped before it's looked for — otherwise the
  // letters read as "paper" and disappear wherever the background happens to be bright.
  if (total / (w * h) < 128) for (let p = 0; p < gray.length; p++) gray[p] = 255 - gray[p];

  // Summed-area table: makes the average of any window a constant-time lookup, so a per-pixel local
  // threshold costs one pass instead of one nested loop per pixel.
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  // Window ≈ a couple of glyph heights: wide enough to hold both ink and the paper around it, small
  // enough that a background gradient can't span it.
  const win = Math.max(8, Math.min(48, Math.round(Math.min(w, h) / 6)));
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - win), y1 = Math.min(h - 1, y + win);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - win), x1 = Math.min(w - 1, x + win);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = sat[(y1 + 1) * (w + 1) + (x1 + 1)] - sat[y0 * (w + 1) + (x1 + 1)]
                - sat[(y1 + 1) * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
      out[y * w + x] = gray[y * w + x] < (sum / area) * LOCAL_BIAS ? 0 : 255;
    }
  }

  for (let p = 0, i = 0; p < out.length; p++, i += 4) {
    d[i] = d[i + 1] = d[i + 2] = out[p];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  // Hand back the dimensions too: a crop taller than it is wide is the strongest cheap hint that
  // the text inside runs top-to-bottom, and onRecognize needs that to decide on the second pass.
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  return { blob, w, h };
}

const WORD_ANCHOR_CONF = 55; // a word this confident is certainly real text, not background
const WORD_FLOOR_CONF = 25;  // under this it's noise even on a line that's otherwise real

// Rebuild the read from the words tesseract is actually confident about, keeping line breaks. Returns
// null when there's no per-word data (older output shape) so the caller keeps the raw result.
//
// The unit of judgement is the LINE, not the word. Judging word-by-word silently ate half of real
// reads: stylised game text scores low per word, so "Overcooked! 2" came back as "2" and "Tiny
// Terraces" as "Tiny" — the words were read correctly and then thrown away for being ugly. Background
// junk, on the other hand, sits on lines of its OWN ("AT rs |"). So: a line needs one confident anchor
// to survive at all, and once it has one, its weaker words come along.
function keepConfidentWords(data) {
  if (!data || !Array.isArray(data.blocks)) return null;
  const lines = [];
  let sum = 0, kept = 0;
  for (const block of data.blocks) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const words = line.words || [];
        const anchors = words.filter((word) => (word.confidence || 0) >= WORD_ANCHOR_CONF);
        if (!anchors.length) continue; // nothing here tesseract believes in — background, drop the line
        const text = words
          .filter((word) => (word.confidence || 0) >= WORD_FLOOR_CONF)
          .map((word) => word.text).join(' ');
        if (!text.trim()) continue;
        // Score from the ANCHORS only. They're what proves the line is real, and averaging in the
        // rescued words would drag a good read under the app's quality gate — the exact "Blurry" that
        // dropping them was meant to prevent.
        for (const anchor of anchors) { sum += anchor.confidence; kept++; }
        lines.push(text);
      }
    }
  }
  if (!kept) return null;
  return { text: lines.join('\n'), confidence: sum / kept };
}

// One read at one page-seg mode, already cleaned up. Split out because the vertical race needs to
// run the identical pipeline twice and compare — anything the two passes did differently would
// show up as a confidence difference and pick the wrong winner.
async function readWith(w, blob, psm) {
  await w.setParameters({ tessedit_pageseg_mode: String(psm) });
  // blocks too, not just text: a box dragged around real text almost always catches some
  // background as well, and tesseract reports that scenery as junk "words" ("AT rs |", "TTR").
  // They drag the overall confidence under the app's quality gate, so a good read gets thrown
  // away for company it didn't ask for. Dropping low-confidence words fixes both the text and
  // the score — see keepConfidentWords above.
  const { data } = await w.recognize(blob, {}, { text: true, blocks: true });
  const clean = keepConfidentWords(data);
  if (clean) return clean;
  return {
    text: (data && data.text) || '',
    confidence: (data && typeof data.confidence === 'number') ? data.confidence : 0,
  };
}

window.api.onRecognize(async ({ id, png, lang, debug }) => {
  try {
    const w = await init(lang);
    const rawBlob = new Blob([png], { type: 'image/png' });
    let input;
    try {
      input = await preprocess(png);
    } catch (err) {
      console.error('preprocess failed, falling back to the raw frame:', err);
      // No dimensions on this path, so the shape test below simply never fires and the race falls
      // back to judging by confidence alone.
      input = { blob: rawBlob, w: 0, h: 0 };
    }

    // A READ IS A RACE, not a single answer, because the two things that make a read good pull in
    // opposite directions and neither one wins everywhere:
    //
    //   binarised vs raw — preprocess() exists for game text: small, antialiased, light-on-dark,
    //     over scenery. On that it is decisive (measured on a 12px light-on-dark label: binarised 48%
    //     and the sentence right, raw 38% and "dpen ta chest"). On text that was ALREADY clean and
    //     large — a manga speech bubble, black brush strokes on white paper — the same pass is
    //     destructive: the 3x upscale plus a local threshold turns thick strokes into blobs, and the
    //     same bubble went 80% raw to 75% binarised, reading や as も.
    //   horizontal vs vertical — see VERT_MODEL. Japanese runs both ways and the wrong axis is not a
    //     slightly worse read, it is a different sentence.
    //
    // So: always take the binarised horizontal read (what this file has always done, and the right
    // answer for the overwhelmingly common crop), then add candidates ONLY when there is a reason to
    // doubt it. That keeps the healthy case at exactly one read — live captions fire on a timer and
    // cannot afford four — while the reads that used to dead-end in "Blurry" get the other three.
    const best = await readWith(w, input.blob, PSM_HORIZONTAL);
    const candidates = [];
    // Doubtful score: the binarisation may be what is hurting, so ask the untouched frame too.
    if (best.confidence < RETRY_CONF) candidates.push([rawBlob, PSM_HORIZONTAL]);
    // Japanese, and the crop is taller than it is wide (one column — the common bubble) or the
    // horizontal read is doubtful anyway (a wide panel of several columns is landscape anD vertical).
    // Both frames get the vertical pass: whichever axis is right, the binarise question is still open.
    if (VERT_MODEL[lang] && (input.h > input.w || best.confidence < RETRY_CONF)) {
      candidates.push([input.blob, PSM_VERTICAL], [rawBlob, PSM_VERTICAL]);
    }

    let winner = best;
    for (const [blob, psm] of candidates) {
      try {
        const alt = await readWith(w, blob, psm);
        // Straight confidence comparison, which is fair here only because every candidate is the
        // same crop through the same cleanup — a loser is not a different kind of answer, it is this
        // answer read the wrong way, and tesseract scores that honestly.
        if (alt.confidence > winner.confidence) winner = alt;
      } catch (err) { console.error('OCR candidate failed, keeping the best so far:', err); }
    }
    // Always hand the worker back in its default orientation, or the next crop inherits PSM 5 and
    // reads as gibberish for no visible reason.
    try { await w.setParameters({ tessedit_pageseg_mode: String(PSM_HORIZONTAL) }); } catch {}

    // Only ship the preprocessed image back when debugging a bad read.
    let debugPng = null;
    if (debug) { try { debugPng = new Uint8Array(await input.blob.arrayBuffer()); } catch {} }
    window.api.sendResult({ id, debugPng, text: winner.text, confidence: winner.confidence });
  } catch (err) {
    window.api.sendResult({ id, text: '', error: String((err && err.message) || err) });
  }
});

init();
