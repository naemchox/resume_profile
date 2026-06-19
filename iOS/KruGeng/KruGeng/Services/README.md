# Services

The app's logic and I/O layer: audio loading/playback, stem separation, transcription, notation generation, export, persistence, and the optional YouTube backend. Audio, transcription, notation, export, and the library are fully native; stem separation is stubbed behind a protocol pending a Core ML port.

## Notable files

- **AudioEngine.swift** — real AVFoundation file loading, peak downsampling for the waveform, and transport/playback state.
- **SeparationService.swift** — protocol for Demucs-style 6-stem separation, plus `StubSeparationService` that fakes model download/run timings.
- **TranscriptionService.swift** — transcription protocol with a deterministic stub that synthesizes a plausible riff.
- **NativePitchTranscriptionService.swift** — real monophonic transcription (decode → mono → YIN pitch detection → smoothing → note segmentation).
- **NotationService.swift** — turns notes into ASCII tab, alphaTex source, and a conversion report (ported from the web `fret`/`notation`/`alphatex` logic).
- **NoteSynth.swift** — lightweight summed-sine preview synth for playing back the note list.
- **ExportService.swift** — writes MIDI / text tab / alphaTex / JSON into Documents for the share sheet.
- **LibraryStore.swift** — `@Observable` JSON-backed persistence for fetch history, folders, and saved tabs.
- **YouTubeService.swift** — client for the optional local `serve.py` yt-dlp backend (YouTube audio fetch).
