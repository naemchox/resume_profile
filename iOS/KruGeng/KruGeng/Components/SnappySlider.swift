import SwiftUI

/// Native port of the web `SnappySlider`: a labeled track with snap marks at a
/// set of discrete values, a champagne fill, a triangle/square thumb, and a
/// value pill (with optional affix). Dragging snaps to the nearest value.
struct SnappySlider: View {
    let label: String
    var suffix: String = ""
    let values: [Double]
    @Binding var value: Double

    @Environment(\.palette) private var p

    private var lo: Double { values.first ?? 0 }
    private var hi: Double { values.last ?? 1 }

    /// Position fraction (0...1) of a value across [lo, hi].
    private func fraction(_ v: Double) -> Double {
        guard hi > lo else { return 0 }
        return (v - lo) / (hi - lo)
    }

    private func nearest(toFraction f: Double) -> Double {
        let target = lo + f * (hi - lo)
        return values.min(by: { abs($0 - target) < abs($1 - target) }) ?? lo
    }

    private var display: String {
        // Show up to two decimals, trimming trailing zeros.
        let s = String(format: "%.2f", value)
        let trimmed = s.contains(".") ? s.replacingOccurrences(of: "0+$", with: "", options: .regularExpression)
                                          .replacingOccurrences(of: "\\.$", with: "", options: .regularExpression)
                                      : s
        return trimmed
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label)
                    .font(Typeface.sans(14, weight: .medium))
                    .foregroundStyle(p.ink)
                Spacer()
                HStack(spacing: 2) {
                    Text(display)
                        .font(Typeface.sans(13).monospacedDigit())
                        .foregroundStyle(p.ink)
                    if !suffix.isEmpty {
                        Text(suffix)
                            .font(Typeface.sans(11))
                            .foregroundStyle(p.accentDeep)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 8).fill(p.accentWash))
            }

            GeometryReader { geo in
                let w = geo.size.width
                let fillW = w * fraction(value)
                ZStack(alignment: .leading) {
                    // Track
                    Capsule().fill(p.line).frame(height: 6)
                    // Fill
                    Capsule()
                        .fill(LinearGradient(colors: [p.accent, p.accentDeep],
                                             startPoint: .leading, endPoint: .trailing))
                        .frame(width: fillW, height: 6)
                    // Snap marks
                    ForEach(Array(values.enumerated()), id: \.offset) { _, v in
                        Rectangle()
                            .fill(p.paper.opacity(0.9))
                            .frame(width: 1, height: 6)
                            .offset(x: w * fraction(v) - 0.5)
                    }
                    // Thumb
                    thumb
                        .offset(x: fillW - 6)
                }
                .frame(height: 22)
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { g in
                            let next = nearest(toFraction: max(0, min(1, g.location.x / w)))
                            if next != value {
                                Haptics.snap()
                                value = next
                            }
                        }
                )
            }
            .frame(height: 22)
        }
    }

    private var thumb: some View {
        VStack(spacing: 0) {
            Triangle()
                .fill(p.accentDeep)
                .frame(width: 10, height: 6)
            Rectangle()
                .fill(p.accentDeep)
                .frame(width: 10, height: 10)
        }
    }
}

/// Downward-pointing triangle for the slider thumb head.
private struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.closeSubpath()
        return path
    }
}
