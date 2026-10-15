import SwiftUI
import MapKit

/// The stop the truck is heading to now. Laid out like a place card in Apple Maps.
struct NextStopCard: View {
    let pickup: Pickup
    let position: String
    var overdue = false
    let onDetails: () -> Void
    let onMyWay: () -> Void
    let onPickedUp: () -> Void

    @Environment(\.openURL) private var openURL
    @State private var coordinate: CLLocationCoordinate2D?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button(action: onDetails) {
                VStack(alignment: .leading, spacing: 0) {
                    map
                    header
                        .padding(.horizontal, 16)
                        .padding(.top, 14)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)

            VStack(alignment: .leading, spacing: 14) {
                if !pickup.notes.isEmpty || pickup.customerUpdate != nil {
                    VStack(alignment: .leading, spacing: 6) {
                        if !pickup.notes.isEmpty {
                            Label(pickup.notes, systemImage: "note.text")
                                .foregroundStyle(.secondary)
                        }
                        if let update = pickup.customerUpdate {
                            Label(update, systemImage: "pencil.line")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .font(.subheadline)
                    .lineLimit(2)
                    .labelStyle(QuietLabel())
                }

                HStack(spacing: 8) {
                    CardAction(title: "Directions", systemImage: "arrow.triangle.turn.up.right.diamond.fill",
                               enabled: !pickup.address.isEmpty) { openURL(pickup.directionsURL) }
                    CardAction(title: "Call", systemImage: "phone.fill", enabled: !pickup.phoneDigits.isEmpty) {
                        if let url = URL(string: "tel:\(pickup.phoneDigits)") { openURL(url) }
                    }
                    CardAction(title: pickup.status == .onTheWay ? "Texted" : "On My Way",
                               systemImage: pickup.status == .onTheWay ? "checkmark" : "paperplane.fill",
                               enabled: pickup.status == .scheduled, action: onMyWay)
                }

                Button(action: onPickedUp) {
                    Text("Picked Up")
                        .font(.headline)
                        .foregroundStyle(Color(.systemBackground))
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(.tint, in: .rect(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .padding(16)
        }
        .task(id: pickup.address) { await locate() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(overdue ? "OVERDUE" : "NEXT STOP")
                    .foregroundStyle(overdue ? .red : .secondary)
                if pickup.status == .onTheWay {
                    Text("·").foregroundStyle(.tertiary)
                    Text("ON THE WAY").foregroundStyle(.purple)
                }
                Spacer()
                Text(position).foregroundStyle(.tertiary)
            }
            .font(.caption.weight(.semibold))
            .padding(.bottom, 2)

            Text(pickup.displayName)
                .font(.title2.weight(.semibold))
            Text(pickup.shortAddress)
                .font(.body)
                .foregroundStyle(.secondary)
            if !pickup.load.isEmpty {
                Text(pickup.load)
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
                    .padding(.top, 1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private var map: some View {
        ZStack {
            if let coordinate {
                Map(initialPosition: .region(MKCoordinateRegion(center: coordinate, latitudinalMeters: 600, longitudinalMeters: 600)),
                    interactionModes: []) {
                    Marker("", systemImage: "shippingbox.fill", coordinate: coordinate).tint(Color.ink)
                }
                .mapStyle(.standard(pointsOfInterest: .excludingAll))
                .allowsHitTesting(false)
                .transition(.opacity)
            } else {
                Rectangle().fill(.quaternary.opacity(0.5))
            }
        }
        .frame(height: 140)
        .clipped()
    }

    private func locate() async {
        guard !pickup.address.isEmpty else { return }
        if let place = try? await CLGeocoder().geocodeAddressString(pickup.address + ", BC, Canada").first,
           let location = place.location {
            withAnimation(.smooth) { coordinate = location.coordinate }
        }
    }
}

/// Equal-width grey button with a tinted icon, like the row under a place in Apple Maps.
private struct CardAction: View {
    let title: String
    let systemImage: String
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.tint)
                Text(title)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.4)
    }
}

/// Icon in a fixed-width column so wrapped lines stay aligned.
struct QuietLabel: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.frame(width: 18)
            configuration.title
        }
    }
}
