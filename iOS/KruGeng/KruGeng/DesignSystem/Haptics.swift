import UIKit

/// Centralized haptic feedback: a light tap on buttons, a tick when a slider
/// snaps to a value, and a success thump when a pipeline step completes.
enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred(intensity: 0.7)
    }

    static func snap() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
