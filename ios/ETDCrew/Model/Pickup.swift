import Foundation

enum PickupStatus: String, Codable, Hashable {
    case pending = "new"
    case scheduled
    case pickedUp = "picked_up"
    case recycled
    case cancelled

    /// Order used for sections in the All tab.
    static let allInOrder: [PickupStatus] = [.pending, .scheduled, .pickedUp, .recycled, .cancelled]

    var systemImage: String {
        switch self {
        case .pending: "tray.full"
        case .scheduled: "calendar"
        case .pickedUp: "shippingbox"
        case .recycled: "arrow.3.trianglepath"
        case .cancelled: "xmark.circle"
        }
    }

    var title: String {
        switch self {
        case .pending: "New"
        case .scheduled: "Scheduled"
        case .pickedUp: "Picked Up"
        case .recycled: "Recycled"
        case .cancelled: "Cancelled"
        }
    }
}

/// One booking, as the crew sees it. Mirrors a row in the bookings Google Sheet.
struct Pickup: Codable, Identifiable, Hashable {
    let code: String
    var status: PickupStatus
    var pickupDate: String?          // yyyy-MM-dd
    let bookedAt: String
    let name: String
    let email: String
    let phone: String
    let address: String
    let load: String
    let notes: String
    let requests: String
    var crewNotes: String
    var bookedIso: String? = nil    // for sorting newest first

    var id: String { code }
    var firstName: String { name.split(separator: " ").first.map(String.init) ?? "there" }
    var displayName: String { name.isEmpty ? "No name" : name }
    var latestRequest: String? { requests.split(separator: "\n").last.map(String.init) }
    var latestCrewNote: String? { crewNotes.split(separator: "\n").last.map(String.init) }
    var phoneDigits: String { phone.filter { $0.isNumber || $0 == "+" } }

    /// Address without the postal code, for one-line display.
    var shortAddress: String {
        let parts = address.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        guard parts.count > 1, parts.last?.range(of: #"^[A-Za-z]\d[A-Za-z] ?\d[A-Za-z]\d$"#, options: .regularExpression) != nil
        else { return address }
        return parts.dropLast().joined(separator: ", ")
    }
}

/// Dates come from the server as yyyy-MM-dd in Vancouver time.
enum Day {
    static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/Vancouver")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func date(_ iso: String?) -> Date? { iso.flatMap { formatter.date(from: $0) } }
    static func iso(_ date: Date) -> String { formatter.string(from: date) }

    /// "Today", "Tomorrow", "Yesterday" or "Saturday, October 18".
    static func label(_ iso: String?, today: String) -> String {
        guard let iso, let d = date(iso), let t = date(today) else { return "" }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = formatter.timeZone
        switch cal.dateComponents([.day], from: t, to: d).day ?? 0 {
        case 0: return "Today"
        case 1: return "Tomorrow"
        case -1: return "Yesterday"
        default: return d.formatted(.dateTime.weekday(.wide).month(.wide).day())
        }
    }
}
