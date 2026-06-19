import SwiftUI

// MARK: - Note

/// A transcribed note: pitch as a MIDI number, timing in seconds. This is the
/// lingua franca between transcription, the piano roll, tab rendering and export
/// — mirroring the `{ pitch, start, end, velocity }` objects in `js/notes.js`.
struct Note: Identifiable, Equatable, Codable {
    var id = UUID()
    var pitch: Int            // MIDI note number, C4 = 60
    var start: Double         // seconds
    var duration: Double      // seconds
    var velocity: Double = 0.8

    var end: Double { start + duration }

    static let noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    var name: String {
        let octave = pitch / 12 - 1
        return "\(Self.noteNames[((pitch % 12) + 12) % 12])\(octave)"
    }
}

// MARK: - Stem

enum StemKind: String, CaseIterable, Identifiable, Codable {
    case vocals, drums, bass, guitar, piano, other
    var id: String { rawValue }

    var title: String { rawValue.capitalized }

    var glyph: String {
        switch self {
        case .vocals: "music.mic"
        case .drums:  "metronome"
        case .bass:   "guitars"
        case .guitar: "guitars.fill"
        case .piano:  "pianokeys"
        case .other:  "waveform"
        }
    }

    /// Tint for the stem row, drawn from the warm palette family.
    func color(_ p: Palette) -> Color {
        switch self {
        case .vocals: p.danger
        case .drums:  p.warn
        case .bass:   p.accentDeep
        case .guitar: p.accent
        case .piano:  p.success
        case .other:  p.inkSoft
        }
    }
}

struct Stem: Identifiable {
    let id = UUID()
    let kind: StemKind
    /// Local file URL of the rendered stem WAV (stub services reuse the source mix).
    var url: URL?
}

// MARK: - Instrument

enum Instrument: String, CaseIterable, Identifiable, Codable {
    case guitar, bass, ukulele, piano, flute
    var id: String { rawValue }

    var label: String {
        switch self {
        case .guitar:  "Guitar (tab + score)"
        case .bass:    "Bass (tab + score)"
        case .ukulele: "Ukulele (tab + score)"
        case .piano:   "Piano (grand staff)"
        case .flute:   "Flute (score + fingerings)"
        }
    }

    /// Open-string MIDI pitches, low → high. Empty for non-fretted instruments.
    var tuning: [Int] {
        switch self {
        case .guitar:  [40, 45, 50, 55, 59, 64]   // E2 A2 D3 G3 B3 E4
        case .bass:    [28, 33, 38, 43]            // E1 A1 D2 G2
        case .ukulele: [67, 60, 64, 69]            // G4 C4 E4 A4 (reentrant)
        case .piano, .flute: []
        }
    }

    var isFretted: Bool { !tuning.isEmpty }

    /// General MIDI program number for synth playback (0-based).
    var gmProgram: Int {
        switch self {
        case .guitar:  24   // nylon acoustic
        case .bass:    33   // finger bass
        case .ukulele: 24
        case .piano:   0    // grand piano
        case .flute:   73
        }
    }

    /// Inclusive MIDI range the instrument can physically produce. Mirrors the
    /// web app's INSTRUMENTS table (js/notes.js).
    var midiRange: ClosedRange<Int> {
        switch self {
        case .guitar:  40...88   // E2 .. E6
        case .bass:    28...67   // E1 .. G4
        case .ukulele: 60...84   // C4 .. C6
        case .piano:   21...108  // A0 .. C8
        case .flute:   60...96   // C4 .. C7
        }
    }

    /// Per-instrument additive-synthesis voice: relative harmonic amplitudes
    /// (index 0 = fundamental) and an envelope shape. This is what makes each
    /// instrument actually *sound* different in the preview synth.
    var timbre: Timbre {
        switch self {
        case .guitar:
            // Plucked nylon: bright-ish odd/even mix, fast pluck decay.
            Timbre(harmonics: [1.0, 0.5, 0.32, 0.18, 0.1, 0.06], plucked: true, decay: 3.2)
        case .bass:
            // Round, fundamental-heavy, slow decay.
            Timbre(harmonics: [1.0, 0.28, 0.12, 0.05], plucked: true, decay: 2.0)
        case .ukulele:
            // Small, bright, very quick decay.
            Timbre(harmonics: [1.0, 0.6, 0.4, 0.28, 0.16, 0.1], plucked: true, decay: 4.5)
        case .piano:
            // Rich harmonic series, percussive attack, exponential decay.
            Timbre(harmonics: [1.0, 0.6, 0.42, 0.3, 0.2, 0.13, 0.08, 0.05], plucked: true, decay: 2.6)
        case .flute:
            // Nearly pure with a soft breathy 2nd/3rd, sustained (no pluck decay).
            Timbre(harmonics: [1.0, 0.18, 0.08], plucked: false, decay: 0)
        }
    }

    /// Octave-shift + fold a note list into this instrument's range, mirroring
    /// `convertToInstrument` in js/notes.js. Picks the global octave shift that
    /// lands the most notes in range, then folds stragglers by octaves.
    func convert(_ notes: [Note]) -> [Note] {
        guard !notes.isEmpty else { return notes }
        let lo = midiRange.lowerBound, hi = midiRange.upperBound

        var bestK = 0, bestCount = -1
        for k in -3...3 {
            let count = notes.reduce(0) { acc, n in
                let p = n.pitch + 12 * k
                return acc + (p >= lo && p <= hi ? 1 : 0)
            }
            if count > bestCount || (count == bestCount && abs(k) < abs(bestK)) {
                bestCount = count
                bestK = k
            }
        }

        var out: [Note] = []
        for n in notes {
            var p = n.pitch + 12 * bestK
            if p < lo || p > hi {
                while p < lo { p += 12 }
                while p > hi { p -= 12 }
                if p < lo { continue } // range narrower than an octave: skip
            }
            var copy = n
            copy.pitch = p
            out.append(copy)
        }
        return out
    }
}

/// Additive-synthesis voice description for the preview synth.
struct Timbre {
    /// Relative amplitudes of successive harmonics (index 0 = fundamental).
    let harmonics: [Double]
    /// `true` = plucked/struck (energy decays across the note); `false` = sustained.
    let plucked: Bool
    /// Exponential decay rate for plucked voices (higher = faster decay).
    let decay: Double
}

// MARK: - Reduction

enum Reduction: String, CaseIterable, Identifiable, Codable {
    case all, melody, vocal
    var id: String { rawValue }
    var label: String {
        switch self {
        case .all:    "All notes (chords kept)"
        case .melody: "Melody only (single line)"
        case .vocal:  "Melody (vocals → tabs)"
        }
    }
}

// MARK: - Notation view tab

enum NotationView: String, CaseIterable, Identifiable {
    case notation, pianoroll, ascii
    var id: String { rawValue }
    var label: String {
        switch self {
        case .notation:  "Notation"
        case .pianoroll: "Piano roll (edit)"
        case .ascii:     "Text tab"
        }
    }
}

// MARK: - Pipeline stage (drives panel locking)

enum Stage: Int, Comparable, CaseIterable {
    case upload, separate, stems, transcribe, notes, export
    static func < (a: Stage, b: Stage) -> Bool { a.rawValue < b.rawValue }

    /// Short name shown in the wizard's step rail.
    var title: String {
        switch self {
        case .upload:     "Load"
        case .separate:   "Separate"
        case .stems:      "Stems"
        case .transcribe: "Transcribe"
        case .notes:      "Notes"
        case .export:     "Export"
        }
    }
}
