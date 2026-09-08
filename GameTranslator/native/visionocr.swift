import Foundation
import Vision
import AppKit

// Usage:
//   visionocr <img-path|-> [langs]   one-shot: OCR a single image, print text, exit.
//   visionocr --serve                long-running server: loop reading one request at a
//     time from stdin (langCode line, then a 4-byte big-endian length, then that many PNG
//     bytes), OCR it, write one line of JSON `{"text":"..."}\n` to stdout, repeat until
//     stdin closes. Avoids paying process-spawn cost (~150-200ms) per OCR call — the caller
//     (main.js) keeps this one process alive and pipes requests/responses through it.
let args = CommandLine.arguments

func recognize(cg: CGImage, langs: [String]) throws -> [VNRecognizedTextObservation] {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = true
  if !langs.isEmpty { req.recognitionLanguages = langs }
  let handler = VNImageRequestHandler(cgImage: cg, options: [:])
  try handler.perform([req])
  return req.results ?? []
}

func performOCR(cg: CGImage, langs: [String]) throws -> String {
  let lines = try recognize(cg: cg, langs: langs).compactMap { $0.topCandidates(1).first?.string }
  return lines.joined(separator: "\n")
}

// Per-character geometry for hover-a-word lookup. Vision hands out a box for any SUBRANGE of a
// candidate (`boundingBox(for:)`), so we ask for one character at a time and hand the caller a
// table of "character i of this line lives in this rectangle". The renderer never OCRs on mouse
// move — it hit-tests this table, which is why hovering feels instant.
//
// Coordinates come out of Vision normalized with a BOTTOM-left origin; everything on the JS side
// (screen points, CSS) is top-left, so flip y here once rather than in three call sites.
//
// The array is parallel to `Array.from(text)` in JS — both walk unicode scalars/graphemes, which
// agree for the CJK + kana this is built for.
func charBoxes(_ candidate: VNRecognizedText) -> [[Double]] {
  let text = candidate.string
  var out: [[Double]] = []
  out.reserveCapacity(text.count)
  var i = text.startIndex
  while i < text.endIndex {
    let next = text.index(after: i)
    if let rect = try? candidate.boundingBox(for: i..<next) {
      let bb = rect.boundingBox
      out.append([
        round(bb.minX * 1e5) / 1e5,
        round((1 - bb.maxY) * 1e5) / 1e5,
        round(bb.width * 1e5) / 1e5,
        round(bb.height * 1e5) / 1e5,
      ])
    } else {
      out.append([]) // keep the index aligned with the string even when Vision won't answer
    }
    i = next
  }
  return out
}

// Reads exactly `count` bytes from `handle`, looping over short reads (pipes deliver data in
// arbitrary chunk sizes). Returns nil on EOF before `count` bytes were seen.
func readExactly(_ handle: FileHandle, _ count: Int) -> Data? {
  if count == 0 { return Data() }
  var buf = Data()
  while buf.count < count {
    let chunk = handle.readData(ofLength: count - buf.count)
    if chunk.isEmpty { return nil } // EOF / pipe closed
    buf.append(chunk)
  }
  return buf
}

if args.count >= 2 && args[1] == "--serve" {
  let stdin = FileHandle.standardInput
  let stdout = FileHandle.standardOutput

  serverLoop: while true {
    // 1) langCode line, byte-at-a-time up to '\n' (it's a handful of bytes, e.g. "ja-JP").
    var langBytes = Data()
    while true {
      guard let b = readExactly(stdin, 1) else { break serverLoop } // EOF: stdin closed, exit cleanly
      if b[0] == 0x0A { break }
      langBytes.append(b)
    }
    // "ja-JP" — plain read. "ja-JP;boxes" — also return per-line/per-character geometry, which the
    // hover-a-word path needs and the ordinary translate path would only pay for.
    var langLine = String(data: langBytes, encoding: .utf8) ?? ""
    var wantBoxes = false
    if let semi = langLine.firstIndex(of: ";") {
      wantBoxes = langLine[langLine.index(after: semi)...].contains("boxes")
      langLine = String(langLine[..<semi])
    }
    let langs = langLine.isEmpty ? [] : langLine.split(separator: ",").map(String.init)

    // 2) 4-byte big-endian PNG length.
    guard let lenData = readExactly(stdin, 4) else { break }
    let len = lenData.reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    if len > 64 * 1024 * 1024 {
      FileHandle.standardError.write("vision server: refusing absurd length \(len)\n".data(using: .utf8)!)
      break
    }

    // 3) PNG bytes.
    guard let imgData = readExactly(stdin, Int(len)) else { break }

    var text = ""
    var lines: [[String: Any]] = []
    if let img = NSImage(data: imgData), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) {
      let obs = (try? recognize(cg: cg, langs: langs)) ?? []
      let candidates = obs.compactMap { $0.topCandidates(1).first }
      text = candidates.map { $0.string }.joined(separator: "\n")
      if wantBoxes {
        for c in candidates {
          lines.append(["t": c.string, "c": charBoxes(c)])
        }
      }
    }

    // JSONSerialization rather than hand-rolled escaping: recognized text can carry quotes,
    // backslashes and control characters, and one malformed line desynchronizes the whole
    // stdout stream (the reader splits on '\n'). Falls back to the empty result, never to
    // broken JSON.
    var payload: [String: Any] = ["text": text]
    if wantBoxes { payload["lines"] = lines }
    let data = (try? JSONSerialization.data(withJSONObject: payload, options: []))
      ?? "{\"text\":\"\"}".data(using: .utf8)!
    stdout.write(data)
    stdout.write("\n".data(using: .utf8)!)
  }
  exit(0)
}

// ---------- one-shot mode (unchanged fallback path) ----------
let pathArg: String? = args.count >= 2 ? args[1] : nil
let langs = args.count >= 3 ? args[2].split(separator: ",").map(String.init) : []

func loadImage() -> NSImage? {
  if let pathArg = pathArg, pathArg != "-" {
    return NSImage(contentsOfFile: pathArg)
  }
  // Read all of stdin as raw PNG bytes.
  let data = FileHandle.standardInput.readDataToEndOfFile()
  guard !data.isEmpty else { return nil }
  return NSImage(data: data)
}

guard let img = loadImage(), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
  FileHandle.standardError.write("cannot load image\n".data(using: .utf8)!)
  exit(1)
}

do {
  let text = try performOCR(cg: cg, langs: langs)
  print(text)
} catch {
  FileHandle.standardError.write("ocr failed: \(error)\n".data(using: .utf8)!)
  exit(1)
}
