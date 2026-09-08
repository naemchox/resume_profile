# Gloss — real-time game translation overlay

An always-on-top desktop overlay that reads text off the screen and translates it in
place. Built for games that never shipped a Thai localisation.

**Stack** — Electron 32 · native Swift (macOS) · PowerShell + Win32 FFI (Windows) ·
Tesseract.js · Anthropic Claude API · Cloudflare Workers

---

## What it does

Press a hotkey, drag a box over the dialogue, and the translation appears over the game
without alt-tabbing. Hovering a word in a Japanese or English capture pops a dictionary
entry inline.

| Source language | macOS (Vision) | Windows OCR | Tesseract fallback | Hover dictionary |
|---|---|---|---|---|
| English | `en-US` | built-in | `eng` | `dict/enth.json` |
| Japanese | `ja-JP` | needs language pack | `jpn` + `jpn_vert` | `dict/jmdict.json` |
| Chinese (simplified) | `zh-Hans` | needs language pack | `chi_sim` | — |
| Korean | `ko-KR` | needs language pack | `kor` | — |
| Thai | `th-TH` | — | — | — |

Targets: Thai, English, Japanese, Chinese, Korean, Spanish, Vietnamese.

The exact support matrix — including which combinations are only *listed* in the menu
versus actually verified — is tracked in [`LANGUAGE-MATRIX.md`](./LANGUAGE-MATRIX.md),
read out of the source rather than from memory.

## Architecture

```
main.js              Electron main process — capture, hotkeys, OCR routing, window management
capabilities.js      Runtime probe: which OCR/TTS backends this machine actually has
renderer/main/       The overlay pill + translation cards + settings
renderer/learn/      Vocabulary review window
native/
  visionocr.swift    macOS Vision framework OCR (compiled with swiftc at build time)
  mousehook.swift    Global mouse position for hover-to-define
  speak.swift        AVSpeechSynthesizer wrapper, shipped as a tiny .app
  winocr.ps1         Windows.Media.Ocr via PowerShell
  winspeak.ps1       SAPI text-to-speech
winhook*.js          Win32 hooks through koffi (FFI) — low-level keyboard and mouse
functions/           Cloudflare Workers: translation proxy, licensing, issue reports
```

Two OCR paths exist on purpose: the OS engine when available (fast, no model download),
Tesseract when not. `capabilities.js` decides at boot and the menu hides what the machine
cannot do.

## Running it

```bash
npm install
npm run build:vision   # swiftc native/visionocr.swift  (macOS only)
npm run build:hook     # swiftc native/mousehook.swift   (macOS only)
npm run build:speak    # swiftc native/speak.swift       (macOS only)
npm start
```

Bring your own Claude API key in Settings, or run OCR-only with no key.

## Building installers

```bash
npm run pack        # unpacked, for local testing
npm run dist:mac    # arm64 + x64 .dmg
npm run dist:win    # .exe
```

`build.artifactName` qualifies macOS output with `${arch}`. Without it both architectures
write `Gloss-mac.dmg`, the second overwrites the first, and `hdiutil detach` then collides
— which is why only arm64 ever made it to a release. The note sits in `package.json` next
to the setting so it does not get "simplified" away again.

## Known constraints

- **Ad-hoc signing resets macOS permissions on every build.** The designated requirement
  is the cdhash, which changes each time, so macOS treats each build as a different app
  and Screen Recording has to be re-granted. A real Developer ID certificate is the fix.
- Windows OCR needs the user to install the language pack for anything but English;
  Tesseract covers the gap at lower accuracy.
