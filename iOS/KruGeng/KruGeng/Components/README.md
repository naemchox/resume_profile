# Components

Reusable, presentation-only SwiftUI views that make up the app's "lux" visual language — ports of the web app's CSS components. Most read the palette and localized strings from the environment and use shared `PressStyle`/`Haptics` for tactile feedback.

## Notable files

- **AppBackdrop.swift** — app-wide canvas: a breathing `MeshGradient` aurora (iOS 18+) or drifting glow orbs (iOS 17), honoring Reduce Motion.
- **BrandBar.swift** — compact top bar with the library button, "Geng" serif wordmark, and language/theme toggles.
- **Dropzone.swift** — dashed audio upload target; taps open the file importer and it accepts dragged files.
- **HeroShapes.swift** — drifting translucent capsules behind the hero header.
- **LanguageToggle.swift** — EN/ไทย pill switch.
- **ThemeToggle.swift** — light/dark pill switch with a sliding sun/moon knob.
- **LuxButton.swift** — primary/secondary pill buttons with press-scale, loading sweep, and `PressStyle`.
- **LuxPicker.swift** — styled dropdown trigger backed by a native `Menu`.
- **LuxProgressBar.swift** — champagne progress track with shimmer and a percent readout.
- **Panel.swift** — the numbered step card (with `StepNumber` badge) wrapping each wizard step.
- **PlayPauseButton.swift** — play/pause pill with animated `EqualizerBars` while playing.
- **SnappySlider.swift** — labeled slider that snaps to discrete values with haptic ticks.
- **StepRail.swift** — the six-node wizard progress rail; every node is tappable.
- **ViewTabs.swift** — pill segmented control for switching notation views.
- **WaveformView.swift** — `Canvas` waveform from downsampled peaks with tap/drag seeking.
- **ShareSheet.swift** — thin `UIActivityViewController` wrapper for sharing exported files.
