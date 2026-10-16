import SwiftUI

struct ScheduleSheet: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let pickup: Pickup
    @State private var date: Date
    @State private var time: String
    @State private var saving = false

    init(pickup: Pickup) {
        self.pickup = pickup
        let start = Day.date(pickup.pickupDate) ?? Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now
        _date = State(initialValue: max(start, Calendar.current.startOfDay(for: .now)))
        _time = State(initialValue: pickup.pickupTime ?? "")
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                DatePicker("Pickup day", selection: $date, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .padding(.horizontal)
                PickupTimeField(time: $time)
                    .padding(16)
                    .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 16, style: .continuous))
                    .padding(.horizontal)
                if let times = pickup.preferredTimes {
                    Label("They asked for \(times)", systemImage: "calendar.badge.clock")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(.blue)
                        .padding(.horizontal)
                        .padding(.top, 4)
                }
                Label("\(pickup.displayName) gets an email with the day\(time.isEmpty ? "" : " and time").", systemImage: "envelope")
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
                                if await store.schedule(pickup, on: date, time: time) { dismiss() }
                                saving = false
                            }
                        }
                        .fontWeight(.semibold)
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationCornerRadius(24)
        .interactiveDismissDisabled(saving)
    }
}
