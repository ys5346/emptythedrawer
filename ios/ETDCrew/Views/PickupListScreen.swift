import SwiftUI

struct PickupListScreen: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.openURL) private var openURL
    let tab: CrewTab

    @State private var scheduling: Pickup?
    @State private var missing: Pickup?
    @State private var missReason = ""
    @State private var confirmSignOut = false
    @State private var search = ""
    @State private var filter: PickupStatus?

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
            .modifier(SearchIfAll(enabled: tab == .all, text: $search))
            .overlay { if store.hasLoaded && items.isEmpty { empty } }
            .overlay { if !store.hasLoaded { ProgressView("Loading pickups…") } }
            .toolbar {
                if tab == .today, let route = store.todaysRoute {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { openURL(route) } label: { Label("Route", systemImage: "point.topleft.down.to.point.bottomright.curvepath.fill") }
                    }
                }
                if tab == .all {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Show", selection: $filter) {
                                Label("All Bookings", systemImage: "list.bullet").tag(PickupStatus?.none)
                                ForEach(PickupStatus.allInOrder, id: \.self) { s in
                                    Label(s.title, systemImage: s.systemImage).tag(PickupStatus?.some(s))
                                }
                            }
                        } label: {
                            Image(systemName: filter == nil ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill")
                        }
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
            if !store.dueToday.isEmpty {
                Section {} footer: { SwipeHint(text: "Swipe right to mark picked up. Swipe left for On My Way, which texts the customer, or to change the day.") }
            }
        case .upcoming:
            let days = Dictionary(grouping: store.upcoming, by: { $0.pickupDate ?? "" })
            ForEach(days.keys.sorted(), id: \.self) { day in
                Section(Day.label(day, today: store.today)) { rows(days[day] ?? []) }
            }
            if !store.upcoming.isEmpty {
                Section {} footer: { SwipeHint(text: "Swipe right to mark picked up. Swipe left to change the day.") }
            }
        case .schedule:
            if !store.toSchedule.isEmpty {
                Section { rows(store.toSchedule) } footer: { SwipeHint(text: "Swipe left to give a booking a pickup day. The customer gets an email with the date.") }
            }
        case .pickedUp:
            if !store.pickedUp.isEmpty {
                Section { rows(store.pickedUp) } footer: { SwipeHint(text: "Swipe right to mark a load recycled once it’s dropped off at ERA.") }
            }
        case .all:
            ForEach(PickupStatus.allInOrder, id: \.self) { status in
                let group = allMatches.filter { $0.status == status }
                if !group.isEmpty {
                    Section { rows(group) } header: { Label("\(status.title) · \(group.count)", systemImage: status.systemImage) }
                }
            }
        }
    }

    /// The All tab, after search and the status filter.
    private var allMatches: [Pickup] {
        let q = search.trimmingCharacters(in: .whitespaces).lowercased()
        return store.all.filter { p in
            (filter == nil || p.status == filter) &&
            (q.isEmpty || [p.name, p.address, p.code, p.phone, p.email, p.load].contains { $0.lowercased().contains(q) })
        }
    }

    private func rows(_ list: [Pickup]) -> some View {
        ForEach(list) { p in
            NavigationLink(value: p.code) {
                PickupRow(pickup: p, showDate: tab == .today && store.isOverdue(p), showStatus: tab == .all)
            }
            .swipeActions(edge: .leading, allowsFullSwipe: true) { forwardAction(p) }
            .swipeActions(edge: .trailing, allowsFullSwipe: false) { otherActions(p) }
            .disabled(store.savingCode == p.code)
            .opacity(store.savingCode == p.code ? 0.5 : 1)
        }
    }

    /// Swipe right moves a booking forward. A full swipe does it in one motion.
    @ViewBuilder private func forwardAction(_ p: Pickup) -> some View {
        switch p.status {
        case .pending, .scheduled, .onTheWay:
            Button { Task { await store.markPickedUp(p) } } label: { Label("Picked Up", systemImage: "checkmark") }
                .tint(.green)
        case .pickedUp:
            Button { Task { await store.markRecycled(p) } } label: { Label("Recycled", systemImage: "arrow.3.trianglepath") }
                .tint(.ink)
        case .recycled, .cancelled:
            Button { Task { await store.reopen(p) } } label: { Label("Reopen", systemImage: "arrow.uturn.backward") }
                .tint(.blue)
        }
    }

    /// Swipe left shows the other options for this booking.
    @ViewBuilder private func otherActions(_ p: Pickup) -> some View {
        switch p.status {
        case .scheduled, .onTheWay:
            if p.status == .scheduled {
                Button { Task { await store.onMyWay(p) } } label: { Label("On My Way", systemImage: "location.fill") }
                    .tint(.purple)
            }
            Button { scheduling = p } label: { Label("Date", systemImage: "calendar") }
                .tint(.indigo)
            if store.isOverdue(p) || p.pickupDate == store.today {
                Button { missReason = ""; missing = p } label: { Label("Couldn’t", systemImage: "xmark") }
                    .tint(.orange)
            }
        case .pending:
            Button { scheduling = p } label: { Label("Schedule", systemImage: "calendar.badge.plus") }
                .tint(.accentColor)
        case .pickedUp:
            Button { Task { await store.undoPickup(p) } } label: { Label("Undo", systemImage: "arrow.uturn.backward") }
                .tint(.gray)
        case .recycled, .cancelled:
            EmptyView()
        }
    }

    // MARK: Titles and empty states

    private var title: String {
        switch tab {
        case .today: "Today"
        case .upcoming: "Upcoming"
        case .schedule: "To Schedule"
        case .pickedUp: "Picked Up"
        case .all: "All Bookings"
        }
    }

    private var items: [Pickup] {
        switch tab {
        case .today: store.dueToday
        case .upcoming: store.upcoming
        case .schedule: store.toSchedule
        case .pickedUp: store.pickedUp
        case .all: allMatches
        }
    }

    @ViewBuilder private var empty: some View {
        switch tab {
        case .today:
            ContentUnavailableView("Nothing Today", systemImage: "sun.max", description: Text("No pickups are scheduled for today. New bookings wait in To Schedule."))
        case .upcoming:
            ContentUnavailableView("Nothing Scheduled", systemImage: "calendar", description: Text("Give new bookings a day in To Schedule."))
        case .schedule:
            ContentUnavailableView("All Caught Up", systemImage: "checkmark.circle", description: Text("Every booking has a pickup day."))
        case .pickedUp:
            ContentUnavailableView("Nothing Waiting", systemImage: "shippingbox", description: Text("Picked-up loads show here until they’re recycled at ERA."))
        case .all:
            if search.isEmpty && filter == nil {
                ContentUnavailableView("No Bookings Yet", systemImage: "list.bullet", description: Text("Bookings from the website show up here."))
            } else {
                ContentUnavailableView.search(text: search)
            }
        }
    }
}

struct PickupRow: View {
    let pickup: Pickup
    var showDate = false
    var showStatus = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text(pickup.displayName)
                    .font(.headline)
                Spacer()
                if showStatus {
                    StatusPill(status: pickup.status)
                } else {
                    Text(pickup.code)
                        .font(.caption.weight(.semibold).monospaced())
                        .foregroundStyle(.secondary)
                }
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
        if pickup.status == .onTheWay { f.append(("On the way", "location.fill", .purple)) }
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


/// Adds a search field only on the All tab.
struct SearchIfAll: ViewModifier {
    let enabled: Bool
    @Binding var text: String
    func body(content: Content) -> some View {
        if enabled {
            content.searchable(text: $text, prompt: "Name, address, code or phone")
        } else {
            content
        }
    }
}


/// Small reminder of what swiping does, shown under a list.
struct SwipeHint: View {
    let text: String
    var body: some View {
        Label(text, systemImage: "hand.draw")
            .font(.footnote)
            .foregroundStyle(.secondary)
    }
}
