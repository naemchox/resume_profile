import SwiftUI

/// Step 2 — separate stems. One-time model download, then a Separate run with
/// progress. Stubbed timings stand in for the Demucs WASM worker.
struct SeparatePanel: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @State private var confirmUninstall = false

    var body: some View {
        Panel(step: 2, title: s.separateStems,
              subtitle: "Demucs v4 6-stem AI",
              done: app.isDone(.separate)) {
            VStack(alignment: .leading, spacing: 16) {
                if !app.modelDownloaded {
                    HStack(spacing: 12) {
                        LuxButton(title: s.downloadModel,
                                  loading: app.downloadingModel) {
                            Task { await app.downloadModel() }
                        }
                        if app.downloadingModel {
                            LuxProgressBar(value: app.modelProgress)
                        }
                    }
                } else {
                    HStack(spacing: 12) {
                        LuxButton(title: app.stems.isEmpty ? s.separate : s.separateAgain,
                                  loading: app.separating) {
                            Task { await app.runSeparation() }
                        }
                        .disabled(!app.hasAudio)
                        if app.separating {
                            LuxProgressBar(value: app.sepProgress)
                        } else if !app.stems.isEmpty {
                            Label(s.done, systemImage: "checkmark.circle.fill")
                                .font(Typeface.sans(13))
                                .foregroundStyle(p.success)
                        }
                    }

                    HStack(spacing: 10) {
                        Label(s.modelInstalled, systemImage: "checkmark.seal")
                            .font(Typeface.sans(13))
                            .foregroundStyle(p.inkFaint)
                        Spacer(minLength: 8)
                        Button {
                            Haptics.tap()
                            confirmUninstall = true
                        } label: {
                            Label(s.uninstallModel, systemImage: "trash")
                                .font(Typeface.sans(13, weight: .medium))
                                .foregroundStyle(p.danger)
                        }
                        .buttonStyle(.plain)
                        .disabled(app.separating)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(p.ivory))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(p.line, lineWidth: 1))
                }

                if !app.hasAudio {
                    Text(s.hintSeparateNeedsAudio)
                        .font(Typeface.serif(14, weight: .regular, italic: true))
                        .foregroundStyle(p.inkFaint)
                }

                Text(s.sepInfo)
                    .font(Typeface.sans(13))
                    .foregroundStyle(p.inkFaint)
                    .lineSpacing(3)

                if let err = app.sepError {
                    Text(err).font(Typeface.sans(14, weight: .medium)).foregroundStyle(p.danger)
                }
            }
        }
        .confirmationDialog(s.uninstallConfirmTitle,
                            isPresented: $confirmUninstall,
                            titleVisibility: .visible) {
            Button(s.uninstallModel, role: .destructive) {
                app.uninstallModel()
                Haptics.success()
            }
            Button(s.cancel, role: .cancel) {}
        } message: {
            Text(s.uninstallConfirmMessage)
        }
    }
}
