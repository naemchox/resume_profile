import Foundation
import AVFoundation
import Observation

/// Lightweight preview synth: renders the note list to a summed-sine buffer with
/// a short envelope and plays it back. Stands in for the web app's alphaTab
/// soundfont playback. Note timings are absolute seconds, so tempo doesn't
/// affect preview pitch/length.
@Observable
final class NoteSynth {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!

    var isPlaying = false
    /// `true` while the buffer is being synthesised off the main thread. The play
    /// button binds to this to show its loading sweep instead of freezing the UI.
    var isPreparing = false

    /// Bumped on every play()/stop() so a slow background render that finishes
    /// after the user moved on can be discarded instead of playing late.
    private var token = 0

    init() {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
    }

    func play(notes: [Note], instrument: Instrument = .guitar) {
        stop()
        // Fold the raw transcription into the chosen instrument's range so each
        // instrument plays at its natural register (bass low, flute high, …).
        let voiced = instrument.convert(notes)
        guard !voiced.isEmpty else { return }

        token &+= 1
        let myToken = token
        let timbre = instrument.timbre
        isPreparing = true

        // Rendering a multi-second buffer is heavy; do it off the main thread so
        // the button can animate instead of the app freezing.
        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            let buffer = self.render(voiced, timbre: timbre)
            await MainActor.run {
                // A newer play()/stop() superseded this render — drop it.
                guard myToken == self.token else { return }
                self.isPreparing = false
                guard let buffer else { return }
                self.startPlayback(buffer)
            }
        }
    }

    private func startPlayback(_ buffer: AVAudioPCMBuffer) {
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setCategory(.playback)
        try? AVAudioSession.sharedInstance().setActive(true)
        #endif
        do { if !engine.isRunning { try engine.start() } } catch { return }
        isPlaying = true
        player.scheduleBuffer(buffer, at: nil, options: []) { [weak self] in
            Task { @MainActor in self?.isPlaying = false }
        }
        player.play()
    }

    func stop() {
        token &+= 1   // invalidate any in-flight render
        isPreparing = false
        player.stop()
        isPlaying = false
    }

    private func render(_ notes: [Note], timbre: Timbre) -> AVAudioPCMBuffer? {
        let sr = format.sampleRate
        let total = (notes.map(\.end).max() ?? 0) + 0.4
        let frames = AVAudioFrameCount(total * sr)
        guard frames > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return nil }
        buffer.frameLength = frames
        guard let out = buffer.floatChannelData?[0] else { return nil }
        for i in 0..<Int(frames) { out[i] = 0 }

        // Normalise the harmonic stack so a note's peak is ~1 before enveloping;
        // keeps timbres at a comparable loudness regardless of harmonic count.
        let harmSum = max(0.0001, timbre.harmonics.reduce(0, +))
        let attack = timbre.plucked ? 0.005 : 0.04   // wind instruments breathe in slower
        let release = timbre.plucked ? 0.08 : 0.12

        for note in notes {
            let freq = 440.0 * pow(2.0, Double(note.pitch - 69) / 12.0)
            let startF = Int(note.start * sr)
            let endF = min(Int(note.end * sr), Int(frames))
            guard endF > startF else { continue }
            let durSec = Double(endF - startF) / sr
            // Per-note gain folds in velocity; the 0.5 headroom + final
            // normalisation keep overlapping notes from clipping into a buzz.
            let gain = 0.5 * (0.4 + 0.6 * note.velocity)

            for f in startF..<endF {
                let t = Double(f - startF) / sr

                // Amplitude envelope.
                var env = 1.0
                if t < attack { env *= t / attack }
                let remaining = durSec - t
                if remaining < release { env *= max(0, remaining / release) }
                // Plucked/struck voices also lose energy across the note body.
                if timbre.plucked { env *= exp(-timbre.decay * t) }

                // Additive harmonic stack → the instrument's actual timbre.
                var sample = 0.0
                for (h, amp) in timbre.harmonics.enumerated() {
                    sample += amp * sin(2.0 * .pi * freq * Double(h + 1) * t)
                }
                out[f] += Float(sample / harmSum * env * gain)
            }
        }

        // Normalise to the loudest peak (target -3 dBFS) instead of hard
        // clipping, which is what produced the harsh, nauseating buzz before.
        var peak: Float = 0
        for i in 0..<Int(frames) { peak = max(peak, abs(out[i])) }
        if peak > 0.0001 {
            let scale = min(1.0, 0.7 / peak)
            for i in 0..<Int(frames) { out[i] *= scale }
        }
        return buffer
    }
}
