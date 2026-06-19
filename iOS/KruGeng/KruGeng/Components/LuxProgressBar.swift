import SwiftUI

/// The `.progress` track + champagne gradient fill with a moving light shimmer
/// and a live percent readout — used for model download, separation and
/// transcription progress.
struct LuxProgressBar: View {
    /// 0...1
    let value: Double
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shimmer: CGFloat = -0.4

    private var clamped: Double { max(0, min(1, value)) }

    var body: some View {
        HStack(spacing: 10) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.line)
                    Capsule()
                        .fill(LinearGradient(colors: [p.accent, p.accentDeep],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(6, clamped * geo.size.width))
                        .overlay(alignment: .leading) {
                            LinearGradient(colors: [.clear, .white.opacity(0.45), .clear],
                                           startPoint: .leading, endPoint: .trailing)
                                .frame(width: geo.size.width * 0.25)
                                .offset(x: shimmer * geo.size.width)
                        }
                        .clipShape(Capsule())
                        .animation(.easeOut(duration: 0.3), value: value)
                }
            }
            .frame(height: 6)

            Text("\(Int(clamped * 100))%")
                .font(Typeface.sans(12, weight: .medium).monospacedDigit())
                .foregroundStyle(p.accentDeep)
                .frame(width: 38, alignment: .trailing)
        }
        .frame(minWidth: 150)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) {
                shimmer = 1.2
            }
        }
    }
}
