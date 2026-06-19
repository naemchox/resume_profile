import Foundation

/// Stem separation. The web app runs Demucs v4 (htdemucs_6s) as WASM in a
/// worker; there is no native equivalent yet, so this protocol stands in for a
/// future Core ML port. `StubSeparationService` fakes the model download and
/// separation timings and returns six stems pointing at the source mix.
protocol SeparationService {
    /// One-time AI model download. Reports 0...1 progress.
    func downloadModel(progress: @escaping (Double) -> Void) async

    /// Split `source` into the six htdemucs_6s stems. Reports 0...1 progress.
    func separate(source: URL, progress: @escaping (Double) -> Void) async -> [Stem]
}

/// Faked implementation so the whole flow is navigable before the real Core ML
/// model is wired in. Replace with a `CoreMLSeparationService` later.
struct StubSeparationService: SeparationService {
    func downloadModel(progress: @escaping (Double) -> Void) async {
        await ramp(over: 1.6, progress: progress)
    }

    func separate(source: URL, progress: @escaping (Double) -> Void) async -> [Stem] {
        await ramp(over: 2.4, progress: progress)
        // Real Demucs output order is bass-first; we present in display order.
        return StemKind.allCases.map { Stem(kind: $0, url: source) }
    }

    /// Drive a 0...1 progress callback smoothly over `seconds`.
    private func ramp(over seconds: Double, progress: @escaping (Double) -> Void) async {
        let steps = 40
        for i in 0...steps {
            progress(Double(i) / Double(steps))
            try? await Task.sleep(nanoseconds: UInt64(seconds / Double(steps) * 1_000_000_000))
        }
    }
}
