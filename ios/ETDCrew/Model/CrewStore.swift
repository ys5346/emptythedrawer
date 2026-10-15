import Foundation
import Observation

@MainActor
@Observable
final class CrewStore {
    private(set) var passcode: String?
    private(set) var pickups: [Pickup] = []
    private(set) var today: String = Day.iso(.now)
    private(set) var isLoading = false
    private(set) var hasLoaded = false
    var errorMessage: String?
    var toast: String?
    private(set) var savingCode: String?

    /// Launch with `-demo` to use sample pickups (simulator testing; nothing is sent).
    let isDemo = ProcessInfo.processInfo.arguments.contains("-demo")

    init() {
        passcode = isDemo ? "demo" : Keychain.read()
        if isDemo { (today, pickups) = DemoData.make(); hasLoaded = true }
    }

    // MARK: Lists for each tab

    var dueToday: [Pickup] {
        pickups.filter { $0.status == .scheduled && ($0.pickupDate ?? "9") <= today }
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

    func isOverdue(_ p: Pickup) -> Bool { p.status == .scheduled && (p.pickupDate ?? today) < today }

    // MARK: Actions

    func signIn(_ code: String) async -> String? {
        do {
            let result = try await CrewAPI(passcode: code).list()
            Keychain.save(code)
            passcode = code
            (today, pickups) = result
            hasLoaded = true
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    func signOut() {
        Keychain.delete()
        passcode = nil
        pickups = []
        hasLoaded = false
    }

    func refresh() async {
        guard let passcode, !isDemo, !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            (today, pickups) = try await CrewAPI(passcode: passcode).list()
            hasLoaded = true
            errorMessage = nil
        } catch CrewAPI.Failure.wrongPasscode, CrewAPI.Failure.notSetUp {
            signOut()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Saves a change to the sheet, then reloads. Returns true on success.
    @discardableResult
    func update(_ p: Pickup, set: [String: String], done message: String) async -> Bool {
        guard let passcode else { return false }
        savingCode = p.code
        defer { savingCode = nil }
        do {
            if isDemo {
                try await Task.sleep(for: .milliseconds(350))
                DemoData.apply(set, to: p.code, in: &pickups)
            } else {
                try await CrewAPI(passcode: passcode).update(code: p.code, set: set)
                await refresh()
            }
            toast = message
            return true
        } catch {
            toast = "Didn’t save. Check your connection and try again."
            return false
        }
    }

    func markPickedUp(_ p: Pickup) async { await update(p, set: ["status": "picked_up"], done: "Picked up · customer emailed") }
    func markRecycled(_ p: Pickup) async { await update(p, set: ["status": "recycled"], done: "Marked recycled") }
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
                            done: "Scheduled for \(Day.label(iso, today: today)) · customer emailed")
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
        let stops = dueToday.map(\.address).filter { !$0.isEmpty }.prefix(10)
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
