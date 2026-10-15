import Foundation

/// A change made in the app that hasn't reached the bookings sheet yet (no signal).
struct PendingChange: Codable, Identifiable {
    var id = UUID()
    let code: String
    let set: [String: String]
    let label: String
    var op: String? = nil      // "create" for a new booking; nil for a change
}

/// Saves the last pickup list and any unsent changes on the phone, so the app works with no signal.
enum LocalStore {
    private struct Snapshot: Codable {
        let today: String
        let pickups: [Pickup]
        let savedAt: Date
    }

    private static var folder: URL {
        let url = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ETDCrew", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    private static var listFile: URL { folder.appendingPathComponent("pickups.json") }
    private static var outboxFile: URL { folder.appendingPathComponent("outbox.json") }

    static func saveList(today: String, pickups: [Pickup]) {
        let snap = Snapshot(today: today, pickups: pickups, savedAt: .now)
        if let data = try? JSONEncoder().encode(snap) {
            try? data.write(to: listFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    static func loadList() -> (today: String, pickups: [Pickup], savedAt: Date)? {
        guard let data = try? Data(contentsOf: listFile),
              let snap = try? JSONDecoder().decode(Snapshot.self, from: data) else { return nil }
        return (snap.today, snap.pickups, snap.savedAt)
    }

    static func saveOutbox(_ changes: [PendingChange]) {
        if let data = try? JSONEncoder().encode(changes) {
            try? data.write(to: outboxFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        }
    }

    static func loadOutbox() -> [PendingChange] {
        guard let data = try? Data(contentsOf: outboxFile) else { return [] }
        return (try? JSONDecoder().decode([PendingChange].self, from: data)) ?? []
    }

    /// Removes everything (on sign out), since the list holds customer details.
    static func clear() {
        try? FileManager.default.removeItem(at: listFile)
        try? FileManager.default.removeItem(at: outboxFile)
    }
}

extension Array where Element == Pickup {
    /// Applies a change locally, the same way the sheet will.
    mutating func apply(_ set: [String: String], to code: String) {
        guard let i = firstIndex(where: { $0.code == code }) else { return }
        if let date = set["pickupDate"] { self[i].pickupDate = date.isEmpty ? nil : date }
        if let s = set["status"], let status = PickupStatus(rawValue: s) { self[i].status = status }
        if let n = set["itemCount"] { self[i].itemCount = Int(n) }
        if let photo = set["photo"], !photo.isEmpty { self[i].photoUrl = "pending" }
        if let note = set["crewNote"] { self[i].crewNotes += (self[i].crewNotes.isEmpty ? "" : "\n") + "Today: " + note }
    }
}
