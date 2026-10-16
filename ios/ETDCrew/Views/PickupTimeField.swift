import SwiftUI

/// Optional pickup time: tap a usual window, type your own, or leave it as just the day.
struct PickupTimeField: View {
    @Binding var time: String

    static let presets: [(label: String, value: String)] = [
        ("9–12", "9 AM–12 PM"), ("12–3", "12–3 PM"), ("3–6", "3–6 PM"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Time")
                Spacer()
                TextField("Any time", text: $time)
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(.secondary)
                    .submitLabel(.done)
            }
            HStack(spacing: 8) {
                ForEach(Self.presets, id: \.value) { preset in
                    let on = time == preset.value
                    Button {
                        withAnimation(.snappy) { time = on ? "" : preset.value }
                    } label: {
                        Text(preset.label)
                            .font(.subheadline.weight(.medium))
                            .frame(maxWidth: .infinity, minHeight: 34)
                            .foregroundStyle(on ? Color(.systemBackground) : .primary)
                            .background(on ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.tertiarySystemFill)), in: .capsule)
                    }
                    .buttonStyle(.plain)
                }
            }
            .sensoryFeedback(.selection, trigger: time)
        }
    }
}
