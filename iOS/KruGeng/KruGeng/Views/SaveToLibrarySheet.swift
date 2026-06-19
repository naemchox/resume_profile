import SwiftUI

/// Folder chooser for saving the current rendered tab into the library:
/// pick an existing folder (append) or name a new one. Saving snapshots the
/// ascii tab + alphaTex with the instrument/BPM used to render them.
struct SaveToLibrarySheet: View {
    @Environment(AppState.self) private var app
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var newFolderName = ""

    private var defaultTitle: String {
        let base = app.audio.fileName.isEmpty ? "Tab" : app.audio.fileName
        return (base as NSString).deletingPathExtension
    }

    var body: some View {
        ZStack {
            p.ivory.ignoresSafeArea()

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(s.saveTabTitle)
                        .font(Typeface.serif(26, weight: .medium))
                        .foregroundStyle(p.ink)

                    field(s.tabTitlePlaceholder, text: $title, prompt: defaultTitle)

                    Text(s.chooseFolder)
                        .font(Typeface.serif(14, weight: .regular, italic: true))
                        .foregroundStyle(p.inkSoft)

                    ForEach(app.library.folders) { folder in
                        Button {
                            save(into: folder.id)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: "folder.fill")
                                    .font(.system(size: 14))
                                    .foregroundStyle(p.accentDeep)
                                    .frame(width: 34, height: 34)
                                    .background(Circle().fill(p.accentWash))
                                Text(folder.name)
                                    .font(Typeface.sans(14, weight: .medium))
                                    .foregroundStyle(p.ink)
                                    .lineLimit(1)
                                Spacer(minLength: 8)
                                Text(s.items(app.library.tabs(in: folder.id).count))
                                    .font(Typeface.sans(12))
                                    .foregroundStyle(p.inkFaint)
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 11)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.paper))
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(p.line, lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                    }

                    divider

                    HStack(spacing: 10) {
                        field(s.folderName, text: $newFolderName, prompt: s.newFolder)
                        LuxButton(title: s.createAndSave, size: .small) {
                            let name = newFolderName.trimmingCharacters(in: .whitespaces)
                            guard !name.isEmpty else { return }
                            let folder = app.library.createFolder(named: name)
                            save(into: folder.id)
                        }
                        .disabled(newFolderName.trimmingCharacters(in: .whitespaces).isEmpty)
                    }

                    LuxButton(title: s.cancel, variant: .secondary, size: .small) {
                        dismiss()
                    }
                }
                .padding(22)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func save(into folderID: UUID) {
        guard let render = app.render else { return }
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        app.library.saveTab(
            title: trimmed.isEmpty ? defaultTitle : trimmed,
            instrument: app.instrument.rawValue,
            bpm: app.bpm,
            asciiTab: render.asciiTab,
            alphaTex: render.alphaTex,
            folderID: folderID
        )
        Haptics.success()
        dismiss()
    }

    private func field(_ label: String, text: Binding<String>, prompt: String) -> some View {
        TextField(label, text: text, prompt: Text(prompt).foregroundStyle(p.inkFaint))
            .textFieldStyle(.plain)
            .font(Typeface.sans(14))
            .foregroundStyle(p.ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 12).fill(p.paper))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.lineStrong, lineWidth: 1))
    }

    private var divider: some View {
        Rectangle()
            .fill(LinearGradient(colors: [p.accent.opacity(0.35), p.line, p.line.opacity(0)],
                                 startPoint: .leading, endPoint: .trailing))
            .frame(height: 1)
    }
}
