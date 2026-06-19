import SwiftUI

/// Step 3 — the six separated stems. Each row pairs a tinted instrument badge
/// and a decorative waveform with a "transcribe this" hand-off and a WAV
/// share. Before separation runs, ghosted placeholder rows preview the six
/// stems under a hint card that points back to step 2.
struct StemsPanel: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    var body: some View {
        Panel(step: 3, title: s.stems,
              done: app.isDone(.stems)) {
            VStack(spacing: 10) {
                if app.stems.isEmpty {
                    emptyState
                } else {
                    ForEach(app.stems) { stem in
                        row(stem)
                    }
                }
            }
        }
    }

    // MARK: Rows

    private func row(_ stem: Stem) -> some View {
        let isSelected = app.transcribeSource == stem.kind
        return HStack(spacing: 10) {
            badge(stem.kind)
            VStack(alignment: .leading, spacing: 6) {
                Text(s.stemName(stem.kind))
                    .font(Typeface.sans(15, weight: .medium))
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
                StemWave(kind: stem.kind, tint: stem.kind.color(p), bars: 10)
            }
            Spacer(minLength: 8)
            LuxButton(title: isSelected ? s.selectedCheck : s.transcribeThis,
                      variant: isSelected ? .primary : .secondary, size: .small) {
                app.selectStem(stem.kind)
            }
            .layoutPriority(1)
            Button {
                Haptics.tap()
                app.shareURL = stem.url
            } label: {
                Image(systemName: "square.and.arrow.down")
                    .font(.system(size: 15))
                    .foregroundStyle(p.inkSoft)
                    .frame(width: 30, height: 38)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(isSelected ? p.accentWash : p.ivory))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(isSelected ? p.accent : p.line, lineWidth: isSelected ? 1.5 : 1))
        .shadow(color: isSelected ? p.accent.opacity(0.18) : .clear, radius: 10, y: 4)
        .animation(.easeOut(duration: 0.2), value: isSelected)
    }

    /// Instrument glyph in a circle washed with the stem's tint.
    private func badge(_ kind: StemKind) -> some View {
        let tint = kind.color(p)
        return Image(systemName: kind.glyph)
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(tint)
            .frame(width: 38, height: 38)
            .background(Circle().fill(tint.opacity(0.12)))
            .overlay(Circle().strokeBorder(tint.opacity(0.30), lineWidth: 1))
    }

    // MARK: Empty state

    /// Ghosted preview of the six stems-to-come, softened under a hint card.
    private var emptyState: some View {
        VStack(spacing: 10) {
            ForEach(StemKind.allCases) { kind in
                ghostRow(kind)
            }
        }
        .opacity(0.45)
        .blur(radius: 0.8)
        .overlay {
            hintCard
        }
    }

    private func ghostRow(_ kind: StemKind) -> some View {
        HStack(spacing: 14) {
            badge(kind)
            VStack(alignment: .leading, spacing: 6) {
                Text(s.stemName(kind))
                    .font(Typeface.sans(15, weight: .medium))
                    .foregroundStyle(p.inkSoft)
                StemWave(kind: kind, tint: kind.color(p))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.ivory))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
            .strokeBorder(p.line, lineWidth: 1))
    }

    private var hintCard: some View {
        VStack(spacing: 12) {
            Text("♪")
                .font(Typeface.serif(26))
                .foregroundStyle(p.accentDeep)
                .frame(width: 54, height: 54)
                .background(Circle().fill(p.accentWash))
                .overlay(Circle().strokeBorder(p.accent.opacity(0.3), lineWidth: 1))
            Text(s.emptyStems)
                .font(Typeface.serif(15, weight: .regular, italic: true))
                .foregroundStyle(p.inkSoft)
                .multilineTextAlignment(.center)
            LuxButton(title: s.emptyStemsCTA, variant: .secondary, size: .small) {
                app.chooseSeparate()
            }
        }
        .padding(24)
        .frame(maxWidth: 300)
        .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(p.paper))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous)
            .strokeBorder(p.lineStrong, lineWidth: 1))
        .shadow(color: .black.opacity(0.08), radius: 18, y: 8)
    }
}

/// Decorative tinted mini-waveform. Fixed bar heights, shifted per stem so
/// each row reads distinct without any runtime randomness.
private struct StemWave: View {
    let kind: StemKind
    let tint: Color
    var bars: Int = 18

    private static let pattern: [CGFloat] = [
        0.35, 0.70, 0.50, 0.95, 0.60, 0.80, 0.40, 1.00, 0.55,
        0.85, 0.45, 0.65, 0.30, 0.75, 0.50, 0.90, 0.40, 0.60,
    ]

    var body: some View {
        let shift = (StemKind.allCases.firstIndex(of: kind) ?? 0) * 5
        HStack(spacing: 2.5) {
            ForEach(0 ..< bars, id: \.self) { i in
                Capsule()
                    .fill(tint.opacity(0.40))
                    .frame(width: 2.5, height: 14 * Self.pattern[(i + shift) % Self.pattern.count])
            }
        }
        .frame(height: 14)
    }
}
