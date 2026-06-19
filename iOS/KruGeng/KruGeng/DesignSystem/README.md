# DesignSystem

The visual and interaction foundation shared across the app — color, type, haptics, theme, and copy. These are the native counterparts of the web app's CSS variables and `data-theme`/`localStorage` machinery.

## Notable files

- **Palette.swift** — the "luxury · minimal · bright" color palette (ivory/ink paper with a sapphire accent) for light and dark, exposed through the environment.
- **Typography.swift** — `Typeface` helpers mapping the Playfair/Inter pairing to system serif + sans, plus label/eyebrow text treatments.
- **ThemeManager.swift** — observable light/dark/system override, persisted to `UserDefaults`; resolves the active `Palette`.
- **Localization.swift** — `Strings` with all user-facing copy in English and Thai, read live from the environment so language flips re-render instantly.
- **Haptics.swift** — centralized haptic feedback (tap, snap, success).
