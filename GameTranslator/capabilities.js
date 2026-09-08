// Platform capabilities that MORE THAN ONE process has to agree about.
//
// The rule this file exists to prevent: main.js deciding a feature can run while the renderer draws
// (or hides) the button for it from its own separate platform test. Two copies of one rule is two
// places to update and one bug the day only one of them is. main.js requires this, and so does
// preload-main.js — a preload runs in the renderer process but is still Node, so both surfaces read
// the SAME expression rather than each re-deriving it from process.platform.
//
// Everything here answers "can this machine physically do X", never "should we offer X" — that
// second question belongs to settings and the UI.

// Point-at-a-word needs an OCR engine that reports per-character geometry:
//   Windows  Windows.Media.Ocr via native/winocr.ps1 — {"boxes":true} on the request
//   macOS    Vision via native/visionocr.swift — the ";boxes" suffix on the language line
// Linux has neither engine, so the mode is genuinely unavailable there rather than merely unbuilt.
const HOVER_CAPABLE = process.platform === 'win32' || process.platform === 'darwin';

// Reading THAI off the screen. macOS Vision lists th-TH among its accurate-mode languages (measured
// 2026-08-15 via supportedRecognitionLanguages), and it is the only engine here that can: Tesseract
// would need a tha.traineddata this app does not ship, and the Windows engine is not offering it
// either. So Thai is a source language on macOS and nowhere else — the picker must not list a
// language the machine cannot read, and the swap arrow must not offer a direction that leads there.
const THAI_SOURCE = process.platform === 'darwin';

// The English→Thai edition. Every engine in here can read four scripts and translate into seven
// languages, and exactly ONE of those 35 pairs has ever been watched working end to end
// (LANGUAGE-MATRIX.md). Two of the four source languages have no hover dictionary at all, so picking
// them turns a whole feature off with nothing on screen saying so. Offering a menu of 35 promises we
// cannot check is worse for the person who paid than shipping the one pair we can stand behind.
//
// This locks the PRODUCT, not the engines: nothing below the UI was removed, so unlocking is one
// env var, and the day a second pair has been watched working it becomes a list instead of a pair.
// Unlocking a PACKAGED build takes more than this env var: package.json ships only eng.traineddata
// and excludes dict/jmdict.json (28MB) precisely because this lock exists, so the other languages
// would have no data to read with. Put those back in the same commit that widens the pair.
const PAIR_LOCK = process.env.GLOSS_ALL_LANGS === '1' ? null : { sourceLang: 'eng', targetLang: 'th' };

module.exports = { HOVER_CAPABLE, THAI_SOURCE, PAIR_LOCK };
