import Foundation
import Observation

/// A text the driver can send from this iPhone (free) when the server didn't text the customer.
struct TextToSend: Identifiable {
    let id = UUID()
    let phone: String
    let body: String
}

@MainActor
@Observable
final class CrewStore {
    private(set) var passcode: String?
    private(set) var pickups: [Pickup] = []
    private(set) var today: String = Day.iso(.now)
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    private(set) var lastSynced: Date?
    private(set) var isOffline = false
    private(set) var outbox: [PendingChange] = []
    var errorMessage: String?
    var toast: String?
    var textToSend: TextToSend?
    private(set) var savingCode: String?
    /// The driver's order for today's stops (codes). Kept on this iPhone only.
    private(set) var stopOrder: [String] = []

    /// Launch with `-demo` to use sample pickups (simulator testing; nothing is sent).
    let isDemo = ProcessInfo.processInfo.arguments.contains("-demo")

    init() {
        if isDemo {
            passcode = "demo"
            (today, pickups) = DemoData.make()
            hasLoaded = true
            return
        }
        stopOrder = Self.loadStopOrder(for: today)
        passcode = Keychain.read()
        outbox = LocalStore.loadOutbox()
        if passcode != nil, let cached = LocalStore.loadList() {
            today = cached.today
            pickups = cached.pickups
            lastSynced = cached.savedAt
            hasLoaded = true
            for change in outbox { pickups.apply(change.set, to: change.code) }
            stopOrder = Self.loadStopOrder(for: today)
        }
    }

    // MARK: Lists for each tab

    var dueToday: [Pickup] {
        pickups.filter { ($0.status == .scheduled || $0.status == .onTheWay) && ($0.pickupDate ?? "9") <= today }
            .sorted { ($0.pickupDate ?? "") < ($1.pickupDate ?? "") }
    }
    var upcoming: [Pickup] {
        pickups.filter { $0.status == .scheduled && ($0.pickupDate ?? "") > today }
            .sorted { ($0.pickupDate ?? "") < ($1.pickupDate ?? "") }
    }
    var toSchedule: [Pickup] {
        pickups.filter { $0.status == .pending || ($0.status == .scheduled && $0.pickupDate == nil) }
    }
    var pickedUp: [Pickup] { pickups.filter { $0.status == .pickedUp } }
    /// Every booking, newest first.
    var all: [Pickup] { pickups.sorted { ($0.bookedIso ?? "") > ($1.bookedIso ?? "") } }

    /// Today's stops in the driver's order. Stops not placed yet go last, overdue ones first.
    var route: [Pickup] {
        let due = dueToday
        let placed = stopOrder.compactMap { code in due.first { $0.code == code } }
        return placed + due.filter { !stopOrder.contains($0.code) }
    }
    var nextStop: Pickup? { route.first }

    func moveStops(from source: IndexSet, to destination: Int) {
        var codes = route.map(\.code)
        codes.move(fromOffsets: source, toOffset: destination)
        stopOrder = codes
        UserDefaults.standard.set(["day": today, "codes": codes], forKey: "stopOrder")
    }

    private static func loadStopOrder(for day: String) -> [String] {
        guard let saved = UserDefaults.standard.dictionary(forKey: "stopOrder"),
              saved["day"] as? String == day else { return [] }
        return saved["codes"] as? [String] ?? []
    }

    func isOverdue(_ p: Pickup) -> Bool { (p.status == .scheduled || p.status == .onTheWay) && (p.pickupDate ?? today) < today }

    /// "No signal · list from 9:42 AM · 2 changes waiting to sync", or nil when everything is synced.
    var syncNotice: String? {
        guard !isDemo else { return nil }
        var parts: [String] = []
        if isOffline {
            parts.append("No signal")
            if let lastSynced { parts.append("list from \(lastSynced.formatted(date: .omitted, time: .shortened))") }
        }
        if !outbox.isEmpty { parts.append("\(outbox.count) change\(outbox.count == 1 ? "" : "s") waiting to sync") }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    // MARK: Sign in / out

    func signIn(_ code: String) async -> String? {
        do {
            let result = try await CrewAPI(passcode: code).list()
            Keychain.save(code)
            passcode = code
            (today, pickups) = result
            lastSynced = .now
            isOffline = false
            hasLoaded = true
            LocalStore.saveList(today: today, pickups: pickups)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func signOut() {
        Keychain.delete()
        LocalStore.clear()
        passcode = nil
        pickups = []
        outbox = []
        hasLoaded = false
        lastSynced = nil
    }

    // MARK: Sync

    func refresh() async {
        guard let passcode, !isDemo, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        await flushOutbox()
        do {
            var (day, list) = try await CrewAPI(passcode: passcode).list()
            for change in outbox {                                           // keep unsent changes visible
                if change.op == "create", let p = pickups.first(where: { $0.code == change.code }),
                   !list.contains(where: { $0.code == p.code }) { list.append(p) }
                list.apply(change.set, to: change.code)
            }
            if day != today { stopOrder = Self.loadStopOrder(for: day) }
            (today, pickups) = (day, list)
            lastSynced = .now
            isOffline = false
            hasLoaded = true
            errorMessage = nil
            LocalStore.saveList(today: day, pickups: list)
        } catch CrewAPI.Failure.wrongPasscode, CrewAPI.Failure.notSetUp {
            signOut()
        } catch CrewAPI.Failure.offline {
            isOffline = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Sends changes made without signal, oldest first. Stops at the first one that still can't go.
    private func flushOutbox() async {
        guard let passcode, !outbox.isEmpty else { return }
        var sent = 0
        while let change = outbox.first {
            do {
                let api = CrewAPI(passcode: passcode)
                if change.op == "create" {
                    try await api.create(code: change.code, fields: change.set)
                } else {
                    try await api.update(code: change.code, set: change.set)
                }
                outbox.removeFirst()
                sent += 1
            } catch CrewAPI.Failure.offline {
                break
            } catch {
                outbox.removeFirst()                                         // the sheet rejected it; don't retry forever
                errorMessage = "Couldn’t sync “\(change.label)” for \(change.code)."
            }
            LocalStore.saveOutbox(outbox)
        }
        if sent > 0 { toast = "Synced \(sent) change\(sent == 1 ? "" : "s")" }
    }

    // MARK: Changes

    /// Applies a change right away, then saves it to the sheet (or queues it with no signal).
    /// Returns how the customer was told — "sms", "email", "none" or "queued" — or nil if it failed.
    @discardableResult
    func update(_ p: Pickup, set: [String: String], done message: String, tell: Bool = false) async -> String? {
        guard let passcode else { return nil }
        savingCode = p.code
        defer { savingCode = nil }
        pickups.apply(set, to: p.code)
        if isDemo {
            try? await Task.sleep(for: .milliseconds(350))
            let notified = set["status"] == "on_the_way" ? "none" : (p.email.isEmpty ? "none" : "email")
            toast = tell ? "\(message) · \(Self.describe(notified))" : message
            return notified
        }
        do {
            let notified = try await CrewAPI(passcode: passcode).update(code: p.code, set: set)
            toast = tell ? "\(message) · \(Self.describe(notified))" : message
            isOffline = false
            await refresh()
            return notified
        } catch CrewAPI.Failure.offline {
            outbox.append(PendingChange(code: p.code, set: set, label: message))
            LocalStore.saveOutbox(outbox)
            LocalStore.saveList(today: today, pickups: pickups)
            isOffline = true
            toast = "\(message) · will sync when there’s signal"
            return "queued"
        } catch {
            toast = "Didn’t save. Try again."
            await refresh()
            return nil
        }
    }

    private static func describe(_ notified: String) -> String {
        ["sms": "text sent", "email": "customer emailed"][notified] ?? "customer not notified"
    }

    /// `photo` is a small JPEG; it's saved to the private pickup-photos folder in Google Drive.
    @discardableResult
    func markPickedUp(_ p: Pickup, items: Int?, photo: Data?) async -> Bool {
        var set = ["status": "picked_up"]
        if let items { set["itemCount"] = String(items) }
        if let photo { set["photo"] = photo.base64EncodedString() }
        let done = items.map { "Picked up \($0) item\($0 == 1 ? "" : "s")" } ?? "Picked up"
        return await update(p, set: set, done: done, tell: true) != nil
    }
    func markRecycled(_ p: Pickup) async { await update(p, set: ["status": "recycled"], done: "Marked recycled") }

    /// Sets "On the way". If the server didn't text the customer, offers a free text from this iPhone.
    func onMyWay(_ p: Pickup) async {
        let notified = await update(p, set: ["status": "on_the_way"], done: "On the way", tell: true)
        guard let notified, notified != "sms", !p.phoneDigits.isEmpty else { return }
        if notified == "none" { toast = "On the way" }
        textToSend = TextToSend(
            phone: p.phoneDigits,
            body: "Hi \(p.firstName), it’s Empty the Drawer. We’re a few stops away to pick up your electronics (\(p.code)). Please make sure they’re by the door. Thanks!"
        )
    }

    /// Adds a booking from Marketplace, WhatsApp, a call… Only what's known is filled in.
    /// `fields` may hold name, phone, email, address, load, notes, source, pickupDate and sendEmail ("1").
    @discardableResult
    func createBooking(_ fields: [String: String]) async -> Bool {
        guard let passcode else { return false }
        let code = newCode()
        let date = fields["pickupDate"].flatMap { $0.isEmpty ? nil : $0 }
        var p = Pickup(code: code, status: date == nil ? .pending : .scheduled, pickupDate: date,
                       bookedAt: Date.now.formatted(.dateTime.month(.abbreviated).day().hour().minute()),
                       name: fields["name"] ?? "", email: fields["email"] ?? "", phone: fields["phone"] ?? "",
                       address: fields["address"] ?? "", load: fields["load"] ?? "", notes: fields["notes"] ?? "",
                       requests: "", crewNotes: "")
        p.bookedIso = ISO8601DateFormatter().string(from: .now)
        p.source = fields["source"]
        pickups.append(p)
        let done = "Booking \(code) added"
        if isDemo {
            toast = done
            return true
        }
        do {
            let notified = try await CrewAPI(passcode: passcode).create(code: code, fields: fields)
            toast = notified == "email" ? "\(done) · customer emailed" : done
            isOffline = false
            await refresh()
        } catch CrewAPI.Failure.offline {
            outbox.append(PendingChange(code: code, set: fields, label: "New booking", op: "create"))
            LocalStore.saveOutbox(outbox)
            LocalStore.saveList(today: today, pickups: pickups)
            isOffline = true
            toast = "\(done) · will sync when there’s signal"
        } catch {
            pickups.removeAll { $0.code == code }
            toast = "Didn’t save. Try again."
            return false
        }
        return true
    }

    /// Same format as the website's codes (AB12C), without I or O.
    private func newCode() -> String {
        let letters = Array("ABCDEFGHJKLMNPQRSTUVWXYZ")
        while true {
            let code = String([letters.randomElement()!, letters.randomElement()!]) +
                String(format: "%02d", Int.random(in: 0...99)) + String(letters.randomElement()!)
            if !pickups.contains(where: { $0.code == code }) { return code }
        }
    }

    func undoPickup(_ p: Pickup) async {
        await update(p, set: ["status": p.pickupDate == nil ? "new" : "scheduled", "crewNote": "Pickup undone"], done: "Pickup undone")
    }
    func reopen(_ p: Pickup) async {
        let to: PickupStatus = p.status == .recycled ? .pickedUp : (p.pickupDate == nil ? .pending : .scheduled)
        await update(p, set: ["status": to.rawValue, "crewNote": "Reopened"], done: "Reopened as \(to.title)")
    }
    func setStatus(_ p: Pickup, to status: PickupStatus) async {
        guard status != p.status else { return }
        var set = ["status": status.rawValue]
        if status == .pending { set["pickupDate"] = "" }
        await update(p, set: set, done: "Status changed to \(status.title)")
    }
    func addNote(_ p: Pickup, _ note: String) async {
        let text = note.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        await update(p, set: ["crewNote": text], done: "Note added")
    }
    func schedule(_ p: Pickup, on date: Date) async -> Bool {
        let iso = Day.iso(date)
        return await update(p, set: ["pickupDate": iso, "status": "scheduled"],
                            done: "Scheduled for \(Day.label(iso, today: today))", tell: true) != nil
    }
    func missed(_ p: Pickup, reason: String) async {
        let why = reason.trimmingCharacters(in: .whitespaces).isEmpty ? "no reason given" : reason
        await update(p, set: ["status": "new", "pickupDate": "", "crewNote": "Couldn’t pick up: \(why)"],
                     done: "Moved back to To Schedule")
    }
    func cancel(_ p: Pickup) async {
        await update(p, set: ["status": "cancelled", "crewNote": "Cancelled by crew"], done: "Booking cancelled")
    }

    /// Google Maps route from the drop box through today's stops (Apple Maps can't take several stops by link).
    var todaysRoute: URL? {
        let stops = route.map(\.address).filter { !$0.isEmpty }.prefix(10)
        guard let last = stops.last else { return nil }
        var c = URLComponents(string: "https://www.google.com/maps/dir/")!
        c.queryItems = [
            .init(name: "api", value: "1"),
            .init(name: "travelmode", value: "driving"),
            .init(name: "origin", value: "13060 80 Ave, Surrey, BC V3W 3B2"),
            .init(name: "destination", value: last),
        ]
        let via = stops.dropLast().joined(separator: "|")
        if !via.isEmpty { c.queryItems?.append(.init(name: "waypoints", value: via)) }
        return c.url
    }
}
