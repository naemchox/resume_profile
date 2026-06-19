import SwiftUI

/// A `.panel` card: paper surface, accent-glazed hairline border, layered
/// shadows and a serif title prefixed by the step badge. `done` turns the
/// step badge into a checkmark. Panels are always open and interactive —
/// actions that need missing inputs disable themselves with a hint instead.
struct Panel<Content: View>: View {
    let step: Int
    let title: String
    var subtitle: String? = nil
    var done: Bool = false
    @ViewBuilder var content: Content

    @Environment(\.palette) private var p

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 14) {
                StepNumber(step, done: done)
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(title)
                        .font(Typeface.serif(24, weight: .medium))
                        .foregroundStyle(p.ink)
                    if let subtitle {
                        Text(subtitle)
                            .font(Typeface.sans(13))
                            .foregroundStyle(p.inkFaint)
                    }
                }
                Spacer(minLength: 0)
            }

            headerRule
                .padding(.vertical, 18)
            content
                .transition(.opacity)
        }
        .padding(26)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(p.paper)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(p.accentEdge, lineWidth: 1)
        )
        .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
        .shadow(color: .black.opacity(0.07), radius: 24, y: 14)
        .animation(.spring(response: 0.5, dampingFraction: 0.85), value: done)
    }

    /// Hairline under the title that starts champagne and dissolves rightward.
    private var headerRule: some View {
        Rectangle()
            .fill(LinearGradient(colors: [p.accent.opacity(0.45), p.line, p.line.opacity(0)],
                                 startPoint: .leading, endPoint: .trailing))
            .frame(height: 1)
    }
}

/// The italic serif number-in-a-circle badge from `.step-num`. When `done`,
/// it fills with the accent gradient and shows a checkmark.
struct StepNumber: View {
    let n: Int
    var done: Bool = false
    @Environment(\.palette) private var p

    init(_ n: Int, done: Bool = false) {
        self.n = n
        self.done = done
    }

    var body: some View {
        ZStack {
            Circle().fill(done ? AnyShapeStyle(p.accentFill) : AnyShapeStyle(p.accentWash))
            if done {
                Image(systemName: "checkmark")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(p.inkContrast)
                    .transition(.scale.combined(with: .opacity))
            } else {
                Text("\(n)")
                    .font(Typeface.serif(18, weight: .regular, italic: true))
                    .foregroundStyle(p.accentDeep)
            }
        }
        .frame(width: 42, height: 42)
        .overlay(Circle().strokeBorder(p.accent.opacity(done ? 0 : 0.35), lineWidth: 1))
        .shadow(color: done ? p.accent.opacity(0.4) : .clear, radius: 8, y: 3)
    }
}
