import Foundation
import Observation

/// The single source of truth for the whole pipeline. Owns the audio engine and
/// the (currently stubbed) services, and tracks per-step progress/errors.
/// Every step is freely browsable; actions that need missing inputs (audio,
/// stems, notes) disable themselves with a hint instead of locking the panel.
@Observable
final class AppState {
    // Engines & services
    let audio = AudioEngine()
    let separation: SeparationService = StubSeparationService()
    let transcription: TranscriptionService = NativePitchTranscriptionService()
    let notation = NotationService()
    let exporter = ExportService()
    let library = LibraryStore()

    enum Path { case undecided, separate, skip }
    var path: Path = .undecided

    /// Set by flow actions to request the scroll view jump to a section.
    /// `ContentView` observes this and clears it after scrolling.
    var scrollTarget: Stage?

    /// The wizard step currently on screen.
    var currentStage: Stage = .upload

    init() {
        serverHost = UserDefaults.standard.string(forKey: Self.hostKey) ?? "http://localhost:8000"
    }

    // MARK: Step 1 — upload
    var uploadError: String?
    var hasAudio: Bool { audio.sourceURL != nil }

    // YouTube fetch (via the local yt-dlp server, e.g. serve.py).
    private static let hostKey = "fdn-server-host"
    var ytURL: String = ""
    var serverHost: String {
        didSet { UserDefaults.standard.set(serverHost, forKey: Self.hostKey) }
    }
    var ytFetching = false
    var ytError: String?

    // MARK: Step 2 — separate
    var modelDownloaded = false
    var downloadingModel = false
    var modelProgress: Double = 0
    var separating = false
    var sepProgress: Double = 0
    var sepError: String?
    var stems: [Stem] = []

    // MARK: Step 3/4 — transcribe
    var transcribeSource: StemKind?       // nil ⇒ full mix
    var confidence: Double = 0.3
    var minLength: Double = 80
    var reduction: Reduction = .all
    var transcribing = false
    var transProgress: Double = 0
    var transError: String?
    var notes: [Note] = []

    // MARK: Step 5 — notes & notation
    var instrument: Instrument = .guitar { didSet { rerender() } }
    var bpm: Double = 100 { didSet { rerender() } }
    var division: Int = 16 { didSet { rerender() } }
    var notationView: NotationView = .notation
    var render: NotationService.Result?
    var selectedNoteID: UUID?

    // MARK: Step 6 — export
    var lastExportURL: URL?
    var shareURL: URL?

    // MARK: - Step progress

    /// Whether a step has produced its output — drives the rail's checkmarks
    /// and the panels' done badges.
    func isDone(_ stage: Stage) -> Bool {
        switch stage {
        case .upload:     hasAudio
        case .separate:   !stems.isEmpty
        case .stems:      transcribeSource != nil
        case .transcribe: !notes.isEmpty
        case .notes:      render != nil
        case .export:     lastExportURL != nil
        }
    }

    /// The stage after `stage`, or nil at the end of the wizard.
    func nextStage(after stage: Stage) -> Stage? {
        Stage(rawValue: stage.rawValue + 1)
    }

    /// The stage before `stage`, or nil at the start.
    func previousStage(before stage: Stage) -> Stage? {
        Stage(rawValue: stage.rawValue - 1)
    }

    var transcribeSourceLabel: String {
        guard let transcribeSource else { return path == .skip ? "the full mix" : "a stem" }
        return "the \(transcribeSource.title.lowercased()) stem"
    }

    // MARK: - Actions

    func loadAudio(url: URL, from source: FetchRecord.Source = .file) {
        uploadError = nil
        do {
            try audio.load(url: url)
            let title = source == .youtube
                ? ytURL.trimmingCharacters(in: .whitespacesAndNewlines)
                : url.lastPathComponent
            library.recordFetch(title: title, source: source)
            // New file resets everything downstream.
            path = .undecided
            stems = []
            notes = []
            render = nil
            transcribeSource = nil
            modelDownloaded = false
        } catch {
            uploadError = "Couldn't read that audio file. Try MP3, WAV, M4A, FLAC or OGG."
        }
    }

    @MainActor
    func fetchYouTube() async {
        let trimmed = ytURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        guard let base = URL(string: serverHost) else {
            ytError = "That server address isn't a valid URL."
            return
        }
        ytError = nil
        ytFetching = true
        defer { ytFetching = false }
        do {
            let file = try await YouTubeService(baseURL: base).fetchAudio(youtubeURL: trimmed)
            loadAudio(url: file, from: .youtube)
        } catch {
            ytError = error.localizedDescription
        }
    }

    func chooseSeparate() {
        path = .separate
        scrollTarget = .separate
    }

    func chooseSkip() {
        path = .skip
        transcribeSource = nil
        scrollTarget = .transcribe
    }

    @MainActor
    func downloadModel() async {
        downloadingModel = true
        modelProgress = 0
        await separation.downloadModel { [weak self] p in self?.modelProgress = p }
        downloadingModel = false
        modelDownloaded = true
    }

    /// Removes the downloaded separation model. With the stub service there is
    /// nothing on disk yet; the real Core ML port will also delete model files.
    func uninstallModel() {
        modelDownloaded = false
        modelProgress = 0
    }

    @MainActor
    func runSeparation() async {
        guard let source = audio.sourceURL else { return }
        sepError = nil
        separating = true
        sepProgress = 0
        let result = await separation.separate(source: source) { [weak self] p in self?.sepProgress = p }
        stems = result
        separating = false
        scrollTarget = .stems
    }

    func selectStem(_ kind: StemKind) {
        transcribeSource = kind
        scrollTarget = .transcribe
    }

    @MainActor
    func runTranscription() async {
        guard let source = transcriptionSourceURL else { return }
        transError = nil
        transcribing = true
        transProgress = 0
        let settings = TranscribeSettings(confidence: confidence, minLengthMs: minLength, reduction: reduction)
        let result = await transcription.transcribe(
            source: source,
            duration: audio.duration,
            settings: settings
        ) { [weak self] p in self?.transProgress = p }
        notes = result
        transcribing = false
        rerender()
        scrollTarget = .notes
    }

    private var stemURL: URL? {
        guard let kind = transcribeSource else { return nil }
        return stems.first { $0.kind == kind }?.url
    }

    /// Vocal-melody mode sings from the vocals stem whenever separation has
    /// produced one; the other modes use the selected stem or the full mix.
    private var transcriptionSourceURL: URL? {
        if reduction == .vocal, let vocals = stems.first(where: { $0.kind == .vocals })?.url {
            return vocals
        }
        return stemURL ?? audio.sourceURL
    }

    /// Re-derive the tab / alphaTex / report whenever notes or settings change.
    func rerender() {
        guard !notes.isEmpty else { render = nil; return }
        render = notation.render(notes: notes, instrument: instrument, bpm: bpm, division: division)
    }

    func updateNote(_ note: Note) {
        guard let i = notes.firstIndex(where: { $0.id == note.id }) else { return }
        notes[i] = note
        rerender()
    }

    func addNote(_ note: Note) { notes.append(note); rerender() }

    func deleteNote(_ id: UUID) {
        notes.removeAll { $0.id == id }
        if selectedNoteID == id { selectedNoteID = nil }
        rerender()
    }

    func export(_ format: ExportService.Format) {
        guard let render else { return }
        do {
            let url = try exporter.export(format, notes: notes, bpm: bpm, notation: render)
            lastExportURL = url
            shareURL = url
        } catch {
            // Non-fatal; surfaced via lastExportURL staying nil.
        }
    }
}
