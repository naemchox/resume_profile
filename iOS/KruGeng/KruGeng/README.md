# KruGeng (source root)

The app's Swift source root. Holds the app entry point and the five layers that make up the codebase: reusable UI components, the design system, data models, services (audio/transcription/persistence), and the screen-level views.

## Notable files

- **KruGengApp.swift** — `@main` app entry. Creates the `ThemeManager` and `LanguageManager`, injects them into the environment, and applies the light/dark override app-wide.

## Subfolders

- **Components/** — reusable SwiftUI building blocks (buttons, sliders, toggles, panels, waveform).
- **DesignSystem/** — palette, typography, haptics, localization, and theme management.
- **Models/** — observable app state and the plain data types (notes, stems, library records).
- **Services/** — audio engine, separation/transcription/notation, export, persistence, YouTube client.
- **Views/** — the wizard screens and panels for each pipeline step.
- **Assets.xcassets/** — image and color assets (not documented here).
