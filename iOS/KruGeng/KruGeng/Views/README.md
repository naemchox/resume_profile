# Views

The screen-level SwiftUI views: the wizard root, the six step panels, the editing/notation views, and the modal sheets. Each reads `AppState`, the palette, and localized strings from the environment.

## Notable files

- **ContentView.swift** — the guided-wizard root: brand bar + step rail, one sliding step panel at a time, and a Back/Continue bottom bar; hosts the sheets.
- **HeaderView.swift** — the hero header (eyebrow, "Geng" wordmark, lede) over the drifting `HeroShapes` backdrop.
- **UploadPanel.swift** — step 1: load a song, optional playback/waveform, and the separate-vs-skip branch.
- **SeparatePanel.swift** — step 2: one-time model download then the stem-separation run.
- **StemsPanel.swift** — step 3: the six separated stems with transcribe hand-off and WAV share.
- **TranscribePanel.swift** — step 4: confidence/min-length sliders, reduction picker, and the transcription run.
- **NotesPanel.swift** — step 5: instrument/BPM/grid controls, conversion report, score/piano-roll/text-tab views, and preview synth.
- **PianoRollView.swift** — interactive piano-roll editor (tap to select, drag to move, add/delete notes).
- **ExportPanel.swift** — step 6: export MIDI/tab/alphaTex/JSON via the share sheet or save to the library.
- **LibraryView.swift** — the library sheet with History and Saved-tabs tabs (folders, drill-down, view, share).
- **SaveToLibrarySheet.swift** — folder chooser for saving the current rendered tab into the library.
