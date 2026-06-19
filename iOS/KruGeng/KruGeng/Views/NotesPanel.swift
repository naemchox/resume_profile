import SwiftUI

/// Step 5 — notes & notation. Instrument / BPM / grid controls, the convert
/// report, and three views: a score placeholder (native rendering pending),
/// the interactive piano roll, and the live text tab. A preview synth plays
/// the current notes.
struct NotesPanel: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @State private var synth = NoteSynth()

    var body: some View {
        @Bindable var app = app
        Panel(step: 5, title: s.notesNotation,
              done: app.isDone(.notes)) {
            VStack(alignment: .leading, spacing: 18) {
                if app.notes.isEmpty {
                    Text(s.hintNotesEmpty)
                        .font(Typeface.serif(14, weight: .regular, italic: true))
                        .foregroundStyle(p.inkFaint)
                }

                controls(app: app)

                if let report = app.render?.report {
                    Text(report)
                        .font(Typeface.serif(15, italic: true))
                        .foregroundStyle(p.inkSoft)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .fill(p.accentWash.opacity(0.55)))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(p.accent.opacity(0.2), lineWidth: 1))
                }

                ViewTabs(selection: $app.notationView)

                switch app.notationView {
                case .notation:  notationView
                case .pianoroll: PianoRollView()
                case .ascii:     asciiView
                }
            }
        }
    }

    @ViewBuilder
    private func controls(app: AppState) -> some View {
        @Bindable var app = app
        FlowControls {
            labeled(s.instrumentTitle) {
                LuxPicker(selection: $app.instrument,
                          options: Instrument.allCases.map { ($0, s.instrumentLabel($0)) })
            }
            labeled("BPM") {
                Stepper(value: $app.bpm, in: 40...240, step: 1) {
                    Text("\(Int(app.bpm))")
                        .font(Typeface.sans(15).monospacedDigit())
                        .foregroundStyle(p.ink)
                }
                .fixedSize()
            }
            labeled(s.gridTitle) {
                LuxPicker(selection: $app.division,
                          options: [(8, s.gridOption(8)), (16, s.gridOption(16))])
            }
        }
    }

    private func labeled(_ title: String, @ViewBuilder _ content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).luxLabel().foregroundStyle(p.inkSoft)
            content()
        }
    }

    // MARK: Score placeholder

    private var notationView: some View {
        VStack(alignment: .leading, spacing: 12) {
            playRow
            VStack(spacing: 10) {
                Image(systemName: "music.note.list")
                    .font(.system(size: 34))
                    .foregroundStyle(p.accent)
                Text(s.scoreRoadmap)
                    .font(Typeface.sans(14, weight: .medium))
                    .foregroundStyle(p.ink)
                Text(s.scoreRoadmapDetail)
                    .font(Typeface.sans(13))
                    .foregroundStyle(p.inkFaint)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 380)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 30)
            .background(RoundedRectangle(cornerRadius: 12).fill(p.ivory))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, lineWidth: 1))
        }
    }

    private var asciiView: some View {
        VStack(alignment: .leading, spacing: 12) {
            playRow
            ScrollView(.horizontal, showsIndicators: true) {
                Text(app.render?.asciiTab ?? "—")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundStyle(p.ink)
                    .padding(14)
            }
            .background(RoundedRectangle(cornerRadius: 12).fill(p.ivory))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, lineWidth: 1))
        }
    }

    private var playRow: some View {
        HStack(spacing: 10) {
            LuxButton(title: synth.isPreparing ? s.preparing : (synth.isPlaying ? s.playing : s.play),
                      variant: .secondary, size: .small,
                      loading: synth.isPreparing) {
                synth.isPlaying || synth.isPreparing
                    ? synth.stop()
                    : synth.play(notes: app.notes, instrument: app.instrument)
            }
            LuxButton(title: s.stop, variant: .secondary, size: .small) { synth.stop() }
            Text(s.synthCaption)
                .font(Typeface.sans(12))
                .foregroundStyle(p.inkFaint)
        }
    }
}

/// A simple wrapping HStack for the instrument/BPM/grid controls so they reflow
/// on narrow screens.
private struct FlowControls<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .bottom, spacing: 18) { content }
            VStack(alignment: .leading, spacing: 14) { content }
        }
    }
}
