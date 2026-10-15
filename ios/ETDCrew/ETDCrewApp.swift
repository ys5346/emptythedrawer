import SwiftUI

@main
struct ETDCrewApp: App {
    @State private var store = CrewStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
        }
    }
}

struct RootView: View {
    @Environment(CrewStore.self) private var store

    var body: some View {
        Group {
            if store.passcode == nil {
                LoginView()
                    .transition(.opacity)
            } else {
                MainView()
                    .transition(.opacity)
            }
        }
        .animation(.smooth, value: store.passcode == nil)
    }
}
