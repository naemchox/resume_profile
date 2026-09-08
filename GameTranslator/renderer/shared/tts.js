// Shared pronunciation (TTS) helpers — used by the pill AND (from M3 on) the main window.
// Plain script, no ES module — attaches everything to window.GTTts.
(function () {
  // Which speechSynthesis lang to use for a word, guessed from its script. Best-effort only — if the
  // OS has no matching voice installed, speechSynthesis just falls back silently.
  function guessSpeakLang(word, reading) {
    const w = String(word || '');
    // A kana reading (furigana from the OCR) means it's Japanese even when the word itself is all
    // kanji — otherwise kanji-only JP words (会社, 学校…) would be read aloud as Chinese.
    if (/[぀-ヿ]/.test(w) || /[぀-ヿ]/.test(String(reading || ''))) return 'ja-JP';
    if (/[가-힣]/.test(w)) return 'ko-KR';        // Hangul => Korean
    if (/[㐀-鿿]/.test(w)) return 'zh-CN';        // CJK ideographs w/o kana => Chinese
    return 'en-US';
  }

  // Pick the best installed voice for a language — the bare default is often the lowest-quality
  // robot voice on the system ("so wrecked"). Prefer the known good macOS voices, then any local one.
  function pickVoice(lang) {
    try {
      const all = speechSynthesis.getVoices();
      const base = lang.split('-')[0];
      const match = all.filter(v => v.lang && v.lang.toLowerCase().startsWith(base));
      // Named voices worth having, macOS first then the Windows equivalents. Windows had none of its
      // own here, so on Windows this test never matched and every language fell through to "first
      // local voice", which is the flat robot the list exists to avoid. Zira/David are the English
      // pair, then Japanese, Chinese, Korean and Thai.
      const good = (v) => /Samantha|Ava|Allison|Zoe|Kyoko|Yuna|Meijia|Tingting|Ting-Ting|Kanya|Narisa|Zira|David|Mark|Haruka|Ayumi|Ichiro|Huihui|Yaoyao|Kangkang|Heami|Pattara/i.test(v.name);
      // localService FIRST among the good ones. Some of these names also exist as cloud voices
      // ("Microsoft Ava Online (Natural)"), and a cloud voice with no connection plays nothing at all
      // and reports nothing — a pronounce button that is simply dead. Measured here (Electron 32.3.3,
      // Win11): this machine exposes only local SAPI voices, so the order costs nothing where it isn't
      // needed and saves the feature where it is.
      return match.find(v => good(v) && v.localService)
        || match.find(v => v.localService)
        || match.find(good)
        || match[0] || null;
    } catch { return null; }
  }
  try { speechSynthesis.getVoices(); } catch {} // warm the voice list (it loads async the first time)

  // How loud the pronounce button is, 0..1. This is a LOWER-ONLY control and the spec is why:
  // SpeechSynthesisUtterance.volume tops out at 1, which is what an unset utterance already is — so
  // there is no "louder", only "not as loud as the game". That is the direction that was missing
  // anyway (jek, 2026-08-09): the voice arrives at full strength over whatever you are playing, and
  // the only place to turn it down was Windows' volume mixer, per-app and three menus deep.
  // Starts at 1 so nothing changes for anyone who never touches it.
  let volume = 1;
  function setVolume(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    volume = Math.min(1, Math.max(0, n));
  }

  function speakText(text, reading) {
    try {
      // OCR text carries newlines/stray punctuation the synthesizer reads out loud — clean it first.
      const clean = String(text).replace(/\s+/g, ' ').replace(/[|_~^<>{}\\]/g, '').trim();
      if (!clean) return;
      const u = new SpeechSynthesisUtterance(clean);
      u.lang = guessSpeakLang(clean, reading || '');
      const v = pickVoice(u.lang);
      if (v) u.voice = v;
      u.rate = 0.95;
      u.volume = volume;
      // At 0 the platform still queues and "speaks" a silent utterance, which leaves the button's
      // 500ms speaking pulse firing over nothing. Muted means muted — don't pretend.
      if (volume <= 0) { try { speechSynthesis.cancel(); } catch {} return; }
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {}
  }

  window.GTTts = { pickVoice, guessSpeakLang, speakText, setVolume };
})();
