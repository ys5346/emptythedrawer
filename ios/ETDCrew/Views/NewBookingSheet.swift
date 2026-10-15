import SwiftUI
import MapKit

/// Adds a booking that came in somewhere else (Marketplace, WhatsApp, a call). Every field is optional.
struct NewBookingSheet: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var phone = ""
    @State private var email = ""
    @State private var address = ""
    @State private var load = ""
    @State private var notes = ""
    @State private var source = "Marketplace"
    @State private var hasDate = true
    @State private var date = Date.now
    @State private var sendEmail = true
    @State private var saving = false
    @FocusState private var addressFocused: Bool
    @State private var places = AddressCompleter()

    static let sources = ["Marketplace", "WhatsApp", "Instagram", "Phone call", "Text", "Referral", "Other"]

    private var emailIsValid: Bool { email.range(of: #"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$"#, options: .regularExpression) != nil }
    private var canSave: Bool { ![name, phone, address].allSatisfy { $0.trimmingCharacters(in: .whitespaces).isEmpty } }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                    TextField("Phone", text: $phone)
                        .keyboardType(.phonePad)
                        .textContentType(.telephoneNumber)
                    TextField("Email", text: $email)
                        .keyboardType(.emailAddress)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Customer")
                } footer: {
                    Text("Fill in only what you have. A name, phone or address is enough.")
                }

                Section("Address") {
                    TextField("Street address", text: $address, axis: .vertical)
                        .textContentType(.fullStreetAddress)
                        .focused($addressFocused)
                        .onChange(of: address) { _, text in if addressFocused { places.search(text) } }
                    if addressFocused {
                        ForEach(places.results.prefix(4), id: \.self) { result in
                            Button {
                                address = [result.title, result.subtitle].filter { !$0.isEmpty }.joined(separator: ", ")
                                places.results = []
                                addressFocused = false
                            } label: {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(result.title).foregroundStyle(.primary)
                                    if !result.subtitle.isEmpty {
                                        Text(result.subtitle).font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }

                Section("Pickup") {
                    TextField("What they’re giving (e.g. 2 laptops, a TV)", text: $load, axis: .vertical)
                    Toggle("Pickup day", isOn: $hasDate.animation())
                    if hasDate {
                        DatePicker("Day", selection: $date, in: Calendar.current.startOfDay(for: .now)..., displayedComponents: .date)
                    }
                    TextField("Notes (buzzer, gate, where it’s left)", text: $notes, axis: .vertical)
                }

                Section {
                    Picker("Came from", selection: $source) {
                        ForEach(Self.sources, id: \.self) { Text($0) }
                    }
                    if emailIsValid {
                        Toggle(hasDate ? "Email them the pickup day" : "Email them a confirmation", isOn: $sendEmail)
                    }
                } footer: {
                    if emailIsValid && sendEmail {
                        Text("They get their confirmation number and a link to check or change the pickup.")
                    }
                }
            }
            .navigationTitle("New Booking")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Add", action: save)
                            .fontWeight(.semibold)
                            .disabled(!canSave)
                    }
                }
            }
        }
        .interactiveDismissDisabled(saving || canSave)
    }

    private func save() {
        func clean(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }
        var fields: [String: String] = ["source": source]
        for (key, value) in ["name": name, "phone": phone, "email": email, "address": address, "load": load, "notes": notes] {
            let v = clean(value)
            if !v.isEmpty { fields[key] = v }
        }
        if hasDate { fields["pickupDate"] = Day.iso(date) }
        if emailIsValid && sendEmail { fields["sendEmail"] = "1" }
        saving = true
        Task {
            if await store.createBooking(fields) { dismiss() }
            saving = false
        }
    }
}

/// Address suggestions from Apple Maps, biased to Metro Vancouver.
@Observable
final class AddressCompleter: NSObject, MKLocalSearchCompleterDelegate {
    var results: [MKLocalSearchCompletion] = []
    private let completer = MKLocalSearchCompleter()

    override init() {
        super.init()
        completer.delegate = self
        completer.resultTypes = .address
        completer.region = MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 49.19, longitude: -122.85),
                                              latitudinalMeters: 80_000, longitudinalMeters: 80_000)
    }

    func search(_ text: String) {
        let q = text.trimmingCharacters(in: .whitespaces)
        if q.count < 3 { results = []; return }
        completer.queryFragment = q
    }

    func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) { results = completer.results }
    func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) { results = [] }
}
