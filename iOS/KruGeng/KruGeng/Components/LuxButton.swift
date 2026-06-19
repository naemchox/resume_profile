import SwiftUI

/// Pill buttons ported from the CSS button rules: a solid ink primary with a
/// soft top-light gradient and lifted shadow, a hairline-bordered secondary, a
/// compact `small` size, and an indeterminate sweep bar for async `loading`
/// state. Every tap gives light haptic feedback and a spring press-scale.
struct LuxButton: View {
    enum Variant { case primary, secondary }
    enum Size { case regular, small }

    let title: String
    var variant: Variant = .primary
    var size: Size = .regular
    var loading: Bool = false
    var fullWidth: Bool = false
    let action: () -> Void

    @Environment(\.palette) private var p
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Text(title)
                .font(Typeface.sans(size == .small ? 13 : 15, weight: .medium))
                .tracking(0.2)
                .lineLimit(1)
                .padding(.horizontal, size == .small ? 18 : 26)
                .padding(.vertical, size == .small ? 10 : 14)
                .frame(maxWidth: fullWidth ? .infinity : nil)
                .foregroundStyle(foreground)
                .background(background)
                .overlay(
                    Capsule(style: .continuous).strokeBorder(border, lineWidth: 1)
                )
                .overlay(alignment: .bottom) {
                    if loading { SweepBar().clipShape(Capsule()) }
                }
                .opacity(isEnabled ? 1 : 0.5)
        }
        .buttonStyle(PressStyle())
        .disabled(loading)
    }

    private var foreground: Color {
        variant == .primary ? p.inkContrast : p.ink
    }

    @ViewBuilder private var background: some View {
        if variant == .primary {
            Capsule(style: .continuous)
                .fill(LinearGradient(colors: [p.ink.opacity(0.86), p.ink],
                                     startPoint: .top, endPoint: .bottom))
                .shadow(color: p.ink.opacity(0.22), radius: 10, y: 5)
        } else {
            Capsule(style: .continuous).fill(p.paper.opacity(0.6))
        }
    }

    private var border: Color {
        variant == .primary ? p.ink : p.lineStrong
    }
}

/// Press feedback: a slight sink plus spring scale (the CSS
/// `:active { translateY(1px) }`, made tactile).
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .offset(y: configuration.isPressed ? 1 : 0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// The champagne indeterminate progress sweep on `button.loading`.
private struct SweepBar: View {
    @Environment(\.palette) private var p
    @State private var phase: CGFloat = -1

    var body: some View {
        GeometryReader { geo in
            LinearGradient(
                colors: [.clear, p.accent, .clear],
                startPoint: .leading, endPoint: .trailing
            )
            .frame(width: geo.size.width * 0.4, height: 3)
            .offset(x: phase * geo.size.width)
            .onAppear {
                withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: false)) {
                    phase = 1.4
                }
            }
        }
        .frame(height: 3)
    }
}
