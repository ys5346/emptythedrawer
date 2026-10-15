import SwiftUI

struct ScheduleSheet: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let pickup: Pickup
    @State private var date: Date
    @State private var saving = false

    init(pickup: Pickup) {
        self.pickup = pickup
        let start = Day.date(pickup.pickupDate) ?? Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
        _date = State(initialValue: max(start, Calendar.current.startOfDay(for: .now)))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                DatePicker("Pickup day", selection: $date, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding(.horizontal)
                Label("\(pickup.displayName) gets an email with this date.", systemImage: "envelope")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding()
                Spacer(minLength: 0)
            }
            .navigationTitle(pickup.pickupDate == nil ? "Schedule Pickup" : "Change Pickup Day")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            saving = true
                            Task {
                                if await store.schedule(pickup, on: date) { dismiss() }
                                saving = false
                            }
                        }
                        .fontWeight(.semibold)
                    }
                }
            }
        }
        .presentationDetents([.height(560), .large])
        .presentationCornerRadius(24)
        .interactiveDismissDisabled(saving)
    }
}
