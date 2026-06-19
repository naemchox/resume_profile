import SwiftUI

/// Step 4 — transcribe. Confidence + min-length snappy sliders, a reduction
/// picker, then a Run button. Stubbed transcription synthesizes a melody.
struct TranscribePanel: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    private var sourceLabel: String {
        s.transcribeSource(stem: app.transcribeSource, skipped: app.path == .skip)
    }

    var body: some View {
        @Bindable var app = app
        Panel(step: 4, title: s.transcribe,
              subtitle: sourceLabel,
              done: app.isDone(.transcribe)) {
            VStack(alignment: .leading, spacing: 22) {
                SnappySlider(
                    label: s.noteConfidence,
                    values: [0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8],
                    value: $app.confidence
                )
                SnappySlider(
                    label: s.minNoteLength,
                    suffix: "ms",
                    values: [20, 50, 80, 120, 160, 200, 250, 300],
                    value: $app.minLength
                )
                VStack(alignment: .leading, spacing: 6) {
                    Text(s.reductionTitle).luxLabel().foregroundStyle(p.inkSoft)
                    LuxPicker(
                        selection: $app.reduction,
                        options: Reduction.allCases.map { ($0, s.reduction($0)) }
                    )
                }

                HStack(spacing: 12) {
                    LuxButton(title: app.notes.isEmpty ? s.transcribe : s.transcribeAgain,
                              loading: app.transcribing) {
                        Task { await app.runTranscription() }
                    }
                    .disabled(!app.hasAudio)
                    if app.transcribing {
                        LuxProgressBar(value: app.transProgress)
                    } else if !app.notes.isEmpty {
                        Text(s.notesCount(app.notes.count))
                            .font(Typeface.sans(13))
                            .foregroundStyle(p.success)
                    }
                }

                if !app.hasAudio {
                    Text(s.hintTranscribeNeedsAudio)
                        .font(Typeface.serif(14, weight: .regular, italic: true))
                        .foregroundStyle(p.inkFaint)
                }
            }
        }
    }
}
