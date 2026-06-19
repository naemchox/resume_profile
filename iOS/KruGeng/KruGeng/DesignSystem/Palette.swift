import SwiftUI

/// The luxury · minimal · bright palette. Light keeps the warm ivory/ink paper
/// of the original web app with a deep sapphire-ink accent — fountain-pen blue
/// on archival paper. Dark is a midnight blue-black inversion with the accent
/// lifted to periwinkle so it glows on dark.
/// Contrast (WCAG): light `accent` on ivory ≈ 7.4:1, `accentDeep` ≈ 10:1;
/// dark `accent` on canvas ≈ 6.8:1.
struct Palette {
    let ivory: Color        // page canvas
    let paper: Color        // panels
    let ink: Color          // primary text
    let inkSoft: Color      // secondary text
    let inkFaint: Color     // muted / hints
    let line: Color         // hairlines
    let lineStrong: Color
    let accent: Color       // champagne gold
    let accentDeep: Color
    let accentWash: Color    // soft gold tint
    let inkContrast: Color   // text on ink/accent surfaces
    let success: Color
    let danger: Color
    let warn: Color

    static let light = Palette(
        ivory:       Color(hex: 0xFBFAF6),
        paper:       Color(hex: 0xFFFFFF),
        ink:         Color(hex: 0x16140F),
        inkSoft:     Color(hex: 0x5A554B),
        inkFaint:    Color(hex: 0x9B958A),
        line:        Color(hex: 0xE9E5DC),
        lineStrong:  Color(hex: 0xD8D2C5),
        accent:      Color(hex: 0x2F4F9E),
        accentDeep:  Color(hex: 0x243C7A),
        accentWash:  Color(hex: 0xEAEEF8),
        inkContrast: Color(hex: 0xFFFFFF),
        success:     Color(hex: 0x4F9E73),
        danger:      Color(hex: 0xB4543F),
        warn:        Color(hex: 0x9A7A36)
    )

    static let dark = Palette(
        ivory:       Color(hex: 0x10131A),
        paper:       Color(hex: 0x171C26),
        ink:         Color(hex: 0xEEF1F8),
        inkSoft:     Color(hex: 0xABB2C5),
        inkFaint:    Color(hex: 0x7A8299),
        line:        Color(hex: 0x232A3B),
        lineStrong:  Color(hex: 0x37415A),
        accent:      Color(hex: 0x7D9BE8),
        accentDeep:  Color(hex: 0x9DB4F0),
        accentWash:  Color(hex: 0x1A2235),
        inkContrast: Color(hex: 0x10131A),
        success:     Color(hex: 0x6FBF92),
        danger:      Color(hex: 0xD77A63),
        warn:        Color(hex: 0xC49A4A)
    )

    static func forScheme(_ scheme: ColorScheme) -> Palette {
        scheme == .dark ? .dark : .light
    }
}

extension Palette {
    /// Accent gradient for solid fills — completed-step badges, progress
    /// fills, and other places flat `accent` reads too plain.
    var accentFill: LinearGradient {
        LinearGradient(colors: [accent, accentDeep],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// Panel hairline that catches a sliver of accent light along the top edge
    /// before settling into the regular hairline tone.
    var accentEdge: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: accent.opacity(0.50), location: 0),
                .init(color: lineStrong.opacity(0.70), location: 0.22),
                .init(color: line, location: 1),
            ],
            startPoint: .top, endPoint: .bottom
        )
    }
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red:   Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue:  Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

// MARK: - Environment plumbing

private struct PaletteKey: EnvironmentKey {
    static let defaultValue: Palette = .light
}

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }
}
