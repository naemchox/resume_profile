import Foundation

/// Writes the four export formats into Documents and returns file URLs for the
/// share sheet. MIDI is a real Standard MIDI File (format 0); the others are
/// produced by NotationService. Mirrors the export buttons in panel 6.
struct ExportService {

    enum Format: String, CaseIterable, Identifiable {
        case midi, tab, alphaTex, json
        var id: String { rawValue }
        var label: String {
            switch self {
            case .midi:     "MIDI (.mid)"
            case .tab:      "Text tab (.txt)"
            case .alphaTex: "alphaTex (.atex)"
            case .json:     "Notes (.json)"
            }
        }
        var ext: String {
            switch self {
            case .midi: "mid"; case .tab: "txt"; case .alphaTex: "atex"; case .json: "json"
            }
        }
    }

    func export(_ format: Format,
                notes: [Note],
                bpm: Double,
                notation: NotationService.Result) throws -> URL {
        let data: Data
        switch format {
        case .midi:     data = Self.midiFile(notes: notes, bpm: bpm)
        case .tab:      data = Data(notation.asciiTab.utf8)
        case .alphaTex: data = Data(notation.alphaTex.utf8)
        case .json:     data = try JSONEncoder.pretty.encode(notes)
        }
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let url = docs.appendingPathComponent("find-da-note.\(format.ext)")
        try data.write(to: url)
        return url
    }

    // MARK: - Standard MIDI File (format 0)

    private static func midiFile(notes: [Note], bpm: Double, ppq: Int = 480) -> Data {
        var track = Data()

        // Tempo meta event (microseconds per quarter note).
        let usPerQuarter = Int(60_000_000.0 / bpm)
        track.append(contentsOf: [0x00, 0xFF, 0x51, 0x03])
        track.append(contentsOf: [UInt8((usPerQuarter >> 16) & 0xFF),
                                  UInt8((usPerQuarter >> 8) & 0xFF),
                                  UInt8(usPerQuarter & 0xFF)])

        // Build note-on/off events sorted by tick.
        struct Ev { let tick: Int; let on: Bool; let pitch: Int; let vel: Int }
        let secPerQuarter = 60.0 / bpm
        var events: [Ev] = []
        for n in notes {
            let onTick = Int(n.start / secPerQuarter * Double(ppq))
            let offTick = Int(n.end / secPerQuarter * Double(ppq))
            events.append(Ev(tick: onTick, on: true, pitch: n.pitch, vel: Int(n.velocity * 127)))
            events.append(Ev(tick: max(offTick, onTick + 1), on: false, pitch: n.pitch, vel: 0))
        }
        events.sort { $0.tick == $1.tick ? (!$0.on && $1.on) : $0.tick < $1.tick }

        var lastTick = 0
        for e in events {
            let delta = e.tick - lastTick
            lastTick = e.tick
            track.append(contentsOf: variableLength(delta))
            track.append(e.on ? 0x90 : 0x80)
            track.append(UInt8(max(0, min(127, e.pitch))))
            track.append(UInt8(max(0, min(127, e.vel))))
        }
        // End of track.
        track.append(contentsOf: [0x00, 0xFF, 0x2F, 0x00])

        var file = Data()
        // Header chunk: format 0, 1 track, division = ppq.
        file.append(contentsOf: Array("MThd".utf8))
        file.append(contentsOf: bigEndian32(6))
        file.append(contentsOf: bigEndian16(0))   // format 0
        file.append(contentsOf: bigEndian16(1))   // tracks
        file.append(contentsOf: bigEndian16(ppq))
        // Track chunk.
        file.append(contentsOf: Array("MTrk".utf8))
        file.append(contentsOf: bigEndian32(track.count))
        file.append(track)
        return file
    }

    private static func variableLength(_ value: Int) -> [UInt8] {
        var v = max(0, value)
        var bytes = [UInt8(v & 0x7F)]
        v >>= 7
        while v > 0 {
            bytes.insert(UInt8((v & 0x7F) | 0x80), at: 0)
            v >>= 7
        }
        return bytes
    }

    private static func bigEndian16(_ v: Int) -> [UInt8] { [UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)] }
    private static func bigEndian32(_ v: Int) -> [UInt8] {
        [UInt8((v >> 24) & 0xFF), UInt8((v >> 16) & 0xFF), UInt8((v >> 8) & 0xFF), UInt8(v & 0xFF)]
    }
}

private extension JSONEncoder {
    static var pretty: JSONEncoder {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }
}
