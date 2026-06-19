import SwiftUI

/// App entry. Holds the `ThemeManager` and `LanguageManager`, applying the
/// user's light/dark override and language choice app-wide (the native
/// equivalent of the pre-paint `data-theme` script in the web app).
@main
struct KruGengApp: App {
    @State private var theme = ThemeManager()
    @State private var lang = LanguageManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(theme)
                .environment(lang)
                .preferredColorScheme(theme.preferredColorScheme)
        }
    }
}
