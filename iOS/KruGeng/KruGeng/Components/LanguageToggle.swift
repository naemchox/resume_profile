import SwiftUI

/// The EN/ไทย pill switch, sibling of `ThemeToggle`: a paper track with two
/// segments, the active one filled with the sapphire accent.
struct LanguageToggle: View {
    @Environment(LanguageManager.self) private var lang
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    var body: some View {
        Button {
            Haptics.tap()
            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                lang.toggle()
            }
        } label: {
            HStack(spacing: 0) {
                segment("EN", active: lang.language == .en)
                segment("ไทย", active: lang.language == .th)
            }
            .padding(3)
            .background(
                Capsule()
                    .fill(p.paper)
                    .overlay(Capsule().strokeBorder(p.lineStrong, lineWidth: 1))
            )
            .frame(height: 32)
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(s.switchLanguage)
        .accessibilityValue(lang.language == .en ? "English" : "ไทย")
    }

    private func segment(_ label: String, active: Bool) -> some View {
        Text(label)
            .font(Typeface.sans(11, weight: .semibold))
            .foregroundStyle(active ? p.inkContrast : p.inkSoft)
            .frame(width: 32, height: 26)
            .background {
                if active {
                    Capsule().fill(p.accent)
                }
            }
    }
}
