import SwiftUI
import MapKit

struct PickupDetailView: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    let code: String

    @State private var coordinate: CLLocationCoordinate2D?
    @State private var scheduling = false
    @State private var missing = false
    @State private var missReason = ""
    @State private var confirmCancel = false
    @State private var noting = false
    @State private var noteText = ""

    private var pickup: Pickup? { store.pickups.first { $0.code == code } }

    var body: some View {
        Group {
            if let p = pickup {
                content(p)
            } else {
                ContentUnavailableView("Done", systemImage: "checkmark.circle", description: Text("This booking is finished or cancelled."))
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func content(_ p: Pickup) -> some View {
        List {
            Section {
                VStack(spacing: 0) {
                    map(p)
                    VStack(spacing: 4) {
                        Text(p.displayName).font(.title2.bold())
                        Text(p.address).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    .padding(.horizontal)
                    .padding(.top, 14)
                    HStack(spacing: 10) {
                        QuickAction(title: "Directions", systemImage: "car.fill", enabled: !p.address.isEmpty) { openURL(appleMaps(p.address)) }
                        QuickAction(title: "Call", systemImage: "phone.fill", enabled: !p.phoneDigits.isEmpty) { openURL(URL(string: "tel:\(p.phoneDigits)")!) }
                        QuickAction(title: p.status == .onTheWay ? "On the Way" : "On My Way", systemImage: "location.fill",
                                    enabled: p.status == .pending || p.status == .scheduled) { Task { await store.onMyWay(p) } }
                        QuickAction(title: "Email", systemImage: "envelope.fill", enabled: !p.email.isEmpty) { openURL(email(p)) }
                    }
                    .padding(14)
                }
                .listRowInsets(EdgeInsets())
            }

            if p.latestRequest != nil || !p.notes.isEmpty || p.latestCrewNote != nil {
                Section("Notes") {
                    if let r = p.latestRequest { NoteRow(title: "Customer request", text: r, systemImage: "exclamationmark.bubble.fill", color: .red) }
                    if !p.notes.isEmpty { NoteRow(title: "Driver notes", text: p.notes, systemImage: "note.text", color: .orange) }
                    if let c = p.latestCrewNote { NoteRow(title: "Crew note", text: c, systemImage: "person.2.fill", color: .secondary) }
                }
            }

            Section("Pickup") {
                LabeledContent("Status") { StatusPill(status: p.status, overdue: store.isOverdue(p)) }
                Button { scheduling = true } label: {
                    LabeledContent("Pickup day") {
                        Text(p.pickupDate.map { Day.label($0, today: store.today) } ?? "Not scheduled")
                            .foregroundStyle(p.pickupDate == nil && p.status == .pending ? .orange : .secondary)
                    }
                }
                .tint(.primary)
                if !p.load.isEmpty { LabeledContent("Items", value: p.load) }
                LabeledContent("Confirmation") { Text(p.code).monospaced() }
                if !p.bookedAt.isEmpty { LabeledContent("Booked", value: p.bookedAt) }
            }

            Section {
                actions(p)
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(p.code)
        .disabled(store.savingCode == p.code)
        .overlay { if store.savingCode == p.code { ProgressView().controlSize(.large) } }
        .task(id: p.address) { await locate(p.address) }
        .sheet(isPresented: $scheduling) { ScheduleSheet(pickup: p) }
        .alert("Couldn’t pick up?", isPresented: $missing) {
            TextField("What happened?", text: $missReason)
            Button("Cancel", role: .cancel) {}
            Button("Move to To Schedule") { Task { await store.missed(p, reason: missReason) } }
        } message: {
            Text("It goes back to To Schedule with your note, so it can get a new day.")
        }
        .alert("Add a crew note", isPresented: $noting) {
            TextField("Note", text: $noteText)
            Button("Cancel", role: .cancel) {}
            Button("Add") { Task { await store.addNote(p, noteText) } }
        } message: {
            Text("Saved on the booking in the sheet. Customers never see crew notes.")
        }
        .confirmationDialog("Cancel \(p.displayName)’s pickup?", isPresented: $confirmCancel, titleVisibility: .visible) {
            Button("Cancel Booking", role: .destructive) { Task { await store.cancel(p) } }
        } message: {
            Text("The customer will see it as cancelled on the website.")
        }
    }

    @ViewBuilder private func actions(_ p: Pickup) -> some View {
        switch p.status {
        case .scheduled, .onTheWay:
            BigButton(title: "Mark Picked Up", systemImage: "checkmark.circle.fill") { Task { await store.markPickedUp(p) } }
            Button("Couldn’t Pick Up", systemImage: "xmark.circle") { missReason = ""; missing = true }
            Button("Change Pickup Day", systemImage: "calendar") { scheduling = true }
        case .pending:
            BigButton(title: "Schedule Pickup", systemImage: "calendar.badge.plus") { scheduling = true }
            Button("Mark Picked Up Now", systemImage: "checkmark.circle") { Task { await store.markPickedUp(p) } }
        case .pickedUp:
            BigButton(title: "Mark Recycled", systemImage: "arrow.3.trianglepath") { Task { await store.markRecycled(p) } }
            Button("Undo Pickup", systemImage: "arrow.uturn.backward") { Task { await store.undoPickup(p) } }
        case .recycled:
            BigButton(title: "Reopen as Picked Up", systemImage: "arrow.uturn.backward") { Task { await store.reopen(p) } }
        case .cancelled:
            BigButton(title: "Reopen Booking", systemImage: "arrow.uturn.backward") { Task { await store.reopen(p) } }
        }
        Button("Add Crew Note", systemImage: "square.and.pencil") { noteText = ""; noting = true }
        Menu {
            ForEach(PickupStatus.allInOrder, id: \.self) { s in
                Button {
                    Task { await store.setStatus(p, to: s) }
                } label: {
                    Label(s.title, systemImage: s == p.status ? "checkmark" : s.systemImage)
                }
                .disabled(s == p.status)
            }
        } label: {
            Label("Change Status", systemImage: "arrow.left.arrow.right")
        }
        if p.status.isActive {
            Button("Cancel Booking", systemImage: "trash", role: .destructive) { confirmCancel = true }
        }
    }

    @ViewBuilder private func map(_ p: Pickup) -> some View {
        ZStack {
            if let coordinate {
                Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 700, longitudinalMeters: 700)), interactionModes: []) {
                    Marker(p.firstName, systemImage: "shippingbox.fill", coordinate: coordinate).tint(Color.ink)
                }
                .onTapGesture { openURL(appleMaps(p.address)) }
            } else {
                Rectangle().fill(.quaternary)
                    .overlay { Image(systemName: "map").font(.largeTitle).foregroundStyle(.tertiary) }
            }
        }
        .frame(height: 170)
    }

    private func locate(_ address: String) async {
        guard !address.isEmpty else { return }
        if let placemark = try? await CLGeocoder().geocodeAddressString(address + ", BC, Canada").first,
           let location = placemark.location {
            withAnimation(.smooth) { coordinate = location.coordinate }
        }
    }

    private func appleMaps(_ address: String) -> URL {
        var c = URLComponents(string: "http://maps.apple.com/")!
        c.queryItems = [.init(name: "daddr", value: address), .init(name: "dirflg", value: "d")]
        return c.url!
    }

    private func email(_ p: Pickup) -> URL {
        let subject = "Your Empty the Drawer pickup (\(p.code))".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        return URL(string: "mailto:\(p.email)?subject=\(subject)")!
    }
}

/// Round action button, like the ones under a contact in the Contacts app.
struct QuickAction: View {
    let title: String
    let systemImage: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage).font(.title3)
                Text(title).font(.caption2.weight(.medium)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(.tint.opacity(0.1), in: .rect(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .foregroundStyle(.tint)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
    }
}

struct BigButton: View {
    enum Style { case primary }
    let title: String
    let systemImage: String
    var style: Style = .primary
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: systemImage)
                .font(.headline)
                .frame(maxWidth: .infinity, minHeight: 34)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.roundedRectangle(radius: 12))
        .controlSize(.large)
        .listRowInsets(EdgeInsets(top: 10, leading: 12, bottom: 10, trailing: 12))
    }
}

struct NoteRow: View {
    let title: String
    let text: String
    let systemImage: String
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 5) {
                Image(systemName: systemImage)
                Text(title)
            }
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            Text(text).font(.subheadline)
        }
        .padding(.vertical, 2)
    }
}

struct StatusPill: View {
    let status: PickupStatus
    var overdue = false
    var body: some View {
        let (text, color): (String, Color) = overdue ? ("Overdue", .red) : {
            switch status {
            case .pending: return ("New", .orange)
            case .scheduled: return ("Scheduled", .blue)
            case .onTheWay: return ("On the Way", .purple)
            case .pickedUp: return ("Picked Up", .green)
            case .recycled: return ("Recycled", .teal)
            case .cancelled: return ("Cancelled", .gray)
            }
        }()
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(color.opacity(0.13), in: .capsule)
    }
}
