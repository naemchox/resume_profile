import SwiftUI

/// Canvas waveform from downsampled peaks, with the played portion tinted
/// champagne. Tapping/dragging seeks. Replaces the `<canvas id="waveform">`.
struct WaveformView: View {
    let peaks: [Float]
    let progress: Double      // 0...1
    var onSeek: ((Double) -> Void)? = nil

    @Environment(\.palette) private var p

    var body: some View {
        GeometryReader { geo in
            Canvas { ctx, size in
                guard !peaks.isEmpty else { return }
                let mid = size.height / 2
                let barW = size.width / CGFloat(peaks.count)
                let split = size.width * progress
                for (i, peak) in peaks.enumerated() {
                    let x = CGFloat(i) * barW
                    let h = max(1, CGFloat(peak) * (size.height * 0.92))
                    let rect = CGRect(x: x, y: mid - h / 2, width: max(0.5, barW * 0.7), height: h)
                    let played = x <= split
                    ctx.fill(Path(roundedRect: rect, cornerRadius: barW * 0.35),
                             with: .color(played ? p.accent : p.lineStrong))
                }
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { v in
                        onSeek?(max(0, min(1, v.location.x / geo.size.width)))
                    }
            )
        }
        .frame(height: 80)
        .background(RoundedRectangle(cornerRadius: 12).fill(p.ivory))
        .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.line, lineWidth: 1))
    }
}
