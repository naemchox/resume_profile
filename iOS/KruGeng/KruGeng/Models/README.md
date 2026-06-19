# Models

The app's data layer: the central observable state object plus the plain value types passed between transcription, the piano roll, notation, export, and the library.

## Notable files

- **AppState.swift** — `@Observable` single source of truth for the whole pipeline. Owns the audio engine and services and tracks per-step progress, errors, and the current wizard stage.
- **Models.swift** — core value types: `Note` (MIDI pitch + timing), `StemKind`/`Stem` (the six separated stems with glyphs and tints), and related notation/instrument helpers.
- **LibraryModels.swift** — `Codable` persistence types: `FetchRecord` (load/YouTube history), `LibraryFolder`, and `SavedTab` (a saved transcription snapshot).
