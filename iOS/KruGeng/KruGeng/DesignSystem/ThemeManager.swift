import SwiftUI
import Observation

/// Drives the manual light/dark override behind the floating theme toggle —
/// the native counterpart of the HTML's `data-theme` attribute + `fdn-theme`
/// localStorage key. Defaults to following the system appearance until the
/// user taps the toggle, after which the explicit choice is persisted.
@Observable
final class ThemeManager {
    enum Mode: String { case system, light, dark }

    private static let key = "fdn-theme"

    var mode: Mode {
        didSet { persist() }
    }

    init() {
        if let raw = UserDefaults.standard.string(forKey: Self.key),
           let saved = Mode(rawValue: raw) {
            mode = saved
        } else {
            mode = .system
        }
    }

    /// `nil` lets SwiftUI follow the system; otherwise the explicit override.
    var preferredColorScheme: ColorScheme? {
        switch mode {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }

    /// Resolve the palette given the environment's effective scheme. When the
    /// user is on `.system`, the caller passes the live `colorScheme`.
    func palette(for systemScheme: ColorScheme) -> Palette {
        switch mode {
        case .system: return .forScheme(systemScheme)
        case .light:  return .light
        case .dark:   return .dark
        }
    }

    func isDark(systemScheme: ColorScheme) -> Bool {
        switch mode {
        case .system: return systemScheme == .dark
        case .light:  return false
        case .dark:   return true
        }
    }

    /// The toggle is binary: flip to the opposite of whatever is showing now.
    func toggle(systemScheme: ColorScheme) {
        mode = isDark(systemScheme: systemScheme) ? .light : .dark
    }

    private func persist() {
        switch mode {
        case .system: UserDefaults.standard.removeObject(forKey: Self.key)
        default:      UserDefaults.standard.set(mode.rawValue, forKey: Self.key)
        }
    }
}
