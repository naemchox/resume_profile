import SwiftUI
import UniformTypeIdentifiers

/// Step 1 — load a song. Dropzone + file importer, optional play/waveform, then
/// the branch: separate into stems, or skip straight to transcribing the mix.
/// (The YouTube fetch row from the web is omitted — no native yt-dlp.)
struct UploadPanel: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @State private var importing = false

    var body: some View {
        @Bindable var app = app
        Panel(step: 1, title: s.loadASong, done: app.isDone(.upload)) {
            VStack(alignment: .leading, spacing: 16) {
                Dropzone(
                    onTap: { importing = true },
                    onURL: { app.loadAudio(url: $0) }
                )

                youtubeRow(app: app)

                if let error = app.uploadError {
                    Text(error)
                        .font(Typeface.sans(14, weight: .medium))
                        .foregroundStyle(p.danger)
                }

                if app.hasAudio {
                    HStack(spacing: 14) {
                        Image(systemName: "waveform")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundStyle(p.accentDeep)
                            .frame(width: 38, height: 38)
                            .background(Circle().fill(p.accentWash))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(app.audio.fileName)
                                .font(Typeface.sans(14, weight: .medium))
                                .foregroundStyle(p.ink)
                                .lineLimit(1)
                            Text("\(timeString(app.audio.currentTime)) / \(timeString(app.audio.duration))")
                                .font(Typeface.sans(12).monospacedDigit())
                                .foregroundStyle(p.inkFaint)
                        }
                        Spacer()
                        PlayPauseButton(isPlaying: app.audio.isPlaying,
                                        playLabel: s.playPlain,
                                        pauseLabel: s.pausePlain) {
                            app.audio.togglePlay()
                        }
                    }

                    WaveformView(
                        peaks: app.audio.peaks,
                        progress: app.audio.duration > 0 ? app.audio.currentTime / app.audio.duration : 0,
                        onSeek: { app.audio.seek(to: $0 * app.audio.duration) }
                    )

                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 12) { pathButtons }
                        VStack(alignment: .leading, spacing: 10) { pathButtons }
                    }
                    .padding(.top, 4)
                }
            }
        }
        .fileImporter(isPresented: $importing,
                      allowedContentTypes: [.audio],
                      allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                app.loadAudio(url: url)
            }
        }
    }

    /// The branch CTAs: separate into stems, or skip straight to the mix.
    @ViewBuilder
    private var pathButtons: some View {
        LuxButton(title: s.separateCTA) { app.chooseSeparate() }
        LuxButton(title: s.skipCTA, variant: .secondary) {
            app.chooseSkip()
        }
    }

    private func timeString(_ t: Double) -> String {
        guard t.isFinite, t >= 0 else { return "0:00" }
        let s = Int(t.rounded())
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    @ViewBuilder
    private func youtubeRow(app: AppState) -> some View {
        @Bindable var app = app
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                TextField(s.ytPlaceholder, text: $app.ytURL)
                    .textFieldStyle(.plain)
                    .font(Typeface.sans(15))
                    .foregroundStyle(p.ink)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .submitLabel(.go)
                    .onSubmit { Task { await app.fetchYouTube() } }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .background(RoundedRectangle(cornerRadius: 12).fill(p.ivory))
                    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.lineStrong, lineWidth: 1))

                LuxButton(title: s.fetchAudio, loading: app.ytFetching) {
                    Task { await app.fetchYouTube() }
                }
            }

            if app.ytFetching {
                FetchingIndicator(label: s.fetchingAudio)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }

            DisclosureGroup {
                TextField(s.serverAddress, text: $app.serverHost)
                    .textFieldStyle(.plain)
                    .font(Typeface.sans(13))
                    .foregroundStyle(p.inkSoft)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.URL)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(RoundedRectangle(cornerRadius: 10).fill(p.ivory))
                    .overlay(RoundedRectangle(cornerRadius: 10).strokeBorder(p.line, lineWidth: 1))
                    .padding(.top, 6)
            } label: {
                Text(s.ytDisclaimer)
                    .font(Typeface.sans(12))
                    .foregroundStyle(p.inkFaint)
            }
            .tint(p.accentDeep)

            if let err = app.ytError {
                Text(err)
                    .font(Typeface.sans(13, weight: .medium))
                    .foregroundStyle(p.danger)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: app.ytFetching)
    }
}

/// Indeterminate "fetching" indicator — a row of three dots that pulse in a
/// travelling wave, with a status label. Honors Reduce Motion (falls back to a
/// static dimmed row). Used while a YouTube fetch is in flight.
private struct FetchingIndicator: View {
    let label: String
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animating = false

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .fill(p.accentDeep)
                        .frame(width: 6, height: 6)
                        .scaleEffect(reduceMotion ? 1 : (animating ? 1 : 0.45))
                        .opacity(reduceMotion ? 0.6 : (animating ? 1 : 0.4))
                        .animation(
                            reduceMotion ? nil :
                                .easeInOut(duration: 0.6)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.18),
                            value: animating
                        )
                }
            }
            Text(label)
                .font(Typeface.sans(13, weight: .medium))
                .foregroundStyle(p.accentDeep)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 12).fill(p.accentWash))
        .onAppear { animating = true }
    }
}
