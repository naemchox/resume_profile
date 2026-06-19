import SwiftUI

/// The wizard's progress rail: six nodes joined by hairlines. Completed steps
/// fill with the sapphire gradient and a check, the current step is a larger
/// numbered ring, other steps are open circles. Every node is tappable —
/// the wizard is freely browsable. Below the rail, the current position and
/// step name in small caps.
struct StepRail: View {
    var onSelect: (Stage) -> Void

    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 0) {
                ForEach(Stage.allCases, id: \.self) { stage in
                    if stage != .upload {
                        connector(into: stage)
                    }
                    node(stage)
                }
            }
            Text(s.stepOf(app.currentStage.rawValue + 1, Stage.allCases.count, s.stageTitle(app.currentStage)))
                .font(Typeface.sans(11, weight: .medium))
                .textCase(.uppercase)
                .tracking(1.6)
                .foregroundStyle(p.inkSoft)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: app.currentStage)
    }

    private func node(_ stage: Stage) -> some View {
        let done = app.isDone(stage)
        let current = stage == app.currentStage
        return Button {
            onSelect(stage)
        } label: {
            ZStack {
                if done && !current {
                    Circle().fill(p.accentFill)
                    Image(systemName: "checkmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(p.inkContrast)
                } else {
                    Circle().fill(current ? p.accentWash : p.paper)
                    Circle().strokeBorder(
                        current ? p.accent : p.lineStrong,
                        lineWidth: current ? 1.5 : 1
                    )
                    Text("\(stage.rawValue + 1)")
                        .font(Typeface.serif(current ? 15 : 12, weight: .medium, italic: true))
                        .foregroundStyle(current ? p.accentDeep : p.inkSoft)
                }
            }
            .frame(width: current ? 34 : 26, height: current ? 34 : 26)
            .shadow(color: current ? p.accent.opacity(0.25) : .clear, radius: 6, y: 2)
            // Keep a 44pt hit target despite the small visual node.
            .frame(width: 40, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Step \(stage.rawValue + 1), \(s.stageTitle(stage))")
        .accessibilityValue(done ? "completed" : current ? "current step" : "available")
    }

    private func connector(into stage: Stage) -> some View {
        let reached = app.isDone(Stage(rawValue: stage.rawValue - 1) ?? .upload)
        return Rectangle()
            .fill(reached ? p.accent.opacity(0.5) : p.line)
            .frame(height: 1)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
    }
}
