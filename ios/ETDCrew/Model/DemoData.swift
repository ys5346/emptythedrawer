import Foundation

/// Sample pickups for trying the app in the simulator (launch argument `-demo`). Never sent anywhere.
enum DemoData {
    static func make() -> (String, [Pickup]) {
        let today = Day.iso(.now)
        func day(_ offset: Int) -> String { Day.iso(Calendar.current.date(byAdding: .day, value: offset, to: .now)!) }
        func p(_ code: String, _ status: PickupStatus, _ date: String?, _ name: String, _ phone: String, _ email: String,
               _ address: String, _ load: String, notes: String = "", requests: String = "") -> Pickup {
            Pickup(code: code, status: status, pickupDate: date, bookedAt: "Oct 12, 3:10 PM", name: name, email: email,
                   phone: phone, address: address, load: load, notes: notes, requests: requests, crewNotes: "")
        }
        return (today, [
            p("KT47R", .scheduled, day(0), "Sam Patel", "604-555-0101", "sam@example.com",
              "13060 80 Ave, Unit 108, Surrey, V3W 3B2", "3 items — Laptops, Monitors", notes: "Buzzer 104"),
            p("AB34C", .scheduled, day(-1), "Ana Lee", "604-555-0102", "",
              "10153 King George Blvd, Surrey, V3T 2W1", "1 item — TVs", requests: "Oct 13: Reschedule requested — Saturdays"),
            p("NM28Q", .scheduled, day(0), "Ravi Gill", "604-555-0106", "ravi@example.com",
              "7488 King George Blvd, Surrey, V3W 5A8", "4 items — Desktops, Networking gear"),
            p("DE56F", .scheduled, day(2), "Jo Chen", "", "jo@example.com",
              "4700 Kingsway, Burnaby, V5H 4N2", "2 items — Phones"),
            p("GH78J", .pending, nil, "Mo Singh", "604-555-0104", "mo@example.com",
              "20202 66 Ave, Langley, V2Y 1P3", "5 items — Desktops", notes: "Side gate, leave by garage"),
            p("PQ51S", .pending, nil, "Lena Park", "604-555-0107", "lena@example.com",
              "1200 W 73rd Ave, Vancouver, V6P 6G5", "1 item — Gaming consoles"),
            p("KL90M", .pickedUp, day(-2), "Kay Wu", "604-555-0105", "kay@example.com",
              "4949 Canoe Pass Way, Delta, V4M 0B2", "1 item — Laptops"),
            p("RC22T", .recycled, day(-9), "Dev Sharma", "604-555-0108", "dev@example.com",
              "3000 Lougheed Hwy, Coquitlam, V3B 1C5", "6 items — Laptops, Phones, Tablets"),
            p("XC81B", .cancelled, nil, "Priya Nair", "604-555-0109", "priya@example.com",
              "6551 No. 3 Rd, Richmond, V6Y 2B6", "1 item — Monitors", requests: "Oct 11: Cancel requested — Already dropped it off"),
        ].enumerated().map { i, p in var p = p; p.bookedIso = String(format: "2026-10-%02dT10:00:00Z", 14 - i); return p })
    }

}
