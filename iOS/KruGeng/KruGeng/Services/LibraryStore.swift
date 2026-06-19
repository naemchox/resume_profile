import Foundation
import Observation

/// The persistent library: fetch history plus folders of saved tabs, stored as
/// one JSON file in the app's Documents (visible via Files thanks to
/// `UIFileSharingEnabled`). Every mutation persists immediately — the payload
/// is tiny.
@Observable
final class LibraryStore {
    private(set) var history: [FetchRecord] = []
    private(set) var folders: [LibraryFolder] = []
    private(set) var tabs: [SavedTab] = []

    private struct Snapshot: Codable {
        var history: [FetchRecord]
        var folders: [LibraryFolder]
        var tabs: [SavedTab]
    }

    private let fileURL = FileManager.default
        .urls(for: .documentDirectory, in: .userDomainMask)[0]
        .appendingPathComponent("library.json")

    init() {
        load()
    }

    // MARK: History

    func recordFetch(title: String, source: FetchRecord.Source) {
        history.insert(FetchRecord(title: title, source: source, date: Date()), at: 0)
        if history.count > 100 { history.removeLast(history.count - 100) }
        persist()
    }

    func deleteHistory(_ id: UUID) {
        history.removeAll { $0.id == id }
        persist()
    }

    // MARK: Folders

    @discardableResult
    func createFolder(named name: String) -> LibraryFolder {
        let folder = LibraryFolder(name: name, createdAt: Date())
        folders.append(folder)
        persist()
        return folder
    }

    /// Removes the folder and every tab inside it.
    func deleteFolder(_ id: UUID) {
        folders.removeAll { $0.id == id }
        tabs.removeAll { $0.folderID == id }
        persist()
    }

    // MARK: Saved tabs

    func tabs(in folderID: UUID) -> [SavedTab] {
        tabs.filter { $0.folderID == folderID }
            .sorted { $0.createdAt > $1.createdAt }
    }

    func saveTab(title: String, instrument: String, bpm: Double,
                 asciiTab: String, alphaTex: String, folderID: UUID) {
        tabs.append(SavedTab(
            title: title, folderID: folderID, createdAt: Date(),
            instrument: instrument, bpm: bpm,
            asciiTab: asciiTab, alphaTex: alphaTex
        ))
        persist()
    }

    func deleteTab(_ id: UUID) {
        tabs.removeAll { $0.id == id }
        persist()
    }

    // MARK: Persistence

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        history = snapshot.history
        folders = snapshot.folders
        tabs = snapshot.tabs
    }

    private func persist() {
        let snapshot = Snapshot(history: history, folders: folders, tabs: tabs)
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
