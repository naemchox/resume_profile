import SwiftUI

/// The guided-wizard root. Brand bar (library button, wordmark, language and
/// theme toggles) + step rail up top, a single step's panel on screen at a
/// time (sliding between steps), and a bottom bar with Back and Continue.
/// Flow actions signal `AppState.scrollTarget`; here that means "advance the
/// wizard to this stage".
///
/// Note: the sheets are attached *inside* the `.environment` modifiers so
/// their content inherits the app state, palette and strings.
struct ContentView: View {
    @State private var app = AppState()
    @State private var pushEdge: Edge = .trailing
    @State private var showLibrary = false
    @Environment(ThemeManager.self) private var theme
    @Environment(LanguageManager.self) private var lang
    @Environment(\.colorScheme) private var systemScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var palette: Palette { theme.palette(for: systemScheme) }
    private var strings: Strings { lang.strings }

    var body: some View {
        ZStack {
            backdrop

            VStack(spacing: 0) {
                VStack(spacing: 14) {
                    BrandBar(showWordmark: app.currentStage != .upload) {
                        showLibrary = true
                    }
                    StepRail { navigate(to: $0) }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 12)

                page

                bottomBar
            }
        }
        .onAppear {
            // UI-test / debug hook: `simctl launch … -openLibrary[Saved]` lands
            // on the library's history or saved tab.
            let args = ProcessInfo.processInfo.arguments
            if args.contains("-openLibrary") || args.contains("-openLibrarySaved") {
                showLibrary = true
            }
            // UI-test / debug hooks: `-withModel` / `-withStems` fake a
            // downloaded model and a finished separation. Must run before
            // `-stage` so the faked state is committed before the navigation
            // transition kicks off a view update.
            if args.contains("-withModel") {
                app.modelDownloaded = true
            }
            if args.contains("-withStems") {
                app.stems = StemKind.allCases.map { Stem(kind: $0, url: nil) }
            }
            // UI-test / debug hook: `-stage N` jumps straight to that step.
            if let i = args.firstIndex(of: "-stage"), i + 1 < args.count,
               let raw = Int(args[i + 1]), let stage = Stage(rawValue: raw) {
                navigate(to: stage)
            }
        }
        .onChange(of: app.scrollTarget) { _, target in
            guard let target else { return }
            // Long-running steps finishing deserve a success thump.
            if target == .stems || target == .notes { Haptics.success() }
            navigate(to: target)
            app.scrollTarget = nil
        }
        .sheet(isPresented: $showLibrary) {
            LibraryView()
        }
        .sheet(isPresented: Binding(
            get: { app.shareURL != nil },
            set: { if !$0 { app.shareURL = nil } }
        )) {
            if let url = app.shareURL {
                ShareSheet(items: [url])
            }
        }
        .environment(app)
        .environment(\.palette, palette)
        .environment(\.strings, strings)
        .tint(palette.accent)
    }

    // MARK: - Pages

    private var page: some View {
        ZStack {
            ScrollView {
                VStack(spacing: 22) {
                    switch app.currentStage {
                    case .upload:
                        HeaderView()
                        UploadPanel()
                    case .separate:
                        SeparatePanel()
                    case .stems:
                        StemsPanel()
                    case .transcribe:
                        TranscribePanel()
                    case .notes:
                        NotesPanel()
                    case .export:
                        ExportPanel()
                        footer
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 10)
                .padding(.bottom, 28)
                .frame(maxWidth: 760)
                .frame(maxWidth: .infinity)
            }
            .id(app.currentStage)
            .transition(reduceMotion ? .opacity : .push(from: pushEdge))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Slide forward from the trailing edge, back from the leading edge.
    private func navigate(to stage: Stage) {
        guard stage != app.currentStage else { return }
        pushEdge = stage > app.currentStage ? .trailing : .leading
        withAnimation(reduceMotion ? nil : .spring(response: 0.45, dampingFraction: 0.86)) {
            app.currentStage = stage
        }
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        HStack(spacing: 12) {
            if let prev = app.previousStage(before: app.currentStage) {
                LuxButton(title: strings.back, variant: .secondary, size: .small) {
                    navigate(to: prev)
                }
            }
            Spacer(minLength: 0)
            if let next = app.nextStage(after: app.currentStage) {
                LuxButton(title: strings.continueNext, size: .small) {
                    navigate(to: next)
                }
            } else if let hint = stageHint {
                Text(hint)
                    .font(Typeface.serif(13, weight: .regular, italic: true))
                    .foregroundStyle(palette.inkFaint)
                    .multilineTextAlignment(.trailing)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background {
            palette.paper
                .ignoresSafeArea(edges: .bottom)
                .overlay(alignment: .top) {
                    Rectangle().fill(palette.line).frame(height: 1)
                }
                .shadow(color: .black.opacity(0.05), radius: 10, y: -4)
        }
    }

    /// What to do next, shown when there is no unlocked step to continue to.
    private var stageHint: String? {
        switch app.currentStage {
        case .upload:
            app.hasAudio ? strings.hintChoosePath : strings.hintLoad
        case .separate:
            strings.hintRunSeparation
        case .transcribe:
            strings.hintTranscribe
        case .export:
            strings.hintExport
        default:
            nil
        }
    }

    // MARK: - Chrome

    /// Ivory canvas lit by a slow sapphire-and-champagne aurora.
    private var backdrop: some View {
        AppBackdrop()
            .environment(\.palette, palette)
    }

    private var footer: some View {
        VStack(spacing: 4) {
            Text(strings.footer1)
            Text(strings.footer2)
        }
        .font(Typeface.sans(12))
        .foregroundStyle(palette.inkFaint)
        .multilineTextAlignment(.center)
        .padding(.top, 12)
    }
}
