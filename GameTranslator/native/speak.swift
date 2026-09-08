import Foundation
import Speech
import AVFoundation

// speak — hold-a-key-and-talk dictation for GameTranslator (macOS only).
//
//   speak <locale>            e.g. speak en-US   (defaults to en-US)
//
// Streams one JSON line per event to stdout and exits when the phrase is done:
//   {"state":"ready"}                 mic is live — safe to show "Listening…"
//   {"partial":"half a sentence"}     interim text, updates as you talk
//   {"final":"the whole sentence"}    what you said; process exits right after
//   {"error":"mic"|"speech"|"engine"|"network"} permission, hardware, or no connection (server-path
//                                     locales only — an on-device locale never needs one)
//
// Why a separate .app bundle and not a plain binary: asking for speech recognition without
// NSSpeechRecognitionUsageDescription in the REQUESTING process's Info.plist is an immediate crash,
// and Electron's bundled plist has the microphone key but not the speech one. Owning our bundle also
// means the permission prompt names this helper instead of "Electron".
//
// Recognition is forced on-device where the locale supports it: nothing is sent to Apple's servers,
// it keeps working offline, and there is no per-request latency spike mid-sentence.

// Stop this long after the last new word — the "I'm done" signal. This IS the wait you feel after
// speaking (the translation itself measures ~150ms), so it wants to be short — but 0.8s, which is
// what it was, is short enough to guillotine ordinary speech: a pause to think, a word searched for,
// a breath. Apple Dictation ends at 30s and is widely disliked for cutting people off mid-sentence,
// so being forty times tighter than the thing people complain about was not a defensible place to
// sit. Pressing the shortcut again still ends the phrase instantly and skips the wait entirely, so
// the impatient path is a keypress away. Keep in step with EndSilenceTimeout in native/winspeak.ps1.
// (jek, 2026-08-07 — needs `npm run build:speak` on a Mac to take effect; the shipped Speak.app is
// compiled, so editing this file alone changes nothing.)
let SILENCE_STOP: TimeInterval = 2.0
let NO_SPEECH_STOP: TimeInterval = 6.0 // opened the mic and said nothing — give up instead of holding it
let HARD_CAP: TimeInterval = 30.0      // never listen longer than this, whatever happens

let localeId = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "en-US"

let stdoutQueue = DispatchQueue(label: "gt.speak.out")
func emit(_ obj: [String: Any]) {
  guard let data = try? JSONSerialization.data(withJSONObject: obj),
        var line = String(data: data, encoding: .utf8) else { return }
  line += "\n"
  stdoutQueue.sync { FileHandle.standardOutput.write(line.data(using: .utf8)!) }
}

func die(_ code: String) -> Never {
  emit(["error": code])
  exit(1)
}

let engine = AVAudioEngine()
var request: SFSpeechAudioBufferRecognitionRequest?
var task: SFSpeechRecognitionTask?
var lastText = ""
var lastChange = Date()
var finished = false

func finish() {
  guard !finished else { return }
  finished = true
  engine.stop()
  engine.inputNode.removeTap(onBus: 0)
  request?.endAudio()
  task?.finish()
  emit(["final": lastText])
  // Give the write a beat to flush before the process disappears.
  DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { exit(0) }
}

func start() {
  guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeId)), recognizer.isAvailable else {
    die("recognizer")
  }
  let req = SFSpeechAudioBufferRecognitionRequest()
  req.shouldReportPartialResults = true
  // On-device when the locale has the model installed; falls back to the server path otherwise.
  if recognizer.supportsOnDeviceRecognition { req.requiresOnDeviceRecognition = true }
  request = req

  let input = engine.inputNode
  let format = input.outputFormat(forBus: 0)
  guard format.sampleRate > 0 else { die("engine") }
  input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
    req.append(buffer)
  }
  engine.prepare()
  do { try engine.start() } catch { die("engine") }

  task = recognizer.recognitionTask(with: req) { result, error in
    if let result = result {
      let text = result.bestTranscription.formattedString
      if text != lastText {
        lastText = text
        lastChange = Date()
        emit(["partial": text])
      }
      if result.isFinal { finish() }
    }
    if let error = error {
      // A locale WITHOUT an on-device model goes to Apple's servers (see requiresOnDeviceRecognition
      // above), so it needs a connection — and with none, the task simply errored and finish() emitted
      // an empty final, which the app reports as "Heard nothing". That reads as "your mic didn't pick
      // you up" and sends the user at the microphone instead of the Wi-Fi. Only claim it when nothing
      // was heard: an error AFTER words have arrived should still keep the words. (jek, 2026-08-07)
      let ns = error as NSError
      let offline = ns.domain == NSURLErrorDomain
        || ns.code == NSURLErrorNotConnectedToInternet
        || ns.localizedDescription.range(of: "network", options: .caseInsensitive) != nil
      if offline && lastText.isEmpty && !finished { finished = true; die("network") }
      finish()
    }
  }
  emit(["state": "ready"])

  // Silence watchdog + hard cap. Speaking again before SILENCE_STOP keeps the phrase going.
  let began = Date()
  Timer.scheduledTimer(withTimeInterval: 0.2, repeats: true) { t in
    if finished { t.invalidate(); return }
    let quietFor = Date().timeIntervalSince(lastChange)
    let elapsed = Date().timeIntervalSince(began)
    let doneTalking = !lastText.isEmpty && quietFor > SILENCE_STOP
    let neverStarted = lastText.isEmpty && elapsed > NO_SPEECH_STOP
    if doneTalking || neverStarted || elapsed > HARD_CAP {
      t.invalidate()
      finish()
    }
  }
}

// "stop" on stdin ends the phrase early — that's what pressing the shortcut a second time sends.
// EOF (the parent died) ends it too, so a crashed app never leaves the mic hot.
let stdinHandle = FileHandle.standardInput
stdinHandle.readabilityHandler = { h in
  let data = h.availableData
  if data.isEmpty { DispatchQueue.main.async { finish() }; return }
  if let s = String(data: data, encoding: .utf8), s.contains("stop") {
    DispatchQueue.main.async { finish() }
  }
}

SFSpeechRecognizer.requestAuthorization { status in
  guard status == .authorized else { die("speech") }
  AVCaptureDevice.requestAccess(for: .audio) { granted in
    guard granted else { die("mic") }
    DispatchQueue.main.async { start() }
  }
}

RunLoop.main.run()
