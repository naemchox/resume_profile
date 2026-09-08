// Audit helper (dev-only, never shipped): read or move the real mouse pointer.
// The audit needs one thing it cannot otherwise control — where the actual cursor is. Half these
// checks ask "does this hide when nobody is there", and a pointer parked on the pill makes the
// honest answer "no". Without this the suite failed at random depending on where the mouse was left.
import CoreGraphics
let a = CommandLine.arguments
if a.count >= 3, let x = Double(a[1]), let y = Double(a[2]) {
  CGWarpMouseCursorPosition(CGPoint(x: x, y: y))
  CGAssociateMouseAndMouseCursorPosition(boolean_t(1))
} else if let p = CGEvent(source: nil)?.location {
  print("\(Int(p.x)) \(Int(p.y))")
}
