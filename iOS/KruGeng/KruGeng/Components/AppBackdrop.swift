import SwiftUI

/// The app-wide canvas: ivory paper lit by a slow sapphire-and-champagne
/// aurora. On iOS 18+ a gently breathing `MeshGradient` does the work; on
/// iOS 17 large blurred glow orbs drift instead. Both stay inside the
/// palette so light reads as warm archival paper and dark as midnight ink
/// with a periwinkle glow. Honors Reduce Motion by holding everything still.
struct AppBackdrop: View {
    @Environment(\.palette) private var p
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Champagne counterpoint to the sapphire accent — warm where the accent
    /// is cool, so the wash doesn't read monochrome.
    private var champagne: Color {
        scheme == .dark ? Color(hex: 0xC9A961) : Color(hex: 0xB89B5A)
    }

    /// Dark needs more glow to register against midnight; light stays faint
    /// so the paper keeps its brightness.
    private var glow: Double { scheme == .dark ? 0.16 : 0.09 }

    var body: some View {
        ZStack {
            p.ivory

            if #available(iOS 18.0, *) {
                meshAurora
            } else {
                orbAurora
            }

            // Settle the page: a whisper of accent pooling at the foot.
            LinearGradient(colors: [.clear, p.accent.opacity(scheme == .dark ? 0.05 : 0.03)],
                           startPoint: .center, endPoint: .bottom)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - iOS 18+: breathing mesh

    @available(iOS 18.0, *)
    private var meshAurora: some View {
        TimelineView(.animation(minimumInterval: 1 / 20, paused: reduceMotion)) { timeline in
            let t = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate
            // Two slow sine phases, offset so the mesh never settles into a loop.
            let a = Float(sin(t / 9)) * 0.08
            let b = Float(cos(t / 12)) * 0.08

            MeshGradient(
                width: 3, height: 3,
                points: [
                    [0, 0],          [0.5, 0],            [1, 0],
                    [0, 0.5 + a],    [0.45 + b, 0.5 - a], [1, 0.5 + b],
                    [0, 1],          [0.5, 1],            [1, 1],
                ],
                colors: [
                    p.accent.opacity(glow), p.ivory.opacity(0), champagne.opacity(glow * 0.7),
                    p.ivory.opacity(0),     p.accentWash.opacity(scheme == .dark ? 0.5 : 0.8), p.ivory.opacity(0),
                    champagne.opacity(glow * 0.5), p.ivory.opacity(0), p.accent.opacity(glow * 0.6),
                ]
            )
        }
    }

    // MARK: - iOS 17 fallback: drifting glow orbs

    @State private var drift = false

    private var orbAurora: some View {
        GeometryReader { geo in
            ZStack {
                Circle()
                    .fill(p.accent.opacity(glow))
                    .frame(width: geo.size.width * 0.9)
                    .blur(radius: 90)
                    .position(x: geo.size.width * (drift ? 0.28 : 0.18),
                              y: geo.size.height * (drift ? 0.10 : 0.02))
                Circle()
                    .fill(champagne.opacity(glow * 0.7))
                    .frame(width: geo.size.width * 0.7)
                    .blur(radius: 80)
                    .position(x: geo.size.width * (drift ? 0.85 : 0.95),
                              y: geo.size.height * (drift ? 0.30 : 0.22))
                Circle()
                    .fill(p.accent.opacity(glow * 0.5))
                    .frame(width: geo.size.width * 0.8)
                    .blur(radius: 100)
                    .position(x: geo.size.width * (drift ? 0.70 : 0.60),
                              y: geo.size.height * (drift ? 0.92 : 1.00))
            }
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 14).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }
}
