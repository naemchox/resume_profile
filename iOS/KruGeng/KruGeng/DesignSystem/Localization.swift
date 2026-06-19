import SwiftUI
import Observation

/// All user-facing copy in one place, in English and Thai. Views read the
/// active set from the environment (`\.strings`), so flipping the language
/// toggle re-renders the whole app instantly — no app restart, no bundle
/// `.lproj` machinery.
struct Strings {
    enum Language: String { case en, th }
    let lang: Language

    private var en: Bool { lang == .en }

    var locale: Locale { Locale(identifier: en ? "en_US" : "th_TH") }

    // MARK: General
    var back: String { en ? "← Back" : "← กลับ" }
    var continueNext: String { en ? "Continue →" : "ไปต่อ →" }
    var cancel: String { en ? "Cancel" : "ยกเลิก" }
    var close: String { en ? "Close" : "ปิด" }
    var delete: String { en ? "Delete" : "ลบ" }
    var done: String { en ? "Done" : "เสร็จแล้ว" }
    var play: String { en ? "▶ Play" : "▶ เล่น" }
    var pause: String { en ? "⏸ Pause" : "⏸ หยุด" }
    var playPlain: String { en ? "Play" : "เล่น" }
    var pausePlain: String { en ? "Pause" : "หยุด" }
    var stop: String { en ? "⏹ Stop" : "⏹ หยุดเล่น" }
    var playing: String { en ? "⏸ Playing…" : "⏸ กำลังเล่น…" }
    var preparing: String { en ? "Preparing…" : "กำลังเตรียม…" }

    // MARK: Step rail
    func stageTitle(_ stage: Stage) -> String {
        switch stage {
        case .upload:     en ? "Load" : "โหลด"
        case .separate:   en ? "Separate" : "แยกเสียง"
        case .stems:      en ? "Stems" : "สเต็ม"
        case .transcribe: en ? "Transcribe" : "ถอดโน้ต"
        case .notes:      en ? "Notes" : "โน้ต"
        case .export:     en ? "Export" : "ส่งออก"
        }
    }
    func stepOf(_ n: Int, _ total: Int, _ title: String) -> String {
        en ? "Step \(n) of \(total) — \(title)" : "ขั้นที่ \(n) จาก \(total) — \(title)"
    }

    // MARK: Hero
    var eyebrow: String { en ? "Stems · Transcription · Notation" : "แยกเสียง · ถอดโน้ต · โน้ตดนตรี" }
    var heroLede: String {
        en ? "Split a song into instrument stems, transcribe any stem into notes, and view it as guitar tab, sheet music, or a piano roll — converted to whichever instrument you want."
           : "แยกเพลงออกเป็นเสียงเครื่องดนตรีแต่ละชิ้น ถอดเสียงเป็นตัวโน้ต แล้วดูเป็นแท็บกีตาร์ โน้ตเพลง หรือเปียโนโรล — แปลงเป็นเครื่องดนตรีที่คุณต้องการ"
    }

    // MARK: Upload
    var loadASong: String { en ? "Load a song" : "โหลดเพลง" }
    var dropBold: String { en ? "Drop an audio file here" : "วางไฟล์เสียงที่นี่" }
    var dropRest: String { en ? " or tap to choose" : " หรือแตะเพื่อเลือกไฟล์" }
    var ytPlaceholder: String { en ? "…or paste a YouTube link" : "…หรือวางลิงก์ YouTube" }
    var fetchAudio: String { en ? "Fetch audio" : "ดึงเสียง" }
    var fetchingAudio: String { en ? "Fetching audio…" : "กำลังดึงเสียง…" }
    var ytDisclaimer: String {
        en ? "Fetched locally via yt-dlp (run `serve.py`). Downloading may violate YouTube's Terms — personal use only."
           : "ดึงผ่าน yt-dlp ในเครื่อง (รัน serve.py) — การดาวน์โหลดอาจขัดต่อข้อกำหนดของ YouTube ใช้เพื่อส่วนตัวเท่านั้น"
    }
    var serverAddress: String { en ? "Server address" : "ที่อยู่เซิร์ฟเวอร์" }
    var separateCTA: String { en ? "Separate into stems →" : "แยกสเต็มเสียง →" }
    var skipCTA: String { en ? "Skip — transcribe full mix →" : "ข้าม — ถอดโน้ตทั้งเพลง →" }

    // MARK: Separate
    var separateStems: String { en ? "Separate stems" : "แยกสเต็มเสียง" }
    var downloadModel: String { en ? "Download AI model (55 MB, one-time)" : "ดาวน์โหลดโมเดล AI (55 MB ครั้งเดียว)" }
    var modelInstalled: String { en ? "Demucs v4 installed" : "ติดตั้ง Demucs v4 แล้ว" }
    var uninstallModel: String { en ? "Uninstall AI model" : "ลบโมเดล AI" }
    var uninstallConfirmTitle: String { en ? "Uninstall the AI model?" : "ลบโมเดล AI ออกหรือไม่" }
    var uninstallConfirmMessage: String {
        en ? "Frees the model's space on this device. You can download it again anytime."
           : "คืนพื้นที่ของโมเดลบนเครื่องนี้ ดาวน์โหลดใหม่ได้ทุกเมื่อ"
    }
    var separate: String { en ? "Separate" : "เริ่มแยกเสียง" }
    var separateAgain: String { en ? "Separate again" : "แยกอีกครั้ง" }
    var sepInfo: String {
        en ? "Separation takes 1–5 minutes in the full app, depending on song length. Stems: vocals, drums, bass, guitar, piano, other. Guitar/piano separation is experimental — expect some bleed."
           : "การแยกเสียงใช้เวลา 1–5 นาทีขึ้นกับความยาวเพลง สเต็มที่ได้: เสียงร้อง กลอง เบส กีตาร์ เปียโน และอื่น ๆ — การแยกกีตาร์/เปียโนยังอยู่ขั้นทดลอง อาจมีเสียงปนกันบ้าง"
    }
    var hintSeparateNeedsAudio: String {
        en ? "Load a song in step 1 to run separation."
           : "โหลดเพลงในขั้นที่ 1 เพื่อแยกเสียง"
    }

    // MARK: Stems
    var stems: String { en ? "Stems" : "สเต็มเสียง" }
    var transcribeThis: String { en ? "Transcribe →" : "ถอดโน้ต →" }
    var selectedCheck: String { en ? "Selected ✓" : "เลือกแล้ว ✓" }
    var emptyStems: String { en ? "Run separation in step 2 to split the song into these six stems." : "กดแยกเสียงในขั้นที่ 2 เพื่อแยกเพลงออกเป็นสเต็มทั้งหก" }
    var emptyStemsCTA: String { en ? "Go to separation" : "ไปที่การแยกเสียง" }
    func stemName(_ kind: StemKind) -> String {
        switch kind {
        case .vocals: en ? "Vocals" : "เสียงร้อง"
        case .drums:  en ? "Drums" : "กลอง"
        case .bass:   en ? "Bass" : "เบส"
        case .guitar: en ? "Guitar" : "กีตาร์"
        case .piano:  en ? "Piano" : "เปียโน"
        case .other:  en ? "Other" : "อื่น ๆ"
        }
    }

    // MARK: Transcribe
    var transcribe: String { en ? "Transcribe" : "ถอดโน้ต" }
    var transcribeAgain: String { en ? "Transcribe again" : "ถอดอีกครั้ง" }
    var noteConfidence: String { en ? "Note confidence" : "ความมั่นใจของโน้ต" }
    var minNoteLength: String { en ? "Min note length" : "ความยาวโน้ตขั้นต่ำ" }
    var reductionTitle: String { en ? "Reduction" : "โหมดการถอด" }
    func reduction(_ r: Reduction) -> String {
        switch r {
        case .all:    en ? "All notes (chords kept)" : "ทุกตัวโน้ต (เก็บคอร์ด)"
        case .melody: en ? "Melody only (single line)" : "เฉพาะทำนอง (บรรทัดเดียว)"
        case .vocal:  en ? "Melody (vocals → tabs)" : "เมโลดี้ (เสียงร้อง → แท็บ)"
        }
    }
    func notesCount(_ n: Int) -> String { en ? "\(n) notes" : "\(n) โน้ต" }
    var hintTranscribeNeedsAudio: String {
        en ? "Load a song in step 1 — transcription runs on the full mix or a chosen stem."
           : "โหลดเพลงในขั้นที่ 1 ก่อน — การถอดโน้ตใช้ทั้งเพลงหรือสเต็มที่เลือกไว้"
    }
    /// "transcribing the … stem / the full mix" subtitle.
    func transcribeSource(stem: StemKind?, skipped: Bool) -> String {
        if let stem { return en ? "the \(stemName(stem).lowercased()) stem" : "สเต็ม\(stemName(stem))" }
        return skipped ? (en ? "the full mix" : "ทั้งเพลง") : (en ? "a stem" : "สเต็ม")
    }

    // MARK: Notes & notation
    var notesNotation: String { en ? "Notes & notation" : "โน้ตและสัญลักษณ์" }
    var hintNotesEmpty: String { en ? "Transcribe notes in step 4 to start editing." : "ถอดโน้ตในขั้นที่ 4 เพื่อเริ่มแก้ไข" }
    var instrumentTitle: String { en ? "Instrument" : "เครื่องดนตรี" }
    var gridTitle: String { en ? "Grid" : "กริด" }
    func gridOption(_ division: Int) -> String {
        division == 8 ? (en ? "8ths" : "โน้ต 1/8") : (en ? "16ths" : "โน้ต 1/16")
    }
    func instrumentLabel(_ i: Instrument) -> String {
        switch i {
        case .guitar:  en ? "Guitar (tab + score)" : "กีตาร์ (แท็บ + โน้ต)"
        case .bass:    en ? "Bass (tab + score)" : "เบส (แท็บ + โน้ต)"
        case .ukulele: en ? "Ukulele (tab + score)" : "อูคูเลเล่ (แท็บ + โน้ต)"
        case .piano:   en ? "Piano (grand staff)" : "เปียโน (แกรนด์สตาฟ)"
        case .flute:   en ? "Flute (score + fingerings)" : "ฟลุต (โน้ต + ตำแหน่งนิ้ว)"
        }
    }
    func notationTab(_ tab: NotationView) -> String {
        switch tab {
        case .notation:  en ? "Notation" : "โน้ตเพลง"
        case .pianoroll: en ? "Piano roll (edit)" : "เปียโนโรล (แก้ไข)"
        case .ascii:     en ? "Text tab" : "แท็บตัวอักษร"
        }
    }
    var scoreRoadmap: String { en ? "Native score rendering is on the roadmap." : "การแสดงโน้ตเพลงแบบเนทีฟกำลังพัฒนา" }
    var scoreRoadmapDetail: String {
        en ? "Use the piano roll to edit and the text tab for a readable layout. Export to MIDI or alphaTex to open full notation elsewhere."
           : "ใช้เปียโนโรลเพื่อแก้ไข และแท็บตัวอักษรเพื่ออ่าน หรือส่งออกเป็น MIDI / alphaTex เพื่อเปิดโน้ตเต็มในแอปอื่น"
    }
    var synthCaption: String { en ? "Synthesized preview of the current notes." : "เสียงตัวอย่างสังเคราะห์จากโน้ตปัจจุบัน" }
    var deleteSelected: String { en ? "Delete selected" : "ลบโน้ตที่เลือก" }
    var pianoRollHelp: String { en ? "Tap to select · drag to move · double-tap to add" : "แตะเพื่อเลือก · ลากเพื่อย้าย · แตะสองครั้งเพื่อเพิ่ม" }

    // MARK: Export
    var export: String { en ? "Export" : "ส่งออก" }
    var hintExportEmpty: String { en ? "Transcribe notes in step 4 to enable exporting." : "ถอดโน้ตในขั้นที่ 4 เพื่อเปิดการส่งออก" }
    var exportInfo: String {
        en ? "MIDI opens in any DAW; alphaTex re-renders in alphaTab-based tools. Files land in the app's Documents and via the share sheet."
           : "ไฟล์ MIDI เปิดได้ในทุก DAW ส่วน alphaTex ใช้กับเครื่องมือตระกูล alphaTab — ไฟล์จะถูกเก็บใน Documents ของแอปและแชร์ผ่านชีตแชร์"
    }
    var saveToLibrary: String { en ? "Save tab to library" : "บันทึกแท็บลงคลัง" }

    // MARK: Bottom-bar hints
    var hintLoad: String { en ? "Load a song to begin" : "โหลดเพลงเพื่อเริ่มต้น" }
    var hintChoosePath: String { en ? "Choose a path above to continue" : "เลือกเส้นทางด้านบนเพื่อไปต่อ" }
    var hintRunSeparation: String { en ? "Run separation to continue" : "แยกเสียงเพื่อไปต่อ" }
    var hintTranscribe: String { en ? "Transcribe to continue" : "ถอดโน้ตเพื่อไปต่อ" }
    var hintExport: String { en ? "Your files export from here anytime" : "ส่งออกไฟล์จากหน้านี้ได้ทุกเมื่อ" }

    // MARK: Library
    var library: String { en ? "Library" : "คลัง" }
    var historyTab: String { en ? "History" : "ประวัติ" }
    var savedTabsTab: String { en ? "Saved tabs" : "แท็บที่บันทึก" }
    var emptyHistory: String { en ? "Nothing fetched yet — load or fetch a song and it will appear here." : "ยังไม่มีประวัติ — โหลดหรือดึงเพลงแล้วจะแสดงที่นี่" }
    var emptySaved: String { en ? "No saved tabs yet — save one from the Export step." : "ยังไม่มีแท็บที่บันทึก — บันทึกได้จากขั้นส่งออก" }
    var emptyFolder: String { en ? "This folder is empty." : "โฟลเดอร์นี้ว่างเปล่า" }
    var newFolder: String { en ? "New folder" : "โฟลเดอร์ใหม่" }
    var folderName: String { en ? "Folder name" : "ชื่อโฟลเดอร์" }
    var create: String { en ? "Create" : "สร้าง" }
    var createAndSave: String { en ? "Create & save" : "สร้างและบันทึก" }
    var chooseFolder: String { en ? "Choose a folder, or create a new one." : "เลือกโฟลเดอร์ หรือสร้างใหม่" }
    var saveTabTitle: String { en ? "Save to library" : "บันทึกลงคลัง" }
    var tabTitlePlaceholder: String { en ? "Tab title" : "ชื่อแท็บ" }
    func items(_ n: Int) -> String {
        en ? (n == 1 ? "1 item" : "\(n) items") : "\(n) รายการ"
    }
    var sourceFile: String { en ? "File" : "ไฟล์" }
    var sourceYouTube: String { "YouTube" }
    var deleteFolderConfirm: String { en ? "Delete this folder and all tabs inside it?" : "ลบโฟลเดอร์นี้และแท็บข้างในทั้งหมด?" }
    func dateLabel(_ date: Date) -> String {
        // Pin the calendar: Gregorian for English, Buddhist Era for Thai —
        // otherwise the device's calendar leaks into the other language.
        var calendar = Calendar(identifier: en ? .gregorian : .buddhist)
        calendar.locale = locale
        let style = Date.FormatStyle(date: .abbreviated, time: .shortened,
                                     locale: locale, calendar: calendar)
        return date.formatted(style)
    }

    // MARK: Footer
    var footer1: String {
        en ? "Separation · Transcription · Notation — a native port of Find da Note."
           : "แยกเสียง · ถอดโน้ต · โน้ตดนตรี — พอร์ตเนทีฟของ Find da Note"
    }
    var footer2: String {
        en ? "ML engines stubbed for now; UI, audio, tab & export run natively."
           : "เอนจิน ML ยังเป็นตัวจำลอง — UI เสียง แท็บ และการส่งออกทำงานแบบเนทีฟ"
    }

    // MARK: Accessibility
    var openLibrary: String { en ? "Open library" : "เปิดคลัง" }
    var switchLanguage: String { en ? "Switch language" : "เปลี่ยนภาษา" }
}

/// Persists the chosen language (`fdn-lang`) and vends the matching `Strings`.
@Observable
final class LanguageManager {
    private static let key = "fdn-lang"

    var language: Strings.Language {
        didSet { UserDefaults.standard.set(language.rawValue, forKey: Self.key) }
    }

    init() {
        if let raw = UserDefaults.standard.string(forKey: Self.key),
           let saved = Strings.Language(rawValue: raw) {
            language = saved
        } else {
            language = .en
        }
    }

    var strings: Strings { Strings(lang: language) }

    func toggle() {
        language = language == .en ? .th : .en
    }
}

// MARK: - Environment plumbing

private struct StringsKey: EnvironmentKey {
    static let defaultValue = Strings(lang: .en)
}

extension EnvironmentValues {
    var strings: Strings {
        get { self[StringsKey.self] }
        set { self[StringsKey.self] = newValue }
    }
}
