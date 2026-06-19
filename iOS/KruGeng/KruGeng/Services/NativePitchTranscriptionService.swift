import Foundation
import AVFoundation

/// Real monophonic transcription that actually listens to the audio, so the
/// notes (and therefore the tab / piano roll / export) follow the song instead
/// of a canned demo riff.
///
/// Pipeline: decode → mono → decimate to ~22 kHz → per-frame YIN pitch
/// detection (with an energy + clarity voicing gate) → median-smooth the pitch
/// track → segment equal-pitch runs into notes → drop sub-minimum notes.
///
/// It's monophonic: it follows the single strongest pitch per frame, which is
/// the right model for a lead/vocal/bass stem. Polyphonic chord detection is a
/// later Core ML job; `.all` reduction simply keeps the detected line.
struct NativePitchTranscriptionService: TranscriptionService {
    func transcribe(source: URL,
                    duration: Double,
                    settings: TranscribeSettings,
                    progress: @escaping (Double) -> Void) async -> [Note] {
        progress(0.02)

        // 1. Decode to a mono, decimated sample buffer.
        guard let (samples, rate) = Self.loadMono(url: source, targetRate: 22_050, maxDuration: 240),
              samples.count >= Self.window else {
            return []
        }
        progress(0.15)

        let hop = Self.window / 2
        let frameCount = (samples.count - Self.window) / hop + 1
        let secPerFrame = Double(hop) / rate

        // 2. Per-frame pitch + clarity + energy.
        var midis = [Double](repeating: 0, count: frameCount)
        var clarities = [Float](repeating: 0, count: frameCount)
        var rmsValues = [Float](repeating: 0, count: frameCount)
        var maxRMS: Float = 0.0001

        for f in 0..<frameCount {
            let det = Self.detectPitch(samples, start: f * hop, window: Self.window, rate: rate)
            midis[f] = det.midi
            clarities[f] = det.clarity
            rmsValues[f] = det.rms
            maxRMS = max(maxRMS, det.rms)

            if f % 64 == 0 {
                progress(0.15 + 0.8 * Double(f) / Double(frameCount))
                await Task.yield()
            }
        }
        progress(0.96)

        // 3. Voicing gate. Higher "confidence" demands clearer pitch + more energy.
        let clarityGate = Float(0.45 + settings.confidence * 0.5)   // ~0.47 … 0.85
        let energyGate = maxRMS * Float(0.06 + settings.confidence * 0.14)
        var pitchTrack = [Int](repeating: 0, count: frameCount)     // 0 ⇒ unvoiced
        for f in 0..<frameCount {
            let voiced = clarities[f] >= clarityGate
                && rmsValues[f] >= energyGate
                && midis[f] >= 24 && midis[f] <= 96       // C1 … C7, reject octave junk
            pitchTrack[f] = voiced ? Int(midis[f].rounded()) : 0
        }

        // 4. Median-smooth (window 5) to kill single-frame octave flickers.
        let smoothed = Self.medianSmooth(pitchTrack, radius: 2)

        // 5. Segment equal-pitch runs into notes, tolerating short dropouts.
        let minDur = max(0.03, settings.minLengthMs / 1000.0)
        let maxGapFrames = 2
        var notes: [Note] = []
        var curPitch = 0
        var startFrame = 0
        var gap = 0

        func close(at endFrame: Int) {
            guard curPitch > 0 else { return }
            let start = Double(startFrame) * secPerFrame
            let end = Double(endFrame) * secPerFrame
            let dur = end - start
            if dur >= minDur {
                notes.append(Note(pitch: curPitch, start: start, duration: dur))
            }
            curPitch = 0
        }

        for f in 0..<frameCount {
            let p = smoothed[f]
            if p == 0 {
                if curPitch != 0 {
                    gap += 1
                    if gap > maxGapFrames { close(at: f - gap + 1); gap = 0 }
                }
            } else if p == curPitch {
                gap = 0
            } else {
                close(at: f - gap)
                curPitch = p
                startFrame = f
                gap = 0
            }
        }
        close(at: frameCount)

        progress(1.0)
        return notes
    }

    // MARK: - DSP

    /// YIN analysis window (samples at the decimated rate). 1024 @ 22 kHz lets us
    /// resolve fundamentals down to ~43 Hz with a ~23 ms hop.
    private static let window = 1024

    /// Decode `url`, mix to mono, and box-decimate toward `targetRate`.
    /// Returns the samples and their actual (decimated) sample rate.
    private static func loadMono(url: URL, targetRate: Double, maxDuration: Double) -> (samples: [Float], rate: Double)? {
        guard let file = try? AVAudioFile(forReading: url) else { return nil }
        let format = file.processingFormat
        let srcRate = format.sampleRate
        let cap = AVAudioFrameCount(min(file.length, Int64(maxDuration * srcRate)))
        guard cap > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: cap),
              (try? file.read(into: buffer, frameCount: cap)) != nil,
              let chans = buffer.floatChannelData else { return nil }

        let n = Int(buffer.frameLength)
        let channelCount = Int(format.channelCount)
        var mono = [Float](repeating: 0, count: n)
        for c in 0..<channelCount {
            let p = chans[c]
            for i in 0..<n { mono[i] += p[i] }
        }
        if channelCount > 1 {
            let inv = 1 / Float(channelCount)
            for i in 0..<n { mono[i] *= inv }
        }

        let factor = max(1, Int((srcRate / targetRate).rounded()))
        if factor == 1 { return (mono, srcRate) }
        let outCount = n / factor
        guard outCount > 0 else { return nil }
        var out = [Float](repeating: 0, count: outCount)
        let invF = 1 / Float(factor)
        for i in 0..<outCount {
            var acc: Float = 0
            let base = i * factor
            for k in 0..<factor { acc += mono[base + k] }
            out[i] = acc * invF
        }
        return (out, srcRate / Double(factor))
    }

    /// YIN fundamental-frequency estimate for one window starting at `start`.
    /// Returns the MIDI pitch (fractional), a 0…1 clarity, and the frame RMS.
    private static func detectPitch(_ s: [Float], start: Int, window: Int, rate: Double) -> (midi: Double, clarity: Float, rms: Float) {
        let tauMax = window / 2

        var energy: Float = 0
        for i in 0..<window { let v = s[start + i]; energy += v * v }
        let rms = (energy / Float(window)).squareRoot()

        // Difference function d(tau).
        var diff = [Float](repeating: 0, count: tauMax)
        for tau in 1..<tauMax {
            var sum: Float = 0
            var j = 0
            while j < tauMax {
                let d = s[start + j] - s[start + j + tau]
                sum += d * d
                j += 1
            }
            diff[tau] = sum
        }

        // Cumulative mean normalized difference d'(tau).
        var cmnd = [Float](repeating: 1, count: tauMax)
        var running: Float = 0
        for tau in 1..<tauMax {
            running += diff[tau]
            cmnd[tau] = running > 0 ? diff[tau] * Float(tau) / running : 1
        }

        // Absolute threshold: first dip below, then descend to its local min.
        let threshold: Float = 0.15
        var tauEstimate = -1
        var tau = 2
        while tau < tauMax {
            if cmnd[tau] < threshold {
                while tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau] { tau += 1 }
                tauEstimate = tau
                break
            }
            tau += 1
        }
        if tauEstimate == -1 {
            var minTau = 2
            var minVal = cmnd[2]
            for t in 3..<tauMax where cmnd[t] < minVal { minVal = cmnd[t]; minTau = t }
            tauEstimate = minTau
        }

        let clarity = max(0, 1 - cmnd[tauEstimate])

        // Parabolic interpolation around the chosen tau for sub-sample accuracy.
        var betterTau = Float(tauEstimate)
        if tauEstimate > 1 && tauEstimate < tauMax - 1 {
            let a = cmnd[tauEstimate - 1], b = cmnd[tauEstimate], c = cmnd[tauEstimate + 1]
            let denom = 2 * (2 * b - a - c)
            if denom != 0 { betterTau = Float(tauEstimate) + (c - a) / denom }
        }

        let freq = betterTau > 0 ? Float(rate) / betterTau : 0
        let midi = freq > 0 ? 69 + 12 * log2(Double(freq) / 440) : 0
        return (midi, clarity, rms)
    }

    /// Median filter over the integer pitch track (0 = unvoiced is preserved
    /// through the median naturally), `radius` frames each side.
    private static func medianSmooth(_ track: [Int], radius: Int) -> [Int] {
        guard radius > 0, track.count > 2 * radius else { return track }
        var out = track
        for i in radius..<(track.count - radius) {
            var window = [Int]()
            window.reserveCapacity(2 * radius + 1)
            for k in (i - radius)...(i + radius) { window.append(track[k]) }
            window.sort()
            out[i] = window[radius]
        }
        return out
    }
}
