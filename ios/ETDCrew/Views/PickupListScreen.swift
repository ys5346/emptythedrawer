import SwiftUI

struct PickupListScreen: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.openURL) private var openURL
    let tab: CrewTab

    @State private var scheduling: Pickup?
    @State private var missing: Pickup?
    @State private var missReason = ""
    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                if let error = store.errorMessage {
                    Label(error, systemImage: "wifi.exclamationmark")
                        .font(.subheadline)
                        .foregroundStyle(.orange)
                }
                sections
            }
            .listStyle(.insetGrouped)
            .navigationTitle(title)
            .navigationDestination(for: String.self) { code in PickupDetailView(code: code) }
            .refreshable { await store.refresh() }
            .overlay { if store.hasLoaded && items.isEmpty { empty } }
            .overlay { if !store.hasLoaded { ProgressView("Loading pickups…") } }
            .toolbar {
                if tab == .today, let route = store.todaysRoute {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { openURL(route) } label: { Label("Route", systemImage: "point.topleft.down.to.point.bottomright.curvepath.fill") }
                    }
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        if store.isDemo { Text("Demo mode — changes aren’t saved") }
                        Button(role: .destructive) { confirmSignOut = true } label: { Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right") }
                    } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .sheet(item: $scheduling) { p in ScheduleSheet(pickup: p) }
            .alert("Couldn’t pick up?", isPresented: Binding(get: { missing != nil }, set: { if !$0 { missing = nil } })) {
                TextField("What happened?", text: $missReason)
                Button("Cancel", role: .cancel) { missing = nil }
                Button("Move to To Schedule") {
                    if let p = missing { Task { await store.missed(p, reason: missReason) } }
                    missing = nil
                }
            } message: {
                Text("It goes back to To Schedule with your note, so it can get a new day.")
            }
            .confirmationDialog("Sign out of the crew app on this iPhone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) { store.signOut() }
            }
        }
    }

    // MARK: Sections per tab

    @ViewBuilder private var sections: some View {
        switch tab {
        case .today:
            let overdue = store.dueToday.filter(store.isOverdue)
            let todays = store.dueToday.filter { !store.isOverdue($0) }
            if !overdue.isEmpty {
                Section { rows(overdue) } header: { Label("Overdue", systemImage: "exclamationmark.circle.fill").foregroundStyle(.red) }
            }
            if !todays.isEmpty {
                Section { rows(todays) } header: { Text(Day.date(store.today)?.formatted(.dateTime.weekday(.wide).month(.wide).day()) ?? "Today") }
            }
        case .upcoming:
            let days = Dictionary(grouping: store.upcoming, by: { $0.pickupDate ?? "" })
            ForEach(days.keys.sorted(), id: \.self) { day in
                Section(Day.label(day, today: store.today)) { rows(days[day] ?? []) }
            }
        case .schedule:
            if !store.toSchedule.isEmpty {
                Section { rows(store.toSchedule) } footer: { Text("Swipe left on a booking to give it a pickup day. The customer gets an email with the date.") }
            }
        case .pickedUp:
            if !store.pickedUp.isEmpty {
                Section { rows(store.pickedUp) } footer: { Text("Swipe left to mark a load recycled once it’s dropped off at ERA.") }
            }
        }
    }

    private func rows(_ list: [Pickup]) -> some View {
        ForEach(list) { p in
            NavigationLink(value: p.code) {
                PickupRow(pickup: p, showDate: tab == .today && store.isOverdue(p))
            }
            .swipeActions(edge: .trailing, allowsFullSwipe: true) { trailingActions(p) }
            .swipeActions(edge: .leading, allowsFullSwipe: false) { leadingActions(p) }
            .disabled(store.savingCode == p.code)
            .opacity(store.savingCode == p.code ? 0.5 : 1)
        }
    }

    @ViewBuilder private func trailingActions(_ p: Pickup) -> some View {
        switch tab {
        case .today, .upcoming:
            Button { Task { await store.markPickedUp(p) } } label: { Label("Picked Up", systemImage: "checkmark") }
                .tint(.green)
        case .schedule:
            Button { scheduling = p } label: { Label("Schedule", systemImage: "calendar.badge.plus") }
                .tint(.accentColor)
        case .pickedUp:
            Button { Task { await store.markRecycled(p) } } label: { Label("Recycled", systemImage: "arrow.3.trianglepath") }
                .tint(.ink)
        }
    }

    @ViewBuilder private func leadingActions(_ p: Pickup) -> some View {
        if tab == .today {
            Button { missReason = ""; missing = p } label: { Label("Couldn’t", systemImage: "xmark") }
                .tint(.orange)
        }
        if tab == .upcoming || tab == .today {
            Button { scheduling = p } label: { Label("Date", systemImage: "calendar") }
                .tint(.indigo)
        }
    }

    // MARK: Titles and empty states

    private var title: String {
        switch tab {
        case .today: "Today"
        case .upcoming: "Upcoming"
        case .schedule: "To Schedule"
        case .pickedUp: "Picked Up"
        }
    }

    private var items: [Pickup] {
        switch tab {
        case .today: store.dueToday
        case .upcoming: store.upcoming
        case .schedule: store.toSchedule
        case .pickedUp: store.pickedUp
        }
    }

    private var empty: some View {
        switch tab {
        case .today:
            ContentUnavailableView("Nothing Today", systemImage: "sun.max", description: Text("No pickups are scheduled for today. New bookings wait in To Schedule."))
        case .upcoming:
            ContentUnavailableView("Nothing Scheduled", systemImage: "calendar", description: Text("Give new bookings a day in To Schedule."))
        case .schedule:
            ContentUnavailableView("All Caught Up", systemImage: "checkmark.circle", description: Text("Every booking has a pickup day."))
        case .pickedUp:
            ContentUnavailableView("Nothing Waiting", systemImage: "shippingbox", description: Text("Picked-up loads show here until they’re recycled at ERA."))
        }
    }
}

struct PickupRow: View {
    let pickup: Pickup
    var showDate = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(pickup.displayName)
                    .font(.headline)
                Spacer()
                Text(pickup.code)
                    .font(.caption.weight(.semibold).monospaced())
                    .foregroundStyle(.secondary)
            }
            Text(pickup.shortAddress)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            if !pickup.load.isEmpty {
                Text(pickup.load)
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
            let flags = flags
            if !flags.isEmpty {
                HStack(spacing: 6) { ForEach(flags, id: \.0) { Tag(text: $0.0, systemImage: $0.1, color: $0.2) } }
                    .padding(.top, 2)
            }
        }
        .padding(.vertical, 4)
    }

    private var flags: [(String, String, Color)] {
        var f: [(String, String, Color)] = []
        if showDate, let d = pickup.pickupDate, let date = Day.date(d) {
            f.append(("Was due \(date.formatted(.dateTime.month(.abbreviated).day()))", "clock.badge.exclamationmark", .red))
        }
        if pickup.latestRequest != nil { f.append(("Customer request", "exclamationmark.bubble.fill", .red)) }
        if !pickup.notes.isEmpty { f.append(("Driver notes", "note.text", .orange)) }
        return f
    }
}

struct Tag: View {
    let text: String
    let systemImage: String
    let color: Color
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: systemImage)
            Text(text)
        }
            .font(.caption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: .capsule)
    }
}
