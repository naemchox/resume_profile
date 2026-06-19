import Foundation
import AVFoundation
import Observation

/// Real audio loading + playback (AVFoundation). Decodes a dropped/imported
/// file, downsamples it into normalized peaks for the waveform, and drives
/// transport state. This is the one fully-native engine; separation,
/// transcription and notation are stubbed behind protocols for now.
@Observable
final class AudioEngine: NSObject, AVAudioPlayerDelegate {
    private(set) var fileName: String = ""
    private(set) var duration: Double = 0
    private(set) var peaks: [Float] = []
    private(set) var sampleRate: Double = 44100

    var isPlaying = false
    var currentTime: Double = 0

    /// The currently-loaded source file (kept so stems/transcription can reuse it).
    private(set) var sourceURL: URL?

    private var player: AVAudioPlayer?
    private var displayTimer: Timer?

    // MARK: Loading

    /// Decode `url` into peaks + duration. Throws on unreadable/unsupported audio.
    func load(url: URL) throws {
        let needsStop = url.startAccessingSecurityScopedResource()
        defer { if needsStop { url.stopAccessingSecurityScopedResource() } }

        // Copy into Documents so we keep access after the security scope ends.
        let local = try copyIntoDocuments(url)

        let file = try AVAudioFile(forReading: local)
        let format = file.processingFormat
        sampleRate = format.sampleRate
        let frameCount = AVAudioFrameCount(file.length)
        duration = Double(file.length) / format.sampleRate

        if let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) {
            try file.read(into: buffer)
            peaks = Self.downsample(buffer, buckets: 800)
        }

        sourceURL = local
        fileName = url.lastPathComponent
        currentTime = 0
        configureSession()
        player = try AVAudioPlayer(contentsOf: local)
        player?.delegate = self
        player?.prepareToPlay()
    }

    private func copyIntoDocuments(_ url: URL) throws -> URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dest = docs.appendingPathComponent("source-" + url.lastPathComponent)
        if FileManager.default.fileExists(atPath: dest.path) {
            try? FileManager.default.removeItem(at: dest)
        }
        try FileManager.default.copyItem(at: url, to: dest)
        return dest
    }

    // MARK: Transport

    func togglePlay() { isPlaying ? pause() : play() }

    func play() {
        guard let player else { return }
        configureSession()
        player.play()
        isPlaying = true
        startTimer()
    }

    func pause() {
        player?.pause()
        isPlaying = false
        stopTimer()
    }

    func stop() {
        player?.stop()
        player?.currentTime = 0
        currentTime = 0
        isPlaying = false
        stopTimer()
    }

    func seek(to time: Double) {
        player?.currentTime = max(0, min(time, duration))
        currentTime = player?.currentTime ?? 0
    }

    // MARK: AVAudioPlayerDelegate

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        isPlaying = false
        currentTime = 0
        stopTimer()
    }

    // MARK: Helpers

    private func configureSession() {
        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .default)
        try? session.setActive(true)
        #endif
    }

    private func startTimer() {
        stopTimer()
        displayTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            guard let self, let player = self.player else { return }
            self.currentTime = player.currentTime
        }
    }

    private func stopTimer() {
        displayTimer?.invalidate()
        displayTimer = nil
    }

    /// Reduce a PCM buffer to `buckets` peak magnitudes normalized to 0...1.
    private static func downsample(_ buffer: AVAudioPCMBuffer, buckets: Int) -> [Float] {
        guard let channelData = buffer.floatChannelData else { return [] }
        let channels = Int(buffer.format.channelCount)
        let frames = Int(buffer.frameLength)
        guard frames > 0 else { return [] }

        let bucketSize = max(1, frames / buckets)
        var result = [Float]()
        result.reserveCapacity(buckets)
        var maxPeak: Float = 0.0001

        var i = 0
        while i < frames {
            var peak: Float = 0
            let end = min(i + bucketSize, frames)
            var j = i
            while j < end {
                for c in 0..<channels {
                    peak = max(peak, abs(channelData[c][j]))
                }
                j += 1
            }
            result.append(peak)
            maxPeak = max(maxPeak, peak)
            i += bucketSize
        }
        return result.map { $0 / maxPeak }
    }
}
