import Foundation

struct TranscribeSettings {
    var confidence: Double      // 0.05 ... 0.8
    var minLengthMs: Double     // 20 ... 300
    var reduction: Reduction
}

/// Note transcription. The web app runs Spotify Basic Pitch (TensorFlow.js).
/// Pending a Core ML port, the stub synthesizes a deterministic, musically
/// plausible line so the piano roll, tab, notation and export all have real
/// data to work with — an E-minor pentatonic riff matching the project's
/// reference test song (frets 3/5/7 on the high strings).
protocol TranscriptionService {
    func transcribe(source: URL,
                    duration: Double,
                    settings: TranscribeSettings,
                    progress: @escaping (Double) -> Void) async -> [Note]
}

struct StubTranscriptionService: TranscriptionService {
    func transcribe(source: URL,
                    duration: Double,
                    settings: TranscribeSettings,
                    progress: @escaping (Double) -> Void) async -> [Note] {
        // Simulate inference time with progress.
        let steps = 30
        for i in 0...steps {
            progress(Double(i) / Double(steps))
            try? await Task.sleep(nanoseconds: 40_000_000)
        }

        // E-minor pentatonic over two octaves: E G A B D
        let scale = [40, 43, 45, 47, 50, 52, 55, 57, 59, 62, 64]
        let span = max(duration, 8)
        let beat = 0.5                       // 120 BPM eighth-ish grid
        var notes: [Note] = []
        var t = 0.0
        var idx = 0
        // Deterministic pseudo-walk so repeated runs look identical.
        var seed = 7
        while t < span - beat {
            seed = (seed &* 1103515245 &+ 12345) & 0x7fffffff
            let step = (seed % 5) - 2
            idx = max(0, min(scale.count - 1, idx + step))
            let dur = beat * (settings.minLengthMs > 150 ? 2 : 1)
            notes.append(Note(pitch: scale[idx], start: t, duration: dur * 0.9))

            // In "all notes" mode, occasionally stack a third for a chord.
            if settings.reduction == .all && seed % 4 == 0 {
                let up = min(scale.count - 1, idx + 2)
                notes.append(Note(pitch: scale[up], start: t, duration: dur * 0.9))
            }
            t += dur
        }
        return notes
    }
}
