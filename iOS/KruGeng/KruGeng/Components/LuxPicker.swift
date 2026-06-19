import SwiftUI

/// The styled dropdown trigger from `.lux-select`: a rounded ivory field with a
/// champagne chevron, backed by a native `Menu` for the popup (the platform
/// listbox replaces the hand-built one in `js/lux-select.js`).
struct LuxPicker<T: Hashable>: View {
    var label: String? = nil
    @Binding var selection: T
    let options: [(value: T, title: String)]

    @Environment(\.palette) private var p

    private var currentTitle: String {
        options.first { $0.value == selection }?.title ?? ""
    }

    var body: some View {
        Menu {
            ForEach(options, id: \.value) { opt in
                Button {
                    selection = opt.value
                } label: {
                    if opt.value == selection {
                        Label(opt.title, systemImage: "checkmark")
                    } else {
                        Text(opt.title)
                    }
                }
            }
        } label: {
            HStack(spacing: 12) {
                Text(currentTitle)
                    .font(Typeface.sans(15))
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(p.accentDeep)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(RoundedRectangle(cornerRadius: 12).fill(p.ivory))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.lineStrong, lineWidth: 1))
        }
        .menuStyle(.button)
    }
}
