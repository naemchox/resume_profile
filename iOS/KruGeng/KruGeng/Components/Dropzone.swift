import SwiftUI

/// The dashed `.dropzone` upload target: a ♪ glyph, prompt copy, and a muted
/// format hint. Tapping invokes `onTap` (the parent opens the file importer);
/// it also accepts dragged audio files on iPad.
struct Dropzone: View {
    var onTap: () -> Void
    var onURL: (URL) -> Void

    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @State private var targeted = false

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 10) {
                Text("♪")
                    .font(Typeface.serif(30))
                    .foregroundStyle(p.accentDeep)
                    .frame(width: 64, height: 64)
                    .background(Circle().fill(p.accentWash))
                    .overlay(Circle().strokeBorder(p.accent.opacity(0.3), lineWidth: 1))
                Group {
                    Text(s.dropBold).fontWeight(.semibold).foregroundStyle(p.ink)
                    + Text(s.dropRest).foregroundStyle(p.inkSoft)
                }
                .font(Typeface.sans(15))
                .multilineTextAlignment(.center)
                Text("MP3 · WAV · M4A · FLAC · OGG")
                    .font(Typeface.sans(11, weight: .medium))
                    .tracking(1.4)
                    .textCase(.uppercase)
                    .foregroundStyle(p.inkFaint)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 44)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(targeted ? p.accentWash : p.ivory)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(style: StrokeStyle(lineWidth: 1.5, dash: [6, 5]))
                    .foregroundStyle(targeted ? p.accent : p.lineStrong)
            )
            .offset(y: targeted ? -2 : 0)
        }
        .buttonStyle(.plain)
        .animation(.easeOut(duration: 0.25), value: targeted)
        .dropDestination(for: URL.self) { urls, _ in
            guard let first = urls.first else { return false }
            onURL(first)
            return true
        } isTargeted: { targeted = $0 }
    }
}
