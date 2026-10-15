import Foundation

/// Talks to the bookings backend (the Google Apps Script web app that also powers the website).
struct CrewAPI {
    static let endpoint = URL(string: "https://script.google.com/macros/s/AKfycbybYDqPku8HkKxYtUy3v-nw0T3ZBygCDlBZJ6hG_BrTaUv6BLHD7-LAVzE3a5O1bYn8KQ/exec")!

    enum Failure: LocalizedError {
        case wrongPasscode, locked, notSetUp, offline, server

        var errorDescription: String? {
            switch self {
            case .wrongPasscode: "That passcode isn’t right."
            case .locked: "Too many tries. Wait 10 minutes and try again."
            case .notSetUp: "The crew passcode hasn’t been set up yet. Run setup in Apps Script."
            case .offline: "Can’t reach the pickup list. Check your connection."
            case .server: "Something went wrong. Try again."
            }
        }

        init(code: String?) {
            switch code {
            case "passcode": self = .wrongPasscode
            case "locked": self = .locked
            case "not_set_up": self = .notSetUp
            default: self = .server
            }
        }
    }

    struct ListResult: Decodable {
        let ok: Bool
        let error: String?
        let today: String?
        let bookings: [Pickup]?
    }

    private struct Ack: Decodable {
        let ok: Bool
        let error: String?
    }

    let passcode: String

    func list() async throws -> (today: String, pickups: [Pickup]) {
        let r: ListResult = try await post(["op": "list"])
        guard r.ok, let today = r.today else { throw Failure(code: r.error) }
        return (today, r.bookings ?? [])
    }

    /// `set` may contain "status", "pickupDate" (yyyy-MM-dd or "") and "crewNote".
    func update(code: String, set: [String: String]) async throws {
        let r: Ack = try await post(["op": "update", "code": code, "set": set])
        guard r.ok else { throw Failure(code: r.error) }
    }

    private func post<T: Decodable>(_ body: [String: Any]) async throws -> T {
        var payload = body
        payload["type"] = "crew"
        payload["passcode"] = passcode
        var request = URLRequest(url: Self.endpoint, timeoutInterval: 30)
        request.httpMethod = "POST"
        // text/plain keeps Apps Script happy; it redirects to the JSON result, which URLSession follows.
        request.setValue("text/plain;charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw Failure.offline }
            return try JSONDecoder().decode(T.self, from: data)
        } catch let failure as Failure {
            throw failure
        } catch is DecodingError {
            throw Failure.server
        } catch {
            throw Failure.offline
        }
    }
}
