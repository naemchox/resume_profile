import SwiftUI

/// The library sheet, opened from the top-left books button. Two tabs:
/// **History** — every song loaded or fetched; **Saved tabs** — user folders
/// of saved transcriptions, with create-folder, drill-down, viewing and
/// sharing. Styled with the app's own paper/sapphire chrome rather than stock
/// navigation.
struct LibraryView: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @Environment(\.dismiss) private var dismiss

    private enum Tab: CaseIterable { case history, saved }
    @State private var tab: Tab

    /// Defaults from the `-openLibrarySaved` debug launch argument so UI tests
    /// can land directly on the saved tab.
    init(startOnSaved: Bool = ProcessInfo.processInfo.arguments.contains("-openLibrarySaved")) {
        _tab = State(initialValue: startOnSaved ? .saved : .history)
    }
    @State private var openFolder: LibraryFolder?
    @State private var viewingTab: SavedTab?
    @State private var newFolderName = ""
    @State private var folderPendingDelete: LibraryFolder?

    private var library: LibraryStore { app.library }

    var body: some View {
        ZStack {
            p.ivory.ignoresSafeArea()

            VStack(spacing: 18) {
                header
                if openFolder == nil {
                    tabPicker
                }
                content
            }
            .padding(.horizontal, 20)
            .padding(.top, 22)
            .frame(maxWidth: 760)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .sheet(item: $viewingTab) { saved in
            SavedTabDetailView(saved: saved)
        }
        .confirmationDialog(
            s.deleteFolderConfirm,
            isPresented: Binding(
                get: { folderPendingDelete != nil },
                set: { if !$0 { folderPendingDelete = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button(s.delete, role: .destructive) {
                if let folder = folderPendingDelete {
                    library.deleteFolder(folder.id)
                    if openFolder?.id == folder.id { openFolder = nil }
                }
                folderPendingDelete = nil
            }
            Button(s.cancel, role: .cancel) { folderPendingDelete = nil }
        }
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 12) {
            if let folder = openFolder {
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { openFolder = nil }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(p.accentDeep)
                        .frame(width: 36, height: 36)
                        .background(Circle().fill(p.accentWash))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(s.back)

                Text(folder.name)
                    .font(Typeface.serif(26, weight: .medium))
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
            } else {
                Text(s.library)
                    .font(Typeface.serif(28, weight: .medium))
                    .foregroundStyle(p.ink)
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.inkSoft)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(p.paper))
                    .overlay(Circle().strokeBorder(p.line, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(s.close)
        }
    }

    // MARK: Tab picker

    private var tabPicker: some View {
        HStack(spacing: 5) {
            tabChip(.history, label: s.historyTab)
            tabChip(.saved, label: s.savedTabsTab)
        }
        .padding(5)
        .background(Capsule().fill(p.paper))
        .overlay(Capsule().strokeBorder(p.line, lineWidth: 1))
    }

    private func tabChip(_ value: Tab, label: String) -> some View {
        Button {
            withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { tab = value }
        } label: {
            Text(label)
                .font(Typeface.sans(13, weight: tab == value ? .semibold : .regular))
                .foregroundStyle(tab == value ? p.inkContrast : p.inkSoft)
                .padding(.horizontal, 18)
                .padding(.vertical, 9)
                .frame(maxWidth: .infinity)
                .background {
                    if tab == value {
                        Capsule().fill(p.accent)
                    }
                }
        }
        .buttonStyle(.plain)
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let folder = openFolder {
                    folderDetail(folder)
                } else if tab == .history {
                    historyList
                } else {
                    savedRoot
                }
            }
            .padding(.bottom, 30)
        }
    }

    // MARK: History tab

    @ViewBuilder
    private var historyList: some View {
        if library.history.isEmpty {
            emptyState(s.emptyHistory, icon: "clock")
        } else {
            ForEach(library.history) { record in
                row {
                    Image(systemName: record.source == .youtube ? "play.rectangle.fill" : "doc.fill")
                        .font(.system(size: 14))
                        .foregroundStyle(p.accentDeep)
                        .frame(width: 34, height: 34)
                        .background(Circle().fill(p.accentWash))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(record.title)
                            .font(Typeface.sans(14, weight: .medium))
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                        Text("\(record.source == .youtube ? s.sourceYouTube : s.sourceFile) · \(s.dateLabel(record.date))")
                            .font(Typeface.sans(12))
                            .foregroundStyle(p.inkFaint)
                    }
                    Spacer(minLength: 8)
                    trashButton { library.deleteHistory(record.id) }
                }
            }
        }
    }

    // MARK: Saved tab — folders

    @ViewBuilder
    private var savedRoot: some View {
        newFolderRow
        if library.folders.isEmpty {
            emptyState(s.emptySaved, icon: "folder")
        } else {
            ForEach(library.folders) { folder in
                Button {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { openFolder = folder }
                } label: {
                    row {
                        Image(systemName: "folder.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(p.accentDeep)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(p.accentWash))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(folder.name)
                                .font(Typeface.sans(14, weight: .medium))
                                .foregroundStyle(p.ink)
                                .lineLimit(1)
                            Text(s.items(library.tabs(in: folder.id).count))
                                .font(Typeface.sans(12))
                                .foregroundStyle(p.inkFaint)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(p.inkFaint)
                    }
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button(role: .destructive) {
                        folderPendingDelete = folder
                    } label: {
                        Label(s.delete, systemImage: "trash")
                    }
                }
            }
        }
    }

    private var newFolderRow: some View {
        HStack(spacing: 10) {
            TextField(s.folderName, text: $newFolderName)
                .textFieldStyle(.plain)
                .font(Typeface.sans(14))
                .foregroundStyle(p.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 12).fill(p.paper))
                .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.lineStrong, lineWidth: 1))
                .submitLabel(.done)
                .onSubmit(createFolder)

            LuxButton(title: "+ \(s.newFolder)", variant: .secondary, size: .small,
                      action: createFolder)
                .disabled(newFolderName.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(.bottom, 6)
    }

    private func createFolder() {
        let name = newFolderName.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty else { return }
        library.createFolder(named: name)
        newFolderName = ""
        Haptics.success()
    }

    // MARK: Saved tab — folder detail

    @ViewBuilder
    private func folderDetail(_ folder: LibraryFolder) -> some View {
        let saved = library.tabs(in: folder.id)
        if saved.isEmpty {
            emptyState(s.emptyFolder, icon: "music.note.list")
        } else {
            ForEach(saved) { item in
                Button {
                    viewingTab = item
                } label: {
                    row {
                        Image(systemName: "music.note.list")
                            .font(.system(size: 14))
                            .foregroundStyle(p.accentDeep)
                            .frame(width: 34, height: 34)
                            .background(Circle().fill(p.accentWash))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(Typeface.sans(14, weight: .medium))
                                .foregroundStyle(p.ink)
                                .lineLimit(1)
                            Text("\(item.instrument.capitalized) · \(Int(item.bpm)) BPM · \(s.dateLabel(item.createdAt))")
                                .font(Typeface.sans(12))
                                .foregroundStyle(p.inkFaint)
                        }
                        Spacer(minLength: 8)
                        trashButton { library.deleteTab(item.id) }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Shared bits

    private func row(@ViewBuilder _ content: () -> some View) -> some View {
        HStack(spacing: 12, content: content)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.paper))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(p.line, lineWidth: 1))
    }

    private func trashButton(_ action: @escaping () -> Void) -> some View {
        Button {
            Haptics.tap()
            withAnimation(.easeOut(duration: 0.2)) { action() }
        } label: {
            Image(systemName: "trash")
                .font(.system(size: 13))
                .foregroundStyle(p.inkFaint)
                .frame(width: 34, height: 34)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(s.delete)
    }

    private func emptyState(_ message: String, icon: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 30))
                .foregroundStyle(p.accent.opacity(0.6))
            Text(message)
                .font(Typeface.serif(15, weight: .regular, italic: true))
                .foregroundStyle(p.inkFaint)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 56)
    }
}

/// Read-only viewer for one saved tab: monospaced tab text plus share.
private struct SavedTabDetailView: View {
    let saved: SavedTab

    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @Environment(\.dismiss) private var dismiss
    @State private var sharing = false

    var body: some View {
        ZStack {
            p.ivory.ignoresSafeArea()

            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(saved.title)
                            .font(Typeface.serif(24, weight: .medium))
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                        Text("\(saved.instrument.capitalized) · \(Int(saved.bpm)) BPM · \(s.dateLabel(saved.createdAt))")
                            .font(Typeface.sans(12))
                            .foregroundStyle(p.inkFaint)
                    }
                    Spacer()
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(p.inkSoft)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(p.paper))
                            .overlay(Circle().strokeBorder(p.line, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(s.close)
                }

                ScrollView([.horizontal, .vertical]) {
                    Text(saved.asciiTab)
                        .font(.system(size: 13, design: .monospaced))
                        .foregroundStyle(p.ink)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .background(RoundedRectangle(cornerRadius: 14).fill(p.paper))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.line, lineWidth: 1))

                LuxButton(title: "↑ \(s.export)", variant: .secondary, size: .small) {
                    sharing = true
                }
            }
            .padding(20)
        }
        .sheet(isPresented: $sharing) {
            ShareSheet(items: [saved.asciiTab])
        }
    }
}
