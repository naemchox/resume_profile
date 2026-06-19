import SwiftUI

/// Native piano-roll editor — the counterpart of `js/pianoroll.js`. Notes are
/// rounded bars on a pitch × time grid. Tap to select, drag to move (in pitch
/// and time), double-tap empty space to add, and the Delete button removes the
/// selection. Edits flow back into `AppState`, which re-renders the tab.
struct PianoRollView: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    private let rowHeight: CGFloat = 16
    private let pxPerSecond: CGFloat = 90

    // Drag state
    @State private var dragID: UUID?
    @State private var dragStart: Note?

    private var pitches: ClosedRange<Int> {
        let ps = app.notes.map(\.pitch)
        let lo = (ps.min() ?? 55) - 2
        let hi = (ps.max() ?? 67) + 2
        return lo...max(hi, lo + 8)
    }

    private var span: Double {
        max(app.notes.map(\.end).max() ?? 4, 4) + 1
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                LuxButton(title: s.deleteSelected, variant: .secondary, size: .small) {
                    if let id = app.selectedNoteID { app.deleteNote(id) }
                }
                .disabled(app.selectedNoteID == nil)
                Text(s.pianoRollHelp)
                    .font(Typeface.sans(12))
                    .foregroundStyle(p.inkFaint)
            }

            ScrollView([.horizontal, .vertical]) {
                canvas
                    .frame(width: span * pxPerSecond,
                           height: CGFloat(pitches.count) * rowHeight)
            }
            .frame(height: 280)
            .background(RoundedRectangle(cornerRadius: 12).fill(p.paper))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, lineWidth: 1))
        }
    }

    private var canvas: some View {
        Canvas { ctx, size in
            // Horizontal pitch rows (highlight C and accidental rows).
            for (i, pitch) in pitches.enumerated() {
                let y = CGFloat(i) * rowHeight
                let isC = pitch % 12 == 0
                let isBlack = [1, 3, 6, 8, 10].contains(((pitch % 12) + 12) % 12)
                if isBlack {
                    ctx.fill(Path(CGRect(x: 0, y: y, width: size.width, height: rowHeight)),
                             with: .color(p.ivory.opacity(0.5)))
                }
                ctx.stroke(Path { $0.move(to: CGPoint(x: 0, y: y)); $0.addLine(to: CGPoint(x: size.width, y: y)) },
                           with: .color(isC ? p.lineStrong : p.line), lineWidth: isC ? 1 : 0.5)
            }
            // Vertical beat/second lines.
            var t = 0.0
            while t <= span {
                let x = CGFloat(t) * pxPerSecond
                ctx.stroke(Path { $0.move(to: CGPoint(x: x, y: 0)); $0.addLine(to: CGPoint(x: x, y: size.height)) },
                           with: .color(p.line), lineWidth: 0.5)
                t += 1
            }
            // Notes.
            for note in app.notes {
                let rect = noteRect(note)
                let selected = note.id == app.selectedNoteID
                ctx.fill(Path(roundedRect: rect, cornerRadius: 4),
                         with: .color(selected ? p.accentDeep : p.accent))
                if selected {
                    ctx.stroke(Path(roundedRect: rect, cornerRadius: 4),
                               with: .color(p.ink), lineWidth: 1.5)
                }
            }
        }
        .contentShape(Rectangle())
        .gesture(dragGesture)
        .gesture(doubleTap)
    }

    private func noteRect(_ note: Note) -> CGRect {
        let x = CGFloat(note.start) * pxPerSecond
        let w = max(6, CGFloat(note.duration) * pxPerSecond)
        let row = (pitches.upperBound - note.pitch)
        let y = CGFloat(row) * rowHeight + 1
        return CGRect(x: x, y: y, width: w, height: rowHeight - 2)
    }

    private func noteAt(_ point: CGPoint) -> Note? {
        app.notes.first { noteRect($0).insetBy(dx: -2, dy: -2).contains(point) }
    }

    private func pitch(forY y: CGFloat) -> Int {
        let row = Int(y / rowHeight)
        return pitches.upperBound - row
    }

    private var dragGesture: some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { g in
                if dragID == nil {
                    if let hit = noteAt(g.startLocation) {
                        dragID = hit.id
                        dragStart = hit
                        app.selectedNoteID = hit.id
                    } else {
                        return
                    }
                }
                guard let start = dragStart, var note = app.notes.first(where: { $0.id == dragID }) else { return }
                let newStart = max(0, start.start + Double(g.translation.width) / Double(pxPerSecond))
                let newPitch = pitch(forY: noteRect(start).midY + g.translation.height)
                note.start = newStart
                note.pitch = min(108, max(21, newPitch))
                app.updateNote(note)
            }
            .onEnded { _ in
                dragID = nil
                dragStart = nil
            }
    }

    private var doubleTap: some Gesture {
        SpatialTapGesture(count: 2)
            .onEnded { value in
                if let hit = noteAt(value.location) {
                    app.selectedNoteID = hit.id
                } else {
                    let start = Double(value.location.x / pxPerSecond)
                    let pitch = pitch(forY: value.location.y)
                    app.addNote(Note(pitch: min(108, max(21, pitch)), start: max(0, start), duration: 0.4))
                }
            }
    }
}
