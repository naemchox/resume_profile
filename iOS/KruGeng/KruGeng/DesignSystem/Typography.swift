import SwiftUI

/// Type system port. The web uses Playfair Display (serif display) + Inter
/// (geometric sans). Those aren't bundled, so we map to the system's serif
/// design (New York) for display headings and the default UI font for body —
/// preserving the high-contrast serif/sans pairing without shipping font files.
enum Typeface {
    /// Serif display — Playfair Display analogue. Used for the wordmark,
    /// panel titles, and the italic step numbers.
    static func serif(_ size: CGFloat, weight: Font.Weight = .medium, italic: Bool = false) -> Font {
        let base = Font.system(size: size, weight: weight, design: .serif)
        return italic ? base.italic() : base
    }

    /// Clean sans — Inter analogue. The default UI face.
    static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        Font.system(size: size, weight: weight, design: .default)
    }
}

extension View {
    /// The uppercase, wide-tracked label treatment used above inputs.
    func luxLabel() -> some View {
        self
            .font(Typeface.sans(13, weight: .medium))
            .textCase(.uppercase)
            .tracking(0.8)
    }

    /// The eyebrow above the hero wordmark: tiny, very widely tracked, uppercase.
    /// (Tracked at 3 — wide enough to read as an atelier mark, narrow enough to
    /// hold one line beside its flanking rules on an iPhone.)
    func luxEyebrow() -> some View {
        self
            .font(Typeface.sans(10, weight: .medium))
            .textCase(.uppercase)
            .tracking(3)
    }
}
