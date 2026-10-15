import Foundation

enum PickupStatus: String, Codable, Hashable {
    case pending = "new"
    case scheduled
    case onTheWay = "on_the_way"
    case pickedUp = "picked_up"
    case recycled
    case cancelled

    /// Order used for sections in the All tab.
    static let allInOrder: [PickupStatus] = [.pending, .scheduled, .onTheWay, .pickedUp, .recycled, .cancelled]

    /// Still waiting to be collected.
    var isActive: Bool { self == .pending || self == .scheduled || self == .onTheWay }

    var systemImage: String {
        switch self {
        case .pending: "tray.full"
        case .scheduled: "calendar"
        case .onTheWay: "car.fill"
        case .pickedUp: "shippingbox"
        case .recycled: "arrow.3.trianglepath"
        case .cancelled: "xmark.circle"
        }
    }

    var title: String {
        switch self {
        case .pending: "New"
        case .scheduled: "Scheduled"
        case .onTheWay: "On the Way"
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
    var itemCount: Int? = nil       // items actually collected, recorded at pickup
    var photoUrl: String? = nil     // Google Drive link to the pickup photo ("pending" until it syncs)
    var source: String? = nil       // "Website", or where the crew said it came from

    var id: String { code }
    var firstName: String { name.split(separator: " ").first.map(String.init) ?? "there" }
    var displayName: String { name.isEmpty ? "No name" : name }
    var latestRequest: String? { requests.split(separator: "\n").last.map(String.init) }
    var latestCrewNote: String? { crewNotes.split(separator: "\n").last.map(String.init) }
    var phoneDigits: String { phone.filter { $0.isNumber || $0 == "+" } }
    /// Driving directions in Apple Maps.
    var directionsURL: URL {
        var c = URLComponents(string: "http://maps.apple.com/")!
        c.queryItems = [.init(name: "daddr", value: address), .init(name: "dirflg", value: "d")]
        return c.url!
    }
    /// Where a booking came from, when it wasn't the website.
    var otherSource: String? {
        guard let source, !source.isEmpty, source != "Website" else { return nil }
        return source
    }
    var hasPhoto: Bool { !(photoUrl ?? "").isEmpty }

    /// Items the customer said they had ("3 items — Laptops" → 3), as the starting count at pickup.
    var bookedItemCount: Int? {
        load.split(separator: " ").first.flatMap { Int($0) }
    }

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
