import SwiftUI

/// The hero: eyebrow, the "Geng" serif wordmark over a soft champagne glow, the
/// descriptive lede, and a small diamond ornament — all over the drifting
/// `HeroShapes` backdrop.
struct HeaderView: View {
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    var body: some View {
        ZStack {
            HeroShapes()

            // Soft champagne glow pooling behind the wordmark.
            Ellipse()
                .fill(p.accent.opacity(0.14))
                .frame(width: 320, height: 200)
                .blur(radius: 70)

            VStack(spacing: 18) {
                // Flanking rules drop out where the tracked caption alone
                // barely fits (iPhone widths).
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 12) {
                        line
                        eyebrow
                        line
                    }
                    eyebrow
                }

                Text("Geng")
                    .font(Typeface.serif(64, weight: .medium))
                    .foregroundStyle(p.ink)
                    .multilineTextAlignment(.center)
                    .shadow(color: p.accent.opacity(0.18), radius: 24, y: 8)

                Text(s.heroLede)
                    .font(Typeface.sans(16, weight: .light))
                    .foregroundStyle(p.inkSoft)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
                    .frame(maxWidth: 520)

                ornament
                    .padding(.top, 4)
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 26)
        }
        .frame(maxWidth: .infinity)
    }

    private var eyebrow: some View {
        Text(s.eyebrow)
            .luxEyebrow()
            .foregroundStyle(p.accentDeep)
            .lineLimit(1)
    }

    private var line: some View {
        Rectangle()
            .fill(LinearGradient(colors: [.clear, p.lineStrong, .clear],
                                 startPoint: .leading, endPoint: .trailing))
            .frame(width: 34, height: 1)
    }

    /// Thin rules meeting a small champagne diamond — the classic atelier mark.
    private var ornament: some View {
        HStack(spacing: 10) {
            Rectangle()
                .fill(LinearGradient(colors: [.clear, p.accent.opacity(0.6)],
                                     startPoint: .leading, endPoint: .trailing))
                .frame(width: 44, height: 1)
            Rectangle()
                .fill(p.accent)
                .frame(width: 5, height: 5)
                .rotationEffect(.degrees(45))
            Rectangle()
                .fill(LinearGradient(colors: [p.accent.opacity(0.6), .clear],
                                     startPoint: .leading, endPoint: .trailing))
                .frame(width: 44, height: 1)
        }
    }
}
