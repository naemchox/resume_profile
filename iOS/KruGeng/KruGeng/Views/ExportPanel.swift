import SwiftUI

/// Step 6 — export. Writes MIDI / text tab / alphaTex / JSON into Documents and
/// presents the share sheet, or saves the rendered tab into the library.
struct ExportPanel: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @State private var savingToLibrary = false

    private var hasRender: Bool { app.render != nil }

    var body: some View {
        Panel(step: 6, title: s.export,
              done: app.isDone(.export)) {
            VStack(alignment: .leading, spacing: 14) {
                FlowButtons {
                    ForEach(ExportService.Format.allCases) { fmt in
                        LuxButton(title: fmt.label, variant: .secondary, size: .small) {
                            app.export(fmt)
                        }
                    }
                }
                .disabled(!hasRender)

                LuxButton(title: "♡ \(s.saveToLibrary)") {
                    savingToLibrary = true
                }
                .disabled(!hasRender)

                if !hasRender {
                    Text(s.hintExportEmpty)
                        .font(Typeface.serif(14, weight: .regular, italic: true))
                        .foregroundStyle(p.inkFaint)
                }

                Text(s.exportInfo)
                    .font(Typeface.sans(13))
                    .foregroundStyle(p.inkFaint)
                    .lineSpacing(3)
            }
        }
        .sheet(isPresented: $savingToLibrary) {
            SaveToLibrarySheet()
        }
    }
}

private struct FlowButtons<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) { content }
            VStack(alignment: .leading, spacing: 10) { content }
        }
    }
}
