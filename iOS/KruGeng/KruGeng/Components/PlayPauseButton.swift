import SwiftUI

/// A row of bars that pulse like an audio equalizer while `active`. When
/// inactive they collapse to short, dim ticks. Honors Reduce Motion (settles to
/// static mid-height bars instead of animating).
struct EqualizerBars: View {
    var active: Bool
    var color: Color

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animating = false

    /// Tall-state height ratios per bar — uneven so the wave reads as audio.
    private let peaks: [CGFloat] = [0.55, 1.0, 0.7]
    private let height: CGFloat = 13

    var body: some View {
        HStack(alignment: .center, spacing: 2.5) {
            ForEach(peaks.indices, id: \.self) { i in
                Capsule()
                    .fill(color)
                    .frame(width: 2.5, height: barHeight(i))
                    .animation(barAnimation(i), value: animating)
            }
        }
        .frame(height: height)
        .onAppear { animating = active }
        .onChange(of: active) { _, now in animating = now }
    }

    private func barHeight(_ i: Int) -> CGFloat {
        guard active else { return height * 0.3 }
        if reduceMotion { return height * (0.5 + peaks[i] * 0.35) }
        // `animating` toggles once on activation; repeatForever(autoreverses)
        // then oscillates the bar between this short floor and its peak.
        return animating ? height * peaks[i] : height * 0.3
    }

    private func barAnimation(_ i: Int) -> Animation? {
        guard active, !reduceMotion else { return .easeInOut(duration: 0.2) }
        return .easeInOut(duration: 0.42 + Double(i) * 0.08)
            .repeatForever(autoreverses: true)
            .delay(Double(i) * 0.12)
    }
}

/// Play / pause control styled to match `LuxButton`'s secondary-small pill.
/// While playing it swaps the ▶ glyph for animated `EqualizerBars`; paused, it
/// shows a static play triangle. Reuses `PressStyle` + `Haptics` for parity.
struct PlayPauseButton: View {
    var isPlaying: Bool
    var playLabel: String      // e.g. "เล่น" / "Play"  (no glyph)
    var pauseLabel: String     // e.g. "หยุด" / "Pause" (no glyph)
    let action: () -> Void

    @Environment(\.palette) private var p

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            HStack(spacing: 7) {
                if isPlaying {
                    EqualizerBars(active: true, color: p.ink)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 11, weight: .bold))
                }
                Text(isPlaying ? pauseLabel : playLabel)
                    .font(Typeface.sans(13, weight: .medium))
                    .tracking(0.2)
                    .lineLimit(1)
            }
            .foregroundStyle(p.ink)
            .padding(.horizontal, 18)
            .padding(.vertical, 10)
            .background(Capsule(style: .continuous).fill(p.paper.opacity(0.6)))
            .overlay(Capsule(style: .continuous).strokeBorder(p.lineStrong, lineWidth: 1))
        }
        .buttonStyle(PressStyle())
        .animation(.easeInOut(duration: 0.2), value: isPlaying)
    }
}
