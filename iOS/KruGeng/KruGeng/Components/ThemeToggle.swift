import SwiftUI

/// The floating pill theme switch (`.theme-toggle`): a 64×32 track with a
/// champagne knob that slides — right with a sun in light mode, left with a
/// moon in dark — driven by the live `ThemeManager` state.
struct ThemeToggle: View {
    @Environment(ThemeManager.self) private var theme
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.palette) private var p

    private var dark: Bool { theme.isDark(systemScheme: systemScheme) }

    var body: some View {
        Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                theme.toggle(systemScheme: systemScheme)
            }
        } label: {
            ZStack {
                Capsule()
                    .fill(p.paper)
                    .overlay(Capsule().strokeBorder(p.lineStrong, lineWidth: 1))

                Image(systemName: dark ? "moon.fill" : "sun.max.fill")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(p.inkContrast)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(p.accent))
                    .offset(x: dark ? -16 : 16)
            }
            .frame(width: 64, height: 32)
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Toggle dark mode")
        .accessibilityValue(dark ? "Dark" : "Light")
    }
}
