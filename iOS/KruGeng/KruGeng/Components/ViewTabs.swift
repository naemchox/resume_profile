import SwiftUI

/// The pill segmented control from `.view-tabs`: an inset track holding ghost
/// buttons, the active one lifted onto a paper chip.
struct ViewTabs: View {
    @Binding var selection: NotationView
    @Environment(\.palette) private var p
    @Environment(\.strings) private var s
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 5) {
            ForEach(NotationView.allCases) { tab in
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) { selection = tab }
                } label: {
                    Text(s.notationTab(tab))
                        .font(Typeface.sans(13, weight: selection == tab ? .medium : .regular))
                        .foregroundStyle(selection == tab ? p.ink : p.inkSoft)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 9)
                        .background {
                            if selection == tab {
                                Capsule().fill(p.paper)
                                    .shadow(color: .black.opacity(0.06), radius: 3, y: 1)
                                    .matchedGeometryEffect(id: "chip", in: ns)
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5)
        .background(Capsule().fill(p.ivory))
        .overlay(Capsule().strokeBorder(p.line, lineWidth: 1))
    }
}
