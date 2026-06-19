import Foundation

/// Turns transcribed notes into the three viewable representations. The visual
/// score rendering (alphaTab in the web app) is stubbed in the UI for now, but
/// the text tab, alphaTex source and the conversion report are produced for
/// real here — pure logic ported from `js/fret.js`, `js/notation.js` and
/// `js/alphatex.js`.
struct NotationService {

    struct Placement: Identifiable {
        let id = UUID()
        let note: Note
        let stringIndex: Int   // 0 = lowest string (matches Instrument.tuning order)
        let fret: Int
        let column: Int        // quantized grid column
    }

    struct Result {
        var placements: [Placement]
        var asciiTab: String
        var alphaTex: String
        var report: String
        var columns: Int
    }

    /// Seconds per grid cell for a given tempo + division (8ths or 16ths).
    static func cellDuration(bpm: Double, division: Int) -> Double {
        let quarter = 60.0 / bpm
        return quarter * (4.0 / Double(division))
    }

    func render(notes: [Note], instrument: Instrument, bpm: Double, division: Int) -> Result {
        let cell = Self.cellDuration(bpm: bpm, division: division)
        let sorted = notes.sorted { $0.start < $1.start }
        let columns = max(1, Int((sorted.map(\.end).max() ?? 0) / cell + 0.5) + 1)

        var placements: [Placement] = []
        var outOfRange = 0

        if instrument.isFretted {
            let tuning = instrument.tuning
            for note in sorted {
                let col = Int((note.start / cell).rounded())
                guard let pick = bestFret(pitch: note.pitch, tuning: tuning) else {
                    outOfRange += 1
                    continue
                }
                placements.append(Placement(note: note, stringIndex: pick.string, fret: pick.fret, column: col))
            }
        } else {
            for note in sorted {
                let col = Int((note.start / cell).rounded())
                placements.append(Placement(note: note, stringIndex: 0, fret: note.pitch, column: col))
            }
        }

        let ascii = instrument.isFretted
            ? asciiTab(placements: placements, instrument: instrument, columns: columns)
            : noteTimeline(placements: placements, columns: columns)

        let tex = alphaTex(notes: sorted, instrument: instrument, bpm: bpm, division: division)

        var report = "Converted \(sorted.count) note\(sorted.count == 1 ? "" : "s") at \(Int(bpm)) BPM, \(division)th grid."
        if outOfRange > 0 {
            report += " \(outOfRange) outside \(instrument.label.split(separator: " ").first ?? "") range were dropped."
        }

        return Result(placements: placements, asciiTab: ascii, alphaTex: tex, report: report, columns: columns)
    }

    // MARK: Fret assignment

    /// Lowest-fret placement: choose the string giving the smallest non-negative
    /// fret within reach (0...19). Ported from the greedy picker in fret.js.
    private func bestFret(pitch: Int, tuning: [Int]) -> (string: Int, fret: Int)? {
        var best: (string: Int, fret: Int)?
        for (i, open) in tuning.enumerated() {
            let fret = pitch - open
            guard fret >= 0, fret <= 19 else { continue }
            if best == nil || fret < best!.fret {
                best = (i, fret)
            }
        }
        return best
    }

    // MARK: ASCII tab

    private func asciiTab(placements: [Placement], instrument: Instrument, columns: Int) -> String {
        let tuning = instrument.tuning
        let names = stringLabels(for: instrument)
        // Build a grid: [string][column] -> fret string.
        var grid = Array(repeating: Array(repeating: "-", count: columns), count: tuning.count)
        for p in placements where p.column < columns {
            grid[p.stringIndex][p.column] = String(p.fret)
        }

        // Render high string at the top (reverse of low→high tuning order).
        var lines: [String] = []
        for s in stride(from: tuning.count - 1, through: 0, by: -1) {
            var line = "\(names[s])|"
            for col in 0..<columns {
                let token = grid[s][col]
                line += token.count == 2 ? token : "-" + token
                line += "-"
            }
            line += "|"
            lines.append(line)
        }
        return lines.joined(separator: "\n")
    }

    private func noteTimeline(placements: [Placement], columns: Int) -> String {
        var cells = Array(repeating: "·", count: columns)
        for p in placements where p.column < columns {
            cells[p.column] = p.note.name
        }
        return cells.joined(separator: " ")
    }

    private func stringLabels(for instrument: Instrument) -> [String] {
        switch instrument {
        case .guitar:  ["E", "A", "D", "G", "B", "e"]
        case .bass:    ["E", "A", "D", "G"]
        case .ukulele: ["G", "C", "E", "A"]
        default:       []
        }
    }

    // MARK: alphaTex export

    /// A minimal but valid alphaTex document. Notes are grouped into beats by the
    /// grid; fretted instruments emit `fret.string`, pitched emit note names.
    private func alphaTex(notes: [Note], instrument: Instrument, bpm: Double, division: Int) -> String {
        var out = "\\title \"Find da Note\"\n\\tempo \(Int(bpm))\n"
        out += "\\instrument \(instrument.gmProgram)\n"
        if instrument.isFretted {
            let t = instrument.tuning.reversed().map { midiToTexPitch($0) }.joined(separator: " ")
            out += "\\tuning \(t)\n"
        }
        out += ".\n"

        let cell = Self.cellDuration(bpm: bpm, division: division)
        let beatValue = division   // 8 or 16
        let sorted = notes.sorted { $0.start < $1.start }
        guard !sorted.isEmpty else { return out + "r" }

        let lastCol = Int((sorted.map(\.end).max() ?? 0) / cell + 0.5)
        var byCol: [Int: [Note]] = [:]
        for n in sorted { byCol[Int((n.start / cell).rounded()), default: []].append(n) }

        var beats: [String] = []
        for col in 0...lastCol {
            if let group = byCol[col], !group.isEmpty {
                let tokens = group.map { note -> String in
                    if instrument.isFretted, let pick = bestFret(pitch: note.pitch, tuning: instrument.tuning) {
                        return "\(pick.fret).\(pick.string + 1)"
                    }
                    return midiToTexPitch(note.pitch)
                }
                beats.append(tokens.count == 1 ? "\(tokens[0]).\(beatValue)" : "(\(tokens.joined(separator: " "))).\(beatValue)")
            } else {
                beats.append("r.\(beatValue)")
            }
        }
        return out + beats.joined(separator: " ")
    }

    /// MIDI number → alphaTex pitch token, e.g. 60 -> C4.
    private func midiToTexPitch(_ midi: Int) -> String {
        let names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        let octave = midi / 12 - 1
        return "\(names[((midi % 12) + 12) % 12])\(octave)"
    }
}
