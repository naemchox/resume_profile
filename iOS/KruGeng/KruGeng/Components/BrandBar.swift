import SwiftUI

/// Compact top bar for the wizard. Leading: the library button and the serif
/// "Geng" wordmark with its sapphire diamond (wordmark hidden on the upload
/// step, where the full hero carries the name). Trailing: language and theme
/// toggles.
struct BrandBar: View {
    var showWordmark: Bool = true
    var onLibrary: () -> Void

    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    var body: some View {
        HStack(spacing: 10) {
            libraryButton
            if showWordmark {
                HStack(spacing: 8) {
                    Rectangle()
                        .fill(p.accent)
                        .frame(width: 5, height: 5)
                        .rotationEffect(.degrees(45))
                    Text("Geng")
                        .font(Typeface.serif(22, weight: .medium))
                        .foregroundStyle(p.ink)
                }
                .transition(.opacity)
            }
            Spacer()
            LanguageToggle()
            ThemeToggle()
        }
        .animation(.easeOut(duration: 0.25), value: showWordmark)
    }

    private var libraryButton: some View {
        Button {
            Haptics.tap()
            onLibrary()
        } label: {
            Image(systemName: "books.vertical")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(p.accentDeep)
                .frame(width: 32, height: 32)
                .background(
                    Circle()
                        .fill(p.paper)
                        .overlay(Circle().strokeBorder(p.lineStrong, lineWidth: 1))
                )
                .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
                .frame(width: 40, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(s.openLibrary)
    }
}
