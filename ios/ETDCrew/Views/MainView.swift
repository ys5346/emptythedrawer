import SwiftUI

enum CrewTab: Hashable { case today, upcoming, schedule, pickedUp }

struct MainView: View {
    @Environment(CrewStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: CrewTab = .today

    var body: some View {
        TabView(selection: $tab) {
            PickupListScreen(tab: .today)
                .tabItem { Label("Today", systemImage: "sun.max.fill") }
                .badge(store.dueToday.count)
                .tag(CrewTab.today)
            PickupListScreen(tab: .upcoming)
                .tabItem { Label("Upcoming", systemImage: "calendar") }
                .tag(CrewTab.upcoming)
            PickupListScreen(tab: .schedule)
                .tabItem { Label("To Schedule", systemImage: "tray.full.fill") }
                .badge(store.toSchedule.count)
                .tag(CrewTab.schedule)
            PickupListScreen(tab: .pickedUp)
                .tabItem { Label("Picked Up", systemImage: "shippingbox.fill") }
                .tag(CrewTab.pickedUp)
        }
        .overlay(alignment: .bottom) { ToastView() }
        .task { await store.refresh() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.refresh() } }
        }
        .task(id: "auto-refresh") {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(60))
                if scenePhase == .active { await store.refresh() }
            }
        }
    }
}

/// Short confirmation that slides up above the tab bar after each change.
struct ToastView: View {
    @Environment(CrewStore.self) private var store

    var body: some View {
        Group {
            if let message = store.toast {
                Label(message, systemImage: message.hasPrefix("Didn’t") ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 12)
                    .background(Color.ink.gradient, in: .capsule)
                    .shadow(color: .black.opacity(0.2), radius: 16, y: 8)
                    .padding(.bottom, 64)
                    .padding(.horizontal, 20)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .task(id: message) {
                        try? await Task.sleep(for: .seconds(2.6))
                        store.toast = nil
                    }
            }
        }
        .animation(.spring(duration: 0.35, bounce: 0.25), value: store.toast)
        .sensoryFeedback(trigger: store.toast) { _, new in
            guard let new else { return nil }
            return new.hasPrefix("Didn’t") ? .error : .success
        }
    }
}
