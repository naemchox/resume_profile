import SwiftUI

/// Native take on the `HeroGeometric` "elegant shapes" backdrop: translucent
/// champagne/sand capsules, rotated and softly blurred, drifting behind the
/// hero copy. Honors Reduce Motion by holding them still.
struct HeroShapes: View {
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animate = false

    private struct Shape {
        let w, h: CGFloat
        let rotation: Double
        let x, y: CGFloat        // unit offsets within the header
        let tint: Double         // accent opacity
        let drift: CGFloat
    }

    private let shapes: [Shape] = [
        .init(w: 360, h: 90, rotation: 12,  x: -0.34, y: -0.22, tint: 0.10, drift: 14),
        .init(w: 260, h: 70, rotation: -16, x:  0.40, y: -0.05, tint: 0.08, drift: -12),
        .init(w: 180, h: 52, rotation: 8,   x: -0.30, y:  0.30, tint: 0.07, drift: 10),
        .init(w: 130, h: 40, rotation: -22, x:  0.30, y:  0.32, tint: 0.06, drift: -9),
    ]

    var body: some View {
        GeometryReader { geo in
            ZStack {
                ForEach(Array(shapes.enumerated()), id: \.offset) { _, s in
                    let px: CGFloat = geo.size.width * (0.5 + s.x)
                    let driftY: CGFloat = animate ? s.drift : 0
                    let py: CGFloat = geo.size.height * (0.5 + s.y) + driftY
                    Capsule()
                        .fill(p.accent.opacity(s.tint))
                        .overlay(Capsule().strokeBorder(p.accent.opacity(0.18), lineWidth: 1))
                        .frame(width: s.w, height: s.h)
                        .rotationEffect(.degrees(s.rotation))
                        .blur(radius: 2)
                        .position(x: px, y: py)
                }
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) {
                    animate = true
                }
            }
        }
        .allowsHitTesting(false)
    }
}
