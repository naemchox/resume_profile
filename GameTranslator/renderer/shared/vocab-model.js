// Shared vocab data-shape helpers — used by the pill AND (from M3 on) the main window.
// Plain script, no ES module — attaches everything to window.GTVocab.
//
// Entry shape (new): { word, meaning, reading, ts, src } — word=source-language word, meaning=
// translation, reading=pronunciation ("" if none), src=the sentence it was pulled from.
// Backward compat: entries saved by the old build are { en, th, ts } (the whole sentence, back when
// ★ saved full payloads). getWord/getMeaning/getReading read either shape so old data never breaks.
(function () {
  const getWord = (v) => (v.word != null ? v.word : v.en) || '';
  const getMeaning = (v) => (v.meaning != null ? v.meaning : v.th) || '';
  const getReading = (v) => v.reading || '';
  const wordKey = (w) => String(w || '').trim().toLowerCase();
  const getSeen = (v) => v.seen || 0;

  // OCR reads whatever was on screen, including things that were never prose: a line of code, a HUD,
  // a menu. Those land in src and are then printed under the word as the sentence it came from —
  // "— *uvn• Alt+K -i History (if C!hoverActive) return) —" was a real card (jek, 2026-08-28), and a
  // line nobody can parse is worst exactly where the reader is trying to go fast.
  //
  // NOT main.js's looksLikeGarbage, and not an oversight that this is a second rule: measured on that
  // exact line, looksLikeGarbage passes it clean — correctly, because that gate decides whether to
  // THROW A READ AWAY and so is tuned to let anything plausible through. This one only decides whether
  // to print an optional context line, so it can afford to be strict: a wrong hide costs a line nobody
  // misses, a wrong keep costs the card the readability it exists for.
  //
  // The tell is symbols welded INTO words. Sentence punctuation around one is ordinary and stays
  // ("glove!!!", "(if", "return)", "old-timey", "I've", "km/h", "/passes"); a *, •, + or a ! in the
  // middle of one is not spelling, it is a misread glyph or a keyboard shortcut.
  const EDGE_PUNCT = '[.,;:!?"\u2018\u2019\u201c\u201d()\[\]\u2026]+';
  const CORE_TRIM = new RegExp('^' + EDGE_PUNCT + '|' + EDGE_PUNCT + '$', 'g');
  const CLEAN_CORE = /^[\p{L}\p{M}\p{N}'\u2019\u2010-\u2015/-]+$/u;
  function looksMangled(text) {
    const words = String(text || '').trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
    if (words.length < 3) return false; // too little to judge; a one-word src is evidence of nothing
    const bad = words.filter((w) => !CLEAN_CORE.test(w.replace(CORE_TRIM, '')));
    return bad.length * 3 >= words.length; // a third of the line unreadable is the whole line
  }

  // The sentence a word came out of, or '' when there is nothing worth printing: no src, an src that
  // IS the word (single-word snips would otherwise print it a third time), or one nobody can read.
  const contextLine = (v) => {
    const src = String((v && v.src) || '').trim();
    if (!src || wordKey(src) === wordKey(getWord(v))) return '';
    return looksMangled(src) ? '' : src;
  };

  // How many encounters count as "known". It was a hard constant, which made the one number the whole
  // known/seen design hangs on unchangeable (jek, 2026-07-30). Both windows call setGradSeen() when
  // settings arrive, so the pill's badge and the learn window's can never disagree.
  let gradSeen = 5;
  const setGradSeen = (n) => { const v = Number(n); if (v >= 2 && v <= 50) gradSeen = Math.round(v); };
  const getGradSeen = () => gradSeen;

  window.GTVocab = { getWord, getMeaning, getReading, wordKey, getSeen, setGradSeen, getGradSeen,
    looksMangled, contextLine,
    // Back-compat name kept as a getter so old reads still work and can never go stale.
    get GRAD_SEEN() { return gradSeen; } };
})();
