import Foundation
import AppKit
import ApplicationServices

// One global trigger (macOS only): Control + Option (⌃⌥) held + cursor move — no click needed, so it
// works the same on a trackpad or a mouse. The keys arm/disarm; .mouseMoved supplies the position
// while armed. Windows runs the same gesture through winkeyhook.js and this same wire protocol.
//
// Usage: mousehook [modifiers]
//   modifiers -> comma-separated arming set, e.g. "control,alternate" (default when omitted).
//   No Accessibility permission -> prints "PERM_NEEDED\n" and exits 2 (caller decides what to do,
//   e.g. show a dialog pointing at System Settings > Privacy & Security > Accessibility).
//   Permission granted -> installs a LISTEN-ONLY CGEventTap on the session event tap and streams
//   one line per event to stdout: "down x y" / "move x y" / "up x y" (event.location — global
//   display points, top-left origin, DIP — same space Electron's screen.getCursorScreenPoint()
//   reports in).
//
// listenOnly means we never swallow the event — every other app's own use of ⌃/⌥ keeps working
// exactly as before.

let stdout = FileHandle.standardOutput
func emit(_ s: String) {
  stdout.write(s.data(using: .utf8)!)
}

// -- 1) Accessibility permission check --------------------------------------------------------
let checkOptions: NSDictionary = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as NSString: true]
let trusted = AXIsProcessTrustedWithOptions(checkOptions)
if !trusted {
  emit("PERM_NEEDED\n")
  exit(2)
}

// -- 2) Event tap -------------------------------------------------------------------------------
// Throttle move lines (both sources) to ~60fps (16ms) — down/up always emit immediately.
var lastMoveEmitMs: Double = 0
func nowMs() -> Double { return Date().timeIntervalSince1970 * 1000.0 }

// Which modifiers arm the gesture. The app passes them as argv[1] ("control,alternate") because the
// trigger is a setting now, not a constant: the same slot in Settings can hold ⌘⇧S (press, then
// drag) or a modifier-only combo like this one (hold, then drag), and only the user knows which one
// their hand wants. An absent or unparseable argument falls back to ⌃⌥ — what every build before
// the trigger became rebindable used, so an old app talking to a new hook still works.
let comboMask: CGEventFlags = {
  var flags: CGEventFlags = []
  for name in (CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "").split(separator: ",") {
    switch name.lowercased() {
    case "control": flags.insert(.maskControl)
    case "alternate", "alt", "option": flags.insert(.maskAlternate)
    case "shift": flags.insert(.maskShift)
    case "command", "meta", "cmd": flags.insert(.maskCommand)
    default: break
    }
  }
  return flags.isEmpty ? [.maskControl, .maskAlternate] : flags
}()

// Combo state — set by .flagsChanged, read by .mouseMoved. Generic masks (either side counts) are
// enough for the MVP; left/right could be pinned down via keycode 59/58 on .keyDown/.keyUp if it
// ever matters, but flagsChanged doesn't carry a clean per-side signal.
var comboActive = false
func isComboFlags(_ flags: CGEventFlags) -> Bool {
  // Every armed modifier must be down. Extras are allowed on purpose: a user who holds ⌃⌥ while
  // ⇧-selecting something else should not have the gesture blink off under them.
  return flags.intersection(comboMask) == comboMask
}

// Only the two event types the ⌃⌥ trigger needs. The middle-button events used to be tapped here as
// a second, equivalent trigger; it was cut because it did nothing ⌃⌥ doesn't already do, needed a
// mouse with a middle button, and having two gestures for one action was mostly a source of "so
// which one am I supposed to press".
let mask: CGEventMask =
  (1 << CGEventType.flagsChanged.rawValue) |
  (1 << CGEventType.mouseMoved.rawValue)

func handleEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
  // The tap can be disabled by the system (e.g. after a timeout warning) — re-enable it so a
  // long-running hook never silently goes deaf.
  if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
    if let refcon = refcon {
      let tap = refcon.assumingMemoryBound(to: CFMachPort?.self).pointee
      if let tap = tap { CGEvent.tapEnable(tap: tap, enable: true) }
    }
    return Unmanaged.passRetained(event)
  }

  let loc = event.location // global display points, top-left origin — same space as Electron
  let x = Int(loc.x.rounded())
  let y = Int(loc.y.rounded())

  switch type {
  case .flagsChanged:
    let active = isComboFlags(event.flags)
    if active && !comboActive {
      comboActive = true
      emit("down \(x) \(y)\n")
    } else if !active && comboActive {
      comboActive = false
      emit("up \(x) \(y)\n")
    }
  case .mouseMoved:
    if comboActive {
      let t = nowMs()
      if t - lastMoveEmitMs >= 16 {
        lastMoveEmitMs = t
        emit("move \(x) \(y)\n")
      }
    }
  default:
    break
  }
  return Unmanaged.passRetained(event) // listenOnly: never consume — every other app still sees it
}

var tapRef: CFMachPort? = nil
withUnsafeMutablePointer(to: &tapRef) { tapPtr in
  guard let tap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: mask,
    callback: handleEvent,
    userInfo: UnsafeMutableRawPointer(tapPtr)
  ) else {
    FileHandle.standardError.write("mousehook: failed to create event tap\n".data(using: .utf8)!)
    exit(1)
  }
  tapPtr.pointee = tap
  let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
  CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
  CGEvent.tapEnable(tap: tap, enable: true)
  CFRunLoopRun()
}
