import Foundation

/// One entry in the library's fetch history — every song loaded from a file
/// or fetched from YouTube.
struct FetchRecord: Identifiable, Codable, Equatable {
    enum Source: String, Codable { case file, youtube }
    var id = UUID()
    let title: String
    let source: Source
    let date: Date
}

/// A user-created folder in the saved-tabs library.
struct LibraryFolder: Identifiable, Codable, Equatable, Hashable {
    var id = UUID()
    var name: String
    let createdAt: Date
}

/// A transcribed tab snapshot saved into a library folder.
struct SavedTab: Identifiable, Codable, Equatable {
    var id = UUID()
    var title: String
    var folderID: UUID
    let createdAt: Date
    let instrument: String
    let bpm: Double
    let asciiTab: String
    let alphaTex: String
}
